# Polish-sit: an upright sit — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the cat's sit (`requestPet`, `perch`) read as the classic Warrior Cats sit: rump on the ground, spine rising to high shoulders, head held high over the chest, forelegs straight columns, haunches tucked, tail lying round or beside the paws.

**Architecture:** Today `animator.js pose()` pitches the torso NOSE-DOWN (`body.rotation.x = -0.5`; in three.js a + rotation.x lifts the nose, which faces -z). The sit flips it to a nose-up pitch, lowers and places the torso so the rump is the low point, retunes the hind `sit` fold (limbs.js) to stay inside the lowered rump, moves the head up/back over the chest, rides the tail root and the group-hung back items on the posed torso, and re-aims the chest bib. All sit numbers live in `torso.js SIT`. Cats only: Hagrid (no folds) keeps his sit line for line.

**Tech Stack:** Three.js 0.185, Vitest 4, Vite 8. Spec: the controller's brief (polish-sit prompt) + shared rules `<scratchpad>/polish-common.md` (read its last section).

**Spike (controller, reverted):** `<scratchpad>/sit-live/spike.diff`. Values that already read as a sit from the side: pitch +0.65, body dy -0.06, head dz +0.16 (back), foreZ -0.05, tail root ridden to body-local (0, 0.10/sy, 0.30/sz), tail rotation.x +0.9, pivot[1].x -0.6, pivots y 0.55. Its faults: the hind thigh's top stood out of the lowered rump as a lump, and the tail lay straight back. Start from these numbers; tune by measurement and shots.

## Global Constraints

- Work only in `<repo>/.worktrees/polish-sit` (branch `polish-sit`). Never push, never merge, never edit `.claude/launch.json`.
- Tests: `npx vitest run --exclude '.claude/**' --exclude '.worktrees/**'` (main: 238 files, 6,535 tests, all green) and `npm run build`. Long geometry sweeps get explicit timeouts (120_000). Never weaken a test to pass a load timeout.
- Commits: explicit `git add <paths>`; every message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Determinism: no Math.random in pose code. test/fixtures/flat-trace.json sha256 must stay 6b502ab6b1f9ce328fd6c6b7ce656fd473e50670708fac53985590bc9f0e54a7 unless the controller rules otherwise; if `test/flattrace.test.js` fails, STOP and report it to the controller (do not re-record).
- Do not change: the standing and walking pose, the nap/tuck pose, any other state, gameplay, Hagrid (any `hagrid:*` key of test/fixtures/hagrid-golden.json). Do not touch test/fixtures/catgolden.json or hagrid-golden.json (the controller regenerates goldens in their own commits).
- Float fixtures compared in tests use `closeDiffs` (test/helpers/closeto.js).
- Copy rule: no new player-facing words.
- Comments follow the file's style: say what and why, with the measured numbers.

## Rulings (controller, recorded in the ledger)

- R1 Hagrid keeps his sit: the upright sit is for rigs with folds (`legs[0].userData.folds`). The hen path in the sit branch stays exactly as it is.
- R2 The home/dressing-room stage shows the cat as built (standing; catstage.js never poses it). Out of scope.
- R3 Height cap: a sitting cat's top (poseMeasure max) is no more than its `follow` top + 0.01 (cat frame), so the name tag (nametag.js TAG_Y 1.18) keeps its margin without touching nametag.js.
- R4 Back items ride the torso in the sit only.

## Review Focus

1. A dressed sitting cat (dressed=1 kit, backpack, wings, jetpack, cape, balloon): items must sit on the back, not float in the air or sink through the fur — Task 3 test.
2. Digit (long legs, scale 0.82, narrow frame) and simple builds (strays, clan cats are simple): the pose must hold on every preset and `{simple:true}` — every new test loops PRESETS minus hagrid × {full, simple}.
3. Leaving the sit to any other state must restore exactly (body z, tail position, item positions): a sit→follow→fresh-follow equality test (Tasks 1–3).
4. The sit with a fluffy ruff / scars / glasses: they hang on body/head and must follow — Task 3 shots and the existing scar/ruff tests must stay green.
5. The tail must not cut through the haunch or the ground at any time t (the tip flicks with sin(t·2.2)) — Task 2 sweeps t.

---

### Task 1: The upright torso, head, forelegs and haunch

**Files:**
- Modify: `src/cat/torso.js` (SIT, POSE_FIT comments/values), `src/cat/animator.js` (sit branch ~l.595, `animateCat`), `src/cat/limbs.js` (`FOLDS.sit`)
- Test: create `test/catsitupright.test.js`; update `test/folds.test.js` (DROP/HEAD_DY tables, the `0.324` main-measure line), `test/catsit.test.js`, `test/catpose.test.js` only where they pin the old nose-down numbers.

