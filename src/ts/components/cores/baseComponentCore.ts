// baseComponent.ts - TypeScript/Zod version of base_component.py
// Base classes for all learning components

import { z } from "zod";
import { TimelineContainer } from "../../ui/timelineContainer.js";
import { BaseComponentInterface } from "../interfaces/baseComponentInterface.js";
import {
  OverallProgressData,
  OverallProgressMessage,
} from "../../core/overallProgressSchema.js";

import {
  NavigationState,
  NavigationMessage,
} from "../../core/navigationSchema.js";

import { SettingsData, SettingsMessage } from "../../core/settingsSchema.js";

import { ComponentProgressMessage, ImmutableId } from "../../core/coreTypes.js";

/**
 * Trump strategy function type for merge conflicts
 */
export type TrumpStrategy<ProgressFieldType> = (
  a: ProgressFieldType,
  b: ProgressFieldType
) => ProgressFieldType;

/**
 * Base configuration schema that all components must extend
 * Cannot be instantiated directly - abstract equivalent
 * Field values derived from the lesson yaml for each component
 */

export const BaseComponentConfigSchema = z.object({
  id: z.number().int().min(0).max(999999999999), // Immutable ID for progress tracking
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
  // Constructured from a complete version of itself
  constructor(protected progress: TComponentProgress) {}

  /**
   * Initially create all fields with proper initial values for this config. Eg: If the config has 3 checkboxes so does the schema.
   */

  getProgress(): TComponentProgress {
    return this.progress;
  }

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
  private _componentProgressMessageQueue: ComponentProgressMessage[];
  private _overallProgressMessageQueue: OverallProgressMessage[];
  private _navigationMessageQueue: NavigationMessage[];
  private _settingMessageQueue: SettingsMessage[];
  private _interface: BaseComponentInterface<TConfig, TComponentProgress, any>;

  constructor(
    config: Readonly<TConfig>,
    progressManager: BaseComponentProgressManager<TComponentProgress>,
    timeline: TimelineContainer,
    readonly overallProgress: Readonly<OverallProgressData>,
    readonly navigationState: Readonly<NavigationState>,
    readonly settings: Readonly<SettingsData>
  ) {
    this._config = config;
    this._progressManager = progressManager;
    this._componentProgressMessageQueue = [];
    this._overallProgressMessageQueue = [];
    this._navigationMessageQueue = [];
    this._settingMessageQueue = [];

    // Create the interface and pass it this core + timeline
    this._interface = this.createInterface(timeline);
  }

  // Abstract factory method - concrete classes implement this
  protected abstract createInterface(
    timeline: TimelineContainer
  ): BaseComponentInterface<TConfig, TComponentProgress, any>;

  /**
   * Each compo
   nent must implement completion check
   */
  abstract isComplete(): boolean;

  protected updateComponentProgress(method: string, args: any[]): void {
    // Don't call setter here - let concrete class handle that
    this._componentProgressMessageQueue.push({
      type: "component_progress",
      componentId: this._config.id,
      method,
      args,
    });
  }

  protected updateOverallProgress(lessonId: number): void {
    this._overallProgressMessageQueue.push({
      method: "markLessonComplete",
      args: [lessonId],
    });
  }

  protected updateNavigation(data: any): void {
    this._navigationMessageQueue.push({
      type: "navigation",
      data,
    });
  }

  protected updateSettings(data: any): void {
    this._settingMessageQueue.push({
      type: "setting",
      data,
    });
  }

  /**
   * Get component progress messages for core polling
   */
  getComponentProgressMessages(): ComponentProgressMessage[] {
    // TODO: implement message queue
    return [];
  }

  /**
   * Get overall progress messages for core polling
   */
  getOverallProgressMessages(): OverallProgressMessage[] {
    // TODO: implement message queue
    return [];
  }

  /**
   * Get navigation messages for core polling
   */
  getNavigationMessages(): NavigationMessage[] {
    // TODO: implement message queue
    return [];
  }

  /**
   * Get setting messages for core polling
   */
  getSettingMessages(): SettingsMessage[] {
    // TODO: implement message queue
    return [];
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
    // To Do: Send command to interface to clean up
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
