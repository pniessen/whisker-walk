# Polish: Weather and Water Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rain that the kids can see is rain, soft wet banks round the Woods/Moor/River/Pines water, murky bogs, and a Seaside shore with a wavy foam strip and no slab corner — without moving a single position in the flat trace.

**Architecture:** Every NEW mesh lives in render-side modules that `src/game/walk.js` creates AFTER the area build (like grass, paw prints and ambient), never inside an area's `build()`. Area files and `render/water.js` only change data, colours and texture contents, so no area build gains or loses a THREE object. Rain stays in `src/weather.js`; water dressing is a new `src/render/waterdress.js`.

**Tech Stack:** Three 0.185, Vite 8, Vitest 4. Plain ES modules.

**Spec:** the parent's brief (survey items #8, #11, #16) plus `polish-common.md` and `polish-survey.md` in the session scratchpad (`/private/tmp/claude-501/-Users-pniessen-CLAUDE-CODE-projects-cat-game/6f2ddd3a-4768-4d57-890f-2d7e74238375/scratchpad/`).

## Global Constraints

- **No area build may create or drop a THREE object** (Object3D, BufferGeometry, Material, Texture). Each one costs four `Math.random` draws for its uuid, and the flat trace (`test/flattrace.test.js`) seeds Math.random before the build, so one extra object in ANY area build moves that area's critters (proven: one extra Mesh in the Woods build gave 20 diffs). The Moor's count is also asserted at 7944. Changing colours, vertex colours, texture *contents*, option values and plain data fields on the returned area object is fine.
- `test/fixtures/flat-trace.json` sha256 stays `6b502ab6b1f9ce328fd6c6b7ce656fd473e50670708fac53985590bc9f0e54a7`. Never re-record it.
- No `Math.random` in new code. Seeded helpers only: `mulberry32`, `seedFromCode` (`src/rng.js`), `hash01`-style hashes. Never draw on `walkRng` or `strayStream`.
- `src/weather.js` `rollWeather` keeps its exact text (the live-shot scripts patch `"const r = rng();\n  if (r < 0.5) return 'clear';"`), and `createWeather` draws exactly as many numbers from `rng` as today (one, in `createRainSchedule`). Rain timing (`stopAt`, `rainbowUntil`) unchanged.
- Water footprints (`waters` records), `WATERS` exports, swim/wade/drink logic, colliders, keep-out, spawn and routes do not change. The water mesh geometry stays the footprint verbatim (`test/water.test.js` "draws that footprint from the declaration").
- Do not edit `src/world/gorge.js`, `src/world/gorgeshape.js`, `rockTerrain` in builder.js, `src/cat/*`, `src/world/camp.js`, `.claude/launch.json`. The dressing does not run on the Gorge.
- Performance: iPhone 18 holds 60 fps on HIGH. New dressing: at most 3 extra draw calls per area for water dressing, 2 for rain (drops + puddle rings), none in the shadow pass (`castShadow = receiveShadow = false`), merged one mesh per material. LOW tier gets fewer rain drops and no stones/reeds dressing.
- Reduced motion: no falling drops, no animated rings, no animated foam (static versions only).
- Tests: `npx vitest run --exclude '.claude/**' --exclude '.worktrees/**'` all green; `npm run build` green. Long geometry sweeps get explicit timeouts (120_000). Float fixtures compare with `closeDiffs` (`test/helpers/closeto.js`).
- Commits: explicit `git add <paths>`; every message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Cosy, not a storm. No copy changes are planned; any word the kids read is short, warm and plain.

## Review Focus

1. **Rain ending mid-walk or the walk ending mid-rain** — the ground must come back dry and the shared materials unmutated for the next walk (Task 1 test: `dispose()` during rain restores colours/roughness).
2. **A bank band or reed drawn across a bridge, stepping stones or open water where two footprints meet** — dressing follows real shore only (`realShoreOf`) and keeps 1.5 m off decks (Task 3 tests).
3. **The Seaside on a phone at 390 wide** — the foam strip and no slab corner must hold from the start spot and from the pier (Task 5 live check).
4. **LOW tier and reduced motion** — fewer drops, no stones/reeds, nothing animated; the pages still read as rain/water (Tasks 1, 3 tests).
5. **A rainy walk on the Gorge** — rain and wet ground run there (non-flat ground: `ground.y`), water dressing does not (Task 1/3 tests).

