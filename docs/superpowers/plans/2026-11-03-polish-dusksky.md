# polish-dusksky Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a dusk walk magical — stars that twinkle, a crescent moon, lit windows in the Woods' cottages, brighter fireflies — and let the day's clouds slowly change shape, all render-only and cheap on the iPhone.

**Architecture:** A new `src/render/nightsky.js` builds one `THREE.Points` star field (tiny ShaderMaterial, twinkle from a time uniform) and one moon billboard (a canvas-texture plane), both following the camera like the clouds do; the cloud rig (`createClouds`) owns it on dusk walks, so walk.js and main.js need no new lines. The Woods' cottages get a dusk-only child mesh of lit window quads on the horizon band, hidden by day and revealed by `applyDusk`. Clouds get a deterministic new shape each lap of the sky plus a slow billow.

**Tech Stack:** Three.js 0.185, Vite 8, Vitest 4.

**Spec:** scratchpad `polish-survey-4.md`, ranked #2 and "4A-2 polish-dusk-sky"; parent's brief adds "clouds that drift and change across the day" and "the firefly look". Shared rules: scratchpad `polish-common.md` (survey-4 section).

## Global Constraints

- Test command: `npx vitest run --exclude '.claude/**' --exclude '.worktrees/**'`; also `npm run build`.
- Flat trace `test/fixtures/flat-trace.json` stays sha256 `3dfb11a4d847498330c2f1bbc766add06531d4efadaab4c710868df495c1d838`; waterlooks BUILD_DRAWS (woods 11344 etc.) unchanged: anything new inside an area build goes under `withLocalUuids` (src/world/localuuids.js).
- No `Math.random`, no walkRng/strayStream draws in new code; seeds come from `seedFromCode`/`mulberry32` (src/rng.js) or a local integer hash.
- Render-only: no collider, ground, spawn, route or camera change.
- Draw calls: day walks unchanged; dusk walks at most +3 (stars, moon, Woods windows). No new shadow casters (`castShadow = false`, `userData.noCast`).
- Reduced motion: no twinkle, no cloud billow/reshape (time frozen at 0, as clouds already do).
- Files this build owns: src/render/sky.js, src/render/clouds.js, src/render/dusk.js, new src/render/nightsky.js, src/critters.js firefly branch (l.290-300 only), builder.js `addHouse` + the rooftops block + a band child helper. No area files, no walk.js/main.js.
- Commits: explicit `git add <paths>`; message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Long sweeps get explicit timeouts (120_000).

## Review Focus

- The Woods by day must look exactly as before (lit windows hidden; no extra draw by day) — Task 1 test.
- Stars must not show through hills, clouds or the cottages (depth-tested, beyond the clouds, inside the 300 m far plane) — Task 2 test on radius.
- A dusk walk on a tier/area where clouds are off (den) must neither crash nor add stars indoors — Task 2 test.
- Reshaped clouds must never outgrow `cloudReach` (they would poke past the far plane or under the horizon band) — Task 3 test.
- endWalk disposal: stars/moon geometry, material and canvas texture freed by the cloud rig's dispose — Task 2 test.

---

### Task 1: Lit cottage windows in the Woods at dusk

**Files:**
- Modify: `src/world/builder.js` (`addHouse` ~l.1359-1420; rooftops block ~l.2478-2510; a new helper beside `edgeMesh`)
- Modify: `src/render/dusk.js` (`applyDusk` traverse)
- Test: `test/houselights.test.js` (new)

**Interfaces:**
- Produces: a child mesh of the horizon band named `'houseLights'`, `userData = { duskWindow: true, noCast: true, noMerge: true }`, `visible = false`, `frustumCulled = false`, `castShadow = false`; material `MeshBasicMaterial({ color: HOUSE_LIGHT (0xffd27a), fog: false, toneMapped: false })`. `applyDusk` sets `visible = true` on any object with `userData.duskWindow`.

