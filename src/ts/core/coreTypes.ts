// coreSchemas.ts - Core application schemas and types
// Just a stub. Does not accurately represent what the file needs to be.

import { z } from "zod";
import { curriculumData } from "../registry/mera-registry.js";
import { OverallProgressDataSchema } from "./overallProgressSchema.js";

/**
 * Combined component progress schema - counterpart to lesson YAML
 * This gets stored in Solid Pod
 */

export const ImmutableId = z.number().int().min(1).max(999999999999);

export const CombinedComponentProgressSchema = z.object({
  lessonId: z.string(),
  lastUpdated: z.number().int().min(0), // Seconds in Unix time
  components: z.record(z.string(), z.any()), // componentId -> progress data
  overallProgress: OverallProgressDataSchema,
});

export type CombinedComponentProgress = z.infer<
  typeof CombinedComponentProgressSchema
>;

export interface ComponentProgressMessage {
  type: "component_progress";
  componentId: number;
  method: string;
  args: any[];
}

export type TrumpStrategy<T> =
  | "NOR"
  | "OR"
  | "MAX"
  | "UNION"
  | "LATEST_TIMESTAMP"
  | "PREFER_NON_EMPTY"
  | "ASSERT_EQUAL";
