# polish-light Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A sunset walk lights the ground like a sunset (warm, low, long light), dusk lamps glow and throw soft pools of light, and puddles read as wet, reflective, soft-edged water instead of pale paper discs.

**Architecture:** Three render-only changes. (1) `weather.js`'s sunset branch also lowers the sun (same azimuth), warms the hemisphere fill, dims the image light a little and tints the ground, paths, horizon band and grass toward amber through `render/dusk.js`'s existing `tintDuskLawn` / `duskLawnColor` (per-walk clones, put back on `dispose()`). (2) `builder.lampPost` tags its globe; `applyDusk` swaps the globe to a strong warm emissive; a new `createLampPools(scene)` in `render/dusk.js` builds ONE merged additive, noCast disc mesh under every lamp, added from walk.js after the build (beside the water dressing), so BUILD_DRAWS pins hold. (3) `builder.puddle` keeps its one 12-segment CircleGeometry and one material, and gets an `onBeforeCompile` patch: darker centre, a sky-sheen rim, a fixed glint and an alpha fade to 0 inside the 12-gon, so the polygon edge never shows.

**Tech Stack:** Three 0.185, Vite 8, Vitest 4.

**Spec:** scratchpad/polish-survey-3.md — Build B3 (polish #6, #7, #13); shared rules in scratchpad/polish-common.md (survey-3 section).

## Global Constraints

- No Math.random and no walkRng/strayStream draws added; `test/weather.test.js` rng-draw tests stay green.
- waterlooks BUILD_DRAWS unchanged: inside any build() the puddle stays exactly one Mesh + one geometry + one material (no texture), and lampPost adds no object. Lamp pools are created in walk.js after the build.
- flat-trace.json stays sha256 d2657f022d09b1d6507af42e30ce9666bfea29b3e52c2add1c218399a53a72f0.
- Triangles: puddles stay 12 segments (River/Moor have ~105/239 triangles left under the 60k cap, and pools are not in the build).
- Draws: puddles unchanged; +1 main-pass draw at dusk in an area that has lamps (pools), 0 shadow draws.
- Shader patches set `customProgramCacheKey`.
- Files owned: src/weather.js (sunset branch), src/render/dusk.js, `lampPost` and `puddle` in src/world/builder.js, one lamp-pool block in src/game/walk.js. polish-viewclear2 adds a one-line `userData.occluder` on the lampPost pole: keep the pole a separate, recognisable mesh.
- Tests: `npx vitest run --exclude '.claude/**' --exclude '.worktrees/**'`; `npm run build`. Long sweeps get explicit timeouts. Commits: explicit `git add <paths>`; message ends `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Sunset dispose: ground meshes get their original materials back; the grass colour comes back to the bit; nothing is disposed twice.
2. Shadowfit reads the sun's direction once, at creation (after createWeather) — the lowered sun must be set inside createWeather, and its azimuth must be unchanged.
3. Lamp pools never enter the contact-shadow scan, the caster sweep or the prop merge (created after all three), cast nothing, and are disposed by endWalk's traversal.
4. Puddle shader: alpha 0 at d >= 0.95 so the 12-gon outline is invisible; depthWrite off; the patch anchors exist in THREE.ShaderChunk.

---

### Task 1: Puddles look wet

**Files:**
- Modify: `src/world/builder.js` (`puddle`, ~l.2485)
- Test: `test/builder.test.js` (extend the puddle test)

**Interfaces:**
- Exports `PUDDLE_LOOK = Object.freeze({ color: 0x5a7890, centreDark: 0.6, rimLight: 1.15, fadeStart: 0.72, fadeEnd: 0.94, alpha: 0.9, glint: 0.55 })` and a pure `puddleShade(d) -> { k, alpha }` mirroring the shader (`k` = colour multiplier, `alpha` = opacity at normalised radius `d`).
- `puddle(x, z, r, y)` still returns a Mesh with `geometry.type === 'CircleGeometry'` (12 segments), material roughness = `surfaceProps('water').roughness`, plus `transparent: true`, `depthWrite: false`, `userData.puddle = true`, `material.customProgramCacheKey() === 'puddle-v1'`.

- [ ] Step 1: Tests first: `puddleShade(0).k ≈ centreDark`, `puddleShade(0.85).k > puddleShade(0).k`, `puddleShade(0.96).alpha === 0`, `puddleShade(0.3).alpha ≈ alpha`; the mesh keeps CircleGeometry with 12 segments, is transparent with depthWrite false; `onBeforeCompile` on a fake shader `{ vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {} }` replaces the anchors (`#include <begin_vertex>`, `#include <color_fragment>`, `#include <emissivemap_fragment>`) and adds `uPuddleR`.
- [ ] Step 2: Implement: vertex varying `vPud = position.xy / uPuddleR` (CircleGeometry lies in local XY); fragment after `color_fragment`: `float d = length(vPud);` colour `*= mix(centreDark, rimLight, smoothstep(0.0, 0.85, d))`, `diffuseColor.a *= alpha * (1.0 - smoothstep(fadeStart, fadeEnd, d))`; after `emissivemap_fragment`: `totalEmissiveRadiance += vec3(glint) * (1.0 - smoothstep(0.0, 0.22, length((vPud - vec2(-0.32, 0.28)) * vec2(1.0, 2.2))))` (a soft oval glint). Material from `surfMat(PUDDLE_LOOK.color, 'water')` then set transparent/depthWrite/polygonOffset(-1,-1) — still one material object.
- [ ] Step 3: Run builder + waterlooks + contactshadows + pawprints + weather tests; commit.

### Task 2: Sunset lights the ground

**Files:**
- Modify: `src/weather.js` (sunset branch only, plus a `SUNSET_LOOK` constant)
- Test: `test/weather.test.js` (new describe "sunset light")

**Interfaces:**
- Exports `SUNSET_LOOK = Object.freeze({ sunColor: 0xffa860, sunIntensity: 2.0, elevationDeg: 10, hemiSky: 0xffc89a, hemiGround: 0x8a6a48, hemiScale: 0.85, envScale: 0.7, lawnTint: Object.freeze({ desat: 0.12, dark: 0.9, cool: Object.freeze([1.1, 0.97, 0.8]) }) })` — `cool` here is a per-channel warm multiplier (dusk.js's key name).
- createWeather(scene, sun, 'sunset', rng, rm, ground, opts): keeps the sky/fog lines; sets sun colour/intensity; when `ground` is FLAT_GROUND (every map but the Gorge) moves `sun.position` to the same azimuth (relative to `sun.target.position`) at `elevationDeg`, same distance; `opts.fill` → colour hemiSky, groundColor = its own groundColor lerped 0.5 toward hemiGround, intensity × hemiScale; `scene.environmentIntensity *= envScale`; ground tint via `tintDuskLawn({ ground: [...opts.wet, ...scene.children named 'horizonBand' not already in wet], grass: null, look: { lawnTint } })`; `api.tintWet(material)` on sunset tints a material's colour in place with `duskLawnColor` (once per material) and `dispose()` restores it, then disposes the lawn tint, fill, env (idempotent).
- [ ] Step 1: Tests: sun elevation after = 10° ±0.5 and azimuth unchanged; Gorge-like ground (non-FLAT_GROUND object) keeps the sun position; fill colour/intensity change and come back on dispose; a wet mesh gets a clone whose colour is warmer (r/b ratio up) and gets the original back on dispose; tintWet on sunset changes a colour and dispose restores it exactly; dispose twice is safe; still draws exactly one rng number / never Math.random (existing tests).
- [ ] Step 2: Implement. Step 3: run weather, clouds, sky, ambient, dogs tests; commit.

### Task 3: Dusk lamps glow and pool light

**Files:**
- Modify: `src/world/builder.js` (`lampPost` only: `lamp.userData.lampGlobe = true; lamp.userData.noMerge = true;` — no new objects)
- Modify: `src/render/dusk.js` (applyDusk globe swap; `LAMP_LOOK`; `createLampPools`)
- Modify: `src/game/walk.js` (one block after `createWaterDressing`)
- Test: `test/dusk.test.js` (or the existing dusk test file)

**Interfaces:**
- `LAMP_LOOK = Object.freeze({ globe: 0xfff0c8, emissive: 0xffc870, emissiveIntensity: 2.4, poolColor: 0xffb860, poolRadius: 3.4, poolStrength: 0.55, poolSegments: 20, poolLift: 0.035 })`.
- applyDusk: every `userData.lampGlobe` mesh gets `litMaterial(LAMP_LOOK.globe, { emissive, emissiveIntensity })` (old material disposed, like windows).
- `createLampPools(scene) -> Mesh | null`: lamps found via `userData.lampGlobeY` (render/ambient.js's `findLamps` rule; ground y = group world y). One BufferGeometry: per lamp a fan of `poolSegments` triangles, centre colour `poolColor × poolStrength`, rim black, smoothstep-ish falloff via an extra ring at 0.5 radius (strength × 0.45). `MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2 })`; name 'lampPools', userData `{ noCast: true, dressing: true }`, castShadow/receiveShadow false; `scene.add`; returns null when there are no lamps.
- walk.js: `if (duskLookNow && !isDen) createLampPools(scene);` placed right after the water dressing (endWalk's scene traversal disposes it).
- [ ] Step 1: Tests: applyDusk swaps a lampPost globe to emissive LAMP_LOOK.emissive with intensity 2.4 and leaves the pole alone; createLampPools on a scene with 4 lampPosts → one mesh, 4×(2×poolSegments) triangles, centre vertex at the lamp x/z, y = poolLift, additive/depthWrite false; empty scene → null and nothing added; lampPost still has exactly 2 meshes (pole + globe) and BUILD_DRAWS unchanged.
- [ ] Step 2: Implement. Step 3: run dusk, builder, ambient, silhouette, contactshadows, waterlooks, flattrace tests; commit.

### Task 4: Verify

- [ ] Full suite + build; flat-trace sha; draw counts from live shots (park/neighbourhood/docks dusk, rain, sunset) vs BEFORE; after shots + pairs.
