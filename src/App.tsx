import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { SoloSetup } from "./SoloSetup";
import { DEFAULT_SOLO_SETTINGS, type SoloSettings } from "./solo-settings";
import { Game } from "./Game";
import { LocalWrapper } from "./netplayjs/localwrapper";
import { RollbackWrapper, Stats } from "./netplayjs/rollbackwrapper";
import { Camera } from "./Camera";
import { drawStars } from "./space-renderer";
import { RollbackOverlay } from "./RollbackOverlay";

type Mode = "setup" | "solo" | "multiplayer" | null;

export const App = () => {
  const [online, setOnline] = useState(navigator.onLine);
  useLayoutEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);window.addEventListener("offline", update);
    update();
    return () => { window.removeEventListener("online", update);window.removeEventListener("offline", update); };
  }, []);
  const gameRef = useRef<Game | null>(null);
  const [bonus, setBonus] = useState({ label: "Absorb a ? body to collect a bonus", disabled: true, description: "" });
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

  const multiplayerOffline = mode === "multiplayer" && !online;
  useLayoutEffect(() => {
    if (!mode || mode === "setup" || multiplayerOffline) return;
    const game = new Game(canvasRef.current!);
    gameRef.current = game;
    game.onBonusChanged = (label, disabled, description) => setBonus({ label, disabled, description });
    const wrapper = mode === "solo" ? new LocalWrapper(game, soloSettings) : new RollbackWrapper(game);
    if (wrapper instanceof RollbackWrapper) {
      wrapper.onStatsUpdated.on(setStats);
      wrapper.onPeerPaused.on(() => setPeerPaused(true));
      wrapper.onPeerResumed.on(() => setPeerPaused(false));
    }
    wrapper.start();
    return () => { wrapper.destroy(); gameRef.current = null; };
  }, [mode, soloSettings, multiplayerOffline]);

  if (mode === "multiplayer" && !online) return <div className="flex-column main-menu">
    <p role="status">You’re offline. Multiplayer needs an internet connection.</p>
    <button onClick={stop}>Back to menu</button>
  </div>;

  if (mode === "setup") return <SoloSetup onBack={stop} onStart={settings => { setSoloSettings(settings); setMode("solo"); }} />;

  if (!mode) return <Home online={online} onSolo={() => setMode("setup")} onMultiplayer={() => setMode("multiplayer")} />;

  return (
    <>
      <canvas tabIndex={0} ref={canvasRef} />
      <div className="bonus-panel">
        <button disabled={bonus.disabled} onClick={() => { gameRef.current?.requestBonus(); canvasRef.current?.focus(); }}>{bonus.label}</button>
        <small>{bonus.description}</small>
      </div>
      <div className="overlay bottom right flex-column">
        <span>Try to be the last black hole standing</span>
        <span>Click to move by expulsing matter</span>
        <span>Absorb smaller black holes</span>
        <span>Avoid bigger black holes</span>
        <span className="hole-legend"><i className="local">You</i> · <i className="player">Rivals</i> · <i className="smaller">Smaller</i> · <i className="larger">Larger</i></span>
        <button onClick={stop}>Back to menu</button>
      </div>
      {mode === "multiplayer" && <RollbackOverlay stats={stats} peerPaused={peerPaused} />}
    </>
  );
};

function Home({ online, onSolo, onMultiplayer }: { online: boolean; onSolo: () => void; onMultiplayer: () => void }) {
  const starsRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = starsRef.current!;
    const ctx = canvas.getContext("2d")!;
    const camera = new Camera(ctx);
    const draw = () => {
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
      camera.resize();
      camera.zoomTo(canvas.width * 24);
      drawStars(ctx, camera);
    };
    draw();
    window.addEventListener("resize", draw);
    return () => window.removeEventListener("resize", draw);
  }, []);
  return <main className="main-menu homepage">
    <canvas className="home-stars" ref={starsRef} aria-hidden="true" />
    <div className="home-content flex-column">
      <img src={`${import.meta.env.BASE_URL}icons/icon-512.png`} width="160" height="160" alt="Graviwar black-hole logo" />
      <h1>GRAVIWAR</h1>
      <button onClick={onSolo}>Solo</button>
      <button disabled={!online} title={online ? undefined : "Multiplayer requires an internet connection"} aria-describedby={online ? undefined : "offline-status"} onClick={onMultiplayer}>Multiplayer</button>
      {!online && <span id="offline-status" className="sr-only" role="status">Offline — solo is available. Multiplayer requires internet.</span>}
    </div>
    <small className="build-version" aria-label={`Commit ${import.meta.env.VITE_COMMIT_HASH}`}>{import.meta.env.VITE_COMMIT_HASH}</small>
  </main>;
}
