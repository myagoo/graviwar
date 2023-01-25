import { getDirection } from "../utils";
import { NetplayInput } from "./types";

export class DefaultInput extends NetplayInput<DefaultInput> {
  clickDirection?: number;
}

export class DefaultInputReader {
  canvas: HTMLCanvasElement;
  clickDirection?: number;

  constructor(
    canvas: HTMLCanvasElement,
  ) {
    this.canvas = canvas;
    canvas.addEventListener("click", (event: MouseEvent) => {
      const direction = getDirection(
        {
          x: canvas.offsetWidth / 2,
          y: canvas.offsetHeight / 2,
        },
        {
          x: event.offsetX,
          y: event.offsetY,
        }
      );
      this.clickDirection = direction;
    });
  }

  getInput(): DefaultInput {
    let input = new DefaultInput();
    input.clickDirection = this.clickDirection;
    delete this.clickDirection;
    return input;
  }
}
