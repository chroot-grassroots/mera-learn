/**
 * @fileoverview Overall progress tracking with per-field timestamps for conflict resolution
 * @module core/overallProgressSchema
 *
 * Manages cross-lesson achievements including lesson/domain completions and learning streaks.
 * Uses CompletionData structure with timeCompleted and lastUpdated for granular merge control.
 *
 * CLONING STRATEGY:
 * - Constructor: Clones input data to prevent external mutations
 * - getProgress(): Returns clone to prevent external access to internal state
 * - All mutations happen only on internal cloned copy
 */

import { z } from "zod";
import { ImmutableId } from "./coreTypes.js";
import { CurriculumRegistry } from "../registry/mera-registry.js";

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Validate lesson ID exists in curriculum.
 *
 * Shared helper used by both manager and queue manager for consistent validation.
 */
function isValidLessonId(
  lessonId: number,
  registry: CurriculumRegistry
): boolean {
  return registry.hasLesson(lessonId);
}

/**
 * Validate domain ID exists in curriculum.
 *
 * Shared helper used by both manager and queue manager for consistent validation.
 */
function isValidDomainId(
  domainId: number,
  registry: CurriculumRegistry
): boolean {
  return registry.hasDomain(domainId);
}

// ============================================================================
// SCHEMAS
// ============================================================================

/**
 * Completion data structure for lessons and domains.
 *
 * timeCompleted: Unix timestamp when first completed (null if incomplete)
 * lastUpdated: Unix timestamp of most recent status change
 *
 * This enables tracking:
 * - When something was completed
 * - When status last changed (for merge conflict resolution)
 */
export const CompletionDataSchema = z.object({
  timeCompleted: z.number().nullable(),
  lastUpdated: z.number(),
});

export type CompletionData = z.infer<typeof CompletionDataSchema>;

/**
 * Overall progress data schema with per-field timestamps.
 *
 * Structure:
 * - lessonCompletions: Map of lessonId -> CompletionData
 * - domainCompletions: Map of domainId -> CompletionData
 * - currentStreak: Number of consecutive weeks meeting goals
 * - lastStreakCheck: When streak was last validated
 * - totalLessonsCompleted: Corruption detection counter (must equal count of non-null timeCompleted)
 * - totalDomainsCompleted: Corruption detection counter (must equal count of non-null timeCompleted)
 *
 * NOTE: No .default() on counters - progressIntegrity.ts handles defaulting explicitly
 * with proper metrics tracking.
 */
export const OverallProgressDataSchema = z.object({
  lessonCompletions: z.record(z.string(), CompletionDataSchema),
  domainCompletions: z.record(z.string(), CompletionDataSchema),
  currentStreak: z.number().min(0).max(1000),
  lastStreakCheck: z.number().int().min(0),
  totalLessonsCompleted: z.number().int().min(0).max(1000),
  totalDomainsCompleted: z.number().int().min(0).max(1000),
});

export type OverallProgressData = z.infer<typeof OverallProgressDataSchema>;

// ============================================================================
// DEFAULT VALUES
// ============================================================================

/**
 * Get default overall progress for new users or recovery.
 *
 * Used by:
 * - progressIntegrity.ts for data recovery
 * - New user initialization
 *
 * Returns progress with empty completions and zero counters/streak.
 *
 * @returns Complete OverallProgressData with defaults
 */
export function getDefaultOverallProgress(): OverallProgressData {
  return {
    lessonCompletions: {},
    domainCompletions: {},
    currentStreak: 0,
    lastStreakCheck: 0,
    totalLessonsCompleted: 0,
    totalDomainsCompleted: 0,
  };
}

// ============================================================================
// MANAGER
// ============================================================================

/**
 * Manages overall learning progress with data cloning for isolation.
 *
 * Responsibilities:
 * - Track lesson and domain completions with timestamps
 * - Manage weekly learning streaks
 * - Validate all mutations against curriculum registry
 * - Provide cloned data for persistence (no reference leaks)
 *
 * All mutations validate against CurriculumRegistry to prevent
 * corruption from invalid lesson IDs or state inconsistencies.
 */

/**
 * Readonly interface for components.
 * Components can read overall progress but cannot mutate via this interface.
 */
export interface IReadonlyOverallProgressManager {
  getProgress(): Readonly<OverallProgressData>;
}

export class OverallProgressManager implements IReadonlyOverallProgressManager {
  private progress: OverallProgressData;

  constructor(
    initialProgress: OverallProgressData,
    private curriculumRegistry: CurriculumRegistry
  ) {
    // Clone input data - manager owns its own copy
    this.progress = structuredClone(initialProgress);
  }

  /**
   * Returns cloned progress data for persistence.
   *
   * Clone ensures external code cannot mutate manager's internal state.
   * Core calls this during save to build the bundle.
   */
  getProgress(): OverallProgressData {
    return structuredClone(this.progress);
  }

