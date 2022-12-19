import RAPIER from "@dimforge/rapier2d-compat";
import { Explosion } from "./Explosion";
import { Game, Object } from "./Game";
import { drawCircle, Vector } from "./utils";

export class Projectile implements Object {
  public body: RAPIER.RigidBody;
  public collider: RAPIER.Collider;
  public mass: number;
  public color = "#FF0000";

  constructor(
    private game: Game,
    pos: Vector,
    vel: Vector,
    sourceBody: RAPIER.RigidBody
  ) {
    const rotation = Math.atan2(vel.y, vel.x);
    this.body = this.game.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(pos.x, pos.y)
        .setLinvel(vel.x, vel.y)
        .setRotation(rotation)
    );

    this.collider = this.game.world.createCollider(
      RAPIER.ColliderDesc.ball(3)
        .setDensity(100)
        .setFriction(0.5)
        .setRestitution(0.5)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      this.body
    );

    this.mass = this.body.mass();

    this.body.userData = this;

    this.game.objects.push(this);

    this.game.projectiles.push(this);

    const sourceBodyPosition = sourceBody.translation();

    const recoil = this.mass * this.game.settings.ARTIFICIAL_RECOIL_CONSTANT;

    sourceBody.applyImpulse(
      new RAPIER.Vector2(
        sourceBodyPosition.x - vel.x * recoil,
        sourceBodyPosition.y - vel.y * recoil
      ),
      true
    );
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
    this.game.projectiles.splice(this.game.objects.indexOf(this), 1);
  }

  handleCollisionWith(object: Object, magnitude: number) {
    if (magnitude > 200) {
      new Explosion(
        this.game,
        this.body,
        this.game.settings.PROJECTILE_BLAST_FORCE * this.mass
      );
      this.destroy();
    }
  }
}
