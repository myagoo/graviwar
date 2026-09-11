import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { SoloSetup } from "./SoloSetup";
import { DEFAULT_SOLO_SETTINGS, type SoloSettings } from "./solo-settings";
import { BONUS_NAMES, BONUS_COLORS, bonusDescriptions, type Bonus } from "./bonuses";
import { Game } from "./Game";
import { LocalWrapper } from "./netplayjs/localwrapper";
import { RollbackWrapper, Stats } from "./netplayjs/rollbackwrapper";
import homeLogo from "./assets/home-logo.png";
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
  const [bonus, setBonus] = useState<{ label: string; disabled: boolean; item?: Bonus }>({ label: "Absorb a glowing fluctuation or ? body to collect an item", disabled: true });
  const [itemPosition, setItemPosition] = useState<"left" | "center" | "right">(() => {
    try { const saved = localStorage.getItem("graviwar.item-position"); if (saved === "left" || saved === "center") return saved; } catch { /* Storage may be unavailable. */ }
    return "right";
  });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<Mode>(() => {
    const wrapper = new URLSearchParams(location.search).get("wrapper");
    return wrapper === "local" ? "setup" : wrapper === "rollback" ? "multiplayer" : null;
  });
  const [soloSettings, setSoloSettings] = useState<SoloSettings>(DEFAULT_SOLO_SETTINGS);
  const [gameSettings, setGameSettings] = useState(DEFAULT_SOLO_SETTINGS);
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
    game.onSettingsChanged = setGameSettings;
    game.onBonusChanged = (label, disabled, item) => setBonus({ label, disabled, item });
    const wrapper = mode === "solo" ? new LocalWrapper(game, soloSettings) : new RollbackWrapper(game);
    if (wrapper instanceof RollbackWrapper) {
      wrapper.onStatsUpdated.on(setStats);
      wrapper.onPeerPaused.on(() => setPeerPaused(true));
      wrapper.onPeerResumed.on(() => setPeerPaused(false));
    }
    wrapper.start();
    return () => { wrapper.destroy(); gameRef.current = null; };
  }, [mode, soloSettings, multiplayerOffline]);

  if (mode === "multiplayer" && !online) return <><MenuBackdrop /><div className="setup-page menu-ui"><main className="setup-card menu-card"><header className="menu-header"><button className="menu-back" aria-label="Back to menu" onClick={stop}>←</button><h1>Multiplayer</h1></header>
    <p role="status">You’re offline. Multiplayer needs an internet connection.</p>
  </main></div></>;

  if (mode === "setup") return <><MenuBackdrop /><SoloSetup onBack={stop} onStart={settings => { setSoloSettings(settings); setMode("solo"); }} /></>;

  if (!mode) return <><MenuBackdrop /><Home online={online} onSolo={() => setMode("setup")} onMultiplayer={() => setMode("multiplayer")} /></>;

  return (
    <>
      {mode === "multiplayer" && <MenuBackdrop />}
      <canvas tabIndex={mode === "multiplayer" && !stats ? -1 : 0} ref={canvasRef} />
      {(mode === "solo" || stats !== null) && <>
      <button className="game-menu-toggle" popoverTarget="game-menu" aria-label="Game menu">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
      </button>
      <div id="game-menu" className="game-menu menu-ui menu-card" popover="auto">
        <button onClick={stop}>Back to menu</button>
        <fieldset className="item-position">
          <legend>Item button position</legend>
          {(["left", "center", "right"] as const).map(position => <label key={position}>
            <input type="radio" name="item-position" value={position} checked={itemPosition === position} onChange={() => {
              setItemPosition(position);
              try { localStorage.setItem("graviwar.item-position", position); } catch { /* Keep the preference for this session. */ }
            }} />{position[0].toUpperCase() + position.slice(1)}
          </label>)}
        </fieldset>
        <h2>How to play</h2>
        <p>Be the last black hole standing.</p>
        <p>Tap to expel matter. Hold for {gameSettings.chargeMs / 1000} seconds for {gameSettings.chargeBoost}× shot speed and recoil, aim by dragging, then release. Absorb smaller black holes and avoid bigger ones.</p>
        <p>Scroll or pinch to zoom. Absorb a ? body to collect an item, then tap your item or press Space to use it.</p>
        <p className="hole-legend"><i className="local">You</i> · <i className="player">Rivals</i> · <i className="smaller">Smaller</i> · <i className="larger">Larger</i></p>
        <h2>Items</h2>
        <p>Collecting another item replaces your stored one. An active effect must finish before you can use another.</p>
        <dl className="item-legend">
          <div><dt style={{ color: "#7cffda" }}>Quantum fluctuations</dt><dd>Glowing dots appear throughout the match. Absorb one to replace your stored item. Other black holes can carry them too.</dd></div>
          <div><dt style={{ color: "#ffb969" }}>Hawking Radiation</dt><dd>Amber fluctuations start after {gameSettings.hawkingDelay} seconds. Any black hole consuming one sheds {gameSettings.hawkingMass * 100}% of current mass every {gameSettings.hawkingIntervalTicks} ticks for {gameSettings.hawkingSeconds} seconds.</dd></div>
          {(Object.keys(BONUS_NAMES) as Bonus[]).map(item => <div key={item}>
            <dt style={{ color: BONUS_COLORS[item] }}><ItemIcon item={item} /><span>{BONUS_NAMES[item]}</span></dt>
            <dd>{bonusDescriptions(gameSettings)[item]}</dd>
          </div>)}
        </dl>
        {mode === "multiplayer" && <RollbackOverlay stats={stats} />}
      </div>
      <button className={`item-button item-${itemPosition}${bonus.disabled && bonus.item ? " item-active" : ""}`} style={{ color: bonus.item ? BONUS_COLORS[bonus.item] : "#9eafc2" }} disabled={bonus.disabled} aria-label={bonus.label} title={bonus.label} onClick={() => { gameRef.current?.requestBonus(); canvasRef.current?.focus(); }}>
        <ItemIcon item={bonus.item} />
      </button>
      {mode === "multiplayer" && peerPaused && <div className="peer-notice" role="status">Waiting for a player to return. The game may run slowly.</div>}
      </>}
    </>
  );
};

