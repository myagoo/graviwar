import { getDirection } from "../utils";
import { NetplayInput } from "./types";

export class Input implements NetplayInput<Input> {
  clickDirection?: number;
  predictNext() {
    return new Input();
  }
  equals(otherInput: Input) {
    return this.clickDirection === otherInput.clickDirection;
  }
  serialize(): { clickDirection?: number } {
    return {
      clickDirection: this.clickDirection,
    };
  }
  deserialize(value: { clickDirection?: number }): void {
    this.clickDirection = value.clickDirection;
  }
}

export class InputReader {
  canvas: HTMLCanvasElement;
  clickDirection?: number;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    canvas.addEventListener("click", this.clickHandler);
  }

  getInput(): Input {
    let input = new Input();
    input.clickDirection = this.clickDirection;
    delete this.clickDirection;
    return input;
  }

  clickHandler = (event: MouseEvent) => {
    this.clickDirection = getDirection(
      {
        x: this.canvas.offsetWidth / 2,
        y: this.canvas.offsetHeight / 2,
      },
      {
        x: event.offsetX,
        y: event.offsetY,
      }
    );
  };

  destroy() {
    this.canvas.removeEventListener("click", this.clickHandler);
  }
}
