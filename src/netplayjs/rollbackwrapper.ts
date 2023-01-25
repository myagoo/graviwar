import { DataConnection } from "peerjs";
import { DefaultInput } from "./defaultinput";
import EWMASD from "./ewmasd";
import { NetplayPlayer } from "./types";

import * as log from "loglevel";
import { NetGame } from "./game";
import { GameWrapper } from "./gamewrapper";
import { RollbackNetcode } from "./netcode/rollback";

const PING_INTERVAL = 100;

export class RollbackWrapper extends GameWrapper {
  pingMeasure: EWMASD = new EWMASD(0.2);

  game?: NetGame;

  rollbackNetcode?: RollbackNetcode<NetGame, DefaultInput>;

  getInitialInputs(
    players: Array<NetplayPlayer>
  ): Map<NetplayPlayer, DefaultInput> {
    let initialInputs: Map<NetplayPlayer, DefaultInput> = new Map();
    for (let player of players) {
      initialInputs.set(player, new DefaultInput());
    }
    return initialInputs;
  }

  startHost(players: Array<NetplayPlayer>, conn: DataConnection) {
    log.info("Starting a rollback host.");

    this.game = new this.gameClass(this.canvas, players, conn);

    this.rollbackNetcode = new RollbackNetcode(
      this.game!,
      players,
      this.getInitialInputs(players),
      10,
      this.pingMeasure,
      this.gameClass.timestep,
      () => this.inputReader.getInput(),
      (frame, input) => {
        conn.send({ type: "input", frame: frame, input: input.serialize() });
      }
    );

    conn.on("data", (data: any) => {
      if (data.type === "input") {
        let input = new DefaultInput();
        input.deserialize(data.input);
        this.rollbackNetcode!.onRemoteInput(data.frame, players![1], input);
      } else if (data.type === "ping-req") {
        conn.send({ type: "ping-resp", sent_time: data.sent_time });
      } else if (data.type === "ping-resp") {
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
    log.info("Starting a rollback client.");

    this.game = new this.gameClass(this.canvas, players, conn);
    this.rollbackNetcode = new RollbackNetcode(
      this.game!,
      players,
      this.getInitialInputs(players),
      10,
      this.pingMeasure,
      this.gameClass.timestep,
      () => this.inputReader.getInput(),
      (frame, input) => {
        conn.send({ type: "input", frame: frame, input: input.serialize() });
      }
    );

    conn.on("data", (data: any) => {
      if (data.type === "input") {
        let input = new DefaultInput();
        input.deserialize(data.input);
        this.rollbackNetcode!.onRemoteInput(data.frame, players![0], input);
      } else if (data.type === "ping-req") {
        conn.send({ type: "ping-resp", sent_time: data.sent_time });
      } else if (data.type === "ping-resp") {
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
    this.rollbackNetcode!.start();

    let animate = (timestamp: DOMHighResTimeStamp) => {
      const frame = this.rollbackNetcode!.currentFrame();
      // Draw state to canvas.
      this.game!.draw(this.canvas, frame);

      // Update stats
      this.stats.innerHTML = `
        <div>Netcode Algorithm: Rollback</div>
        <div>Ping: ${this.pingMeasure
          .average()
          .toFixed(2)} ms +/- ${this.pingMeasure.stddev().toFixed(2)} ms</div>
        <div>History Size: ${this.rollbackNetcode!.history.length}</div>
        <div>Frame Number: ${frame}</div>
        <div>Largest Future Size: ${this.rollbackNetcode!.largestFutureSize()}</div>
        <div>Predicted Frames: ${this.rollbackNetcode!.predictedFrames()}</div>
        <div title="If true, then the other player is running slow, so we wait for them.">Stalling: ${this.rollbackNetcode!.shouldStall()}</div>
        `;

      // Request another frame.
      requestAnimationFrame(animate);
    };

    requestAnimationFrame(animate);
  }
}
