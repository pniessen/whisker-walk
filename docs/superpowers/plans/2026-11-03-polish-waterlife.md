# polish-waterlife Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The water gets a life of its own: ripple rings round a wading cat, an occasional fish that jumps out of a lake with a splash, water that warms at sunset and darkens at dusk, calmer shore foam at dusk, and a rounded (not square) outer corner where the Woods stream bends north.

**Architecture:** All render-side, all added after the area build (no new mesh inside any `build()`). Wading rings reuse splash.js's existing ring pool. Fish are one new pooled `InstancedMesh` in a new `src/render/fishjump.js`, timed off the wall clock hashed with the area id, and splash through a new `splash.emitAt()`. Evening looks are a per-walk tint on each water handle's own (per-walk) material plus a foam colour choice in waterdress.js. The Woods fillet is a small opaque ground-coloured fan over the water corner plus band samples bent onto the arc, in waterdress.js.

**Tech Stack:** Three.js 0.185, Vite 8, Vitest 4.

**Spec:** scratchpad `polish-survey-4.md`, ranked #4 and broken #3, build 4A-4; shared rules in scratchpad `polish-common.md` (final section).

## Global Constraints

- Files owned: `src/render/splash.js`, new `src/render/fishjump.js`, `src/render/water.js`, `src/render/waterdress.js`, one fishjump block + the existing waterDress call + endWalk dispose line in `src/game/walk.js`. One flagged line in `src/main.js` (render loop `session.fish.update(dt)`). Touch nothing else.
- No `Math.random`, no draws on walkRng or strayStream. Seeded helpers only (`mulberry32`, `seedFromCode` from `src/rng.js`).
- Flat trace stays sha256 `3dfb11a4d847498330c2f1bbc766add06531d4efadaab4c710868df495c1d838`; waterlooks BUILD_DRAWS pins unchanged (nothing new inside a build).
- No per-frame allocation in update paths (pooled meshes, preallocated vectors).
- New meshes: `castShadow = false`, `receiveShadow` false (fish) , `userData.noCast = true`, invisible (0 draws) when idle.
- Reduced motion: no wading rings (splashEmits already returns early), no fish at all; evening tints and fillet still apply (they are still images).
- Tests: `npx vitest run --exclude '.claude/**' --exclude '.worktrees/**'`; long geometry sweeps get explicit timeouts (120_000). Float fixture compares use `closeDiffs`.
- Commits: explicit `git add <paths>`; message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. A co-walker's cat wading (main.js tracks remotes through the same `splash.track`) must also get wading rings, and a remote cat's state object must not break when the new stop flag is missing on it — test in Task 1 that a fresh `{ mode: 'wade' }` state works.
2. A walk on an area with no qualifying lake (neighbourhood, docks, seaside, gorge, den) must get the fish stub with zero meshes — test in Task 2.
3. A dusk walk has no weather (walk.js skips createWeather at dusk) and a sunset walk is never dusk: the evening mode must be exactly one of `null | 'sunset' | 'dusk'` — test in Task 3 that `null` leaves every colour untouched.
4. A backgrounded tab returning after minutes: fish timing reads the wall clock, so a large clock jump must not start more than one fish or leave a fish stuck mid-air — test in Task 2.
5. The Woods fillet must not disturb other areas' bands: the band geometry for river/moor/pines is unchanged (vertex count and positions identical) — test in Task 4.

---

### Task 1: Wading rings and `splash.emitAt`

**Files:**
- Modify: `src/render/splash.js`
- Test: `test/splash.test.js`

**Interfaces:**
- Produces: `splash.emitAt(x, z, { ring = true, drops = 0, k = 1 } = {})` on the object `createSplash` returns (and a no-op on `NO_SPLASH`): spawns one ring of kind `FISH_RING` (`{ r0: 0.1, r1: 0.7, ttl: 1.1 }` × k) at (x, z) when `ring`, and `drops` droplets thrown up from (x, RING_Y, z) (the entry-splash spread: h 0.4–0.9 m/s, v 1.4–2.0 m/s, ttl DROP_TTL). Under reduced motion it does nothing.
- Produces: `WADE_RING_EVERY = 0.35` exported constant.

- [ ] **Step 1: Write the failing tests** in `test/splash.test.js` (`splashEmits` block):
  - `'wading while moving leaves a ring every 0.35 s'`: state `{ mode: 'wade' }`, speed 1, 120 frames of dt 1/60 → total `out.ring` summed is 5 (2 s / 0.35 → 5), drops bursts still 9.
  - `'a wading cat that stops leaves one ring that frame'`: 30 moving frames then one still frame → that frame `out.ring === 1`; 60 more still frames → 0 rings.
  - `'a fresh remote wade state ({ mode: "wade" }) emits rings without throwing'`.
  - Reduced motion: wading emits no rings (extend the existing reduced-motion case).
  - In `createSplash`: `'emitAt spawns a ring and drops and a no-op under reduced motion'` (rings mesh count 1, drops count n after `update(0.016)`; with `reducedMotion: true` both counts 0); `'NO_SPLASH.emitAt is a no-op'`.
  - Update the existing `'a moving wader draws drops; a wading cat standing still draws nothing'` only as far as it now also sees a ring while moving (a cat that never moved still draws nothing).
