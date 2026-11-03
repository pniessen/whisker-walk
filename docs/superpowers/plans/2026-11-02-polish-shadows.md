# Softer Tree Shadows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish survey item #18 — the sun's tree shadows read as dappled shade, not ink: a slightly wider PCF penumbra and a slightly lighter shadow, at no extra GPU taps and no extra draws.

**Architecture:** three 0.185 already maps `PCFSoftShadowMap` to `PCFShadowMap` (with a console warning). Its PCF is a fixed 5-tap Vogel disk of hardware 2x2 compares whose spread is `shadow.radius` texels, and it has `shadow.intensity` (0..1, how dark a full shadow is). Both are plain uniforms, so neither changes the shader, the tap count or the shadow pass. `createShadowFit` (src/render/shadowfit.js) already derives `normalBias` from the texel size; it now also derives `shadow.radius` from a world-space softness, so every tier gets the same penumbra in metres (HIGH 2048 → ~2 texels, LOW 1024 → ~1 texel, i.e. LOW unchanged), and sets `shadow.intensity`.

**Tech Stack:** Three.js 0.185.1, Vite 8, Vitest 4.

**Spec:** the controller's brief (polish-shadows, survey item #18) and the shared rules in the session scratchpad `polish-common.md`. Values below were picked from a live sweep on a real GPU (Metal) at the Pines start, Pines POI, Woods start-back and the Neighborhood street: radius 1/2/2.5/3/4 texels × intensity 1/0.85/0.8/0.75/0.7. Radius ≥3 on HIGH washes out the cat's own cast shadow on the street; 2 keeps it. Intensity 0.8 lightens the pine wedges without losing them.

## Global Constraints

- Shadow-pass draws unchanged; no new meshes, materials or geometry; no Math.random.
- Keep shadowfit's texel snapping exactly as it is.
- LOW must not get more expensive: its radius stays ≤ 1.05 texels.
- No change to the contact-shadow decals (src/render/contactshadows.js) — they ground the cat and props.
- Files this build owns: src/render/shadowfit.js, src/render/quality.js, the sun/shadow set-up lines in src/game/walk.js. main.js gets a one-line `PCFSoftShadowMap` → `PCFShadowMap` swap (same behaviour three already forces; removes a deprecation warning).
- Tests: `npx vitest run --exclude '.claude/**' --exclude '.worktrees/**'` and `npm run build`. Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. LOW tier gets a wider kernel by accident (radius > ~1 texel) — must stay at ~1.
2. A rig built around a light whose shadow.intensity/radius was already set (verify harnesses) — createShadowFit must set both every time, not only when unset.
3. Dusk and rain dim the sun; a lighter shadow must not vanish there (checked live, not by test).
4. Acne/peter-panning on Gorge rock and buildings with the wider kernel (checked live; NORMAL_BIAS_TEXELS stays 0.7 unless shots show acne).
5. The walk.js source-shape test (`createShadowFit(sun, camera, { radius: tier.shadowFitRadius, mapSize: tier.shadowMapSize, })`) must keep passing — do not add args at the call site.

---

### Task 1: Softness and intensity in the shadow fit

**Files:**
- Modify: `src/render/shadowfit.js` (constants next to `NORMAL_BIAS_TEXELS`; `createShadowFit` body where `normalBias` is set; header comment gets a short "SOFTER SHADOWS" paragraph)
- Modify: `src/main.js:112` (`THREE.PCFSoftShadowMap` → `THREE.PCFShadowMap`, with a one-line comment that three 0.185 maps the former to the latter anyway)
- Test: `test/shadowfit.test.js` (new `it`s inside `describe('createShadowFit')`)

