# Valuable-prey hunting

The previous AI (`a9f2cce`) ignored bodies between 85% and 98% of its radius and classified even slightly smaller bodies above 98% as threats. Those bodies represent substantial rewards under sphere mass, but they were missing from its food choices.

The new policy uses the actual size boundary: smaller bodies are edible; equal/larger bodies are threats. It checks the hunter's radius after paying for a shot, so pursuit cannot casually turn its chosen prey into a predator. Escape can still take priority over retaining this advantage.

For prey worth more than half the hunter's mass, farther than six combined radii away, the shooting penalty falls from 40 to 12 (scaled by configured shot mass fraction). Charged pursuit is allowed for that opportunity. Once a safe trajectory is predicted to intersect a valuable meal within three seconds, the AI coasts instead of spending more mass to adjust its velocity. Nearby passive collection, border checks, dangerous-food penalties, and emergency escape remain in place. No new persistent AI state or decision loop was added.

## Experiments

Compared edible-size correction alone, general reward discounts, charged reward pursuit, coasting on intercept, distant-only reward discounts, and extending pursuit via closing velocity. Broad discounts and unrestricted reward charging wasted mass on nearby meals. The selected distant-only discount preserves natural collection while making profitable expeditions possible.

Three tuning seeds and five additional seeds used identical worlds and all three seats against frozen pre-change opponents. On the five additional seeds:

| Case | Previous mean final mass | Selected mean final mass |
|---|---:|---:|
| Nearby valuable prey | 1.50× | 1.78× |
| Moving valuable prey at distance | 1.09× | 1.51× |
| Safe feeding | 2.10× | 2.10× |
| Coasting | 1.08× | 1.08× |
| Guarded food | 0.85× | 0.85× |
| Tangential escape | 0.34× | 0.34× |
| Outward escape | 0.62× | 0.62× |

All valuable-prey runs survived. Match wins improved from 5/15 to 7/15 in these additional seeds. That is a small sample, not a guaranteed win-rate improvement. The distant fixture was mixed on the initial three seeds (1.03× versus 1.19×); improvement is not universal. Across all eight seeds its mean final mass improved from 1.13× to 1.33×. The simple edible-size correction alone increased recognition but weakened match results, which is why the spending and coasting rules were evaluated with it.

`pnpm test:ai` now verifies that near-equal prey beats tiny scraps as a target, that neither ordinary nor custom shot costs erase the hunter's size advantage, and that the moving-prey fixture maintains mean mass above 1.30× on seeds 20–24. Existing positive-growth, defensive escape, and cross-browser determinism checks remain required.

The repeatable cases are `valuable-prey` (radius 142, distance 1,100, drifting radially) and `valuable-chase` (radius 142, distance 2,500, drifting sideways), both against a radius-155 hunter with small alternative food. Run them with `AI_BENCH_SCENARIOS=valuable-prey,valuable-chase pnpm benchmark:ai`. To reproduce the exact opponent comparison, export the AI source from commit `a9f2cce` to a local benchmark module, redirect its relative imports to `/src/`, and select it using `AI_BENCH_OPPONENT_MODULE` (and `AI_BENCH_DECISION_MODULE` for the control run).
