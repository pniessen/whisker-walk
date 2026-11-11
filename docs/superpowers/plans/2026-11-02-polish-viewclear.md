# polish-viewclear Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clear the walk view of three survey-2 eyesores: faded trees that read as glass pillars (and pine-stand trees that never fade), race rings that are plain grey tyres, and clan camps that read as a dotted circle with a small Highrock and same-coloured River cats.

**Architecture:** Four independent, render-only changes. (1) `src/treefade.js` fades further and fades a merged pine stand's trees one by one using geometry groups and per-tree clone materials; `src/fightcam.js` `findOccluders` tags a stand tree with its stand Group and index. (2) `src/race.js` draws striped hoops for the current ring with a numbered pennant, thin faint hoops for the rest, and fades any ring near the camera; `src/main.js` passes the camera. (3) `src/world/camp.js` draws the bramble ring as a dense, staggered, arched wall and the Highrock as a flat-topped stacked rock. (4) `src/clancast.js` widens BrookClan's coat rows so River cats differ.

**Tech Stack:** Three.js 0.185, Vite 8, Vitest 4 (node env; `document` is absent unless a test stubs it).

**Spec:** scratchpad `polish-survey-2.md` (Build A3; ranked rows #1, #2, #3) and `polish-common.md` (shared rules), both at `<scratchpad>/`.

## Global Constraints

- Tests: `npx vitest run --exclude '.claude/**' --exclude '.worktrees/**'` (main: 239 files, 7,115 tests green) and `npm run build`. Long geometry sweeps get explicit timeouts (120_000).
- No `Math.random` in anything a world build or walk runs; no new draws on walkRng or strayStream. Seeded helpers only (hash01, seedFromCode, mulberry32).
- `test/fixtures/flat-trace.json` sha256 stays `6b502ab6b1f9ce328fd6c6b7ce656fd473e50670708fac53985590bc9f0e54a7`; `test/waterlooks.test.js` BUILD_DRAWS unchanged (neighborhood 4408, park 2252, seaside 860, docks 6916, woods 11344, river 15484, moor 7944, pines 11580, gorge 4488). Camp geometry stays built under `withLocalUuids`; the flat camp still takes exactly 44 Math.random draws.
- Colliders, walkable ground, seats, spawn, routes, race course, CAMP_TURN: unchanged. The camp ring keeps no collider.
- Float-fixture comparisons use `closeDiffs` from `test/helpers/closeto.js`.
- Draw calls flat or nearly flat; new dressing merged one mesh per material and out of the shadow pass.
- Files this build may touch: `src/treefade.js`, `src/race.js`, `src/world/camp.js`, `src/clancast.js`, the pine-stand lines of `src/world/builder.js`, plus two small flagged edits: `src/fightcam.js` `findOccluders` (adds fields only) and the `session.race.update` call in `src/main.js`. Never `src/cat/*`, `src/hud.js`, `src/weather.js`, `src/render/*`.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; explicit `git add <paths>`.

## Review Focus

1. Several stand trees in the way at once (camera deep in the Pines forest): each fades on its own, groups stay contiguous and cover the whole index range, nothing drawn twice or dropped.
2. A stand whose geometry does not split evenly per tree (index count not a multiple of tree count × 3): left alone, as before, no throw.
3. Walk end mid-fade: `dispose()` restores every stand mesh's original single material and clears its groups.
4. Race near-fade before `begin()` and after `done`: rings near the camera still fade (the fade does not depend on race state), and `update` with no camera argument behaves exactly as before.
5. Race pennant in a node test (no `document`): createRace must not throw; the pennant simply has no number texture.

---

### Task 1: Tree fade — fainter fade, and pine-stand trees fade one by one

**Files:**
- Modify: `src/treefade.js`
- Modify: `src/fightcam.js` (`findOccluders` only: stand entries gain `stand` and `index`)
- Test: `test/treefade.test.js`

**Interfaces:**
- Produces: `FADE_OPACITY = 0.1` (exported). Occluder entries from `findOccluders` for stand trees: `{ obj: null, stand: <the stand Group>, index: <i in stand.userData.occluderStand.trees>, x, z, R, top, shapes }`. Non-stand entries unchanged. `createTreeFade(occluders, opts)` keeps its API (`update`, `prewarm`, `faded`, `dispose`); `faded()` still holds only tree Groups (stand trees are not in it).

- [ ] **Step 1: Write the failing tests** in `test/treefade.test.js` (replace the old 'stand trees are ignored' test). Build a real stand with `pineStand([{x:0,z:0,scale:1},{x:6,z:0,scale:1},{x:12,z:0,scale:1}], 7)` from `src/world/builder.js`, add to a scene, `findOccluders(scene)`.
  - `findOccluders tags each stand tree with its stand and index`: three entries, `obj === null`, `stand === group`, `index` 0,1,2.
  - `fades a stand tree in the way, and only it`: camera at (6, 1.5, -4), look at (6, 0.6, 4); after `update(1, camera, look)` both stand meshes have an array material `[original, clone]`, `geometry.groups` covers `[0, index.count)` contiguously, exactly one group (the range of tree 1, `[per, 2*per)` where `per = index.count / 3`) has `materialIndex !== 0`, and that clone has `transparent === true`, `depthWrite === false`, `opacity` ≈ `original.opacity * FADE_OPACITY`.
  - `two stand trees fade on their own`: camera inside tree 0's cylinder and the line to look passing tree 1; both ranges use non-zero material indexes, distinct clones.
  - `restores a stand when clear, and on dispose`: after moving the camera away and `update(5, …)`, each stand mesh's `material` is its original object again and `geometry.groups.length === 0`; same after `dispose()` mid-fade.
  - `a stand that does not split evenly is left alone`: tamper `occ.stand` to a group whose trunk geometry index count is not divisible by tree count; update; material unchanged; no throw.
  - `FADE_OPACITY is 0.1`.
- [ ] **Step 2: Run** `npx vitest run test/treefade.test.js` — new tests FAIL.
- [ ] **Step 3: Implement.**
  - `fightcam.js findOccluders`: `add(...)` takes an optional extra object merged into the entry; stand trees pass `{ stand: o, index: i }`. Nothing else in fightcam changes.
  - `treefade.js`: `FADE_OPACITY = 0.1`. Group stand occluders by `stand`; for each stand, at first use, collect its meshes (`traverse`, `isMesh`), require each geometry indexed with `index.count % (trees × 3) === 0` (else skip the whole stand forever), `per = index.count / trees` for each mesh. Each stand tree keeps its own `op` and eases with the same rates and reduced-motion snap as a Group tree. Per stand tree, lazily one clone per mesh (`cloneFor`). After the per-tree pass each frame, for each stand whose set of trees below full opacity changed or whose opacities changed: if none, put back the original material and `geometry.clearGroups()`; else set `mesh.material = [original, ...clones of the faded trees]` and rebuild `geometry.groups` in index order: runs of unfaded trees merge into one group with materialIndex 0, each faded tree its own group with its clone's index; set each clone's `opacity = original.opacity * op`. `prewarm` also puts tree 0 of each usable stand into its faded state for the compile, then restores. `dispose` restores stands and disposes their clones.
  - Update the file header comment (stands are no longer parked; how groups work; the shadow pass still draws every group so the shadow stays).
- [ ] **Step 4: Run** `npx vitest run test/treefade.test.js test/fightcam.test.js` — PASS.
- [ ] **Step 5: Commit** `feat(treefade): fade to 0.1, and fade a pine stand's trees one by one`.

### Task 2: Race rings — candy hoop and pennant for the next ring, faint thin hoops for the rest, fade near the camera

**Files:**
- Modify: `src/race.js`
- Modify: `src/main.js` (the one `session.race.update(dt, session.cat.position)` call gains `, camera` — use the camera variable that the tree fade call on main.js ~855 uses)
- Test: `test/race.test.js`

**Interfaces:**
- Produces: `createRace(...).update(dt, catPos, camera = null)`; exported constants `NEAR_FADE = { start: 2.5, end: 1.2, min: 0.12 }`. Each ring mesh carries `userData.raceRing = true` and its own material. Group children: pad, 5 rings, and one `pennant` Group (name `racePennant`) → 7 children.

- [ ] **Step 1: Write the failing tests** in `test/race.test.js` (update the "6 children" test to 7 and name the pennant):
  - `the current ring is a thick striped hoop; the others are thin and faint`: ring 1 mesh geometry has a `color` attribute with at least two distinct colours and tube ≥ 0.08 (`geometry.parameters.tube` or a `userData.tube`), opacity 1; rings 2–5 share one thinner geometry (tube ≤ 0.05) with material opacity ≤ 0.6.
  - `passed rings go fainter than upcoming ones`: after crossing ring 1, ring 1 opacity < ring 3 opacity, ring 2 is the thick striped one.
  - `the pennant sits on the current ring and moves on`: pennant world position x/z equals ring 1's, y above ring top (≥ RING_Y + RING_RADIUS); after crossing ring 1, equals ring 2's; hidden (`visible === false`) once done.
  - `a ring near the camera fades, whatever the race state`: idle race; camera object `{ position: {x: ring.x, y: ring.y + RING_Y, z: ring.z + 1.0} }`; after `update(0.016, farCat, camera)` that ring's opacity ≤ `NEAR_FADE.min + 0.01` scale of its state opacity; with the camera 10 m off, back to its state opacity. `update(dt, cat)` with no camera does not change opacities.
  - `createRace works with no document (node)`: no throw; pennant present.
  - Geometry count: `≤ 4` distinct geometries in the group (pad, thick hoop, thin hoop, pennant parts merged into ≤ 1 pole/flag geometry each counts — assert ≤ 5).
- [ ] **Step 2: Run** `npx vitest run test/race.test.js` — FAIL.
- [ ] **Step 3: Implement** in `src/race.js`:
  - Two shared hoop geometries made once per createRace: thick `TorusGeometry(RING_RADIUS, 0.09, 10, 36)` turned non-indexed with per-triangle vertex colours in 12 stripes around the hoop (alternating warm candy red `0xff5a5f` and cream `0xfff4dc`, by the triangle centroid's angle about the hoop centre); thin `TorusGeometry(RING_RADIUS, 0.04, 6, 32)` with an all-white `color` attribute.
  - Per ring: `litMaterial(0xffffff, { vertexColors: true, transparent: true, emissive: … })`; states: current → thick geo, emissive `0x6a2a10`, opacity 1; upcoming → thin geo, colour `0xbfe3ff`, opacity 0.55; passed → thin geo, colour `0xb8e0a8`, opacity 0.3. One helper `paint(ring, state)` sets all of it.
  - Pennant: a Group named `racePennant` with a thin pole (cylinder r 0.025, h 0.6) and a triangular flag plane (bright yellow `0xffd23f`, double-sided) carrying a number 1–5 from one 128×128 `CanvasTexture` redrawn on advance (only when `typeof document !== 'undefined'`). `castShadow = false` on both, `userData.noCast = true`. Placed with its foot on the current ring's top (`gy + RING_Y + RING_RADIUS`).
  - Near fade at the top of `update`, before the state check: for each ring, `d = 3D distance(camera.position, ring centre)`; `k = clamp((d - end) / (start - end), 0, 1)`; `opacity = stateOpacity * (min + (1 - min) * k)`.
  - Disposal: dispose each geometry/material/texture once.
- [ ] **Step 4: Run** `npx vitest run test/race.test.js test/raceisland.test.js` — PASS.
- [ ] **Step 5: Commit** `feat(race): candy hoop and numbered pennant on the next ring, faint thin hoops, fade near the camera`.

### Task 3: Camps — a bramble wall, not a dotted circle; a flat-topped Highrock

**Files:**
- Modify: `src/world/camp.js` (campDressing ring constants, `ringMesh`, `highrockGeometry`)
- Test: `test/camp.test.js`, `test/campdressing.test.js`

**Interfaces:**
- Consumes/keeps: `campLayout`, `campDiscs`, `CAMP_TURN`, `addCamp` signatures and colliders unchanged; seats unchanged (leader at `rock.h` 0.8); everything new built inside the existing `withLocalUuids` block (44 draws stays).
- Produces: `campDressing(...).ring.clumps[i]` gains `row` (0 inner, 1 outer) and `gate` (true for the clump at each end of the gap); `CLUMP_R` stays exported (new value below).

- [ ] **Step 1: Write the failing tests.**
  - campdressing: `the ring is a continuous two-row wall`: for each flat camp, sorting clumps by angle, every adjacent pair (same side of the gap) is ≤ 0.45 m apart centre to centre, except where a clump was dropped for a collider or seat; rows alternate 0/1; the two clumps nearest the gap edges have `gate: true`.
  - campdressing: existing gap/clearance tests still pass with the new constants (0.5 m from seats, collider rule with the new `CLUMP_R`).
  - camp: `the ring is taller and arched`: `campRing` vertex max y ≥ 0.7 and ≤ 1.0; `campRing` is noCast, castShadow false; triangle count ≤ 12,000.
  - camp: Highrock: every rock vertex within 0.8 m of the rock centre horizontally (was 0.75), top ≥ 1.5; the rock's vertices within 0.42 m of the centre all have y ≤ 0.82 and at least 6 vertices at y in [0.78, 0.82] (a flat top the leader stands on); no vertex above 0.85 within 0.42 m of the centre (nothing the leader clips into).
  - camp: the 44-draw test, the colliders test and MAX_SPAN test keep passing unchanged.
- [ ] **Step 2: Run** `npx vitest run test/camp.test.js test/campdressing.test.js` — FAIL.
- [ ] **Step 3: Implement.**
  - Ring constants: `RING_STEP = 0.36`, `CLUMP_R = 0.26`, `CLUMP_H = [0.55, 0.8]`, rows: clump i's `row = i % 2`, radial offset `row ? +0.16 : -0.16` added to the jittered radius (`RING_JITTER = 0.06`); gate clumps (first and last slot) get `h × 1.25` (cap 0.95). Same seeded stream, numbers drawn per slot before any drop.
  - `ringMesh`: each clump three lumps (two side by side along the ring as now, one taller lump behind on the outer side), sized so neighbours overlap; plus, between each kept clump and the next kept clump when they are ≤ 0.6 m apart, one arched bramble strand: a half torus (`TorusGeometry(span/2, 0.025, 3, 8, π)`) standing upright between their crowns, darker colour `0x2a3a1a`. One vertex-coloured noCast mesh as now. Colours: the two greens plus a third darker `0x24451c` by hash, dark at the foot.
  - `highrockGeometry`: replace the squashed dodecahedron base with two stacked flat-topped slabs (7-sided `CylinderGeometry`, corners pushed by `hash01` ±6 %): lower `rTop 0.52, rBottom 0.6, h 0.45`, upper `rTop 0.44, rBottom 0.5, h 0.35`, top face exactly at `rock.h` (0.8); the back stone moved out to 0.6 m from the centre, scaled `(0.22, 0.85, 0.16)`, centre y 0.85, so its front face is ≥ 0.42 m from the centre and it rises to ≥ 1.6; the step stone kept (top ≤ 0.45). Merged, flat-shaded (non-indexed) as now. Collider r 0.6 unchanged.
  - Update the comments above ringMesh, highrockGeometry and the dressing constants; record ruling: the ring stays collider-free (a collider would change walkable ground, the clan cats' routes and the flat trace for the Woods/River/Moor/Pines).
- [ ] **Step 4: Run** `npx vitest run test/camp.test.js test/campdressing.test.js test/clancats.world.test.js test/flattrace.test.js test/waterlooks.test.js` — PASS (flat trace and draw pins unchanged).
- [ ] **Step 5: Commit** `feat(camp): a staggered, arched bramble wall and a flat-topped Highrock`.

### Task 4: BrookClan coats — River cats that differ

**Files:**
- Modify: `src/clancast.js` (`CLAN_COATS.river` rows only)
- Test: `test/clancast.test.js`

**Interfaces:**
- Keeps: `clanCast`, names, ranks, slot order, seeds (`${clanId}|coat|${slot}`), `style.eyes` 'siamese' for River.

- [ ] **Step 1: Write the failing test** `BrookClan's cast shows at least three clearly different coats`: across the 16 River cast members, group by `style`; at least 4 distinct rows used; and among the first 9 (the core cast) at least 3 rows whose base colours differ by ≥ 0.15 in HSL lightness or are patterned differently (one with `stripes`, one solid, one with `whiteLegs` or `patches`). Plus every clan: the 9 core cats use at least 3 distinct rows.
- [ ] **Step 2: Run** `npx vitest run test/clancast.test.js` — FAIL.
- [ ] **Step 3: Implement**: River rows (6): blue-grey solid `0x6f7d8c`; silver tabby (pale `0xc9d0d8` base, `0x5a6470` accent, stripes + headStripes); white-and-grey bicolour (`0x7a8ca4` base, white belly, whiteLegs + chin); dark slate tabby (`0x3f4852`, stripes); grey-and-white patched (`0xe8ecf0` base, `patches: true`, `patch2: 0x6a7684`); smoky blue fluffy (`0x8ca6c8`, fluffy). If the seeds still map the core nine onto fewer than 3 rows for any clan, reorder that clan's rows (never the seeds) until the test passes.
- [ ] **Step 4: Run** `npx vitest run test/clancast.test.js test/clancats.test.js test/scars.test.js test/territories.test.js` — PASS.
- [ ] **Step 5: Commit** `feat(clancast): BrookClan coats in silver, slate, bicolour and patched, not one blue-grey`.

### Task 5 (controller): full suite, build, live after shots, draw counts, pairs

- [ ] `npx vitest run --exclude '.claude/**' --exclude '.worktrees/**'`; `npm run build`; `sha256sum test/fixtures/flat-trace.json`.
- [ ] After shots from the same spots (`scratchpad/viewclear/shots.mjs after <area> [phone]`), draw/triangle readouts in a camp and near a ring, before vs after; 4–8 pair JPGs into `snaps-polish-viewclear/pairs/` (one at 390 wide).
