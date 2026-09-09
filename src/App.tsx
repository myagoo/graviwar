import { useLayoutEffect, useRef, useState } from "react";
import { SoloSetup } from "./SoloSetup";
import { DEFAULT_SOLO_SETTINGS, type SoloSettings } from "./solo-settings";
import { Game } from "./Game";
import { LocalWrapper } from "./netplayjs/localwrapper";
import { RollbackWrapper, Stats } from "./netplayjs/rollbackwrapper";
import { RollbackOverlay } from "./RollbackOverlay";

type Mode = "setup" | "solo" | "multiplayer" | null;

export const App = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<Mode>(() => {
    const wrapper = new URLSearchParams(location.search).get("wrapper");
    return wrapper === "local" ? "setup" : wrapper === "rollback" ? "multiplayer" : null;
  });
  const [soloSettings, setSoloSettings] = useState<SoloSettings>(DEFAULT_SOLO_SETTINGS);
  const [stats, setStats] = useState<Stats | null>(null);
  const [peerPaused, setPeerPaused] = useState(false);

  const stop = () => {
    window.history.replaceState({}, document.title, location.pathname);
    setMode(null);
    setStats(null);
    setPeerPaused(false);
  };

  useLayoutEffect(() => {
    if (!mode || mode === "setup") return;
    const game = new Game(canvasRef.current!);
    const wrapper = mode === "solo" ? new LocalWrapper(game, soloSettings) : new RollbackWrapper(game);
    if (wrapper instanceof RollbackWrapper) {
      wrapper.onStatsUpdated.on(setStats);
      wrapper.onPeerPaused.on(() => setPeerPaused(true));
      wrapper.onPeerResumed.on(() => setPeerPaused(false));
    }
    wrapper.start();
    return () => wrapper.destroy();
  }, [mode, soloSettings]);

  if (mode === "setup") return <SoloSetup onBack={stop} onStart={settings => { setSoloSettings(settings); setMode("solo"); }} />;

  if (!mode) return (
    <div className="flex-column">
      <button onClick={() => setMode("setup")}>Solo</button>
      <button onClick={() => setMode("multiplayer")}>Multiplayer</button>
    </div>
  );

  return (
    <>
      <canvas tabIndex={0} ref={canvasRef} />
      <div className="overlay bottom right flex-column">
        <span>Try to be the last black hole standing</span>
        <span>Click to move by expulsing matter</span>
        <span>Absorb smaller black holes</span>
        <span>Avoid bigger black holes</span>
        <span className="hole-legend"><i className="local">You</i> · <i className="player">Players</i> · <i className="smaller">Smaller</i> · <i className="larger">Larger</i></span>
        <button onClick={stop}>Back to menu</button>
      </div>
      {mode === "multiplayer" && <RollbackOverlay stats={stats} peerPaused={peerPaused} />}
    </>
  );
};
