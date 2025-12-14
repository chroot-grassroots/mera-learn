/**
 * @fileoverview Base classes for all interactive learning components with timestamp support
 * @module components/cores/baseComponentCore
 *
 * REFACTORED: Added lastUpdated timestamp to BaseComponentProgressSchema.
 * All component progress now inherits timestamp tracking for conflict resolution.
 *
 * Defines the Core/Interface component architecture that enables:
 * - Separation of data logic (Core) from UI rendering (Interface)
 * - Message-based communication with Main Application Core
 * - Component isolation preventing data corruption
 * - Validated state mutations through manager classes
 *
 * All interactive components (Quiz, Task, Scenario, etc.) extend these base classes.
 *
 * Architecture Pattern:
 * - BaseComponentCore: Data validation, state management, message queuing
 * - BaseComponentInterface: DOM manipulation, user interaction handling
 * - BaseComponentProgressManager: Validated progress mutations and trump strategies
 *
 * Components cannot directly mutate shared application state. All changes flow
 * through validated message queues that Main Core processes during polling cycles.
 */

import { z } from "zod";
import { TimelineContainer } from "../../ui/timelineContainer.js";
import { BaseComponentInterface } from "../interfaces/baseComponentInterface.js";
import {
  OverallProgressData,
  OverallProgressMessage,
  OverallProgressMessageQueueManager,
} from "../../core/overallProgressSchema.js";

import {
  NavigationState,
  NavigationMessage,
  NavigationMessageQueueManager,
} from "../../core/navigationSchema.js";

import { 
  SettingsData, 
  SettingsMessage,
  SettingsMessageQueueManager,
} from "../../core/settingsSchema.js";

import { 
  ComponentProgressMessage, 
  ImmutableId,
  TrumpStrategy,
} from "../../core/coreTypes.js";

import { CurriculumRegistry } from "../../registry/mera-registry.js";

// ============================================================================
// BASE SCHEMAS
// ============================================================================

/**
 * Base configuration schema that all components must extend.
 *
 * Cannot be instantiated directly - serves as abstract base.
 * Field values are derived from lesson YAML for each component instance.
 *
 * Common fields:
 * - id: Immutable tracking ID that persists across content reorganization
 * - type: Component type identifier for registry lookup
 * - accessibility_label: Screen reader description
 * - order: Display position with spacing (100, 200, 300) for insertion flexibility
 */
export const BaseComponentConfigSchema = z.object({
  id: ImmutableId, // Immutable ID for progress tracking
  type: z.string().min(1), // Component type: text, quiz, task, etc.
  accessibility_label: z.string().min(2), // Screen reader description
  order: z.number().int().min(-1000000).max(1000000), // Display order: 100, 200, 300, etc.
});

export type BaseComponentConfig = z.infer<typeof BaseComponentConfigSchema>;

/**
 * Base progress schema that all component progress must extend.
 *
 * REFACTORED: Now includes lastUpdated timestamp for all components.
 * 
 * MERGE STRATEGY: Component-level timestamp means during offline/online sync,
 * the ENTIRE component progress from whichever version has the newest lastUpdated
 * is kept. No field-level merging needed - simple and deterministic.
 * 
 * Example:
 * - Offline: { checkbox_checked: [true, false], lastUpdated: 1000 }
 * - Online:  { checkbox_checked: [false, true], lastUpdated: 2000 }
 * - Result:  { checkbox_checked: [false, true], lastUpdated: 2000 } (online wins)
 * 
 * All component-specific progress schemas extend this, inheriting the timestamp.
 * Concrete components add their own fields (checkboxes, answers, scores, etc.).
 */
export const BaseComponentProgressSchema = z.object({
  lastUpdated: z.number().int().min(0).default(0), // Unix timestamp in seconds
});

export type BaseComponentProgress = z.infer<typeof BaseComponentProgressSchema>;

// ============================================================================
// PROGRESS MANAGER BASE CLASS
// ============================================================================

