import RAPIER from "@dimforge/rapier2d-compat";
import { drawCircle, Vector } from "./utils";

export class Projectile {
  public body: RAPIER.RigidBody;
  public collider: RAPIER.Collider;
  public mass: number;
  public color = "#FF0000";

  constructor(
    private world: RAPIER.World,
    private ctx: CanvasRenderingContext2D,
    pos: Vector,
    vel: Vector
  ) {
    const rotation = Math.atan2(vel.y, vel.x);
    this.body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(pos.x, pos.y)
        .setLinvel(vel.x, vel.y)
        .setRotation(rotation)
    );

    this.collider = world.createCollider(
      RAPIER.ColliderDesc.ball(3)
        .setDensity(100)
        .setFriction(0.5)
        .setRestitution(0.5)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      this.body
    );

    this.mass = this.body.mass();
  }

  draw() {
    const position = this.body.translation();
    const radius = (this.collider.shape as RAPIER.Ball).radius;
    drawCircle(this.ctx, position, radius, this.color);
  }
}
