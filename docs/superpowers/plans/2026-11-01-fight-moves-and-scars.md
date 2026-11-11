# Fight actions, special moves and scars — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clan fights stop being two cats circling: each round's result plays as a real action (leap and scratch, rear-up swatting, pin, rolling tumble), the cats square up between rounds, a kid learns special moves by winning (or buys two of them), and the loser of a fight carries a scratch scar that fades over five walks.

**Architecture:**
- **Pure rules stay pure.** `src/fight.js` (still import-free) learns once-per-fight specials worth two round wins, and a per-round action length handed in by its caller. `src/fightmoves.js` is the move catalogue, `src/fightactions.js` the action table and a pure keyframe sampler (where each cat stands, how high, its pitch/roll and pose at time u of an action), and `src/scars.js` the scar rules. None of them touches THREE, the DOM or the save.
- **The controller is still never handed progression.** `src/game/clanfight.js` stages the actions from the sampler and reports the end of a fight through two callbacks, `onWon` and `onLost`. A small new module, `src/game/fightrecord.js`, turns those into exactly the allowed save writes (fights won, move unlocks and the intruder's scar on a win; her cat's scar on a loss) and is the only fight code that holds progression.
- **A scar is one mesh, only on a scarred cat.** `src/cat/scarmesh.js` builds up to two scars' thin raised strips into ONE vertex-coloured mesh hung on the cat group, and `animateCat` re-fits its vertices to the head and torso at the end of every frame (a face scar rides the head, a body scar the torso, in one draw). No mesh at all on an unscarred cat, so every golden stays byte-identical.
- **Hagrid fights exactly as today** (`actions: false`): today's tumble, no scars on either side.

**Tech Stack:** Three.js 0.185, Vite 8, Vitest 4, plain ES modules.

**Spec:** `docs/superpowers/specs/2026-11-01-fight-moves-and-scars-design.md` (all of it). Approved sketch of the action shapes: https://claude.ai/artifact/BHK3XNVWhM93hai46gBymd (source: the scratchpad's `fight-sketch.html`, scenes `a`–`e`).

## Global Constraints

