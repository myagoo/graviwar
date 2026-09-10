import { BONUS_COLORS, PULSE_RADIUS_FACTOR } from "./bonuses";
import type { Vector } from "./utils";
import type { Camera } from "./Camera";

export const HOLE_COLORS = {
  local: BONUS_COLORS.jet,
  player: BONUS_COLORS.supermassive,
  smaller: BONUS_COLORS.surge,
  larger: BONUS_COLORS.pulse,
};

// Pure visual hashing: no simulation randomness or repeating star tiles.
function starNoise(seed: number) {
  seed = Math.imul(seed ^ (seed >>> 16), 0x7feb352d);
  seed = Math.imul(seed ^ (seed >>> 15), 0x846ca68b);
  return ((seed ^ (seed >>> 16)) >>> 0) / 4294967296;
}

export function drawStars(ctx: CanvasRenderingContext2D, camera: Camera) {
  const { left, right, top, bottom, scale } = camera.viewport;
  const brightness = Math.max(0.35, Math.min(1, scale[0] / 0.25));
  // Crossfade anchored fields of different densities instead of skipping cells.
  // Only two layers are visible, bounding work even far outside the arena.
  const detail = Math.max(0, Math.log2((right - left) / 48000));
  const level = Math.floor(detail), blend = detail - level;
  ctx.save();
  for (let layer = level; layer <= level + 1; layer++) {
    const opacity = layer === level ? 1 - blend : blend;
    if (opacity === 0) continue;
    const cellSize = 3000 * 2 ** layer;
    for (let y = Math.floor(top / cellSize); y <= Math.floor(bottom / cellSize); y++) {
      for (let x = Math.floor(left / cellSize); x <= Math.floor(right / cellSize); x++) {
        const seed = Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(layer + 1, 83492791);
        for (let i = 0; i < 32; i++) {
          const id = seed ^ Math.imul(i + 1, 2654435761);
          const star = {
            x: (x + starNoise(id)) * cellSize,
            y: (y + starNoise(id ^ 0x68bc21eb)) * cellSize,
          };
          if (star.x < left || star.x > right || star.y < top || star.y > bottom) continue;
          const point = camera.worldToScreen(star);
          const size = 1 + starNoise(id ^ 0x02e5be93);
          const light = 0.5 + starNoise(id ^ 0x967a889b) * 0.5;
          // Mostly white, with rare, softly tinted stars; color stays fixed in world space.
          const tint = starNoise(id ^ 0x51f2a9c7);
          ctx.fillStyle = tint < 0.85 ? "#f1f0ee" : tint < 0.91 ? "#f3d6b5" : tint < 0.95 ? "#edbeb8" : "#c8daef";
          ctx.globalAlpha = light * brightness * opacity;
          ctx.fillRect(point.x, point.y, size, size);
          if (light > 0.82 && size > 1.6) {
            ctx.globalAlpha = 0.15 * brightness * opacity;
            ctx.fillRect(point.x - 2, point.y, 5, 1);
            ctx.fillRect(point.x, point.y - 2, 1, 5);
          }
        }
      }
    }
  }
  ctx.restore();
}

const sprites = new Map<string, HTMLCanvasElement>();

