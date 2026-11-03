# polish-weatherlight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rain streaks never become white planks near the camera, water glare never blows out to white, and dusk lawns stop going neon.

**Architecture:** Three render-only changes. (1) The rain mesh's MeshBasicMaterial gets an `onBeforeCompile` patch: each streak fades out near the camera and its half-width is capped to a fixed angle, so a near streak is never wider than ~3 px. (2) The water material gets an `onBeforeCompile` patch that clamps the specular terms after `lights_fragment_end`, so the glint stays a sparkle but never passes white. (3) `render/dusk.js` gains a tint, applied in place the way rain's `grassTint` is, to the grass blades and (through per-walk clones) the ground meshes: darker, cooler and less saturated, put back exactly at walk end.

**Tech Stack:** Three 0.185, Vite 8, Vitest 4.

**Spec:** scratchpad/polish-survey-2.md — Build A2 (broken #2, polish #7, #9); shared rules in scratchpad/polish-common.md.

## Global Constraints

- No Math.random and no walkRng/strayStream draws added. `test/weather.test.js` "never touches Math.random" and "draws exactly one number from rng" must stay green.
- flat-trace.json stays sha256 6b502ab6b1f9ce328fd6c6b7ce656fd473e50670708fac53985590bc9f0e54a7; waterlooks BUILD_DRAWS unchanged (nothing here runs in an area's build()).
- Draw calls unchanged: no new meshes; the rain stays one mesh, the water one mesh per body.
- Shader patches set `customProgramCacheKey` so three never shares the patched program with a plain material.
- Tests: `npx vitest run --exclude '.claude/**' --exclude '.worktrees/**'`; `npm run build`. Long sweeps get explicit timeouts. Commit with explicit `git add <paths>`, message ending `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Files owned: src/weather.js, src/render/water.js, src/render/dusk.js, src/render/grass.js. walk.js: only the few lines that call the dusk tint and dispose it (flag in report).

## Review Focus

1. Reduced motion: no rain mesh is built, so the rain patch must not assume one exists.
2. A dusk walk that ends (any way) must hand the ground meshes their original materials back, and dispose the clones once — endWalk's traversal disposes whatever material sits on a mesh.
3. Rain dispose mid-rain must still dispose the patched material (no leak, no throw).
4. Low tier water (no normal map) gets the same clamp; the sea (GLARE_SEA) gets it too.
5. A shader chunk renamed in a three upgrade would silently disable a patch: each test asserts the anchor chunk string exists in `THREE.ShaderChunk`/`THREE.ShaderLib` source.

---

### Task 1: Rain streaks fade near the camera and cap their width

**Files:**
- Modify: `src/weather.js` (RAIN_LOOK; buildDrops)
- Test: `test/weather.test.js` (new describe "rain near the camera")

**Interfaces:**
- Produces: `RAIN_LOOK.nearFadeStart = 1.2`, `RAIN_LOOK.nearFadeEnd = 2.4` (metres from the camera), `RAIN_LOOK.maxHalfAngle = 0.0025` (radians; half-width cap = dist × this). Exported pure `streakShape(dist, halfWidth) -> { halfWidth, alpha }` mirroring the shader: `alpha = smoothstep(nearFadeStart, nearFadeEnd, dist)`, `halfWidth = min(halfWidth, dist * maxHalfAngle)`.

- [ ] **Step 1: Failing tests**
  - `streakShape(0.3, 0.01).alpha === 0`; `streakShape(5, 0.01).alpha === 1`; alpha monotonic over 0..5 m.
  - `streakShape(0.5, 0.01).halfWidth <= 0.5 * RAIN_LOOK.maxHalfAngle`; `streakShape(20, 0.006).halfWidth === 0.006`.
  - The rain mesh's geometry has an `aSide` attribute (itemSize 1, values ±1 per quad: left verts −1, right +1) and an `aHalf` attribute (the drop's half-width, same on all four verts).
  - The material has `onBeforeCompile` and a `customProgramCacheKey()` of `'whisker-rain'`; running `onBeforeCompile` on `{ vertexShader: THREE.ShaderLib.basic.vertexShader, fragmentShader: THREE.ShaderLib.basic.fragmentShader, uniforms: {} }` changes both shaders (the anchors exist) and the vertex shader then contains `aSide` and the fragment shader `vRainNear`.
- [ ] **Step 2: Run, see them fail.** `npx vitest run test/weather.test.js`
- [ ] **Step 3: Implement.** In buildDrops add the two attributes (writeDrop keeps writing positions as today). Patch the material: vertex — after `#include <begin_vertex>`, centre = `transformed - vec3(aSide*aHalf,0,0)`; `dist = length((modelViewMatrix*vec4(centre,1.0)).xyz)`; `transformed.x = centre.x + aSide*min(aHalf, dist*uMaxHalf)`; `vRainNear = smoothstep(uNear0, uNear1, dist)`. Fragment — after `#include <color_fragment>` (or wherever `diffuseColor` is final, before `opaque_fragment`), `diffuseColor.a *= vRainNear;`. Uniforms from RAIN_LOOK. Comment why (planks, survey-2 broken #2).
- [ ] **Step 4: Run tests pass** (whole weather.test.js, incl. Math.random and rng-count tests).
- [ ] **Step 5: Commit** `fix(rain): streaks fade near the camera and never grow wider than ~3 px`

### Task 2: Water glare clamps below white

**Files:**
- Modify: `src/render/water.js` (createWater material; WATER_TUNING)
- Test: `test/waterglare.test.js`

**Interfaces:**
- Produces: `WATER_TUNING.SPEC_CAP = 0.55` (linear, per channel, applied to direct + indirect specular) and option `specCap` on createWater (default SPEC_CAP). Value is a starting point; the controller tunes it live and edits the constant.

- [ ] **Step 1: Failing tests**
  - For quality high and low and for the sea (glare GLARE_SEA): `material.onBeforeCompile` is a function, `material.customProgramCacheKey()` is `'whisker-water'`, and applying it to `{ fragmentShader: THREE.ShaderLib.physical.fragmentShader, vertexShader: THREE.ShaderLib.physical.vertexShader, uniforms: {} }` yields a fragment shader containing `uSpecCap` placed after `#include <lights_fragment_end>`, and `shader.uniforms.uSpecCap.value === WATER_TUNING.SPEC_CAP`.
  - `0.3 <= SPEC_CAP <= 0.9`; `createWater(POND, { specCap: 0.4 })` puts 0.4 in the uniform.
  - Existing GLARE tests stay as they are.
- [ ] **Step 2: Run, see them fail.** `npx vitest run test/waterglare.test.js test/water.test.js`
- [ ] **Step 3: Implement.** After `#include <lights_fragment_end>` add `reflectedLight.directSpecular = min(reflectedLight.directSpecular, vec3(uSpecCap)); reflectedLight.indirectSpecular = min(reflectedLight.indirectSpecular, vec3(uSpecCap));`. Update the header note that said "no shader injection" to explain this one small, tested patch.
- [ ] **Step 4: Run** all `test/water*.test.js` — pass.
- [ ] **Step 5: Commit** `fix(water): the glint stays a sparkle — specular clamped below white`

### Task 3: Dusk grass and ground darker and cooler

**Files:**
- Modify: `src/render/dusk.js`, `src/game/walk.js` (call + dispose lines only)
- Test: `test/dusk.test.js`

**Interfaces:**
- Produces in dusk.js:
  - `DUSK.lawnTint = { desat: 0.35, dark: 0.78, cool: [0.94, 0.98, 1.1] }` (starting values; tuned live).
  - `duskLawnColor(color: THREE.Color, look) -> THREE.Color` (new Color): `c = lerp(color, luminance(color) grey, desat) * dark * cool` per channel.
  - `tintDuskLawn({ ground: Mesh[], grass: Material|null, look }) -> { dispose() }`. Ground: each mesh with a single material that has `.color` gets a clone with `color = duskLawnColor(orig.color)`; original never written. Grass material: tinted in place (it is per-walk and patched with onBeforeCompile; must not be cloned), colour saved. `dispose()` is idempotent: puts originals back (only if the mesh still wears the clone), disposes clones, restores the grass colour exactly.
- walk.js: in the dusk branch (where `duskLookNow` is set), after createGrass: `const duskLawn = duskLookNow ? tintDuskLawn({ ground: <same filter rain's wet uses: top-level meshes with userData.ground || name==='path'>, grass: grass.mesh?.material ?? null, look: duskLookNow }) : { dispose() {} }`, store on the session, and call `session.duskLawn.dispose()` in endWalk next to `session.weather.dispose?.()` (before the traversal). Capture the ground list before anything else is added, as rain does (same place the wet list is built is fine; it must not include grass).

- [ ] **Step 1: Failing tests**
  - `duskLawnColor(new Color(0.3,0.6,0.2), duskLook({}))`: darker (each channel ≤ input ×1.0 except blue may rise slightly), saturation (max−min) smaller than input's, and b/g ratio higher than input's.
  - tintDuskLawn: ground mesh wears a clone with the tinted colour, the original material's colour is unchanged byte for byte; grass colour tinted in place; after `dispose()` the mesh wears the original, the clone's `dispose` was called once, grass colour equals the saved one exactly; a second `dispose()` is a no-op.
  - Mesh with an array material or no `.color` is skipped.
  - `duskLook({ duskLight: { lawnTint: {...} } })` override reaches the tint.
  - A source test: walk.js calls `tintDuskLawn(` and `duskLawn.dispose()`.
- [ ] **Step 2: Run, see them fail.** `npx vitest run test/dusk.test.js`
- [ ] **Step 3: Implement** as above.
- [ ] **Step 4: Run** dusk, grass, weather, flattrace tests — pass.
- [ ] **Step 5: Commit** `fix(dusk): lawns and grass go darker and cooler at dusk instead of neon`

### Task 4 (controller): live tune + full suite

- Live AFTER shots from the same spots as BEFORE (rain: pines, river, neighborhood, gorge + pines phone; glare: woods day, seaside day, island; dusk: woods, park, moor + woods phone). Tune RAIN_LOOK near-fade/cap, SPEC_CAP, lawnTint by eye; commit tuning separately.
- Full suite, build, flat-trace hash, draw calls from the perf readout before/after.
