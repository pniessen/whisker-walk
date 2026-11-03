# polish-rivermoor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the River and Marshes a real marsh and the Moor a rolling granite moor, purely with visual dressing, without changing gameplay, the flat trace, the draw-pins or the 60k triangle cap.

**Architecture:** Two new pure-data + mesh modules (`src/world/riverdress.js`, `src/world/moordress.js`) on top of a small shared helper module (`src/world/dressing.js`). Each area's build() calls its dresser once, at the end, wrapped in `withLocalUuids` so the Math.random draw count is unchanged. Everything static is ONE vertex-coloured noCast mesh per material per area (a `groundPaint` decal mesh and a `dressing` mesh); the ground's existing vertex colours are re-tinted in place (zero triangles). The River's mist and dragonflies are two shader-animated meshes built in build() and driven by the area `life` hook walk.js already calls (`areaData.life?.(ctx)`, see src/gorgelife.js) — no walk.js/main.js edits.

**Tech Stack:** Three 0.185, Vite 8, Vitest 4.

**Spec:** the owner's brief (parent prompt) + scratchpad/polish-common.md. Brief, verbatim essentials:
- River: reed beds and rushes along the banks, lily pads (some with flowers), muddy/darker wet banks, stepping stones, a fallen mossy log bridging it, soft low mist over the water at dawn and dusk, dragonflies darting over the water, cattails/willow clumps, break up the flat pale grass with marshy tussocks and colour variation.
- Moor: rolling ground feel (visual undulation and colour variation — do NOT change walkable ground heights), granite tors (stacked rounded rocks), a winding sheep path, scattered boulders, a rocky lake shore, wind-bent grass. Heather beds (rustle shader) stay.

## Global Constraints

