import { JsonValue } from "type-fest";

export interface NetplayState {
  tick(playerInputs: Map<NetplayPlayer, NetplayInput>, frameNumber: number): void;

  serialize(): JsonValue;

  deserialize(value: JsonValue): void;
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

  serialize(): JsonValue;

  deserialize(value: JsonValue): void;
}
/**
 * A NetplayPlayer object represents one player in a game.
 */
export class NetplayPlayer {
  id: number;
  isLocal: boolean;
  isHost: boolean;

  constructor(id: number, isLocal: boolean, isHost: boolean) {
    this.id = id;
    this.isLocal = isLocal;
    this.isHost = isHost;
  }
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
