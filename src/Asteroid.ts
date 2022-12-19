import RAPIER from "@dimforge/rapier2d-compat";
import { Explosion } from "./Explosion";
import { Game, Object } from "./Game";
import { drawCircle, Vector } from "./utils";

export class Asteroid implements Object {
  public body: RAPIER.RigidBody;
  public collider: RAPIER.Collider;
  public mass: number;

  constructor(
    private game: Game,
    pos: Vector,
    vel: Vector,
    radius: number,
    private color: string
  ) {
    const rotation = Math.atan2(vel.y, vel.x);
    this.body = this.game.world.createRigidBody(
      new RAPIER.RigidBodyDesc(RAPIER.RigidBodyType.Dynamic)
        .setRotation(rotation)
        .setTranslation(pos.x, pos.y)
        .setLinvel(vel.x, vel.y)
    );

    this.collider = this.game.world.createCollider(
      RAPIER.ColliderDesc.ball(radius)
        .setDensity(this.game.settings.PLANET_DENSITY)
        .setFriction(0.5)
        .setRestitution(0.5)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      this.body
    );

    this.mass = this.body.mass();

    this.body.userData = this;

    this.game.objects.push(this);
    this.game.asteroids.push(this);
  }

  loop() {}

  draw() {
    const position = this.body.translation();
    const radius = (this.collider.shape as RAPIER.Ball).radius;
    drawCircle(this.game.ctx, position, radius, this.color);
  }

  destroy() {
    this.game.world.removeCollider(this.collider, false);
    this.game.world.removeRigidBody(this.body);
    this.game.objects.splice(this.game.objects.indexOf(this), 1);
    this.game.asteroids.splice(this.game.asteroids.indexOf(this), 1);
  }

  handleCollisionWith(object: Object, magnitude: number): void {
    if (magnitude > 200) {
      new Explosion(
        this.game,
        this.body,
        this.game.settings.ASTEROID_BLAST_FORCE * this.mass
      );
      this.destroy();
    }
  }
}
