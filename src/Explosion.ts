import RAPIER from "@dimforge/rapier2d-compat";
import { drawCircle, getDirection, getDistance, Vector } from "./utils";

const BLAST_RADIUS = 500;
const BLAST_FORCE = 5000000000000;

export class Explosion {
  private radius = 50;
  private origin: Vector;

  constructor(
    private world: RAPIER.World,
    private ctx: CanvasRenderingContext2D,
    body: RAPIER.RigidBody
  ) {
    const explosionShape = new RAPIER.Ball(BLAST_RADIUS);
    const handles: number[] = [];

    this.world.intersectionsWithShape(
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
      const body = world.getRigidBody(handle);
      try {
        const bodyPosition = body.translation();

        const direction = getDirection(bodyPosition, this.origin);

        const distance = getDistance(this.origin, body.translation());

        const forceMagnitude = Math.min(
          BLAST_FORCE / (distance * Math.sqrt(distance) + 0.15),
          500000000000
        );

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
  }
  draw() {
    this.radius = Math.min(BLAST_RADIUS, this.radius + 20);

    const alpha = 1 - Math.round((this.radius / BLAST_RADIUS) * 100) / 100;
    
    drawCircle(
      this.ctx,
      this.origin,
      this.radius,
      `rgba(255, 255, 255, ${alpha})`
    )
  }
}
