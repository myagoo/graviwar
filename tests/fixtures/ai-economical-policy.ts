// Frozen economical policy from 634e9a6, before charged shots and momentum escapes.
import { DEFAULT_MULTIPLAYER_SETTINGS } from "../../src/solo-settings";
import type { BlackHole, Input } from "../../src/Game";
import { acos, cos, sin } from "../../src/deterministic-math";
import { radiusFromMass } from "../../src/mass";

function closestDistance(x: number, y: number, vx: number, vy: number, ticks: number) {
  const speedSquared = vx * vx + vy * vy;
  const time = speedSquared === 0 ? 0 : Math.max(0, Math.min(ticks, -(x * vx + y * vy) / speedSquared));
  return Math.sqrt((x + vx * time) ** 2 + (y + vy * time) ** 2);
}

// One scan twice a second; shortlist six meals and eight predators for bounded planning.
export function aiDecision(self: BlackHole, bodies: BlackHole[], arenaRadius: number, settings = DEFAULT_MULTIPLAYER_SETTINGS): Input {
  let prey: BlackHole | undefined, preyScore = 0, preyDistance = Infinity;
  let supermassiveSafe = true;
  const meals: { body: BlackHole; distance: number; score: number }[] = [];
  const threats: { body: BlackHole; distance: number; danger: number }[] = [];
  for (const body of bodies) {
    if (body === self || body.radius < 1) continue;
    const dx = body.position.x - self.position.x, dy = body.position.y - self.position.y;
    const vx = body.velocity.x - self.velocity.x, vy = body.velocity.y - self.velocity.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const danger = closestDistance(dx, dy, vx, vy, 60);
    // Evaluate the full item duration at its vulnerable, half-size radius.
    if (body.radius > self.radius * settings.superRadius && closestDistance(dx, dy, vx, vy, settings.superSeconds * 60) < (body.radius + self.radius * settings.superRadius) * 6) supermassiveSafe = false;
    if (body.radius > self.radius * 0.98) {
      threats.push({ body, distance, danger });
      threats.sort((a, b) => a.danger - b.danger);
      if (threats.length > 8) threats.pop();
    } else if (body.radius < self.radius * 0.85) {
      const gap = Math.max(self.radius, distance - self.radius - body.radius);
      const foodValue = body.type === "fluctuation" ? self.mass * 0.04 : body.mass;
      const score = body.pickup === "hawking" ? 0 : foodValue / gap * (body.pickup && !self.storedBonus ? 4 : 1);
      if (score > 0) {
        meals.push({ body, distance, score });
        meals.sort((a, b) => b.score - a.score);
        if (meals.length > 6) meals.pop();
      }
    }
  }
  for (const meal of meals) {
    const body = meal.body, distance = Math.max(1, meal.distance);
    const dx = body.position.x - self.position.x, dy = body.position.y - self.position.y;
    const awaySpeed = ((body.velocity.x - self.velocity.x) * dx + (body.velocity.y - self.velocity.y) * dy) / distance;
    let score = meal.score / (1 + Math.max(0, awaySpeed) / 6);
    // Prefer our current course when opportunities are similar, without persistent AI state.
    const ownSpeed = Math.sqrt(self.velocity.x ** 2 + self.velocity.y ** 2);
    if (ownSpeed > 0) score *= 1 + 0.3 * Math.max(0, (self.velocity.x * dx + self.velocity.y * dy) / (ownSpeed * distance));
    const arrival = Math.min(90, distance / 6);
    const x = body.position.x + body.velocity.x * arrival, y = body.position.y + body.velocity.y * arrival;
    if (Math.sqrt(x * x + y * y) + self.radius > arenaRadius * 0.9) score *= 0.1;
    for (const { body: predator } of threats) {
      const px = predator.position.x + predator.velocity.x * arrival - x;
      const py = predator.position.y + predator.velocity.y * arrival - y;
      const reach = (self.radius + predator.radius) * 4;
      if (px * px + py * py < reach * reach) score *= 0.05;
    }
    if (score > preyScore) { prey = body; preyScore = score; preyDistance = meal.distance; }
  }
  const threat = threats.find(t => t.danger < (t.body.radius + self.radius) * 6)?.body;
  const decision: Input = {};
  if (self.storedBonus && !self.activeBonus) {
    const nearbyFood = prey && preyDistance < (self.radius + prey.radius) * 6;
    const speed = Math.sqrt(self.velocity.x ** 2 + self.velocity.y ** 2);
    const useful = self.storedBonus === "pulse" ? threats.some(t => t.danger < (self.radius + t.body.radius) * 2)
      : self.storedBonus === "jet" ? !!threat || !!prey && preyDistance > (self.radius + prey.radius) * 4
      : self.storedBonus === "supermassive" ? supermassiveSafe && !!nearbyFood && speed < 4 && Math.sqrt(self.position.x ** 2 + self.position.y ** 2) + speed * settings.superSeconds * 60 < arenaRadius * 0.8
      : !threat && !!nearbyFood;
    if (useful) decision.activateBonus = true;
  }
  if (self.radius < Math.max(30, settings.minShotRadius) || self.activeBonus === "supermassive" || decision.activateBonus && self.storedBonus === "supermassive") return decision;
  let dx: number, dy: number;
  if (threat) {
    dx = self.position.x - threat.position.x; dy = self.position.y - threat.position.y;
  } else if (Math.sqrt((self.position.x + self.velocity.x * 60) ** 2 + (self.position.y + self.velocity.y * 60) ** 2) > arenaRadius * 0.85) {
    dx = -self.position.x; dy = -self.position.y;
  } else if (prey) {
    const intercept = Math.max(15, Math.min(90, preyDistance / 6));
    dx = prey.position.x + prey.velocity.x * intercept - self.position.x;
    dy = prey.position.y + prey.velocity.y * intercept - self.position.y;
  } else return decision;
  const distance = Math.sqrt(dx * dx + dy * dy);
  if (distance === 0) return decision;
  const speed = threat ? 12 : Math.min(6, Math.max(1.5, (distance - self.radius - (prey?.radius ?? 0)) / 60));
  const desiredX = dx / distance * speed, desiredY = dy / distance * speed;
  const steerX = desiredX - self.velocity.x, steerY = desiredY - self.velocity.y;
  const correction = Math.sqrt(steerX * steerX + steerY * steerY);
  const jet = self.activeBonus === "jet" || decision.activateBonus && self.storedBonus === "jet";
  const recoil = radiusFromMass(self.mass * settings.shotMass) * settings.shotMass / (1 - settings.shotMass) * settings.shotSpeed * (jet ? settings.jetBoost : 1);
  // Matter is fuel: prefer gravity/coasting over marginal velocity corrections.
  // Without gravity, retain active pursuit; waiting cannot bring stationary food closer.
  const shotCost = (settings.gravity === 0 ? 2 : 40) * settings.shotMass / 0.05;
  // ponytail: linear one-second forecasts omit gravity; replan at 2 Hz before adding a physics rollout.
  const score = (vx: number, vy: number, firing: boolean) => {
    let cost = (vx - desiredX) ** 2 + (vy - desiredY) ** 2 + (firing ? shotCost : 0);
    for (const { body } of threats) {
      const clearance = closestDistance(body.position.x - self.position.x, body.position.y - self.position.y, body.velocity.x - vx, body.velocity.y - vy, 60);
      const danger = Math.max(0, 1 - clearance / ((self.radius + body.radius) * 4));
      cost += 800 * danger * danger;
    }
    const edge = Math.sqrt((self.position.x + vx * 60) ** 2 + (self.position.y + vy * 60) ** 2) + self.radius;
    const overflow = Math.max(0, (edge - arenaRadius * 0.85) / Math.max(self.radius, arenaRadius * 0.15));
    return cost + 1600 * overflow * overflow;
  };
  let best = score(self.velocity.x, self.velocity.y, false);
  const ideal = correction === 0 ? 0 : (steerY > 0 ? -1 : 1) * acos(-steerX / correction);
  for (const angle of [ideal, ...Array.from({ length: 8 }, (_, i) => -Math.PI + i * Math.PI / 4)]) {
    const cost = score(self.velocity.x - cos(angle) * recoil, self.velocity.y - sin(angle) * recoil, true);
    if (cost < best) { best = cost; decision.clickDirection = angle; }
  }
  return decision;
}
