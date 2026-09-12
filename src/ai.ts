import { DEFAULT_AI_GENOME, type AiGenome } from "./ai-genome";
import { DEFAULT_MULTIPLAYER_SETTINGS } from "./solo-settings";
import type { BlackHole, Input } from "./Game";
import { acos, cos, sin } from "./deterministic-math";
import { shotChargeAt, shotSpeedMultiplier } from "./shots";
import { radiusFromMass } from "./mass";

function closestDistance(x: number, y: number, vx: number, vy: number, ticks: number) {
  const speedSquared = vx * vx + vy * vy;
  const time = speedSquared === 0 ? 0 : Math.max(0, Math.min(ticks, -(x * vx + y * vy) / speedSquared));
  return Math.sqrt((x + vx * time) ** 2 + (y + vy * time) ** 2);
}

// One scan twice a second; shortlist six meals and eight predators for bounded planning.
export function aiDecision(self: BlackHole, bodies: BlackHole[], arenaRadius: number, settings = DEFAULT_MULTIPLAYER_SETTINGS, genes: AiGenome = DEFAULT_AI_GENOME): Input {
  let prey: BlackHole | undefined, preyScore = 0, preyDistance = Infinity;
  let supermassiveSafe = true;
  const meals: { body: BlackHole; distance: number; score: number }[] = [];
  const threats: { body: BlackHole; distance: number; danger: number }[] = [];
  for (const body of bodies) {
    if (body === self || body.radius < 1) continue;
    const dx = body.position.x - self.position.x, dy = body.position.y - self.position.y;
    const vx = body.velocity.x - self.velocity.x, vy = body.velocity.y - self.velocity.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const danger = closestDistance(dx, dy, vx, vy, genes.predictionTicks);
    // Evaluate the full item duration at its vulnerable, half-size radius.
    if (body.radius > self.radius * settings.superRadius && closestDistance(dx, dy, vx, vy, settings.superSeconds * 60) < (body.radius + self.radius * settings.superRadius) * 6) supermassiveSafe = false;
    if (body.radius >= self.radius) {
      threats.push({ body, distance, danger });
      threats.sort((a, b) => a.danger - b.danger);
      if (threats.length > 8) threats.pop();
    } else if (body.radius < self.radius) {
      const gap = Math.max(self.radius, distance - self.radius - body.radius);
      const foodValue = body.type === "fluctuation" ? self.mass * 0.04 : body.mass;
      const score = body.pickup === "hawking" ? 0 : foodValue / gap * (body.pickup && !self.storedBonus ? genes.itemValue : 1);
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
    let score = meal.score / (1 + Math.max(0, awaySpeed) / genes.awaySpeedScale);
    if (genes.foodMassWeight !== 1) score *= (1 + genes.foodMassWeight * body.mass / self.mass) / (1 + body.mass / self.mass);
    if (genes.distanceWeight !== 1) score *= (1 + distance / self.radius) / (1 + genes.distanceWeight * distance / self.radius);
    if (genes.targetCommitment > 0 && body.id === self.aiTargetId) score *= 1 + genes.targetCommitment;
    // Prefer our current course when opportunities are similar.
    const ownSpeed = Math.sqrt(self.velocity.x ** 2 + self.velocity.y ** 2);
    if (ownSpeed > 0) score *= 1 + genes.coursePreference * Math.max(0, (self.velocity.x * dx + self.velocity.y * dy) / (ownSpeed * distance));
    const arrival = Math.min(genes.pursuitTicks, distance / genes.preferredSpeed);
    const x = body.position.x + body.velocity.x * arrival, y = body.position.y + body.velocity.y * arrival;
    if (Math.sqrt(x * x + y * y) + self.radius > arenaRadius * 0.9) score *= 0.1;
    for (const { body: predator } of threats) {
      const px = predator.position.x + predator.velocity.x * arrival - x;
      const py = predator.position.y + predator.velocity.y * arrival - y;
      const reach = (self.radius + predator.radius) * 4;
      if (px * px + py * py < reach * reach) score *= genes.guardedFoodValue;
    }
    if (score > preyScore) { prey = body; preyScore = score; preyDistance = meal.distance; }
  }
  if (genes.targetCommitment > 0) self.aiTargetId = prey?.id;
  const threat = threats.find(t => t.danger < (t.body.radius + self.radius) * genes.dangerRange)?.body;
  const decision: Input = {};
  if (self.storedBonus && !self.activeBonus) {
    const nearbyFood = prey && preyDistance < (self.radius + prey.radius) * genes.itemRange;
    const speed = Math.sqrt(self.velocity.x ** 2 + self.velocity.y ** 2);
    const useful = self.storedBonus === "pulse" ? threats.some(t => t.danger < (self.radius + t.body.radius) * genes.shieldRange)
      : self.storedBonus === "jet" ? !!threat || !!prey && preyDistance > (self.radius + prey.radius) * 4
      : self.storedBonus === "supermassive" ? supermassiveSafe && !!nearbyFood && speed < 4 && Math.sqrt(self.position.x ** 2 + self.position.y ** 2) + speed * settings.superSeconds * 60 < arenaRadius * 0.8
      : !threat && !!nearbyFood;
    if (useful) decision.activateBonus = true;
  }
  if (self.radius < Math.max(30, settings.minShotRadius) || self.activeBonus === "supermassive" || decision.activateBonus && self.storedBonus === "supermassive") return decision;
  let dx: number, dy: number;
  if (threat) {
    dx = self.position.x - threat.position.x; dy = self.position.y - threat.position.y;
    const speed = Math.sqrt(self.velocity.x ** 2 + self.velocity.y ** 2);
    const away = Math.sqrt(dx * dx + dy * dy);
    // Preserve safe tangential/outward momentum instead of braking to flee radially.
    if (away > 0 && away < (self.radius + threat.radius) * 3 && speed > 1 && self.velocity.x * dx + self.velocity.y * dy >= 0) {
      dx = self.velocity.x + dx / away * genes.safeMomentumPull; dy = self.velocity.y + dy / away * genes.safeMomentumPull;
    }
  } else if (Math.sqrt((self.position.x + self.velocity.x * 60) ** 2 + (self.position.y + self.velocity.y * 60) ** 2) > arenaRadius * genes.borderFraction) {
    dx = -self.position.x; dy = -self.position.y;
  } else if (prey) {
    const intercept = Math.max(15, Math.min(genes.pursuitTicks, preyDistance / genes.preferredSpeed));
    dx = prey.position.x + prey.velocity.x * intercept - self.position.x;
    dy = prey.position.y + prey.velocity.y * intercept - self.position.y;
  } else return decision;
  const distance = Math.sqrt(dx * dx + dy * dy);
  if (distance === 0) return decision;
  const speed = threat ? Math.max(12, Math.sqrt(self.velocity.x ** 2 + self.velocity.y ** 2)) : Math.min(genes.preferredSpeed, Math.max(genes.minimumSpeed, (distance - self.radius - (prey?.radius ?? 0)) / 60));
  const desiredX = dx / distance * speed, desiredY = dy / distance * speed;
  const steerX = desiredX - self.velocity.x, steerY = desiredY - self.velocity.y;
  const correction = Math.sqrt(steerX * steerX + steerY * steerY);
  if (correction < genes.velocityTolerance && !threat) return decision;
  const jet = self.activeBonus === "jet" || decision.activateBonus && self.storedBonus === "jet";
  const postShotRadius = radiusFromMass(self.mass * (1 - settings.shotMass));
  const projectileRadius = radiusFromMass(self.mass * settings.shotMass);
  const recoil = projectileRadius * settings.shotMass / (1 - settings.shotMass) * settings.shotSpeed * (jet ? settings.jetBoost : 1);
  // Matter is fuel: prefer gravity/coasting over marginal velocity corrections.
  // Without gravity, retain active pursuit; waiting cannot bring stationary food closer.
  const bigPrey = !threat && prey && prey.mass > self.mass * genes.valuableMassRatio && prey.radius < postShotRadius;
  const valuablePrey = bigPrey && prey && preyDistance > (self.radius + prey.radius) * 6;
  // Collect incoming food before steering for another target; firing can push it away.
  if (!threat && meals.some(({ body }) => closestDistance(body.position.x - self.position.x, body.position.y - self.position.y,
    body.velocity.x - self.velocity.x, body.velocity.y - self.velocity.y, genes.incomingFoodTicks) < (self.radius + body.radius) * 0.9) &&
    Math.sqrt((self.position.x + self.velocity.x * 60) ** 2 + (self.position.y + self.velocity.y * 60) ** 2) + self.radius < arenaRadius * genes.borderFraction) return decision;
  const shotCost = (settings.gravity === 0 ? 2 : valuablePrey ? genes.pursuitShotCost : genes.shotCost) * settings.shotMass / 0.05;
  // ponytail: linear one-second forecasts omit gravity; replan at 2 Hz before adding a physics rollout.
  const score = (vx: number, vy: number, firing: boolean) => {
    let cost = (vx - desiredX) ** 2 + (vy - desiredY) ** 2 + (firing ? shotCost : 0);
    for (const { body } of threats) {
      const clearance = closestDistance(body.position.x - self.position.x, body.position.y - self.position.y, body.velocity.x - vx, body.velocity.y - vy, genes.predictionTicks);
      const danger = Math.max(0, 1 - clearance / ((self.radius + body.radius) * 4));
      cost += genes.dangerCost * danger * danger;
    }
    const edge = Math.sqrt((self.position.x + vx * 60) ** 2 + (self.position.y + vy * 60) ** 2) + self.radius;
    const overflow = Math.max(0, (edge - arenaRadius * genes.borderFraction) / Math.max(self.radius, arenaRadius * 0.15));
    return cost + 1600 * overflow * overflow;
  };
  const coastCost = score(self.velocity.x, self.velocity.y, false);
  let best = coastCost;
  const ideal = correction === 0 ? 0 : (steerY > 0 ? -1 : 1) * acos(-steerX / correction);
  const availableCharge = shotChargeAt((self.aiChargeTicks ?? 0) * 1000 / 60, settings);
  if (!threat && availableCharge < genes.waitForCharge) return decision;
  const angles = [ideal, ...Array.from({ length: 8 }, (_, i) => -Math.PI + i * Math.PI / 4)];
  for (const charge of [...new Set([0, Math.min(50, availableCharge), availableCharge])]) for (const angle of angles) {
    // Extra power is not a reason to start spending on a marginal correction.
    if (charge > 0 && !threat && !valuablePrey && (!prey || preyDistance < (self.radius + prey.radius) * 4 || score(self.velocity.x - cos(angle) * recoil, self.velocity.y - sin(angle) * recoil, true) >= coastCost)) continue;
    if (!threat && prey && prey.radius >= postShotRadius) continue;
    const boost = shotSpeedMultiplier(charge, settings);
    // Prefer not to feed predators, but keep lifesaving shots possible.
    let feedingCost = 0;
    const projectileSpeed = projectileRadius * settings.shotSpeed * (jet ? settings.jetBoost : 1) * boost;
    for (const { body } of threats) {
      const clearance = closestDistance(body.position.x - self.position.x - cos(angle) * self.radius * 2,
        body.position.y - self.position.y - sin(angle) * self.radius * 2,
        body.velocity.x - self.velocity.x - cos(angle) * projectileSpeed,
        body.velocity.y - self.velocity.y - sin(angle) * projectileSpeed, 60);
      if (clearance < body.radius + projectileRadius) feedingCost += genes.predatorFeedingCost * settings.shotMass / 0.05;
    }
    const cost = feedingCost + score(self.velocity.x - cos(angle) * recoil * boost, self.velocity.y - sin(angle) * recoil * boost, true) + (charge > 0 ? genes.chargeBenefit : 0);
    if (cost < best) { best = cost; decision.clickDirection = angle; decision.shotCharge = charge; }
  }
  return decision;
}
