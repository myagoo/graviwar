import type { Vector } from "./utils";
import type { Camera } from "./Camera";

export const HOLE_COLORS = {
  local: "#91d8ff",
  player: "#d4adff",
  smaller: "#ffc983",
  larger: "#ff756a",
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
  ctx.fillStyle = "#dce8ff";
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