---

### Task 1: Rain that reads

**Files:**
- Modify: `src/weather.js` (rain branch of `createWeather`; add helpers)
- Modify: `src/game/walk.js` (pass `{ tier, fill, wetMeshes }` to `createWeather`; call `weather.dispose()` in endWalk)
- Modify: `src/world/builder.js` `ground()` only: one line `m.userData.ground = true;` (no new object). Paths: reuse whatever tag `path()` already sets.
- Test: `test/weather.test.js` (add cases)

**Interfaces:**
- Produces: `createWeather(scene, sun, condition, rng, reducedMotion = false, ground = FLAT_GROUND, opts = {})` where `opts = { tier, fill, wet: Mesh[], puddles: {x,z,r,y}[] }`; all optional, so existing callers/tests still work. Returned api gains `dispose()` (no-op for clear/sunset). Export `RAIN_LOOK` (frozen constants) and `rainDropCount(tier)`.

- [ ] **Step 1: Write failing tests** in `test/weather.test.js`:
  - `createWeather(... 'rain', countingRng ...)` draws exactly 1 number from `rng` (same as today), with and without `opts`.
  - `Math.random` is never called during `createWeather` or 100 `update()` calls (spy that throws).
  - Two rain weathers built with the same args have byte-identical drop position arrays (seeded `mulberry32(seedFromCode('rain-drops'))`).
  - `rainDropCount({ name: 'low' }) < rainDropCount({ name: 'high' })`; high ≤ 1200.
  - The drop mesh is not `THREE.Points` (streaks): it is a Mesh/LineSegments whose geometry has ≥ 2 vertices per drop with a vertical extent per drop of 0.3–0.7 m; `castShadow === false`.
  - Density near the camera: more than half the drops lie within 40% of the column radius.
  - Reduced motion: no drop mesh is added to the scene; the sky/fog/sun change still happens.
  - Wet ground: given `opts.wet = [mesh]`, during rain that mesh's `material.color` is darker (each channel ≤ 0.8× original) and roughness lower; after the schedule reaches 'rainbow' and after `dispose()` mid-rain, colour and roughness equal the originals exactly; the original material object is never mutated if it is shared (clone it per walk, or restore — test asserts the ORIGINAL material's colour is unchanged after dispose).
  - Fog: rain fog colour is greyer than today (`0x8a9aa8` saturation or lower) and `fog.near ≤ 16`; `sun.intensity ≤ 0.95`; `opts.fill.intensity` scaled to ≤ 0.85× during rain and restored at rainbow/dispose.
  - Puddle rings: with `opts.puddles` of 3, one InstancedMesh of rings is added (count ≤ 3 × 3 on high); absent under reduced motion; hidden at rainbow.
  - Existing weather tests (rainbow placement, sheltered, puddle spots) stay green.
- [ ] **Step 2: Run** `npx vitest run test/weather.test.js` — new cases FAIL.
- [ ] **Step 3: Implement.** Drops: one merged mesh of thin vertical quads (≈0.012–0.02 m wide, 0.35–0.6 m long, slight wind slant), MeshBasicMaterial pale blue-grey, transparent, opacity ~0.45, `depthWrite: false`, `fog: true`; the mesh follows the camera x/z (and `ground.y` as today) and its `rotation.y` faces the camera's yaw so the quads face the viewer. Per-frame: move y down ~14–18 m/s and wrap, as today. Radius distribution biased to the centre (e.g. `r = R * u^1.6`, R ≈ 22). Counts: high ~900, low ~400. Sky/fog/light: greyer gradient (e.g. top `0x7d868f`, horizon `0x969ea5`, fog same horizon, near 14, far 75), sun ~0.9, fill × 0.8. Wet: colour × ~0.72, roughness × 0.6 (floor 0.35). Rings: RingGeometry InstancedMesh at each puddle (`y + 0.03`), each instance grows 0.05→0.45 m over ~0.9 s on staggered seeded phases, fading via `instanceColor` toward the puddle colour; skipped under reduced motion; LOW gets 1 ring per puddle. Everything rain-only reverts at 'rainbow' exactly as background/fog do today. In walk.js: collect `wet` meshes from `scene.children` tagged `userData.ground` or the existing path tag, pass `fill`, `tier` and `areaData.puddles` AFTER the rain puddles are pushed (create rings after `areaData.puddles` is extended — e.g. via a `weather.addPuddles(list)` call — without changing any `walkRng` draw order).
- [ ] **Step 4: Run** `npx vitest run test/weather.test.js test/flattrace.test.js` — PASS.
- [ ] **Step 5: Commit** `feat(weather): rain reads — streaks, grey sky, wet ground, puddle rings`.

