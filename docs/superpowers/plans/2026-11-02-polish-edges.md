# polish-edges Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Survey-2 Build B3 — hide the world's edge behind the spawn, give the Seaside boats a sail and cabin and its cliff real rock, and turn the blue-peg neighbours into friendly low-poly Twolegs.

**Architecture:** Everything new rides on meshes that already exist, so no area's object count (waterlooks BUILD_DRAWS) and no draw-call count moves. The edge dressing (hedges, scrub, stone walls) and the Woods' red roofs are merged into the one `horizonBand` mesh; parts are built under `withLocalUuids` so their uuids do not touch Math.random. The boats' sail/cabin go into the existing hull mesh's geometry, the cliff detail into the existing cliff geometry, and the Twoleg into the villager's existing three meshes (body, head, arm). Where a real-uuid geometry is replaced, the replacement is ONE `mergeGeometries` call made OUTSIDE `withLocalUuids` (one BufferGeometry = one uuid = 4 draws, the same as the BoxGeometry/CylinderGeometry it replaces), fed with parts made INSIDE it.

**Tech Stack:** Three 0.185 (`mergeGeometries` from `three/examples/jsm/utils/BufferGeometryUtils.js`, already imported by builder.js), Vitest 4.

**Spec:** scratchpad `polish-survey-2.md` rows polish #8, #10, #13 and section "Build B3"; scratchpad `polish-common.md` (hard rules).

## Global Constraints

