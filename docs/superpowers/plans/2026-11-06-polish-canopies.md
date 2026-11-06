# polish-canopies (Pass 6, build 6-2): trees with shapes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every broadleaf `tree()` stops being the same 2-lobe faceted ball: three canopy kinds (oak, birch, round) picked by hash, a darker under-canopy and faceted leaf shading by vertex colour, per-tree size/tint drift, and a few big old oaks in the Woods.

**Architecture:** A new helper `canopyGeometry(x, z, kind)` in `src/world/builder.js` (next to `tree()`) builds each kind's canopy from exactly two `IcosahedronGeometry` lobes merged once — the same three uuid-bearing geometries `blobGeometry(x, z, 1.6, { lobes: 2 })` makes today, so the pinned Math.random draw counts don't move — and paints a `color` attribute (under-canopy darkening + per-face leaf shade). `tree()` picks the kind with `canopyKind(x, z)` (overridable by `opts.kind`) and reads per-kind numbers (canopy centre, radius, occluder, trunk look) from one frozen table `CANOPY_KINDS`. `woods.js` passes `kind: 'old'` to a handful of hash-picked spots near the camp and trail; positions, scales, colliders and perches stay byte-identical.

**Tech Stack:** Three 0.185, Vite 8, Vitest 4.

**Spec:** scratchpad `polish-survey-6.md`, ranked row #2 and the "6-2 polish-canopies" block of "Pass 6"; shared rules in scratchpad `polish-common.md` (last two sections).

## Global Constraints

