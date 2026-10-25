# Stream 4, step 1 — the performance readout — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the owner an in-game readout (fps, frame time, worst frame, tier knobs, true per-frame draw calls and triangles) so the Stream 4 baseline can be taken on the desktop and the iPhone 18, and settle the ~1050-or-~525 draw-call question.

**Architecture:** A DOM-free leaf module (`src/render/perfstats.js`) does the timing and the draw-call bookkeeping against any renderer-shaped object, so it tests headless. A thin DOM overlay (`src/ui/perfhud.js`) owns the element and a 2 Hz text refresh. `main.js` calls two hooks in the render loop, and both return at once while the readout is off. The game's lighting rig moves out of `walk.js` into `src/render/rig.js`, so the game, the budget test and the verify harnesses all read one copy.

**Tech Stack:** three r185, Vite, vitest (node environment).

**Spec:** `docs/superpowers/specs/2026-10-24-whisker-walk-v21-reason-to-come-back-design.md` — Stream 4 and §8. Also `docs/VISUAL-PASS.md` ("Open items", §4 budget table, §5).

## Global Constraints

- Step 1 of Stream 4 only: **no visual change, no change to `src/render/quality.js` or any tier knob value**, no stray-count change.
- `SAVE_VERSION` stays 4. The new setting is an additive, sanitized field in `src/settings.js` (`perfReadout`, default `false`).
- Readout off by default. When off, the per-frame cost is one boolean check per hook. When on, the per-frame path allocates nothing (typed arrays, preallocated objects, no rest params, no closures created per frame). The 2 Hz DOM text refresh is the only place strings are built.
- Edits to `src/main.js` stay inside the render loop plus a few lines of setup. Edits to `src/ui/homebase.js` stay inside the Settings section and its change handler. Other sessions own `progression.js` CATALOG, `src/cat/model.js`, the homebase cat blurbs, `interactions.js`, `straycats.js`, the gold-mice readout. Do not touch them.
- No fps figure from the automated browser pane is ever reported as real. rAF there throttles to ~10 ticks. Draw-call and triangle counts per frame ARE deterministic per frame and may be reported.
- Tests: `npx vitest run --exclude '.claude/**'`.
- Commit trailer: `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## Review Focus

1. **Background tab / alt-tab gap.** A 4-second rAF gap on return must not show as "worst 4000 ms" or drag the smoothed fps to ~0. Intervals over 1000 ms are a pause, not a frame: dropped, and the EMA restarts. (Task 1 test.)
2. **Readout toggled mid-walk.** Turning it off must restore `renderer.render`, `renderer.shadowMap.render` and `info.autoReset = true` exactly. Turning it on twice must not double-wrap. (Task 1 tests.)
3. **Renders outside the loop** (photo mode, thumbnails, the home screen between walks) must not bleed into the next frame's count. `beginFrame` resets `info` and every bucket. (Task 1 test.)
4. **Phone layout.** The overlay must sit inside iPhone safe-area insets, ignore touches (`pointer-events: none`) and not cover the touch controls or the top HUD. (Eye-check, Task 2.)
5. **The rig move changes nothing.** Same lights, same values, same caster count per area. The budget test's ceilings must not move. (Task 3 test.)

---

### Task 1: `perfstats.js` — frame timing and per-frame draw-call counting

**Files:**
- Create: `src/render/perfstats.js`
- Test: `test/perfstats.test.js`

**Interfaces:**
- Produces:
  - `createFrameStats({ capacity = 512, windowMs = 3000, smoothing = 0.1, pauseMs = 1000 } = {})` → `{ tick(nowMs), work(ms), fps(), frameMs(), worstMs(nowMs), workMs(), reset() }`
    - `tick(nowMs)`: records the interval since the previous tick into a `Float64Array` ring (timestamp and interval). First tick after construction/reset records nothing. An interval `> pauseMs` is dropped and restarts the EMA.
    - `frameMs()` EMA of intervals; `fps()` = `1000 / frameMs()`, `0` before any interval.
    - `worstMs(nowMs)` largest interval whose timestamp is within `windowMs` of `nowMs`; `0` if none.
    - `work(ms)` / `workMs()`: EMA of the CPU time of the tick body.
  - `createRenderCounter(renderer)` → `{ install(), uninstall(), installed, beginFrame(scene), endFrame(), frame }`
    - `install()`: idempotent. Sets `renderer.info.autoReset = false`; wraps `renderer.render(scene, camera)` and `renderer.shadowMap.render(lights, scene, camera)` with explicit-parameter wrappers built once.
    - `uninstall()`: restores both originals and `autoReset = true`. Idempotent.
    - `beginFrame(scene)`: `renderer.info.reset()`, zero all buckets, remember `scene` as the walk scene.
    - `endFrame()`: fills the preallocated `frame` object: `{ calls, triangles, shadowCalls, sceneCalls, otherCalls, sceneRenders, renders }`. `calls`/`triangles` come from `renderer.info.render`. `shadowCalls` is the sum of deltas across `shadowMap.render`. A `renderer.render` whose first argument is the walk scene adds its delta minus the shadow delta it contained to `sceneCalls` and bumps `sceneRenders`. Any other `renderer.render` (composer quads, photo mode) adds to `otherCalls`. `renders` counts every `renderer.render`.

- [ ] **Step 1: Write the failing tests** in `test/perfstats.test.js`. Use a fake renderer: `{ info: { autoReset: true, render: { calls, triangles }, reset() {…} }, render(scene, cam) { if (scene.isScene) this.shadowMap.render([], scene, cam); info.render.calls += scene.drawCalls; … }, shadowMap: { render() { info.render.calls += 3; } } }`.
  - `frame stats: 60 ticks 16.667 ms apart → fps() within 0.5 of 60, frameMs() within 0.2 of 16.67`
  - `frame stats: one 50 ms frame among 16.7 ms frames → worstMs(now) === 50; 3.1 s later with only 16.7 ms frames → worstMs < 17`
  - `frame stats: a 4000 ms gap is dropped → worstMs < 17 and fps() > 55 after the next ticks`
  - `frame stats: first tick records nothing → fps() === 0, worstMs(t) === 0`
  - `frame stats: work(6) repeatedly → workMs() within 0.1 of 6`
  - `frame stats: tick() allocates no arrays` — assert the ring arrays are the same instances after 2000 ticks (capacity wraps).
  - `counter: install sets autoReset false; uninstall restores the exact original render/shadowMap.render functions and autoReset true`
  - `counter: install twice then one uninstall → originals restored (no double wrap)`
  - `counter: scene render (10 calls + 3 shadow) + two quad renders (1 each) → frame = { calls: 15, shadowCalls: 3, sceneCalls: 10, otherCalls: 2, sceneRenders: 1, renders: 3 }`
  - `counter: calls made before beginFrame are not in the next frame` (render once, beginFrame, render a quad, endFrame → calls 1).
  - `counter: frame is the same object across endFrame calls`

- [ ] **Step 2: Run, expect FAIL** — `npx vitest run test/perfstats.test.js` → module not found.
- [ ] **Step 3: Implement** `src/render/perfstats.js`. No `three` import, no DOM. Header comment says why it is a leaf (headless tests) and why `autoReset = false` (three resets `info` at the top of every `renderer.render`, so after `composer.render()` it holds only the last full-screen pass — that is the double-count trap).
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** — `feat(perf): frame timing and per-frame draw-call counter`

---

### Task 2: the readout overlay, its setting, and the wiring

**Files:**
- Create: `src/ui/perfhud.js`
- Modify: `src/settings.js` (DEFAULTS + sanitize), `src/ui/homebase.js` (Settings checkbox + change listener), `src/main.js` (setup + two loop hooks + `applySettings`), `src/game/walk.js` (add `tier` to the session object, one line next to `useComposer`), `src/style.css` (overlay style)
- Test: `test/perfhud.test.js`, extend `test/settings.test.js`

**Interfaces:**
- Consumes: Task 1's `createFrameStats`, `createRenderCounter`.
- Produces:
  - `formatPerfLines(s)` (pure, exported from `perfhud.js`) → `string[]`, where `s = { fps, frameMs, worstMs, workMs, tierName, quality, coarse, shadowMapSize, postFx, normalMaps, pixelRatio, bufferW, bufferH, strays, frame }`. Lines, exactly this shape:
    1. `58 fps · 17.2 ms · worst 41.0 ms (3 s)`
    2. `cpu 6.1 ms`
    3. `tier high · setting auto · touch no`
    4. `shadow 2048 · postFx on · normals on`
    5. `px ratio 2 · 2560×1440 · strays 22`
    6. `draws 1110 · shadow 412 · scene 690 · other 8`
    7. `tris 109,402 · scene passes 1`
  - `createPerfHud({ renderer, settings, coarse, urlFlag })` → `{ setEnabled(bool), frameStart(nowMs), frameEnd(session, nowMs), enabled }`.
    - Builds the element lazily on first enable, `#perf-readout`, appended to `document.body`.
    - `frameStart`: returns at once if disabled; else `stats.tick(now)`, remembers `now`, and if a session exists `counter.beginFrame(session.scene)`.
    - `frameEnd(session, now)`: returns at once if disabled; hides the element when `session` is null; else `counter.endFrame()`, `stats.work(performance.now() - start)`, and every 500 ms writes `formatPerfLines(...)` joined by `\n` into the element's `textContent`.
    - Knob values come from `session.tier` (`name`, `shadowMapSize`, `postFx`, `normalMaps`), `renderer.getPixelRatio()`, `renderer.domElement.width/height`, `session.strayCats?.strays?.length ?? 0`, `settings.get('quality')`, `coarse`.
    - `setEnabled(true)` calls `counter.install()`; `setEnabled(false)` calls `counter.uninstall()` and hides the element.
