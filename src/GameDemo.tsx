import RAPIER from "@dimforge/rapier2d-compat";
import { useEffect, useRef } from "react";
import { Game } from "./Game";
import { Settings } from "./Settings";

export const GameDemo = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const settingsRef = useRef(new Settings());

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
        <span>Try to be the last black hole standing</span>
        <span>Click to move your black hole around by expulsing matter</span>
        <span>Absorb smaller black holes</span>
        <span>Avoid bigger black hole</span>
      </div>
    </>
  );
};