  /**
   * Mark a lesson as complete with current timestamp.
   *
   * Validates lesson exists in curriculum using shared helper.
   * Updates lastUpdated even if already completed (tracks most recent interaction).
   * Sets timeCompleted only on first completion, increments counter accordingly.
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
    if (!current || current.timeCompleted === null) {
      this.progress.lessonCompletions[lessonKey] = {
        timeCompleted: timestamp,
        lastUpdated: timestamp,
      };
      this.progress.totalLessonsCompleted++;
    } else {
      // Already completed, create new object with updated lastUpdated
      this.progress.lessonCompletions[lessonKey] = {
        timeCompleted: current.timeCompleted,
        lastUpdated: timestamp,
      };
    }

    // Check for domain completion
    // Iterate through all domains to find which domain(s) contain this lesson
    for (const domainId of this.curriculumRegistry.getAllDomainIds()) {
      const lessonIdsInDomain =
        this.curriculumRegistry.getLessonsInDomain(domainId);

      if (lessonIdsInDomain && lessonIdsInDomain.includes(lessonId)) {
        // Check if ALL lessons in this domain are now complete
        const allComplete = lessonIdsInDomain.every((lid) => {
          const completion = this.progress.lessonCompletions[lid.toString()];
          return completion && completion.timeCompleted !== null;
        });

        if (allComplete) {
          this.markDomainComplete(domainId);
        }
      }
    }
  }

  /**
   * Mark a lesson as incomplete (set timeCompleted to null).
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

    if (current && current.timeCompleted !== null) {
      // Was completed, now mark incomplete
      this.progress.lessonCompletions[lessonKey] = {
        timeCompleted: null,
        lastUpdated: timestamp,
      };
      this.progress.totalLessonsCompleted--;
    } else if (current) {
      // Already incomplete, create new object with updated timestamp
      this.progress.lessonCompletions[lessonKey] = {
        timeCompleted: null,
        lastUpdated: timestamp,
      };
    } else {
      // Doesn't exist yet, create as incomplete
      this.progress.lessonCompletions[lessonKey] = {
        timeCompleted: null,
        lastUpdated: timestamp,
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
    if (!current || current.timeCompleted === null) {
      this.progress.domainCompletions[domainKey] = {
        timeCompleted: timestamp,
        lastUpdated: timestamp,
      };
      this.progress.totalDomainsCompleted++;
    } else {
      // Already completed, create new object with updated lastUpdated
      this.progress.domainCompletions[domainKey] = {
        timeCompleted: current.timeCompleted,
        lastUpdated: timestamp,
      };
    }
  }

  /**
   * Mark a domain as incomplete (set timeCompleted to null).
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

    if (current && current.timeCompleted !== null) {
      // Was completed, now mark incomplete
      this.progress.domainCompletions[domainKey] = {
        timeCompleted: null,
        lastUpdated: timestamp,
      };
      this.progress.totalDomainsCompleted--;
    } else if (current) {
      // Already incomplete, create new object with updated timestamp
      this.progress.domainCompletions[domainKey] = {
        timeCompleted: null,
        lastUpdated: timestamp,
      };
    } else {
      // Doesn't exist yet, create as incomplete
      this.progress.domainCompletions[domainKey] = {
        timeCompleted: null,
        lastUpdated: timestamp,
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

// ============================================================================
// MESSAGE SCHEMA
// ============================================================================

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

// ============================================================================
// MESSAGE QUEUE MANAGER
// ============================================================================

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

// ============================================================================
// MESSAGE HANDLER
// ============================================================================

/**
 * Validates and executes overall progress messages in Main Core.
 *
 * Routes validated messages to appropriate OverallProgressManager methods.
 */
export class OverallProgressMessageHandler {
  constructor(
    private progressManager: OverallProgressManager,
    private curriculumRegistry: CurriculumRegistry
  ) {}

  /**
   * Validate message structure and arguments.
   *
   * Checks method name, argument count, and value types.
   * Does NOT validate entity IDs - that's done by manager methods.
   *
   * @param message - Message to validate
   * @throws Error if message structure invalid
   */
  validateMessage(message: OverallProgressMessage): void {
    const zodResult = OverallProgressMessageSchema.safeParse(message);
    if (!zodResult.success) {
      throw new Error(
        `Invalid overall progress message: ${zodResult.error.message}`
      );
    }

    // Validate argument counts per method
    const argCounts: Record<string, number> = {
      markLessonComplete: 1,
      markLessonIncomplete: 1,
      markDomainComplete: 1,
      markDomainIncomplete: 1,
      updateStreak: 1,
      resetStreak: 0,
      incrementStreak: 0,
    };

    const expectedCount = argCounts[message.method];
    if (message.args.length !== expectedCount) {
      throw new Error(
        `${message.method} requires ${expectedCount} argument(s), got ${message.args.length}`
      );
    }
  }

  /**
   * Handle validated message by routing to manager.
   *
   * Routes validated message to appropriate OverallProgressManager method.
   */
  handleMessage(message: OverallProgressMessage): void {
    this.validateMessage(message);

    // Route to progress manager
    switch (message.method) {
      case "markLessonComplete":
        this.progressManager.markLessonComplete(message.args[0]);
        break;
      case "markLessonIncomplete":
        this.progressManager.markLessonIncomplete(message.args[0]);
        break;
      case "markDomainComplete":
        this.progressManager.markDomainComplete(message.args[0]);
        break;
      case "markDomainIncomplete":
        this.progressManager.markDomainIncomplete(message.args[0]);
        break;
      case "updateStreak":
        this.progressManager.updateStreak(message.args[0]);
        break;
      case "resetStreak":
        this.progressManager.resetStreak();
        break;
      case "incrementStreak":
        this.progressManager.incrementStreak();
        break;
    }
  }
}
