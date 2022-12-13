import RAPIER from "@dimforge/rapier2d-compat";
import Victor from "victor";
import { Asteroid } from "./Asteroid";
import { Camera } from "./Camera";
import { Explosion } from "./Explosion";
import { Hero } from "./Hero";
import { Planet } from "./Planet";
import { Projectile } from "./Projectile";
import { Settings } from "./Settings";
import {
  drawCircle,
  drawLine,
  getDirection,
  getDistance,
  getGravitationalForce,
  Vector,
} from "./utils";

export interface Object {
  body: RAPIER.RigidBody;
  mass: number;
  draw(): void;
  loop(): void;
  destroy(): void;
}

export interface Effect {
  draw(): boolean;
}

const INITIAL_PLANET_COUNT = 1

export class Game {
  intervalId: NodeJS.Timer;
  world: RAPIER.World;
  eventQueue: RAPIER.EventQueue;
  camera: Camera;
  hero: Hero;
  planets: Planet[] = [];
  asteroids: Asteroid[] = [];
  ctx: CanvasRenderingContext2D;
  objects: Object[] = [];
  effects: Effect[] = [];
  tmp: {
    x: number;
    y: number;
    color: string;
    radius: number;
    mmPosition?: Vector | null;
  } | null = null;

  constructor(public canvas: HTMLCanvasElement, public settings: Settings) {
    canvas.focus();

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const ctx = canvas.getContext("2d");

    if (!ctx) {
      throw new Error(`Context 2d could not be retrieved`);
    }

    this.ctx = ctx;

    this.camera = new Camera(ctx, { fieldOfView: 1 });

    this.world = new RAPIER.World(new RAPIER.Vector2(0, 0));

    this.eventQueue = new RAPIER.EventQueue(true);

    for (let i = 0; i < INITIAL_PLANET_COUNT; i++) {
      const randomPosition = {
        x: Math.random() * canvas.offsetWidth * 4 - canvas.offsetWidth * 2,
        y: Math.random() * canvas.offsetHeight * 4 - canvas.offsetHeight * 2,
      };
      const randomRadius = Math.random() * 500 + 500;
      const randomColor =
        "#" + Math.floor(Math.random() * 16777215).toString(16);
      this.objects.push(
        new Planet(
          this,
          randomPosition,
          new RAPIER.Vector2(0, 0),
          randomRadius,
          randomColor,
          true
        )
      );
    }

    this.intervalId = setInterval(() => {
      const randomPosition = {
        x: Math.random() * canvas.offsetWidth * 4 - canvas.offsetWidth * 2,
        y: Math.random() * canvas.offsetHeight * 4 - canvas.offsetHeight * 2,
      };
      const randomVelocity = {
        x: Math.random() * 100 - 50,
        y: Math.random() * 100 - 50,
      };
      const randomRadius = Math.random() * 50 + 50;
      const randomColor =
        "#" + Math.floor(Math.random() * 16777215).toString(16);

      this.objects.push(
        new Asteroid(
          this,
          randomPosition,
          randomVelocity,
          randomRadius,
          randomColor
        )
      );
    }, 10_000);

    this.hero = new Hero(this, this.world, ctx, {
      x: canvas.offsetWidth / 2,
      y: canvas.offsetHeight / 2,
    });

    this.objects.push(this.hero);

    this.initHandlers();

    this.loop();
  }
  resizeListener = () =>  {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.camera.resize();
  }
  initHandlers() {
    window.addEventListener("resize", this.resizeListener);

    this.canvas.addEventListener("mousedown", (mdEvent) => {
      this.tmp = {
        x: mdEvent.offsetX,
        y: mdEvent.offsetY,
        radius: mdEvent.shiftKey
          ? Math.random() * 500 + 500
          : Math.random() * 50 + 50,
        color: "#" + Math.floor(Math.random() * 16777215).toString(16),
      };

      const mmHandler = (mmEvent: MouseEvent) => {
        if (!this.tmp) {
          throw new Error(`TEST`);
        }

        this.tmp.mmPosition = { x: mmEvent.offsetX, y: mmEvent.offsetY };
      };

      const muHandler = (muEvent: MouseEvent) => {
        if (!this.tmp) {
          throw new Error(`TEST`);
        }

        const velocity = this.tmp.mmPosition
          ? {
              x:
                (this.tmp.x - muEvent.offsetX) *
                this.settings.DND_VELOCITY_FACTOR,
              y:
                (this.tmp.y - muEvent.offsetY) *
                this.settings.DND_VELOCITY_FACTOR,
            }
          : { x: 0, y: 0 };

        this.objects.push(
          new Planet(
            this,
            this.camera.screenToWorld({ x: this.tmp.x, y: this.tmp.y }),
            velocity,
            this.tmp.radius,
            this.tmp.color,
            mdEvent.ctrlKey || mdEvent.metaKey
          )
        );

        this.tmp = null;

        this.canvas.removeEventListener("mousemove", mmHandler);

        this.canvas.removeEventListener("mouseup", muHandler);
      };

      this.canvas.addEventListener("mousemove", mmHandler);

      this.canvas.addEventListener("mouseup", muHandler);
    });

    this.canvas.addEventListener("wheel", (event) => {
      event.preventDefault();
      const zoomBy = 1.1; // zoom in amount
      const zoomFactor = event.deltaY < 0 ? 1 / zoomBy : zoomBy;
      this.camera.zoomTo(this.camera.distance * zoomFactor);
    });
  }