/**
 * Abstract base class for component progress management.
 *
 * REFACTORED: Component-level timestamp eliminates need for field-level trump strategies.
 * During merge, the entire component progress with newest lastUpdated wins.
 *
 * Responsibilities:
 * - Store current progress state
 * - Provide validated mutation methods
 * - Define initial progress structure based on config
 * - Update timestamps on all mutations
 *
 * Concrete implementations (BasicTaskProgressManager, QuizProgressManager, etc.)
 * extend this to provide component-specific progress logic.
 *
 * Design Decision: Manager pattern instead of direct mutation enables:
 * - Validation of all state changes
 * - Audit trail of mutations (future logging)
 * - Side effects like completion checking
 * - Easy testing via method mocking
 */
export abstract class BaseComponentProgressManager<
  TComponentProgress extends BaseComponentProgress
> {
  constructor(protected progress: TComponentProgress) {}

  /**
   * Get current progress state.
   *
   * Returns readonly reference to prevent direct mutation.
   * All changes must go through validated setter methods.
   */
  getProgress(): TComponentProgress {
    return this.progress;
  }

  /**
   * Update lastUpdated timestamp to current time.
   *
   * IMPORTANT: All mutation methods in subclasses MUST call this
   * after modifying progress state to maintain accurate timestamps
   * for conflict resolution.
   *
   * Protected helper - only accessible to subclass mutation methods.
   */
  protected updateTimestamp(): void {
    this.progress.lastUpdated = Math.floor(Date.now() / 1000);
  }

  /**
   * Create initial progress structure matching config requirements.
   *
   * Called for new users or when component is first encountered.
   * Progress structure must align with config (e.g., if config has 3 checkboxes,
   * progress must have array of 3 boolean states).
   *
   * Subclasses should initialize lastUpdated to 0 for new progress.
   *
   * @param config Component configuration from YAML
   * @returns Fresh progress object with all fields initialized
   */
  abstract createInitialProgress(
    config: BaseComponentConfig
  ): TComponentProgress;
}

// ============================================================================
// COMPONENT CORE BASE CLASS
// ============================================================================

/**
 * Abstract base class for all interactive component cores.
 *
 * Responsibilities:
 * - Manage component state and progress
 * - Queue validated messages to Main Core
 * - Provide readonly access to shared application state
 * - Create and manage associated Interface instance
 * - Implement component completion logic
 *
 * Core Module Philosophy:
 * - Pure TypeScript, no DOM access
 * - All state changes through validated methods
 * - Exposes only readonly interfaces externally
 * - Mutations via message queuing
 *
 * Message Flow:
 * 1. User interacts with Interface
 * 2. Interface calls Core method (e.g., core.setCheckboxState())
 * 3. Core validates and updates local state
 * 4. Core queues message for Main Application Core
 * 5. Main Core polls, validates, and applies identical change
 * 6. Main Core persists to Solid Pod
 *
 * This ensures component bugs cannot corrupt main application state.
 */
export abstract class BaseComponentCore<
  TConfig extends BaseComponentConfig,
  TComponentProgress extends BaseComponentProgress
