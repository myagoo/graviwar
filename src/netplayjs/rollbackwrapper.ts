import { Data, Wrapper } from "./types";

import { assert } from "chai";
import EventEmitter from "eventemitter3";
import * as log from "loglevel";
import EWMASD from "./ewmasd";
import { PeerConnection } from "./matchmaking/peerconnection";
import { TypedEvent } from "./matchmaking/typedevent";
import { RollbackNetcode } from "./netcode/rollback";
import { NetplayGame, NetplayPlayer, SerializableValue } from "./netcode/types";
import { GameMenu } from "./ui/gamemenu";

// const PING_INTERVAL = 500;
export interface Stats {
  ping: number;
  pingStdDev: number;
  historySize: number;
  frameNumber: number;
  largestFutureSize: number;
}
export class RollbackWrapper extends EventEmitter implements Wrapper {
  localPlayerId?: number | string;
  remotePlayerId?: number | string;
  roomId?: number | string;
  playerMap: Map<string | number, NetplayPlayer> = new Map();
  pingMeasure = new EWMASD(0.2);
  pingIntervalId?: number;
  drawRequestId?: number;
  rollbackNetcode?: RollbackNetcode;
  gameMenu?: GameMenu;
  onStatsUpdated: TypedEvent<Stats> = new TypedEvent();
  onPeerPaused: TypedEvent<void> = new TypedEvent();
  onPeerResumed: TypedEvent<void> = new TypedEvent();
  onRTCStatsUpdated: TypedEvent<RTCStatsReport> = new TypedEvent();

  constructor(public game: NetplayGame<SerializableValue>) {
    super();
  }

  isChannelOrdered(channel: RTCDataChannel) {
    return channel.ordered;
  }

  isChannelReliable(channel: RTCDataChannel) {
    return (
      (channel.maxPacketLifeTime === null ||
        channel.maxPacketLifeTime === 65535) &&
      (channel.maxRetransmits === null || channel.maxRetransmits === 65535)
    );
  }

  checkChannel(channel: RTCDataChannel) {
    assert.isTrue(
      this.isChannelOrdered(channel),
      "Data Channel must be ordered."
    );
    assert.isTrue(this.isChannelReliable(channel), "Channel must be reliable.");
  }

  start() {
    this.gameMenu = new GameMenu();

    this.gameMenu.onClientStart.once((players) => {
      const hostPlayer = players[0];
      const clientPlayer = players[1];
      const conn = hostPlayer.conn;

      this.checkChannel(conn.dataChannel!);

      this.localPlayerId = clientPlayer.id;
      this.remotePlayerId = hostPlayer.id;
      console.log("localPlayerId", this.localPlayerId);
      console.log("remotePlayerId", this.remotePlayerId);
      this.roomId = this.remotePlayerId;

      this.playerMap.set(this.remotePlayerId, hostPlayer);
      this.playerMap.set(this.localPlayerId, clientPlayer);

      // this.watchRTCStats(conn.peerConnection);
      // this.startPing(conn);
      this.startVisibilityWatcher(conn);

      this.startClient([hostPlayer, clientPlayer], conn);
    });

    this.gameMenu.onHostStart.once((players) => {
      const hostPlayer = players[0];
      const clientPlayer = players[1];
      const conn = clientPlayer.conn;
      this.checkChannel(conn.dataChannel!);

      // Construct the players array.

      this.localPlayerId = hostPlayer.id;
      this.remotePlayerId = clientPlayer.id;
      console.log("localPlayerId", this.localPlayerId);
      console.log("remotePlayerId", this.remotePlayerId);
      this.roomId = this.localPlayerId;
      this.playerMap.set(this.localPlayerId, hostPlayer);
      this.playerMap.set(this.remotePlayerId, clientPlayer);

      // this.watchRTCStats(conn.peerConnection);
      // this.startPing(conn);
      this.startVisibilityWatcher(conn);

      this.startHost([hostPlayer, clientPlayer], conn);
    });
  }