- Own only `tree()` + the new canopy helper(s)/constants in `src/world/builder.js`, and the tree loop in `src/world/woods.js` (~l.680–705). **Never touch** `blobGeometry()`, `irregularLobe()`, `blobField()`, `bush()`, `lampPost()`, `logBridge()`, `willow()`, `willowOccluder()` (other parallel builds own them). `willow()` and `bush()` must produce byte-identical geometry to before.
- `test/waterlooks.test.js` BUILD_DRAWS unchanged: neighborhood 4408, park 2252, seaside 860, docks 6916, woods 11344, river 15484, moor 7944, pines 11580, gorge 4488. Per tree: one trunk geometry, exactly two `IcosahedronGeometry` + one `mergeGeometries` result for the canopy, one material each, same Object3D count. No `Math.random`, no `toNonIndexed()`, no `.clone()` of geometries in the canopy path.
- Flat trace stays sha256 `af07901717f1b39482a7befce20f1a80dc09c7e31866ab11bb7459e61d97b83a` (`test/flattrace.test.js`). No collider, perch, spawn, keep-out or route moves. `woodsTreeSpots()` output unchanged.
- One trunk mesh + one canopy mesh per tree (`tree.children[0]` trunk, `[1]` canopy). `trunk` CylinderGeometry stays height 2 centred at y 1 (climbing.js's Sure Claws fork math assumes it); trunk radii stay ≤ 0.35 bottom so the trunk stays inside collider `0.5*scale`.
- `g.userData.canopy = { y, r }` and `g.userData.occluder` are truthful per kind: every vertex inside the occluder solids (`test/fightcam.test.js` checks), `canopy.y` the canopy centre and `canopy.r` its horizontal radius (ambient leaf-fall, minimap crown).
- Determinism: everything from `hash01(x, z, salt)`; same (x, z, kind) → byte-identical positions and colours.
- Triangles: Woods ≤ +6,000 over 58,148 (built). Report Park, River, Neighbourhood, Moor, Pines(island), den.
- Tests: `npx vitest run --exclude '.claude/**' --exclude '.worktrees/**'` (long geometry sweeps get explicit 120_000 timeouts); `npm run build`. Commits: explicit `git add <paths>` (never node_modules), message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. A tree at a spot where the kind hash lands on the boundary between kinds must still be deterministic and occluder-contained — covered by the fightcam sweep plus Task 1's grid test.
2. The Great Oak (`woods.js` `greatOak`, perch at y 2.1, golden-mouse limb at 1.9/scale) must keep a canopy that doesn't swallow the limb or the mouse: Task 2 forces it to kind `'oak'` and `test/woods.test.js` must stay green.
3. `mergeStaticProps` on trees built without `wind` (Moor hawthorn, tests) must not throw on the new `color` attribute — Task 1 test builds the Moor and runs `mergeStaticProps`.
4. Dusk: walk.js's dusk pass darkens foliage materials; a vertex-colour canopy must not go black or neon at dusk — checked live (Task 3).
5. Birch canopies are narrow: `userData.canopy.r` must shrink with them, or leaves fall from thin air beside a birch (Task 1 asserts per-kind `r`).

---

### Task 1: canopy kinds in `tree()` (builder.js)

**Files:**
- Modify: `src/world/builder.js` (the TREE_OCCLUDER block ~l.2999–3010 may gain per-kind occluder constants; `tree()` ~l.3029–3071; new `CANOPY_KINDS`, `canopyKind()`, `canopyGeometry()` placed just above `tree()`)
- Create: `test/canopies.test.js`
- Possibly adjust: `test/builder.test.js` "organic canopy (dice fix)" asserts that pin the old 1.6-radius ball (footprint < 1.6*1.3 is per-kind now) — update to per-kind bounds, never delete the determinism checks.

**Interfaces:**
- Produces: `export const CANOPY_KINDS` (frozen: `{ oak, birch, round, old }`, each `{ y, r, occluder, ... }`), `export function canopyKind(x, z) -> 'oak'|'birch'|'round'`, `export function canopyGeometry(x, z, kind) -> THREE.BufferGeometry` (non-indexed, has `position`, `normal`, `color`), `tree(x, z, scale = 1, { wind, kind } = {})`; the Group gets `userData.canopyKind = kind`. `TREE_OCCLUDER` stays exported and equals the `round` kind's occluder (fightcam and older tests import it).

**Shapes (rulings; tune within these):**
- **round** — today's look refined: primary lobe IcosahedronGeometry(r·0.88, detail 1) + one secondary lobe at detail 1 (not 0), both displaced by your own low-frequency field (copy the idea of `blobField`, don't call into `blobGeometry`), centre y 2.8, r 1.6.
- **oak** — wide and clumpy: primary IcosahedronGeometry detail 2, each vertex's radius set by the union of 3–4 hash-placed lump spheres along its direction (cluster silhouette), squashed ~0.8 in y; secondary lobe detail 0 as a low side lump. Centre ~y 2.9, r ~1.9.
- **birch** — narrow, tall: primary detail 1 stretched ~1.6× in y, r ~1.1, secondary detail 0 small lump high on one side; centre ~y 3.3. Trunk thinner (top 0.16, bottom 0.24), pale bark colour (~0xe6e1d4) with dark horizontal marks as a vertex `color` attribute on the trunk (material `vertexColors: true`).
- **old** — Woods only via `opts.kind`: oak recipe, detail 2 + detail 1, r ~2.3, centre ~y 3.0, trunk bottom ≤ 0.35 (collider rule), darker green.
- **All kinds:** per-tree non-uniform scale drift ±10%, `organicTint` hue drift (kind base greens: oak 0x4a8c3c, birch 0x6aa64a, round 0x4e9440, old 0x3f7d36); vertex colour = height term (bottom of canopy ~0.62, top 1.0, smoothstep) × per-face shade (each triangle's 3 vertices share one value in 0.86–1.0 from hash of its centroid direction) — darker hollows and readable small facets. Material `vertexColors: true`. Kind mix from `canopyKind`: roughly oak 40%, round 35%, birch 25% (hash01(x, z, 41)).
- Exactly two IcosahedronGeometry + one mergeGeometries per canopy (BUILD_DRAWS). Occluder per kind: `[trunk cyl, { t: 'ell', y, r, ry }]` sized to hold every vertex with margin.

- [ ] **Step 1: Write failing tests in `test/canopies.test.js`**
  - `canopyKind` over a 40×40 grid (x, z in −100..100 step 5): all three kinds appear, each ≥ 15%; same (x, z) twice → same kind.
  - for each kind in `['oak','birch','round','old']` at 6 spots: `tree(x, z, 1, { kind })` has exactly 2 meshes; canopy geometry has a `color` attribute; same inputs → byte-identical `position` and `color` arrays; mean colour of the lowest 20% of vertices (by y) < mean of the top 20% by ≥ 0.15; every canopy vertex (canopy local → group frame) lies inside the kind's occluder ellipsoid; `userData.canopy.r` within ±0.25 of the canopy's max horizontal radius in the group frame; `userData.canopyKind === kind`.
  - triangle counts per canopy: round ≤ 160, birch ≤ 100, oak ≤ 340, old ≤ 420.
  - `tree(x, z)` with no `kind` uses `canopyKind(x, z)`.
  - birch trunk has a `color` attribute and is lighter on average than an oak trunk's material colour.
  - Moor: `build(new THREE.Scene(), {})` then `mergeStaticProps(scene)` does not throw (timeout 120_000).
- [ ] **Step 2:** run `npx vitest run test/canopies.test.js` → FAIL (exports missing).
- [ ] **Step 3:** implement per the shapes above.
- [ ] **Step 4:** run `test/canopies.test.js test/builder.test.js test/fightcam.test.js test/waterlooks.test.js test/flattrace.test.js test/treefade.test.js test/minimaptrees.test.js test/woods.test.js test/budget.test.js` → all PASS (waterlooks counts unchanged is a hard gate).
- [ ] **Step 5:** commit `feat(trees): oak, birch and round canopies with under-canopy shade`.

### Task 2: a few old oaks in the Woods

**Files:**
- Modify: `src/world/woods.js` tree loop (~l.680–705)
- Test: `test/canopies.test.js` (append)

**Interfaces:**
- Consumes: `tree(x, z, scale, { wind, kind })` from Task 1.
- Produces: `export function woodsOldOaks(spots) -> Set<number>` (indices into `woodsTreeSpots()`), pure.

- [ ] **Step 1: failing tests** — `woodsOldOaks(woodsTreeSpots())` returns 4–6 indices, each spot within 16 m of the Woods camp centre (`campLayout('woods')`) or within 6 m of a `WOODS_PATHS` segment (use `segDist`), deterministic; a built Woods scene has that many groups with `userData.canopyKind === 'old'`; `greatOak`'s `userData.canopyKind === 'oak'`; `woodsTreeSpots()` is unchanged: length 69, first three `[{"x":-7.61,"z":-46.95,"scale":1.07},{"x":3.44,"z":-45.4,"scale":1.09},{"x":9.32,"z":-45.67,"scale":1.51}]`, last three `[{"x":25.81,"z":34.65,"scale":1.58},{"x":32.86,"z":34.33,"scale":1.27},{"x":44.34,"z":34.83,"scale":1.2}]` (recorded on main 1a3abad).
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3:** implement: rank candidate spots by `hash01(x, z, 77)`, take the best 5 that are ≥ 7 m apart; pass `kind: 'old'` for them; pass `kind: 'oak'` to the Great Oak. Collider/perch lines unchanged.
- [ ] **Step 4:** run Task 1's list again → PASS; run `node <scratchpad>/canopies-tools/tris6.mjs` → Woods ≤ 64,148.
- [ ] **Step 5:** commit `feat(woods): a few big old oaks by the camp and the trail`.

### Task 3 (parent session): measure, live check, pairs

- Full suite + `npm run build`; flat-trace hash; tris6 before/after for every area; AFTER shots with `walk.mjs` / `trees.mjs` from the same spots (acceptance list in the spec, incl. phone 390); dusk check; side-by-side pairs to `snaps-polish-canopies/pairs/`.
