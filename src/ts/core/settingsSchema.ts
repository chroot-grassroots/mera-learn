/**
 * Settings data schema
 */

import { z } from "zod";
import { TrumpStrategy } from "./coreTypes";

export const SettingsDataSchema = z.object({
  // Week timing for streaks
  weekStartDay: z
    .enum([
      "sunday",
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
    ])
    .default("sunday"),
  weekStartTimeUTC: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time must be HH:MM in 24-hour format")
    .default("00:00"),

  // Appearance
  theme: z.enum(["light", "dark", "auto"]).default("auto"),

  // Learning
  learningPace: z
    .enum(["accelerated", "standard", "flexible"])
    .default("standard"),

  // Privacy/Analytics
  optOutDailyPing: z.boolean().default(false),
  optOutErrorPing: z.boolean().default(false),

  // Accessibility
  fontSize: z.enum(["small", "medium", "large"]).default("medium"),
  highContrast: z.boolean().default(false),
  reducedMotion: z.boolean().default(false),
  focusIndicatorStyle: z.enum(["default", "enhanced"]).default("default"),
  audioEnabled: z.boolean().default(true),
});

export type SettingsData = z.infer<typeof SettingsDataSchema>;

export class SettingsDataManager {
  constructor(private settings: SettingsData) {}

getWeekStartDay(): "sunday" | "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" {
  return this.settings.weekStartDay;
}

getWeekStartTimeUTC(): string {
  return this.settings.weekStartTimeUTC;
}

getTheme(): "light" | "dark" | "auto" {
  return this.settings.theme;
}

getLearningPace(): "accelerated" | "standard" | "flexible" {
  return this.settings.learningPace;
}

getOptOutDailyPing(): boolean {
  return this.settings.optOutDailyPing;
}

getOptOutErrorPing(): boolean {
  return this.settings.optOutErrorPing;
}

getFontSize(): "small" | "medium" | "large" {
  return this.settings.fontSize;
}

getHighContrast(): boolean {
  return this.settings.highContrast;
}

getReducedMotion(): boolean {
  return this.settings.reducedMotion;
}

getFocusIndicatorStyle(): "default" | "enhanced" {
  return this.settings.focusIndicatorStyle;
}

getAudioEnabled(): boolean {
  return this.settings.audioEnabled;
}

getSettings(): SettingsData {
  return this.settings;
}

setWeekStartDay(day: "sunday" | "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday"): void {
  this.settings.weekStartDay = SettingsDataSchema.shape.weekStartDay.parse(day);
}

setWeekStartTimeUTC(time: string): void {
  this.settings.weekStartTimeUTC = SettingsDataSchema.shape.weekStartTimeUTC.parse(time);
}

setTheme(theme: "light" | "dark" | "auto"): void {
  this.settings.theme = SettingsDataSchema.shape.theme.parse(theme);
}

setLearningPace(pace: "accelerated" | "standard" | "flexible"): void {
  this.settings.learningPace = SettingsDataSchema.shape.learningPace.parse(pace);
}

setOptOutDailyPing(optOut: boolean): void {
  this.settings.optOutDailyPing = SettingsDataSchema.shape.optOutDailyPing.parse(optOut);
}

setOptOutErrorPing(optOut: boolean): void {
  this.settings.optOutErrorPing = SettingsDataSchema.shape.optOutErrorPing.parse(optOut);
}

setFontSize(size: "small" | "medium" | "large"): void {
  this.settings.fontSize = SettingsDataSchema.shape.fontSize.parse(size);
}

setHighContrast(enabled: boolean): void {
  this.settings.highContrast = SettingsDataSchema.shape.highContrast.parse(enabled);
}

setReducedMotion(enabled: boolean): void {
  this.settings.reducedMotion = SettingsDataSchema.shape.reducedMotion.parse(enabled);
}

setFocusIndicatorStyle(style: "default" | "enhanced"): void {
  this.settings.focusIndicatorStyle = SettingsDataSchema.shape.focusIndicatorStyle.parse(style);
}

setAudioEnabled(enabled: boolean): void {
  this.settings.audioEnabled = SettingsDataSchema.shape.audioEnabled.parse(enabled);
}

// Utility
setDefaultsIfBlank(): void {
  // Parse the entire settings object through the schema to fill in defaults
  this.settings = SettingsDataSchema.parse(this.settings);
}

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

    const targetDay = dayMap[this.settings.weekStartDay.toLowerCase()] ?? 0;

