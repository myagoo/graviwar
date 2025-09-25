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

export interface NetplayGame {
  flushInputBuffer(): NetplayInput;

  tick(
    playerInputs: Map<NetplayPlayer, NetplayInput>,
    frameNumber: number
  ): void;

  getFrozenSnapshot(): SerializableValue;

  rollbackToSnapshot(snapshot: SerializableValue): void;
}

/**
 * NetplayJS games are synchronized by sending inputs across the network.
 * The NetplayInput class represents a single input for a single frame. It can
 * be keyboard keys, mouse positions, etc. Basically any thing that exists outside
 * of the simulation of the game.
 */
export interface NetplayInput {
  isEmpty(): boolean;

  predictNext(): NetplayInput;

  equals(otherInput: NetplayInput): boolean;

  serialize(): SerializableValue;

  deserialize(value: SerializableValue): void;
}
/**
 * A NetplayPlayer object represents one player in a game.
 */
export class NetplayPlayer {
  constructor(
    private id: number,
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
  getID(): number {
    return this.id;
  }
}
