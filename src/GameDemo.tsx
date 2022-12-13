import RAPIER from "@dimforge/rapier2d-compat";
import { useEffect, useRef } from "react";
import "./App.css";
import { Game } from "./Game";
import { Settings } from "./Settings";

export const GameDemo = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const settingsRef = useRef(new Settings());

  const gameRef = useRef<Game>();

  useEffect(() => {
    let game: Game;

    RAPIER.init().then(() => {
      game = new Game(canvasRef.current!, settingsRef.current);
    });

    return () => {
      game.destroy();
    };
  }, []);

  return (
    <>
      <canvas tabIndex={1} ref={canvasRef} />
      <div className="overlay bottom right flex-column">
        <span>Use mouse wheel to zoom in or out</span>
        <span>
          Move the spaceship <kbd>&larr;</kbd> <kbd>&rarr;</kbd>{" "}
          <kbd>&uarr;</kbd> <kbd>&darr;</kbd>
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
