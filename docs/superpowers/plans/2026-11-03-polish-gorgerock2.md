# polish-gorgerock2: organic Gorge rock — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Gorge's walls, crests and loose rocks read as rounded, weathered, water-carved sandstone instead of faceted slabs and boxes, without changing gameplay or going over the 60k triangle cap.

**Architecture:** Most of the look comes from shading, not triangles: crease-aware smooth normals on the rock shell and its dressing, and a small `onBeforeCompile` patch on the rock materials (bedding lines, vertical flutes as normal perturbation, grain, overhang darkening). The relief field (rockrelief.js) is reshaped (gullies, undercuts, rounded crests) inside its existing bounds. Triangles for a finer wall grid and rounded tors are paid for by cheaper scree pebbles and by dropping ground-plane triangles buried under rock.

**Tech Stack:** Three 0.185, Vite 8, Vitest 4. Pure JS geometry, GLSL chunk injection.

**Spec:** the owner's words: "Do another beauty pass on The Gorge, making the rocks and cliffs less angular and more organic (like real cliffs and gorges)." Plus the parent's brief (rounded weathered sandstone; softened edges and crests; undercuts and overhang bellies; vertical fluting/gullies; horizontal strata that wrap the form; talus/scree aprons at wall feet; rounded boulders instead of cubes; natural cliff-to-clifftop transition) and the shared rules in the scratchpad's `polish-common.md`.

## Global Constraints

- Work only in this worktree (`.worktrees/polish-gorgerock2`, port 5239). Owned files: `src/world/gorge.js`, `gorgeshape.js`, `rockrelief.js`, `meshconform.js`, `narrows.js`, `caveroom.js`, the rockTerrain section of `src/world/builder.js` (from "THE GORGE'S ROCK" to the end of `rockDressing`). New files are fine. The one allowed edit outside: `builder.scree` gets an opt-in option (only the Gorge calls it).
- Gorge area cap in `test/budget.test.js` stays 60,000 triangles. Today: 59,307. Finish at ≤ 59,600 (≥ 400 margin). Report triangles before/after per mesh.
- Gorge guard unchanged: 60 meshes, 36 casters (`test/gorgerock-guard.test.js`, fixture `test/fixtures/gorge-gameplay.json` must NOT be re-recorded). `BUILD_DRAWS.gorge` stays 4488 (`test/waterlooks.test.js`): any new THREE geometry/material/mesh made during `build()` must be made inside `withLocalUuids('gorge-uuids-<name>', fn)` (src/world/localuuids.js), or attributes must be replaced in place on existing objects.
- Flat trace sha256 stays `d2657f022d09b1d6507af42e30ce9666bfea29b3e52c2add1c218399a53a72f0`.
- No Math.random; noise from `noise3` / `hash01` / integer hashes. Same input → same output.
- Gameplay unchanged: ground shapes, colliders, perches (incl. tor perches at their `h`), spawn, keep-out, cave routes. Walk, cave, den and lip tops never move (existing tests).
- Shader: one patch, shared program (`customProgramCacheKey`), at most ~3 value-noise evaluations per fragment, no loops, no textures. iPhone 18 must hold 60 fps on HIGH.
- Long geometry tests get explicit timeouts (120_000). Float fixtures use `closeDiffs`.
- Tests: `npx vitest run --exclude '.claude/**' --exclude '.worktrees/**'`; also `npm run build`.
- Commits: explicit `git add <paths>`; every message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Per-task measure: `TAG=<task> OUTF=<scratch>/snaps-polish-gorgerock2/scripts/measure.out npx vitest run -c <scratch>/snaps-polish-gorgerock2/scripts/vitest.gr.config.js` (prints meshes, casters, tris, shellTris, per-mesh `named`). `<scratch>` = `<scratchpad>`.

Before (measured at 5ab279f): meshes 60, casters 36, tris 59,307; groundPlane 4,608; rockFaces 10,488 (shell 8,688); ledgeTops 398; lips 4,551 (shell 1,251); scree 12,260; tor* 1,188; summitRockBoulder 36; gorgeMeadow 3,136; narrowsDressing 1,066.

## Review Focus

