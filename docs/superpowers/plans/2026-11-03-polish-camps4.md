# polish-camps4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The clan camps read as homes: the Highrock is a stepped boulder (not an armchair), the clearing fades softly into the ground, and the bramble ring reads as tangled canes, not "apples with stalks".

**Architecture:** All changes are render-only, in `src/world/camp.js` (plus its tests). Layout (`campLayout`), colliders (`campDiscs`), seats and routes are untouched. New geometry is made inside the existing `withLocalUuids` block and handed over with `adopt`, so each build's Math.random draws stay identical.

**Tech Stack:** Three 0.185, Vite 8, Vitest 4.

**Spec:** scratchpad `polish-survey-4.md`, ranked #3 and build 4A-3; shared rules `polish-common.md` (survey-4 section).

## Global Constraints

- Colliders, seats (leader at y 0.8 on rock.h), routes, `campLayout`, `campDiscs`, `LEDGE_CAMPS` unchanged.
- flat trace stays sha256 3dfb11a4…d838; waterlooks BUILD_DRAWS unchanged; camp.test.js pins 44 draws per flat camp and 28 for the Gorge camp.
- Clan colours come from `CAMP_LOOKS` (unchanged values).
- Every Highrock vertex within 0.8 m (xz) of the rock centre; Highrock triangles ≤ 128 (today's); its tallest vertex ≤ 1.2 m.
- Leader's top: vertices within 0.42 m of the centre at y ≤ 0.82, with ≥ 6 at 0.78–0.82.
- `clanCamp` group box < contact-shadow MAX_SPAN 6.5 (Woods is 6.492 today).
- Per-camp total triangles (all camp meshes) ≤ today's 5,427 for flat camps, so River (58,501) and Moor (59,303) do not grow.
- No Math.random; hashes from `hash01` / the camp's own seeded rng only.
- Tests: `npx vitest run --exclude '.claude/**' --exclude '.worktrees/**'`; long sweeps get explicit timeouts.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- Leader clipping: the cat at the top centre must not sink into a back stone (top-flat test covers vertices; reviewer looks at a side shot).
- Step boulders colliding visually with the fresh-kill pile or the deputy's spot (test: step stones ≥ 0.25 m from the kill spot's lumps; deputy seat clear).
- Ring canes passing through seats, the den/rock, the gap or the camp tree where clumps were dropped (test: cane points ≥ 0.4 m from seats and ≥ 0.25 m off every collider edge, none inside the gap).
- Transparent clearing drawing over contact-shadow decals and paw prints (renderOrder below theirs; depthWrite false).
- Grass mask: grass.js `flatFootprints` must still see the clearing as a `CircleGeometry` disc.

---

### Task 1: The Highrock as a stepped boulder (all five camps)

**Files:**
- Modify: `src/world/camp.js` (`highrockGeometry`, its comment, `addCamp`, `addLedgeCamp`, `campRockMesh`)
- Test: `test/camp.test.js` (replace "tall back stone" assertion; add tests below)

**Interfaces:**
- Produces: `highrockGeometry(rockSpot, away, opts) -> BufferGeometry` built around the origin (x, z = 0, base y 0), non-indexed, flat-shaded, with a `color` attribute (grey multipliers; the material keeps `look.rock` as its colour and sets `vertexColors: true`). `away` is the radians direction from the rock to its back; `opts.kill` (optional `{x,z}` relative to the rock) picks the step side away from the pile. Flat camps translate it to the rock spot (world-space as before); the Gorge mesh is placed at the rock spot and `seatOnGround`-ed. Gorge `away` = 0 (+x, inland; the leader looks west).

Shape (numbers are targets; tune on the live shots):
- Main boulder: a lathe/cylinder of 8 sides, rings at y 0, ~0.4, ~0.68, 0.8 with radii ~0.62, ~0.70, ~0.60, ~0.44, no bottom cap, flat top cap at exactly rock.h; each ring vertex pushed in/out in xz by hash01 (±8 %, top ring only inward so the top stays flat and ≥ 6 top vertices stay at 0.8); slightly wider along the tangent than radially. ~56 triangles.
- Back stone: a hash-jittered icosahedron (20 tris), rounder and lower than today's slab: top ≤ 1.15, behind and offset sideways from the leader; every vertex above 0.82 must be > 0.42 m from the centre.
- Two step boulders (icosahedra, 20 tris each): tops ~0.45 and ~0.22, on the side away from the kill pile, climbing round from the back-side towards the front, so it reads as a climb up.
- Per-face colour: dark at the foot (~0.72) to light at the top (~1.0), ±6 % per-face hash, up-facing faces a touch lighter.

