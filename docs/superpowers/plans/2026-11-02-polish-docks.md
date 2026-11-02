# Polish: the Docks dressing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Old Docks read as a busy, friendly harbour: warmer varied stone, clusters of crates/barrels/nets/rope coils, puddle glints, gulls on bollards, coloured boats on the canal, and a skyline with depth (warehouse roofs, cranes in silhouette) — with zero gameplay or determinism change.

**Architecture:** All new dressing lives in a new module `src/world/docksdressing.js`. `docks.js` builds its area record as before, then calls `dressDocks(scene, area)` as the LAST thing in `build()`. Every THREE object the dressing makes is created inside `withLocalUuids('docks-dressing', fn)` (a local copy of the camp.js helper: Math.random is swapped for a seeded mulberry32 stream while the dressing is built), so the area build's Math.random draw count (6916) and the flat trace (sha256 6b502ab6…) do not move. Dressing is merged into a handful of vertex-coloured meshes (one per material), all tagged `userData.dressing = true` and `userData.noCast = true`, and appended to `scene.children` after everything the area already adds.

**Tech Stack:** Three.js 0.185 (`mergeGeometries` from `three/examples/jsm/utils/BufferGeometryUtils.js`), Vitest 4, Vite 8.

**Spec:** the controller prompt (Docks = polish survey item #12) + `/private/tmp/claude-501/-Users-pniessen-CLAUDE-CODE-projects-cat-game/6f2ddd3a-4768-4d57-890f-2d7e74238375/scratchpad/polish-common.md` (shared rules, read it all including the final "Update" section).

## Global Constraints

- Work only in `/Users/pniessen/CLAUDE-CODE/projects/cat-game/.worktrees/polish-docks`. Own `src/world/docks.js` and the new `src/world/docksdressing.js` + `test/docksdressing.test.js`. Touch other files only where a task says so (test pins), and keep those edits minimal.
- No `Math.random` reached by the dressing outside `withLocalUuids`; all placement variation from `hash01` / `mulberry32` / `seedFromCode` (`mulberry32`, `seedFromCode` from `src/rng.js`; `hash01`: write a local copy of builder.js's private `hash01(x, z, salt)` in docksdressing.js — pure integer hash, no Math.random).
- `test/waterlooks.test.js` BUILD_DRAWS.docks stays **6916**. `test/flattrace.test.js` stays green with the fixture unchanged (sha256 `6b502ab6b1f9ce328fd6c6b7ce656fd473e50670708fac53985590bc9f0e54a7`).
- Do not use builder.js helpers or `litMaterial`/`surfMat` surfaces inside the dressing: they share cached textures/geometries across areas, and a cache entry first created under the local stream would change OTHER areas' draw counts. Build dressing from raw THREE primitives + own `MeshStandardMaterial`s (no maps).
- Dressing adds **no colliders, perches, collectibles, POIs or any record** to the returned area object. No field of the returned area changes except `groundBounce` (Task 3).
- Every dressing mesh: `userData.dressing = true`, `userData.noCast = true`, `castShadow = false`, `receiveShadow = true` (glint mesh: receiveShadow false). Merged geometry type is `BufferGeometry` (so grass.js's flatFootprints and contactshadows' per-child decal scan ignore it; every merged mesh must span > 6.5 m or be flatter than 0.1 m so the decal count 67 holds).
- Budget: at most **6** dressing meshes in total after all tasks; dressing triangles ≤ **20,000** total. `test/budget.test.js` ceilings (docks 600 meshes / 90,000 tris; merged 370 / 280) must still pass unchanged.
- Gameplay: new props must not cover collectibles, POIs, scenics, critter spawns (both ends of a patrol), moments (both ends), tippables, perches, boxes, puddle records, the spawn, golden mice, `propsFor('docks')` items (incl. `fallTo`), the rival disc, the quays/roads/sidewalks/bridge decks. Copy for kids: none needed (no new words on screen).
- Tests: `npx vitest run --exclude '.claude/**' --exclude '.worktrees/**'` (long geometry tests get explicit timeouts of 120_000). `npm run build` must pass.
- Commits: explicit `git add <paths>`; message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. A dressing object created outside `withLocalUuids` (e.g. a module-level shared material or a geometry made at import time) — moves 6916 / the trace. Test: Task 1's draw-count case builds docks twice in a row and in waterlooks order.
2. A cluster inside the walkable bounds that a cat or stray walks through visibly (no collider) — Task 1's keep-out test requires each in-bounds item to be either inside an existing collider circle or ≥ 1.0 m clear of every gameplay point and off every path rect.
3. Rain: the wet-ground swap (walk.js filters `scene.children` by `userData.ground` / name `'path'`) must not pick up dressing; glints must still read on a grey rainy screen and at dusk not glow. Test in Task 3 (no dressing mesh has `userData.ground` or name `'path'`); look checked live.
4. Low quality tier / phone: dressing builds identically at every tier (no tier branch), and triangle total stays under budget. Test in Task 1 (triangle sum ≤ 20,000 across all dressing meshes, checked again after Task 4).
5. Reduced motion: everything is static (gulls do not bob — ruling R1), so nothing to freeze; Task 2 test asserts the dressing returns no update handles and adds nothing to `waterFx`.

---

### Task 1: Dressing module, guard rails, and the quay clusters

**Files:**
- Create: `src/world/docksdressing.js`
- Modify: `src/world/docks.js` (end of `build()` only: build the area object into a `const area`, call `dressDocks(scene, area)`, `return area`)
- Create: `test/docksdressing.test.js`
- Modify: `test/silhouette.test.js` (the "does not move a single mesh" case: skip meshes under a top-level child with `userData.dressing`, the same way it already subtracts the horizon band; add a one-line comment naming polish-docks)

**Interfaces:**
- Produces (exported from `src/world/docksdressing.js`):
  - `withLocalUuids(name: string, fn: () => T): T` — Math.random := `mulberry32(seedFromCode(name))` during fn, restored in `finally`.
  - `DRESSING_SEED = 'docks-dressing'`
  - `CLUSTERS: ReadonlyArray<{ x, z, rot, kind: 'crates'|'barrels'|'net'|'rope'|'pots', s?: number }>` — hand-placed, frozen.
  - `itemsOf(): Array<{ x, z, r, what: string }>` — every placed dressing item's ground footprint (centre + radius) across ALL dressing kinds (later tasks append their own items to this function), used by the keep-out test.
  - `dressDocks(scene: THREE.Scene, area: AreaRecord): THREE.Mesh[]` — builds every dressing mesh inside `withLocalUuids(DRESSING_SEED, …)`, adds each to `scene` (direct children, appended last), returns them.
  - internal helpers later tasks reuse: `paint(geo, hex, jitter?)` (sets a per-vertex `color` attribute, converts to non-indexed first), `mergeParts(parts: BufferGeometry[]): BufferGeometry`, `dressingMaterial({ roughness, metalness?, emissive? })` (MeshStandardMaterial, `vertexColors: true`). Export them too.

- [ ] **Step 1: Write the failing tests** in `test/docksdressing.test.js` (use the same `document` stub block as `test/docks.test.js`):
  - `it('keeps the Docks build at 6916 Math.random draws')` — replicate waterlooks' `drawsOf` warm-up (contact shadows + `buildCat('tabby')`, then builds neighborhood, park, seaside before docks in that order) and expect docks === 6916. Timeout 120_000.
  - `it('adds dressing meshes last, all tagged dressing + noCast, none castShadow')` — build into a scene; the trailing N children are exactly `dressDocks`' meshes; each `userData.dressing && userData.noCast && !castShadow`; N ≤ 6 (Task 1 alone: ≤ 2).
  - `it('adds no record to the area')` — `Object.keys(area)` and every array length equal those of a build with `dressDocks` stubbed out (`vi.spyOn` isn't possible on ESM; instead compare against a pinned list of keys and these lengths: colliders, perches, pois 8, collectibles 5, scenics 3, critterSpawns 17, tippables 12, puddles 4, boxes 3).
  - `it('keeps every in-bounds item off gameplay points and paths, or inside an existing collider')` — gather points from area (collectibles, pois, scenics, critterSpawns incl. x2/z2, moments incl. from, tippables, perches, boxes, puddles, spawn), `GOLD_MICE.docks` (src/goldmice.js), every array in `propsFor('docks')` (x/z and fallTo), and the rival disc `DISCS.docks` from src/rivalclans.js (`{ cx: -30.5, cz: -9.5, r: 5 }`). Path rects: quays x∈[-36,36], |z|∈[4.5,8.5]; roads |x|≤1.5, |z|∈[6.5,36]; sidewalks |z|∈[8.4,9.6], x∈[-36,36] (`b.sidewalk` default width 1.2); bridge decks from `area.waters[0].decks`. For each `itemsOf()` item with |x|≤38 and |z|≤40 and `what !== 'boat'`/`'gull'`/`'glint'`: either `∃ collider c: dist(item,c) + item.r ≤ c.r`, or (`dist(item,p) ≥ item.r + 1.0` for every point, `≥ item.r + disc.r` for the rival disc, and the item circle does not intersect any path rect). Items in the canal footprint (|z| < 3.5) must have `what === 'boat'`.
  - `it('stays within the triangle budget')` — sum of `index ? index.count/3 : position.count/3` over dressing meshes ≤ 20,000.
- [ ] **Step 2: Run** `npx vitest run test/docksdressing.test.js` — expect FAIL (module missing).
- [ ] **Step 3: Implement** `docksdressing.js` with the interfaces above and the quay clusters:
  - Kinds (low poly, vertex-coloured, warm friendly colours): `crates` = 2–4 boxes (0.6–0.9 m) stacked/jittered by `hash01`, timber 0xb08a5a…0x9a7448 with a darker lid band; `barrels` = 2–3 cylinders (10 segs) in painted reds/blues/greens (0xb0503e, 0x3e6a8a, 0x4e7a52) with dark bands; `net` = a squashed low-seg sphere mound (net green-brown 0x5e6a4a) with 2–3 orange float spheres (0xe0803a); `rope` = flattened torus coil 0xc8b088; `pots` = small cage boxes (lobster pots) 0x8a6a4a with a slatted top. Each cluster kind ≈ 150–600 tris.
  - Placement: 20–30 clusters. Most OUTSIDE bounds (the south edge z −41…−48 seen from spawn, east/west edges |x| 39…48 along both quays, north edge z 41…46), the rest in-bounds tucked inside existing colliders (warehouse walls, container sides, fish shed) or in open cobble pockets that pass the keep-out test. Rotation and size jitter from `hash01(x, z, salt)`.
  - Under each cluster bake a soft dark "contact" blob: include in a SECOND mesh a 16-segment disc (r = cluster radius + 0.3) at y 0.012 with vertex colour black and per-vertex alpha 0.4 centre → 0 rim, material `MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 })` with a 4-component colour attribute. That mesh is flat (< 0.1 m tall), so it gets no decal.
  - `docks.js`: `import { dressDocks } from './docksdressing.js'`; at the end of build: `const area = { …unchanged literal… }; dressDocks(scene, area); return area;`
- [ ] **Step 4: Run** `npx vitest run test/docksdressing.test.js test/docks.test.js test/waterlooks.test.js test/flattrace.test.js test/silhouette.test.js test/mergeprops.test.js test/budget.test.js test/minimap.test.js` — expect PASS. If waterlooks or flattrace fail, the dressing leaked a draw: find the object made outside the wrapper (or a builder/material cache hit) and fix — never re-pin.
- [ ] **Step 5: Commit** `feat(docks): quay clusters of crates, barrels, nets and rope on local uuids`.

### Task 2: Gulls on bollards and coloured boats on the canal

**Files:** Modify `src/world/docksdressing.js`, `test/docksdressing.test.js`.

**Interfaces:**
- Consumes: `paint`, `mergeParts`, `dressingMaterial`, `itemsOf`, `dressDocks` from Task 1.
- Produces: `GULL_SPOTS: ReadonlyArray<{ x, z, y, rot }>`, `BOATS: ReadonlyArray<{ x, z, rot, hull: number, len: number }>`; both added to `itemsOf()` (`what: 'gull'`, `'boat'`); their geometry merged into the Task 1 props mesh (no new mesh).

- [ ] **Step 1: Failing tests:**
  - `it('perches gulls only on bollards that are not perches or props')` — every GULL_SPOTS entry with y ≈ 0.55+ matches one of the 12 bollard positions in docks.js, and none of: perch bollards (−18,4.2), (6,4.2), (−6,−4.2), (18,−4.2); propsets bollards (−30,−4.2), (30,4.2), (−6,4.2). Extra gulls allowed on barge cabin roofs (x ±14, y ≈ 1.75) and boat bows.
  - `it('floats every boat in the canal, clear of the bridges, barges and duck circles')` — each boat's hull rectangle (len × 1.3 beam, rotated) lies within |z| ≤ 3.3 and x ∈ [−45, 45], does not intersect either deck, either barge (x 9.5..18.5 / −18.5..−9.5, |z| ≤ 1.7), or a duck circle (centre (5,0) and (−8,0), r 2 + 0.5).
  - `it('adds nothing that moves')` — `area.waterFx.length === 1`, and no dressing mesh has an `onBeforeRender` or `userData.update`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.** Gull ≈ 120 tris: white elongated body, pale grey folded wings (0xb8c0c8), white head, yellow beak (0xf0c040), dark wingtips; standing, facing varied `rot`. 5 bollard gulls + 2 barge-roof gulls + optional boat-bow gull. Boats: 6–8 rowing/fishing boats, 3–4.5 m, pointed bow (hull from a lofted 8–10 vertex profile or a box with tapered bow), hulls in friendly colours (0xc8483a red, 0xe8c040 yellow, 0x3a8a8a teal, 0xf0ece0 white with 0x3a6ab0 stripe, 0x4a7ac0 blue), inner deck timber, a thwart; sitting at y 0.0–0.15 so the hull meets the water at y 0.04. Spots in the free canal stretches x ∈ [20,36], [−36,−26], [−22,−19.5], beyond the bounds x ∈ [38,44] / [−44,−38], hugging the banks (|z| 2.3–2.8). Static (ruling R1).
- [ ] **Step 4: Run** the Task 1 command — PASS (6916 and the trace unchanged).
- [ ] **Step 5: Commit** `feat(docks): gulls on the bollards and coloured boats on the canal`.

### Task 3: Warmer varied stone and puddle glints

**Files:** Modify `src/world/docks.js` (ground hex, `groundBounce`), `src/world/docksdressing.js`, `test/docks.test.js` (the two `0x4e4e58` pins → new hex, with a one-line "polish-docks: warmer stone" note), `test/docksdressing.test.js`.

**Interfaces:**
- Produces: `DOCKS_STONE` (exported hex from docks.js), `warmStone(groundMesh)` in docksdressing.js (multiplies the ground's existing vertex `color` attribute by a low-frequency warm/cool field; creates no object), `GLINT_PUDDLES: ReadonlyArray<{ x, z, r }>` (decorative wet patches; items `what: 'glint'`).

- [ ] **Step 1: Failing tests:**
  - `it('lays warmer stone')` — `area.groundBounce === DOCKS_STONE`, and DOCKS_STONE's HSL hue is in the warm range (r > b) and its lightness within ±0.05 of 0x4e4e58's (keep docks.test's "darkest ground bounce" case passing).
  - `it('varies the stone by 6–12% across the quay')` — the ground mesh's colour attribute min/max ratio over all vertices ≥ 1.12 and ≤ 1.35, and is a pure function of position (two builds byte-equal).
  - `it('lays glints over every authored puddle and the decorative ones, flat and off the wet-ground list')` — the glint mesh's bounding box height < 0.05; it is not `userData.ground` and its name is not `'path'` (so weather.js's rain swap never darkens it); every `area.puddles` entry has glint vertices within its radius.
  - Update the docks.test.js `groundBounce` pin and the builder.test.js check only if it reads the docks file (it builds its own `b.ground(120, 0x4e4e58…)` literal — leave that one).
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.** Stone: new hex warmer and a touch lighter than 0x4e4e58, e.g. 0x58524c (pick so the "darkest ground bounce" test still holds); use it in `b.ground(120, DOCKS_STONE, …)` and `groundBounce`. `warmStone(ground)` called from `dressDocks` (find the ground: `scene.children.find(c => c.userData.ground)`), blending toward a warm sandstone tint (×1.08,1.02,0.94) and a cool slate tint (×0.94,0.96,1.02) with a 9–16 m wavelength field from `hash01` value noise. Glints: one mesh, `MeshStandardMaterial({ color: 0xe8f0f8, roughness: 0.05, metalness: 0, emissive: 0x28323c, vertexColors: true })` — per puddle 2–4 thin elongated flat slivers (sky-reflection streaks) at y 0.026 inside the puddle (radius ≤ 0.75 r). Plus 6–8 decorative wet patches (`GLINT_PUDDLES`: darker blue-grey 0x3e4a58 irregular 10-gon discs at y 0.018 in that same mesh, each with its own streaks) in open cobble that passes the keep-out test (they may sit off-path only). Check the dusk path in walk.js doesn't make emissive glow (emissive kept dim; verify live).
- [ ] **Step 4: Run** the Task 1 command plus `test/builder.test.js test/materials.test.js test/sky.test.js` — PASS.
- [ ] **Step 5: Commit** `feat(docks): warmer, patchier stone and glinting puddles`.

### Task 4: A skyline with depth — warehouse roofs, cranes in silhouette, canal ends closed

**Files:** Modify `src/world/docksdressing.js`, `test/docksdressing.test.js`. (Optionally the `horizonBand` call's `color` in docks.js — a param only, no new object; builder.js is NOT touched.)

**Interfaces:**
- Produces: `SKYLINE: ReadonlyArray<{ kind: 'shed'|'sawtooth'|'gable'|'crane'|'gantry', x, z, rot, w, d, h, color }>`; one new merged mesh `skyline` (opaque, `fog` on, roughness 1, vertex colours).

- [ ] **Step 1: Failing tests:**
  - `it('stands every skyline piece outside the walkable bounds and the ground band')` — each piece's footprint is outside bounds by ≥ 4 m (|x| ≥ 42 or |z| ≥ 44), within 110 m of the origin (inside the fog), and none sits on the canal footprint x ∈ [−45,45], |z| < 3.5.
  - `it('closes both canal ends')` — a `shed`/`gable` piece covers x = ±46 at z = 0 (footprint contains (±47, 0)) so the water's square end at x ±45 is hidden.
  - `it('has cranes in silhouette')` — ≥ 4 `crane`/`gantry` pieces with h ≥ 14.
  - Triangle budget test (Task 1) still ≤ 20,000 overall; dressing mesh count ≤ 6.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.** Mid layer at 44–56 m: 12–18 warehouses (5–9 m tall) with pitched, sawtooth and hipped roofs, warm desaturated brick/paint bodies (0x8a6a5a, 0x7a7a86, 0x9a8468, 0x6a7a74) and darker roofs, a few window rows as darker quads; two of them straddle the canal ends at x ±46…±54. Far layer at 60–95 m: 4–6 cranes — luffing/jib cranes (lattice mast as a thin box, jib angled up, counterweight) and 2 container gantries (two A-frames + boom), 14–26 m tall, in harbour red 0xb0503e / cream 0xd8d0c0 desaturated; the fog turns them to silhouette. All in ONE mesh. Optionally lift the horizon band's colour a few percent warmer (0x646976 → a warmer equivalent) — param change only; if done, update test/builder.test.js line ~420 only if it reads docks.js (it does not: it has its own literal — leave it).
- [ ] **Step 4: Run** the Task 1 command — PASS; then the full suite and `npm run build`.
- [ ] **Step 5: Commit** `feat(docks): skyline depth — warehouse roofs, cranes, canal ends closed`.

### Task 5 (controller): Live check, numbers, report

- Shoot AFTER from the same spots (`docks-live/shoot.mjs`, `WHICH=after`), make 4–8 side-by-side pairs in `snaps-polish-docks/pairs/` incl. the phone one and both rain shots; compare draws/shadow/triangles from perf.json before vs after; check dusk once for glints not glowing.
- Full suite + build; flat-trace hash check (`shasum -a 256 test/fixtures/flat-trace.json`).
