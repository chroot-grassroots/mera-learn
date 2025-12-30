/**
 * @fileoverview User settings schemas and management with per-field timestamps
 * @module core/settingsSchema
 *
 * Manages user preferences for learning pace, accessibility, privacy, and appearance
 * with Solid Pod persistence and per-field lastUpdated timestamps for conflict resolution.
 * 
 * REFACTORED: Each setting now has an associated lastUpdated timestamp to enable
 * granular merge conflict resolution during offline/online sync.
 *
 * CLONING STRATEGY:
 * - Constructor: Clones input data to prevent external mutations
 * - getSettings(): Returns clone to prevent external access to internal state
 * - All mutations happen only on internal cloned copy
 *
 * Components cannot mutate settings directly. They queue validated messages
 * that Main Core processes, preventing invalid state from buggy components.
 */

import { z } from "zod";
import { TrumpStrategy } from "./coreTypes";

// ============================================================================
// CORE SCHEMAS
// ============================================================================

/**
 * Settings data schema with per-field timestamps
 *
 * Each setting field is now a tuple: [value, lastUpdated]
 * This enables per-field conflict resolution during offline sync:
 * - If user changes theme offline and learningPace online, both changes preserved
 * - Most recent timestamp wins per field
 * 
 * Structure: Each field is [value, timestamp] where timestamp is Unix seconds
 */
export const SettingsDataSchema = z.object({
  // Week timing for streaks: [value, lastUpdated]
  weekStartDay: z.tuple([
    z.enum([
      "sunday",
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
    ]),
    z.number().int().min(0), // lastUpdated timestamp
  ]).default(["sunday", 0]),
  
  weekStartTimeUTC: z.tuple([
    z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time must be HH:MM in 24-hour format"),
    z.number().int().min(0),
  ]).default(["00:00", 0]),

  // Appearance: [value, lastUpdated]
  theme: z.tuple([
    z.enum(["light", "dark", "auto"]),
    z.number().int().min(0),
  ]).default(["auto", 0]),

  // Learning: [value, lastUpdated]
  learningPace: z.tuple([
    z.enum(["accelerated", "standard", "flexible"]),
    z.number().int().min(0),
  ]).default(["standard", 0]),

  // Privacy/Analytics: [value, lastUpdated]
  optOutDailyPing: z.tuple([
    z.boolean(),
    z.number().int().min(0),
  ]).default([false, 0]),
  
  optOutErrorPing: z.tuple([
    z.boolean(),
    z.number().int().min(0),
  ]).default([false, 0]),

  // Accessibility: [value, lastUpdated]
  fontSize: z.tuple([
    z.enum(["small", "medium", "large"]),
    z.number().int().min(0),
  ]).default(["medium", 0]),
  
  highContrast: z.tuple([
    z.boolean(),
    z.number().int().min(0),
  ]).default([false, 0]),
  
  reducedMotion: z.tuple([
    z.boolean(),
    z.number().int().min(0),
  ]).default([false, 0]),
  
  focusIndicatorStyle: z.tuple([
    z.enum(["default", "enhanced"]),
    z.number().int().min(0),
  ]).default(["default", 0]),
  
  audioEnabled: z.tuple([
    z.boolean(),
    z.number().int().min(0),
  ]).default([true, 0]),
});

export type SettingsData = z.infer<typeof SettingsDataSchema>;

// ============================================================================
// MANAGER CLASS
// ============================================================================

/**
 * Manages settings data with validated mutations and automatic timestamps.
 *
 * All mutations validate against schema and automatically update lastUpdated timestamp.
 * Provides readonly access via getter methods that return just the value (not timestamp).
 * Used directly by Main Core for settings updates.
 */
export class SettingsDataManager {
  private settings: SettingsData;

  constructor(initialSettings: SettingsData) {
    // Clone input data - manager owns its own copy
    this.settings = structuredClone(initialSettings);
  }

  // Readonly getters for all settings (return value only, not timestamp)
  getWeekStartDay(): "sunday" | "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" {
    return this.settings.weekStartDay[0];
  }

