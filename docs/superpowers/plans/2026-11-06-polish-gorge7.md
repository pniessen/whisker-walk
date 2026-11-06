# polish-gorge7: the Gorge floor, its spawn view and thicker scree — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Gorge floor reads as a warm, varied sandy canyon floor (damp by the stream, paler by the walls, faint drift bands, warmer at dusk), the scree is chunky 3D sandstone heaped at the wall feet, and the first frame of a Gorge walk reads as a canyon instead of a flat beige smear.

**Architecture:** Render-side only. (1) A pure `gorgeFloorWash(x, z)` in gorge.js multiplies the ground plane's existing vertex colours (macro variation) after `b.ground`. (2) The Gorge's `duskLight.lawnTint` override (dusk.js already merges it) keeps the floor warm at dusk. (3) `builder.scree()` gets a `chunky` look (jittered box blocks and cobbles, vertex-coloured sandstone, heaped against the wall when a spot carries its wall normal); `gorgeScree()` spots carry `nx, nz`; the bed is built under `withLocalUuids`.

**Tech Stack:** Three 0.185, Vite 8, Vitest 4.

**Spec:** scratchpad `polish-survey-7.md` (Pass 7, item 7-5; broken #5; ranked #4) and `polish-common.md`.

## Global Constraints
- Spawn position, camera rig, colliders, walkable ground, perches, keep-out: unchanged. No fog change (probe: day fog 60/175 does not reach the 9 m spawn wall; the smear is the rock shader's flutes + the pale foot of the wall, which rockshade/rockrelief own — parked).
- No Math.random in the build except Three uuids; no new seeded draws. Flat trace stays `af07901717f1b39482a7befce20f1a80dc09c7e31866ab11bb7459e61d97b83a`.
- builder.js: touch ONLY `scree()` (and its own constants SCREE_COLOR / new SCREE_* constants right above it).
- Gorge ≤ +4k triangles (60,181 now). Gorge guard 61 meshes / 36 casters stays (scree stays one noCast mesh).
- waterlooks BUILD_DRAWS gorge (4488) may move only with a written comment (building the scree under local uuids drops it).
- Scree stays ≤ 0.25 m tall, noCast, one merged mesh; deterministic for one seed.
- Commits: explicit `git add <paths>`, end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never add node_modules.
- Tests: `npx vitest run --exclude '.claude/**' --exclude '.worktrees/**'`; long sweeps get explicit timeouts.

## Review Focus
- Rain and dusk clone the ground material: the wash must live in vertex colours (survives `tintDuskLawn`/wet clones), not in onBeforeCompile.
- The trimmed ground plane keeps vertices under rock: the wash must not throw or NaN for any vertex (waterClearance returns Infinity with no water nearby).
- Scree heaped against a wall must not poke above 0.25 m or sink below y 0 (stacked stones clamped).
- Determinism: two builds give byte-identical scree positions and colours.
- A dusk walk still darkens the floor (lawnTint `dark` < 1), it just stays warm.

---

### Task 1: Chunky heaped scree

**Files:**
- Modify: `src/world/builder.js` — `scree()` only (l.~6286–6328)
- Modify: `src/world/gorge.js` — `gorgeScree()` spots gain `nx, nz`; the scree build call uses `{ chunky: true }` under `withLocalUuids('gorge-uuids-scree', ...)`
- Test: `test/builder.test.js` ('scree is low, noCast and merged' + a new chunky test), `test/gorge.test.js` (scree block l.~895), `test/waterlooks.test.js` (BUILD_DRAWS gorge with comment)

**Interfaces:**
- Produces: `scree(spots, seed, { chunky = false } = {})`; spots `{ x, z, nx?, nz? }`. `pebble` option removed (gorge.js was its only caller). Default (non-chunky) branch unchanged.

- [ ] **Step 1: Tests.** In builder.test.js add `it('chunky scree is heaped sandstone: low, vertex-coloured, against its wall')`: spots `[{x:0,z:0,nx:1,nz:0},{x:0,z:1.5,nx:1,nz:0}]`, seed 4, `{ chunky: true }` → one mesh, noCast, `castShadow false`; bbox max.y ≤ 0.25, min.y ≥ -1e-6; geometry has a `color` attribute and `material.vertexColors === true`; the stones' mean x (vertex mean) is < 0.05 (heaped toward the wall at -x, i.e. against the normal); triangles per spot between 3·12 and 7·20; same positions and colours on a second build. In gorge.test.js scree block assert each spot has `Math.hypot(s.nx, s.nz)` ≈ 1.
- [ ] **Step 2:** Run `npx vitest run test/builder.test.js -t scree` → new test FAILS.
- [ ] **Step 3: Implement.** Chunky look: per spot `n = 3 + floor(hash01(...)*4)` stones (as now). Each stone is either an angular block (BoxGeometry 1×1×1, corners jittered ±18 % by a hash of the corner's sign triple so faces stay closed, 12 tris) or, 1 in 4, a cobble (IcosahedronGeometry(1,0), vertices jittered radially ±15 %, 20 tris). Size: half-width 0.09–0.22 m, height ratio 0.5–0.85, largest stones closest to the wall: with a normal, place each stone at `spot + t·(−0.45..+0.35)·n + along·(±0.75)` along the wall tangent (covers the 1.5 m step so heaps read continuous), radius shrinking with distance out; stones k ≥ 3 sit lifted onto their neighbours by up to 0.06 m. Clamp each stone so its top ≤ 0.25 (scale y). Without a normal, scatter as today. Colour per stone from a sandstone palette near the walls/tors (0x9a8670, 0x8a7560, 0xa89478, 0x857f76, 0x7a6a58) × hash tint ±6 %, and bottom vertices ×0.72 (contact darkening). Flat-shaded faces (computeVertexNormals on non-indexed). Merge into one noCast mesh with `vertexColors: true` on the material (`surfNoMap(0xffffff,'cobble')` style). In gorge.js pass each spot's wall normal from FLOOR_WALLS and build the bed under `withLocalUuids('gorge-uuids-scree', () => b.scree(...))`.
- [ ] **Step 4:** Run builder, gorge, rig, waterlooks tests. Update waterlooks BUILD_DRAWS gorge to the new number with a comment ("polish-gorge7: the scree bed is built under local uuids, so its stones no longer draw"). PASS.
- [ ] **Step 5:** Commit.

### Task 2: Floor wash and a warm dusk floor

**Files:**
- Modify: `src/world/gorge.js` — new exported `FLOOR_WASH` constants + `gorgeFloorWash(x, z) -> [r, g, b]` multipliers, applied to `groundPlane`'s `color` attribute in `build()`; returned `duskLight` gains `lawnTint`.
- Test: `test/gorge7.test.js` (new)

**Interfaces:**
- Produces: `gorgeFloorWash(x, z): [number, number, number]` (each in 0.75..1.12); `FLOOR_WASH` frozen `{ damp, pale, band }`.

- [ ] **Step 1: Tests** in test/gorge7.test.js: (a) wash is darker and browner within 1 m of the stream than at the Narrows' middle (-34, -11): luminance multiplier at least 0.1 lower; (b) paler at a wall foot (-34, -15.2) than at (-34, -11); (c) bands: along x = -34, z -15..-7 is not constant away from walls (max−min ≥ 0.03) but stays within ±6 %; (d) deterministic and finite for every vertex of the built plane; (e) the built groundPlane's colour at a vertex near the stream is darker than its macro colour alone (compare with a fresh `b.ground(120, GORGE_FLOOR_COLOR, {surface:'grass'})` vertex); (f) `area.duskLight.lawnTint`: desat ≤ 0.15, dark in 0.7..0.85, cool r ≥ g ≥ b (warm); `duskLook(area)` lawnTint on GORGE_FLOOR_COLOR keeps r > b by a clear margin (≥ 0.04 linear).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement.** damp = 1 − smoothstep(0, 3.2, waterClearance) (treat inside water as 1): × (1 − 0.2·damp, 1 − 0.22·damp, 1 − 0.27·damp). pale = 1 − smoothstep(0.4, 3.5, distance to nearest FLOOR_WALLS segment): × (1 + 0.08·pale, 1 + 0.06·pale, 1 + 0.02·pale). band = sin of a slightly warped coordinate across the canyon (wavelength ~7 m, a low second octave): × (1 + 0.04·band) on all channels, faded out where damp. Apply after `b.ground` and before `trimHiddenGround` (vertex colours unaffected by the trim). lawnTint `{ desat: 0.1, dark: 0.78, cool: [1.06, 0.98, 0.86] }`.
- [ ] **Step 4:** Run gorge7, gorge, gorgerock2, clancast, waterdress tests → PASS.
- [ ] **Step 5:** Commit.

### Task 3: Live check, triangle report, pins
- [ ] AFTER shots from the same spots (walk.mjs gorge day/dusk desk/phone, gorge.mjs day/dusk), 4–8 pairs incl. phone 390 and dusk; tris6 before/after; full suite + `npm run build`; flat-trace check.
