# polish-hen: Hagrid's fight moves — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In a clan fight, Hagrid the hen plays a funny, cartoon-cute, hen-flavoured version of every fight move a cat plays (leap, rear-up, pin, rolling tumble, the square-off beats, the answer poses, flinch/pinned/scared), with flapping wings — instead of standing still.

**Architecture:** Hagrid joins the cats' action path (fightactions.js) in clanfight, but with scars still off. While he is in a fight, avatar.js maps each fight pose to a hen-only state name (`henCross`, `henPounce`, …); the animator hands those to a new `src/cat/henfight.js`, which poses the rig and drives two flappable wings that are built lazily the first time (so the model at build time, and hagrid-golden.json, never change). Every state the golden pins keeps its exact code path.

**Tech Stack:** Three.js 0.185, Vite 8, Vitest 4.

**Spec:** scratchpad `polish-survey-3.md` broken #2 / build B5b; `docs/superpowers/specs/2026-11-01-fight-moves-and-scars-design.md` (actions, R6 Hagrid); fight frames in `src/fightactions.js`.

## Global Constraints

- `test/fixtures/hagrid-golden.json` and `catgolden.json` must not change. Never regenerate them. Hagrid's follow/nap/stretch/groom/requestPet/perch/sniff/stalk/pounce/scared/cross/land/walk keep their code paths byte for byte.
- No cat (non-hen) animation changes.
- Fight logic and outcomes unchanged: the fight rng is drawn once per clue (fight.js), so timing changes nothing about who wins. Hagrid is still never scarred, and nobody is scarred in his fights (`site` stays `null`, fightrecord.js skips it).
- Flat trace stays sha256 3dfb11a4d847498330c2f1bbc766add06531d4efadaab4c710868df495c1d838.
- No Math.random in anything a walk runs: the lazy wing rig is built under `withLocalUuids` (src/world/localuuids.js).
- No per-frame allocation in the hen poses (reuse module-level temporaries).
- Reduced motion: no fast flapping or bobbing; wings held at a still pose.
- Nothing scary: cartoon flaps, hops and pecks; no blood, no feathers torn off.
- Tests: `npx vitest run --exclude '.claude/**' --exclude '.worktrees/**'` plus `npm run build`. Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Rulings (ledger)

- **H1** Hagrid fights in actions (`actions: true`) with a new `scars` option false. Cost if wrong: the owner wanted R6's short tumble kept — one line in walk.js puts it back.
- **H2** Hen fight states are new names reached only through `henFightState()` in a fight, so every golden-pinned state keeps its path. Cost if wrong: none to the golden; a little duplication.
- **H3** The wings that flap are built lazily on the first hen fight state, and the body swaps to a wingless body geometry while they show (like `wearCape`). Out of a fight the original body geometry comes back and the wings hide at rest. Cost if wrong: 2 more meshes (+2 shadow draws) on Hagrid during fights only.
- **H4** catDims/catPivot measure Hagrid's hen 'pinned' and 'roll' and his real feet (the dummies have no geometry), so a cat pinning him lands on his actual back.

## Review Focus

1. Leaving a fight (or `catDims` measuring at startFight) must leave Hagrid looking exactly like before — the wingless body swapped back, the fight wings hidden **and reset to rest** (hidden objects still count in Box3.setFromObject).
2. Hagrid's feet never sink below the ground in any hen fight state at any t (pose-only, before the group's fight pitch).
3. The rig is built once: a second fight reuses it, and building it draws no Math.random.
4. A fight that ends mid-action (abort, chased off together) leaves no hen state behind: the next non-fight pose restores the rig.
5. Reduced motion: hen states are still (the same transforms at two different t).

---

### Task 1: The hen's fight rig and poses

**Files:**
- Create: `src/cat/henfight.js`
- Modify: `src/cat/hen.js` (`henBodyGeometry` gets an optional `{ wings = true }`; new export `henWingGeometry(s)`)
- Modify: `src/cat/animator.js` (one hook in `pose()`, one after it in `animateCat`)
- Test: `test/henfight.test.js`