  getWeekStartTimeUTC(): string {
    return this.settings.weekStartTimeUTC[0];
  }

  getTheme(): "light" | "dark" | "auto" {
    return this.settings.theme[0];
  }

  getLearningPace(): "accelerated" | "standard" | "flexible" {
    return this.settings.learningPace[0];
  }

  getOptOutDailyPing(): boolean {
    return this.settings.optOutDailyPing[0];
  }

  getOptOutErrorPing(): boolean {
    return this.settings.optOutErrorPing[0];
  }

  getFontSize(): "small" | "medium" | "large" {
    return this.settings.fontSize[0];
  }

  getHighContrast(): boolean {
    return this.settings.highContrast[0];
  }

  getReducedMotion(): boolean {
    return this.settings.reducedMotion[0];
  }

  getFocusIndicatorStyle(): "default" | "enhanced" {
    return this.settings.focusIndicatorStyle[0];
  }

  getAudioEnabled(): boolean {
    return this.settings.audioEnabled[0];
  }

  /**
   * Returns cloned settings data for persistence.
   *
   * Clone ensures external code cannot mutate manager's internal state.
   * Core calls this during save to build the bundle.
   */
  getSettings(): SettingsData {
    return structuredClone(this.settings);
  }

  // Setters construct tuple and validate against schema (ensures schema consistency)
  setWeekStartDay(day: "sunday" | "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday"): void {
    // Construct tuple and validate against schema
    const validated = SettingsDataSchema.shape.weekStartDay.parse([
      day,
      Math.floor(Date.now() / 1000)
    ]);
    this.settings.weekStartDay = validated;
  }

  setWeekStartTimeUTC(time: string): void {
    const validated = SettingsDataSchema.shape.weekStartTimeUTC.parse([
      time,
      Math.floor(Date.now() / 1000)
    ]);
    this.settings.weekStartTimeUTC = validated;
  }

  setTheme(theme: "light" | "dark" | "auto"): void {
    const validated = SettingsDataSchema.shape.theme.parse([
      theme,
      Math.floor(Date.now() / 1000)
    ]);
    this.settings.theme = validated;
  }

  setLearningPace(pace: "accelerated" | "standard" | "flexible"): void {
    const validated = SettingsDataSchema.shape.learningPace.parse([
      pace,
      Math.floor(Date.now() / 1000)
    ]);
    this.settings.learningPace = validated;
  }

  setOptOutDailyPing(optOut: boolean): void {
    const validated = SettingsDataSchema.shape.optOutDailyPing.parse([
      optOut,
      Math.floor(Date.now() / 1000)
    ]);
    this.settings.optOutDailyPing = validated;
  }

  setOptOutErrorPing(optOut: boolean): void {
    const validated = SettingsDataSchema.shape.optOutErrorPing.parse([
      optOut,
      Math.floor(Date.now() / 1000)
    ]);
    this.settings.optOutErrorPing = validated;
  }

  setFontSize(size: "small" | "medium" | "large"): void {
    const validated = SettingsDataSchema.shape.fontSize.parse([
      size,
      Math.floor(Date.now() / 1000)
    ]);
    this.settings.fontSize = validated;
  }

  setHighContrast(enabled: boolean): void {
    const validated = SettingsDataSchema.shape.highContrast.parse([
      enabled,
      Math.floor(Date.now() / 1000)
    ]);
    this.settings.highContrast = validated;
  }

  setReducedMotion(enabled: boolean): void {
    const validated = SettingsDataSchema.shape.reducedMotion.parse([
      enabled,
      Math.floor(Date.now() / 1000)
    ]);
    this.settings.reducedMotion = validated;
  }

  setFocusIndicatorStyle(style: "default" | "enhanced"): void {
    const validated = SettingsDataSchema.shape.focusIndicatorStyle.parse([
      style,
      Math.floor(Date.now() / 1000)
    ]);
    this.settings.focusIndicatorStyle = validated;
  }