function holeSprite(color: string, size = 384): HTMLCanvasElement {
  const key = color + size;
  const cached = sprites.get(key);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  if (size !== 384) {
    ctx.drawImage(holeSprite(color), 0, 0, size, size);
    sprites.set(key, canvas);
    return canvas;
  }
  ctx.translate(192, 192);
  // The opaque event horizon has radius 80; decorative light extends beyond it.
  const glow = ctx.createRadialGradient(0, 0, 76, 0, 0, 184);
  glow.addColorStop(0, color + "88");
  glow.addColorStop(0.2, color + "30");
  glow.addColorStop(0.65, color + "0b");
  glow.addColorStop(1, color + "00");
  ctx.fillStyle = glow;
  ctx.fillRect(-192, -192, 384, 384);

  ctx.save();
  ctx.rotate(-0.24);
  for (let radius = 150; radius >= 84; radius -= 3) {
    ctx.beginPath();
    ctx.ellipse(0, 0, radius, radius * 0.48, 0, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.04 + (150 - radius) / 600;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  ctx.restore();

  ctx.beginPath();
  ctx.arc(0, 0, 80, 0, Math.PI * 2);
  ctx.fillStyle = "#000000";
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // An asymmetric bright arc gives the ring depth without animating the physics.
  const ring = ctx.createLinearGradient(-80, -80, 80, 80);
  ring.addColorStop(0, "#ffffff");
  ring.addColorStop(0.4, color);
  ring.addColorStop(1, color + "18");
  ctx.beginPath();
  ctx.arc(0, 0, 83, 0, Math.PI * 2);
  ctx.strokeStyle = ring;
  ctx.lineWidth = 3;
  ctx.stroke();
  sprites.set(key, canvas);
  return canvas;
}

export function drawBlackHole(ctx: CanvasRenderingContext2D, position: Vector, radius: number, color: string, pixelRadius = radius) {
  if (pixelRadius < 3) {
    ctx.beginPath();
    ctx.arc(position.x, position.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = "#000000";
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = radius / Math.max(pixelRadius, 0.5);
    ctx.stroke();
    return;
  }
  const extent = radius * 2.4;
  ctx.drawImage(holeSprite(color, pixelRadius < 8 ? 48 : pixelRadius < 24 ? 128 : 384), position.x - extent, position.y - extent, extent * 2, extent * 2);
}

// Analytic visual particles: no simulation RNG, particle allocation, or physics state.
export function drawBonusEffect(ctx: CanvasRenderingContext2D, position: Vector, radius: number,
  effect: "surge" | "pulse" | "jet" | "supermassive", age: number, scale: number,
  heading = 0, reducedMotion = false) {
  if (age < 0 || (effect === "pulse" && age >= 48)) return;
  const time = reducedMotion ? 18 : age;
  const r = radius * scale;
  const reach = effect === "pulse" ? r * PULSE_RADIUS_FACTOR : Math.max(r * 1.8, Math.min(effect === "supermassive" ? 240 : 150, Math.max(effect === "supermassive" ? 150 : 0, r * 5 + 40)));
  const envelope = effect === "pulse" ? 1 - age / 48 : Math.min(1, (age + 1) / 12);
  ctx.save();ctx.translate(position.x, position.y);ctx.scale(1 / scale, 1 / scale);
  ctx.globalAlpha = envelope;
  const color = BONUS_COLORS[effect];

  if (effect === "supermassive") {
    // A dark lens, luminous accretion disk, and collapsing rings signal the 10x pull.
    const glow = ctx.createRadialGradient(0, 0, r, 0, 0, reach);
    glow.addColorStop(0, color + "60");glow.addColorStop(0.35, color + "25");glow.addColorStop(1, "#00000000");
    ctx.fillStyle = glow;ctx.beginPath();ctx.arc(0, 0, reach, 0, Math.PI * 2);ctx.fill();
    ctx.save();ctx.rotate(-0.35);
    for (let i = 0; i < 4; i++) {
      ctx.strokeStyle = i % 2 ? color : "#ffffff";
      ctx.lineWidth = i === 0 ? 3 : 1;
      ctx.globalAlpha = envelope * (0.65 - i * 0.12);
      ctx.beginPath();ctx.ellipse(0, 0, r + (reach - r) * (0.45 + i * 0.08), Math.max(r * 0.45, 5) + i * 3, 0, 0, Math.PI * 2);ctx.stroke();
    }
    ctx.restore();
    for (let i = 0; i < 3; i++) {
      const phase = (time / 72 + i / 3) % 1;
      ctx.globalAlpha = envelope * (1 - phase) * 0.3;
      ctx.strokeStyle = color;ctx.lineWidth = 1.5;
      ctx.beginPath();ctx.arc(0, 0, r + (reach - r) * (1 - phase), 0, Math.PI * 2);ctx.stroke();
    }
  }
  if (effect === "pulse") {
    ctx.strokeStyle = color;ctx.lineWidth = 2;
    ctx.globalAlpha = envelope * 0.75;
    ctx.beginPath();ctx.arc(0, 0, r + (reach - r) * Math.min(1, time / 40), 0, Math.PI * 2);ctx.stroke();
  }
  const count = reducedMotion ? 12 : effect === "supermassive" ? 64 : 32;
  ctx.strokeStyle = color;ctx.lineWidth = effect === "supermassive" ? 1.7 : 1.4;
  for (let i = 0; i < count; i++) {
    const seed = starNoise(i + 701);
    const phase = effect === "pulse" ? Math.min(1, time / 48) : (time / (effect === "jet" ? 35 : 90) + seed) % 1;
    const inward = effect === "surge" || effect === "supermassive";
    const distance = r * 1.1 + (reach - r * 1.1) * (inward ? 1 - phase : phase);
    const angle = effect === "jet" ? heading + Math.PI + (seed - 0.5) * 0.35
      : seed * Math.PI * 2 + (effect === "supermassive" ? phase * 1.7 : 0);
    const tailDistance = Math.max(r, distance + (inward ? 1 : -1) * (4 + seed * 9));
    const tailAngle = angle - (effect === "supermassive" ? 0.035 : 0);
    ctx.globalAlpha = envelope * (effect === "pulse" ? 0.85 : Math.sin(phase * Math.PI) * 0.85);
    ctx.beginPath();ctx.moveTo(Math.cos(tailAngle) * tailDistance, Math.sin(tailAngle) * tailDistance);
    ctx.lineTo(Math.cos(angle) * distance, Math.sin(angle) * distance);ctx.stroke();
  }
  ctx.restore();
}

// Screen-sized dots remain visible even when their physical radius is tiny.
export function drawFluctuation(ctx: CanvasRenderingContext2D, position: Vector, scale: number, frame: number, radiation: boolean, reducedMotion: boolean) {
  ctx.save();
  ctx.fillStyle = radiation ? "#ffb969" : "#7cffda";
  const pulse = reducedMotion ? 1 : 0.85 + Math.sin(frame * 0.08 + position.x) * 0.15;
  for (const [radius, alpha] of [[9, 0.08], [5, 0.2], [2, 0.95]]) {
    ctx.globalAlpha = alpha * pulse;
    ctx.beginPath();ctx.arc(position.x, position.y, radius / scale, 0, Math.PI * 2);ctx.fill();
  }
  ctx.restore();
}

export function drawHawkingRadiation(ctx: CanvasRenderingContext2D, position: Vector, radius: number, scale: number, ticks: number, reducedMotion: boolean) {
  ctx.save();ctx.fillStyle = "#ffb969";
  for (let i = 0; i < 20; i++) {
    const phase = reducedMotion ? 0.5 : ((300 - ticks) / 40 + i / 20) % 1;
    const angle = i * 2.399963;
    const distance = radius + phase * Math.max(radius, 45 / scale);
    ctx.globalAlpha = 1 - phase;
    ctx.beginPath();ctx.arc(position.x + Math.cos(angle) * distance, position.y + Math.sin(angle) * distance, 1.5 / scale, 0, Math.PI * 2);ctx.fill();
  }
  ctx.restore();
}
