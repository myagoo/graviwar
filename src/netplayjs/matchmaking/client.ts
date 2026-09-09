import log from "loglevel";
import {
  ClientMessage,
  ServerMessage,
} from "./matchmaking-protocol";
import { PeerConnection } from "./peerconnection";
import { TypedEvent } from "./typedevent";

export const DEFAULT_SERVER_URL = import.meta.env.VITE_SIGNALING_SERVER || "https://netplayjs.varunramesh.net";

/**
 * Server URLs are provided using either http:// or https://. We use
 * this URL to connect to any REST endpoints. We can also derive the
 * WebSocket endpoint by changing the protocol to ws:// or wss:// respectively.
 */
function getWebSocketURL(serverURL: string): string {
  const url = new URL(serverURL);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Expected an HTTP(S) signaling URL");
  url.protocol = url.protocol === "http:" ? "ws:" : "wss:";
  return url.href;
}

export class MatchmakingClient {
  /** The URL of the matchmaking server that we are connected to. */
  serverURL: string;

  /** The websocket transport that lets us send messages to the server. */
  ws: WebSocket;

  /**
   * The ID that this client is registed as on the server. This ID is only
   * available after the onRegistered event has been called.
   */
  clientID?: string;

  /**
   * The list of ICE servers that we should forward to WebRTC. This
   * is only set after the onRegistered event has been fired.
   */
  iceServers?: RTCIceServer[];

  /** A map of all the currently active PeerConnections. */
  connections: Map<string, PeerConnection> = new Map();

  /**
   * This event is emitted as result of matchmaking.
   * The server has told us that we should host a public match.
   * */
  onHostMatch: TypedEvent<{ clientIDs: Array<string> }> = new TypedEvent();

  /**
   * This event is emitted as a result of matchmaking.
   * The server has told has that we should join a public match
   * as a client.
   */
  onJoinMatch: TypedEvent<{ hostID: string }> = new TypedEvent();

  /**
   * This event is emitted as soon as a peer tries to establish a connection
   * with us. However, you must still wait until the connection is actually
   * open before sending any data.
   */
  onConnection: TypedEvent<PeerConnection> = new TypedEvent();

  onFailure: TypedEvent<string> = new TypedEvent();

  onRegistered: TypedEvent<string> = new TypedEvent();

  constructor(serverURL: string = DEFAULT_SERVER_URL) {
    this.serverURL = serverURL;

    this.ws = new WebSocket(getWebSocketURL(this.serverURL));
    this.ws.onerror = () => this.onFailure.emit("Cannot reach the signaling server");
    this.ws.onclose = () => this.onFailure.emit("Signaling connection closed");
    this.ws.onmessage = (message) => {
      log.debug(`Server -> Client: ${message.data}`);
      let parsed: ServerMessage;
      try {
        parsed = ServerMessage.parse(JSON.parse(message.data));
      } catch { this.onFailure.emit("Invalid signaling message"); return; }
      try { this.onServerMessage(parsed); }
      catch { this.onFailure.emit("Could not set up the peer connection"); }
    };
  }

  send(msg: ClientMessage) {
    const data = JSON.stringify(msg);
    log.debug(`Client -> Server: ${data}`);
    this.ws.send(data);
  }

  /** THis function handles all messages received from the server. */
  onServerMessage(msg: ServerMessage) {
    if (msg.kind === "server-error" || msg.kind === "send-message-failure" || msg.kind === "match-request-failure") {
      this.onFailure.emit(msg.reason);
    } else if (msg.kind === "registration-success") {
      // If we registered successfully, emit an event.
      this.clientID = msg.clientID;
      this.iceServers = msg.iceServers.flatMap((server: RTCIceServer) => {
        const urls = typeof server.urls === "string" ? [server.urls] : server.urls;
        return urls.flatMap(url => {
          // UDP is TURN's default. Some WebKit builds reject transport queries.
          const candidate = { ...server, urls: url.replace(/^(turn:.*)\?transport=udp$/, "$1") };
          try {
            const probe = new RTCPeerConnection({ iceServers: [candidate] });
            probe.close();
            return [candidate];
          } catch (error) {
            if (error instanceof DOMException && error.name === "SyntaxError") return [];
            throw error;
          }
        });
      });
      this.onRegistered.emit(this.clientID);
    } else if (msg.kind === "peer-message") {
      // We've received a peer message. Check if we already have a
      // matching PeerConnection.
      if (!this.connections.has(msg.sourceID)) {
        // Create the connection and emit it.
        const connection = new PeerConnection(this, msg.sourceID, false);
        this.connections.set(msg.sourceID, connection);
        this.onConnection.emit(connection);
      }

      // Forward the signaling message to our peer.
      this.connections
        .get(msg.sourceID)!
        .onSignalingMessage(msg.type, msg.payload);
    } else if (msg.kind === "host-match") {
      // The server is telling us to host a match.
      this.onHostMatch.emit({
        clientIDs: msg.clientIDs,
      });
    } else if (msg.kind === "join-match") {
      // The server is telling us to join a match.
      this.onJoinMatch.emit({
        hostID: msg.hostID,
      });
    }
  }

  /** Start opening a connection to a peer. */
  connectPeer(peerID: string): PeerConnection {
    const existing = this.connections.get(peerID);
    if (existing && !existing.closed) return existing;
    const connection = new PeerConnection(this, peerID, true);
    this.connections.set(peerID, connection);
    this.onConnection.emit(connection);
    return connection;
  }

  /** Start matchmaking. */
  sendMatchRequest(gameID: string, minPlayers: number, maxPlayers: number) {
    this.send({
      kind: "match-request",
      gameID: gameID,
      minPlayers,
      maxPlayers,
    });
  }

  destroy() {
    this.ws.onclose = null;
    this.ws.onerror = null;
    this.ws.close();
    for (const connection of this.connections.values()) {
      connection.close();
    }
  }
}
