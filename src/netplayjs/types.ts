import { NetplayGame, SerializableValue } from "./netcode/types";
export interface InputData {
  type: "input";
  frame: number;
  input: SerializableValue | undefined;
  playerID: number | string;
}

export interface VisibilityData {
  type: "visibility-state";
  value: DocumentVisibilityState;
  playerID: number | string;
}

export interface PingRequestData {
  type: "ping-req";
  sent_time: number;
  playerID: number | string;
}
export interface PingResponseData {
  type: "ping-resp";
  sent_time: number;
  playerID: number | string;
}

export type Data = InputData | VisibilityData | PingRequestData | PingResponseData;

export interface Wrapper {
  start(): void;
  destroy(): void;
}

export interface WrapperConstructor {
  new (
    game: NetplayGame<SerializableValue>,
  ): Wrapper;
}
