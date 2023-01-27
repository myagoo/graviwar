import { InputReader } from "./defaultinput";
import {  GameConstructor, NetGame, NetplayPlayer, Wrapper } from "./types";

export class LocalWrapper implements Wrapper {
  game?: NetGame;
  frame = 0;
  seed = Math.random().toString();
  localPlayer = new NetplayPlayer(0, true, true);
  inputReader: InputReader;

  tickIntervalId?: NodeJS.Timer;
  drawRequestId?: number;

  constructor(
    public gameClass: GameConstructor,
    public canvas: HTMLCanvasElement,
    public timestep: number
  ) {
    this.inputReader = new InputReader(canvas);
  }

  start() {
    this.game = new this.gameClass(this.canvas, [new NetplayPlayer(0, true, true)], this.seed);

    this.tickIntervalId = setInterval(() => {
      this.frame++;
      let localInput = this.inputReader.getInput();
      // Tick our state with the new inputs, which may include predictions.
      this.game!.tick(new Map([[this.localPlayer, localInput]]), this.frame);
    }, this.timestep);

    const loopDraw = () => {
      this.game!.draw(this.canvas, this.frame);
      this.drawRequestId = requestAnimationFrame(loopDraw);
    };

    this.drawRequestId = requestAnimationFrame(loopDraw);
  }

  destroy() {
    this.inputReader.destroy();
    this.game?.destroy()
    this.tickIntervalId && clearInterval(this.tickIntervalId);
    this.drawRequestId &&
      cancelAnimationFrame(this.drawRequestId);
  }
}
