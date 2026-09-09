import { Game } from "../Game";
import { NetplayPlayer } from "./netcode/types";

export class LocalWrapper {
  frame = 0;
  seed = Math.random().toString();
  localPlayer: NetplayPlayer = { id: 0, isLocal: true };

  tickIntervalId?: number;
  drawRequestId?: number;

  constructor(public game: Game) {}

  start() {
    this.game.start([this.localPlayer], this.seed);

    this.tickIntervalId = window.setInterval(() => {
      this.frame++;
      const localInput = this.game.flushInputBuffer();
      this.game.tick(new Map([[this.localPlayer, localInput]]), this.frame);
    }, this.game.timestep);

    const loopDraw = (timestamp: DOMHighResTimeStamp) => {
      this.game.draw(timestamp, this.frame);
      this.drawRequestId = requestAnimationFrame(loopDraw);
    };

    this.drawRequestId = requestAnimationFrame(loopDraw);
  }

  destroy() {
    this.game.destroy();

    if (this.tickIntervalId) {
      clearInterval(this.tickIntervalId);
    }
    if (this.drawRequestId) {
      cancelAnimationFrame(this.drawRequestId);
    }
  }
}
