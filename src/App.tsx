import query from "query-string";
import { useLayoutEffect, useRef, useState } from "react";
import { Game } from "./Game";
import {
  LockstepWrapper,
  RollbackWrapper,
  WrapperConstructor
} from "./netplayjs";
import { LocalWrapper } from "./netplayjs/localwrapper";

const initWrapperState = () => {
  const searchParams = query.parse(window.location.search);

  if (searchParams.wrapper === "local") {
    return LocalWrapper;
  }

  if (searchParams.wrapper === "lockstep") {
    return LockstepWrapper;
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
  const handleStartLockstep = () => {
    setWrapperClass(() => LockstepWrapper);
  };
  const handleStartRollback = () => {
    setWrapperClass(() => RollbackWrapper);
  };
  const handleStop = () => {
    setWrapperClass(null);
  };

  useLayoutEffect(() => {
    if (WrapperClass) {
      const wrapper = new WrapperClass(Game, canvasRef.current!, 1000 / 60);
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
          <span>Avoid bigger black hole</span>
          <button onClick={handleStop}>Back to menu</button>
        </div>
      </>
    );
  }

  return (
    <div className="flex-column">
      <button onClick={handleStartLocal}>Start a local game</button>
      <button onClick={handleStartLockstep}>
        Start a versus game (using lockstep)
      </button>
      <button onClick={handleStartRollback}>
        Start a versus game (using rollback)
      </button>
    </div>
  );
};