  setAudioEnabled(enabled: boolean): void {
    const validated = SettingsDataSchema.shape.audioEnabled.parse([
      enabled,
      Math.floor(Date.now() / 1000)
    ]);
    this.settings.audioEnabled = validated;
  }

  /**
   * Fill in missing settings fields with defaults.
   *
   * Used for:
   * - New users: Initialize all settings on first use
   * - Schema migration: Add new settings fields for existing users
   *
   * Does NOT overwrite existing values - preserves user preferences.
   */
  setDefaultsIfBlank(): void {
    // Parse the entire settings object through the schema to fill in defaults
    this.settings = SettingsDataSchema.parse(this.settings);
  }

  /**
   * Calculate Unix timestamp of last week start based on user's week preferences.
   *
   * Used by streak tracking to determine if user completed learning goals.
   * Accounts for custom week start day and time in UTC.
   */
  getLastWeekStart(): number {
    const now = new Date();
    const currentDay = now.getUTCDay(); // Get UTC day of week (0-6)

    const dayMap: Record<string, number> = {
      sunday: 0,
      monday: 1,
      tuesday: 2,
      wednesday: 3,
      thursday: 4,
      friday: 5,
      saturday: 6,
    };

    const targetDay = dayMap[this.settings.weekStartDay[0].toLowerCase()] ?? 0;

    let daysBack = currentDay - targetDay;
    if (daysBack < 0) {
      daysBack += 7;
    }

    const weekStart = new Date(now);
    weekStart.setUTCDate(now.getUTCDate() - daysBack);

    // Parse and set the time (weekStartTime format: "HH:MM")
    const [hours, minutes] = this.settings.weekStartTimeUTC[0]
      .split(":")
      .map(Number);
    weekStart.setUTCHours(hours, minutes, 0, 0);

    // If the calculated time is in the future, go back one more week
    if (weekStart > now) {
      weekStart.setUTCDate(weekStart.getUTCDate() - 7);
    }

    // Return Unix timestamp
    return Math.floor(weekStart.getTime() / 1000);
  }

}

// ============================================================================
// MESSAGE SCHEMAS
// ============================================================================

/**
 * Schema for messages updating settings from components to core.
 *
 * Follows format of manager method name followed by argument(s).
 */
export const SettingsMessageSchema = z.object({
  method: z.enum([
    "setWeekStartDay",
    "setWeekStartTimeUTC",
    "setTheme",
    "setLearningPace",
    "setOptOutDailyPing",
    "setOptOutErrorPing",
    "setFontSize",
    "setHighContrast",
    "setReducedMotion",
    "setFocusIndicatorStyle",
    "setAudioEnabled",
  ]),
  args: z.array(z.any()), // Validate per-method
});

export type SettingsMessage = z.infer<typeof SettingsMessageSchema>;

/**
 * Validates and handles settings messages from components.
 *
 * Used by Main Core to process queued settings changes.
 * Validates each message type before forwarding to SettingsDataManager.
 */
export class SettingsMessageManager {
  constructor(private settingsManager: SettingsDataManager) {}