**Interfaces:**
- Produces (exported from shadowfit.js):
  - `export const SHADOW_SOFTNESS_M = 0.04;` — PCF spread in world metres (light space).
  - `export const SHADOW_INTENSITY = 0.8;` — how dark a full sun shadow is (three's `LightShadow.intensity`).
  - `createShadowFit(sun, camera, { radius, mapSize, lead, softness = SHADOW_SOFTNESS_M, intensity = SHADOW_INTENSITY })` — sets `sun.shadow.radius = softness / texelSize` and `sun.shadow.intensity = intensity`, unconditionally, next to normalBias.

- [ ] **Step 1: Write the failing tests** in `describe('createShadowFit')`:

```js
it('spreads PCF over the same world width on every tier, so LOW keeps its one-texel kernel', () => {
  const high = fakeSun(); const low = fakeSun();
  createShadowFit(high, chaseCamera(), { radius: HIGH.shadowFitRadius, mapSize: HIGH.shadowMapSize });
  createShadowFit(low, chaseCamera(), { radius: LOW.shadowFitRadius, mapSize: LOW.shadowMapSize });
  const texel = (t) => (2 * t.shadowFitRadius) / t.shadowMapSize;
  expect(high.shadow.radius * texel(HIGH)).toBeCloseTo(SHADOW_SOFTNESS_M, 6);
  expect(low.shadow.radius * texel(LOW)).toBeCloseTo(SHADOW_SOFTNESS_M, 6);
  expect(high.shadow.radius).toBeGreaterThan(1.9);
  expect(high.shadow.radius).toBeLessThan(2.6); // >=3 washes out the cat's own shadow
  expect(low.shadow.radius).toBeLessThanOrEqual(1.05); // LOW no wider than three's default
});

it('lightens the sun shadow to SHADOW_INTENSITY, and sets it even on a light someone already touched', () => {
  const sun = fakeSun(); sun.shadow.intensity = 0.3; sun.shadow.radius = 9;
  createShadowFit(sun, chaseCamera(), { radius: 20, mapSize: 2048 });
  expect(SHADOW_INTENSITY).toBe(0.8);
  expect(sun.shadow.intensity).toBe(0.8);
  expect(sun.shadow.radius).toBeLessThan(3);
});

it('takes softness and intensity overrides for the verify harnesses', () => {
  const sun = fakeSun();
  createShadowFit(sun, chaseCamera(), { radius: 20, mapSize: 2048, softness: 0, intensity: 1 });
  expect(sun.shadow.radius).toBe(0);
  expect(sun.shadow.intensity).toBe(1);
});
```

Plus, in `describe('the shadow fit and the hemisphere fill are actually wired up')` (it already reads walk.js source as `walkSrc`), add a main.js source check:

```js
it('asks three for PCFShadowMap by name (0.185 maps PCFSoftShadowMap to it with a warning)', () => {
  const mainSrc = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  expect(mainSrc).toMatch(/shadowMap\.type = THREE\.PCFShadowMap;/);
  expect(mainSrc).not.toMatch(/PCFSoftShadowMap/);
});
```

(Use whatever `fakeSun`/`chaseCamera`/`readFileSync` helpers the file already has; if `fakeSun` does not give a real `LightShadow`, use `new THREE.DirectionalLight()` like the existing normalBias test does. Import the two new constants.)

- [ ] **Step 2: Run them, expect FAIL** — `npx vitest run test/shadowfit.test.js` → the new tests fail (constants undefined / radius 1 / intensity 1 / PCFSoft present).

- [ ] **Step 3: Implement** the two constants and the two assignments in `createShadowFit`, and the main.js swap. Comment the constants with the why (sweep results above, cost: same 5 taps, uniforms only, shadow-pass draws unchanged; LOW stays at ~1 texel).

- [ ] **Step 4: Run** `npx vitest run test/shadowfit.test.js` → PASS; then the full suite and `npm run build` → green.

- [ ] **Step 5: Commit**

```bash
git add src/render/shadowfit.js src/main.js test/shadowfit.test.js
git commit -m "feat(shadows): softer, lighter sun shadows — a 4 cm PCF spread on every tier and shadow intensity 0.8 ..."
```

### Task 2 (controller): live before/after, perf, dusk/rain, acne check

Done by the controller with the scratchpad harness (shadows-live/shoot.mjs on Metal), not by an implementer: AFTER shots from the recorded poses, side-by-side pairs, ?perf draws/shadow draws/triangles before vs after, and a look at the Gorge rock, buildings, dusk and rain. If acne shows, tune `NORMAL_BIAS_TEXELS` in a fix commit.
