// combinedComponentProgressSchema.ts
import { z } from "zod";

/**
 * Combined component progress schema
 * 
 * Stores progress for ALL components across ALL lessons in a flat structure.
 * Lesson grouping is handled by curriculum; this is just a global registry
 * of component states.
 * 
 * Structure: componentId (globally unique) -> component progress data
 * 
 * Initialized with defaults from each component's createInitialProgress().
 * During curriculum updates:
 * - New components are added with default progress
 * - Components removed from curriculum are dropped
 * - Existing components retain their progress data
 * 
 * This gets stored in Solid Pod as part of the main progress bundle.
 */
export const CombinedComponentProgressSchema = z.object({
  components: z.record(z.string(), z.any()), // componentId -> progress data
});

export type CombinedComponentProgress = z.infer<
  typeof CombinedComponentProgressSchema
>;