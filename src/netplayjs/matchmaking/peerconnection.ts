import EventEmitter from "eventemitter3";
import { Data, DataSchema } from "../types";
import { MatchmakingClient } from "./client";
import { MessageType } from "./matchmaking-protocol";
import { TypedEvent } from "./typedevent";

/** A reliable, ordered connection. Signaling is serialized; candidates may precede SDP. */
export class PeerConnection extends EventEmitter {
  peerConnection: RTCPeerConnection;
  dataChannel?: RTCDataChannel;
  onClose = new TypedEvent<void>();
  closed = false;
  private signaling = Promise.resolve();
  private candidates: RTCIceCandidateInit[] = [];

  constructor(public client: MatchmakingClient, public peerID: string, initiator: boolean) {
    super();
    this.peerConnection = new RTCPeerConnection({ iceServers: client.iceServers });
    window.addEventListener("beforeunload", this.close);
    this.peerConnection.onicecandidate = ({ candidate }) => {
      if (!this.closed) this.client.send({ kind: "send-message", type: "candidate", destinationID: peerID, payload: candidate });
    };
    this.peerConnection.onconnectionstatechange = () => {
      if (["disconnected", "failed", "closed"].includes(this.peerConnection.connectionState)) this.close();
    };
    if (initiator) {
      this.peerConnection.onnegotiationneeded = async () => {
        try {
          await this.peerConnection.setLocalDescription(await this.peerConnection.createOffer());
          this.client.send({ kind: "send-message", type: "offer", destinationID: peerID, payload: this.peerConnection.localDescription });
        } catch { this.close(); }
      };
      this.setDataChannel(this.peerConnection.createDataChannel("data", { ordered: true }));
    } else {
      this.peerConnection.ondatachannel = ({ channel }) => this.setDataChannel(channel);
    }
  }

  close = () => {
    if (this.closed) return;
    this.closed = true;
    window.removeEventListener("beforeunload", this.close);
    this.peerConnection.close();
    this.dataChannel?.close();
    this.onClose.emit();
  };

  setDataChannel(channel: RTCDataChannel) {
    this.dataChannel = channel;
    channel.onopen = () => this.emit("open");
    channel.onmessage = ({ data }) => {
      try {
        if (typeof data !== "string" || data.length > 65536) throw new Error("Invalid data size");
        const message = DataSchema.parse(JSON.parse(data));
        this.emit("data", message);
      } catch { this.close(); }
    };
    channel.onclose = this.close;
    channel.onerror = this.close;
  }

  onSignalingMessage(type: MessageType, payload: unknown) {
    this.signaling = this.signaling.then(async () => {
      if (this.closed) return;
      if (type === "candidate") {
        if (this.peerConnection.remoteDescription) await this.peerConnection.addIceCandidate(payload as RTCIceCandidateInit);
        else this.candidates.push(payload as RTCIceCandidateInit);
        return;
      }
      await this.peerConnection.setRemoteDescription(payload as RTCSessionDescriptionInit);
      for (const candidate of this.candidates.splice(0)) await this.peerConnection.addIceCandidate(candidate);
      if (type === "offer") {
        await this.peerConnection.setLocalDescription(await this.peerConnection.createAnswer());
        this.client.send({ kind: "send-message", type: "answer", destinationID: this.peerID, payload: this.peerConnection.localDescription });
      }
    }).catch(() => this.close());
    return this.signaling;
  }

  send(data: Data) {
    if (this.dataChannel?.readyState !== "open") return;
    const encoded = JSON.stringify(data);
    this.dataChannel.send(encoded);
  }
}
