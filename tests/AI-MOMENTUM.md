# Momentum-aware escapes and charged shots

Compared against the economical AI from `634e9a6`, with fixed opponents and identical seeds/seats. Tried tap-only momentum steering, charged shots alone, their combination, strong/weak predator-feeding penalties, and selective charging. A strong feeding penalty prevented necessary escapes; unrestricted charging regressed the coasting growth test. The final version keeps those tests passing by restricting non-emergency charged shots to distant prey and corrections worth making even at tap power.

The selected AI:

- Preserves tangential/outward velocity near a predator, rather than targeting a fixed radial escape speed that brakes existing momentum. Motion toward the predator is not reinforced.
- Compares tap, half-charge and available-charge recoil on its existing nine directions; at most 27 bounded candidates twice per second.
- Adds a small cost when an ejected body's linear trajectory intersects a predator. It can still choose such a shot when escape benefits outweigh feeding risk.
- Charges continuously between shots using simulation ticks. A shot resets that timer; Supermassive resets it while shooting is locked. Custom charge duration, tap threshold, boost, mass fraction and jet effects use the same formulas as human shots. No instant full charge or wall-clock AI state.

On five additional seeds (20–24), final version versus the preceding AI:

| Scenario | Prior survival | New survival | Prior final mass | New final mass |
|---|---:|---:|---:|---:|
| Tangential escape | 0/5 | 4/5 | 0.00× | 0.34× |
| Outward escape | 0/5 | 5/5 | 0.00× | 0.62× |
| Feeding | 5/5 | 5/5 | 2.10× | 2.10× |
| Coasting | 5/5 | 5/5 | 1.18× | 1.08× |
| Guarded food | 5/5 | 5/5 | 0.82× | 0.85× |
| Shrinking arena | 5/5 | 5/5 | 1.10× | 1.05× |

Match wins were 7/15 versus 5/15 against fixed prior opponents, with mean shots/minute alive 31.9 versus 33.2. These small samples support an escape improvement, not a guaranteed win-rate increase. Coasting and shrinking retain positive average growth but slightly less mass than before. The head-on fixture remains fatal before the first half-second AI decision in both versions; charged shots do not solve that reaction limit.

## Reproduce

```sh
AI_BENCH_OPPONENT_MODULE=/tests/fixtures/ai-economical-policy.ts \
AI_BENCH_SEED_START=20 AI_BENCH_SEEDS=5 \
AI_BENCH_SCENARIOS=feeding,coasting,moving,guarded,shrinking,escape-tangent,escape-headon,escape-outward,match \
AI_BENCH_OUT=.scratch/ai-momentum-final pnpm benchmark:ai
```

For the control run, also set `AI_BENCH_DECISION_MODULE=/tests/fixtures/ai-economical-policy.ts`. The original benchmark's default scenarios/opponents are unchanged. `pnpm test:ai` includes deterministic cross-browser escape cases, earned charging with custom duration, snapshot/replay validation and exact rollback, in addition to the earlier positive-growth checks.

The player-radius slider now reaches 3,000 (formerly 1,000), while retaining the 155 default. The expanded range is shared by solo and invitation settings. Tests cover the slider bound and finite simulation at radius 3,000 in the smallest arena.
