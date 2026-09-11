# Graviwar

A gravity-based space combat game built with React, Vite, and pnpm.

This project has been migrated from Create React App to Vite for faster development and better performance.

## Install and play offline

Open https://myagoo.github.io/graviwar/ online once to cache the game. Use
your browser’s install menu. On iPhone,
use Safari’s **Share → Add to Home Screen**. The app has standalone display,
a dedicated black-hole icon, and a maskable Android icon.

Solo and saved settings work offline after caching finishes. Multiplayer is
disabled offline, including direct invite links; losing connectivity exits the
multiplayer connection without restarting solo games. Browser storage must be
retained for offline play. Updates activate after older app windows close.

Run `pnpm test:pwa` to build and check the `/graviwar/` scope, installation
metadata, cached offline reloads and icons, solo play, and multiplayer guards.

## Available Scripts

In the project directory, you can run:

### `pnpm dev`

Runs the app in development mode with Vite's fast HMR.\
Open [http://localhost:3000](http://localhost:3000) to view it in the browser.

The page will reload instantly if you make edits.\
You will also see any lint errors in the console.

### `pnpm build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

### `pnpm preview`

Locally preview the production build.

### `pnpm lint`

Run ESLint to check for code quality issues.

### `pnpm run deploy`

Deploy the built app to GitHub Pages.

## Replay diagnostics (development only)

Open `http://localhost:3000/?replay` after `pnpm dev`. Use **New recording**
to start with the seed shown. Click the canvas to queue an expulsion; **Step**
advances one simulation tick, or **Play/Pause** records real-time play.
**Replay recording** restarts from the same seed and applies the recorded inputs.
Press **Play** to compare every tick, including the initial state. The first
mismatch stops replay and reports its field and numeric values.

**Run self-check** runs a 12-tick scenario through the actual game twice, then
alters one expected position and asserts that replay stops at tick 6. Success
reads `SELF-CHECK PASS`. This replaces the current recording.

Export a replay and import it in another browser running the same code revision
to check cross-browser results. Imported JSON is validated. Failure evidence
includes the original trace, first differing state, and browser identifiers;
save downloaded evidence under `.scratch/` when tracking an issue locally.

Recordings contain the seed, one player (ID 0), tick-indexed inputs (`null` for
no action), and full physics snapshots. State 0 is initialization; input 0
produces state 1. Numbers are compared without tolerance; positive and negative
zero compare equal, and non-finite numbers fail. Camera state is excluded.
Recordings stop at 600 ticks to bound memory usage. This checks local physics
replay, not peer startup or rollback input delivery. A passing run on one
browser/OS does not establish determinism on other environments.

## Game settings

Settings are grouped in collapsed Arena, Bodies, Players, Shots, Items, Quantum fluctuations, Hawking radiation, and Physics sections. Full charge defaults to 1 second (180 ms tap threshold), with 2× speed at half charge and 4× at full charge.

Solo preferences and custom invitation preferences are saved separately. Public matchmaking always uses the built-in multiplayer defaults (no AI rivals). Invitation settings remain visible in the lobby, including the AI section. You can edit them before another peer joins; shared rules then lock. AI rivals run deterministically on every peer and are recomputed during rollback. Invitation links contain the complete validated settings, player count, and source commit hash; every peer checks the same rules before starting. A different build is rejected: update/reload the app and create a fresh invitation. Rollback timing remains fixed.

Choose **Solo** to configure starting arena radius, shrink duration, gravity,
neutral body count (excluding players and AI), neutral body radius range, and your starting
radius. Valid changes save automatically in this browser's local storage;
**Reset defaults** restores the built-in setup. Sizes are radii in arena units.
**Shrink arena over time** enables a linear shrink from the starting radius to
zero. Defaults are 20,000 → 0 over 180 simulated seconds, staying at zero
once the duration ends. Gravity remains constant. Duration ranges from 30–600 seconds. Turning
shrinking off keeps the starting radius throughout the match. Existing saved
radius preferences are retained, and the former gravity-growth checkbox maps to
the new shrink checkbox. Public matchmaking uses the shared default shrink schedule.

