import { NetplayInput, NetplayPlayer, NetplayState } from "../types";

import { assert } from "chai";
import { DEV } from "../debugging";
import { get, shift } from "../utils";

/**
 * Lockstep networking is the simplest networking architecture for games. Each player
 * broadcasts their own local input while waiting for inputs from remote players.
 * Once all remote player imputs have been received, the game can tick forward one step.
 */
export class LockstepNetcode<
  TState extends NetplayState<TInput>,
  TInput extends NetplayInput<TInput>
> {
  /**
   * Whether or not we are the host of this match. The host is responsible for
   * sending our authoritative state updates to prevent non-determinism.
   */
  isHost: boolean;

  /** The current frame we are on. */
  frame: number = 0;

  /** The current state of the game. */
  state: TState;

  /** The list of players that are in this match. */
  players: Array<NetplayPlayer>;

  broadcastInput: (frame: number, input: TInput) => void;
  pollInput: () => TInput;

  timestep: number;

  /**
   * A queue of inputs for each player. When every player has at least one
   * input in their queue, the game state can tick forward.
   */
  inputs: Map<NetplayPlayer, Array<{ frame: number; input: TInput }>> =
    new Map();

  /**
   * How often the host should send out an authoritative state sync.
   * If set to zero, the state can be considered deterministic and no
   * state syncs are required.
   */

  constructor(
    isHost: boolean,
    initialState: TState,
    players: Array<NetplayPlayer>,
    timestep: number,
    pollInput: () => TInput,
    broadcastInput: (frame: number, input: TInput) => void
  ) {
    this.isHost = isHost;
    this.state = initialState;

    this.players = players;

    this.timestep = timestep;

    this.pollInput = pollInput;
    this.broadcastInput = broadcastInput;

    // Initalize each player's input queue to an empty list.
    for (let player of this.players) {
      this.inputs.set(player, []);
    }
  }

  getLocalPlayer() {
    return this.players.filter((p) => p.isLocalPlayer())[0];
  }

  /**
   * Check if we have at least one input queued for every player.
   */
  checkAllInputsReady() {
    for (let player of this.players) {
      if (get(this.inputs, player).length === 0) return false;
    }
    return true;
  }

  missedFrames: number = 0;

  tryAdvanceState() {
    if (!this.checkAllInputsReady()) {
      this.missedFrames++;
      return;
    }

    // Pull inputs out of the queue to create an input map.
    let stateInputs: Map<NetplayPlayer, TInput> = new Map();
    for (let player of this.players) {
      let queue = get(this.inputs, player);
      let queuedInput = shift(queue);

      DEV && assert.equal(queuedInput.frame, this.frame);
      stateInputs.set(player, queuedInput.input);
    }

    // Tick the state forward with the complete inputs.
    this.state.tick(stateInputs, this.frame);

    // Increment our frame counter.
    this.frame++;

    // Process and broadcast new local input.
    this.processLocalInput();
  }

  start() {
    // Process and broadcast the first input.
    this.processLocalInput();

    setInterval(() => {
      // Each timestep, try to advance the state.
      this.tryAdvanceState();
    }, this.timestep);
  }

  processLocalInput() {
    let localPlayer = this.getLocalPlayer();
    let localInput = this.pollInput();

    DEV &&
      assert.isEmpty(
        this.inputs.get(localPlayer),
        "Local player already has input stored."
      );

    // Queue the local input for a game tick.
    get(this.inputs, localPlayer).push({
      frame: this.frame,
      input: localInput,
    });

    // Broadcast the input.
    this.broadcastInput(this.frame, localInput);
  }

  onRemoteInput(frame: number, player: NetplayPlayer, input: TInput) {
    DEV && assert.isTrue(player.isRemotePlayer(), `'player' must be remote.`);

    const queue = get(this.inputs, player);

    const expectedFrame =
      queue.length === 0 ? this.frame : queue[queue.length - 1].frame + 1;
    DEV && assert.equal(frame, expectedFrame, "Unexpected Frame");

    // Queue the input.
    queue.push({ frame: frame, input: input });
  }
}
