import { DataConnection } from "peerjs";
import { DefaultInput } from "./defaultinput";
import EWMASD from "./ewmasd";
import { LockstepNetcode } from "./netcode/lockstep";
import { NetplayPlayer } from "./types";

import * as log from "loglevel";
import { NetGame } from "./game";
import { GameWrapper } from "./gamewrapper";

const PING_INTERVAL = 100;

export class LockstepWrapper extends GameWrapper {
  pingMeasure: EWMASD = new EWMASD(0.2);
  game?: NetGame;
  lockstepNetcode?: LockstepNetcode<NetGame, DefaultInput>;

  startHost(players: Array<NetplayPlayer>, conn: DataConnection) {
    log.info("Starting a lockstep host.");

    this.game = new this.gameClass(this.canvas, players, conn);

    this.lockstepNetcode = new LockstepNetcode(
      true,
      this.game!,
      players,
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
      () => this.inputReader.getInput(),
      (frame, input) => {
        conn.send({ type: "input", frame: frame, input: input.serialize() });
      }
    );

    conn.on("data", (data: any) => {
      if (data.type === "input") {
        let input = new DefaultInput();
        input.deserialize(data.input);

        this.lockstepNetcode!.onRemoteInput(data.frame, players![0], input);
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
    this.lockstepNetcode!.start();

    let previousRenderedFrame = 0

    let animate = (timestamp: DOMHighResTimeStamp) => {
      const frame = this.lockstepNetcode!.frame
      if(previousRenderedFrame !== frame){
        this.game!.draw(this.canvas, this.lockstepNetcode!.frame);
      }
      // Draw state to canvas.
      previousRenderedFrame = this.lockstepNetcode!.frame
      this.game!.draw(this.canvas, this.lockstepNetcode!.frame);

      // Update stats
      this.stats.innerHTML = `
      <div>Netcode Algorithm: Lockstep</div>
      <div>Ping: ${this.pingMeasure
        .average()
        .toFixed(2)} ms +/- ${this.pingMeasure.stddev().toFixed(2)} ms</div>
      <div>Frame Number: ${this.lockstepNetcode!.frame}</div>
      <div>Missed Frames: ${this.lockstepNetcode!.missedFrames}</div>
      `;

      // Request another frame.
      requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }
}
