import { sin, cos } from "./deterministic-math";
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