1. A cat standing on any walkable top (ledge, leg, clifftop, floor by a wall) floating or sinking because the drawn surface moved — Task 7's tolerance test raycasts the drawn rock over every walkable sample.
2. The patched rock material losing its patch or failing to compile (merged by mergeStaticProps, cloned, or a chunk name not found in three 0.185) — Task 5's test runs the patch against `THREE.ShaderLib.standard` and checks every injection landed; the live check reads the console.
3. Smooth normals bleeding across a real crease so a ledge top looks bent or a wall foot glows — Task 3 test: every walk-top vertex normal stays exactly (0, 1, 0).
4. Rounded tors no longer matching their colliders / perch heights — Task 3 test: top within 0.05 of `h`, reach within [0.85 r, r + 0.05].
5. The Narrows dressing (placed from rockFaces normals) moving because normals became smooth — Task 3 makes `narrowsRockTris` take face normals from positions; `narrows.test.js` must pass unchanged.

---

### Task 1: Triangle headroom — pebble scree and hidden ground

**Files:**
- Modify: `src/world/builder.js` (`scree`, ~line 4447: add opt-in option)
- Modify: `src/world/gorge.js` (`build`: pass the option; trim the ground plane)
- Test: `test/gorgerock2.test.js` (create)

**Interfaces:**
- Produces: `scree(spots, seed, { pebble = false } = {})` in builder.js; `trimHiddenGround(plane, masses)` exported from gorge.js, returns the number of triangles dropped.

- [ ] **Step 1: Write failing tests** in `test/gorgerock2.test.js` (copy the `document` stub from `test/gorgerock-guard.test.js`; build the Gorge once at module level):
  - `'scree pebbles: 8 triangles a stone, smooth, no taller than before'` — `scene.getObjectByName('scree')` tris ≤ 5,000; the stone count (tris / 8) equals the old count 613 (12,260 / 20); max y ≤ 0.12; every normal has length within 1e-3 of 1 and `normal.y > -0.2` for vertices with y > 0.02 (rounded tops, not facets).
  - `'no ground-plane triangle lies wholly under rock'` and `'every walkable or cave-floor point still has ground plane under it'` — sample the plane's world triangles; dropped count > 1,500; for a 0.5 m grid over the map where `ground.y(x,z) === 0` (floor, Narrows, cave floors at 0), a downward ray from y 1 hits the trimmed plane.
- [ ] **Step 2: Run** `npx vitest run test/gorgerock2.test.js` — expect FAIL.
- [ ] **Step 3: Implement.** `pebble: true` makes each stone `new THREE.OctahedronGeometry(r, 0)` (same one geometry per stone, so Math.random draws are unchanged), scaled/rotated/seated as now, and sets its normals to the ellipsoid normal of its own centre and scale (normalize((p − c) / scale²)). `trimHiddenGround`: world-transform the plane's indexed triangles; drop a triangle when every point of a 0.25 m sample lattice over it (vertices, edge points, interior) lies strictly inside some mass of `MASSES` with top ≥ 0.5 and under no ceiling; rebuild the index in place (`geometry.setIndex(new THREE.BufferAttribute(Uint16/32Array, 1))` — no new geometry). Call both in `build`.
- [ ] **Step 4: Run** the new file, `test/waterlooks.test.js`, `test/gorgerock-guard.test.js`, `test/gorge.test.js`, `test/budget.test.js` — PASS. Measure; record numbers in the commit message.
- [ ] **Step 5: Commit** `feat(gorge-rock2): pebble scree and no ground plane under the rock`.

### Task 2: A finer wall grid

