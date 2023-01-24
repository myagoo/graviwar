import random from "random-seed";

export type Vector = {
  x: number;
  y: number;
};

export const createRandomGenerator = (seed: string) => {
  const generator = random.create(seed);
  return {
    range(min: number, max: number) {
      return generator.random() * (max - min) + min;
    },
    angle() {
      return this.range(0, 2 * Math.PI);
    },
    vector(min: number, max: number) {
      const direction = this.angle();

      const distance = this.range(min, max);

      return {
        x: Math.cos(direction) * distance,
        y: Math.sin(direction) * distance,
      };
    },
  };
};

export const getGravitationalForce = (
  gravitationalConstant: number,
  mass1: number,
  mass2: number,
  distance: number,
) => {
  const force = gravitationalConstant *
    ((mass1 * mass2) / (distance * distance));
  //const force = gravitationalConstant * ((mass1 * mass2) / (distance * Math.sqrt(distance) + 0.15));
  return force;
};

export const getDistance = (position1: Vector, position2: Vector) => {
  return Math.sqrt(
    Math.pow(position1.x - position2.x, 2) +
      Math.pow(position1.y - position2.y, 2),
  );
};

export const getDistanceFromCenter = (position: Vector) => {
  return Math.sqrt(Math.pow(position.x, 2) + Math.pow(position.y, 2));
};

export const getDirection = (position1: Vector, position2: Vector) => {
  return Math.atan2(position2.y - position1.y, position2.x - position1.x);
};

export function getIntersectionArea(
  position1: Vector,
  radius1: number,
  position2: Vector,
  radius2: number,
) {
  // Calculate the euclidean distance
  // between the two points
  const distance = getDistance(position1, position2);

  if (distance > radius1 + radius2) return 0;

  if (distance <= radius1 - radius2 && radius1 >= radius2) {
    return Math.floor(Math.PI * radius2 * radius2);
  }

  if (distance <= radius2 - radius1 && radius2 >= radius1) {
    return Math.floor(Math.PI * radius1 * radius1);
  }

  const alpha = Math.acos(
    (radius1 * radius1 + distance * distance - radius2 * radius2) /
      (2 * radius1 * distance),
  ) * 2;
  const beta = Math.acos(
    (radius2 * radius2 + distance * distance - radius1 * radius1) /
      (2 * radius2 * distance),
  ) * 2;
  const a1 = 0.5 * beta * radius2 * radius2 -
    0.5 * radius2 * radius2 * Math.sin(beta);
  const a2 = 0.5 * alpha * radius1 * radius1 -
    0.5 * radius1 * radius1 * Math.sin(alpha);
  return Math.floor(a1 + a2);
}

export const drawCircle = (
  ctx: CanvasRenderingContext2D,
  position: Vector,
  radius: number,
  color: string,
) => {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(position.x, position.y, radius, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
};

export const drawCuboid = (
  ctx: CanvasRenderingContext2D,
  position: Vector,
  halfExtents: Vector,
  color: string,
  rotation: number,
) => {
  ctx.save();
  ctx.fillStyle = color;
  ctx.translate(position.x, position.y);
  ctx.rotate(rotation);
  ctx.fillRect(
    -halfExtents.x,
    -halfExtents.y,
    halfExtents.x * 2,
    halfExtents.y * 2,
  );
  ctx.restore();
};

export const drawLine = (
  ctx: CanvasRenderingContext2D,
  startPosition: Vector,
  endPosition: Vector,
  color: string,
) => {
  ctx.lineWidth = 5;
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.moveTo(startPosition.x, startPosition.y);
  ctx.lineTo(endPosition.x, endPosition.y);
  ctx.stroke();
};

export type BodyMetadata = {
  color: string;
  positions?: Vector[];
  type: "hero" | "projectile" | "planet" | "star";
  mass: number;
};

export const scaleAt = (
  x: number,
  y: number,
  scaleBy: number,
  canvasInfos: { scale: number; x: number; y: number },
) => {
  // at pixel coords x, y scale by scaleBy
  canvasInfos.scale *= scaleBy;
  canvasInfos.x = x - (x - canvasInfos.x) * scaleBy;
  canvasInfos.y = y - (y - canvasInfos.y) * scaleBy;
};

export const toWorld = (
  { x, y }: Vector,
  canvasInfos: { scale: number; x: number; y: number },
) => {
  // convert to world coordinates
  x = (x - canvasInfos.x) / canvasInfos.scale;
  y = (y - canvasInfos.y) / canvasInfos.scale;
  return { x, y };
};

export const toScreen = (
  { x, y }: Vector,
  canvasInfos: { scale: number; x: number; y: number },
) => {
  x = x * canvasInfos.scale + canvasInfos.x;
  y = y * canvasInfos.scale + canvasInfos.y;
  return { x, y };
};
