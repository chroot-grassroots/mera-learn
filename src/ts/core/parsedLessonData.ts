// src/ts/core/parsedLessonData.ts
import type { Lesson } from './lessonSchemas.js';

export interface ParsedLessonData {
  readonly metadata: Readonly<Lesson['metadata']>;
  readonly pages: ReadonlyArray<Readonly<Lesson['pages'][0]>>;
  readonly components: ReadonlyArray<Readonly<{
    id: number;
    type: string;
    [key: string]: any;
  }>>;
}