- Triangle ceiling 60,000 per area in test/budget.test.js must NOT be raised. Baseline: River 51,111 (167 meshes / 135 casters / 165 merged), Moor 53,891 (85 / 48 / 84). Caps for this build: **River ≤ 59,400, Moor ≤ 59,400** (keep ≥ 600 slack).
- Draw calls nearly flat: River +4 meshes (groundPaint, dressing, marshMist, dragonflies), Moor +2 (groundPaint, dressing). Casters +0 (all new meshes `userData.noCast = true`, `castShadow = false`).
- test/waterlooks.test.js BUILD_DRAWS (river 15484, moor 7944) unchanged: every THREE object/geometry/material made by new code is made inside `withLocalUuids(key, fn)` (src/world/localuuids.js). Keys: `'river-dressing'`, `'river-life'`, `'moor-dressing'`.
- Flat trace test/fixtures/flat-trace.json stays sha256 `ec6781cd741905e46a536f4030fe29980826c2fa94dee52d84683b69f110a54d`. If it moves: isolation check per polish-common.md; re-record only if render-only fields change, in a separate final commit.
- Gameplay data unchanged. Pinned now (sha256 of `JSON.stringify({colliders, perches, spawn, bounds, waters, pois, collectibles, scenics, critterSpawns, puddles, boxes, moments})` of `build(new THREE.Scene())`): river `2e9113dcf19895e95233d2ad9cbe63492506334e47f4ab0b8bd96796b2910599`, moor `f7f0bd41dcd7c7e0476f14e7324e84d5b6e032b0e334df4a4fa2167703fdd9f6`.
- No collider, perch, POI, path, route, spawn or walkable-ground change. Nothing new is walkable; a cat walks through every new prop (like the heather and reeds), so new props inside the bounds are LOW: ≤ 0.45 m for grass/tussocks/shrub tips except cattails (≤ 1.3 m, bank-only, same keep-offs as reeds) and shrubs (≤ 0.9 m), rocks ≤ 0.35 m. Big rocks only outside the bounds or hugging an existing collider.
- Determinism: only `hash01` (builder.js export), `mulberry32`/`seedFromCode` (src/rng.js), and pure trig. No Math.random outside `withLocalUuids`.
- Shader time comes only from the life hook's `update(dt, t, ...)`; reduced motion respected (no darting, no flutter, no mist drift).
- Ownership: this build owns src/world/river.js, src/world/moor.js and in builder.js reedBed/heatherBed/gorseBed/water-edge helpers + River/Moor edge styles. Do not edit walk.js, main.js, camp.js, src/cat/*, gorge files.
- Tests: `npx vitest run --exclude '.claude/**' --exclude '.worktrees/**'`; long geometry tests get explicit timeouts (120_000). `npm run build` must pass.
- Commits: explicit `git add <paths>`; every message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. A tall prop (cattail, shrub, tussock) standing on a path, a find, a race ring, a golden mouse, the spawn, a deck, or inside a camp disc, hiding something a kid looks for → covered by the clearance tests in Tasks 2 and 4 (data-level, against RIVER_KEEP_CLEAR / MOOR_KEEP_CLEAR, paths, trails, decks, DISCS).
2. A Math.random draw sneaking in (a `new THREE.*` outside withLocalUuids) → moves BUILD_DRAWS and the flat trace; covered by waterlooks + flattrace tests, run in every task.
3. Mist covering the screen when the camera dips near the water, or overdraw on phones → fragment fades to 0 within 3 m of the camera; test asserts the material is transparent, depthWrite false, and the mesh hidden when strength is 0.
4. Ground paint z-fighting with paths/puddles/contact shadows → PAINT_Y 0.005 (under paths 0.01, contact shadows 0.015, puddles 0.02) + polygonOffset; test asserts paint y range.
5. Reduced motion → dragonflies hover in place (uCalm 1), mist static; test in Task 3.

---

### Task 1: Shared dressing helpers

**Files:**
- Create: `src/world/dressing.js`
- Test: `test/dressing.test.js`

**Interfaces (Produces):**
- `export const PAINT_Y = 0.005`
- `export function colorParts(geo, color)` — `geo` any BufferGeometry, `color` a hex number, `[r,g,b]` (linear 0..1) or `(x, y, z) => [r,g,b]`; returns a NON-indexed geometry (`toNonIndexed()` if indexed) with only `position`, `normal` and a 3-component `color` attribute (uv dropped). Disposes the input if it converted it.
- `export function dressMesh(geoms, { name, side = THREE.DoubleSide, roughness = 0.95 })` — merges `colorParts` outputs into ONE `THREE.Mesh` with `MeshStandardMaterial({ vertexColors: true, roughness, metalness: 0, side })`, `castShadow = false`, `receiveShadow = true`, `userData.noCast = true`, `name`. Empty list → mesh with empty geometry.
- `export function paintMesh(geoms, { name = 'groundPaint' })` — like dressMesh but every geometry is flat at `PAINT_Y`, material `side: FrontSide`, `polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1`.
- `export function ribbon(points, halfW, { salt = 0, wobble = 0.35, step = 0.8 })` — a flat ribbon (BufferGeometry in XZ at y 0, facing +y) along a polyline `[[x,z],...]` resampled every `step` m; each side's half-width is `halfW * (1 + wobble * (hash01(i, side, salt) * 2 - 1))` so the edge is irregular. 2 triangles per step. Callers lift it with `translate(0, PAINT_Y, 0)` via paintMesh.
- `export function blob(x, z, r, { n = 8, salt = 0, wobble = 0.3 })` — a flat irregular disc (triangle fan, n triangles) in XZ at y 0, facing +y.
- `export function tintGround(groundMesh, fn)` — multiplies the ground mesh's existing `color` attribute in place by `fn(worldX, worldZ) -> [r,g,b]`, using the mesh matrix (ground is rotated −π/2 about x; call `updateMatrix()` first). No new object (no uuid).
- `export function smoothField(x, z, salt, wavelength)` — sum of three sines (direction/phase from `hash01(0,0,salt+k)`), returns roughly −1..1 (divide by 3). Pure.

- [ ] **Step 1: Write failing tests** in `test/dressing.test.js`:
  - `dressMesh merges parts into one noCast vertex-coloured mesh`: two `colorParts(new THREE.BoxGeometry(1,1,1), 0xff0000)` → one mesh, `geometry.index === null`, `attributes.color.count === attributes.position.count`, `userData.noCast === true`, `castShadow === false`, `material.vertexColors === true`; triangle count = 24.
  - `colorParts takes a per-vertex function`: colour at a vertex with y>0 differs from y<0 when fn returns by y.
  - `paintMesh lies at PAINT_Y and offsets its polygons`: every position y === PAINT_Y; `material.polygonOffset === true`.
  - `ribbon has 2 triangles per step and an irregular edge`: straight 8 m polyline, step 0.8 → 20 tris (±2); not all half-widths equal.
  - `tintGround multiplies the ground's colours in place`: `b.ground(120, 0x7d9c55, { surface: 'grass' })`, copy colours, `tintGround(m, () => [0.5, 0.5, 0.5])`, every channel halves; same attribute object.
  - `the helpers draw no Math.random inside withLocalUuids`: wrap Math.random with a counter, call `withLocalUuids('t', () => dressMesh([...], { name: 'x' }))`, counter stays 0.
- [ ] **Step 2: Run** `npx vitest run test/dressing.test.js` → FAIL (module missing).
- [ ] **Step 3: Implement** `src/world/dressing.js` (imports `hash01` from `./builder.js`, `mergeGeometries` from `three/addons/utils/BufferGeometryUtils.js` the way builder.js does).
- [ ] **Step 4: Run** the test file → PASS.
- [ ] **Step 5: Commit** `git add src/world/dressing.js test/dressing.test.js` — `feat(dressing): shared vertex-coloured dressing and ground-paint helpers`.

### Task 2: The River's static marsh dressing

**Files:**
- Create: `src/world/riverdress.js`
- Modify: `src/world/river.js` (export what the dresser needs; call it at the end of build(); tint the ground)
- Test: `test/riverdress.test.js`

**Interfaces:**
- Consumes: Task 1 exports.
- river.js must export (new `export` on existing consts, no value changes): `RIVER_WATERS` (already), `RIVER_PATHS` (already), `RIVER_KEEP_CLEAR` (already), `riverTrees`, `riverReeds`, `riverLilyPads` (already), plus add `export const RIVER_DECKS = DECKS`, `export const RIVER_LOG = Object.freeze({ x: LOG_X, w: LOG_W, top: LOG_TOP, flat: LOG_FLAT, minZ: LOG_BRIDGE.minZ, maxZ: LOG_BRIDGE.maxZ })`, `export const RIVER_STONES = Object.freeze({ x: STONES_X, z1: -15, z2: -8, ...STONES })`, `export const RIVER_MEADOW = MEADOW`, `export const RIVER_FALLEN_LOG = LOG_SEG`, `export { SPAWN }` (already exported).
- Produces (riverdress.js), all pure data, every list rounded to cm:
  - `riverTussocks() -> [{x, z, h, s}]` (cap 240)
  - `riverCattails() -> [{x, z, h}]` (cap 80; clumps of 3–5)
  - `riverShrubs() -> [{x, z, r}]` (cap 12; osier clumps, r ≤ 0.6, height ≤ 0.9)
  - `riverExtraPads() -> [{x, z, r}]` (cap 45; in river-bend/river-east/river-west margins, 0.4–1.0 m inside the water from a SHORE edge listed in WATER_LOOK, inside the bounds, ≥ 3 m from a deck)
  - `riverFlowers() -> [{x, z, color}]` — on ~30% of `[...riverLilyPads(), ...riverExtraPads()]` (`hash01` pick), colours pink 0xf0a0c0 / white 0xf4f0e6, yellow centre.
  - `riverGroundTint(x, z) -> [r,g,b]`
  - `addRiverDressing(scene, { ground })` — builds and adds `groundPaint` and `dressing` meshes; caller wraps it in `withLocalUuids('river-dressing', ...)`.

Placement rule `fitsLow(x, z, rule)` for tussocks/shrubs/cattails (export it for the test): in bounds; ≥ `rule.water` from every water (decks ignored); ≥ `rule.deck` from RIVER_DECKS; ≥ `rule.path` from every RIVER_PATHS centreline; ≥ `rule.clear` from every RIVER_KEEP_CLEAR spot; ≥ 4 from SPAWN; outside DISCS.river (`src/rivalclans.js`, r + 1); ≥ 1.5 from RIVER_FALLEN_LOG segment; ≥ 0.8×scale from every tree; meadow (r 9) allowed for tussocks only. Values: tussocks {water 0.3, deck 2, path 1.9, clear 1.5}; cattails {water: 0 (bank band 0.2–0.9 m from water edge), deck 2, path 2.3, clear 3}; shrubs {water 1.0, deck 4, path 2.8, clear 3}.

Look (all in `dressing`, one mesh, DoubleSide):
- Tussocks: 6 tapered single-triangle blades each, splayed, olive 0x6f7f3e at root to straw 0xb8b070 at tip (per-vertex fn), h 0.25–0.45. Denser in the west reedbed margin and round pools; sparser in the south-east.
- Cattails: stem = 2 crossed thin quads (4 tris) h 1.0–1.3, green 0x6a7d3a; head = 4-sided capless box 0.05×0.22, brown 0x5a3a22 (8 tris).
- Shrubs: 3 squashed IcosahedronGeometry(r,0) lobes, grey-green willow 0x7f9a6a.
- Extra pads: CircleGeometry(r, 10) with a notch like `b.lilyPads`, colour 0x4f8a3a, y 0.06. Flowers: 5-petal open ConeGeometry(0.09, 0.07, 5, 1, true) inverted cup + yellow centre IcosahedronGeometry(0.025,0), y 0.07.
- Mossy log: on both FLANKS of the River's log bridge (never on its flat deck top), irregular moss shell patches: partial-cylinder strips (`CylinderGeometry(r*1.02, r*1.02, len, 6, 1, true, θ0, θspan)`) along the log, θ spanning the upper flank below the flat; moss 0x5f7a32 to 0x7f9440. ≤ 400 tris. Plus 3 short broken branch stubs on the flanks (bark 0x6e4a2c).
- Stone moss: thin flattened green caps (IcosahedronGeometry(0.2,0) scaled y 0.12) on the rims of 6 of the 14 stepping stones (hash pick), top ≤ 0.04 above the stone top (stone top ≈ 0.1). Do not cover the stone centre.
- Paint (`groundPaint`): mud banks = `ribbon` along every SHORE edge (WATER_LOOK shores) of river-west, river-bend, river-east, the lake's minX/maxZ shores, inside the bounds, laid 0.1–1.3 m out from the water edge (centre 0.7, halfW 0.6), peat 0x5a4a32→0x6b5a3a varied by hash; `blob`s round pools and pond (r = water r + 0.9, n 16, peat). Skip ribbon parts that fall on a deck rect.
- Ground tint (`tintGround`, river.js after `b.ground`): within 6 m of water lerp toward wet olive [0.82, 0.90, 0.78]; macro patches (`smoothField` λ 22 m) of dry straw [1.06, 1.02, 0.86] and lush [0.88, 0.96, 0.86]; west reedbed rect a peaty [0.86, 0.88, 0.76].
- Budget: dressing + paint ≤ 7,300 triangles together.

- [ ] **Step 1: Write failing tests** (`test/riverdress.test.js`, document stub as in test/budget.test.js; geometry tests timeout 120_000):
  - `gameplay data is byte-identical`: sha256 of the JSON in Global Constraints equals `2e9113dc…0599`.
  - `every tussock, cattail and shrub keeps off paths, finds, decks, spawn and the camp` (via `fitsLow` rules restated as plain distance checks against the river.js exports, not by calling fitsLow).
  - `cattails stand on a bank`: each 0.2–0.9 m from the nearest water edge, on dry land.
  - `extra pads float in water, off the decks, in bounds`: `b.inWater(RIVER_WATERS with decks: [])` true, ≥ 3 m from each deck.
  - `the dressing is two noCast meshes inside the triangle allowance`: after `build(scene)`, `scene.getObjectByName('dressing')` and `'groundPaint'` exist, noCast, and their triangles sum ≤ 7,300; whole build ≤ 59,400 triangles (budgetStats copy).
  - `the dressing is the same every build`: two builds → identical `position` arrays.
  - `no prop is taller than its class`: tussock h ≤ 0.45, cattail h ≤ 1.3, shrub top ≤ 0.9.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** riverdress.js; in river.js: keep `const groundMesh = b.ground(...)`, `tintGround(groundMesh, riverGroundTint)`, and as the LAST statement before `return` in build(): `withLocalUuids('river-dressing', () => addRiverDressing(scene, {}))`.
- [ ] **Step 4: Run** `npx vitest run test/riverdress.test.js test/river.test.js test/waterlooks.test.js test/flattrace.test.js test/budget.test.js test/water.test.js` → PASS; flat-trace sha unchanged (`shasum -a 256 test/fixtures/flat-trace.json`).
- [ ] **Step 5: Commit** — `feat(river): marsh dressing — mud banks, tussocks, cattails, osier clumps, flowering lilies, mossy log and stones`.

### Task 3: The River's mist and dragonflies

**Files:**
- Create: `src/world/marshlife.js`
- Modify: `src/world/river.js` (build the two meshes under `withLocalUuids('river-life')`, return `life`)
- Test: `test/marshlife.test.js`

**Interfaces:**
- Produces:
  - `export function marshMist(waters, bounds) -> THREE.Mesh` named `'marshMist'`: flat horizontal sheets (PlaneGeometry segmented ~2 m) at y 0.25 and 0.55 over the in-bounds parts of river-west, river-bend, river-east, the pond, the three pools and a 10 m strip of the lake along its in-bounds shores, each sheet 1 m wider than its water. Material `MeshBasicMaterial({ color: 0xdfe4ea, transparent: true, depthWrite: false, fog: true })` patched with `onBeforeCompile` (`customProgramCacheKey` `'marsh-mist-v1'`): alpha = `uMist * 0.32 * noise(worldXZ * 0.18 + uTime * 0.05 * drift) * edgeFade(uv) * smoothstep(1.0, 3.0, distance(cameraPosition, worldPos))`; uniforms `{ uTime, uMist, uColor }` on `mesh.userData.marshMist`. `renderOrder = 2`, noCast, `visible = false` initially.
  - `export function dragonflies(homes) -> THREE.Mesh` named `'dragonflies'`: `homes` = `[{x, y, z, hue}]`; each fly = body (3-sided capless prism 0.1 m, 6 tris) + two wing pairs (2 quads, 4 tris), attributes `aHome` (vec3), `aSeed` (float), `aWing` (0 body / 1 wing tip). `MeshBasicMaterial({ vertexColors: true, fog: true })` patched (`'dragonflies-v1'`): per fly, a deterministic dart path — target point changes every 1.6–3 s (from `aSeed` and `floor(uTime / period)`), eased dash over 0.25 s then hover with small bob; yaw follows the dash; wings flap `sin(uTime * 70 + aSeed)` scaled by `1 - uCalm`; with `uCalm = 1` the fly hovers at home with a slow 0.03 m bob, no dash. Radius of roam 1.8 m, y 0.35–0.9. Uniforms `{ uTime, uCalm }` on `userData.dragonflies`. `frustumCulled = false` (bounds are dynamic), noCast.
  - `export function riverDragonflyHomes() -> [{x, y, z, hue}]` — 14 homes over the water near banks (river-west, river-east, pond, pools; none within 3 m of a deck), from `hash01`; hues blue 0x2f8fb0 / green 0x3fa070 / red 0xc04a3a.
  - `export function createMarshLife({ mist, flies, dusk, weather, reducedMotion }) -> { update(dt, t, catPos, camera), dispose() }`: mist strength target 1 on a dusk walk, 0.7 when `weather.condition === 'sunset'`, else 0 (no dawn exists in the game: ruling R1); eased at 0.5/s; `mist.visible = strength > 0.001`; `uColor` lavender-grey 0xb8b4c8 at dusk, warm 0xe8d4c4 at sunset. Flies `visible = !dusk && !weather.isRaining?.()`; `uCalm = reducedMotion ? 1 : 0`; time advances `uTime` (mist drift multiplied by 0 under reduced motion). `dispose()` does nothing beyond resetting visibility (walk.js disposes scene materials).
- Consumes: river.js waters/bounds.

- [ ] **Step 1: Failing tests** (`test/marshlife.test.js`):
  - `the mist is one transparent noCast mesh that writes no depth and starts hidden`.
  - `the mist shows on a dusk walk and on a sunset, not by day`: createMarshLife with `{dusk:true}`, run update(0.1) ×100 → `mist.visible` true, `uMist` ≈ 1; `{dusk:false, weather:{condition:'clear'}}` → stays hidden; sunset → ≈ 0.7.
  - `dragonflies fly by day and rest at dusk and in rain`.
  - `reduced motion calms the dragonflies`: `uCalm` 1.
  - `homes are over water, off the decks, in bounds` (14 homes).
  - `river build returns life and the two meshes; BUILD_DRAWS unchanged` (run waterlooks too).
  - `mist + flies ≤ 900 triangles`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**; river.js: `const life = withLocalUuids('river-life', () => { ...add marshMist(RIVER_WATERS, BOUNDS) and dragonflies(riverDragonflyHomes()) to scene; return { mist, flies }; })`; return `life: (ctx) => createMarshLife({ ...life, ...ctx })`.
- [ ] **Step 4: Run** the Task 2 command list plus `test/marshlife.test.js` → PASS; trace sha unchanged; `npm run build` OK.
- [ ] **Step 5: Live check** on port 5241 (dev server already running): a dusk River walk shows mist over the water and the frame has no console errors; a day walk shows dragonflies moving. (`node /private/tmp/claude-501/-Users-pniessen-CLAUDE-CODE-projects-cat-game/6f2ddd3a-4768-4d57-890f-2d7e74238375/scratchpad/rivermoor/shots.mjs after river dusk` and `... after river stream`, then look at the jpgs in snaps-polish-rivermoor.)
- [ ] **Step 6: Commit** — `feat(river): low mist over the water at dusk and sunset, dragonflies darting by day`.

### Task 4: The Moor's dressing

**Files:**
- Create: `src/world/moordress.js`
- Modify: `src/world/moor.js` (exports; ground tint; call the dresser last in build())
- Optional trim: `src/world/builder.js` gorseBed flecks `IcosahedronGeometry(0.07, 0)` → `OctahedronGeometry(0.08, 0)` (only the Moor uses gorseBed; saves ~1,488 triangles) — only if the Moor would exceed 59,400 otherwise; record before/after.
- Test: `test/moordress.test.js`

**Interfaces:**
- moor.js new exports (no value changes): `MOOR_DECKS = DECKS`, `MOOR_LAKE = LAKE`, `MOOR_RIVER_MOUTH = RIVER_MOUTH`, `HIGH_TOR`, `MOOR_CHAIN_ROCKS = CHAIN_ROCKS`, `moorTrunks = trunks` (function), plus existing `MOOR_PATHS`, `MOOR_TRAIL`, `MOOR_GORGE_TRAIL`, `MOOR_KEEP_CLEAR`, `MOOR_WATERS`, `TORS`, `WARREN_BURROWS`, `SPAWN`.
- Produces (moordress.js), pure data rounded to cm:
  - `SHEEP_PATHS` = two waypoint polylines: `[[40,-11],[45,-19],[41,-27],[44,-36],[36,-41],[30,-42.5]]` and `[[-19,-33],[-26,-30],[-31,-24],[-37,-22.5]]`, drawn as Catmull-Rom (`THREE.CatmullRomCurve3` is fine — inside withLocalUuids it costs nothing; or own spline) `ribbon` halfW 0.38, worn track 0x9c9068 → 0x8f8660, plus a thinner 0.15 m parallel second rut 0.45 m to one side on the first path.
  - `moorClitter() -> [{x, z, r, h}]`: 6–9 rounded rocks round each TORS entry and the High Tor pillar, centre distance `t.r * (0.7..1.05)`, r 0.18–0.45, h ≤ 0.35; ≥ 1.2 m from MOOR_PATHS/trail centrelines-minus-half-width (i.e. none on a path).
  - `moorBoulders() -> [{x, z, r, h}]` (cap 30, groups of 2–3), `moorGrass() -> [{x, z, h, tone}]` (cap 450; 4 blades each), `moorShoreStones() -> [{x, z, r, h}]` (cap 70), `FAR_TORS` (5 entries outside the bounds, `|x| or |z|` 52.5–55, none past a water: e.g. `[[54,-30],[54,12],[20,-54],[-14,-54],[38,-53.5]]`, h 2.5–4 m, r 1.8–2.6).
  - `moorGroundTint(x, z) -> [r,g,b]`
  - `addMoorDressing(scene)` — adds `groundPaint` + `dressing`.
- Placement rules (`fitsMoor`, restated in tests as plain distance checks): in bounds; boulders {water 1.0, deck 3, path 2.0 (MOOR_PATHS) / 1.8 (trails), clear 2.5, spawn 5, tor t.r+0.8, trunk 1.2×scale, camp DISCS.moor r+1}; grass {water 0.4, deck 2, path 1.9 / 1.4, clear 1.5, spawn 3, tor t.r+0.2, trunk 0.6×scale, camp r}.

Look (one `dressing` mesh, DoubleSide):
- Wind-bent grass: 4 single-triangle blades per tuft leaning 25–40° along `WIND_DIR` (`src/render/grass.js`, [0.8, 0.6]); tones straw 0xc8b878, olive 0x8a9550, rust 0xa06a40 (root darker); h 0.25–0.5. Denser on the "crests" of `smoothField` (λ 34 m, salt 41) and round the tors.
- Clitter/boulders/shore stones: IcosahedronGeometry(1, 0) scaled (r, h, r×0.85), random yaw, granite greys 0x8e8c88 / 0x9a968e / 0x7f7d78 with a lichen fleck tone 0xb8b48a on ~20% (top vertices lighter via per-vertex fn).
- Rocky lake shore: `moorShoreStones` along the lake's north shore (z = 8, x −50..−14 skipping the river mouth −40..−35 ±1) and east shore (x = −14, z 8..50), centres −0.6..+0.5 m across the waterline, top ≤ 0.22; shingle `ribbon` 1.2–2.0 m wide on land along both shores, pale grey-buff 0xa89e88 → 0x9a927e (paint); stones skip within 1.5 m of a reed spot and of decks.
- Far tors: 3 stacked squashed icosahedra each (widest at foot), granite, outside the bounds behind the wall.
- Ground tint (`tintGround`): rolling undulation from `smoothField` λ 34 m: crests [1.06, 1.04, 0.94], hollows [0.84, 0.90, 0.84]; bracken patches (λ 18 m, salt 7) [1.0, 0.88, 0.78]; near water (≤ 5 m) greener [0.90, 0.98, 0.88].
- Budget: dressing + paint ≤ 5,500 triangles; whole Moor ≤ 59,400.

- [ ] **Step 1: Failing tests** (`test/moordress.test.js`): gameplay sha `f7f0bd41…d9f6`; clearance tests for boulders/grass/clitter as above; shore stones straddle the waterline (|waterGap| ≤ 0.7) and none in the river mouth; far tors all outside the bounds and not over any water; sheep paths keep 2 m off every water and stay in bounds; two noCast meshes, triangles within allowance; deterministic positions; heights within class (grass ≤ 0.5, rocks ≤ 0.35 in bounds).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**; moor.js: tint ground, and as the last statement before return `withLocalUuids('moor-dressing', () => addMoorDressing(scene))`.
- [ ] **Step 4: Run** `npx vitest run test/moordress.test.js test/moor.test.js test/waterlooks.test.js test/flattrace.test.js test/budget.test.js test/builder.test.js test/heather*.test.js` → PASS; trace sha unchanged.
- [ ] **Step 5: Commit** — `feat(moor): rolling tint, sheep paths, tor clitter, boulders, rocky lake shore, wind-bent grass, far tors`.

### Task 5: Budget record, full suite, live shots

**Files:**
- Modify: `test/budget.test.js` (comment block only: a dated `2026-11-03, polish-rivermoor` paragraph with per-mesh before → after for River and Moor: meshes, casters, merged, triangles, and the new meshes' own triangle counts). Ceilings untouched.

- [ ] **Step 1:** Measure with a throwaway per-mesh script (never committed) → before numbers are in `scratchpad/rivermoor/measure-before.json`.
- [ ] **Step 2:** Write the budget comment.
- [ ] **Step 3:** Full suite `npx vitest run --exclude '.claude/**' --exclude '.worktrees/**'` and `npm run build` → green; `shasum -a 256 test/fixtures/flat-trace.json` = `ec6781cd…a54d`.
- [ ] **Step 4:** `node …/scratchpad/rivermoor/shots.mjs after`, build 6–8 before/after pairs into `snaps-polish-rivermoor/pairs/` (incl. both phone shots and a dusk mist pair).
- [ ] **Step 5: Commit** `git add test/budget.test.js` — `docs(budget): polish-rivermoor triangle and mesh record`.

## Rulings (ledger)

- R1 Mist shows on dusk walks (full) and sunset weather (0.7); the game has no dawn, so "dawn" is the sunset look. Cost if wrong: one condition in createMarshLife.
- R2 No new stepping stones or logs across water: a crossing that looks walkable but isn't would mislead kids (water stops a cat). The existing log and ford get the moss. Cost if wrong: an added deck later needs collider/route review.
- R3 Moor undulation is colour only (ground tint) plus low dressing; no displaced ground mesh (the cat would float/sink). Cost if wrong: flatter read than a real hill.
- R4 Nothing new is walkable or collides; inside the bounds new props are low enough to push through like heather. Big rocks only outside the bounds or in a tor's clitter ring mostly inside its collider.
- R5 No mist on the Moor (not in the brief). Cost: none.