- Setting: `perfReadout: false` in `settings.js` DEFAULTS; sanitize as boolean like `hideChat`. Settings row label: `Performance readout (fps counter)`, id `set-perf-readout`, change listener mirrors `set-hide-chat`.
- URL flag: `main.js` reads `new URLSearchParams(location.search).has('perf')` once at init. It forces the readout on for that page load and is never saved. `applySettings()` calls `perfHud.setEnabled(settings.get('perfReadout') || perfFlag)`.
- Loop: `perfHud.frameStart(performance.now())` is the first statement of the `setAnimationLoop` callback; `perfHud.frameEnd(session, performance.now())` goes right after `renderFrame()` and also in the `!session` early return (so the element hides between walks). Nothing else in the loop changes.
- Style: `position: fixed; top: calc(env(safe-area-inset-top) + 8px); left: calc(env(safe-area-inset-left) + 8px); white-space: pre; font: 11px/1.35 ui-monospace, Menlo, monospace; color: #fff; background: rgba(0,0,0,.6); padding: 4px 6px; border-radius: 6px; pointer-events: none; z-index` above the HUD; `hidden` class hides it. Move it if the eye-check shows it covering the HUD.

- [ ] **Step 1: Write the failing tests.**
  - `test/perfhud.test.js`: `formatPerfLines` with the sample values above returns exactly the 7 lines above (`toLocaleString('en-US')` for triangles; one decimal for ms; fps rounded to integer; `on`/`off`; `yes`/`no`).
  - `formatPerfLines` with `fps: 0, frameMs: 0, worstMs: 0` (no data yet) → line 1 is `– fps · – ms · worst – ms (3 s)`.
  - `test/settings.test.js`: `perfReadout` defaults to `false`; a stored `"yes"` sanitizes to `false`; `set('perfReadout', true)` persists `true`.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** `perfhud.js`, the setting, the Settings row, the `main.js` wiring, `tier` on the session, the CSS.
