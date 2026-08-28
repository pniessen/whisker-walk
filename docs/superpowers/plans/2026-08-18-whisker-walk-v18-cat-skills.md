# Whisker Walk v18 — "Cat Skills" — Execution Plan

**Date:** 2026-08-18
**Spec:** `docs/superpowers/specs/2026-08-17-whisker-walk-v18-cat-skills.md`
**Branch:** `v18-cat-skills` (based on `refactor/main-modules`, NOT on `main`)
**Baseline at plan time:** 403 tests / 45 files green, `vite build` clean.

## Baseline corrections (read before task 1)

- **The test baseline is 403 tests / 45 files, not the 393/44 the handoff
  claimed.** The handoff was stale; verified on both `main` and this branch.
- **`src/main.js` is now 630 lines**, with game logic in `src/game/*` (walk,
  interactions, netevents, avatar, rooms, cloudsync, photo, composer, labels,
  util). Every task below targets the *new* module layout.
- **Inherited risk:** no test imports `src/main.js` or `src/game/*`. The carve-out
  was verified by mechanical diff + a live browser smoke run, not by the suite.
  Any task touching those modules must browser-verify, not just run tests.
- **Do not create git worktrees inside `.claude/worktrees/`** without removing
  them afterward — vitest's default glob collects the copied `test/` directory
  and silently doubles the suite (806/90 instead of 403/45).

## Sequencing

Three stages. **Stage 1 is serial** — everything imports it. **Stage 2 fans out**
in worktrees with disjoint file ownership. **Stage 3 is serial and descopable.**

---

## Stage 1 — Foundation (serial, one task at a time)

### Task 1.1 — Save fields + feat counters
**Owns:** `src/progression.js`, `src/discoveries.js`, `test/progression.test.js`, `test/discoveries.test.js`

- Add `skills: []` and `feats: {}` to the default state. **Save stays version 4**
  — additive only, per the v15 precedent.
- `sanitizeSkills`: strings only, must be a known catalog id, deduped, capped at
  catalog length. `sanitizeFeats`: known `AWARDS` keys only, each through the
  existing finite-non-negative coercion, capped.
- Increment `feats[type]` from the single existing `bus.emit('discovery', …)`
  hook in `discoveries.js`'s `pay()`.
- **No back-fill.** New tallies start at zero for existing saves. This is a
  locked decision, not an oversight — do not "helpfully" seed them.
- Tests: additive load of a v4 payload without the new fields; hostile payloads
  (`skills: '<script>'`, `feats: {__proto__: …}`, non-numeric counts, over-cap);
  a discovery event increments exactly one counter.

### Task 1.2 — Skills catalog + feat predicates
**Owns:** `src/skills.js` (new), `test/skills.test.js` (new)

- Static catalog of the 12 abilities from the spec: `id`, `family`, `name`,
  `effect` (display string), `feat` (display string), and `progress(state)`
  returning `{have, need}`.
- `unlockedSkills(state)` → ids whose predicate is satisfied. `hasSkill(state, id)`.
- **Pure module, no THREE, no DOM** — this is the most testable thing in the wave
  and it is the contract every Stage 2 task codes against. Test every predicate
  at boundary values and against a hostile/empty state.

### Task 1.3 — Skills tab
**Owns:** `src/ui/hometabs.js`, `src/ui/homebase.js`, `test/hometabs.test.js`

- Sixth tab **Skills 🐾**, four family sections, a card per ability showing
  effect + either a feat progress bar or an earned state. Locked abilities show
  their feat in full.
- Escape any dynamic string at the render site (catalog is static, but the
  counts come from save state).
- Pin the tab id in tests, mirroring the Cats/Accessories split precedent.

---

## Stage 2 — Fan-out (parallel worktrees, disjoint ownership)

Run in **batches of 2–3**, merging each batch before the next. File ownership is
listed so no two concurrent agents touch the same file.