- [ ] **Step 1: Write failing tests** in `test/houselights.test.js` (stub `document` like test/waterlooks.test.js does):
  - `woods band carries one hidden houseLights child`: build woods into a Scene; `band = scene.getObjectByName('horizonBand')`; `lights = band.getObjectByName('houseLights')`; expect defined, `visible === false`, `userData.duskWindow === true`, `userData.noCast === true`, `castShadow === false`, `material.fog === false`, `material.toneMapped === false`, triangle count (`index ? index.count/3 : position.count/3`) between 14 and 14*3*2 (one or more lit quads per cottage, 2 tris each).
  - `every lit window sits just in front of a cottage's dark window quad`: for each lit quad centre there is a band vertex within 0.6 m (sanity that they are on the houses, not floating).
  - `other areas have no houseLights` (neighborhood, river, moor, pines, park, seaside, docks): `scene.getObjectByName('houseLights')` undefined.
  - `applyDusk reveals houseLights`: build woods, call `applyDusk({ scene, sun: new THREE.DirectionalLight(), fill: new THREE.HemisphereLight(), areaData })` → `houseLights.visible === true`.
- [ ] **Step 2: Run** `npx vitest run test/houselights.test.js` → FAIL (no houseLights).
- [ ] **Step 3: Implement.** `addHouse` gains a `lit` array param: for each window it pushes a second `PlaneGeometry(0.62, 0.72)` placed at `front - 0.04` (in front of the dark quad, same rotate/translate path), skipped when `hash01(k, 20 + i, salt + 21) < 0.2` (about four in five windows lit; at least one per cottage — light window 0 regardless). After the rooftops `forEach`, when `lit.length`, merge them and add `houseLightsMesh(geos, rsalt)` to the band, built entirely under `withLocalUuids(\`band-houselights-${rsalt}\`, …)`. The lit geometries are created inside each cottage's existing `withLocalUuids` call. Strip normals/uv not needed (MeshBasic). In `applyDusk`'s traverse add `else if (o.userData?.duskWindow) o.visible = true;`.
- [ ] **Step 4: Run** the new test, `test/waterlooks.test.js`, `test/flattrace.test.js`, `test/dusk.test.js` → PASS (woods draws still 11344, trace unchanged).
- [ ] **Step 5: Commit** `feat(dusk): the Woods' cottages light their windows at dusk`.

### Task 2: Stars and a crescent moon on dusk walks

**Files:**
- Create: `src/render/nightsky.js`
- Modify: `src/render/clouds.js` (`createClouds`: own the night sky on dusk walks)
- Test: `test/nightsky.test.js` (new); extend `test/clouds.test.js` only if needed

**Interfaces:**
- Produces (nightsky.js):
  - `export const STAR_RADIUS = 285; export const MOON_RADIUS = 270; export const STAR_COUNT = 420;`
  - `export function layoutStars(areaId: string, count = STAR_COUNT): { dir: Float32Array(count*3), size: Float32Array(count), bright: Float32Array(count), phase: Float32Array(count) }` — unit directions, seeded by `mulberry32(seedFromCode('stars:' + areaId))`.
  - `export function starFade(elevDeg: number): number` — 0 at ≤ 3°, 1 at ≥ 8°, smoothstep between (stars gone in the horizon glow).
  - `export function moonDirection(yaw: number): THREE.Vector3` — unit vector at elevation `MOON_ELEV_DEG = 11`, bearing `yaw + MOON_OFFSET` (MOON_OFFSET = 0.45 rad, up and to the right of the starting view).
  - `export function createNightSky(scene, { areaId, camera, reducedMotion = false }) : { stars: THREE.Points, moon: THREE.Mesh, update(t: number): void, dispose(): void }`.
- Consumes: clouds.js `createClouds(scene, { …, dusk })` — when `dusk` and the area is in `CLOUD_AREAS` and `camera` is given, it calls `createNightSky` (even if `cloudCount` is 0), its `update(t)` calls `night.update(t)`, its `dispose()` calls `night.dispose()`, and it exposes `night` on the returned rig (null on day walks).

