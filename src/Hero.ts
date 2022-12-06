import RAPIER from "@dimforge/rapier2d-compat";
import { Explosion } from "./Explosion";
import { Projectile } from "./Projectile";
import { Vector } from "./utils";

const EMOJIS = ["🪩", "🍪", "🏀", "🍩", "🌞", "🌍", "🤢", "🤡", "🥸", "🥶"];
const ARTIFICIAL_RECOIL_CONSTANT = 10;
const RADIUS = 20;

export class Hero {
  public body: RAPIER.RigidBody;
  public collider: RAPIER.Collider;
  public mass: number;
  private emoji = EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
  constructor(
    private world: RAPIER.World,
    private ctx: CanvasRenderingContext2D,
    pos: Vector
  ) {
    this.body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(pos.x - RADIUS, pos.y - RADIUS)
        .setLinvel(0, 0)
        .setAngvel(1)
    );

    this.collider = world.createCollider(
      RAPIER.ColliderDesc.ball(RADIUS)
        .setDensity(100)
        .setFriction(1)
        .setRestitution(0),
      this.body
    );

    this.mass = this.body.mass();
  }
  draw() {
    const radius = (this.collider.shape as RAPIER.Ball).radius;
    const position = this.body.translation();
    this.ctx.save();
    this.ctx.translate(position.x, position.y);
    this.ctx.rotate(this.collider.rotation());
    this.ctx.font = radius * 2 + "px monospace";
    // use these alignment properties for "better" positioning
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
    // draw the emoji
    this.ctx.fillText(this.emoji, 0, 4);
    this.ctx.restore();
  }
  shoot(force: number) {
    const position = this.body.translation();
    const rotation = this.collider.rotation();
    const radius = (this.collider.shape as RAPIER.Ball).radius;
    const projectile = new Projectile(
      this.world,
      this.ctx,
      {
        x: position.x + radius + Math.sin(-rotation) * radius * 2,
        y: position.y + Math.cos(-rotation) * radius * 2,
      },
      {
        x: Math.sin(-rotation) * force,
        y: Math.cos(-rotation) * force,
      }
    );

    const projectileMass = projectile.mass;

    const recoil = force * projectileMass * ARTIFICIAL_RECOIL_CONSTANT;

    this.body.applyImpulse(
      new RAPIER.Vector2(
        position.x - Math.sin(-rotation) * recoil,
        position.y - Math.cos(-rotation) * recoil
      ),
      true
    );
  }
  blast() {
    return new Explosion(this.world, this.ctx, this.body)
  }
}
