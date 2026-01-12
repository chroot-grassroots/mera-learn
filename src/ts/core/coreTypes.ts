// coreTypes.ts - Shared core types and schemas

import { z } from "zod";
import { OverallProgressDataSchema } from "./overallProgressSchema.js";

/**
 * IMMUTABLE ID ALLOCATION SCHEME
 * ================================
 * 
 * IDs are permanent identifiers that persist across content reorganization,
 * version migrations, and schema changes. They enable stable progress tracking
 * even as curriculum structure evolves.
 * 
 * ALLOCATION RANGES:
 * 
 * 0 - 99: SYSTEM MENUS
 * ├─ 0: Main Menu
 * ├─ 1: Welcome Screen
 * └─ 2-99: Reserved for future system menus (settings, admin, etc.)
 * 
 * 1,000 - 9,999: DOMAINS (Subject Areas)
 * ├─ 1001: Example domain
 * └─ Capacity: 9,000 domains
 * 
 * 10,000 - 99,999: LEARNING CONTENT (Lessons)
 * ├─ 12345: Example lesson (phishing recognition)
 * └─ Capacity: 90,000 lessons
 * 
 * 100,000 - 999,999: PAGES (Lesson/Menu Pages)
 * ├─ Assign sequentially or randomly within range
 * └─ Capacity: 900,000 pages (10 pages/lesson × 90,000 lessons = room to spare)
 * 
 * 1,000,000 - 999,999,999,999: INTERACTIVE COMPONENTS
 * ├─ Existing: 123456, 123457 (grandfathered from old scheme)
 * ├─ New assignments: Use 1,000,000+ range
 * └─ Capacity: 999,999,000,000 components (~1 trillion)
 * 
 * DESIGN PRINCIPLES:
 * 
 * 1. Self-Documenting: ID magnitude indicates entity type
 *    - 0-99: System menu (1-2 digits)
 *    - 1,000s: Domain (4 digits starting with 1)
 *    - 10,000s: Lesson (5 digits)
 *    - 100,000s: Page (6 digits starting with 1-9)
 *    - 1,000,000+: Component (7+ digits)
 * 
 * 2. Global Uniqueness: All IDs globally unique across all types
 *    - Simplifies debugging and data integrity
 *    - No namespace collisions ever
 *    - Consistent architecture throughout
 * 
 * 3. Generous Capacity: Ample headroom in all categories
 *    - Pages: 900k (way more than needed)
 *    - Components: Still effectively unlimited
 * 
 * 4. Backward Compatible: Existing IDs remain valid
 *    - Components 123456, 123457: Grandfathered (fall in page range but typed as components in registry)
 *    - All new components must use 1,000,000+ range
 * 
 * ASSIGNMENT GUIDELINES:
 * 
 * - System Menus: Assign sequentially (0, 1, 2, ...)
 * - Domains: Assign sequentially starting at 1000 (1000, 1001, 1002, ...)
 * - Lessons: Random from 10,000-99,999 OR sequential starting at 10,000
 * - Pages: Random from 100,000-999,999 OR sequential starting at 100,000
 * - Components: Random from 1,000,000-999,999,999,999
 * 
 * Build-time registry generation validates uniqueness across all IDs.
 * Duplicate IDs (across any type) will fail the build.
 * 
 * RESERVED GAPS:
 * 
 * - 100-999: Never assigned (maintains clean digit-count boundaries)
 */
export const ImmutableId = z.number().int().min(0).max(999999999999);

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
