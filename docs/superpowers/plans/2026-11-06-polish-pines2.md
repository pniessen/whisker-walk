# polish-pines2 (Pass 7, build 7-2): real pines and leafy bushes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pines stop being three flat cones (tiered, jagged, drooping boughs; darker under each tier, lighter at the tips; per-tree lean and tint; a flared trunk), and `bush()` stops being a faceted green rock (a leafy shrub of small clusters, darker inside, lighter tips, size/tint drift).

**Architecture:** Both are hand-built indexed `BufferGeometry` with a `color` attribute, made with plain arrays (the `beachClumpGeometry` pattern in builder.js), so the number of uuid-bearing objects each function creates is exactly what it is today (BUILD_DRAWS pins). `pineParts()` still returns `{ trunk, cones: [3 geometries] }`: the 5 bough tiers are packed into the 3 "cone" geometries (2 + 2 + 1), and every pine has the same vertex/index counts (treefade splits a stand's index buffer into equal per-tree ranges). Per-tree drift (lean, tint) is hashed from a `seed`/`(x, z)` passed to `pineParts`. A new helper `shrubGeometry(x, z)` replaces `blobGeometry(x, z, 0.7, { lobes: 2, saltBase: 1000 })` in the non-beach branch of `bush()` and makes exactly 3 BufferGeometries (part A, part B, their merge, A and B disposed), like `beachClumpGeometry`.

**Tech Stack:** Three 0.185, Vite 8, Vitest 4.

**Spec:** scratchpad `polish-survey-7.md` (ranked #2, #6, broken #8, and the "7-2 polish-pines2" block); shared rules in scratchpad `polish-common.md` (last section).

## Global Constraints

- builder.js is shared with 4 parallel builds. Touch ONLY: `pineParts()`, `pine()`, `pineStand()`, `PINE_CONE_SIDES`, `PINE_TRUNK_SIDES`, `PINE_TRUNK_COLOR`, `PINE_FOLIAGE_COLOR`, `bush()` (non-beach branch) and a NEW `shrubGeometry()` helper placed right above `bush()`. Never touch `blobGeometry()`, `irregularLobe()`, `beachClumpGeometry()`, `heatherBed()`, `heatherSpikes()`, `warehouse()`, `scree()`, `birchTrunkGeometry()`, `tree()`.
- `PINE_CONES`, `PINE_TRUNK`, `PINE_OCCLUDER` keep their exact values (tests and the chase camera read them).
- **Containment:** every pine vertex must lie inside the pine solid that test/pines.test.js models: at local height y, horizontal radius ≤ `solidR(y)` (the widest cone holding y, else the trunk radius `rBottom` for 0 ≤ y ≤ PINE_TRUNK.h), with a small tolerance of +0.08 for droop hems; and inside `PINE_OCCLUDER` (fightcam). Lean is applied before the containment check, so lean must be small (tip offset ≤ ~0.12 m at scale 1). Max height ≤ 4.4 at scale 1 (builder test). No vertex below y = 0 (trunk flare sits on the ground).
- **Uuid / Math.random draws:** `test/waterlooks.test.js` BUILD_DRAWS unchanged (neighborhood 4408, park 2252, seaside 860, docks 6916, woods 11344, river 15484, moor 7944, pines 11580, gorge 4488). `pineParts()` creates exactly 4 BufferGeometries (1 trunk + 3 tier groups); `pine()` still merges the 3 into one (1 more); `pineStand()` merges as today. `bush()` non-beach: exactly 3 geometries. No `Math.random`, no `.clone()`, no `toNonIndexed()`, no Three primitive geometries (`ConeGeometry` etc.) created and discarded.
- **Stand fade:** stand meshes stay indexed (`setIndex`), no `groups`, and every pine has identical vertex and index counts regardless of hash, so `index.count % (trees * 3) === 0` and each tree owns one equal range (src/treefade.js prepareStand).
- Materials: pine foliage and trunk materials get `vertexColors = true` on their own material instance (as `tree()` does). `pineStand` stays exactly two meshes (`standTrunks`, `standFoliage`), both `castShadow`. `pine()` stays two meshes. `bush()` stays one Mesh (bare without wind, Group with the mesh inside with wind); same position/rotation/lift rules.
- Triangles (counted as index.count / 3): a pine today is 66 (trunk 24 + cones 42). **Ruling:** the survey's "≤ 90 per pine" was written against a half count (33); the binding limits are the area budgets: Pines ≤ +8k (106 pines), Gorge ≤ +4k (52 pines), River ≤ +1.5k, Moor ≤ +1k. Target ≤ 130 triangles per pine. A bush today is 100; target ≤ 150 (River has 28 bushes, ≤ +1.5k per area, Woods ≤ +800).
- Determinism: everything from `hash01`. Same inputs → byte-identical `position` and `color` arrays.
- Flat trace stays sha256 `af07901717f1b39482a7befce20f1a80dc09c7e31866ab11bb7459e61d97b83a`. No collider, perch, spawn, keep-out or route moves.
- Tests: `npx vitest run --exclude '.claude/**' --exclude '.worktrees/**'` (long sweeps: explicit 120_000 timeouts); `npm run build`. Commits: explicit `git add <paths>` (never node_modules), message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

### Task 1: tiered pines (`pineParts`, `pine`, `pineStand`)

**Files:** Modify `src/world/builder.js` (pine block ~l.5375–5476). Create `test/pines2.test.js`. Adjust `test/builder.test.js` pine asserts only if they pin the old cone shape (keep their intent).

**Shape (rulings; tune within these):**
- **Trunk:** `PINE_TRUNK_SIDES` 6, same rTop/rBottom/h/y, indexed, from y 0 to y 1.6; add a root flare: a bottom ring at y 0 with radius `rBottom * 1.45` clamped so the flare stays inside `solidR` + tolerance? — NO: the flare is below the cones, so containment there is the trunk radius `rBottom`; the pines test's `solidR` uses `rBottom` for the trunk band. **Ruling:** the flare is 1.3 × rBottom at y 0 tapering to rBottom by y 0.25; the containment test allows the flare (y < 0.3) up to 1.35 × rBottom. Bark colour by vertex: darker at the foot, a little lighter up the stem. No caps needed (bottom cap never seen; top cap hidden in foliage).
- **Boughs:** 5 tiers spanning the three PINE_CONES' heights (bottom tier ~y 1.15–2.4, top tier ending in the tip at ≤ 4.35). Each tier is a skirt: an apex ring (small radius, or a single apex vertex for the top tier) and an outer hem ring of `PINE_CONE_SIDES` = 9 (tune 8–10) points; the hem alternates long points that droop (lower y, full radius) and short notches (higher y, ~0.7 radius), so the silhouette is jagged. Underside: a shallow inner ring under the hem so each tier has a visible darker underside (a few triangles), or rely on the next tier — choose what reads, within budget.
- **Colour:** per vertex, linear: apex/inner ~0.55 × base, hem tips ~1.15 × base with a slight yellow-green shift on the tips; underside vertices ~0.45. Base green PINE_FOLIAGE_COLOR (may be retuned slightly) with a per-tree tint drift from hash (hue ±4°, lightness ±0.04).
- **Per-tree drift:** `pineParts(seedX, seedZ)` (hashed): lean (rotate about a horizontal axis, tip offset ≤ 0.12), tier radii ×(0.94–1.0), per-tier twist so hems don't line up. Same counts for every tree.
- Packing: tiers 0+1 → cones[0], 2+3 → cones[1], 4 → cones[2] (or any fixed split) so `pineParts` returns 4 geometries.
- `pine(x, z, scale)` and `pineStand` pass the tree's (x, z) to `pineParts`; `pineStand` keeps its turn/scale/translate placement and lifted `y`.

- [ ] **Step 1: failing tests in `test/pines2.test.js`**
  - `pine(x, z)` at 8 spots: 2 meshes; foliage geometry indexed with a `color` attribute; trunk has `color`; triangles per pine (both meshes) between 90 and 130; same (x, z) → byte-identical position + colour; two spots differ.
  - containment: every vertex of pine() (group local frame, scale 1) has horizontal radius ≤ solidR(y) + 0.08 (flare band y<0.3: ≤ 1.35 × rBottom) and 0 ≤ y ≤ 4.4; also inside PINE_OCCLUDER (some cyl holds it, +0.08).
  - colour: mean luminance of foliage vertices in the lowest 20% of each tier (underside/inner) < mean of the hem tips by ≥ 0.1; the hem is jagged: hem vertex y values within a tier take at least 2 distinct heights.
  - stand: `pineStand` of 5 trees with mixed scales: standFoliage/standTrunks indexed, no groups, `index.count % (5*3) === 0`, each tree's range has the same count; vertex count = 5 × one pine's.
  - Math.random is not called by pine()/pineStand() beyond uuid draws: spy on Math.random, count calls for `pine(1,2)` before/after — equals the count of uuid-bearing objects × 4 (compute: 5 geometries + 2 materials + 2 meshes + 1 group = 10 objects → 40) — or simply assert the count equals what the baseline produced (record from main: write the number in the test with a comment).
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3:** implement.
- [ ] **Step 4:** `npx vitest run test/pines2.test.js test/builder.test.js test/pines.test.js test/fightcam.test.js test/treefade.test.js test/waterlooks.test.js test/flattrace.test.js test/minimaptrees.test.js test/gorge.test.js` → PASS.
- [ ] **Step 5:** commit `feat(pines2): tiered pines with drooping jagged boughs, darker undersides, lean and a root flare`.

### Task 2: leafy shrubs (`bush()` non-beach, new `shrubGeometry`)

**Files:** Modify `src/world/builder.js` (`bush()` ~l.3526 non-beach branch; new `shrubGeometry(x, z)` above `bush()`). Create `test/shrubs.test.js`. `test/builder.test.js` bush asserts must still pass (bounding sphere < 0.91 with the mesh at y 0.5; one bare Mesh; determinism).

**Shape:** 5 leaf clusters (4–6 by hash, but **fixed vertex count**: always build 6 and collapse? — No: counts may differ per bush; bushes are not stand-merged. Still keep ≤ 150 tris) around a hidden core, each a small low-poly lumpy dome (e.g. an 8-point ring + apex, or a displaced octahedron-ish cluster, ~20–24 tris), cluster centres around the origin within r ≤ 0.55 so the bounding sphere stays < 0.91 (mesh origin is the bush's belly at y 0.5; the clusters' bottoms reach to about y −0.5, i.e. the ground). Vertex colour: inner/lower ~0.6 × base, outer tips ~1.1 × base, per-cluster shade drift; base green `organicTint(0x5aa04e, x, z, 1010, 8)` moved into vertex colours with material colour white and `vertexColors: true` (or keep material tint and use colour as a multiplier — either; the dusk pass in walk.js must still darken it: check how walk.js dusks foliage, and keep the material type/`surfaceProps('foliage')`). Exactly 3 BufferGeometries (A, B, merge; dispose A, B), indexed.
- [ ] Step 1: failing tests: one Mesh; `color` attribute; ≤ 150 triangles; determinism; different spots differ; bounding sphere radius < 0.91; lowest-20% vertices darker than highest-20% by ≥ 0.1; Math.random call count of `bush(3,4)` equals baseline (record on main).
- [ ] Step 2: FAIL. Step 3: implement. Step 4: run builder/den/park/neighborhood/river/waterlooks/flattrace tests → PASS. Step 5: commit `feat(pines2): leafy shrubs from small leaf clusters`.

### Task 3: numbers, live check, ghost probe (parent session)

- Triangles before/after for every area, den and island (scratchpad `snaps-polish-pines2/tris.mjs`, `parts.mjs`); raise no dressing pin beyond what's added (with a comment).
- AFTER shots from the same spots; 4–8 pairs incl. phone 390.
- Real-camera probe of the pine-stand ghost (broken #8): document for the parent; treefade.js is not this build's.
- Full suite + `npm run build`.
