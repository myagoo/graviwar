import { DataConnection } from "peerjs";
import { BlackHole } from "./BlackHole";
import { Camera } from "./Camera";
import { DefaultInput, JSONValue, NetGame, NetplayPlayer } from "./netplayjs";
import { Opponent } from "./Opponent";
import { Player } from "./Player";
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

const ARENA_RADIUS = 10_000;

const MAX_GAME_TICKS = 60 * 60 * 2;

export class Game extends NetGame {
  camera: Camera;
  player: Player;
  opponent: Opponent;
  blackHoles: BlackHole[] = [];
  ctx: CanvasRenderingContext2D;

  static timestep = 1000 / 30;
  static stateSyncPeriod = 0;

  constructor(
    public canvas: HTMLCanvasElement,
    public players: NetplayPlayer[],
    public connection: DataConnection,
  ) {
    super();

    console.log(connection);

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

    const randomPosition1 = random.vector(1000, ARENA_RADIUS - 1000);
    const randomVelocity1 = random.vector(0, 10);

    const randomPosition2 = random.vector(1000, ARENA_RADIUS - 1000);
    const randomVelocity2 = random.vector(0, 10);

    if (players[0].isLocal) {
      this.player = new Player(this, randomPosition1, randomVelocity1, 20_000);
      this.opponent = new Opponent(
        this,
        randomPosition2,
        randomVelocity2,
        20_000,
      );
      this.blackHoles.push(this.player, this.opponent)

    } else {
      this.opponent = new Opponent(
        this,
        randomPosition1,
        randomVelocity1,
        20_000,
      );
      this.player = new Player(this, randomPosition2, randomVelocity2, 20_000);
      this.blackHoles.push(this.opponent, this.player)
    }

    for (let i = 0; i < 10; i++) {
      const randomPosition = random.vector(1000, ARENA_RADIUS - 1000);
      const randomVelocity = random.vector(0, 10);

      if()


      const randomArea = random.range(10_000, 20_000);

      this.blackHoles.push(new BlackHole(this, randomPosition, randomVelocity, randomArea))
    }

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
        this.player ? this.player.radius * 50 : 10,
      ),
    );
  };

  initHandlers() {
    window.addEventListener("resize", this.handleResize);
    this.canvas.addEventListener("wheel", this.handleWheel);
  }

  tick(playerInputs: Map<NetplayPlayer, DefaultInput>) {
    playerInputs.forEach((input, player) => {
      if (input.clickDirection) {
        player.isLocalPlayer()
          ? this.player.expulse(input.clickDirection)
          : this.opponent.expulse(input.clickDirection);
      }
    });

    // const gravityRatio = this.ellapsedFrames / MAX_GAME_TICKS;
    const gravityRatio = 1;

    for (let i = 0; i < this.blackHoles.length; i++) {
      const blackHole = this.blackHoles[i];

      if (i !== this.blackHoles.length - 1) {
        for (let j = i + 1; j < this.blackHoles.length; j++) {
          const otherBlackHole = this.blackHoles[j];

          const intersectionArea = getIntersectionArea(
            blackHole.position,
            blackHole.radius,
            otherBlackHole.position,
            otherBlackHole.radius,
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
            otherBlackHole.position,
          );

          const forceDirection = getDirection(
            blackHole.position,
            otherBlackHole.position,
          );

          const forceMagnitude = getGravitationalForce(
            2 * gravityRatio,
            blackHole.area,
            otherBlackHole.area,
            distance,
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

      const distance = getDistanceFromCenter(position);

      if (distance + blackHole.radius > ARENA_RADIUS) {
        const normalizedVector = {
          x: position.x / distance,
          y: position.y / distance,
        };
        const dotProduct = velocity.x * normalizedVector.x +
          velocity.y * normalizedVector.y;
        velocity.x -= 2 * dotProduct * normalizedVector.x;
        velocity.y -= 2 * dotProduct * normalizedVector.y;
      }
    }
  }

  draw() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    this.camera.begin();

    const blackHoleToFocus = this.player || this.opponent ||
      this.blackHoles[this.blackHoles.length - 1];

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
      const isSmaller = this.player && this.player.area > blackHole.area;
      drawCircle(this.ctx, position, radius, isSmaller ? "green" : "red");
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
  }

  serialize(): JSONValue {
    return {
      player: this.player?.serialize(),
      opponent: this.opponent?.serialize(),
      blackHoles: this.blackHoles.map(blackHole => blackHole.serialize())
    }
  }

  deserialize(value: JSONValue): void {
    if(value.plauer)
  }

  destroy() {
    window.removeEventListener("resize", this.handleResize);
    window.removeEventListener("wheel", this.handleWheel);
  }
}
