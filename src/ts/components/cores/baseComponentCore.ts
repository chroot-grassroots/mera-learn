// baseComponent.ts - TypeScript/Zod version of base_component.py
// Base classes for all learning components

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
 * Base configuration schema that all components must extend
 * Cannot be instantiated directly - abstract equivalent
 * Field values derived from the lesson yaml for each component
 */
export const BaseComponentConfigSchema = z.object({
  id: ImmutableId, // Immutable ID for progress tracking
  type: z.string().min(1), // Component type: text, quiz, task, etc.
  accessibility_label: z.string().min(2), // Screen reader description
  order: z.number().int().min(-1000000).max(1000000), // Display order: 100, 200, 300, etc.
});

export type BaseComponentConfig = z.infer<typeof BaseComponentConfigSchema>;

/**
 * Base progress schema that all component progress must extend
 */
// No fields are universal for all components.
export const BaseComponentProgressSchema = z.object({});

// Could be any object with key value pairs or an empty object.
export type BaseComponentProgress = Record<string, any>;

/**
 * Base component progress class with methods
 * Abstract class that components must extend
 */
export abstract class BaseComponentProgressManager<
  TComponentProgress extends BaseComponentProgress
> {
  // Constructed from a complete ComponentProgress
  constructor(protected progress: TComponentProgress) {}

  /**
   * Get current progress state
   */
  getProgress(): TComponentProgress {
    return this.progress;
  }

  /**
   * Initially create all fields with proper initial values for this config. 
   * E.g., if the config has 3 checkboxes, the progress schema should have 3 checkbox states.
   */
  abstract createInitialProgress(
    config: BaseComponentConfig
  ): TComponentProgress;

  /**
   * Get trump strategy for every field in this component
   */
  abstract getAllTrumpStrategies(): Record<
    keyof TComponentProgress,
    TrumpStrategy<any>
  >;
}

/**
 * Abstract base component class
 * All interactive learning components must extend this
 */
export abstract class BaseComponentCore<
  TConfig extends BaseComponentConfig,
  TComponentProgress extends BaseComponentProgress
> {
  protected _config: TConfig;
  protected _progressManager: BaseComponentProgressManager<TComponentProgress>;
  
  // Queue managers for sending messages to Core
  private _navigationQueueManager: NavigationMessageQueueManager;
  private _settingsQueueManager: SettingsMessageQueueManager;
  private _overallProgressQueueManager: OverallProgressMessageQueueManager;
  // Component progress queue manager is component-specific (not in base class)
  
  private _interface: BaseComponentInterface<TConfig, TComponentProgress, any>;

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

    // Initialize queue managers - components own these
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

  // Abstract factory method - concrete classes implement this
  protected abstract createInterface(
    timeline: TimelineContainer
  ): BaseComponentInterface<TConfig, TComponentProgress, any>;

  /**
   * Each component must implement completion check
   */
  abstract isComplete(): boolean;

  /**
   * Convenience wrapper for queueing lesson completion
   */
  protected queueLessonComplete(lessonId: number): void {
    this._overallProgressQueueManager.queueLessonComplete(lessonId);
  }

  /**
   * Convenience wrapper for queueing lesson incompletion
   */
  protected queueLessonIncomplete(lessonId: number): void {
    this._overallProgressQueueManager.queueLessonIncomplete(lessonId);
  }

  /**
   * Direct access to navigation queue manager for components that need navigation control
   */
  protected get navigationQueue(): NavigationMessageQueueManager {
    return this._navigationQueueManager;
  }

  /**
   * Direct access to settings queue manager for components that need settings control
   */
  protected get settingsQueue(): SettingsMessageQueueManager {
    return this._settingsQueueManager;
  }

  /**
   * Direct access to overall progress queue manager for streak/goal operations
   */
  protected get overallProgressQueue(): OverallProgressMessageQueueManager {
    return this._overallProgressQueueManager;
  }

  /**
   * Get component progress messages for core polling
   * Concrete components must implement this with their own queue manager
   */
  abstract getComponentProgressMessages(): ComponentProgressMessage[];

  /**
   * Get overall progress messages for core polling
   */
  getOverallProgressMessages(): OverallProgressMessage[] {
    return this._overallProgressQueueManager.getMessages();
  }

  /**
   * Get navigation messages for core polling
   */
  getNavigationMessages(): NavigationMessage[] {
    return this._navigationQueueManager.getMessages();
  }

  /**
   * Get setting messages for core polling
   */
  getSettingMessages(): SettingsMessage[] {
    return this._settingsQueueManager.getMessages();
  }

  get config(): Readonly<TConfig> {
    return this._config;
  }

  get progress(): Readonly<TComponentProgress> {
    return this._progressManager.getProgress();
  }

  /**
   * Clean up component resources
   */
  destroy(): void {
    // TODO: Send command to interface to clean up
  }
}

/**
 * Helper function to create trump field with strategy
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