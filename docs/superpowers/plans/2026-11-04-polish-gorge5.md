# polish-gorge5: arched cave mouths and a lighter Gorge haze — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Gorge's cave mouths (Echo, Snug, Glitter corridors) and CliffClan's camp den stop reading as square boxes cut in the organic sandstone: each gets a rounded, irregular rock arch on the shared rock shader, the camp den gets a rounded rock lining, the tunnels' first metres take the sandstone palette, and the Gorge's day haze is lighter with less smeared walls up close.

**Architecture:** All new rock geometry is pure, seeded geometry built in `src/world/caveroom.js` and APPENDED to the existing `rockFaces` mesh's geometry in `src/world/gorge.js` (new attribute arrays on the same BufferGeometry), so it wears the shared rock shader, costs no new mesh, no new draw call and no Math.random draw. Colours come from the nearest existing rockFaces vertex, so the arches match the strata and talus around them. The haze is the Gorge's day fog distances (gorge.js) and a near-camera tweak in `src/world/rockshade.js`.

**Tech Stack:** Three.js 0.185, Vite 8, Vitest 4.

**Spec:** scratchpad `polish-survey-5.md` ranked #4 and Pass 5 build 5-6; `polish-survey-4.md` ranked #14 (haze) and broken #4; shared rules `polish-common.md` (last section).

## Global Constraints