| Task | Abilities | Owns |
|---|---|---|
| **2.1** | Rank ladder to 9 tiers | `src/progression.js` (RANKS only), `test/progression.test.js` |
| **2.2** | Spring Paws, Sure Claws, Long Zoomies | `src/climbing.js`, `test/climbing.test.js`, zoomies constants in `src/player.js` |
| **2.3** | Night Eyes, Whisker Sense, Twitchy Nose | `src/scent.js`, `src/goldmice.js`, render-settings path in `src/game/composer.js` |
| **2.4** | Charmer, Far Call | `src/straycats.js`, `src/game/interactions.js` |
| **2.5** | Big Swat | `src/tippables.js` |
| **2.6** | The Old Docks | `src/world/docks.js` (new), area catalog in `src/progression.js`, `src/goldmice.js` |
| **2.7** | Unlock celebration | `src/fx.js`, `src/audio.js`, `src/game/walk.js` |

**Conflict notes.** 2.1, 2.6 both touch `progression.js` (RANKS vs. area catalog)
and 2.3, 2.6 both touch `goldmice.js` — **do not run those pairs concurrently.**
Suggested batches: (2.1, 2.2, 2.5) → (2.3, 2.4, 2.7) → (2.6).

**Every Stage 2 task must:**
- Gate its effect behind `hasSkill(state, id)` from Task 1.2 — no ability active
  without its unlock.
- Leave the no-skills path **exactly** as it plays today. Verify both states.
- Task 2.2 additionally: re-verify all nine existing golden mice are still
  reachable *without* the skills (they were tuned against the current `canReach`
  budget) and that the rooftop collectibles are not trivialized *with* them.
- Task 2.6 additionally: add `docks: 0` to `state.walks` — a missing key makes
  `completeWalk` compute `undefined + 1 = NaN` permanently. Thread the injected
  RNG; never a bare `Math.random()` in seeded generation.

---

## Stage 3 — Expensive traversal (serial, descope candidates)

Cut in this order if the wave runs long, and report exactly what was cut.

- **3.1 Fence Runner** — perch-to-perch chaining along fence lines.
- **3.2 Gift Paws** — leave a gift at a scenic spot; ghosts/co-walkers find it.
  **Must not add a broadcast kind** (see non-goals).
- **3.3 Sea Legs** — swim state, buoyant camera, collider suppression at water
  volumes. The single most expensive item in the wave.

---

## Definition of done

1. `npx vitest run --dir test` green, with new tests for every new module.
2. `npx vite build` clean.
3. Browser-verified via the mobile-emulation workaround (handoff §7) — desktop
   pointer lock is unavailable under automation. **Required**, because the
   `src/game/*` modules have no test coverage.
4. A no-skills save plays identically to today.
5. Whole-branch final review by the most capable model before any merge to
   `main`. **This has caught a real defect every single wave — do not skip it.**
6. Handoff updated: v18 entry, the corrected 403-baseline, the new module map.

## Non-goals (restated because they are easy to drift into)

No skill tree, no respec, no loadout, no skill points. No new broadcast kind and
no net protocol change — abilities are local. No rebalancing of existing point
awards. No ability may gate content that is reachable today.

---

## Carry-forward items (raised mid-execution, must not fall between tasks)

Recorded 2026-08-18 during Stage 2 batch 1. Each was surfaced by a task that
correctly could not fix it inside its own file ownership.

### CF-1 — Big Swat is inert until wired (owner: Task 2.7)
`src/tippables.js` gained an optional `opts.getState` getter, but `src/game/walk.js`
still calls `createTippables(scene, spots)` with two arguments, so the ability
never activates in the running game. Task 2.7 owns `walk.js` and must pass
`{ getState: () => progression.state }`. A live getter, not a snapshot — so the
40th tip-over activates the skill on the next swat rather than after a reload.

### CF-2 — Cascaded props award nothing (owner: a follow-up task owning `src/game/interactions.js`)
Only the directly-swatted prop pays a `mischief` award; cascaded props pay
nothing. **This makes Big Swat strictly worse than not having it**: tipping three
props with one swat yields 1 point and 1 tick toward the "Tip 3 things over"
goal, where three separate taps yield 3 and 3. An earned ability that slows your
goal progress is an anti-feature.

