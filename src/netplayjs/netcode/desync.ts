import type { BlackHole, Input } from "../../Game";

/** Compare only confirmed frames. Every peer runs the same check. */
export class DesyncDetector {
  private local = new Map<number, { hash: string; state: BlackHole[] }>();
  private remote = new Map<number, Map<string, string>>();
  private inputs: { player: string; frame: number; input?: Input }[] = [];
  private pending = Promise.resolve();
  private stopped = false;

  constructor(
    private send: (frame: number, hash: string) => void,
    private fail: (report: unknown) => void,
    private context: { seed: string; players: string[] },
  ) {}

  record(player: string, frame: number, input?: Input) {
    this.inputs.push({ player, frame, input });
    // ponytail: retain 20 checkpoints and their recent inputs; stream to disk for long captures.
    if (this.inputs.length > 12000) this.inputs.shift();
  }

  checkpoint(frame: number, state: BlackHole[]) {
    // Snapshots are immutable. Serialize before asynchronous hashing to preserve that boundary.
    const serialized = JSON.stringify(state);
    this.pending = this.pending.then(async () => {
      if (this.stopped) return;
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(serialized));
      if (this.stopped) return;
      const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
      this.local.set(frame, { hash, state });
      this.compare(frame);
      if (this.stopped) return;
      this.send(frame, hash);
      while (this.local.size > 20) this.local.delete(this.local.keys().next().value!);
      const oldest = this.local.keys().next().value!;
      this.inputs = this.inputs.filter(input => input.frame > oldest);
      for (const tick of this.remote.keys()) if (tick < oldest) this.remote.delete(tick);
    }).catch(error => this.stopWithReport({ error: String(error) }));
    return this.pending;
  }

  receive(peer: string, frame: number, hash: string) {
    if (this.stopped) return;
    if (!this.remote.has(frame)) this.remote.set(frame, new Map());
    this.remote.get(frame)!.set(peer, hash);
    if (this.remote.size > 32) {
      this.stopWithReport({ error: "Too many unmatched checkpoints", peer });
      return;
    }
    this.compare(frame);
  }

  private compare(frame: number) {
    const local = this.local.get(frame);
    if (!local) return;
    for (const [peer, hash] of this.remote.get(frame) || []) {
      if (local.hash !== hash) {
        this.stopWithReport({ frame, peer, localHash: local.hash, remoteHash: hash, state: local.state });
        return;
      }
    }
  }

  private stopWithReport(details: object) {
    if (this.stopped) return;
    this.stopped = true;
    this.fail({ ...this.context, ...details, browser: navigator.userAgent,
      checkpoints: [...this.local].map(([frame, value]) => ({ frame, ...value })), inputs: this.inputs });
  }

  destroy() { this.stopped = true; }
}
