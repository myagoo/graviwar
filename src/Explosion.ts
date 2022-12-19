import RAPIER from "@dimforge/rapier2d-compat";
import { Game } from "./Game";
import { drawCircle, getDirection, getDistance, Vector } from "./utils";

interface Effect {
  draw(): void;
}
export class Explosion implements Effect {
  private radius = 50;
  private origin: Vector;

  constructor(private game: Game, body: RAPIER.RigidBody, force: number) {
    const explosionShape = new RAPIER.Ball(this.game.settings.BLAST_RADIUS);
    const handles: number[] = [];

    this.game.world.intersectionsWithShape(
      body.translation(),
      0,
      explosionShape,
      (collider) => {
        handles.push(collider.parent()!.handle);
        return true;
      },
      RAPIER.QueryFilterFlags.EXCLUDE_FIXED,
      undefined,
      undefined,
      body
    );
    this.origin = body.translation();

    for (const handle of handles) {
      const body = this.game.world.getRigidBody(handle);
      try {
        const bodyPosition = body.translation();

        const direction = getDirection(bodyPosition, this.origin);

        const distance = getDistance(this.origin, body.translation());

        const forceMagnitude = Math.min(
          force / (distance * Math.sqrt(distance) + 0.15),
          500000000
        );

        console.log(forceMagnitude);

        body.applyImpulse(
          new RAPIER.Vector2(
            Math.sin(direction) * forceMagnitude,
            Math.cos(direction) * forceMagnitude
          ),
          true
        );
      } catch (error) {
        console.error(error);
      }
    }
    this.game.effects.push(this)
  }
  draw() {
    this.radius = Math.min(this.game.settings.BLAST_RADIUS, this.radius + 20);

    const alpha =
      1 -
      Math.round((this.radius / this.game.settings.BLAST_RADIUS) * 100) / 100;

    drawCircle(
      this.game.ctx,
      this.origin,
      this.radius,
      `rgba(255, 255, 255, ${alpha})`
    );

    if(!alpha){
      this.destroy()
    }
  }

  destroy(){
    this.game.effects.splice(this.game.effects.indexOf(this), 1);
  }
}
