# polish-tufttint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Grass tufts take the painted ground colour under them (River marsh, Moor crest/hollow/bracken), every map's tufts get natural clustered hue and height variation, and about 3% of lawn tufts (Park, Neighbourhood) carry white or yellow flower tips — still one InstancedMesh, one draw, no extra triangles.

**Architecture:** All work is in `src/render/grass.js`. A per-walk, lazily filled tint grid samples the area's exported ground-tint function (`riverGroundTint`, `moorGroundTint`, already exported) at 1 m and is read bilinearly when a chunk is re-laid, multiplying each tuft's instance colour. Hue/height variation comes from slow patch noise plus per-tuft hashes inside `tuftAt`. Flowers are one extra `InstancedBufferAttribute` (`aFlower`, vec4) that the existing `onBeforeCompile` patch mixes into `vColor` on tip vertices only.

**Tech Stack:** Three.js 0.185 (InstancedMesh, onBeforeCompile), Vitest 4.

**Spec:** scratchpad `polish-survey-4.md` — ranked #7, broken #5, Pass 4B section "4B-3 polish-tufttint"; shared rules in scratchpad `polish-common.md`.

## Global Constraints

- One InstancedMesh, one material, ONE draw call, zero shadow-pass draws, `TRIANGLES_PER_TUFT` unchanged (10). No new meshes.
- Deterministic: only `hashCell` / `patchNoise` (integer hashes); no Math.random, no walkRng / strayStream draws. A spot of ground always grows the same tuft with the same colour.
- Render-only: flat trace sha256 `3dfb11a4d847498330c2f1bbc766add06531d4efadaab4c710868df495c1d838` unchanged; waterlooks BUILD_DRAWS unchanged (grass is created in walk.js after the build, never inside `build()`).
- Reduced motion: no new motion (tint/flowers are static).
- Keep `flatFootprints`' trail-capsule masking (polish-paths) exactly as is.
- Don't edit woods.js / pines.js (polish-forestfloor owns them). `riverdress.js` / `moordress.js` are read-only (their tint functions are already exported).
- Lawn tufts stay under the cat: lawn `h` ≤ `TUFT_MAX_H * 1.35` (0.2025 m); every style's tallest tuft ≤ 0.4 m.
- Tests run with `npx vitest run --exclude '.claude/**' --exclude '.worktrees/**'`; long sweeps get explicit timeouts (120_000).
- Commits: explicit `git add <paths>`, message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- Re-lay cost: sampling `moorGroundTint` (≈6 smoothFields + waterDist) per tuft per re-lay could hitch a frame; the lazy grid must make a steady-state re-lay sample only new cells. Test: a second re-lay one chunk over samples far fewer than tufts laid (Task 1).
- Tufts off the tint grid (outside bounds, e.g. `x = ±49.9`) must not read garbage/NaN — clamp to the grid. Test in Task 1.
- Flower colour must survive the material colour multiply (pre-divided by the linear material colour), and must never appear on non-lawn styles. Test in Task 3.
- Circular imports: grass.js importing riverdress/moordress (which import river.js/moor.js) must load cleanly when grass.js is the first module imported (test/grass.test.js does this). Covered by the existing suite loading.
- Golden for lawn tufts (`test/grass.test.js` "lawn tufts are unchanged by the style refactor"): x, z, rot must stay byte-identical; only `tint` (and `h`/`s` on the rare tall cells) may change — update the GOLD deliberately and note it in the commit.

---

### Task 1: Tufts take the ground tint (River, Moor)

**Files:**
- Modify: `src/render/grass.js` (imports; new exports `GROUND_TINTS`, `tintSampler`; `createGrass` relay)
- Test: `test/grass.test.js` (new `describe('ground tint under tufts')`)