- [ ] **Step 1: failing tests in camp.test.js** — for all five camps (CAMPS + 'gorge'): rock verts within 0.8; tallest vertex ≥ 1.0 and ≤ 1.2 (replaces `>= 1.5`); the flat-top test holds for the Gorge too (relative to its seated base); rock triangles ≤ 128; rock geometry has a `color` attribute; the Gorge build still takes 28 draws and the flat camps 44; group box < MAX_SPAN.
- [ ] **Step 2: run** `npx vitest run test/camp.test.js` — FAIL on the height/colour assertions.
- [ ] **Step 3: implement** as above; the Gorge rock geometry is made inside its `withLocalUuids` block and adopted.
- [ ] **Step 4: run** camp, camplooks, campdressing, gorge, gorgeclan, gorgerock-guard, budget tests — PASS.
- [ ] **Step 5: commit** `feat(camps): the Highrock is a stepped boulder, not an armchair`.

### Task 2: The clearing fades into the ground

**Files:** Modify `src/world/camp.js` (`clearingMesh`, `CLEARING`); Test `test/camp.test.js`, `test/camplooks.test.js` if it reads the material.

**Interfaces:** `clearingMesh(clearing, look) -> Mesh` named `campClearing`, still a `CircleGeometry` instance (its `parameters.radius` = the solid inner radius, r − 0.4, which is what grass.js masks) whose attributes are replaced by a two-ring disc: centre + inner ring (r − 0.4 times wobble) + outer ring (r times wobble), 28 segments each (84 triangles), `uv` = planar, `color` itemSize 4 with alpha 1 inside and 0 at the outer ring. Wobble: low-frequency (sum of 2–3 sinusoids, phases from hash01 of the camp centre), radius factor in [0.9, 1]. Material: same colour/surface/repeat/polygonOffset, plus `vertexColors: true, transparent: true, depthWrite: false`; mesh `renderOrder = -1`.

- [ ] **Step 1: failing tests** — every clearing vertex still y 0.011, within D.clearing.r; geometry.type `CircleGeometry`, `parameters.radius` ≈ r − 0.4; color itemSize 4, outer-ring alphas 0, centre alpha 1; material transparent, depthWrite false; renderOrder < 0; triangles 84; grass.js `flatFootprints(scene)` returns a disc at the camp centre.
- [ ] **Step 2: run** — FAIL.
- [ ] **Step 3: implement.**
- [ ] **Step 4: run** camp tests + grass tests — PASS.
- [ ] **Step 5: commit** `feat(camps): the clearing's edge fades softly into the ground`.

### Task 3: A woven bramble ring

**Files:** Modify `src/world/camp.js` (`campDressing` gains `ring.canes`, `ringMesh`, `RING_LOOK`); Test `test/camp.test.js`, `test/campdressing.test.js`.

**Interfaces:**
- `campDressing(...).ring.canes: [[{ x, y, z, w }]]` — polylines (w = tube radius at that point), pure, from hash01 only (never the camp rng, so clumps don't move). Two layers of arching canes, each 2.6–3.8 m of arc, end to end, the layers staggered half a cane; along a cane the radius weaves ringR ± ~0.18 (across both rows) and the height arches from ~0.08 at the ends to a peak 0.7–0.9 (≤ 1 − tube) with a small over/under bob; points every ~0.4 m; tube tapers ~0.028 → 0.012. A point is kept only if within 0.45 m of a kept clump, ≥ 0.4 m from every seat, ≥ 0.25 m off every den/rock/collider edge, and outside the gap; a cane splits where points are dropped; runs under 3 points vanish.
- `ringMesh` draws the clumps as now, but lumpier: each lump vertex scaled about the clump centre by (1 + j), j = hash01(world vertex) in [−0.2, +0.05], y clamped ≤ c.h; the old pairwise arch strands are gone; each cane is a tapered 3-sided tube in the strand colour. Total ring triangles ≤ today's (3,360).

- [ ] **Step 1: failing tests** — canes exist (≥ 4 per camp); every cane point obeys the keep rules above; every ring vertex within 0.6 m (xz) of a kept clump and 0 ≤ y ≤ 1.0; ring triangles = 28·clumps + 6·(cane segments) and ≤ 3,360; clump positions identical to before (pin one camp's first clump); total camp triangles ≤ 5,427.
- [ ] **Step 2: run** — FAIL.
- [ ] **Step 3: implement**; update the long comment above `ringMesh`.
- [ ] **Step 4: run** full camp test files — PASS.
- [ ] **Step 5: commit** `feat(camps): bramble canes weave along the ring`.

### Task 4: Verification (controller)

- [ ] Full suite, `npm run build`, flat-trace sha256, waterlooks draws; budget numbers (per-camp and River/Moor/Gorge totals) into the budget comment in `test/budget.test.js` if it lists camp numbers.
- [ ] AFTER shots from the same spots (`scratchpad/camps4/shots.mjs`), pairs into `snaps-polish-camps4/pairs/`.
- [ ] Merge main, re-run suite/build/trace.