**Interfaces:**
- Produces:
  - `HEN_FIGHT_STATES: Readonly<Record<string,string>>` — `{ cross:'henCross', arch:'henArch', land:'henLand', pounce:'henPounce', swipe:'henSwipe', rearUp:'henRearUp', flinch:'henFlinch', pinning:'henPinning', pinned:'henPinned', roll:'henRoll', scared:'henScared' }`.
  - `henFightState(state: string): string` — the map's value, else `state` unchanged (follow, stalk, backUp pass through).
  - `isHenFightState(state): boolean`.
  - `poseHen(cat, state, t, reducedMotion): void` — called from `pose()` after the base reset when `isHenFightState(state)`; writes body/head/legs/tail/comb and the two fight wings; `pose()` returns right after.
  - `syncHenRig(cat, state): void` — called at the end of `animateCat`'s pose step for every cat with `userData.breed === 'hagrid'`: in a hen state, body uses the wingless geometry and both fight wings are visible; otherwise, if the rig exists, the original body geometry is back, wings hidden and their pivots at rotation (0,0,0). Never builds the rig outside a hen state.
  - Rig (on `cat.userData.henRig`): `{ bodyGeo, winglessGeo, wings: [left, right] }`, each wing a pivot `Group` child of `body` with scale `1 / HEN_BODY.SCALE` placed at its shoulder hinge, holding one mesh of `henWingGeometry(s)` (cat units, translated so the hinge is its origin), same material as the body, `castShadow` copied from the body. Wing pivot `rotation.z = s * open` lifts the wing out and up; `rotation.y = s * swing` swings its tip forward; `rotation.x` tips it.
  - `henWingGeometry(s: -1|1): BufferGeometry` and `henBodyGeometry({ wings:false })` — the same parts henBodyGeometry merges today; `henBodyGeometry()` with no argument must stay byte-identical.

