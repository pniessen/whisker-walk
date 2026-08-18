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

### CF-7 — Observation, not scheduled
`src/game/walk.js:350` rolls the best-friend gift with a bare `Math.random()`.
Harmless solo (solo `walkRng` *is* `Math.random`), but in a room walk two
co-walkers can disagree about whether a stray carries a gift. Pre-existing, not
introduced by v18. Logged so it is a decision on record rather than an oversight.

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
