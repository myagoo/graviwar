import { PeerConnection } from "../matchmaking/peerconnection";

/**
 * A NetplayPlayer object represents one player in a game.
 */
export interface LocalPlayer {
  id: string | number;
  isLocal: true;
}

export interface RemotePlayer {
  id: string | number;
  isLocal: false;
  conn: PeerConnection;
}

export type NetplayPlayer = LocalPlayer | RemotePlayer;
