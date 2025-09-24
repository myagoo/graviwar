import { Input } from "./defaultinput";
import { LockstepNetcode } from "./netcode/lockstep";
import { InputData, NetGame, StateData } from "./types";

import { assert } from "chai";
import * as log from "loglevel";
import { BaseWrapper } from "./basewrapper";
import { PeerConnection } from "./matchmaking/peerconnection";
import { NetplayPlayer } from "./netcode/types";

export class LockstepWrapper extends BaseWrapper {
  wrapperName = "lockstep";

  drawRequestId?: number;

  game?: NetGame;

  lockstepNetcode?: LockstepNetcode;

  getStateSyncPeriod(): number {
    if (this.gameClass.deterministic) return 0;
    else return 1;
  }

  startHost(players: Array<NetplayPlayer>, conn: PeerConnection) {
    assert(
      conn.dataChannel?.readyState === "open",
      "DataChannel must be open."
    );

    log.info("Starting a lockstep host.", conn.peerID);

    this.game = new this.gameClass(this.canvas, players, conn.peerID);

    this.lockstepNetcode = new LockstepNetcode(
      true,
      this.game!,
      players,
      this.gameClass.timestep,
      this.getStateSyncPeriod(),
      () => this.inputReader.getInput(),
      (frame, input) => {
        conn.send({ type: "input", frame: frame, input: input.serialize() });
      }
    );

    conn.on("data", (data: InputData) => {
      if (data.type === "input") {
        const input = new Input();
        input.deserialize(data.input);

        this.lockstepNetcode!.onRemoteInput(data.frame, players![1], input);
      }
    });

    console.log("Client has connected... Starting game...");

    this.startGameLoop();
  }

  startClient(players: Array<NetplayPlayer>, conn: PeerConnection) {
    assert(
      conn.dataChannel?.readyState === "open",
      "DataChannel must be open."
    );

    log.info("Starting a lockstep client.", conn.peerID);

    this.game = new this.gameClass(this.canvas, players, conn.peerID);

    this.lockstepNetcode = new LockstepNetcode(
      false,
      this.game!,
      players,
      this.gameClass.timestep,
      this.getStateSyncPeriod(),
      () => this.inputReader.getInput(),
      (frame, input) => {
        conn.send({ type: "input", frame: frame, input: input.serialize() });
      }
    );

    conn.on("data", (data: InputData | StateData) => {
      if (data.type === "input") {
        const input = new Input();
        input.deserialize(data.input);

        this.lockstepNetcode!.onRemoteInput(data.frame, players![0], input);
      } else if (data.type === "state") {
        this.lockstepNetcode!.onStateSync(data.frame, data.state);
      }
    });

    console.log("Successfully connected to server... Starting game...");
    this.startGameLoop();
  }

  startGameLoop() {
    this.stats.style.display = "inherit";

    // Start the netcode game loop.
    this.lockstepNetcode!.start();

    let previousRenderedFrame = 0;

    const animate = (_timestamp: DOMHighResTimeStamp) => {
      const frame = this.lockstepNetcode!.frame;
      if (previousRenderedFrame !== frame) {
        this.game!.draw(this.canvas, this.lockstepNetcode!.frame);
      }
      // Draw state to canvas.
      previousRenderedFrame = this.lockstepNetcode!.frame;
      this.game!.draw(this.canvas, this.lockstepNetcode!.frame);

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
      this.drawRequestId = requestAnimationFrame(animate);
    };
    this.drawRequestId = requestAnimationFrame(animate);
  }

  destroy() {
    this.inputReader.destroy();
    this.lockstepNetcode?.destroy();
    this.game?.destroy();
    if (this.pingIntervalId) {
      clearInterval(this.pingIntervalId);
    }
    if (this.drawRequestId) {
      cancelAnimationFrame(this.drawRequestId);
    }
  }
}
