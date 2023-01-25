import { DataConnection } from "peerjs";
import { DefaultInput } from "./defaultinput";
import { NetplayPlayer, NetplayState } from "./types";

export type GameClass = {
  new (canvas: HTMLCanvasElement, players: Array<NetplayPlayer>, connection: DataConnection): NetGame;
  timestep: number;
};

export abstract class NetGame extends NetplayState<DefaultInput> {
  abstract draw(canvas: HTMLCanvasElement, frameNumber: number): void;
}
