# Offline AI evolution

Requires Node 22.18+ (native TypeScript stripping), installed dependencies and Playwright browsers.

```sh
pnpm train:ai --generations 20
pnpm train:ai --generations 40 --resume
# Independent experiment:
pnpm train:ai --generations 20 --seed experiment-2 --out .scratch/ai-training-2
pnpm test:ai-training
```

`--generations` is the total desired generation count, including generations already completed. A checkpoint is saved atomically after each complete generation; interrupting a match repeats that generation on resume. The seed and source fingerprint must match. An existing checkpoint is never silently overwritten. Keep the same checkout when resuming; start a fresh output directory after code changes.

Training runs the actual 60 Hz game in headless Chromium, with decisions every 10 ticks (six per second). Older experiments used 30 ticks. There is no rendering, network, real-time wait, or alternative physics model. Each genome controls one of 32 equal-sized players through the normal input path. All decisions for a tick are computed before applying any shots. AI charge is earned by simulation ticks. Target memory lives on the body and survives snapshots/rollback.

## Selection

The first population contains the current policy plus 31 independently randomized genomes. Each generation plays four 90-second maximum games in the same seeded world, rotating genomes by eight spawn slots between games. Each generation gets a new world seed. The arena shrinks to zero; there are 120 neutral bodies. Rotations reduce spawn luck but do not cover all 32 spawn positions in a generation.

Each participant receives:

```
70 × placement + 25 × winner + 5 × growth
placement = (32 − rank) / 31
growth = clamp(mean mass over all match ticks / initial mass, 0, 2) / 2
```

Only a sole surviving player receives the winner bonus. Same-tick eliminations share their occupied ranks; survivors at a timeout also tie. Mass after death contributes zero to the time average. Growth uses actual mass, never temporary item gravity or displayed radius. The match ends at one or zero surviving players, or its tick limit. Scores are averaged across the four games. Validation uses the same formula with its actual participant count.

Four elites survive unchanged. Twenty-five children choose each gene from one of two randomly selected top-eight parents, with a 20% per-gene chance of mutation by at most 10% of its allowed range. Three fresh random genomes maintain diversity. All values are bounded and validated. Breeding randomness is independent of simulation randomness and reproducible from the experiment seed and generation.

## Parameters and limits

Defaults and bounds are in `src/ai-genome.ts`. The 25 genes cover food mass and distance weighting, moving-away penalty, course preference, pursuit horizon, target commitment, preferred/minimum speed, normal/valuable-pursuit shot cost, velocity tolerance, charged-shot benefit threshold, charge waiting, danger range/horizon/cost, safe momentum, predator feeding penalty, border margin, item value/activation range, shield timing, incoming-food coasting, valuable-prey threshold, and guarded-food risk tolerance.

Target commitment boosts the previous target only while it remains in the six-meal shortlist. Charge waiting yields to threats. Physics settings, decision frequency, absorption, item effects, and shot rules are not evolved. Live calls use the explicitly promoted defaults; training never replaces them automatically or adds multiplayer settings.

## Evidence and promotion

Gitignored `.scratch/ai-training/` contains:

- `checkpoint.json`: next population and champion history, sufficient to resume.
- `generation-N.json`: evaluated genomes, match metrics, scores and champion.
- `champion.json`: latest generation's winner, with source fingerprint.
- `validation.json` and `report.md`: held-out results.

Validation pits the latest champion against the current policy and a midpoint champion across four arena/physics variants and all three spawn slots (12 matches). Six focused feeding, escape and pursuit scenarios run on three additional unseen seeds, paired against current defaults. These are diagnostic samples, not statistical proof. Training scores from different generations are not directly comparable because worlds and opponents change.

There is no automatic promotion. Review held-out wins, survival and feeding regressions, repeat with additional seeds, and rerun AI/browser/rollback checks before deliberately changing `DEFAULT_AI_GENOME`. To inspect an exported candidate in the existing browser benchmark, validate its `genome` then pass it as `simulate({..., genome})`.

## Promoted policy (2026-09-12)

At the user's request, the run-11 generation-20 champion from the ten-independent-runs-plus-one-combined experiment is now the default. All 25 values were copied at full precision; no physics or decision rules changed. The final and midpoint champions from all eleven runs, plus the previous manual policy, competed in 92 matches: four arena/physics variants, each with all 23 spawn rotations on a shared seed. This candidate ranked first by the agreed mean fitness (47.02 versus 19.09 for the manual policy). Selection evidence is in `.scratch/ai-promotion/selection.json`.

An additional 12-match check against two manual-policy opponents on new seeds produced 7 wins and 65.43 mean fitness, versus 37.44 averaged over manual opponents. `tests/ai-promotion.mjs` keeps this check reproducible. These small deterministic samples establish a regression baseline, not a guarantee of better play in every situation.

The tradeoff is intentional: the evolved policy waits for charge and preserves mass more aggressively, and its isolated valuable-prey pursuit is weaker. Tactical assertions for the old profile now explicitly use `tests/fixtures/ai-manual-genome.json`; live defaults remain covered by growth/escape checks, the promotion matches, cross-browser simulation and multiplayer rollback. Replay and public matchmaking versions advanced to 23 because AI simulation behavior changed. Previous training checkpoints remain tied to their recorded source fingerprint.

## Gravity escapes and committed firing

AI decisions now run every 10 simulation ticks, shared by the live game and both benchmark/training harnesses. This permits up to six shots per second; actual shooting still needs to improve the scored outcome and costs the normal mass. The old 30-tick schedule capped reactions at two per second, and the evolved 81% charge preference usually delayed ordinary shots to one second. Waiting is bypassed for threats and distant valuable prey; available charge is never increased artificially.

Nearby predators are checked with a bounded 12-step, three-second two-body gravity forecast, including relative velocity and Supermassive/Surge pull. If the current path intersects a predator and even the available outward recoil is below escape speed, the AI considers perpendicular thrust on either side, favoring existing orbital momentum. This forecast is an approximation and cannot guarantee escape from an already fatal encounter. Six meals and eight predators remain the planning limits.

For distant, significant prey the target speed rises to at least eight arena units per tick. Two pursuit weights changed deliberately: the significant-prey mass threshold is 50% (previously about 80%), and pursuit shot cost is 12 (previously 40). Charge waiting is bypassed for committed pursuit; incoming-food coasting and the post-shot size-advantage check remain in force. This usually creates a short acceleration burst followed by coasting, rather than continuous fire.

`tests/ai-commitment.mjs` exercises actual Game ticks in Chromium, Firefox and WebKit: perpendicular thrust, both orbital directions, recoverable gravity escapes, rapid pursuit that gains mass, no fire into incoming food, and earned charging. A diagnostic grid of 16 encounters against a radius-600 predator improved ten-second survival from 0/16 to 12/16; close head-on cases remain fatal. Results are in `.scratch/ai-commitment/escape-grid.json`. The regular quality, charge, rollback and match-performance checks remain enabled. Simulation/replay version is now 24.
