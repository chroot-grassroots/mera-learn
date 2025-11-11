// podStorageSchema.ts - Schema for data stored in Solid Pod

import { z } from "zod";
import { OverallProgressDataSchema } from "../core/overallProgressSchema.js";
import { SettingsDataSchema } from "../core/settingsSchema.js";
import { NavigationStateSchema } from "../core/navigationSchema.js";
import { CombinedComponentProgressSchema } from "../core/coreTypes.js";

/**
 * Metadata added by saver during persistence
 */
export const PodMetadataSchema = z.object({
  webId: z.string().regex(/^https?:\/\/.+/, "Must be a valid WebID URL"),
  schemaVersion: z.object({
    major: z.number().int().min(0),
    minor: z.number().int().min(0),
    patch: z.number().int().min(0),
  }),
});

/**
 * Complete bundle saved to Solid Pod
 * Core builds this, Saver persists it
 */
export const PodStorageBundleSchema = z.object({
  overallProgress: OverallProgressDataSchema,
  settings: SettingsDataSchema,
  navigationState: NavigationStateSchema,
  combinedComponentProgress: CombinedComponentProgressSchema,
  metadata: PodMetadataSchema,
});

export type PodMetadata = z.infer<typeof PodMetadataSchema>;
export type PodStorageBundle = z.infer<typeof PodStorageBundleSchema>;