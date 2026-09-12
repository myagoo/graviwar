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

Training runs the actual 60 Hz game in headless Chromium, with decisions every 30 ticks. There is no rendering, network, real-time wait, or alternative physics model. Each genome controls one of 32 equal-sized players through the normal input path. All decisions for a tick are computed before applying any shots. AI charge is earned by simulation ticks. Target memory lives on the body and survives snapshots/rollback.

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

Target commitment boosts the previous target only while it remains in the six-meal shortlist. Charge waiting yields to threats. Physics settings, decision frequency, absorption, item effects, and shot rules are not evolved. Live calls use the original defaults; training does not replace them or add multiplayer settings.

## Evidence and promotion

Gitignored `.scratch/ai-training/` contains:

- `checkpoint.json`: next population and champion history, sufficient to resume.
- `generation-N.json`: evaluated genomes, match metrics, scores and champion.
- `champion.json`: latest generation's winner, with source fingerprint.
- `validation.json` and `report.md`: held-out results.

Validation pits the latest champion against the current policy and a midpoint champion across four arena/physics variants and all three spawn slots (12 matches). Six focused feeding, escape and pursuit scenarios run on three additional unseen seeds, paired against current defaults. These are diagnostic samples, not statistical proof. Training scores from different generations are not directly comparable because worlds and opponents change.

There is no automatic promotion. Review held-out wins, survival and feeding regressions, repeat with additional seeds, and rerun AI/browser/rollback checks before deliberately changing `DEFAULT_AI_GENOME`. To inspect an exported candidate in the existing browser benchmark, validate its `genome` then pass it as `simulate({..., genome})`.
