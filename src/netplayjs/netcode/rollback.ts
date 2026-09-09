/**
 * Rollback netcode is an effective netcode algorithm for multiplayer games which allows
 * all players to have lag-free control of their own character, at the expense of
 * artifacting for remote characters. This is the most common algorithm used in
 * fighting games.
 *
 * The algorithm works as follows:
 * - All clients simulate the same numbered frames.
 * - When a client simulates a frame F, it uses it's own local input, but makes a guess as to what
 *   actions the remote players have taken. The client sends it's local input to all other players.
 * - When a remote player's input for frame F arrives, we rewind the state of the game to F - 1,
 *   and replay forward with the correct input from frame F.
 *
 * Resources:
 * - RetroArch Netplay Implementation: https://github.com/libretro/RetroArch/tree/v1.9.0/network/netplay
 */

import { get, shift } from "../utils";
import { NetplayPlayer } from "./types";
import { Game, Input, BlackHole } from "../../Game";

import * as log from "loglevel";

import { assert } from "chai";
import { DEV } from "../debugging";

class RollbackHistory {
  /**
   * The frame number that this history entry represents.
   */
  frame: number;

  /**
   * The serialized state of the game at this frame.
   */
  state: BlackHole[];

  /**
   * These inputs represent the set of inputs that produced this state
   * from the previous state.
   * Eg: history[n].state = history[n - 1].state.tick(history[n].inputs)
   */
  inputs: Map<
    NetplayPlayer,
    { input: Input | undefined; isPrediction: boolean }
  >;

  constructor(
    frame: number,
    state: BlackHole[],
    inputs: Map<
      NetplayPlayer,
      { input: Input | undefined; isPrediction: boolean }
    >
  ) {
    this.frame = frame;
    this.state = state;
    this.inputs = inputs;
  }

  isPlayerInputPredicted(player: NetplayPlayer) {
    return get(this.inputs, player).isPrediction;
  }

  anyInputPredicted(): boolean {
    for (const { isPrediction } of this.inputs.values()) {
      if (isPrediction) return true;
    }
    return false;
  }

  allInputsSynced(): boolean {
    return !this.anyInputPredicted();
  }
}

export class RollbackNetcode {
  tickIntervalId?: number;

  /**
   * The rollback history buffer.
   */
  history: Array<RollbackHistory>;

  /**
   * Inputs from other players that have already arrived, but have not been
   * applied due to our simulation being behind.
   */
  future: Map<
    NetplayPlayer,
    Array<{ frame: number; input: Input }>
  >;

  highestFrameReceived: Map<NetplayPlayer, number>;

  framesSinceLastBroadcast: number = 0;
  SYNC_FRAME_THRESHOLD: number = 6;

  private inbox: { frame: number; player: NetplayPlayer; input?: Input }[] = [];
  private batching = false;
  private dirtyFrame?: number;
  private lastCheckpoint = -1;
  private paceCounter = 0;
  private frameAdvantages = new Map<NetplayPlayer, number>();

  constructor(
    private game: Game,
    private players: Array<NetplayPlayer>,
    private broadcastInput: (
      frame: number,
      input: Input | undefined
    ) => void,
    private onCheckpoint?: (frame: number, state: BlackHole[]) => void
  ) {
    this.game = game;
    this.players = players;
    this.broadcastInput = broadcastInput;

    const initialInputs = new Map();
    for (const player of this.players) {
      initialInputs.set(player, { input: undefined, isPrediction: false });
    }
    this.history = [
      new RollbackHistory(0, this.game.getFrozenSnapshot(), initialInputs),
    ];

    this.future = new Map();
    this.highestFrameReceived = new Map();
    for (let player of this.players) {
      this.future.set(player, []);
      this.highestFrameReceived.set(player, 0);
    }
  }

  currentFrame(): number {
    DEV && assert.isNotEmpty(this.history, `'history' cannot be empty.`);
    return this.history[this.history.length - 1].frame;
  }

  largestFutureSize(): number {
    return Math.max(...Array.from(this.future.values()).map((a) => a.length));
  }

