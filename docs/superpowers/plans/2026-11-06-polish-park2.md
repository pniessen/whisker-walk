# polish-park2 (Pass 6, build 6-4): soft gravel paths, a real fountain, tame lamp globes

> For agentic workers: run with superpowers:subagent-driven-development. One implementer per task, a task review after each, a final whole-branch review on opus, one fix wave.

**Goal.** The City Park stops looking like the one green map left on hard grey slabs. Its five walks become one soft gravel ribbon with an edging line and round joints; the glass-tube fountain becomes a two-tier stone fountain with falling drops and basin ripples; and lamp globes stop blowing out into white suns when the camera is near them at dusk.

**Source.** scratchpad/polish-survey-6.md, ranked #4 and the "6-4" section of "Pass 6". Shared rules: scratchpad/polish-common.md.

**Branch / worktree / port.** `polish-park2`, `.worktrees/polish-park2`, Vite 5295 only. node_modules is a symlink: never `git add` it; always add explicit paths.

**Files owned.**
- `src/world/park.js` (whole file).
- `src/world/pathribbon.js`: add a gravel look only. Every other map's trail must stay byte-identical; `test/trailidentity.test.js` (committed first, hashes recorded on 1a3abad) proves it.
- `lampPost()` in `src/world/builder.js` only (five other builds touch builder.js in other functions).
- Tests: `test/park.test.js`, `test/pathribbon.test.js` (additions), new test files as needed.

