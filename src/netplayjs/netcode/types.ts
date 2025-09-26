export type SerializableObject = { [Key in string]: SerializableValue } & {
  [Key in string]?: SerializableValue | undefined;
};
export type SerializableArray =
  | SerializableValue[]
  | readonly SerializableValue[];
export type SerializablePrimitive = string | number | boolean | null;
export type SerializableValue =
  | SerializablePrimitive
  | SerializableObject
  | SerializableArray;

export interface NetplayGame<TInput extends SerializableValue> {
  readonly timestep: number;
  flushInputBuffer(): TInput | undefined;
  predictNextInput(frameNumber: number, state: SerializableValue, previousInput: TInput | undefined): TInput | undefined;

  tick(
    playerInputs: Map<NetplayPlayer, TInput | undefined>,
    frameNumber: number
  ): void;
  draw(timestamp: DOMHighResTimeStamp, frameNumber: number): void;

  getFrozenSnapshot(): SerializableValue;
  rollbackToSnapshot(snapshot: SerializableValue): void;

  start(players: NetplayPlayer[], seed: string | number): void;
  destroy(): void;
}

/**
 * A NetplayPlayer object represents one player in a game.
 */
export interface NetplayPlayer {
  id: number | string;
  isLocal: boolean;
}