    let daysBack = currentDay - targetDay;
    if (daysBack < 0) {
      daysBack += 7;
    }

    const weekStart = new Date(now);
    weekStart.setUTCDate(now.getUTCDate() - daysBack);

    // Parse and set the time (weekStartTime format: "HH:MM")
    const [hours, minutes] = this.settings.weekStartTimeUTC
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

  getAllTrumpStrategies(): Record<keyof SettingsData, TrumpStrategy<any>> {
  // All fields use LATEST_TIMESTAMP since settings are atomic user preferences
  return {
    weekStartDay: "LATEST_TIMESTAMP",
    weekStartTimeUTC: "LATEST_TIMESTAMP",
    theme: "LATEST_TIMESTAMP",
    learningPace: "LATEST_TIMESTAMP",
    optOutDailyPing: "LATEST_TIMESTAMP",
    optOutErrorPing: "LATEST_TIMESTAMP",
    fontSize: "LATEST_TIMESTAMP",
    highContrast: "LATEST_TIMESTAMP",
    reducedMotion: "LATEST_TIMESTAMP",
    focusIndicatorStyle: "LATEST_TIMESTAMP",
    audioEnabled: "LATEST_TIMESTAMP",
  };
}

}

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

export class SettingsMessageManager {
  constructor(private settingsManager: SettingsDataManager) {}

  validateMessage(message: SettingsMessage): void {
    // Per-method argument validation
    switch (message.method) {
      case "setWeekStartDay":
        if (message.args.length !== 1) {
          throw new Error("setWeekStartDay requires exactly 1 argument");
        }
        SettingsDataSchema.shape.weekStartDay.parse(message.args[0]);
        break;
      
      case "setWeekStartTimeUTC":
        if (message.args.length !== 1) {
          throw new Error("setWeekStartTimeUTC requires exactly 1 argument");
        }
        SettingsDataSchema.shape.weekStartTimeUTC.parse(message.args[0]);
        break;
      
      case "setTheme":
        if (message.args.length !== 1) {
          throw new Error("setTheme requires exactly 1 argument");
        }
        SettingsDataSchema.shape.theme.parse(message.args[0]);
        break;
      
      case "setLearningPace":
        if (message.args.length !== 1) {
          throw new Error("setLearningPace requires exactly 1 argument");
        }
        SettingsDataSchema.shape.learningPace.parse(message.args[0]);
        break;
      
      case "setOptOutDailyPing":
        if (message.args.length !== 1) {
          throw new Error("setOptOutDailyPing requires exactly 1 argument");
        }
        SettingsDataSchema.shape.optOutDailyPing.parse(message.args[0]);
        break;
      
      case "setOptOutErrorPing":
        if (message.args.length !== 1) {
          throw new Error("setOptOutErrorPing requires exactly 1 argument");
        }
        SettingsDataSchema.shape.optOutErrorPing.parse(message.args[0]);
        break;
      
      case "setFontSize":
        if (message.args.length !== 1) {
          throw new Error("setFontSize requires exactly 1 argument");
        }
        SettingsDataSchema.shape.fontSize.parse(message.args[0]);
        break;
      
      case "setHighContrast":
        if (message.args.length !== 1) {
          throw new Error("setHighContrast requires exactly 1 argument");
        }
        SettingsDataSchema.shape.highContrast.parse(message.args[0]);
        break;
      
      case "setReducedMotion":
        if (message.args.length !== 1) {
          throw new Error("setReducedMotion requires exactly 1 argument");
        }
        SettingsDataSchema.shape.reducedMotion.parse(message.args[0]);
        break;
      
      case "setFocusIndicatorStyle":
        if (message.args.length !== 1) {
          throw new Error("setFocusIndicatorStyle requires exactly 1 argument");
        }
        SettingsDataSchema.shape.focusIndicatorStyle.parse(message.args[0]);
        break;
      
      case "setAudioEnabled":
        if (message.args.length !== 1) {
          throw new Error("setAudioEnabled requires exactly 1 argument");
        }
        SettingsDataSchema.shape.audioEnabled.parse(message.args[0]);
        break;
      
      default:
        throw new Error(`Unknown method: ${message.method}`);
    }
  }

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

export class SettingsMessageQueueManager {
  private messageQueue: SettingsMessage[] = [];

  constructor() {}

