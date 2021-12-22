import React, { useEffect, useRef } from "react";
import "./App.css";

type Vector = {
  x: number;
  y: number;
};

type Body = {
  position: Vector;
  velocity: Vector;
  mass: number;
  radius: number;
  color: string;
  positions: Vector[];
};

const GRAVITATIONAL_CONSTANT = 0.1;

const SOFTENING_CONSTANT = 0.15;

const getGravitationalForce = (
  mass1: number,
  mass2: number,
  distance: number
) => {
  const force =
    (GRAVITATIONAL_CONSTANT * mass1 * mass2) /
    (distance * Math.sqrt(distance + SOFTENING_CONSTANT));
  //const force = (GRAVITATIONAL_CONSTANT * mass) / Math.pow(distance, 2);
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

const subtractVectors = (vec1: Vector, vec2: Vector): Vector => {
  return {
    x: vec2.x - vec1.x,
    y: vec2.y - vec1.y,
  };
};

const drawCircle = (
  ctx: CanvasRenderingContext2D,
  position: Vector,
  radius: number,
  color: string
) => {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(position.x, position.y, radius, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fill();
};

const drawBody = (ctx: CanvasRenderingContext2D, body: Body) => {
  drawCircle(ctx, body.position, body.radius, body.color);

  const length = body.positions.length;

  for (let i = 0; i < length; i++) {
    const position = body.positions[i];
    const scale = (length - i) / length;
    const color =
      body.color +
      Math.round(scale * 100)
        .toString(16)
        .padStart(2, "0");
    drawCircle(ctx, position, body.radius * scale, color);
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
    const staticBodies: Body[] = [];
    const dynamicBodies: Body[] = [];
    const canvas = canvasRef.current!;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    let mdBody: Body | null;
    let mmPosition: Vector | null;

    canvas.addEventListener("mousedown", (mdEvent) => {
      if (mdEvent.ctrlKey) {
        const random = Math.random() * 500 + 500;
        mdBody = {
          position: { x: mdEvent.offsetX, y: mdEvent.offsetY },
          velocity: { x: 0, y: 0 },
          mass: random,
          radius: random / 10,
          color: "#" + Math.floor(Math.random() * 16777215).toString(16),
          positions: [],
        };
      } else {
        const random = Math.random() * 5 + 5;

        mdBody = {
          position: { x: mdEvent.offsetX, y: mdEvent.offsetY },
          velocity: { x: 0, y: 0 },
          mass: random,
          radius: random,
          color: "#" + Math.floor(Math.random() * 16777215).toString(16),
          positions: [],
        };
      }

      const mmHandler = (mmEvent: MouseEvent) => {
        mmPosition = { x: mmEvent.offsetX, y: mmEvent.offsetY };
      };

      const muHandler = (muEvent: MouseEvent) => {
        if (!mdBody) {
          throw new Error(`PRotu`);
        }
        const mdPosition = mdBody.position;

        const body = mmPosition
          ? {
              ...mdBody!,
              velocity: {
                x: (mdPosition.x - muEvent.offsetX) / 50,
                y: (mdPosition.y - muEvent.offsetY) / 50,
              },
            }
          : mdBody;

        muEvent.ctrlKey ? staticBodies.push(body) : dynamicBodies.push(body);
        
        mdBody = null;
        mmPosition = null;

        canvas.removeEventListener("mousemove", mmHandler);

        canvas.removeEventListener("mouseup", muHandler);
      };

      canvas.addEventListener("mousemove", mmHandler);

      canvas.addEventListener("mouseup", muHandler);
    });

    // canvas.addEventListener("click", (event) => {
    //   if (event.ctrlKey) {
    //     bodies.push({
    //       position: { x: event.offsetX, y: event.offsetY },
    //       velocity: { x: 0, y: 0 },
    //       mass: 1000,
    //       radius: 50,
    //       color: "#" + Math.floor(Math.random() * 16777215).toString(16),
    //       positions: [],
    //     });
    //   } else {
    //     bodies.push({
    //       position: { x: event.offsetX, y: event.offsetY },
    //       velocity: { x: Math.random() * 4 - 2, y: Math.random() * 4 - 2 },
    //       //velocity: { x: 0, y: 0 },
    //       mass: 10,
    //       radius: 10,
    //       color: "#" + Math.floor(Math.random() * 16777215).toString(16),
    //       positions: [],
    //     });
    //   }
    // });

    const ctx = canvas.getContext("2d");

    if (!ctx) {
      throw new Error(`Context 2d could not be retrieved`);
    }

    const loop = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (mdBody) {
        drawCircle(ctx, mdBody.position, mdBody.radius, mdBody.color);
        if (mmPosition) {
          drawLine(ctx, mdBody.position, mmPosition, mdBody.color);
        }
      }

      for (const body of dynamicBodies) {
        for (const otherBody of dynamicBodies) {
          if (body === otherBody) {
            continue;
          }
          const distance = getDistance(otherBody.position, body.position);
          const forceDirection = getDirection(
            otherBody.position,
            body.position
          );
          const forceMagnitude = getGravitationalForce(
            otherBody.mass,
            body.mass,
            distance
          );

          body.velocity.x +=
            (Math.sin(forceDirection) * forceMagnitude) / body.mass;
          body.velocity.y +=
            (Math.cos(forceDirection) * forceMagnitude) / body.mass;
        }
        for (const sun of staticBodies) {
          const distance = getDistance(sun.position, body.position);
          const forceDirection = getDirection(sun.position, body.position);
          const forceMagnitude = getGravitationalForce(
            sun.mass,
            body.mass,
            distance
          );

          body.velocity.x +=
            (Math.sin(forceDirection) * forceMagnitude) / body.mass;
          body.velocity.y +=
            (Math.cos(forceDirection) * forceMagnitude) / body.mass;
        }
      }

      for (const sun of staticBodies) {
        drawBody(ctx, sun);
      }

      for (const body of dynamicBodies) {
        body.positions.unshift({
          ...body.position,
        });
        if (body.positions.length > 20) {
          body.positions.pop();
        }
        body.position.x += body.velocity.x;
        body.position.y += body.velocity.y;
        drawBody(ctx, body);
      }

      requestAnimationFrame(loop);
    };

    loop();
  }, []);

  return <canvas ref={canvasRef} />;
}

export default App;
