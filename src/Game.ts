import { soloSettingsSchema, type SoloSettings } from "./solo-settings";
import { BodyTree } from "./body-tree";
import { sin, cos } from "./deterministic-math";
import { Camera } from "./Camera";
import { drawBlackHole, drawStars, HOLE_COLORS } from "./space-renderer";
import {
  NetplayPlayer,
} from "./netplayjs/netcode/types";
import {
  createRandomGenerator,
  getDirection,
  getDistance,
  getDistanceFromCenter,
  Vector,
} from "./utils";

const MIN_ZOOM_LEVEL_REGARDING_TO_RADIUS = 30;

export const INITIAL_BODY_COUNT = 1000;
const ARENA_RADIUS = 20_000;

const MIN_GRAVITY_MULTIPLIER = 0.1;
const GRAVITY_INCREASE_PER_FRAME = 0.0004;

export type BlackHole = {
  type: "player" | "cpu";
  playerId?: string | number;
  position: Vector;
  velocity: Vector;
  area: number;
  radius: number;
};

const cloneBodies = (bodies: BlackHole[]): BlackHole[] => bodies.map(body => ({
  ...body, position: { ...body.position }, velocity: { ...body.velocity },
}));

export type Input = {
  clickDirection: number;
};

export class Game {
  private settings?: SoloSettings;
  get arenaRadius() { return this.settings?.arenaRadius ?? ARENA_RADIUS; }
  gravityAt(frame: number) {
    return (this.settings?.gravity ?? MIN_GRAVITY_MULTIPLIER) +
      ((this.settings?.gravityIncreases ?? true) ? frame * GRAVITY_INCREASE_PER_FRAME : 0);
  }

  timestep = 1000 / 60;
  camera: Camera;
  blackHoles: BlackHole[] = [];
  ctx: CanvasRenderingContext2D;
  localBlackHoleIndex?: number;
  localPlayerId?: string | number;
  biggestBlackHoleIndex = 0;
  clickDirection?: number;

  constructor(public canvas: HTMLCanvasElement) {
    canvas.focus();

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const ctx = canvas.getContext("2d");

    if (!ctx) {
      throw new Error(`Context 2d could not be retrieved`);
    }

    this.ctx = ctx;
    this.camera = new Camera(ctx, { fieldOfView: 1 });
  }

