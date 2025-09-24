import { InputReader } from "./defaultinput";
import { NetplayPlayer } from "./netcode/types";
import { GameConstructor, NetGame, Wrapper } from "./types";

export class LocalWrapper implements Wrapper {
  game?: NetGame;
  frame = 0;
  seed = Math.random().toString();
  localPlayer = new NetplayPlayer(0, true, true);
  inputReader: InputReader;

  tickIntervalId?: number;
  drawRequestId?: number;

  constructor(
    public gameClass: GameConstructor,
    public canvas: HTMLCanvasElement,
  ) {
    this.inputReader = new InputReader(canvas);
  }

  start() {
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
      const localInput = this.inputReader.getInput();
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
    this.inputReader.destroy();
    this.game?.destroy();

    if (this.tickIntervalId) {
      clearInterval(this.tickIntervalId);
    }
    if (this.drawRequestId) {
      cancelAnimationFrame(this.drawRequestId);
    }
  }
}