- Files owned: `src/world/caveroom.js`, `src/world/gorge.js` (not STREAM data / stream look — polish-pondrims owns that), `src/world/rockshade.js`, and their tests. Touch nothing else except `test/budget.test.js` comments and the guard test comment if a pin changes.
- Gorge triangle budget for this build: **≤ 1,500 added** (Gorge ~2.36k under its 60,000 cap, which is not raised). Measure before/after.
- Gorge guard unchanged: **61 meshes, 36 casters**; `test/waterlooks.test.js` BUILD_DRAWS gorge **4488** unchanged; flat trace sha256 **3dfb11a4d847498330c2f1bbc766add06531d4efadaab4c710868df495c1d838** unchanged.
- No Math.random; seeded helpers only (`mulberry32`, `seedFromCode`, `hashOf`-style sin hash or the noise in caveroom.js). Creating a BufferGeometry draws 4 Math.random (uuid) — so no new BufferGeometry/Mesh/Material in `build()` unless under `withLocalUuids` (prefer: new BufferAttribute on the existing rockFaces geometry, which has no uuid).
- Gameplay unchanged: colliders, `gorgeGround()` (walkable ground and ceilings: `test/gorgerock-guard.test.js` pins its sha), cave paths, den seats (camp.js), STAND_ON/CLAN_STAND_ON.
- Nothing new may stand into walkable space low down: below **1.0 m** over the floor a new vertex may stand at most **0.12 m** inside an opening's rectangle (same as `TUNNEL_BUMP_LOW`) and must pass `caveClear` for caves; for the camp den the low rule is `LINER_IN`-style (0.05 m) plus clear of every camp seat (camp.js exports the gorge seats / dressing positions — read only).
- Rock shader stays cheap: still ≤ 3 value-noise calls per fragment, no loops, no textures, no sin in the hash.
- Tests: `npx vitest run --exclude '.claude/**' --exclude '.worktrees/**'`; long geometry tests get explicit timeouts (120_000). Floats compared against fixtures use `closeDiffs`.
- Commits: explicit `git add <paths>`; message ends `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. The cliff face round a mouth is moved by the rock relief (recess up to 0.8 m + 0.7 m corner cut, proud ≤ 0.15 m): an arch built on the flat wall plane would float in front of or sink behind the real face. The arch's outer rim must be seated against the measured face (Task 2 test: every outer-rim vertex sits 0.02–0.06 m behind the measured rockFaces surface along the face normal).
2. The cave camera and chase camera go through the mouth: no arch vertex above 1.0 m may come lower than **1.9 m** over the floor within 0.9 m of the corridor's centre line (the tunnel vault is 2.45–2.58 there), or the camera clips it.
3. When the cave interior (caveRoom:<id> with the tunnel liner) is shown, its end frame at s = 0 must not z-fight the new arch: the arch's reveal must not overlap the liner (test: arch's reveal vertices all lie at s ≤ 0.02 along the corridor, i.e. at or outside the mouth plane).
4. Dusk and rain change the fog: dusk.js sets its own fog (untouched); weather.js scales the area's near/far — the new day distances must still look right in rain (live check only).
5. iPhone: the rock shader patch is shared by every rock mesh; the near-camera tweak must use only `cameraPosition` and existing varyings.

---

### Task 1: Lighter day haze and less smeared walls up close

**Files:**
- Modify: `src/world/gorge.js` (`build()`, right after `b.applySky(...)`)
- Modify: `src/world/rockshade.js` (`ROCK_SHADE`, `COLOUR`, `FLUTES`)
- Test: `test/gorge5.test.js` (new)

**Interfaces:**
- Produces: `export const GORGE_FOG = Object.freeze({ near: 60, far: 175 })` in gorge.js; `ROCK_SHADE.nearLo` / `nearHi` (metres) in rockshade.js.

- [ ] **Step 1: Failing tests** in `test/gorge5.test.js` (use the canvas `document` stub from `test/gorgerock-guard.test.js`):
  - `it('pushes the Gorge day fog out')`: build into a Scene; `expect(scene.fog.near).toBe(60); expect(scene.fog.far).toBe(175)`; and `scene.fog.color.getHex()` still equals `GORGE_SKY.horizon`.
  - `it('fades the flutes and stretches the grain near the camera')`: `ROCK_FRAGMENT` contains `cameraPosition`; count of `vnoise(` calls in `COLOUR + FLUTES` (i.e. `ROCK_FRAGMENT` minus the PARS definition) is ≤ 3; `ROCK_SHADE.nearLo === 1.5`, `ROCK_SHADE.nearHi === 4`.
- [ ] **Step 2:** run `npx vitest run test/gorge5.test.js` → FAIL.
- [ ] **Step 3: Implement.**
  - gorge.js: after `applySky`, set `scene.fog.near = GORGE_FOG.near; scene.fog.far = GORGE_FOG.far;` (mutate, don't construct — no uuid concern either way, but keep it minimal).
  - rockshade.js: add `nearLo: 1.5, nearHi: 4` with a comment. In FLUTES multiply `rtilt` by `mix(0.35, 1.0, smoothstep(nearLo, nearHi, distance(rw, cameraPosition)))` (flutes at 35% right by the camera, full beyond 4 m). In COLOUR, sample the grain anisotropically so near rock reads as layered sandstone, not a vertical smear: `rgp = rw * vec3(grainFreq, grainFreq * 2.4, grainFreq)` (finer up the wall than along it) and raise its amplitude near the camera: `grainAmp * mix(1.35, 1.0, smoothstep(nearLo, nearHi, dist))`. Keep everything branch-free. `cameraPosition` is a built-in fragment uniform in three's prefix. Bump the program cache key to `gorge-rock-v2`.
- [ ] **Step 4:** run the new test, then `test/gorgerock2.test.js test/rockshade*.test.js test/gorge.test.js` (whatever exists) → PASS.
- [ ] **Step 5: Commit** `feat(gorge): lighter day haze; rock flutes calmer and grain layered up close`.

### Task 2: Rounded rock arches at the cave mouths and the camp den

**Files:**
- Modify: `src/world/caveroom.js` (new exported `caveMouth`)
- Modify: `src/world/gorge.js` (new exported `GORGE_MOUTH_ARCHES`, `mouthArchesFor(rockFaces)`, and the append in `build()` after `narrowsDressing`)
- Test: `test/gorge5.test.js`

**Interfaces:**
- Produces in caveroom.js:
  `export function caveMouth({ x, z, y, nx, nz, half, headroom, seed, surface }) -> { pos: number[], idx: number[], parts: { arch, reveal, rim, stones } }`
  - `(x, z)` the mouth's centre on the wall line at floor height `y`; `(nx, nz)` the unit normal OUT of the rock (toward open ground); `half` the opening's half-width; `headroom` its height; `surface(u, h) -> number` the measured offset of the real rock face along `(nx, nz)` from the wall line at lateral `u` (metres along `(-nz, nx)`) and height `h` over `y` (positive = proud).
  - Also export `MOUTH_LOW_H = 1.0`, `MOUTH_LOW_IN = 0.12`, `MOUTH_CAM_H = 1.9`, `MOUTH_CAM_HALF = 0.9`.
- Produces in gorge.js:
  `export const GORGE_MOUTH_ARCHES` — frozen list of `{ id, x, z, y, nx, nz, half, headroom }` for `echo` (x -18, z 23.5, y 0, n (+1,0), half 1.5, headroom 2.6), `snug` (15, 20.2, SNUG_Y, (-1,0), 1.5, 2.6), `glitter` (34, -24.5, CLIFFTOP, (-1,0), 1.5, 2.6), `campDen` (20, 40, WIDE_LEDGE, (-1,0), 3.0, CAMP_DEN_HEADROOM). Derive from GORGE_CAVES / CAMP_DEN records rather than retyping numbers where possible.
  `export function mouthArchesFor(rockFaces) -> { pos: Float32Array, col: Float32Array, nor: Float32Array, tris: number, byId: Record<string, number> }`.

**Shape (the decisions):** In the mouth plane's frame (u lateral, h up, w out along n):
- The arch OUTLINE: jambs straight up at |u| = half − jambIn(h) from the floor to the springline `spring = headroom * 0.5` (camp den 0.45), then a half-ellipse to the crown at `headroom − 0.04`. jambIn is ≤ `MOUTH_LOW_IN` below `MOUTH_LOW_H` and grows to ≤ 0.35 at the springline; for the 3 m corridors the ellipse is narrowed so the arch matches the tunnel liner profile's end (TUNNEL_PROFILE: (1.5, 1.55) (1.35, 2.1) (0.9, 2.45) (0, 2.58)) — sample the outline from that profile for the caves so the liner's end frame and the arch line up. Resample the outline to ~22 points (caves) / ~28 (den), and jitter each inward by seeded value noise 0..0.08 (never outward, never below the low rule).
- FRAME: fills between the outline and the opening's rectangle (|u| = half, h = headroom) on the mouth plane (w = 0), fan from the rectangle corners — this hides the box's square top corners.
- BROW/REVEAL: a second ring the same outline pushed out to w = `brow(h)` (0.05 at the foot, rising to 0.35 at the crown), bumped ±0.06 by noise, plus an outer RIM ring at outline + 0.55 m outward in the plane (beyond the rectangle) seated at `w = surface(u, h) − 0.04` (just behind the real face, so it always meets it). Faces wound outward (toward +n and toward the opening's axis on the reveal). Nothing at w < 0 (inside the mouth plane) — the tunnel liner starts at w = 0.
- STONES: 3 (caves) / 4 (camp den) low lumpy threshold boulders (12-vertex icosahedron, 20 tris each, radius 0.18–0.35, flattened ×0.7, 30% sunk) placed just outside the jambs at |u| in [half − 0.1, half + 0.6], w in [0.1, 0.6] — beside the opening, never in front of its middle third (|u| ≥ half − 0.1), so the walk line stays clear. For the camp den also check the camp's seats/dressing (camp.js read-only data) with a 0.4 m margin.
- Colour: every new vertex takes the colour of the nearest rockFaces shell vertex (search a uniform grid of the rockFaces positions, 1 m bins; only look at vertices within 2 m) times a seeded 0.94–1.04 shade. Normals: `computeVertexNormals` on a scratch geometry is NOT allowed in build() (uuid) — compute area-weighted vertex normals by hand in caveroom.js (`caveMouth` returns `nor` too, or a helper `normalsOf(pos, idx)`).
- `surface(u, h)`: gorge.js implements it by casting a ray along −n from w = +2 at (u, h) against the rockFaces mesh's triangles (only those within a 4 m box round the mouth, prefiltered once) and returning the hit's w (fallback 0 if no hit).
- Append: in `build()`, after `narrowsDressing`, `const arches = mouthArchesFor(rockFaces)`; replace rockFaces' `position`, `color` and `normal` attributes with new `THREE.BufferAttribute`s holding old + new (rockFaces is non-indexed: expand the arches' triangles to non-indexed). `rockFaces.geometry.computeBoundingSphere()` / `computeBoundingBox()` afterwards. Store `rock.userData.mouthArches = arches.byId` (triangles per id).

- [ ] **Step 1: Failing tests** in `test/gorge5.test.js` (timeout 120_000 for builds):
  - `it('adds one rock arch per cave mouth and the camp den, inside the rock mesh')`: build; `rock.userData.mouthArches` has keys `echo, snug, glitter, campDen`, each > 0; total ≤ 1,100.
  - `it('keeps the Gorge guard')`: mesh count 61 and casters 36 (reuse the guard's counting), and `rockMeshes` names unchanged.
  - `it('keeps the low walk clear')`: for each arch from `caveMouth(...)` (flat `surface = () => 0`), every vertex with h < `MOUTH_LOW_H` and |u| < half satisfies `half − |u| ≤ MOUTH_LOW_IN` or w > 0.6 (outside); every vertex with |u| < `MOUTH_CAM_HALF` and h > `MOUTH_LOW_H` has h ≥ `MOUTH_CAM_H`.
  - `it('never reaches inside the mouth plane')`: every vertex has w ≥ −0.05 (only the rim may sit just behind the face).
  - `it('seats the rim on the real face')`: with `surface = (u, h) => -0.4 + 0.1 * u` the rim's vertices have w within [surface − 0.06, surface − 0.02].
  - `it('is deterministic')`: two calls with the same seed give identical arrays; Math.random is not called (spy on it).
  - For caves: the arch's points at |u| = 1.5/1.35/0.9/0 match the tunnel profile heights (1.55, 2.1, 2.45, 2.58) within 0.1 before jitter (test with a `jitter: 0` option).
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: Implement** `caveMouth` in caveroom.js (with the header comment style of the file) and `GORGE_MOUTH_ARCHES` / `mouthArchesFor` / the append in gorge.js.
- [ ] **Step 4:** run `test/gorge5.test.js test/gorgerock-guard.test.js test/waterlooks.test.js test/gorge.test.js test/gorgerock2.test.js test/narrows.test.js test/rig.test.js test/budget.test.js` → PASS (BUILD_DRAWS gorge 4488 unchanged).
- [ ] **Step 5: Commit** `feat(gorge): rounded rock arches at the cave mouths and the camp den`.

### Task 3: The camp den's rounded lining and the tunnels' sandstone first metres

**Files:**
- Modify: `src/world/caveroom.js` (`caveRoom` options; `caveTunnel` mouth colour blend)
- Modify: `src/world/gorge.js` (camp den lining appended to rockFaces with the arches)
- Test: `test/gorge5.test.js`

**Interfaces:**
- Consumes: Task 2's append path (`mouthArchesFor` → extend to also return the den lining, keyed `campDenLining` in `byId`).
- Produces: `caveRoom(cave, { clear, rockAt, seed, crystals, look })` where optional `look = { headroom, colW, rowH, coveRows, stalactites: 0|undefined, floorMoss, wallMoss, color }` overrides the constants (defaults = today's values, so the three chambers are byte-identical: assert it). `caveTunnel(cave, { ..., mouthTint })` where `mouthTint = { color: hex, len: 3.5 }` blends the liner's (and the mouth end frame's) vertex colour from `color` at s = 0 to the cave's own colour at s = len (smoothstep).

**Decisions:**
- Camp den lining: `caveRoom` on a synthetic cave record `{ id: 'campDen', y: WIDE_LEDGE, rects: [{ ...CAMP_DEN, tag: 'campDen-chamber' }] }` with `look = { headroom: CAMP_DEN_HEADROOM, colW: 0.55, rowH: 0.55, coveRows: 3, stalactites: 0, floorMoss: 0, wallMoss: 2 }`, `rockAt` = true except on the west (open) side x = 20, `clear(x, z, reach)` = clear of every camp seat / bedding / fresh-kill spot of the gorge camp (camp.js exported data, read only) by reach + 0.3, and of the den's mouth line. Its vertices are recoloured from the nearest rockFaces vertex like the arches (so it is sandstone, rock-shaded); budget ≤ 450 triangles. The lining's west ends meet the arch's reveal at x = 20 (taper as caveRoom already does beside the opening).
- Tunnel first metres: in `caveTunnelFor`, pass `mouthTint: { color: <the mean colour of the rockFaces vertices within 1.5 m of the mouth — compute in gorge.js; fallback 0xb79f80>, len: 3.5 }`. Chambers untouched.
- [ ] **Step 1: Failing tests:**
  - `it('leaves the three chambers as they were')`: `caveRoomFor(id)` position and colour arrays for echo/snug/glitter equal the values recorded before the change (record a sha256 of the Float32 arrays in the test from main's code before editing; compare sha).
  - `it('lines the camp den with rounded rock')`: `rock.userData.mouthArches.campDenLining` in (0, 450]; every lining vertex below 1.0 m stands ≤ 0.05 m inside CAMP_DEN's rectangle; no lining vertex within 0.3 m of a camp seat.
  - `it('warms the tunnel's first metres')`: `caveTunnelFor('echo')` vertices at s < 0.3 have colour within 0.02 of the mouth tint; at s > 3.5 they equal today's colours.
  - Total arches + lining ≤ 1,500 (budget test).
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** run the Task 2 list again plus `test/caveroom*.test.js test/gorgeclan*.test.js test/camp*.test.js` → PASS.
- [ ] **Step 5:** add the Gorge numbers (before/after triangles, meshes 61, casters 36 unchanged) as a comment row in `test/budget.test.js` next to the gorge row. Commit `feat(gorge): the camp den gets a rounded rock lining; tunnels start in sandstone`.

### Task 4: Live check (parent session, not an implementer)

- Re-shoot `gorge5-tools/shoot.mjs after day|dusk|phone`, build pairs in `snaps-polish-gorge5/pairs/`, run the full suite, `npm run build`, the flat-trace sha.
