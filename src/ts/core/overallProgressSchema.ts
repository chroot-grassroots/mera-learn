/**
 * @fileoverview Overall user progress schemas and management
 * @module core/overallProgressSchema
 *
 * Tracks lesson completions, domain progress, and learning streaks with
 * Solid Pod persistence. Provides two manager classes for validated mutations:
 *
 * - OverallProgressManager: Direct progress mutations (used by Main Core)
 * - OverallProgressMessageQueueManager: Message queue for component isolation
 *
 * Components cannot mutate progress directly. They queue validated messages
 * that Main Core processes, preventing invalid state from buggy components.
 *
 * VALIDATION ARCHITECTURE:
 * - Shared validation helpers: Atomic checks used by both validators and managers
 * - Full validators: Pure functions that reconcile entire progress state
 * - Manager classes: Use helpers for defensive runtime validation
 */

import { z } from "zod";
import { ImmutableId, TrumpStrategy } from "./coreTypes.js";
import { CurriculumRegistry } from "../registry/mera-registry.js";

/**
 * Schema for overall curriculum progress data.
 *
 * Tracks lesson completions, domain completions, and learning streaks.
 * Validated on load (from Solid Pod) and on mutation (from messages)
 * by OverallProgressManager.
 * 
 * Current-count trackers (totalLessonsCompleted, totalDomainsCompleted)
 * mirror the count of entries in lessonCompletions/domainsCompleted.
 * They increment on completion and decrement on un-completion, always
 * matching array length in valid data. Mismatch during recovery indicates
 * backup file corruption (e.g., lost entries due to incomplete write).
 */
export const OverallProgressDataSchema = z.object({
  lessonCompletions: z.record(z.string(), z.number()), // lessonId -> Unix timestamp
  domainsCompleted: z.array(ImmutableId), // Domain Immutable IDs
  currentStreak: z.number().min(0).max(1000), // Completed weeks (not including current)
  lastStreakCheck: z.number().int().min(0), // Unix timestamp of last validation
  totalLessonsCompleted: z.number().int().min(0).default(0), // Current count tracker for corruption detection
  totalDomainsCompleted: z.number().int().min(0).default(0), // Current count tracker for corruption detection
});

export type OverallProgressData = z.infer<typeof OverallProgressDataSchema>;

// ============================================================================
// SHARED VALIDATION HELPERS
// ============================================================================

/**
 * Check if a lesson ID exists in the curriculum registry.
 *
 * Used by both reconcileAgainstCurriculum (recovery) and
 * OverallProgressManager (runtime mutations) to ensure consistency.
 *
 * @param lessonId - Lesson ID to validate
 * @param curriculum - Curriculum registry to check against
 * @returns true if lesson exists in curriculum
 */
export function isValidLessonId(
  lessonId: number,
  curriculum: CurriculumRegistry
): boolean {
  return curriculum.hasLesson(lessonId);
}

/**
 * Check if a domain ID exists in the curriculum registry.
 *
 * Used by both reconcileAgainstCurriculum (recovery) and
 * future domain completion logic (runtime mutations).
 *
 * @param domainId - Domain ID to validate
 * @param curriculum - Curriculum registry to check against
 * @returns true if domain exists in curriculum
 */
export function isValidDomainId(
  domainId: number,
  curriculum: CurriculumRegistry
): boolean {
  return curriculum.hasDomain(domainId);
}

// ============================================================================
// FULL VALIDATORS
// ============================================================================

/**
 * Result of reconciling progress against current curriculum.
 *
 * Provides counts (not IDs) of dropped entries so progressIntegrity
 * can calculate retention ratios.
 */
export interface ReconciliationResult {
  cleaned: OverallProgressData;
  lessonsDropped: number;
  domainsDropped: number;
  lessonsKept: number;
  domainsKept: number;
}

/**
 * Reconcile overall progress against current curriculum registry.
 *
 * PURE FUNCTION - Never throws, always returns valid data.
 *
 * Filters out lesson completions and domain completions for entities
 * that no longer exist in the curriculum. This handles the case where
 * content has been removed or reorganized since the backup was created.
 *
 * Used by:
 * - progressIntegrity: Calculates retention ratios from counts
 * - OverallProgressManager: Defensive check (throws if any dropped)
 *
 * @param data - Progress data to reconcile (potentially contains deleted IDs)
 * @param curriculum - Current curriculum registry (source of truth)
 * @returns Cleaned data + counts of kept/dropped entries
 */
