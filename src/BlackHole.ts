import { Game } from "./Game";
import { drawCircle, Vector } from "./utils";

export class BlackHole {
  constructor(
    protected game: Game,
    public position: Vector,
    public velocity: Vector,
    area: number
  ) {
    this.area = area;
    this.game.blackHoles.push(this);
  }

  protected _area: number = 0;

  get area() {
    return this._area;
  }

  set area(newArea: number) {
    this._area = newArea;
    // this.radius = Math.sqrt(newArea / (4 * Math.PI));
    this.radius = Math.sqrt(newArea / Math.PI);
  }

  protected _radius: number = 0;

  get radius() {
    return this._radius;
  }

  set radius(newRadius: number) {
    this._radius = newRadius;
    // this._area = 4 * Math.pow(newRadius, 2) * Math.PI;
    this._area = Math.pow(newRadius, 2) * Math.PI;
  }

  draw() {
    const position = this.position;
    const radius = this.radius;
    const isSmaller = this.game.player && this.game.player.area > this.area;
    drawCircle(this.game.ctx, position, radius, isSmaller ? "green" : "red");
  }

  destroy() {
    this.game.blackHoles.splice(this.game.blackHoles.indexOf(this), 1);
  }
}
