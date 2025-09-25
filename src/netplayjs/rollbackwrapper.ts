import { GameConstructor, Wrapper } from "./types";

import { assert } from "chai";
import { html, TemplateResult } from "lit-html";
import * as log from "loglevel";
import EWMASD from "./ewmasd";
import { PeerConnection } from "./matchmaking/peerconnection";
import { RollbackNetcode } from "./netcode/rollback";
import { NetplayGame, NetplayPlayer, SerializableValue } from "./netcode/types";
import { GameMenu } from "./ui/gamemenu";

const PING_INTERVAL = 500;
export interface InputData {
  frame: number;
  input: SerializableValue | undefined;
}
export class RollbackWrapper implements Wrapper {
  /** The network stats UI. */
  stats: HTMLDivElement;

  playerMap: Map<string, NetplayPlayer> = new Map();

  pingMeasure = new EWMASD(0.2);

  pingIntervalId?: number;

  drawRequestId?: number;

  game?: NetplayGame<SerializableValue>;

  rollbackNetcode?: RollbackNetcode;

  gameMenu?: GameMenu;

  playerPausedIndicator: HTMLDivElement;

  constructor(
    public gameClass: GameConstructor,
    public canvas: HTMLCanvasElement
  ) {
    // Create stats UI
    this.stats = document.createElement("div");
    this.stats.style.zIndex = "1";
    this.stats.style.position = "fixed";
    this.stats.style.backgroundColor = "rgba(0, 0, 0, 0.5)";
    this.stats.style.color = "white";
    this.stats.style.padding = "5px";
    this.stats.style.display = "none";
    this.stats.style.bottom = "0";
    this.stats.style.left = "0";

    document.body.appendChild(this.stats);

    // Create browser background info, to be shown when the other player has minimized or hidden their tab.
    // TODO use web worker to circumvent this
    this.playerPausedIndicator = (() => {
      const div = document.createElement("div");
      div.style.zIndex = "1";
      div.style.position = "absolute";
      div.style.backgroundColor = "rgba(0, 0, 0, 0.5)";
      div.style.color = "white";
      div.style.padding = "10px";
      div.style.left = "50%";
      div.style.top = "50%";
      div.style.transform = "translate(-50%, -50%)";

      div.style.boxSizing = "border-box";
      div.style.fontFamily = "sans-serif";
      div.innerHTML = `
      <p align="center" style="margin: 3px">The other player has minimized or hidden their tab.</p>
      <p align="center" style="margin: 3px">The game may run slowly until they return.</p>
      `;
      div.style.display = "none";

      document.body.appendChild(div);
      return div;
    })();
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

    this.gameMenu.onClientStart.once((conn) => {
      this.checkChannel(conn.dataChannel!);

      const hostPlayer = new NetplayPlayer(conn.peerID, false, true);
      const clientPlayer = new NetplayPlayer(
        conn.client.clientID!,
        true,
        false
      );

      this.playerMap.set(conn.peerID, hostPlayer);
      this.playerMap.set(conn.client.clientID!, clientPlayer);

      this.watchRTCStats(conn.peerConnection);
      this.startPing(conn);
      this.startVisibilityWatcher(conn);

      this.startClient([hostPlayer, clientPlayer], conn);
    });

    this.gameMenu.onHostStart.once((conn) => {
      this.checkChannel(conn.dataChannel!);

      // Construct the players array.
      const hostPlayer = new NetplayPlayer(0, true, true); // Player 0 is us, acting as a host.
      const clientPlayer = new NetplayPlayer(1, false, false); // Player 1 is our peer, acting as a client.

      this.playerMap.set(conn.client.clientID!, hostPlayer);
      this.playerMap.set(conn.peerID, clientPlayer);

      this.watchRTCStats(conn.peerConnection);
      this.startPing(conn);
      this.startVisibilityWatcher(conn);

      this.startHost([hostPlayer, clientPlayer], conn);
    });
  }

  startVisibilityWatcher(conn: PeerConnection) {
    // Send the current tab visibility to the other player.
    conn.send({ type: "visibility-state", value: document.visibilityState });

    // Update the other player on our tab visibility.
    document.addEventListener("visibilitychange", () => {
      log.debug(`My visibility state changed to: ${document.visibilityState}.`);
      conn.send({ type: "visibility-state", value: document.visibilityState });
    });

    // Show an indicator if the other player's tab is invisible.
    conn.on("data", (data) => {
      if (data.type === "visibility-state") {
        if (data.value === "hidden") {
          this.playerPausedIndicator.style.display = "inherit";
        } else {
          this.playerPausedIndicator.style.display = "none";
        }
      }
    });
  }

  startPing(conn: PeerConnection) {
    this.pingIntervalId = window.setInterval(() => {
      conn.send({ type: "ping-req", sent_time: performance.now() });
    }, PING_INTERVAL);

    conn.on("data", (data) => {
      if (data.type == "ping-req") {
        conn.send({ type: "ping-resp", sent_time: data.sent_time });
      } else if (data.type == "ping-resp") {
        this.pingMeasure.update(performance.now() - data.sent_time);
      }
    });
  }

  renderRTCStats(stats: RTCStatsReport): TemplateResult {
    return html`
      <details>
        <summary>WebRTC Stats</summary>
        ${[...stats.values()].map(
          (report) =>
            html`<div style="margin-left: 10px;">
              <details>
                <summary>${report.type}</summary>
                ${Object.entries(report).map(([key, _value]) => {
                  if (key !== "type") {
                    return html`<div style="margin-left: 10px;">
                      ${key}: ${report[key]}
                    </div>`;
                  }
                })}
              </details>
            </div>`
        )}
      </details>
    `;
  }

  rtcStats?: TemplateResult;
  async watchRTCStats(connection: RTCPeerConnection) {
    const stats = await connection.getStats();
    this.rtcStats = this.renderRTCStats(stats);

    setTimeout(async () => {
      await this.watchRTCStats(connection);
    }, 1000);
  }

  startHost(players: Array<NetplayPlayer>, conn: PeerConnection) {
    log.info("Starting a rollback host.", conn.peerID, conn.client.clientID);

    this.game = new this.gameClass(this.canvas, players, conn.peerID);

    this.rollbackNetcode = new RollbackNetcode(
      this.game,
      players,
      this.gameClass.timestep,
      (frame, input) => {
        conn.send({ frame, input });
      }
    );

    conn.on("data", (data: InputData) => {
      if (data.input !== undefined) {
        const remotePlayer = this.playerMap.get(conn.peerID)!;
        this.rollbackNetcode!.onRemoteInput(
          data.frame,
          remotePlayer,
          data.input
        );
      } else {
        const remotePlayer = this.playerMap.get(conn.peerID)!;
        this.rollbackNetcode!.onRemoteSync(data.frame, remotePlayer);
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
      this.gameClass.timestep,
      (frame, input) => {
        conn.send({
          type: "input",
          frame,
          input,
        });
      }
    );

    conn.on("data", (data: InputData) => {
      if (data.input !== undefined) {
        const remotePlayer = this.playerMap.get(conn.peerID)!;
        this.rollbackNetcode!.onRemoteInput(
          data.frame,
          remotePlayer,
          data.input
        );
      } else {
        const remotePlayer = this.playerMap.get(conn.peerID)!;
        this.rollbackNetcode!.onRemoteSync(data.frame, remotePlayer);
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
        `;

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
