import { toCanvas } from "qrcode";
import { encodeInvitationSettings, decodeInvitationSettings, DEFAULT_MULTIPLAYER_SETTINGS, INVITE_SETTINGS_KEY, loadSoloSettings, settingsSections, soloSettingsSchema, type SoloSettings } from "../../solo-settings";
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
  editingSettings = false;
  inviting = false;
  private joiningInvitation = false;
  searching = false;
  matched = false;
  targetPlayers = 2;
  settings = loadSoloSettings(INVITE_SETTINGS_KEY, DEFAULT_MULTIPLAYER_SETTINGS);
  get rules() { return JSON.stringify({ build: import.meta.env.VITE_COMMIT_HASH, players: this.targetPlayers, settings: this.settings }); }
  started = false;
  ended = false;
  message = "Connecting…";
  reportURL?: string;
  earlyInputs = new Map<string, InputData[]>();
  onStart = new TypedEvent<{ players: NetplayPlayer[]; seed: string; settings: SoloSettings }>();
  onStopped = new TypedEvent<string>();
  private timer?: number;

  constructor() {
    this.root.className = "setup-page multiplayer-page menu-ui";
    document.body.append(this.root);
    const params = new URLSearchParams(location.hash.slice(1));
    this.inviting = params.has("room") || params.has("peer");
    this.joiningInvitation = this.inviting;
    const count = Number(params.get("players") ?? 2);
    this.targetPlayers = Number.isInteger(count) && count >= 2 && count <= 16 ? count : 2;
    this.matchmaker = new MatchmakingClient(params.get("server") || DEFAULT_SERVER_URL);
    this.matchmaker.onConnection.on(conn => this.attach(conn));
    this.matchmaker.onFailure.on(reason => { if (!this.started) this.stop(reason); });
    this.matchmaker.onRegistered.once(id => {
      if (this.inviting) {
        if (params.get("build") !== import.meta.env.VITE_COMMIT_HASH) { this.stop("Invitation requires a different game version. Update the game and request a new link."); return; }
        try {
          const encoded = params.get("settings");
          if (!Number.isInteger(count) || count < 2 || count > 16 || !encoded || encoded.length > 8000) throw new Error();
          this.settings = decodeInvitationSettings(encoded);
        } catch { this.stop("Invalid invitation settings. Request a new link."); return; }
      }
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
  hello() { this.broadcast({ type: "hello", room: this.room, members: this.roster(), rules: this.rules }); }

  attach(conn: PeerConnection) {
    if (!this.started && !this.ended && !this.prepared.has(this.matchmaker.clientID!)) this.addMembers([conn.peerID]);
    conn.on("open", () => {
      if (this.started || this.ended || !this.members.has(conn.peerID)) {
        conn.send({ type: "reject", reason: "This match's roster is already closed" });
        return;
      }
      conn.send({ type: "hello", room: this.room, members: this.roster(), rules: this.rules });
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
    if (data.rules !== this.rules) {
      conn.send({ type: "reject", reason: "Game version or settings differ. Rejoin using the same invitation link." });
      this.stop("Game version or settings differ. Rejoin using the same invitation link."); return;
    }
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
      if (this.ready.has(this.matchmaker.clientID!)) conn.send({ type: "ready", room: this.room, members: this.roster(), rules: this.rules });
      if (this.prepared.has(this.matchmaker.clientID!)) conn.send({ type: "prepared", room: this.room, members: this.roster(), rules: this.rules });
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
    this.broadcast({ type: "ready", room: this.room, members: this.roster(), rules: this.rules });
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
        this.broadcast({ type: "ready", room: this.room, members: ids, rules: this.rules });
      }
    }
    if (!ids.every(id => this.ready.has(id))) return;
    const localID = this.matchmaker.clientID!;
    if (!this.prepared.has(localID)) {
      this.prepared.add(localID);
      this.broadcast({ type: "prepared", room: this.room, members: ids, rules: this.rules });
    }
    if (!ids.every(id => this.prepared.has(id))) return;
    this.started = true;
    const players: NetplayPlayer[] = ids.map(id => id === localID ? { id, isLocal: true } : { id, isLocal: false, conn: this.matchmaker.connections.get(id)! });
    this.onStart.emit({ players, seed: this.room, settings: this.settings });
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
    url.hash = new URLSearchParams({ room: this.room, peer: this.matchmaker.clientID!, server: this.matchmaker.serverURL, players: String(this.targetPlayers), build: import.meta.env.VITE_COMMIT_HASH, settings: encodeInvitationSettings(this.settings) }).toString();
    return url.href;
  }

  render() {
    const settingsLocked = this.joiningInvitation || this.members.size > 1 || this.ready.size > 0;
    this.root.style.display = this.started && !this.ended ? "none" : "block";
    render(html`<main class="setup-card multiplayer-card menu-card"><header class="menu-header">${this.editingSettings ? html`<button class="menu-back" aria-label="Back to invitation" @click=${() => { this.editingSettings = false; this.render(); }}>←</button>` : html`<a class="menu-back" aria-label=${this.inviting || this.searching || this.ended ? "Back to multiplayer" : "Back to menu"} href=${this.inviting || this.searching || this.ended ? `${location.pathname}?wrapper=rollback` : location.pathname}>←</a>`}<h1>${this.editingSettings ? "Invitation settings" : this.searching ? "Matchmaking" : this.inviting ? "Invite friends" : "Multiplayer"}</h1></header>${!this.editingSettings || this.ended ? html`<p class="multiplayer-status" role="status">${this.message}</p>` : ""}
      ${!this.searching && !this.inviting && !this.ended ? html`
        <label class="multiplayer-count">Total players (including you)
          <select .value=${String(this.targetPlayers)} @change=${(event: Event) => { this.targetPlayers = Number((event.target as HTMLSelectElement).value); }}>
            ${Array.from({ length: 15 }, (_, i) => i + 2).map(count => html`<option value=${count}>${count} players</option>`)}
          </select>
        </label>
        <p>Choose who you play with.</p>
        <div class="multiplayer-choices"><button class="multiplayer-choice" aria-label="Matchmaking" ?disabled=${!this.matchmaker.clientID} @click=${() => {
          if (this.searching || !Number.isInteger(this.targetPlayers) || this.targetPlayers < 2 || this.targetPlayers > 16) return;
          this.settings = { ...DEFAULT_MULTIPLAYER_SETTINGS };
          this.searching = true;
          this.message = `Looking for ${this.targetPlayers - 1} other players for a ${this.targetPlayers}-player match…`;
          this.matchmaker.sendMatchRequest(`${location.origin}${location.pathname}:battle-royale-v23:${import.meta.env.VITE_COMMIT_HASH}:${this.targetPlayers}`, this.targetPlayers, this.targetPlayers);
          this.render();
        }}><strong>Matchmaking</strong><span>Find opponents · default rules</span></button>
        <button class="multiplayer-choice" aria-label="Invite friends" ?disabled=${!this.matchmaker.clientID} @click=${() => {
          const parsed = soloSettingsSchema.safeParse(this.settings);
          if (!parsed.success) {
            this.message = parsed.error.issues[0].message;
            this.render(); return;
          }
          this.settings = parsed.data;
          this.inviting = true;
          this.message = "Share the link. Once everyone joins, each player presses Ready.";
          this.render();
        }}><strong>Invite friends</strong><span>Private match · your rules</span></button></div>
      ` : ""}
      ${this.inviting && !this.searching && !this.ended && !this.editingSettings ? html`<button @click=${() => { this.editingSettings = true; this.render(); }}>Custom invitation settings</button>` : ""}
      ${this.editingSettings && !this.ended ? html`<section class="multiplayer-settings">
          <p>${settingsLocked ? "These are the shared invitation rules. Create a new invitation to change them." : "Configure your invitation before sharing the link. Settings lock when another player joins. Public matchmaking uses defaults."}</p>
          ${settingsSections.map(section => html`<details class="settings-section"><summary>${section.label}</summary>
          <div class="setup-fields">${section.fields.map(field => html`<label>
            <span class="setup-slider-label">${field.label}<output>${this.settings[field.key]}</output></span>
            <input type="range" aria-label=${field.label} min=${field.min} max=${field.max} step=${field.step}
              .value=${String(this.settings[field.key])} ?disabled=${settingsLocked || field.key === "shrinkSeconds" && !this.settings.arenaShrinks}
              @input=${(event: Event) => {
                const value = Number((event.target as HTMLInputElement).value);
                this.settings = { ...this.settings, [field.key]: value,
                  ...(field.key === "minBodyRadius" ? { maxBodyRadius: Math.max(value, this.settings.maxBodyRadius) } : {}),
                  ...(field.key === "maxBodyRadius" ? { minBodyRadius: Math.min(value, this.settings.minBodyRadius) } : {}),
                };
                this.saveSettings();this.render();
              }} />
          </label>`)}</div>
          ${section.label === "Arena" ? html`<label class="setup-checkbox"><input type="checkbox" ?disabled=${settingsLocked} .checked=${this.settings.arenaShrinks} @change=${(event: Event) => {
            this.settings = { ...this.settings, arenaShrinks: (event.target as HTMLInputElement).checked };this.saveSettings();this.render();
          }} />Shrink arena over time</label>` : ""}
          </details>`)}
          <button ?disabled=${settingsLocked} @click=${() => { this.settings = { ...DEFAULT_MULTIPLAYER_SETTINGS };this.saveSettings();this.render(); }}>Reset invitation defaults</button>
        </section>
      ` : ""}
      ${this.searching && !this.ended ? html`
        <div class="matchmaking-progress" aria-hidden="true">◌</div><p class="multiplayer-countdown">Match size: ${this.targetPlayers} players</p>
        ${this.matched ? html`<p>Group found · Connected: ${this.roster().filter(id => id === this.matchmaker.clientID || this.matchmaker.connections.get(id)?.dataChannel?.readyState === "open").length}/${this.targetPlayers}</p>` : html`<p>Waiting for a complete group with the same player count.</p>`}
        <button @click=${() => this.stop("Matchmaking cancelled.")}>Cancel matchmaking</button>
      ` : ""}
      ${this.matchmaker.clientID && !this.ended && !this.started && !this.editingSettings && this.inviting ? html`
        <section class="invitation-players" aria-label="Players in lobby">
          <h2>Lobby</h2>
          <p class="lobby-count">Players: ${this.members.size}/${this.targetPlayers} · Ready: ${this.ready.size}</p>
          <p class="lobby-connection">${this.connected() && this.members.size === this.targetPlayers ? "All players connected" : this.members.size < this.targetPlayers ? "Waiting for more players…" : "Connecting players…"}</p>
          <ul class="lobby-roster">${this.roster().map((id, index) => html`<li><span>${id === this.matchmaker.clientID ? "You" : `Player ${index + 1}`}</span><span class=${this.ready.has(id) ? "player-ready" : "player-waiting"}>${this.ready.has(id) ? "Ready" : "Not ready"}</span></li>`)}</ul>
          <button class="lobby-ready setup-start" ?disabled=${!this.connected() || this.members.size !== this.targetPlayers || this.ready.has(this.matchmaker.clientID)} @click=${() => this.markReady()}>Ready</button>
        </section>
        <section class="invitation-share" aria-label="Share invitation">
          <div><h2>Bring your friends</h2><p>Send the link or scan the code to join with the same rules.</p>
          <a class="invitation-link" href=${this.getJoinURL()}>Invite link</a>
          <button class="copy-invitation" @click=${async () => {
            try { await navigator.clipboard.writeText(this.getJoinURL()); this.message = "Invitation link copied."; }
            catch { this.message = "Could not copy. Press and hold the invitation link to copy it."; }
            this.render();
          }}>Copy link</button></div>
          <canvas class="invitation-qr" role="img" aria-label="Invitation QR code"></canvas>
          <p class="invitation-qr-error" role="status" hidden></p>
        </section>
      ` : ""}${this.reportURL ? html`<p><a href=${this.reportURL} download="graviwar-desync.json">Download desync report</a></p>` : ""}</main>`, this.root);
    const canvas = this.root.querySelector<HTMLCanvasElement>(".invitation-qr");
    if (canvas && canvas.dataset.url !== this.getJoinURL()) {
      const url = this.getJoinURL();
      toCanvas(canvas, url, { errorCorrectionLevel: "L", margin: 4, scale: 4 }, error => {
        // Keep bitmap resolution, but let responsive CSS size the displayed QR.
        canvas.style.removeProperty("width");
        canvas.style.removeProperty("height");
        canvas.hidden = !!error;
        const message = this.root.querySelector<HTMLElement>(".invitation-qr-error")!;
        message.hidden = !error;
        message.textContent = error ? "QR code unavailable. Use the invitation link above." : "";
        if (!error) canvas.dataset.url = url;
      });
    }
  }

  private saveSettings() {
    try { localStorage.setItem(INVITE_SETTINGS_KEY, JSON.stringify(this.settings)); }
    catch { this.message = "Settings apply to this invitation, but could not be saved in this browser."; }
  }

  destroy() {
    this.ended = true;
    if (this.timer) clearInterval(this.timer);
    if (this.reportURL) URL.revokeObjectURL(this.reportURL);
    this.root.remove();
    this.matchmaker.destroy();
  }
}
