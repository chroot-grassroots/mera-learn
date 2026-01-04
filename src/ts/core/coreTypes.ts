// coreTypes.ts - Shared core types and schemas

import { z } from "zod";
import { OverallProgressDataSchema } from "./overallProgressSchema.js";

/**
 * Immutable ID - used for all entities (lessons, components, domains, etc.)
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
