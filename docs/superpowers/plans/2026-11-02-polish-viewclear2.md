# polish-viewclear2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development to run this plan task by task.

**Goal:** Survey 3, build B1. Stop the walk camera showing the inside of a building (walls culled, windows and doors floating), fade lamp posts that stand between the camera and the cat, and stop score floaters turning huge when the camera is pulled in close.

**Architecture:** All render-only. The camera is in the flat trace, so nothing moves it.
- Buildings and lamp posts join the existing walk tree fade (`src/treefade.js`). It already swaps per-object material clones and eases opacity, and it never writes `visible` and leaves the shadow pass alone.
- A new `findFadeOccluders(scene)` in treefade.js finds two kinds of thing. **Building boxes** are top-level groups holding `userData.window` meshes: `builder.house` and `builder.warehouse`. **Fade-only shapes** are `userData.fadeOccluder` (the lamp post).
- These go to the tree fade only, never to the fight camera. Its occluder set is unchanged, and there are no lamps or buildings in any clan camp.
- Floaters clamp their on-screen height using the camera's distance and fov.

**Tech:** Three 0.185, Vitest 4.

**Survey refs:** broken #1, polish #1 and #3 in scratchpad/polish-survey-3.md.

## Rules for every task

- Work in `<repo>/.worktrees/polish-viewclear2` (branch polish-viewclear2) only.
- No Math.random in build paths. Add no new meshes, materials or geometries in any area build: the waterlooks BUILD_DRAWS pins must not move.
- The flat trace stays sha256 d2657f02…72f0.
- Tests: `npx vitest run --exclude '.claude/**' --exclude '.worktrees/**' <files>`. Give long tests explicit timeouts.
- Commit with explicit `git add <paths>`. Every message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Use `closeDiffs` (test/helpers/closeto.js) for float fixtures.

## Ownership

- Ours: `src/treefade.js`, `src/fx.js`, `src/camzoom.js` (not needed), and the tree-fade lines in `src/game/walk.js`.
- Two one-line touches outside that:
  - `src/world/builder.js` `lampPost`: the fade tag. **polish-light (B3) owns the rest of lampPost and rebases on us.**
  - `src/main.js`: `session.fx.update(dt)` becomes `session.fx.update(dt, camera)`.

---

### Task 1: Building boxes and fade-only shapes in treefade.js

**Files:** modify `src/treefade.js` and `test/treefade.test.js`.

