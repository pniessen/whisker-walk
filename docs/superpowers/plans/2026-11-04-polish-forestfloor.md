# polish-forestfloor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ferns read as fronds; the Woods gets a forest floor (shade under trees, leaf litter, moss, bluebells, foxgloves, mushrooms); the Pines gets a needle-and-moss floor (needle beds, pinecones, moss cushions, blueberry clumps). Visual only.

**Architecture:** Three layers, none of which moves gameplay or the Math.random stream:
1. `fernBed` (builder.js) builds one raw vertex-coloured BufferGeometry of zig-zag leaflet fronds, and makes throwaway `new THREE.BufferGeometry()` objects so the number of Three objects it creates (and so the uuid draws) is exactly what the old box version made.
2. The ground plane's existing vertex colours are multiplied in place by a per-area tint (`tintGround` in dressing.js), as River/Moor already do: no new object, no triangles.
3. One new noCast vertex-coloured mesh per area, `forestFloor`, built in a new `src/world/forestfloor.js` from spot lists the area file computes, created under `withLocalUuids` (zero real draws). +1 draw call per area.

**Tech Stack:** Three 0.185, Vitest 4.

**Spec:** scratchpad `polish-survey-4.md` ranked #5, #9, #10 and Pass 4B-1; shared rules `polish-common.md` (final "Pass 4B" section).

## Global Constraints

- Owns: `fernBed` in `src/world/builder.js`, `src/world/woods.js` dressing, `src/world/pines.js` ground and dressing, `src/world/dressing.js` helpers, new `src/world/forestfloor.js`. Do not touch grass.js (polish-tufttint), camp.js, pathribbon.js, water/waterdress.
- `test/waterlooks.test.js` BUILD_DRAWS unchanged: woods 11344, pines 11580 (and every other area).
- Flat trace `test/fixtures/flat-trace.json` sha256 3dfb11a4d847498330c2f1bbc766add06531d4efadaab4c710868df495c1d838 unchanged; flattrace.test.js green.
- No Math.random; positions from `hash01` / `mulberry32(seedFromCode(...))` only.
- Colliders, perches, POIs, spawn, keep-out, fern/bramble/toadstool spot lists unchanged (tests pin their counts).
- New dressing: one merged mesh, `castShadow = false`, `userData.noCast = true`. 3D bits under 0.6 m tall (foxgloves) and mostly under 0.25 m.
- Triangle budget (build, test/budget.test.js counting): Woods 51,977 → ≤ 57,000; Pines 49,522 → ≤ 56,000. Ceiling 60,000.
- Long geometry tests get explicit timeouts (120_000).
- Commits: explicit `git add <paths>`; message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Tests: `npx vitest run --exclude '.claude/**' --exclude '.worktrees/**'`; `npm run build`.

## Review Focus

1. Uuid/draw parity: an empty spot list and a one-spot list in `fernBed` must still create the old object count (old: 0 spots → 1 geometry; n fronds = 1 → 1; n > 1 → n + 1, plus material and mesh). Test in Task 1.
2. A DoubleSide frond seen from below or behind goes black unless `bothSidesLit` is applied with up-leaning normals. Task 1 asserts the material.
3. Leaves/bits on a path or in water look wrong and bits on a find hide it: Task 2/3 tests check every 3D bit keeps the fern rule's clearances and every leaf/needle keeps off paths and water.
4. The ground tint must keep the sunny clearing (Woods) sunny and must not tint past what the grass tufts can tolerate: tint multipliers stay within [0.6, 1.35] per channel (test).
5. Z-fighting of flat litter with the ground at distance: flat pieces sit at y ≥ 0.018 (above trails 0.01 and contact shadows 0.015), each piece tilted ≤ 0.04 m.

---

### Task 1: Ferns as fronds

**Files:**
- Modify: `src/world/builder.js` (`fernBed`, ~l.3730-3755)
- Test: `test/builder.test.js` (the `fernBed is one low mesh…` case, ~l.761)

**Interfaces:**
- Produces: `fernBed(spots, seed)` same signature; returns one Mesh, material vertexColors + DoubleSide + `bothSidesLit` (import from dressing.js — dressing.js imports builder.js's hash01, so check for a circular-import problem; if it bites, move `bothSidesLit`'s use to a tiny local copy in builder.js and say so).

