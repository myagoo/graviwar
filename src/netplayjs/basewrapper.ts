import { InputReader } from "./defaultinput";
import { GameConstructor, NetplayPlayer, Wrapper } from "./types";

import * as log from "loglevel";
import Peer, { DataConnection } from "peerjs";

import { assert } from "chai";
import * as QRCode from "qrcode";
import query from "query-string";

export abstract class BaseWrapper implements Wrapper {
  abstract wrapperName: string;
  /** The network stats UI. */
  stats: HTMLDivElement;

  /** The floating menu used to select a match. */
  menu: HTMLDivElement;

  inputReader: InputReader;

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
    console.log(
      channel.ordered,
      channel.maxPacketLifeTime,
      channel.maxRetransmits
    );
    assert.isTrue(
      this.isChannelOrdered(channel),
      "Data Channel must be ordered."
    );
    assert.isTrue(this.isChannelReliable(channel), "Channel must be reliable.");
  }

  constructor(
    public gameClass: GameConstructor,
    public canvas: HTMLCanvasElement,
    public timestep: number
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

    // Create menu UI
    this.menu = document.createElement("div");
    this.menu.style.zIndex = "1";
    this.menu.style.position = "absolute";
    this.menu.style.backgroundColor = "white";
    this.menu.style.padding = "5px";
    this.menu.style.left = "50%";
    this.menu.style.top = "50%";
    this.menu.style.boxShadow = "0px 0px 10px black";
    this.menu.style.transform = "translate(-50%, -50%)";

    document.body.appendChild(this.menu);

    this.inputReader = new InputReader(this.canvas);
  }

  peer?: Peer;

  start() {
    log.info("Creating a PeerJS instance.");
    this.menu.innerHTML = "Connecting to PeerJS...";

    this.peer = new Peer();
    this.peer.on("error", (err) => console.error(err));

    this.peer!.on("open", (id) => {
      // Try to parse the room from the hash. If we find one,
      // we are a client.
      const searchParams = query.parse(window.location.search);
      const isClient = !!searchParams.room;

      if (isClient) {
        // We are a client, so connect to the room from the hash.
        this.menu.style.display = "none";

        log.info(`Connecting to room ${searchParams.room}.`);

        const conn = this.peer!.connect(searchParams.room as string, {
          serialization: "json",
          reliable: true,
          // @ts-ignore
          _payload: {
            // This is a hack to get around a bug in PeerJS
            originator: true,
            reliable: true,
          },
        });

        conn.on("error", (err) => console.error(err));

        // Construct the players array.
        const players = [
          new NetplayPlayer(0, false, true), // Player 0 is our peer, the host.
          new NetplayPlayer(1, true, false), // Player 1 is us, a client
        ];

        this.startClient(players, conn);
      } else {
        // We are host, so we need to show a join link.
        log.info("Showing join link.");

        // Show the join link.
        let joinURL = `${window.location.href}?wrapper=${this.wrapperName}&room=${id}`;
        this.menu.innerHTML = `<div>Join URL (Open in a new window or send to a friend): <a href="${joinURL}">${joinURL}<div>`;

        // Add a QR code for joining.
        const qrCanvas = document.createElement("canvas");
        this.menu.appendChild(qrCanvas);
        QRCode.toCanvas(qrCanvas, joinURL);

        // Construct the players array.
        const players: Array<NetplayPlayer> = [
          new NetplayPlayer(0, true, true), // Player 0 is us, acting as a host.
          new NetplayPlayer(1, false, false), // Player 1 is our peer, acting as a client.
        ];

        // Wait for a connection from a client.
        this.peer!.on("connection", (conn) => {
          // Make the menu disappear.
          this.menu.style.display = "none";
          conn.on("error", (err) => console.error(err));

          this.startHost(players, conn);
        });
      }
    });
  }

  formatRTCStats(stats: RTCStatsReport): string {
    let output = "";
    stats.forEach((report) => {
      output += `<details>`;
      output += `<summary>${report.type}</summary>`;

      Object.keys(report).forEach((key) => {
        if (key !== "type") {
          output += `<div>${key}: ${report[key]}</div> `;
        }
      });

      output += `</details>`;
    });
    return output;
  }

  rtcStats: string = "";
  watchRTCStats(connection: RTCPeerConnection) {
    setInterval(() => {
      connection
        .getStats()
        .then((stats) => (this.rtcStats = this.formatRTCStats(stats)));
    }, 1000);
  }

  abstract startHost(players: Array<NetplayPlayer>, conn: DataConnection): void;
  abstract startClient(
    players: Array<NetplayPlayer>,
    conn: DataConnection
  ): void;

  abstract destroy(): void;
}
