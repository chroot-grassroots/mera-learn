// overallProgressSchemas.ts

import { z } from "zod";

/**
 * Navigation state schema
 */
export const NavigationStateSchema = z.object({
  currentPage: z.number().min(0),
  totalPages: z.number().min(1),
  currentLesson: z.string(),
  availableRoutes: z.array(z.string()),
  history: z.array(z.string()),
  // Add other navigation fields as needed
});

export type NavigationState = z.infer<typeof NavigationStateSchema>;

export interface NavigationMessage {
  type: "navigation";
  data: any;
}