1. Add `export const BUILDING_PAD = 0.4`. The camera within this many metres of a building's box counts as inside it.
2. Add `export function segmentHitsBox(a, b, box)`, where box is `{ minX, maxX, minY, maxY, minZ, maxZ }`. It is a slab test on segment a→b and returns true when the segment meets the box. Pure, no allocation.
3. Add `export function findFadeOccluders(scene)`:
   - First call `scene.updateMatrixWorld(true)`.
   - **Fade-only shapes.** Traverse the scene. For every object with `userData.fadeOccluder` (an array of shapes in the object's own frame, the same `{t:'cyl', r, y0, y1}` / `{t:'ell', y, r, ry}` format as builder.js `TREE_OCCLUDER`), push an entry shaped like a `findOccluders` one: `{ obj, x, z, R, top, shapes }`. Place the shapes from the world matrix (position and uniform scale) with **no wind lean**. Each placed shape gets `p: 0`, R is the largest r, and top is the highest point.
   - **Building boxes.** For every direct child of `scene` that is not a Mesh, has no `userData.occluder` / `occluderStand`, and has a descendant mesh with `userData.window`, compute `new THREE.Box3().setFromObject(child)`. Push `{ obj: child, box: {minX,…,maxZ}, x, z (box centre), R (half the box's xz diagonal), top: maxY }`.
4. In `createTreeFade`, entries with `obj` (box entries included) go on the existing per-object `trees` path. In `step(t, …)`:
   - For an entry with `o.box`: quick-reject when `hypot(o.x - look.x, o.z - look.z) > camDist + o.R + BUILDING_PAD`. Otherwise `want = camera inside box grown by BUILDING_PAD on every side || segmentHitsBox(cam, look, o.box)`. Use cam→look itself, **not** the PAST_LOOK extension: a building beyond the cat must not fade.
   - Other entries are unchanged.
   - `faded()`, `prewarm` and `dispose` work for buildings without change (they are `obj` entries). Update the header comment to cover buildings and lamps.
5. Tests, added to test/treefade.test.js:
   - `findFadeOccluders` finds a `house()` and a `warehouse()` added to a scene as box entries with the right boxes. It ignores a `tree()`. It finds a group tagged `userData.fadeOccluder` with its shapes placed at the group's position.
   - The camera inside a house's box fades every mesh of the house to FADE_OPACITY (transparent, depthWrite false). The same holds 0.3 m outside a wall. 1 m outside a wall with the house not on the line, nothing fades.
   - A house on the line from the camera to the look point fades. A house 3 m beyond the look point on the camera line does **not**.
   - A tagged pole between the camera and the cat fades. A pole 1 m to the side of the line does not.
   - The originals go back when clear and on dispose, and `visible` is never written.
   - `segmentHitsBox` unit cases: through, miss, ending inside, starting inside, and parallel to a face outside it.
6. Run test/treefade.test.js and test/fightcam*.test.js. Commit: `feat(viewclear2): tree fade takes buildings (window-bearing groups) and fade-only shapes`.

### Task 2: Tag the lamp post and wire the walk

**Files:** modify `src/world/builder.js` (lampPost, one line) and `src/game/walk.js` (tree-fade lines). Add `test/viewclear2.test.js`.

1. In `lampPost`, beside `g.userData.lampGlobeY = …`, add one line:
   `g.userData.fadeOccluder = [{ t: 'cyl', r: 0.08, y0: 0, y1: 3.2 }, { t: 'ell', y: 3.3, r: 0.22, ry: 0.22 }];`
   - Mark the line with a short comment saying it is the tree fade's tag (polish-viewclear2), so B3 keeps it on rebase.
   - Use a plain array literal; do not import from treefade (that would make an import cycle).
2. In walk.js, where `session.treeFade = createTreeFade(occluders, { reducedMotion })`, pass `isDen ? [] : [...occluders, ...findFadeOccluders(scene)]` instead, importing `findFadeOccluders` from '../treefade.js'.
   - The fight camera keeps `occluders` unchanged.
   - Update the comment above it to one or two plain lines.
3. New `test/viewclear2.test.js`, which builds each lamp/building area with its world `build(new THREE.Scene(), {})` and then runs `mergeStaticProps(scene)`, as walk.js does:
   - **neighborhood**: every house group is found as a box (count the `house(` calls in neighborhood.js), and every lamp (4) as a fade shape.
   - **docks**: 5 warehouse boxes and every lamp.
   - **park**: 4 lamps and 0 boxes. **seaside**: 2 lamps.
   - After the merge, each box's group still holds its window meshes, and each lamp group still holds its two meshes.
   - Give the test a 120_000 ms timeout.
4. Run test/viewclear2.test.js, test/waterlooks.test.js and test/flattrace.test.js. The draw pins and the trace must be unchanged: userData adds no draws.
5. Commit: `feat(viewclear2): lamp posts and buildings fade out of the walk camera's way`.

### Task 3: Floaters keep a sane on-screen size

**Files:** modify `src/fx.js`, `src/main.js` (one line) and `test/fx.test.js`.

1. In fx.js add `export const FLOATER_MAX_SCREEN = 0.08`, the largest a floater sprite may be as a fraction of the viewport height (about 58 px on a 720 px desktop, under 70 px on a phone).
2. Each popup remembers its base scale (`effect.baseX`, `effect.baseY`, read from the sprite `makeText` returned). Re-read them when a merge rebuilds the sprite.
3. Change the signature to `update(dt, camera)`. When `camera?.isPerspectiveCamera`, for each popup do this after moving it:
   - `d` = distance from the camera to the sprite;
   - `viewH = 2 * d * tan(fov/2 in rad) / (camera.zoom || 1)`;
   - `k = min(1, FLOATER_MAX_SCREEN * viewH / baseY)`;
   - `scale.set(baseX * k, baseY * k, 1)`.
   Remember the camera, and apply the same clamp inside `popup()` when one is known, so the first frame is right too. Without a camera, behaviour is byte-identical to today.
4. In main.js, change `session.fx.update(dt);` to `session.fx.update(dt, camera);`. Check that `camera` is in scope there.
5. Tests in test/fx.test.js:
   - A camera 5 m away (fov 70) leaves the sprite at 1.4×0.35.
   - A camera 1 m away clamps the height to FLOATER_MAX_SCREEN × 2 × tan(35°) × 1, with the width in proportion.
   - Without a camera there is no change.
   - A merged popup is clamped too.
   - `popup()` after a clamped update starts clamped.
6. Run test/fx.test.js. Commit: `fix(viewclear2): score floaters keep a sane on-screen size when the camera is close`.

### After the tasks (parent)

- Full suite and `npm run build`; check the flat-trace hash.
- AFTER shots from the same spots (scratchpad/vc2/shots.mjs), the pairs, and the draw/triangle numbers.
- A final whole-branch review on the most capable model, then one fix wave.
