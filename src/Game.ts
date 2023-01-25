import { DataConnection } from "peerjs";
import { Camera } from "./Camera";
import { DefaultInput, NetGame, NetplayPlayer } from "./netplayjs";
import {
  createRandomGenerator,
  drawCircle,
  getDirection,
  getDistance,
  getDistanceFromCenter,
  getGravitationalForce,
  getIntersectionArea,
  Vector,
} from "./utils";

const ARENA_RADIUS = 20_000;

const MAX_GAME_TICKS = 60 * 60 * 2;

type BlackHole = {
  type: "local" | "remote" | "ai";
  position: Vector;
  velocity: Vector;
  area: number;
  radius: number;
};
export class Game extends NetGame {
  camera: Camera;
  blackHoles: BlackHole[] = [];
  ctx: CanvasRenderingContext2D;
  localPlayerIndex = 0;

  static timestep = 1000 / 60;

  constructor(
    public canvas: HTMLCanvasElement,
    public players: NetplayPlayer[],
    public connection: DataConnection
  ) {
    super();

    const random = createRandomGenerator(connection.connectionId);

    canvas.focus();

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const ctx = canvas.getContext("2d");

    if (!ctx) {
      throw new Error(`Context 2d could not be retrieved`);
    }

    this.ctx = ctx;

    this.camera = new Camera(ctx, { fieldOfView: 1 });

    for (let i = 0; i < 100; i++) {
      if (players[i] && players[i].isLocal) {
        this.localPlayerIndex = i;
      }
      const position = random.vector(1000, ARENA_RADIUS - 1000);
      const velocity = random.vector(0, 10);
      const area = random.range(10_000, 20_000);
      const radius = Math.sqrt(area / Math.PI);

      this.blackHoles.push({
        type: players[i] ? (players[i].isLocal ? "local" : "remote") : "ai",
        position,
        velocity,
        area,
        radius,
      });
    }

    console.log(this.blackHoles);

    this.initHandlers();
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
        this.blackHoles[this.localPlayerIndex]
          ? this.blackHoles[this.localPlayerIndex].radius * 50
          : 10
      )
    );
  };

  initHandlers() {
    window.addEventListener("resize", this.handleResize);
    this.canvas.addEventListener("wheel", this.handleWheel);
  }

  expulse(blackHole: BlackHole, direction: number) {
    const playerPosition = blackHole.position;
    const playerVelocity = blackHole.velocity;
    const playerRadius = blackHole.radius;
    const playerArea = blackHole.area;

    const projectilePosition = {
      x: playerPosition.x + playerRadius * 2 * Math.cos(direction),
      y: playerPosition.y + playerRadius * 2 * Math.sin(direction),
    };

    const projectileArea = playerArea / 10;

    const projectileVelocityFactor = Math.sqrt(projectileArea);

    const projectileVelocity = {
      x: playerVelocity.x + Math.cos(direction) * projectileVelocityFactor,
      y: playerVelocity.y + Math.sin(direction) * projectileVelocityFactor,
    };

    this.blackHoles.push({
      type: "ai",
      position: projectilePosition,
      velocity: projectileVelocity,
      area: projectileArea,
      radius: Math.sqrt(projectileArea / Math.PI),
    });

    const playerVelocityFactor = Math.sqrt(projectileVelocityFactor);

    blackHole.velocity.x -= projectileVelocity.x / playerVelocityFactor;
    blackHole.velocity.y -= projectileVelocity.y / playerVelocityFactor;

    blackHole.area -= projectileArea;
    blackHole.radius = Math.sqrt(blackHole.area / Math.PI);
  }

  tick(playerInputs: Map<NetplayPlayer, DefaultInput>, frameNumber: number) {
    playerInputs.forEach((input, player) => {
      if (input.clickDirection) {
        this.expulse(this.blackHoles[player.getID()], input.clickDirection);
      }
    });

    const gravityRatio = frameNumber / MAX_GAME_TICKS;

    for (let i = 0; i < this.blackHoles.length; i++) {
      const blackHole = this.blackHoles[i];

      if (i !== this.blackHoles.length - 1) {
        for (let j = i + 1; j < this.blackHoles.length; j++) {
          const otherBlackHole = this.blackHoles[j];

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
            blackHole.radius = Math.sqrt(blackHole.area / Math.PI);
            otherBlackHole.radius = Math.sqrt(otherBlackHole.area / Math.PI);

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
        this.blackHoles.splice(i, 1);
        continue;
      }

      const { position, velocity } = blackHole;

      position.x += velocity.x;
      position.y += velocity.y;

      // Handle border
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
  }

  draw(canvas: HTMLCanvasElement, frameNumber: number) {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    this.camera.begin();

    const blackHoleToFocus = this.blackHoles[this.localPlayerIndex];

    const blackHoleToFocusPosition = blackHoleToFocus.position;

    this.camera.lookAt([
      blackHoleToFocusPosition.x,
      blackHoleToFocusPosition.y,
    ]);

    const newMinZoomLevel = blackHoleToFocus.radius * 50;
    if (this.camera.distance < newMinZoomLevel) {
      this.camera.zoomTo(newMinZoomLevel);
    }

    for (const blackHole of this.blackHoles) {
      const position = blackHole.position;
      const radius = blackHole.radius;
      const isSmaller = blackHoleToFocus.area > blackHole.area;
      drawCircle(
        this.ctx,
        position,
        radius,
        blackHole.type === "local"
          ? "blue"
          : blackHole.type === "remote"
          ? "pink"
          : isSmaller
          ? "green"
          : "red"
      );
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
    const gravityRatio = frameNumber / MAX_GAME_TICKS;

    this.ctx.fillText(
      `${Math.round(gravityRatio * 100)}% G`,
      this.canvas.offsetWidth - 5,
      5
    );
  }

  serialize(): BlackHole[] {
    return this.blackHoles.map(
      ({ area, type, position, radius, velocity }) => ({
        type,
        area,
        radius,
        position: {
          x: position.x,
          y: position.y,
        },
        velocity: {
          x: velocity.x,
          y: velocity.y,
        },
      })
    );
  }

  deserialize(blackHoles: BlackHole[]): void {
    this.blackHoles = blackHoles.map(
      ({ area, type, position, radius, velocity }) => ({
        type,
        area,
        radius,
        position: {
          x: position.x,
          y: position.y,
        },
        velocity: {
          x: velocity.x,
          y: velocity.y,
        },
      })
    );
  }

  destroy() {
    window.removeEventListener("resize", this.handleResize);
    window.removeEventListener("wheel", this.handleWheel);
  }
}
