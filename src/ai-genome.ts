// [default, minimum, maximum]. These tune decisions, never the physics rules.
export const AI_GENES = {
  foodMassWeight: [1, 0.2, 3],
  distanceWeight: [1, 0.3, 3],
  awaySpeedScale: [6, 1, 20],
  coursePreference: [0.3, 0, 2],
  pursuitTicks: [90, 30, 240],
  targetCommitment: [0, 0, 1],
  preferredSpeed: [6, 2, 16],
  minimumSpeed: [1.5, 0.5, 4],
  shotCost: [40, 5, 100],
  pursuitShotCost: [12, 1, 40],
  velocityTolerance: [0, 0, 4],
  chargeBenefit: [0, 0, 20],
  waitForCharge: [0, 0, 100],
  dangerRange: [6, 2, 10],
  predictionTicks: [60, 30, 180],
  safeMomentumPull: [4, 0, 10],
  predatorFeedingCost: [8, 0, 80],
  dangerCost: [800, 100, 2000],
  borderFraction: [0.85, 0.65, 0.95],
  itemValue: [4, 1, 10],
  itemRange: [6, 2, 12],
  shieldRange: [2, 1, 5],
  incomingFoodTicks: [180, 30, 300],
  valuableMassRatio: [0.5, 0.1, 0.9],
  guardedFoodValue: [0.05, 0.01, 0.8],
} as const;
export type AiGenome = { [K in keyof typeof AI_GENES]: number };
export const DEFAULT_AI_GENOME = Object.freeze(Object.fromEntries(
  Object.entries(AI_GENES).map(([key, [value]]) => [key, value]),
) as AiGenome);

export function validateGenome(value: unknown): AiGenome {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid AI genome");
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== Object.keys(AI_GENES).length) throw new Error("Unexpected AI genes");
  for (const [key, [, min, max]] of Object.entries(AI_GENES)) {
    const v = record[key];
    if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) throw new Error(`Invalid AI gene: ${key}`);
  }
  return { ...record } as AiGenome;
}