  start(players: NetplayPlayer[], seed: string, settings?: SoloSettings) {
    this.settings = settings ? soloSettingsSchema.parse(settings) : undefined;
    console.log("Starting game with seed", seed);
    this.blackHoles = [];
    this.localBlackHoleIndex = undefined;
    this.biggestBlackHoleIndex = 0;
    this.clickDirection = undefined;
    this.localPlayerId = players.find((player) => player.isLocal)?.id;
    players = [...players].sort((a, b) => String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0);
    const random = createRandomGenerator(seed);

    for (let i = 0; i < (this.settings?.bodyCount ?? INITIAL_BODY_COUNT); i++) {
      const position = random.vectorFromCenter(this.settings
        ? this.arenaRadius - Math.max(this.settings.maxBodyRadius, this.settings.playerRadius)
        : this.arenaRadius);

      let type: BlackHole["type"], velocity: Vector, area: number;

      if (players[i]) {
        velocity = { x: 0, y: 0 };
        area = this.settings ? Math.PI * this.settings.playerRadius * this.settings.playerRadius : 75_000;
        type = "player";
        if (players[i].isLocal) this.localBlackHoleIndex = i;
      } else {
        type = "cpu";
        velocity = random.vector(0, 10);
        area = this.settings
          ? random.range(Math.PI * this.settings.minBodyRadius * this.settings.minBodyRadius, Math.PI * this.settings.maxBodyRadius * this.settings.maxBodyRadius)
          : random.range(10_000, 30_000);
      }
      const radius = Math.sqrt(area / Math.PI);

      this.blackHoles.push({
        type,
        ...(players[i] ? { playerId: players[i].id } : {}),
        position,
        velocity,
        area,
        radius,
      });
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
    const focusedBlackHoleIndex =
      this.localBlackHoleIndex ?? this.biggestBlackHoleIndex;
    this.camera.zoomTo(
      Math.max(
        this.camera.distance * zoomFactor,
        this.blackHoles[focusedBlackHoleIndex].radius *
          MIN_ZOOM_LEVEL_REGARDING_TO_RADIUS
      )
    );
  };

  handleTouchStart = (touchStartEvent: TouchEvent) => {
    if (touchStartEvent.touches.length === 2) {
      const initialPinchDistance = getDistance(
        {
          x: touchStartEvent.touches[0].clientX,
          y: touchStartEvent.touches[0].clientY,
        },
        {
          x: touchStartEvent.touches[1].clientX,
          y: touchStartEvent.touches[1].clientY,
        }
      );
      const initialCameraDistance = this.camera.distance;

      const handleTouchMove = (touchMoveEvent: TouchEvent) => {
        const pinchDistance = getDistance(
          {
            x: touchMoveEvent.touches[0].clientX,
            y: touchMoveEvent.touches[0].clientY,
          },
          {
            x: touchMoveEvent.touches[1].clientX,
            y: touchMoveEvent.touches[1].clientY,
          }
        );

        const zoomFactor = 1 / (pinchDistance / initialPinchDistance);

        const focusedBlackHoleIndex =
          this.localBlackHoleIndex ?? this.biggestBlackHoleIndex;

        this.camera.zoomTo(
          Math.max(
            initialCameraDistance * zoomFactor,
            this.blackHoles[focusedBlackHoleIndex].radius *
              MIN_ZOOM_LEVEL_REGARDING_TO_RADIUS
          )
        );
      };

      const handleTouchEnd = (touchEndEvent: TouchEvent) => {
        if (touchEndEvent.touches.length < 2) {
          this.canvas.removeEventListener("touchmove", handleTouchMove);
          this.canvas.removeEventListener("touchend", handleTouchEnd);
        }
      };

      this.canvas.addEventListener("touchmove", handleTouchMove);
      this.canvas.addEventListener("touchend", handleTouchEnd);
    }
  };

  initHandlers() {
    window.addEventListener("resize", this.handleResize);
    this.canvas.addEventListener("click", this.handleClick);
    this.canvas.addEventListener("wheel", this.handleWheel);
    this.canvas.addEventListener("touchstart", this.handleTouchStart);
  }

  handleClick = (event: MouseEvent) => {
    // Do nothing if the local player is ded
    if (this.localBlackHoleIndex === undefined) {
      return;
    }
    this.clickDirection = getDirection(
      {
        x: this.canvas.offsetWidth / 2,
        y: this.canvas.offsetHeight / 2,
      },
      {
        x: event.offsetX,
        y: event.offsetY,
      }
    );
  };

  flushInputBuffer(): Input | undefined {
    const clickDirection = this.clickDirection;
    delete this.clickDirection;
    if (clickDirection !== undefined) {
      return { clickDirection };
    }
    return undefined;
  }

  expulse(blackHole: BlackHole, direction: number) {
    if (blackHole.radius < 10) {
      return;
    }
    const playerPosition = blackHole.position;
    const playerVelocity = blackHole.velocity;
    const playerRadius = blackHole.radius;
    const playerArea = blackHole.area;

    const projectilePosition = {
      x: playerPosition.x + playerRadius * 2 * cos(direction),
      y: playerPosition.y + playerRadius * 2 * sin(direction),
    };

    const projectileArea = playerArea / 10;

    const projectileVelocityFactor = Math.sqrt(projectileArea / Math.PI);

    const projectileVelocity = {
      x: playerVelocity.x + cos(direction) * projectileVelocityFactor,
      y: playerVelocity.y + sin(direction) * projectileVelocityFactor,
    };

    this.blackHoles.push({
      type: "cpu",
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

  tick(
    playerInputs: Map<NetplayPlayer, Input | undefined>,
    frameNumber: number
  ) {
    [...playerInputs].sort(([a], [b]) => String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0).forEach(([player, input]) => {
      if (input !== undefined) {
        const playerBlackHole = this.blackHoles.find(
          (blackHole) =>
            blackHole.playerId === player.id
        );
        if (playerBlackHole) {
          this.expulse(playerBlackHole, input.clickDirection);
        }
      }
    });

    const gravityMultiplier =
      this.gravityAt(frameNumber);

    const tree = new BodyTree(this.blackHoles);
    tree.absorb();
    tree.applyGravity(gravityMultiplier);

    let alive = 0;
    this.localBlackHoleIndex = undefined;
    this.biggestBlackHoleIndex = 0;
    for (let i = 0; i < this.blackHoles.length; i++) {
      const blackHole = this.blackHoles[i];
      if (blackHole.radius < 1) continue;
      this.blackHoles[alive] = blackHole;
      if (blackHole.playerId !== undefined && blackHole.playerId === this.localPlayerId) this.localBlackHoleIndex = alive;
      if (alive === 0 || this.blackHoles[this.biggestBlackHoleIndex].area < blackHole.area) this.biggestBlackHoleIndex = alive;
      alive++;

      const { position, velocity } = blackHole;

      position.x += velocity.x;
      position.y += velocity.y;

      // Handle arena border
      const distance = getDistanceFromCenter(position);

      if (blackHole.radius >= this.arenaRadius) {
        position.x = position.y = velocity.x = velocity.y = 0;
      } else if (distance + blackHole.radius > this.arenaRadius) {
        const normalizedVector = {
          x: position.x / distance,
          y: position.y / distance,
        };

        // Teleport the blackhole to the border of the arena to avoid it getting stuck
        const newDist = this.arenaRadius - blackHole.radius;
        position.x = normalizedVector.x * newDist;
        position.y = normalizedVector.y * newDist;

        const dotProduct =
          velocity.x * normalizedVector.x + velocity.y * normalizedVector.y;
        velocity.x -= 2 * dotProduct * normalizedVector.x;
        velocity.y -= 2 * dotProduct * normalizedVector.y;
        velocity.x *= 0.8;
        velocity.y *= 0.8;
      }
    }
    this.blackHoles.length = alive;
  }

  draw(_timestamp: DOMHighResTimeStamp, frameNumber: number) {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    const focusedBlackHoleIndex =
      this.localBlackHoleIndex ?? this.biggestBlackHoleIndex;

    const blackHoleToFocus = this.blackHoles[focusedBlackHoleIndex];

    if (!blackHoleToFocus) return;

    this.camera.lookAt(
      blackHoleToFocus.position.x,
      blackHoleToFocus.position.y
    );

    const newMinZoomLevel =
      blackHoleToFocus.radius * MIN_ZOOM_LEVEL_REGARDING_TO_RADIUS;
    if (this.camera.distance < newMinZoomLevel) {
      this.camera.zoomTo(newMinZoomLevel);
    }

    drawStars(this.ctx, this.camera);
    this.camera.begin();

    for (const blackHole of this.blackHoles) {
      const position = blackHole.position;
      const radius = blackHole.radius;
      const isSmaller = blackHoleToFocus.area > blackHole.area;
      const margin = radius * 2.4;
      const view = this.camera.viewport;
      if (position.x + margin < view.left || position.x - margin > view.right ||
          position.y + margin < view.top || position.y - margin > view.bottom) continue;
      drawBlackHole(
        this.ctx,
        position,
        radius,
        blackHole.playerId !== undefined && blackHole.playerId === this.localPlayerId
          ? HOLE_COLORS.local
          : blackHole.type === "player"
          ? HOLE_COLORS.player
          : isSmaller
          ? HOLE_COLORS.smaller
          : HOLE_COLORS.larger,
        radius * this.camera.viewport.scale[0]
      );
    }

    this.ctx.strokeStyle = "#637f9b";
    this.ctx.lineWidth = 1.5 / this.camera.viewport.scale[0];

    this.ctx.beginPath();
    this.ctx.arc(0, 0, this.arenaRadius, 0, Math.PI * 2);
    this.ctx.closePath();
    this.ctx.stroke();

    this.camera.end();

    this.ctx.textBaseline = "top";
    this.ctx.font = "12px monospace";
    this.ctx.fillStyle = "#9eafc2";
    this.ctx.textAlign = "start";
    this.ctx.fillText(`${this.blackHoles.length} BLACK HOLES`, 16, 16);
    this.ctx.textAlign = "end";
    const gravityMultiplier =
      this.gravityAt(frameNumber);

    this.ctx.fillText(
      `GRAVITY ${gravityMultiplier.toFixed(2)}G`,
      this.canvas.offsetWidth - 16,
      16
    );
  }

  getFrozenSnapshot(): BlackHole[] {
    return cloneBodies(this.blackHoles);
  }

  rollbackToSnapshot(blackHoles: BlackHole[]): void {
    this.blackHoles = cloneBodies(blackHoles);
    const localIndex = this.blackHoles.findIndex((body) =>
      body.playerId !== undefined && body.playerId === this.localPlayerId);
    this.localBlackHoleIndex = localIndex < 0 ? undefined : localIndex;
    this.biggestBlackHoleIndex = this.blackHoles.reduce((best, body, i, bodies) =>
      body.area > bodies[best].area ? i : best, 0);
  }

  destroy() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    window.removeEventListener("resize", this.handleResize);
    this.canvas.removeEventListener("click", this.handleClick);
    this.canvas.removeEventListener("wheel", this.handleWheel);
    this.canvas.removeEventListener("touchstart", this.handleTouchStart);
  }
}
