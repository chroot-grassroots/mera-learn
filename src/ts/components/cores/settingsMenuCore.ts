/**
 * @fileoverview Settings Menu Component Core
 * @module components/cores/settingsMenuCore
 *
 * Provides interface for users to modify settings.
 * Queues settings messages for processing by Main Core.
 * No component progress tracking - settings are global user preferences.
 */

import { z } from "zod";
import {
  BaseComponentCore,
  BaseComponentConfigSchema,
  BaseComponentProgressSchema,
  BaseComponentProgressManager,
} from "./baseComponentCore.js";
import { BaseComponentInterface } from "../interfaces/baseComponentInterface.js";
import type { IReadonlyOverallProgressManager } from "../../core/overallProgressSchema.js";
import type { IReadonlyNavigationManager } from "../../core/navigationSchema.js";
import type { IReadonlySettingsManager } from "../../core/settingsSchema.js";
import type { CurriculumRegistry } from "../../registry/mera-registry.js";
import { TimelineContainer } from "../../ui/timelineContainer.js";
import { ComponentProgressMessage } from "../../core/coreTypes.js";
import type { SettingsMessage } from "../../core/settingsSchema.js";
import type { NavigationMessage } from "../../core/navigationSchema.js";

// ============================================================================
// SCHEMAS
// ============================================================================

/**
 * Settings menu component configuration schema.
 */
export const SettingsMenuComponentConfigSchema =
  BaseComponentConfigSchema.extend({
    type: z.literal("settings_menu"),
  });

export type SettingsMenuComponentConfig = z.infer<
  typeof SettingsMenuComponentConfigSchema
>;

/**
 * Settings menu component progress schema.
 * Minimal - no progress to track
 */
export const SettingsMenuComponentProgressSchema =
  BaseComponentProgressSchema.extend({
    // No additional fields needed
  });

export type SettingsMenuComponentProgress = z.infer<
  typeof SettingsMenuComponentProgressSchema
>;

// ============================================================================
// PROGRESS MANAGER
// ============================================================================

/**
 * Settings Menu Progress Manager - minimal implementation.
 * No settings-specific progress to track.
 */
export class SettingsMenuProgressManager extends BaseComponentProgressManager<
  SettingsMenuComponentConfig,
  SettingsMenuComponentProgress
> {
  /**
   * Create initial progress for new users.
   */
  createInitialProgress(
    config: SettingsMenuComponentConfig,
  ): SettingsMenuComponentProgress {
    return {
      lastUpdated: 0,
    };
  }
}

// ============================================================================
// MESSAGE QUEUE MANAGERS
// ============================================================================

/**
 * Message queue manager for settings messages
 */
export class SettingsMenuSettingsMessageQueueManager {
  private queue: SettingsMessage[] = [];

  /**
   * Queue a settings message
   */
  queueMessage(message: SettingsMessage): void {
    console.log(`📤 SettingsMenu queuing settings message:`, message.method);
    this.queue.push(message);
  }

  /**
   * Get all queued messages and clear the queue
   */
  getMessages(): SettingsMessage[] {
    const messages = [...this.queue];
    this.queue = [];
    return messages;
  }
}

/**
 * Message queue manager for navigation messages
 */
export class SettingsMenuNavigationMessageQueueManager {
  private queue: NavigationMessage[] = [];

  /**
   * Queue navigation to main menu
   */
  queueNavigationToMainMenu(): void {
    console.log(`📤 SettingsMenu queuing navigation to main menu`);
    this.queue.push({
      method: "setCurrentView",
      args: [0, 0], // Entity 0 (main menu), page 0
    });
  }

  /**
   * Get all queued messages and clear the queue
   */
  getMessages(): NavigationMessage[] {
    const messages = [...this.queue];
    this.queue = [];
    return messages;
  }
}

// ============================================================================
// CORE
// ============================================================================

/**
 * Settings Menu Core - manages settings interface
 */
export class SettingsMenuCore extends BaseComponentCore<
  SettingsMenuComponentConfig,
  SettingsMenuComponentProgress
> {
  protected settingsMessageQueue: SettingsMenuSettingsMessageQueueManager;
  protected navigationMessageQueue: SettingsMenuNavigationMessageQueueManager;
  private _settingsManager: IReadonlySettingsManager;

  constructor(
    config: SettingsMenuComponentConfig,
    progressManager: SettingsMenuProgressManager,
    timeline: TimelineContainer,
    overallProgressManager: IReadonlyOverallProgressManager,
    navigationManager: IReadonlyNavigationManager,
    settingsManager: IReadonlySettingsManager,
    curriculumRegistry: CurriculumRegistry,
  ) {
    super(
      config,
      progressManager,
      timeline,
      overallProgressManager,
      navigationManager,
      settingsManager,
      curriculumRegistry,
    );

    this._settingsManager = settingsManager;
    this.settingsMessageQueue = new SettingsMenuSettingsMessageQueueManager();
    this.navigationMessageQueue =
      new SettingsMenuNavigationMessageQueueManager();
  }

  /**
   * Create the interface for this core
   */
  protected createInterface(
    timeline: TimelineContainer,
  ): BaseComponentInterface<
    SettingsMenuComponentConfig,
    SettingsMenuComponentProgress,
    any
  > {
    const {
      SettingsMenuInterface,
    } = require("../interfaces/settingsMenuInterface.js");
    return new SettingsMenuInterface(this, timeline);
  }

  /**
   * Get readonly settings manager for interface queries.
   */
  get settingsManager(): IReadonlySettingsManager {
    return this._settingsManager;
  }

  /**
   * Check if component is complete (always true - no completion criteria)
   */
  isComplete(): boolean {
    return true;
  }

  /**
   * Get component-specific progress messages (none for settings menu)
   */
  protected getComponentProgressMessagesInternal(): ComponentProgressMessage[] {
    return [];
  }

  /**
   * Get queued settings messages
   */
  getSettingsMessages(): SettingsMessage[] {
    if (!this._operationsEnabled) {
      return [];
    }
    return this.settingsMessageQueue.getMessages();
  }

  /**
   * Get queued navigation messages
   */
  getNavigationMessages(): NavigationMessage[] {
    if (!this._operationsEnabled) {
      return [];
    }
    return this.navigationMessageQueue.getMessages();
  }

  /**
   * Public interface for component to queue settings message
   */
  queueSettingsMessage(message: SettingsMessage): void {
    this.settingsMessageQueue.queueMessage(message);
  }

  /**
   * Public interface for component to queue navigation to main menu
   */
  queueNavigationToMainMenu(): void {
    this.navigationMessageQueue.queueNavigationToMainMenu();
  }
}

// ============================================================================
// VALIDATION & INITIALIZATION
// ============================================================================

/**
 * Validate component progress against config
 */
export function validateSettingsMenuProgress(
  progress: SettingsMenuComponentProgress,
  config: SettingsMenuComponentConfig,
): { cleaned: SettingsMenuComponentProgress; defaultedRatio: number } {
  return {
    cleaned: progress,
    defaultedRatio: 0,
  };
}

/**
 * Create initial progress for settings menu component
 */
export function createInitialProgress(
  config: SettingsMenuComponentConfig,
): SettingsMenuComponentProgress {
  const tempManager = new SettingsMenuProgressManager(config, {
    lastUpdated: 0,
  });
  return tempManager.createInitialProgress(config);
}