**Files:**
- Modify: `src/world/builder.js` (`ROCK_CELL`, `ROCK_ROW`, `ROW_MIN` in the rockTerrain section)
- Modify: `test/builder.test.js` (the rock's own 16,000 cap in `'the rock stays within its triangle budget'` and any gorge-test rock cap), with a one-line reason in the comment.

- [ ] **Step 1:** Set `ROCK_CELL = 1.2`, `ROCK_ROW = 1.05`, `ROW_MIN = 0.3`. Run `test/builder.test.js test/rockrelief.test.js test/narrows.test.js test/gorge.test.js` (timeouts 120_000 where long). Conforming must converge, no flips, no new open edges.
- [ ] **Step 2:** Measure. Total must stay ≤ 59,600 *after Task 1*; if over, step back to `ROCK_CELL = 1.3`, `ROCK_ROW = 1.15` and re-measure. Raise the rock-only cap to the measured value rounded up to the next 500, saying why ("finer wall grid for polish-gorgerock2; area cap unchanged").
- [ ] **Step 3: Commit** `feat(gorge-rock2): a finer wall grid so the relief can carve` with before/after shellTris in the message.

### Task 3: Smooth shading and rounded loose rocks

**Files:**
- Create: `src/world/rocknormals.js` (pure, no THREE)
- Modify: `src/world/builder.js` (`rockArrays` normals; `rockDressing` normals)
- Modify: `src/world/narrows.js` (`narrowsRockTris` face normals)
- Modify: `src/world/gorge.js` (tors, summit boulder)
- Test: `test/gorgerock2.test.js`

**Interfaces:**
- Produces: `smoothNormals(pos: Float32Array|number[], keyPos: number[][] | null, creaseDeg: number) -> Float32Array` — non-indexed triangles; vertices are welded by `keyPos[i]` (the pre-relief quantised position) when given, else by exact position; each face corner gets the angle-weighted sum of the normals of the welded faces whose normal is within `creaseDeg` of its own face's normal. Degenerate faces contribute nothing; a corner with no usable face keeps its face normal (or (0,1,0)).
- Produces: `ROCK_CREASE = 60` (degrees) exported from builder.js.
- Produces: `roundTor(mesh, { r, h, seed })` in gorge.js: replaces `mesh.geometry`'s attributes in place.

- [ ] **Step 1: Failing tests:**
  - `'smoothNormals: a cube keeps its edges, a gentle fold is smooth'` (unit: cube at 60° → all normals axis-aligned; two faces at 20° → shared-edge normals equal).
  - `'walk tops stay flat-shaded'` — every ledgeTops vertex with `|y − shapeY(walk)| < 1e-4` inside a walk rect has normal (0,1,0) within 1e-6.
  - `'the rock walls are smooth-shaded'` — in rockFaces, ≥ 60% of wall vertices (|n.y| < 0.5) have a normal that differs from their own face normal by > 2° (flat shading gives 0%).
  - `'foot boulders and lip stones have rounded normals'` — for dressing triangles (after `shellTris`), the mean angle between vertex normal and face normal > 10°.
  - `'tors are round, the size of their colliders, as high as their perch'` — for each `gorgeTors()` entry: mesh ≥ 200 tris; max y − ground ≤ h + 0.05 and ≥ h − 0.1; max horizontal reach from (x, z) within [0.85 r, r + 0.05]; normals unit.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.**
  - `rockArrays.arraysOf`: replace `computeVertexNormals` with `smoothNormals(pos, verts, ROCK_CREASE)` for the shell part; dressing triangles get their own normals (next bullet). Bump nothing in the cache key (normals are part of the cached arrays already).
  - Foot boulders: vertex normal = normalize(ellipsoid normal from the boulder's centre with its 1, 0.7, 1 squash) blended 70/30 with the face normal. Lip stones: normalize(face normal + 0.6 × normalize(corner − stone centre)). Write normals alongside `pos`/`col` in `rockDressing`'s output (add a `nor` array) and append them after the shell's.
  - `narrowsRockTris`: face normal from the triangle's positions, computed exactly as three's `computeVertexNormals` does (cb = C − B, ab = A − B, cb × ab, normalized), so placements are unchanged.
  - Tors: after `b.tor(...)`, `withLocalUuids('gorge-uuids-tors', ...)` builds for each of the three blocks an `IcosahedronGeometry(1, 1)` (80 tris) displaced per vertex by ±10% with `noise3` on its unit position and the tor seed, then scaled exactly as `b.tor` scales its blocks (reach → `r * rs`, height → `h * tall`, same bottoms and drifts, same `hash01` rotations), merged; smooth normals via `smoothNormals(…, null, 180)`; set position and normal on the tor's existing geometry, dispose the temporaries. Recolour gorge tors to `0xa39582` (weathered sandstone; ruling: grey granite read foreign in a sandstone gorge). Summit boulder: smooth its normals in place (crease 180).
- [ ] **Step 4: Run** the new tests and `test/builder.test.js test/narrows.test.js test/gorge.test.js test/waterlooks.test.js test/gorgerock-guard.test.js test/budget.test.js` — PASS. Measure.
- [ ] **Step 5: Commit** `feat(gorge-rock2): smooth-shaded rock, rounded boulders, stones and tors`.

### Task 4: Carved relief — gullies, undercuts, rounded rims

**Files:**
- Modify: `src/world/rockrelief.js`
- Modify: `test/rockrelief.test.js`

**Interfaces:**
- Produces: `at(x, y, z)` now returns `{ dx, dy, dz, recess, foot }`, `foot` = height above the walkable top under the point (`y − walkTop`, ≥ 0; `Infinity`-free).
- Produces exported constants `GULLY = 0.4` (share of the recess from gullies), `UNDERCUT = 0.3`, `RIM_ROUND = 0.9`.

- [ ] **Step 1: Failing tests** (keep every existing bound test as is):
  - `'walls are fluted: recess varies more along a wall than up it'` — over the 2,000 wall points the test already finds, the mean |Δrecess| between points 1.2 m apart horizontally (same y) exceeds 0.6 × that between points 1.05 m apart vertically (same x, z).
  - `'walls are undercut near the foot'` — mean recess for wall points with foot in [0.9, 2.2] exceeds that for foot in [3, 6] by ≥ 0.08.
  - `'rims are rounded'` replaces `'the 20 m rims have jagged crests (max dy > 0.5)'`: on the 20 m rims' crest-edge vertices (within 0.15 m of a drop ≥ 5 m) mean dy ≤ −0.3, every dy ∈ [−CREST_JAG, CREST_JAG], and dy's standard deviation along the rim ≥ 0.1 (it still undulates). Say in the test comment why the old test changed.
  - `'at() reports foot'` — on a wall 2 m above the floor, foot ≈ 2 (±1e-6); on a walk top, 0.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** in `recessAt`/`crestAt`:
  - Recess mix: `0.35 · noise3(x/2.4, y/3, z/2.4) + 0.25 · strata + GULLY · noise3(x/3.2, y/12, z/3.2, seed + 4)` (gullies: tall, narrow), same `−ROCK_PROUD … RELIEF_DEPTH` range, then `+ UNDERCUT · bump(foot)` with bump = smoothstep(0.3, 1.0, foot) · (1 − smoothstep(1.8, 3.2, foot)), all before the existing clamps (which still apply last, so thickness, cave and proud bounds hold).
  - Crest: `dy = −min(RIM_ROUND, 0.12 · drop) · (1 − crest / CREST_BAND)² + min(0.5, 0.06 · drop) · (1 − crest / CREST_BAND) · (2 · noise3(x/4, 7.7, z/4, seed + 2) − 1)`, clamped to ±CREST_JAG. Keep discs and frame fade as now.
- [ ] **Step 4: Run** `test/rockrelief.test.js test/builder.test.js test/narrows.test.js test/gorge.test.js` (120_000 timeouts) — PASS.
- [ ] **Step 5: Commit** `feat(gorge-rock2): fluted, undercut walls and rounded rims`.

### Task 5: The rock shader and talus colour

**Files:**
- Create: `src/world/rockshade.js`
- Modify: `src/world/builder.js` (`rockTerrain` materials; `rockArrays` colour with foot)
- Modify: `src/world/narrows.js` only if its `tint` signature needs the extra `foot` argument passed through (it receives it last and may ignore it)
- Test: `test/rockshade.test.js` (create), `test/gorgerock2.test.js`

**Interfaces:**
- Consumes: `at()`'s `foot` (Task 4).
- Produces: `patchRockMaterial(material, { flutes = true } = {}) -> material` (sets `onBeforeCompile` chaining any previous one, and `customProgramCacheKey = () => 'gorge-rock-v1' + (flutes ? '' : '-nf')`); `ROCK_SHADE` frozen object of its numbers; `TALUS_TINT = 0x9d9384`.

- [ ] **Step 1: Failing tests** (`test/rockshade.test.js`):
  - `'every injection lands in three 0.185 standard shaders'` — build `shader = { vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {} }`, call the patched `onBeforeCompile(shader)`, assert both sources changed at each anchor (`#include <worldpos_vertex>` or `<project_vertex>`, `#include <color_fragment>`, `#include <normal_fragment_maps>`) and contain `vRockW`, `vRockN`.
  - `'the patch is shared and cheap'` — same cache key for two materials; the injected fragment has at most 3 calls of the noise function and no `for`.
  - In `test/gorgerock2.test.js`: `'rockFaces, lips and ledgeTops wear the rock patch'` (cache key starts with `gorge-rock-v1`; ledgeTops uses `{ flutes: true }` too); `'wall feet take the talus tint'` — rockFaces vertices with foot < 0.3 are on average closer (RGB distance) to `TALUS_TINT` than vertices with foot in [2, 4].
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.** Vertex: `vRockW = (modelMatrix * vec4(transformed, 1.0)).xyz; vRockN = normalize(mat3(modelMatrix) * objectNormal);`. Fragment (all in world space, then back to view space with `viewMatrix`):
  - `wall = 1.0 − smoothstep(0.35, 0.75, abs(n.y))`;
  - bedding lines: `f = fract((w.y + 0.4 · vnoise(w · vec3(0.12, 0.0, 0.12))) / 0.55)`; darken by `0.10 · wall · (1 − smoothstep(0.0, 0.12, f))`, lighten the band's top lip by 0.04;
  - flutes: horizontal tangent `t = normalize(vec3(−n.z, 0, n.x))`, `u = dot(w, t)`, `phase = u · 6.2832 / 0.85 + 3.0 · vnoise(w · vec3(0.25, 0.05, 0.25))`; `n += t · (0.28 · wall · cos(phase))`, renormalize (only when `flutes`);
  - grain: colour × `0.93 + 0.14 · vnoise(w · 2.6)`;
  - overhang: colour × `1 − 0.22 · clamp(−n.y, 0, 1)`.
  - `vnoise` is 3D value noise on an arithmetic hash (no `sin`), `highp`. Patch `rockMat()` (rockFaces and lips) and ledgeTops' material in `rockTerrain`.
  - Talus: `plainColour(x, y, z, recess, foot)` lerps toward `TALUS_TINT` by `(1 − smoothstep(0.15, 1.3, foot)) · (0.5 + 0.5 · noise3(x/1.5, 0, z/1.5, seed + 9))`; pass `m.foot` from `moveOf`.
- [ ] **Step 4: Run** the two test files plus `test/builder.test.js test/narrows.test.js test/gorge.test.js test/budget.test.js` — PASS (the "no saturated colour hides a coat" and "darker and cooler at the bottom" tests must still pass; tune TALUS_TINT within the brief if they don't).
- [ ] **Step 5: Commit** `feat(gorge-rock2): bedding lines, flutes and grain on the rock; talus at the wall feet`.

### Task 6: Talus aprons on the floor

**Files:**
- Modify: `src/world/gorge.js` (meadow: a `talus` patch kind)
- Test: `test/gorgerock2.test.js`, `test/gorgemeadow-contrast.test.js` must stay green

**Interfaces:**
- Produces: `gorgeMeadow()` result gains `talus: [{ x, z, w, d, nx, nz }]` strips; `MEADOW_TALUS = 0xa59b89` exported.

- [ ] **Step 1: Failing test** `'a talus apron runs along the floor walls'` — every `FLOOR_WALLS` line has talus cells along ≥ 60% of its length; none within `MEADOW_PATH_CLEAR` of a path, 1.5 m of a mouth, or on the stream; gorgeMeadow tris grow by ≤ 700.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement**: along each floor wall, every 1 m, a quad from the wall line out to `0.8 + 0.6 · noise` m, two triangles, coloured `MEADOW_TALUS` fading (vertex colour) to the sand at its outer edge, at `MEADOW_LIFT`, in the existing meadow mesh (no new mesh); keep the meadow's own skip rules. Draws its numbers from its own `mulberry32(seedFromCode('gorge-talus'))`.
- [ ] **Step 4: Run** — PASS; measure.
- [ ] **Step 5: Commit** `feat(gorge-rock2): talus aprons at the wall feet`.

### Task 7: Gameplay tolerance, budget record, live check

**Files:**
- Modify: `test/gorgerock2.test.js`, `test/budget.test.js` (the gorge comment row only)

- [ ] **Step 1: Test** `'the drawn rock agrees with the ground the cat walks on'` (timeout 180_000): for a 0.5 m grid over every `WALK_SHAPES` walk/cave/den rect inset 0.45 m from its edges (ramps included), a ray down from `shapeY + 3` (from just under any ceiling inside caves) onto rockFaces + ledgeTops + lips + tors + summit rock hits first at `shapeY ± 0.02`, unless the point is inside a collider disc. And for floor points (`ground.y === 0`) within 1.2 m of a wall, no rock triangle lies between y 0.05 and 0.6 within 0.3 m of the point horizontally (nothing to sink a paw into).
- [ ] **Step 2: Run the full suite and `npm run build`.** Check flat-trace hash and waterlooks/guard untouched.
- [ ] **Step 3:** Update the gorge row in `test/budget.test.js`'s comment with the new 60 / 36 / total and what moved (scree, ground, shell, tors, talus).
- [ ] **Step 4: Commit** `test(gorge-rock2): drawn rock matches the walkable ground; budget row`.
- [ ] **Step 5 (orchestrator):** AFTER shots with `scripts/shots.mjs after day|dusk|phone|perf`, pairs in `pairs/`, console errors checked.