Sliders support 0–5,000 neutral bodies, arena radii of 5,000–50,000, gravity of 0–1,
neutral radii of 10–150, and player radii of 30–1,000. The minimum and maximum
neutral radii stay ordered automatically. Solo and invitation preferences are stored separately.
Run `node tests/custom-settings.mjs` for custom-rule determinism and `pnpm test:settings` to check persistence, validation, applied physics,
unavailable storage, and mobile layout in Chromium, Firefox, and WebKit.

Solo also supports **0–32 AI rivals** (default 3), added on top of the neutral body count. Rivals start at your selected radius and appear violet. Every half second
they anticipate approaching threats and the arena edge, score food by mass and
travel distance, and favor mystery bodies when their stored slot is empty.
They shortlist six meals, discount prey fleeing too fast, and avoid meals near
predators or the closing border. A small preference for their current course
reduces reversals for marginally better food.
They compare coasting with nine firing directions, using actual recoil and a
one-second linear forecast against up to eight nearby predators and the shrinking
arena. A firing penalty encourages conserving mass. They lead moving targets,
correct sideways drift, and brake near food. Repulsion uses its actual blast
range; Supermassive checks danger at half radius throughout its three seconds.
The forecast omits gravity and is refreshed twice per second. Decisions use snapshot state and
shared deterministic math; `pnpm test:ai` checks behavior and exact cross-browser
replay. Multiplayer does not spawn AI rivals.

## Multiplayer

Choose **Multiplayer**, select the total player count (2–16, including you),
then choose **Matchmaking** or **Invite friends**. Matchmaking finds random opponents. The free signaling server groups
players requesting exactly the same size and current battle royale rules.
When the group fills, peers connect directly to one another and automatically
complete the ready/prepared barrier. There is no manual Ready step for public
matchmaking. The waiting screen does not show live queue occupancy because the
service does not report it. **Cancel matchmaking** closes the signaling session.
Run `pnpm test:matchmaking` for a live cross-browser check of separate queue
sizes, automatic startup, confirmed states, and cancellation.

For an invitation room, choose **Invite friends** and share the **Invite link**.
The link carries the selected player count; Ready unlocks when all seats are filled.
Players may share their own invite links to the same room. Wait until everyone
has joined and all peer connections are open, then every player presses **Ready**.
A roster change clears readiness. Rooms are capped at 16 players; the automated
live test exercises four.

Every peer uses the same sorted player IDs and room seed. Each connects directly
to every other peer and participates in the ready/prepared barrier. There is no
master simulation client. Inputs travel over reliable, ordered WebRTC data
channels; signaling and TURN may use servers, which do not decide game state.
A running room does not accept new players. A disconnected peer ends the match;
return to the menu to form a new room.

The default signaling service is `https://netplayjs.varunramesh.net`.
Set `VITE_SIGNALING_SERVER` to use another compatible service. For local
experiments, `pnpm signaling` starts an invite-only relay on port 3001; open
`http://localhost:3000/#server=http%3A%2F%2F127.0.0.1%3A3001` before starting.
That local relay has no STUN/TURN service, so it is not a cross-network deployment.

## Automated checks

```sh
pnpm exec playwright install chromium firefox webkit
pnpm test:netcode
node tests/signaling.mjs
pnpm build
pnpm lint
```

The netcode check starts Vite and checks that the menu exposes only Solo and
Multiplayer. In each browser it starts solo twice, verifies expulsion conserves
mass, and checks that leaving stops the simulation. It then replays three seeds
for 240 ticks in all three engines, and compares every physics snapshot exactly. It also checks player
ownership, future and late inputs, rollback restoration, prediction bounds,
and ICE configuration compatibility. The replay UI must detect an injected
state mismatch in each engine. Then it joins four real browser peers,
including an invitation through the second peer, clicks the canvases, delays
input delivery to force rollback, compares 180 confirmed ticks, and disconnects
the first peer. It also checks two-player public matchmaking. Predicted states are allowed to differ until inputs arrive.

