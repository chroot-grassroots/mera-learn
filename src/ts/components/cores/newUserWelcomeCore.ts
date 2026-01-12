/**
 * @fileoverview New user welcome component - initial setup flow
 * @module components/cores/newUserWelcomeCore
 * 
 * One-time welcome screen that appears for new users to configure
 * initial settings before accessing the main application.
 * 
 * Progress: Minimal - only lastUpdated (always 0, never modified)
 * Completion: Always returns true (no user progress to track)
 */

import { z } from "zod";
import {
  BaseComponentCore,
  BaseComponentConfigSchema,
  BaseComponentProgressSchema,
  BaseComponentProgressManager,
} from "./baseComponentCore.js";
import { BaseComponentInterface } from "../interfaces/baseComponentInterface.js";
import { TimelineContainer } from "../../ui/timelineContainer.js";
import { ComponentProgressMessage } from "../../core/coreTypes.js";
import {
  SettingsMessage,
  IReadonlySettingsManager,
} from "../../core/settingsSchema.js";
import {
  NavigationMessage,
  IReadonlyNavigationManager,
} from "../../core/navigationSchema.js";
import { CurriculumRegistry } from "../../registry/mera-registry.js";
import type { IReadonlyOverallProgressManager } from "../../core/overallProgressSchema.js";

// ============================================================================
// SCHEMAS
// ============================================================================

/**
 * New user welcome component configuration schema
 * 
 * No custom config needed - everything is hardcoded in the component
 */
export const NewUserWelcomeComponentConfigSchema = BaseComponentConfigSchema.extend({
  type: z.literal("new_user_welcome"),
});

export type NewUserWelcomeComponentConfig = z.infer<
  typeof NewUserWelcomeComponentConfigSchema
>;

/**
 * New user welcome component progress schema
 * 
 * No actual progress to track - just inherits lastUpdated from base
 * which stays at 0 forever
 */
export const NewUserWelcomeComponentProgressSchema = BaseComponentProgressSchema.extend({
  // No additional fields - just lastUpdated from base
});

export type NewUserWelcomeComponentProgress = z.infer<
  typeof NewUserWelcomeComponentProgressSchema
>;

// ============================================================================
// PROGRESS MANAGER
// ============================================================================

/**
 * Progress manager for new user welcome component
 * 
 * Minimal implementation - no progress to track or mutate
 */
export class NewUserWelcomeProgressManager extends BaseComponentProgressManager<
  NewUserWelcomeComponentConfig,
  NewUserWelcomeComponentProgress
> {
  /**
   * Create initial progress structure
   * 
   * Just the base lastUpdated field set to 0
   */
  createInitialProgress(
    config: NewUserWelcomeComponentConfig
  ): NewUserWelcomeComponentProgress {
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
 * 
 * Queues all settings configuration messages generated during welcome flow
 */
export class NewUserWelcomeSettingsMessageQueueManager {
  private queue: SettingsMessage[] = [];

  /**
   * Queue a settings message
   */
  queueMessage(message: SettingsMessage): void {
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
 * 
 * Queues navigation to main menu after welcome completion
 */
export class NewUserWelcomeNavigationMessageQueueManager {
  private queue: NavigationMessage[] = [];

  /**
   * Queue navigation to main menu
   */
  queueNavigationToMainMenu(): void {
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
// COMPONENT CORE
// ============================================================================

/**
 * Core class for new user welcome component
 * 
 * Manages message queues for settings and navigation
 * No component progress messages (no progress to track)
 */
export class NewUserWelcomeCore extends BaseComponentCore<
  NewUserWelcomeComponentConfig,
  NewUserWelcomeComponentProgress
> {
  protected settingsMessageQueue: NewUserWelcomeSettingsMessageQueueManager;
  protected navigationMessageQueue: NewUserWelcomeNavigationMessageQueueManager;

  constructor(
    config: NewUserWelcomeComponentConfig,
    progressManager: NewUserWelcomeProgressManager,
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

    this.settingsMessageQueue = new NewUserWelcomeSettingsMessageQueueManager();
    this.navigationMessageQueue = new NewUserWelcomeNavigationMessageQueueManager();
  }

  /**
   * Create the interface for this core
   */
  protected createInterface(
    timeline: TimelineContainer
  ): BaseComponentInterface<
    NewUserWelcomeComponentConfig,
    NewUserWelcomeComponentProgress,
    any
  > {
    // Import will be resolved when files are in correct location
    const { NewUserWelcomeInterface } = require("../interfaces/newUserWelcomeInterface.js");
    return new NewUserWelcomeInterface(this, timeline);
  }

  /**
   * Check if component is complete
   * 
   * Always returns true - completion determined by navigation away
   */
  isComplete(): boolean {
    // Welcome component has no completion criteria
    // User completes it by navigating away to main menu
    return true;
  }

  /**
   * Get component-specific progress messages (internal)
   * 
   * Always returns empty array - no progress to track
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
 * 
 * No validation needed - progress has no config-dependent structure
 */
export function validateNewUserWelcomeProgress(
  progress: NewUserWelcomeComponentProgress,
  config: NewUserWelcomeComponentConfig
): { cleaned: NewUserWelcomeComponentProgress; defaultedRatio: number } {
  // No validation needed - just return as-is
  return {
    cleaned: progress,
    defaultedRatio: 0,
  };
}

/**
 * Create initial progress for new user welcome component
 */
export function createInitialNewUserWelcomeProgress(
  config: NewUserWelcomeComponentConfig
): NewUserWelcomeComponentProgress {
  // Create a temporary manager instance to use its method
  const tempManager = new NewUserWelcomeProgressManager(
    config,
    { lastUpdated: 0 }
  );
  return tempManager.createInitialProgress(config);
}