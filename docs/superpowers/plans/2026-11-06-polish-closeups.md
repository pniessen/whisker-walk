# polish-closeups (Pass 6, 6-5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix what the camera sees up close: a tree the camera is in or right beside stops reading as a translucent slab, the log bridge's root end loses its two dark "horns", and the black Pines spot is explained.

**Architecture:** Render-only. `src/treefade.js` gains a second, lower target for a tree's foliage when the camera is inside or near the tree (trunks keep today's floor); `logBridge()`'s root-buttress profile in `src/world/builder.js` (`logSections`) is lowered and rounded with the same vertex/triangle count. The Pines black shot is a survey-harness NaN (no code change).

**Tech Stack:** Three 0.185, Vitest 4.

**Spec:** scratchpad `polish-survey-6.md`, "Broken" #3–#5 and "Pass 6 → 6-5"; shared rules in scratchpad `polish-common.md`.

## Global Constraints

- Flat trace stays sha256 af07901717f1b39482a7befce20f1a80dc09c7e31866ab11bb7459e61d97b83a; waterlooks BUILD_DRAWS pins unchanged (no new Three objects in any build()).
- No colliders, walkable ground, perches, spawn or routes change. The log's walked top (y along the centre line, ≤ y and > y − 0.045 over the flat) is unchanged.
- Triangles neutral or less in Woods, River, Moor, Pines (≤ 394 tris per log).
- builder.js: touch only `logBridge()` and its private helpers (`logSections`, `logTrunkGeometry`), `willow()`, `willowOccluder()`. Never `tree()` (polish-canopies owns it) or `blobGeometry()`.
- treefade never writes `Object3D.visible` (the fight camera owns it); never mutates a shared original material; the shadow pass is unchanged.
- Tests: `npx vitest run --exclude '.claude/**' --exclude '.worktrees/**'`; float fixtures via `closeDiffs`. Long sweeps get explicit timeouts. Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; explicit `git add <paths>` only (node_modules is a symlink: never add it).

## Review Focus

- A building or lamp (box / fadeOccluder entries) must keep fading to FADE_OPACITY exactly as today — the near-foliage rule is for trees only.
- A merged pine stand (`occluder.stand`) near the camera: its foliage clone goes to 0, its trunk clone stays at FADE_OPACITY, other pines in the stand untouched.
- The Old Willow's limb (a CylinderGeometry child at local y 1.9/s) is classed with the trunk (kept at the floor), so the golden mouse never floats on nothing.
- A tree hidden by the fight camera that reappears near the camera snaps to its targets (foliage 0, trunk floor), no flash.
- Root flare on a narrow log (w 1.2, flat 0.72) and on a wide-top log (w 2, flat 1.96) must stay inside the footprint, closed and consistently wound (the existing logCalls sweep).

---

### Task 1: treefade — foliage clears when the camera is in or beside the tree

**Files:**
- Modify: `src/treefade.js`
- Test: `test/treefade.test.js`

**Interfaces:**
- Produces: `export const FOLIAGE_NEAR_OPACITY = 0` and `export const NEAR_FOLIAGE = 2.5` (m) from `src/treefade.js`.

Rules (all decided):
- A **tree** entry is one from `findOccluders` (has `obj` with `userData.occluder`, or `stand`+`index`), never a `box` (building) or `near` (fadeOccluder lamp) entry.
- A tree is **close** when it is wanted (faded) and the camera's horizontal distance to its axis is `< o.R + NEAR_FOLIAGE` with `cam.y < o.top + 1`. (Survey shots: Gorge clifftop-W camera is ~3.6 m from a 1.79-scale pine; River fish-0 camera stands inside a willow.)
- Per tree the eased value `t.op` now runs toward `FOLIAGE_NEAR_OPACITY` when close, `FADE_OPACITY` when faded but not close, 1 when clear (same DOWN/UP rates; reducedMotion and the hidden-snap rule apply to the new target too).
- Per material clone: a **trunk** clone's opacity is `base * max(t.op, FADE_OPACITY)`; every other clone is `base * t.op`.
- **Trunk classification, Group trees:** a mesh is trunk when its geometry bounding box, carried into the tree Group's own frame (compose each ancestor's local matrix up to the Group), has `max.y <= trunkCyl.y1 + 1e-3`, where `trunkCyl` is the first `t: 'cyl'` shape of `obj.userData.occluder` (OAK_TRUNK y1 2, PINE trunk y1 1.6). A material shared by a trunk mesh and a foliage mesh counts as trunk. Computed once in `prepare`.
- **Trunk classification, stands:** a stand mesh is trunk when `mesh.name === 'standTrunks'` (builder.pineStand).
- Windows rule (`WINDOW_HIDE`) and everything about buildings unchanged.

