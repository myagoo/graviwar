import query from "query-string";
import { useLayoutEffect, useRef, useState } from "react";
import { Game } from "./Game";
import { LocalWrapper } from "./netplayjs/localwrapper";
import { RollbackWrapper } from "./netplayjs/rollbackwrapper";
import { WrapperConstructor } from "./netplayjs/types";

const initWrapperState = () => {
  const searchParams = query.parse(window.location.search);

  if (searchParams.wrapper === "local") {
    return LocalWrapper;
  }

  if (searchParams.wrapper === "rollback") {
    return RollbackWrapper;
  }

  return null;
};

export const App = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [WrapperClass, setWrapperClass] = useState<WrapperConstructor | null>(
    initWrapperState
  );

  const handleStartLocal = () => {
    setWrapperClass(() => LocalWrapper);
  };
  const handleStartRollback = () => {
    setWrapperClass(() => RollbackWrapper);
  };
  const handleStop = () => {
    window.history.replaceState({}, document.title, "/")
    setWrapperClass(null);
  };

  useLayoutEffect(() => {
    if (WrapperClass) {
      const wrapper = new WrapperClass(Game, canvasRef.current!);
      wrapper.start();
      return () => wrapper.destroy();
    }
  }, [WrapperClass]);

  if (WrapperClass) {
    return (
      <>
        <canvas tabIndex={1} ref={canvasRef} />
        <div className="overlay bottom right flex-column">
          <span>Try to be the last black hole standing</span>
          <span>Click to move by explusing matter</span>
          <span>Absorb smaller black holes</span>
          <span>Avoid bigger black holes</span>
          <button onClick={handleStop}>Back to menu</button>
        </div>
      </>
    );
  }

  return (
    <div className="flex-column">
      <button onClick={handleStartLocal}>Start a singleplayer game</button>
      <button onClick={handleStartRollback}>
        Start a versus game
      </button>
    </div>
  );
};
