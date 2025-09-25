import { NetplayGame, NetplayPlayer, SerializableValue } from "./netcode/types";
import { GameConstructor, Wrapper } from "./types";

export class LocalWrapper implements Wrapper {
  game?: NetplayGame<SerializableValue>;
  frame = 0;
  seed = Math.random().toString();
  localPlayer = new NetplayPlayer(0, true, true);

  tickIntervalId?: number;
  drawRequestId?: number;

  constructor(
    public gameClass: GameConstructor,
    public canvas: HTMLCanvasElement
  ) {}

  start() {
    console.log("Starting local wrapper");
    this.game = new this.gameClass(
      this.canvas,
      [new NetplayPlayer(0, true, true)],
      this.seed
    );

    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- used for debugging
    let tickWihoutDraw = 0;

    this.tickIntervalId = window.setInterval(() => {
      tickWihoutDraw++;
      this.frame++;
      const localInput = this.game!.flushInputBuffer();
      // Tick our state with the new inputs, which may include predictions.
      this.game!.tick(new Map([[this.localPlayer, localInput]]), this.frame);
    }, this.gameClass.timestep);

    const loopDraw = () => {
      // console.log(tickWihoutDraw)
      tickWihoutDraw = 0;

      this.game!.draw(this.canvas, this.frame);
      this.drawRequestId = requestAnimationFrame(loopDraw);
    };

    this.drawRequestId = requestAnimationFrame(loopDraw);
  }

  destroy() {
    this.game?.destroy();

    if (this.tickIntervalId) {
      clearInterval(this.tickIntervalId);
    }
    if (this.drawRequestId) {
      cancelAnimationFrame(this.drawRequestId);
    }
  }
}
