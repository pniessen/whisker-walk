# polish-places Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build B4 of polish survey 3: the Woods' Twolegplace reads as small houses behind the hill, the Woods lookout reads as a rock, the Park Twoleg stands clear of the oak, the Seaside's back and ends get dune dressing, and the River and Moor edges run all the way round (with a shore at the Moor's lake), all inside the 60k triangle caps.

**Architecture:** All far dressing goes through `horizonBand` in `src/world/builder.js` (its `rooftops` and `edge` options), opted into by each area's band opts, so every existing band that does not opt in stays byte-identical (the Gorge's especially: 693 tris left). Triangles for the River and Moor come from removing faces nobody can see in two shared bed builders (reeds, heather). The Twoleg's figure is offset inside its critter Group; its contact shadow and quest marker follow the figure.

**Tech Stack:** Three 0.185, Vite 8, Vitest 4.

**Spec:** `scratchpad/polish-survey-3.md` (rows polish #4, #8, #9, #10, #11 and "Build B4") and `scratchpad/polish-common.md` (shared rules, survey-3 section). Scratchpad = `<scratchpad>/`.

## Global Constraints

- Worktree `<repo>/.worktrees/polish-places`, branch `polish-places`. Never touch main, other worktrees or `.claude/launch.json`; never push or merge.
- Tests: `npx vitest run --exclude '.claude/**' --exclude '.worktrees/**'` and `npm run build`. Long geometry sweeps get explicit timeouts (120_000). The Mac is heavily loaded: never weaken a test for a load timeout.
- Commits: explicit `git add <paths>`; every message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Determinism:** no Math.random in build code. `test/waterlooks.test.js` BUILD_DRAWS must stay exactly `neighborhood 4408, park 2252, seaside 860, docks 6916, woods 11344, river 15484, moor 7944, pines 11580, gorge 4488`. Every THREE geometry/material/Object3D constructor draws 4 Math.random (uuid), so new objects are made inside `withLocalUuids(key, fn)` (`src/world/localuuids.js`), and an object you REMOVE from a build must still be constructed (or replaced by an equal count of constructions) outside it.
- **Flat trace** `test/fixtures/flat-trace.json` sha256 `d2657f022d09b1d6507af42e30ce9666bfea29b3e52c2add1c218399a53a72f0`. Only Task 3 may move it, and only its `shadows` field (render-side); the parent session re-records in a separate final commit after a key-by-key isolation diff. No critter, camera, spawn or cat position may move.
- **Triangle caps (test/budget.test.js) must NOT be raised.** Every area stays ≤ its ceiling (woods/river/moor/pines/gorge/neighborhood 60,000; park 40,000; seaside 30,000). Mesh ceilings unchanged; each new mesh is noCast or merged. The Gorge's triangle total must not change at all.
- Colliders, walkable ground, keep-out, perches, POIs, spawns and routes do not change.
- Do not touch `src/render/dusk.js`, `lampPost`/`puddle` in builder.js, `src/world/camp.js`, `clancast.js`, `src/cat/*`, `fightcam.js`, `nametag.js`, `journal.js`, `thumbnails.js`, `treefade.js`, `camzoom.js`, `fx.js`.
- Near-edge pieces (inside 12 m of the ground's edge) stay ≤ 1.6 m tall unless the area's bounds are ≥ 15 m inside the ground's edge at that spot (the camera looks over them).

## Review Focus

1. A band that does not opt into a new option (the Gorge's rooftops, the Neighborhood/Park/Pines edges) changes by even one vertex — expect byte-identical geometry; tests compare position arrays before/after.
2. A new or removed THREE object shifts an area's Math.random count — waterlooks BUILD_DRAWS must pass unchanged after every task.
3. Edge pieces standing in water or floating on slopes after the arcs widen (River/Moor have rivers running off the map) — existing per-vertex dry check must still hold; test that no edge vertex is within 1.0 m of any water in the area's waters.
4. The offset Twoleg standing in the bench, under the canopy or in the oak limb at the Park — test the figure's world footprint against the bench and trunk.
5. Triangle totals creeping over a ceiling once all tasks land — the budget test runs after every task, and the before/after numbers go in its comment.

---

### Task 1: Trim invisible faces from reeds and heather (budget room)

**Files:**
- Modify: `src/world/builder.js` (`reedBed` ~l.3205, `heatherBed` ~l.3292 cushions only)
- Test: `test/builder.test.js`
- Modify: `test/budget.test.js` (comment only)

**Interfaces:** Produces: no API change. River and Moor gain triangle headroom for Task 5.

- [ ] **Step 1: Write failing tests** in `test/builder.test.js`:
  - `reedBed blades have no top or bottom faces`: for `b.reedBed(spots3, 3)`, triangle count === 3 spots × 5 blades × 8; every face normal (computed from positions) has |n.y| < 0.9.
  - `heatherBed cushions keep no face that points down into the ground`: for `heatherBase` of `b.heatherBed(spots2, 5)`, no face has normal.y < -0.3; triangle count < 2 spots × 2 cushions × 20.
  - Existing heather tests (bbox, determinism, `n === 4 * (spots.length * 2 + 3)` Math.random draws) must still pass unchanged.
- [ ] **Step 2: Run** `npx vitest run test/builder.test.js` — new tests FAIL.
- [ ] **Step 3: Implement.** reedBed: after building each blade BoxGeometry, drop its +y and -y groups from the index (as `dropBottom` does for -y; do it in place on the index, creating no new geometry object). heatherBed: on each cushion (non-indexed IcosahedronGeometry), keep only faces whose normal.y ≥ -0.3, by setting a new position (and normal, uv) BufferAttribute on the same geometry (BufferAttribute has no uuid; no new geometry object). Measure before/after per-area totals (River was 59,895 with reeds 31,980; Moor 59,761 with reeds 7,620 and heatherBase 15,400) with a throwaway script and record them.
- [ ] **Step 4: Run** `npx vitest run test/builder.test.js test/budget.test.js test/waterlooks.test.js test/flattrace.test.js test/moor.test.js test/river.test.js test/pines.test.js test/woods.test.js` — PASS (flat trace unchanged; reeds/heather are not in it).
- [ ] **Step 5:** Add a dated paragraph to the budget comment: "2026-11-03, polish-places: reeds lost their 4 cm top and buried bottom faces (12 → 8 tris a blade) and heather cushions their downward faces under the ground", with per-area before → after totals for every area that changed. Commit.

### Task 2: Woods houses and lookout rock

**Files:**
- Modify: `src/world/builder.js` (`rooftopSpots`/`addRoofBlock`/`horizonBand` rooftops branch ~l.1244–1380, 2137–2154)
- Modify: `src/world/woods.js` (`WOODS_HORIZON.rooftops` l.107; lookout mesh ~l.485)
- Test: `test/builder.test.js`, `test/woods.test.js`

**Interfaces:** Produces: `rooftops.style: 'houses'` (optional; omitted = today's behaviour exactly).

- [ ] **Step 1: Failing tests.**
  - builder: `rooftops without a style are byte-identical` — build `horizonBand({...GORGE_HORIZON})` (import from gorge.js) and compare its position array to a snapshot taken from the same opts with `style: undefined` explicitly (i.e. guards the default branch); also assert the Gorge build's triangle total is unchanged (59,307).
  - builder: `houses: small, sunk, windowed` — a band with `rooftops: { from: 0.1, to: 0.25, count: 14, height: 3.6, style: 'houses' }`: every house's highest vertex (roof ridge) is ≤ the band surface under it + 6.5 m; each house's footprint ≤ 9 × 7 m; the merged mesh carries ≥ 14 window quads in a darker vertex colour on the faces turned toward the area.
  - woods: `the lookout is a lumpy rock, its top at the perch` — the mesh at (LOOKOUT_TOP.x, LOOKOUT_TOP.z) (name it `lookoutRock`): bbox max y within [1.85, 2.0]; the highest vertices within 0.5 m of the centre are within 0.08 of 1.9 (a flat-ish standing top); bbox footprint radius ≤ 1.2 (collider r 0.9 unchanged); has a `color` attribute with green (moss) on top faces and grey below; geometry is not a CylinderGeometry.
  - existing: woods perch `{ x: -23, z: -27, y: 1.9, ... }` test and collider tests unchanged.
- [ ] **Step 2: Run** them — FAIL.
- [ ] **Step 3: Implement houses.** In 'houses' mode each block is a cottage: walls bw 5–8.5, bd 4–6.5, wall height `height × (0.75–1.1)`, pitched terracotta roof rise 0.45·bd, cream walls (existing `WALL_CREAM` tint path), 1–3 small window quads (≈0.7 × 0.8) plus one door quad on the face toward the area, no chimney box over 1.5 m. Sink each house so its wall base sits 40% of the wall height below the band surface (mostly roofs show over the crest). Spots stay `rooftopSpots` (same arc and count). **Draw count:** house geometry is made under `withLocalUuids('band-houses-' + salt, …)`, and the old block path's constructors must still run the same number of times outside it — call the existing `addRoofBlock` into throwaway arrays and dispose its output (comment why: the Woods' pinned uuid draw count, 11344). WOODS_HORIZON.rooftops → `{ from: 0.1, to: 0.25, count: 14, height: 3.6, style: 'houses' }`.
- [ ] **Step 4: Implement the lookout.** Replace the 7-sided cylinder with 2–3 stacked, hash-displaced rock lumps (low-poly, e.g. Dodecahedron/Icosahedron detail 0–1 scaled and vertex-jittered with `hash01`), merged, vertex-coloured grey with a moss-green cap on up-facing top faces, top flattened to y 1.9 around the centre. Build the parts and merge under `withLocalUuids('woods-lookout', …)`; outside it, construct exactly one `new THREE.BufferGeometry()` and `.copy()` the merged result into it, plus the Mesh and material as now, so the draw count is identical. Keep `addC(LOOKOUT_TOP...)` and the perch untouched. Material: same `litMaterial(…, surfaceProps('cobble'))` with `vertexColors: true` if supported, else a plain lit material — verify it renders (no black).
- [ ] **Step 5: Run** builder, woods, budget, waterlooks, flattrace, gorge tests — PASS. Record Woods triangles before (53,873) → after in the budget comment. Commit.

### Task 3: Park Twoleg steps out of the oak

**Files:**
- Modify: `src/critters.js` (villager branch of `buildCritter` ~l.318; `spawn()` ~l.380)
- Modify: `src/world/park.js` (l.415 spawn def)
- Modify: `src/game/walk.js` (l.752 marker parent; l.1164 decal follow) — two one-line edits
- Modify: `test/flattrace.test.js` l.200 (mirror walk.js: follow the figure)
- Test: `test/critters.test.js`, `test/park.test.js`

**Interfaces:** Produces: spawn def field `standOff: { x, z }` (villager only, metres in the group's frame); critter record field `c.figure` (THREE.Group holding body/head/arm; for every villager, at `standOff` or (0,0,0)); `group.userData.figure` same object.

- [ ] **Step 1: Failing tests.**
  - critters: `a villager's figure stands at its standOff and the group stays on the spawn` — `createCritters(scene, [{ type: 'villager', x: 4, z: 27, standOff: { x: 1.1, z: -1.3 } }])`: `c.group.position` is (4, 0, 27); `c.figure.getWorldPosition()` is (5.1, 0, 25.7); `c.group.userData.arm` is a descendant of `c.figure`.
  - critters: `a villager with no standOff is unchanged` — figure at the group origin; the body/head/arm meshes' world matrices equal today's (compare to a snapshot of positions made with the figure at 0).
  - critters: `building a villager draws on Math.random exactly as before` — count Math.random calls for building one villager with and without standOff; both equal today's count (figure Group made under `withLocalUuids`).
  - park: `the oak's Twoleg stands clear of the trunk, the canopy and the bench` — figure world xz is ≥ 1.9 m from the oak (4.5, 27.3) and ≥ 1.6 m from the bench (3, 26); figure xz is inside the park bounds and not in water.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.** In the villager branch, put body, head and arm into a `figure` Group created inside `withLocalUuids('twoleg-figure', …)`, positioned at `def.standOff ?? 0`; set `g.userData.figure`. In `spawn()`, `c.figure = group.userData.figure` (undefined for other critters). Park spawn: `{ type: 'villager', x: 4, z: 27, standOff: { x, z } }` with the offset chosen to satisfy the park test (≈ (1.1, −1.3), i.e. south-east of the trunk, away from the bench and the limb; check visually). walk.js: `giver.group.add(marker)` → `(giver.figure ?? giver.group).add(marker)`; `decals.follow(critter.group)` → `decals.follow(critter.figure ?? critter.group)`. Same change at flattrace.test.js l.200. Interaction ranges stay on `group.position` (the 1.7 m difference is inside the 4–5 m ranges) — note this in a comment.
- [ ] **Step 4: Run** critters, park, interactions tests, waterlooks — PASS. Run flattrace: it is expected to FAIL only on the Park's `shadows` hashes. Write a throwaway script that runs the trace with `UPDATE_TRACE=1` into a copy (not the fixture) and diff key by key: every `cat`, `camera`, `strays`, `critters`, `clan`, `toy`, `knockables`, `gold`, `paws` value byte-identical; only park `shadows` differ. Report the diff summary; do NOT re-record the fixture here (the controller re-records it in a separate final commit after the isolation diff).
- [ ] **Step 5: Commit** (fixture untouched).

### Task 4: Seaside dune edge and the boardwalk's end

**Files:**
- Modify: `src/world/builder.js` (`EDGE_STYLES`, `edgeSpots`, `buildEdge`)
- Modify: `src/world/seaside.js` (band opts ~l.457; boardwalk end near l.519)
- Test: `test/builder.test.js`, `test/seaside.test.js`

**Interfaces:** Produces: `EDGE_STYLES.dune` with optional `huts: [{ x, z, yaw, kind: 'hut'|'chair' }]` taken from the edge opts (`edge.props`), drawn into the same 'horizonEdge' mesh.

- [ ] **Step 1: Failing tests.**
  - builder: `the dune edge: marram tufts and fence posts, dry, under 1.6 near the edge` — `edgeSpots({ half: 70, style: 'dune' }, 59, [SEA_VIEW])` all ≥ 1.5 m from the sea; near pieces ≤ 1.6 m; mixture of 'piece' (tuft) and 'post' kinds.
  - seaside: `the Seaside band has a dune edge` — `horizonBand` child named 'horizonEdge', noCast, duskTint, with triangles; at least one beach hut and one lifeguard chair within 30 m of the point (18, 70) (the spawn's back view); seaside triangle total ≤ 30,000; seaside meshes ≤ 85.
  - seaside: `the boardwalk ends in a step and two posts` — a mesh named 'boardwalkEnd' near (20, 45.x), noCast or merged, with no collider added (colliders array deep-equal to before).
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.** 'dune': step ~3.2, tufts of 6–8 single-triangle blades in pale sea-green/straw (reuse the reeds blade code path with dune colours), every 3rd spot a weathered grey fence post (≤1.1 m), `trees: false`. `edge.props` pieces (huts ≈ 2.2 m wide, 2.6 m tall, striped pastel walls + roof; lifeguard chair ≈ 2.4 m: four legs, seat, small roof) are placed at given xz, seated on the band like other pieces, kept ≥ 1 m from water. Seaside band gets `nearColor: BEACH`? — only if it reads better; and `edge: { half: 70, style: 'dune', avoid: [SEA_VIEW], props: [...] }` with 2–3 huts and one chair just past the back edge behind the spawn (z ≈ 72–76, x ≈ 8–28) and a hut pair at a far corner. Boardwalk end: a low step board across its +z end plus two short posts, merged into one mesh built under `withLocalUuids('seaside-boardwalk-end', …)`; noCast. Record seaside triangles before (23,740) → after.
- [ ] **Step 4: Run** builder, seaside, budget, waterlooks, flattrace — PASS (seaside BUILD_DRAWS 860 unchanged; trace unchanged). Commit.

### Task 5: River and Moor all the way round; the Moor lake's shore

**Files:**
- Modify: `src/world/builder.js` (`EDGE_STYLES.reeds`/`wall` arcs and trees; `horizonBand` shore handling for a new opt)
- Modify: `src/world/river.js`, `src/world/moor.js` (band opts)
- Test: `test/builder.test.js`, `test/river.test.js`, `test/moor.test.js`, `test/budget.test.js` (comment)

**Interfaces:** Consumes: Task 1's headroom. Produces: band opt `shoreLip: { width, color }` (optional; omitted = byte-identical band).

- [ ] **Step 1: Failing tests.**
  - river/moor: `the edge runs round every corner` — edgeSpots for the area's edge opts have near pieces on all four sides (u in each quarter) and a far tree row (kind 'tree') on at least three sides; no vertex of the 'horizonEdge' mesh within 1.0 m of any of the area's waters.
  - moor: `the lake meets the far hills at a shore` — sampling the band surface along x from −70 to −110 at z = 40 and z = 60 (over LAKE): the height rises from the waterline through a stretch of ≥ 6 m whose height is < 0.6 m (the lip) before the hills, and the lip's vertex colour is the `shoreLip.color`.
  - builder: `bands without shoreLip are unchanged` — Woods/Pines/Gorge band positions identical to before (compare to a pre-change position-array hash captured in the test file as a constant).
  - budget: River ≤ 60,000 and Moor ≤ 60,000 (existing tests).
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.** Drop `arcs: SPAWN_CORNER_ARC` from reeds and wall (delete the constant if unused), turn on a sparse far tree row (`trees: true`; River: low round willows/alders in the reeds' crowns; Moor: wind-bent hawthorn-ish round crowns, maybe `TREE_SKIP` higher via a per-style `treeSkip`) — keep the per-area totals with ≥ 500 tris spare. If a full ring does not fit, thin the reeds' `blades` 12 → 8 first. `shoreLip`: where the band's `far` term lifts hills over water, first hold a flat lip at +0.15–0.4 m for `width` metres (sand/heath colour), then ramp up; implement as a change to `shore()`/`heightAt` and the colour pass, used only when the opt is given. Moor: `shoreLip: { width: 8, color: 0xb8ac80 }` (pale peaty sand), plus reed pieces along it if budget allows. Record River and Moor before → after (edge mesh and totals) in the budget comment's "edges" table.
- [ ] **Step 4: Run** builder, river, moor, budget, waterlooks, flattrace, island tests — PASS. Commit.

### Task 6: Live check (controller)

- [ ] Run `scratchpad/places/shots.mjs after` (port 5235), build 4–8 before/after pairs into `scratchpad/snaps-polish-places/pairs/` (one phone pair), full suite and `npm run build`.
