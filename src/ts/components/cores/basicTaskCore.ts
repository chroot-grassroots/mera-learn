// basicTaskCore.ts - Core data processing for BasicTask component
import { z } from "zod";
import {
  BaseComponentCore,
  BaseComponentConfig,
  BaseComponentConfigSchema,
  BaseComponentProgress,
  BaseComponentProgressSchema,
  BaseComponentProgressManager,
  TrumpStrategy,
  ComponentProgressMessage,
} from "../cores/baseComponentCore.js";
import { BaseComponentInterface } from "../interfaces/baseComponentInterface.js";
import { TimelineContainer } from "../../ui/timelineContainer.js";

/**
 * Checkbox item schema
 */
export const CheckboxItemSchema = z.object({
  content: z.string().min(1).max(100),
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
  checkboxes: z.array(CheckboxItemSchema).min(1).max(10),
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

  createInitialProgress(
    config: BasicTaskComponentConfig
  ): BasicTaskComponentProgress {
    return {
      checkbox_checked: new Array(config.checkboxes.length).fill(false),
    };
  }

  getAllTrumpStrategies(): Record<
    keyof BasicTaskComponentProgress,
    TrumpStrategy<any>
  > {
    return {
      checkbox_checked: (a: boolean[], b: boolean[]): boolean[] => {
        const maxLength = Math.max(a?.length || 0, b?.length || 0);
        const result: boolean[] = [];

        for (let i = 0; i < maxLength; i++) {
          const aVal = a?.[i] || false;
          const bVal = b?.[i] || false;
          result[i] = aVal || bVal; // OR logic for checkboxes
        }

        return result;
      },
    };
  }
}

/**
 * Basic task core - data processing and state management
 */
export class BasicTaskCore extends BaseComponentCore<
  BasicTaskComponentConfig,
  BasicTaskComponentProgress
> {
  constructor(
    config: BasicTaskComponentConfig,
    progressManager: BasicTaskProgressManager,
    timeline: TimelineContainer
  ) {
    super(config, progressManager, timeline);
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
    // Import here to avoid circular dependency
    const { BasicTaskInterface } = require("./basicTaskInterface.js");
    return new BasicTaskInterface(this, timeline);
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

    this.queueMessage({
      type: "component_progress",
      componentId: this._config.id,
      method: "setCheckboxState",
      args: [index, checked],
    });
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
}