The live test uses the default signaling service and its STUN/TURN endpoints,
so it requires network access. Override it with `SIGNALING_URL=https://...`.
Use `BROWSERS=chromium,firefox` to investigate selected engines and
`LOBBY_ONLY=1` to run just the live scenario. All engines are tested by default.
Failures and screenshots are saved under gitignored `.scratch/netcode/`.

Simulation trig uses fixed arithmetic sequences, and gravity uses normalized
vectors, eliminating the native trig differences reproduced between engines.
The remaining native `atan2` calculates a local click direction: that numeric
input is transmitted and replayed, rather than recalculated on other peers.
Current verification covers Chromium, Firefox, and WebKit on macOS. Run the
same command on Windows/Linux before claiming those environments were tested.
Replay format 19 stores sphere mass, bonus state, and activation inputs; use recordings from the
same game revision.

## Rollback recovery and diagnostics

Quiet peers send a progress heartbeat every six simulation ticks. Incoming
inputs are collected until the next simulation callback and corrected with one
rewind from the earliest changed frame. The 180-frame prediction limit is
measured from the last fully confirmed state; confirmed snapshots are collected
as simulation advances.

Pacing uses peer progress and the peer's acknowledgement of local progress to
avoid mistaking symmetric network latency for a speed difference. Corrections
are bounded to one additional or skipped tick per six callbacks. A paused peer
can resume by processing its queued messages and catching up; disconnection
still ends the match.

Every peer exchanges SHA-256 checksums at confirmed ticks 0, 60, 120, and so on.
A mismatch stops play and offers **Download desync report**. The JSON contains
the room seed, roster, browser, differing checksums, local snapshots, and recent
inputs. Reports retain up to 20 checkpoints and 12,000 input/progress messages;
they are bounded diagnostic captures, not complete recordings of long matches.
Download before leaving the room. No peer is selected as the correct authority.

`pnpm test:netcode` also checks preconfirmed history, bounded catch-up, symmetric
latency, deterministic burst delivery and pauses, one rewind per input burst,
live browser simulation suspension/recovery, and deliberate checksum corruption
through the real WebRTC/UI path.

## Graphics

Black holes have an opaque horizon at their physical radius, a bright photon
ring, and a decorative accretion glow. Ice blue identifies you, violet identifies
other players, amber marks smaller neutral holes, and coral marks larger ones.
The legend appears beside the controls. Light outside the horizon is decorative.

The sparse starfield is fixed in arena coordinates, so camera movement slides
stars in the opposite direction. Stars use a separate visual seed; drawing never
advances physics or consumes the simulation's random sequence. Cached sprites at several sizes keep gradients out of the per-frame drawing
loop. Sub-three-pixel bodies use simple horizon rings at overview zoom, and the
starfield queries only visible spatial cells.

Run `node tests/graphics.mjs` for three-browser checks of background anchoring,
the opaque horizon, the visible ring, and rendering without state mutation.
Screenshots are written to `.scratch/graphics/`.

## Scaling the simulation