  loop = () => {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    this.camera.begin();

    const heroPosition = this.hero.body.translation();

    this.camera.lookAt([heroPosition.x, heroPosition.y]);

    for (let i = 0; i < this.objects.length; i++) {
      const object = this.objects[i];
      const body = object.body;



      const bodyMass = object.mass;

      const bodyPosition = body.translation();

      const bodyType = body.bodyType();

      if (i === 0) {
        body.resetForces(false);
        object.loop();
        object.draw();

      }

      if (i !== this.objects.length - 1) {
        for (let j = i + 1; j < this.objects.length; j++) {
          const otherObject = this.objects[j];

          const otherBody = otherObject.body;

          if (i === 0) {
            otherBody.resetForces(false);
            otherObject.loop();
            otherObject.draw();
          }

          const otherBodyMass = otherObject.mass;

          const otherBodyPosition = otherBody.translation();

          const distance = getDistance(otherBodyPosition, bodyPosition);

          const forceDirection = getDirection(otherBodyPosition, bodyPosition);

          const forceMagnitude = getGravitationalForce(
            this.settings.GRAVITATIONAL_CONSTANT,
            bodyMass,
            otherBodyMass,
            distance
          );
          try {
            const xForce = Math.sin(forceDirection) * forceMagnitude;
            const yForce = Math.cos(forceDirection) * forceMagnitude;

            if (bodyType !== RAPIER.RigidBodyType.Fixed) {
              body.addForce(new RAPIER.Vector2(xForce, yForce), false);
            }
            if (otherBody.bodyType() !== RAPIER.RigidBodyType.Fixed) {
              otherBody.addForce(new RAPIER.Vector2(-xForce, -yForce), false);
            }
          } catch (error) {
            console.error(error);
          }
        }
      }
    }

    if (this.tmp) {
      const { x, y, radius, color, mmPosition } = this.tmp;
      drawCircle(this.ctx, this.camera.screenToWorld({ x, y }), radius, color);

      if (mmPosition) {
        drawLine(
          this.ctx,
          this.camera.screenToWorld({ x, y }),
          this.camera.screenToWorld(mmPosition),
          color
        );
      }
    }

    for (const effect of this.effects) {
      const done = effect.draw();
      if (done) {
        this.effects.splice(this.effects.indexOf(effect), 1)
      }
    }

    this.camera.end();

    this.world.step(this.eventQueue);

    this.eventQueue.drainCollisionEvents((handle1, handle2, started) => {
      if (!started) {
        return;
      }

      const collider1 = this.world.getCollider(handle1);
      const body1 = collider1.parent()!;

      const collider2 = this.world.getCollider(handle2);
      const body2 = collider2.parent()!;

      const object1 = body1.userData;
      const object2 = body2.userData;

      const collisionMagnitude = Victor.fromObject(body1.linvel())
        .subtract(Victor.fromObject(body2.linvel()))
        .magnitude();

      if (collisionMagnitude > 200) {
        if (object2 instanceof Projectile) {
          this.effects.push(new Explosion(this, body2, this.settings.PROJECTILE_BLAST_FORCE));
          object2.destroy()
        }

        if (object1 instanceof Projectile) {
          this.effects.push(new Explosion(this, body1, this.settings.PROJECTILE_BLAST_FORCE));
          object1.destroy()
        }
      }
    });

    requestAnimationFrame(this.loop);
  }
  destroy() {
    clearInterval(this.intervalId);
    window.removeEventListener("resize", this.resizeListener);
    this.world.free();
  }
}
