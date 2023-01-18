import RAPIER from "@dimforge/rapier2d-compat";

export type Vector = {
  x: number;
  y: number;
};

export const random = (min: number, max: number) => {
  return Math.random() * (max - min) + min;
};

export const randomVector = (min: number, max: number) => {
  return {
    x: random(min, max),
    y: random(min, max),
  };
};

export const randomColor = () => {
  return "#" + Math.floor(Math.random() * 16777215).toString(16);
};

export const getGravitationalForce = (
  G: number,
  mass1: number,
  mass2: number,
  distance: number
) => {
  const force = 1.1 * ((mass1 * mass2) / (distance * distance));
  // 0.1 * ((mass1 * mass2) / (distance * Math.sqrt(distance) + 0.15));
  return force;
};

export const getDistance = (position1: Vector, position2: Vector) => {
  var a = Math.abs(position1.x - position2.x);
  var b = Math.abs(position1.y - position2.y);
  return Math.sqrt(Math.pow(a, 2) + Math.pow(b, 2));
};

export const getDirection = (position1: Vector, position2: Vector) => {
  return Math.atan2(position2.y - position1.y, position2.x - position1.x);
};

export function getIntersectionArea(
  position1: Vector,
  radius1: number,
  position2: Vector,
  radius2: number
) {
  // Calculate the euclidean distance
  // between the two points
  const distance = getDistance(position1, position2);

  if (distance > radius1 + radius2) return 0;

  if (distance <= radius1 - radius2 && radius1 >= radius2)
    return Math.floor(Math.PI * radius2 * radius2);

  if (distance <= radius2 - radius1 && radius2 >= radius1)
    return Math.floor(Math.PI * radius1 * radius1);

  const alpha =
    Math.acos(
      (radius1 * radius1 + distance * distance - radius2 * radius2) /
        (2 * radius1 * distance)
    ) * 2;
  const beta =
    Math.acos(
      (radius2 * radius2 + distance * distance - radius1 * radius1) /
        (2 * radius2 * distance)
    ) * 2;
  const a1 =
    0.5 * beta * radius2 * radius2 - 0.5 * radius2 * radius2 * Math.sin(beta);
  const a2 =
    0.5 * alpha * radius1 * radius1 - 0.5 * radius1 * radius1 * Math.sin(alpha);
  return Math.floor(a1 + a2);
}

export const drawCircle = (
  ctx: CanvasRenderingContext2D,
  position: Vector,
  radius: number,
  color: string
) => {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(position.x, position.y, radius, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
};

export const drawCuboid = (
  ctx: CanvasRenderingContext2D,
  position: Vector,
  halfExtents: Vector,
  color: string,
  rotation: number
) => {
  ctx.save();
  ctx.fillStyle = color;
  ctx.translate(position.x, position.y);
  ctx.rotate(rotation);
  ctx.fillRect(
    -halfExtents.x,
    -halfExtents.y,
    halfExtents.x * 2,
    halfExtents.y * 2
  );
  ctx.restore();
};

const emojis = ["🪩", "🍪", "🏀", "🍩", "🌞", "🌍", "🤢", "🤡", "🥸", "🥶"];
const emoji = emojis[Math.floor(Math.random() * emojis.length)];

export const drawBody = (
  ctx: CanvasRenderingContext2D,
  collider: RAPIER.Collider,
  body: RAPIER.RigidBody,
  metadata: BodyMetadata
) => {
  const position = body.translation();
  switch (metadata.type) {
    case "hero": {
      const radius = (collider.shape as RAPIER.Ball).radius;
      ctx.save();
      ctx.translate(position.x, position.y);
      ctx.rotate(collider.rotation());
      ctx.font = radius * 2 + "px monospace";
      // use these alignment properties for "better" positioning
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      // draw the emoji
      ctx.fillText(emoji, 0, 4);
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
  ctx.lineWidth = 5;
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
  mass: number;
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
      .setRestitution(0.1),
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
      .setRestitution(0),
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
