import { Game, Object } from "./Game";
import { Planet } from "./Planet";
import { drawCircle, getDirection, Vector } from "./utils";

export class Hero implements Object {
  public area: number;
  public force: Vector = {
    x: 0,
    y: 0,
  };

  keys: Record<string, true> = {};

  constructor(
    private game: Game,
    public position: Vector,
    public velocity: Vector,
    public radius: number
  ) {
    this.area = radius * radius * Math.PI;
    this.game.objects.push(this);
    this.game.hero = this;
    this.initHandlers();
  }

  clickHandler = (mdEvent: MouseEvent) => {
    const heroPosition = this.position;
    const heroVelocity = this.velocity;
    const heroRadius = this.radius;

    const direction = getDirection(
      heroPosition,
      this.game.camera.screenToWorld({
        x: mdEvent.offsetX,
        y: mdEvent.offsetY,
      })
    );

    const projectilePosition = {
      x: heroPosition.x + heroRadius * 2 * Math.cos(direction),
      y: heroPosition.y + heroRadius * 2 * Math.sin(direction),
    };

    const projectileVelocity = {
      x: heroVelocity.x + Math.cos(direction) * heroRadius,
      y: heroVelocity.y + Math.sin(direction) * heroRadius,
    };

    new Planet(this.game, projectilePosition, projectileVelocity, this.radius / 10);

    this.velocity.x -= projectileVelocity.x / (heroRadius / 2);
    this.velocity.y -= projectileVelocity.y / (heroRadius / 2);
  };

  keydownHandler = (event: KeyboardEvent) => {
    this.keys[event.code] = true;
  };

  keyupHandler = (event: KeyboardEvent) => {
    delete this.keys[event.code];
  };

  initHandlers() {
    this.game.canvas.addEventListener("keydown", this.keydownHandler);
    this.game.canvas.addEventListener("keyup", this.keyupHandler);

    this.game.canvas.addEventListener("click", this.clickHandler);
  }

  updateArea(intersection: number){
    this.area += intersection
    this.radius = Math.sqrt(this.area / Math.PI)
  }

  loop() {}
  draw() {
    const radius = this.radius;
    const position = this.position;
    drawCircle(this.game.ctx, position, radius, "blue");
  }
  destroy() {
    this.game.canvas.removeEventListener("keydown", this.keydownHandler);
    this.game.canvas.removeEventListener("keyup", this.keyupHandler);

    this.game.canvas.removeEventListener("click", this.clickHandler);

    this.game.objects.splice(this.game.objects.indexOf(this), 1);
    delete this.game.hero;
    alert('YOU LOST MOFO')
  }

  handleCollisionWith(object: Object, magnitude: number): void {}
}