### Task 2: Water surface looks (no new objects)

**Files:**
- Modify: `src/render/water.js` (`createWater` options and handle; ramp)
- Modify: `WATER_LOOK` tables in `src/world/pines.js`, `src/world/woods.js`, `src/world/moor.js`, `src/world/river.js` (option values only)
- Test: `test/waterfx.test.js` or new `test/waterlooks.test.js`

**Interfaces:**
- Produces: `createWater` accepts `style: 'clear' | 'bog' | 'sea'` (default `'clear'`; seaside's existing call becomes `'sea'` in Task 4) and returns the handle with added read-only fields `footprint` (the record incl. `shores`), `y`, `color`, `style`, `waters` (the list passed). `waterRamp(base, style)` — for `'bog'` the deep end keeps ≥ 80% of the authored lightness and the foam end is a dull green-brown (lightness ≤ 0.45, never white).

- [ ] **Step 1: Failing tests:** handle exposes `footprint`, `y`, `style`; bog ramp: deep lightness ≥ 0.8 × authored and foam lightness ≤ 0.45; bog colour on all four Pines bogs is a murky green-brown (hue 0.12–0.25, HSL lightness 0.2–0.35); each area's build creates the same number of THREE objects as on main (count `Math.random` calls during `build(new Scene())` for woods, moor, river, pines, seaside, gorge and assert equal to a constant measured on main before your change — Moor must be 7944).
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.** Bog: pick a murky green-brown (e.g. `0x4f5a33`), `style: 'bog'`, foamStrength ≈ 0.25. Woods/Moor/River/Pines lakes and streams: lower the ramp's own foam band (`foamStrength` ≈ 0.2–0.25) because Task 3's wobbling foam line replaces the straight one. No geometry change.
- [ ] **Step 4: Run** `npx vitest run test/water*.test.js test/pines.test.js test/flattrace.test.js` — PASS.
- [ ] **Step 5: Commit** `feat(water): murky bogs, softer ramp foam, handles describe their water`.

### Task 3: Water dressing — wet banks, foam line, stones, reeds, lily pads

**Files:**
- Create: `src/render/waterdress.js`
- Modify: `src/game/walk.js` (create after the grass/paws/splash block; `update(dt)` in the render loop next to `session.water.update(dt)` in `src/main.js`; dispose in endWalk)
- Test: `test/waterdress.test.js`

**Interfaces:**
- Consumes: Task 2's handle fields; `realShoreOf`, `shoreDepth`, `waterBox` from water.js.
- Produces: `createWaterDressing(scene, { areaId, areaData, tier, reducedMotion }) → { meshes: Mesh[], update(dt), dispose() }`. `DRESSED_AREAS = ['woods', 'river', 'moor', 'pines', 'seaside']`; any other area (park, docks, gorge, den, neighbourhood) returns a no-op stub with `meshes: []`. Exported pure helper `bankWobble(seed, s) → metres` (−0.3..+0.1, smooth along shore length `s`).

- [ ] **Step 1: Failing tests** (build each real area into a fresh Scene, then call `createWaterDressing`):
  - Stub for park, docks, gorge; no objects added.
  - Deterministic: two calls give identical position arrays; no `Math.random` (spy throws).
  - At most 3 meshes added per area; all `castShadow`/`receiveShadow` false; every mesh is a direct scene child.
  - Bank band follows real shore only: no band vertex lies more than 0.35 m inside water that is ≥ 1.0 m from a real shore (sample with `shoreDepth`/`realShoreOf`), so nothing paints across open water where footprints overlap; for the seaside only the `minX` shore is dressed.
  - Stones and reeds: every item centre is on land (`inWater` false with decks removed), within 1.5 m of a real shore, ≥ 1.5 m from every deck rect, and outside every collider circle. LOW tier: no stones/reeds mesh.
  - Bogs (Pines `bog-*`): lily pads lie inside the bog footprint, ≥ 0.4 m from its edge; 3–5 per bog.
  - Triangle count per area ≤ 12,000 (report actual numbers in the commit message).
  - Reduced motion: `update()` changes nothing.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.** One merged transparent mesh (vertex colours + vertex alpha, `depthWrite: false`, `polygonOffset`) holding: the wet-bank band (from ~0.3 m over the water — a wobbling lip that hides the straight edge — to 0.9–1.4 m onto land, dark wet earth fading to alpha 0) and a thin soft foam line along the wobbling lip (pale, alpha ~0.5). Lip height just above the water's `y` (+0.004), land side at ground + 0.012. Circles (bogs) get a full ring; bog foam is dull green-brown, not white. One stones mesh (low-poly dodecahedra, grey-brown, seeded size/rotation, ~1 per 4 m of shore, sitting half sunk). One reeds/lily mesh where needed (Pines bog reeds plus lily pads; Woods/Moor/River already have reed beds — add only a few short reed tufts at the lip, or none if the existing beds read). Seeds: `seedFromCode(\`waterdress-${areaId}-${w.id}\`)`. Foam line animation: a slow opacity breathe only (skip under reduced motion).
- [ ] **Step 4: Run** `npx vitest run test/waterdress.test.js test/flattrace.test.js test/water*.test.js` — PASS.
- [ ] **Step 5: Commit** `feat(waterdress): wet banks, soft foam line, stones and lily pads along the water`.

### Task 4: Seaside shoreline

**Files:**
- Modify: `src/render/waterdress.js` (`'sea'` style: wavy foam strip along `minX`), `src/world/seaside.js` (call `createWater` with `style: 'sea'`; wet-sand vertex-colour values only — no new objects), `src/render/ambient.js` (seaside spray puffs: replace the round fuzzy balls — retire them or make them small, flat and faint; keep `ambient.test.js` honest by updating its seaside expectations only if the behaviour deliberately changed)
- Test: `test/waterdress.test.js`, `test/seaside-visuals.test.js`

**Interfaces:**
- Consumes: Task 3's module.
- Produces: no new exports beyond Task 3's.

- [ ] **Step 1: Failing tests:** the sea gets one foam-strip mesh whose wavy waterline edge varies by ≥ 0.4 m in x along z; strip covers z across the walkable bounds plus 30 m; no foam/band vertex beyond x 28 (it stays at the shore); wet sand darker than today at the waterline (`wetness` / WET_TINT checks); the slab corner: the dressing (or a far-sea apron mesh in waterdress, render-side, below the sea's y) extends the visible sea past z ±70 so the shore edge has no end inside the fog far distance (assert apron covers z −200..200 east of the shore line, and its y < sea y).
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.** Foam strip: a band ~1.2 m wide along x ≈ 25 with a two-sine wavy edge (like `wetness`), white-ish alpha foam fading both sides, slow uv/vertex-colour drift (none under reduced motion). Apron: deep-sea colour plane under the fog, render-side only. Check the beach ground also continues past z ±70 (if the visible "wedge" is the ground plane's end, extend with a render-side sand apron too). Confirm against `w-seaside-day-desk-00-start` and `-01-start-back` in the live check.
- [ ] **Step 4: Run** `npx vitest run test/seaside*.test.js test/waterdress.test.js test/ambient.test.js test/flattrace.test.js` — PASS.
- [ ] **Step 5: Commit** `feat(seaside): wavy foam strip, darker wet sand, no slab corner`.

### Task 5: Live check, numbers, full suite (controller)

- [ ] Full suite + `npm run build` green; flat-trace sha256 unchanged.
- [ ] AFTER shots from the same spots as BEFORE (Woods rain + day at start and at the lake, Moor stream, Pines bog, Seaside shore, one phone 390-wide shot), pairs in `snaps-polish-water/pairs/`.
- [ ] Draw calls and triangles before/after per area (perf readout).
