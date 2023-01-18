import { BlackHole } from "./BlackHole";
import { Camera } from "./Camera";
import { Player } from "./Player";
import { Settings } from "./Settings";
import {
  getDirection,
  getDistance,
  getGravitationalForce,
  getIntersectionArea,
  random,
  randomVector,
} from "./utils";

const CANVAS_HALF_SIZE = 10000;

export class Game {
  camera: Camera;
  player?: Player;
  blackHoles: BlackHole[] = [];
  ctx: CanvasRenderingContext2D;

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

    this.player = new Player(
      this,
      {
        x: 0,
        y: 0,
      },
      {
        x: 0,
        y: 0,
      },
      8000
    );

    for (let i = 0; i < 100; i++) {
      const randomPosition = {
        x: random(-CANVAS_HALF_SIZE, CANVAS_HALF_SIZE),
        y: random(-CANVAS_HALF_SIZE, CANVAS_HALF_SIZE),
      };

      const randomVelocity = randomVector(-10, 10);

      const randomArea = random(1000, 9000);

      new BlackHole(this, randomPosition, randomVelocity, randomArea);
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

    if (this.player) {
      const playerPosition = this.player.position;
      this.camera.lookAt([playerPosition.x, playerPosition.y]);
      this.camera.zoomTo(this.player.radius * 100)
    }

    for (let i = 0; i < this.blackHoles.length; i++) {
      const blackHole = this.blackHoles[i];

      if (i === 0) {
        blackHole.force = {
          x: 0,
          y: 0,
        };
        blackHole.draw();
      }

      if (i !== this.blackHoles.length - 1) {
        for (let j = i + 1; j < this.blackHoles.length; j++) {
          const otherBlackHole = this.blackHoles[j];

          if (i === 0) {
            otherBlackHole.force = {
              x: 0,
              y: 0,
            };
            otherBlackHole.draw();
          }

          const intersectionArea = getIntersectionArea(
            blackHole.position,
            blackHole.radius,
            otherBlackHole.position,
            otherBlackHole.radius
          );

          if (intersectionArea) {
            if (blackHole.radius < otherBlackHole.radius) {
              blackHole.area -= intersectionArea;
              otherBlackHole.area += intersectionArea;
            } else {
              blackHole.area += intersectionArea;
              otherBlackHole.area -= intersectionArea;
            }

            if (otherBlackHole.radius < 1) {
              continue;
            }
            if (blackHole.radius < 1) {
              break;
            }
          }

          const distance = getDistance(
            blackHole.position,
            otherBlackHole.position
          );

          const forceDirection = getDirection(
            blackHole.position,
            otherBlackHole.position
          );

          const forceMagnitude = getGravitationalForce(
            this.settings.GRAVITATIONAL_CONSTANT,
            blackHole.area,
            otherBlackHole.area,
            distance
          );

          const xForce = Math.cos(forceDirection) * forceMagnitude;
          const yForce = Math.sin(forceDirection) * forceMagnitude;

          blackHole.force.x += xForce / blackHole.area;
          blackHole.force.y += yForce / blackHole.area;

          otherBlackHole.force.x -= xForce / otherBlackHole.area;
          otherBlackHole.force.y -= yForce / otherBlackHole.area;
        }
      }
    }
    for (let i = 0; i < this.blackHoles.length; i++) {
      const blackHole = this.blackHoles[i];

      if (blackHole.radius < 1) {
        console.log("destroy");
        blackHole.destroy();
        continue;
      }
      blackHole.position.x += blackHole.velocity.x += blackHole.force.x;
      blackHole.position.y += blackHole.velocity.y += blackHole.force.y;

      if (
        blackHole.position.x + blackHole.radius > CANVAS_HALF_SIZE ||
        blackHole.position.x - blackHole.radius < -CANVAS_HALF_SIZE
      ) {
        blackHole.velocity.x = -blackHole.velocity.x;
      }

      if (
        blackHole.position.y + blackHole.radius > CANVAS_HALF_SIZE ||
        blackHole.position.y - blackHole.radius < -CANVAS_HALF_SIZE
      ) {
        blackHole.velocity.y = -blackHole.velocity.y;
      }

      blackHole.force = {
        x: 0,
        y: 0,
      };
    }


    this.ctx.strokeStyle = "red";
    this.ctx.lineWidth = 50;

    this.ctx.strokeRect(
      -CANVAS_HALF_SIZE,
      -CANVAS_HALF_SIZE,
      CANVAS_HALF_SIZE * 2,
      CANVAS_HALF_SIZE * 2
    );

    this.camera.end();



    this.ctx.textBaseline = "top";
    this.ctx.font = "20px Arial";
    this.ctx.fillStyle = "white";
    this.ctx.fillText(`${this.blackHoles.length} trous noirs restant`, 5, 5);

    requestAnimationFrame(this.loop);
  };
  destroy() {
    this.blackHoles.forEach((blackHole) => blackHole.destroy());
    window.removeEventListener("resize", this.handleResize);
    window.removeEventListener("wheel", this.handleWheel);
  }
}
