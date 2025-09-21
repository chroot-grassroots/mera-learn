// baseComponent.ts - TypeScript/Zod version of base_component.py
// Base classes for all learning components

import { z } from "zod";
import { TimelineContainer } from "../ui/timelineContainer.js";

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
 * Base internal state interface - never serialized or shared with core
 */
export interface BaseComponentInternal {
  rendered: boolean;
  [key: string]: any;
}

// Delete me and move later starting here =========================================================================================
// Placeholder message types (to be properly defined later)
export interface OverallProgressMessage {
  type: "overall_progress";
  data: any;
}

export interface ComponentProgressMessage {
  type: "overall_progress";
  data: any;
}

export interface NavigationProgressMessage {
  type: "navigation";
  data: any;
}

export interface SettingProgressMessage {
  type: "setting";
  data: any;
}
// End Delete me later here ========================================================================================================

/**
 * Abstract base component class
 * All interactive learning components must extend this
 */
export abstract class BaseComponent<
  TConfig extends BaseComponentConfig,
  TComponentProgress extends BaseComponentProgress,
  TInternal extends BaseComponentInternal
> {
  protected config: TConfig;
  protected progressManager: BaseComponentProgressManager<TComponentProgress>;
  protected internal: TInternal;
  protected timeline: TimelineContainer;

  constructor(
    config: TConfig,
    progressManager: BaseComponentProgressManager<TComponentProgress>,
    timeline: TimelineContainer
  ) {
    this.config = config;
    this.progressManager = progressManager;
    this.timeline = timeline;
    this.internal = this.createInternalModel();

    // Component creates its own slot and renders
    this.initializeComponent();
  }

  /**
   * Initialize the component - create slot and initial render
   */
  private initializeComponent(): void {
    // Add slot to timeline
    this.timeline.addComponentSlot(this.config.id.toString());

    // Initial render
    this.render();
  }

  /**
   * Each component must implement completion check
   */
  abstract isComplete(): boolean;

  /**
   * Each component must create its internal model
   */
  protected abstract createInternalModel(): TInternal;

  /**
   * Each component must implement rendering
   */
  protected abstract render(): void;

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
  getNavigationMessages(): NavigationProgressMessage[] {
    // TODO: implement message queue
    return [];
  }

  /**
   * Get setting messages for core polling
   */
  getSettingMessages(): SettingProgressMessage[] {
    // TODO: implement message queue
    return [];
  }

  /**
   * Clean up component resources
   */
  destroy(): void {
    if (this.timeline) {
      this.timeline.removeComponentSlot(this.config.id.toString());
    }
  }

  /**
   * Get component area in timeline for custom rendering
   */
  protected getComponentArea(): HTMLElement | null {
    return this.timeline.getComponentArea(this.config.id.toString());
  }

  /**
   * Update component status in timeline
   */
  protected updateStatus(status: "active" | "completed" | "locked"): void {
    this.timeline.updateComponentStatus(this.config.id.toString(), status);
  }
}

/**
 * Component registry type for mapping types to classes
 */
export type ComponentRegistry = Map<
  string,
  new (...args: any[]) => BaseComponent<any, any, any>
>;

/**
 * Schema registry type for mapping types to Zod schemas
 */
export type SchemaRegistry = Map<
  string,
  {
    config: z.ZodSchema<any>;
    progress: z.ZodSchema<any>;
  }
>;

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