  startVisibilityWatcher(conn: PeerConnection) {
    // Send the current tab visibility to the other player.
    conn.send({
      type: "visibility-state",
      value: document.visibilityState,
      playerID: this.localPlayerId!,
    });

    // Update the other player on our tab visibility.
    document.addEventListener("visibilitychange", () => {
      log.debug(`My visibility state changed to: ${document.visibilityState}.`);
      conn.send({
        type: "visibility-state",
        value: document.visibilityState,
        playerID: this.localPlayerId!,
      });
    });

    // Show an indicator if the other player's tab is invisible.
    conn.on("data", (data: Data) => {
      if (data.type === "visibility-state") {
        if (data.value === "hidden") {
          this.onPeerPaused.emit();
        } else {
          this.onPeerResumed.emit();
        }
      }
    });
  }

  // startPing(conn: PeerConnection) {
  //   this.pingIntervalId = window.setInterval(() => {
  //     conn.send({
  //       type: "ping-req",
  //       sent_time: performance.now(),
  //       playerID: this.localPlayerId!,
  //     });
  //   }, PING_INTERVAL);

  //   conn.on("data", (data: Data) => {
  //     if (data.type == "ping-req") {
  //       conn.send({
  //         type: "ping-resp",
  //         sent_time: data.sent_time,
  //         playerID: this.remotePlayerId!,
  //       });
  //     } else if (data.type == "ping-resp") {
  //       this.pingMeasure.update(performance.now() - data.sent_time);
  //     }
  //   });
  // }

  // async watchRTCStats(connection: RTCPeerConnection) {
  //   const stats = await connection.getStats();
  //   this.onRTCStatsUpdated.emit(stats);

  //   setTimeout(async () => {
  //     await this.watchRTCStats(connection);
  //   }, 1000);
  // }

  startHost(players: Array<NetplayPlayer>, conn: PeerConnection) {
    log.info("Starting a rollback host.", conn.peerID, conn.client.clientID);

    this.game?.start(players, this.roomId!);

    this.rollbackNetcode = new RollbackNetcode(
      this.game,
      players,
      (frame, input) => {
        conn.send({
          type: "input",
          frame,
          input,
          playerID: this.localPlayerId!,
        });
      }
    );

    conn.on("data", (data: Data) => {
      if (data.type !== "input") {
        return;
      }
      const remotePlayer = this.playerMap.get(conn.peerID)!;
      console.log("onRemoteInput", data.frame, remotePlayer, data.input);
      if (data.input !== undefined) {
        this.rollbackNetcode!.onRemoteInput(
          data.frame,
          remotePlayer,
          data.input
        );
      } else {
        this.rollbackNetcode!.onRemoteSync(data.frame, remotePlayer);
      }
    });

    console.log("Client has connected... Starting game...");
    this.startGameLoop();
  }

  startClient(players: Array<NetplayPlayer>, conn: PeerConnection) {
    log.info("Starting a rollback client.", conn.peerID, conn.client.clientID);

    this.game?.start(players, this.roomId!);

    this.rollbackNetcode = new RollbackNetcode(
      this.game,
      players,
      (frame, input) => {
        conn.send({
          type: "input",
          frame,
          input,
          playerID: this.remotePlayerId!,
        });
      }
    );

    conn.on("data", (data: Data) => {
      if (data.type !== "input") {
        return;
      }

      const remotePlayer = this.playerMap.get(conn.peerID)!;
      console.log("onRemoteInput", data.frame, remotePlayer, data.input);
      if (data.input !== undefined) {
        this.rollbackNetcode!.onRemoteInput(
          data.frame,
          remotePlayer,
          data.input
        );
      } else {
        this.rollbackNetcode!.onRemoteSync(data.frame, remotePlayer);
      }
    });

    console.log("Successfully connected to server... Starting game...");
    this.startGameLoop();
  }

  startGameLoop() {
    // Start the netcode game loop.
    this.rollbackNetcode!.start();

    const animate = (timestamp: DOMHighResTimeStamp) => {
      const frame = this.rollbackNetcode!.currentFrame();
      // Draw state.
      this.game!.draw(timestamp, frame);

      // Update stats
      this.onStatsUpdated.emit({
        ping: this.pingMeasure.average(),
        pingStdDev: this.pingMeasure.stddev(),
        historySize: this.rollbackNetcode!.history.length,
        frameNumber: frame,
        largestFutureSize: this.rollbackNetcode!.largestFutureSize(),
      });

      // Request another frame.
      this.drawRequestId = requestAnimationFrame(animate);
    };

    this.drawRequestId = requestAnimationFrame(animate);
  }

  destroy() {
    this.gameMenu?.destroy();
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