  tick() {
    this.flushRemoteInputs();
    this.garbageCollectHistory();
    // The first retained state is confirmed, not merely the oldest allocation.
    if (this.currentFrame() - this.history[0].frame >= 180) return;
    DEV && assert.isNotEmpty(this.history, `'history' cannot be empty.`);

    // Get the most recent state.
    const lastState = this.history[this.history.length - 1];

    // Construct the new map of inputs for this frame.
    const newInputs: Map<
      NetplayPlayer,
      { input: Input | undefined; isPrediction: boolean }
    > = new Map();
    for (const player of lastState.inputs.keys()) {
      if (player.isLocal) {
        let localInput = this.game.flushInputBuffer();

        // Local player gets the local input.
        newInputs.set(player, { input: localInput, isPrediction: false });

        // Broadcast the input to the other players.
        if (localInput !== undefined) {
          this.broadcastInput(lastState.frame + 1, localInput);
          this.framesSinceLastBroadcast = 0;
        } else {
          this.framesSinceLastBroadcast++;
          if (this.framesSinceLastBroadcast >= this.SYNC_FRAME_THRESHOLD) {
            this.broadcastInput(lastState.frame + 1, undefined);
            this.framesSinceLastBroadcast = 0;
          }
        }
      } else {
        if (get(this.future, player)[0]?.frame === lastState.frame + 1) {
          // If we have already recieved the player's input (due to our)
          // simulation being behind, then use that input.
          let future = shift(get(this.future, player));
          // DEV && assert.equal(lastState.frame + 1, future.frame);
          newInputs.set(player, {
            input: future.input,
            isPrediction: false,
          });
        } else {
          // Expulsion is a one-shot action; predict no input.
          newInputs.set(player, {
            input: undefined,
            isPrediction: lastState.frame + 1 > get(this.highestFrameReceived, player),
          });
        }
      }
    }

    // Tick our state with the new inputs, which may include predictions.
    this.game.tick(this.getStateInputs(newInputs), lastState.frame + 1);

    // Add a history entry into our rollback buffer.
    this.history.push(
      new RollbackHistory(
        lastState.frame + 1,
        this.game.getFrozenSnapshot(),
        newInputs
      )
    );
  }

  onRemoteInput(
    frame: number,
    player: NetplayPlayer,
    input: Input
  ) {
    DEV && assert.isTrue(!player.isLocal, `'player' must be a remote player.`);
    DEV && assert.isNotEmpty(this.history, `'history' cannot be empty.`);
    DEV && assert.isDefined(input, `'input' cannot be undefined.`);

    const currentHighest = get(this.highestFrameReceived, player);
    if (frame <= currentHighest) {
      log.warn(
        `Received out-of-order input for frame ${frame}, but highest received is ${currentHighest}. Ignoring.`
      );
      return;
    }

    // The frames between our last confirmed frame and this frame had no inputs.
    // Our prediction of "no input" for these frames was correct.
    const lastQuietFrame = frame - 1;
    for (const historyEntry of this.history) {
      if (
        historyEntry.frame > currentHighest &&
        historyEntry.frame <= lastQuietFrame
      ) {
        if (historyEntry.isPlayerInputPredicted(player)) {
          get(historyEntry.inputs, player).isPrediction = false;
        }
      }
    }

    this.highestFrameReceived.set(player, frame);

    // If this input is for a frame that we haven't even simulated, we need to
    // store it in a queue to pull during our next tick.
    if (frame > this.history[this.history.length - 1].frame) {
      get(this.future, player).push({ frame: frame, input: input });
      return; // Skip rest of logic in this function.
    }

    // Now, we have an input for a frame that we have already simulated.
    // We must have predicted "no input" for it, which was wrong.
    // We need to find this frame in our history, and then rollback and
    // resimulate from that point.

    let frameIndex: number | null = null;
    for (let i = 0; i < this.history.length; ++i) {
      if (this.history[i].frame === frame) {
        frameIndex = i;
        break;
      }
    }

    if (frameIndex === null) {
      log.warn(
        `Received input for frame ${frame}, which is not in history. It may have been garbage collected. Ignoring.`
      );
      return;
    }

    // The input for this frame must have been a prediction.
    if (!this.history[frameIndex].isPlayerInputPredicted(player)) {
      log.warn(
        `Received input for frame ${frame}, but it was not predicted. Another input may have arrived earlier.`
      );
      return;
    }

    const entry = this.history[frameIndex];
    get(entry.inputs, player).input = input;
    get(entry.inputs, player).isPrediction = false;
    this.dirtyFrame = Math.min(this.dirtyFrame ?? frame, frame);
    if (!this.batching) this.reconcile();
  }

