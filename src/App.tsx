import RAPIER from "@dimforge/rapier2d-compat";
import React, { useEffect, useRef } from "react";
import "./App.css";

type Vector = {
  x: number;
  y: number;
};

const MAP: Record<number, { color: string; positions: Vector[] }> = {};

const getGravitationalForce = (
  mass1: number,
  mass2: number,
  distance: number
) => {
  // const force = (0.5 * mass1 * mass2) / (distance * distance);
  const force = (0.1 * mass1 * mass2) / (distance * Math.sqrt(distance) + 0.15);
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
  position: Matter.Vector,
  radius: number,
  color: string
) => {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(position.x, position.y, radius, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fill();
};

const drawBody = (
  ctx: CanvasRenderingContext2D,
  collider: RAPIER.Collider,
  body: RAPIER.RigidBody
) => {
  if (collider.shapeType() === RAPIER.ShapeType.Ball) {
    drawCircle(
      ctx,
      body.translation(),
      collider.radius(),
      MAP[body.handle].color
    );
    if (body.bodyType() === RAPIER.RigidBodyType.Static) {
      return;
    }
    const positionsLength = MAP[body.handle].positions.length;
    for (let i = 0; i < positionsLength; i++) {
      const position = MAP[body.handle].positions[i];
      const scale = (positionsLength - i) / positionsLength;
      const color =
        MAP[body.handle].color +
        Math.round(scale * 100)
          .toString(16)
          .padStart(2, "0");

      drawCircle(ctx, position, collider.radius() * scale, color);
    }
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

      canvas.addEventListener("mousedown", (mdEvent) => {
        tmp = {
          x: mdEvent.offsetX,
          y: mdEvent.offsetY,
          radius: mdEvent.shiftKey
            ? Math.random() * 25 + 25
            : Math.random() * 5 + 5,
          color: "#" + Math.floor(Math.random() * 16777215).toString(16),
        };

        const mmHandler = (mmEvent: MouseEvent) => {
          mmPosition = { x: mmEvent.offsetX, y: mmEvent.offsetY };
        };

        const muHandler = (muEvent: MouseEvent) => {
          if (!tmp) {
            throw new Error(`TEST`);
          }

          let rigidBodyDesc = new RAPIER.RigidBodyDesc(
            mdEvent.ctrlKey
              ? RAPIER.RigidBodyType.Static
              : RAPIER.RigidBodyType.Dynamic
          ).setTranslation(tmp.x, tmp.y);

          if (mmPosition) {
            rigidBodyDesc.setLinvel(
              tmp.x - muEvent.offsetX,
              tmp.y - muEvent.offsetY
            );
          }

          let rigidBody = world.createRigidBody(rigidBodyDesc);
          world.createCollider(
            RAPIER.ColliderDesc.ball(tmp.radius)
              .setDensity(tmp.radius * (mdEvent.shiftKey ? 10000 : 1))
              .setFriction(1)
              .setRestitution(0),
            rigidBody.handle
          );
          MAP[rigidBody.handle] = {
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

      const loop = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        world.forEachCollider((collider) => {
          const body = world.getRigidBody(collider.parent());

          drawBody(ctx, collider, body);

          if (body.bodyType() === RAPIER.RigidBodyType.Static) {
            return;
          }

          const bodyPosition = body.translation();
          MAP[body.handle].positions.unshift({
            ...bodyPosition,
          });
          if (MAP[body.handle].positions.length > 10) {
            MAP[body.handle].positions.pop();
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

            // body.applyForce(
            //   new RAPIER.Vector2(
            //     (Math.sin(forceDirection) * forceMagnitude) / body.mass(),
            //     (Math.cos(forceDirection) * forceMagnitude) / body.mass()
            //   ),
            //   true
            // );
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

        if (tmp) {
          const { x, y, radius, color } = tmp;
          drawCircle(ctx, { x, y }, radius, color);

          if (mmPosition) {
            drawLine(ctx, { x, y }, mmPosition, color);
          }
        }

        world.step();

        requestAnimationFrame(loop);
      };

      loop();
    });
  }, []);

  return (
    <>
      <canvas ref={canvasRef} />
      <div className="overlay">
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
