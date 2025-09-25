import { NetplayInput, NetplayPlayer, NetplayGame } from "./netcode/types";

export interface NetGame extends NetplayGame {
  flushInputBuffer(): NetplayInput;
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
