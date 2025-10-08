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
 */

export const OverallProgressDataSchema = z.object({
  lessonCompletions: z.record(z.string(), z.number()), // lessonId -> Unix timestamp
  domainsCompleted: z.array(ImmutableId), // Domain Immutable IDs
  currentStreak: z.number().min(0).max(1000), // Completed weeks (not including current)
  lastStreakCheck: z.number().int().min(0), // Unix timestamp of last validation
});

export type OverallProgressData = z.infer<typeof OverallProgressDataSchema>;

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

  // Returns all data for saver
  getProgress(): OverallProgressData {
    return this.progress;
  }

  // Default used in initialization for new or incomplete (migrated) data.
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
  }

  // Used to reconcile inconsistent sets of offline progress data
  getAllTrumpStrategies(): Record<
    keyof OverallProgressData,
    TrumpStrategy<any>
  > {
    return {
      lessonCompletions: "MAX", // Most recent completion timestamp wins
      domainsCompleted: "UNION",
      currentStreak: "LATEST_TIMESTAMP", // Use lastStreakCheck to determine freshness
      lastStreakCheck: "MAX",
    };
  }

  // Called on lesson completion
  markLessonComplete(lessonId: number): void {
    if (!this.curriculumRegistry.hasLesson(lessonId)) {
      throw new Error(`Invalid lesson ID: ${lessonId}`);
    }

    const lessonKey = lessonId.toString();
    const timestamp = Math.floor(Date.now() / 1000);

    // Always update to current timestamp (even if already completed)
    this.progress.lessonCompletions[lessonKey] = timestamp;

    // TODO: Check for domain completion
  }

  markLessonIncomplete(lessonId: number): void {
    if (!this.curriculumRegistry.hasLesson(lessonId)) {
      throw new Error(`Invalid lesson ID: ${lessonId}`);
    }

    const lessonKey = lessonId.toString();
    delete this.progress.lessonCompletions[lessonKey];
  }

  // Called by motivation component after validating previous week
  updateStreak(newStreak: number): void {
    this.progress.currentStreak = newStreak;
    this.progress.lastStreakCheck = Math.floor(Date.now() / 1000);
  }

  // Reset streak (called when goal not met)
  resetStreak(): void {
    this.progress.currentStreak = 0;
    this.progress.lastStreakCheck = Math.floor(Date.now() / 1000);
  }

  // Increment streak (called when previous week goal met)
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

    // Validate lesson exists in curriculum
    if (!this.curriculumRegistry.hasLesson(lessonId)) {
      throw new Error(
        `Invalid lesson ID: ${lessonId} does not exist in curriculum`
      );
    }

    this.messageQueue.push(message);
  }

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

    // Validate lesson exists in curriculum
    if (!this.curriculumRegistry.hasLesson(lessonId)) {
      throw new Error(
        `Invalid lesson ID: ${lessonId} does not exist in curriculum`
      );
    }

    this.messageQueue.push(message);
  }

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

  queueResetStreak(): void {
    const message: OverallProgressMessage = {
      method: "resetStreak",
      args: [],
    };
    this.messageQueue.push(message);
  }

  queueIncrementStreak(): void {
    const message: OverallProgressMessage = {
      method: "incrementStreak",
      args: [],
    };
    this.messageQueue.push(message);
  }

  // Core method for draining queue
  getMessages(): OverallProgressMessage[] {
    const messages = [...this.messageQueue];
    this.messageQueue = [];
    return messages;
  }
}
