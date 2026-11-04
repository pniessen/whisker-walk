# polish-streams Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Streams read as natural brooks (a wandering visual bank, varied width, mid-stream stones with riffles, a mud line instead of white foam) and the Park pond is dressed (soft wobbly shore, wet-earth band, rim stones, reeds on two arcs, a lily patch) — all for the eye only.

**Architecture:** Everything lives in the after-build water dressing (`src/render/waterdress.js`, created by walk.js after the build), so no area build, Math.random draw count, build triangle cap or flat trace moves. The straight water edge is hidden by a "bite": an opaque strip drawn with the area ground's own material (the same trick polish-waterlife's BANK_FILLETS fan uses) laid over the outer 0.15–0.85 m of the water, so the visible shore wanders. The wet-earth band then follows the bitten line. The fillet fans and bites share ONE mesh, `waterdress:fill`. Stones, mid-stream riffle stones, reeds and lily pads share the existing stones mesh. Riffle foam streaks are extra runs in the band mesh.

**Tech Stack:** Three.js 0.185, Vitest 4. Spec: scratchpad `polish-survey-4.md` ranked #8 and #13, section "4B-4"; shared rules `polish-common.md` (Pass 4B).

## Global Constraints
- Gameplay water data (`waters`, footprints, `shallow`, decks, colliders, keep-out, spawn) stays byte-identical. Only drawn things change.
- No Math.random beyond three's uuids; seed everything with `seedFromCode`/`mulberry32`. No walkRng / strayStream draws.
- waterlooks BUILD_DRAWS unchanged; flat trace sha256 3dfb11a4d847498330c2f1bbc766add06531d4efadaab4c710868df495c1d838 unchanged.
- At most 3 dressing meshes per area, none casts shadows, all `userData.noCast`, total ≤ 12,000 triangles per area (existing test).
- With no ground plane to borrow, no bite and no fill (the band then equals today's band exactly — the existing BAND_SIGS no-ground test must keep passing for woods/river/moor/pines/seaside).
- Tests: `npx vitest run --exclude '.claude/**' --exclude '.worktrees/**'`; long sweeps get explicit timeouts (120_000). Commits: explicit `git add <paths>`, message ends `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Files owned: `src/render/waterdress.js`, `test/waterdress.test.js`, the `WATER_LOOK` foamStrength numbers for stream ids in woods.js / river.js / moor.js / pines.js, and the pond's `createWater` options in park.js. Nothing else.

## Review Focus
1. Fish spots must stay in visible water: every `fishSpots()` point is ≥ 1 m beyond the deepest bite (test in Task 1).
2. Stepping stones / log bridges: no bite within 1 m of a deck, so path ends still meet the crossing (test in Task 1).
3. Where a stream meets a lake or another stream (open chain ends) the bite tapers to 0, so no step or hole appears at junctions (test in Task 1).
4. Dusk/rain: the fill shares the ground's CURRENT material, so it darkens/tints with the lawn (existing fillet dusk test extended to bites, Task 1).
5. The Park's north shore (scenic `pond-shore` (-14,10), POI (-14,11)) and the duck-parade exit (towards (-8,8)) stay clear of reeds (test in Task 3).

---

### Task 1: Stream and pond bites + the shared fill mesh

**Files:**
- Modify: `src/render/waterdress.js`
- Test: `test/waterdress.test.js`

**Interfaces:**
- Produces: `export function isStream(h)` — true for a non-'sea', non-'bog' handle whose footprint is a rect with min(width, depth) ≤ 6 m. `export const BITE_CIRCLES = Object.freeze({ park: Object.freeze(['pond']) })` — circle waters that also get a bite. `export function bankBite(seed, s, period, kind)` → metres the visual shore moves into the water before tapering: kind `'stream'` = `0.5 + 0.35 * noise` (0.15..0.85), kind `'pond'` = `0.35 + 0.25 * noise` (0.10..0.60); noise is the existing `smoothNoise` shape but with its own long waves `[17, 9.5, 5.3]` (weights 0.55/0.3/0.15, snapped to `period` on rings). `BITE_MAX = 0.85`.
- Each bitten sample carries `p.bite` (metres, after taper), `p.x0, p.z0` (true shore point), `p.nx0, p.nz0` (true land normal), `p.fillTop`.
- Mesh `waterdress:fill` (replaces `waterdress:fillet`): fillet fans + bite strips, ground material shared, `userData.sharedMaterial = true`, `userData.filletVerts = [start, count]` (fan vertex range), `renderOrder` FILLET_ORDER. Band keeps `userData.fillets`; add `band.userData.bites = [{ water, maxBite }]`.

- [ ] **Step 1: Write failing tests** (in a new `describe('stream bites', ...)` using the existing `dressOnGround` helper; timeouts 120_000):
  - `isStream` is true for woods river-west/river-north, river river-west/river-bend/river-east, moor river-south/river-west/river-mouth, pines mire-north/mire-west; false for every lake, pond, pool, bog and the sea.
  - `bankBite` stays in 0.15..0.85 (stream) and 0.10..0.60 (pond) over s 0..500 step 0.1, and never jumps > 0.05 between samples 0.1 m apart.
  - On ground, for woods/river/moor/pines: every bitten band lip vertex lies over the water footprint; the bitten edge's distance from the true shore varies by ≥ 0.4 m along each stream bank (max − min of `p.bite` per chain).
  - Taper: samples within 0.3 m of an open chain end have `bite ≤ 0.05`; samples with `deckDistance(waters, x0, z0) < 1` have `bite === 0`; samples within 2r of a fillet corner have `bite === 0`.
  - Fish: for woods, river, moor, pines and park, every `fishSpots(id, areaData)` point has `waterClearance(areaData.waters, x, z) < -(BITE_MAX + 1)`.
  - `waterdress:fill` exists on ground for woods, river, moor, pines; its material `===` the ground's material; dispose leaves that material alive; it is on LOW tier too.
  - Gameplay data untouched: `JSON.stringify(areaData.waters)` before and after `createWaterDressing` is identical.
  - Update the existing fillet tests to use `'waterdress:fill'` and check the r×r cell only over `userData.filletVerts`; the "fillet is on every tier" names list becomes `['waterdress:band', 'waterdress:fill']`; the no-ground BAND_SIGS test stays as is.

- [ ] **Step 2: Run** `npx vitest run test/waterdress.test.js` — expect the new cases to FAIL.

- [ ] **Step 3: Implement.**
  - `fillGround(scene)`: skip meshes named `'path'` or `visible === false`.
  - In `genericRuns`, when a ground is available (pass `ground` in the options; bites need it exactly like fillets) and the handle `isStream(h)` or its id is in `BITE_CIRCLES[areaId]`: after `sampleChain` and `bendOntoFillet`, for each sample not bent onto a fillet set `bite = bankBite(seed, s, period, kind) * taper`, where taper = smooth01(distance along chain to an open end / 2) (rings: 1) × smooth01((deckDistance(areaData.waters, x, z) − 1) / 1.5) × (0 if within 2·r of any fillet corner, smooth01 ramp out to 2·r + 1.5). Store `x0,z0,nx0,nz0`, move the sample to `x0 − nx0·bite`, then recompute each bitten sample's normal from its neighbours (keep the sign agreeing with `nx0,nz0`). Set `p.fillTop = fillY + LIP_LIFT * 0.5` where `fillY = (h.y ?? 0.03) + LIP_LIFT * 0.5`.
  - `bankProfile`: a land-side probe at offset `k` is never "wet" while `k < p.bite` (it is over our own fill); beyond that keep today's test.
  - Fill geometry: one function building both the fillet fans (today's `filletGeometry`) and, per bitten run, a strip of quads between `(x0 + nx0·0.08, z0 + nz0·0.08)` and the bitten point, both at that run's `fillY`. Factor the bilinear ground sampling into `sampleGround(ground, x, z, out)`; uv and normal are sampled where each vertex lies, **colour is sampled on land at `(x0 + nx0·0.6, z0 + nz0·0.6)`** (the ground under the water may be painted as stream bed). Faces wound to look up. Skip runs whose max bite < 0.02.
  - Stream band foam: for `isStream(h)` runs, `foamC = 0x4a4330` (wet mud) and `foamA = 0.6`, at every time of day.
  - `stoneSpots`: a stone whose `out < p.bite − 0.05` is on our fill and is allowed (skip the waterClearance test for it).

- [ ] **Step 4: Run** `npx vitest run test/waterdress.test.js test/fishjump.test.js test/waterevening.test.js` — PASS.

- [ ] **Step 5: Commit** `feat(water): streams get a wandering bank — a ground-coloured bite over the straight edge`.

### Task 2: Mid-stream stones, riffles and a quieter stream rim

**Files:**
- Modify: `src/render/waterdress.js`; `src/world/woods.js`, `src/world/river.js`, `src/world/moor.js`, `src/world/pines.js` (WATER_LOOK foamStrength only)
- Test: `test/waterdress.test.js`

**Interfaces:**
- Consumes: `isStream`, `BITE_MAX`, `p.bite` (Task 1).
- Produces: `stones.userData.riffles = [{ x, z, r, y }]`; band runs with `ctx.profile === riffleProfile`.

- [ ] **Step 1: Failing tests:**
  - High tier, woods/river/moor/pines: `stones.userData.riffles.length ≥ 3` per area; every riffle stone has `waterClearance(undecked, x, z) < −(BITE_MAX + 0.3)`, `deckDistance(waters, x, z) ≥ 2.5`, lies inside the area bounds + 10, r in 0.12..0.26, and its top (`y + 0.6 r`) is 0.02..0.12 above that water's `h.y`.
  - Each riffle stone has 1–2 foam streaks in the band (vertices flagged `aFoam = 1`, within 1.2 m of the stone, at `h.y + LIP_LIFT`).
  - LOW tier: no riffle stones (stones mesh absent) and no streaks.
  - WATER_LOOK: every stream id (Task 1's list) has `foamStrength ≤ 0.1` (read `createWater` handle options or the built water material's foam setting — whatever the handle exposes; otherwise import the area's WATER_LOOK if exported, or assert via the ramp built by the handle).

- [ ] **Step 2: Run** — FAIL.

- [ ] **Step 3: Implement.**
  - Riffle spots per stream handle (rect, long axis = the longer side): `rng = mulberry32(seedFromCode(\`waterdress-${areaId}-${w.id}-riffle\`))`; walk the centreline inside the box every `6 + 4·rng()` m; per stop 1–3 stones at lateral offset `(rng()−0.5)·1.6`, along-axis jitter ±0.4, `r = 0.12 + 0.14·rng()`, `y = h.y − 0.25·r`; apply the filters from the test. Add them to the stones geometry (`stonesGeometry` takes an optional per-spot `y`, default 0).
  - Streaks: per riffle stone, 1 + (rng() < 0.5) streaks starting beside the stone, running along the axis (direction ±, rng) for `0.5 + 0.4·rng()` m, half-width 0.04–0.06; built as band runs with 3 samples and `riffleProfile` rows `[[−w, y, c, 0, 1, 0], [0, y, c, 0.45·k, 1, 0], [w, y, c, 0, 1, 0]]` (k fades 0 at both ends), colour = evening foam colour or `FOAM_COLORS.clear`, `noStones: true`. HIGH/MEDIUM only.
  - foamStrength for stream ids: 0.22 → 0.08 (woods, river, moor); pines mire-north/mire-west 0.25 → 0.1. Nothing else in those files.

- [ ] **Step 4: Run** `npx vitest run test/waterdress.test.js test/waterlooks.test.js test/water.test.js test/woods.test.js test/river.test.js test/moor.test.js test/pines.test.js` — PASS.

- [ ] **Step 5: Commit** `feat(water): stones and little riffles mid-stream; streams lose their sea-foam rim`.

### Task 3: The Park pond

**Files:**
- Modify: `src/render/waterdress.js`, `src/world/park.js` (the pond's `createWater` options only: `foamStrength: 0.25`)
- Test: `test/waterdress.test.js`

**Interfaces:**
- Consumes: Task 1 bites (`BITE_CIRCLES.park = ['pond']`), the stones mesh.
- Produces: `DRESSED_AREAS` gains `'park'`; `stones.userData.reeds = [{ x, z }]`, `stones.userData.lilies = [{ x, z, r }]`; `BANK_COLORS.park = { wet: 0x5a5a30, damp: 0x5f8c42 }`.

- [ ] **Step 1: Failing tests:**
  - `DRESSED_AREAS` is the six areas (woods, river, moor, pines, seaside, park); the no-op stub test now covers only the docks and the gorge.
  - Park on ground: meshes are exactly `waterdress:band`, `waterdress:fill`, `waterdress:stones`; ≤ 3,000 triangles together.
  - Reeds: 10–24 clumps; every clump's angle `atan2(z − 2, x + 14)` lies in [200°, 250°] or [290°, 340°] (degrees in 0..360); each is 6.2..7.3 m from (−14, 2); none within 3 m of (−14, 10), (−14, 11) or the line to (−8, 8).
  - Lilies: 5–9 pads, each fully in water at least `0.6 + 0.3` m inside the shore (`waterClearance(waters, x, z) ≤ −(0.9 + r)`), none within 1 m of a fish spot.
  - Rim stones exist on the pond (`centres` has ≥ 4 within 8.5 m of the pond centre).
  - LOW tier: band + fill only.
  - The stones material is `side: THREE.DoubleSide`, `flatShading: true`, `vertexColors: true`.
  - Park `waterlooks` BUILD_DRAWS unchanged (run that test file).

- [ ] **Step 2: Run** — FAIL.

- [ ] **Step 3: Implement.** Seed everything from `waterdress-park-pond-reeds` / `-lilies`.
  - Reeds: along each arc every `0.9 + 0.5·rng()` m of rim, at radius `r − bite(angle) + 0.05 + 0.3·rng()` (on the visual waterline); 4–6 blades per clump, each one tapered triangle (base 0.05–0.07 wide, 0.6–1.1 tall, tip leaning 0.08–0.2 m in a random direction), colours from `[0x6f8a3c, 0x7f9a46, 0x5d7a34]`; 1 in 2 clumps adds a cattail head (6-sided prism 0.05 r × 0.18 h, 0x6b4a2a) on its tallest blade's tip.
  - Lilies: 7 pads around angle 270° at radius `r − 2.0 ± 0.6`, pad radius 0.28–0.42, a 10-segment fan with one missing wedge (the notch), `y = h.y + 0.006`, colours `[0x4f8a3a, 0x5c9a44]`; 2 pads carry a flower (6-tri cone, 0xf2b6c8, 0.08 tall).
  - All merged into the stones geometry (non-indexed, vertex colours, flat normals); stones material gains `side: THREE.DoubleSide`.
  - park.js: pond `createWater(POND, { ..., foamStrength: 0.25 })` with a one-line comment (the dressing now draws the shore).

- [ ] **Step 4: Run** `npx vitest run test/waterdress.test.js test/park.test.js test/waterlooks.test.js test/fishjump.test.js test/budget.test.js` — PASS.

- [ ] **Step 5: Commit** `feat(park): the duck pond gets a soft shore, reeds, stones and lily pads`.

### Task 4 (parent): live check, numbers, review
- After shots from the fixed spots (`scratchpad/snaps-polish-streams/shoot.mjs`), pairs, draw/triangle numbers, full suite + build + flat-trace hash, whole-branch review on opus, fix wave, merge main, re-run.
