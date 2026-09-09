import { z } from "zod";

export const SOLO_SETTINGS_KEY = "graviwar.solo-settings.v1";
export const soloSettingsSchema = z.object({
  arenaRadius: z.number().min(5000).max(50000),
  gravity: z.number().min(0).max(1),
  gravityIncreases: z.boolean(),
  bodyCount: z.number().int().min(10).max(5000),
  minBodyRadius: z.number().min(10).max(150),
  maxBodyRadius: z.number().min(10).max(150),
  playerRadius: z.number().min(30).max(300),
}).refine(s => s.minBodyRadius <= s.maxBodyRadius, {
  message: "Minimum body radius must not exceed maximum body radius.",
}).refine(s => s.maxBodyRadius < s.arenaRadius && s.playerRadius < s.arenaRadius, {
  message: "Starting body radii must be smaller than the arena radius.",
});
export type SoloSettings = z.infer<typeof soloSettingsSchema>;
export const DEFAULT_SOLO_SETTINGS: SoloSettings = {
  arenaRadius: 20000, gravity: 0.1, gravityIncreases: true, bodyCount: 1000,
  minBodyRadius: 56, maxBodyRadius: 98, playerRadius: 155,
};

export function loadSoloSettings(): SoloSettings {
  try {
    const parsed = soloSettingsSchema.safeParse(JSON.parse(localStorage.getItem(SOLO_SETTINGS_KEY) || "null"));
    if (parsed.success) return {
      ...parsed.data,
      arenaRadius: Math.round(parsed.data.arenaRadius / 500) * 500,
      gravity: Math.round(parsed.data.gravity * 100) / 100,
      minBodyRadius: Math.round(parsed.data.minBodyRadius),
      maxBodyRadius: Math.round(parsed.data.maxBodyRadius),
      playerRadius: Math.round(parsed.data.playerRadius),
    };
  } catch { /* Unavailable storage or invalid JSON: use playable defaults. */ }
  return { ...DEFAULT_SOLO_SETTINGS };
}
