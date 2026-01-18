/**
 * @fileoverview Main Menu Component Core
 * @module components/cores/mainMenuCore
 * 
 * Main menu serves as the application home base, displaying:
 * - Learning streak tracking
 * - Domain progress overview
 * - Jump In recommendations
 * - Tree of Knowledge badges
 * 
 * Special authorization: Can send messages to modify other components (for reset)
 */

import { z } from "zod";
import {
  BaseComponentCore,
  BaseComponentProgressManager,
  BaseComponentConfigSchema,
  BaseComponentProgressSchema,
} from "./baseComponentCore.js";
import type { ComponentProgressMessage } from "../../core/coreTypes.js";
import type { IReadonlyOverallProgressManager } from "../../core/overallProgressSchema.js";
import type { IReadonlyNavigationManager } from "../../core/navigationSchema.js";
import type { IReadonlySettingsManager } from "../../core/settingsSchema.js";
import type { CurriculumRegistry } from "../../registry/mera-registry.js";
import type { TimelineContainer } from "../../ui/timelineContainer.js";
import type { BaseComponentInterface } from "../interfaces/baseComponentInterface.js";

// ============================================================================
// SCHEMAS
// ============================================================================

/**
 * Main menu component configuration schema.
 * No custom fields beyond base requirements.
 */
export const MainMenuComponentConfigSchema = BaseComponentConfigSchema.extend({
  type: z.literal("main_menu"),
});

export type MainMenuComponentConfig = z.infer<
  typeof MainMenuComponentConfigSchema
>;

/**
 * Main menu component progress schema.
 * No custom progress - just tracks lastUpdated.
 */
export const MainMenuComponentProgressSchema = BaseComponentProgressSchema.extend({
  // No additional fields needed
});

export type MainMenuComponentProgress = z.infer<
  typeof MainMenuComponentProgressSchema
>;

// ============================================================================
// PROGRESS MANAGER
// ============================================================================

/**
 * Progress manager for main menu component.
 * Minimal - no progress to track.
 */
export class MainMenuProgressManager extends BaseComponentProgressManager<
  MainMenuComponentConfig,
  MainMenuComponentProgress
> {
  /**
   * Create initial progress for new users.
   */
  createInitialProgress(
    config: MainMenuComponentConfig
  ): MainMenuComponentProgress {
    return {
      lastUpdated: 0,
    };
  }
}

// ============================================================================
// COMPONENT CORE
// ============================================================================

/**
 * Main menu component core.
 * 
 * Handles:
 * - Queuing navigation messages when user clicks lessons
 * - Queuing component progress messages to reset lessons
 * - Providing data to interface for rendering
 */
export class MainMenuCore extends BaseComponentCore<
  MainMenuComponentConfig,
  MainMenuComponentProgress
> {
  // Store readonly managers we need (following NewUserWelcomeCore pattern)
  private readonly overallProgress: IReadonlyOverallProgressManager;
  private readonly curriculum: CurriculumRegistry;

  constructor(
    config: MainMenuComponentConfig,
    progressManager: MainMenuProgressManager,
    timeline: TimelineContainer,
    overallProgressManager: IReadonlyOverallProgressManager,
    navigationManager: IReadonlyNavigationManager,
    settingsManager: IReadonlySettingsManager,
    curriculumData: CurriculumRegistry
  ) {
    super(
      config,
      progressManager,
      timeline,
      overallProgressManager,
      navigationManager,
      settingsManager,
      curriculumData
    );

    // Store references we need for public methods
    this.overallProgress = overallProgressManager;
    this.curriculum = curriculumData;
  }

  /**
   * Create the interface for this core
   */
  protected createInterface(
    timeline: TimelineContainer
  ): BaseComponentInterface<
    MainMenuComponentConfig,
    MainMenuComponentProgress,
    any
  > {
    const { MainMenuInterface } = require("../interfaces/mainMenuInterface.js");
    return new MainMenuInterface(this, timeline);
  }

  /**
   * Check if component is complete.
   * Main menu is never "complete" - it's always accessible.
   */
  isComplete(): boolean {
    return false;
  }

  /**
   * Main menu has no component progress messages (doesn't modify its own progress).
   * Cross-component messages are queued directly via the queue manager.
   */
  protected getComponentProgressMessagesInternal(): ComponentProgressMessage[] {
    return [];
  }

  /**
   * Public method for interface to queue lesson reset.
   * 
   * This is where the main menu's special authorization is used -
   * it queues messages targeting OTHER components' progress managers.
   * 
   * @param lessonId - Lesson to reset
   */
  queueResetLesson(lessonId: number): void {
    // TODO: Implement in Phase 7
    // Will queue component progress messages for all components in lesson
    // Will also queue overall progress message to mark lesson incomplete
    console.log(`Reset lesson ${lessonId} - not yet implemented`);
  }

  /**
   * Get streak data for interface rendering.
   */
  getStreakData(): { current: number; lastActivity: number } {
    const progress = this.overallProgress.getProgress();
    return {
      current: progress.currentStreak,
      lastActivity: progress.lastStreakCheck,
    };
  }

  /**
   * Get domain progress for all domains.
   */
  getAllDomainProgress(): Array<{ domainId: number; completed: number; total: number }> {
    const domainIds = this.curriculum.getAllDomainIds();
    const progress = this.overallProgress.getProgress();
    
    return domainIds.map((domainId: number) => {
      // Get all lessons in this domain
      const lessonsInDomain = this.curriculum.getLessonsInDomain(domainId) || [];
      const total = lessonsInDomain.length;
      
      // Count how many are completed
      const completed = lessonsInDomain.filter((lessonId) => {
        const completion = progress.lessonCompletions[lessonId.toString()];
        return completion && completion.timeCompleted !== null;
      }).length;
      
      return {
        domainId,
        completed,
        total,
      };
    });
  }

  /**
   * Get lessons for a specific domain.
   */
  getLessonsInDomain(domainId: number): number[] {
    return this.curriculum.getLessonsInDomain(domainId) || [];
  }
}

// ============================================================================
// VALIDATION & INITIALIZATION
// ============================================================================

/**
 * Validate main menu progress against config.
 * No validation needed - no config-dependent structure.
 */
export function validateMainMenuProgress(
  progress: MainMenuComponentProgress,
  config: MainMenuComponentConfig
): { cleaned: MainMenuComponentProgress; defaultedRatio: number } {
  return {
    cleaned: progress,
    defaultedRatio: 0,
  };
}

/**
 * Create initial progress for main menu component.
 */
export function createInitialProgress(
  config: MainMenuComponentConfig
): MainMenuComponentProgress {
  const tempManager = new MainMenuProgressManager(config, { lastUpdated: 0 });
  return tempManager.createInitialProgress(config);
}