// lessonSchemas.ts - YAML lesson content schemas

import { z } from "zod";
import { ImmutableId } from './coreTypes.js';
import { BasicTaskComponentConfigSchema } from '../components/cores/basicTaskCore.js';
import { NewUserWelcomeComponentConfigSchema } from '../components/cores/newUserWelcomeCore.js';

// ============================================================================
// LESSON METADATA SCHEMA
// ============================================================================

/**
 * Lesson metadata schema
 * Supports both lesson and menu entity types
 */
export const LessonMetadataSchema = z.object({
  id: ImmutableId,
  entityType: z.enum(["lesson", "menu"]),  // allows both types
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(1000),
  domainId: ImmutableId.optional(),  // only required for learning lessons
  estimatedMinutes: z.number().int().min(1).max(60),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
});

// ============================================================================
// COMPONENT DISCRIMINATED UNION
// ============================================================================

/**
 * Discriminated union of all component config schemas
 * 
 * CRITICAL: The "type" field acts as the discriminator
 * Zod automatically selects the correct schema based on component.type
 * 
 * TypeScript Learning Note:
 * - z.discriminatedUnion creates a union type where one field (the discriminator)
 *   determines which schema to use
 * - This is more efficient than z.union because Zod can check the discriminator
 *   first instead of trying each schema sequentially
 * - Similar to Rust's enum with pattern matching
 * 
 * When adding new component types:
 * 1. Import the new ComponentConfigSchema
 * 2. Add it to the array below
 * 3. Zod will automatically handle validation based on the "type" field
 */
export const ComponentConfigSchema = z.discriminatedUnion("type", [
  BasicTaskComponentConfigSchema,
  NewUserWelcomeComponentConfigSchema,
  // Add new component schemas here as you create them
  // Example: QuizComponentConfigSchema,
  // Example: VideoComponentConfigSchema,
]);

// ============================================================================
// PAGE AND LESSON SCHEMAS
// ============================================================================

/**
 * Page schema
 * Contains metadata and an array of components (now using discriminated union)
 */
export const PageSchema = z.object({
  id: ImmutableId,
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  order: z.number().int().min(0),
  components: z.array(ComponentConfigSchema).min(1).max(10)
});

/**
 * Lesson schema
 * Top-level structure containing metadata and pages
 */
export const LessonSchema = z.object({
  metadata: LessonMetadataSchema,
  pages: z.array(PageSchema).min(1).max(10)
});

// ============================================================================
// TYPESCRIPT TYPE EXPORTS
// ============================================================================

export type LessonMetadata = z.infer<typeof LessonMetadataSchema>;
export type ComponentConfig = z.infer<typeof ComponentConfigSchema>;
export type Page = z.infer<typeof PageSchema>;
export type Lesson = z.infer<typeof LessonSchema>;