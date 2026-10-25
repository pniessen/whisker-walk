# Stream 4 step 2 — Adaptive "Auto" quality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** With Graphics quality on Auto, every device starts a walk on the high-tier knobs with 22 strays, watches its own frame time, and quietly steps down one rung at a time if frames are sustained slow — remembering the verdict per device.

**Architecture:** A four-rung ladder of frozen tier objects in `render/quality.js` (rung 0 = today's HIGH + 22 strays, rung 3 = today's LOW + 14 strays). A pure, allocation-free frame governor and a pure per-device memory live in a new leaf `render/adaptive.js`. A thin runtime adapter `game/adaptquality.js` owns the renderer pixel ratio, the live step-downs and localStorage; `walk.js` asks it for the walk's tier and `main.js` feeds it one call per frame. First, strays move off the shared `walkRng` onto their own room-seeded stream so devices on different rungs stay in step.

**Tech Stack:** three.js r185, vanilla ES modules, vitest (node env).

**Spec:** `docs/superpowers/specs/2026-10-24-whisker-walk-v21-reason-to-come-back-design.md` — "Stream 4" and §8 ("promote individual knobs against measured numbers; do NOT simply force HIGH on iOS").

## Global Constraints

- Never implement on main. No SQL. `SAVE_VERSION` stays 4 — nothing new goes in the save.
- The device's step-down lives in `localStorage['whisker-walk-adapt']`, every read/write in try/catch. Never in progression/the cloud save.
- Manual "High" / "Low" in Settings wins and turns adaptation off. Auto + reduced motion stays LOW with adaptation off (unchanged).
- Desktop: **the same adaptation runs on desktop Auto** (protects a weak laptop iGPU). A healthy desktop never trips it (owner's M2: worst frame 9.4 ms against a 20 ms threshold), so its behaviour is unchanged in practice.
- Live mid-walk changes: pixel ratio, and postFx (bloom faded to zero over 1.5 s, then the composer dropped). Shadow map size, normal maps, env intensity and stray count change only at the next walk. No messages, no flashes.
- Per-frame paths allocate nothing (typed arrays, preallocated objects; strings only at step-down time, which is rare).
- Commit trailer: `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
- Tests: `npx vitest run --exclude '.claude/**'`.
- Stream 3b is editing `walk.js` / `interactions.js` in parallel: keep `walk.js` edits to the three spots named below.

## The numbers, and why

| Knob | Value | Why |
|---|---|---|
| `slowMs` | 20 ms | iPhone 18 on HIGH: worst frame 18 ms in both areas. 20 sits above its *worst*, so the target phone never trips. Over half the frames above 20 ms means a median under 50 fps — on a 60 Hz phone that is missing vsync most frames. |
| rule | more than half the frames in the window > `slowMs` | Equivalent to "median > 20 ms", but O(1) per frame with a running count — no sort. |
| `windowMs` | 4000 | Long enough that a GC pause, a shader compile or a burst of particles (single frames) can't reach 50%; short enough to react within a walk. |
| `warmupMs` | 5000 | Walk start compiles shaders and uploads textures; those frames are not the device's steady state. |
| `settleMs` | 1000 | After a step-down, ignore 1 s (buffer reallocation) then collect a fresh full window. Steps are ≥ 5 s apart. |
| `maxGapMs` | 250 | Gaps longer than this are a background tab, a debugger, or automation's throttled rAF — not a slow frame. Discarded. (A device genuinely at 4 fps is outside what this game supports.) |
| `minSamples` | 30 | A decision needs at least 30 kept frames in the window (≥ 7.5 fps). |
| bloom fade | 1500 ms | Bloom's threshold is 1.1, so by day it barely shows; fading it rather than cutting it means even a dusk walk's window glow softens instead of popping. |

**Rung order.** The owner's phone readings show CPU at 4.6–5.5 ms of a 16.7 ms frame, so a phone that struggles is GPU/fill-bound. Fill rate goes first:

| Rung | name | Changes from the rung above | Live? |
|---|---|---|---|
| 0 | `high` | today's HIGH, `strays: 22` | — |
| 1 | `high` | `pixelRatioCap` 2 → 1.5 (44% fewer pixels) | live |
| 2 | `high` | `postFx` off, `msaaSamples` 0 (bloom + two full-screen passes) | live, faded |
| 3 | `low` | today's LOW exactly: shadow 1024, normal maps off, env 0.32, `strays: 14` | next walk |

Rung 3 is the floor: it is exactly what every phone gets today, so adaptation can never make a device worse than it is now. `name` stays `'high'`/`'low'` because `textures.js` and `water.js` read it.

**Retry rule.** At walk start, if remembered rung > 0, at least 5 walks have started since the last step-down, and `waitDays` days (start 7) have passed since it, start one rung higher and mark `retrying`. If that walk steps down again, `waitDays` doubles (cap 56) and the clock restarts. If the next walk starts with `retrying` still set (no step-down happened), it succeeded: `waitDays` resets to 7. One rung at a time, never more.

**Thermal gap.** No 5-minute reading exists. The governor runs for the whole walk, not just its start, so a phone that heats up at minute 4 steps down then; the remembered rung means it starts lower next time, and the weekly retry lets a cool phone climb back.

## Review Focus

1. **Throttled rAF in a browser pane / backgrounded tab** must never step down or write memory → test in Task 3 (`300 ms gaps never trigger`).
2. **localStorage throws or holds garbage** (Safari private mode, a hand-edited value) → defaults, never throws → Task 3 memory tests.
3. **Walk ends mid bloom-fade** → next walk's bloom strength is back at 0.35 and `useComposer` follows the new tier → Task 4 test.
4. **A rung-1 walk followed by a rung-0 walk** → the composer's pixel ratio follows the renderer (EffectComposer caches `_pixelRatio` at construction) → Task 4 test.
5. **Mixed rungs in a co-walk** → identical shared draws → Task 1 tests. Note: clients from before this branch and after it disagree about treats/goals in a co-walk (the stream layout changed); same-version clients agree.

---

### Task 1: Strays get their own seeded stream

**Files:**
- Modify: `src/straycats.js` (export `strayStream`, header comment), `src/game/walk.js:733` (the createStrayCats call only), `src/enemies.js:119-123` (comment only)
- Test: `test/straycats.test.js`, new `test/cowalkstreams.test.js`

**Interfaces:**
- Produces: `strayStream(roomSeed: number|undefined): () => number` — `mulberry32(((roomSeed >>> 0) ^ STRAY_SPAWN_SALT) >>> 0)` when defined, else `Math.random`. `STRAY_SPAWN_SALT = 0x57a7ca75` (distinct from `WANDER_SALT` and sky life's `0x5eaf00d`).

- [ ] **Step 1: Write the failing tests** in `test/cowalkstreams.test.js`:
  - `strayStream(1234)` and a second `strayStream(1234)` yield the same first 10 values; `strayStream(1234)` differs from `mulberry32(1234)` in its first value.
  - `strayStream(undefined)` is `Math.random`.
  - Two devices, roomSeed 99, `createStrayCats(scene, area, 14, strayStream(99), { roomSeed: 99 })` vs `(…, 22, …)`: the first 14 strays match on `name`, `group.position.x/z`, `group.rotation.y`, `personality`, `timer`.
  - Shared-stream test: two `mulberry32(99)` walkRngs; device A spawns 14 strays on `strayStream(99)`, device B 22; then each runs `rollTreats(walkRng, pois, 2)` and `createGoals(walkRng)` — results are deep-equal.
  - Source guard: read `src/game/walk.js`; the `createStrayCats(` call's argument list does not contain `walkRng`, and contains `strayStream(roomSeed)`; and the stray count expression is `tier.strays` (this last assertion is added in Task 5 — leave it out here).
- [ ] **Step 2:** Run `npx vitest run --exclude '.claude/**' test/cowalkstreams.test.js` → FAIL (`strayStream` not exported).
- [ ] **Step 3:** Implement `strayStream` in `src/straycats.js`; in `walk.js` pass `strayStream(roomSeed)` instead of `walkRng` to `createStrayCats`. Rewrite the createStrayCats header paragraph "THE DRAWS ARE THE SAME" and the walk.js comments around :680-735 that say strays draw from walkRng, so they say: strays draw from their own room-seeded stream, so the stray count costs walkRng nothing; colony cats still spend their full draws so a colony difference doesn't shift the stray stream. Fix the `test/straycats.test.js:957` comment ("shifts gifts, weather, secrets and goals") to say it shifts the stray stream. Update `src/enemies.js` comment's line reference.
- [ ] **Step 4:** Run full suite → PASS.
- [ ] **Step 5: Commit** `fix(strays): spawn strays from their own room-seeded stream so stray count never shifts walkRng`

### Task 2: The quality ladder

**Files:**
- Modify: `src/render/quality.js`, `test/quality.test.js`

**Interfaces:**
- Produces: `LADDER: readonly Tier[4]` (frozen; rungs per the table above; each tier gains `rung: number` and `strays: number`); `FLOOR_RUNG = 3`; `HIGH === LADDER[0]`, `LOW === LADDER[3]`; `resolveQuality({ reducedMotion, override, rung = 0 }): Tier` — `'high'` → HIGH, `'low'` → LOW, auto + reducedMotion → LOW, else `LADDER[clamp(rung|0, 0, 3)]`; `isAdaptive({ reducedMotion, override }): boolean` — `override === 'auto' && !reducedMotion`. The `coarse` parameter is removed.

- [ ] **Step 1:** Update tests: the `high`/`low` literals gain `rung` 0/3 and `strays` 22/14; "auto → low on a coarse pointer" becomes "auto starts at rung 0 whatever the pointer"; new: `resolveQuality({ override:'auto', reducedMotion:false, rung:1 })` has `pixelRatioCap` 1.5, `postFx` true, `name` 'high'; rung 2 has `postFx` false, `msaaSamples` 0, `shadowMapSize` 2048, `normalMaps` true; rung 3 `toEqual(low)`; rung 7 and rung -1 clamp to 3 and 0; rung `NaN` → 0; manual 'high' ignores `rung:3`; `isAdaptive` truth table; every LADDER entry is frozen and `shadowFitRadius` is 20 on all four.
- [ ] **Step 2:** Run `test/quality.test.js` → FAIL.
- [ ] **Step 3:** Implement. Keep the existing per-knob comments; add one short comment above LADDER pointing to this plan's table for why the order is fill-rate first.
- [ ] **Step 4:** Run `test/quality.test.js` → PASS (the walk.js caller still passes `coarse`; it is ignored until Task 5).
- [ ] **Step 5: Commit** `feat(quality): a four-rung ladder from high to today's low, with stray count as a knob`

### Task 3: Pure governor and per-device memory

**Files:**
- Create: `src/render/adaptive.js`, `test/adaptive.test.js`

**Interfaces:**
- Produces:
  - `ADAPT` frozen `{ warmupMs: 5000, windowMs: 4000, slowMs: 20, maxGapMs: 250, minSamples: 30, settleMs: 1000 }`
  - `createFrameGovernor(opts = ADAPT)` → `{ restart(nowMs: number, delayMs: number): void, sample(nowMs: number): boolean, lastSlowFraction(): number }`. `sample` computes dt from its own previous `nowMs` (first call after `restart` only records the time). Ignores samples before `armedAt = restart's now + delayMs`, and gaps `> maxGapMs` or `<= 0` (still advances the previous time). Keeps a ring (capacity 1024) of stamps + slow flags with a running slow count, evicting stamps older than `nowMs - windowMs`. Returns `true` when the window spans `>= windowMs` since the first kept sample after arming, has `>= minSamples`, and `slowCount * 2 > count`; on `true` it records the fraction for `lastSlowFraction()` and clears the ring (caller then calls `restart(now, settleMs)`). No allocation in `sample`.
  - `DEFAULT_MEMORY` frozen `{ rung: 0, steppedAt: 0, walks: 0, waitDays: 7, retrying: false }`; `MEMORY_KEY = 'whisker-walk-adapt'`
  - `readMemory(storage): Memory` — try/catch; sanitizes every field (rung integer clamped 0..3; `steppedAt` finite ≥ 0; `walks` integer ≥ 0; `waitDays` clamped 7..56; `retrying` boolean); anything else → a fresh copy of DEFAULT_MEMORY.
  - `writeMemory(storage, mem): void` — try/catch, swallows.
  - `planWalkStart(mem, nowMs): { rung: number, reason: 'top'|'remembered'|'retry', mem: Memory }` — pure, returns a new mem. Applies the retry rule above (5 walks, `waitDays * 86_400_000` ms) and the success reset (`retrying` true on entry → `waitDays` 7, `retrying` false); increments `walks`. Reason `'top'` when rung 0.
  - `noteStepDown(mem, newRung, nowMs): Memory` — pure; `rung = newRung`, `steppedAt = nowMs`, `walks = 0`; if `mem.retrying`, `waitDays = min(waitDays * 2, 56)` and `retrying = false`.

- [ ] **Step 1: Write the failing tests** (frames fed at a fixed step with a helper `feed(gov, startMs, stepMs, durationMs)` returning the first `nowMs` where `sample` returned true, or -1):
  - steady 16 ms for 60 s → -1
  - steady 30 ms → triggers once, at a time between 9000 and 9100 ms after `restart(0, 5000)`; after `restart(t, 1000)` with 30 ms frames continuing, triggers again ≈ 5 s later
  - one-off hitches: 16 ms with a 120 ms frame every 2 s and one 240 ms frame → -1
  - slow during warm-up only (30 ms for 5 s, then 16 ms) → -1
  - slow then recovers: 30 ms for 3 s after warm-up, then 16 ms → -1
  - 300 ms gaps (throttled rAF) for 60 s → -1
  - exactly half slow (alternating 16/30) → -1 (strictly more than half)
  - 10 fps (100 ms frames) → triggers (≥ 30 samples in 4 s)
  - `lastSlowFraction()` after a steady-30 trigger is 1
  - memory: `readMemory` with a storage whose `getItem` throws → DEFAULT_MEMORY; with `'{bad'` → default; with `{"rung":9,"walks":-3,"waitDays":1000,"retrying":"yes"}` → rung 3, walks 0, waitDays 56, retrying false; `writeMemory` with a throwing `setItem` does not throw; round-trip through a Map-backed storage.
  - `planWalkStart`: rung 0 → reason 'top'; rung 2, walks 4, 30 days ago → rung 2 'remembered', walks 5; rung 2, walks 5, 8 days ago → rung 1 'retry', retrying true; rung 2, walks 5, 3 days ago → 2; `retrying` on entry → waitDays 7, retrying false.
  - `noteStepDown` during a retry doubles waitDays 7 → 14, and 40 → 56; outside a retry leaves waitDays.
- [ ] **Step 2:** Run `test/adaptive.test.js` → FAIL.
- [ ] **Step 3:** Implement `src/render/adaptive.js` as a DOM-free, three-free leaf (header comment states the numbers' reasons in two or three lines and points to this plan).
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** `feat(adaptive): a pure frame-time governor and per-device rung memory`

### Task 4: Runtime adapter and composer hooks

**Files:**
- Modify: `src/game/composer.js` (add `setPixelRatio(pr)`, `setBloomStrength(s)`, export `BLOOM_STRENGTH = 0.35` used by `ensure`), `test/composer.test.js`
- Create: `src/game/adaptquality.js`, `test/adaptquality.test.js`

**Interfaces:**
- Consumes: `LADDER`, `FLOOR_RUNG`, `resolveQuality`, `isAdaptive` (Task 2); `createFrameGovernor`, `ADAPT`, `readMemory`, `writeMemory`, `planWalkStart`, `noteStepDown` (Task 3).
- Produces: `createQualityAdapter({ renderer, composerRig, storage, devicePixelRatio = () => window.devicePixelRatio, wallClock = () => Date.now() })` →
  - `beginWalk({ override, reducedMotion, nowMs }): Tier` — resolves the tier (adaptive: from `planWalkStart(readMemory(storage), wallClock())`, writing the returned memory); sets `renderer.setPixelRatio(min(dpr, tier.pixelRatioCap))` and `composerRig.setPixelRatio(renderer.getPixelRatio())`; resets bloom to `BLOOM_STRENGTH`; `governor.restart(nowMs, ADAPT.warmupMs)`.
  - `frame(session, nowMs): void` — no-op when not adaptive, no session, or at the floor. While a bloom fade is active it only advances the fade (`setBloomStrength` linearly 0.35 → 0 over 1500 ms, then `session.useComposer = false` and `governor.restart(nowMs, ADAPT.settleMs)`) and does not sample. Otherwise `governor.sample(nowMs)`; on true, steps down one rung: rung 1 → pixel ratio as in beginWalk; rung 2 → starts the fade; rung 3 → nothing live. Writes `noteStepDown(...)` to storage immediately, sets status, `governor.restart(nowMs, ADAPT.settleMs)`.
  - `status`: one preallocated object `{ mode: 'auto'|'manual'|'reduced-motion', rung, startRung, startReason, change: string }`; `change` is built only at step-down: `` `${from}→${to}: ${pct}% of frames over 20 ms for 4 s` `` plus `' (next walk)'` for rung 3.

- [ ] **Step 1: Write the failing tests** with fakes (renderer: `setPixelRatio`/`getPixelRatio`; composerRig: spies for `setPixelRatio`/`setBloomStrength`; Map storage; session `{ useComposer: true }`; dpr 3):
  - auto, empty storage → rung 0, pixel ratio 2, `composerRig.setPixelRatio(2)`, storage now holds walks 1.
  - injected 30 ms frames from nowMs 0: by ~9.1 s pixel ratio is 1.5 and status.rung 1; by ~14.2 s the fade has started; 1.5 s later `useComposer` false and last bloom strength 0; by 21 s status.rung 3, `change` ends in '(next walk)', pixel ratio still 1.5; storage rung 3; further slow frames change nothing.
  - steady 16 ms for 60 s → nothing called after beginWalk, storage rung 0.
  - manual 'high' with 30 ms frames → never steps; storage untouched (no key written).
  - reduced motion auto → LOW, mode 'reduced-motion', never steps.
  - remembered rung 1 → beginWalk returns LADDER[1], pixel ratio 1.5, startReason 'remembered'.
  - walk ends mid-fade, next `beginWalk` → `setBloomStrength(0.35)` called; new session's `useComposer` untouched by the old fade.
  - storage whose `setItem` throws → stepping still works, nothing throws.
  - composer: `setPixelRatio` before `ensure` is a no-op; after `ensure`, it forwards to the EffectComposer; `setBloomStrength` sets `bloomPass.strength`.
- [ ] **Step 2:** Run both test files → FAIL.
- [ ] **Step 3:** Implement. `frame` allocates nothing.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** `feat(adaptive): a runtime adapter that steps a walk down live and remembers it per device`

### Task 5: Wire it in, and the readout

**Files:**
- Modify: `src/game/walk.js` (deps add `qualityAdapter`; lines ~299-310 tier resolution; ~733 stray count), `src/main.js` (create adapter after settings; pass to walk; `qualityAdapter.frame(session, performance.now())` right after `renderFrame()` in the loop; pass to perf HUD), `src/ui/perfhud.js`, `test/perfhud.test.js`, `test/cowalkstreams.test.js`
- Docs: `docs/VISUAL-PASS.md` — a short "Adaptive Auto (Stream 4 step 2)" section with the rung table and the threshold reasons.

**Interfaces:**
- Consumes: `createQualityAdapter` (Task 4).
- walk.js: `const tier = qualityAdapter.beginWalk({ reducedMotion, override: settings.get('quality'), nowMs: performance.now() });` then `setTextureTier(tier)`; remove the old `renderer.setPixelRatio` line and the `resolveQuality` import if unused; stray count `isDen ? 0 : tier.strays`. `coarse` stays in the deps list (other uses).
- perfhud: `createPerfHud({ renderer, settings, coarse, adapter })`; snapshot gains `adapt` string set at refresh from `adapter.status` (built in the 500 ms refresh only); `postFx` reads `session.useComposer` (live) instead of `tier.postFx`. New 8th line between the shadow line and the px line: `auto rung 1/3 · start 0 (top) · 0→1: 72% of frames over 20 ms for 4 s` or `manual` / `reduced motion` with no rung; `change` omitted when empty.

- [ ] **Step 1:** Tests: perfhud `formatPerfLines` expects the eight lines (sample gains `adapt: 'auto rung 0/3 · start 0 (top)'`); the cowalkstreams source guard gains `tier.strays` and asserts `coarse ? 14 : 22` is gone.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement the wiring and the doc section.
- [ ] **Step 4:** Run the full suite → PASS; `npx vite build` succeeds.
- [ ] **Step 5: Commit** `feat(adaptive): Auto starts every device on the high rung and adapts; ?perf shows the rung`
