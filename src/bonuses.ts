import { z } from "zod";
import type { BlackHole } from "./Game";

export const bonusSchema = z.enum(["surge", "pulse", "jet", "supermassive"]);
export type Bonus = z.infer<typeof bonusSchema>;
export const BONUS_COLORS: Record<Bonus, string> = {
  surge: "#ffc983", pulse: "#ff756a", jet: "#91d8ff", supermassive: "#d4adff",
};
export const BONUS_NAMES: Record<Bonus, string> = {
  surge: "Accretion Surge", pulse: "Repulsion Pulse", jet: "Relativistic Jet", supermassive: "Supermassive",
};
export const BONUS_DESCRIPTIONS: Record<Bonus, string> = {
  surge: "3× pull on smaller bodies for 6 seconds.",
  pulse: "Push nearby bodies away with one pulse.",
  jet: "2× ejection speed for 5 seconds. Mass cost stays the same.",
  supermassive: "10× pull for 3 seconds. Radius shrinks to 10% over 0.5 seconds, then returns over the final 0.5 seconds. Mass stays unchanged; expulsion is locked.",
};
export const inputSchema = z.object({
  clickDirection: z.number().min(-Math.PI).max(Math.PI).optional(),
  activateBonus: z.literal(true).optional(),
}).refine(input => input.clickDirection !== undefined || input.activateBonus, { message: "Expected an action" });

export function activateBonus(body: BlackHole, bodies: BlackHole[]) {
  if (!body.storedBonus || body.activeBonus || body.mass <= 0) return;
  const bonus = body.storedBonus;
  delete body.storedBonus;
  if (bonus === "pulse") {
    for (const other of bodies) {
      if (other === body || other.mass <= 0) continue;
      const dx = other.position.x - body.position.x, dy = other.position.y - body.position.y;
      const distance = Math.sqrt(dx * dx + dy * dy), reach = 8 * (body.radius + other.radius);
      if (distance === 0 || distance >= reach) continue;
      const impulse = body.mass * 3 * (1 - distance / reach);
      const x = dx / distance * impulse, y = dy / distance * impulse;
      other.velocity.x += x / other.mass; other.velocity.y += y / other.mass;
      body.velocity.x -= x / body.mass; body.velocity.y -= y / body.mass;
    }
    return;
  }
  body.activeBonus = bonus;
  body.bonusTicks = bonus === "supermassive" ? 180 : bonus === "jet" ? 300 : 360;
}

// Credit the largest surviving contributor when a mystery body is fully absorbed.
export function transferPickup(donor: BlackHole, receiver: BlackHole, amount: number, bodies: BlackHole[]) {
  if (!donor.pickup) return;
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
