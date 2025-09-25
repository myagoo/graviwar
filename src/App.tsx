import query from "query-string";
import { useLayoutEffect, useRef, useState } from "react";
import { Game } from "./Game";
import { LocalWrapper } from "./netplayjs/localwrapper";
import { RollbackWrapper, Stats } from "./netplayjs/rollbackwrapper";
import { WrapperConstructor } from "./netplayjs/types";
import { RollbackOverlay } from "./RollbackOverlay";

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

  const [stats, setStats] = useState<Stats | null>(null);
  const [peerPaused, setPeerPaused] = useState(false);
  const [rtcStats, setRtcStats] = useState<RTCStatsReport | null>(null);

  const handleStartLocal = () => {
    setWrapperClass(() => LocalWrapper);
  };
  const handleStartRollback = () => {
    setWrapperClass(() => RollbackWrapper);
  };
  const handleStop = () => {
    window.history.replaceState({}, document.title, "/");
    setWrapperClass(null);
  };

  useLayoutEffect(() => {
    if (WrapperClass) {
      const game = new Game(canvasRef.current!);
      const wrapper = new WrapperClass(game);

      if (wrapper instanceof RollbackWrapper) {
        wrapper.onStatsUpdated.on((stats) => {
          setStats(stats);
        });
        wrapper.onPeerPaused.on(() => {
          setPeerPaused(true);
        });
        wrapper.onPeerResumed.on(() => {
          setPeerPaused(false);
        });
        wrapper.onRTCStatsUpdated.on((stats) => {
          setRtcStats(stats);
        });
      }

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
        {WrapperClass === RollbackWrapper ? (
          <>
            <RollbackOverlay
              rtcStats={rtcStats}
              stats={stats}
              peerPaused={peerPaused}
            />
          </>
        ) : null}
      </>
    );
  }

  return (
    <div className="flex-column">
      <button onClick={handleStartLocal}>Start a singleplayer game</button>
      <button onClick={handleStartRollback}>Start a versus game</button>
    </div>
  );
};