- [ ] **Step 1: extend the test** — keep existing assertions; add:
  - `m.material.vertexColors === true`, `m.material.side === THREE.DoubleSide`;
  - triangles per frond ≤ 14 (`position.count / 3 / (spots.length * 7) <= 14`);
  - colour gradient: average luminance of vertices with y < 0.08 is lower than of the highest 20% of vertices… use instead: the vertex at max distance from its spot (tips) is lighter than the root vertices (compute luminance of colour attribute for verts with y<0.05 vs verts with the top-10% horizontal distance from nearest spot);
  - uuid parity: wrap `Math.random` with a counter (seeded mulberry32) and assert `fernBed([],7)` draws 4*(1+2) = 12, `fernBed([{x:0,z:0}],7)` draws 4*(7+1+2) = 40, and three spots draws 4*(21+1+2) = 96. (Verify these numbers against the OLD code first by running the test before changing fernBed; whatever the old code draws is the target — material creation in litMaterial may draw more than 4. Pin the old code's numbers.)
- [ ] **Step 2: run** `npx vitest run test/builder.test.js -t fernBed` → new asserts fail (parity passes on old code).
- [ ] **Step 3: implement.** Per frond (same `turn`, `size`, `len`, lift angle and ring yaw hashes as today so the clumps sit where they did): 6 segments along an arching rachis — pitch starts at the old lift (0.52–0.87 rad up) and loses ~0.25 rad per segment so the tip droops to ≈ the root height + 0.1·len; each segment is two triangles: (c_i, leftTip_i, c_{i+1}) and (c_i, c_{i+1}, rightTip_i), leaflet tips set out sideways at mid-segment and slightly forward, leaflet half-length `0.11·size` at the base tapering to 0.02 at the tip, drooped 0.02–0.04 m below the rachis; one closing tip triangle → 13 triangles. Normals: per triangle, the face normal flipped to point up, then blended 50/50 with +Y and normalised. Vertex colour: lerp base `0x2c4f22` → tip `0x7d9e4e` (linear, via THREE.Color setHex) by distance along the frond, times a per-clump tone 0.88–1.08 (hash01). Material: `surfNoMap(0xffffff, 'foliage')` then set `vertexColors = true`, `side = THREE.DoubleSide`, `bothSidesLit(material)`. Build the geometry as ONE `new THREE.BufferGeometry()` from Float32Arrays (non-indexed), then create `oldGeomCount - 1` throwaway `new THREE.BufferGeometry()` (dispose each) where `oldGeomCount = n === 0 ? 1 : n === 1 ? 1 : n + 1` and `n = spots.length * FERN_FRONDS`, in a commented helper, so the draw count is the old one. Mesh castShadow false, noCast true.
- [ ] **Step 4: run** builder tests, `test/waterlooks.test.js`, `test/flattrace.test.js`, `test/woods.test.js`, `test/pines.test.js`, `test/budget.test.js` → all pass.
- [ ] **Step 5: commit** `feat(ferns): arching leaflet fronds, dark at the root and light at the tips`.

### Task 2: forestfloor.js and the Woods floor

**Files:**
- Create: `src/world/forestfloor.js`
- Modify: `src/world/woods.js` (ground line in build; new spot functions; add the mesh after the undergrowth)
- Test: create `test/forestfloor.test.js`

**Interfaces:**
- Produces (forestfloor.js; pure except `forestFloorMesh`):
  - `forestFloorMesh(parts, { name = 'forestFloor' } = {}) -> THREE.Mesh` — `parts` is `{ leaves, needles, moss, mushrooms, bluebells, foxgloves, cones, berries }`, each an array of `{ x, z, s?, a? }` (any may be missing/empty). Uses dressing.js `Tris`, `colorParts`, `dressMesh` (DoubleSide) + `bothSidesLit`. Caller wraps it in `withLocalUuids`.
  - `canopyShade(trees, x, z) -> 0..1` — 1 under a trunk, fading to 0 by `3.2 * scale` (smoothstep from `1.2 * scale`).
  - `woodsFloorTint(trees, clearing) -> (x, z) => [r, g, b]` multiplier.
  - `pinesFloorTint(trees) -> (x, z) => [r, g, b]` (Task 3 fills it; Task 2 may stub-export nothing for it).
  - Shapes (each a few triangles, flat-shaded, vertex-coloured):
    - leaf: one triangle 0.09–0.14 m, at y 0.018–0.03, tilt ≤ 0.04, palette russet `0x8a4a22`, ochre `0xb07a2a`, brown `0x6b4a2c`, olive `0x6f6a30` (hash pick);
    - moss cushion: IcosahedronGeometry(r 0.18–0.35, 0) squashed y×0.3, downward faces dropped, colours `0x4f7a2e`/`0x5f8a36`;
    - mushroom: 5-sided open stem (0.04 r, 0.06–0.1 h) + 6-sided cone cap (0.07 r) cream/brown `0xc8a878`/`0x8a5a34`, clusters of 2–4;
    - bluebell clump: 5 stems (one thin triangle 0.18–0.25 m, green) each topped by a drooping tetra bell `0x5a63c8`/`0x7a6ad8`;
    - foxglove: one tapered stem 0.4–0.55 m + 6 tetra bells up the top half, `0xc85aa0`/`0xe08ac0`.
- Woods side (woods.js): `export function woodsFloor()` returns the spots, seeded `mulberry32(seedFromCode('woods-floor'))`, using the trees from `woodsTreeSpots()`:
  - leaves: 22 × scale per tree, uniformly in a disc of radius 2.6 × scale round the trunk, rejected if `segDist` to any path < PATH_W/2 + 0.15, `waterDist < 0.6`, inside the camp disc (campLayout('woods') centre, radius from its layout; read camp.js) or out of bounds;
  - moss: 1–2 cushions at the foot of ~half the trees (0.6–0.9 × scale from the trunk), and 3 along the fallen log's sides;
  - mushrooms: 4 clusters beside the fallen log, 1 at the foot of every 6th tree;
  - bluebells: ~30 clumps in 6 patches of 5 (patch centres from the fern scatter style), foxgloves ~8, at the tree edges;
  - every 3D bit (all but leaves) passes woods.js's existing `undergrowthFits(x, z, FERN, trees)` except the trunk-foot moss, which keeps the FERN path/water/clear/spawn rules but not the trunk rule (moss must touch the trunk ≥ 0.45 × scale out).
  - In `build`: `const groundMesh = b.ground(...)`, `tintGround(groundMesh, woodsFloorTint(trees, CLEARING))`, `scene.add(groundMesh)`; after the brambles, `scene.add(withLocalUuids('woods-floor-uuids', () => forestFloorMesh(woodsFloor())))`.
- woodsFloorTint: `m = lerp(1, SHADE [0.74, 0.8, 0.72], shade)`, then leaf-litter patches `smoothstep(0.15, 0.55, smoothField(x, z, 91, 11))` toward `[0.95, 0.8, 0.6]` (×(0.4 + 0.6 shade) so it gathers under trees), moss patches `smoothstep(0.3, 0.7, smoothField(x, z, 97, 8))` toward `[0.78, 0.98, 0.72]`; overall wood dimming `0.9` outside the clearing, fading to 1 over the clearing's last 3 m (r 9). Clamp each channel to [0.6, 1.35].

- [ ] **Step 1: tests** in `test/forestfloor.test.js` (timeouts 120_000 on build cases):
  - `forestFloorMesh({})` is a noCast Mesh named 'forestFloor' with vertex colours; empty parts give 0 triangles;
  - shapes: each part kind's max y ≤ its cap (leaves 0.035, moss 0.12, mushrooms 0.2, bluebells 0.3, foxgloves 0.6);
  - `woodsFloorTint` channels within [0.6, 1.35] on a 1 m grid over ±60; value at CLEARING centre is [1,1,1]; mean of shade-zone samples (within 1 m of trunks) darker than open ground;
  - woods build: exactly one 'forestFloor' mesh, noCast; Woods triangles ≤ 57,000; `woodsFloor()` deterministic; every leaf off paths and water; every non-leaf bit ≥ 3 m from every KEEP_CLEAR place the woods test uses (import its records via the area's returned pois/collectibles/scenics + spawn), ≥ 2.3 m from path centrelines.
- [ ] **Step 2: run** → fail (module missing).
- [ ] **Step 3: implement** forestfloor.js and the woods.js wiring.
- [ ] **Step 4: run** forestfloor, woods, waterlooks, flattrace, budget, grass tests → pass. Report Woods meshes and triangles before (183 / 51,977) and after.
- [ ] **Step 5: commit** `feat(woods): a forest floor — shade under the oaks, leaf litter, moss, bluebells, foxgloves and mushrooms`.

### Task 3: the Pines floor

**Files:**
- Modify: `src/world/forestfloor.js` (`pinesFloorTint`, cone/needle/berry shapes), `src/world/pines.js` (ground line; `pinesFloor()`; add mesh after the beds)
- Test: `test/forestfloor.test.js`

**Interfaces:**
- Consumes: Task 2's `forestFloorMesh`, `canopyShade`.
- Shapes: needle fleck: one sliver triangle 0.16–0.24 × 0.025 m at y 0.018–0.03, rust `0x8a5a30` / `0x9a6a3a` / dry `0xa08050`; pinecone: two 5-sided cones base to base, 0.09–0.12 m long, lying on their side, `0x6a4428`; blueberry clump: 3 squashed IcosahedronGeometry(0.16–0.22, 0) lobes `0x35552c`, downward faces dropped, with 6 berry tetras (0.025) `0x3a4a8a`.
- pines.js `export function pinesFloor()`, seeded `mulberry32(seedFromCode('pines-floor'))`, trees from `pinesTrees()` (near and stand):
  - needles: 26 per near pine, 10 per stand pine, in a disc radius 2.4 × scale; cones: 3 per near pine, 1 per stand pine within 1.8 × scale; moss: ~40 cushions in patches between pines; blueberries: ~18 clumps;
  - keep-off: flat pieces off paths (both PINES_PATHS at PATH_W and PINES_TRAIL at TRAIL_W, centreline distance < w/2 + 0.15), off water (`waterDist < 0.6`, the file's own `waterDist`), off the island land (`ISLAND_LAND`) and bridge, out of the camp disc, in bounds; 3D bits use the pines.js undergrowth fit rule the ferns use (find it next to `pinesUndergrowth`), cones excepted from its trunk rule.
  - `pinesFloorTint(trees)`: needle beds `lerp(1, NEEDLE [1.28, 0.9, 0.78], canopyShade × 0.9)`, moss patches `smoothstep(0.25, 0.65, smoothField(x, z, 113, 9))` × (1 − shade) toward `[0.86, 1.14, 0.84]`, clamp [0.6, 1.35].
  - In `build`: `groundMesh` + `tintGround(groundMesh, pinesFloorTint([...near, ...stand]))`; after the beds, `scene.add(withLocalUuids('pines-floor-uuids', () => forestFloorMesh(pinesFloor())))`.
- [ ] **Step 1: tests:** pinesFloorTint bounds; under-pine sample redder (r/g higher) than open; pines build has one noCast 'forestFloor', triangles ≤ 56,000; `pinesFloor()` deterministic; nothing on paths, water, island; 3D bits ≥ 3 m from finds/POIs/spawn.
- [ ] **Step 2: run** → fail.
- [ ] **Step 3: implement.**
- [ ] **Step 4: run** forestfloor, pines, island, bordertrail, waterlooks, flattrace, budget → pass. Report Pines meshes/triangles before (116 / 49,522) and after.
- [ ] **Step 5: commit** `feat(pines): a needle-and-moss floor — needle beds, pinecones, moss and blueberries`.

### Task 4: budget log, live check, full suite (parent-run)

- [ ] Append a dated `polish-forestfloor` entry to the budget log comment in `test/budget.test.js` (meshes, casters, triangles before → after for Woods and Pines; ferns' triangles).
- [ ] After-shots with `scratchpad/snaps-polish-forestfloor/tools/shots.mjs after <area> [phone]`; pairs in `pairs/`; tune colours if needed.
- [ ] Final whole-branch review (most capable model), one fix wave; merge main; full suite, build, trace hash.
