/**
 * @fileoverview Basic task component with checkbox-based interactions
 * @module components/cores/basicTaskCore
 *
 * REFACTORED: 
 * - Updated to remove .default() from schema and ensure consistent default handling
 * - Manager now stores config internally - removed config parameter from methods
 * - Removed .default([]) from BasicTaskComponentProgressSchema
 * - Validators use explicit defaults
 * - createInitialProgress() explicitly sets lastUpdated: 0
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
  BaseComponentConfigSchema,
  BaseComponentProgressSchema,
  BaseComponentProgressManager,
  IComponentProgressMessageHandler,
} from "./baseComponentCore.js";
import { BaseComponentInterface } from "../interfaces/baseComponentInterface.js";
import { TimelineContainer } from "../../ui/timelineContainer.js";
import {
  ComponentProgressMessage,
} from "../../core/coreTypes.js";
import { CurriculumRegistry } from "../../registry/mera-registry.js";
import type { IReadonlyOverallProgressManager } from '../../core/overallProgressSchema.js';
import type { IReadonlyNavigationManager } from '../../core/navigationSchema.js';
import type { IReadonlySettingsManager } from '../../core/settingsSchema.js';
// ============================================================================
// SCHEMAS
// ============================================================================

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
 * 
 * REFACTORED: 
 * - Extends BaseComponentProgressSchema which includes lastUpdated (no .default())
 * - Removed .default([]) from checkbox_checked
 * - Explicit defaulting happens in createInitialProgress() and validators
 * 
 * No need to add lastUpdated here - it's inherited automatically!
 */
export const BasicTaskComponentProgressSchema =
  BaseComponentProgressSchema.extend({
    checkbox_checked: z.array(z.boolean()), // NO .default() - explicit defaulting only
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
 * @param progress - Progress data to check
 * @param config - Component configuration (source of truth)
 * @returns true if checkbox array length matches config
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
 * Validation result with cleaned data and defaulting metric.
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
 * - progressIntegrity: Gracefully handles config changes
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
    // Structure mismatch - return fresh default (explicit defaulting)
    return {
      cleaned: {
        checkbox_checked: new Array(config.checkboxes.length).fill(false),
        lastUpdated: 0, // Explicit timestamp 0 = never set
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
 * 
 * REFACTORED: 
 * - Inherits input/output cloning from BaseComponentProgressManager
 * - Stores config reference internally (no longer passed to methods)
 * - Protected progress field allows direct mutation
 * - Component-level timestamp merge (newest wins entire component)
 */
export class BasicTaskProgressManager extends BaseComponentProgressManager<
  BasicTaskComponentConfig,
  BasicTaskComponentProgress
> {
  /**
   * Set individual checkbox state with validation
   *
   * Uses shared validation helpers to ensure index is valid and
   * progress structure matches config. Calls updateTimestamp() after mutation.
   *
   * @param index - Checkbox index to update
   * @param checked - New checked state
   * @throws Error if index out of bounds or structure mismatch
   */
  setCheckboxState(index: number, checked: boolean): void {
    // Validate structure using shared helper (uses this.config)
    if (!isValidProgressStructure(this.progress, this.config)) {
      throw new Error(
        `Progress has ${this.progress.checkbox_checked.length} checkboxes, config expects ${this.config.checkboxes.length}`
      );
    }

    // Validate index using shared helper (uses this.config)
    if (!isValidCheckboxIndex(index, this.config)) {
      throw new Error(`Checkbox index ${index} out of range`);
    }

    // Mutation is safe - mutate protected field directly
    this.progress.checkbox_checked[index] = checked;
    
    // Update timestamp (inherited helper from base class)
    this.updateTimestamp();
  }

  /**
   * Create initial progress structure matching config requirements.
   *
   * Called for new users or when component is first encountered.
   * Creates array of false values matching checkbox count.
   * 
   * IMPORTANT: Explicitly sets lastUpdated to 0 (timestamp 0 = never set by user).
   *
   * @param config Component configuration with checkbox definitions
   * @returns Fresh progress object with all checkboxes unchecked
   */
  createInitialProgress(
    config: BasicTaskComponentConfig
  ): BasicTaskComponentProgress {
    return {
      checkbox_checked: new Array(config.checkboxes.length).fill(false),
      lastUpdated: 0, // Explicit timestamp 0 = never set by user
    };
  }
}

// ============================================================================
// MESSAGE QUEUE MANAGER
// ============================================================================

/**
 * Message queue manager for basic task component progress
 */
export class BasicTaskMessageQueueManager {
  private messageQueue: ComponentProgressMessage[] = [];

  constructor(private componentId: number) {}

  /**
   * Queue checkbox state change message
   *
   * @param index Checkbox index
   * @param checked New checked state
   */
  queueCheckboxState(index: number, checked: boolean): void {
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

// ============================================================================
// COMPONENT CORE
// ============================================================================

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
  overallProgressManager: IReadonlyOverallProgressManager,
  navigationManager: IReadonlyNavigationManager,
  settingsManager: IReadonlySettingsManager,
  curriculumRegistry: CurriculumRegistry

  ) {
    super(
      config,
      progressManager,
      timeline,
      overallProgressManager,
      navigationManager,
      settingsManager,
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
    // Manager now has config internally - no need to pass it
    (this._progressManager as BasicTaskProgressManager).setCheckboxState(
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

// ============================================================================
// MESSAGE HANDLER
// ============================================================================

/**
 * Validates and executes basic task progress messages in Main Core.
 * 
 * Routes validated messages to appropriate BasicTaskProgressManager methods.
 * Only whitelisted methods can be called via messages - security boundary.
 */
export class BasicTaskProgressMessageHandler implements IComponentProgressMessageHandler {
  constructor(
    private componentManagers: Map<number, BaseComponentProgressManager<any, any>>
  ) {}
  
  getComponentType(): string {
    return 'basic_task';
  }
  
  handleMessage(message: ComponentProgressMessage): void {
    // Get the manager for this component
    const manager = this.componentManagers.get(message.componentId) as BasicTaskProgressManager;
    
    if (!manager) {
      throw new Error(`No manager found for component ${message.componentId}`);
    }
    
    // Whitelist of allowed methods for BasicTask components - security boundary
    switch (message.method) {
      case 'setCheckboxState':
        // Manager has config internally now - just pass the args
        manager.setCheckboxState(
          message.args[0] as number,
          message.args[1] as boolean
        );
        break;
      
      default:
        throw new Error(
          `BasicTask components only support: setCheckboxState. Got: ${message.method}`
        );
    }
  }
}