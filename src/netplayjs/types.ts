import { NetplayPlayer, NetplayGame, SerializableValue } from "./netcode/types";

export interface GameConstructor {
  timestep: number;
  new (
    canvas: HTMLCanvasElement,
    players: Array<NetplayPlayer>,
    seed: string
  ): NetplayGame<SerializableValue>;
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
