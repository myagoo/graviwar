import { BlackHole } from "./BlackHole";
import { Game } from "./Game";
import { drawCircle, getDirection, Vector } from "./utils";

export class Opponent extends BlackHole {
  constructor(
    protected game: Game,
    public position: Vector,
    public velocity: Vector,
    area: number
  ) {
    super(game, position, velocity, area);
  }

  expulse(direction: number) {
    const playerPosition = this.position;
    const playerVelocity = this.velocity;
    const playerRadius = this.radius;
    const playerArea = this.area;

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
  }

  draw() {
    const radius = this.radius;
    const position = this.position;
    drawCircle(this.game.ctx, position, radius, "pink");
  }
}