**Hard constraints.**
- Determinism: no Math.random; waterlooks `BUILD_DRAWS.park` stays 2252, neighborhood 4408, docks 6916, seaside 860 (lampPost is shared). Every new mesh/geometry/material in park.js is made under `withLocalUuids('park-…')`, or it reuses an existing constructor call slot (changing a geometry's *type/params* in an existing slot is fine: still one geometry).
- Flat trace stays sha256 af07901717f1b39482a7befce20f1a80dc09c7e31866ab11bb7459e61d97b83a.
- Gameplay unchanged: colliders, perches (the fountain-edge lookout at (2.8, 22.2, y 0.75)), scenics, POIs, waters and the five hidden 1×1 'path' footprint strips (same params, same order) stay where they are.
- Park triangles ≤ +6k (20,535 now; cap 40k). Draw calls flat-ish: new dressing is ≤ 4 new meshes, none in the shadow pass (`castShadow = false`, `userData.noCast = true` where rig.js reads it), animated meshes `userData.noMerge = true`.
- Tests: `npx vitest run --exclude '.claude/**' --exclude '.worktrees/**'` all green (give long sweeps 120_000 timeouts); `npm run build` green. Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

## Task 1 — gravel trail look + Park paths onto addTrails (opus)

**pathribbon.js**
1. Keep `TRAIL_LOOK` exactly as is. Add `export const GRAVEL_LOOK` (same keys) tuned for a tended park walk:
   - tidy edge: wobble amplitudes ~0.03 / 0.015 / 0.008 (same wavelengths);
   - crisper feather (featherIn ≈ -0.06, featherOut ≈ 0.05);
   - a thin darker **edging line** just inside the edge (new keys, e.g. `edgeLine: [-0.16, -0.03]` sd range with soft ends, `edgeLineTint` ≈ [0.62, 0.60, 0.56]); no greenish damp band (edgeTint ≈ neutral);
   - fine dense gravel: pebbleCell ≈ 0.16, chance ≈ 0.4, radii 0.018–0.04, a mix of light and darker stones (new optional key, e.g. `pebbleDark` tint used on a hash split);
   - small centreLift (worn middle) and blotch.
   - `export const TRAIL_LOOKS = { trail: TRAIL_LOOK, gravel: GRAVEL_LOOK }`.
2. Thread a `look` through: `trailWobble/trailField/quadRadius/trailReach` get an optional look argument defaulting to `TRAIL_LOOK`; `fragBody(look)`, `fragDecl` unchanged; `installTrailShader(material, segs, uniforms, look)`; `trailMaterial(color, surface, segs, look)`. Shader text for the default look must be **character-identical** to today's: emit the edging-line and dark-pebble GLSL only when the look defines those keys. `customProgramCacheKey` stays `'trail' + n` for the default and is `'gravel' + n` for gravel.
3. `addTrails(scene, groups, style, key, { edge, decks, waters, extend })`: `style.look` (string key into TRAIL_LOOKS, default 'trail'); `extend` overrides EDGE_EXTEND for map-edge ends (default unchanged). The look name goes in `mesh.userData.trailLook`.
4. `trailSegments(groups, opts)` honours `opts.extend` (default EDGE_EXTEND).

**park.js**
5. Export `PARK_PATHS` (the five segments exactly as today, same order: (0,48)-(0,20), (0,20)-(-4,4), (-4,4)-(-8,-18), (-8,-18)-(12,-30), (0,20)-(16,10)), and replace the five `b.path(...)` calls with one `addTrails(scene, [{ segs: PARK_PATHS, w: 3 }], { surface: 'gravel', color: <pale warm gravel, ruling>, look: 'gravel' }, 'park', { edge: 48, extend: 13 })` so the south end runs on out to the hedge gate at z ≈ 60.6 instead of stopping square in the lawn. Hidden strips: same 5, same params/order, so BUILD_DRAWS.park stays 2252 (verify).
6. Fix `test/park.test.js` "all five gravel walks" only if it breaks (the hidden strips keep the gravel material); add: Park has one visible pathTrail with `userData.trailLook === 'gravel'`, five hidden strips, no trail alpha in the pond (sample like trails.test.js), and the trail ends at the gate.
7. `test/trailidentity.test.js` must still pass unchanged.

## Task 2 — the two-tier fountain (opus)

In park.js, keep the three existing constructor slots in order (basin, water disc, spire) but upgrade them; add the rest under `withLocalUuids('park-fountain', …)`:
1. **Basin** (slot 1): a `LatheGeometry` stone profile, ~32 segments: plinth r 2.65 at the ground, wall up to ~0.55, a rounded lip out to r ~2.6 whose top is ~0.70 (the fountain-edge perch is y 0.75), inner wall down to the water at y ~0.6. Same material call.
2. **Water disc** (slot 2): stays CylinderGeometry and the 'water' preset (park.test pins both); r 2.25, ~32 segments.
3. **Spire** (slot 3): a `LatheGeometry` pedestal: a flared foot in the basin, a slim column (r ~0.18) with a collar, an **upper bowl** (rim r ~0.85 at y ~1.55, shallow inside), a small top spout column and a ball finial (top ~2.2). Same material call.
4. Under withLocalUuids, as children of the fountain group:
   - **upper water**: a small disc in the upper bowl (y just under its rim), the 'water' preset;
   - **drops**: ONE mesh of small stretched octahedra (≈ 24 streams round the upper bowl rim × 6 drops, + ≈ 8 jets from the spout × 5 drops), animated in the vertex shader along parabolic arcs (rim → basin water at r ~1.6; spout → upper bowl) by a `uTime` uniform set in `onBeforeRender` from `performance.now()` (docksdressing.js gull pattern), frozen at a fixed time when `water.reducedMotion`. Pale water-blue, slightly transparent, `noMerge`, no shadow;
   - **ripples**: ONE mesh of small flat quads (one per landing point in the basin + a few in the upper bowl) whose fragment shader draws an expanding, fading ring from the same `uTime` (phase from index; deterministic), transparent, depthWrite false, no shadow.
5. Update park.test.js's fountain test to find the parts by name (fountainBasin/fountainWater/fountainSpire) and keep its assertions; add a test that the extras are local-uuid (BUILD_DRAWS unchanged), noCast, noMerge on animated parts, and Park triangles ≤ 26,535.

## Task 3 — lamp globes don't blow out near the camera (opus)

`lampPost()` in builder.js only. The dusk swap (render/dusk.js, not ours) gives each globe its own material at emissiveIntensity 2.4. Add an `onBeforeRender` on the globe mesh that scales the current material's emissive intensity down as the camera gets close: full at ≥ ~9 m, down to ~0.35 of base at ≤ ~2.5 m (smooth), remembering the base per material (so a material swap re-reads it) and only acting when base > 1 (daytime globes untouched). No new objects (draw counts for neighbourhood/park/docks/seaside/den unchanged). Unit-test the falloff function (exported pure helper) and that onBeforeRender restores/caps correctly across a material swap.

## Verification (parent)
- `test/trailidentity.test.js`, waterlooks, flattrace, budget, park, water, trails, pathribbon green; full suite + build.
- tris6 before/after for park + neighbourhood (and docks/seaside/den for lampPost: no change).
- Live: fixed spots (scratchpad/park2/fixed.mjs) + walk.mjs park day/dusk/phone; Neighbourhood dusk lamp regression; pairs in snaps-polish-park2/pairs (≥ 1 phone 390, ≥ 1 dusk).
