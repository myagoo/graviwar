import RAPIER from "@dimforge/rapier2d-compat";
import Victor from "victor";
import { Explosion } from "./Explosion";
import { Game, Object } from "./Game";
import { Planet } from "./Planet";
import { Projectile } from "./Projectile";
import { drawCircle, drawLine, getDirection, Vector } from "./utils";

const EMOJIS = ["🪩", "🍪", "🏀", "🍩", "🌞", "🌍", "🤢", "🤡", "🥸", "🥶"];
const RADIUS = 20;

export class Hero implements Object {
  public body: RAPIER.RigidBody;
  public collider: RAPIER.Collider;
  public mass: number;
  private emoji = EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
  loadingFire: { x: number; y: number; force: number } | null = null;
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
        .lockRotations()
    );

    this.collider = world.createCollider(
      RAPIER.ColliderDesc.ball(RADIUS)
        .setDensity(this.game.settings.HERO_DENSITY)
        .setFriction(0.5)
        .setRestitution(0.5)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      this.body
    );

    this.mass = this.body.mass();

    this.body.userData = this;

    this.game.objects.push(this);

    this.game.hero = this;

    this.initHandlers();
  }

  keydownHandler = (event: KeyboardEvent) => {
    this.keys[event.code] = true;

    if (event.code === "Space") {
      this.game.world.contactsWith(this.collider, (otherCollider) => {
        if (
          otherCollider.parent()?.userData instanceof Planet &&
          this.collider.contactCollider(otherCollider, 0)
        ) {
          console.log(
            "contact with planet",
            this.collider.contactCollider(otherCollider, 0)
          );

          const direction = getDirection(
            this.body.translation(),
            otherCollider.parent()!.translation()
          );
          const impulse = new RAPIER.Vector2(
            Math.sin(direction) * 200000000,
            Math.cos(direction) * 200000000
          );
          this.body.applyImpulse(impulse, true);
        }
      });
    }

    if (event.code === "Enter") {
      new Explosion(this.game, this.body, this.game.settings.HERO_BLAST_FORCE);
    }
  };

  keyupHandler = (event: KeyboardEvent) => {
    delete this.keys[event.code];

    // switch (event.code) {
    //   case "Space":
    //     const heroPosition = this.body.translation();
    //     const heroRadius = (this.collider.shape as RAPIER.Ball).radius;
    //     const heroRotation = this.collider.rotation() + Math.PI / 2;

    //     const projectilePosition = {
    //       x:
    //         heroPosition.x +
    //         heroRadius +
    //         Math.sin(-heroRotation) * heroRadius * 2,
    //       y: heroPosition.y + Math.cos(-heroRotation) * heroRadius * 2,
    //     };

    //     const projectileVelocity = {
    //       x:
    //         Math.sin(-heroRotation) *
    //         (this.force * this.game.settings.DND_VELOCITY_FACTOR + 100),
    //       y:
    //         Math.cos(-heroRotation) *
    //         (this.force * this.game.settings.DND_VELOCITY_FACTOR + 100),
    //     };

    //     new Projectile(
    //       this.game,
    //       projectilePosition,
    //       projectileVelocity,
    //       this.body
    //     );

    //     this.force = 0;
    //     break;

    //   default:
    //     break;
    // }
  };

  initHandlers() {
    this.game.canvas.addEventListener("keydown", this.keydownHandler);
    this.game.canvas.addEventListener("keyup", this.keyupHandler);

    this.game.canvas.addEventListener("mousedown", (mdEvent) => {
      this.loadingFire = {
        x: mdEvent.offsetX,
        y: mdEvent.offsetY,
        force: 0,
      };

      const mmHandler = (mmEvent: MouseEvent) => {
        if (!this.loadingFire) {
          throw new Error(`TEST`);
        }

        this.loadingFire.x = mmEvent.offsetX;
        this.loadingFire.y = mmEvent.offsetY;
      };

      const muHandler = (muEvent: MouseEvent) => {
        if (!this.loadingFire) {
          throw new Error(`TEST`);
        }

        const heroPosition = this.body.translation();
        const heroRadius = (this.collider.shape as RAPIER.Ball).radius;
        const direction = getDirection(
          heroPosition,
          this.game.camera.screenToWorld(this.loadingFire)
        );

        const projectilePosition = {
          x: heroPosition.x + heroRadius * 2 * Math.sin(-direction),
          y: heroPosition.y + heroRadius * 2 * Math.cos(-direction),
        };

        const projectileVelocity = {
          x:
            Math.sin(-direction) *
            (this.loadingFire.force * this.game.settings.DND_VELOCITY_FACTOR +
              100),
          y:
            Math.cos(-direction) *
            (this.loadingFire.force * this.game.settings.DND_VELOCITY_FACTOR +
              100),
        };

        new Projectile(
          this.game,
          projectilePosition,
          projectileVelocity,
          this.body
        );

        this.loadingFire = null;

        this.game.canvas.removeEventListener("mousemove", mmHandler);

        this.game.canvas.removeEventListener("mouseup", muHandler);
      };

      this.game.canvas.addEventListener("mousemove", mmHandler);

      this.game.canvas.addEventListener("mouseup", muHandler);
    });
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
        .multiplyScalar(this.game.settings.KEYPAD_ACCELERATION * 75);
      this.body.addForce(new RAPIER.Vector2(vector.x, vector.y), true);
    }

    if (this.loadingFire) {
      this.loadingFire.force += 3;
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

    if (this.loadingFire) {
      const direction = getDirection(
        this.game.camera.screenToWorld(this.loadingFire),
        position,
      );
      drawLine(
        this.game.ctx,
        { x: position.x, y: position.y },
        {
          x: position.x + Math.cos(-direction) * this.loadingFire.force,
          y: position.y + Math.sin(-direction) * this.loadingFire.force,
        },
        "#FF0000"
      );
    }
  }
  destroy() {
    this.game.canvas.removeEventListener("keydown", this.keydownHandler);
    this.game.canvas.removeEventListener("keyup", this.keyupHandler);

    this.game.world.removeCollider(this.collider, false);
    this.game.world.removeRigidBody(this.body);
    this.game.objects.splice(this.game.objects.indexOf(this), 1);
    delete this.game.hero;
  }

  handleCollisionWith(object: Object, magnitude: number): void {}
}
