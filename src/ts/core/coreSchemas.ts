// coreSchemas.ts - Core application schemas and types
// Just a stub. Does not accurately represent what the file needs to be.

import { z } from "zod";
import { curriculumData } from "../registry/mera-registry.js";

export type TrumpStrategy<T> =
  | "NOR"
  | "OR"
  | "MAX"
  | "UNION"
  | "LATEST_TIMESTAMP"
  | "PREFER_NON_EMPTY"
  | "ASSERT_EQUAL";

export const ImmutableId = z.number().int().min(1).max(999999999999);

/**
 * Overall progress data schema
 */

export const OverallProgressDataSchema = z.object({
  lessonCompletions: z.record(z.string(), z.boolean()), // Lesson Immutable ID, Boolean
  domainsCompleted: z.array(ImmutableId), // Domain Immutable IDs
  lessonsCompletedThisWeek: z.number().min(0).max(1000), // Max for overflow prevention
  currentStreak: z.number().min(0).max(1000), // Weeks meeting personal goal
  weekStartTimestamp: z.number().int().min(0), // Unix timestamp in seconds
});

export type OverallProgressData = z.infer<typeof OverallProgressDataSchema>;

export class OverallProgressManager {
  constructor(
    private progress: OverallProgressData,
    private curriculumData: curriculumData
  ) {}

  getProgress(): OverallProgressData {
    return this.progress;
  }

  setDefaultIfBlank(settingsManager: SettingsManager): void {
    const weekStartDay = settingsManager.getWeekStartDay();
    const weekStartTime = settingsManager.getStartTime();

    // Lesson completions - leave existing, set empty object for missing
    if (!this.progress.lessonCompletions) {
      this.progress.lessonCompletions = {};
    }

    // Domain completions - empty array if missing
    if (!this.progress.domainsCompleted) {
      this.progress.domainsCompleted = [];
    }

    // Weekly lessons - 0 if missing
    if (this.progress.lessonsCompletedThisWeek === undefined) {
      this.progress.lessonsCompletedThisWeek = 0;
    }

    // Current streak - 0 if missing
    if (this.progress.currentStreak === undefined) {
      this.progress.currentStreak = 0;
    }

    // Week start - based on user's preference
    if (!this.progress.weekStartTimestamp) {
      this.progress.weekStartTimestamp = this.getLastWeekStart(
        weekStartDay,
        weekStartTime
      );
    }
  }

  getAllTrumpStrategies(): Record<
    keyof OverallProgressData,
    TrumpStrategy<any>
  > {
    return {
      lessonCompletions: "OR",
      domainsCompleted: "UNION",
      lessonsCompletedThisWeek: "MAX",
      currentStreak: "LATEST_TIMESTAMP",
      weekStartTimestamp: "LATEST_TIMESTAMP",
    };
  }

  markLessonComplete(lessonId: number): void {
    if (!this.curriculumData.hasLesson(lessonId)) {
      throw new Error(`Invalid lesson ID: ${lessonId}`);
    }

    const lessonKey = lessonId.toString();
    if (!this.progress.lessonCompletions[lessonKey]) {
      this.progress.lessonCompletions[lessonKey] = true;
      this.incrementWeeklyLessons();
      this.updateDomainProgress(lessonId);
    }
  }

  markLessonIncomplete(lessonId: number): void {
    if (!this.curriculumData.hasLesson(lessonId)) {
      throw new Error(`Invalid lesson ID: ${lessonId}`);
    }

    const lessonKey = lessonId.toString();
    if (this.progress.lessonCompletions[lessonKey]) {
      this.progress.lessonCompletions[lessonKey] = false;
    }
  }

  // Time based update called by motivation tracker component
  resetWeek(settingsManager: SettingsManager): void {
    const weekStartDay = settingsManager.getWeekStartDay();
    const weekStartTime = settingsManager.getStartTime();
    this.progress.lessonsCompletedThisWeek = 0;
    this.progress.weekStartTimestamp =
      this.getLastWeekStart(weekStartDay, weekStartTime);
  }

  // Called by motivation tracker component when week has passed an goal not met.
  resetStreak(): void {
    this.progress.currentStreak = 0;
  }

  // Called by motivation tracker component when goal is met.
  incrementStreak(): void {
    this.progress.currentStreak += 1;
  }

  // Called by settings component when week start day setting is changed
  updateWeekStartTimestamp(weekStartDay: string, weekStartTime: string): void {
    this.progress.weekStartTimestamp =
      this.getLastWeekStart(weekStartDay, weekStartTime);
  }
  private incrementWeeklyLessons(): void {
    this.progress.lessonsCompletedThisWeek += 1;
  }

