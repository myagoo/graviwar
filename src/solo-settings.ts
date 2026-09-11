import { z } from "zod";

export const SOLO_SETTINGS_KEY = "graviwar.solo-settings.v1";
export const INVITE_SETTINGS_KEY = "graviwar.invite-settings.v1";
export const numericSettings = {
  arenaRadius: { label: "Starting arena radius", min: 5000, max: 50000, step: 500, default: 20000 },
  shrinkSeconds: { label: "Shrink duration (seconds)", min: 30, max: 600, step: 15, default: 180 },
  gravity: { label: "Gravitational constant", min: 0, max: 1, step: 0.01, default: 0.1 },
  bodyCount: { label: "Neutral bodies", min: 0, max: 5000, step: 1, default: 1000 },
  aiCount: { label: "AI rivals", min: 0, max: 32, step: 1, default: 3 },
  playerRadius: { label: "Starting player radius", min: 30, max: 1000, step: 1, default: 155 },
  minBodyRadius: { label: "Minimum body radius", min: 10, max: 150, step: 1, default: 56 },
  maxBodyRadius: { label: "Maximum body radius", min: 10, max: 150, step: 1, default: 98 },
  chargeMs: { label: "Full charge (ms)", min: 300, max: 3000, step: 50, default: 1000 },
  tapMs: { label: "Tap threshold (ms)", min: 50, max: 250, step: 10, default: 180 },
  chargeBoost: { label: "Full-charge speed multiplier", min: 2, max: 8, step: 0.5, default: 4 },
  shotMass: { label: "Shot mass fraction", min: 0.01, max: 0.15, step: 0.005, default: 0.05 },
  shotSpeed: { label: "Shot speed multiplier", min: 0.25, max: 3, step: 0.25, default: 1 },
  minShotRadius: { label: "Minimum shooting radius", min: 5, max: 30, step: 1, default: 10 },
  borderBounce: { label: "Border bounce retention", min: 0, max: 1, step: 0.05, default: 0.8 },
  gravityTheta: { label: "Gravity approximation (0 = exact)", min: 0, max: 1.2, step: 0.05, default: 0.75 },
  surgePull: { label: "Attraction strength", min: 1, max: 8, step: 0.5, default: 3 },
  surgeSeconds: { label: "Attraction duration (seconds)", min: 1, max: 15, step: 1, default: 6 },
  pulseRange: { label: "Repulsion range (radius multiplier)", min: 3, max: 20, step: 1, default: 12 },
  pulseSpeed: { label: "Repulsion kick speed", min: 10, max: 100, step: 2, default: 48 },
  jetBoost: { label: "Jet speed multiplier", min: 2, max: 10, step: 0.5, default: 6 },
  jetSeconds: { label: "Jet duration (seconds)", min: 1, max: 15, step: 1, default: 5 },
  superPull: { label: "Supermassive gravity multiplier", min: 2, max: 20, step: 1, default: 8 },
  superRadius: { label: "Supermassive radius scale", min: 0.1, max: 1, step: 0.05, default: 0.5 },
  superSeconds: { label: "Supermassive duration (seconds)", min: 1, max: 10, step: 1, default: 3 },
  superTransitionMs: { label: "Supermassive transition (ms)", min: 100, max: 500, step: 50, default: 500 },
  waveSeconds: { label: "Fluctuation interval (seconds)", min: 1, max: 20, step: 1, default: 4 },
  waveCount: { label: "Fluctuations per wave", min: 1, max: 8, step: 1, default: 3 },
  waveCap: { label: "Maximum loose fluctuations", min: 8, max: 64, step: 1, default: 24 },
  fluctuationSeconds: { label: "Fluctuation lifetime (seconds)", min: 10, max: 120, step: 5, default: 45 },
  fluctuationRadius: { label: "Fluctuation radius", min: 2, max: 15, step: 1, default: 4 },
  nearPlayerChance: { label: "Chance to spawn near players", min: 0, max: 1, step: 0.05, default: 0.5 },
  superWeight: { label: "Supermassive rarity weight (others = 2)", min: 0.1, max: 4, step: 0.1, default: 1 },
  hawkingDelay: { label: "Radiation starts after (seconds)", min: 0, max: 180, step: 5, default: 60 },
  hawkingChance: { label: "Radiation probability", min: 0, max: 0.5, step: 0.05, default: 0.2 },
  hawkingSeconds: { label: "Radiation duration (seconds)", min: 1, max: 10, step: 1, default: 5 },
  hawkingIntervalTicks: { label: "Radiation interval (ticks; 60 per second)", min: 3, max: 30, step: 1, default: 6 },
  hawkingMass: { label: "Radiated mass fraction per emission", min: 0.001, max: 0.05, step: 0.001, default: 0.024 },
  hawkingSpeed: { label: "Radiation speed multiplier", min: 0.25, max: 3, step: 0.25, default: 1 },
} as const;
const shape = Object.fromEntries(Object.entries(numericSettings).map(([key, field]) =>
  [key, z.number().min(field.min).max(field.max).multipleOf(field.step).default(field.default)]
)) as { [K in keyof typeof numericSettings]: z.ZodDefault<z.ZodNumber> };
export const soloSettingsSchema = z.object({ ...shape, arenaShrinks: z.boolean().default(true) })
  .refine(s => s.minBodyRadius <= s.maxBodyRadius, { message: "Minimum body radius must not exceed maximum body radius." })
  .refine(s => s.tapMs < s.chargeMs, { message: "Tap threshold must be shorter than full charge." });
