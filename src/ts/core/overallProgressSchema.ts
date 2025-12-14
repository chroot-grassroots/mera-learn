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

// ============================================================================
// SCHEMAS
// ============================================================================

/**
 * Completion tracking with first completion and last update timestamps.
 * 
 * - firstCompleted: null means never completed, number is Unix timestamp
 * - lastUpdated: tracks most recent modification (completion OR incompletion)
 * 
 * This allows merge logic to:
 * - Preserve incompletion (lastUpdated increases even when marking incomplete)
 * - Track both "when first done" and "most recent change"
 * - Use simple LATEST_TIMESTAMP strategy (newest lastUpdated wins)
 */
export const CompletionDataSchema = z.object({
  firstCompleted: z.number().nullable(),
  lastUpdated: z.number(),
});

export type CompletionData = z.infer<typeof CompletionDataSchema>;

/**
 * Schema for overall curriculum progress data.
 *
 * Tracks lesson/domain completions with timestamps and learning streaks.
 * Validated on load and mutation by OverallProgressManager.
 * 
 * Completion tracking uses CompletionData objects with:
 * - firstCompleted: null for never completed, timestamp for first completion
 * - lastUpdated: timestamp of most recent modification (completion OR incompletion)
 * 
 * Current-count trackers (totalLessonsCompleted, totalDomainsCompleted) mirror
 * the number of non-null firstCompleted entries. They increment on completion
 * and decrement on incompletion, always matching count in valid data. Mismatch
 * indicates backup corruption (incomplete writes).
 */
