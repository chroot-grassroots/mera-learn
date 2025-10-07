// coreTypes.ts - Shared core types and schemas

import { z } from "zod";
import { OverallProgressDataSchema } from "./overallProgressSchema.js";

/**
 * Immutable ID - used for all entities (lessons, components, domains, etc.)
 */
export const ImmutableId = z.number().int().min(1).max(999999999999);

/**
 * Trump strategies for resolving conflicts during data merging
 */
export type TrumpStrategy<T> =
  | "NOR"
  | "OR"
  | "MAX"
  | "UNION"
  | "LATEST_TIMESTAMP"
  | "PREFER_NON_EMPTY"
  | "ASSERT_EQUAL";

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

export type CombinedComponentProgress = z.infer<
  typeof CombinedComponentProgressSchema
>;

/**
 * Generic component progress message structure
 * Individual components define their own specific message types
 */
export interface ComponentProgressMessage {
  type: "component_progress";
  componentId: number;
  method: string;
  args: any[];
}
