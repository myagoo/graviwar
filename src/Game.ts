import { soloSettingsSchema, DEFAULT_MULTIPLAYER_SETTINGS, type SoloSettings } from "./solo-settings";
import { activateBonus, bonusDuration, BONUS_NAMES, type Bonus, type Pickup } from "./bonuses";
import { massFromRadius, radiusFromMass, bodyRadius } from "./mass";
import { spawnFluctuations } from "./fluctuations";
import { aiDecision } from "./ai";
import { shotChargeAt, shotSpeedMultiplier } from "./shots";
import { BodyTree } from "./body-tree";
import { sin, cos } from "./deterministic-math";
import { Camera } from "./Camera";
import { drawBlackHole, drawStars, drawFluctuation, drawHawkingRadiation, drawBonusEffect, HOLE_COLORS } from "./space-renderer";
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

const MIN_ZOOM_LEVEL_REGARDING_TO_RADIUS = 10;
export { shotChargeAt } from "./shots";

export const INITIAL_BODY_COUNT = DEFAULT_MULTIPLAYER_SETTINGS.bodyCount;

export type BlackHole = {
  id?: string;
  type: "player" | "ai" | "cpu" | "fluctuation";
  playerId?: string | number;
  pickup?: Pickup;
  expiresAt?: number;
  hawkingTicks?: number;
  aiChargeTicks?: number;
  pickupClaims?: { id: string | number; mass: number }[];
  storedBonus?: Bonus;
  activeBonus?: Bonus;
  bonusTicks?: number;
  position: Vector;
  velocity: Vector;
  mass: number;
  radius: number;
};

const cloneBodies = (bodies: BlackHole[]): BlackHole[] => bodies.map(body => ({
  ...body, position: { ...body.position }, velocity: { ...body.velocity },
  ...(body.pickupClaims ? { pickupClaims: body.pickupClaims.map(claim => ({ ...claim })) } : {}),
}));

export type Input = {
  clickDirection?: number;
  shotCharge?: number;
  activateBonus?: true;
};

export class Game {
  onSettingsChanged?: (settings: SoloSettings) => void;
  settings: SoloSettings = { ...DEFAULT_MULTIPLAYER_SETTINGS };
  private seed = "";
  get arenaRadius() { return this.settings.arenaRadius; }
  arenaRadiusAt(frame: number) {
    if (!this.settings.arenaShrinks) return this.arenaRadius;
    const progress = Math.max(0, Math.min(1, frame / (this.settings.shrinkSeconds * 60)));
    return this.arenaRadius * (1 - progress);
  }
  gravityAt() { return this.settings.gravity; }

  timestep = 1000 / 60;
  camera: Camera;
  blackHoles: BlackHole[] = [];
  ctx: CanvasRenderingContext2D;
  localBlackHoleIndex?: number;
  localPlayerId?: string | number;
  biggestBlackHoleIndex = 0;
  clickDirection?: number;
  private shotCharge?: number;
  private press?: { id: number; start: number; x: number; y: number; originX: number; originY: number; spectator: boolean; moved: boolean };
  private spectatedId?: string;
  private pointers = new Set<number>();
  private chargeBar = document.createElement("progress");
  private bonusRequested = false;
  onBonusChanged?: (label: string, disabled: boolean, item?: Bonus) => void;
  private bonusLabel = "";
  private reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  private useBonus(body: BlackHole) {
    activateBonus(body, this.blackHoles, this.settings);
  }
  requestBonus = () => { this.bonusRequested = true; };
  private handleKeyDown = (event: KeyboardEvent) => {
    if (event.code !== "Space" || event.repeat || event.target instanceof HTMLInputElement || event.target instanceof HTMLButtonElement) return;
    event.preventDefault(); this.requestBonus();
  };