> {
  protected _config: TConfig;
  protected _progressManager: BaseComponentProgressManager<TComponentProgress>;
  
  // Standard queue managers available to all components
  // Components queue messages here; Main Core polls and processes them
  private _navigationQueueManager: NavigationMessageQueueManager;
  private _settingsQueueManager: SettingsMessageQueueManager;
  private _overallProgressQueueManager: OverallProgressMessageQueueManager;
  
  // Component-specific progress queue manager
  // Defined by concrete component classes (not in base)
  
  private _interface: BaseComponentInterface<TConfig, TComponentProgress, any>;

  /**
   * Construct component core with readonly references to shared state.
   *
   * @param config Component configuration from YAML (readonly)
   * @param progressManager Validated progress mutations
   * @param timeline Container for component rendering
   * @param overallProgress Readonly lesson completion state
   * @param navigationState Readonly current page/lesson position
   * @param settings Readonly user preferences
   * @param curriculumRegistry Lesson/domain lookup for validation
   */
  constructor(
    config: Readonly<TConfig>,
    progressManager: BaseComponentProgressManager<TComponentProgress>,
    timeline: TimelineContainer,
    readonly overallProgress: Readonly<OverallProgressData>,
    readonly navigationState: Readonly<NavigationState>,
    readonly settings: Readonly<SettingsData>,
    curriculumRegistry: CurriculumRegistry
  ) {
    this._config = config;
    this._progressManager = progressManager;

    // Initialize standard queue managers
    // All components can queue navigation, settings, and progress messages
    this._navigationQueueManager = new NavigationMessageQueueManager(
      curriculumRegistry
    );
    this._settingsQueueManager = new SettingsMessageQueueManager();
    this._overallProgressQueueManager = new OverallProgressMessageQueueManager(
      curriculumRegistry
    );

    // Create the interface and pass it this core + timeline
    this._interface = this.createInterface(timeline);
  }

  /**
   * Factory method for creating component interface.
   *
   * Abstract - concrete components implement to instantiate their specific
   * Interface class (BasicTaskInterface, QuizInterface, etc.).
   *
   * @param timeline Container for rendering component UI
   * @returns Component-specific interface instance
   */
  protected abstract createInterface(
    timeline: TimelineContainer
  ): BaseComponentInterface<TConfig, TComponentProgress, any>;

  /**
   * Check if component tasks are complete.
   *
   * Abstract - each component defines its own completion criteria.
   * Examples:
   * - Task: All required checkboxes checked
   * - Quiz: All questions answered correctly
   * - Scenario: Decision made and consequences viewed
   *
   * Used by Main Core to determine lesson completion.
   *
   * @returns true if component requirements satisfied
   */
  abstract isComplete(): boolean;

  /**
   * Retrieve component-specific progress messages.
   *
   * Abstract - each component implements to return queued progress updates.
   * Main Core polls this during its update cycle.
   *
   * @returns Array of component progress messages
   */
  abstract getComponentProgressMessages(): ComponentProgressMessage[];

  // ============================================================================
  // READONLY ACCESSORS
  // ============================================================================

  /**
   * Get component configuration (readonly)
   */
  get config(): Readonly<TConfig> {
    return this._config;
  }

  /**
   * Get component interface instance (readonly)
   */
  get interface(): Readonly<BaseComponentInterface<TConfig, TComponentProgress, any>> {
    return this._interface;
  }

  // ============================================================================
  // MESSAGE QUEUE CONVENIENCE METHODS
  // ============================================================================

  /**
   * Convenience wrapper for queueing lesson completion message.
   *
   * Components call this when they trigger lesson completion
   * (e.g., final quiz question answered correctly).
   *
   * @param lessonId Immutable lesson ID
   */
  protected queueLessonComplete(lessonId: number): void {
    this._overallProgressQueueManager.queueLessonComplete(lessonId);
  }

  /**
   * Convenience wrapper for queueing lesson incompletion message.
   *
   * Used when component state changes invalidate lesson completion
   * (e.g., quiz answer changed after lesson marked complete).
   *
   * @param lessonId Immutable lesson ID
   */
  protected queueLessonIncomplete(lessonId: number): void {
    this._overallProgressQueueManager.queueLessonIncomplete(lessonId);
  }

  /**
   * Retrieve queued navigation messages.
   *
   * Main Core polls this during update cycle.
   */
  getNavigationMessages(): NavigationMessage[] {
    return this._navigationQueueManager.getMessages();
  }

  /**
   * Retrieve queued settings messages.
   *
   * Main Core polls this during update cycle.
   */
  getSettingsMessages(): SettingsMessage[] {
    return this._settingsQueueManager.getMessages();
  }

  /**
   * Retrieve queued overall progress messages.
   *
   * Main Core polls this during update cycle.
   */
  getOverallProgressMessages(): OverallProgressMessage[] {
    return this._overallProgressQueueManager.getMessages();
  }

  /**
   * Destroy component and clean up resources.
   *
   * Called when component is removed from timeline.
   * Delegates to interface for DOM cleanup.
   */
  destroy(): void {
    this._interface.destroy();
  }
}