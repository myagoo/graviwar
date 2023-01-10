import { Game, Object } from "./Game";
import { drawCircle, Vector } from "./utils";

export class Planet implements Object {
  public area: number;
  public force: Vector = {
    x: 0,
    y: 0,
  };

  constructor(
    private game: Game,
    public position: Vector,
    public velocity: Vector,
    public radius: number
  ) {
    this.area = radius * radius * Math.PI;

    this.game.objects.push(this);
    this.game.planets.push(this);
  }

  updateArea(intersection: number){
    this.area += intersection
    this.radius = Math.sqrt(this.area / Math.PI)
  }

  loop() {}

  draw() {
    const position = this.position;
    const radius = this.radius;
    const isSmaller = this.game.hero && this.game.hero.area > this.area;
    drawCircle(this.game.ctx, position, radius, isSmaller ? "green" : "red");
  }

  destroy() {
    this.game.objects.splice(this.game.objects.indexOf(this), 1);
    this.game.planets.splice(this.game.objects.indexOf(this), 1);
  }

  handleCollisionWith(object: Object, magnitude: number): void {}
}