- **SAVE_VERSION stays 4.** New save fields are additive and sanitised: `fightsWon`, `fightMoves`, `scars`, `scarredIntruders`. Hostile input is clamped, never trusted, never throws.
- **The clue stays honest and speed never matters** (src/fight.js's three promises). A special answers a clue like a button; no time value ever reaches an outcome or an action's length.
- **No new rng draws** on walkRng or strayStream; the fight's own rng is still drawn once per clue and nowhere else. Which action plays, which beat, which scar site and side are pure functions of the round, its clue/answer/result and stable ids. Co-walkers still agree on intruders (nothing new on the wire but `accessories.scars`).
- **test/fixtures and Hagrid's goldens byte-identical, never regenerated.** `UPDATE_GOLDEN` is forbidden. No existing animator state's output changes (catpose-baseline, catgolden).
- **Budget:** mesh caps +1 only on a scarred cat (custom cats ≤ 32 full / ≤ 26 simple when scarred; each preset's catmodel CEILING +1 when scarred); triangle caps 8000 / 5500 hold scarred. The scar mesh never casts a shadow. Fight fx are pooled (no per-frame allocation). The iPhone 18 must hold 60 fps mid-fight.
- **Reduced motion:** no leaps, rolls, pitches or shakes; the winner stands tall, the loser crouches, one dust puff. Scars never animate.
- **Our own words:** no Warrior Cats canon names; move names are plain English; `test/clanwords.test.js`'s borrowed-word scan stays green.
- **Losing costs nothing but a fading scar:** no points, cats, unlocks, marks, moves or fights-won count.
- **Phone first:** the three basic buttons stay ≥ 88 px in the bottom third in portrait; landscape keeps Part 2's `clamp(64px, 22vh, 88px)`. Specials sit in a smaller row above them (portrait) or in the left column under the clue (landscape). The whole fight sheet stays ≤ 46vh (the fight camera frames the cats above NDC −0.08, `FIGHT_FRAME.bottom`).
- **Test command:** `npx vitest run --exclude '.claude/**' --exclude '.worktrees/**'` (main: 194 files, 5,230 tests). Build: `npm run build`.
- **Commits:** explicit `git add <files>`, message ends with exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never delete a file you didn't create; no wildcards in `rm`.

## Rulings (Claude's, on what the design leaves open)

Each is final for this build; "cost if wrong" is what changing it later would take.

- **R1 Fade clock.** A scar's `left` starts at 5 and drops by 1 in `completeWalk` (any area, any edition, the den included); stage = `full` when left ≥ 3, `half` at 2–1, `faint` at 0; a scar at 0 is removed by the next `completeWalk`. So: full the walk it happened and the next 2, half for 2, faint for 1, gone. — cost if wrong: one constant table in `src/scars.js`.
- **R2 Seed `fightsWon`.** A save without `fightsWon` starts at its `feats.intruder` (fights she already won since Part 2 shipped). — cost: Rear-up Swat may unlock on her first walk; that is a nice surprise, not a bug.
- **R3 Moves are never taken away.** `fightMoves` keeps any known id; earned moves are added when `fightsWon` reaches their count (and by the sanitiser). Cloud load keeps max(local, loaded) `fightsWon` and the union of moves. — cost: none.
- **R4 Where the moves live:** a "Fighting moves" section at the end of the Skills sheet (Clan Edition only), with each move's clue, progress ("Win 4 more fights") and, for the two buyable ones, a "Learn now — 300 🐾" button. — cost: moving one render call.
- **R5 Toast copy:** `New move: Rear-up Swat! Use it when they raise a paw.` / `…Leap and Scratch! Use it when they back up.` / `…Pin! Use it when they crouch.` / `…Rolling Tumble! Use it on any move.` Lost fight toast (a cat that can scar): `${name} shook it off and walked on. That scratch will heal in a few walks!`; Hagrid keeps today's line. — cost: strings.
- **R6 Hagrid** (`actions: false`): today's code path verbatim (cross square-off, 1.4 s tumble, circling), may use specials (`specials` is passed to `createFight` whatever `actions` is; they win/lose like any answer and play today's tumble), and nobody is scarred in his fights. fightsWon still counts. — cost: if she wants intruders scarred by Hagrid, one `site` computation.
- **R7 Specials wire nothing.** The fight sheet, the moves and the actions are local; the only new wire field is `accessories.scars`, present only when her active cat has a scar (an unscarred profile is byte-identical to today's). Entries are `{ site, stage, side }` (side added so the partner sees the scar on the same side). — cost: none; older builds ignore the key.
- **R8 Wire pose:** the new fight states are mapped to existing ones on the wire (`WIRE_POSE`: arch→cross, rearUp→swipe, flinch→scared, pinned→scared, pinning→stalk, roll→pounce), since pitch, roll and lift aren't sent. — cost: none.
- **R9 Square-off beats:** three, by round number with no draw: 0 arch (both arch, a hiss), 1 sidestep (both step sideways 0.3 m in 'cross' and back), 2 stare (both 'cross', tail lashing, step in 0.15 m and back). No circling. The first square-off is beat 0. Beat phase length 1.2 s (was 0.8). — cost: a table.
- **R10 Action lengths** (s, after the 0.35 s answer prelude): leap 2.4, rearUp 2.6, pin 2.8; specials: leap 3.0, rearUp 3.2, pin 3.2, roll 3.4. Reduced motion: 0.8 s in total (0.2 s answer pose + 0.6 s still result; today the whole reduced tumble is 0.6 s). Worst full fight 29.65 s (secondLook, a big special action in the last round) — pinned by a test (< 30.5 s). — cost: tuning numbers in one table.
- **R11 Chased off together** scars the intruder at the site of the last round she won in that fight, else `siteFor('roll', castId)` (side/hindquarters by hash). — cost: cosmetic.
- **R12 Ghosts get no scars** (a friend's ghost is a past visit). Album photos are canvas snapshots, so they show scars for free. — cost: one opts line in ghosts.js.
- **R13 One scar mesh, CPU-fitted.** Strips are authored in head-local or body-local space and re-placed each frame by `fitScars` (≤ 60 vertices per cat, no allocation). Chosen over two meshes (breaks +1) and over a SkinnedMesh (fragile with mergeprops, thumbnails and disposal). `frustumCulled = false` on it. — cost: a different fit if it ever shows a seam.
- **R14 Scar colour:** full = `0xd04a5a` soft red, half/faint lerp 45% / 75% toward the coat's base colour; on a coat too close to that red (`colourDistance` < 0.25 in test/helpers/catfingerprint.js's L1 metric over 0–1 channels, max 3) full uses a pale `0xf2a6ae`. — cost: a colour table.
- **R15 Left/right side:** `scarSide(id)` = `(seedFromCode(id) & 1) ? 'l' : 'r'` for her cat (her scar key) and intruders (cast id). — cost: none.
- **R16 Buying moves** only in Clan Edition (`canBuyMove` refuses in Legacy), with paw points through progression like `buy()`; no confirm step (the dressing room buys with one tap too). — cost: none.
- **R18 Moves granted silently on load are toasted once.** Moves the sanitiser adds (R2/R3 seeding a kid who already won fights) are queued like `takeFarewell`; `takeNewMoves()` returns them once, and walk start shows each `unlockToast` at the next Clan Edition walk. — cost: none.
- **R19 Yaw comes from the anchors in actions mode.** Both cats face along the anchor line (spot ↔ foeAt), never toward the other cat's staged position (the pin and the roll put them on one spot). — cost: none.
- **R20 Pitch, roll and lift become group transforms through one pure helper** (`placeFrame`, Task 2): pitch turns about the hind feet, roll about the torso centre, `lift` is the rise of the torso centre. Her cat's pitch/roll reach the group through `applyWaterLook` (it runs after the fight each frame and owns `rotation.z`). — cost: none.
- **R21 Never a clue pose outside the clue.** No action or beat frame puts the intruder in 'stalk', 'swipe' or 'backUp' outside the clue phase and the answer prelude; the reduced-motion loser is 'flinch'. — cost: none.
- **R17 Editing a custom cat keeps its scars**; a new custom cat on a reused id starts clean (`createCustomCat` drops `scars[id]`); the sanitiser drops scars for custom ids not in `customCats` and for unknown keys. — cost: none.

## Review Focus

- **A special tapped too early, twice, after it's spent, or outside a clue** must be ignored and NOT spent (only a scored answer spends it) — test in Task 1.
- **A hostile or old save** (scars on unknown cats, 3+ entries, duplicate sites, `left` NaN/1e9/-1, 1000 intruder entries, bad cast ids, `fightsWon` '9e99'/-5/1.5, junk `fightMoves`, a cloud payload without the keys) loads clamped and never throws — tests in Task 3.
- **A fight that ends mid-action** (abort, page hidden, walk end, the intruder gone, a partner's win) leaves no pitch/roll on either cat, no stage on the intruder, no scar and no fights-won — test in Task 6.
- **Phone landscape** with four specials owned: the specials row and the three buttons fit without covering the cats (Part 2's landscape grid) — CSS in Task 7, checked live in Task 10.
- **Switching cats** after a loss: the new cat has no scar, the old one keeps fading by walk count; Hagrid equipped never scars and never throws — tests in Task 3 and Task 8.

---

### Task 1: Fight rules — specials and per-round action length

**Files:**
- Create: `src/fightmoves.js`
- Modify: `src/fight.js`
- Test: `test/fightmoves.test.js` (new), `test/fight.test.js`

**Interfaces:**
- Produces (`src/fightmoves.js`, no imports):
  - `FIGHT_MOVES`: frozen array, in this order: `{ id: 'rearUpSwat', name: 'Rear-up Swat', answers: 'swipe', action: 'rearUp', earnAt: 3, price: 300, hint: 'Paw up', when: 'they raise a paw' }`, `{ id: 'leapScratch', name: 'Leap and Scratch', answers: 'charge', action: 'leap', earnAt: 6, price: 600, hint: 'Backs up', when: 'they back up' }`, `{ id: 'pin', name: 'Pin', answers: 'pounce', action: 'pin', earnAt: 10, price: null, hint: 'Crouch', when: 'they crouch' }`, `{ id: 'rollingTumble', name: 'Rolling Tumble', answers: 'any', action: 'roll', earnAt: 20, price: null, hint: 'Any move', when: null }`.
  - `FIGHT_MOVE_IDS` (the ids), `moveById(id) → entry | null`, `earnedMoves(fightsWon) → string[]` (ids with earnAt ≤ n, catalogue order, junk n → []), `unlockToast(id) → string` (R5 copy; `when === null` → "Use it on any move."), `teachFor(ids) → string` (`' · 🐾 → Rear-up Swat'`, using `CLUES[answers].icon`, `' · any → Rolling Tumble'`, for each known id, catalogue order).
- Produces (`src/fight.js`, still import-free): `createFight({ rng, edge, reducedMotion, specials = [], actionTime = null, beatTime = TIMING.beat })`.
  - `specials`: `[{ id, answers }]` (answers a MOVES id or `'any'`). `f.answer(id)` accepts a special id that is in `specials` and not yet used; a scored special is spent (`f.used: string[]`) whether it wins or not.
  - A special wins when `answers === 'any' || answers === f.move`, and then adds **2** to `f.wins`; a wrong one adds 1 to `f.losses`. Its round event is `{ type: 'round', round, move, answer: id, won, special: true }`; basic round events keep today's exact shape (no new keys).
  - `actionTime(roundEvent) → seconds` replaces the tumble length for that round when given (default: today's `tumble` / `tumbleReduced`). `beatTime` is the beat phase length.
  - The fight is over when `wins >= 2 || losses >= 2`, and `f.won = f.wins >= 2` (today's fight.js:79–81 use `=== 2`; both lines change — a special from 1–0 takes wins to 3).

- [ ] **Step 1: Write the failing tests** in `test/fightmoves.test.js`: the catalogue values above verbatim; `earnedMoves(0)` → `[]`, `earnedMoves(3)` → `['rearUpSwat']`, `earnedMoves(20)` → all four, `earnedMoves('9e99'|NaN|-1)` → `[]`; `unlockToast('pin') === 'New move: Pin! Use it when they crouch.'`, `unlockToast('rollingTumble') === 'New move: Rolling Tumble! Use it on any move.'`; names contain no word from `clanwords.js`'s borrowed list. In `test/fight.test.js` add:
  - `'a special on its clue wins and counts two'`: from 0–0 a right special ends the fight `over won:true` with `wins === 2`; from 0–1 (one wrong basic first) a right special wins the fight; from 1–0 it ends `over won:true` with `wins === 3`.
  - `'a special on the wrong clue loses the round and is spent'`: `f.used` contains it, `losses === 1`, a second tap of the same id in a later clue returns `[]` and changes nothing.
  - `'Rolling Tumble answers any clue'`.
  - `'a special is ignored, not spent, before ignoreFirst, outside a clue, or when not owned'` (Review Focus).
  - `'actionTime sets each round\'s action length from the round alone'`: with `actionTime: (e) => e.won ? 2 : 3`, the phase after a won round lasts 2 s and after a lost one 3 s; `beatTime: 1.2` lasts 1.2 s.
  - The existing `'fight.js imports nothing'` test stays and must stay green.
- [ ] **Step 2:** Run `npx vitest run test/fight.test.js test/fightmoves.test.js` — the new tests FAIL.
- [ ] **Step 3:** Implement `src/fightmoves.js` and the `createFight` options above. Speed promise: `actionTime` is called with the round event only.
- [ ] **Step 4:** Run the two files — PASS, and every existing fight test unchanged.
- [ ] **Step 5: Commit** `feat(fights): special moves in the fight rules, worth two rounds, once per fight` (`git add src/fightmoves.js src/fight.js test/fightmoves.test.js test/fight.test.js`).

### Task 2: Actions — the table, the keyframes and the new poses

**Files:**
- Create: `src/fightactions.js`
- Modify: `src/cat/animator.js` (new states only), `src/cat/model.js` (export `catBackY`)
- Test: `test/fightactions.test.js` (new), `test/animator.test.js`

**Interfaces:**
- Consumes: `FIGHT_MOVES`, `moveById` (Task 1); `COUNTER` (fight.js).
- Produces (`src/fightactions.js`; may import `./fight.js`, `./fightmoves.js` and `./rng.js` only):
  - `ACTION_KINDS = ['leap', 'rearUp', 'pin', 'roll']`; `ACTION_LEN` (R10: `{ leap: 2.4, rearUp: 2.6, pin: 2.8 }`, `ACTION_LEN_BIG = { leap: 3.0, rearUp: 3.2, pin: 3.2, roll: 3.4 }`); `ANSWER_PRELUDE = 0.35`, `ANSWER_PRELUDE_REDUCED = 0.2`, `REDUCED_ACTION = 0.6`, `BEAT_TIME = 1.2`.
  - `actionFor(round) → { kind, by: 'me' | 'it', big }` from a round event, per the design's table: won basic swipe → leap/me, pounce → rearUp/me, dodge → pin/me; won special → its `action`/me/big; lost (any answer or none) → by `it`, kind by clue: `charge` → leap, `swipe` → rearUp, `pounce` → pin.
  - `actionTime(round, reducedMotion) → seconds` = prelude + (big ? ACTION_LEN_BIG : ACTION_LEN)[kind], or 0.8 reduced (R10).
  - `preludeFrame(round, role, u) → Frame` (u over the 0.35 s prelude): today's answer/move poses, except that with actions the dodge goes out and back (`SIDE_STEP·sin(πu)`, home at u = 1) and a special uses the pose of the basic button that answers the same clue (`COUNTER[answers]`; Rolling Tumble: 'pounce').
  - `siteFor(kind, scarredId) → 'face' | 'shoulder' | 'back' | 'side' | 'hind'`: leap → face, rearUp → shoulder, pin → back, roll → `(seedFromCode(String(scarredId)) >>> 1) & 1 ? 'side' : 'hind'`.
  - `actionFrame(kind, big, u, { gap, winBackY, loseBackY, reducedMotion }) → { win: Frame, lose: Frame }` for u ∈ [0, 1] of the action body (after the prelude), with `Frame = { along, side, lift, pitch, roll, pose, slash?, dust? }`: `along` metres from that cat's own anchor toward the other cat, `side` metres to its right, `lift` metres up, `pitch` radians nose-up about the hind feet, `roll` radians about its own forward axis. Pure; returns the same object shapes with no allocation per call beyond the two frames (callers may pass `out`). Shapes follow the sketch (spec "What the owner decided" 1): leap = crouch, spring to `gap − 0.6` with a lift arc (peak 0.5, big 0.7), scratch (`slash: true` once at the scratch), hop home; the loser flinches back 0.3 ('flinch'). rearUp = both step in 0.25, both `pitch` ≈ 0.9 in 'rearUp' with a 0.05 bob, the loser drops to 'flinch' and steps back 0.3 at the end (big: 0.5). pin = the winner springs onto the loser's back (`along = gap`, `lift = loseBackY`, 'pinning'), the loser flattens ('pinned'), a small hold shake, the winner hops home. roll = both meet at `gap / 2`, roll two full turns (`roll` 0 → 4π, `lift` ≈ 0.25, 'roll'), `dust: true` at u ≈ 0.2 and 0.5, the loser breaks away back to its anchor in 'scared'. Every frame at u = 1 is home (along 0, lift 0, pitch 0, roll 0). Reduced motion: winner 'cross', loser 'flinch' (R21), all offsets 0, `dust: true` at u = 0.
  - `placeFrame(frame, { hindZ, pivotY }, out) → { dAlong, y }` (R20), pure: pitch turns about the hind feet (`dAlong`, `y` from `hindZ·sin(pitch)` and `hindZ·(1 − cos(pitch))` so the hind paws stay put), roll about the torso centre (`y += pivotY·(1 − cos(roll))`), plus `lift`. `hindZ` and `pivotY` are the cat's own (scaled) hind-foot offset and torso-centre height, read once per fight with `catPivot(group) → { hindZ, pivotY }` (model.js). Everything that places a cat — clanfight, the intruder staging, the camera reach and its test — goes through `placeFrame`.
  - `beatFrame(beat, u) → Frame` for both cats (R9), `beatFor(round) → 0 | 1 | 2` (= round % 3).
  - `WIRE_POSE` (R8) and `wirePose(state) → string`.
- Produces (`src/cat/animator.js`): states `'arch'`, `'rearUp'`, `'flinch'`, `'pinned'`, `'pinning'`, `'roll'`. Each writes only parts the base reset resets (body/head position/rotation/scale, leg rotation/scale, tail, ears, tail pivots) — never leg *positions* — and returns before the generic gait except 'arch' (falls through to the lash like 'cross'). 'rearUp' swings the two front legs in alternating swats (`sin(t * 9)`), 'roll' tucks all four legs, 'pinned' is low and flat with ears pinned, 'pinning' crouches with front paws pressing down, 'flinch' leans back with ears flat (no lash under reducedMotion).
- Produces (`src/cat/model.js`): `catBackY(group, state = 'follow') → number`, the body mesh's top (world Y, group at y 0, no rotation) after `animateCat(group, state, 0, 0)` — measured, not computed from TORSO, so the pin lands on a flattened 'pinned' back; the pin uses `catBackY(loser, 'pinned')`. `catPivot(group) → { hindZ, pivotY }`. Both restore nothing they don't own (call them once at fight start, before staging).

- [ ] **Step 1: Write the failing tests** in `test/fightactions.test.js`:
  - `'actionFor follows the design table'`: every (move, answer, won, special) case above, including a lost special → by 'it' by clue, and a timeout (`answer: null`) → by 'it'.
  - `'siteFor: leap face, rearUp shoulder, pin back, roll side or hind by id and never changes'`; over all `clanCast` ids of the four clans both 'side' and 'hind' occur.
  - `'every action starts and ends at home'`: u = 0 within 0.05 m of home and u = 1 exactly home, for every kind, big and not, reduced and not.
  - `'no NaN, and lifts and pitches stay in range'`: sampled at 200 u's: finite, `lift ∈ [0, 0.8]`, `|pitch| ≤ 1.0`, `along ∈ [-0.6, gap]`, `|side| ≤ 0.35` (frame values; `placeFrame`'s correction is separate).
  - `'placeFrame keeps the hind paws on the ground and a rolled torso above it'`: with a real tabby and mainecoon (full) and a simple intruder at 0.85, pitched 0.9 the lowest hind-paw point stays within ±0.03 m of y 0; rolled at every angle the torso's lowest point stays ≥ 0.
  - `'never a clue pose outside the clue'` (R21): no `actionFrame`/`beatFrame` returns 'stalk', 'swipe' or 'backUp' for the loser or the intruder.
  - `'reduced motion: no lift, pitch, roll or movement'`.
  - `'the full fight stays under 30.5 s'`: squareOff 1.2 + 3 × (4.0 + 1.0 longer look + max basic actionTime) + 2 × BEAT_TIME, and the secondLook variant (+4.0, no longer look), each with the last round's action swapped for the longest big one, all < 30.5.
  - `'wire poses are all states the old animator knows'`.
  In `test/animator.test.js`: each new state animates a full cat, a simple cat and a custom (look) cat with finite transforms and leg positions unchanged from the built rig; Hagrid animated in each new state does not throw. The existing golden and pose-baseline tests must stay byte-identical.
- [ ] **Step 2:** Run `npx vitest run test/fightactions.test.js test/animator.test.js` — FAIL.
- [ ] **Step 3:** Implement. Tune shapes against the sketch's scenes a–d; keep all numbers in named constants at the top of `src/fightactions.js`.
- [ ] **Step 4:** Run those two plus `test/catgolden.test.js test/catpose.test.js` — PASS, goldens untouched (`git status test/fixtures` clean).
- [ ] **Step 5: Commit** `feat(fights): the four fight actions and the square-off beats as pure keyframes, and their poses` (explicit add of the five files).

### Task 3: Scar rules and the save

**Files:**
- Create: `src/scars.js`
- Modify: `src/progression.js`, `src/customcats.js`
- Test: `test/scars.test.js` (new), `test/progression.fights.test.js` (new), `test/customcats.test.js`

**Interfaces:**
- Consumes: `FIGHT_MOVES`, `FIGHT_MOVE_IDS`, `earnedMoves` (Task 1); `clanCast` (`src/clancast.js`) for cast-id checks; `seedFromCode`.
- Produces (`src/scars.js`, pure; imports only `./rng.js` and `./clancast.js`):
  - `SCAR_SITES = ['face', 'shoulder', 'back', 'side', 'hind']`, `SCAR_WALKS = 5`, `SCARS_MAX = 2`, `SCARRED_INTRUDERS_MAX = 24`.
  - `stageFor(left) → 'full' | 'half' | 'faint'` (R1). `scarSide(id) → 'l' | 'r'` (R15).
  - `addScar(list, site) → list'` (new array): same site → reset to `left: 5`; else append; over 2 → drop the one with the lowest `left` (ties: the earlier one).
  - `fadeScars(list) → list'`: each `left − 1`, drop below 0.
  - `sanitizeScarList(raw) → [{ site, left }]` (≤ 2, distinct known sites, `left` integer clamped 0..5, junk dropped).
  - `isCastId(id) → bool` (an id some `clanCast(clan)` member has).
  - `sanitizeScarredIntruders(raw) → [{ id, scars }]` (≤ 24, known cast ids, deduped keeping the last, empty scar lists dropped).
  - `renderScars(list, id) → [{ site, stage, side }]`, `wireScars(accessories) → [{ site, stage, side }]` (sanitises a remote `accessories.scars`: ≤ 2, known site/stage, side 'l'|'r', distinct sites; anything else → []).
- Produces (`src/customcats.js`): `scarKey(state) → string | null` (active custom id, else the preset breed; `null` for `'hagrid'`); `catProfileFields(state, scars = [])` adds `accessories.scars = scars` only when `scars.length > 0`.
- Produces (`src/progression.js`): state fields `fightsWon` (int, clamped to 0..1e6; seeded by R2), `fightMoves` (R3), `scars` (object: key → `[{ site, left }]`; keys = preset cat ids except hagrid, or custom ids in `customCats`), `scarredIntruders`. API:
  - `recordFightWon() → string[]` — `fightsWon += 1`, adds newly earned moves, saves, returns the newly unlocked ids (catalogue order).
  - `ownedMoves() → string[]` (catalogue order).
  - `canBuyMove(id)`, `buyMove(id) → bool` (price not null, not owned, enough points, Clan Edition — R16); spends points like `buy()`.
  - `scarCat(key, site) → bool`, `catScars(key) → [{ site, stage, side }]` (`[]` for null/hagrid/unknown).
  - `scarIntruder(castId, site) → bool` (moves the entry to the end; oldest dropped past 24), `intruderScars(castId) → [{ site, stage, side }]`.
  - `takeNewMoves() → string[]` (R18: moves the sanitiser added on load, returned once then cleared).
  - `completeWalk` also fades every cat's and every intruder's scars (R1). `createCustomCat` drops `scars[id]` (R17). `replaceFromPayload` keeps max `fightsWon` and the union of moves (R3).
  - `catProfileFields` callers get her scars via `catScars(scarKey(state))` (Task 8 wires this; rooms.js passes it).

- [ ] **Step 1: Write the failing tests.** `test/scars.test.js`: the stage table for left 5..0; `addScar` reset/append/replace-faintest; `fadeScars` over six walks (full, full, full, half, half, faint, gone); `wireScars` rejects 3 entries' third, an unknown site, `stage: 'huge'`, a duplicate site, a non-array; `isCastId('woods-4')` true, `'woods-99'`, `'__proto__'` false. `test/progression.fights.test.js`:
  - `'recordFightWon unlocks Rear-up Swat at 3 and Pin at 10, once each'`.
  - `'buyMove spends points; Pin and Rolling Tumble cannot be bought; Legacy refuses'`; earning a bought move later changes nothing.
  - `'a lost fight\'s scar belongs to the cat that fought'`: scar tabby, equip mine1 → `catScars('mine1')` empty, tabby keeps fading by `completeWalk`.
  - `'scars fade by any completeWalk, Legacy and den included'` (R1).
  - `'hostile saves load clamped'` — every Review Focus input; `JSON.parse(JSON.stringify(state))` round-trips; `version === 4`.
  - `'an older save without the keys gets fightsWon from feats.intruder and empty scars'` (R2), and `takeNewMoves()` returns `['rearUpSwat']` once for `feats.intruder: 4`, then `[]`.
  - `'cloud load keeps the larger fightsWon and every move'` (R3).
  - `'hagrid never scars'`: `scarCat('hagrid', 'face')` false, nothing stored.
  `test/customcats.test.js`: `scarKey` cases; `catProfileFields` byte-identical to today with no scars; with scars, `accessories.scars` present.
- [ ] **Step 2:** Run the three files — FAIL.
- [ ] **Step 3:** Implement. Sanitise in `sanitizeState` next to the other additive fields with a comment that SAVE_VERSION stays 4.
- [ ] **Step 4:** Run the three files and `test/progression*.test.js test/rooms.test.js` — PASS.
- [ ] **Step 5: Commit** `feat(fights): fights won, moves and fading scars in the save` (explicit add).

### Task 4: The scar mesh

**Files:**
- Create: `src/cat/scarmesh.js`
- Modify: `src/cat/model.js` (`buildCat` `opts.scars`), `src/cat/animator.js` (one line at the end of `animateCat`)
- Test: `test/scarmesh.test.js` (new), `test/catcustom.test.js`, `test/catmodel.test.js`

**Interfaces:**
- Consumes: render entries `[{ site, stage, side }]` (Task 3).
- Produces (`src/cat/scarmesh.js`):
  - `setCatScars(cat, scars) → void` — removes and disposes any scar mesh, then (if `scars` has an entry and the cat is not Hagrid) builds ONE `THREE.Mesh` named `'scars'`: per scar three thin strips (≈ 0.05–0.07 m long, ≈ 0.008 m wide, 4 segments each, ≤ 60 vertices in all), laid on the skull (face: over the eye on `side`, slanting down across it like sketch E) or on the torso surface (shoulder: high on the front of the flank; back: along the spine; side: mid flank; hind: over the hip; on `side`), 0.004 m proud of the surface, vertex-coloured by stage (R14), with the coat's own `litMaterial(0xffffff, { vertexColors: true })` material type so no new shader compiles when she loses. Rest positions are stored per vertex in the owning part's local space (head or body); the mesh hangs on the cat group with identity transform, `castShadow = false`, `receiveShadow = false`, `userData.noCast = true`, `frustumCulled = false`, and is stored as `cat.userData.parts.scars` (key absent on an unscarred cat). Calls `fitScars` once.
  - `fitScars(cat) → void` — writes each vertex = owner's local matrix (from its position, rotation, scale this frame) × rest, normals by the owner's rotation; reuses module-level scratch objects; sets `needsUpdate`. No-op when there is no scar mesh.
  - The torso surface point for a site is found once at build by a ray from the torso centre along the site's body-local direction against the body mesh's own geometry (build-time only).
- Produces (`src/cat/model.js`): `buildCat(breed, accessories, { ..., scars })` calls `setCatScars(g, scars)` at the end when `scars?.length`; no change at all otherwise.
- Produces (`src/cat/animator.js`): last line of `animateCat`: `if (cat.userData.parts.scars) fitScars(cat);`.

- [ ] **Step 1: Write the failing tests** in `test/scarmesh.test.js`:
  - `'an unscarred cat has no scar mesh and builds byte-identically'` (fingerprint equal with `scars: []` and without).
  - `'one mesh for two scars at a face and a body site'`: `meshCount` +1 exactly, for every preset and for `look` cats, full and simple.
  - `'the face scar rides the head and a body scar the torso through every pose'`: for every animator state (old and new), after `animateCat` each strip's centroid stays within 0.012 m of the skull / torso surface it was laid on (world space).
  - `'every stage reads on every coat'`: full colour vs coat base `colourDistance ≥ 0.25` for every preset, every `COATS` entry and every `CLAN_COATS` style; faint is closer to the coat than half, half than full.
  - `'Hagrid never gets one'`; `'setCatScars([]) removes and disposes it'`; `'never casts a shadow'`; `'fitScars allocates nothing'` (source pin: `fitScars`'s body, comments stripped, has no `new `; the position attribute's array is the same object after 100 calls).
  - `'side is honoured'`: an 'l' face scar has its centroid at x < 0 in head space, 'r' at x > 0.
  In `test/catcustom.test.js` add the scarred variant: every pattern × fur with two scars ≤ 32 full / ≤ 26 simple and the triangle caps. In `test/catmodel.test.js` add: each preset scarred ≤ its CEILING + 1, triangles ≤ 8000 / 5500.
- [ ] **Step 2:** Run `npx vitest run test/scarmesh.test.js test/catcustom.test.js test/catmodel.test.js` — FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run those plus `test/catgolden.test.js test/catpose.test.js test/dencats.test.js test/nametag.test.js` — PASS, `git status test/fixtures` clean.
- [ ] **Step 5: Commit** `feat(scars): a scar is one fitted mesh on the head and torso, only on a scarred cat` (explicit add).

### Task 5: The fight camera sees every action

**Files:**
- Modify: `src/game/clanfight.js` (`fightReach` only), `src/fightcam.js` (`subjectPoints`)
- Test: `test/fightcam.test.js`, `test/clanfight.test.js` (reach tests), `test/fightcamworld.test.js`

**Interfaces:**
- Consumes: `actionFrame`, `beatFrame`, `ACTION_KINDS` (Task 2); `catBackY` (Task 2).
- Produces: `fightReach(spot, foeAt, ok, { actions = false, reachY = null } = {})` — with `actions: false` exactly today's result (test-pinned). With `actions: true`, `me` and `it` also hold: each cat's line toward the other every ≤ 0.2 m out to the far anchor, the meeting point at the middle, the beat sidesteps (±0.3 m side) and step-ins, and each anchor's flinch spot (0.5 m back); every spot may carry `y`: metres the cat's top rises above its own standing top there (the most any action does, through `placeFrame`); clanfight passes `reachY` measured from the two real cats at fight start (`catBackY`, `catPivot`). The tumble circle is not added in actions mode.
- Produces: `subjectPoints(subject, withPath)` emits, for a spot with `y > 0`, the extra point `CAT_HEIGHTS[2] + y` as well; spots without `y` are unchanged (every existing camera test stays green).

- [ ] **Step 1: Write the failing test** in `test/clanfight.test.js`: `'every staged spot of every action and beat is inside the action reach'`: build a real full cat (largest preset, mainecoon) and a simple intruder at `INTRUDER_SCALE` (0.85); for every kind, big and not, both `by`, both beats, sample 120 u's, place the cats from the frames (pitch about the hind feet, roll, lift), (through `placeFrame`) and check `top(u) − top(rest) ≤ spot.y + 0.05` (each cat's world `Box3` top against its own standing top) for the reach spot within 0.2 m of its group position. Also `'actions:false reach is today\'s'` (deep-equal to a stored literal for one spot pair). In `test/fightcam.test.js`: `subjectPoints` adds exactly one point per lifted spot.
- [ ] **Step 2:** Run `npx vitest run test/clanfight.test.js test/fightcam.test.js` — FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run those plus `test/fightcamworld.test.js` — PASS. If fightcamworld's boxed-in counts change because the subject grew, re-measure, update the counts in that test with a comment naming this task, and record the before/after numbers in the commit body (never loosen a framing check).
- [ ] **Step 5: Commit** `feat(fights): the fight camera keeps the leap's top, the rear-up and the pin in frame` (explicit add).

### Task 6: The clan fight plays the actions

**Files:**
- Modify: `src/game/clanfight.js`, `src/intruders.js`, `src/fx.js`, `src/game/avatar.js`, `src/cat/waterlook.js`
- Test: `test/clanfight.test.js`, `test/intruders.test.js`, `test/fx.test.js`, `test/waterlook.test.js`

**Interfaces:**
- Consumes: Tasks 1, 2, 5.
- Produces (`createClanFight` new options): `actions = false` (Hagrid/R6 when false: today's path verbatim), `ownedMoves = () => []` (read at each `startFight`), `onWon = () => {}` called once as `onWon({ visit, castId, site, together })`, `onLost = () => {}` called once as `onLost({ site })`. `site` is `null` when `actions` is false. `castId` = `cur.member.id`.
  - With `actions: true`: `createFight` gets `specials` from `ownedMoves()` mapped through `moveById`, `actionTime: (e) => actionTime(e, reducedMotion)`, `beatTime: BEAT_TIME`. `stagePoses` plays: squareOff → `beatFrame(0)`; clue → today's clue poses; the round's answer prelude (today's answer poses) then `actionFrame(actionFor(e).kind, …)` with the winner/loser mapped to me/it; beat → `beatFrame(beatFor(round))`. Both `fightReach` calls (`walkoverSubject`, `beginRounds`) pass `{ actions, reachY }`. Each cat is placed through `placeFrame` (R20); yaw comes from the anchors (R19). It writes my cat's x/z, `s.fightPose`, `s.fightLift` (placed y), `s.fightPitch`, `s.fightRoll` — never the group's rotation itself — and stages the intruder with `{ pose, x, z, y, face: <my anchor>, pitch, roll }`. If the ground check (R3, today's clanfight.js:442–443) refuses a staged spot, that cat's lift, pitch and roll are 0 that frame. A frame's `slash` calls `fx.slash(pos, yaw)` once per action (not under reduced motion); `dust` calls `fx.burst(…, DUST, 14)` once per flag (8 under reduced motion); `audio.landThump()` once per action as today; `audio.hiss()` at each arch beat.
  - `onWon`'s `visit` is this fight's visit. The deciding round's action gives the scar site: lost → `siteFor(kind, null)` (her cat is never rolled); won → `siteFor(kind, castId)`. `chasedOffTogether` → R11, `together: true`.
  - `showSheet` model gains `specials: [{ id, name, hint, used }]` for owned specials (catalogue order) and the sheet key includes the used ids.
  - `endFight` clears `s.fightPitch` / `s.fightRoll` with the other `s.fight*` fields (every path: win, loss, abort, intruder gone, partner's win).
  - `createFight` gets `specials` whatever `actions` is (R6).
  - The LOST block becomes: release, lock, `onLost({ site })`, the R5 toast, `sendDone(false)`, `endFight()` — and still nothing else. The WIN block: flee, `log.awardOnce` as today, `onWon(...)`, the two toasts, `sendDone(true)`, `endFight()`.
- Produces (`src/intruders.js`): `stage(visit, { …, pitch, roll })` (finite or 0; `place()` sets `g.rotation.order = 'YXZ'`, `rotation.x/z`, and 0 when unstaged or not held — the intruder group's rotation.x/z is written nowhere else), `setScars(visit, scars)` (calls `setCatScars` on the current mesh), `measure(visit) → { backY, pinnedBackY, hindZ, pivotY } | null` (from `catBackY`/`catPivot` of the current mesh), and a `scarsFor = () => []` option applied in `build()`. `NO_INTRUDERS` gains `setScars() {}` and `measure() { return null; }`.
- Produces (`src/fx.js`): `slash(position, yaw)` — one pooled three-stroke white mesh built hidden in `createFx` (so its shader compiles at walk start, not at the first scratch), fades over 0.3 s; a second call restarts it.
- Produces (`src/game/avatar.js` + `src/cat/waterlook.js`): `applyWaterLook(…, fightTilt = null)` — when given `{ pitch, roll }`, sets `cat.rotation.order = 'YXZ'`, `rotation.x = pitch`, `rotation.z = roll + shake roll`; with none, `rotation.x = 0` and today's z. avatar.js passes `s.fight ? { pitch: s.fightPitch ?? 0, roll: s.fightRoll ?? 0 } : null`. Update waterlook.js's "nothing else writes rotation.z" comment.

- [ ] **Step 1: Write the failing tests** in `test/clanfight.test.js` (harness gains `actions`, `ownedMoves`, `onWon`, `onLost`):
  - `'with actions, a won round plays its action and both cats come home before the beat'`: leap after a right swipe — my cat's x passes within 0.7 m of the intruder and its lift peaks ≥ 0.4; rearUp — both pitches reach ≥ 0.8; pin — my lift reaches the intruder's pinned back (`measure().pinnedBackY`) ± 0.05 at its spot; at the start of each beat both are at their anchors with pitch/roll 0.
  - `'a lost round: the intruder lands the action its clue promised'` (crouch → pin by it, paw → rearUp by it, backs up → leap by it).
  - `'a special plays its big action and greys out'`: the sheet model's special has `used: true` after it, and the fight ends 2–0 / turns 0–1 into a win.
  - `'onLost once with the deciding action\'s site; onWon once with castId and site'`; `'Hagrid (actions:false) reports site null and plays today\'s tumble'` (every existing tumble test still passes under the default).
  - `'square-off beats: arch, sidestep, stare, never a circle'`: with actions, no frame puts either cat further than 0.35 m sideways from its anchor outside an action and its 0.35 s prelude.
  - `'no time reaches the outcome or the action'`: same answers at 0.3 s and 3.9 s → identical staged sequences after the answer.
  - `'reduced motion: no lift, pitch or roll, ever'`.
  - `'her cat really rolls'`: drive the real `clanFight.update` then the avatar update (main.js's order: clan fight at main.js:817, `updateAvatar` at ~1005) mid-roll → the group's `rotation.z ≠ 0`; after the fight → x and z 0.
  - `'a refused spot never hovers'`: `ground` = her own line only; a dodge win → whenever she is at `spot`, her lift is 0.
  - `'the pin and the roll keep both yaws steady'` (R19): no frame-to-frame yaw jump > 0.5 rad on either cat.
  - `'a dodge never jumps'`: frame-to-frame my x/z never moves more than 0.25 m at 60 fps across the prelude→action seam.
  - `'ending mid-action leaves no tilt, no stage, no callback'` (Review Focus): abort / intruder gone / `chasedOffTogether` mid-action → my rotation x/z 0, last stage call null or none after, `onLost` never called (`chasedOffTogether` calls `onWon` once with `together: true`).
  - Update the pins: the import whitelist adds `'../fightactions.js'` and `'../fightmoves.js'`; the lose-branch slice must contain `onLost(` and still none of `log.`, `award`, `points`, `feat`, `colony`, `mark`, `grudge`, `flee`; a new win-branch slice pin (`// WON:` … `// END WON`) contains exactly `intruders.flee(`, `log.awardOnce(`, `onWon(`, `hud.toast(`, `sendDone(true)`, `endFight()` and no `progression`.
  In `test/intruders.test.js`: staged pitch/roll applied and cleared on release/flee; `setScars` adds and removes the mesh; `scarsFor` is used at build. In `test/fx.test.js`: `slash` twice creates one mesh; it hides after 0.3 s.
- [ ] **Step 2:** Run the three files — FAIL.
- [ ] **Step 3:** Implement. Keep today's round code as the `actions: false` branch untouched.
- [ ] **Step 4:** Run `npx vitest run test/clanfight.test.js test/intruders.test.js test/fx.test.js test/waterlook.test.js test/avatarwater.test.js test/fight.test.js test/fightcam.test.js test/netevents.test.js test/catgolden.test.js` — PASS.
- [ ] **Step 5: Commit** `feat(fights): rounds play as leaps, swats, pins and rolling tumbles; cats square up between them` (explicit add).

### Task 7: The fight panel's specials row

**Files:**
- Modify: `src/ui/fightui.js`, `src/style.css`
- Test: `test/fightui.test.js`

**Interfaces:**
- Consumes: the sheet model's `specials` (Task 6), `teachFor` (Task 1).
- Produces: `renderFightHtml({ …, specials = [] })` — when non-empty, a `<div class="fight-specials">` before `.fight-moves` with one `<button class="fight-special" data-move="<id>">` per special (name, and `<span class="fight-key">4</span>`… in order), a used one `disabled` with class `used`; the teach line is `FIGHT_TEACH + teachFor(ids)`. With no specials the HTML is byte-identical to today's. `createFightUi`: a click on an enabled special in the shown list calls `onMove(id)`; keys `'4'`–`'7'` map to the shown specials (used or absent → nothing).
- CSS: portrait — `.fight-specials` a row above the basic buttons, ≥ 48 px tall, smaller type; the basic buttons keep ≥ 88 px. Landscape — specials go in the left column under the clue (a `specials` grid area), ≥ 44 px; the basic buttons keep Part 2's clamp. The whole sheet stays ≤ 46vh at 390×844, 375×667, 844×390 and 667×375. Teach entries for specials are short icon forms (`teachFor` gives e.g. `⬇️ → Pin`, using the clue icons) so the teach line doesn't wrap past two lines. The fight toasts' offset (`#hud.fighting .hud-toasts`, today a fixed `calc(290px …)`) follows the sheet: fightui sets a CSS variable `--fight-sheet-h` from the sheet's measured height on each show.

- [ ] **Step 1: Write the failing tests:** byte-identical HTML without specials; `--fight-sheet-h` set on show and removed on hide; a used special is disabled and a click/key on it does nothing; keys 4–7; the teach line lists owned specials; no special id outside the shown list is ever passed to `onMove`; labels escaped.
- [ ] **Step 2:** Run `npx vitest run test/fightui.test.js` — FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run — PASS.
- [ ] **Step 5: Commit** `feat(fights): owned special moves in a smaller row above the three buttons` (explicit add).

### Task 8: Wiring — the record, her cat, intruders, camps and the partner's screen

**Files:**
- Create: `src/game/fightrecord.js`
- Modify: `src/game/walk.js`, `src/game/avatar.js`, `src/clancats.js`, `src/remotecats.js`, `src/game/rooms.js`, `src/ui/catstage.js`, `src/ui/dressingroomview.js` (and the dressing model if the hero needs its key), `src/main.js` (the scars-changed hook)
- Test: `test/fightrecord.test.js` (new), `test/walk.edition.test.js`, `test/remotecats.test.js`, `test/rooms.test.js`, `test/clancats.test.js`, `test/catstage.test.js`

**Interfaces:**
- Consumes: everything above.
- Produces (`src/game/fightrecord.js`): `createFightRecord({ progression, hud, scarKey, setMyScars, setIntruderScars, onScarsChanged })` → `{ onWon({ visit, castId, site, together }), onLost({ site }) }`. `onWon`: `recordFightWon()` → one `hud.toast(unlockToast(id))` per unlocked id; if `site` and `isCastId(castId)`: `scarIntruder` then `setIntruderScars(visit, progression.intruderScars(castId))`. `onLost`: if `site` and `scarKey`: `scarCat(scarKey, site)`, `setMyScars(progression.catScars(scarKey))`, `onScarsChanged()`. Nothing else.
- walk.js: own cat `buildCat(…, { look, scars: progression.catScars(scarKey(state)) })`; `createIntruders(…, { scarsFor: (id) => progression.intruderScars(id) })`; `createClanCats(…, { scarsFor })` (applied at build); `const fightRecord = createFightRecord({…})` and `const ownedMovesNow = () => progression.ownedMoves()` built BEFORE the `session.clanFight =` line (test/walk.edition.test.js:334 pins that the `session.clanFight = … NO_CLAN_FIGHT` slice never mentions `progression`; it must stay green unchanged), then `createClanFight(…, { actions: active.breed !== 'hagrid', ownedMoves: ownedMovesNow, ...fightRecord })` with `setMyScars = (s) => setCatScars(cat, s)` and `setIntruderScars = (v, s) => session.intruders.setScars(v, s)` (the visit comes in `onWon`'s payload).
- avatar.js: `s.pose = wirePose(pose)` (R8); the drawn pose stays `pose`.
- rooms.js: `roomProfile()` and `pushProfileNow()` pass `progression.catScars(scarKey(st))` to `catProfileFields`. main.js: `onScarsChanged` → `rooms.retrackProfile()` and `rooms.pushProfileNow()` (handed to walk.js like its other hooks); walk.js's `endWalk` (`completeWalk` is called there, ~walk.js:1745) calls it too when her cat's rendered scars changed. Walk start shows `takeNewMoves()`'s toasts in Clan Edition (R18).
- remotecats.js: `buildCat(…, { simple: true, look, scars: wireScars(profile.accessories) })` (a changed scars key rebuilds via `profileUnchanged`, as accessories do today). ghosts.js unchanged (R12).
- catstage.js: `show(breed, accessories, look, scars = [])` → `buildCat` with `scars`; dressing room passes the shown cat's own `catScars(key)` (preset id or custom id) for owned cats, `[]` for previews and the builder.

- [ ] **Step 1: Write the failing tests.** `test/fightrecord.test.js` with a real `createProgression(fakeStorage())`:
  - `'losing writes exactly one field: her cat\'s scars'`: deep-diff of `JSON.parse(storage)` before/after `onLost({ site: 'face' })` touches only `scars` (Part 2's "losing changes nothing" amended by the owner, design §Scars).
  - `'winning writes exactly fightsWon, fightMoves and scarredIntruders'` (plus nothing else; `log.awardOnce` is the clan fight's, not this module's).
  - `'Hagrid or a null site: losing writes nothing'`; `'an unlock toasts once with the R5 copy'`; `'a bad cast id scars nothing'`.
  `test/walk.edition.test.js` (source pins, the style it already uses; the existing `not.toContain('progression')` pin unchanged): the clan fight gets `actions:` from the breed and `ownedMoves: ownedMovesNow`; the own cat's `buildCat` passes `scars`. `test/remotecats.test.js`: a profile with `accessories.scars` builds one more mesh; junk scars build none; an unchanged profile isn't rebuilt. `test/rooms.test.js`: an unscarred profile is byte-identical to today; a scarred one carries `accessories.scars`. `test/clancats.test.js`: `scarsFor` returning a scar for one member's id gives that member (only) a scar mesh. `test/catstage.test.js`: `show(…, scars)` builds them.
- [ ] **Step 2:** Run those files — FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the full suite `npx vitest run --exclude '.claude/**' --exclude '.worktrees/**'` and `npm run build` — PASS, `git status test/fixtures` clean.
- [ ] **Step 5: Commit** `feat(fights): wins teach moves, losses leave a fading scar, on every screen that shows the cat` (explicit add).

### Task 9: Her moves in the Skills sheet, and buying

**Files:**
- Modify: `src/ui/hometabs.js` (`renderFightMovesHtml`), `src/ui/homebase.js` (Skills sheet + click), `src/style.css`
- Test: `test/hometabs.test.js`, `test/homebase.*.test.js` (whichever holds sheet tests)

**Interfaces:**
- Consumes: `FIGHT_MOVES` (Task 1), `progression.ownedMoves/canBuyMove/buyMove` (Task 3).
- Produces: `renderFightMovesHtml(state, { owned, canBuy }) → string` — a `<section class="fight-moves-list">` headed "Fighting moves 🐾" with one line per move: name, "Use it when they crouch." (or "Use it on any move."), then owned ✓ / "Win N more fights to learn it" (N = earnAt − fightsWon, ≥ 1) / for a buyable unowned move also `<button data-buy-move="<id>">Learn now — <price> 🐾</button>` (disabled when `canBuy` is false). Never throws on any state. It opens with its own intro, `Win fights to learn moves. Two can be learned early with paw points.` (the Skills intro "Abilities aren’t bought — they’re earned." stays above, scoped to skills). Homebase renders it at the end of the Skills sheet only in Clan Edition, and a click on `[data-buy-move]` calls `buyMove(id)` then re-renders.

- [ ] **Step 1: Write the failing tests:** a new save shows all four unowned with "Win 3 more…"/"Win 6…"/"Win 10…"/"Win 20…"; with 400 points Rear-up Swat's button is enabled and Leap's disabled; Pin and Rolling Tumble never have a button; owned shows ✓; hostile state renders; Legacy's Skills sheet has no section; clicking buys and the points drop by the price.
- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement. **Step 4:** Run the full suite — PASS.
- [ ] **Step 5: Commit** `feat(fights): her fighting moves in the Skills sheet, with Learn now for the two buyable ones` (explicit add).

### Task 10: Live check

**Files:** none committed but a note in the ledger; screenshots to the scratchpad `snaps-fights/`.

- [ ] **Step 1:** Add a temporary entry `"whisker-walk-fights"` on port 5190 to `<repo>/.claude/launch.json` (Vite root = this worktree), keeping the file's formatting; remove only that entry afterwards so the file is byte-identical to before.
- [ ] **Step 2:** Drive headless Chromium with the Playwright installed in the user's chess-game project, on phone portrait (390×844), phone landscape (844×390) and desktop (1440×900), with a test save (Clan Edition, a home territory, points, `fightsWon` set to force unlocks). Check and screenshot: each action (leap and scratch, rear-up swatting, pin, rolling tumble) plays with both cats in frame and unhidden by trees; square-off beats instead of circling; each special (greys after use, wins double); an unlock toast; buying Rear-up Swat; scars at each site on her cat after a loss and on a beaten intruder (and that intruder in its own camp); fading across walks; per cat (switch cats); a custom cat's scar; Hagrid fights with no scars; reduced motion; a Legacy walk untouched.
- [ ] **Step 2b:** Measure the fight sheet's `getBoundingClientRect().height` ≤ 46% of the viewport at 390×844, 375×667, 844×390, 667×375 with four specials owned; check that a won fight with a move unlock (up to four toasts) stays readable and the toasts don't cover a button.
- [ ] **Step 3:** Read draw calls (`renderer.info.render.calls`) mid-fight at Woods river (24.5) desktop and compare with Part 2's 870.9; record in the ledger.
- [ ] **Step 4:** Fix anything found (each fix its own commit with a test), re-run the suite and build.