export const OverallProgressDataSchema = z.object({
  lessonCompletions: z.record(z.string(), CompletionDataSchema), // lessonId -> CompletionData
  domainCompletions: z.record(z.string(), CompletionDataSchema), // domainId -> CompletionData
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
 * OverallProgressManager (runtime mutations).
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

  const reconciledLessons: Record<string, CompletionData> = {};
  const reconciledDomains: Record<string, CompletionData> = {};

  // Reconcile lesson completions
  for (const [lessonId, completionData] of Object.entries(data.lessonCompletions)) {
    const lessonIdNum = parseInt(lessonId, 10);

    if (!isNaN(lessonIdNum) && isValidLessonId(lessonIdNum, curriculum)) {
      reconciledLessons[lessonId] = completionData;
      // Count as kept only if actually completed
      if (completionData.firstCompleted !== null) {
        lessonsKept++;
      }
    } else {
      // Only count as dropped if it was actually completed
      if (completionData.firstCompleted !== null) {
        lessonsDropped++;
      }
    }
  }

  // Reconcile domain completions
  for (const [domainId, completionData] of Object.entries(data.domainCompletions)) {
    const domainIdNum = parseInt(domainId, 10);

    if (!isNaN(domainIdNum) && isValidDomainId(domainIdNum, curriculum)) {
      reconciledDomains[domainId] = completionData;
      // Count as kept only if actually completed
      if (completionData.firstCompleted !== null) {
        domainsKept++;
      }
    } else {
      // Only count as dropped if it was actually completed
      if (completionData.firstCompleted !== null) {
        domainsDropped++;
      }
    }
  }

  return {
    cleaned: {
      lessonCompletions: reconciledLessons,
      domainCompletions: reconciledDomains,
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
   * Define trump strategies for offline/online conflict resolution.
   *
   * With the new CompletionData structure, merge logic is simpler:
   * - lessonCompletions/domainCompletions: Use LATEST_TIMESTAMP on per-item basis
   * - Counters (totalLessonsCompleted, totalDomainsCompleted) are NOT included
   *   because they are derived values recalculated from merged completion data
   *
   * Note: The actual merge implementation in progressMerger.ts is hand-coded
   * and doesn't programmatically use these strategies. These serve as
   * documentation of merge intent.
   */
  getAllTrumpStrategies(): Record<
    keyof OverallProgressData,
    TrumpStrategy<any>
  > {
    // Counters excluded - they're derived values recalculated after merge
    return {
      lessonCompletions: "LATEST_TIMESTAMP", // Per-lesson newest lastUpdated wins
      domainCompletions: "LATEST_TIMESTAMP", // Per-domain newest lastUpdated wins
      currentStreak: "LATEST_TIMESTAMP", // Use lastStreakCheck to determine freshness
      lastStreakCheck: "MAX",
    } as Record<keyof OverallProgressData, TrumpStrategy<any>>;
  }

  /**
   * Mark a lesson as complete with current timestamp.
   *
   * Validates lesson exists in curriculum using shared helper.
   * Updates lastUpdated even if already completed (tracks most recent interaction).
   * Sets firstCompleted only on first completion, increments counter accordingly.
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
    const current = this.progress.lessonCompletions[lessonKey];

    // First completion or re-completion after being marked incomplete
    if (!current || current.firstCompleted === null) {
      this.progress.lessonCompletions[lessonKey] = {
        firstCompleted: timestamp,
        lastUpdated: timestamp
      };
      this.progress.totalLessonsCompleted++;
    } else {
      // Already completed, create new object with updated lastUpdated
      this.progress.lessonCompletions[lessonKey] = {
        firstCompleted: current.firstCompleted,
        lastUpdated: timestamp
      };
    }

    // TODO: Check for domain completion
  }

  /**
   * Mark a lesson as incomplete (set firstCompleted to null).
   *
   * Validates lesson exists in curriculum using shared helper.
   * Updates lastUpdated to track when incompletion happened.
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
    const timestamp = Math.floor(Date.now() / 1000);
    const current = this.progress.lessonCompletions[lessonKey];

    if (current && current.firstCompleted !== null) {
      // Was completed, now mark incomplete
      this.progress.lessonCompletions[lessonKey] = {
        firstCompleted: null,
        lastUpdated: timestamp
      };
      this.progress.totalLessonsCompleted--;
    } else if (current) {
      // Already incomplete, create new object with updated timestamp
      this.progress.lessonCompletions[lessonKey] = {
        firstCompleted: null,
        lastUpdated: timestamp
      };
    } else {
      // Doesn't exist yet, create as incomplete
      this.progress.lessonCompletions[lessonKey] = {
        firstCompleted: null,
        lastUpdated: timestamp
      };
    }
  }

  /**
   * Mark a domain as complete with current timestamp.
   *
   * Similar logic to markLessonComplete but for domains.
   *
   * @param domainId - Domain to mark complete
   * @throws Error if domain ID not in curriculum
   */
  markDomainComplete(domainId: number): void {
    if (!isValidDomainId(domainId, this.curriculumRegistry)) {
      throw new Error(`Invalid domain ID: ${domainId}`);
    }

    const domainKey = domainId.toString();
    const timestamp = Math.floor(Date.now() / 1000);
    const current = this.progress.domainCompletions[domainKey];

    // First completion or re-completion after being marked incomplete
    if (!current || current.firstCompleted === null) {
      this.progress.domainCompletions[domainKey] = {
        firstCompleted: timestamp,
        lastUpdated: timestamp
      };
      this.progress.totalDomainsCompleted++;
    } else {
      // Already completed, create new object with updated lastUpdated
      this.progress.domainCompletions[domainKey] = {
        firstCompleted: current.firstCompleted,
        lastUpdated: timestamp
      };
    }
  }

  /**
   * Mark a domain as incomplete (set firstCompleted to null).
   *
   * Similar logic to markLessonIncomplete but for domains.
   *
   * @param domainId - Domain to mark incomplete
   * @throws Error if domain ID not in curriculum
   */
  markDomainIncomplete(domainId: number): void {
    if (!isValidDomainId(domainId, this.curriculumRegistry)) {
      throw new Error(`Invalid domain ID: ${domainId}`);
    }

    const domainKey = domainId.toString();
    const timestamp = Math.floor(Date.now() / 1000);
    const current = this.progress.domainCompletions[domainKey];

    if (current && current.firstCompleted !== null) {
      // Was completed, now mark incomplete
      this.progress.domainCompletions[domainKey] = {
        firstCompleted: null,
        lastUpdated: timestamp
      };
      this.progress.totalDomainsCompleted--;
    } else if (current) {
      // Already incomplete, create new object with updated timestamp
      this.progress.domainCompletions[domainKey] = {
        firstCompleted: null,
        lastUpdated: timestamp
      };
    } else {
      // Doesn't exist yet, create as incomplete
      this.progress.domainCompletions[domainKey] = {
        firstCompleted: null,
        lastUpdated: timestamp
      };
    }
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
    "markDomainComplete",
    "markDomainIncomplete",
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
   * Queue a domain completion message.
   *
   * Validates domain ID using shared helper before queueing.
   *
   * @param domainId - Domain to mark complete
   * @throws Error if domain ID invalid or not in curriculum
   */
  queueDomainComplete(domainId: number): void {
    const message: OverallProgressMessage = {
      method: "markDomainComplete",
      args: [domainId],
    };

    if (message.args.length !== 1) {
      throw new Error("markDomainComplete requires exactly 1 argument");
    }

    const parseResult = ImmutableId.safeParse(domainId);
    if (!parseResult.success) {
      throw new Error(
        `domainId must be a valid immutable ID, got: ${domainId}`
      );
    }

    if (!isValidDomainId(domainId, this.curriculumRegistry)) {
      throw new Error(
        `Invalid domain ID: ${domainId} does not exist in curriculum`
      );
    }

    this.messageQueue.push(message);
  }

  /**
   * Queue a domain incomplete message.
   *
   * Validates domain ID using shared helper before queueing.
   *
   * @param domainId - Domain to mark incomplete
   * @throws Error if domain ID invalid or not in curriculum
   */
  queueDomainIncomplete(domainId: number): void {
    const message: OverallProgressMessage = {
      method: "markDomainIncomplete",
      args: [domainId],
    };

    if (message.args.length !== 1) {
      throw new Error("markDomainIncomplete requires exactly 1 argument");
    }

    const parseResult = ImmutableId.safeParse(domainId);
    if (!parseResult.success) {
      throw new Error(
        `domainId must be a valid immutable ID, got: ${domainId}`
      );
    }

    if (!isValidDomainId(domainId, this.curriculumRegistry)) {
      throw new Error(
        `Invalid domain ID: ${domainId} does not exist in curriculum`
      );
    }

    this.messageQueue.push(message);
  }

  /**
   * Queue a streak update message.
   *
   * @param newStreak - New streak value
   * @throws Error if invalid arguments
   */
  queueUpdateStreak(newStreak: number): void {
    const message: OverallProgressMessage = {
      method: "updateStreak",
      args: [newStreak],
    };

    if (message.args.length !== 1) {
      throw new Error("updateStreak requires exactly 1 argument");
    }

    if (typeof newStreak !== "number" || newStreak < 0) {
      throw new Error(`newStreak must be a non-negative number, got: ${newStreak}`);
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
   * Get all queued messages and clear the queue.
   *
   * Called by Main Core polling cycle to process messages.
   *
   * @returns Array of queued messages
   */
  getMessages(): OverallProgressMessage[] {
    const messages = [...this.messageQueue];
    this.messageQueue = [];
    return messages;
  }
}