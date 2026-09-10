import { html, render } from "lit-html";
import { z } from "zod";
import { DEFAULT_SERVER_URL, MatchmakingClient } from "../matchmaking/client";
import { PeerConnection } from "../matchmaking/peerconnection";
import { TypedEvent } from "../matchmaking/typedevent";
import { NetplayPlayer } from "../netcode/types";
import { Data, InputData } from "../types";

/** Invitation peers only introduce members. Every member participates in the same start barrier. */
export class GameMenu {
  root = document.createElement("div");
  matchmaker: MatchmakingClient;
  room = "";
  members = new Set<string>();
  ready = new Set<string>();
  prepared = new Set<string>();
  inviting = false;
  searching = false;
  matched = false;
  targetPlayers = 2;
  started = false;
  ended = false;
  message = "Connecting to signaling server…";
  reportURL?: string;
  earlyInputs = new Map<string, InputData[]>();
  onStart = new TypedEvent<{ players: NetplayPlayer[]; seed: string }>();
  onStopped = new TypedEvent<string>();
  private timer?: number;

  constructor() {
    this.root.className = "overlay";
    Object.assign(this.root.style, { zIndex: "2", inset: "10%", background: "#111", overflow: "auto", padding: "20px" });
    document.body.append(this.root);
    const params = new URLSearchParams(location.hash.slice(1));
    this.inviting = params.has("room") || params.has("peer");
    const count = Number(params.get("players") ?? 2);
    this.targetPlayers = Number.isInteger(count) && count >= 2 && count <= 16 ? count : 2;
    this.matchmaker = new MatchmakingClient(params.get("server") || DEFAULT_SERVER_URL);
    this.matchmaker.onConnection.on(conn => this.attach(conn));
    this.matchmaker.onFailure.on(reason => { if (!this.started) this.stop(reason); });
    this.matchmaker.onRegistered.once(id => {
      const room = params.get("room");
      const contact = params.get("peer") || room;
      if ((room && !z.string().uuid().safeParse(room).success) || (contact && !z.string().uuid().safeParse(contact).success)) {
        this.stop("Invalid invitation"); return;
      }
      this.room = room || id;
      this.members.add(id);
      this.message = this.inviting ? "Share the link. Once everyone joins, each player presses Ready." : "Choose your player count, then find opponents or invite friends.";
      if (contact && contact !== id) this.matchmaker.connectPeer(contact);
      this.render();
    });
    this.matchmaker.onHostMatch.once(({ clientIDs }) => {
      // Matched peers initiate their invitation connection; avoid simultaneous offers.
      if (!this.searching || clientIDs.length + 1 !== this.targetPlayers) { this.stop("Matchmaker returned an unexpected group size"); return; }
      this.matched = true;
      this.message = "Group found. Connecting every player…";
      this.addMembers(clientIDs); this.render();
    });
    this.matchmaker.onJoinMatch.once(({ hostID }) => {
      if (!this.searching) { this.stop("Unexpected matchmaking assignment"); return; }
      this.matched = true;
      this.message = "Group found. Connecting every player…";
      this.room = hostID;
      this.matchmaker.connectPeer(hostID);
    });
    this.render();
  }

  roster() { return [...this.members].sort(); }
  sameRoster(ids: string[]) { return JSON.stringify(ids) === JSON.stringify(this.roster()); }
  connected() {
    return this.roster().every(id => id === this.matchmaker.clientID || this.matchmaker.connections.get(id)?.dataChannel?.readyState === "open");
  }
  broadcast(data: Data) {
    for (const id of this.members) this.matchmaker.connections.get(id)?.send(data);
  }
  hello() { this.broadcast({ type: "hello", room: this.room, members: this.roster() }); }

