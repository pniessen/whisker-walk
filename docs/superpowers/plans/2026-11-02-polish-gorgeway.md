# polish-gorgeway Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Gorge's first view stops being a grey corridor ending in a flat lilac rectangle, and the three cave corridors stop being brown boxes with flat moss discs.

**Architecture:** The Narrows' walls get a warm, banded colour and a sunlit rim through a new colour hook on `builder.rockTerrain` (positions untouched), plus one merged, shadowless dressing mesh (tufts on the walls' real shelves and crests, found by ray-casting the built rock, and a low "view out" to the Moor past the Narrows' west end, where the horizon band now dips). Each deep cave's corridor and bend get a rounded, bumpy tunnel liner swept along the cave's path, with a few stalactites, hanging roots and moss, merged into the existing `caveRoom:<id>` mesh. Moss everywhere becomes lumpy mounds that follow the surface normal.

**Tech Stack:** Three.js 0.185, Vite 8, Vitest 4. Plain ES modules.

**Spec:** `scratchpad/polish-survey-2.md` rows polish #4 and #5 and "Build B1", plus `scratchpad/polish-common.md` (both in `<scratchpad>/`).

## Global Constraints

- Gameplay doesn't change: `GORGE_GROUND_SPEC`, colliders, the area record, spawn, routes. `test/gorgerock-guard.test.js` specSha/groundSha/area must stay equal.
- No `Math.random` in a build; no new draws on walkRng/strayStream. Use `hash01`, `noise3`, `mulberry32`, `seedFromCode`. Any new mesh/geometry/material made inside `gorge.build()` is made under `withLocalUuids` (src/world/localuuids.js), so `test/waterlooks.test.js` Gorge BUILD_DRAWS stays **4488**.
- Flat trace pinned at sha256 `6b502ab6b1f9ce328fd6c6b7ce656fd473e50670708fac53985590bc9f0e54a7` (Gorge is not a flat area; it must not move).
- Draw calls: at most **+1 mesh** for the whole branch (the Narrows dressing). Gorge guard becomes **60 meshes, 36 casters**, written reason in the test comment. Caves' insides stay `[2, 2, 3]` meshes (`test/budget.test.js`).
- Triangles: the Gorge's bare build is 54,581 today; the ceiling in `test/budget.test.js` is **60,000**. Budget per task: Task 2 ≤ 1,300 tris; Task 3 ≤ +300 per cave; Task 4 ≤ 1,100 per cave tunnel (with its moss, roots and stalactites). Report the total after each task. If the branch total ends over 60,000, the controller decides (raise to 64,000 with a written reason, or trim).
- Everything new is `castShadow = false`, `userData.noCast = true`.
- Floats on CI: any float-fixture comparison uses `closeDiffs` (test/helpers/closeto.js).
- Long geometry tests get explicit timeouts (120_000).
- Tests: `npx vitest run --exclude '.claude/**' --exclude '.worktrees/**'` and `npm run build`. Commits: explicit `git add <paths>`; message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Files: this branch owns src/world/gorge.js, gorgeshape.js, caveroom.js, src/caves.js, rockrelief.js. `src/world/builder.js` is shared: the only edit allowed there is Task 1's `tint`/`tintKey` option on `rockTerrain` (a few lines). `horizonBand` itself is not edited (another build owns it); only `GORGE_HORIZON`'s options in gorge.js change.
- Copy: no new words for the kids.

## Review Focus