export type SoloSettings = z.infer<typeof soloSettingsSchema>;
export const DEFAULT_SOLO_SETTINGS: SoloSettings = soloSettingsSchema.parse({});
export const DEFAULT_MULTIPLAYER_SETTINGS: SoloSettings = { ...DEFAULT_SOLO_SETTINGS, aiCount: 0 };
export const settingsFields = Object.entries(numericSettings).map(([key, field]) => ({ ...field, key: key as keyof typeof numericSettings }));

export function loadSoloSettings(key = SOLO_SETTINGS_KEY, defaults = DEFAULT_SOLO_SETTINGS): SoloSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || "null");
    if (saved && saved.arenaShrinks === undefined && typeof saved.gravityIncreases === "boolean") saved.arenaShrinks = saved.gravityIncreases;
    const parsed = soloSettingsSchema.safeParse(saved);
    if (parsed.success) return parsed.data;
  } catch { /* Unavailable storage or invalid JSON: use playable defaults. */ }
  return { ...defaults };
}

export const settingsSections = [
  { label: "Arena", keys: ["arenaRadius", "shrinkSeconds"] },
  { label: "Bodies", keys: ["bodyCount", "minBodyRadius", "maxBodyRadius"] },
  { label: "Players", keys: ["playerRadius", "aiCount"] },
  { label: "Shots", keys: ["chargeMs", "tapMs", "chargeBoost", "shotMass", "shotSpeed", "minShotRadius"] },
  { label: "Items", keys: ["surgePull", "surgeSeconds", "pulseRange", "pulseSpeed", "jetBoost", "jetSeconds", "superPull", "superRadius", "superSeconds", "superTransitionMs", "superWeight"] },
  { label: "Quantum fluctuations", keys: ["waveSeconds", "waveCount", "waveCap", "fluctuationSeconds", "fluctuationRadius", "nearPlayerChance"] },
  { label: "Hawking radiation", keys: ["hawkingDelay", "hawkingChance", "hawkingSeconds", "hawkingIntervalTicks", "hawkingMass", "hawkingSpeed"] },
  { label: "Physics", keys: ["gravity", "borderBounce", "gravityTheta"] },
].map(section => ({ label: section.label, fields: settingsFields.filter(field => section.keys.includes(field.key)) }));

// The invitation build check guarantees both peers use the same field order.
export function encodeInvitationSettings(settings: SoloSettings) {
  return JSON.stringify([...settingsFields.map(field => settings[field.key]), settings.arenaShrinks]);
}
export function decodeInvitationSettings(encoded: string) {
  const value: unknown = JSON.parse(encoded);
  if (!Array.isArray(value)) return soloSettingsSchema.parse(value);
  if (value.length !== settingsFields.length + 1) throw new Error("Invalid invitation settings");
  return soloSettingsSchema.parse({ ...Object.fromEntries(settingsFields.map((field, i) => [field.key, value[i]])), arenaShrinks: value[settingsFields.length] });
}