**Interfaces:**
- Produces: `SIT` in torso.js gains `pitch` (rad, + is nose up), `bodyDY` (m, added to the sit's body y, equal to `-(FOLDS.sit.drop - 0.02)`), `bodyZ` (m, body.position.z in the sit), `headDY`, `headDZ` (m, replacing the sit's `+0.06`/`+0.1` head offsets for cats), and keeps `chestDepth`, `foreZ`, `foreTilt`. Task 2 and 3 read `SIT.pitch` only through the posed `body.matrix`.

- [ ] **Step 1: Write the failing tests** in `test/catsitupright.test.js`, for every breed in PRESETS (test/helpers/catfingerprint.js) except hagrid, × simple false/true, × state requestPet/perch, posed at t 1.3, all measures divided by `cat.scale.x` (cat frame):
  - `body.rotation.x >= 0.5` (nose up).
  - the torso's lowest vertex (body + underside meshes, world) has y in [-0.01, 0.03] and z > the body's world z (the rump, behind the centre, is the low point).
  - the torso's highest vertex has z < body world z (shoulders/neck high, in front).
  - head centre y >= torso top y - 0.05, and head centre z <= torso top z + 0.05 (head held high over the chest).
  - forelegs: the existing catsit "vertical column" + "sole on the ground (±0.006 of standing)" checks hold; each front hip's top (leg world position) is inside the torso (a ray up from 2 cm below the hip hits body/underside above it).
  - hind legs: hind paw world z < hip z (foot ahead), paw sole min y <= 0.02, `box(leg).min.y >= -0.01`.
  - R3: `poseMeasure(cat, state).max <= poseMeasure(fresh, 'follow').max + 0.01`.
  - Hagrid: posing `hagrid` in requestPet/perch gives body.rotation.x exactly -0.5 and the same head/body positions as on main (assert the numbers: body y and head position read from the current tree before changing it, hard-coded).
  - round trip: requestPet then follow at t 2.1 equals a fresh follow at t 2.1 for body position/rotation, head, tail position, every leg position/rotation/scale.
- [ ] **Step 2: Run** `npx vitest run test/catsitupright.test.js` — expect FAIL on pitch/low point.
- [ ] **Step 3: Implement.** In the sit branch, `if (folds)` path: `body.rotation.x = SIT.pitch`, `body.position.y = base.bodyY - 0.02 + SIT.bodyDY`, `body.position.z = SIT.bodyZ`, front hips at `hipZ + SIT.foreZ`, head `(hx, hy + SIT.headDY, hz + SIT.headDZ)`; the `!folds` (Hagrid) path keeps today's lines byte for byte. Retune `FOLDS.sit.hind` (and `drop` to match `bodyDY`) so the thigh is a rounded haunch inside the side of the lowered rump, knee forward, foot flat in front under the chest: its top must not poke out of the back (folds.test.js 'nothing pokes out of the back' allowance for sit hind stays as is), `INVERTED_MAX.sit` stays 0/0, every control point keeps `g >= radius + 0.002`. Revisit `POSE_FIT.requestPet/perch` (the comment's measurement was for the nose-down torso): keep or re-measure, and say which in the comment. Rewrite the SIT and FOLDS.sit comments for the new pose with measured numbers.
- [ ] **Step 4: Run** the new test plus `test/folds.test.js test/limbs.test.js test/catsit.test.js test/catpose.test.js test/hagrid.test.js test/catgolden.test.js test/animator.test.js`. Update only assertions that pinned the old nose-down pose (DROP/HEAD_DY tables, `0.324`, catsit's `NECK_BEFORE` and `CHEST_FRONT_BEFORE`, catpose's sit torsoMin band), each with a comment saying why the new value holds; for the neck items replace the "no worse than before" pin with an absolute check that a bowtie/necktie's nearest point is within 3 cm of the fur and never more than 1 cm inside it, if that holds — otherwise report the measured numbers to the controller. Expected: all green, hagrid golden untouched.
- [ ] **Step 5: Shoot** with the controller's script: `cd <scratchpad>/sit-live && WHICH=t1 ONLY='tabby-sit|persian-sit|lineup-sit' node shots.mjs` (needs `mkdir -p ../snaps-polish-sit/t1`; dev server on 5197 is the controller's — start your own `npx vite --port 5197 --strictPort` from the worktree only if it is not answering). Look at the side and three-quarter shots against `../snaps-polish-sit/before/`; iterate the SIT numbers until it reads as an upright sit (spine ~35–45° up, rump down, chest up, no thigh lump on the back).
- [ ] **Step 6: Run the full suite and build**, then commit `src/cat/torso.js src/cat/animator.js src/cat/limbs.js` + touched tests: `feat(cat): an upright sit — rump down, chest up, head high, forelegs as columns`.

### Task 2: The tail lies round the paws

