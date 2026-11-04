# polish-pondrims Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the Moor stream's jagged grey-blue banks, give the River and Woods ponds/pools bitten natural shores, round the Woods lake corner, and dress the Gorge stream (banks, stones, riffles, dusk tint, softer green verge).

**Architecture:** All dressing stays in `src/render/waterdress.js` (built after the area build, so BUILD_DRAWS and the flat trace never move). The Gorge's dusk water tint is a per-handle option in `src/render/water.js`. Two tiny flagged data edits in `src/world/gorge.js` (WATER_LOOK.stream evening flag, bank verge colour) if the live check proves them necessary.

**Tech Stack:** Three 0.185, Vite 8, Vitest 4.

**Spec:** scratchpad `polish-survey-5.md` (broken #1, ranked #2, the water half of #3, build 5-2) and `polish-common.md` (shared rules, "survey-5 cycle, Pass 5").

## Root cause of broken #1 (found before planning)

The bites' fill (`waterdress:fill`) lies only `LIP_LIFT * 0.5` = **2 mm** above its water. The Moor's `water:river-south` is ONE 5 × 124 m quad (two triangles) that runs from z −4 to 120, so from the walk camera at z ≈ 40 the quad crosses behind the camera and is clipped; depth interpolated across that huge clipped triangle is not accurate to 2 mm, so the water wins the depth test over the fill in stair-stepped patches (the "sawtooth"). Proven live (scratchpad `pondrims/`, survey walk sequence on 5012ba8): hiding the fill removes the sawtooth; an opaque magenta copy of the fill shows jagged holes; lifting the fill by +1 cm removes it; shadows, the band and normals are not involved. The Woods' streams are shorter quads, so it rarely shows there. Fix: a real lift for every fill (bites and fillets), with the band rows over a fill riding above it. Zero triangles.

## Global Constraints

- Water footprints (`areaData.waters`), wading/swimming/collision: byte-identical. No area build changes geometry or draws.
- `test/waterlooks.test.js` BUILD_DRAWS unchanged; flat trace sha256 `3dfb11a4d847498330c2f1bbc766add06531d4efadaab4c710868df495c1d838` unchanged (`test/flattrace.test.js` green).
- `fishSpots()` output unchanged for every area; any new lily pad keeps ≥ 1 m off every fish spot.
- Waterdress triangle deltas (measured as the sum over `waterdress:*` meshes, HIGH tier, area built on its ground): **Moor 0 net**, **River ≤ +1,200**, **Woods ≤ +600**, **Gorge ≤ +600** (new). 12,000 per-area dressing cap still holds.
- At most 3 waterdress meshes per area, none casts shadows; no Math.random, no walkRng/strayStream draws; seed only with `seedFromCode`/`mulberry32`.
- Floats compared against fixtures use `closeDiffs` (test/helpers/closeto.js). Long geometry sweeps get explicit 120_000 timeouts.
- Tests: `npx vitest run --exclude '.claude/**' --exclude '.worktrees/**'`; `npm run build`. Commits: explicit `git add <paths>`, message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Files owned by this build: `src/render/waterdress.js`, `src/render/water.js` (Gorge evening only), `test/waterdress.test.js`, `test/waterevening.test.js`. `src/world/gorge.js` is polish-gorge5's: at most two one-line, colour/flag-only edits, no rng draw counts or geometry changed there.

## Review Focus

1. A fill at a water junction or fillet must not float above a *higher* neighbouring water (river-mouth 0.045 over the lake 0.03): the fill's lift is relative to its own water, so check the Moor/River junctions live and in the Task 1 test (no fill vertex inside another water's footprint sits above that water by more than the lift).
2. Band rows between a bitten sample and an unbitten neighbour (bite taper) must not dip under the lifted fill: test asserts every band vertex whose (x, z) lies on the fill strip is ≥ fill y.
3. Pond bites must leave the Park pond byte-identical (regression): its band/fill/stones positions equal to before except the lift.
4. River pools sit close to streams/other waters: bites on a circle must use only real shore (bankPieces) and taper by decks; no fill triangle may cover a path or deck (existing deck test extended to the new circles).
5. Gorge dressing must keep off the stepping stones (deck), the camp/finds keep-outs, and stay inside the floor (no stones on the rock walls).

---

### Task 1: Lift the fill clear of its water (Moor sawtooth)

**Files:**
- Modify: `src/render/waterdress.js` (constants near l.196–209; `genericRuns` fillY l.718; `bankProfile` landY l.469–479; fillet fillY l.1337–1343; `biteChain` fillTop l.954)
- Test: `test/waterdress.test.js`