function MenuBackdrop() {
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
  return <><div className="menu-backdrop"><canvas className="home-stars" ref={starsRef} aria-hidden="true" /></div><small className="build-version" aria-label={`Commit ${import.meta.env.VITE_COMMIT_HASH}`}>{import.meta.env.VITE_COMMIT_HASH}</small></>;
}

function Home({ online, onSolo, onMultiplayer }: { online: boolean; onSolo: () => void; onMultiplayer: () => void }) {
  return <main className="main-menu homepage menu-ui">
    <div className="home-content flex-column">
      <img src={homeLogo} width="160" height="160" alt="Graviwar black-hole logo" />
      <h1>GRAVIWAR</h1>
      <button onClick={onSolo}>Solo</button>
      <button disabled={!online} title={online ? undefined : "Multiplayer requires an internet connection"} aria-describedby={online ? undefined : "offline-status"} onClick={onMultiplayer}>Multiplayer</button>
      {!online && <span id="offline-status" className="sr-only" role="status">Offline — solo is available. Multiplayer requires internet.</span>}
    </div>
  </main>;
}

function ItemIcon({ item }: { item?: Bonus }) {
  const paths: Record<Bonus, string> = {
    surge: "M3 3l5 5M3 8h5V3M21 3l-5 5M16 3v5h5M3 21l5-5M3 16h5v5M21 21l-5-5M16 21v-5h5M10 12h4M12 10v4",
    pulse: "M8 8L3 3M3 8V3h5M16 8l5-5M16 3h5v5M8 16l-5 5M3 16v5h5M16 16l5 5M16 21h5v-5",
    jet: "M14 2L5 13h6l-1 9 9-13h-6l1-7Z",
    supermassive: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20ZM12 6a6 6 0 1 0 0 12 6 6 0 0 0 0-12Z",
  };
  return <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {item ? <path d={paths[item]} /> : <><circle cx="12" cy="12" r="9" strokeDasharray="2 3" /><path d="M9 9a3 3 0 1 1 5 2c-2 1-2 1-2 3M12 17h.01" /></>}
  </svg>;
}
