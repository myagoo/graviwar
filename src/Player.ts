import { BlackHole } from "./BlackHole";
import { Game } from "./Game";
import { drawCircle, getDirection, Vector } from "./utils";

export class Player extends BlackHole {
  private keys: Record<string, true> = {};

  constructor(
    protected game: Game,
    public position: Vector,
    public velocity: Vector,
    area: number
  ) {
    super(game, position, velocity, area);
    this.game.player = this;
    this.initHandlers();
  }

  clickHandler = (mdEvent: MouseEvent) => {
    if(this.radius <= 10){
      return
    }
    const playerPosition = this.position;
    const playerVelocity = this.velocity;
    const playerRadius = this.radius;
    const playerArea = this.area;

    const direction = getDirection(
      playerPosition,
      this.game.camera.screenToWorld({
        x: mdEvent.offsetX,
        y: mdEvent.offsetY,
      })
    );

    const projectilePosition = {
      x: playerPosition.x + playerRadius * 2 * Math.cos(direction),
      y: playerPosition.y + playerRadius * 2 * Math.sin(direction),
    };

    const projectileArea = playerArea / 10;

    const projectileVelocityFactor = Math.sqrt(projectileArea);

    const projectileVelocity = {
      x: playerVelocity.x + Math.cos(direction) * projectileVelocityFactor,
      y: playerVelocity.y + Math.sin(direction) * projectileVelocityFactor,
    };

    console.log("projectile velocity", projectileVelocity, projectileArea);

    new BlackHole(
      this.game,
      projectilePosition,
      projectileVelocity,
      projectileArea
    );

    const playerVelocityFactor = Math.sqrt(projectileVelocityFactor);

    this.velocity.x -= projectileVelocity.x / playerVelocityFactor;
    this.velocity.y -= projectileVelocity.y / playerVelocityFactor;

    this.area -= projectileArea;
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

  draw() {
    const radius = this.radius;
    const position = this.position;
    drawCircle(this.game.ctx, position, radius, "blue");
  }

  destroy() {
    super.destroy();
    this.game.canvas.removeEventListener("keydown", this.keydownHandler);
    this.game.canvas.removeEventListener("keyup", this.keyupHandler);
    this.game.canvas.removeEventListener("click", this.clickHandler);
    delete this.game.player;
    alert("YOU LOST MOFO");
  }
}