Games now start with **1,000 neutral bodies plus human players and AI rivals** (`INITIAL_BODY_COUNT` in `src/Game.ts`).
Gravity uses a Barnes–Hut quadtree with a shared opening threshold of **0.75**.
Distant cells contribute their combined mass at their center of mass. Nearby
cells are opened and their individual bodies contribute directly. This follows
[Barnes–Hut's cell-opening approach](https://d3js.org/d3-force/many-body#manyBody_theta)
with the game's inverse-square gravity law.

The same tree narrows absorption candidates, while sphere intersections remain
exact and pairs retain ascending body order. Growth updates the collision search
so newly overlapping bodies are included. Absorption finishes before gravity is
accumulated; this changes trajectories from the previous engine. Existing replay
recordings must be compared against the revision that produced them.

Tree insertion, quadrant traversal, collision order, and the opening threshold
are identical on every client. Coincident centers have bounded subdivision and
no random displacement. No time budget or device-dependent physics setting is
used. Render detail depends on zoom and never changes simulation state.

Snapshots copy the known body/vector structure directly, and dead bodies are
compacted in one stable pass. The tree is reconstructed from state each tick,
including during rollback; it is not additional state that peers must synchronize.

```sh
pnpm test:physics
pnpm benchmark
MAX_TICK_MS=16.67 pnpm benchmark
```

The physics check compares absorption with an exhaustive oracle, checks gravity
against direct summation, verifies snapshot isolation and rollback, and compares
all states over 24 ticks at both 1,000 and 5,000 bodies across three browsers.
The tested distributed and clustered scenes have about 0.3% relative RMS gravity
error; the regression ceiling is 2%. This is a sampled accuracy check, not an
error bound for every possible configuration.

The benchmark reports medians after warm-up at 200, 1,000 and 5,000 bodies. It
separates physics, snapshot copying, normal-view drawing and arena overview.
Drawing timings measure Canvas command submission and may include browser
backpressure; they are not end-to-end display frame times. The optional budget
checks only the 5,000-body physics tick. Results go to `.scratch/performance/`.

## Sphere mass

Mass is proportional to radius cubed: `π × radius³ / 100`. This is a
uniform-density sphere calibrated to preserve the old attraction at radius 100.
At the same distance, radius 200 has eight times the pull of radius 100.
Absorption transfers overlapping sphere mass; expulsion emits 5% of the body's
mass. Radii are recomputed using shared fixed arithmetic, and Barnes–Hut centers
of mass use the same sphere masses. This is a gameplay model, not relativistic
black-hole physics. Old area-based replays are incompatible; all peers must run
the same build.

Each absorption transfers momentum with the absorbed mass: the receiving body's
velocity becomes `(M × V + transferredMass × donorVelocity) / (M + transferredMass)`.
The donor's remaining mass keeps its velocity. This conserves linear momentum
during full and partial absorption. Expulsion also conserves momentum: the
projectile inherits the original velocity plus its ejection velocity, while the
remaining body recoils by `ejectedMass / remainingMass × ejectionVelocity`.
Gravity approximation and wall collisions remain separate gameplay effects.

## In-game controls

The top-left menu opens help and **Back to menu**. Click outside it or press
Escape to close it. The menu does not pause the simulation. Your current item is a compact icon button at the bottom. The menu explains each
item icon and lets you place the button left, center, or right; the choice saves
in this browser. Scroll or pinch to
zoom; the closest view spans 10 times the focused body's radius.

## Mystery bonuses

Mint glowing **quantum fluctuations** appear in waves of three every four seconds,
starting four seconds into the match. Their positions and hidden items come from
the match seed and tick. Half spawn near a living player or AI; the rest appear
across the current arena. At most 24 loose fluctuations exist, expiring after
45 seconds. They can be eaten by black holes but cannot absorb anything themselves.
There are no items on starting bodies. Supermassive retains a 1/7 chance among
normal items; each other normal item has a 2/7 chance.

Collecting a normal fluctuation immediately replaces the consuming player's stored
item. Neutral black holes carry items with mint dashed rings and a **?**; fully
absorbing them awards the item to the largest surviving player contributor.

After a minute, 20% of new fluctuations instead carry **Hawking Radiation**, shown
in amber. Any black hole consuming one automatically sheds 2.4% of its current
mass every 0.1 seconds for five seconds (about 70% mass loss, or one-third radius loss, before reabsorption).
Fragments inherit the source velocity plus one fragment-radius per tick outward.
They fly in seeded random directions with opposite recoil, preserving
mass and momentum. Regular black holes trigger the same effect immediately.
Radiation can coexist with an active item; collecting it again refreshes its timer.

You have one stored slot. Collecting another replaces that slot; press **Space**
or tap the bonus button to activate it. An active effect cannot be stacked or
replaced by activation, but another bonus can be stored while it runs.

- **Accretion Surge:** 3× pull toward you for smaller bodies, for 6 seconds.
- **Repulsion Shield:** five seconds of protection from larger black holes. Contacts bounce elastically, conserving momentum and kinetic energy. Smaller bodies remain edible.

- **Relativistic Jet:** 6× ejection speed for 5 seconds, at the same mass cost.
- **Supermassive:** 8× effective gravitational mass for 3 seconds, with expulsion locked.
  Radius shrinks linearly to 50% over the first 30 ticks (500 ms), holds for
  120 ticks, and expands over the final 30 ticks. Mass stays unchanged and
  absorption is decided by physical radius, so a larger-radius body can eat you
  even if it has less mass. The gravity boost is 2³ = 8, equivalent to doubling
  the radius of a sphere; it creates no transferable mass. Contacts and arena collisions use the
  compressed radius; absorbed mass is retained when the body expands.
  `node tests/supermassive.mjs` checks the entire curve, density, tiny bodies,
  snapshot restoration and late-input rollback across all three browsers.

Item visuals use bounded procedural particles: amber streams fall inward for
Accretion Surge, coral particles and a shockwave expand outward for Repulsion
Pulse, and blue streaks trail Relativistic Jet. Supermassive adds dense spiraling
particles, a bright accretion disk, and collapsing violet rings. The renderer
respects reduced-motion preferences and never changes body mass, radius, or
physics RNG. Pulse visuals expire after 48 ticks and are deduplicated during
rollback resimulation.

Effects use fixed simulation ticks and are included in rollback snapshots and
replay diagnostics. AI rivals use shields against close threats, jets for escape or long pursuits,
surge near food, and Supermassive only near food when moving slowly without a
nearby threat. Decisions still use one body scan twice per second per rival. `pnpm test:bonuses` covers collection, replacement, credit, effects,
expiration, controls, and cross-browser rollback. All multiplayer peers must
refresh to the same game build.

## Charged shots

A press shorter than 180 ms fires a normal shot on release. Holding shows a small
charge bar above the pointer, reaching full charge one second after pressing by default.
Drag to aim and release to fire: 0% charge is 1× speed, 50% is 2×, and 100% is 4×,
with linear ramps between these points. Mass cost remains 5%; recoil scales with
projectile speed to conserve momentum. Jet multiplies the resulting speed too.
Full charge can be held indefinitely; there is no overcharge penalty yet.
Pinching, cancelling the gesture, losing focus, or becoming unable to fire cancels
the charge. Multiplayer transmits the released shot's integer charge percentage
with its direction; replay and rollback use that same input.
Run `pnpm test:charged-shots` for mouse/touch, cancellation, physics, and rollback checks.

## Shared menu components

`src/menu-ui.css` owns control sizing, card surfaces, and focus styles for both React and Lit menus. Apply `menu-ui` to a menu container and `menu-card` to its card or popover. Use the shared CSS variables for spacing; keep screen-specific layout in `index.css`. Controls have 44px minimum touch targets, and cards use 12px padding. Multiline choices can grow to fit their labels. Run `node tests/menu-ui.mjs` to check consistent geometry across Chromium, Firefox, and WebKit.

## AI performance benchmark

Run `pnpm benchmark:ai` for 72 seeded, real-physics runs comparing the current AI with passive and nearest-food policies. Results and a worst-run viewer are saved in `.scratch/ai-benchmark/`. See [the benchmark guide](tests/AI-BENCHMARK.md) for scenarios, metrics, limitations, and comparison against the committed baseline.
