import { Input } from "./defaultinput";
import { InputData, NetGame, StateData } from "./types";

import * as log from "loglevel";
import { BaseWrapper } from "./basewrapper";
import { PeerConnection } from "./matchmaking/peerconnection";
import { RollbackNetcode } from "./netcode/rollback";
import { NetplayPlayer } from "./netcode/types";

export class RollbackWrapper extends BaseWrapper {
  wrapperName = "rollback";

  drawRequestId?: number;

  game?: NetGame;

  rollbackNetcode?: RollbackNetcode;

  getInitialInputs(players: Array<NetplayPlayer>): Map<NetplayPlayer, Input> {
    const initialInputs: Map<NetplayPlayer, Input> = new Map();
    for (const player of players) {
      initialInputs.set(player, new Input());
    }
    return initialInputs;
  }

  startHost(players: Array<NetplayPlayer>, conn: PeerConnection) {
    log.info("Starting a rollback host.", conn.peerID, conn.client.clientID);

    this.game = new this.gameClass(this.canvas, players, conn.peerID);

    this.rollbackNetcode = new RollbackNetcode(
      this.game,
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

    conn.on("data", (data: InputData) => {
      if (data.type === "input") {
        const input = new Input();
        input.deserialize(data.input);
        this.rollbackNetcode!.onRemoteInput(data.frame, players![1], input);
      }
    });

    console.log("Client has connected... Starting game...");
    this.startGameLoop();
  }

  startClient(players: Array<NetplayPlayer>, conn: PeerConnection) {
    log.info("Starting a rollback client.", conn.peerID, conn.client.clientID);

    this.game = new this.gameClass(this.canvas, players, conn.client.clientID!);
    this.rollbackNetcode = new RollbackNetcode(
      this.game,
      players,
      this.getInitialInputs(players),
      10,
      this.pingMeasure,
      this.gameClass.timestep,
      () => this.inputReader.getInput(),
      (frame, input) => {
        conn.send({
          type: "input",
          frame: frame,
          input: input.serialize(),
        });
      }
    );

    conn.on("data", (data: InputData | StateData) => {
      if (data.type === "input") {
        const input = new Input();
        input.deserialize(data.input);
        this.rollbackNetcode!.onRemoteInput(data.frame, players![0], input);
      }
    });

    console.log("Successfully connected to server... Starting game...");
    this.startGameLoop();
  }

  startGameLoop() {
    this.stats.style.display = "inherit";

    // Start the netcode game loop.
    this.rollbackNetcode!.start();

    const animate = (_timestamp: DOMHighResTimeStamp) => {
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
      this.drawRequestId = requestAnimationFrame(animate);
    };

    this.drawRequestId = requestAnimationFrame(animate);
  }

  destroy() {
    console.log("destroy coll");
    this.inputReader.destroy();
    this.rollbackNetcode?.destroy();
    this.game?.destroy();
    if (this.pingIntervalId) {
      clearInterval(this.pingIntervalId);
    }
    if (this.drawRequestId) {
      cancelAnimationFrame(this.drawRequestId);
    }
  }
}
