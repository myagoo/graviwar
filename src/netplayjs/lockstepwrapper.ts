import { DataConnection } from "peerjs";
import { DefaultInput, DefaultInputReader } from "./defaultinput";
import EWMASD from "./ewmasd";
import { LockstepNetcode } from "./netcode/lockstep";
import { NetplayPlayer, NetplayState } from "./types";

import * as log from "loglevel";
import { GameWrapper } from "./gamewrapper";
import { NetGame, GameClass } from "./game";

const PING_INTERVAL = 100;

export class LockstepWrapper extends GameWrapper {
  pingMeasure: EWMASD = new EWMASD(0.2);
  game?: NetGame;
  lockstepNetcode?: LockstepNetcode<NetGame, DefaultInput>;

  constructor(gameClass: GameClass, canvas: HTMLCanvasElement) {
    super(gameClass, canvas);
  }

  startHost(players: Array<NetplayPlayer>, conn: DataConnection) {
    log.info("Starting a lockstep host.");

    this.game = new this.gameClass(this.canvas, players);

    this.lockstepNetcode = new LockstepNetcode(
      true,
      this.game!,
      players,
      this.gameClass.timestep,
      this.stateSyncPeriod,
      () => this.inputReader.getInput(),
      (frame, input) => {
        conn.send({ type: "input", frame: frame, input: input.serialize() });
      },
      (frame, state) => {
        conn.send({ type: "state", frame: frame, state: state });
      }
    );

    conn.on("data", (data) => {
      if (data.type === "input") {
        let input = new DefaultInput();
        input.deserialize(data.input);

        this.lockstepNetcode!.onRemoteInput(data.frame, players![1], input);
      } else if (data.type == "ping-req") {
        conn.send({ type: "ping-resp", sent_time: data.sent_time });
      } else if (data.type == "ping-resp") {
        this.pingMeasure.update(Date.now() - data.sent_time);
      }
    });

    conn.on("open", () => {
      console.log("Client has connected... Starting game...");
      this.checkChannel(conn.dataChannel);

      setInterval(() => {
        conn.send({ type: "ping-req", sent_time: Date.now() });
      }, PING_INTERVAL);

      this.startGameLoop();
    });
  }

  startClient(players: Array<NetplayPlayer>, conn: DataConnection) {
    log.info("Starting a lockstep client.");

    this.game = new this.gameClass(this.canvas, players, conn);
    this.lockstepNetcode = new LockstepNetcode(
      false,
      this.game!,
      players,
      this.gameClass.timestep,
      this.stateSyncPeriod,
      () => this.inputReader.getInput(),
      (frame, input) => {
        conn.send({ type: "input", frame: frame, input: input.serialize() });
      }
    );

    conn.on("data", (data) => {
      if (data.type === "input") {
        let input = new DefaultInput();
        input.deserialize(data.input);

        this.lockstepNetcode!.onRemoteInput(data.frame, players![0], input);
      } else if (data.type === "state") {
        this.lockstepNetcode!.onStateSync(data.frame, data.state);
      } else if (data.type == "ping-req") {
        conn.send({ type: "ping-resp", sent_time: data.sent_time });
      } else if (data.type == "ping-resp") {
        this.pingMeasure.update(Date.now() - data.sent_time);
      }
    });
    conn.on("open", () => {
      console.log("Successfully connected to server... Starting game...");
      this.checkChannel(conn.dataChannel);

      setInterval(() => {
        conn.send({ type: "ping-req", sent_time: Date.now() });
      }, PING_INTERVAL);

      this.startGameLoop();
    });
  }

  startGameLoop() {
    this.stats.style.display = "inherit";

    // Start the netcode game loop.
    this.lockstepNetcode!.start();

    let animate = (timestamp: DOMHighResTimeStamp) => {
      // Draw state to canvas.
      this.game!.draw(this.canvas);

      // Update stats
      this.stats.innerHTML = `
      <div>Netcode Algorithm: Lockstep</div>
      <div>Ping: ${this.pingMeasure
        .average()
        .toFixed(2)} ms +/- ${this.pingMeasure.stddev().toFixed(2)} ms</div>
      <div>Frame Number: ${this.lockstepNetcode!.frame}</div>
      <div>Missed Frames: ${this.lockstepNetcode!.missedFrames}</div>

      <div>State Syncs: ${this.lockstepNetcode!.stateSyncsSent} sent, ${
        this.lockstepNetcode!.stateSyncsReceived
      } received</div>
      `;

      // Request another frame.
      requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }
}
