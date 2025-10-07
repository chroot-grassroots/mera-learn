// overallProgressSchema.ts

import { z } from "zod";
import { ImmutableId, TrumpStrategy } from "./coreTypes.js";
import { CurriculumRegistry } from "../registry/mera-registry.js";

/**
 * Overall progress data schema 
 */
export const OverallProgressDataSchema = z.object({
  lessonCompletions: z.record(z.string(), z.number()), // lessonId -> Unix timestamp
  domainsCompleted: z.array(ImmutableId), // Domain Immutable IDs
  currentStreak: z.number().min(0).max(1000), // Completed weeks (not including current)
  lastStreakCheck: z.number().int().min(0), // Unix timestamp of last validation
});

export type OverallProgressData = z.infer<typeof OverallProgressDataSchema>;

export class OverallProgressManager {
  constructor(
    private progress: OverallProgressData,
    private curriculumRegistry: CurriculumRegistry
  ) {}

  getProgress(): OverallProgressData {
    return this.progress;
  }

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

  getAllTrumpStrategies(): Record<keyof OverallProgressData, TrumpStrategy<any>> {
    return {
      lessonCompletions: "MAX", // Most recent completion timestamp wins
      domainsCompleted: "UNION",
      currentStreak: "LATEST_TIMESTAMP", // Use lastStreakCheck to determine freshness
      lastStreakCheck: "MAX",
    };
  }

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

export type OverallProgressMessage = z.infer<typeof OverallProgressMessageSchema>;

export class OverallProgressMessageQueueManager {
  private messageQueue: OverallProgressMessage[] = [];

  constructor(private curriculumRegistry: CurriculumRegistry) {}

  queueLessonComplete(lessonId: number): void {
    const message: OverallProgressMessage = { 
      method: "markLessonComplete", 
      args: [lessonId] 
    };
    
    if (message.args.length !== 1) {
      throw new Error("markLessonComplete requires exactly 1 argument");
    }
    
    const parseResult = ImmutableId.safeParse(lessonId);
    if (!parseResult.success) {
      throw new Error(`lessonId must be a valid immutable ID, got: ${lessonId}`);
    }

    // Validate lesson exists in curriculum
    if (!this.curriculumRegistry.hasLesson(lessonId)) {
      throw new Error(`Invalid lesson ID: ${lessonId} does not exist in curriculum`);
    }
    
    this.messageQueue.push(message);
  }

  queueLessonIncomplete(lessonId: number): void {
    const message: OverallProgressMessage = { 
      method: "markLessonIncomplete", 
      args: [lessonId] 
    };
    
    if (message.args.length !== 1) {
      throw new Error("markLessonIncomplete requires exactly 1 argument");
    }
    
    const parseResult = ImmutableId.safeParse(lessonId);
    if (!parseResult.success) {
      throw new Error(`lessonId must be a valid immutable ID, got: ${lessonId}`);
    }

    // Validate lesson exists in curriculum
    if (!this.curriculumRegistry.hasLesson(lessonId)) {
      throw new Error(`Invalid lesson ID: ${lessonId} does not exist in curriculum`);
    }
    
    this.messageQueue.push(message);
  }

  queueUpdateStreak(newStreak: number): void {
    const message: OverallProgressMessage = { 
      method: "updateStreak", 
      args: [newStreak] 
    };
    
    if (typeof newStreak !== "number" || newStreak < 0) {
      throw new Error("newStreak must be a non-negative number");
    }
    
    this.messageQueue.push(message);
  }

  queueResetStreak(): void {
    const message: OverallProgressMessage = { 
      method: "resetStreak", 
      args: [] 
    };
    this.messageQueue.push(message);
  }

  queueIncrementStreak(): void {
    const message: OverallProgressMessage = { 
      method: "incrementStreak", 
      args: [] 
    };
    this.messageQueue.push(message);
  }

  getMessages(): OverallProgressMessage[] {
    const messages = [...this.messageQueue];
    this.messageQueue = [];
    return messages;
  }
}