// combinedComponentProgressSchema.ts
import { z } from "zod";
import { OverallProgressDataSchema } from "./overallProgressSchema.js";

/**
 * Combined component progress schema - counterpart to lesson YAML
 * This gets stored in Solid Pod
 */
export const CombinedComponentProgressSchema = z.object({
  lessonId: z.string(),
  lastUpdated: z.number().int().min(0), // Seconds in Unix time
  components: z.record(z.string(), z.any()), // componentId -> progress data
  overallProgress: OverallProgressDataSchema,
});

export type CombinedComponentProgress = z.output<
  typeof CombinedComponentProgressSchema
>;
