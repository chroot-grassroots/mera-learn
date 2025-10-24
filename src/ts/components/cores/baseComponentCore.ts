/**
 * @fileoverview Base classes for all interactive learning components
 * @module components/cores/baseComponentCore
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
 * No universal fields - each component type defines its own progress structure.
 * Components like Quiz track answers, Task tracks checkboxes, etc.
 */
export const BaseComponentProgressSchema = z.object({});

// Could be any object with key value pairs or an empty object.
export type BaseComponentProgress = Record<string, any>;

/**
 * Abstract base class for component progress management.
 *
 * Responsibilities:
 * - Store current progress state
 * - Provide validated mutation methods
 * - Define initial progress structure based on config
 * - Specify trump strategies for conflict resolution
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
  // Constructed from a complete ComponentProgress
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
   * Create initial progress structure matching config requirements.
   *
   * Called for new users or when component is first encountered.
   * Progress structure must align with config (e.g., if config has 3 checkboxes,
   * progress must have array of 3 boolean states).
   *
   * @param config Component configuration from YAML
   * @returns Fresh progress object with all fields initialized
   */
  abstract createInitialProgress(
    config: BaseComponentConfig
  ): TComponentProgress;

  /**
   * Define trump strategies for every progress field.
   *
   * Used during offline sync conflict resolution when multiple sessions
   * modify the same component progress.
   *
   * Common strategies:
   * - OR: Keep true if either version is true (checkboxes)
   * - MAX: Take higher value (attempt counts)
   * - LATEST_TIMESTAMP: Use most recent change (settings)
   * - ELEMENT_WISE_OR: Array of booleans, OR each element
   *
   * @returns Map of field name to trump strategy
   */
  abstract getAllTrumpStrategies(): Record<
    keyof TComponentProgress,
    TrumpStrategy<any>
  >;
}

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
   * Direct access to navigation queue manager.
   *
   * Components use this to queue navigation requests (e.g., "next lesson" button).
   */
  protected get navigationQueue(): NavigationMessageQueueManager {
    return this._navigationQueueManager;
  }

  /**
   * Direct access to settings queue manager.
   *
   * Components use this to queue settings changes (e.g., accessibility toggles).
   */
  protected get settingsQueue(): SettingsMessageQueueManager {
    return this._settingsQueueManager;
  }

  /**
   * Direct access to overall progress queue manager.
   *
   * Components use this for streak updates and domain completion.
   */
  protected get overallProgressQueue(): OverallProgressMessageQueueManager {
    return this._overallProgressQueueManager;
  }

  /**
   * Get queued component-specific progress messages.
   *
   * Abstract - concrete components implement with their specific queue manager.
   * Called by Main Core during polling cycle.
   *
   * @returns Array of queued progress messages (queue is cleared after retrieval)
   */
  abstract getComponentProgressMessages(): ComponentProgressMessage[];

  /**
   * Get queued overall progress messages.
   *
   * Called by Main Core during polling cycle to retrieve lesson completion
   * and streak update messages.
   *
   * @returns Array of queued messages (queue is cleared after retrieval)
   */
  getOverallProgressMessages(): OverallProgressMessage[] {
    return this._overallProgressQueueManager.getMessages();
  }

  /**
   * Get queued navigation messages.
   *
   * Called by Main Core during polling cycle to retrieve navigation requests.
   *
   * @returns Array of queued messages (queue is cleared after retrieval)
   */
  getNavigationMessages(): NavigationMessage[] {
    return this._navigationQueueManager.getMessages();
  }

  /**
   * Get queued settings messages.
   *
   * Called by Main Core during polling cycle to retrieve settings updates.
   *
   * @returns Array of queued messages (queue is cleared after retrieval)
   */
  getSettingMessages(): SettingsMessage[] {
    return this._settingsQueueManager.getMessages();
  }

  /**
   * Readonly access to component configuration.
   */
  get config(): Readonly<TConfig> {
    return this._config;
  }

  /**
   * Readonly access to component progress.
   *
   * Interface modules receive this to render current state.
   * Mutations must go through validated Core methods.
   */
  get progress(): Readonly<TComponentProgress> {
    return this._progressManager.getProgress();
  }

  /**
   * Clean up component resources.
   *
   * Called when component is removed from timeline (e.g., navigation away).
   * Interface should clean up DOM elements and event listeners.
   *
   * TODO: Send command to interface to clean up
   */
  destroy(): void {
    // TODO: Send command to interface to clean up
  }
}

/**
 * Helper function to create trump field with strategy.
 *
 * Utility for defining trump strategies in a type-safe way.
 * Currently unused but reserved for future schema evolution.
 *
 * @param defaultValue Initial value for field
 * @param strategy Trump strategy for conflict resolution
 * @returns Object with default and trump strategy
 */
export function createTrumpField<T>(
  defaultValue: T,
  strategy: TrumpStrategy<T>
) {
  return {
    default: defaultValue,
    trump: strategy,
  };
}