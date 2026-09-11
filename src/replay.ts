import { soloSettingsSchema } from "./solo-settings";
import { bonusSchema, pickupSchema, inputSchema } from "./bonuses";
import { z } from "zod";
import { type Game } from "./Game";
import type { NetplayPlayer } from "./netplayjs/netcode/types";

// ponytail: full snapshots cap recordings at 600 ticks; use checkpoints for longer runs.
export const MAX_REPLAY_TICKS = 600;
const vector = z.object({ x: z.number(), y: z.number() });
const snapshotSchema = z.array(z.object({
  type: z.enum(["player", "ai", "cpu", "fluctuation"]),
  playerId: z.union([z.string(), z.number()]).optional(),
  pickup: pickupSchema.optional(),
  expiresAt: z.number().int().nonnegative().optional(),
  hawkingTicks: z.number().int().min(1).max(600).optional(),
  storedBonus: bonusSchema.optional(),
  activeBonus: bonusSchema.optional(),
  bonusTicks: z.number().int().min(1).max(900).optional(),
  pickupClaims: z.array(z.object({ id: z.union([z.string(), z.number()]), mass: z.number().nonnegative() })).optional(),
  mass: z.number(),
  radius: z.number(),
  position: vector,
  velocity: vector,
})).max(20000);

export const replaySchema = z.object({
  version: z.literal(16),
  settings: soloSettingsSchema.optional(),
  seed: z.string().min(1).max(200),
  browser: z.string().max(2000),
  inputs: z.array(inputSchema.nullable()).max(MAX_REPLAY_TICKS),
  states: z.array(snapshotSchema).min(1).max(MAX_REPLAY_TICKS + 1),
}).refine((trace) => trace.states.length === trace.inputs.length + 1, {
  message: "Expected an initial state plus one state per input tick",
});

export type Replay = z.infer<typeof replaySchema>;
type Snapshot = ReturnType<Game["getFrozenSnapshot"]>;
export type Difference = { field: string; expected: unknown; actual: unknown };

export function firstDifference(expected: Snapshot, actual: Snapshot): Difference | undefined {
  if (expected.length !== actual.length) {
    return { field: "blackHoles.length", expected: expected.length, actual: actual.length };
  }
  for (let i = 0; i < actual.length; i++) {
    const fields = (body: Snapshot[number]) => ({
      expiresAt: body.expiresAt, hawkingTicks: body.hawkingTicks,
      pickup: body.pickup, storedBonus: body.storedBonus, activeBonus: body.activeBonus, bonusTicks: body.bonusTicks,
      pickupClaims: JSON.stringify(body.pickupClaims),
      type: body.type, playerId: body.playerId, mass: body.mass, radius: body.radius,
      "position.x": body.position.x, "position.y": body.position.y,
      "velocity.x": body.velocity.x, "velocity.y": body.velocity.y,
    });
    const a = fields(expected[i]);
    const b = fields(actual[i]);
    for (const field of Object.keys(a) as (keyof typeof a)[]) {
      if (a[field] !== b[field] ||
          (typeof b[field] === "number" && !Number.isFinite(b[field]))) {
        return { field: `blackHoles[${i}].${field}`, expected: a[field], actual: b[field] };
      }
    }
  }
}

export const replayPlayer: NetplayPlayer = { id: 0, isLocal: true };

export type ReplaySession = {
  game: Game;
  trace: Replay;
  tick: number;
  playing: boolean;
  mode: "record" | "replay";
  message: string;
  failure?: { tick: number; difference: Difference; actual: Snapshot };
};

export function checkReplayState(session: ReplaySession) {
  const actual = session.game.getFrozenSnapshot();
  const expected = session.trace.states[session.tick];
  const difference = firstDifference(expected, actual);
  if (difference) {
    session.failure = { tick: session.tick, difference, actual };
    session.playing = false;
    session.message = `FAIL at tick ${session.tick}: ${difference.field}; expected ${String(difference.expected)}, actual ${String(difference.actual)}`;
  }
}

export function stepReplaySession(session: ReplaySession) {
  if (session.failure) return;
  const { game, trace, mode } = session;
  const limit = mode === "record" ? MAX_REPLAY_TICKS : trace.inputs.length;
  if (session.tick >= limit) {
    session.playing = false;
    session.message = mode === "record" ? "Recording limit reached" : `PASS: ${session.tick} ticks matched exactly`;
    return;
  }
  const liveInput = game.flushInputBuffer();
  const input = mode === "record" ? liveInput : trace.inputs[session.tick] ?? undefined;
  game.tick(new Map([[replayPlayer, input]]), ++session.tick);
  if (mode === "record") {
    trace.inputs.push(input ?? null);
    const snapshot = game.getFrozenSnapshot();
    trace.states.push(snapshot);
    // Comparing with itself also rejects non-finite physics values before JSON can hide them.
    checkReplayState(session);
  } else {
    checkReplayState(session);
  }
  if (!session.failure && session.tick === limit) {
    session.playing = false;
    session.message = mode === "record" ? "Recording limit reached" : `PASS: ${session.tick} ticks matched exactly`;
  }
}
