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
