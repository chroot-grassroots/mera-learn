// lessonSchemas.ts - YAML lesson content schemas

import { z } from "zod";
import { ImmutableId } from './coreTypes.js';
import { BasicTaskComponentConfigSchema } from '../components/cores/basicTaskCore.js';

// Lesson metadata schema
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

// Page schema
export const PageSchema = z.object({
  id: ImmutableId,
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  order: z.number().int().min(0),
  // To Do: Need to replace line below with discriminated union
  components: z.array(BasicTaskComponentConfigSchema).min(1).max(10)
});

// Lesson schema
export const LessonSchema = z.object({
  metadata: LessonMetadataSchema,
  pages: z.array(PageSchema).min(1).max(10)  // Changed from components to pages
});

export type LessonMetadata = z.infer<typeof LessonMetadataSchema>;
export type Lesson = z.infer<typeof LessonSchema>;
export type Page = z.infer<typeof PageSchema>;