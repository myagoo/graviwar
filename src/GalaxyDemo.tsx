import RAPIER from "@dimforge/rapier2d-compat";
import { useEffect, useRef } from "react";
import "./App.css";
import { SettingsController } from "./SettingsController";
import {
  BodyMetadata,
  createPlanet,
  createProjectile,
  drawBody,
  drawCircle,
  drawLine,
  getDirection,
  getDistance,
  getGravitationalForce,
  scaleAt,
  toWorld,
  Vector,
} from "./utils";

export const GalaxyDemo = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const settingsRef = useRef({
    GRAVITATIONAL_CONSTANT: 1,
    PLANET_DENSITY: 100,
    STAR_DENSITY: 100,
    PROJECTILE_DENSITY: 100,
    DND_VELOCITY_FACTOR: 10,
  });

  const worldRef = useRef<RAPIER.World>();

  const bodyMapRef = useRef<Record<number, BodyMetadata>>({});

  const canvasInfosRef = useRef({scale: 1, x: 0, y: 0 });

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
      const world = new RAPIER.World(new RAPIER.Vector2(0, 0));

      for (let i = 0; i < 500; i++) {
        const [, projectileBody] = createProjectile(
          world,
          new RAPIER.Vector2(
            Math.random() * canvas.offsetWidth,
            Math.random() * canvas.offsetHeight
          ),
          new RAPIER.Vector2(Math.random() * 100 - 50, Math.random() * 100 - 50),
          settingsRef.current.PROJECTILE_DENSITY
        );
        bodyMapRef.current[projectileBody.handle] = {
          color: "#FFFFFF",
          type: "projectile",
        };
      }

      const KEYS = {
        LEFT: false,
        RIGHT: false,
        DOWN: false,
        UP: false,
        SPACE: false,
      };

      canvas.addEventListener("mousedown", (mdEvent) => {
        tmp = {
          x: mdEvent.offsetX,
          y: mdEvent.offsetY,
          radius: mdEvent.shiftKey
            ? Math.random() * 500 + 500
            : Math.random() * 50 + 50,
          color: "#" + Math.floor(Math.random() * 16777215).toString(16),
        };

        const mmHandler = (mmEvent: MouseEvent) => {
          mmPosition = { x: mmEvent.offsetX, y: mmEvent.offsetY };
        };

        const muHandler = (muEvent: MouseEvent) => {
          if (!tmp) {
            throw new Error(`TEST`);
          }
          const [, planetBody] = createPlanet(
            world,
            toWorld(
              { x: tmp.x, y: tmp.y },
              canvasInfosRef.current
            ),
            mmPosition
              ? {
                  x:
                    (tmp.x - muEvent.offsetX) *
                    settingsRef.current.DND_VELOCITY_FACTOR,
                  y:
                    (tmp.y - muEvent.offsetY) *
                    settingsRef.current.DND_VELOCITY_FACTOR,
                }
              : { x: 0, y: 0 },
            tmp.radius,
            mdEvent.shiftKey
              ? settingsRef.current.STAR_DENSITY
              : settingsRef.current.PLANET_DENSITY,
            mdEvent.ctrlKey
          );

          bodyMapRef.current[planetBody.handle] = {
            color: tmp.color,
            positions: [],
            type: mdEvent.shiftKey ? "star" : "planet",
          };

          tmp = null;
          mmPosition = null;

          canvas.removeEventListener("mousemove", mmHandler);

          canvas.removeEventListener("mouseup", muHandler);
        };

        canvas.addEventListener("mousemove", mmHandler);

        canvas.addEventListener("mouseup", muHandler);
      });

      canvas.addEventListener("wheel", (event) => {
        const zoomBy = 1.1; // zoom in amount
        scaleAt(
          event.offsetX,
          event.offsetY,
          event.deltaY > 0 ? 1 / zoomBy : zoomBy,
          canvasInfosRef.current
        );
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
            break;

          default:
            break;
        }
      });

      const loop = () => {
        ctx.setTransform(1, 0, 0, 1, 0, 0);

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        ctx.setTransform(
          canvasInfosRef.current.scale,
          0,
          0,
          canvasInfosRef.current.scale,
          canvasInfosRef.current.x,
          canvasInfosRef.current.y
        );

        world.forEachRigidBody((body) => {
          const collidersLength = body.numColliders();

          const metadata = bodyMapRef.current[body.handle];

          for (let i = 0; i < collidersLength; i++) {
            const collider = body.collider(i);
            drawBody(ctx, collider, body, metadata);
          }

          if (body.bodyType() === RAPIER.RigidBodyType.Fixed) {
            return;
          }

          const bodyMass = body.mass();

          const bodyPosition = body.translation();

          // metadata.positions.unshift({
          //   ...bodyPosition,
          // });

          // if (metadata.positions.length > 10) {
          //   metadata.positions.pop();
          // }

          body.resetForces(false);

          world.forEachRigidBody((otherBody) => {
            if (body.handle === otherBody.handle) {
              return;
            }

            const otherBodyMass = otherBody.mass();

            const otherBodyPosition = otherBody.translation();

            const distance = getDistance(otherBodyPosition, bodyPosition);

            const forceDirection = getDirection(
              otherBodyPosition,
              bodyPosition
            );
            const forceMagnitude = getGravitationalForce(
              settingsRef.current.GRAVITATIONAL_CONSTANT,
              bodyMass,
              otherBodyMass,
              distance
            );
            try {
              body.addForce(
                new RAPIER.Vector2(
                  Math.sin(forceDirection) * forceMagnitude,
                  Math.cos(forceDirection) * forceMagnitude
                ),
                true
              );
            } catch (error) {
              console.error(error);
            }
          });
        });

        if (tmp) {
          const { x, y, radius, color } = tmp;
          drawCircle(
            ctx,
            toWorld({ x, y }, canvasInfosRef.current),
            radius,
            color
          );

          if (mmPosition) {
            drawLine(
              ctx,
              toWorld({ x, y }, canvasInfosRef.current),
              toWorld(mmPosition, canvasInfosRef.current),
              color
            );
          }
        }

        world.step();

        requestAnimationFrame(loop);
      };

      loop();

      worldRef.current = world;
    });

    return () => worldRef.current?.free()
  }, []);

  return (
    <>
      <canvas tabIndex={1} ref={canvasRef} />
      <SettingsController
        settingsRef={settingsRef}
        onChange={(key, value) => {
          settingsRef.current[key] = value;

          if (key === "PROJECTILE_DENSITY") {
            Object.entries(bodyMapRef.current).forEach(([handle, { type }]) => {
              if (type === "projectile") {
                worldRef.current
                  ?.getRigidBody(parseInt(handle, 10))
                  .collider(0)
                  .setDensity(value);
              }
            });
          } else if (key === "PLANET_DENSITY") {
            Object.entries(bodyMapRef.current).forEach(([handle, { type }]) => {
              if (type === "projectile") {
                worldRef.current
                  ?.getRigidBody(parseInt(handle, 10))
                  .collider(0)
                  .setDensity(value);
              }
            });
          } else if (key === "STAR_DENSITY") {
            Object.entries(bodyMapRef.current).forEach(([handle, { type }]) => {
              if (type === "star") {
                worldRef.current
                  ?.getRigidBody(parseInt(handle, 10))
                  .collider(0)
                  .setDensity(value);
              }
            });
          }
        }}
      ></SettingsController>
      <div className="overlay bottom right flex-column">
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
};