- [ ] **Step 4: Run the full suite, expect PASS.**
- [ ] **Step 5: Commit** — `feat(perf): an off-by-default in-game performance readout`

---

### Task 3: one lighting rig — `src/render/rig.js` — and the verify harnesses

**Files:**
- Create: `src/render/rig.js`
- Modify: `src/game/walk.js` (constants and the caster sweep move out; their long comments move with them), `test/budget.test.js` (import the predicate instead of its hand copy, and delete the "keep in sync by hand" paragraph)
- Modify (gitignored, on disk): `verify-park.html`, `verify-docks.html`, `verify-seaside.html`, `verify-neighborhood.html`
- Test: `test/rig.test.js`

**Interfaces:**
- Produces from `src/render/rig.js` (imports `three`):
  - constants, values unchanged from `walk.js`: `SUN_COLOR = 0xfff2d8`, `SUN_POSITION = [-36, 15, -24]`, `SUN_INTENSITY = 3.0`, `SUN_BIAS = -0.00015`, `HEMI_SKY = 0xbfd8ff`, `HEMI_INTENSITY = 0.45`, `DEFAULT_GROUND_BOUNCE = 0x9a9086`, `CAST_FLAT_HEIGHT = 0.12`, `CAST_TALL_HEIGHT = 1.3`, `CAST_WIDE_SPAN = 1.0`
  - `createSun()` → `DirectionalLight(SUN_COLOR, SUN_INTENSITY)` at `SUN_POSITION`
  - `createFill(groundBounce)` → `HemisphereLight(HEMI_SKY, groundBounce ?? DEFAULT_GROUND_BOUNCE, HEMI_INTENSITY)`
  - `isTransparentMat(material)` → boolean (array-aware)
  - `castsFromBox(box: Box3)` → boolean, the eligibility rule (empty box → false)
  - `assignShadowCasters(scene)` → `{ meshes, casters }`; per top-level child, `receiveShadow = true` and `castShadow = castsFromBox(box) && !isTransparentMat(mat)` on every mesh except `userData.contactDecal`.
