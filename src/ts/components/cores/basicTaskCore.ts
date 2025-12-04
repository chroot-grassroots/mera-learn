/**
 * @fileoverview Basic task component with checkbox-based interactions
 * @module components/cores/basicTaskCore
 *
 * Implements a simple checkbox task component where users check off items
 * to complete activities. Supports required vs optional checkboxes.
 *
 * VALIDATION ARCHITECTURE:
 * - Shared validation helpers: Atomic checks used by both validators and managers
 * - Full validators: Pure functions that validate entire progress state
 * - Manager classes: Use helpers for defensive runtime validation
 */

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

// ============================================================================
// SHARED VALIDATION HELPERS
// ============================================================================

/**
 * Check if a checkbox index is valid for the given config.
 *
 * Used by both validateBasicTaskStructure (recovery) and
 * BasicTaskProgressManager (runtime mutations) to ensure consistency.
 *
 * @param index - Checkbox index to validate
 * @param config - Component configuration with checkbox definitions
 * @returns true if index is within bounds
 */
export function isValidCheckboxIndex(
  index: number,
  config: BasicTaskComponentConfig
): boolean {
  return index >= 0 && index < config.checkboxes.length;
}

/**
 * Check if progress structure matches config structure.
 *
 * Used by both validateBasicTaskStructure (recovery) and
 * BasicTaskProgressManager (runtime mutations) to ensure consistency.
 *
 * Verifies that the checkbox_checked array length matches the number
 * of checkboxes defined in the config.
 *
 * @param progress - Progress data to validate
 * @param config - Component configuration to check against
 * @returns true if array lengths match
 */
export function isValidProgressStructure(
  progress: BasicTaskComponentProgress,
  config: BasicTaskComponentConfig
): boolean {
  return progress.checkbox_checked.length === config.checkboxes.length;
}

// ============================================================================
// FULL VALIDATORS
// ============================================================================

/**
 * Result of validating component progress against config.
 *
 * Returns cleaned progress and whether any defaulting occurred.
 */
export interface ValidationResult<T> {
  cleaned: T;
  defaultedRatio: number; // 0.0 = perfect, 1.0 = fully defaulted
}

/**
 * Validate basic task progress against current config.
 *
 * PURE FUNCTION - Never throws, always returns valid data.
 *
 * Checks if the progress array length matches the config checkbox count.
 * If they don't match (e.g., config changed since progress was saved),
 * returns fresh default progress.
 *
 * Used by:
 * - progressRecovery: Gracefully handles config changes
 * - BasicTaskProgressManager: Defensive check (throws if defaulted)
 *
 * @param progress - Progress data to validate
 * @param config - Current component configuration (source of truth)
 * @returns Cleaned progress + defaultedRatio
 */
export function validateBasicTaskStructure(
  progress: BasicTaskComponentProgress,
  config: BasicTaskComponentConfig
): ValidationResult<BasicTaskComponentProgress> {
  // Check if structure matches
  if (!isValidProgressStructure(progress, config)) {
    // Structure mismatch - return fresh default
    return {
      cleaned: {
        checkbox_checked: new Array(config.checkboxes.length).fill(false),
      },
      defaultedRatio: 1.0,
    };
  }

  // Structure is valid
  return {
    cleaned: progress,
    defaultedRatio: 0.0,
  };
}

// ============================================================================
// PROGRESS MANAGER
// ============================================================================

/**
 * Progress manager for basic task component
 */
export class BasicTaskProgressManager extends BaseComponentProgressManager<BasicTaskComponentProgress> {
  /**
   * Set individual checkbox state with validation
   *
   * Uses shared validation helpers to ensure index is valid and
   * progress structure matches config.
   *
   * @param config - Component configuration
   * @param index - Checkbox index to update
   * @param checked - New checked state
   * @throws Error if index out of bounds or structure mismatch
   */
  setCheckboxState(
    config: BasicTaskComponentConfig,
    index: number,
    checked: boolean
  ): void {
    // Validate structure using shared helper
    if (!isValidProgressStructure(this.progress, config)) {
      throw new Error(
        `Progress has ${this.progress.checkbox_checked.length} checkboxes, config expects ${config.checkboxes.length}`
      );
    }

    // Validate index using shared helper
    if (!isValidCheckboxIndex(index, config)) {
      throw new Error(`Checkbox index ${index} out of range`);
    }

    // Mutation is safe
    this.progress.checkbox_checked[index] = checked;
  }

  /**
   * Create initial progress structure matching config requirements.
   *
   * Called for new users or when component is first encountered.
   * Creates array of false values matching checkbox count.
   *
   * @param config - Component configuration from YAML
   * @returns Fresh progress with all checkboxes unchecked
   */
  createInitialProgress(
    config: BasicTaskComponentConfig
  ): BasicTaskComponentProgress {
    return {
      checkbox_checked: new Array(config.checkboxes.length).fill(false),
    };
  }

  /**
   * Define trump strategies for offline/online conflict resolution.
   *
   * ELEMENT_WISE_OR: If either session checked a box, keep it checked.
   * This is optimistic - assumes user intended to check boxes.
   *
   * @returns Map of field name to trump strategy
   */
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

  /**
   * Queue a checkbox state change message.
   *
   * Validates parameters before queueing.
   *
   * @param index - Checkbox index
   * @param checked - New checked state
   * @throws Error if parameters are invalid
   */
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

  /**
   * Retrieve and clear all queued messages.
   *
   * Core polls this method to get pending updates.
   * Messages are removed from queue after retrieval.
   *
   * @returns Array of queued messages
   */
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
   *
   * Task is complete when all required checkboxes are checked.
   * Optional checkboxes don't affect completion status.
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