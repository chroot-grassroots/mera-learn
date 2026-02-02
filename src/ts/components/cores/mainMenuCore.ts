/**
 * @fileoverview Main Menu Component Core
 * @module components/cores/mainMenuCore
 *
 * Singleton component serving as user's home base.
 * Displays progress, manages streaks, enables navigation and lesson resets.
 *
 * Special permissions:
 * - Can modify overall progress (streak tracking)
 * - Can modify navigation (lesson clicks)
 * - Can modify other components' progress (lesson reset - Phase 7)
 */

import { z } from "zod";
import {
  BaseComponentCore,
  BaseComponentConfigSchema,
  BaseComponentProgressSchema,
  BaseComponentProgressManager,
} from "./baseComponentCore.js";
import { BaseComponentInterface } from "../interfaces/baseComponentInterface.js";
import { MainMenuInterface } from "../interfaces/mainMenuInterface.js";
import type { IReadonlyOverallProgressManager } from "../../core/overallProgressSchema.js";
import type { IReadonlyNavigationManager } from "../../core/navigationSchema.js";
import type { IReadonlySettingsManager } from "../../core/settingsSchema.js";
import type { CurriculumRegistry } from "../../registry/mera-registry.js";
import { TimelineContainer } from "../../ui/timelineContainer.js";
import { ComponentProgressMessage } from "../../core/coreTypes.js";
import {
  OverallProgressMessageQueueManager,
  type OverallProgressMessage,
} from "../../core/overallProgressSchema.js";
import {
  NavigationMessageQueueManager,
  type NavigationMessage,
} from "../../core/navigationSchema.js";
import { domainData, lessonMetadata } from "../../registry/mera-registry.js";

// ============================================================================
// SCHEMAS
// ============================================================================

/**
 * Main menu component configuration schema.
 * Boilerplate only - no custom fields beyond base requirements.
 */
export const MainMenuComponentConfigSchema = BaseComponentConfigSchema.extend({
  type: z.literal("main_menu"),
});

export type MainMenuComponentConfig = z.infer<
  typeof MainMenuComponentConfigSchema
>;

/**
 * Main menu component progress schema.
 * Boilerplate only - tracks lastUpdated but no custom progress state.
 */
export const MainMenuComponentProgressSchema =
  BaseComponentProgressSchema.extend({
    // No additional fields needed
  });

export type MainMenuComponentProgress = z.infer<
  typeof MainMenuComponentProgressSchema
>;

// ============================================================================
// TYPES FOR PHASE 4 - DOMAIN ACCORDION
// ============================================================================

/**
 * Domain data with calculated progress
 */
export interface DomainData {
  id: number;
  title: string;
  description: string;
  emoji: string;
  color: string;
  completed: number;
  total: number;
  percentage: number;
}

/**
 * Lesson status for UI rendering
 */
export type LessonStatus = "not-started" | "started" | "completed";

/**
 * Lesson data with status
 */
export interface LessonData {
  id: number;
  title: string;
  description: string;
  difficulty: string;
  estimatedMinutes: number;
  status: LessonStatus;
}

// ============================================================================
// PROGRESS MANAGER
// ============================================================================

/**
 * Main Menu Progress Manager - minimal implementation.
 *
 * Main menu doesn't track component-specific progress.
 * This class exists to satisfy the architecture but does minimal work.
 */
export class MainMenuProgressManager extends BaseComponentProgressManager<
  MainMenuComponentConfig,
  MainMenuComponentProgress
> {
  /**
   * Create initial progress for new users.
   * Main menu has no progress fields, just timestamp.
   */
  createInitialProgress(
    config: MainMenuComponentConfig,
  ): MainMenuComponentProgress {
    return {
      lastUpdated: 0,
    };
  }
}

// ============================================================================
// CORE
// ============================================================================

/**
 * Main Menu Core - manages streak checking and message queuing.
 *
 * Responsibilities:
 * - Check for complete weeks since last streak check
 * - Calculate lessons completed per week
 * - Queue streak increment/reset messages
 * - Queue navigation messages for lesson clicks
 * - (Phase 7) Queue lesson reset messages
 */
export class MainMenuCore extends BaseComponentCore<
  MainMenuComponentConfig,
  MainMenuComponentProgress
