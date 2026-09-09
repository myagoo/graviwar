import { createRandomGenerator, type Vector } from "./utils";
import type { Camera } from "./Camera";

export const HOLE_COLORS = {
  local: "#91d8ff",
  player: "#d4adff",
  smaller: "#ffc983",
  larger: "#ff756a",
};

// A separate, constant visual seed never consumes the simulation's random stream.
const random = createRandomGenerator("graviwar-background-v1");
const stars = Array.from({ length: 9000 }, () => ({
  x: random.range(-24000, 24000), y: random.range(-24000, 24000),
  size: random.range(0.8, 1.8), light: random.range(0.3, 0.85),
}));

const starCells = new Map<string, typeof stars>();
for (const star of stars) {
  const key = `${Math.floor(star.x / 3000)},${Math.floor(star.y / 3000)}`;
  if (!starCells.has(key)) starCells.set(key, []);
  starCells.get(key)!.push(star);
}

export function drawStars(ctx: CanvasRenderingContext2D, camera: Camera) {
  const { left, right, top, bottom } = camera.viewport;
  ctx.save();
  ctx.fillStyle = "#dce8ff";
  // Fade with projected area as zooming out packs more stars onto the screen.
  const brightness = Math.min(1, (camera.viewport.scale[0] / 0.25) ** 2);
  // Repeat the fixed field for larger arenas; thin distant cells at extreme zoom.
  const stride = Math.max(1, Math.ceil((right - left) / 48000));
  for (let y = Math.floor(top / 3000 / stride) * stride; y <= Math.floor(bottom / 3000); y += stride) {
    for (let x = Math.floor(left / 3000 / stride) * stride; x <= Math.floor(right / 3000); x += stride) {
      const cellX = ((x + 8) % 16 + 16) % 16 - 8;
      const cellY = ((y + 8) % 16 + 16) % 16 - 8;
      for (const source of starCells.get(`${cellX},${cellY}`) || []) {
        const star = { ...source, x: source.x + (x - cellX) * 3000, y: source.y + (y - cellY) * 3000 };
        if (star.x < left || star.x > right || star.y < top || star.y > bottom) continue;
        const point = camera.worldToScreen(star);
        ctx.globalAlpha = star.light * brightness;
        ctx.fillRect(point.x, point.y, star.size, star.size);
        if (star.light > 0.82 && star.size > 1.6) {
          ctx.globalAlpha = 0.15 * brightness;
          ctx.fillRect(point.x - 2, point.y, 5, 1);
          ctx.fillRect(point.x, point.y - 2, 1, 5);
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
