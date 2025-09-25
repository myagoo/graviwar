import { NetplayGame, SerializableValue } from "./netcode/types";

export interface Wrapper {
  start(): void;
  destroy(): void;
}

export interface WrapperConstructor {
  new (
    game: NetplayGame<SerializableValue>,
  ): Wrapper;
}
