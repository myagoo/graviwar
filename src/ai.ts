import type { BlackHole, Input } from "./Game";
import { acos, cos, sin } from "./deterministic-math";
import { PULSE_RADIUS_FACTOR } from "./bonuses";
import { radiusFromMass } from "./mass";

function closestDistance(x: number, y: number, vx: number, vy: number, ticks: number) {
  const speedSquared = vx * vx + vy * vy;
  const time = speedSquared === 0 ? 0 : Math.max(0, Math.min(ticks, -(x * vx + y * vy) / speedSquared));
  return Math.sqrt((x + vx * time) ** 2 + (y + vy * time) ** 2);
}

// One scan twice a second, then at most eight predators × ten movement candidates.
export function aiDecision(self: BlackHole, bodies: BlackHole[], arenaRadius: number): Input {
  let prey: BlackHole | undefined, preyScore = 0, preyDistance = Infinity;
  let supermassiveSafe = true;
  const threats: { body: BlackHole; distance: number; danger: number }[] = [];
  for (const body of bodies) {
    if (body === self || body.radius < 1) continue;
    const dx = body.position.x - self.position.x, dy = body.position.y - self.position.y;
    const vx = body.velocity.x - self.velocity.x, vy = body.velocity.y - self.velocity.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const danger = closestDistance(dx, dy, vx, vy, 60);
    // Evaluate the full item duration at its vulnerable, half-size radius.
    if (body.radius > self.radius * 0.5 && closestDistance(dx, dy, vx, vy, 180) < (body.radius + self.radius * 0.5) * 6) supermassiveSafe = false;
    if (body.radius > self.radius * 0.98 && danger < (body.radius + self.radius) * 8) {
      threats.push({ body, distance, danger });
      threats.sort((a, b) => a.danger - b.danger);
      if (threats.length > 8) threats.pop();
    } else if (body.radius < self.radius * 0.85) {
      const gap = Math.max(self.radius, distance - self.radius - body.radius);
      const foodValue = body.type === "fluctuation" ? self.mass * 0.04 : body.mass;
      const score = body.pickup === "hawking" ? 0 : foodValue / gap * (body.pickup && !self.storedBonus ? 4 : 1);
      if (score > preyScore) { prey = body; preyScore = score; preyDistance = distance; }
    }
  }
  const threat = threats[0]?.body;
  const decision: Input = {};
  if (self.storedBonus && !self.activeBonus) {
    const nearbyFood = prey && preyDistance < (self.radius + prey.radius) * 6;
    const speed = Math.sqrt(self.velocity.x ** 2 + self.velocity.y ** 2);
    const useful = self.storedBonus === "pulse" ? threats.some(t => t.distance < self.radius * PULSE_RADIUS_FACTOR && t.danger < (self.radius + t.body.radius) * 4)
      : self.storedBonus === "jet" ? !!threat || !!prey && preyDistance > (self.radius + prey.radius) * 4
      : self.storedBonus === "supermassive" ? supermassiveSafe && !!nearbyFood && speed < 4 && Math.sqrt(self.position.x ** 2 + self.position.y ** 2) + speed * 180 < arenaRadius * 0.8
      : !threat && !!nearbyFood;
    if (useful) decision.activateBonus = true;
  }
  // A pulse changes our velocity immediately; reconsider steering at the next decision.
  if (self.radius < 30 || self.activeBonus === "supermassive" || decision.activateBonus && (self.storedBonus === "supermassive" || self.storedBonus === "pulse")) return decision;
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
  const recoil = radiusFromMass(self.mass / 20) / 19 * (jet ? 6 : 1);
  // ponytail: linear one-second forecasts omit gravity; replan at 2 Hz before adding a physics rollout.
  const score = (vx: number, vy: number, firing: boolean) => {
    let cost = (vx - desiredX) ** 2 + (vy - desiredY) ** 2 + (firing ? 2 : 0);
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
