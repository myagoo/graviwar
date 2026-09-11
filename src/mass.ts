import { DEFAULT_MULTIPLAYER_SETTINGS } from "./solo-settings";
import type { Vector } from "./utils";

// Uniform-density spheres, scaled so radius 100 retains its previous gravity.
// This is (4/3)πr³ with density 3/400 in the game's units.
export const massFromRadius = (radius: number) => Math.PI * radius * radius * radius / 100;

export function radiusFromMass(mass: number): number {
  if (mass <= 0) return 0;
  let volume = mass * 100 / Math.PI, scale = 1;
  while (volume >= 8) { volume /= 8; scale *= 2; }
  while (volume < 1) { volume *= 8; scale /= 2; }
  // Fixed operations instead of browser-dependent Math.cbrt.
  let radius = 2;
  for (let i = 0; i < 10; i++) radius = (2 * radius + volume / (radius * radius)) / 3;
  return radius * scale;
}

export function intersectionMass(a: Vector, r: number, b: Vector, s: number): number {
  const dx = a.x - b.x, dy = a.y - b.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  if (distance >= r + s) return 0;
  if (distance <= Math.abs(r - s)) return massFromRadius(Math.min(r, s));
  const overlap = r + s - distance, difference = r - s;
  return Math.PI * overlap * overlap *
    (distance * distance + 2 * distance * (r + s) - 3 * difference * difference) / (1600 * distance);
}

// Tick-derived compression; no accumulated scaling.
export function radiusScale(body: { activeBonus?: string; bonusTicks?: number }, settings = DEFAULT_MULTIPLAYER_SETTINGS): number {
  if (body.activeBonus !== "supermassive") return 1;
  const duration = settings.superSeconds * 60;
  const remaining = body.bonusTicks ?? duration;
  const transition = Math.round(settings.superTransitionMs * 60 / 1000);
  const compression = Math.max(0, Math.min(transition, duration - remaining, remaining)) / transition;
  return 1 - (1 - settings.superRadius) * compression;
}

export function bodyRadius(body: { mass: number; activeBonus?: string; bonusTicks?: number }, settings = DEFAULT_MULTIPLAYER_SETTINGS): number {
  return radiusFromMass(body.mass) * radiusScale(body, settings);
}
