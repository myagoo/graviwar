import type { BlackHole } from "./Game";
import type { Bonus } from "./bonuses";
import { massFromRadius } from "./mass";
import { createRandomGenerator } from "./utils";

// Stateless per-wave randomness survives rollback without an extra RNG snapshot.
export function spawnFluctuations(bodies: BlackHole[], seed: string, frame: number, arenaRadius: number) {
  if (frame <= 0 || frame % 240 !== 0) return;
  const random = createRandomGenerator(`${seed}:fluctuations:${frame}`);
  const count = Math.min(3, 24 - bodies.filter(body => body.type === "fluctuation" && body.mass > 0).length);
  const items: Bonus[] = ["surge", "surge", "pulse", "pulse", "jet", "jet", "supermassive"];
  const players = bodies.filter(body => body.playerId !== undefined && body.mass > 0);
  for (let i = 0; i < count; i++) {
    // Radiation joins the pool after a minute; normal item rarity stays 2:2:2:1.
    const pickup = frame >= 3600 && random.range(0, 1) < 0.2 ? "hawking" : items[Math.floor(random.range(0, items.length))];
    let position = random.vectorFromCenter(Math.max(0, arenaRadius - 4));
    if (players.length && random.range(0, 1) < 0.5) {
      const player = players[Math.floor(random.range(0, players.length))];
      const offset = random.vector(player.radius * 3, player.radius * 8);
      position = { x: player.position.x + offset.x, y: player.position.y + offset.y };
      const distance = Math.sqrt(position.x ** 2 + position.y ** 2);
      const limit = Math.max(0, arenaRadius - 4);
      if (distance > limit) { position.x *= limit / distance; position.y *= limit / distance; }
    }
    bodies.push({ type: "fluctuation", pickup, expiresAt: frame + 2700,
      position, velocity: { x: 0, y: 0 },
      radius: 4, mass: massFromRadius(4) });
  }
}
