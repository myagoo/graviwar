import RAPIER from "@dimforge/rapier2d-compat";
import Victor from "victor";
import { Explosion } from "./Explosion";
import { Game, Object } from "./Game";
import { Projectile } from "./Projectile";
import { drawLine, Vector } from "./utils";

const EMOJIS = ["🪩", "🍪", "🏀", "🍩", "🌞", "🌍", "🤢", "🤡", "🥸", "🥶"];
const RADIUS = 20;

export class Hero implements Object {
  public body: RAPIER.RigidBody;
  public collider: RAPIER.Collider;
  public mass: number;
  private emoji = EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
  force = 0
  keys: Record<string, true> = {};

  constructor(
    private game: Game,
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
        .setDensity(this.game.settings.HERO_DENSITY)
        .setFriction(1)
        .setRestitution(0),
      this.body
    );

    this.mass = this.body.mass();

    this.body.userData = this

    this.initHandlers()
  }

  keydownHandler = (event: KeyboardEvent) => {
    this.keys[event.code] = true

    if (event.code === "Enter") {
      this.game.effects.push(new Explosion(this.game, this.body, this.game.settings.HERO_BLAST_FORCE))
    }
  }

  keyupHandler = (event: KeyboardEvent) => {
    delete this.keys[event.code]

    switch (event.code) {
      case "Space":
        const heroPosition = this.body.translation();
        const heroRadius = (this.collider.shape as RAPIER.Ball).radius;
        const heroRotation = this.collider.rotation() + Math.PI / 2;

        const projectilePosition = {
          x:
            heroPosition.x +
            heroRadius +
            Math.sin(-heroRotation) * heroRadius * 2,
          y: heroPosition.y + Math.cos(-heroRotation) * heroRadius * 2,
        }

        const projectileVelocity = {
          x:
            Math.sin(-heroRotation) *
            (this.force * this.game.settings.DND_VELOCITY_FACTOR + 100),
          y:
            Math.cos(-heroRotation) *
            (this.force * this.game.settings.DND_VELOCITY_FACTOR + 100),
        }

        this.game.objects.push(new Projectile(this.game, projectilePosition, projectileVelocity, this.body))

        this.force = 0;
        break;

      default:
        break;
    }
  }

  initHandlers() {
    this.game.canvas.addEventListener("keydown", this.keydownHandler);
    this.game.canvas.addEventListener("keyup", this.keyupHandler);
  }

  loop() {
    const vector = new Victor(0, 0);
    if (this.keys.ArrowUp) {
      vector.addScalarY(-1);
    }
    if (this.keys.ArrowDown) {
      vector.addScalarY(1);
    }
    if (this.keys.ArrowLeft) {
      vector.addScalarX(-1);
    }
    if (this.keys.ArrowRight) {
      vector.addScalarX(1);
    }

    if (vector.x || vector.y) {
      vector
        .normalize()
        .multiplyScalar(this.game.settings.KEYPAD_ACCELERATION);
      this.body.applyImpulse(new RAPIER.Vector2(vector.x, vector.y), true);
    }

    if (this.keys.Space) {
      this.force += 3;
    }
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

    if (this.force) {
      const rotation = this.body.rotation() + Math.PI / 2;
      drawLine(
        this.game.ctx,
        { x: position.x, y: position.y },
        {
          x: position.x + Math.sin(-rotation) * this.force,
          y: position.y + Math.cos(-rotation) * this.force,
        },
        "#FF0000"
      );
    }
  }
  destroy(){
    this.game.canvas.removeEventListener("keydown", this.keydownHandler);
    this.game.canvas.removeEventListener("keyup", this.keyupHandler);
    
    this.game.world.removeCollider(this.collider, false)
    this.game.world.removeRigidBody(this.body)
    this.game.objects.splice(this.game.objects.indexOf(this), 1)
  }

  handleCollisionWith(object: Object, magnitude: number): void {
      
  }
}