  attach(conn: PeerConnection) {
    if (!this.started && !this.ended && !this.prepared.has(this.matchmaker.clientID!)) this.addMembers([conn.peerID]);
    conn.on("open", () => {
      if (this.started || this.ended || !this.members.has(conn.peerID)) {
        conn.send({ type: "reject", reason: "This match's roster is already closed" });
        return;
      }
      conn.send({ type: "hello", room: this.room, members: this.roster() });
      this.maybeStart();
      this.render();
    });
    conn.on("data", (data: Data) => this.receive(conn, data));
    conn.onClose.on(() => {
      if (this.members.has(conn.peerID)) this.stop("A peer disconnected. Return to the menu to form a new match.");
    });
    this.timer ??= window.setInterval(() => {
      if (!this.started && !this.ended && !this.connected()) this.render();
    }, 1000);
  }

  addMembers(ids: string[]) {
    const changed = ids.some(id => !this.members.has(id));
    if (!changed) return;
    if (this.prepared.has(this.matchmaker.clientID!)) return;
    for (const id of ids) this.members.add(id);
    if (this.members.size > this.targetPlayers) { this.stop("Room exceeds the selected player count"); return; }
    this.ready.clear();
    this.prepared.clear();
    this.message = this.searching ? "Group found. Connecting and synchronizing every player…" : "Roster changed. Every player must confirm Ready again.";
    this.hello();
  }

  receive(conn: PeerConnection, data: Data) {
    if (this.ended) return;
    if (data.type === "reject") { this.stop(data.reason); return; }
    if (data.type === "input") {
      if (!this.started && this.prepared.has(this.matchmaker.clientID!)) {
        const pending = this.earlyInputs.get(conn.peerID) || [];
        if (pending.length >= 2000) { this.stop("Startup input buffer exceeded"); return; }
        pending.push(data);
        this.earlyInputs.set(conn.peerID, pending);
      }
      return;
    }
    if (data.type === "visibility-state" || data.type === "checksum") return;
    if (data.room !== this.room || !data.members.includes(conn.peerID)) {
      conn.send({ type: "reject", reason: "Room agreement failed" }); return;
    }
    if (this.started) {
      if (data.type === "hello" && !this.sameRoster(data.members)) conn.send({ type: "reject", reason: "Match already started" });
      return;
    }
    if (data.type === "hello") {
      this.addMembers(data.members);
      for (const id of this.members) {
        // One initiator per pair avoids simultaneous WebRTC offers.
        if (this.matchmaker.clientID! < id && !this.matchmaker.connections.has(id)) this.matchmaker.connectPeer(id);
      }
      if (this.ready.has(this.matchmaker.clientID!)) conn.send({ type: "ready", room: this.room, members: this.roster() });
      if (this.prepared.has(this.matchmaker.clientID!)) conn.send({ type: "prepared", room: this.room, members: this.roster() });
    } else if (this.sameRoster(data.members) && this.members.has(conn.peerID)) {
      if (data.type === "ready") this.ready.add(conn.peerID);
      if (data.type === "prepared") { this.ready.add(conn.peerID); this.prepared.add(conn.peerID); }
    }
    this.maybeStart();
    this.render();
  }

  markReady() {
    if (!this.connected() || this.members.size !== this.targetPlayers || this.ended || this.started) return;
    this.ready.add(this.matchmaker.clientID!);
    this.broadcast({ type: "ready", room: this.room, members: this.roster() });
    this.maybeStart();
    this.render();
  }

  maybeStart() {
    if (this.started || this.ended || !this.connected() || this.members.size !== this.targetPlayers) return;
    const ids = this.roster();
    if (this.searching) {
      if (!this.matched || ids.length !== this.targetPlayers) return;
      if (!this.ready.has(this.matchmaker.clientID!)) {
        this.ready.add(this.matchmaker.clientID!);
        this.broadcast({ type: "ready", room: this.room, members: ids });
      }
    }
    if (!ids.every(id => this.ready.has(id))) return;
    const localID = this.matchmaker.clientID!;
    if (!this.prepared.has(localID)) {
      this.prepared.add(localID);
      this.broadcast({ type: "prepared", room: this.room, members: ids });
    }
    if (!ids.every(id => this.prepared.has(id))) return;
    this.started = true;
    const players: NetplayPlayer[] = ids.map(id => id === localID ? { id, isLocal: true } : { id, isLocal: false, conn: this.matchmaker.connections.get(id)! });
    this.onStart.emit({ players, seed: this.room });
  }

