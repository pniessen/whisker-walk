# Polish-pose: nap tail, a real cape, floating balloons, a sitting home cat — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Four pose fixes parked from polish-sit: the nap tail joins the rump and curls round the body; capes become real cloaks fastened at the neck and lying over the whole back in every pose, with the tail out from under the hem; balloons float upright over the tie point in every pose; the home-screen cat sits.

**Architecture:** The nap tail copies the sit's mechanism (torso.js `SIT_TAIL`, animator.js root ride): a `NAP_TAIL` constant and a root carried by the posed body. The cape stops being a box hung on the cat group and becomes a cloth shell hung on the **body mesh** (like the coats), so it bends with the torso in every pose for free; the animator's cape `hang` path is deleted. Balloon pieces leave `ridesBody` and get a per-frame float pass in `animateCat` (every state): the tie rides the posed body, balloons keep their built height (or rise with the tie) without rotating, and strings are re-spanned tie→knot. The home stage poses its cat with `animateCat(cat, 'requestPet', 1.3, 0)` before measuring.

**Tech Stack:** Three.js 0.185, Vitest 4, Vite 8.

**Spec:** the controller's brief (polish-pose prompt + two owner notes on capes) and the shared rules `<scratchpad>/polish-common.md` (read its "fourth round" section). Owner on capes, verbatim: they "look like a dishtowel draped over the tail, they don't cover the back or any other part of the body — capes are supposed to attach to the neck/shoulders." Wanted: fastened at neck/shoulders (clasp at front of neck/chest), over the shoulders and down the whole back following spine and flanks like a cloak, hem round the haunches/top of the hind legs, the tail out from under the hem and never covered, following the body in stand, walk, sit, nap, stalk.

**BEFORE shots** (controller): `scratchpad/snaps-polish-pose/before/` (script `scratchpad/pose-live/shots.mjs`, dev server port 5203). Contact sheets: `snaps-polish-pose/sheet-nap.jpg`, `sheet-cape.jpg`, `sheet-balloon.jpg`. Confirmed broken: (1) the nap tail's root floats at standing height ~12 cm off the lowered rump and the tail sticks straight out sideways in the air; (2) the cape is a 32×40 cm flat slab hanging behind the rump over the tail root, touching nothing — standing and sitting; (3) sitting, the single balloon and the bunch lean back ~45° with the cat; in the nap the tie floats over the lowered back; (4) the home stage cat stands.

## Global Constraints

