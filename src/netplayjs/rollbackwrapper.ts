import { Data } from "./types";
import { DesyncDetector } from "./netcode/desync";
import { Game } from "../Game";
import { TypedEvent } from "./matchmaking/typedevent";
import { RollbackNetcode } from "./netcode/rollback";
import { NetplayPlayer } from "./netcode/types";
import { GameMenu } from "./ui/gamemenu";

export interface Stats {
  historySize: number;
  frameNumber: number;
  largestFutureSize: number;
}
export class RollbackWrapper {
  localPlayerId?: number | string;
  roomId?: string;
  playerMap = new Map<string | number, NetplayPlayer>();
  drawRequestId?: number;
  rollbackNetcode?: RollbackNetcode;
  gameMenu?: GameMenu;
  onStatsUpdated = new TypedEvent<Stats>();
  onPeerPaused = new TypedEvent<void>();
  onPeerResumed = new TypedEvent<void>();
  private desync?: DesyncDetector;
  private hiddenPeers = new Set<string | number>();

  constructor(public game: Game) {}

  start() {
    this.gameMenu = new GameMenu();
    this.gameMenu.onStopped.on(() => this.stopLoops());
    this.gameMenu.onStart.once(({ players, seed }) => {
      this.localPlayerId = players.find(player => player.isLocal)!.id;
      this.roomId = seed;
      this.playerMap = new Map(players.map(player => [player.id, player]));
      this.game.start(players, seed);
      this.desync = new DesyncDetector(
        (frame, hash) => this.broadcast({ type: "checksum", frame, hash }),
        report => {
          this.gameMenu!.reportURL = URL.createObjectURL(new Blob([JSON.stringify(report)], { type: "application/json" }));
          this.gameMenu!.stop("Confirmed states disagree. Download the desync report before returning to the menu.");
        },
        { seed, players: players.map(player => String(player.id)) },
      );
      this.rollbackNetcode = new RollbackNetcode(this.game, players, (frame, input) => {
        this.desync!.record(String(this.localPlayerId), frame, input);
        this.broadcast({ type: "input", frame, input, playerID: this.localPlayerId! });
      }, (frame, state) => this.desync!.checkpoint(frame, state));
      for (const player of players) {
        if (player.isLocal) continue;
        const receive = (data: Data) => {
          // Bind identity to the established connection, never a claimed payload ID.
          if (data.type === "input") {
            this.desync!.record(String(player.id), data.frame, data.input);
            this.rollbackNetcode!.queueRemoteInput(data.frame, player, data.input, data.receivedFrame);
          } else if (data.type === "checksum") {
            this.desync!.receive(String(player.id), data.frame, data.hash);
          } else if (data.type === "visibility-state") {
            if (data.value === "hidden") this.hiddenPeers.add(player.id);
            else this.hiddenPeers.delete(player.id);
            if (this.hiddenPeers.size) this.onPeerPaused.emit(); else this.onPeerResumed.emit();
          }
        };
        player.conn.on("data", receive);
        for (const pending of this.gameMenu!.earlyInputs.get(String(player.id)) || []) receive(pending);
      }
      this.gameMenu!.earlyInputs.clear();
      document.addEventListener("visibilitychange", this.visibilityChanged);
      this.visibilityChanged();
      this.rollbackNetcode.start();
      const draw = (timestamp: number) => {
        const netcode = this.rollbackNetcode!;
        this.game.draw(timestamp, netcode.currentFrame());
        this.onStatsUpdated.emit({ historySize: netcode.history.length, frameNumber: netcode.currentFrame(), largestFutureSize: netcode.largestFutureSize() });
        this.drawRequestId = requestAnimationFrame(draw);
      };
      this.drawRequestId = requestAnimationFrame(draw);
    });
  }

  private broadcast(data: Data) {
    for (const player of this.playerMap.values()) if (!player.isLocal) {
      player.conn.send(data.type === "input" ? {
        ...data, receivedFrame: this.rollbackNetcode?.highestFrameReceived.get(player) ?? 0,
      } : data);
    }
  }
  private visibilityChanged = () => this.broadcast({ type: "visibility-state", value: document.visibilityState, playerID: this.localPlayerId! });
  private stopLoops() {
    this.desync?.destroy();
    this.rollbackNetcode?.destroy();
    if (this.drawRequestId) cancelAnimationFrame(this.drawRequestId);
    document.removeEventListener("visibilitychange", this.visibilityChanged);
  }
  destroy() {
    this.stopLoops();
    this.gameMenu?.destroy();
    this.game.destroy();
  }
}