1. The cave camera sits between the cat and the corridor wall at about 1–1.5 m up: the tunnel liner must never stand far enough in at that height to put the camera behind it routinely (low wall bumps ≤ 0.12 m), and nothing hangs below 1.7 m over the corridor. Pinned in Task 4.
2. Looking into a cave mouth from the floor (interior shown within 12 m): the tunnel's end must close against the box (an end frame), not show a gap of bare box around the arch. Pinned in Task 4 (end frame faces) and checked live.
3. The Narrows dressing must never stand on the walkable floor (nothing under 1.2 m over the Narrows' walk strip) or in the camera's way at spawn. Pinned in Task 2.
4. Rain and dusk: the new dressing must not be tagged `userData.ground` (rain swaps ground materials) and must read at dusk; checked live in Task 5.
5. Determinism across builds and the rock cache: a second build in the same page gives identical arrays (rockTerrain's cache key must include the tint). Pinned in Tasks 1, 2 and 4.

---

### Task 1: Warm strata and a sunlit rim on the Narrows walls

**Files:**
- Create: `src/world/narrows.js`
- Modify: `src/world/builder.js` (`rockTerrain`, `rockArrays`: the `tint`/`tintKey` option only)
- Modify: `src/world/gorge.js` (the `b.rockTerrain({...})` call)
- Test: `test/narrows.test.js` (new)

**Interfaces:**
- Produces: `rockTerrain({ ..., tint = null, tintKey = '' })` where `tint(x, y, z, rgb, recess) => [r, g, b]` is applied to every rock colour (rock faces, lips, lip stones, foot boulders) after `rockColour`; `x, y, z` are the pre-relief position, `rgb` the colour as now. Cache key = existing key plus `tintKey`. `ledgeTops` are untouched.
- Produces (narrows.js): `export const NARROWS_ZONE = { minX: -62, maxX: -20, minZ: -18, maxZ: -4 }`, `export const NARROWS_FADE = 3` (metres of blend outside the zone), `export function narrowsWeight(x, z) -> 0..1` (1 inside the zone, smoothstep to 0 at NARROWS_FADE outside), `export function localTop(x, z) -> number` (the highest top of any `MASSES` rect within 1.0 m of (x, z), 0 if none), `export function narrowsTint(x, y, z, rgb, recess) -> [r, g, b]`, `export const NARROWS_TINT_KEY = 'narrows-1'`.

`narrowsTint` design (values pinned): base `lerp(0x8a7560, 0xd9b98c, clamp(y / localTop)^0.8)`; strata by `strataBand(x, y, z, seed)` from rockrelief.js (seed = `seedFromCode('gorge-rock')`), band mod 3 → hue multipliers rust `[1.08, 0.94, 0.84]`, cream `[1.04, 1.02, 0.96]`, ochre `[1.06, 1.0, 0.86]`, and a per-band shade `1 ± 0.14` from `noise3(band, 0, 0, seed + 5)`; recess darkening `1 - 0.3 * clamp(recess / RELIEF_DEPTH)`; sunlit rim `rim = smoothstep(localTop - 1.6, localTop - 0.2, y)`: multiply by `1 + 0.28 * rim`, then lerp toward `0xf2d29a` by `0.25 * rim`; result `lerp(rgb, narrowsColour, narrowsWeight(x, z))`, each channel clamped to [0, 1].

- [ ] **Step 1: Write the failing tests** in `test/narrows.test.js` (canvas stub as in test/gorgerock-guard.test.js):
  - `narrowsTint returns the input unchanged outside the zone and its fade` — at (0, 3, 0) and (-30, 3, -30): equals input exactly.
  - `the Narrows floor rock is warm, not grey` — `narrowsTint(-30, 0.5, -16, ROCK_LOW rgb, 0)`: r − b ≥ 0.08.
  - `neighbouring strata differ` — walking y from 0.2 to 8.6 at (-30, y, -16) in 0.1 steps, find two consecutive bands; their mean luminance differs by ≥ 6%.
  - `the rim is lit` — luminance at y = localTop − 0.3 ≥ 1.15 × luminance at y = localTop − 3 (at x −30, z −16; localTop there is 9).
  - `localTop` — (-30, -16) → 9, (-45, -16) → 20, (-10, 0) → 0.
  - `rockTerrain's tint changes colours only` — build `b.rockTerrain` for the Gorge's records with and without `{ tint: narrowsTint, tintKey: NARROWS_TINT_KEY }`: rockFaces/lips positions identical, colours differ somewhere, and a call with the tint after one without returns the tinted colours (cache keyed). Timeout 120_000.
- [ ] **Step 2: Run** `npx vitest run test/narrows.test.js` — expect FAIL (module missing).
- [ ] **Step 3: Implement** narrows.js and the builder.js option; pass `tint: narrowsTint, tintKey: NARROWS_TINT_KEY` in gorge.js's `rockTerrain` call. Comment the builder option in rockTerrain's header block in two lines.
- [ ] **Step 4: Run** `npx vitest run test/narrows.test.js test/gorgerock-guard.test.js test/gorge.test.js test/waterlooks.test.js test/budget.test.js` — expect PASS (guard still 59/36; no new mesh).
- [ ] **Step 5: Commit** `feat(gorge): warm strata and a sunlit rim on the Narrows walls`.

### Task 2: Tufts on the Narrows' shelves and crests, and a view out to the Moor

**Files:**
- Modify: `src/world/narrows.js` (add the dressing)
- Modify: `src/world/gorge.js` (`GORGE_HORIZON` options; add the mesh in `build()` under `withLocalUuids('gorge-uuids-narrows', ...)`)
- Modify: `test/gorgerock-guard.test.js` (59 → 60 with reason), `test/budget.test.js` (the Gorge comment row)
- Test: `test/narrows.test.js`

**Interfaces:**
- Consumes: the built `rockFaces` mesh (`scene.getObjectByName('rockFaces')` inside the `gorgeRock` group).
- Produces: `export function narrowsDressing(rockFaces) -> THREE.Mesh` named `'narrowsDressing'`, one non-indexed BufferGeometry (position, color, normal), `litMaterial(0xffffff, { vertexColors: true, ...surfaceProps('grass') })`, castShadow false, `userData.noCast = true`, no `userData.ground`. Its arrays are computed once per page (module-level cache) and copied into fresh geometry each call. `userData.counts = { shelfTufts, crestTufts, shrubs, viewTris }`.
- Produces: `export const NARROWS_VIEW = { x1: -58, z1: -11, x2: -130, z2: -11, r: 8 }` — the keepLow capsule added to `GORGE_HORIZON` (`keepLow: Object.freeze([NARROWS_VIEW])`), and `GORGE_HORIZON.sideTints.west` becomes `0xa99aa4` (lighter, toward the haze).

Dressing contents:
- **Shelf tufts:** ray-cast only the rockFaces triangles whose centroid has x < −18.5 and −17.6 < z < −4.4 (`THREE.Ray.intersectTriangle`, no BVH). Candidates every 1.3 m in x from −49 to −20 on both walls (z −16 facing +z, z −6 facing −z), at heights from 1.5 to localTop − 1 every 1.2 m, each jittered by `hash01`. Ray from 0.9 m in front of the wall line at that height, direction normalised (0, −0.6, ±0.8 toward the wall). Keep a hit with face normal y > 0.25 and hit y ≥ 1.2; cap 50. Tuft = three blades as gorge.js's meadow tufts (front and back faces), 0.25–0.45 m tall, greens 0x7f9a52 / 0x6f8040, a third of them dry 0xb0a46e.
- **Crest tufts and shrubs:** on both walls' tops, points every 1.1 m in x, 0.3–1.0 m back from the wall line into the mass; ray straight down from localTop + 3; keep hits with normal y > 0.5 and hit y > localTop − 0.6; cap 40 tufts (0.35–0.6 m tall) and 16 shrubs (a flattened 8-face octahedron, radius 0.25–0.4, 0x5f7a3e..0x6f8a4a).
- **View out:** a ground sheet x −60 → −130, z −44 → 22, 12 × 12 cells, y = 0 at x = −60 rising smoothly to ~5 m at −130 plus ±1.5 m noise (`noise3`), coloured by noise between moor green 0x7f8f55, heather 0x9a6f8c and dry 0xa89a6a; three low mounds (8 sides × 3 rings) at (−92, −20, r 14, h 7), (−104, −2, r 16, h 9), (−118, −14, r 18, h 11); one grey tor (0x8f8a80) on the middle mound's top; three or four low-poly pines (two cone tiers + trunk) at about (−66, −15), (−70, −5), (−78, −13), (−74, −9). Nothing of the view at x > −58.
- Budget: the whole mesh ≤ 1,300 triangles.

- [ ] **Step 1: Write the failing tests** (in test/narrows.test.js, timeout 120_000):
  - `the Narrows dressing is one shadowless mesh, under 1,300 triangles` — build the Gorge, find `narrowsDressing`: isMesh, castShadow false, noCast, `!userData.ground`, tris ≤ 1300, `counts.shelfTufts ≥ 15`, `counts.crestTufts ≥ 15`.
  - `nothing of it stands on the walk` — every vertex with x > −50 has y ≥ 1.2.
  - `the view out lies outside the map` — every view vertex (the last `viewTris * 3` vertices of the arrays) has x ≤ −58.
  - `every tuft sits on the rock` — for each tuft base (export `narrowsTuftBases()` returning `[{x, y, z}]`), a downward/inward ray from 0.05 above it hits rockFaces within 0.1 m.
  - `the horizon dips at the end of the Narrows` — the built `horizonBand` mesh: max y of vertices within 6 m of (−90, −11) ≤ 0.5; max y of vertices within 6 m of (−90, −40) ≥ 5.
  - `two builds give the same dressing` — positions equal.
  - Update the guard: `expect(now.meshes).toBe(60)` with the comment "+ polish-gorgeway's narrowsDressing (noCast)"; re-record nothing else.
- [ ] **Step 2: Run** them — expect FAIL.
- [ ] **Step 3: Implement.** Add the mesh after the rock in `build()`: `scene.add(withLocalUuids('gorge-uuids-narrows', () => narrowsDressing(rock.getObjectByName('rockFaces'))))`.
- [ ] **Step 4: Run** `npx vitest run test/narrows.test.js test/gorgerock-guard.test.js test/gorge.test.js test/waterlooks.test.js test/budget.test.js test/flattrace.test.js` — PASS; Gorge BUILD_DRAWS still 4488. Update the budget.test.js Gorge comment row with the new mesh and triangle totals.
- [ ] **Step 5: Commit** `feat(gorge): tufts on the Narrows' shelves and crests, and a view out to the Moor`.

### Task 3: Lumpy moss that hugs its surface

**Files:**
- Modify: `src/world/caveroom.js` (floor moss and wall moss)
- Test: `test/caveroom.test.js`

**Interfaces:**
- Produces: `export function mossLump(m, { x, y, z, nx, ny, nz, rad, color, salt })` — appends one mound to a `mesher()` (internal mesher is exported as `mesher` too): 9 segments, three rings at 0.35, 0.7 and 1.0 of `rad`, lifted along (nx, ny, nz) by about 0.4, 0.28 and 0.02 of `rad` (min 0.03 m at the centre), each ring vertex's radius jittered ±20% and its lift ±30% by `hashOf`, colours darker at the rim (×0.9) and lighter on top (×1.08). 45 triangles, wound to face along the normal. Returns the centre's top point `{ x, y, z }`. Part name 'moss'.
- Floor blobs call it with normal (0, 1, 0) (clamped inside the chamber as now); wall patches with the liner's outward-into-room normal at their spot (from `linerAt` and the outline normal), lifted 0.02 off the liner.

- [ ] **Step 1: Write the failing tests** (caveroom.test.js):
  - `moss is lumpy: each floor mound rises 0.05–0.15 m and its outline is uneven` — `roomOf(id).mossBlobs` (new return field: `[{ x, z, rad, top }]` for floor blobs): `top − cave.y` in [0.05, 0.15]; across the mound's rim vertices (moss-coloured vertices within 1.25 rad of the centre and below cave.y + 0.02) max/min distance ≥ 1.15.
  - `wall moss stands off the liner` — `roomOf(id).wallMoss` (new: `[{ x, y, z, nx, nz, top }]`): the top point stands ≥ 0.04 m in front of the liner along the normal (`room.linerDepth`).
  - Existing tests keep passing (moss stays inside the chamber; low vertices clear of path and finds, so the clear radius allows the jitter: `rad * 1.25`).
  - `keeps each room under 5,000 triangles` still passes; growth ≤ +300 tris per cave against today's 2300 / 2296 / 1916.
- [ ] **Step 2: Run** `npx vitest run test/caveroom.test.js` — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run test/caveroom.test.js test/gorge.test.js test/budget.test.js test/gorgerock-guard.test.js` — PASS.
- [ ] **Step 5: Commit** `feat(caves): lumpy moss mounds that hug the floor and the walls`.

### Task 4: Rounded, rough tunnels in the cave corridors

**Files:**
- Modify: `src/world/caveroom.js` (new `caveTunnel`)
- Modify: `src/world/gorge.js` (`caveTunnelFor(caveId)`; `caveInterior` merges the tunnel into the `caveRoom:<id>` mesh with `mergeGeometries`)
- Test: `test/caveroom.test.js`

**Interfaces:**
- Consumes: `mossLump`, `mesher` (Task 3); the cave record (`rects`, `path`, `y`); `CORRIDOR_HEADROOM` (2.6) from gorgeshape.js.
- Produces: `export function caveTunnel(cave, { clear, seed }) -> { geometry, parts: { liner, frames, stalactites, roots, moss }, stalactiteTips: [{x,y,z,root}], rootTips: [{x,y,z}], stations }` (geometry indexed with position/color/normal, same attribute set as caveRoom's so they merge). `export const TUNNEL_BUMP_LOW = 0.12`, `TUNNEL_BUMP_VAULT = 0.2`, `ROOT_MIN_Y = 1.7`. gorge.js: `export function caveTunnelFor(caveId)` (seed `seedFromCode('gorge-cavetunnel-' + id)`, clear = `caveClear` for the cave).

Design:
- The sweep runs along `cave.path[0..2]` (mouth → corner → the chamber's edge; all three caves' path[2] lies on the chamber boundary). Stations every ~0.55 m on each leg, plus the corner station, whose lateral axis is the bisector scaled by √2 (a mitre), so |u| = 1.5 lands exactly on the L-shaped box's inner and outer corners.
- Profile (u lateral, h over the cave floor), one side then mirrored, sharing the centre: (1.5, −0.02), (1.5, 0.8), (1.5, 1.55), (1.35, 2.1), (0.9, 2.45), (0, CORRIDOR_HEADROOM − 0.02). 11 points, 20 triangles a station.
- Each vertex moves inward only (toward the axis, and down on the vault) by seeded value noise in [0, TUNNEL_BUMP_LOW] for h < COVE_FROM and up to TUNNEL_BUMP_VAULT above, tapered to 0 over 0.8 m at both ends. A low vertex (h < COVE_FROM) that fails `clear(x, z, 0)` goes back to the wall line. Colour: the cave's `LINER_COLORS` as the chamber liner does (darker low, noise-shaded).
- End frames at the mouth station and the chamber station: a ring of triangles filling between the end profile and the rectangle (u ±1.5 from −0.02 to the headroom), facing out of the tunnel, coloured like the liner.
- Two stalactites (the chamber's blunt `spike`, root at the vault, length 0.25–0.5, tip ≥ cave.y + STALACTITE_MIN_Y), none within 2 m of the mouth; three hanging roots 1–3 m in from the mouth (two crossed thin strips, 3 segments, 0.02–0.03 wide, dark brown 0x5e452d / 0x6b4f33, a small curl), from the vault at |u| 0.5–1.1 down to a tip ≥ cave.y + ROOT_MIN_Y; three lumpy moss mounds on the low walls (Task 3's `mossLump`, along the wall normal) in the first 4 m.
- ≤ 1,100 triangles per cave.

- [ ] **Step 1: Write the failing tests** (caveroom.test.js, timeout 120_000):
  - `each tunnel stays in its corridor and bend, on its floor and under its roof` — every vertex within the union of the corridor and bend rects (±0.01) and y in [cave.y − 0.03, cave.y + CORRIDOR_HEADROOM].
  - `keeps low vertices off the walking line and the finds` — vertices with y < cave.y + COVE_FROM and more than 0.05 in from the box: pathDist ≥ CAVE_PATH_CLEAR, finds ≥ CAVE_FIND_CLEAR.
  - `low walls stand in at most TUNNEL_BUMP_LOW` — every liner vertex with h in [0.3, 1.6] is within TUNNEL_BUMP_LOW + 0.005 of the box wall line beside it.
  - `is rounded under the roof` — no liner vertex above cave.y + 2.3 lies within 0.3 m of a side wall line (the box's top corners are cut off).
  - `faces into the tunnel` — liner normals at h in [0.3, 1.5] point away from the nearer side wall (dot > 0.3), > 60 samples per cave.
  - `hangs stubby stalactites and roots high` — 2 stalactites, tips ≥ cave.y + 2.0, length ≤ 0.6, ≥ 2 m from the mouth; 3 roots, tips ≥ cave.y + ROOT_MIN_Y.
  - `closes its ends` — `parts.frames > 0`.
  - `under 1,100 triangles, deterministic` — tris ≤ 1100; two builds equal.
  - `the caveRoom mesh carries the tunnel` — in a built Gorge, `caveRoom:<id>` tris = `caveRoomFor(id)` tris + `caveTunnelFor(id)` tris; interiors still `[2, 2, 3]` meshes (budget.test.js unchanged).
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.** Merge in `caveInterior` inside the existing `withLocalUuids` callback.
- [ ] **Step 4: Run** `npx vitest run test/caveroom.test.js test/gorge.test.js test/budget.test.js test/gorgerock-guard.test.js test/waterlooks.test.js` — PASS. Report the Gorge's bare-build triangle total.
- [ ] **Step 5: Commit** `feat(caves): rounded, rough tunnels with roots and stalactites in the corridors`.

### Task 5: Live tuning, budget notes and the full suite (controller)

- [ ] Take AFTER shots with `scratchpad/snaps-polish-gorgeway/scripts/shots.mjs after <day|dusk|phone|chase|perf>`; compare with the BEFORE set; tune colours/sizes in small follow-up commits.
- [ ] Full suite + `npm run build`; flat-trace hash check; update the budget.test.js Gorge comment row with final numbers.
- [ ] Pairs into `snaps-polish-gorgeway/pairs/`.
