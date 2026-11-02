# Polish: Gorge sky and palette, dusk on every map, cave rooms — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish survey items #1b, #14 and #7 for Whisker Walk: a warm clear-day Gorge (sky, fog, floor, clifftop, tufts), a dusk that reads as dusk on every map (and a proper Gorge dusk), and three cave chambers that feel like rounded, distinct caves.

**Architecture:** Two new pure-ish modules carry the new work: `src/render/dusk.js` (dusk light numbers + one apply function called from walk.js's existing dusk block) and `src/world/caveroom.js` (seeded geometry for each cave chamber: liner, stalactites, moss, nest, crystal clusters). The Gorge palette and ground dressing live in `src/world/gorge.js`. Nothing touches gameplay records (ground, colliders, spawn, routes).

**Tech Stack:** Three.js 0.185, Vite 8, Vitest 4. Worktree `/Users/pniessen/CLAUDE-CODE/projects/cat-game/.worktrees/polish-gorgesky`, branch `polish-gorgesky`, cut from main 4650869.

**Spec:** the controller's brief (survey items #1b, #7, #14) and `/private/tmp/claude-501/-Users-pniessen-CLAUDE-CODE-projects-cat-game/6f2ddd3a-4768-4d57-890f-2d7e74238375/scratchpad/polish-common.md` (shared rules). Survey rows #1, #7, #14 in `polish-survey.md` in the same scratchpad.

## Global Constraints

- Tests: `npx vitest run --exclude '.claude/**' --exclude '.worktrees/**'` (main: 225 files / 6,197 tests, all green) and `npm run build`. Give long geometry sweeps explicit timeouts (120_000). Never weaken a test to dodge a load timeout.
- Commits: explicit `git add <paths>`; every message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push, never merge.
- Determinism: no `Math.random` in a build or walk; no new draws on `walkRng` or `strayStream`. Use `mulberry32(seedFromCode('<name>'))` / `hash01` from `src/rng.js`. `test/fixtures/flat-trace.json` stays sha256 `6b502ab6b1f9ce328fd6c6b7ce656fd473e50670708fac53985590bc9f0e54a7`; Moor build draw count stays 7944.
- Gameplay unchanged: ground shapes, heights, ceilings, colliders, keep-out, spawn, routes, POIs, finds. `test/gorgerock-guard.test.js` pins the Gorge ground digest; the ground digest and ground spec must stay byte-identical. If a task changes the area record or the mesh count, re-record that fixture with `RECORD_GORGE_GUARD=1` in the same commit and state in the commit message exactly which keys changed (allowed: `groundBounce`, `skyDusk`, `duskLight`, `meshes`, `casters` must stay 36).
- Floats compared against fixtures use `closeDiffs` from `test/helpers/closeto.js`.
- Performance (iPhone 18, 60 fps on HIGH): new dressing is merged to one mesh per material, small dressing is `castShadow = false` and `userData.noCast = true`. Budgets below are per task.
- Files this build owns: `src/world/gorge.js`, `src/world/gorgeshape.js`, `src/gorgelife.js`, `src/caves.js`, `src/render/sky.js`, the `skyDusk`/dusk-light lines in each area file and the dusk block in `src/game/walk.js`. New files: `src/render/dusk.js`, `src/world/caveroom.js`. Do NOT edit `src/weather.js` (polish-water), `src/cat/*` (polish-catlooks), `src/world/camp.js`. Small edits to `src/world/builder.js` only if a task says so.
- Copy: none of this adds words the kids read.
- Mood: cosy, never scary (a 9-year-old plays it). Dusk is warm and dim, not dark.

## Review Focus

1. **A dusk walk followed by a day walk** must render exactly like a day walk (sun colour, hemi colours, env intensity, no leftover collar light). Test in Task 3.
2. **Something new inside a cave sitting in the cat's walking line or on a find** (the Echo pebble at (-27, 33), the Snug fur at (24.5, 8), the Glitter stone at (43, -40), the gold mice). Tests in Tasks 5 and 6.
3. **Overlay z-fighting / hiding** — the clifftop/bank overlay hiding paths, paw prints, contact shadows or a find. Test in Task 2 (no overlay cell within a path's half-width; overlay drawn below decals).
4. **A co-walk joiner on a dusk walk without a glow collar** gets dusk light but no collar glow, and no crash. Test in Task 3.
5. **Cave interior visible from outside or before gorgelife shows it** (new meshes must live inside the hidden `caveInterior:<id>` group). Test in Task 5.

---

### Task 1: Gorge day palette — sky, fog, floor, horizon, summit rock

**Files:**
- Modify: `src/world/gorge.js` (sky call ~l.605, `GROUND_COLOR` l.573, `PATH_STYLE` l.117, `GORGE_HORIZON` colours l.123-129, `ROCK_COLOR` l.179; export the floor colour)
- Modify: `test/clancast.test.js` (import the floor colour instead of the literal `0x5f5d52`)
- Modify: `test/gorge.test.js` (new assertions), `test/fixtures/gorge-gameplay.json` (re-record: `groundBounce` only)

**Interfaces:**
- Produces: `export const GORGE_SKY = { top, horizon }` and `export const GORGE_FLOOR_COLOR` from `src/world/gorge.js` (Task 2 reads `GORGE_FLOOR_COLOR`).

Starting values (tune in the live check, keep the tests' bounds): sky top `0x86bde6` (clear canyon blue), horizon/fog `0xeed8b8` (warm haze); floor `0x9a8a6a` (warm sand); path `0xb8a27e` (lighter than the floor so the path still reads); horizon hills `color 0xa8957a`, `sideTints { north: 0xa8957a, east: 0x9e8c76, south: 0xa8866e, west: 0x9a8a9c }`; summit `ROCK_COLOR 0xb0a084`.

- [ ] **Step 1: Write failing tests** in `test/gorge.test.js`, describe `'Gorge palette (polish #1b)'`:
  - `build(scene)` sets `scene.fog.color.getHex() === GORGE_SKY.horizon`.
  - the sky is warm and clear: horizon has `r > b`; top has `b > r` and HSL saturation ≥ 0.45 (the old overcast `0x9fb6c8` is ~0.28).
  - `GORGE_FLOOR_COLOR` luminance > luminance of `0x5f5d52` + 0.15, its `r > b` (warm), and HSL saturation ≤ 0.35.
  - `area.groundBounce === GORGE_FLOOR_COLOR`.
  - the path colour differs from the floor by luminance ≥ 0.06.
- [ ] **Step 2: Run** `npx vitest run test/gorge.test.js -t 'palette'` — expect FAIL.
- [ ] **Step 3: Implement** the values above. Update the file header's G5 paragraph: the floor's shade now comes from gorgelife's light (SHADE_FLOOR), not from a darker ground colour. In `test/clancast.test.js` import `GORGE_FLOOR_COLOR` and use it for `GORGE_FLOOR` (the 0.35 cap stays).
- [ ] **Step 4: Run** the full suite. Expected failures only in `gorgerock-guard` (`groundBounce`) and any test that asserted the old G5 "floor darker than every other map" rule — if such a test exists, replace it with a test that `shadeFor(0) === SHADE_FLOOR < 1` (the floor is shaded by light) and say so in the commit. Re-record the guard: `RECORD_GORGE_GUARD=1 npx vitest run test/gorgerock-guard.test.js`, then `git diff test/fixtures/gorge-gameplay.json` must show only `groundBounce`.
- [ ] **Step 5: Full suite + build green. Commit** `feat(gorge-sky): a clear warm canyon day — sky, haze, sand floor, warm hills`.

### Task 2: Gorge ground dressing — clifftop variation, green banks, tufts (one mesh)

**Files:**
- Modify: `src/world/gorge.js` (new `gorgeMeadow()` spot function + mesh in `build`)
- Test: `test/gorge.test.js`, `test/fixtures/gorge-gameplay.json` (re-record: `meshes` +1)

**Interfaces:**
- Consumes: `GORGE_FLOOR_COLOR` (Task 1), `GORGE_KEEP_CLEAR`, `GORGE_KEEP_CLEAR_RECTS`, `GORGE_PATHS`, `STREAM`, `CLIFF`, `shapeGround()`, `oneShape()` in gorge.js.
- Produces: `export function gorgeMeadow()` → frozen `{ patches: [{x0,z0,x1,z1,y}], tufts: [{x,z,y,s,rot}] }` (memoised like `gorgeScree`); scene mesh named `gorgeMeadow`.

One merged `THREE.Mesh` named `gorgeMeadow`, one `litMaterial(0xffffff, { vertexColors: true, ...surfaceProps('grass') })` (check the preset exists; else `'sand'`), `castShadow = false`, `userData.noCast = true`, `receiveShadow = true`. Seeded with `mulberry32(seedFromCode('gorge-meadow'))`; each candidate draws all its numbers whether kept or not.
- **Clifftop overlay**: a grid of 1 m cells over `CLIFF` inset 0.6 m from its edges (off the lips), at `CLIFFTOP + 0.006`, vertex colours from value noise between sand `0xc2ad86`, dry grass `0xa8a46a` and a soft green `0x8a9a5c` (patches about 3-5 m across). Drop cells whose centre is within PATH_W/2 + 0.2 of a path, within 1.2 m of a keep-clear point, inside a keep-clear rect, or where `!oneShape(cx, cz, 0.7)`.
- **Bank strips**: on the floor, 1 m cells in the bands x ∈ [-12, -9.6] and [-7.9, -5.5] (both sides of the stream, outside its 1.5 m water), z -50..50, at y 0.006, green `0x7f9358` fading to `GORGE_FLOOR_COLOR` with distance from the water (vertex alpha not needed: colour lerp to the floor colour at the outer edge). Same drop rules (paths, keep-clear, stepping stones' deck `STEPPING_STONES` + 0.5).
- **Tufts**: up to 140 small 3-blade tufts (each ≤ 12 tris, 0.12-0.22 m tall) on the clifftop and the ledges `LOOKOUT_LEDGE`/the turn (never on `WIDE_LEDGE_RECT`, never in a keep-clear rect), ≥ 1.2 m from every keep-clear point, ≥ PATH_W/2 off paths, `oneShape(x, z, 0.4)`; colours `0x8f9a52`..`0x6f8040`.
- Draw order: check `src/render/contactshadows.js` and `src/render/pawprints.js` `RENDER_ORDER`s and give the overlay a `renderOrder` that draws before both (and `polygonOffset` so it never wins against path strips at y 0.01). Confirm `createContactShadows` makes no decal for this mesh (its footprint is flat).

- [ ] **Step 1: Failing tests** (`describe('Gorge meadow (polish #1b)')`, timeout 120_000):
  - `gorgeMeadow()` is the same frozen object twice; a fresh module import gives deep-equal output (determinism).
  - every patch cell and tuft: distance to every `GORGE_KEEP_CLEAR` point ≥ 1.2 (tufts) / 1.2 (cell centres); not inside any `GORGE_KEEP_CLEAR_RECTS`; ≥ PATH_W/2 from every path segment (`segDist`); patch y equals `shapeGround().y(cx, cz) + 0.006`.
  - ≥ 150 clifftop cells and ≥ 40 tufts kept (it actually dresses the top).
  - the built mesh `gorgeMeadow`: `castShadow === false`, `userData.noCast === true`, triangle count ≤ 6,000, one material.
  - the contact-shadow decal count for a Gorge build is unchanged by the meadow (build twice, once with the mesh removed before `createContactShadows`, compare).
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Full suite.** Re-record the guard (`meshes` +1, `casters` still 36). Build green.
- [ ] **Step 5: Commit** `feat(gorge-sky): clifftop patches, green stream banks and ledge tufts in one unshadowed mesh`.

### Task 3: Dusk that reads as dusk, on every map

**Files:**
- Create: `src/render/dusk.js`
- Modify: `src/game/walk.js` (the `if (duskActive)` block ~l.608-625 and right after `composerRig.applyLighting(...)` ~l.640; the area-life ctx ~l.1226 gets `dusk: duskActive`)
- Test: `test/dusk.test.js`

**Interfaces:**
- Produces:
  - `export const DUSK = Object.freeze({ sunColor: 0xffb27a, sunIntensity: 0.8, hemiSky: 0x7d8cc4, hemiIntensity: 0.5, groundDim: 0.55, envScale: 0.45, fogNear: 30, fogFar: 110, collarColor: 0x7ef2c0, collarIntensity: 1.6, collarDistance: 4, collarDecay: 2, collarLift: 0.45 })`
  - `export function duskLook(areaData) -> {...DUSK, ...areaData.duskLight}` (frozen; `duskLight` optional per area, Task 4 uses it).
  - `export function applyDusk({ scene, sun, fill, areaData }) -> look` — sets scene background (`skyBackground(skyDusk.top, skyDusk.horizon)`), `scene.fog = new THREE.Fog(horizon, look.fogNear, look.fogFar)`, `sun.color`, `sun.intensity`, `fill.color` (hemiSky), `fill.groundColor` (area ground bounce × `groundDim`), `fill.intensity`. Moves the existing window-glow swap out of walk.js into here unchanged.
  - `export function duskEnv(envIntensity, look) -> envIntensity * look.envScale` — walk.js applies it to `scene.environmentIntensity` right after `composerRig.applyLighting` on a dusk walk (Night Eyes' boost stays multiplied in).
  - `export function addCollarGlow(cat, look) -> THREE.PointLight` — a no-shadow PointLight named `collarGlow`, child of the cat group at y `collarLift`; walk.js calls it on a dusk walk only when the LOCAL `state.equipped.collar === 'glow'` (a joiner without the collar gets none). It goes with the cat when the walk ends; nothing else to dispose.
- Rain seam: weather is only rolled when `!duskActive` (walk.js ~l.647), so dusk and rain never meet today. Put a comment in dusk.js: dusk is the base; if weather ever runs on a dusk walk it must write on top of these values (weather.js is not touched here).

- [ ] **Step 1: Failing tests** in `test/dusk.test.js`:
  - `duskLook({})` equals `DUSK`; `duskLook({ duskLight: { sunColor: 1 } }).sunColor === 1` and other keys default.
  - `applyDusk` on a fresh `createSun()` / `createFill(0x6a8a4a)` and `{ skyDusk: { top: 0x26344f, horizon: 0x5f5a72 }, groundBounce: 0x6a8a4a }`: `sun.intensity === 0.8` (< SUN_INTENSITY), sun colour warmer than `SUN_COLOR` (g/r and b/r both lower), `fill.color.b > fill.color.r` and fill luminance < `HEMI_SKY`'s; `fill.groundColor` is the bounce × 0.55; fog colour = horizon, near 30 far 110.
  - `duskEnv(1.0, DUSK) === 0.45`.
  - `addCollarGlow(group, DUSK)`: child named `collarGlow`, `castShadow === false`, colour `0x7ef2c0`, position y 0.45.
  - Review Focus 1: a fresh `createSun()`/`createFill()` after a dusk apply still have `SUN_COLOR`/`SUN_INTENSITY`/`HEMI_SKY`/`HEMI_INTENSITY` (nothing module-global is mutated, `DUSK` is frozen).
  - Review Focus 4: walk.js guards the `addCollarGlow` call with the local `state.equipped.collar === 'glow'`; headless walk tests can't reach it, so the controller checks it live (Task 7). Report the guard line in your handoff.
- [ ] **Step 2: Run** `npx vitest run test/dusk.test.js` — FAIL.
- [ ] **Step 3: Implement** dusk.js and wire walk.js (replace the inline dusk block body with `applyDusk(...)`, keep `sun.intensity = 0.7` gone; the `test/gorgelife.test.js` "dusk sun 0.7" test is about the floor rule and needs no change unless it reads walk.js).
- [ ] **Step 4: Full suite + build.** Flat trace must be unchanged (dusk isn't on the traced walk; if it moves, stop and find out why).
- [ ] **Step 5: Commit** `feat(dusk): warm dim sun, cool sky fill, dimmer image light and a collar glow on every dusk walk`.

### Task 4: The Gorge's dusk — warm rim on the high rock, a shaded floor

**Files:**
- Modify: `src/world/gorge.js` (`skyDusk`, new `duskLight` in the returned record), `src/gorgelife.js` (`dusk` ctx flag, `SHADE_FLOOR_DUSK`)
- Test: `test/gorgelife.test.js`, `test/gorge.test.js`, `test/fixtures/gorge-gameplay.json` (re-record: `skyDusk`, `duskLight`)

**Interfaces:**
- Consumes: `duskLook` (Task 3), `ctx.dusk` passed by walk.js (Task 3).
- Produces: `export const SHADE_FLOOR_DUSK = 0.45` and `shadeFor(groundY, dusk = false)` in gorgelife.js; `createGorgeLife({ ..., dusk = false })`.

Values: `skyDusk: { top: 0x2c3460, horizon: 0xc98a6a }` (a deep blue top over a warm canyon-sunset horizon); `duskLight: { sunColor: 0xff9a52, sunIntensity: 1.0, hemiSky: 0x7a84bc }` — the low west sun puts an orange rim on the rims and clifftop while the floor sits in shade (SHADE_FLOOR_DUSK on the sun; the fill floor stays `FILL_FLOOR`).

- [ ] **Step 1: Failing tests:** `shadeFor(0, true) === SHADE_FLOOR_DUSK`, `shadeFor(10, true) === 1`, `shadeFor(0) === SHADE_FLOOR` unchanged; a `createGorgeLife({ ..., dusk: true })` settled on the floor gives `sun.intensity ≈ base × 0.45`; the Gorge record's `duskLight.sunColor` is warmer than `DUSK.sunColor` (lower g/r); `skyDusk.horizon` has `r > b`; `test/docks.test.js`'s darkest-dusk rule still holds (it compares against other areas; run it).
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.** Header comment in gorgelife.js: one line on the dusk floor.
- [ ] **Step 4: Full suite.** Re-record the guard (`skyDusk`, `duskLight` only). Build green.
- [ ] **Step 5: Commit** `feat(dusk): the Gorge's own dusk — a canyon-sunset sky, an orange rim on the high rock, a shaded floor`.

### Task 5: Cave chambers — rounded walls, stalactites, moss, the Snug nest

**Files:**
- Create: `src/world/caveroom.js`
- Modify: `src/world/gorge.js` (`caveInterior` ~l.540 adds the room mesh)
- Test: `test/caveroom.test.js`, `test/fixtures/gorge-gameplay.json` (re-record: `meshes` +3)

**Interfaces:**
- Consumes from gorge.js (export them if needed): `chamberOf(cave)`, `cavePathDist(cave, x, z)`, `caveFinds(cave)`, `CAVE_PATH_CLEAR`, `CAVE_FIND_CLEAR`, `CAVE_COLORS`; `CHAMBER_HEADROOM` (3.0) from gorgeshape.js; `shapeGround()`/`gorgeGround()` for "is the wall rock here".
- Produces: `export function caveRoom(cave, { clear, rockAt, seed }) -> { geometry: THREE.BufferGeometry (position, normal, color), parts: { liner, stalactites, moss, nest } (triangle counts), stalactiteTips: [{x,y,z}], nest: {x,z,r}|null }` where `clear(x, z, reach) -> boolean` is gorge.js's `caveClear` bound to the cave and `rockAt(x, z) -> boolean` says the chamber wall at that point is rock (not the opening to the bend). gorge.js wraps the geometry in one Mesh named `caveRoom:<id>` with `litMaterial(0xffffff, { vertexColors: true, ...surfaceProps('cobble') })`, `castShadow = false`, `userData.noCast = true`, inside the hidden `caveInterior:<id>` group.
- Constants (export): `COVE_FROM = 2.0` (height above the cave floor where the liner may start leaning inward), `LINER_IN = 0.05` (most a liner vertex below COVE_FROM may stand inward of the wall line), `CORNER_R = 1.1`, `STALACTITE_MIN_Y = 2.0` (tips at least this far above the floor).

Design:
- **Liner**: a band following the chamber's rectangle in plan, but with every corner rounded to radius `CORNER_R` (an arc), split into columns ~0.3 m wide and rows ~0.3 m tall from `cave.y - 0.02` up to `cave.y + CHAMBER_HEADROOM - 0.01`. Above `COVE_FROM` it curves inward as a quarter-round cove reaching 0.7 m in at the ceiling. Seeded value noise displaces each vertex inward only, 0..0.12 m (more on the cove). Skip columns where `rockAt` is false (the opening). Corners: the arc stands inward of the square corner — every liner vertex that stands more than `LINER_IN` inward of the wall line AND is below `COVE_FROM` must pass `clear(x, z, 0)`; where it would not, flatten that vertex back to the wall line (so the corners round only away from the path and finds). Faces point into the room.
- **Stalactites**: 4-9 per chamber (seeded; Echo the most, Snug the fewest), 5-7-sided cones 0.25-0.9 m long hanging from the cove/ceiling within 1.2 m of the walls, tip y ≥ `cave.y + STALACTITE_MIN_Y`, xz kept with `clear(x, z, 0.3)`. Echo: a matching stubby stalagmite at the foot of two of them, only where `clear(x, z, 0.35)`.
- **Moss**: low flat blobs (≤ 0.03 m high) on the floor along the wall feet and a few on the lower liner, `clear(x, z, reach)` for each blob; deep green `0x4f6b3a`..`0x6f8a4a`. Snug the most, Glitter a little, Echo some.
- **Snug nest** (Snug only): a shallow bowl of twig-coloured rings and a moss/fur lining, radius 0.45 m, height ≤ 0.16 m, placed by search from `(20.6, 8.4)` toward the chamber's west half so that `clear(nx, nz, 0.45)` holds and it lies fully inside the chamber; return it as `nest`.
- Liner colour per cave: Echo cool grey-blue `0x6e7682`, Snug warm brown `0x8a7058`, Glitter sandy `0x9a8664`, darker toward the floor and in the noise's recesses (×0.75..1.0).

- [ ] **Step 1: Failing tests** in `test/caveroom.test.js` (build each cave's room via a small helper exported from gorge.js, e.g. `export function caveRoomFor(caveId)`; timeout 120_000):
  - deterministic: two builds give identical position arrays.
  - every vertex lies within the chamber rectangle expanded by 0.01 and with `cave.y - 0.03 ≤ y ≤ cave.y + CHAMBER_HEADROOM`.
  - Review Focus 2: every vertex with `y < cave.y + COVE_FROM` that lies more than `LINER_IN` inside the chamber rectangle's edges is ≥ `CAVE_PATH_CLEAR` from the cave path (`cavePathDist`) and ≥ `CAVE_FIND_CLEAR` from every find in the cave; the nest's disc (+its r) is clear the same way; no vertex in the bend or corridor rects except within 0.01 of the chamber's edge.
  - every stalactite tip y ≥ `cave.y + STALACTITE_MIN_Y`; Echo has more stalactites than Snug; Snug has a nest, the others don't.
  - the liner rounds the corners: for each chamber corner where both walls are rock, some liner vertex at y ≈ cave.y + 2.5 sits ≥ 0.25 m in from the corner along the diagonal.
  - Review Focus 5: after `build(scene)`, each `caveRoom:<id>` mesh's ancestor is `caveInterior:<id>` and that group's `visible === false`; the mesh has `castShadow === false` and `userData.noCast === true`.
  - triangles per room ≤ 5,000.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Full suite** (the existing cave tests in `test/gorge*.test.js` and `test/gorgelife.test.js` must stay green; re-record the guard: `meshes` +3, casters 36). Build green.
- [ ] **Step 5: Commit** `feat(caves): rounded chamber walls with a cove, stalactites, moss and a nest in the Snug Cave`.

### Task 6: Crystal clusters that glow, and three caves that feel different

**Files:**
- Modify: `src/world/caveroom.js` (clusters + glow tint), `src/world/gorge.js` (`CRYSTAL_REACH`/cap, `caveInterior` uses the new clusters instead of `b.caveCrystals`)
- Test: `test/caveroom.test.js`, existing crystal-spot tests in `test/gorge.test.js`

**Interfaces:**
- Consumes: `caveCrystalSpots(cave)` (its reach constant changes), `caveRoom` (Task 5).
- Produces: `export const CLUSTER_SPREAD = 0.32` and `export function crystalClusters(spots, seed, { color, size }) -> THREE.Mesh` in caveroom.js (one mesh, emissive `MeshStandardMaterial`/`litMaterial(color, { emissive: color, emissiveIntensity: 0.9 })`, `noCast`), named `caveCrystals:<id>`; `caveRoom(..., { crystals })` tints liner/floor-moss vertices toward the cave colour within 1.5 m of a cluster (a baked glow, no lights).

Clusters: per spot, 4-7 hexagonal prisms with pointed tips (6-sided, 0.06-0.14 m radius, 0.25-0.75 m tall), leaning out from the wall (along the spot's `nx, nz`) by 10-35°, the tallest in the middle — a cluster, not a sugar cube. Per cave `size`: Glitter 1.3, Echo 1.0, Snug 0.85. Set `CRYSTAL_REACH = CLUSTER_SPREAD + 0.1` in gorge.js so spots keep the whole cluster clear of the path and finds. Glitter keeps its flecks.

- [ ] **Step 1: Failing tests:** every cluster vertex keeps `CAVE_PATH_CLEAR` off the path and `CAVE_FIND_CLEAR` off finds (vertex-level, not just spot-level); each cave keeps ≥ 5 spots (Glitter ≥ 7); cluster heights reach ≥ 0.5 m in every cave; the liner within 1 m of a cluster is measurably tinted toward the cave colour (dot of colour delta with the cave colour direction > 0) and a liner vertex 3 m away is not; `caveCrystals:<id>` is inside its hidden interior group and `noCast`; deterministic.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.** Remove the now-unused `b.caveCrystals` import path from gorge.js (leave builder.js's function in place: other tests may use it; if nothing does, leave it anyway — builder.js is shared).
- [ ] **Step 4: Full suite + build.** Guard re-record only if mesh count changed (it should not: replaced 1-for-1).
- [ ] **Step 5: Commit** `feat(caves): glowing crystal clusters in each cave's colour, with the walls catching their light`.

### Task 7 (controller): live tuning, perf, docs

- Run `snaps-polish-gorgesky/scripts/shots.mjs after <set>` for every set and `perf`; tune the Task 1/3/4 values in place only if a shot shows a problem (re-run that task's tests); build pairs; add a `docs/VISUAL-PASS.md` section with the numbers; commit `docs(polish-gorgesky): live check and numbers`.
