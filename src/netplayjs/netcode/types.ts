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
  flushInputBuffer(): TInput | undefined;
  predictNextInput(frame: number, state: SerializableValue, previousInput: TInput | undefined): TInput | undefined;

  tick(
    playerInputs: Map<NetplayPlayer, TInput | undefined>,
    frameNumber: number
  ): void;
  draw(canvas: HTMLCanvasElement, frameNumber: number): void;

  getFrozenSnapshot(): SerializableValue;
  rollbackToSnapshot(snapshot: SerializableValue): void;

  destroy(): void;
}

/**
 * A NetplayPlayer object represents one player in a game.
 */
export class NetplayPlayer {
  constructor(
    private id: number | string,
    private isLocal: boolean,
    private isHost: boolean
  ) {}
  isLocalPlayer(): boolean {
    return this.isLocal;
  }
  isRemotePlayer(): boolean {
    return !this.isLocal;
  }
  isServer(): boolean {
    return this.isHost;
  }
  isClient(): boolean {
    return !this.isHost;
  }
  getID(): number | string {
    return this.id;
  }
}