**The moves** (hen-flavoured; exact numbers are the implementer's, tuned live in Task 3):
- `henCross` (square-off, the rest between): chest puffed (body ×1.08), wings a little out "hands on hips" (open ~0.35), head low and forward with a slow bob, tail fan up.
- `henArch` (the hiss beat): big feather puff (body ×1.2), wings spread wide (open ~1.1) with a small shiver, head up, tail fan high, a little bounce on his toes.
- `henLand` (crouch before a leap, the dodge): squat (body down, legs shortened), wings half out ready (open ~0.6), a quick bounce — the dodge-skip.
- `henPounce` (a leap's flight, the pin's flight, hops home): wings flapping fast (open swings ~0.3–1.4), feet tucked forward, body pitched nose-up a touch — a flap-hop.
- `henSwipe` (answer prelude): the right wing swung forward (swing ~1.0, open ~0.9) — a wing slap; head forward.
- `henRearUp` (the boxing): stands tall (legs long, body leant forward against the group's 0.9 rad pitch), wings slapping alternately forward (one wing's swing up while the other's down), beak pecking forward on a quick sine.
- `henFlinch` (got hit): feather poof (body ×1.12), wings up in alarm (open ~1.3), head pulled back and up, comb wobble.
- `henPinning` (sitting on the cat's back): a hen on her nest — body low on folded legs, wings out for balance flapping slowly, head pecking gently down.
- `henPinned` (a cat on top): squashed flat (body y ×0.7), wings splayed flat out (open ~1.5, tipped down), legs out, head forward on the ground.
- `henRoll` (tumble ball): a feather ball — body round (×1.1), legs tucked up (scale small), head tucked in, wings wrapped (open 0), tail fan folded.
- `henScared` (after a lost tumble): wings up (open ~1.2), poof, tail tucked, little hops.
- Under reducedMotion every one is the same at any t.

- [ ] **Step 1: Write the failing tests** in `test/henfight.test.js`:
  - `henFightState` maps every key above and passes `follow`, `stalk`, `backUp` through.
  - `henBodyGeometry()` position/color arrays equal today's (compare against `henBodyGeometry({ wings: true })` and against the hagrid-golden `0|…` body line via `fingerprintCat(buildFor('hagrid:follow'))` still equalling the fixture — the golden test already covers it; assert `henBodyGeometry({wings:false}).attributes.position.count + 2 * henWingGeometry(1).attributes.position.count === henBodyGeometry().attributes.position.count`).
  - For each hen state at t in [0, 0.37, 1.3, 2.9]: every transform finite; the lowest foot vertex (legs[0..1] `userData.paw`, group frame, `Box3.setFromObject(paw, true)`) has y ≥ -0.02.
  - `henArch`, `henPounce` (some t), `henFlinch`, `henPinned`, `henScared`: both wings' `rotation.z * s` ≥ 0.5; `henRoll`: both 0.
  - `henSwipe`: the right wing's tip (its mesh's world bounding-box max-|x| corner) moves forward (smaller z) vs rest.
  - Each hen state's posed fingerprint differs from `follow`'s.
  - After `animateCat(cat, 'henArch', …)` then `animateCat(cat, 'follow', 1.3, 0)`, the fingerprint of visible meshes (skip invisible objects and their children) equals that of a fresh `buildCat('hagrid')` posed `follow` at 1.3, and `new Box3().setFromObject(cat)` matches the fresh one to 1e-4.
  - The rig is built once (same wing objects after two hen states), and building it calls Math.random 0 times (`vi.spyOn(Math, 'random')`).
  - reducedMotion: fingerprint at t=0.4 equals t=2.2 for every hen state.
  - A tabby posed `henArch` is untouched by henfight (it is never called for a cat: `syncHenRig` and `poseHen` only act on `userData.breed === 'hagrid'`; assert a tabby's `userData.henRig` stays undefined).
- [ ] **Step 2:** Run `npx vitest run test/henfight.test.js` — FAIL (module missing).
- [ ] **Step 3:** Implement hen.js exports, `src/cat/henfight.js`, and the two animator hooks (`if (cat.userData.breed === 'hagrid' && isHenFightState(state)) { poseHen(…); return; }` right after the ear-twitch lines in `pose()`; `syncHenRig(cat, state)` in `animateCat` right after `pose(...)` for hagrid only). The rig is built inside `withLocalUuids`.
- [ ] **Step 4:** Run `npx vitest run test/henfight.test.js test/catgolden.test.js test/animator.test.js` — PASS, goldens untouched (`git diff --stat test/fixtures` empty).
- [ ] **Step 5:** Commit `feat(hen): Hagrid's hen fight poses with flappable fight wings`.

### Task 2: Hagrid fights in actions (scars still off)

**Files:**
- Modify: `src/game/avatar.js` (the `animateCat(cat, drawn, …)` call)
- Modify: `src/cat/model.js` (`catDims`, `catPivot`)
- Modify: `src/game/clanfight.js` (new `scars` option)
- Modify: `src/game/walk.js:1463`
- Test: `test/clanfight.test.js`, `test/walk.edition.test.js` (source pin), `test/fightactions.test.js` or `test/henfight.test.js` (dims)

**Interfaces:**
- Consumes: `henFightState` (Task 1).
- Produces: `createClanFight({ …, actions, scars = actions })`. With `scars` false: `siteOf` and `chasedOffTogether` give `site: null`, and the lose toast is the old `"${name} shook it off and walked on. Try again soon!"`.

- [ ] **Step 1: Failing tests:**
  - clanfight: `harness({ actions: true, scars: false })` (thread `scars` through the harness) — a won fight calls `onWon` with `site: null`; a lost one `onLost({ site: null })` and toasts "Try again soon!"; chasedOffTogether `site: null`; and the staging is the action path (`intruders.stage` gets `pitch`/`roll` fields as in the actions tests).
  - walk.edition source pin: the clanFight line contains `actions: true` and `scars: active.breed !== 'hagrid'` (replace the old `actions: active.breed !== 'hagrid'` expectation).
  - dims: `catDims(buildCat('hagrid'))` has `hindZ > 0` and finite, `pinnedBackY` equals `catBackY(hen, 'henPinned')`, and it leaves the hen's visible fingerprint equal to a fresh follow (Review Focus 1). Cat dims for tabby unchanged (`catDims(buildCat('tabby'))` equals a value recorded before the change in the test).
  - avatar: in a fight (`s.fight` set, `s.fightPose = 'rearUp'`) a Hagrid avatar is animated as `henRearUp`; a tabby as `rearUp`; Hagrid out of a fight with pose 'pounce' as `pounce`. Follow avatar.js's existing test harness (test/avatar*.test.js); if none drives animateCat, assert via the source pin instead.
- [ ] **Step 2:** Run them — FAIL.
- [ ] **Step 3:** Implement: avatar passes `s.fight && cat.userData.breed === 'hagrid' ? henFightState(drawn) : drawn` (s.pose on the wire stays `wirePose(pose)`); catDims measures `henFightState('pinned')` for hagrid and catPivot rolls `henFightState('roll')` and uses `legs.slice(0, 2)` for hagrid; clanfight `scars`; walk.js `actions: true, scars: active.breed !== 'hagrid'` (keep the comment true: "everyone fights in actions; Hagrid is never scarred (R6)").
- [ ] **Step 4:** Full suite and build green; flat-trace hash unchanged (`shasum -a 256 test/fixtures/flat-trace.json`).
- [ ] **Step 5:** Commit `feat(fight): Hagrid fights in actions as a hen, still never scarred`.

### Task 3: Live check and tuning (parent)

- [ ] Run the scratchpad fight harness (snaps-polish-hen/harness/fights.mjs) as Hagrid, desktop and phone (390×844), through leap/rearUp/pin/roll both ways and the beats; tune the numbers in henfight.js until each reads at fight-camera distance; re-run Task 1's tests after each tune.
- [ ] Before/after pairs in `snaps-polish-hen/pairs/`, plus a contact strip of each move's key frames.
- [ ] Draw calls before/after mid-fight.