> {
  // Store readonly managers for business logic access
  private _overallProgressManager: IReadonlyOverallProgressManager;
  private _navigationManager: IReadonlyNavigationManager;
  private _settingsManager: IReadonlySettingsManager;
  private _curriculumRegistry: CurriculumRegistry;

  // Message queues for special permissions
  private overallProgressMessageQueue: OverallProgressMessageQueueManager;
  private navigationMessageQueue: NavigationMessageQueueManager;

  constructor(
    config: MainMenuComponentConfig,
    progressManager: MainMenuProgressManager,
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

    // Store managers for business logic access
    this._overallProgressManager = overallProgressManager;
    this._navigationManager = navigationManager;
    this._settingsManager = settingsManager;
    this._curriculumRegistry = curriculumRegistry;

    // Special permissions: can manipulate overall progress and navigation
    this.overallProgressMessageQueue = new OverallProgressMessageQueueManager(
      curriculumRegistry,
    );
    this.navigationMessageQueue = new NavigationMessageQueueManager(
      curriculumRegistry,
    );
  }

  /**
   * Create the interface for this core
   */
  protected createInterface(
    timeline: TimelineContainer,
  ): BaseComponentInterface<
    MainMenuComponentConfig,
    MainMenuComponentProgress,
    any
  > {
    return new MainMenuInterface(this, timeline);
  }

  /**
   * Check if component is complete
   * Main menu is always "complete"
   */
  isComplete(): boolean {
    return true;
  }

  /**
   * Get component-specific progress messages (internal)
   * Main menu has no component-specific progress
   */
  protected getComponentProgressMessagesInternal(): ComponentProgressMessage[] {
    return [];
  }

  // ============================================================================
  // PUBLIC GETTERS FOR INTERFACE
  // ============================================================================

  /**
   * Get readonly overall progress manager for interface queries.
   */
  get overallProgressManager(): IReadonlyOverallProgressManager {
    return this._overallProgressManager;
  }

  /**
   * Get readonly settings manager for interface queries.
   */
  get settingsManager(): IReadonlySettingsManager {
    return this._settingsManager;
  }

  /**
   * Get readonly navigation manager for interface queries.
   */
  get navigationManager(): IReadonlyNavigationManager {
    return this._navigationManager;
  }

  /**
   * Get curriculum registry for domain/lesson queries.
   */
  get curriculumRegistry(): CurriculumRegistry {
    return this._curriculumRegistry;
  }

  // ============================================================================
  // MESSAGE POLLING
  // ============================================================================

  /**
   * Get queued navigation messages for Main Core to process.
   */
  getNavigationMessages(): NavigationMessage[] {
    if (!this._operationsEnabled) return [];
    return this.navigationMessageQueue.getMessages();
  }

  /**
   * Get queued overall progress messages for Main Core to process.
   */
  getOverallProgressMessages(): OverallProgressMessage[] {
    if (!this._operationsEnabled) return [];
    return this.overallProgressMessageQueue.getMessages();
  }

  // ============================================================================
  // PUBLIC INTERFACE METHODS
  // ============================================================================

  /**
   * Check for complete weeks since last streak check and queue appropriate messages.
   *
   * Called by interface on render. Processes all complete weeks sequentially,
   * queuing increment for weeks with goal met, reset for weeks with goal missed.
   *
   * For flexible pace (no weekly goal), this is a no-op.
   */
  checkAndQueueStreakUpdates(): void {
    if (!this._operationsEnabled) return;

    const settings = this._settingsManager.getSettings();
    const pace = settings.learningPace[0];

    // Flexible pace has no weekly goals, so no streak tracking
    if (pace === "flexible") return;

    const progress = this._overallProgressManager.getProgress();
    const lastCheck = progress.lastStreakCheck;
    const now = Math.floor(Date.now() / 1000);

    // Get weekly goal from learning pace
    const weeklyGoal = this.getWeeklyGoal();

    // Get all complete week boundaries since last check
    const completeWeeks = this.getCompleteWeeksSince(lastCheck, now);

    // Process each complete week sequentially
    for (const week of completeWeeks) {
      const lessonsInWeek = this.countLessonsInWeek(week.start, week.end);

      if (lessonsInWeek >= weeklyGoal) {
        this.overallProgressMessageQueue.queueIncrementStreak();
      } else {
        this.overallProgressMessageQueue.queueResetStreak();
      }
    }
  }

  /**
   * Queue navigation to a specific lesson.
   */
  queueNavigation(entityId: number, page: number = 0): void {
    if (!this._operationsEnabled) return;
    this.navigationMessageQueue.queueNavigationMessage(entityId, page);
  }

  /**
   * Queue navigation to settings menu.
   * Opens settings at entity 2, page 0.
   */
  queueNavigationToSettings(): void {
    if (!this._operationsEnabled) return;
    this.navigationMessageQueue.queueNavigationMessage(2, 0);
  }

  /**
   * Queue lesson reset (Phase 7 - stub for now).
   */
  queueResetLesson(lessonId: number): void {
    throw new Error("Lesson reset not yet implemented");
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  /**
   * Get weekly goal based on learning pace setting.
   */
  private getWeeklyGoal(): number {
    const settings = this._settingsManager.getSettings();
    const pace = settings.learningPace[0];

    const goalMap: Record<typeof pace, number> = {
      accelerated: 6, // 6 lessons/week
      standard: 3, // 3 lessons/week (recommended)
      flexible: 0, // No weekly goal
    };

    return goalMap[pace];
  }

  /**
   * Get all complete week boundaries between two timestamps.
   * Uses user's configured week start day/time from settings.
   */
  private getCompleteWeeksSince(
    since: number,
    until: number,
  ): Array<{ start: number; end: number }> {
    const weeks: Array<{ start: number; end: number }> = [];

    // Get first week start after 'since'
    let weekStart = this.getNextWeekStartAfter(since);

    // Collect all complete weeks until 'until'
    while (true) {
      const weekEnd = weekStart + 7 * 24 * 60 * 60;

      // Week is only complete if its end is before 'until'
      if (weekEnd > until) break;

      weeks.push({ start: weekStart, end: weekEnd });
      weekStart = weekEnd;
    }

    return weeks;
  }

  /**
   * Get the first week start timestamp after a given time.
   * Uses SettingsDataManager.getLastWeekStart() which handles week config.
   */
  private getNextWeekStartAfter(after: number): number {
    // Cast to concrete type to access getLastWeekStart() method
    const settingsManager = this._settingsManager as any;
    const lastWeekStart = settingsManager.getLastWeekStart();

    if (lastWeekStart > after) {
      return lastWeekStart;
    }

    let weekStart = lastWeekStart;
    const weekSeconds = 7 * 24 * 60 * 60;

    while (weekStart <= after) {
      weekStart += weekSeconds;
    }

    return weekStart;
  }

  /**
   * Count lessons first completed within a time range.
   * Uses timeCompleted timestamp to ensure lessons only counted once.
   */
  private countLessonsInWeek(startTime: number, endTime: number): number {
    const progress = this._overallProgressManager.getProgress();
    let count = 0;

    for (const completion of Object.values(progress.lessonCompletions)) {
      const timeCompleted = completion.timeCompleted;

      if (
        timeCompleted !== null &&
        timeCompleted >= startTime &&
        timeCompleted < endTime
      ) {
        count++;
      }
    }

    return count;
  }

  // ============================================================================
  // DOMAIN & LESSON METHODS (Phase 4)
  // ============================================================================

  /**
   * Get all domains with calculated progress
   */
  getAllDomains(): DomainData[] {
    const domainIds = this._curriculumRegistry.getAllDomainIds();

    return domainIds.map((domainId) => {
      const metadata = domainData.find((d: any) => d.id === domainId);

      // Cast to access getDomainProgress() which isn't on readonly interface
      const progress = (this._overallProgressManager as any).getDomainProgress(
        domainId,
      );

      return {
        id: domainId,
        title: metadata?.title || `Domain ${domainId}`,
        description: metadata?.description || "",
        emoji: "📚", // Not in domain YAML yet, using default
        color: "#84e67b", // Not in domain YAML yet, using default green
        completed: progress.completed,
        total: progress.total,
        percentage:
          progress.total > 0
            ? Math.round((progress.completed / progress.total) * 100)
            : 0,
      };
    });
  }

  /**
   * Get all lessons in a domain with status
   */
  getLessonsInDomain(domainId: number): LessonData[] {
    const lessonIds = this._curriculumRegistry.getLessonsInDomain(domainId);

    if (!lessonIds) return [];

    return lessonIds.map((lessonId) => {
      const metadata = lessonMetadata.find((l: any) => l.id === lessonId);
      const status = this.getLessonStatus(lessonId);

      return {
        id: lessonId,
        title: metadata?.title || `Lesson ${lessonId}`,
        description: "", // TODO: Add description field to lesson YAML files
        difficulty: metadata?.difficulty || "beginner",
        estimatedMinutes: metadata?.estimatedMinutes || 10,
        status,
      };
    });
  }

  /**
   * Determine lesson status: not-started, started, or completed
   */
  private getLessonStatus(lessonId: number): LessonStatus {
    const progress = this._overallProgressManager.getProgress();
    const completion = progress.lessonCompletions[lessonId.toString()];

    if (!completion) return "not-started";

    if (completion.timeCompleted !== null) return "completed";

    // If lastUpdated exists but timeCompleted is null, lesson was started
    if (completion.lastUpdated > 0) return "started";

    return "not-started";
  }

  /**
   * Count lessons first completed since a timestamp (for current week display).
   * Public method for interface to call.
   */
  countLessonsSince(since: number): number {
    const progress = this._overallProgressManager.getProgress();
    let count = 0;

    for (const completion of Object.values(progress.lessonCompletions)) {
      const timeCompleted = completion.timeCompleted;

      if (timeCompleted !== null && timeCompleted >= since) {
        count++;
      }
    }

    return count;
  }
}

// ============================================================================
// VALIDATION & INITIALIZATION
// ============================================================================

/**
 * Validate main menu progress against config.
 * No validation needed - progress has no config-dependent structure.
 */
export function validateMainMenuProgress(
  progress: MainMenuComponentProgress,
  config: MainMenuComponentConfig,
): { cleaned: MainMenuComponentProgress; defaultedRatio: number } {
  return {
    cleaned: progress,
    defaultedRatio: 0,
  };
}

/**
 * Create initial progress for main menu component.
 * Required for registry builder.
 */
export function createInitialProgress(
  config: MainMenuComponentConfig,
): MainMenuComponentProgress {
  const tempManager = new MainMenuProgressManager(config, { lastUpdated: 0 });
  return tempManager.createInitialProgress(config);
}
