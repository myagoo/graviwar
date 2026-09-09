import { sin, cos, acos } from "./deterministic-math";
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
        x: cos(direction) * distance,
        y: sin(direction) * distance,
      };
    },
    vectorFromCenter( max: number) {
      const direction = this.angle();

      const distance = Math.sqrt(this.range(0, max*max))

      return {
        x: cos(direction) * (distance),
        y: sin(direction) * distance,
      };
    },
  };
};

export const getDistance = (position1: Vector, position2: Vector) => {
  return Math.sqrt(
    (position1.x - position2.x) * (position1.x - position2.x) +
      (position1.y - position2.y) * (position1.y - position2.y),
  );
};

export const getDistanceFromCenter = (position: Vector) => {
  return Math.sqrt(position.x * position.x + position.y * position.y);
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

  const alpha = acos(
    (radius1 * radius1 + distance * distance - radius2 * radius2) /
      (2 * radius1 * distance),
  ) * 2;
  const beta = acos(
    (radius2 * radius2 + distance * distance - radius1 * radius1) /
      (2 * radius2 * distance),
  ) * 2;
  const a1 = 0.5 * beta * radius2 * radius2 -
    0.5 * radius2 * radius2 * sin(beta);
  const a2 = 0.5 * alpha * radius1 * radius1 -
    0.5 * radius1 * radius1 * sin(alpha);
  return Math.floor(a1 + a2);
}