**Files:** Modify `src/cat/animator.js` (sit branch tail lines; `animateCat` after the pose fit, beside the stalk's tail ride), `src/cat/torso.js` (new `SIT_TAIL` constant). Test: add a describe to `test/catsitupright.test.js`.

**Interfaces:** Consumes the posed `body` (Task 1). Produces `SIT_TAIL = { ROOT: [y, z] /* torso-local, before body scale */, rotX, pivotX: [5], pivotY: [5] }` in torso.js.

- [ ] **Step 1: Failing tests**, every non-Hagrid preset × simple, both sit states, t swept 0..3 step 0.25:
  - the tail root (tail.position) lies within 3 cm of the torso surface at the rump (inside or on it; ray from the torso centre toward the root).
  - every tail vertex has y >= -0.01 and the tip (last pivot's world position + one link along it) has y <= 0.12 (lying low).
  - the tip's world z < the hind hips' z (it comes round toward the front paws) and |tip x| >= 0.08 (beside, not under, the cat).
  - no tail vertex is inside the torso beyond the root link (links 2–4 vertices outside body/underside: ray test or a conservative ellipsoid check).
  - Hagrid's tail unchanged (rideTail path untouched); the round trip test from Task 1 covers tail position after leaving the sit.
- [ ] **Step 2: Run** — expect FAIL (today's tail sticks out behind).
- [ ] **Step 3: Implement**: in the sit (folds only) the tail root rides the posed body (`body.updateMatrix()`, root point through `body.matrix`), set after `applyPoseFit` like the stalk's; the tail falls to the ground and curls round one side (the cat's left, -x, matching TAIL_HOOK_SIDE) to end beside the front paws; keep a small tip flick (`sin(t*2.2)`) on the last pivot only. Keep `TAIL_CURL_BY_STATE` as is or drop the sit's curl if it fights the wrap — say which in a comment.
- [ ] **Step 4: Run** the tail tests, `test/cattail.test.js test/folds.test.js test/hagrid.test.js test/scarmesh.test.js`, shoot `ONLY='sit'` into `t2/`, check side + three-quarter + front.
- [ ] **Step 5: Full suite + build, commit** `feat(cat): the sitting tail lies round the paws`.

### Task 3: Everything rides the new pose

**Files:** Modify `src/cat/model.js` (tag group-hung body/back-slot items), `src/cat/animator.js` (carry them in the sit), `src/cat/coat.js` (`UNDER_FRONT.chest`, its comment) only if the bib check below fails. Test: `test/catsitupright.test.js` (new describe).

**Interfaces:** Produces `userData.ridesBody = true` on every mesh/group model.js's cat builder adds to `g` for the body and back slots (cape, confetticape group, clasps, backpack, wings, jetpack tanks and nozzles, balloon and balloonbunch strings/knot/balloons) — not on hen.js items, not on body/head/legs/tail, never on anything another module adds to the group (name tags, shadows). The animator, in the sit only (folds rigs), places each by `bodyPosed · bodyRest⁻¹ · itemRest` (rest remembered on first move, as `carry()` does; body rest = base.bodyY position, zero rotation, base.bodyScale), and restores each to its rest in every other state.

- [ ] **Step 1: Failing tests:**
  - every non-Hagrid preset in each sit state with `back: backpack|wings|jetpack` and `body: cape|confetticape`: each item's centre stays within 1 cm of where the body's posed transform carries its rest point (exact check of the mechanism), and items never go below y 0.
  - a backpack's nearest vertex is within 3 cm of the fur in the sit (ray down from above onto body).
  - sit → follow restores every ridesBody item to its built position/quaternion exactly; a follow never moves them.
  - the chest bib faces the front camera in the sit: the underside vertex with the palest colour… — concretely: the underside chest vertices whose colour is within 0.05 of the belly colour (`undersideColourAt` at `t>=1` band) have a mean world normal with z < -0.5 in the sit and in follow. If this already passes, leave coat.js alone.
  - scars, glasses, ruff: the existing scar/ruff/glasses tests stay green (no new test).
- [ ] **Step 2: Run** — expect FAIL on the item placement.
- [ ] **Step 3: Implement** the tag and the carry (a small helper beside `rideTail`; allocate nothing per frame). If the bib test fails, re-aim `UNDER_FRONT.chest` and rewrite its comment with the measured angles standing/sitting.
- [ ] **Step 4: Run** the new tests plus `test/catmodel.test.js test/catcoat.test.js test/catcustom.test.js test/scarmesh.test.js test/catsit.test.js test/hagrid.test.js`. `test/catgolden.test.js` will fail only if coat.js changed the underside colours: then leave the golden alone and report it (the controller regenerates it in its own commit). Shoot `ONLY='dressed|wings|pack|glasses|scars'` into `t3/` and look.
- [ ] **Step 5: Full suite + build, commit** `feat(cat): back items, bib and the rest ride the upright sit`.

### Task 4 (controller): goldens, trace, live shots, report

- Regenerate catgolden.json in its own commit if it moved (`UPDATE_GOLDEN=1 npx vitest run test/catgolden.test.js`, then restore hagrid-golden.json if R1 holds), check the flat-trace hash, take AFTER shots with `WHICH=after node shots.mjs`, build pairs, final review (opus), one fix wave, report.
