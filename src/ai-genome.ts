// Evolved champion with targeted pursuit tuning; see tests/AI-TRAINING.md.
// [default, minimum, maximum]. These tune decisions, never the physics rules.
export const AI_GENES = {
  foodMassWeight: [1.371329827882641, 0.2, 3],
  distanceWeight: [1.731716346368878, 0.3, 3],
  awaySpeedScale: [18.66910789670113, 1, 20],
  coursePreference: [0.8616602348229544, 0, 2],
  pursuitTicks: [137.76511195030113, 30, 240],
  targetCommitment: [0.17205621576384772, 0, 1],
  preferredSpeed: [2.3678450263876645, 2, 16],
  minimumSpeed: [1.9416132620022708, 0.5, 4],
  shotCost: [100, 5, 100],
  pursuitShotCost: [12, 1, 40],
  velocityTolerance: [2.2578099656884287, 0, 4],
  chargeBenefit: [0, 0, 20],
  waitForCharge: [81.27120974511634, 0, 100],
  dangerRange: [2, 2, 10],
  predictionTicks: [63.727812654306724, 30, 180],
  safeMomentumPull: [7.359301678210009, 0, 10],
  predatorFeedingCost: [17.928747113421117, 0, 80],
  dangerCost: [1835.5453788514035, 100, 2000],
  borderFraction: [0.95, 0.65, 0.95],
  itemValue: [5.132272605262943, 1, 10],
  itemRange: [7.762885736438136, 2, 12],
  shieldRange: [1.362416625678624, 1, 5],
  incomingFoodTicks: [272.2722014396622, 30, 300],
  valuableMassRatio: [0.5, 0.1, 0.9],
  guardedFoodValue: [0.5744665266690688, 0.01, 0.8],
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