- [ ] **Step 2: Run** `npx vitest run test/splash.test.js` — new cases FAIL.
- [ ] **Step 3: Implement.** In `splashEmits`' wade branch: keep a wade ring clock on `st.wadeRingClock` (treat undefined as 0) and a `st.wadeMoving` flag; while moving, emit `out.ring = 1` each WADE_RING_EVERY; on the first still frame after moving emit one ring and clear the flag. Reset both in the dry/reduced-motion early return. In `track`, a wade ring uses kind `WADE_RING = { r0: 0.1, r1: 0.45, ttl: 0.9 }` × k at the cat's position nudged 0.1 × k forward (the front paws); swim rings unchanged. Add `emitAt` and the stub's no-op.
- [ ] **Step 4: Run** `npx vitest run test/splash.test.js` — PASS (all cases, including the allocation test).
- [ ] **Step 5: Commit** `feat(splash): wading leaves ripple rings at the paws, and one when the cat stops; emitAt for other splashes`.

### Task 2: Jumping fish (`src/render/fishjump.js`) and wiring

**Files:**
- Create: `src/render/fishjump.js`
- Modify: `src/game/walk.js` (one block after `createWaterDressing`, a `fish` field on the session, `session.fish.dispose()` beside `session.splash.dispose()` in endWalk), `src/main.js` (one line, FLAGGED: `session.fish.update(dt);` immediately before `session.splash.update(dt);`)
- Test: `test/fishjump.test.js`

**Interfaces:**
- Consumes: `splash.emitAt(x, z, { ring, drops, k })` from Task 1.
- Produces: `createFishJumps(scene, { areaId, areaData, tier, reducedMotion, splash, cat, camera, now = () => Date.now() / 1000 })` → `{ meshes, spots, update(dt), dispose(), get drawCount() }`; `NO_FISH` stub (frozen, `meshes: []`, `spots: []`); exported pure helpers `fishSpots(areaId, areaData) → [{ x, z, y }]`, `jumpAt(areaId, slot) → { at, pick, len, height, yaw }` (all 0..1 numbers except `at` in seconds within the slot), constants `FISH_SLOT = 14`, `FISH_JITTER = 6`, `FISH_DUR = 0.9`, `FISH_NEAR = 6`, `FISH_FAR = 25`, `FISH_CAP = 3`.

Behaviour decisions (from the spec):
- **Where:** `fishSpots` samples a 2 m grid over `bounds` expanded by 10 m; a point qualifies when `waterClearance(areaData.waters, x, z) < -2.5` (≥ 2.5 m from every shore, decks excluded by waterClearance itself), and the water under it is a handle in `areaData.waterFx` whose `style` is not `'sea'` and not `'bog'`. Areas `docks`, `gorge`, `seaside`, `neighborhood`, `den` → none. Keep at most 64 spots, thinned deterministically (stride). `y` = that handle's `y`. Return `NO_FISH` when no spots, or under reducedMotion.
- **When:** wall-clock slots of `FISH_SLOT` s: slot `k = floor(now / FISH_SLOT)`; its jump starts at `k * FISH_SLOT + FISH_JITTER * h` with `h` from `mulberry32(seedFromCode(\`fish-${areaId}-${k}\`))` — so gaps run 8–20 s and co-walkers on the same map agree on the time. Each slot jumps at most once (remember the last slot fired). If `now` jumps forward by more than one slot (backgrounded tab), only the current slot may fire, and only if its start is within the last 0.5 s.
- **Which spot:** among `spots` 6–25 m from the cat and inside the camera's forward cone (dot of flat camera forward and flat direction > cos 55°), take index `floor(pick * n)`. None in range → that slot is skipped.
- **The arc:** the fish leaves at the spot, travels `0.7 + 0.5 * len` m along `yaw`, peak `0.45 + 0.3 * height` m, over `FISH_DUR` s (parabola); its nose pitches along its velocity. `splash.emitAt(start, { ring: true, drops: 5 })` on leaving and `emitAt(end, { ring: true, drops: 7 })` on landing.
- **The mesh:** one `InstancedMesh` named `'fishJump'`, capacity `FISH_CAP`, geometry merged once at construction: a body (8-sided lathe/ellipsoid, ~16 triangles, length 0.32, height 0.09, width 0.05) plus a forked tail fin (2 triangles) — ≤ 24 triangles total; `MeshStandardMaterial({ color: 0xc9d3dc, roughness: 0.35, metalness: 0.4, flatShading: true })`. `castShadow` / `receiveShadow` false, `userData.noCast = true`, `frustumCulled = false`, `visible` only while a fish is live (`count` = live fish), DynamicDrawUsage, no allocation in `update`.