  stop(reason: string) {
    if (this.ended) return;
    this.ended = true;
    this.message = reason;
    this.onStopped.emit(reason);
    this.matchmaker.destroy();
    this.render();
  }

  getJoinURL() {
    const url = new URL(location.href);
    url.searchParams.set("wrapper", "rollback");
    url.hash = new URLSearchParams({ room: this.room, peer: this.matchmaker.clientID!, server: this.matchmaker.serverURL, players: String(this.targetPlayers) }).toString();
    return url.href;
  }

  render() {
    this.root.style.display = this.started && !this.ended ? "none" : "block";
    render(html`<h1>${this.searching ? "Matchmaking" : this.inviting ? "Invite friends" : "Multiplayer"}</h1><p role="status">${this.message}</p>
      ${!this.searching && !this.inviting && !this.ended ? html`
        <label>Total players (including you)
          <select .value=${String(this.targetPlayers)} @change=${(event: Event) => { this.targetPlayers = Number((event.target as HTMLSelectElement).value); }}>
            ${Array.from({ length: 15 }, (_, i) => i + 2).map(count => html`<option value=${count}>${count} players</option>`)}
          </select>
        </label>
        <p>Play with random people or share a private invitation.</p>
        <button ?disabled=${!this.matchmaker.clientID} @click=${() => {
          if (this.searching || !Number.isInteger(this.targetPlayers) || this.targetPlayers < 2 || this.targetPlayers > 16) return;
          this.searching = true;
          this.message = `Looking for ${this.targetPlayers - 1} other players for a ${this.targetPlayers}-player match…`;
          this.matchmaker.sendMatchRequest(`${location.origin}${location.pathname}:battle-royale-v9:${this.targetPlayers}`, this.targetPlayers, this.targetPlayers);
          this.render();
        }}>Matchmaking</button>
        <button ?disabled=${!this.matchmaker.clientID} @click=${() => {
          this.inviting = true;
          this.message = "Share the link. Once everyone joins, each player presses Ready.";
          this.render();
        }}>Invite friends</button>
      ` : ""}
      ${this.searching && !this.ended ? html`
        <p>Match size: ${this.targetPlayers} players</p>
        ${this.matched ? html`<p>Group found · Connected: ${this.roster().filter(id => id === this.matchmaker.clientID || this.matchmaker.connections.get(id)?.dataChannel?.readyState === "open").length}/${this.targetPlayers}</p>` : html`<p>Waiting for a complete group with the same player count.</p>`}
        <button @click=${() => this.stop("Matchmaking cancelled.")}>Cancel matchmaking</button>
      ` : ""}
      ${this.matchmaker.clientID && !this.ended && this.inviting ? html`
        <p>Players: ${this.members.size}/${this.targetPlayers} · Ready: ${this.ready.size}</p>
        <p>${this.connected() ? "All peer connections open" : "Connecting every peer…"}</p>
        <a href=${this.getJoinURL()}>Invite link</a>
        <ul>${this.roster().map(id => html`<li>${id === this.matchmaker.clientID ? "You" : id} ${this.ready.has(id) ? "✓ ready" : ""}</li>`)}</ul>
        <button ?disabled=${!this.connected() || this.members.size !== this.targetPlayers || this.ready.has(this.matchmaker.clientID)} @click=${() => this.markReady()}>Ready</button>
      ` : ""}${this.reportURL ? html`<p><a href=${this.reportURL} download="graviwar-desync.json">Download desync report</a></p>` : ""}<p><a href=${location.pathname}>Back to menu</a></p>`, this.root);
  }

  destroy() {
    this.ended = true;
    if (this.timer) clearInterval(this.timer);
    if (this.reportURL) URL.revokeObjectURL(this.reportURL);
    this.root.remove();
    this.matchmaker.destroy();
  }
}