Fix: award `mischief` per prop actually tipped, cascaded ones included. This is
**not** a rebalance and does not violate the non-goals — one tipped prop has
always paid one `mischief` award, and this preserves exactly that rate. Confirm
the per-walk repeat-award caps still apply so a cascade cannot farm.

### CF-3 — Worktree base hazard (process)
Agent worktrees were observed branching from `main` rather than from the current
`v18-cat-skills` HEAD. One agent caught this and fast-forwarded itself; an agent
that did not would silently rebuild against a tree with no `src/skills.js`.
**Every future task brief must instruct the agent to verify its base contains
`src/skills.js` before starting, and fast-forward onto `v18-cat-skills` if not.**

### CF-4 — Charmer desyncs the friendship ladder (owner: Task 2.8)
`progression.friendLevel` hardcodes the base 1/3/6 rungs. Charmer shortens them
to 1/2/4 in `straycats.js`, so a Charmer player is toasted "BEST friend 💕" at 4
greets while `src/ui/homebase.js:398` still shows ♥ and `src/game/walk.js:350`'s
best-friend gift roll never fires until 6. **The game tells the player two
different things about the same cat.** Fix: make `friendLevel` Charmer-aware
(repoint it at `straycats.js`'s `friendRungs(charmer)` export, or move the rung
table into `progression.js` and have both read it).

### CF-5 — Far Call draws strays but not critters (owner: Task 2.8)
The spec says the call draws "strays and critters"; only the stray half shipped,
because `src/critters.js` was outside the implementing task's ownership.

### CF-6 — "Held" meow descoped (RULING, no work required)
The spec describes Far Call as a *held* V press. `src/main.js:444` fires
`doMeow()` on keydown with no keyup plumbing, so hold detection means new input
handling in an untested module for no gameplay gain. **Ruling: Far Call makes the
ordinary V press carry far.** The spec text is the thing that is wrong here, not
the implementation. Simpler for a 10-year-old, and it avoids editing `main.js`.

### CF-7 — RESOLVED: the best-friend gift roll names `walkRng`
Raised as an observation: the best-friend gift was rolled with a bare
`Math.random()`. Harmless as written — that block is already solo-only, where
`walkRng` *is* `Math.random` — but the guard and the roll were two separate
facts a future edit could separate, so the roll now names the walk's stream
explicitly. Fixed in `src/game/walk.js:489` (`walkRng() < 0.3`), with the
reasoning in a comment at the call site. **Closed — nothing outstanding here.**

---

## Agent environment notes (learned the hard way — put these in every brief)

1. **Worktrees branch from `main`, not from the working branch.** Three of four
   Stage 2 agents hit this. Every brief must open with: verify `src/skills.js`
   exists and HEAD descends from `v18-cat-skills`; if not, fast-forward first.
   The tell is a 403/45 baseline instead of the current count.
2. **`npx`/`node` are not on PATH.** `eval "$(/opt/homebrew/bin/mise activate bash)" && mise exec -- npx …`
   works in most sandboxes, but at least one agent's Bash sandbox rejected the
   `eval` form as too complex. The direct shim always works:
   `/Users/pniessen/.local/share/mise/shims/npx vitest run --dir test`
3. **Always pass `--dir test`.** Agent worktrees live under `.claude/worktrees/`,
   *inside* the project, so vitest's default glob collects their copied suites
   and silently multiplies the count (806/90 was observed for a 403/45 suite).
4. **A worktree has no `node_modules`** — resolution walks up to the parent
   repo's, which is precisely why nesting the worktrees inside the project works
   at all. Do not "fix" this by running `npm install` in a worktree.
5. **`preview_start` cannot launch a worktree's dev server.** It resolves
   `.claude/launch.json` from the main repo root, so a config added inside a
   worktree is invisible to it. Worktree agents should run vite via Bash on a
   port other than 5174 and leave `.claude/launch.json` alone.
