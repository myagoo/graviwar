import type { BlackHole, Input } from "./Game";
import { acos } from "./deterministic-math";

// One scan per rival, twice a second. Equal scores keep snapshot-array order.
export function aiDecision(self: BlackHole, bodies: BlackHole[], arenaRadius: number): Input {
  let prey: BlackHole | undefined, threat: BlackHole | undefined;
  let preyScore = 0, preyDistance = Infinity, threatDistance = Infinity, threatActualDistance = Infinity;
  for (const body of bodies) {
    if (body === self || body.radius < 1) continue;
    const dx = body.position.x - self.position.x, dy = body.position.y - self.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    // Anticipate half a second of relative motion instead of reacting only at contact.
    const futureX = dx + (body.velocity.x - self.velocity.x) * 30;
    const futureY = dy + (body.velocity.y - self.velocity.y) * 30;
    const dangerDistance = Math.min(distance, Math.sqrt(futureX * futureX + futureY * futureY));
    if (body.radius > self.radius * 1.1 && dangerDistance < (body.radius + self.radius) * 6 && dangerDistance < threatDistance) {
      threat = body; threatDistance = dangerDistance; threatActualDistance = distance;
    } else if (body.radius < self.radius * 0.85) {
      const gap = Math.max(self.radius, distance - self.radius - body.radius);
      const score = body.mass / gap * (body.pickup && !self.storedBonus ? 4 : 1);
      if (score > preyScore) { prey = body; preyScore = score; preyDistance = distance; }
    }
  }
  const decision: Input = {};
  if (self.storedBonus && !self.activeBonus) {
    const nearbyFood = prey && preyDistance < (self.radius + prey.radius) * 6;
    const speed = Math.sqrt(self.velocity.x ** 2 + self.velocity.y ** 2);
    const useful = self.storedBonus === "pulse" ? !!threat && threatActualDistance < (self.radius + threat.radius) * 4
      : self.storedBonus === "jet" ? !!threat || !!prey && preyDistance > (self.radius + prey.radius) * 4
      : self.storedBonus === "supermassive" ? !threat && !!nearbyFood && speed < 4
      : !threat && !!nearbyFood;
    if (useful) decision.activateBonus = true;
  }
  if (self.radius < 30 || self.activeBonus === "supermassive" || decision.activateBonus && self.storedBonus === "supermassive") return decision;
  let dx: number, dy: number;
  if (threat) {
    dx = self.position.x - threat.position.x; dy = self.position.y - threat.position.y;
  } else if (Math.sqrt((self.position.x + self.velocity.x * 30) ** 2 + (self.position.y + self.velocity.y * 30) ** 2) > arenaRadius * 0.85) {
    dx = -self.position.x; dy = -self.position.y;
  } else if (prey) {
    dx = prey.position.x + prey.velocity.x * 30 - self.position.x;
    dy = prey.position.y + prey.velocity.y * 30 - self.position.y;
  } else return decision;
  const distance = Math.sqrt(dx * dx + dy * dy);
  if (distance === 0) return decision;
  const speed = threat ? 12 : Math.min(6, Math.max(1.5, (distance - self.radius - (prey?.radius ?? 0)) / 60));
  // Correct drift and brake near food; coast when another shot would waste mass.
  const steerX = dx / distance * speed - self.velocity.x;
  const steerY = dy / distance * speed - self.velocity.y;
  const correction = Math.sqrt(steerX * steerX + steerY * steerY);
  if (correction < 2) return decision;
  const angle = acos(-steerX / correction);
  decision.clickDirection = steerY > 0 ? -angle : angle;
  return decision;
}