**Interfaces:**
- Produces: `export const GROUND_TINTS = Object.freeze({ river: riverGroundTint, moor: moorGroundTint })` (import from `../world/riverdress.js` / `../world/moordress.js`).
- Produces: `export function tintSampler(fn, bounds, cell = 1) -> { at(x, z, out: number[3]) -> out, samples: number }` — a lazily filled grid of `fn` at cell corners over `bounds` (Float32Array ×3 plus a filled-flag Uint8Array), read bilinearly; points outside bounds clamp to the edge. `samples` counts `fn` calls (for the cost test).
- Produces: the returned rig from `createGrass` gains `tint` (the sampler or null) for tests.
- Per style a new field `ground` (0..1): how far the tuft follows the ground tint: `tint = lerp([1,1,1], groundTint, style.ground)` multiplied into the instance colour. Values: MARSH 0.9, MOOR 0.9, all others 0 (no tint function anyway; LAWN/DUNE/WOODLAND/PINE_FLOOR/GORGE_FLOOR get `ground: 0`).

- [ ] **Step 1: Write failing tests**
  - `tintSampler matches the function at grid corners and between them`: with `fn = (x, z) => [1 + x / 100, 1, 1 - z / 100]` and bounds ±50, `at(10, -20)` ≈ `[1.1, 1, 1.2]` (toBeCloseTo 6) and `at(10.5, -20.5)` ≈ `[1.105, 1, 1.205]` (linear fn → bilinear exact).
  - `tintSampler clamps outside its bounds`: `at(80, 0)` equals `at(50, 0)`; no NaN.
  - `tintSampler only samples new cells`: after `at` over a 10×10 m block at 0.3 m steps, `samples` ≤ 11*11+ a few; repeating the same block adds 0 samples.
  - `River and Moor tufts follow the ground tint`: build the river (and moor) walk scene with `walkScene`, `createGrass`, aim the camera at a spot; for every laid instance i, read `mesh.getColorAt(i)` and compare with `tuftAt(...).tint` × `lerp(1, moorGroundTint(x,z), 0.9)` (x,z from the instance matrix) within 0.03 per channel. Then assert the instance colours over a hollow (Moor (-12,-10)) and a crest/bracken spot (Moor (8,24)) differ in mean red/green ratio by > 0.05. Timeout 120_000.
  - `lawn tufts ignore ground tint`: park rig `tint` is null.

- [ ] **Step 2: Run** `npx vitest run test/grass.test.js` — new tests FAIL (exports missing).

- [ ] **Step 3: Implement** `GROUND_TINTS`, `tintSampler`, the `ground` style field, and in `createGrass`: `const tint = GROUND_TINTS[areaId] && style.ground > 0 ? tintSampler(GROUND_TINTS[areaId], areaData.bounds) : null;` and in `relay` multiply `t.tint` by `1 + (g[k] - 1) * style.ground` per channel before `setColorAt`. Reuse one scratch array; no allocation per tuft.

- [ ] **Step 4: Run** `npx vitest run test/grass.test.js test/moordress.test.js test/riverdress.test.js` — PASS.

- [ ] **Step 5: Commit** `feat(grass): River and Moor tufts take the painted ground tint under them`.

### Task 2: Natural hue and height variation on every map

**Files:**
- Modify: `src/render/grass.js` (`tuftAt` tint and height)
- Test: `test/grass.test.js` (lawn GOLD update + new variation tests)

**Interfaces:**
- Consumes: nothing new. `tuftAt(ix, iz, spacing, style)` keeps its signature and return shape `{ x, z, h, s, rot, tint: [r,g,b] }`.
- Per style new field `hue` (0..1): strength of the patch-scale hue drift. LAWN 0.12, DUNE 0.1, WOODLAND 0.1, MARSH 0.12, MOOR 0.14, PINE_FLOOR 0.08, GORGE_FLOOR 0.06.

- [ ] **Step 1: Write failing tests**
  - `tufts drift in hue in patches, not white noise`: over a 40×40 m lattice of LAWN tufts, compute `g/r` per tuft. Its spread (max−min) ≥ 0.18 (today ≈ 0.1). And neighbouring tufts (1 cell apart) correlate: mean |Δ(g/r)| between neighbours < 0.75 × mean |Δ(g/r)| between tufts 30 cells apart.
  - `a few tufts stand taller`: for each style, between 3% and 8% of grown tufts have `h > style.hMax` (sampled over 20k cells), and no lawn tuft exceeds `TUFT_MAX_H * 1.35`; no style exceeds 0.4 m.
  - Update `lawn tufts are unchanged by the style refactor`: keep x, z, rot assertions against GOLD exactly; compare `h`/`s` only on GOLD cells that are not tall; drop the `tint` comparison (renamed `lawn tuft positions are unchanged`). Brightness stays in [0.8, 1.2] per channel.

