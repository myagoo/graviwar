import { NetplayGame, NetplayPlayer, SerializableValue } from "./netcode/types";
import { Wrapper } from "./types";

export class LocalWrapper implements Wrapper {
  frame = 0;
  seed = Math.random().toString();
  localPlayer: NetplayPlayer = { id: 0, isLocal: true };

  tickIntervalId?: number;
  drawRequestId?: number;

  constructor(public game: NetplayGame<SerializableValue>) {}

  start() {
    console.log("Starting local wrapper");
    this.game.start([this.localPlayer], this.seed);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- used for debugging
    let tickWihoutDraw = 0;

    this.tickIntervalId = window.setInterval(() => {
      tickWihoutDraw++;
      this.frame++;
      const localInput = this.game!.flushInputBuffer();
      // Tick our state with the new inputs, which may include predictions.
      this.game!.tick(new Map([[this.localPlayer, localInput]]), this.frame);
    }, this.game.timestep);

    const loopDraw = (timestamp: DOMHighResTimeStamp) => {
      // console.log(tickWihoutDraw)
      tickWihoutDraw = 0;

      this.game!.draw(timestamp, this.frame);
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
