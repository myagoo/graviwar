/**
 * Rollback netcode is an effective netcode algorithm for two-player games which allows
 * both players to have lag-free control of their own character, at the expense of
 * artifacting for remote characters. This is the most common algorithm used in
 * fighting games.
 *
 * The algorithm works as follows:
 * - All clients play on the same clock.
 * - When a client simulates a frame F, it uses it's own local input, but makes a guess as to what
 *   actions the remote players have taken. The client sends it's local input to all other players.
 * - When a remote player's input for frame F arrives, we rewind the state of the game to F - 1,
 *   and replay forward with the correct input from frame F.
 *
 * Resources:
 * - RetroArch Netplay Implementation: https://github.com/libretro/RetroArch/tree/v1.9.0/network/netplay
 */

import { get, shift } from "../utils";
import { NetplayGame, NetplayPlayer, SerializableValue } from "./types";

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
  state: SerializableValue;

  /**
   * These inputs represent the set of inputs that produced this state
   * from the previous state.
   * Eg: history[n].state = history[n - 1].state.tick(history[n].inputs)
   */
  inputs: Map<
    NetplayPlayer,
    { input: SerializableValue | undefined; isPrediction: boolean }
  >;

  constructor(
    frame: number,
    state: SerializableValue,
    inputs: Map<
      NetplayPlayer,
      { input: SerializableValue | undefined; isPrediction: boolean }
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
    Array<{ frame: number; input: SerializableValue }>
  >;

  highestFrameReceived: Map<NetplayPlayer, number>;

  framesSinceLastBroadcast: number = 0;
  SYNC_FRAME_THRESHOLD: number = 60;

  constructor(
    private game: NetplayGame<SerializableValue>,
    private players: Array<NetplayPlayer>,
    private broadcastInput: (
      frame: number,
      input: SerializableValue | undefined
    ) => void
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
    DEV && assert.isNotEmpty(this.history, `'history' cannot be empty.`);

    // Get the most recent state.
    const lastState = this.history[this.history.length - 1];

    // Construct the new map of inputs for this frame.
    const newInputs: Map<
      NetplayPlayer,
      { input: SerializableValue | undefined; isPrediction: boolean }
    > = new Map();
    for (const [player, input] of lastState.inputs.entries()) {
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
        if (get(this.future, player).length > 0) {
          // If we have already recieved the player's input (due to our)
          // simulation being behind, then use that input.
          let future = shift(get(this.future, player));
          // DEV && assert.equal(lastState.frame + 1, future.frame);
          newInputs.set(player, {
            input: future.input,
            isPrediction: false,
          });
        } else {
          // Otherwise, set the next input based off of the previous input.
          newInputs.set(player, {
            input: this.game.predictNextInput(
              lastState.frame + 1,
              lastState.state,
              input.input
            ),
            isPrediction: true,
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
    input: SerializableValue
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

    // The state before this frame is our rollback point. It must exist.
    DEV && assert.isTrue(frameIndex > 0);
    let rollbackState = this.history[frameIndex - 1];

    // Roll back to that previous state.
    this.game.rollbackToSnapshot(rollbackState.state);

    // Resimulate forwards from the corrected frame.
    for (let i = frameIndex; i < this.history.length; ++i) {
      let currentState = this.history[i];
      let resimFrame = currentState.frame;

      // Correct the input for the frame we received.
      if (resimFrame === frame) {
        let playerInput = get(currentState.inputs, player);
        playerInput.input = input;
        playerInput.isPrediction = false;
      } else {
        // For the current player, after the corrected frame, we predict from the new input.
        if (!player.isLocal) {
          let playerInput = get(currentState.inputs, player);
          if (playerInput.isPrediction) {
            const previousPlayerInput = get(this.history[i - 1].inputs, player);
            playerInput.input = this.game.predictNextInput(
              resimFrame,
              currentState.state,
              previousPlayerInput.input
            );
          }
        }
      }

      this.game.tick(this.getStateInputs(currentState.inputs), resimFrame);
      currentState.state = this.game.getFrozenSnapshot();
    }

    DEV &&
      log.debug(
        `Resimulated ${this.history.length - frameIndex} states after rollback.`
      );

    this.garbageCollectHistory();
  }

  onRemoteSync(frame: number, player: NetplayPlayer) {
    DEV && assert.isTrue(!player.isLocal, `'player' must be a remote player.`);

    const lastConfirmedFrame = frame - 1;

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
    let lastSyncedFrameIndex = -1;
    for (let i = 0; i < this.history.length; i++) {
      if (this.history[i].allInputsSynced()) {
        lastSyncedFrameIndex = i;
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
      { input: SerializableValue | undefined; isPrediction: boolean }
    >
  ): Map<NetplayPlayer, SerializableValue | undefined> {
    let stateInputs = new Map<NetplayPlayer, SerializableValue | undefined>();
    for (const [player, { input }] of inputs.entries()) {
      stateInputs.set(player, input);
    }
    return stateInputs;
  }

  start() {
    this.tickIntervalId = window.setInterval(() => {
      // TODO: This is way to aggressive of a speed up.
      // If us and our peer are running at the same simulation clock,
      // we should expect inputs from our peer to arrive after we have
      // simulated that state. If inputs from our peer are arriving before
      // we simulate the state, that means we are running slow, and we
      // have to tick faster. Otherwise we are needlessly forcing our
      // peer to predict lots of frames.
      let numTicks = 1;
      if (this.largestFutureSize() > 0) {
        numTicks = 2;
      }

      for (let i = 0; i < numTicks; ++i) {
        this.tick();
      }
    }, this.game.timestep);
  }

  destroy() {
    if (this.tickIntervalId) {
      clearInterval(this.tickIntervalId);
    }
  }
}
