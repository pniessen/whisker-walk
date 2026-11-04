# polish-twolegplace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Neighbourhood houses get character (trim, window frames, shutters, flower boxes, chimneys, door canopies/porches, steps, pots, side windows, three roof shapes, varied colours), and the Seaside's six round green bushes become beach plants (marram clumps and sea holly) — with no change to any gameplay record, draw-count pin or the flat trace.

**Architecture:** `house()` gains an optional 6th argument `look`; with no `look` it builds exactly what ships (the den's two houses and every existing test keep that). With a `look`, the roof may be a gable (same mesh/material objects as the cone, so the same uuid draws), and all new dressing is built inside `withLocalUuids` as two meshes: one vertex-coloured `houseTrim` mesh and one glass `houseGlass` mesh tagged `userData.window` (side windows + door lantern, so they glow at dusk and treefade still finds the house). `bush()` gains `style: 'beach'`, built from exactly three geometries + one material + one mesh (+ the wind group), matching the canopy path's uuid count.

**Tech Stack:** Three 0.185, Vite 8, Vitest 4.

**Spec:** `scratchpad/polish-survey-5.md` → Pass 5, build 5-5 (ranked #5 and #6); shared rules `scratchpad/polish-common.md`.

## Global Constraints

- Flat trace stays sha256 `3dfb11a4d847498330c2f1bbc766add06531d4efadaab4c710868df495c1d838`.
- waterlooks BUILD_DRAWS stay: neighborhood 4408, seaside 860 (and all others unchanged). Den's build is unaffected (it never passes `look`).
- No Math.random outside the uuid generator; per-house/per-bush variety comes from `hash01(x, z, salt)` or explicit look data.
- Colliders (`addC(x, z, 3.4)` per house), door position (0.9×1.8 at local z 2.01), front windows (two 0.9×0.9 at (±1.6, 1.8, 2.01), `userData.window`), perches, POIs and the yarn-roof collectible unchanged. House (-12, 15) keeps the pyramid roof and nothing new on its roof within local x ∈ [0, 3], z ∈ [-0.5, 1.5] (the rooftop climb chain: perches at world (-9.5,15.5,y2.9), (-11.5,15.5,y4.1)).
- Every dressed house's `Box3.setFromObject` (non-precise) equals the shipped house's: x,z ∈ [−5.5154, 5.5154] about the house origin, y ∈ [0, 5] — so the contact-decal scan and the caster rule see exactly what they saw. All new dressing stays inside x ∈ [−2.8, 2.8], z ∈ [−2.8, 2.8], y ∈ [0, 5].
- Budget ceilings (test/budget.test.js) not raised: Neighbourhood built ≤ 450 meshes / 380 casters / 60k tris, merged ≤ 260 / 205; Seaside triangles must not rise above today's 29,521 (cap 30k), meshes ≤ 85.
- Small dressing pieces never get their own mesh: one trim mesh + one glass mesh per house max (+16 meshes for 8 houses).
- Commits: explicit `git add <paths>`, message ends `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Tests: `npx vitest run --exclude '.claude/**' --exclude '.worktrees/**'`; long sweeps get explicit timeouts (120_000).

## Review Focus

1. Dusk: the new glass (side windows, lantern) must glow like the front windows — covered by tagging; test asserts `userData.window` on `houseGlass`.
2. Treefade: a dressed house must still be found as a fade box and its box must not balloon (porch ≤ z 2.8) — Task 1 test.
3. mergeprops must not merge the window mesh into anything (already excluded by `userData.window`), and the trim mesh must keep its vertex colours after merging — Task 1 test runs `mergeStaticProps` on a scene with a dressed house and checks a mesh with `vertexColors` survives.
4. Draw identity under a warm cache: dressed vs plain `house()` and beach vs default `bush()` consume the same Math.random count — Tasks 1 and 3 tests.
5. Grazing camera below the eaves must not see through a gable roof — the trim mesh closes the eaves with a soffit (Task 1, live-checked).

---

### Task 1: Dressed houses in builder.js

**Files:**
- Modify: `src/world/builder.js` — `house()` (l.618–665) only, plus new private helpers placed directly above it (`gableRoofGeometry`, `houseTrimGeometry`, `houseGlassGeometry`). Do NOT touch logBridge/steppingStones/plankBridge (another build owns them).
- Test: `test/twolegplace.test.js` (new; copy the canvas `document` stub from test/budget.test.js lines 10–24).

**Interfaces:**
- Produces: `house(x, z, bodyColor = 0xe8d8b0, roofColor = 0xb05a4a, bodySurface = 'siding', look = null)`.
  `look` = `{ roof: 'pyramid' | 'frontGable' | 'sideGable', door: hex, trim: hex, shutters: hex | null, flowerBox: boolean, entry: 'hood' | 'flat' | 'porch', chimney: [lx, lz] | null, gable: hex }` (all fields optional; defaults: roof 'pyramid', door 0x7a5230, trim 0xf4efe4, shutters null, flowerBox false, entry 'hood', chimney null, gable = bodyColor).
- Child names: roof mesh keeps index 1; new meshes named `'houseTrim'` (vertexColors material, 'wood' light response via `surfaceProps('wood')`) and `'houseGlass'` (`userData.window = true`, same 0xa8d8e8 glass material recipe the front windows use, no map).

Design values (local coords, door face +z at z 2.01–2.06, body 5×3×4):
- Roof: 'pyramid' = the shipped cone, untouched. 'frontGable' = ridge along z at y 5, eaves at x ±2.8, y 2.8, rakes to z ±2.3. 'sideGable' = ridge along x at y 5, eaves at z ±2.3, y 2.8, rakes to x ±2.75. Gable geometry: one non-indexed BufferGeometry, two slope quads only, UVs scaled so `uv × repeatFor('shingle', 11, 4.4)` gives the same tile size in metres as the cone (u = metres/11, v = metres/4.4). The roof mesh is still `new THREE.Mesh(geo, surfMat(roofColor, 'shingle', 11, 4.4))` with position y 0 for gables (vertices in house space) — one geometry, one material, one mesh, same as the cone → same uuid draws. Set `geo.boundingBox` explicitly: x,z ±5.5154 (the rotated cone's non-precise extent), y from the vertices (2.8..5; the body already holds the house box's y 0) so the house's non-precise Box3 is unchanged; comment why (decal scan + caster rule read it).
- Trim (one merged vertex-coloured geometry; plain BoxGeometry pieces, `toNonIndexed()` before merge or all indexed — consistent): corner boards (0.14 wide) at the 4 body corners; fascia band under the eaves round the body top; plinth (darker body shade, 0.25 tall, 0.04 proud); window frames (outer 1.1×1.1, bar 0.09) + mullion cross + sill (1.25×0.07×0.18) on both front windows and the side windows; door frame + brass knob + stone step (1.4×0.14×0.6, z 2.0–2.6) + doormat; entry: 'hood' (two pitched boards over the door, z to 2.55), 'flat' (canopy slab 1.4×0.08×0.55 + 2 brackets), 'porch' (step widened to 1.9, 2 posts at x ±0.85 z 2.65, roof slab to z 2.78); shutters (0.42×0.95 boards each side of each front window, colour `shutters`) when set; flower box under one front window (x −1.6) with 6–8 small flower blobs in pink/yellow/red + leaves when `flowerBox`; two terracotta pots with green tops at x ±1.0, z 2.45 for every dressed house; chimney (0.6×0.6, brick 0xa0523d, from roof surface to y 4.95, cap 0.75×0.1) at `chimney`; gable end triangles in `gable` colour plus white bargeboards along each rake and a soffit quad closing the underside of the eaves (y 2.8) for gable roofs. Colours written as linear (`new THREE.Color(hex)` then `.r/.g/.b`).
- Glass (one geometry tagged window): one 0.8×0.8 pane centred on each side wall (x ±2.53, y 1.8, z 0) — framed in the trim — plus a small door lantern (0.14×0.2×0.14) at (0.75, 2.05, 2.12).
- Build trim + glass meshes inside `withLocalUuids(\`house:${x},${z}\`, …)`.
- Triangles per dressed house ≤ 1,400.

- [ ] **Step 1: Write failing tests in `test/twolegplace.test.js`**

```js
describe('house() look', () => {
  it('a plain house is exactly the shipped five meshes', () => { /* children.length === 5, children[1].geometry.type === 'ConeGeometry', no houseTrim */ });
  for (const roof of ['pyramid', 'frontGable', 'sideGable']) {
    it(`${roof}: keeps the shipped non-precise box`, () => { /* Box3.setFromObject(house(0,0,..,look)) equals Box3.setFromObject(house(0,0)) within 1e-6 */ });
    it(`${roof}: draws the same Math.random count as a plain house`, () => { /* warm up once, then count draws of house(3,4) vs house(3,4,…,look) with a counting Math.random wrapper; equal */ });
    it(`${roof}: all dressing stays inside x,z ±2.8 and y 0..5 (precise box of houseTrim/houseGlass)`, () => {});
  }
  it('front windows and door are where they shipped', () => { /* two userData.window 0.9 boxes at (±1.6,1.8,2.01), door at (0,0.9,2.01) */ });
  it('houseGlass is tagged window and treefade still finds the house', () => { /* findFadeOccluders(scene) has 1 entry; its box maxZ ≤ 2.81 */ });
  it('the trim survives the prop merge with its vertex colours', () => { /* mergeStaticProps(scene); some mesh material.vertexColors === true and geometry has color */ });
  it('a dressed house stays under 1,400 triangles more than a plain one', () => {});
});
```

- [ ] **Step 2: Run** `npx vitest run test/twolegplace.test.js` — expect FAIL (no look support).
- [ ] **Step 3: Implement** the helpers and the `look` branch in `house()`; keep the no-look path byte-identical.
- [ ] **Step 4: Run** `npx vitest run test/twolegplace.test.js test/builder.test.js test/treefade.test.js test/silhouette.test.js test/mergeprops.test.js` — expect PASS.
- [ ] **Step 5: Commit** `feat(house): optional look — trim, frames, shutters, flower box, chimney, entry, side windows, gable roofs`.

### Task 2: The Neighbourhood's street of houses

**Files:**
- Modify: `src/world/neighborhood.js` (the `lots` list l.162–191 and its comment).
- Test: `test/twolegplace.test.js` (append).

**Interfaces:**
- Consumes: `house(x, z, bodyColor, roofColor, bodySurface, look)` from Task 1.

Lots (x, z, body, roof, surface, look): give each of the 8 a distinct combination — roofs: 3 pyramid (incl. (-12,15)), 3 frontGable, 2 sideGable; roof colours from {terracotta 0xb05a4a, slate 0x5d6b7c, moss 0x627a52, cocoa 0x7a5242, dusty blue 0x5b7290}; bodies a touch richer than today's near-whites (lilac 0xd6c2ea, mint 0xbfe0cc, peach 0xf4cfb8, pale green 0xd9e8bc, lavender 0xcfc8f0; one buff brick kept, (-12,15) buff brick kept, (12,30) becomes warm red brick 0xb86f58 — update the brick comment); doors from {0xb8433a red, 0x2f4a6e navy, 0x3f6b4a green, 0xe0b040 yellow, 0x7a5230 wood}; shutters on 4 houses; flower boxes on 5; entries mixed (2 porches, 3 hoods, 3 flat); chimneys on 6 houses — (-12,15)'s chimney (if any) at local (-1.4, -1.0), away from the climb chain. Door colours/shutters must contrast with their body.

- [ ] **Step 1: Write failing tests**: every lot house in a built Neighbourhood has a `houseTrim` child; at least 2 of each roof style; house at (-12,15) has a ConeGeometry roof and no trim/chimney vertex within local x ∈ [0,3], z ∈ [-0.5,1.5], y > 3.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** the lots table.
- [ ] **Step 4: Run** `npx vitest run test/twolegplace.test.js test/neighborhood.test.js test/budget.test.js test/waterlooks.test.js test/flattrace.test.js test/climbing.test.js test/contactshadows.test.js test/houselights.test.js test/viewclear2.test.js` — PASS (waterlooks neighborhood 4408, flat trace unchanged).
- [ ] **Step 5: Commit** `feat(neighborhood): each house gets its own roof, colours, door and garden details`.

### Task 3: Beach plants for the Seaside

**Files:**
- Modify: `src/world/builder.js` — `bush()` (l.2755) option branch only + a private `beachClumpGeometry` helper directly above it.
- Modify: `src/world/seaside.js` l.690–697 (pass `style: 'beach'`; fix the comment).
- Test: `test/twolegplace.test.js` (append).

**Interfaces:**
- Produces: `bush(x, z, { wind, style } = {})`; `style: 'beach'` → a clump; kind hash-picked by `hash01(x, z, 1040) < 0.5 ? 'marram' : 'holly'` (ensure the six Seaside spots give at least 2 of each; pick a salt that does).

Design: marram = ~26 tapered, curving blades (3 segments, 5 triangles each), height 0.6–1.15 m, fanned from a 0.25 m base radius, base 0x8a9a5a → tip 0xd8c88a, plus 3 thin seed-head spikes; holly = ~10 spiky blue-grey (0x8fa6b0) leaves low (≤0.35 m) + 5 stems with octahedron heads (0x6f86c8) and star bracts. Built from exactly 3 BufferGeometries (part A, part B, `mergeGeometries([A, B])`, disposing A and B), 1 material (`litMaterial(0xffffff, { ...surfaceProps('foliage'), vertexColors: true, side: THREE.DoubleSide })`), 1 mesh, with the same wind Group/hinge and the same y placement rules as the canopy (mesh at y 0 local since the clump grows from the ground — bare-mesh path: position (x, 0, z)). ≤ 160 triangles each.

- [ ] **Step 1: Write failing tests**: beach bush draws the same Math.random count as a default bush (with and without wind, warm); ≤ 160 triangles; wind group at (x,0,z) and registered; both kinds appear among the six Seaside bushes; Seaside build triangles ≤ 29,521 (use budget.test's counting rule: index count or position count / 3).
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run test/twolegplace.test.js test/seaside.test.js test/builder.test.js test/budget.test.js test/waterlooks.test.js test/flattrace.test.js` — PASS.
- [ ] **Step 5: Commit** `feat(seaside): marram and sea-holly clumps replace the garden shrubs on the sand`.

### Task 4 (controller): budget log, live check, merge main

- [ ] Log Neighbourhood and Seaside meshes/casters/merged/triangles before → after in the budget.test.js comment block (docs only).
- [ ] AFTER shots with `snaps-polish-twolegplace/shots.mjs`, pairs into `pairs/`; check dusk glow and a treefade case.
- [ ] Merge main, full suite, `npm run build`, flat-trace hash check.
