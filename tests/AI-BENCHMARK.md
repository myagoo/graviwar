# AI outcome benchmark

Run `pnpm benchmark:ai`. This takes about a minute on a development machine and writes results under `.scratch/ai-benchmark/`:

- `report.md`: per-scenario averages, including dead players as zero mass/radius.
- `results.json`: every seed, policy and starting seat, plus aggregates.
- `worst-runs.json` and `viewer.html`: the lowest-final-mass current-AI run from each scenario. Open the HTML directly to scrub or play sampled snapshots. These are one-second visual samples, not tick-accurate rollback replays.

Compare a change against the committed initial baseline:

```sh
AI_BENCH_BASELINE=tests/fixtures/ai-baseline.json pnpm benchmark:ai
```

The comparison reports paired changes on identical seeds and seats. It does not yet enforce a quality threshold: the initial AI fails basic feeding objectives. Deterministic-state differences, non-finite metrics and inconsistent mass accounting do fail the command. Once feeding improves, pin minimum growth and survival thresholds separately; do not bless a weaker AI by regenerating the baseline automatically.

Use `AI_BENCH_SEEDS=10` for a wider sample and `AI_BENCH_OUT=.scratch/ai-candidate` to preserve a previous run. Baseline comparison requires the same seed count and case list. Keep additional seeds out of tuning to check that improvements generalize. Bump the benchmark version when changing fixtures or metric definitions.

## Scenarios

Each focused scenario runs 30 simulated seconds with real default gravity and deterministic vertical perturbations across three seeds:

- **Feeding:** eight initially smaller bodies ahead. Measures growth and ejection cost; food can merge and become dangerous during the run.
- **Coasting:** already moving toward one meal. Measures unnecessary correction and time to first significant mass gain.
- **Moving:** moving prey plus a small alternative meal. Measures pursuit profitability.
- **Guarded:** a valuable meal beside a larger predator, with a safer meal behind. Measures survival alongside retained mass.
- **Shrinking:** outward drift near the boundary, with inward food. Measures correction cost during arena shrinkage.
- **Match:** three players, 120 neutral bodies, 10,000 arena radius, shrinking to zero over 90 seconds. Items and radiation remain enabled. Each policy occupies every starting seat against two current-AI opponents. A match stops at one survivor; unresolved matches and zero-survivor outcomes are recorded, not credited as wins. This medium-sized fixture is a repeatable benchmark, not evidence for every custom setting or 1,000-body default match.

The initial suite has 72 runs. `current` uses the production `aiDecision`; `passive` never acts; `nearest` fires toward the nearest edible body every half second, ignoring gravity and mass cost. All decisions use the same real input and physics paths at the production 2 Hz decision rate. Players are externally controlled so the built-in AI does not act twice. Rendering and wall-clock scheduling are disabled. Coasting and guarded fixtures also run for ten seconds in Chromium, Firefox and WebKit and must produce exactly identical states and metrics.

## Reading the results

Primary measures are final mass ratio **and** survival. Also record final radius ratio, peak mass, time to first gain, mass expelled, mass lost, radiation cost, shots per minute alive, and match wins. The JSON retains individual cases; means alone can hide deaths or fortunate starts. A current-AI self-play win rate of one third is expected by symmetry, not proof of intelligence.

Mass gained/lost is the net absorption transfer per tick after accounting for shot and radiation emissions. It can include reabsorbing one's own shots and does not claim to count unique prey. `firstGainSeconds` detects a transfer exceeding 0.1% of starting mass. Ejection totals can exceed starting mass after feeding. Snapshots show mass over time and help distinguish profitable acquisition from repeatedly recycling expelled matter.

Initial findings: current AI survives all three guarded-food seeds, whereas the passive baseline dies. But in coasting it retains only about 36% of its starting mass versus 123% for passive play. Improve economical feeding while preserving that defensive advantage; do not optimize only win rate or only shooting frequency.