- Work only in `<repo>/.worktrees/polish-pose` (branch `polish-pose`). Never push, never merge, never edit `.claude/launch.json`.
- Owned files: `src/cat/*`, `test/fixtures/catgolden.json`, `src/ui/catstage.js`, `src/ui/homebase.js`. Keep model.js changes to the cape, balloon, tail and sit/nap code: hats, wings, jetpack, backpack are NOT ours (a later accessories build) — leave their code alone.
- Tests: `npx vitest run --exclude '.claude/**' --exclude '.worktrees/**'` (main: 239 files, 7,112 tests, green) and `npm run build`. Long geometry sweeps get explicit timeouts (120_000). Never weaken a test to pass a load timeout.
- Commits: explicit `git add <paths>`; every message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Determinism: no Math.random. test/fixtures/flat-trace.json sha256 must stay 6b502ab6b1f9ce328fd6c6b7ce656fd473e50670708fac53985590bc9f0e54a7; if `test/flattrace.test.js` or `test/waterlooks.test.js` fails, STOP and report to the controller.
- Hagrid: do not change his sit, his rig, or `test/fixtures/hagrid-golden.json`. (His rig shows no cape or balloon — hagrid.test.js pins 0 meshes for them; keep it so.)
- Do not touch test/fixtures/catgolden.json (the controller regenerates it in its own commit if needed; the golden's dressed kit has no cape or balloon, so none of this should move it).
- Performance: no new shadow casters; draw calls per cat flat or fewer. Allocate nothing per frame in animator code.
- Float fixtures compared in tests use `closeDiffs` (test/helpers/closeto.js).
- Comments follow the file's style: what and why, with measured numbers.
- No new player-facing words.

## Rulings (controller)

- P1 Nap tail: cats with folds only (Hagrid's tail already rides his body via `rideTail`). Cost if wrong: none for Hagrid.
- P2 The cape is a body-hung cloth shell (one mesh per material: red cape + gold clasp = 2 meshes as before; confetti cape = purple shell + ONE merged vertex-coloured mesh of all dots + clasp = 3, was 10). It no longer rides the group (`ridesBody`) and the sit's `hang` code is removed. Cost if wrong: backpack/wings/jetpack (not ours) may now overlap the cape's surface — reported for the accessories build.
- P3 Balloons: the tie rides the posed body in EVERY state; balloons and knot never rotate; they keep their built height unless the tie rises, then rise with it; strings stretch tie→knot. In follow/idle (no walk bob) every balloon piece is exactly where it is today. Cost if wrong: strings a little longer in a sit/nap than standing.
- P4 Home stage: every cat on the stage sits (`requestPet`, t 1.3) — the hero, try-ons, and the cat builder's draft too. Ruling: the builder sits as well; its draft is bare, sizes are framed the same way, and a sitting cat still shows coat, marks, paws and tail; this keeps dressingroomview.js untouched. Cost if wrong: one option to stand the builder's draft. There is no existing "stand when touched" interaction; drag-to-spin is kept.
- P5 Hagrid on the stage sits his own (old) sit — whatever `animateCat` gives him.

## Review Focus

1. Digit (narrow, long legs, scale 0.82), Persian/Maine Coon (fluffy ruff), kitten/custom sizes and `{simple:true}` builds: the cape and nap tail must hold on every non-Hagrid PRESET × {full, simple} — every new test loops them.
2. The cape must not cover the tail in ANY state (follow walking, stalk, nap, sit, stretch, cross, swim/wade): Task 2 sweeps STATES (test/helpers/catfingerprint.js) × t.
3. Leaving a pose restores exactly: nap→follow and sit→follow give the same tail, balloon and cape transforms as a fresh follow (Tasks 1–3).
4. The cape with a hoodie/raincoat is impossible (same slot) but WITH neck items, a collar, ruff and scars it must not hide them: the clasp sits below the collar line and the cape's front edge stays behind the chest bib (Task 2 shots).
5. The home stage must still work when buildCat returns an object without `userData.parts` (tests' fakes, the still-picture fallback): posing is skipped, nothing throws (Task 4).

---

### Task 1: The nap tail lies flush and curls round

**Files:** Modify `src/cat/torso.js` (new `NAP_TAIL` next to `SIT_TAIL`), `src/cat/animator.js` (nap branch in `pose()` ~l.652; `animateCat` beside the sit's tail-root ride ~l.205). Test: create `test/catnap.test.js`.

**Interfaces:** Produces `NAP_TAIL = Object.freeze({ ROOT: [y, z], rotX, pivotX: [5], pivotY: [5] })` (same meaning as `SIT_TAIL`; ROOT is the torso-local offset before the body's scale, as the sit uses it: `_anchor.set(0, ROOT[0]/sy, ROOT[1]/sz).applyMatrix4(body.matrix)` with `[ , sy, sz] = base.bodyScale`).

- [ ] **Step 1: Failing tests** in `test/catnap.test.js`, every PRESET except hagrid × simple false/true, state `nap`, t swept 0..3 step 0.25 (pose with `animateCat(cat,'nap',t,0,false)`, measures in the cat frame = world / cat.scale.x; reuse the helpers style of test/catsitupright.test.js):
  - the root (`tail` world position) is within 3 cm of the torso surface at the rump (cast a ray from the body's world centre through the root: the hit on body/underside is within 0.03 of the root, root at most 0.03 outside or inside).
  - every tail vertex y >= -0.005; every tail vertex y <= the torso's top y (the tail lies low, never up in the air); the tip (last pivot world position) y <= 0.10.
  - the tip is forward of the root by >= 0.15 (tip z < root z - 0.15) and |tip x| >= 0.12: it curls round the side toward the head.
  - no vertex of links 1–4 lies inside the torso (ray/ellipsoid test as catsitupright's Task 2 tests do) — at least 1.5 cm clear.
  - round trip: nap at t 1.0 then follow at 2.1 equals a fresh follow at 2.1 for tail position/rotation and every pivot rotation.
  - Hagrid in nap: tail position equals today's (read and hard-code it before changing code).
- [ ] **Step 2: Run** `npx vitest run test/catnap.test.js` — expect FAIL (root floats).
- [ ] **Step 3: Implement.** Nap branch, folds only: `tail.rotation.set(NAP_TAIL.rotX,0,0)`, pivots written outright from NAP_TAIL (y side `TAIL_HOOK_SIDE`, curling toward the side the head turns to — the nap head turns `rotation.y 0.5`; pick the side that makes nose-to-tail read and say which in the comment); keep a slow tip sway (`sin(t*0.9)*0.08` on the last pivot only) or none — say which. In `animateCat`, after the pose fit, carry the root like the sit's (extend the `sitting` block to a `napping` case; same code, NAP_TAIL.ROOT). Fit the twelve numbers by measurement (a small search script is fine, like polish-sit's) for: root flush, every link outside the torso and above the ground across the breathing (`body.scale.y` ± 0.015) and t, tip forward, even bends. Comment NAP_TAIL with the measured numbers. `TAIL_CURL_BY_STATE.nap` — drop it for folds if pivots are written outright (as the sit does) and say so.
- [ ] **Step 4: Run** the new test plus `test/cattail.test.js test/folds.test.js test/hagrid.test.js test/catpose.test.js test/animator.test.js test/catgolden.test.js`. Update only assertions that pinned the old nap tail, each with a comment.
- [ ] **Step 5: Look.** `cd <scratchpad>/pose-live && WHICH=t1 ONLY='^nap' node shots.mjs` (dev server on 5203 must answer; if not, start `npx vite --port 5203 --strictPort` from the worktree in the background). Read the side, rear3 and three shots against `../snaps-polish-pose/before/nap-*`. Iterate until the tail leaves the rump at the ground and wraps round the body.
- [ ] **Step 6: Full suite + build; commit** `src/cat/torso.js src/cat/animator.js test/catnap.test.js` (+ touched tests): `feat(cat): the napping tail leaves the rump and curls round the body`.

### Task 2: A real cape, fastened at the neck, over the whole back, in every pose

**Files:** Modify `src/cat/model.js` (the `cape` and `confetticape` branches ~l.1396–1422, `CAPE_HANG` ~l.82 → replaced by `CAPE`; a `capeGeometry` helper), `src/cat/animator.js` (delete the `hang` branch of `rideBody` and `CAPE_HEM_CLEAR`/`CAPE_THICK_HALF`, fix its comment), possibly `src/cat/torso.js` (only if a helper belongs there). Tests: create `test/catcape.test.js`; rewrite the cape cases in `test/catsitupright.test.js` (~l.237–340: the clasp/hang/box checks) and `test/catmodel.test.js` (~l.594–620: `SUB_OFFSET.cape`, "rests on the back").

**Interfaces:** Produces in model.js `const CAPE = Object.freeze({ zFront, zBack, zBackSide, wrapFront, wrapMid, wrapBack, inflate, flare })` and `capeGeometry(simple: boolean): THREE.BufferGeometry` (body-local, unscaled torso frame, same frame as `coatShell`'s geometry). The cape mesh has `userData.cape = true`; the clasp `userData.capeClasp = true`; both are children of `body`, NOT of `g`, so they carry no `ridesBody` and no `liftY`.

Geometry (the decision; tune numbers by shots, keep the form): a parametric grid over (a ∈ [-1,1] around, s ∈ [0,1] along). `uz = zFront + (zBackAt(a) - zFront)·s` with `zBackAt(a) = zBack + (zBackSide - zBack)·a²` (shorter at the spine so the tail root is clear, longer round the haunches). Half-wrap `φmax(s)` blends wrapFront→wrapMid→wrapBack (radians from the top line: ~1.9 over the shoulders, ~1.75 down the flanks, ~1.5 at the haunch). Unit direction `d = (√(1-uz²)·sin(a·φmax), √(1-uz²)·cos(a·φmax), uz)`; point = `deformTorso(d)·TORSO.R·shellInflate(d.y)·inflate`, pushed further out horizontally (x only) by `flare·smoothstep(0.3, -0.2, d.y)` so the lower edge hangs off the flank like cloth. Grid 24×20 full, 12×10 simple. Start values: zFront -0.8, zBack 0.68, zBackSide 0.86, inflate 1.03, flare 0.06. Material: `mat(CAPE_COLOR)` with `side: THREE.DoubleSide` (a fresh material, not a shared cached one). Clasp: a gold ball r 0.032 on the body at the cape's front-centre edge point (s 0, a 0), pushed 0.012 out, counter-scaled by 1/BODY_SCALE like the raincoat buttons so it stays round. Confetti cape: same shell in PRIZE_CAPE; its 8 dots (same colours, r 0.022 flattened) laid ON the shell surface at 8 fixed (a, s) spots on the back and flanks, merged into ONE BufferGeometry with vertex colours (`litMaterial(0xffffff,{vertexColors:true})`), hung on body; plus the gold clasp. Shadow casting: whatever the old cape had (cast/receive) — check how g's items are flagged and keep the cape's caster count ≤ before.

- [ ] **Step 1: Failing tests** in `test/catcape.test.js`, for `body: 'cape'` and `'confetticape'` × every PRESET except hagrid × simple false/true:
  - built: the cape mesh and clasp are children of `parts.body`; the cat has no `g` child carrying either (`userData.hang` exists nowhere).
  - coverage, standing (`follow`, t 1.3): the cape's world box covers the torso's top from z ≤ (head world z + 0.25) to the haunch: its max z ≥ the hind hips' z; at the torso's mid-length the cape's lowest side vertex y is ≤ torso centre y (it reaches down the flanks).
  - the clasp is in front of the torso centre (z < body z - 0.15), above the torso centre, and within 3 cm of the fur, below the head's centre.
  - fur clearance: in every state of `STATES` (test/helpers/catfingerprint.js) at t ∈ {0.4, 1.3, 2.2} (walking states also at moveSpeed 1.5), every cape vertex is outside the torso shell (ray from body centre: cape vertex distance ≥ fur hit + 0.002) and none is below y -0.005 — a cape never goes into the ground.
  - **the tail is never covered**: same sweep; no tail vertex lies inside the cape's inflated volume (for each tail vertex, cast from the body centre through it: if it hits the cape before reaching the vertex, and the vertex is within 2 cm of the body surface, that's a cover) — count must be 0; AND the tail root (`tail` world position) is behind the cape's hem: no cape vertex within 4 cm of the root.
  - draw calls: count meshes for each cape kit vs the numbers in Ruling P2 (2 and 3); casters ≤ the old (red 2, confetti 10).
  - Hagrid with `body:'cape'`: 0 cape meshes (unchanged).
- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Implement** the geometry, the two branches and the animator cleanup. Update model.js's comment block (~l.1338–1349) — the cape is now on the body, not a rider.
- [ ] **Step 4: Rewrite the old cape tests** in catsitupright/catmodel that assume a group-hung box (clasp offset, hang, box-frame tail check) to the new truth, each with a comment; keep their intent (on the back, out of the fur, out of the tail). Run them plus `test/catcustom.test.js test/catcoat.test.js test/hagrid.test.js test/catgolden.test.js test/thumbnails*.test.js test/visits.test.js test/colony.test.js`.
- [ ] **Step 5: Look.** `WHICH=t2 ONLY='cape|confetti' node shots.mjs` from the pose-live folder, plus `verify-catbody.html?breeds=tabby,digit,persian&acc=body:cape&state=<s>&view=<v>&light=game` for stalk, nap, walk (`speed=1.5`). Compare with `before/cape-*`. Tune CAPE until it reads as a cloak: fastened at the neck front, over the shoulders, down the back and flanks, hem round the haunches, tail clearly out from under it; sitting, it lies on the sloping back. Report anything odd you see with backpack/wings/jetpack over it — do not change them.
- [ ] **Step 6: Full suite + build; commit** `feat(cat): capes are cloaks fastened at the neck, over the back in every pose, the tail free`.

### Task 3: Balloons float upright in every pose

**Files:** Modify `src/cat/model.js` (the `balloon` and `balloonbunch` branches ~l.1474–1507: tag pieces; exclude them from `ridesBody`), `src/cat/animator.js` (a `floatBalloons(cat)` pass in `animateCat`, after `applyPoseFit` and the sit's `rideBody`, every state). Tests: create `test/catballoon.test.js`; adjust the balloon kits in `test/catsitupright.test.js` (~l.365) to the new truth.

**Interfaces:** Each balloon piece (on `g`) gets `userData.float = { tie: [x,y,z] }` (the built tie/foot point, cat frame, same frame as its position) instead of `ridesBody`; each string additionally `userData.span = { top: [x,y,z], len: number }` (its built knot-end point and built length). Rest is remembered the same way as riders (`userData.rest`, captured in animateCat before fitLongLegs first moves it).

Per frame (allocation-free): `_ride` = bodyPosed · bodyRest⁻¹ exactly as `rideBody` builds it; `tieNow = _ride·tie`; `Δ = tieNow − tie`; balloon/knot: position = rest + (Δx, max(0, Δy), Δz), quaternion = rest. String: top = span.top + (Δx, max(0,Δy), Δz); foot = tieNow; position = midpoint; quaternion = from (0,1,0) to (top − foot) normalized; scale.y = |top − foot| / span.len; scale x,z = 1.

- [ ] **Step 1: Failing tests**, PRESETS minus hagrid × simple × kits `back:'balloon'` and `back:'balloonbunch'`, in every state of STATES at t ∈ {0.4, 1.3, 2.2}:
  - follow at moveSpeed 0: every balloon piece's position/quaternion/scale equals its built one exactly (today's look is kept).
  - every balloon and knot has quaternion = its built one (upright; balloons never tip).
  - each string's lower end (position − ½·len·up-axis world) is within 1 cm of the carried tie, and each string's direction has y ≥ 0.6 (it rises).
  - each balloon's lowest vertex is ≥ 0.1 above the tie, and no balloon vertex is inside the torso or the head (ellipsoid/ray check).
  - round trip: requestPet then follow = fresh follow for every balloon piece.
- [ ] **Step 2: Run** — expect FAIL in the sit/nap.
- [ ] **Step 3: Implement.** Comment the pass with the measured sit and nap tie drops.
- [ ] **Step 4: Run** the new tests, `test/catsitupright.test.js test/catmodel.test.js` (balloon top < 1.1 thumbnail test must stay green) `test/hagrid.test.js test/catgolden.test.js`.
- [ ] **Step 5: Look.** `WHICH=t3 ONLY='balloon|bunch' node shots.mjs`; compare with `before/balloon-*`, `before/bunch-*`.
- [ ] **Step 6: Full suite + build; commit** `feat(cat): balloons float upright over their tie in every pose`.

### Task 4: The home stage cat sits

**Files:** Modify `src/ui/catstage.js` (`createCatStage` gains an injectable `poseCat`; `show()` poses before measuring), its comment block. Test: `test/catstage.test.js`.

**Interfaces:** `createCatStage({ buildCat, thumbs, poseCat = defaultPoseCat, ... })` where `defaultPoseCat(cat)` calls `animateCat(cat, 'requestPet', 1.3, 0)` from `../cat/animator.js` only when `cat?.userData?.parts` exists. `STAGE_POSE = Object.freeze({ state: 'requestPet', t: 1.3 })` exported for the tests. `show()` calls `poseCat(cat)` right after `buildCat` and before `measure`/`lookBounds`.

- [ ] **Step 1: Failing tests** in catstage.test.js: (a) `show()` calls the injected `poseCat` once with the built cat, before the bounds are measured (a fake poseCat that moves a child changes the framing); (b) the default `poseCat` on a real `buildCat('tabby')` leaves `parts.body.rotation.x === SIT.pitch`; (c) the default `poseCat` on a bare `THREE.Group` does nothing and does not throw; (d) the cat builder path (`show(breed, {}, look)`) sits too (Ruling P4); (e) Hagrid shown: posed without throwing.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.** Keep on-demand rendering: one static pose, no animation loop added.
- [ ] **Step 4: Run** `test/catstage.test.js test/dressingroom*.test.js test/homebase*.test.js test/screens*.test.js`.
- [ ] **Step 5: Look.** `WHICH=t4 ONLY='home|builder' node shots.mjs` (desk + phone 390; also the stage crops). Compare with `before/home-*`, `before/builder-*`: the cat sits, framed fully (balloons and tail inside the frame), hero text clear.
- [ ] **Step 6: Full suite + build; commit** `feat(home): the dressing-room cat sits upright`.

### Task 5 (controller): golden check, trace, AFTER shots, pairs, final review, fix wave, report.