- `walk.js` keeps the call order exactly: `createSun()` where the sun was built, `createFill(areaData.groundBounce)` where the hemisphere was added, `sun.shadow.bias = SUN_BIAS` where it was set, `assignShadowCasters(scene)` where the sweep ran. Dusk's `sun.intensity = 0.7` override is untouched.
- Each verify page: renderer setup as today; `createSun()` added before the build; `createFill(area.groundBounce)` after; `createShadowFit(sun, camera, { radius: 20, mapSize: 2048 })` with `shadows.update()` before every render; `sun.shadow.bias = SUN_BIAS`; `assignShadowCasters(scene)` after the build. The old `DirectionalLight(…, 2.2)` + `AmbientLight` lines go. HUD text gains the caster count.

- [ ] **Step 1: Write the failing test** `test/rig.test.js`:
  - `constants match the values walk.js shipped` (the list above, exact).
  - `createSun` position/intensity/colour; `createFill(undefined)` uses `DEFAULT_GROUND_BOUNCE`.
  - `castsFromBox`: 0.10 m tall wide box → false; 1.4 m tall thin → true; 0.5 m tall 1.2 m wide → true; 0.5 m tall 0.5 m wide → false; empty box → false.
  - `assignShadowCasters` on a scene with a tall box, a flat box, a transparent tall box and a `userData.contactDecal` mesh → casters 1, every non-decal mesh `receiveShadow`, the decal untouched.
  - `walk.js source no longer defines SUN_INTENSITY / CAST_FLAT_HEIGHT and imports from '../render/rig.js'` (readFileSync, the same convention `test/shadowfit.test.js` uses).
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** `rig.js`, switch `walk.js` and `budget.test.js` to it.
- [ ] **Step 4: Run the full suite, expect PASS** with no budget ceiling edited.
- [ ] **Step 5: Update the four verify pages**, open each in the browser pane, confirm shadows show and the console is clean.
- [ ] **Step 6: Commit** — `refactor(render): one lighting rig for the game, the budget test and the harnesses`

---

### Task 4 (controller): measure, answer the caveat, write the owner's note

**Files:**
- Modify: `docs/VISUAL-PASS.md` (close the double-count item in "Open items", and the verify-page item)
- Create: `docs/superpowers/handoffs/2026-10-25-stream4-measurement.md`

- [ ] **Step 1:** In the browser pane, start a walk with `?perf` on high and on low (Settings → quality), Cozy Neighborhood, seeded the same way as the 3.1/3.2 A/B if possible. Read `draws`, `shadow`, `scene`, `other`, `scene passes`, `tris` from the readout. Cross-check one frame by counting raw `gl.drawElements`/`drawArrays`/instanced calls over one rAF tick with `javascript_tool` (debug only).
- [ ] **Step 2:** Write the answer into `VISUAL-PASS.md`: the true per-frame total, the split, whether the scene is drawn once per frame, and why the old reading said what it said. No fps figures.
- [ ] **Step 3:** Write the owner's note: desktop (Chrome, devtools Performance panel and the readout), iPhone 18 (Settings toggle, Safari), which area, which walk, how long, which numbers to send back, as a fill-in table.
- [ ] **Step 4:** Eye-check the readout on desktop and at phone size (375×812). Screenshots.
- [ ] **Step 5: Commit** — `docs(perf): the draw-call answer and how to take the reading`
