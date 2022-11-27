import RAPIER from "@dimforge/rapier2d-compat";
import React, { useEffect, useRef } from "react";
import Victor from "victor";
import "./App.css";
import { Camera } from "./Camera";
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
  Vector,
} from "./utils";

export const HeroDemo = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const settingsRef = useRef({
    GRAVITATIONAL_CONSTANT: 0.5,
    HERO_DENSITY: 100,
    PLANET_DENSITY: 100,
    STAR_DENSITY: 100,
    PROJECTILE_DENSITY: 100,
    KEYPAD_ACCELERATION: 1000000,
    DND_VELOCITY_FACTOR: 10,
    ARTIFICIAL_RECOIL_CONSTANT: 10,
    BLAST_RADIUS: 500,
    HERO_BLAST_FORCE: 5000000000000,
    PROJECTILE_BLAST_FORCE: 50000000000,
  });

  const worldRef = useRef<RAPIER.World>();

  const bodyMapRef = useRef<Record<number, BodyMetadata>>({});

  useEffect(() => {
    const canvas = canvasRef.current!;

    canvas.focus();

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const ctx = canvas.getContext("2d");

    if (!ctx) {
      throw new Error(`Context 2d could not be retrieved`);
    }

    const camera = new Camera(ctx, { fieldOfView: 1 });

    let tmp: {
      x: number;
      y: number;
      color: string;
      radius: number;
    } | null;

    let mmPosition: Vector | null;

    const explosions: { origin: Vector; radius: number }[] = [];

    const resizeListener = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      camera.resize();
    };

    window.addEventListener("resize", resizeListener);

    let intervalId: NodeJS.Timer;

    RAPIER.init().then(() => {
      const world = new RAPIER.World(new RAPIER.Vector2(0, 0));

      for (let i = 0; i < 3; i++) {
        const randomPosition = {
          x: Math.random() * canvas.offsetWidth * 4 - canvas.offsetWidth * 2,
          y:
            Math.random() * canvas.offsetHeight * 4 - canvas.offsetHeight * 2,
        };
        const [, body] = createPlanet(
          world,
          randomPosition,
          new RAPIER.Vector2(0, 0),
          Math.random() * 500 + 500,
          settingsRef.current.STAR_DENSITY,
          true
        );
        bodyMapRef.current[body.handle] = {
          type: "star",
          color: "yellow",
        };
      }

      intervalId = setInterval(() => {
        const randomPosition = {
          x: Math.random() * canvas.offsetWidth * 4 - canvas.offsetWidth * 2,
          y:
            Math.random() * canvas.offsetHeight * 4 - canvas.offsetHeight * 2,
        };
        const [, body] = createPlanet(
          world,
          randomPosition,
          new RAPIER.Vector2(
            Math.random() * 100 - 50,
            Math.random() * 100 - 50
          ),
          Math.random() * 50 + 50,
          settingsRef.current.PLANET_DENSITY,
          false
        );
        bodyMapRef.current[body.handle] = {
          type: "planet",
          color: "#" + Math.floor(Math.random() * 16777215).toString(16),
          positions: [],
        };
      }, 1_000)

      const eventQueue = new RAPIER.EventQueue(true);

      const heroRadius = 20;

      const [heroCollider, heroBody] = createHero(
        world,
        {
          x: canvas.offsetWidth / 2 - heroRadius,
          y: canvas.offsetHeight / 2 - heroRadius,
        },
        heroRadius,
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

      const explosionsInfos: {
        handles: number[];
        origin: Vector;
        force: number;
      }[] = [];

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
            camera.screenToWorld({ x: tmp.x, y: tmp.y }),
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
            mdEvent.ctrlKey || mdEvent.metaKey
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
        event.preventDefault();
        const zoomBy = 1.1; // zoom in amount
        const zoomFactor = event.deltaY < 0 ? 1 / zoomBy : zoomBy;
        camera.zoomTo(camera.distance * zoomFactor);
      });

      canvas.addEventListener("keydown", (event) => {
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

          case "Enter":
            const explosionShape = new RAPIER.Ball(
              settingsRef.current.BLAST_RADIUS
            );
            const origin = heroBody.translation();
            const handles: number[] = [];
            world.intersectionsWithShape(
              origin,
              0,
              explosionShape,
              (collider) => {
                handles.push(collider.parent()!.handle);
                return true;
              },
              RAPIER.QueryFilterFlags.EXCLUDE_FIXED,
              undefined,
              undefined,
              heroBody
            );
            explosionsInfos.push({
              handles,
              origin,
              force: settingsRef.current.HERO_BLAST_FORCE,
            });
            break;
          default:
            break;
        }
      });

      canvas.addEventListener("keyup", (event) => {
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
            const heroRadius = (heroCollider.shape as RAPIER.Ball).radius;
            const heroRotation = heroCollider.rotation() + Math.PI / 2;

            const [, projectileBody] = createProjectile(
              world,
              {
                x:
                  heroPosition.x +
                  heroRadius +
                  Math.sin(-heroRotation) * heroRadius * 2,
                y: heroPosition.y + Math.cos(-heroRotation) * heroRadius * 2,
              },
              {
                x:
                  Math.sin(-heroRotation) *
                  (force * settingsRef.current.DND_VELOCITY_FACTOR + 100),
                y:
                  Math.cos(-heroRotation) *
                  (force * settingsRef.current.DND_VELOCITY_FACTOR + 100),
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
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        camera.begin();

        camera.lookAt([heroBody.translation().x, heroBody.translation().y]);

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

        for (const explosionInfos of explosionsInfos) {
          explosions.push({
            origin: explosionInfos.origin,
            radius: 50,
          });

          for (const handle of explosionInfos.handles) {
            const body = world.getRigidBody(handle);
            try {
              const bodyPosition = body.translation();

              const direction = getDirection(
                bodyPosition,
                explosionInfos.origin
              );

              const distance = getDistance(
                explosionInfos.origin,
                body.translation()
              );

              const forceMagnitude = Math.min(
                explosionInfos.force / (distance * Math.sqrt(distance) + 0.15),
                500000000000
              );

              body.applyImpulse(
                new RAPIER.Vector2(
                  Math.sin(direction) * forceMagnitude,
                  Math.cos(direction) * forceMagnitude
                ),
                true
              );
            } catch (error) {
              console.error(error);
            }
          }
          explosionsInfos.shift();
        }

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
          heroBody.applyImpulse(new RAPIER.Vector2(vector.x, vector.y), true);
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
          drawCircle(ctx, camera.screenToWorld({ x, y }), radius, color);

          if (mmPosition) {
            drawLine(
              ctx,
              camera.screenToWorld({ x, y }),
              camera.screenToWorld(mmPosition),
              color
            );
          }
        }

        for (const explosion of explosions) {
          explosion.radius = Math.min(
            settingsRef.current.BLAST_RADIUS,
            explosion.radius + 20
          );

          const alpha =
            1 -
            Math.round(
              (explosion.radius / settingsRef.current.BLAST_RADIUS) * 100
            ) /
              100;
          drawCircle(
            ctx,
            explosion.origin,
            explosion.radius,
            `rgba(255, 255, 255, ${alpha})`
          );
          if (alpha === 1) {
            explosions.shift();
          }
        }

        camera.end();

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
            if (metaData2.type === "projectile") {
              const explosionShape = new RAPIER.Ball(
                settingsRef.current.BLAST_RADIUS
              );
              const origin = body2.translation();
              const handles: number[] = [];
              world.intersectionsWithShape(
                origin,
                0,
                explosionShape,
                (collider) => {
                  handles.push(collider.parent()!.handle);
                  return true;
                },
                RAPIER.QueryFilterFlags.EXCLUDE_FIXED,
                undefined,
                undefined,
                body2
              );
              world.removeCollider(collider2, true);
              world.removeRigidBody(body2);
              explosionsInfos.push({
                handles,
                origin,
                force: settingsRef.current.PROJECTILE_BLAST_FORCE,
              });
            }

            if (metaData1.type === "projectile") {
              const explosionShape = new RAPIER.Ball(
                settingsRef.current.BLAST_RADIUS
              );
              const origin = body1.translation();
              const handles: number[] = [];
              world.intersectionsWithShape(
                origin,
                0,
                explosionShape,
                (collider) => {
                  handles.push(collider.parent()!.handle);
                  return true;
                },
                RAPIER.QueryFilterFlags.EXCLUDE_FIXED,
                undefined,
                undefined,
                body1
              );
              world.removeCollider(collider1, true);
              world.removeRigidBody(body1);
              explosionsInfos.push({
                handles,
                origin,
                force: settingsRef.current.PROJECTILE_BLAST_FORCE,
              });
            }
          }
        });

        requestAnimationFrame(loop);
      };

      loop();

      worldRef.current = world;
    });

    return () => {
      clearInterval(intervalId)
      window.removeEventListener("resize", resizeListener);
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
          Hold <kbd>Ctrl</kbd> or <kbd>Cmd</kbd> to create a static planet
        </span>
        <span>
          Hold <kbd>Shift</kbd> to create a big planet
        </span>
      </div>
    </>
  );
};
