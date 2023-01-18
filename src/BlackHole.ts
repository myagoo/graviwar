import { Game } from "./Game";
import { drawCircle, Vector } from "./utils";

export class BlackHole {
  force: Vector = {
    x: 0,
    y: 0,
  };

  constructor(
    protected game: Game,
    public position: Vector,
    public velocity: Vector,
    area: number
  ) {
    this.area = area
    this.game.blackHoles.push(this);
  }

  private _area: number = 0

  get area(){
    return this._area
  }

  set area(newArea: number){
    this._area = newArea
    this.radius = Math.sqrt(newArea / Math.PI);
  }

  private _radius: number = 0

  get radius(){
    return this._radius
  }
  
  set radius(newRadius: number){
    this._radius = newRadius
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