  constructor(public canvas: HTMLCanvasElement) {
    canvas.focus();
    this.chargeBar.max = 100;
    this.chargeBar.setAttribute("aria-label", "Shot charge");
    Object.assign(this.chargeBar.style, { position: "fixed", width: "100px", height: "8px", zIndex: "5", pointerEvents: "none", accentColor: "#91d8ff" });
    this.chargeBar.hidden = true;

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
    this.seed = seed;
    this.settings = soloSettingsSchema.parse(settings ?? DEFAULT_MULTIPLAYER_SETTINGS);
    this.onSettingsChanged?.(this.settings);
    console.log("Starting game with seed", seed);
    this.blackHoles = [];
    this.localBlackHoleIndex = undefined;
    this.biggestBlackHoleIndex = 0;
    this.clickDirection = undefined;
    this.shotCharge = undefined;
    this.cancelPress();
    this.bonusRequested = false;
    this.bonusLabel = "";
    this.spectatedId = undefined;
    this.localPlayerId = players.find((player) => player.isLocal)?.id;
    players = [...players].sort((a, b) => String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0);
    const random = createRandomGenerator(seed);

    for (let i = 0; i < this.settings.bodyCount + players.length + this.settings.aiCount; i++) {
      const position = random.vectorFromCenter(this.arenaRadius - Math.max(this.settings.maxBodyRadius, this.settings.playerRadius));

      let type: BlackHole["type"], velocity: Vector, radius: number;

      const isAI = !players[i] && i < players.length + this.settings.aiCount;
      if (players[i] || isAI) {
        velocity = { x: 0, y: 0 };
        radius = this.settings.playerRadius;
        type = isAI ? "ai" : "player";
        if (players[i]?.isLocal) this.localBlackHoleIndex = i;
      } else {
        type = "cpu";
        velocity = random.vector(0, 10);
        radius = Math.sqrt(random.range(this.settings.minBodyRadius ** 2, this.settings.maxBodyRadius ** 2));
      }
      const mass = massFromRadius(radius);

      this.blackHoles.push({
        ...(isAI ? { aiChargeTicks: 0 } : {}),
        id: `initial:${i}`,
        type,
        ...(players[i] ? { playerId: players[i].id } : isAI ? { playerId: `ai:${i}` } : {}),
        position,
        velocity,
        mass,
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
      this.localBlackHoleIndex;
    this.camera.zoomTo(
      Math.max(
        this.camera.distance * zoomFactor,
        (focusedBlackHoleIndex === undefined ? 1 : this.blackHoles[focusedBlackHoleIndex].radius) *
          MIN_ZOOM_LEVEL_REGARDING_TO_RADIUS
      )
    );
  };

  handleTouchStart = (touchStartEvent: TouchEvent) => {
    if (touchStartEvent.touches.length === 2) {
      this.cancelPress();
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
        if (touchMoveEvent.touches.length !== 2) return;
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
          this.localBlackHoleIndex;

        this.camera.zoomTo(
          Math.max(
            initialCameraDistance * zoomFactor,
            (focusedBlackHoleIndex === undefined ? 1 : this.blackHoles[focusedBlackHoleIndex].radius) *
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
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("resize", this.handleResize);
    document.body.append(this.chargeBar);
    this.canvas.addEventListener("pointerdown", this.handlePointerDown);
    this.canvas.addEventListener("pointermove", this.handlePointerMove);
    this.canvas.addEventListener("pointerup", this.handlePointerUp);
    this.canvas.addEventListener("pointercancel", this.cancelPress);
    this.canvas.addEventListener("lostpointercapture", this.cancelPress);
    this.canvas.addEventListener("contextmenu", this.preventContextMenu);
    window.addEventListener("blur", this.cancelPress);
    document.addEventListener("visibilitychange", this.cancelPress);
    this.canvas.addEventListener("wheel", this.handleWheel);
    this.canvas.addEventListener("touchstart", this.handleTouchStart);
  }

  private cancelPress = () => {
    this.press = undefined;
    this.pointers.clear();
    this.chargeBar.hidden = true;
  };
  private preventContextMenu = (event: Event) => { event.preventDefault(); };
  private handlePointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    this.pointers.add(event.pointerId);
    if (this.pointers.size !== 1 || !event.isPrimary) { this.press = undefined; this.chargeBar.hidden = true; return; }
    const body = this.localBlackHoleIndex === undefined ? undefined : this.blackHoles[this.localBlackHoleIndex];
    if (body && (body.radius < this.settings.minShotRadius || body.activeBonus === "supermassive")) return;
    this.canvas.setPointerCapture(event.pointerId);
    this.press = { id: event.pointerId, start: performance.now(), x: event.clientX, y: event.clientY, originX: event.clientX, originY: event.clientY, spectator: !body, moved: false };
  };
  private handlePointerMove = (event: PointerEvent) => {
    const press = this.press;
    if (!press || press.id !== event.pointerId) return;
    press.moved ||= Math.hypot(event.clientX - press.originX, event.clientY - press.originY) > 6;
    if (press.spectator && press.moved) {
      this.spectatedId = undefined;
      const view = this.camera.viewport, bounds = this.canvas.getBoundingClientRect();
      this.camera.lookAt((view.left + view.right) / 2 - (event.clientX - press.x) * view.width / bounds.width,
        (view.top + view.bottom) / 2 - (event.clientY - press.y) * view.height / bounds.height);
    }
    press.x = event.clientX; press.y = event.clientY;
  };
  private handlePointerUp = (event: PointerEvent) => {
    const press = this.press;
    this.pointers.delete(event.pointerId);
    if (!press || press.id !== event.pointerId) return;
    const body = this.localBlackHoleIndex === undefined ? undefined : this.blackHoles[this.localBlackHoleIndex];
    if (press.spectator && !press.moved) {
      if (this.spectatedId !== undefined) this.spectatedId = undefined;
      else {
        const bounds = this.canvas.getBoundingClientRect();
        const point = this.camera.screenToWorld({ x: (event.clientX - bounds.left) * this.canvas.width / bounds.width, y: (event.clientY - bounds.top) * this.canvas.height / bounds.height });
        this.spectatedId = this.blackHoles.find(body => body.type !== "fluctuation" && getDistance(point, body.position) <= Math.max(body.radius, 12 / this.camera.viewport.scale[0]))?.id;
      }
    }
    if (!press.spectator && body && body.radius >= this.settings.minShotRadius && body.activeBonus !== "supermassive") {
      const bounds = this.canvas.getBoundingClientRect();
      this.clickDirection = getDirection({ x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 }, { x: event.clientX, y: event.clientY });
      this.shotCharge = shotChargeAt(performance.now() - press.start, this.settings);
    }
    this.cancelPress();
  };

  flushInputBuffer(): Input | undefined {
    const clickDirection = this.clickDirection;
    delete this.clickDirection;
    const shotCharge = this.shotCharge;
    this.shotCharge = undefined;
    const activateBonus = this.bonusRequested;
    this.bonusRequested = false;
    if (clickDirection !== undefined || activateBonus) {
      return { ...(clickDirection !== undefined ? { clickDirection, ...(shotCharge ? { shotCharge } : {}) } : {}), ...(activateBonus ? { activateBonus: true } : {}) };
    }
    return undefined;
  }

  expulse(blackHole: BlackHole, direction: number, radiation = false, shotCharge = 0) {
    if (blackHole.mass <= 0 || blackHole.type === "fluctuation" || (!radiation && (blackHole.radius < this.settings.minShotRadius || blackHole.activeBonus === "supermassive"))) {
      return;
    }
    if (!radiation && blackHole.aiChargeTicks !== undefined) blackHole.aiChargeTicks = 0;
    const playerPosition = blackHole.position;
    const playerVelocity = blackHole.velocity;
    const playerRadius = blackHole.radius;
    const playerMass = blackHole.mass;

    const projectilePosition = {
      x: playerPosition.x + playerRadius * 2 * cos(direction),
      y: playerPosition.y + playerRadius * 2 * sin(direction),
    };

    const projectileMass = playerMass * (radiation ? this.settings.hawkingMass : this.settings.shotMass);

    const projectileVelocityFactor = radiusFromMass(projectileMass) * (radiation ? this.settings.hawkingSpeed : this.settings.shotSpeed * (blackHole.activeBonus === "jet" ? this.settings.jetBoost : 1)) * (radiation ? 1 : shotSpeedMultiplier(shotCharge, this.settings));
    const ejectionVelocity = {
      x: cos(direction) * projectileVelocityFactor,
      y: sin(direction) * projectileVelocityFactor,
    };

    const projectileVelocity = {
      x: playerVelocity.x + ejectionVelocity.x,
      y: playerVelocity.y + ejectionVelocity.y,
    };

    this.blackHoles.push({
      type: "cpu",
      position: projectilePosition,
      velocity: projectileVelocity,
      mass: projectileMass,
      radius: radiusFromMass(projectileMass),
    });

    blackHole.mass -= projectileMass;
    // Equal and opposite momentum, relative to the original body's velocity.
    const recoil = projectileMass / blackHole.mass;
    blackHole.velocity.x -= ejectionVelocity.x * recoil;
    blackHole.velocity.y -= ejectionVelocity.y * recoil;
    blackHole.radius = bodyRadius(blackHole, this.settings);
  }

  tick(
    playerInputs: Map<NetplayPlayer, Input | undefined>,
    frameNumber: number
  ) {
    const arenaRadius = this.arenaRadiusAt(frameNumber);
    for (const body of this.blackHoles) if (body.expiresAt !== undefined && frameNumber >= body.expiresAt) body.mass = 0;
    spawnFluctuations(this.blackHoles, this.seed, frameNumber, arenaRadius, this.settings);
    const radiating = this.blackHoles.filter(body => body.mass > 0 && body.hawkingTicks);
    for (let i = 0; i < radiating.length; i++) {
      const body = radiating[i];
      if ((this.settings.hawkingSeconds * 60 - body.hawkingTicks!) % this.settings.hawkingIntervalTicks === 0) this.expulse(body, createRandomGenerator(`${this.seed}:hawking:${frameNumber}:${i}`).angle(), true);
      if (--body.hawkingTicks! <= 0) delete body.hawkingTicks;
    }
    for (const body of this.blackHoles) if (body.bonusTicks !== undefined) {
      const wasCompressed = body.activeBonus === "supermassive";
      body.bonusTicks--;
      if (body.bonusTicks <= 0) { delete body.bonusTicks; delete body.activeBonus; }
      if (wasCompressed) body.radius = bodyRadius(body, this.settings);
    }
    [...playerInputs].sort(([a], [b]) => String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0).forEach(([player, input]) => {
      if (input !== undefined) {
        const playerBlackHole = this.blackHoles.find(
          (blackHole) =>
            blackHole.playerId === player.id
        );
        if (playerBlackHole) {
          if (input.activateBonus) this.useBonus(playerBlackHole);
          if (input.clickDirection !== undefined) this.expulse(playerBlackHole, input.clickDirection, false, input.shotCharge);
        }
      }
    });

    if (frameNumber % 30 === 0) {
      const moves = this.blackHoles.filter(body => body.type === "ai").map(body =>
        ({ body, input: aiDecision(body, this.blackHoles, this.arenaRadiusAt(frameNumber + 60), this.settings) }));
      for (const { body, input } of moves) {
        if (input.activateBonus) this.useBonus(body);
        if (input.clickDirection !== undefined) this.expulse(body, input.clickDirection, false, input.shotCharge);
      }
    }

    const gravityMultiplier =
      this.gravityAt();

    this.blackHoles.forEach((body, index) => { body.id ??= `${frameNumber}:${index}`; });
    const tree = new BodyTree(this.blackHoles, this.settings);
    tree.absorb();
    tree.applyGravity(gravityMultiplier, this.settings.gravityTheta);

    let alive = 0;
    this.localBlackHoleIndex = undefined;
    this.biggestBlackHoleIndex = 0;
    for (let i = 0; i < this.blackHoles.length; i++) {
      const blackHole = this.blackHoles[i];
      if (blackHole.mass <= 0) continue;
      this.blackHoles[alive] = blackHole;
      if (blackHole.playerId !== undefined && blackHole.playerId === this.localPlayerId) this.localBlackHoleIndex = alive;
      if (alive === 0 || this.blackHoles[this.biggestBlackHoleIndex].mass < blackHole.mass) this.biggestBlackHoleIndex = alive;
      alive++;

      const { position, velocity } = blackHole;

      position.x += velocity.x;
      position.y += velocity.y;

      // Handle arena border
      const distance = getDistanceFromCenter(position);

      if (blackHole.radius >= arenaRadius) {
        position.x = position.y = velocity.x = velocity.y = 0;
      } else if (distance + blackHole.radius > arenaRadius) {
        const normalizedVector = {
          x: position.x / distance,
          y: position.y / distance,
        };

        // Teleport the blackhole to the border of the arena to avoid it getting stuck
        const newDist = arenaRadius - blackHole.radius;
        position.x = normalizedVector.x * newDist;
        position.y = normalizedVector.y * newDist;

        const dotProduct =
          velocity.x * normalizedVector.x + velocity.y * normalizedVector.y;
        // A shrinking border must not reflect a body already moving inward back out.
        if (dotProduct > 0) {
          velocity.x -= 2 * dotProduct * normalizedVector.x;
          velocity.y -= 2 * dotProduct * normalizedVector.y;
          velocity.x *= this.settings.borderBounce;
          velocity.y *= this.settings.borderBounce;
        }
      }
    }
    this.blackHoles.length = alive;
    for (const body of this.blackHoles) if (body.type === "ai" || body.aiChargeTicks !== undefined) {
      body.aiChargeTicks = body.activeBonus === "supermassive" ? 0 : Math.min(Math.ceil(this.settings.chargeMs * 60 / 1000), (body.aiChargeTicks ?? 0) + 1);
    }
  }

  draw(_timestamp: DOMHighResTimeStamp, frameNumber: number) {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    const localBody = this.localBlackHoleIndex === undefined ? undefined : this.blackHoles[this.localBlackHoleIndex];
    const blackHoleToFocus = localBody ?? this.blackHoles.find(body => this.spectatedId !== undefined && body.id === this.spectatedId);
    if (blackHoleToFocus) this.camera.lookAt(blackHoleToFocus.position.x, blackHoleToFocus.position.y);
    else this.spectatedId = undefined;
    if (localBody) {
      const minZoom = localBody.radius * MIN_ZOOM_LEVEL_REGARDING_TO_RADIUS;
      if (this.camera.distance < minZoom) this.camera.zoomTo(minZoom);
    }

    drawStars(this.ctx, this.camera);
    this.camera.begin();

    for (const blackHole of this.blackHoles) {
      const position = blackHole.position;
      const radius = blackHole.radius;
      const isSmaller = (blackHoleToFocus?.radius ?? 0) > blackHole.radius;
      const scale = this.camera.viewport.scale[0];
      const margin = blackHole.type === "fluctuation" ? 10 / scale : blackHole.hawkingTicks ? Math.max(radius * 3, 100 / scale) : blackHole.activeBonus ? Math.max(radius * 3, 250 / scale) : radius * 2.4;
      const view = this.camera.viewport;
      if (position.x + margin < view.left || position.x - margin > view.right ||
          position.y + margin < view.top || position.y - margin > view.bottom) continue;
      if (blackHole.type === "fluctuation") {
        drawFluctuation(this.ctx, position, scale, frameNumber, blackHole.pickup === "hawking", this.reducedMotion.matches);
        continue;
      }
      if (blackHole.hawkingTicks) drawHawkingRadiation(this.ctx, position, radius, scale, blackHole.hawkingTicks, this.reducedMotion.matches, this.settings.hawkingSeconds * 60);
      if (blackHole.activeBonus) {
        const duration = bonusDuration(blackHole.activeBonus, this.settings);
        drawBonusEffect(this.ctx, position, radius, blackHole.activeBonus, duration - (blackHole.bonusTicks ?? duration), scale,
          Math.atan2(blackHole.velocity.y, blackHole.velocity.x), this.reducedMotion.matches);
      }
      drawBlackHole(
        this.ctx,
        position,
        radius,
        blackHole.playerId !== undefined && blackHole.playerId === this.localPlayerId
          ? HOLE_COLORS.local
          : blackHole.type !== "cpu"
          ? HOLE_COLORS.player
          : isSmaller
          ? HOLE_COLORS.smaller
          : HOLE_COLORS.larger,
        radius * this.camera.viewport.scale[0]
      );
      if (blackHole.pickup) {
        const scale = this.camera.viewport.scale[0];
        this.ctx.save();
        this.ctx.strokeStyle = blackHole.pickup === "hawking" ? "#ffb969" : "#7cffda";
        this.ctx.lineWidth = 2 / scale;
        this.ctx.setLineDash([5 / scale, 4 / scale]);
        this.ctx.beginPath();this.ctx.arc(position.x, position.y, Math.max(radius * 1.4, 9 / scale), 0, Math.PI * 2);this.ctx.stroke();
        if (blackHole.pickup) {
          this.ctx.fillStyle = this.ctx.strokeStyle;this.ctx.font = `${14 / scale}px monospace`;
          this.ctx.textAlign = "center";this.ctx.textBaseline = "middle";
          this.ctx.fillText(blackHole.pickup === "hawking" ? "☢" : "?", position.x, position.y);
        }
        this.ctx.restore();
      }
    }

    this.ctx.strokeStyle = "#637f9b";
    this.ctx.lineWidth = 1.5 / this.camera.viewport.scale[0];

    this.ctx.beginPath();
    this.ctx.arc(0, 0, this.arenaRadiusAt(frameNumber), 0, Math.PI * 2);
    this.ctx.closePath();
    this.ctx.stroke();

    this.camera.end();

    const local = this.blackHoles.find(body => body.playerId !== undefined && body.playerId === this.localPlayerId);
    if (this.press && !this.press.spectator && (!local || local.activeBonus === "supermassive")) this.cancelPress();
    if (this.press && !this.press.spectator) {
      const held = performance.now() - this.press.start;
      this.chargeBar.hidden = held < this.settings.tapMs;
      this.chargeBar.value = shotChargeAt(held, this.settings);
      this.chargeBar.style.left = `${Math.max(8, Math.min(window.innerWidth - 108, this.press.x - 50))}px`;
      this.chargeBar.style.top = `${Math.max(8, Math.min(window.innerHeight - 16, this.press.y - 45))}px`;
    }
    const label = local?.activeBonus
      ? `${BONUS_NAMES[local.activeBonus]} · ${((local.bonusTicks ?? 0) / 60).toFixed(1)}s${local.storedBonus ? ` · Stored: ${BONUS_NAMES[local.storedBonus]}` : ""}`
      : local?.storedBonus ? `Use ${BONUS_NAMES[local.storedBonus]} · Space` : "Absorb a glowing fluctuation or ? body to collect an item";
    if (label !== this.bonusLabel) {
      this.bonusLabel = label;
      const shown = local?.activeBonus ?? local?.storedBonus;
      this.onBonusChanged?.(label, !local?.storedBonus || !!local.activeBonus, shown);
    }
    this.ctx.textBaseline = "top";
    this.ctx.font = "12px monospace";
    this.ctx.fillStyle = "#9eafc2";
    this.ctx.textAlign = "start";
    this.ctx.fillText(`${this.blackHoles.filter(body => body.playerId !== undefined).length} PLAYERS / ${this.blackHoles.filter(body => body.type === "cpu").length} BLACK HOLES`, 72, 16);
    this.ctx.fillText(`ARENA ${Math.round(this.arenaRadiusAt(frameNumber))}`, 72, 32);
    if (local?.hawkingTicks) {
      this.ctx.fillStyle = "#ffb969";
      this.ctx.fillText(`HAWKING RADIATION ${(local.hawkingTicks / 60).toFixed(1)}s`, 72, 48);
      this.ctx.fillStyle = "#9eafc2";
    }
    this.ctx.textAlign = "end";
    const gravityMultiplier =
      this.gravityAt();

    this.ctx.fillText(
      `GRAVITY ${gravityMultiplier.toFixed(2)}G`,
      this.canvas.offsetWidth - 16,
      32
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
      body.mass > bodies[best].mass ? i : best, 0);
  }

  destroy() {
    window.removeEventListener("keydown", this.handleKeyDown);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    window.removeEventListener("resize", this.handleResize);
    this.cancelPress();
    this.chargeBar.remove();
    this.canvas.removeEventListener("pointerdown", this.handlePointerDown);
    this.canvas.removeEventListener("pointermove", this.handlePointerMove);
    this.canvas.removeEventListener("pointerup", this.handlePointerUp);
    this.canvas.removeEventListener("pointercancel", this.cancelPress);
    this.canvas.removeEventListener("lostpointercapture", this.cancelPress);
    this.canvas.removeEventListener("contextmenu", this.preventContextMenu);
    window.removeEventListener("blur", this.cancelPress);
    document.removeEventListener("visibilitychange", this.cancelPress);
    this.canvas.removeEventListener("wheel", this.handleWheel);
    this.canvas.removeEventListener("touchstart", this.handleTouchStart);
  }
}
