import { Camera } from "./Camera";
import { Hero } from "./Hero";
import { Planet } from "./Planet";
import { Settings } from "./Settings";
import {
  getDirection,
  getDistance,
  getGravitationalForce,
  intersectionArea,
  random,
  randomVector,
  Vector,
} from "./utils";

export interface Object {
  position: Vector;
  velocity: Vector;
  force: Vector;
  radius: number;
  area: number;
  draw(): void;
  loop(): void;
  destroy(): void;
  handleCollisionWith(object: Object, magnitude: number): void;
  updateArea(intersection: number): void;
}

export interface Effect {
  draw(): void;
  destroy(): void;
}

const INITIAL_PLANET_COUNT = 1000;

export class Game {
  camera: Camera;
  hero?: Hero;
  planets: Planet[] = [];
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

  constructor(
    public canvas: HTMLCanvasElement,
    public settings: Settings,
    public setClickedObject: (
      object: { object: Object; event: MouseEvent } | null
    ) => void
  ) {
    canvas.focus();

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const ctx = canvas.getContext("2d");

    if (!ctx) {
      throw new Error(`Context 2d could not be retrieved`);
    }

    this.ctx = ctx;

    this.camera = new Camera(ctx, { fieldOfView: 1 });

    this.hero = new Hero(
      this,
      {
        x: canvas.offsetWidth / 2,
        y: canvas.offsetHeight / 2,
      },
      {
        x: 0,
        y: 0,
      },
      25
    );

    for (let i = 0; i < INITIAL_PLANET_COUNT; i++) {
      const randomPosition = {
        x: random(-canvas.offsetWidth * 50, canvas.offsetWidth * 50),
        y: random(-canvas.offsetHeight * 50, canvas.offsetHeight * 50),
      };

      const randomVelocity = randomVector(-10, 10);

      const randomRadius = random(5, 100);

      new Planet(this, randomPosition, randomVelocity, randomRadius);
    }

    this.initHandlers();

    this.loop();
  }
  handleResize = () => {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.camera.resize();
  };

  handleWheel = (event: WheelEvent) => {
    event.preventDefault();
    const zoomBy = 1.1; // zoom in amount
    const zoomFactor = event.deltaY < 0 ? 1 / zoomBy : zoomBy;
    this.camera.zoomTo(this.camera.distance * zoomFactor);
  };

  initHandlers() {
    window.addEventListener("resize", this.handleResize);

    this.canvas.addEventListener("wheel", this.handleWheel);
  }

  loop = () => {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    this.camera.begin();

    if (this.hero) {
      const heroPosition = this.hero.position;

      this.camera.lookAt([heroPosition.x, heroPosition.y]);
    }

    for (let i = 0; i < this.objects.length; i++) {
      const object = this.objects[i];

      if (i === 0) {
        object.force = {
          x: 0,
          y: 0,
        };
        object.loop();
        object.draw();
      }

      if (i !== this.objects.length - 1) {
        for (let j = i + 1; j < this.objects.length; j++) {
          const otherObject = this.objects[j];

          if (i === 0) {
            otherObject.force = {
              x: 0,
              y: 0,
            };
            otherObject.loop();
            otherObject.draw();
          }

          const prout = intersectionArea(
            object.position.x,
            object.position.y,
            object.radius,
            otherObject.position.x,
            otherObject.position.y,
            otherObject.radius
          );

          if (prout) {
            if (object.radius < otherObject.radius) {
              object.updateArea(-prout);
              otherObject.updateArea(prout);
            } else {
              object.updateArea(prout);
              otherObject.updateArea(-prout);
            }

            if (otherObject.radius < 1) {
              continue;
            }
            if (object.radius < 1) {
              break;
            }
          }

          const distance = getDistance(object.position, otherObject.position);

          const forceDirection = getDirection(
            object.position,
            otherObject.position
          );

          const forceMagnitude = getGravitationalForce(
            this.settings.GRAVITATIONAL_CONSTANT,
            object.area,
            otherObject.area,
            distance
          );

          const xForce = Math.cos(forceDirection) * forceMagnitude;
          const yForce = Math.sin(forceDirection) * forceMagnitude;

          object.force.x += xForce / object.area;
          object.force.y += yForce / object.area;

          otherObject.force.x -= xForce / otherObject.area;
          otherObject.force.y -= yForce / otherObject.area;
        }
      }
    }
    for (let i = 0; i < this.objects.length; i++) {

      const object = this.objects[i];

      if(object.radius < 1){
        console.log('destroy')
        object.destroy()
        continue
      }
      object.position.x += object.velocity.x += object.force.x;
      object.position.y += object.velocity.y += object.force.y;

      object.force = {
        x: 0,
        y: 0,
      };
    }

    for (const effect of this.effects) {
      effect.draw();
    }

    this.camera.end();

    this.ctx.textBaseline = "top"
    this.ctx.font= "20px Arial"
    this.ctx.fillStyle ="white"
    this.ctx.fillText(`${this.objects.length} objects`, 5, 5)

    requestAnimationFrame(this.loop);
  };
  destroy() {
    this.objects.forEach((object) => object.destroy());
    this.effects.forEach((effect) => effect.destroy());
    window.removeEventListener("resize", this.handleResize);
    window.removeEventListener("wheel", this.handleWheel);
  }
}
