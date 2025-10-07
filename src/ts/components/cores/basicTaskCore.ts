// basicTaskCore.ts - Core data processing for BasicTask component
import { z } from "zod";
import {
  BaseComponentCore,
  BaseComponentConfig,
  BaseComponentConfigSchema,
  BaseComponentProgress,
  BaseComponentProgressSchema,
  BaseComponentProgressManager,
} from "./baseComponentCore.js";
import { BaseComponentInterface } from "../interfaces/baseComponentInterface.js";
import { TimelineContainer } from "../../ui/timelineContainer.js";
import { OverallProgressData } from "../../core/overallProgressSchema.js";
import { NavigationState } from "../../core/navigationSchema.js";
import { SettingsData } from "../../core/settingsSchema.js";
import {
  ComponentProgressMessage,
  TrumpStrategy,
} from "../../core/coreTypes.js";
import { CurriculumRegistry } from "../../registry/mera-registry.js";

/**
 * Checkbox item schema
 */
export const CheckboxItemSchema = z.object({
  content: z.string().min(1).max(1000),
  required: z.boolean().default(false),
});

export type CheckboxItem = z.infer<typeof CheckboxItemSchema>;

/**
 * Basic task component configuration schema
 */
export const BasicTaskComponentConfigSchema = BaseComponentConfigSchema.extend({
  type: z.literal("basic_task"),
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(1000),
  checkboxes: z.array(CheckboxItemSchema).min(1).max(20),
});

export type BasicTaskComponentConfig = z.infer<
  typeof BasicTaskComponentConfigSchema
>;

/**
 * Basic task component progress schema
 */
export const BasicTaskComponentProgressSchema =
  BaseComponentProgressSchema.extend({
    checkbox_checked: z.array(z.boolean()).default([]),
  });

export type BasicTaskComponentProgress = z.infer<
  typeof BasicTaskComponentProgressSchema
>;

/**
 * Progress manager for basic task component
 */
export class BasicTaskProgressManager extends BaseComponentProgressManager<BasicTaskComponentProgress> {
  /**
   * Set individual checkbox state with validation
   */
  setCheckboxState(
    config: BasicTaskComponentConfig,
    index: number,
    checked: boolean
  ): void {
    if (index >= config.checkboxes.length) {
      throw new Error(`Checkbox index ${index} out of range`);
    }

    const currentProgress = this.getProgress();
    if (currentProgress.checkbox_checked.length !== config.checkboxes.length) {
      throw new Error(
        `Progress has ${currentProgress.checkbox_checked.length} checkboxes, config expects ${config.checkboxes.length}`
      );
    }

    currentProgress.checkbox_checked[index] = checked;
  }

  // Create a new array of the config length all false for new schemas.
  createInitialProgress(
    config: BasicTaskComponentConfig
  ): BasicTaskComponentProgress {
    return {
      checkbox_checked: new Array(config.checkboxes.length).fill(false),
    };
  }

  // Return true if true for either of the component progress schemas being merged.
  getAllTrumpStrategies(): Record<
    keyof BasicTaskComponentProgress,
    TrumpStrategy<any>
  > {
    return {
      checkbox_checked: "ELEMENT_WISE_OR",
    } as Record<keyof BasicTaskComponentProgress, TrumpStrategy<any>>;
  }
}

/**
 * Message schema for BasicTask component
 */
export const BasicTaskMessageSchema = z.object({
  method: z.enum(["setCheckboxState"]),
  args: z.array(z.any()),
});

export type BasicTaskMessage = z.infer<typeof BasicTaskMessageSchema>;

/**
 * Message queue manager for BasicTask component
 */
export class BasicTaskMessageQueueManager {
  private messageQueue: ComponentProgressMessage[] = [];

  constructor(private componentId: number) {}

  queueCheckboxState(index: number, checked: boolean): void {
    if (typeof index !== "number" || index < 0) {
      throw new Error("Checkbox index must be a non-negative number");
    }
    if (typeof checked !== "boolean") {
      throw new Error("Checkbox checked must be a boolean");
    }

    this.messageQueue.push({
      type: "component_progress",
      componentId: this.componentId,
      method: "setCheckboxState",
      args: [index, checked],
    });
  }

  getMessages(): ComponentProgressMessage[] {
    const messages = [...this.messageQueue];
    this.messageQueue = [];
    return messages;
  }
}

/**
 * Basic task core - data processing and state management
 */
export class BasicTaskCore extends BaseComponentCore<
  BasicTaskComponentConfig,
  BasicTaskComponentProgress
> {
  private _componentProgressQueueManager: BasicTaskMessageQueueManager;

  constructor(
    config: BasicTaskComponentConfig,
    progressManager: BasicTaskProgressManager,
    timeline: TimelineContainer,
    overallProgress: Readonly<OverallProgressData>,
    navigationState: Readonly<NavigationState>,
    settings: Readonly<SettingsData>,
    curriculumRegistry: CurriculumRegistry
  ) {
    super(
      config,
      progressManager,
      timeline,
      overallProgress,
      navigationState,
      settings,
      curriculumRegistry
    );

    // Initialize component-specific queue manager
    this._componentProgressQueueManager = new BasicTaskMessageQueueManager(
      config.id
    );
  }

  /**
   * Create the interface for this core
   */
  protected createInterface(
    timeline: TimelineContainer
  ): BaseComponentInterface<
    BasicTaskComponentConfig,
    BasicTaskComponentProgress,
    any
  > {
    // We'll implement this after creating BasicTaskInterface
    throw new Error("BasicTaskInterface not yet implemented");
  }

  /**
   * Set checkbox state and queue message to main core
   */
  setCheckboxState(index: number, checked: boolean): void {
    (this._progressManager as BasicTaskProgressManager).setCheckboxState(
      this._config,
      index,
      checked
    );

    this._componentProgressQueueManager.queueCheckboxState(index, checked);
  }

  /**
   * Check if task is complete
   */
  isComplete(): boolean {
    const progress = this._progressManager.getProgress();

    for (let i = 0; i < this._config.checkboxes.length; i++) {
      const checkbox = this._config.checkboxes[i];
      if (checkbox.required) {
        if (
          i >= progress.checkbox_checked.length ||
          !progress.checkbox_checked[i]
        ) {
          return false;
        }
      }
    }
    return true;
  }

  /**
   * Get component progress messages for core polling
   */
  getComponentProgressMessages(): ComponentProgressMessage[] {
    return this._componentProgressQueueManager.getMessages();
  }
}
