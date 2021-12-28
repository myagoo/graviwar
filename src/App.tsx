import RAPIER from "@dimforge/rapier2d-compat";
import React, { useEffect, useRef } from "react";
import Victor from "victor";
import "./App.css";

type Vector = {
  x: number;
  y: number;
};

const COLLIDER_MAP: Record<
  number,
  {
    color: string;
    positions: Vector[];
    isProjectile?: boolean;
    isHero?: boolean;
    isPlanet?: boolean;
  }
> = {};

const getGravitationalForce = (
  mass1: number,
  mass2: number,
  distance: number
) => {
  // const force = (0.5 * mass1 * mass2) / (distance * distance);
  const force =
    (10 * mass1 * mass2) / (distance * Math.sqrt(distance) + 0.15);
  return force;
};

const getDistance = (position1: Vector, position2: Vector) => {
  var a = Math.abs(position1.x - position2.x);
  var b = Math.abs(position1.y - position2.y);
  return Math.sqrt(Math.pow(a, 2) + Math.pow(b, 2));
};

const getDirection = (position1: Vector, position2: Vector) => {
  return Math.atan2(position1.x - position2.x, position1.y - position2.y);
};

const drawCircle = (
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

const drawBody = (
  ctx: CanvasRenderingContext2D,
  collider: RAPIER.Collider,
  body: RAPIER.RigidBody
) => {
  const position = body.translation();
  const metadata = COLLIDER_MAP[collider.handle];
  switch (collider.shapeType()) {
    case RAPIER.ShapeType.Ball: {
      drawCircle(ctx, position, collider.radius(), metadata.color);
      if (body.bodyType() === RAPIER.RigidBodyType.Static) {
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

        drawCircle(ctx, position, collider.radius() * scale, color);
      }

      break;
    }
    case RAPIER.ShapeType.Cuboid: {
      // console.log(collider.halfHeight());
      const halfExtents = collider.halfExtents();
      drawCuboid(
        ctx,
        position.x - halfExtents.x,
        position.y - halfExtents.y,
        halfExtents.x * 2,
        halfExtents.y * 2,
        metadata.color,
        collider.rotation()
      );
      break;
    }
    default:
      break;
  }
};

const drawLine = (
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

const createPlanet = (
  world: RAPIER.World,
  pos: Vector,
  vel: Vector,
  radius: number,
  density: number,
  isStatic: boolean
) => {
  const planetBody = world.createRigidBody(
    new RAPIER.RigidBodyDesc(
      isStatic ? RAPIER.RigidBodyType.Static : RAPIER.RigidBodyType.Dynamic
    )
      .setTranslation(pos.x, pos.y)
      .setLinvel(vel.x, vel.y)
  );

  const planetCollider = world.createCollider(
    RAPIER.ColliderDesc.ball(radius)
      .setDensity(density)
      .setFriction(1)
      .setRestitution(0)
      .setActiveEvents(RAPIER.ActiveEvents.CONTACT_EVENTS),
    planetBody.handle
  );

  return [planetCollider, planetBody] as const;
};

const createHero = (
  world: RAPIER.World,
  pos: Vector,
  width: number,
  height: number
) => {
  const heroBody = world.createRigidBody(
    RAPIER.RigidBodyDesc.newDynamic()
      .setTranslation(pos.x, pos.y)
      .setLinvel(0, 0)
      .setAngvel(1)
  );
  const heroCollider = world.createCollider(
    RAPIER.ColliderDesc.cuboid(width / 2, height / 2)
      .setDensity(10)
      .setActiveEvents(RAPIER.ActiveEvents.CONTACT_EVENTS),
    heroBody.handle
  );
  return [heroCollider, heroBody] as const;
};

function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const ctx = canvas.getContext("2d");

    if (!ctx) {
      throw new Error(`Context 2d could not be retrieved`);
    }

    let tmp: {
      x: number;
      y: number;
      color: string;
      radius: number;
    } | null;

    let mmPosition: Vector | null;

    RAPIER.init().then(() => {
      let world = new RAPIER.World(new RAPIER.Vector2(0, 0));
      let eventQueue = new RAPIER.EventQueue(true);

      const heroHalfWidth = 10;
      const heroHalfHeight = 10;

      const [heroCollider, heroBody] = createHero(
        world,
        {
          x: canvas.offsetWidth / 2 - heroHalfWidth,
          y: canvas.offsetHeight / 2 - heroHalfHeight,
        },
        20,
        20
      );

      COLLIDER_MAP[heroCollider.handle] = { color: "#FFFFFF", positions: [] };

      const KEYS = {
        LEFT: false,
        RIGHT: false,
        DOWN: false,
        UP: false,
        SPACE: false,
      };
      let force = 0;

      canvas.addEventListener("mousedown", (mdEvent) => {
        tmp = {
          x: mdEvent.offsetX,
          y: mdEvent.offsetY,
          radius: mdEvent.shiftKey
            ? Math.random() * 40 + 40
            : Math.random() * 10 + 10,
          color: "#" + Math.floor(Math.random() * 16777215).toString(16),
        };

        const mmHandler = (mmEvent: MouseEvent) => {
          mmPosition = { x: mmEvent.offsetX, y: mmEvent.offsetY };
        };

        const muHandler = (muEvent: MouseEvent) => {
          if (!tmp) {
            throw new Error(`TEST`);
          }

          const [planetCollider] = createPlanet(
            world,
            { x: tmp.x, y: tmp.y },
            mmPosition
              ? {
                  x: tmp.x - muEvent.offsetX,
                  y: tmp.y - muEvent.offsetY,
                }
              : { x: 0, y: 0 },
            tmp.radius,
            100,
            mdEvent.ctrlKey
          );

          COLLIDER_MAP[planetCollider.handle] = {
            color: tmp.color,
            positions: [],
          };

          tmp = null;
          mmPosition = null;

          canvas.removeEventListener("mousemove", mmHandler);

          canvas.removeEventListener("mouseup", muHandler);
        };

        canvas.addEventListener("mousemove", mmHandler);

        canvas.addEventListener("mouseup", muHandler);
      });

      window.addEventListener("keydown", (event) => {
        switch (event.code) {
          case "ArrowLeft":
            KEYS.LEFT = true;
            break;
          case "ArrowRight":
            KEYS.RIGHT = true;
            break;
          case "ArrowUp":
            KEYS.UP = true;
            break;
          case "ArrowDown":
            KEYS.DOWN = true;
            break;
          case "Space":
            KEYS.SPACE = true;
            break;
          default:
            break;
        }
      });
      window.addEventListener("keyup", (event) => {
        switch (event.code) {
          case "ArrowLeft":
            KEYS.LEFT = false;
            break;
          case "ArrowRight":
            KEYS.RIGHT = false;
            break;
          case "ArrowUp":
            KEYS.UP = false;
            break;
          case "ArrowDown":
            KEYS.DOWN = false;
            break;
          case "Space":
            KEYS.SPACE = false;
            const heroPosition = heroBody.translation();
            const heroHalfExtents = heroCollider.halfExtents();
            const heroRotation = heroCollider.rotation() + Math.PI / 2;

            let rigidBodyDesc = RAPIER.RigidBodyDesc.newDynamic()
              .setTranslation(
                heroPosition.x +
                  Math.sin(-heroRotation) * heroHalfExtents.x * 2,
                heroPosition.y + Math.cos(-heroRotation) * heroHalfExtents.y * 2
              )
              .setLinvel(
                Math.sin(-heroRotation) * force,
                Math.cos(-heroRotation) * force
              );

            // Maybe use projectile mass for recoil
            heroBody.applyForce(
              new RAPIER.Vector2(
                heroPosition.x - Math.sin(-heroRotation) * force * 100000,
                heroPosition.y - Math.cos(-heroRotation) * force * 100000
              ),
              true
            );
            let projectileBody = world.createRigidBody(rigidBodyDesc);
            const projectileCollider = world.createCollider(
              RAPIER.ColliderDesc.ball(5)
                .setDensity(1)
                .setFriction(1)
                .setRestitution(0.5)
                .setActiveEvents(RAPIER.ActiveEvents.CONTACT_EVENTS),
              projectileBody.handle
            );
            COLLIDER_MAP[projectileCollider.handle] = {
              isProjectile: true,
              color: "#FF0000",
              positions: [],
            };

            force = 0;
            break;

          default:
            break;
        }
      });

      const ACCELERATION = 10000;
      const loop = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // TODO normalize vector when 2 arrow keys are pressed
        if (KEYS.UP) {
          heroBody.applyImpulse(new RAPIER.Vector2(0, -ACCELERATION), true);
        }
        if (KEYS.DOWN) {
          heroBody.applyImpulse(new RAPIER.Vector2(0, ACCELERATION), true);
        }
        if (KEYS.LEFT) {
          heroBody.applyImpulse(new RAPIER.Vector2(-ACCELERATION, 0), true);
        }
        if (KEYS.RIGHT) {
          heroBody.applyImpulse(new RAPIER.Vector2(ACCELERATION, 0), true);
        }
        if (KEYS.SPACE) {
          force += 3;
        }

        world.forEachCollider((collider) => {
          const body = world.getRigidBody(collider.parent());

          drawBody(ctx, collider, body);

          if (body.bodyType() === RAPIER.RigidBodyType.Static) {
            return;
          }

          const metadata = COLLIDER_MAP[collider.handle];

          const bodyPosition = body.translation();

          metadata.positions.unshift({
            ...bodyPosition,
          });

          if (metadata.positions.length > 10) {
            metadata.positions.pop();
          }

          world.forEachCollider((otherCollider) => {
            if (collider.handle === otherCollider.handle) {
              return;
            }
            const otherBody = world.getRigidBody(otherCollider.parent());

            const otherBodyPosition = otherBody.translation();

            const distance = getDistance(otherBodyPosition, bodyPosition);

            const forceDirection = getDirection(
              otherBodyPosition,
              bodyPosition
            );
            const forceMagnitude = getGravitationalForce(
              otherBody.mass(),
              body.mass(),
              distance
            );

            body.applyForce(
              new RAPIER.Vector2(
                (Math.sin(forceDirection) * forceMagnitude) /
                  Math.sqrt(body.mass()),
                (Math.cos(forceDirection) * forceMagnitude) /
                  Math.sqrt(body.mass())
              ),
              true
            );
          });
        });

        if (force) {
          const heroPosition = heroBody.translation();
          const heroRotation = heroBody.rotation() + Math.PI / 2;
          drawLine(
            ctx,
            { x: heroPosition.x, y: heroPosition.y },
            {
              x: heroPosition.x + Math.sin(-heroRotation) * force,
              y: heroPosition.y + Math.cos(-heroRotation) * force,
            },
            "#FF0000"
          );
        }

        if (tmp) {
          const { x, y, radius, color } = tmp;
          drawCircle(ctx, { x, y }, radius, color);

          if (mmPosition) {
            drawLine(ctx, { x, y }, mmPosition, color);
          }
        }
        world.step(eventQueue);

        eventQueue.drainContactEvents((handle1, handle2, started) => {
          if (!started) {
            return;
          }
          const metaData1 = COLLIDER_MAP[handle1];
          const metaData2 = COLLIDER_MAP[handle2];

          const collider1 = world.getCollider(handle1);
          const body1 = world.getRigidBody(collider1.parent());

          const collider2 = world.getCollider(handle2);
          const body2 = world.getRigidBody(collider2.parent());

          const collisionMagnitude = Victor.fromObject(body1.linvel())
            .subtract(Victor.fromObject(body2.linvel()))
            .magnitude();

          console.log(collisionMagnitude);

          if (collisionMagnitude > 200) {
            if (handle1 === heroCollider.handle && metaData2.isProjectile) {
              COLLIDER_MAP[heroCollider.handle].color = "#FF0000";
              world.removeCollider(collider2, true);
              world.removeRigidBody(body2);
            }

            if (handle2 === heroCollider.handle && metaData1.isProjectile) {
              COLLIDER_MAP[heroCollider.handle].color = "#FF0000";
              world.removeCollider(collider1, true);
              world.removeRigidBody(body1);
            }
          }
        });

        requestAnimationFrame(loop);
      };

      loop();
    });
  }, []);

  return (
    <>
      <canvas tabIndex={1} ref={canvasRef} />
      <div className="overlay">
        <span>Version 0.1</span>
        <span>
          Move the box <kbd>&larr;</kbd> <kbd>&rarr;</kbd> <kbd>&uarr;</kbd>{" "}
          <kbd>&darr;</kbd>
        </span>
        <span>
          Shoot projectile by pressing <kbd>Space</kbd> (hold to shoot farther)
        </span>
        <span>Click to create a planet</span>
        <span>Move the mouse before releasing the click to throw a planet</span>
        <span>
          Hold <kbd>Ctrl</kbd> to create a static planet
        </span>
        <span>
          Hold <kbd>Shift</kbd> to create a big planet
        </span>
      </div>
    </>
  );
}

export default App;