  queueWeekStartDay(day: "sunday" | "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday"): void {
    const message: SettingsMessage = { method: "setWeekStartDay", args: [day] };
    
    // Validate before queueing - duplicate validation for component boundary
    if (message.args.length !== 1) {
      throw new Error("setWeekStartDay requires exactly 1 argument");
    }
    SettingsDataSchema.shape.weekStartDay.parse(message.args[0]);
    
    this.messageQueue.push(message);
  }

  queueWeekStartTimeUTC(time: string): void {
    const message: SettingsMessage = { method: "setWeekStartTimeUTC", args: [time] };
    
    if (message.args.length !== 1) {
      throw new Error("setWeekStartTimeUTC requires exactly 1 argument");
    }
    SettingsDataSchema.shape.weekStartTimeUTC.parse(message.args[0]);
    
    this.messageQueue.push(message);
  }

  queueTheme(theme: "light" | "dark" | "auto"): void {
    const message: SettingsMessage = { method: "setTheme", args: [theme] };
    
    if (message.args.length !== 1) {
      throw new Error("setTheme requires exactly 1 argument");
    }
    SettingsDataSchema.shape.theme.parse(message.args[0]);
    
    this.messageQueue.push(message);
  }

  queueLearningPace(pace: "accelerated" | "standard" | "flexible"): void {
    const message: SettingsMessage = { method: "setLearningPace", args: [pace] };
    
    if (message.args.length !== 1) {
      throw new Error("setLearningPace requires exactly 1 argument");
    }
    SettingsDataSchema.shape.learningPace.parse(message.args[0]);
    
    this.messageQueue.push(message);
  }

  queueOptOutDailyPing(optOut: boolean): void {
    const message: SettingsMessage = { method: "setOptOutDailyPing", args: [optOut] };
    
    if (message.args.length !== 1) {
      throw new Error("setOptOutDailyPing requires exactly 1 argument");
    }
    SettingsDataSchema.shape.optOutDailyPing.parse(message.args[0]);
    
    this.messageQueue.push(message);
  }

  queueOptOutErrorPing(optOut: boolean): void {
    const message: SettingsMessage = { method: "setOptOutErrorPing", args: [optOut] };
    
    if (message.args.length !== 1) {
      throw new Error("setOptOutErrorPing requires exactly 1 argument");
    }
    SettingsDataSchema.shape.optOutErrorPing.parse(message.args[0]);
    
    this.messageQueue.push(message);
  }

  queueFontSize(size: "small" | "medium" | "large"): void {
    const message: SettingsMessage = { method: "setFontSize", args: [size] };
    
    if (message.args.length !== 1) {
      throw new Error("setFontSize requires exactly 1 argument");
    }
    SettingsDataSchema.shape.fontSize.parse(message.args[0]);
    
    this.messageQueue.push(message);
  }

  queueHighContrast(enabled: boolean): void {
    const message: SettingsMessage = { method: "setHighContrast", args: [enabled] };
    
    if (message.args.length !== 1) {
      throw new Error("setHighContrast requires exactly 1 argument");
    }
    SettingsDataSchema.shape.highContrast.parse(message.args[0]);
    
    this.messageQueue.push(message);
  }

  queueReducedMotion(enabled: boolean): void {
    const message: SettingsMessage = { method: "setReducedMotion", args: [enabled] };
    
    if (message.args.length !== 1) {
      throw new Error("setReducedMotion requires exactly 1 argument");
    }
    SettingsDataSchema.shape.reducedMotion.parse(message.args[0]);
    
    this.messageQueue.push(message);
  }

  queueFocusIndicatorStyle(style: "default" | "enhanced"): void {
    const message: SettingsMessage = { method: "setFocusIndicatorStyle", args: [style] };
    
    if (message.args.length !== 1) {
      throw new Error("setFocusIndicatorStyle requires exactly 1 argument");
    }
    SettingsDataSchema.shape.focusIndicatorStyle.parse(message.args[0]);
    
    this.messageQueue.push(message);
  }

  queueAudioEnabled(enabled: boolean): void {
    const message: SettingsMessage = { method: "setAudioEnabled", args: [enabled] };
    
    if (message.args.length !== 1) {
      throw new Error("setAudioEnabled requires exactly 1 argument");
    }
    SettingsDataSchema.shape.audioEnabled.parse(message.args[0]);
    
    this.messageQueue.push(message);
  }

  /**
   * Core polling interface - get and clear queued messages
   */
  getMessages(): SettingsMessage[] {
    const messages = [...this.messageQueue];
    this.messageQueue = [];
    return messages;
  }
}