import { Input } from "./defaultinput";
import { JSONValue } from "./json";

export interface NetplayState<Input extends NetplayInput<Input>> {
  tick(playerInputs: Map<NetplayPlayer, Input>, frameNumber: number): void;

  serialize(): JSONValue;

  deserialize(value: JSONValue): void;
}

export interface NetplayInput<Input extends NetplayInput<Input>> {
  predictNext(): Input;

  equals(otherInput: NetplayInput<Input>): boolean;

  serialize(): JSONValue;

  deserialize(value: JSONValue): void;
}

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

export interface NetGame extends NetplayState<Input> {
  draw(canvas: HTMLCanvasElement, frameNumber: number): void;
  destroy(): void;
}

export interface GameConstructor {
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
    timestep: number
  ): Wrapper;
}