- [ ] **Step 1: Write failing tests** (`test/nightsky.test.js`, document stubbed so a canvas context exists, or null-canvas path handled):
  - `layoutStars is deterministic per area and never touches Math.random` (spy on Math.random: 0 calls; same area twice equal; woods ≠ moor).
  - `stars sit between 3 and 75 degrees up, more of them low where the camera can see`: all elevations in [3, 75]; count with elevation < 30° > half.
  - `starFade`: `starFade(2) === 0`, `starFade(8) === 1`, `starFade(5)` in (0, 1).
  - `star field is one Points, no shadow, no fog, depth-tested but not depth-writing, rendered beyond the clouds and inside the far plane`: `stars.isPoints`, `castShadow false`, `material.depthWrite false`, `material.depthTest true`, `material.fog false`, `STAR_RADIUS > SKY_RADIUS + 30` (clouds.js) and `< 300`; `userData.noCast && userData.noMerge`; `frustumCulled false`.
  - `follows the camera`: camera at (40, 2, -15) → after `update(0)` `stars.position` equals camera position and moon position = camera position + `moonDirection(yaw0) * MOON_RADIUS` (yaw0 read from the camera at creation).
  - `twinkles with time, and holds still under reduced motion`: `stars.material.uniforms.uTime.value` changes after `update(5)`; with `reducedMotion: true` it stays 0.
  - `moon is one plane facing the camera, fog off, no shadow`: `moon.isMesh`, `moon.material.fog false`, after `update(0)` `moon.quaternion` equals `camera.quaternion`.
  - `dispose frees everything`: spies on geometry/material/texture `dispose`, both removed from the scene.
  - clouds rig: `createClouds(scene, { areaId:'woods', tier:{cloudCount:10}, camera, dusk:true })` → `rig.night` non-null and the scene holds an object named `'stars'` and `'moon'`; day → `rig.night === null`, no `'stars'`; den → no-op stub, no stars; `tier.cloudCount 0` with dusk → stars still present.
- [ ] **Step 2: Run** → FAIL (module missing).
- [ ] **Step 3: Implement `nightsky.js`.**
  - Stars: `BufferGeometry` with `position` (= dir × STAR_RADIUS), `aSize`, `aBright` (already × `starFade(elev)`), `aPhase`. Elevation draw: `el = 3 + 72 * u^1.8` degrees; azimuth uniform; `size` 1.4–3.2 px (a few, ~1 in 25, at 3.6–4.2 px as "bright" stars); `bright` 0.55–1 rising with elevation. ShaderMaterial (`transparent`, `depthWrite:false`, `blending: AdditiveBlending`, `fog:false`), uniforms `uTime`, `uPixelRatio` (= `Math.min(globalThis.devicePixelRatio || 1, 2)`). Vertex: `gl_PointSize = aSize * uPixelRatio`; `vA = aBright * (0.72 + 0.28 * sin(uTime * (1.3 + aPhase) + aPhase * 6.283))`. Fragment: soft round dot, `alpha = vA * smoothstep(0.5, 0.1, length(gl_PointCoord - 0.5))`, colour a cool white `vec3(0.92, 0.95, 1.0)`. `name 'stars'`.
  - Moon: 128×128 canvas (null canvas → skip the moon texture and keep only the stars; `moon` then null): radial halo (rgba warm-white 0.35 → 0 over the outer 3× radius) + crescent (full disc in `#fff6d8`, then `destination-out` a disc offset by 0.42 r). `CanvasTexture`, `SRGBColorSpace`. `PlaneGeometry(MOON_SIZE = 44, 44)`, MeshBasicMaterial `{ map, transparent, depthWrite:false, fog:false, toneMapped:false }`, `renderOrder 1`, `name 'moon'`.
  - `yaw0` at creation: from `camera.getWorldDirection` projected on xz (`atan2(dir.x, dir.z)`-style; north fallback if degenerate). `update(t)`: `uTime = reducedMotion ? 0 : t`; stars.position ← camera.position; moon.position ← camera.position + moonDir × MOON_RADIUS; moon.quaternion ← camera.quaternion.
  - Both: `castShadow false`, `frustumCulled false`, `userData { noCast:true, noMerge:true, clouds:true }` (the `clouds` flag keeps rig.js/mergeprops off them).
- [ ] **Step 4: Wire into `createClouds`** as the Interfaces block says; keep `NO_CLOUDS` for den/unknown/no camera.
- [ ] **Step 5: Run** `npx vitest run test/nightsky.test.js test/clouds.test.js test/dusk.test.js` → PASS.
- [ ] **Step 6: Commit** `feat(dusk): stars that twinkle and a crescent moon on dusk walks`.

