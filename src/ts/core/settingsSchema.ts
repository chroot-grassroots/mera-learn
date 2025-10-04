/**
 * Settings data schema
 */

import { z } from "zod";

export const SettingsDataSchema = z.object({
  theme: z.enum(["light", "dark", "auto"]).default("auto"),
  fontSize: z.enum(["small", "medium", "large"]).default("medium"),
  reducedMotion: z.boolean().default(false),
  highContrast: z.boolean().default(false),
  // Add other settings as needed
});

export type SettingsData = z.infer<typeof SettingsDataSchema>;

export interface SettingMessage {
  type: "setting";
  data: any;
}