- [ ] **Step 1: Write failing tests** in `test/treefade.test.js` (new `describe('treefade: close trees')`):
  - `'a tree the camera is inside clears its canopy to 0 and keeps its trunk at the floor'`: `tree(0,0)`, camera `(0, 2.8, 0)`, look `{x:3,y:0.35,z:0}`, `update(1)`: canopy mesh (the non-Cylinder one) opacity `0`, trunk (CylinderGeometry) opacity `FADE_OPACITY` (closeDiffs), both transparent, depthWrite false.
  - `'a tree just beside the camera on the line clears its canopy; a far one on the line keeps the floor'`: camera `(0,2,-3)`, LOOK `{0,0.35,3}`, tree at `(0,0)` → canopy 0; separately tree at `(0, 12)` with camera `(0,2,0)`, look `(0,0.35,20)` (camera > R + 2.5 from it, line through it) → canopy `FADE_OPACITY`.
  - `'a willow the camera is inside clears crown and curtain; the trunk keeps the floor'` (import `willow`): `willow(0,0)`, camera `(0.8, 2.2, 0)`, look `{x:4,y:0.35,z:0}`; meshes named `willowCurtain` and the crown → 0; trunk → FADE_OPACITY.
  - `'a stand pine beside the camera clears its foliage clone only'`: `pineStand([{x:0,z:0,scale:1},{x:10,z:0,scale:1}], 1)`; camera `(0.5,1.5,0)`, look `{x:3,y:0.35,z:0}`; on `standFoliage` the faded tree's clone opacity 0, on `standTrunks` its clone FADE_OPACITY; tree 1 stays on the original.
  - `'buildings and lamps still stop at FADE_OPACITY up close'`: house box with camera inside → all non-window meshes `FADE_OPACITY` (reuse the existing house set-up in the file).
  - `'reducedMotion snaps a close tree straight to 0'`.
  - Existing tests that assert `FADE_OPACITY` on every mesh of a tree the camera is right next to (e.g. 'fades a tree between the camera and the cat' with camera 3 m from the tree, the stand tests at l.~278/332, hidden-snap) must be updated to the new split (canopy 0, trunk FADE_OPACITY) — change only the expected values, and say so in the commit message.
- [ ] **Step 2:** `npx vitest run test/treefade.test.js` — the new tests FAIL.
- [ ] **Step 3:** Implement per the rules above in `src/treefade.js`; update the header comment with a short "Close trees (polish-closeups)" paragraph.
- [ ] **Step 4:** `npx vitest run test/treefade.test.js test/fightcam.test.js` — PASS; then the full suite.
- [ ] **Step 5:** Commit `src/treefade.js test/treefade.test.js`.

### Task 2: logBridge — a low, rounded root flare (no horns)

**Files:**
- Modify: `src/world/builder.js` (`logSections` bark profile only; `logTrunkGeometry` only if colours need it)
- Test: `test/builder.test.js` (the `logBridge` tests ~l.690–960)

Shape (decided): at the root section the buttress hump stands at most **0.15·s** above the walked top's centre line (today ~0.3·s); its top is rounded — the two raised profile points (pts[2], pts[3]) end within **0.04·s** of each other in height at the root, so no single vertex makes a tip; the outer point (pts[4], the bulge) splays to the footprint edge `R` and down to **≤ −0.15·s** at the root, so the flare runs down to the water/bank rather than standing up. Same number of profile points and sections: vertex and triangle count unchanged (≤ 394/log for the bridges' call; assert the exact pre-change count). Normals still come from the profile, so the hump shades round.

- [ ] **Step 1: Write failing tests** in the `'logBridge reads as a round log'` describe:
  - `'its root buttresses are low: at most 0.15 m above the walked top'`: for `z = rootZ ± 0.2` (toward the log) and every `x` in `±[0.95, 1.5]` step 0.05, `at(x, z)?.point.y ?? -1 <= 0.16 + 0.15`.
  - `'its root buttresses are rounded, not horns'`: at `z = rootZ ± 0.2`, per side, the x-span where the surface is above `0.16 + 0.03` is at least `0.35` m.
  - `'triangle count is unchanged'`: pin `triangles()` to the value measured on main before the change.
  - Keep `'flares into root buttresses at one end…'` (> 0.16 + 0.05 at x ±1.2) — the flare still reads; adjust its x only if the rounded hump's crest moves, and say so.
- [ ] **Step 2:** run `npx vitest run test/builder.test.js -t logBridge` — new tests FAIL.
- [ ] **Step 3:** change the root terms in `bark()` in `logSections` (`pts[2]`, `pts[3]`, `pts[4]` lerps with `f`).
- [ ] **Step 4:** `npx vitest run test/builder.test.js test/river.test.js test/plankbridge.test.js test/waterlooks.test.js test/flattrace.test.js test/budget.test.js` — PASS; flat trace sha unchanged.
- [ ] **Step 5:** Commit `src/world/builder.js test/builder.test.js`.

### Task 3: the black Pines spot (investigation, no code)

Found during planning: `s-pines-day-14-deck-lake-bay` is a survey-harness artefact. `spots.mjs` reads every deck as a rect (`minX/maxX/minZ/maxZ`), but the island bridge's deck (`BRIDGE_DECK` in `src/world/pines.js`) is a strip (`x1,z1,x2,z2`); the camera override became `(NaN, 2.4, NaN)` and the frame rendered black. No player camera is involved. Write it up in the report and shoot the bridge's lake-bay end with a real camera (from the strip's end) to confirm it renders.

### Live check (controller)

Before/after from the same cameras (`closeups-tools/closeups.mjs`: River fish-0 willow camera and a lower one, trail-water-low log spots in Woods/River/Moor/Pines, Gorge clifftop-W real follow camera, Pines island bridge end), phone 390 for one; triangles via `tris6.mjs`.