  // Network events accumulate until the next simulation callback, producing one rewind.
  queueRemoteInput(frame: number, player: NetplayPlayer, input?: Input, receivedFrame?: number) {
    if (receivedFrame !== undefined) {
      // Compare both perspectives: symmetric network delay cancels out.
      const advantage = (this.currentFrame() + receivedFrame - 2 * frame) / 2;
      const previous = this.frameAdvantages.get(player) ?? advantage;
      this.frameAdvantages.set(player, previous * 0.8 + advantage * 0.2);
    }
    this.inbox.push({ frame, player, input });
  }

  flushRemoteInputs() {
    this.batching = true;
    try {
      for (const { frame, player, input } of this.inbox.splice(0)) {
        if (input === undefined) this.onRemoteSync(frame, player);
        else this.onRemoteInput(frame, player, input);
      }
    } finally { this.batching = false; }
    this.reconcile();
  }

  private reconcile() {
    if (this.dirtyFrame !== undefined) {
      const index = this.history.findIndex(state => state.frame === this.dirtyFrame);
      if (index <= 0) throw new Error("Rollback base missing");
      this.game.rollbackToSnapshot(this.history[index - 1].state);
      for (const entry of this.history.slice(index)) {
        this.game.tick(this.getStateInputs(entry.inputs), entry.frame);
        entry.state = this.game.getFrozenSnapshot();
      }
      this.dirtyFrame = undefined;
    }
    this.garbageCollectHistory();
  }

  onRemoteSync(frame: number, player: NetplayPlayer) {
    DEV && assert.isTrue(!player.isLocal, `'player' must be a remote player.`);

    const lastConfirmedFrame = frame;

    let currentHighest = get(this.highestFrameReceived, player);
    if (lastConfirmedFrame <= currentHighest) {
      log.warn(
        `Received out-of-order sync for frame ${frame}, but highest received is ${currentHighest}. Ignoring.`
      );
      return; // Old sync message
    }

    // Mark predictions as correct.
    for (let i = 0; i < this.history.length; ++i) {
      let historyEntry = this.history[i];
      if (
        historyEntry.frame > currentHighest &&
        historyEntry.frame <= lastConfirmedFrame
      ) {
        if (historyEntry.isPlayerInputPredicted(player)) {
          let playerInput = get(historyEntry.inputs, player);
          playerInput.isPrediction = false;
        }
      }
    }

    this.highestFrameReceived.set(player, lastConfirmedFrame);
    this.garbageCollectHistory();
  }

  garbageCollectHistory() {
    if (this.batching || this.dirtyFrame !== undefined) return;
    let lastSyncedFrameIndex = -1;
    for (let i = 0; i < this.history.length; i++) {
      if (this.history[i].allInputsSynced()) {
        lastSyncedFrameIndex = i;
        const entry = this.history[i];
        if (entry.frame % 60 === 0 && entry.frame > this.lastCheckpoint) {
          this.lastCheckpoint = entry.frame;
          this.onCheckpoint?.(entry.frame, entry.state);
        }
      } else {
        break;
      }
    }

    if (lastSyncedFrameIndex > 0) {
      this.history.splice(0, lastSyncedFrameIndex);
    }
  }

  /**
   * Internally, we store inputs with a flag indicating whether or not that input is
   * a prediction. Before sending that to the state, we need to remove the prediction
   * flags, since the game logic doesn't care.
   */
  getStateInputs(
    inputs: Map<
      NetplayPlayer,
      { input: Input | undefined; isPrediction: boolean }
    >
  ): Map<NetplayPlayer, Input | undefined> {
    let stateInputs = new Map<NetplayPlayer, Input | undefined>();
    for (const [player, { input }] of inputs.entries()) {
      stateInputs.set(player, input);
    }
    return stateInputs;
  }

  // At most one extra or skipped tick per six callbacks (~17% correction).
  // Peer progress includes quiet-frame heartbeats, not just queued actions.
  pacedTick() {
    this.flushRemoteInputs();
    const remoteFrames = this.players.filter(p => !p.isLocal).map(p => get(this.highestFrameReceived, p));
    const slowest = Math.min(...remoteFrames);
    this.paceCounter = (this.paceCounter + 1) % 6;
    if (this.paceCounter === 0 && Math.max(...this.frameAdvantages.values()) > 6) return;
    this.tick();
    if (this.paceCounter === 0 && this.currentFrame() + 6 < slowest) this.tick();
  }

  start() {
    this.tickIntervalId = window.setInterval(() => this.pacedTick(), this.game.timestep);
  }

  destroy() {
    if (this.tickIntervalId) {
      clearInterval(this.tickIntervalId);
    }
  }
}
