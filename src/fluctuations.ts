import { DEFAULT_MULTIPLAYER_SETTINGS } from "./solo-settings";
import type { BlackHole } from "./Game";
import type { Bonus } from "./bonuses";
import { massFromRadius } from "./mass";
import { createRandomGenerator } from "./utils";

// Stateless per-wave randomness survives rollback without an extra RNG snapshot.
export function spawnFluctuations(bodies: BlackHole[], seed: string, frame: number, arenaRadius: number, settings = DEFAULT_MULTIPLAYER_SETTINGS) {
  if (frame <= 0 || frame % (settings.waveSeconds * 60) !== 0) return;
  const random = createRandomGenerator(`${seed}:fluctuations:${frame}`);
  const count = Math.min(settings.waveCount, settings.waveCap - bodies.filter(body => body.type === "fluctuation" && body.mass > 0).length);
  const items: Bonus[] = ["surge", "surge", "pulse", "pulse", "jet", "jet"];
  const players = bodies.filter(body => body.playerId !== undefined && body.mass > 0);
  for (let i = 0; i < count; i++) {
    // Radiation joins after its delay; common items have equal weight.
    const pickup = frame >= settings.hawkingDelay * 60 && random.range(0, 1) < settings.hawkingChance ? "hawking" : (random.range(0, 6 + settings.superWeight) >= 6 ? "supermassive" : items[Math.floor(random.range(0, 6))]);
    let position = random.vectorFromCenter(Math.max(0, arenaRadius - settings.fluctuationRadius));
    if (players.length && random.range(0, 1) < settings.nearPlayerChance) {
      const player = players[Math.floor(random.range(0, players.length))];
      const offset = random.vector(player.radius * 3, player.radius * 8);
      position = { x: player.position.x + offset.x, y: player.position.y + offset.y };
      const distance = Math.sqrt(position.x ** 2 + position.y ** 2);
      const limit = Math.max(0, arenaRadius - settings.fluctuationRadius);
      if (distance > limit) { position.x *= limit / distance; position.y *= limit / distance; }
    }
    bodies.push({ type: "fluctuation", pickup, expiresAt: frame + settings.fluctuationSeconds * 60,
      position, velocity: { x: 0, y: 0 },
      radius: settings.fluctuationRadius, mass: massFromRadius(settings.fluctuationRadius) });
  }
}