export function reconcileAgainstCurriculum(
  data: OverallProgressData,
  curriculum: CurriculumRegistry
): ReconciliationResult {
  let lessonsDropped = 0;
  let lessonsKept = 0;
  let domainsDropped = 0;
  let domainsKept = 0;

  const reconciledLessons: Record<string, number> = {};
  const reconciledDomains: number[] = [];

  // Reconcile lesson completions
  for (const [lessonId, timestamp] of Object.entries(data.lessonCompletions)) {
    const lessonIdNum = parseInt(lessonId, 10);

    if (!isNaN(lessonIdNum) && isValidLessonId(lessonIdNum, curriculum)) {
      reconciledLessons[lessonId] = timestamp;
      lessonsKept++;
    } else {
      lessonsDropped++;
    }
  }

  // Reconcile domain completions
  for (const domainId of data.domainsCompleted) {
    if (isValidDomainId(domainId, curriculum)) {
      reconciledDomains.push(domainId);
      domainsKept++;
    } else {
      domainsDropped++;
    }
  }

  return {
    cleaned: {
      lessonCompletions: reconciledLessons,
      domainsCompleted: reconciledDomains,
      currentStreak: data.currentStreak,
      lastStreakCheck: data.lastStreakCheck,
      // Fix counters to match cleaned data after curriculum reconciliation
      totalLessonsCompleted: lessonsKept,
      totalDomainsCompleted: domainsKept,
    },
    lessonsDropped,
    domainsDropped,
    lessonsKept,
    domainsKept,
  };
}

// ============================================================================
// MANAGER CLASSES
// ============================================================================

/**
 * Manages overall progress data with validated mutations.
 *
 * All mutations validate against CurriculumRegistry to prevent
 * corruption from invalid lesson IDs or state inconsistencies.
 * Provides readonly access via getter methods.
 */
export class OverallProgressManager {
  constructor(
    private progress: OverallProgressData,
    private curriculumRegistry: CurriculumRegistry
  ) {}

  /**
   * Returns all data for persistence.
   */
  getProgress(): OverallProgressData {
    return this.progress;
  }

  /**
   * Initialize missing fields with defaults.
   *
   * Used during initialization for new users or after migration
   * when some fields may be missing.
   */
  setDefaultsIfBlank(): void {
    if (!this.progress.lessonCompletions) {
      this.progress.lessonCompletions = {};
    }

    if (!this.progress.domainsCompleted) {
      this.progress.domainsCompleted = [];
    }

    if (this.progress.currentStreak === undefined) {
      this.progress.currentStreak = 0;
    }

    if (!this.progress.lastStreakCheck) {
      this.progress.lastStreakCheck = Math.floor(Date.now() / 1000);
    }

    if (this.progress.totalLessonsCompleted === undefined) {
      this.progress.totalLessonsCompleted = Object.keys(this.progress.lessonCompletions).length;
    }

    if (this.progress.totalDomainsCompleted === undefined) {
      this.progress.totalDomainsCompleted = this.progress.domainsCompleted.length;
    }
  }

  /**
   * Define trump strategies for offline/online conflict resolution.
   *
   * Used to reconcile inconsistent sets of progress data when
   * merging offline and online changes.
   */
  getAllTrumpStrategies(): Record<
    keyof OverallProgressData,
    TrumpStrategy<any>
  > {
    return {
      lessonCompletions: "MAX", // Most recent completion timestamp wins
      domainsCompleted: "UNION",
      currentStreak: "LATEST_TIMESTAMP", // Use lastStreakCheck to determine freshness
      lastStreakCheck: "MAX",
      totalLessonsCompleted: "MAX", // Higher count indicates more progress
      totalDomainsCompleted: "MAX", // Higher count indicates more progress
    };
  }

  /**
   * Mark a lesson as complete with current timestamp.
   *
   * Validates lesson exists in curriculum using shared helper.
   * Updates timestamp even if already completed (tracks most recent completion).
   * Increments counter only on first completion.
   *
   * @param lessonId - Lesson to mark complete
   * @throws Error if lesson ID not in curriculum
   */
  markLessonComplete(lessonId: number): void {
    if (!isValidLessonId(lessonId, this.curriculumRegistry)) {
      throw new Error(`Invalid lesson ID: ${lessonId}`);
    }

    const lessonKey = lessonId.toString();
    const timestamp = Math.floor(Date.now() / 1000);

    // Increment counter only if this is a new completion
    if (this.progress.lessonCompletions[lessonKey] === undefined) {
      this.progress.totalLessonsCompleted++;
    }

    this.progress.lessonCompletions[lessonKey] = timestamp;

    // TODO: Check for domain completion
  }

  /**
   * Mark a lesson as incomplete (remove completion record).
   *
   * Validates lesson exists in curriculum using shared helper.
   * Safe to call even if lesson was not completed.
   * Decrements counter only if lesson was actually completed.
   *
   * @param lessonId - Lesson to mark incomplete
   * @throws Error if lesson ID not in curriculum
   */
  markLessonIncomplete(lessonId: number): void {
    if (!isValidLessonId(lessonId, this.curriculumRegistry)) {
      throw new Error(`Invalid lesson ID: ${lessonId}`);
    }

    const lessonKey = lessonId.toString();
    
    // Decrement counter only if lesson was actually completed
    if (this.progress.lessonCompletions[lessonKey] !== undefined) {
      this.progress.totalLessonsCompleted--;
    }
    
    delete this.progress.lessonCompletions[lessonKey];
  }