  /**
   * Validate message arguments against appropriate schema.
   *
   * Each method has specific validation requirements matching
   * the corresponding SettingsDataManager setter.
   * 
   * Note: We validate against the value type only, not the full tuple,
   * since timestamps are added automatically by the manager.
   */
  validateMessage(message: SettingsMessage): void {
    // Per-method argument validation
    switch (message.method) {
      case "setWeekStartDay":
        if (message.args.length !== 1) {
          throw new Error("setWeekStartDay requires exactly 1 argument");
        }
        // Validate just the value (manager adds timestamp)
        z.enum(["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"])
          .parse(message.args[0]);
        break;
      
      case "setWeekStartTimeUTC":
        if (message.args.length !== 1) {
          throw new Error("setWeekStartTimeUTC requires exactly 1 argument");
        }
        z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).parse(message.args[0]);
        break;
      
      case "setTheme":
        if (message.args.length !== 1) {
          throw new Error("setTheme requires exactly 1 argument");
        }
        z.enum(["light", "dark", "auto"]).parse(message.args[0]);
        break;
      
      case "setLearningPace":
        if (message.args.length !== 1) {
          throw new Error("setLearningPace requires exactly 1 argument");
        }
        z.enum(["accelerated", "standard", "flexible"]).parse(message.args[0]);
        break;
      
      case "setOptOutDailyPing":
        if (message.args.length !== 1) {
          throw new Error("setOptOutDailyPing requires exactly 1 argument");
        }
        z.boolean().parse(message.args[0]);
        break;
      
      case "setOptOutErrorPing":
        if (message.args.length !== 1) {
          throw new Error("setOptOutErrorPing requires exactly 1 argument");
        }
        z.boolean().parse(message.args[0]);
        break;
      
      case "setFontSize":
        if (message.args.length !== 1) {
          throw new Error("setFontSize requires exactly 1 argument");
        }
        z.enum(["small", "medium", "large"]).parse(message.args[0]);
        break;
      
      case "setHighContrast":
        if (message.args.length !== 1) {
          throw new Error("setHighContrast requires exactly 1 argument");
        }
        z.boolean().parse(message.args[0]);
        break;
      
      case "setReducedMotion":
        if (message.args.length !== 1) {
          throw new Error("setReducedMotion requires exactly 1 argument");
        }
        z.boolean().parse(message.args[0]);
        break;
      
      case "setFocusIndicatorStyle":
        if (message.args.length !== 1) {
          throw new Error("setFocusIndicatorStyle requires exactly 1 argument");
        }
        z.enum(["default", "enhanced"]).parse(message.args[0]);
        break;
      
      case "setAudioEnabled":
        if (message.args.length !== 1) {
          throw new Error("setAudioEnabled requires exactly 1 argument");
        }
        z.boolean().parse(message.args[0]);
        break;
    }
  }

  /**
   * Handle validated message.
   *
   * Routes validated message to appropriate SettingsDataManager method.
   */
  handleMessage(message: SettingsMessage): void {
    this.validateMessage(message);
    
    // Route to settings manager
    switch (message.method) {
      case "setWeekStartDay":
        this.settingsManager.setWeekStartDay(message.args[0]);
        break;
      case "setWeekStartTimeUTC":
        this.settingsManager.setWeekStartTimeUTC(message.args[0]);
        break;
      case "setTheme":
        this.settingsManager.setTheme(message.args[0]);
        break;
      case "setLearningPace":
        this.settingsManager.setLearningPace(message.args[0]);
        break;
      case "setOptOutDailyPing":
        this.settingsManager.setOptOutDailyPing(message.args[0]);
        break;
      case "setOptOutErrorPing":
        this.settingsManager.setOptOutErrorPing(message.args[0]);
        break;
      case "setFontSize":
        this.settingsManager.setFontSize(message.args[0]);
        break;
      case "setHighContrast":
        this.settingsManager.setHighContrast(message.args[0]);
        break;
      case "setReducedMotion":
        this.settingsManager.setReducedMotion(message.args[0]);
        break;
      case "setFocusIndicatorStyle":
        this.settingsManager.setFocusIndicatorStyle(message.args[0]);
        break;
      case "setAudioEnabled":
        this.settingsManager.setAudioEnabled(message.args[0]);
        break;
    }
  }
}

/**
 * Validates and queues settings messages for Main Core processing.
 *
 * Components use this to queue settings updates. Main Core polls via
 * getMessages() to apply validated changes to actual settings data.
 *
 * All queue methods validate before queueing to catch errors at component
 * boundary rather than during Main Core processing.
 */
export class SettingsMessageQueueManager {
  private messageQueue: SettingsMessage[] = [];

  constructor() {}

  queueWeekStartDay(day: "sunday" | "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday"): void {
    const message: SettingsMessage = { method: "setWeekStartDay", args: [day] };
    
    // Validate before queueing
    if (message.args.length !== 1) {
      throw new Error("setWeekStartDay requires exactly 1 argument");
    }
    z.enum(["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"])
      .parse(message.args[0]);
    
    this.messageQueue.push(message);
  }

