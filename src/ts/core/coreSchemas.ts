// coreSchemas.ts - Core application schemas and types
// Just a stub. Does not accurately represent what the file needs to be.

import { z } from "zod";

/**
 * Overall progress data schema
 */
export const OverallProgressDataSchema = z.object({
  lessonId: z.string(),
  overallCompletion: z.number().min(0).max(1),
  timeSpent: z.number().min(0),
  lastAccessed: z.string().datetime(),
  // Add other overall progress fields as needed
});

export type OverallProgressData = z.infer<typeof OverallProgressDataSchema>;

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

export type CombinedComponentProgress = z.infer<typeof CombinedComponentProgressSchema>;

/**
 * Message types for core communication
 */
export interface OverallProgressMessage {
  type: "overall_progress";
  data: any;
}

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