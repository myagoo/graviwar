import RAPIER from "@dimforge/rapier2d-compat";
import React, { useEffect, useRef } from "react";
import Victor from "victor";
import "./App.css";
import { SettingsController } from "./SettingsController";
import {
  BodyMetadata,
  createHero,
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

export const HeroDemo = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const settingsRef = useRef({
    GRAVITATIONAL_CONSTANT: 0.1,
    HERO_DENSITY: 100,
    PLANET_DENSITY: 100,
    STAR_DENSITY: 100,
    PROJECTILE_DENSITY: 100,
    KEYPAD_ACCELERATION: 10000000,
    DND_VELOCITY_FACTOR: 10,
    ARTIFICIAL_RECOIL_CONSTANT: 100,
  });

  const worldRef = useRef<RAPIER.World>();

  const bodyMapRef = useRef<Record<number, BodyMetadata>>({});

  const canvasInfosRef = useRef({ scale: 1, x: 0, y: 0 });

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

      const eventQueue = new RAPIER.EventQueue(true);

      const heroWidth = 20;
      const heroHeight = 20;

      const [heroCollider, heroBody] = createHero(
        world,
        {
          x: canvas.offsetWidth / 2 - heroWidth / 2,
          y: canvas.offsetHeight / 2 - heroHeight / 2,
        },
        heroWidth,
        heroHeight,
        settingsRef.current.HERO_DENSITY
      );

      bodyMapRef.current[heroBody.handle] = {
        color: "#FFFFFF",
        positions: [],
        type: "hero",
      };

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
            toWorld({ x: tmp.x, y: tmp.y }, canvasInfosRef.current),
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
            const heroPosition = heroBody.translation();
            const heroHalfExtents = (heroCollider.shape as RAPIER.Cuboid)
              .halfExtents;
            const heroRotation = heroCollider.rotation() + Math.PI / 2;

            const [, projectileBody] = createProjectile(
              world,
              {
                x:
                  heroPosition.x +
                  heroHalfExtents.x +
                  Math.sin(-heroRotation) * heroHalfExtents.x * 2,
                y:
                  heroPosition.y +
                  Math.cos(-heroRotation) * heroHalfExtents.y * 2,
              },
              {
                x:
                  Math.sin(-heroRotation) *
                  force *
                  settingsRef.current.DND_VELOCITY_FACTOR,
                y:
                  Math.cos(-heroRotation) *
                  force *
                  settingsRef.current.DND_VELOCITY_FACTOR,
              },
              settingsRef.current.PROJECTILE_DENSITY
            );

            bodyMapRef.current[projectileBody.handle] = {
              color: "#FF0000",
              positions: [],
              type: "projectile",
            };

            const projectileMass = projectileBody.mass();

            heroBody.applyImpulse(
              new RAPIER.Vector2(
                heroPosition.x -
                  Math.sin(-heroRotation) *
                    force *
                    projectileMass *
                    settingsRef.current.ARTIFICIAL_RECOIL_CONSTANT,
                heroPosition.y -
                  Math.cos(-heroRotation) *
                    force *
                    projectileMass *
                    settingsRef.current.ARTIFICIAL_RECOIL_CONSTANT
              ),
              true
            );

            force = 0;
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

          if (metadata.positions) {
            metadata.positions.unshift({
              ...bodyPosition,
            });

            if (metadata.positions.length > 10) {
              metadata.positions.pop();
            }
          }

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

        const vector = new Victor(0, 0);
        if (KEYS.UP) {
          vector.addScalarY(-1);
        }
        if (KEYS.DOWN) {
          vector.addScalarY(1);
        }
        if (KEYS.LEFT) {
          vector.addScalarX(-1);
        }
        if (KEYS.RIGHT) {
          vector.addScalarX(1);
        }

        if (vector.x || vector.y) {
          vector
            .normalize()
            .multiplyScalar(settingsRef.current.KEYPAD_ACCELERATION);
          console.log(vector.toString());
          heroBody.addForce(new RAPIER.Vector2(vector.x, vector.y), true);
        }

        if (KEYS.SPACE) {
          force += 3;
        }

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

        world.step(eventQueue);

        eventQueue.drainCollisionEvents((handle1, handle2, started) => {
          if (!started) {
            return;
          }

          const collider1 = world.getCollider(handle1);
          const body1 = collider1.parent()!;

          const collider2 = world.getCollider(handle2);
          const body2 = collider2.parent()!;

          const metaData1 = bodyMapRef.current[body1.handle];
          const metaData2 = bodyMapRef.current[body2.handle];

          const collisionMagnitude = Victor.fromObject(body1.linvel())
            .subtract(Victor.fromObject(body2.linvel()))
            .magnitude();

          if (collisionMagnitude > 200) {
            if (
              handle1 === heroCollider.handle &&
              metaData2.type === "projectile"
            ) {
              bodyMapRef.current[heroBody.handle].color = "#FF0000";
              world.removeCollider(collider2, true);
              world.removeRigidBody(body2);
            }

            if (
              handle2 === heroCollider.handle &&
              metaData1.type === "projectile"
            ) {
              bodyMapRef.current[heroBody.handle].color = "#FF0000";
              world.removeCollider(collider1, true);
              world.removeRigidBody(body1);
            }
          }
        });

        requestAnimationFrame(loop);
      };

      loop();

      worldRef.current = world;
    });

    return () => {
      worldRef.current?.free();
    };
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
          } else if (key === "HERO_DENSITY") {
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
        <span>Use mouse wheel to zoom in or out</span>
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
};