- Tests: `npx vitest run --exclude '.claude/**' --exclude '.worktrees/**'` all green; `npm run build` passes.
- waterlooks BUILD_DRAWS unchanged: neighborhood 4408, park 2252, seaside 860, docks 6916, woods 11344, river 15484, moor 7944, pines 11580, gorge 4488.
- test/fixtures/flat-trace.json sha256 stays 6b502ab6b1f9ce328fd6c6b7ce656fd473e50670708fac53985590bc9f0e54a7 (flattrace.test.js passes untouched). Never re-record it.
- No Math.random, walkRng or strayStream draws for anything new; use `hash01` (builder.js), `seedFromCode`/`mulberry32`, `withLocalUuids` (src/world/localuuids.js).
- Colliders, bounds, walkable ground, perches, spawn, POIs unchanged. Dressing sits BEYOND the play edge, never inside `bounds`.
- Mesh name `'horizonBand'` is kept (walk.js's dusk tint matches it by name).
- Draw calls flat: no new top-level meshes anywhere.
- Twolegs are kind neighbours: soft colours, smiles optional, nothing scary (no dark hoods, no faces drawn that could read as creepy, no masks).
- Long geometry sweeps get explicit timeouts (120_000). Float fixture comparisons use `closeDiffs` from test/helpers/closeto.js.
- Commits: explicit `git add <paths>`; every message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Files owned by other running builds: do not touch src/world/gorge.js, gorgeshape.js, caveroom.js, caves.js, rockrelief.js, src/fx.js, src/main.js, walk.js.

## Review Focus

1. A river, lake or mire that runs off the map: the edge dressing must leave a gap over water (no hedge standing in a river). Test: per area, no edge vertex within 1.5 m of a water footprint (`waterClearance(avoid, x, z) >= 1.5`).
2. The camera at the far zoom (11 m back, 6.5 m up) behind a cat at the bounds: dressing in the camera's path would wall off the cat. Test: every edge vertex is outside `bounds` + 4.5 m on its side AND (for anything within bounds + 11 m) no taller than 1.6 m.
3. A lane or path that leaves the map (Neighbourhood main street, the Park's south path): it should end at a gate/gap, not run under a hedge. Test: no hedge vertex within the gap discs listed in each area's `edge.gaps`.
4. Dusk: the band still gets tinted (it stays one mesh named horizonBand with a `.material.color`). Test: existing walk/dusk tests plus a builder test that a band with `edge` still has `name === 'horizonBand'` and `material.color` defined.
5. Co-walk determinism: two builds of the same area give byte-identical band, boat, cliff and villager geometry. Test: build twice, compare position arrays.

---

### Task 1: Edge dressing and near-colour in `horizonBand`

**Files:**
- Modify: `src/world/builder.js` (horizonBand and helpers, ~l.1130-1560)
- Modify: `src/world/neighborhood.js`, `src/world/park.js`, `src/world/river.js`, `src/world/woods.js` (horizonBand call options only), `src/world/moor.js` (`MOOR_HORIZON`), `src/world/pines.js` (`PINES_HORIZON`)
- Test: `test/edges.test.js` (new)

**Interfaces:**
- Produces: two new `horizonBand` options, both defaulting to "off" so a call without them is byte-identical (the existing fingerprint test in test/builder.test.js must still pass):
  - `nearColor` (hex | null): ring vertex colour blends from `nearColor` at band distance `d <= flat` (i.e. where the ground plane's edge and the sunk flat strip are) to the band's normal colour (its side tint, or `color`) by `d >= flat + 0.5 * ramp`, smoothstep. Turns vertex colours on (material white, the band colour moved into the vertex colours) the way `sideTints` already does.
  - `edge` ({ half, style, gaps = [] } | null): a ring of low dressing straddling the ground plane's edge, `half` = the ground plane's half-size (60 for all six areas). Exported pure helper `edgeSpots(edge, salt, avoid)` → `[{ x, z, yaw, kind }]` so tests check placement without a mesh.
- Exported for tests: `EDGE_STYLES` (frozen map of style → palette/sizes), `edgeSpots`.

Design decisions (fixed here; implementer writes the bodies):
- Pieces sit on a square path at `half + 0.6` (just outside the ground's edge, which also hides the hard seam line), every ~2.2 m along it, with a hash01 jitter of ±0.4 m in and out. Corners are filled. Each piece is skipped when `waterClearance(avoid, x, z) < 1.5` or it is within `r` of any `gaps` disc.
- Styles (vertex-coloured, flat-shaded, low-poly; heights are the max a piece may reach):
  - `'hedge'` — clipped privet: a box 2.4 × h × 1.0 per piece, h 1.0–1.3, top vertices lifted by hash01 0–0.12 for a soft clipped top, two greens (0x3f7a3a, 0x4d8a42). In each gap a 5-bar wooden field gate (posts + rails, 0x8a6a48), 1.1 m tall, spanning the gap.
  - `'scrub'` — woodland edge: 2–3 overlapping IcosahedronGeometry(detail 0) blobs per piece, radius 0.5–0.9, squashed to y-scale 0.7, greens 0x4f7d3e / 0x5f8f48 / 0x6b8a3c, max height 1.4. No gates (gaps are just open).
  - `'reeds'` — River: as scrub but paler, straw-greens (0x8a9a5a, 0x9aa868, 0x7f9a56), max 1.3.
  - `'wall'` — Moor: a dry-stone wall, a chain of jittered boxes 0.7–0.9 tall, greys (0x8c8a84, 0x9a978e, 0x7d7b75), plus every third piece a gorse blob (0x6f7a3a with a few yellow 0xd8b84a vertices). Max 1.2.
  - `'pinescrub'` — Pines: scrub in dark greens (0x2f4a34, 0x3a5a3c), plus every fourth piece a small cone sapling (ConeGeometry r 0.6, h 1.5, 6 sides). Max 1.6.
- Optional second, taller layer: for every style except `'hedge'`, a sparse row of tree-sized blobs (r 1.5–2.5, up to 5 m) at `half + 12 .. half + 18` (always more than 11 m outside every area's bounds, which are 50–55, so the far camera never sits inside one), every ~9 m with hash01 skips of 40 %. For `'hedge'` areas (Neighbourhood, Park) the same row as round oak crowns on a trunk colour. Same water/gap rules. Sunk to the band surface height at that spot (`heightAt`), minus 0.2.
- All edge parts are made inside `withLocalUuids(`band-edge-${salt}`, ...)` and pushed into the existing `parts` list AFTER the rooftops (test/gorge.test.js assumes the ring comes first and rooftops after), with their own vertex colours, `bases` null and tone white, so they ride the existing merge. Piece base y = `-BAND_SINK`.
- No new mesh, material or draw call. The band keeps `name = 'horizonBand'`, `frustumCulled = false`.
- Per-area calls:
  - neighborhood: `nearColor: 0x7cb860, edge: { half: 60, style: 'hedge', gaps: <where the main street and side street leave the 120 m plane; read their b.path() calls in neighborhood.js; r = path half-width + 0.5> }`
  - park: `nearColor: 0x6cb058, edge: { half: 60, style: 'hedge', gaps: <path ends at the plane edge, from park.js's path calls> }`
  - river: `nearColor: 0x7d9c55, `edge: { half: 60, style: 'reeds' }`
  - woods: ground hex `0x5f9a4a`, `edge: { half: 60, style: 'scrub' }`
  - moor: `MOOR_HORIZON` gains `nearColor: 0x8a9558` and `edge: { half: 60, style: 'wall' }` (frozen like the rest)
  - pines: `PINES_HORIZON` gains `nearColor: 0x56603e` and `edge: { half: 60, style: 'pinescrub' }`
  - seaside, docks, gorge: unchanged.
- If an area's ground plane is not 120 m, use its half-size instead (check each `b.ground(size, …)`).

- [ ] **Step 1: Write the failing tests** in `test/edges.test.js`:
  - `edgeSpots` is deterministic (two calls deep-equal) and every spot is outside the area's bounds by >= 4.5 m on the side it sits (build each of the six areas, read `bounds` from the returned record and the band options from the exported HORIZON consts or by re-reading the call — export the option objects from neighborhood/park/river/woods as `NEIGHBORHOOD_HORIZON` etc. if they are inline, frozen, the way moor/pines already do).
  - For each of the six areas: build into a fresh scene; exactly one child named `'horizonBand'`; its position count grows vs. a band built from the same options minus `edge`/`nearColor`; every vertex with index >= the ring's (152*13) and max(|x|,|z|) <= bounds-edge + 11 has y <= 1.6; no such vertex has `waterClearance(areaWaters, x, z) < 1.0` (vertices, so 1.0 not 1.5); no vertex inside any gap disc.
  - Near colour: on the neighbourhood band, ring vertices with `d <= flat` (i.e. half-size <= inner + 10) carry a colour within 0.02 per channel of `new THREE.Color(0x7cb860)`; ring vertices at `d >= flat + ramp` do not.
  - Determinism: building the woods twice gives identical band position and colour arrays.
  - `b.horizonBand` with `edge` still has `name 'horizonBand'` and `material.color` defined.
- [ ] **Step 2: Run** `npx vitest run test/edges.test.js` — expect FAIL (no `edgeSpots` export).
- [ ] **Step 3: Implement** `edgeSpots`, `EDGE_STYLES`, the piece builders and the `nearColor` blend in builder.js; add the options to the six areas.
- [ ] **Step 4: Run** `npx vitest run test/edges.test.js test/builder.test.js test/waterlooks.test.js test/flattrace.test.js test/horizonwater.test.js test/gorge.test.js test/moor.test.js test/clouds.test.js` — all PASS, BUILD_DRAWS unchanged, flat trace unchanged. If `horizonwater.test.js`'s "hills stand on the horizon" check needs the ring only, it should be untouched by edge parts (they come after the ring vertices).
- [ ] **Step 5: Report triangles** added per area (band triangle count before/after, from `geometry.index.count / 3`) in the commit body.
- [ ] **Step 6: Commit** `feat(edges): hedges, scrub and walls along the ground's edge, merged into the horizon band; band near colour matches the lawn`.

### Task 2: Warm Twolegplace rooftops (Woods, and the Gorge's town)

**Files:**
- Modify: `src/world/builder.js` (`addRoofBlock` and the `rooftops` branch of horizonBand only)
- Test: `test/edges.test.js` (append)

**Interfaces:**
- Consumes: horizonBand's `rooftops` option (existing). The skyline kind (Docks) is NOT changed — its fingerprint `923b0516f4882a6a` must still match.
- Produces: rooftop blocks (only those from the `rooftops` option) get (a) a pitched roof: a triangular prism over the block's full width and depth, ridge 0.35 × block depth above the top, terracotta tones 0xb5533c / 0xa04a36 / 0x8e4a3a by hash01, NOT multiplied by the side tint; (b) walls warmed: wall colour = side tint lerped 55 % toward cream 0xe6d6bc, then the existing tone. Chimneys stay but take the wall colour. Windows unchanged.
- Roof prisms are made inside `withLocalUuids(`band-roofs-${salt}`, ...)` so the Woods (11344) and Gorge (4488) counts hold.

- [ ] **Step 1: Write the failing test**: build the Woods; in the band's colour attribute, count vertices whose colour has r > g * 1.25 and r > b * 1.4 (terracotta) — expect >= 14 * 6 (one prism per block, 6+ verts each); none of those vertices lie on the ring (index < 152*13). Also: the Docks skyline fingerprint unchanged (already in builder.test.js).
- [ ] **Step 2: Run** it — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run test/edges.test.js test/builder.test.js test/waterlooks.test.js test/gorge.test.js` — PASS. test/gorge.test.js's "every rooftop vertex north of z 50" check must still hold (the prism sits on its block, so it does).
- [ ] **Step 5: Commit** `feat(edges): Twolegplace rooftops get red pitched roofs and warmer walls`.

### Task 3: Seaside boats with a cabin and a sail; the cliff gets real rock

**Files:**
- Modify: `src/world/seaside.js` (the boat loop ~l.382-401; `strata()` ~l.106-137 and `cliffMat`; nothing else — gull parts are not ours)
- Test: `test/edges.test.js` (append)

**Interfaces:**
- Boats: the loop keeps creating, per boat, exactly one Group, one hull Mesh with ONE geometry and ONE material, one mast Mesh with one geometry and one material (same uuid count). The hull geometry becomes `mergeGeometries(withLocalUuids('seaside-boat-' + i, () => parts))` — note the merge OUTSIDE, the parts INSIDE — with vertex colours, and the hull material becomes `litMaterial(0xffffff, { surface: 'paintedMetal', vertexColors: true })` (the boat's colour moves into the vertex colours). Parts, all in the boat's local frame (bow toward -z, 4.5 m long, 2 m beam):
  - a shaped hull: tapered at the bow (a box whose bow-end top/bottom vertices are pulled in to 0.2 m wide), 0.8 m tall, painted the boat's colour, with a 0.12 m white stripe (0xf2efe6) along the gunwale;
  - a small wheelhouse/cabin, 1.1 × 0.9 × 1.2, at the stern half, cream 0xf2ead8 with a darker roof 0x5a4a3e;
  - a triangular sail beside the mast (mast stays at y 2, 3 m tall): a flat double-sided triangle (two windings so it shows from both sides) from the mast at y 0.9 to the masthead y 3.4, foot 1.6 m along +z, off-white 0xf4efe2; one of the three boats (the red one) gets a sail striped with its own colour (two triangles). Flat-shaded.
- Cliff: still one Mesh per cliff/overlook with its BoxGeometry run through `strata()`. `strata()` additionally:
  - bands with real contrast: four repeating tones cream 0xe2cfa8, ochre 0xc9a46c, rust 0xb07c58, pale 0xd8c4a0 (as multipliers on a white material — change `cliffMat`'s colour to 0xffffff and keep the sand surface), chosen per band by `hash1`, the damp foot kept;
  - a grass cap: vertices of the TOP face (normal +y; BoxGeometry's top-face vertices are their own) get green 0x8a9a5a / 0x7d8f50; side-face vertices at the top edge keep rock colours, so the cap reads as a crisp green rim;
  - face relief: every vertex on the seaward (+z local) face and its two end faces is pushed INTO the rock (local -z for the seaward face, toward the centre for the ends) by 0–0.9 m as a smooth function of (x, y) — vertical gullies every ~3–5 m (`|sin(x * 0.9 + salt)|^3`-like) plus a small hash term — and any vertex shared by position with the top face gets the same push, so no gaps open. Never pushed outward: the colliders (`addC(-38 + i*5, -37, 2.5)`) keep matching.
  - top jag deepened to ±0.8 m (from ±0.45), still `y` only.
- Draws unchanged: seaside BUILD_DRAWS 860.

- [ ] **Step 1: Write the failing tests**:
  - Build the seaside; find the three boat groups (Groups with 2 mesh children whose hull geometry has a `color` attribute — or tag `group.userData.boat = true`); each hull geometry's bounding box height > 3 (the sail) and has >= 3 distinct colour values; boat groups are still exactly 3.
  - The cliff mesh (position (-10, 4, -46)): every vertex's world z <= -37 + 1e-3 (never past its face); top-face vertices (normal.y > 0.9) have g > r (green cap); at least 4 distinct band tones on the seaward face.
  - waterlooks seaside count 860 (run waterlooks).
  - Determinism: build seaside twice, hull and cliff position arrays equal.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run test/edges.test.js test/waterlooks.test.js test/seaside*.test.js test/flattrace.test.js` (and any test that greps seaside.js — `grep -l seaside test/*.js`) — PASS.
- [ ] **Step 5: Commit** `feat(edges): Seaside boats get a cabin and a sail; the cliff gets rock bands, gullies and a grass cap`.

### Task 4: Twolegs instead of blue pegs

**Files:**
- Modify: `src/critters.js` (the `type === 'villager'` branch of the critter builder ~l.215-227 only; the wave code in update() stays as it is and keeps animating `g.userData.arm.rotation.z`)
- Test: `test/critters.test.js` (append) or `test/edges.test.js`

**Interfaces:**
- Same three meshes as today, created in the same order with the same number of geometries and materials: `body`, `head`, `arm` (`g.userData.arm = arm`, arm pivot at its shoulder, geometry translated so rotation.z swings it from the top as today). Each geometry is `mergeGeometries(withLocalUuids(key, () => parts))` (merge outside, parts inside); each material `litMaterial(0xffffff, { vertexColors: true, flatShading: true })`. So the Math.random draws of building one villager are exactly what they were (measure the old number first in the test, hard-code it).
- The Twoleg (~1.65 m tall, the old peg was 1.46; keep the head top under 1.75):
  - body: two legs (trousers, boxes or 6-sided cylinders 0.13 r, 0–0.75 m), shoes (dark 0x3a3330, slightly forward), a coat/jumper torso (tapered 8-sided cylinder 0.75–1.35 m, r 0.26 → 0.21), the far arm hanging at the side (sleeve + hand), a collar/scarf ring.
  - head: neck stub, a skin-tone head sphere (8×6) at y ~1.47 r 0.15, hair cap or a hat (brim + crown) — hat or hair chosen per villager; two tiny dark eyes (0x2a2420) are fine, no mouth needed.
  - arm: sleeve in the coat colour + skin hand at the end, length 0.55, same pivot/translation convention as today, positioned at the shoulder (0.27, 1.3, 0).
  - Look per villager chosen from its spawn position with `hash01`-style integer hashing of (x, z) (no rng): coat from [0x6a8ac0 (the old blue), 0xc8604a, 0x5e9a6a, 0xd8a640, 0x8a6ab0], trousers from [0x4a5468, 0x6a5a48, 0x3e4a5a], skin from [0xe8c8a8, 0xc89a74, 0x8e6446, 0xf0d2b8], hat/hair: bobble hat, flat cap, or hair (brown 0x5a3a24, black 0x2a2220, ginger 0xb8643a, grey 0xb0aca4). Friendly bright colours; nothing dark-hooded.
- No change to createCritters' signature, update(), the wave, or what the villager emits.

- [ ] **Step 1: Write the failing tests**:
  - Before touching the code, count Math.random draws for `createCritters(scene, [{ type: 'villager', x: 4, z: 0 }], { rng: mulberry32(7) })` (wrap Math.random with a counter); hard-code that number; the test asserts the same count after the change.
  - The villager group has exactly 3 mesh children; `userData.arm` is one of them; every geometry has a `color` attribute; the group's bounding box height is in [1.55, 1.75]; two villagers at different spawns can have different coat colours (pick two spawns that hash differently and assert inequality of the body colour arrays); building the same spawn twice gives identical geometry.
  - Existing critters tests still pass (the wave test reads `arm.rotation.z`).
- [ ] **Step 2: Run** — FAIL (no colour attribute).
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run test/critters.test.js test/dogs.test.js test/flattrace.test.js test/edges.test.js` — PASS, flat trace unchanged.
- [ ] **Step 5: Commit** `feat(edges): neighbours are low-poly Twolegs (legs, coat, hat) instead of blue pegs`.

### Task 5: Full suite, build, live check (controller does this)

- [ ] Full test suite and `npm run build`.
- [ ] `shasum -a 256 test/fixtures/flat-trace.json` = 6b502ab6…54a7.
- [ ] AFTER shots from the same fixed camera spots as the BEFORE shots (scratchpad `edges/shots.mjs`), pairs in `snaps-polish-edges/pairs/`, scene draws and triangles compared at the same spots.

## Rulings ledger

| # | Ruling | Cost if wrong |
|---|---|---|
| R1 | Edge dressing is merged into the horizonBand mesh rather than a new mesh added in walk.js. Zero new draw calls, no walk.js edit (owned by others), and it gets the dusk tint for free. | It shares the band's flat shading and dusk tint (slightly darker at dusk than trees). Splitting it out later is a small refactor. |
| R2 | Dressing all the way round the ground's edge, not only behind each spawn. The seam is the same on every side; a kid turns round anywhere. | ~5–15k more band triangles per area (shadow pass draws the band too). Measured in the report. |
| R3 | Hedges/scrub at the ground's edge (half + 0.6) and ≤ 1.6 m; trees only 12 m+ further out. The far-zoom camera (11 m, 6.5 m up) can reach the ground's edge but never the tree row. | If a camera swings low through a hedge, a few frames of green; the camera is ≥ 2.2 m up at every zoom, so this needs a pathological pitch. |
| R4 | Boat, cliff and Twoleg detail goes into existing meshes' geometry (merge outside withLocalUuids, parts inside) so object counts and the flat trace hold exactly. | None for gameplay; the hull/villager materials become vertex-coloured white, so any code that reads `hull.material.color` as the boat colour would see white (none known). |
| R5 | Villager looks come from a hash of its spawn spot, not from rng, so co-walkers see the same neighbours and no draws move. | Two villagers could hash to the same look; harmless. |
| R6 | Seaside, Docks and Gorge get no edge dressing: their edges are dunes, the town and the gorge walls, and survey-2 shows no seam there. | If a seam turns up there later it is one option on their band call. |