  queueWeekStartTimeUTC(time: string): void {
    const message: SettingsMessage = { method: "setWeekStartTimeUTC", args: [time] };
    
    if (message.args.length !== 1) {
      throw new Error("setWeekStartTimeUTC requires exactly 1 argument");
    }
    z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).parse(message.args[0]);
    
    this.messageQueue.push(message);
  }

  queueTheme(theme: "light" | "dark" | "auto"): void {
    const message: SettingsMessage = { method: "setTheme", args: [theme] };
    
    if (message.args.length !== 1) {
      throw new Error("setTheme requires exactly 1 argument");
    }
    z.enum(["light", "dark", "auto"]).parse(message.args[0]);
    
    this.messageQueue.push(message);
  }

  queueLearningPace(pace: "accelerated" | "standard" | "flexible"): void {
    const message: SettingsMessage = { method: "setLearningPace", args: [pace] };
    
    if (message.args.length !== 1) {
      throw new Error("setLearningPace requires exactly 1 argument");
    }
    z.enum(["accelerated", "standard", "flexible"]).parse(message.args[0]);
    
    this.messageQueue.push(message);
  }

  queueOptOutDailyPing(optOut: boolean): void {
    const message: SettingsMessage = { method: "setOptOutDailyPing", args: [optOut] };
    
    if (message.args.length !== 1) {
      throw new Error("setOptOutDailyPing requires exactly 1 argument");
    }
    z.boolean().parse(message.args[0]);
    
    this.messageQueue.push(message);
  }

  queueOptOutErrorPing(optOut: boolean): void {
    const message: SettingsMessage = { method: "setOptOutErrorPing", args: [optOut] };
    
    if (message.args.length !== 1) {
      throw new Error("setOptOutErrorPing requires exactly 1 argument");
    }
    z.boolean().parse(message.args[0]);
    
    this.messageQueue.push(message);
  }

  queueFontSize(size: "small" | "medium" | "large"): void {
    const message: SettingsMessage = { method: "setFontSize", args: [size] };
    
    if (message.args.length !== 1) {
      throw new Error("setFontSize requires exactly 1 argument");
    }
    z.enum(["small", "medium", "large"]).parse(message.args[0]);
    
    this.messageQueue.push(message);
  }

  queueHighContrast(enabled: boolean): void {
    const message: SettingsMessage = { method: "setHighContrast", args: [enabled] };
    
    if (message.args.length !== 1) {
      throw new Error("setHighContrast requires exactly 1 argument");
    }
    z.boolean().parse(message.args[0]);
    
    this.messageQueue.push(message);
  }

  queueReducedMotion(enabled: boolean): void {
    const message: SettingsMessage = { method: "setReducedMotion", args: [enabled] };
    
    if (message.args.length !== 1) {
      throw new Error("setReducedMotion requires exactly 1 argument");
    }
    z.boolean().parse(message.args[0]);
    
    this.messageQueue.push(message);
  }

  queueFocusIndicatorStyle(style: "default" | "enhanced"): void {
    const message: SettingsMessage = { method: "setFocusIndicatorStyle", args: [style] };
    
    if (message.args.length !== 1) {
      throw new Error("setFocusIndicatorStyle requires exactly 1 argument");
    }
    z.enum(["default", "enhanced"]).parse(message.args[0]);
    
    this.messageQueue.push(message);
  }

  queueAudioEnabled(enabled: boolean): void {
    const message: SettingsMessage = { method: "setAudioEnabled", args: [enabled] };
    
    if (message.args.length !== 1) {
      throw new Error("setAudioEnabled requires exactly 1 argument");
    }
    z.boolean().parse(message.args[0]);
    
    this.messageQueue.push(message);
  }

  /**
   * Retrieve and clear all queued messages.
   *
   * Core polls this method to get pending settings updates.
   * Messages are removed from queue after retrieval.
   *
   * @returns Array of queued messages
   */
  getMessages(): SettingsMessage[] {
    const messages = [...this.messageQueue];
    this.messageQueue = [];
    return messages;
  }
}