- [ ] **Step 1: Write the failing tests** in `test/fishjump.test.js` (build the real areas the way `test/waterdress.test.js` does):
  - `'woods, pines, moor, river and park have lake spots; streams do not'`: `fishSpots` non-empty for those five; every spot has `waterClearance < -2.5`; no Woods spot lies in `river-west`/`river-north` only.
  - `'neighbourhood, docks, seaside and gorge get NO_FISH'` (and reducedMotion on woods → NO_FISH, no mesh added to the scene).
  - `'jumpAt is deterministic and starts 8–20 s apart'`: same args same result; for k 0..200, consecutive starts differ by ≥ 8 and ≤ 20.
  - `'a fish arcs out and back within FISH_DUR and splashes twice'`: stub splash recording `emitAt` calls; fake `now`; cat at a spot's 10 m distance with camera looking at it; stepping 1/60 s through one slot: mesh visible during the jump only, peak y between 0.45 and 0.75 above the water, 2 `emitAt` calls, `drawCount` 0 after landing.
  - `'a clock jump of 10 minutes starts at most one fish and never leaves one mid-air'`.
  - `'allocates nothing over 60 s of updates'` (copy splash.test.js's allocation technique).
  - `'dispose removes the mesh'`.
- [ ] **Step 2: Run** `npx vitest run test/fishjump.test.js` — FAIL (module missing).
- [ ] **Step 3: Implement** `src/render/fishjump.js` with a header comment in the style of splash.js (budget, purely local, reduced motion).
- [ ] **Step 4: Wire it.** walk.js, right after `createWaterDressing(...)`: `const fish = createFishJumps(scene, { areaId, areaData, tier, reducedMotion, splash, cat, camera });` with a two-line comment; add `fish,` to the session beside `splash`; `session.fish.dispose();` beside `session.splash.dispose();`. main.js: `session.fish.update(dt);` right before `session.splash.update(dt);` (the fish's splashes are drawn the same frame).
- [ ] **Step 5: Run** `npx vitest run test/fishjump.test.js test/splash.test.js test/waterlooks.test.js test/flattrace.test.js` — PASS; `shasum -a 256 test/fixtures/flat-trace.json` still `3dfb11a4…d838`.
- [ ] **Step 6: Commit** `feat(water): now and then a little silver fish jumps out of a lake with a splash`.

### Task 3: Water at sunset and dusk, calmer foam at dusk

**Files:**
- Modify: `src/render/water.js`, `src/render/waterdress.js`, `src/game/walk.js` (the existing `createWaterDressing` call gains `evening`, plus one `eveningWater(...)` line before it)
- Test: `test/waterlook.test.js` (or a new `test/waterevening.test.js`), `test/waterdress.test.js`

**Interfaces:**
- Produces: `WATER_EVENING` (frozen) and `eveningWater(handles, mode)` in water.js, where `mode` is `null | 'sunset' | 'dusk'`; returns nothing. `createWaterDressing(scene, { ..., evening = null })`.

Values (starting points; tune live in Task 5 and record the final numbers):
- `WATER_EVENING.sunset = { mul: [1.06, 0.86, 0.74], glow: 0x2a1608 }` — `material.color` multiplies the ramp map, `material.emissive` adds a faint amber.
- `WATER_EVENING.dusk = { mul: [0.6, 0.62, 0.78], glow: 0x000000 }`.
- Foam (waterdress): sunset `clear` foam `0xf4dcc6`, sea foam `0xf6dcc4`; dusk `clear` foam `0x7d8a94` with foam alpha × 0.55 and the breathe's low end the same (static `BREATHE_STILL` unchanged); dusk sea foam `0x8e9aa6` with its alphas × 0.6. Bog foam unchanged. Bank (wet earth) colours unchanged (the lawn light already darkens them).

- [ ] **Step 1: Write the failing tests:**
  - `'eveningWater(null) leaves every material untouched'` (color stays white 1,1,1, emissive black).
  - `'sunset warms the water: red multiplier ≥ 1, blue ≤ 0.8, emissive non-black'` on a real area's `waterFx`.
  - `'dusk darkens: every channel ≤ 0.8, blue the largest'`.
  - waterdress: `'at dusk the foam rows are darker and fainter'` — build the woods dressing with `evening: 'dusk'` and with none; for vertices with `aFoam === 1` and alpha > 0, max luminance at dusk < 0.6 × the day's and max alpha ≤ 0.55 × day's; `'at sunset the foam is warm'` (r > b on foam vertices); `'no evening gives byte-identical band geometry to before'` (positions and colours equal to a build without the option).
- [ ] **Step 2: Run** them — FAIL.
- [ ] **Step 3: Implement.** `eveningWater` sets `h.material.color.setRGB(...mul)` and `h.material.emissive.setHex(glow)` on each handle (materials are built per walk, so this is safe; verify by reading the area builds). In waterdress, pick foam colour/alpha scale from `evening` in `genericRuns`/`seaRuns` ctx (pass it through the build ctx) and apply the alpha scale in `bankProfile`/`seaProfile` foam rows only. walk.js: `const evening = duskLookNow ? 'dusk' : weather.condition === 'sunset' ? 'sunset' : null;` then `eveningWater(areaData.waterFx ?? [], evening);` and pass `evening` to `createWaterDressing`. The far-sea apron gets the same mul on its colour.
- [ ] **Step 4: Run** `npx vitest run test/water*.test.js test/splash.test.js` — PASS.
- [ ] **Step 5: Commit** `feat(water): the water warms at sunset and darkens at dusk, and the foam goes quiet at dusk`.

### Task 4: The Woods stream bend gets a rounded corner

**Files:**
- Modify: `src/render/waterdress.js`
- Test: `test/waterdress.test.js`

**Interfaces:**
- Produces: `BANK_FILLETS` (frozen) `{ woods: [{ x: 23, z: -9, r: 1.6, wx: -1, wz: -1 }] }` — the outer corner of the L where `river-west` (x ≤ 23, z −14…−9) meets `river-north` (x 18–23, z ≤ −9); `wx, wz` point into the water. Mesh `'waterdress:fillet'` added to the dressing's `meshes`.

Approach:
- **The band:** after `sampleChain`, any sample lying on the corner's two edges within `r` of the corner is moved onto the arc of radius `r` centred at `(x + wx*r, z + wz*r)`: its parameter along the edge (0 at the arc's tangent point, 1 at the corner) maps to an angle of 0…45° from that edge's tangent point, so samples from both edges meet at the diagonal; its normal becomes the radial direction (pointing onto the land). Arc length `s` is kept as is.
- **The fill:** the region between the arc and the true square corner is water that must look like ground. Build one small fan (≈ 12 triangles) covering corner-minus-arc, at `y = waterY + LIP_LIFT * 0.5`, as a `Mesh` sharing the area ground mesh's **current** material (`scene.children.find(c => c.isMesh && c.userData.ground)`, which at dusk/rain is already the tinted clone) with `uv`, `normal` and (if present) `color` attributes interpolated from the ground's `PlaneGeometry` grid at each vertex's world position (through the ground mesh's inverse world matrix; `geometry.parameters` gives width/height/segments). `receiveShadow = true`, `castShadow = false`, `renderOrder` below the band. `dispose()` frees its geometry only — never the shared ground material. No ground plane found, or not a PlaneGeometry → no fill and no bent samples.
- Fillets apply on every tier; reduced motion irrelevant.

