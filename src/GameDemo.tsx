import { useRef, useState } from "react";
import { Game } from "./Game";

export const GameDemo = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [game, setGame] = useState<Game | null>(null);

  const start = () => {
    if (game) {
      game.destroy();
    }
    setGame(new Game(canvasRef.current!));
  };

  const serialize = () => {
    if (!game) {
      alert("Start a game first");
      return;
    }
    navigator.clipboard.writeText(JSON.stringify(game.serialize(), null, 2));
  };

  const replay = () => {
    if (!game) {
      alert("Start a game first");
      return;
    }
    const serializedGame = game.serialize();
    game.destroy();
    setGame(new Game(canvasRef.current!, serializedGame));
  };

  return (
    <>
      <canvas tabIndex={1} ref={canvasRef} />
      <div className="overlay bottom right flex-column">
        <span>Try to be the last black hole standing</span>
        <span>Click to move by explusing matter</span>
        <span>Absorb smaller black holes</span>
        <span>Avoid bigger black hole</span>
        <div className="flex-row">
          <button onClick={start}>start</button>
          <button onClick={replay}>replay</button>
          <button onClick={serialize}>serialize</button>
        </div>
      </div>
    </>
  );
};