6. **`src/ui/homebase.js` cannot be imported by the test suite** — it calls
   `document.getElementById` at module scope and there is no jsdom in this
   project. Pure render helpers therefore belong in `hometabs.js` (the split
   `journal.js` already uses for `renderJournalHtml`). This is what makes UI
   rendering testable at all; follow it rather than adding a DOM shim.

### CF-8 — RULING: Spring Paws keeps the spec's 2.2 budget
Task 2.2 correctly identified that the spec contradicts itself. §Traversal pins
the climb budget at 1.6 → **2.2**; §Risks says shipped placements "must not
become trivially skippable". At 2.2 the two-step chains under `gm-park-2`
(y 2.1) and `gm-sea-2` (y 1.9) collapse to a single hop. Both cannot hold.

**Ruling: keep 2.2. The §Risks wording was imprecise, not the number.**

- Collapsing a chain from two hops to one is *literally what the ability is
  described as doing* — "perch chains need fewer intermediate steps". That is
  the feature, not a violation of it.
- The two hard constraints both hold and were verified by BFS over the real
  shipped perch arrays: every golden mouse and rooftop collectible stays
  reachable with **no** skills, and with Spring Paws neither mouse becomes a
  walk-up — both still require a climb press, neither becomes unreachable.
- The tall chains that are the actual destinations are untouched in every skill
  state: the y 4.1 rooftop ridge (holding `yarn-roof`) stays 3 hops, and the
  y 3.3 billboard lookout is never one hop.
- The alternative — dropping below 1.9 to preserve two chains — leaves Spring
  Paws helping only in the narrow 1.6–1.9 band, i.e. an ability you grind ten
  vantage perches for that changes almost nothing. That would gut the wave's
  central thesis that abilities reopen the existing areas.

"Trivialized" should be read as **reachable without climbing at all**, not as
"reachable in fewer hops". Task 2.2's pinned test recording the collapse stays
as a deliberate record; it is documenting intended behaviour, not a defect.

### CF-9 — Two ability halves not implemented — **CLOSED 2026-08-27**
Both halves are now built. The original text is kept below for the record, each
item annotated with how it was closed.

