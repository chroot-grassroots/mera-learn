// basicTask.ts - TypeScript/Zod version of basic_task.py
// Task component with checkboxes for completion tracking

import { z } from "zod";
import {
  BaseComponent,
  BaseComponentConfig,
  BaseComponentConfigSchema,
  BaseComponentProgress,
  BaseComponentProgressSchema,
  BaseComponentProgressManager,
  BaseComponentInternal,
  TrumpStrategy,
} from "./baseComponentCore.js";
import { TimelineContainer } from "../ui/timelineContainer.js";

/**
 * Checkbox item schema
 */
export const CheckboxItemSchema = z.object({
  content: z.string().min(1).max(100),
  required: z.boolean().default(false), // Default to optional
});

export type CheckboxItem = z.infer<typeof CheckboxItemSchema>;

/**
 * Basic task component configuration schema
 */
export const BasicTaskComponentConfigSchema = BaseComponentConfigSchema.extend({
  type: z.literal("basic_task"), // Must be exactly 'basic_task'
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
    this.updateProgress({ checkbox_checked: currentProgress.checkbox_checked });
  }

  /**
   * Reset all checkboxes to unchecked
   */
  resetCheckboxes(config: BasicTaskComponentConfig): void {
    const resetArray = new Array(config.checkboxes.length).fill(false);
    this.updateProgress({ checkbox_checked: resetArray });
  }

  /**
   * Create all fields with proper initial values for this config
   */
  createFieldsForConfig(
    config: BasicTaskComponentConfig
  ): Partial<BasicTaskComponentProgress> {
    return {
      checkbox_checked: new Array(config.checkboxes.length).fill(false),
    };
  }

  /**
   * Return trump strategy for every field in this component
   */
  getAllTrumpStrategies(): Record<
    keyof BasicTaskComponentProgress,
    TrumpStrategy<any>
  > {
    return {
      checkbox_checked: (a: boolean[], b: boolean[]) => {
        // Trump strategy: combine arrays with OR logic, pad with false
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
 * Internal state for basic task component
 */
export interface BasicTaskComponentInternal extends BaseComponentInternal {
  rendered: boolean;
  checkboxElements: HTMLInputElement[];
}

/**
 * Basic task component implementation
 */
export class BasicTaskComponent extends BaseComponent<
  BasicTaskComponentConfig,
  BasicTaskComponentProgress,
  BasicTaskComponentInternal
> {
  declare protected progressManager: BasicTaskProgressManager;
  constructor(
    config: BasicTaskComponentConfig,
    progressManager: BasicTaskProgressManager,
    timeline: TimelineContainer
  ) {
    super(config, progressManager, timeline);
  }

  /**
   * Check if all required checkboxes are checked
   */
  isComplete(): boolean {
    const progress = this.progressManager.getProgress();

    for (let i = 0; i < this.config.checkboxes.length; i++) {
      const checkbox = this.config.checkboxes[i];
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
   * Create internal model
   */
  protected createInternalModel(): BasicTaskComponentInternal {
    return {
      rendered: false,
      checkboxElements: [],
    };
  }

  /**
   * Render the component DOM
   */
  protected render(): void {
    if (this.internal.rendered) {
      return; // Already rendered
    }

    const componentArea = this.getComponentArea();
    if (!componentArea) {
      console.error(
        `Cannot render BasicTask ${this.config.id}: component area not found`
      );
      return;
    }

    // Build checkbox HTML
    const checkboxesHtml = this.config.checkboxes
      .map((checkbox, index) => {
        const progress = this.progressManager.getProgress();
        const isChecked = progress.checkbox_checked[index] || false;
        const requiredBadge = checkbox.required
          ? '<span class="text-red-500 text-xs ml-1">*required</span>'
          : "";

        return `
                <label class="flex items-start space-x-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors cursor-pointer">
                    <input type="checkbox" 
                           class="checkbox-${
                             this.config.id
                           }-${index} mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                           ${isChecked ? "checked" : ""}
                           data-index="${index}">
                    <div class="flex-1">
                        <span class="text-gray-900 dark:text-gray-100">${
                          checkbox.content
                        }</span>
                        ${requiredBadge}
                    </div>
                </label>
            `;
      })
      .join("");

    // Render complete component
    componentArea.innerHTML = `
            <div class="basic-task-component">
                <h3 class="text-xl font-bold text-gray-900 dark:text-white mb-3">${
                  this.config.title
                }</h3>
                <p class="text-gray-700 dark:text-gray-300 mb-4">${
                  this.config.description
                }</p>
                <div class="space-y-2" id="checkboxes-${this.config.id}">
                    ${checkboxesHtml}
                </div>
                <div class="mt-4 text-sm text-gray-600 dark:text-gray-400" id="progress-${
                  this.config.id
                }">
                    ${this.getProgressText()}
                </div>
            </div>
        `;

    // Attach event listeners
    this.attachEventListeners();

    // Update status based on completion
    this.updateStatus(this.isComplete() ? "completed" : "active");

    this.internal.rendered = true;
    console.log(`✅ Rendered BasicTask component ${this.config.id}`);
  }

  /**
   * Attach event listeners to checkboxes
   */
  private attachEventListeners(): void {
    const componentArea = this.getComponentArea();
    if (!componentArea) return;

    // Store checkbox elements
    this.internal.checkboxElements = [];

    this.config.checkboxes.forEach((_, index) => {
      const checkbox = componentArea.querySelector(
        `.checkbox-${this.config.id}-${index}`
      ) as HTMLInputElement;
      if (checkbox) {
        this.internal.checkboxElements[index] = checkbox;

        checkbox.addEventListener("change", (event) => {
          this.handleCheckboxChange(
            index,
            (event.target as HTMLInputElement).checked
          );
        });
      }
    });
  }

  /**
   * Handle checkbox state change
   */
  private handleCheckboxChange(index: number, checked: boolean): void {
    try {
      // Update progress
      this.progressManager.setCheckboxState(this.config, index, checked);

      // Update progress text
      this.updateProgressDisplay();

      // Update component status
      this.updateStatus(this.isComplete() ? "completed" : "active");

      console.log(
        `Checkbox ${index} for task ${this.config.id} set to ${checked}`
      );
    } catch (error) {
      console.error(`Error handling checkbox change:`, error);
    }
  }

  /**
   * Update progress display text
   */
  private updateProgressDisplay(): void {
    const progressElement = document.getElementById(
      `progress-${this.config.id}`
    );
    if (progressElement) {
      progressElement.textContent = this.getProgressText();
    }
  }

  /**
   * Get progress text for display
   */
  private getProgressText(): string {
    const progress = this.progressManager.getProgress();
    const checkedCount = progress.checkbox_checked.filter(Boolean).length;
    const totalCount = this.config.checkboxes.length;
    const requiredCount = this.config.checkboxes.filter(
      (cb) => cb.required
    ).length;

    if (requiredCount > 0) {
      const requiredChecked = this.config.checkboxes
        .map((cb, i) => cb.required && progress.checkbox_checked[i])
        .filter(Boolean).length;

      return `Progress: ${checkedCount}/${totalCount} items completed (${requiredChecked}/${requiredCount} required)`;
    } else {
      return `Progress: ${checkedCount}/${totalCount} items completed`;
    }
  }

  /**
   * Factory method to create a BasicTask component with proper setup
   */
  static create(
    config: BasicTaskComponentConfig,
    timeline: TimelineContainer,
    existingProgress?: Partial<BasicTaskComponentProgress>
  ): BasicTaskComponent {
    // Validate config
    const validatedConfig = BasicTaskComponentConfigSchema.parse(config);

    // Create progress manager with initial or existing progress
    const initialProgress: BasicTaskComponentProgress = {
      checkbox_checked: new Array(validatedConfig.checkboxes.length).fill(
        false
      ),
      ...existingProgress,
    };

    const validatedProgress =
      BasicTaskComponentProgressSchema.parse(initialProgress);
    const progressManager = new BasicTaskProgressManager(validatedProgress);

    return new BasicTaskComponent(validatedConfig, progressManager, timeline);
  }
}