- [ ] **Step 1: Write the failing tests:**
  - `'the Woods stream bend has a rounded bank: no band sample of the bend lies within 0.3 m of the square corner (23, -9)'`, and samples near it lie on the arc (distance to centre (21.4, −10.6) within 0.02 of 1.6).
  - `'the fillet fan covers the corner and stays inside the square r×r cell'` (every vertex in x 21.4…23, z −10.6…−9; the true corner is covered: a ray-cast/point-in-triangle test at (22.9, −9.1) hits it).
  - `'the fillet shares the ground material and dispose leaves it alive'`.
  - `'other areas' bands are unchanged'`: river, moor, pines band position arrays equal to a build with `BANK_FILLETS` ignored (export a test seam or compare against a pinned vertex count + checksum computed before the change — record the pre-change checksum in the test).
- [ ] **Step 2: Run** `npx vitest run test/waterdress.test.js` — FAIL.
- [ ] **Step 3: Implement** as above.
- [ ] **Step 4: Run** `npx vitest run test/water*.test.js` — PASS.
- [ ] **Step 5: Commit** `feat(waterdress): the Woods stream's bend has a rounded bank, not a pool corner`.

### Task 5: Live check, numbers, merge main (parent session)

- [ ] AFTER shots with scratchpad `snaps-polish-waterlife/runset.sh after` and `shoot.mjs after woods day` (+ `fish` strip in woods and park), compare with `before/`, tune Task 3 values if needed.
- [ ] Draw calls / triangles: perf readout while wading, swimming, and during a fish jump vs before.
- [ ] Pairs (4–8, one phone) into `snaps-polish-waterlife/pairs/`.
- [ ] Merge main, full suite, `npm run build`, flat-trace hash.
