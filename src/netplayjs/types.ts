import { JsonValue } from "type-fest";
import { NetplayPlayer, NetplayState } from "./netcode/types";

export interface NetGame extends NetplayState {
  draw(canvas: HTMLCanvasElement, frameNumber: number): void;
  destroy(): void;
}

export interface GameConstructor {
  timestep: number;
  new (
    canvas: HTMLCanvasElement,
    players: Array<NetplayPlayer>,
    seed: string
  ): NetGame;
}

export interface Wrapper {
  start(): void;
  destroy(): void;
}

export interface WrapperConstructor {
  new (
    gameClass: GameConstructor,
    canvas: HTMLCanvasElement,
  ): Wrapper;
}

export interface InputData {
  type: "input";
  frame: number;
  input: {
    clickDirection?: number;
  }
}

export interface StateData {
  type: "state";
  frame: number;
  state: JsonValue;
}