  /**
   * Update streak to a specific value.
   *
   * Called by motivation component after validating weekly goals.
   *
   * @param newStreak - New streak value
   */
  updateStreak(newStreak: number): void {
    this.progress.currentStreak = newStreak;
    this.progress.lastStreakCheck = Math.floor(Date.now() / 1000);
  }

  /**
   * Reset streak to zero.
   *
   * Called when weekly goal not met.
   */
  resetStreak(): void {
    this.progress.currentStreak = 0;
    this.progress.lastStreakCheck = Math.floor(Date.now() / 1000);
  }

  /**
   * Increment streak by one.
   *
   * Called when previous week's goal was met.
   */
  incrementStreak(): void {
    this.progress.currentStreak += 1;
    this.progress.lastStreakCheck = Math.floor(Date.now() / 1000);
  }
}

/**
 * Schema for messages updating overall progress from components to core.
 *
 * Follows format of manager method name followed by argument(s).
 */
export const OverallProgressMessageSchema = z.object({
  method: z.enum([
    "markLessonComplete",
    "markLessonIncomplete",
    "updateStreak",
    "resetStreak",
    "incrementStreak",
  ]),
  args: z.array(z.any()),
});

export type OverallProgressMessage = z.infer<
  typeof OverallProgressMessageSchema
>;

/**
 * Validates and queues overall progress messages for Main Core processing.
 *
 * Components use this to queue progress updates. Main Core polls via
 * getMessages() to apply validated changes to actual progress data.
 */
export class OverallProgressMessageQueueManager {
  private messageQueue: OverallProgressMessage[] = [];

  constructor(private curriculumRegistry: CurriculumRegistry) {}

  /**
   * Queue a lesson completion message.
   *
   * Validates lesson ID using shared helper before queueing.
   *
   * @param lessonId - Lesson to mark complete
   * @throws Error if lesson ID invalid or not in curriculum
   */
  queueLessonComplete(lessonId: number): void {
    const message: OverallProgressMessage = {
      method: "markLessonComplete",
      args: [lessonId],
    };

    if (message.args.length !== 1) {
      throw new Error("markLessonComplete requires exactly 1 argument");
    }

    const parseResult = ImmutableId.safeParse(lessonId);
    if (!parseResult.success) {
      throw new Error(
        `lessonId must be a valid immutable ID, got: ${lessonId}`
      );
    }

    if (!isValidLessonId(lessonId, this.curriculumRegistry)) {
      throw new Error(
        `Invalid lesson ID: ${lessonId} does not exist in curriculum`
      );
    }

    this.messageQueue.push(message);
  }

  /**
   * Queue a lesson incomplete message.
   *
   * Validates lesson ID using shared helper before queueing.
   *
   * @param lessonId - Lesson to mark incomplete
   * @throws Error if lesson ID invalid or not in curriculum
   */
  queueLessonIncomplete(lessonId: number): void {
    const message: OverallProgressMessage = {
      method: "markLessonIncomplete",
      args: [lessonId],
    };

    if (message.args.length !== 1) {
      throw new Error("markLessonIncomplete requires exactly 1 argument");
    }

    const parseResult = ImmutableId.safeParse(lessonId);
    if (!parseResult.success) {
      throw new Error(
        `lessonId must be a valid immutable ID, got: ${lessonId}`
      );
    }

    if (!isValidLessonId(lessonId, this.curriculumRegistry)) {
      throw new Error(
        `Invalid lesson ID: ${lessonId} does not exist in curriculum`
      );
    }

    this.messageQueue.push(message);
  }

  /**
   * Queue a streak update message.
   *
   * @param newStreak - New streak value
   * @throws Error if newStreak is not a non-negative number
   */
  queueUpdateStreak(newStreak: number): void {
    const message: OverallProgressMessage = {
      method: "updateStreak",
      args: [newStreak],
    };

    if (typeof newStreak !== "number" || newStreak < 0) {
      throw new Error("newStreak must be a non-negative number");
    }

    this.messageQueue.push(message);
  }

  /**
   * Queue a streak reset message.
   */
  queueResetStreak(): void {
    const message: OverallProgressMessage = {
      method: "resetStreak",
      args: [],
    };
    this.messageQueue.push(message);
  }

  /**
   * Queue a streak increment message.
   */
  queueIncrementStreak(): void {
    const message: OverallProgressMessage = {
      method: "incrementStreak",
      args: [],
    };
    this.messageQueue.push(message);
  }

  /**
   * Retrieve and clear all queued messages.
   *
   * Core polls this method to get pending progress updates.
   * Messages are removed from queue after retrieval.
   *
   * @returns Array of queued messages
   */
  getMessages(): OverallProgressMessage[] {
    const messages = [...this.messageQueue];
    this.messageQueue = [];
    return messages;
  }
}