- **Spring Paws' "markedly higher pounce jump"** exists only as the climb
  budget. `player.pounce()` is a horizontal velocity lunge with no vertical
  component at all, so there is no jump height to raise without new movement
  code.
  - **CLOSED (CF-9a).** `player.js` gained a ballistic hop arc: `pounceArc(state)`
    + `hopOffset(elapsed, arc)`, baseline 0.35 (the cat's own half-width, so an
    unskilled pounce tops none of the shipped perches) rising to 0.9 with Spring
    Paws, over the existing 0.3s pounce-pose window so the paws land on the frame
    the landing thump plays. The lift is a RENDER offset added to `api.perchY` and
    never written into it — storing it in `perchY` would have disabled the collider
    push (the cat would pounce through walls) and shifted which golden mice
    `checkFind` matches. A hop therefore can never acquire a perch: `climbBudget`
    stays the sole authority on what a cat can stand on.
    - Two defects were found and fixed while closing it. (1) Several proximity
      checks in `game/avatar.js` measured 3D distance against `cat.position`, and
      `critters.pounceCatch`'s radius is 0.9 — exactly the Spring Paws arc height
      — so a skilled cat at apex was out of range of a critter directly beneath
      it, making the ability sabotage its own signature move (the CF-2 "an ability
      must never be a downgrade" failure). Fixed by projecting to the paws, a
      no-op outside the hop window. (2) The hop's exit condition tested the
      offset, but `hopOffset` returns 0 at *both* ends of the arc, so any frame
      with `dt === 0` cancelled the hop on the frame it began — reachable, since
      `THREE.Clock.getDelta()` yields 0 when two renders land in one clock tick
      and browsers clamp timer resolution for Spectre mitigation. Now clears on
      the window expiring; regression-pinned in `test/pounce.test.js`.
- **Sure Claws' "props that were scenery become climbable"** is world-data work.
  Shipped perch records are bare `{x, z, y, label?, vantage?}` with no tree or
  fence tag, so the height lift cannot be made per-prop from `climbing.js`.
  Both abilities are real and working today; each is missing its second half.
  - **CLOSED (CF-9b).** Perch records now carry a closed `kind` vocabulary
    (`PERCH_KINDS`: tree/fence/roof/crate/car/stone/furniture, defaulting to
    `prop` for an absent *or unrecognised* tag, so an untagged or typo'd perch
    climbs by exactly today's rule). The blanket `SURE_CLAWS_CLIMB = 1.85` lift is
    **deleted**; the budget gained a `climbKinds` table lifting `tree` and `fence`
    to 2.0 only — bounded by the park oak branch at y 2.1, which is the top step of
    the game's only tree chain and holds both `gm-park-2` and `feather-5`, so 2.1
    would have deleted that chain off the grass. 49 scenery props (tree forks,
    fence tops, market-stall awnings, benches, den furniture) were opened behind
    `requires: 'sure-claws'`. None carries a `label` or `vantage`, keeping them out
    of the discovery log and out of `feats.perch` — a Mischief ability must not buy
    the two Traversal ones.
  - **The wiring**, applied in `game/interactions.js`: `bestPerch` now receives
    `state: progression.state`. Without it all 49 gated perches are filtered out
    for every player and the half ships dead — the exact CF-10 failure, one wave
    later. It is pinned by a pair of tests in `test/interactions.test.js` that
    fail if and only if that argument goes missing, because `climbing.js`'s own
    suite structurally cannot catch an omission in a different file.

### CF-10 — Traversal abilities are inert until wired (owner: Task 2.8)
Two one-line edits, in files Task 2.2 did not own:
- `src/game/interactions.js:96` — pass `climbBudget(progression.state)` as
  `bestPerch`'s 5th argument. The stale comment at :89 still says "≤1.6-per-hop".
- `src/game/walk.js` walk start — `player.setZoomTuning(zoomTuning(progression.state))`.

### CF-11 — Long Zoomies: spec text was wrong, implementation is right
"Charge runs 2.5s (from 1.5s)" misread 1.5 as a burst duration; it is the
charge-**up** threshold, so taken literally the ability would be a 67% nerf.
Task 2.2 mapped the spec's two clauses onto the two knobs that exist: charge-up
1.5 → **0.9s** ("recharges faster") and the charge now survives **2.5s** of
interruption ("runs longer"). Accepted — the spec sentence is what was wrong.

### CF-12 — RULING: Sea Legs is DESCOPED from v18
Cut per the spec's stated descope order. **Not for time — the ability as specified
does not do what the spec claims.**

**Finding: water in this game has never carried colliders.** The park pond, the
seaside sea (bounds reach x 36; the sea plane starts at x 25) and the Docks canal
are all walk-over surfaces *today*. "Swim — water becomes traversable at reduced
speed" therefore describes traversal the player already has, minus speed. Earning
it would make the cat strictly slower. An ability must never be a downgrade —
the same principle that made CF-2 a defect.

**Why the obvious fix is worse.** Making water block, with Sea Legs opening it,
would give the ability real value — but three park ducks spawn INSIDE the pond
(`(-14,2)`, `(-12,0)`, `(-16,4)`) and the `duck-parade` moment originates there.
Blocking the pond puts a journal critter behind an ability, violating the
non-goal that **no ability may gate content reachable today**. Honouring that
means relocating shipped content and auditing every water body per area — a
different and larger piece of work than "add a swim state", and one that should
be designed deliberately rather than bolted on at the end of a wave.

**Consequence:** v18 ships **eleven** abilities, not twelve. Sea Legs is removed
from the catalog entirely rather than left visible — its feat (`walks.seaside >= 5`)
is perfectly earnable, so leaving it in would hand the player an ability that
unlocks with fanfare and then does nothing. That is worse than its absence.

**Recommended as its own v19 item:** make water real (colliders + a swim state),
relocate the pond ducks to the shoreline, and reinstate Sea Legs as the ability
that opens it. The Docks was deliberately authored for this — two dry crossings
and a test pinning that nothing required sits in the canal — so the district is
already prepared for water to start blocking.
