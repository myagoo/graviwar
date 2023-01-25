import * as autoserialize from "./autoserialize";
import { JSONObject, JSONValue } from "./json";

export abstract class NetplayState<TInput extends NetplayInput<TInput>> {
  abstract tick(
    playerInputs: Map<NetplayPlayer, TInput>,
    frameNumber: number
  ): void;

  /**
   * By default, use the auto serializer.
   */
  serialize(): JSONValue {
    return autoserialize.serialize(this);
  }

  /**
   * By default, use the auto deserializer.
   */
  deserialize(value: JSONValue): void {
    autoserialize.deserialize(value as JSONObject, this);
  }
}

export abstract class NetplayInput<TInput extends NetplayInput<TInput>> {
  /**
   * By default, the prediction is to just use the same value.
   */
  predictNext(): TInput {
    // @ts-ignore
    return this;
  }

  /**
   * By default, use the auto serializer.
   */
  serialize(): JSONValue {
    return autoserialize.serialize(this);
  }

  /**
   * By default, use the auto deserializer.
   */
  deserialize(value: JSONValue): void {
    autoserialize.deserialize(value as JSONObject, this);
  }
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
