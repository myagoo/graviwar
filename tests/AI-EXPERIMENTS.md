# AI experiments: economical steering

All candidates used real physics, the same three tuning seeds (0–2), and rotated all three seats against frozen original opponents. Selected candidates also ran five new seeds (20–24), giving 15 validation matches per candidate. These are small, deterministic samples; win percentages describe these runs, not an estimated population win rate.

## Candidates

The original score adds 2 for firing. Costs below are multiplied by `shotMass / 0.05`, so changing the configured mass fraction changes the AI's spending penalty too.

| Candidate | Feeding final mass | Coasting final mass | Guarded survival | Tuning wins |
|---|---:|---:|---:|---:|
| Original | 0.00× | 0.36× | 3/3 | 3/9 |
| Shot cost 20 | 1.19× | 0.71× | 3/3 | 6/9 |
| Shot cost 40 | 2.10× | 1.17× | 3/3 | 3/9 |
| Shot cost 80 | 2.10× | 1.23× | 2/3 | 5/9 |
| Explicit coasting | 0.60× | 0.49× | 3/3 | 3/9 |
| Food budget cutoff | 1.01× | 0.54× | 3/3 | 2/9 |
| Reduced danger sensitivity | 0.00× | 0.36× | 0/3 | 4/9 |
| Cost 40 + explicit coasting | 2.10× | 1.17× | 3/3 | 3/9 |
| Gravity-adaptive cost | 1.50× | 1.06× | 3/3 | 6/9 |
| Adaptive + coasting | 1.57× | 1.06× | 3/3 | 6/9 |
| Longer gravity horizon | 1.81× | 1.08× | 3/3 | 4/9 |

Explicit coasting skipped firing when a 180-tick linear forecast passed within 90% of combined radii, outside danger and the arena edge. The budget cutoff skipped pursuit of non-item food worth less than three shots. Reduced sensitivity changed threat detection from six combined radii to two, and collision-risk scoring from four to two. Adaptive cost interpolated 4–40 using `gravity * combinedMass * horizon² / (2 * distance³)`, capped at one, with a 360-tick horizon; the longer variant used 1800 ticks. Adaptive combinations retained cost 40 without prey or when threatened.

## Validation and selection

| Candidate | Feeding mass | Coasting mass | Guarded survival | Match wins | Match shots/min alive |
|---|---:|---:|---:|---:|---:|
| Original | 0.00× | 0.28× | 5/5 | 5/15 | 85.5 |
| Cost 40 | 2.10× | 1.18× | 5/5 | 13/15 | 22.1 |
| Cost 40 + coasting | 2.10× | 1.18× | 5/5 | 13/15 | 20.6 |
| Adaptive | 1.45× | 0.90× | 5/5 | 8/15 | 33.9 |

Keep **cost 40**: strong growth, preserved defensive survival, and no additional scans or persistent AI state. Explicit coasting tied its validation win rate and had mixed mass results, so its extra branch was not retained. Higher costs weakened defense; lower costs kept wasting mass. The sophisticated gravity forecast did not consistently improve results.

A zero-gravity feeding check exposed a failure in the unconditional cost-40 candidate: no movement or feeding at all. The shipped rule retains the original cost 2 when gravity is exactly zero. It then reaches food in 1.77 seconds on that fixture, matching the original behavior. At gravity 0.01, cost 40 collects food and reaches 2.10× starting mass. This preserves active pursuit when waiting cannot help.

Production change: one normalized shot-cost calculation and its use in the existing score. The decision cadence, target selection, danger scoring, item logic, and direction shortlist stay unchanged. Results remain deterministic across browser engines. The benchmark now freezes its opponents to avoid confusing self-play changes with head-to-head improvement.

The original three-seed outcomes are enforced conservatively by `tests/ai-quality.mjs`: positive growth in feeding/coasting, defensive survival, limited firing, and no idle bot in zero gravity. Full benchmark reports and per-second visual diagnostics remain under `.scratch/` rather than being bundled with the game.

A default-scale sanity check used 1,000 neutral bodies, radius 20,000, and a 180-second limit, rotating three seats on one additional seed (`default-scale:0`). The selected AI won 2/3 versus 1/3 for original self-play. Its mean final mass was 1.15× starting mass versus 0.23×, including deaths. This supports the smaller-fixture result, but one seed is not a broad default-settings evaluation.