  private getLastWeekStart(
    weekStartDay: string,
    weekStartTime: string
  ): number {
    const now = new Date();
    const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday

    const dayMap: Record<string, number> = {
      sunday: 0,
      monday: 1,
      tuesday: 2,
      wednesday: 3,
      thursday: 4,
      friday: 5,
      saturday: 6,
    };

    const targetDay = dayMap[weekStartDay.toLowerCase()] ?? 0;

    let daysBack = currentDay - targetDay;
    if (daysBack < 0) {
      daysBack += 7;
    }

    const weekStart = new Date(now);
    weekStart.setUTCDate(now.getUTCDate() - daysBack);

    // Parse and set the time (weekStartTime format: "HH:MM")
    const [hours, minutes] = weekStartTime.split(":").map(Number);
    weekStart.setUTCHours(hours, minutes, 0, 0);

    // If the calculated time is in the future, go back one more week
    if (weekStart > now) {
      weekStart.setUTCDate(weekStart.getUTCDate() - 7);
    }

    // Return Unix timestamp
    return Math.floor(weekStart.getTime() / 1000);
  }
}
export const OverallProgressMessageSchema = z.object({
  method: z.enum([
    "markLessonComplete",
    "markLessonIncomplete",
    "resetWeek",
    "resetStreak",
    "incrementStreak",
    "updateWeekStartTimestamp",
  ]),
  args: z.array(z.any()), // We'll validate these per method
});

export type OverallProgressMessage = z.infer<
  typeof OverallProgressMessageSchema
>;

export class OverallProgressMessageManager {
  constructor(
    private progressManager: OverallProgressManager,
    private curriculumRegistry: curriculumData
  ) {}

  validateMessage(message: OverallProgressMessage): void {
    // Schema validation happens at parse time, now validate arguments
    switch (message.method) {
      case "markLessonComplete":
      case "markLessonIncomplete":
        // Check there is a single argument
        if (message.args.length !== 1) {
          throw new Error(
            `${message.method} requires exactly 1 argument (lessonId)`
          );
        }
        // Checks the argument is an integer in the range of immutable IDs
        const parseResult = ImmutableId.safeParse(message.args[0]);
        if (!parseResult.success) {
          throw new Error(
            `${message.method} lessonId must be a valid immutable ID, got: ${message.args[0]}`
          );
        }

        // Checks that this lesson actually exist.
        const lessonId = message.args[0];
        if (!this.curriculumRegistry.hasLesson(lessonId)) {
          throw new Error(
            `Invalid lesson ID: ${lessonId} does not exist in curriculum`
          );
        }
        break;

      case "resetWeek":
      case "resetStreak":
      case "incrementStreak":
        if (message.args.length !== 0) {
          throw new Error(`${message.method} requires no arguments`);
        }
        break;

      // Makes sure start date is a valid date
      case "updateWeekStartTimestamp":
        if (message.args.length !== 2) {
          throw new Error(
            `${message.method} requires exactly 1 argument (weekStartDate)`
          );
        }
        const dateString = message.args[0];
        if (typeof dateString !== "string") {
          throw new Error(
            `${
              message.method
            } weekStartDate must be a string, got: ${typeof dateString}`
          );
        }
        // Validate ISO datetime format
        if (
          !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(dateString)
        ) {
          throw new Error(
            `${message.method} weekStartDate must be valid ISO datetime format, got: "${dateString}"`
          );
        }
        // Validate it's actually a valid date
        const date = new Date(dateString);
        if (isNaN(date.getTime())) {
          throw new Error(
            `${message.method} weekStartDate must be a valid date, got: "${dateString}"`
          );
        }
        break;
      default:
        throw new Error(`Unknown method: ${message.method}`);
    }
  }

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
      case "resetWeek":
        this.progressManager.resetWeek(message.args[0]);
        break;
      case "resetStreak":
        this.progressManager.resetStreak();
        break;
      case "updateWeekStartTimestamp":
        this.progressManager.updateWeekStartTimestamp(message.args[0], message.args[1]);
        break;
    }
  }
}

/**
 * Navigation state schema
 */
export const NavigationStateSchema = z.object({
  currentPage: z.number().min(0),
  totalPages: z.number().min(1),
  currentLesson: z.string(),
  availableRoutes: z.array(z.string()),
  history: z.array(z.string()),
  // Add other navigation fields as needed
});

export type NavigationState = z.infer<typeof NavigationStateSchema>;

/**
 * Settings data schema
 */
export const SettingsDataSchema = z.object({
  theme: z.enum(["light", "dark", "auto"]).default("auto"),
  fontSize: z.enum(["small", "medium", "large"]).default("medium"),
  reducedMotion: z.boolean().default(false),
  highContrast: z.boolean().default(false),
  // Add other settings as needed
});

export type SettingsData = z.infer<typeof SettingsDataSchema>;

/**
 * Combined component progress schema - counterpart to lesson YAML
 * This gets stored in Solid Pod
 */
export const CombinedComponentProgressSchema = z.object({
  lessonId: z.string(),
  lastUpdated: z.string().datetime(),
  components: z.record(z.string(), z.any()), // componentId -> progress data
  overallProgress: OverallProgressDataSchema,
});

export type CombinedComponentProgress = z.infer<
  typeof CombinedComponentProgressSchema
>;

/**
 * Message types for core communication
 */

export interface ComponentProgressMessage {
  type: "component_progress";
  componentId: number;
  method: string;
  args: any[];
}

export interface NavigationMessage {
  type: "navigation";
  data: any;
}

export interface SettingMessage {
  type: "setting";
  data: any;
}