### Task 3: Clouds that change shape across the day

**Files:**
- Modify: `src/render/clouds.js`
- Test: `test/clouds.test.js` (add a `describe('clouds that change')`)

**Interfaces:**
- Produces: `export function lapOf(cloud, t): number` (integer lap index, `floor((cloud.u0 + cloud.speed*t + half) / (2*half))`, 0 at t = 0); `export function puffAt(cloud, ci: number, j: number, t: number, out?): { x, z, r, yaw }` — at lap 0 and t = 0 exactly the layout puff; later laps re-rolled from a local integer hash of `(areaSeed-independent) ci, j, lap`; then a billow `r *= 1 - BILLOW * sin²(ω_j t)` with `BILLOW = 0.12`, `ω_j` in [2π/110, 2π/60] per puff from the hash.
- Re-roll rule (lap ≥ 1): `x *= 0.8 + 0.2h1`, `z *= 0.7 + 0.3h2`, `r *= 0.72 + 0.28h3`, `yaw = 2π h4` — every factor ≤ 1, so `cloudReach` from the layout still bounds the cloud.

- [ ] **Step 1: Write failing tests:**
  - `puffAt at t=0 is the laid-out puff` (x, z, r, yaw equal for every puff of `layoutClouds('woods', 10)`).
  - `a cloud comes back from its lap as a new shape`: for some cloud, `puffAt` at t in lap 1 vs t + lapDuration (lap 2) differ in r for at least one puff; same `(ci, j, t)` twice → equal.
  - `billows slowly`: r at t=0 vs t=20 differ by < 15% and > 0 for some puff.
  - `never outgrows its reach`: sweep t from 0 to 3 laps (step lap/23) for all clouds of all `CLOUD_AREAS` at 10: `(hypot(x,z)+r)*scale ≤ cloudReach(cloud).horizontal + 1e-9` and `r ≤ layout r` (timeout 120_000).
  - `no Math.random` (spy).
  - Existing `holds still under reduced motion` keeps passing.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `lapOf`, `puffAt` (scratch `out` for the frame loop), and use `puffAt(cloud, ci, j, time, scratch)` inside `update()` in place of the raw puff fields. Comment block in the header ("THE DAY'S CHANGES").
- [ ] **Step 4: Run** `npx vitest run test/clouds.test.js` → PASS.
- [ ] **Step 5: Commit** `feat(clouds): clouds billow and come back each lap as a new shape`.

### Task 4: Fireflies that glow

**Files:**
- Modify: `src/critters.js` (firefly branch, l.290-300 only)
- Test: `test/fireflylook.test.js` (new)

**Interfaces:**
- Produces: a firefly group still has exactly 3 meshes (2 wings + glow, same order — the object count, and so Math.random uuid draws, must not change); wings dark beetle brown `0x4a3a26`; glow = `SphereGeometry(0.05, 6, 5)` (same one geometry object) with `MeshBasicMaterial({ toneMapped:false, fog:true })` whose colour is `setRGB(2.2, 2.4, 0.9)` (above 1 so HIGH's bloom catches it); butterflies unchanged.

- [ ] **Step 1: Write failing test:** build a firefly via `createCritters(scene, [], { spawnFireflies:true, rng: mulberry32(1) })` (or the exported builder if there is one); find a firefly group; meshes count 3; glow material `toneMapped === false`, colour g > 1; wing colour hex `0x4a3a26`; a butterfly's wings still `0xe070b0`. Also count Math.random calls during `createCritters` with fireflies before vs after the change are equal (assert the recorded number from main, written into the test).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** the test and `test/critters*.test.js` → PASS.
- [ ] **Step 5: Commit** `feat(dusk): fireflies glow brighter`.

### Task 5 (parent): live check, numbers, merge main

- After shots with `scratchpad/dusksky/batch.sh after` + Woods desk; pairs; draw/triangle numbers from the perf readout (day and dusk, Woods); flat-trace sha; merge main; full suite + build.