- [ ] **Step 2: Run** — FAIL.

- [ ] **Step 3: Implement** in `tuftAt`:
  - Hue: `const drift = (patchNoise(x, z, 5.5, 71) - 0.5) * 2 * style.hue;` positive leans yellow-warm (`r *= 1 + drift`, `b *= 1 - drift`), negative leans cool blue-green (`r *= 1 + drift`, `g *= 1 - drift * 0.3`), plus the existing per-tuft brightness `v` and warm lean.
  - Height: `hashCell(ix, iz, 12) < 0.05` → `h *= 1.3`, `s *= 0.9` (a lone taller stalk). Keep `rot`, `x`, `z` formulas untouched.

- [ ] **Step 4: Run** `npx vitest run test/grass.test.js` — PASS.

- [ ] **Step 5: Commit** `feat(grass): clustered hue drift and a few taller stalks on every map`.

### Task 3: Lawn flowers (white and yellow tips)

**Files:**
- Modify: `src/render/grass.js` (`tuftAt` `flower` field, `createGrass` attribute + shader patch)
- Test: `test/grass.test.js`

**Interfaces:**
- Consumes: Task 2's `tuftAt`.
- Produces: `tuftAt(...)` returns `flower: null | 'white' | 'yellow'`. Per style field `flowers` (fraction): LAWN 0.03, all others 0.
- Produces: `export const FLOWER_COLORS = Object.freeze({ white: 0xf6f2e8, yellow: 0xf2cf3a })`.
- Mesh gains `geometry.attributes.aFlower` — `THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4)`, DynamicDrawUsage, update range set like instanceColor. rgb = linear(flower) / linear(material.color) per channel; a = 1 for a flower, 0 otherwise.

- [ ] **Step 1: Write failing tests**
  - `about 3% of lawn tufts flower, half white half yellow`: over 20k lawn cells, flowered/grown in [0.02, 0.04]; each colour 35–65% of flowers. Non-lawn styles: 0 flowers.
  - `flowers ride the one grass mesh`: park rig: `mesh.geometry.attributes.aFlower` exists, itemSize 4; for some flowered instance i, `aFlower.getW(i) === 1` and `aFlower.getX(i) * material.color.r` ≈ linear(FLOWER_COLORS[f]).r (toBeCloseTo 4); still exactly one mesh named 'grass', `castShadow` false, `TRIANGLES_PER_TUFT === 10`.
  - `the shader mixes flowers into tips only`: call `material.onBeforeCompile` with a fake `{ uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader }` and assert the output contains `attribute vec4 aFlower` and `aFlower.a` after `#include <color_vertex>`.

- [ ] **Step 2: Run** — FAIL.

- [ ] **Step 3: Implement**: `flower` from `hashCell(ix, iz, 13) < style.flowers`, colour by `hashCell(ix, iz, 14) < 0.5`. In the vertex patch add `attribute vec4 aFlower;` to the common block and after `#include <color_vertex>`: `vColor.rgb = mix(vColor.rgb, aFlower.rgb, aFlower.a * step(0.75, position.y));` (tips are at local y 1.0 and 0.8, roots at 0). Flower tufts skip the ground tint multiply on the tip only by construction (aFlower replaces vColor there).

- [ ] **Step 4: Run** `npx vitest run test/grass.test.js` then the full suite and `npm run build` — PASS.

- [ ] **Step 5: Commit** `feat(grass): daisies and buttercups on a few lawn tufts`.

### After the tasks (lead, not a subagent)

- Live AFTER shots from the same spots (`tufttint-tools/shots.mjs`), pairs via `pair.py`; perf readout draws before/after in River and Moor; flat-trace hash check; merge main, re-run suite + build + trace.