**Interfaces:**
- Produces: `export const FILL_LIFT = 0.012` (metres above the fill's own water). Fill y = `waterY + FILL_LIFT`; fill top (where band rows over the fill ride) = fill y + `LIP_LIFT * 0.5`.

- [ ] **Step 1: Write the failing tests** (in the `stream bites` describe, using `dressOnGround`)
  - `it('every fill vertex rides FILL_LIFT over its own water, for every dressed area with a fill')`: for each area in `['woods','river','moor','pines','park']`, for each fill vertex find the waters whose footprint contains it (or the run's water for strip vertices on the land edge) and `expect(y).toBeCloseTo(minWaterY + FILL_LIFT, 6)` for at least the vertex's own water; and `expect(FILL_LIFT).toBeGreaterThanOrEqual(0.01)`.
  - `it('band vertices over a fill strip are never under the fill')`: for each bitten run's samples (debug: true), every band vertex whose (x,z) is within the strip quad of a sample with bite > 0.05 has `y >= fillY - 1e-6`.
  - `it('Moor: the fill and band triangle counts are unchanged by the lift')`: fill 724, band 5422, stones 1764 triangles (today's numbers).
- [ ] **Step 2: Run** `npx vitest run test/waterdress.test.js -t "FILL_LIFT|never under the fill|unchanged by the lift"` → first two FAIL.
- [ ] **Step 3: Implement.** `FILL_LIFT = 0.012`; use it for bite runs' `fillY` and for the fillet fill's `fillY` (highest water at the corner + FILL_LIFT). In `bankProfile`, any row whose offset `o > 0` on a sample with `fillTop` defined rides at `max(y, fillTop)` (today only the onLand/shoulder/outer rows do; the lip row at `wob > 0` must too). Update the module comment (heights section) to say why: the long single-quad waters can't hold a 2 mm separation.
- [ ] **Step 4: Run** `npx vitest run test/waterdress.test.js test/waterevening.test.js test/fishjump.test.js` → PASS (fix any old assertion that pinned `LIP_LIFT * 0.5` as the fill height, keeping its intent).
- [ ] **Step 5: Commit** `fix(waterdress): the bank fill rides 12 mm over its water, so a long stream quad can't poke through it (Moor sawtooth)`.

### Task 2: Bitten shores for the Woods and River ponds and pools

**Files:**
- Modify: `src/render/waterdress.js` (`BITE_CIRCLES` l.180; `POND_PLANTS` l.243 only if the Woods pond has no reeds — check live/in scene first)
- Test: `test/waterdress.test.js`

**Interfaces:**
- Consumes: Task 1's `FILL_LIFT`.
- Produces: `BITE_CIRCLES = { park: ['pond'], woods: ['pond'], river: ['pond', 'pool-1', 'pool-2', 'pool-3'] }` (frozen at every level).

- [ ] **Step 1: Failing tests**
  - Update `expect(BITE_CIRCLES).toEqual(...)` to the value above, frozen.
  - `it('the Woods pond and the River pond and pools are bitten like the Park pond')`: on ground, `band.userData.bites` contains each id; each `maxBite <= 0.6 + 1e-9` and `>= BITE_MIN`; pond foam colour on those runs is POND_FOAM (no clear white foam): every band vertex with aFoam = 1 belonging to those rings has colour ≈ `0xcfe0e4` (linear) unless evening.
  - `it('pond bites keep every fish spot and lily clear')`: `fishSpots(id, areaData)` deep-equals the pre-change fixture computed in-test from areaData (it doesn't read the dressing — assert it is unchanged by calling it before and after `dressOnGround`), and no fish spot lies within 0.5 m of any fill vertex.
  - `it('pond dressing adds at most 1,200 triangles in the River and 600 in the Woods')`: sum of `waterdress:*` triangles minus today's (River 10,793; Woods 7,917 — measured on aafb451 via the live scene; recompute in-test against a dressing built with `BITE_CIRCLES` ids removed is not possible since it's frozen, so pin the absolute totals ≤ 10,793 + 1,200 and ≤ 7,917 + 600).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** Add the ids. If the Woods pond has no reed bed within 1 m of its rim (check `scene` reeds meshes in the built Woods), add a `POND_PLANTS.woods.pond` entry with two reed arcs that avoid the pond's POI/scenic and path side (pick arcs by reading the Woods paths/POIs near (−44, −6); record the choice in a comment) and `lilyAt` on the reed side; otherwise add nothing.
- [ ] **Step 4: Run** the waterdress + fishjump tests → PASS; record the River/Woods triangle numbers in the commit message.
- [ ] **Step 5: Commit** `feat(waterdress): the Woods pond and the River pond and pools get bitten muddy shores, no white ring`.

### Task 3: Round the Woods lake corner

**Files:**
- Modify: `src/render/waterdress.js` (`BANK_FILLETS` l.166)
- Test: `test/waterdress.test.js`

**Interfaces:**
- Produces: `BANK_FILLETS.woods = [ {x:23,z:-9,r:1.6,wx:-1,wz:-1}, {x:-14,z:-34,r:R,wx:-1,wz:-1} ]` with R chosen live between 2.5 and 4 (the corner must read as a curve from the walk camera; R must keep the fan clear of any path/deck and of fish spots by ≥ 1 m).

- [ ] **Step 1: Failing tests**: update the `BANK_FILLETS` equality test; add `it('the Woods lake corner (-14,-34) is rounded: no band sample within 0.3·R of the square corner')` mirroring the existing bend test; and `it('the lake fillet fan covers no fish spot')`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** the entry. Check that `bendOntoFillet`/`inFilletFill` handle the lake's chains (lake shores `maxX`, `maxZ`); if the lake's band near the corner also carries the clear white foam, that is fine only if it no longer forms a V — verify live.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(waterdress): the Woods lake's north-east corner is a rounded bank, not a V`.

### Task 4: Dress the Gorge stream

**Files:**
- Modify: `src/render/waterdress.js` (`DRESSED_AREAS` l.54, Gorge-specific budget knobs), `src/render/water.js` (`eveningWater` per-handle override), `src/world/gorge.js` (≤ 2 flagged one-line edits: `WATER_LOOK.stream` evening flag; `bankColor` fade) only if needed
- Test: `test/waterdress.test.js`, `test/waterevening.test.js`

**Interfaces:**
- Produces: `DRESSED_AREAS` gains `'gorge'` (last). `createWater(w, { ..., evening: { dusk: {mul, glow}, sunset: {...} } })` optional per-handle override that `eveningWater(handles, mode)` prefers over `WATER_EVENING[mode]`; handles without it behave exactly as today.

Why the Gorge got nothing: it is not in `DRESSED_AREAS`, so `createWaterDressing` returns the stub.

- [ ] **Step 1: Failing tests**
  - Replace the gorge half of `'is a no-op stub on the docks and the gorge'` with docks only; update the `DRESSED_AREAS` equality.
  - `it('the Gorge stream is bitten on both banks, with stones and riffles, off the stepping stones')`: on ground, bites contain `stream` twice (two chains), riffles ≥ 2, no stone/riffle within 1.5 m of the stepping-stones deck, every stone's (x,z) has `waterClearance` ≥ −BITE_MAX and lies inside the floor x range −13..−4.
  - `it('the Gorge dressing adds at most 600 triangles')`.
  - `waterevening.test.js`: `it('the Gorge stream takes its own dusk tint, greyer than the default')` — after `eveningWater(gorge waterFx, 'dusk')`, the stream material colour's saturation (HSL s) is < the default dusk mul's saturation and its luminance ≤ default; other areas' handles get exactly `WATER_EVENING.dusk`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
  - Add `'gorge'`. Fit 600 triangles: the Gorge's box is the bounds (no HORIZON_M margin: the canyon ends are rock), and a Gorge step/profile knob (e.g. `AREA_STEP = { gorge: 1.4 }`, a lighter 4-row band) — pick the least visible saving that fits, measure, and write the numbers in a comment.
  - Confirm `fillGround` finds `groundPlane` (trimHiddenGround keeps the PlaneGeometry vertex grid); if not, sample its grid anyway or skip the fill and note why.
  - Dusk: check live whether `eveningWater` already reaches the Gorge handle. Add the per-handle override and set a greyer dusk `mul` (e.g. `[0.52, 0.54, 0.6]`) for the Gorge stream via a one-line `evening:` flag in `gorge.js` `WATER_LOOK.stream` (flagged edit).
  - Green verge: the hard-edged green strips are `gorgeMeadow()`'s bank patches (`BANK_BANDS`, `bankColor`, gorge.js l.522/641). Colour-only fix if needed (a faster fade to the floor colour so the outer cells match the floor); do NOT change `BANK_BANDS` or any rng loop (tufts would move). Flag it.
- [ ] **Step 4: Run** waterdress, waterevening, gorge, waterlooks, flattrace, budget tests → PASS.
- [ ] **Step 5: Commit** `feat(gorge): the Gorge stream gets bitten banks, stones and riffles, a greyer dusk, and a softer verge`.

### Task 5: Live check, budget numbers, merge main

- [ ] AFTER shots with `scratchpad/pondrims/shoot.mjs after day|dusk [phone]` (same spots as BEFORE), the survey walk sequence (`walkp.mjs moor day/dusk`) on the branch, and 4–8 side-by-side pairs in `scratchpad/snaps-polish-pondrims/pairs/` (Moor banks, River pond + a pool, Woods pond, Woods lake corner, Gorge day + dusk, one phone).
- [ ] Waterdress triangles before/after per area (River, Moor, Woods, Gorge, Park); draw calls before/after (Gorge +3 dressing draws is the only change: say so).
- [ ] Merge current main, re-run the full suite, `npm run build`, flat-trace hash check.
