import RAPIER from "@dimforge/rapier2d-compat";

export type Vector = {
  x: number;
  y: number;
};

export const getGravitationalForce = (
  G: number,
  mass1: number,
  mass2: number,
  distance: number
) => {
  const force = (G * mass1 * mass2) / (distance * Math.sqrt(distance) + 0.15);
  return force;
};

export const getDistance = (position1: Vector, position2: Vector) => {
  var a = Math.abs(position1.x - position2.x);
  var b = Math.abs(position1.y - position2.y);
  return Math.sqrt(Math.pow(a, 2) + Math.pow(b, 2));
};

export const getDirection = (position1: Vector, position2: Vector) => {
  return Math.atan2(position1.x - position2.x, position1.y - position2.y);
};

export const drawCircle = (
  ctx: CanvasRenderingContext2D,
  position: { x: number; y: number },
  radius: number,
  color: string
) => {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(position.x, position.y, radius, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fill();
};

const drawCuboid = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
  rotation: number
) => {
  ctx.strokeStyle = color;
  ctx.save();
  ctx.translate(x + width / 2, y + height / 2);
  ctx.rotate(rotation);
  ctx.strokeRect(-width / 2, -height / 2, width, height);
  ctx.restore();
};

export const drawBody = (
  ctx: CanvasRenderingContext2D,
  collider: RAPIER.Collider,
  body: RAPIER.RigidBody,
  metadata: BodyMetadata
) => {
  const position = body.translation();
  switch (metadata.type) {
    case "hero": {
      ctx.save();
      ctx.translate(position.x, position.y);
      ctx.rotate(collider.rotation());
      ctx.font =
        ((collider.shape as RAPIER.Ball).radius + 2) * 2 + "px monospace";
      // use these alignment properties for "better" positioning
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      // draw the emoji
      ctx.fillText("😜", 0, 4);
      ctx.restore();
      break;
    }
    case "planet":
    case "projectile":
    case "star": {
      const radius = (collider.shape as RAPIER.Ball).radius;
      drawCircle(ctx, position, radius, metadata.color);
      if (
        !metadata.positions ||
        body.bodyType() === RAPIER.RigidBodyType.Fixed
      ) {
        return;
      }
      const positionsLength = metadata.positions.length;
      for (let i = 0; i < positionsLength; i++) {
        const position = metadata.positions[i];
        const scale = (positionsLength - i) / positionsLength;
        const color =
          metadata.color +
          Math.round(scale * 100)
            .toString(16)
            .padStart(2, "0");

        drawCircle(ctx, position, radius * scale, color);
      }
      break;
    }
  }
};

export const drawLine = (
  ctx: CanvasRenderingContext2D,
  startPosition: Vector,
  endPosition: Vector,
  color: string
) => {
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.moveTo(startPosition.x, startPosition.y);
  ctx.lineTo(endPosition.x, endPosition.y);
  ctx.stroke();
};

export type BodyMetadata = {
  color: string;
  positions?: Vector[];
  type: "hero" | "projectile" | "planet" | "star";
};

export const createPlanet = (
  world: RAPIER.World,
  pos: Vector,
  vel: Vector,
  radius: number,
  density: number,
  isStatic: boolean
) => {
  const planetBody = world.createRigidBody(
    new RAPIER.RigidBodyDesc(
      isStatic ? RAPIER.RigidBodyType.Fixed : RAPIER.RigidBodyType.Dynamic
    )
      .setTranslation(pos.x, pos.y)
      .setLinvel(vel.x, vel.y)
  );

  const planetCollider = world.createCollider(
    RAPIER.ColliderDesc.ball(radius)
      .setDensity(density)
      .setFriction(0.9)
      .setRestitution(0.1)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
    planetBody
  );

  return [planetCollider, planetBody] as const;
};

export const createHero = (
  world: RAPIER.World,
  pos: Vector,
  radius: number,
  density: number
) => {
  const heroBody = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(pos.x, pos.y)
      .setLinvel(0, 0)
      .setAngvel(1)
  );
  const heroCollider = world.createCollider(
    RAPIER.ColliderDesc.ball(radius)
      .setDensity(density)
      .setFriction(1)
      .setRestitution(0)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
    heroBody
  );

  return [heroCollider, heroBody] as const;
};

export const createProjectile = (
  world: RAPIER.World,
  pos: Vector,
  vel: Vector,
  density: number
) => {
  const rotation = Math.atan2(vel.y, vel.x);
  const projectileBody = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(pos.x, pos.y)
      .setLinvel(vel.x, vel.y)
      .setRotation(rotation)
  );

  const projectileCollider = world.createCollider(
    RAPIER.ColliderDesc.ball(3)
      .setDensity(density)
      .setFriction(0.5)
      .setRestitution(0.5)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
    projectileBody
  );

  return [projectileCollider, projectileBody] as const;
};

export const scaleAt = (
  x: number,
  y: number,
  scaleBy: number,
  canvasInfos: { scale: number; x: number; y: number }
) => {
  // at pixel coords x, y scale by scaleBy
  canvasInfos.scale *= scaleBy;
  canvasInfos.x = x - (x - canvasInfos.x) * scaleBy;
  canvasInfos.y = y - (y - canvasInfos.y) * scaleBy;
};

export const toWorld = (
  { x, y }: Vector,
  canvasInfos: { scale: number; x: number; y: number }
) => {
  // convert to world coordinates
  x = (x - canvasInfos.x) / canvasInfos.scale;
  y = (y - canvasInfos.y) / canvasInfos.scale;
  return { x, y };
};

export const toScreen = (
  { x, y }: Vector,
  canvasInfos: { scale: number; x: number; y: number }
) => {
  x = x * canvasInfos.scale + canvasInfos.x;
  y = y * canvasInfos.scale + canvasInfos.y;
  return { x, y };
};
