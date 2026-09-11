import { useCallback, useEffect, useRef, useState } from "react";
import { Game } from "./Game";
import {
  checkReplayState, MAX_REPLAY_TICKS, replayPlayer, replaySchema,
  stepReplaySession, type Replay, type ReplaySession,
} from "./replay";

export function ReplayLab() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const seedInput = useRef<HTMLInputElement>(null);
  const session = useRef<ReplaySession | null>(null);
  const [view, setView] = useState({ tick: 0, limit: MAX_REPLAY_TICKS, playing: false, mode: "record", message: "", state: "" });

  const refresh = useCallback(() => {
    const current = session.current!;
    const { game, tick, playing, mode, message } = current;
    game.draw(performance.now(), tick);
    setView({ tick, limit: mode === "record" ? MAX_REPLAY_TICKS : current.trace.inputs.length,
      playing, mode, message, state: JSON.stringify({
      bodies: game.blackHoles.length,
      player: game.blackHoles.find((body) => body.playerId === replayPlayer.id) ?? null,
    }, null, 2) });
  }, []);

  const reset = useCallback((trace?: Replay) => {
    session.current?.game.destroy();
    const game = new Game(canvas.current!);
    const seed = trace?.seed ?? (seedInput.current!.value || "graviwar-replay-1");
    seedInput.current!.value = seed;
    game.start([replayPlayer], seed, trace?.settings);
    session.current = {
      game, tick: 0, playing: false, mode: trace ? "replay" : "record",
      message: trace ? "Replay loaded; press Play or Step" : "Click the canvas, then Step, or press Play to record",
      trace: trace ?? { version: 18, seed, settings: game.settings, browser: navigator.userAgent, inputs: [], states: [game.getFrozenSnapshot()] },
    };
    checkReplayState(session.current);
    refresh();
  }, [refresh]);

  const advance = useCallback(() => {
    try {
      stepReplaySession(session.current!);
      refresh();
    } catch (error) {
      session.current!.playing = false;
      setView((previous) => ({ ...previous, playing: false, message: `ERROR: ${String(error)}` }));
    }
  }, [refresh]);

  useEffect(() => {
    reset();
    const timer = window.setInterval(() => {
      if (session.current?.playing) advance();
    }, session.current!.game.timestep);
    return () => { clearInterval(timer); session.current?.game.destroy(); };
  }, [advance, reset]);

  const download = (value: unknown, filename: string) => {
    const json = JSON.stringify(value, (_key, item) =>
      typeof item === "number" && !Number.isFinite(item) ? String(item) : item);
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const selfCheck = () => {
    try {
      reset();
      for (let tick = 1; tick <= 12; tick++) {
        if (tick === 1 || tick === 6) session.current!.game.clickDirection = tick / 10;
        stepReplaySession(session.current!);
      }
      const trace = replaySchema.parse(session.current!.trace);
      reset(trace);
      for (let tick = 1; tick <= 12; tick++) stepReplaySession(session.current!);
      const cleanRun = session.current!;
      if (cleanRun.failure || cleanRun.tick !== 12) throw new Error("Clean replay failed");
      const altered = structuredClone(trace);
      altered.states[6][0].position.x += 1;
      reset(altered);
      for (let tick = 1; tick <= 12; tick++) stepReplaySession(session.current!);
      const failure = session.current!.failure;
      if (failure?.tick !== 6 || failure.difference.field !== "blackHoles[0].position.x") {
        throw new Error("Detector missed the injected mismatch");
      }
      session.current!.message = "SELF-CHECK PASS: clean replay matched 12 ticks; injected position mismatch stopped at tick 6";
      refresh();
    } catch (error) {
      session.current!.playing = false;
      setView((previous) => ({ ...previous, playing: false, message: `SELF-CHECK FAIL: ${String(error)}` }));
    }
  };

  return <>
    <canvas ref={canvas} tabIndex={0} aria-label="Replay game canvas" />
    <section className="overlay bottom left flex-column" aria-label="Replay diagnostics"
      style={{ background: "#111e", maxHeight: "60vh", overflow: "auto", maxWidth: "calc(100vw - 16px)" }}>
      <strong>Replay lab · {view.mode} · Tick {view.tick}/{view.limit}</strong>
      <label>Seed <input ref={seedInput} defaultValue="graviwar-replay-1" maxLength={200} /></label>
      <div className="flex-row">
        <button onClick={() => reset()}>New recording</button>
        <button disabled={Boolean(session.current?.failure) || view.tick === view.limit} onClick={() => {
          session.current!.playing = !session.current!.playing;
          refresh();
        }}>{view.playing ? "Pause" : "Play"}</button>
        <button disabled={view.playing || Boolean(session.current?.failure) || view.tick === view.limit} onClick={advance}>Step</button>
      </div>
      <div className="flex-row">
        <button onClick={() => reset(session.current!.trace)}>Replay recording</button>
        <button onClick={() => download(session.current!.trace, "graviwar-replay.json")}>Export replay</button>
        <button onClick={selfCheck}>Run self-check</button>
      </div>
      <label>Import replay <input type="file" accept=".json,application/json" onChange={async (event) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        session.current!.playing = false;
        refresh();
        try {
          if (file.size > 32 * 1024 * 1024) throw new Error("Replay exceeds 32 MiB");
          const trace = replaySchema.parse(JSON.parse(await file.text()));
          reset(trace);
        } catch (error) {
          setView((previous) => ({ ...previous, message: `IMPORT ERROR: ${String(error)}` }));
        }
      }} /></label>
      <output aria-live="polite">{view.message}</output>
      {session.current?.failure && <button onClick={() => download({
        trace: session.current!.trace, failure: session.current!.failure,
        replayBrowser: navigator.userAgent,
      }, "graviwar-replay-failure.json")}>Export failure evidence</button>}
      <details><summary>Current physics state</summary><pre>{view.state}</pre></details>
      <a href="/">Back to menu</a>
    </section>
  </>;
}
