# Whisker Walk — Phase 0 Renderer Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Visual tasks verify via `npx vite build` + a browser screenshot (see the repo's browser preview workflow), not unit tests. Pure-logic tasks use real Vitest TDD.

**Goal:** Raise perceived 3D detail on the *existing* WebGL Three.js renderer with zero new art assets and no infrastructure change: migrate the flat `MeshLambertMaterial` look to `MeshStandardMaterial` (PBR) lit by a runtime-generated environment map (IBL), add ACES tone mapping and a subtle bloom post-processing pass, and gate all of it behind a quality tier so mobile / reduced-motion / low-end devices keep today's frame budget. This is the "Phase 0" recommendation from `scratchpad/techstack-options.md` — the single highest-ROI, fully-reversible visual jump.

**Architecture:** All rendering setup lives in `src/main.js` (`init()` builds `renderer`/`camera`; `startWalk()` builds a fresh `THREE.Scene`, `sun` DirectionalLight, ambient, and calls each area's `build(scene)`; `renderer.setAnimationLoop` calls `renderer.render(session.scene, camera)`). Materials are created through tiny local `mat(color)` helpers in `src/cat/model.js` and `src/world/builder.js`, plus scattered inline `new THREE.MeshLambertMaterial({...})` calls in prop modules. This plan:

- Introduces one shared material factory `src/render/materials.js` (`litMaterial(...)`) so the Lambert→Standard swap and its cozy roughness/metalness defaults live in one place, and routes every existing Lambert call site through it.
- Adds one runtime IBL env map (three's `RoomEnvironment` baked once via `PMREMGenerator`, **no network**), assigned to `scene.environment` per walk.
- Adds a lazily-built `EffectComposer` (`RenderPass` → `UnrealBloomPass` → `OutputPass`) used only on the high tier; the low tier keeps the direct `renderer.render` path.
- Adds a pure quality resolver `src/render/quality.js` and a `quality` settings field; `startWalk()` resolves the tier once per walk and wires shadows / env intensity / composer accordingly.

**Tech Stack:** Three.js `^0.185.1` (already installed; `three/examples/jsm/*` present in `node_modules`), Vite `^8.2.0`, Vitest `^4.1.10`, vanilla ES modules, static PWA on GitHub Pages. No new dependencies.

**Report:** `scratchpad/techstack-options.md` (Phase 0 = "Shadows + PBR/IBL + a post-processing pass on the current Three.js renderer").

## Global Constraints (exact values)

- **No new runtime asset downloads — offline/PWA safe.** The env map is generated in-process from `RoomEnvironment` (a procedural `THREE.Scene`) via `PMREMGenerator`; **no HDRI/CDN fetch.** All `three/examples/jsm/*` imports (EffectComposer, RenderPass, UnrealBloomPass, OutputPass, RoomEnvironment) are static ES imports that Vite bundles into the hashed `/assets/*.js` chunk, which `public/sw.js` caches **cache-first** (`isHashedAsset`). Nothing new hits the network at runtime. Do not add any `fetch`, `TextureLoader().load(url)`, or `<link>` to an external resource.
- **Preserve the cozy low-poly art direction.** This is an enhancement, not a restyle. Keep smooth-shaded low-poly geometry (do **not** add `flatShading: true` — it would change the silhouette). `MeshStandardMaterial` defaults `metalness: 0`, and this plan pins `roughness: 0.9` — a matte, near-Lambert diffuse look that now responds to IBL and tone mapping. Bloom stays gentle (strength `0.35`, threshold `0.85`). No AO by default.
- **Green every commit.** `npx vite build` must exit 0 and the Vitest suite must stay green after **every** task. **Baseline: ~203 tests** (31 files in `test/`). New pure logic adds tests; do not modify or delete existing tests except to bump the documented baseline count.
- **Mobile / reduced-motion path must not regress.** The existing `coarse = matchMedia('(pointer: coarse)')` branch (pixel-ratio cap `1.5`, shadow map `1024`, `14` strays) and `settings.reducedMotion` behavior must be preserved. On the low tier: shadows stay at `1024`, **no composer, no bloom, no env-map cost beyond the one-time bake** — i.e. the low tier's per-frame cost is ≈ today's. Never allocate `EffectComposer` render targets on a device that only ever runs the low tier (lazy build).
- **No multiplayer / backend / SQL changes.** Do not touch `src/net.js`, `src/cloud.js`, `src/remotecats.js`, Supabase RPCs, or any room/sync/chat code. Rendering only.
- **Fully reversible.** Every change is renderer-local. No change to game logic, progression, interactions, or the `userData.parts`/`userData.base` animation contract.

**Note — shadows are already enabled** (discovered in code, contra the report's baseline assumption): `src/main.js` already sets `renderer.shadowMap.enabled = true` + `THREE.PCFSoftShadowMap` (init, ~L162), and `startWalk` already does `sun.castShadow`, `sun.shadow.mapSize.set(coarse?1024:2048, …)`, a ±70 shadow camera (`far 160`), and a `scene.traverse` giving every mesh `castShadow`/`receiveShadow` (~L1040–1052). Task 1 therefore **audits and tunes** existing shadows rather than enabling them from scratch.

---

### Task 1: Shadow audit + acne/peter-panning tuning (visual)

Existing shadows work but were never tuned for the material/tone-mapping changes coming next; lock in clean grounding first so later tasks compare against a good baseline.

**Files:**
- Modify: `src/main.js` (`startWalk`, the `sun.castShadow` / `sun.shadow.*` block ~L1040–1052 and the `scene.traverse` mesh loop).

**Interfaces:** No new exports. `sun.shadow` config only.

- [ ] **Step 1 — Tighten the shadow camera + add bias.** In the `sun.shadow` block, after `sun.shadow.camera.far = 160;` add:
  ```js
  sun.shadow.bias = -0.0004;        // kill shadow acne on the low-poly spheres
  sun.shadow.normalBias = 0.02;     // kill peter-panning at contact points
  sun.shadow.camera.near = 1;
  ```
  Keep the ±70 frustum and `far 160` (the world spans the area bounds; ±70 covers all three areas). Keep `mapSize` as-is for now (`coarse ? 1024 : 2048`) — Task 5 routes it through the tier.
- [ ] **Step 2 — Confirm ground receives, thin decals don't self-shadow.** The `scene.traverse` loop currently sets both `castShadow` and `receiveShadow` on every mesh. Leave ground/props receiving+casting, but guard the near-flat `PlaneGeometry`/`CircleGeometry` decals (paths, puddles at `y≈0.01`) from casting to avoid z-fight shimmer: in the traverse, keep the blanket assignment (simplest, lowest-risk) — only revisit if Step 4 screenshots show path/puddle acne.
- [ ] **Step 3 — Build.** Run `npx vite build`. Expected: exit 0.
- [ ] **Step 4 — Browser verification.** Launch the preview, start a walk in **neighborhood**, and screenshot. Verify: cat + houses + trees cast grounded shadows, no black acne speckle on sphere bellies, no floating gap between paw and shadow. Repeat for **park** and **seaside** (different ground colors). Compare against a pre-Task-1 screenshot — grounding should be equal-or-better, nothing regressed.
- [ ] **Step 5 — Commit.** `git commit` (suite still ~203; no test change).

---

### Task 2: PBR materials + runtime IBL env map + ACES tone mapping (visual)

The core look change: matte `MeshStandardMaterial` lit by a baked `RoomEnvironment` and tone-mapped with ACES. Done together because Standard materials without env/tone mapping read flat and dark.

**Files:**
- Create: `src/render/materials.js`
- Modify: `src/cat/model.js` (`mat` helper, L18), `src/world/builder.js` (`mat` helper, L3, and the inline emissive lamp ~L138), `src/main.js` (init: tone mapping + env-map bake; `startWalk`: assign `scene.environment`; the 5 inline Lambert props: collectibles, quest marker/letter/glasses, `toyGhost`), `src/toy.js`, `src/scent.js`, `src/secrets.js`, `src/critters.js`, `src/tippables.js`, `src/world/park.js`, `src/world/seaside.js`.

**Interfaces:**
- `src/render/materials.js` exports:
  - `litMaterial(color, extra = {}) -> THREE.MeshStandardMaterial` — `new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0.0, ...extra })`. `extra` carries `emissive`, `emissiveIntensity`, `transparent`, `opacity`, etc. from existing call sites unchanged.
  - `buildEnvMap(renderer) -> THREE.Texture` — bakes `RoomEnvironment` once and returns the PMREM texture (see Step 3).
- **Leave `MeshBasicMaterial` call sites alone** (intentionally unlit): weather rainbow arcs (`src/weather.js`), the album photo-panel texture (`src/world/builder.js` ~L202), and any unlit markers in `src/scent.js`. Whisker `LineBasicMaterial` in `model.js` is unaffected.

- [ ] **Step 1 — Create the factory.** Write `src/render/materials.js`:
  ```js
  import * as THREE from 'three';

  export function litMaterial(color, extra = {}) {
    return new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0.0, ...extra });
  }

  export function buildEnvMap(renderer) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    return envTex;
  }
  ```
  Add `import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';` (r0.185 constructor takes **no** args). The env texture is baked **once** and reused across every walk — never disposed per-walk.
- [ ] **Step 2 — Migrate the two `mat` helpers.** In `src/cat/model.js` replace `const mat = (color) => new THREE.MeshLambertMaterial({ color });` with `import { litMaterial } from '../render/materials.js';` + `const mat = (color) => litMaterial(color);`. Same in `src/world/builder.js` (`import { litMaterial } from '../render/materials.js';`). This converts the bulk of cats + world geometry in one edit.
- [ ] **Step 3 — Bake the env map once in `init()`.** In `src/main.js init()`, right after `renderer.setSize(...)`, add `import { buildEnvMap } from './render/materials.js';` (top of file) and:
  ```js
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  const envMap = buildEnvMap(renderer);
  ```
  `envMap` is closed over by `startWalk`.
- [ ] **Step 4 — Assign env per walk.** In `startWalk`, right after `const scene = new THREE.Scene();`, add:
  ```js
  scene.environment = envMap;
  scene.environmentIntensity = 0.35; // subtle IBL; Task 5 routes this through the tier
  ```
  Do **not** set `scene.background = envMap` — keep the painted sky/fog (`scene.background` is set by area `build()` and by dusk/weather). The env only feeds ambient/reflection, so the sky is untouched.
- [ ] **Step 5 — Migrate the inline Lambert props.** Replace every remaining `new THREE.MeshLambertMaterial({ color: X })` / `{ color: X, emissive: Y }` with `litMaterial(X)` / `litMaterial(X, { emissive: Y })`, importing `litMaterial` in each file: `src/main.js` (collectibles L965–968, quest marker L983, quest letter L997, glasses lens L1006, `toyGhost` L1033), `src/toy.js` (2), `src/scent.js` (2 — only the lit ones), `src/secrets.js` (3), `src/critters.js` (2), `src/tippables.js` (1), `src/world/park.js` (4), `src/world/seaside.js` (1), `src/world/builder.js` lamp (`litMaterial(0xfff2c0, { emissive: 0x8a7a40 })`). `MeshStandardMaterial` accepts `color`+`emissive` identically, so these are near-mechanical.
- [ ] **Step 6 — Build + suite.** `npx vite build` (exit 0) and `npx vitest run` (still ~203 green — material class swaps don't touch tested logic; if any test asserts `MeshLambertMaterial` by type, update it and note the count).
- [ ] **Step 7 — Retune lighting by eye (this is the calibration step).** Screenshot neighborhood/park/seaside in **clear** weather. The scene will look different — likely a touch darker or with shifted highlights (r155+ physical lights + ACES compress the old Lambert values). Adjust only `sun.intensity` (currently `2.2`), the `AmbientLight` intensity (`0.9`), and/or `renderer.toneMappingExposure` (start `1.0`, try `1.05–1.15`) until the cozy daylight palette matches or beats the pre-Task-2 look. Then screenshot the **dusk** path (glow collar) and **rain**/**sunset** weather (`src/weather.js` sets its own `sun.intensity`/background) and confirm those still read right — do not edit `weather.js`; if dusk/weather look off, nudge `environmentIntensity` (`0.25–0.4`) rather than the weather values.
- [ ] **Step 8 — Commit.** Include before/after screenshots in the review note.

---

### Task 3: Subtle bloom post-processing (visual, high-tier path)

Add the `EffectComposer` stack. Built here unconditionally for verification; Task 5 makes it high-tier-only + lazy.

**Files:**
- Modify: `src/main.js` (init: build composer; `startWalk`: point composer at the new scene; render loop; `snapPhoto`; resize handler).

**Interfaces:** Local closures in `init()`: `composer`, `renderPass`, `bloomPass`, and a `renderFrame()` helper. Imports at top of `src/main.js`:
```js
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
```

- [ ] **Step 1 — Build the composer in `init()`** (after the env-map bake):
  ```js
  const composer = new THREE.EffectComposer
    ? null : null; // placeholder — see below
  ```
  Actually construct it directly (no placeholder):
  ```js
  const renderPass = new RenderPass(new THREE.Scene(), camera); // scene swapped per walk
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.35,  // strength — gentle
    0.6,   // radius
    0.85   // threshold — only bright emissives/sky bloom
  );
  const composer = new EffectComposer(renderer);
  composer.addPass(renderPass);
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass()); // applies renderer.toneMapping + sRGB at the end
  ```
  `EffectComposer` render targets default to `HalfFloatType` (linear HDR), so `RenderPass` output stays linear, `UnrealBloomPass` gets linear input, and `OutputPass` does the single ACES tone-map + color-space conversion. With the composer active, tone mapping is applied by `OutputPass`, **not** double-applied by `RenderPass` — this is the correct modern recipe. (On the direct `renderer.render` path used by the low tier, the renderer itself applies `renderer.toneMapping` on the canvas — also single-application. Consistent look across tiers.)
- [ ] **Step 2 — Point the composer at each walk's scene.** In `startWalk`, after `scene.environment = envMap;`, add `renderPass.scene = scene;` (camera is stable). This avoids rebuilding the composer per walk.
- [ ] **Step 3 — Add a single render entry point.** Define in `init()`:
  ```js
  function renderFrame() { composer.render(); }
  ```
  Replace `renderer.render(session.scene, camera)` in the `setAnimationLoop` callback (~L1917) with `renderFrame();`. (Task 5 makes `renderFrame` branch on the tier.)
- [ ] **Step 4 — Fix `snapPhoto`.** `snapPhoto` (~L1837) calls `renderer.render(s.scene, camera)` then reads `renderer.domElement` into the thumbnail. Change it to `renderFrame();` so the photo captures the post-processed (bloomed, tone-mapped) frame that the player actually sees. Keep the subsequent `drawImage(renderer.domElement, …)` — the composer's `OutputPass` writes to the canvas (`renderToScreen`), so `renderer.domElement` holds the final frame.
- [ ] **Step 5 — Resize.** In the `window 'resize'` handler (~L682), after `renderer.setSize(...)` add:
  ```js
  composer.setSize(window.innerWidth, window.innerHeight);
  bloomPass.setSize(window.innerWidth, window.innerHeight);
  ```
- [ ] **Step 6 — Build.** `npx vite build` (exit 0). Confirm the three chunk grew modestly (~30–50 KB min+gz for composer+bloom+RoomEnvironment+PMREM) and no new network request appears.
- [ ] **Step 7 — Browser verification.** Start a walk; screenshot. Bloom should be **subtle**: glow-collar dusk fireflies, lamp emissives, collectible spheres, and bright sky edges gain a soft halo; matte surfaces (cat fur, houses, ground) do **not** glow. If anything blooms that shouldn't, raise `threshold` toward `0.9`; if the glow is too strong, lower `strength` toward `0.25`. Screenshot the album thumbnail (camera mode → snap) to confirm the photo matches the on-screen frame.
- [ ] **Step 8 — Commit.**

---

### Task 4: Pure quality resolver + `quality` settings field (TDD)

Pure logic — real Vitest tests, no rendering.

**Files:**
- Create: `src/render/quality.js`, `test/quality.test.js`
- Modify: `src/settings.js` (add `quality` field), `test/settings.test.js` (extend), `src/ui/homebase.js` (Settings-tab selector).

**Interfaces:**
- `src/render/quality.js` exports `resolveQuality({ coarse, reducedMotion, override }) -> tier`, where `override ∈ {'auto','high','low'}` and `tier` is:
  ```js
  {
    name: 'high' | 'low',
    shadowMapSize: 2048 | 1024,
    envIntensity: 0.35 | 0.25,
    postFx: boolean,   // true only on high — composer + bloom
    pixelRatioCap: 2 | 1.5,
  }
  ```
  Resolution: `override === 'high'` → high; `override === 'low'` → low; `override === 'auto'` → **low if `coarse || reducedMotion`, else high**. (Honors the constraint that mobile *and* reduced-motion get the lighter path.)
- `src/settings.js`: add `quality: 'auto'` to `DEFAULTS`, sanitize to the enum `['auto','high','low']`, and make `set('quality', v)` store the validated string (not the `!!val` boolean path).

- [ ] **Step 1 — Failing resolver test.** `test/quality.test.js`:
  ```js
  import { describe, it, expect } from 'vitest';
  import { resolveQuality } from '../src/render/quality.js';

  const high = { name: 'high', shadowMapSize: 2048, envIntensity: 0.35, postFx: true, pixelRatioCap: 2 };
  const low  = { name: 'low',  shadowMapSize: 1024, envIntensity: 0.25, postFx: false, pixelRatioCap: 1.5 };

  describe('resolveQuality', () => {
    it('auto → high on a desktop pointer with motion allowed', () => {
      expect(resolveQuality({ coarse: false, reducedMotion: false, override: 'auto' })).toEqual(high);
    });
    it('auto → low on a coarse pointer', () => {
      expect(resolveQuality({ coarse: true, reducedMotion: false, override: 'auto' })).toEqual(low);
    });
    it('auto → low when reduced motion is on, even on desktop', () => {
      expect(resolveQuality({ coarse: false, reducedMotion: true, override: 'auto' })).toEqual(low);
    });
    it('override high forces high even on a coarse/reduced-motion device', () => {
      expect(resolveQuality({ coarse: true, reducedMotion: true, override: 'high' })).toEqual(high);
    });
    it('override low forces low even on desktop', () => {
      expect(resolveQuality({ coarse: false, reducedMotion: false, override: 'low' })).toEqual(low);
    });
  });
  ```
- [ ] **Step 2 — Run, verify red** (`npx vitest run test/quality.test.js` — cannot resolve module).
- [ ] **Step 3 — Implement `src/render/quality.js`** to pass. Define the two frozen tier objects and the resolution logic above; return the corresponding object. No Three.js import (keep it pure/leaf so it tests without a WebGL context).
- [ ] **Step 4 — Run, verify green.**
- [ ] **Step 5 — Settings field, TDD.** In `test/settings.test.js` add: default `quality` is `'auto'`; `set('quality','high')` then `get('quality')` is `'high'`; `set('quality','bogus')` is rejected (stays previous/`'auto'`); a corrupt persisted `{quality: 42}` sanitizes to `'auto'`. Run → red.
- [ ] **Step 6 — Implement in `src/settings.js`:** add `quality: 'auto'` to `DEFAULTS`; add `const QUALITY = ['auto','high','low'];` + `clampEnum(v, allowed, fallback)`; in `sanitize` add `quality: clampEnum(raw.quality, QUALITY, DEFAULTS.quality)`; in `set()` add a branch `else if (key === 'quality') state = { ...state, quality: clampEnum(val, QUALITY, state.quality) };` **before** the boolean fallthrough. Run → green.
- [ ] **Step 7 — Settings UI.** In `src/ui/homebase.js`'s Settings panel, add a small `<select id="quality-select">` (Auto / High detail / Low detail) bound to `settings.get('quality')`, with a delegated `change` handler calling `settings.set('quality', v)` then `homebase.refresh()`. Add a hint line: "Applies on your next walk." (The tier is resolved in `startWalk`, so no live renderer surgery — a change takes effect next walk.) No test for the DOM wiring beyond the existing homebase render smoke tests; keep markup escaped per the file's existing conventions.
- [ ] **Step 8 — Build + full suite.** `npx vite build` (exit 0), `npx vitest run` green. **New baseline: ~203 + (quality tests) + (settings tests)** — record the exact number in the commit.
- [ ] **Step 9 — Commit.**

---

### Task 5: Wire the tier into the renderer (visual, desktop + mobile)

Make shadows / env intensity / composer selection driven by the resolved tier, and make the composer lazy so low-tier-only devices never allocate post-FX targets.

**Files:**
- Modify: `src/main.js` (init: lazy composer, remove eager composer build from Task 3; `startWalk`: resolve tier, apply to `pixelRatio`/`shadowMapSize`/`envIntensity`; `renderFrame`: branch on tier).

**Interfaces:** `import { resolveQuality } from './render/quality.js';`. Local `let composer = null, renderPass = null, bloomPass = null;` + `function ensureComposer() {...}`. `session.useComposer` (boolean) selects the render path.

- [ ] **Step 1 — Make the composer lazy.** Move the Task-3 composer construction into:
  ```js
  function ensureComposer() {
    if (composer) return;
    renderPass = new RenderPass(new THREE.Scene(), camera);
    bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.35, 0.6, 0.85);
    composer = new EffectComposer(renderer);
    composer.addPass(renderPass);
    composer.addPass(bloomPass);
    composer.addPass(new OutputPass());
    composer.setSize(window.innerWidth, window.innerHeight);
  }
  ```
  In the resize handler, guard the composer resize with `if (composer) { composer.setSize(...); bloomPass.setSize(...); }`.
- [ ] **Step 2 — Resolve the tier per walk.** At the top of `startWalk`, add:
  ```js
  const tier = resolveQuality({
    coarse,
    reducedMotion: settings.get('reducedMotion'),
    override: settings.get('quality'),
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, tier.pixelRatioCap));
  ```
  (`coarse` is already in `init()` scope; this replaces the one-time `init()` pixel-ratio line's effect with a per-walk value — same numbers as today when `quality==='auto'`, so no regression.)
- [ ] **Step 3 — Apply the tier to shadows + env.** Replace the hardcoded `sun.shadow.mapSize.set(coarse ? 1024 : 2048, …)` with `sun.shadow.mapSize.set(tier.shadowMapSize, tier.shadowMapSize);` and set `scene.environmentIntensity = tier.envIntensity;` (replacing the literal `0.35` from Task 2 Step 4).
- [ ] **Step 4 — Select the render path.** Set `session.useComposer = tier.postFx;` in the session object. If `tier.postFx`, call `ensureComposer()` once in `startWalk` (after the scene exists) and set `renderPass.scene = scene;`. Rewrite `renderFrame`:
  ```js
  function renderFrame() {
    if (session?.useComposer && composer) composer.render();
    else renderer.render(session.scene, camera);
  }
  ```
  `snapPhoto` keeps calling `renderFrame()` — correct on both tiers.
- [ ] **Step 5 — Build + suite.** `npx vite build` (exit 0), `npx vitest run` green.
- [ ] **Step 6 — Desktop verification (high tier).** With `quality: 'auto'` on a non-coarse pointer: confirm shadows `2048`, env + bloom present (screenshot matches Task 3).
- [ ] **Step 7 — Mobile/low verification.** In the browser preview, emulate a coarse/mobile viewport (or set `quality: 'low'`): confirm the walk still runs, shadows are `1024`, **no bloom** (screenshot has no halos), env is present but subtler, and the composer was **not** allocated (add a temporary `console.log` in `ensureComposer`, confirm it never fires on the low path, then remove it). Toggle `reducedMotion` on and confirm `auto` drops to the low path. Confirm the low path's look/feel ≈ the pre-Phase-0 game (no regression).
- [ ] **Step 8 — Commit.**

---

### Task 6: Perf pass, offline check, and final before/after review (visual)

**Files:** none required (verification + optional micro-tuning of the values touched above).

- [ ] **Step 1 — Offline/PWA proof.** `npx vite build` then `npx vite preview`; in the browser, load once, then go offline (DevTools → Network → Offline) and reload. The game must still boot and a walk must still render (the env-map bake, composer, and bloom all run from the cached hashed bundle — **no network**). Confirm the Network panel shows zero external asset requests during a walk (Supabase calls are the only allowed cross-origin traffic and only when MP is configured).
- [ ] **Step 2 — Bundle-size note.** Record the built `/assets/*.js` size delta vs. `main` (expect ~30–50 KB min+gz added by composer/bloom/RoomEnvironment/PMREM). Confirm it's acceptable for the PWA precache.
- [ ] **Step 3 — Frame-budget sanity.** On the high tier, walk each area including a rain walk (600 rain points) and a dusk walk (fireflies + bloom); confirm smooth motion on the dev machine. On the low tier, confirm parity with pre-Phase-0.
- [ ] **Step 4 — Draw-call / instancing note (out of scope, document only).** The report flags that each cat is dozens of separate `Mesh` objects → high draw-call count, and that shadows/post-FX amplify per-object cost. **Merging cats into fewer meshes and `InstancedMesh` for repeated props is Phase 1**, deliberately not in this phase (it would touch `buildCat`'s `userData.parts` animation contract). If Task 5's low-tier mobile screenshots show frame-rate trouble with many strays, the immediate lever is lowering `tier.shadowMapSize` or the coarse stray count — not geometry merging. Leave a one-line pointer to Phase 1 in the commit.
- [ ] **Step 5 — Final before/after review.** Assemble side-by-side screenshots (pre-Phase-0 `main` vs. this branch) for neighborhood/park/seaside in clear + dusk, on both tiers. Confirm: clearly richer lighting/grounding/soft-glow on high tier; cozy low-poly identity preserved; low tier ≈ unchanged. Run `npx vitest run` + `npx vite build` one last time — both green.
- [ ] **Step 6 — Optional code-review sub-skill.** Consider superpowers:requesting-code-review before merge.

---

## Risks & mitigations

- **Biggest risk — global look re-calibration (Task 2 Step 7).** Swapping Lambert→Standard *and* adding IBL *and* ACES tone mapping simultaneously shifts the brightness/color of the entire scene, and it can't be unit-tested. It must be tuned by eye across **many** lighting states: clear/rain/sunset weather (`weather.js` sets its own sun/background), dusk (glow collar), and three different-ground areas. Mitigation: tune only `sun.intensity`, `AmbientLight` intensity, `toneMappingExposure`, and `environmentIntensity`; do **not** edit `weather.js`; keep env intensity low (`0.25–0.4`) so it never washes out the cozy palette. This is the task most likely to need iteration.
- **Double tone-mapping** if `OutputPass` is omitted or `RenderPass` is misordered — mitigated by the exact pass order (RenderPass → UnrealBloomPass → OutputPass) and relying on the composer's default `HalfFloatType` linear targets.
- **Per-walk scene swap** leaving a stale `renderPass.scene` — mitigated by reassigning `renderPass.scene = scene` in every `startWalk` and only rendering via the composer when `session.useComposer`.
- **Mobile allocation regression** — mitigated by the lazy `ensureComposer()` (never called on a low-only device) and per-walk tier resolution preserving today's exact `coarse` numbers when `quality==='auto'`.
