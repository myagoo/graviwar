import { useEffect, useRef, useState } from "react";
import { Game } from "./Game";
import { RollbackWrapper } from "./netplayjs";

export const GameDemo = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);


  useEffect(() => {
    new RollbackWrapper(Game, canvasRef.current!).start()
  }, [])

  return (
    <>
      <canvas tabIndex={1} ref={canvasRef} />
      <div className="overlay bottom right flex-column">
        <span>Try to be the last black hole standing</span>
        <span>Click to move by explusing matter</span>
        <span>Absorb smaller black holes</span>
        <span>Avoid bigger black hole</span>
      </div>
    </>
  );
};
