import { BlackHole } from "./BlackHole";
import { Camera } from "./Camera";
import { Player } from "./Player";
import {
  getDirection,
  getDistance,
  getDistanceFromCenter,
  getGravitationalForce,
  getIntersectionArea,
  random,
  randomVector,
  Vector,
} from "./utils";

const ARENA_RADIUS = 30_000;

const MAX_GAME_TICKS = 60 * 60 * 2;

type SerializableBlackHole = {
  position: Vector;
  velocity: Vector;
  area: number;
  player: boolean;
};

type FrameNumber = number;

type Direction = number;

export type SerializedGame = {
  initialState: SerializableBlackHole[];
  inputs: Record<FrameNumber, Direction>;
};

export class Game {
  ellapsedFrames = 0;
  camera: Camera;
  player?: Player;
  blackHoles: BlackHole[] = [];
  ctx: CanvasRenderingContext2D;
  initialState: SerializableBlackHole[];
  inputs: Record<FrameNumber, Direction>;
  startTime = performance.now();

  constructor(
    public canvas: HTMLCanvasElement,
    public serializedGame?: SerializedGame
  ) {
    canvas.focus();

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const ctx = canvas.getContext("2d");

    if (!ctx) {
      throw new Error(`Context 2d could not be retrieved`);
    }

    this.ctx = ctx;

    this.camera = new Camera(ctx, { fieldOfView: 2 });

    if (serializedGame) {
      for (const {
        player,
        position,
        velocity,
        area,
      } of serializedGame.initialState) {
        if (player) {
          new Player(this, position, velocity, area);
        } else {
          new BlackHole(this, position, velocity, area);
        }
      }
    } else {
      for (let i = 0; i < 500; i++) {
        const randomPosition = randomVector(1000, ARENA_RADIUS - 1000);
        const randomVelocity = randomVector(0, 10);
        if (i === 0) {
          new Player(this, randomPosition, randomVelocity, 20_000);
        } else {
          const randomArea = random(10_000, 20_000);
          new BlackHole(this, randomPosition, randomVelocity, randomArea);
        }
      }
    }

    this.initialState = this.blackHoles.map((blackHole) => {
      return {
        position: {
          x: blackHole.position.x,
          y: blackHole.position.y,
        },
        velocity: {
          x: blackHole.velocity.x,
          y: blackHole.velocity.y,
        },
        area: blackHole.area,
        player: blackHole instanceof Player,
      };
    });

    this.inputs = {};

    this.initHandlers();

    requestAnimationFrame(this.loop);
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
    this.camera.zoomTo(
      Math.max(
        this.camera.distance * zoomFactor,
        this.player ? this.player.radius * 50 : 10
      )
    );
  };

  initHandlers() {
    window.addEventListener("resize", this.handleResize);
    this.canvas.addEventListener("wheel", this.handleWheel);
  }

  serialize(): SerializedGame {
    return {
      initialState: this.initialState,
      inputs: this.inputs,
    };
  }

  loop = (timeEllapsed: DOMHighResTimeStamp) => {
    const gravityRatio = this.ellapsedFrames / MAX_GAME_TICKS;

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    this.camera.begin();

    if (this.player) {
      const playerPosition = this.player.position;
      this.camera.lookAt([playerPosition.x, playerPosition.y]);
      const newMinZoomLevel = this.player.radius * 50;
      if (this.camera.distance < newMinZoomLevel) {
        this.camera.zoomTo(newMinZoomLevel);
      }
      const replayInputDirection =
        this.serializedGame?.inputs[this.ellapsedFrames];
      if (replayInputDirection) {
        this.player.expulse(replayInputDirection);
      }
    }

    for (let i = 0; i < this.blackHoles.length; i++) {
      const blackHole = this.blackHoles[i];

      if (i === 0) {
        blackHole.draw();
      }

      if (i !== this.blackHoles.length - 1) {
        for (let j = i + 1; j < this.blackHoles.length; j++) {
          const otherBlackHole = this.blackHoles[j];

          if (i === 0) {
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
            2 * gravityRatio,
            blackHole.area,
            otherBlackHole.area,
            distance
          );

          const xForce = Math.cos(forceDirection) * forceMagnitude;
          const yForce = Math.sin(forceDirection) * forceMagnitude;

          blackHole.velocity.x += xForce / blackHole.area;
          blackHole.velocity.y += yForce / blackHole.area;

          otherBlackHole.velocity.x -= xForce / otherBlackHole.area;
          otherBlackHole.velocity.y -= yForce / otherBlackHole.area;
        }
      }
    }
    for (let i = 0; i < this.blackHoles.length; i++) {
      const blackHole = this.blackHoles[i];

      if (blackHole.radius < 1) {
        blackHole.destroy();
        continue;
      }

      const { position, velocity } = blackHole;

      position.x += velocity.x;
      position.y += velocity.y;

      const distance = getDistanceFromCenter(position);

      if (distance + blackHole.radius > ARENA_RADIUS) {
        const normalizedVector = {
          x: position.x / distance,
          y: position.y / distance,
        };
        const dotProduct =
          velocity.x * normalizedVector.x + velocity.y * normalizedVector.y;
        velocity.x -= 2 * dotProduct * normalizedVector.x;
        velocity.y -= 2 * dotProduct * normalizedVector.y;
      }
    }

    this.ctx.strokeStyle = "red";
    this.ctx.lineWidth = 50;

    this.ctx.beginPath();
    this.ctx.arc(0, 0, ARENA_RADIUS, 0, Math.PI * 2);
    this.ctx.closePath();
    this.ctx.stroke();

    this.camera.end();

    this.ctx.textBaseline = "top";
    this.ctx.font = "20px Arial";
    this.ctx.fillStyle = "white";
    this.ctx.textAlign = "start";
    this.ctx.fillText(`${this.blackHoles.length} trous noirs`, 5, 5);
    this.ctx.textAlign = "end";
    this.ctx.fillText(
      `${Math.round(gravityRatio * 100)}% G`,
      this.canvas.offsetWidth - 5,
      5
    );

    this.ellapsedFrames++;

    requestAnimationFrame(this.loop);
  };
  destroy() {
    this.blackHoles.forEach((blackHole) => blackHole.destroy());
    window.removeEventListener("resize", this.handleResize);
    window.removeEventListener("wheel", this.handleWheel);
  }
}
