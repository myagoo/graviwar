import { DEFAULT_MULTIPLAYER_SETTINGS, type SoloSettings } from "./solo-settings";
import { z } from "zod";
import type { BlackHole } from "./Game";

export const bonusSchema = z.enum(["surge", "pulse", "jet", "supermassive"]);
export const pickupSchema = z.union([bonusSchema, z.literal("hawking")]);
export type Pickup = z.infer<typeof pickupSchema>;
export type Bonus = z.infer<typeof bonusSchema>;
export const BONUS_COLORS: Record<Bonus, string> = {
  surge: "#ffc983", pulse: "#ff756a", jet: "#91d8ff", supermassive: "#d4adff",
};
export const BONUS_NAMES: Record<Bonus, string> = {
  surge: "Accretion Surge", pulse: "Repulsion Pulse", jet: "Relativistic Jet", supermassive: "Supermassive",
};
export const PULSE_RADIUS_FACTOR = DEFAULT_MULTIPLAYER_SETTINGS.pulseRange;
export const inputSchema = z.object({
  clickDirection: z.number().min(-Math.PI).max(Math.PI).optional(),
  shotCharge: z.number().int().min(0).max(100).optional(),
  activateBonus: z.literal(true).optional(),
}).refine(input => input.shotCharge === undefined || input.clickDirection !== undefined, { message: "Charge requires a shot direction" }).refine(input => input.clickDirection !== undefined || input.activateBonus, { message: "Expected an action" });

export function activateBonus(body: BlackHole, bodies: BlackHole[], settings = DEFAULT_MULTIPLAYER_SETTINGS) {
  if (!body.storedBonus || body.activeBonus || body.mass <= 0) return;
  const bonus = body.storedBonus;
  delete body.storedBonus;
  if (bonus === "pulse") {
    for (const other of bodies) {
      if (other === body || other.mass <= 0) continue;
      const dx = other.position.x - body.position.x, dy = other.position.y - body.position.y;
      const distance = Math.sqrt(dx * dx + dy * dy), reach = settings.pulseRange * body.radius;
      if (distance === 0 || distance >= reach) continue;
      // Reduced mass gives a bounded relative velocity kick, with equal/opposite momentum.
      const reducedMass = body.mass * (other.mass / (body.mass + other.mass));
      const impulse = reducedMass * settings.pulseSpeed * (1 - distance / reach);
      const x = dx / distance * impulse, y = dy / distance * impulse;
      other.velocity.x += x / other.mass; other.velocity.y += y / other.mass;
      body.velocity.x -= x / body.mass; body.velocity.y -= y / body.mass;
    }
    return;
  }
  body.activeBonus = bonus;
  body.bonusTicks = bonusDuration(bonus, settings);
}

// Credit the largest surviving contributor when a mystery body is fully absorbed.
export function transferPickup(donor: BlackHole, receiver: BlackHole, amount: number, bodies: BlackHole[], settings = DEFAULT_MULTIPLAYER_SETTINGS) {
  if (!donor.pickup) return;
  if (donor.pickup === "hawking") {
    if (donor.mass > 0) return;
    receiver.hawkingTicks = settings.hawkingSeconds * 60;
    delete donor.pickup;
    return;
  }
  if (receiver.playerId !== undefined) {
    const claims = donor.pickupClaims ??= [];
    const claim = claims.find(claim => claim.id === receiver.playerId);
    if (claim) claim.mass += amount;
    else claims.push({ id: receiver.playerId, mass: amount });
  }
  if (donor.mass > 0) return;
  let owner: BlackHole | undefined, largest = -1;
  for (const claim of donor.pickupClaims ?? []) {
    const candidate = bodies.find(body => body.playerId === claim.id && body.mass > 0);
    if (candidate && claim.mass > largest) { owner = candidate; largest = claim.mass; }
  }
  if (owner) owner.storedBonus = donor.pickup;
  else { receiver.pickup = donor.pickup; delete receiver.pickupClaims; }
  delete donor.pickup; delete donor.pickupClaims;
}

export function bonusDuration(bonus: Bonus, settings: SoloSettings = DEFAULT_MULTIPLAYER_SETTINGS) {
  return (bonus === "supermassive" ? settings.superSeconds : bonus === "jet" ? settings.jetSeconds : settings.surgeSeconds) * 60;
}
export function bonusDescriptions(settings: SoloSettings): Record<Bonus, string> {
  return {
    surge: `${settings.surgePull}× pull on smaller bodies for ${settings.surgeSeconds} seconds.`,
    pulse: `Single blast within ${settings.pulseRange}× your radius, up to ${settings.pulseSpeed} relative speed. Opposite recoil.`,
    jet: `${settings.jetBoost}× ejection speed for ${settings.jetSeconds} seconds.`,
    supermassive: `${settings.superPull}× gravitational mass for ${settings.superSeconds} seconds. Radius becomes ${Math.round(settings.superRadius * 100)}%; transition ${settings.superTransitionMs} ms. Expulsion locked.`,
  };
}
