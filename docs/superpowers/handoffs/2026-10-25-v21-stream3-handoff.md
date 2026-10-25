# Hand-off: Whisker Walk v21, Stream 3 (deeper verbs and more to touch)

## Where things stand (2026-10-25)
- `main` is at cb2f079 and pushed. Streams 1 (legibility) and 2 (the shared colony) are merged. Tests: 85 files, 2043 passing.
- The owner has run `docs/supabase-colony.sql` and `docs/supabase-v7-secret-fix.sql`, and checked both. The two-device colony check (COLONY-SETUP.md §4) hasn't been done yet.
- Stream 3 has no branch, no plan and no code yet.

## What to build
The spec is the authority: `docs/superpowers/specs/2026-10-24-whisker-walk-v21-reason-to-come-back-design.md`.
- **§6, "Stream 3 — Deeper verbs and more to touch":**
  - the diagnosis (verbs leave nothing behind);
  - the persistence model: within a walk by default, plus capped, private, per-area marks across walks;
  - prop ids for a curated set only;
  - new props must go through `render/mergeprops.js`.
- **§9 item 5:** carry is REQUIRED.
- **§10.1:** real risk, built on `enemies.js`. It must be recoverable, funny and never retroactive. It may never reduce taming, remove a colony cat, delete a mark or reverse a trade.
- **§10.2:** rare finds. A long-odds legendary cat, and surfacing the gold mice. Rarity is a find, not a grind.
- **§7 builder's calls:** the verb subset, and the per-area mark caps, checked against save size.

## Proposed shape, which the owner should confirm before planning
- **Verbs:** carry, plus knock-down-and-it-stays-down, plus prey that evades. Push-through flaps and nap/drink-somewhere are optional extras.
- **Open questions for the owner:**
  - Does a toy carried into the den stay there across walks?
  - How rare is the legendary cat: about 1 in 20 walks, or 1 in 100?
  - Is a dog chasing you off a lawn, and rain making you drop what you carry, the right level of risk for ages 11 and 9?

## Process (the same as Stream 2, which worked)
1. Use superpowers:writing-plans to write `docs/superpowers/plans/<date>-whisker-walk-v21-stream3-*.md`. Self-review it against the spec and get the owner's approval.
2. Use superpowers:subagent-driven-development on a feature branch:
   - one implementer per task, plus a task reviewer;
   - the controller checks every visible change by eye in the browser pane;
   - an Opus whole-branch review at the end, with one fix wave and one re-review.
3. Offer the branch for merge. **Never implement on main, never merge or push without asking.**

## Standing rules
- SAVE_VERSION stays 4. Add new save fields with sanitize-with-default.
- Coerce untrusted data on load and escape it at render. Pure logic goes in DOM-free leaf modules.
- walkRng determinism: a co-walk with a non-partner must behave exactly as before. New random draws must not shift existing ones.
- Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Stream 3 is local only. It needs no Supabase changes. If a change ever does need SQL, the owner runs it from a file; never run it yourself.

## Lessons from Stream 2
- **Check by eye, in a real walk, not just with tests.** Visual checks caught a den nap pose that read as a pot, a tab bar that overflowed at 375px, and a cluttered news card.
- **Plan expectations can be wrong.** The end-to-end step expected 2/6 where 1/6 was correct. Rule against the spec, and record it in the ledger.
- **Fixes can open new gaps.** The final review's fix raised the solo colony cap along with the shared one, and only the re-review caught it. Keep the re-review step.

## Browser-pane tips (pointer lock doesn't work in the pane)
- Start the dev server with `preview_start` → `whisker-walk-dev`, which serves on port 5174. When working in a worktree, add a config that points vite at the worktree folder, and remove it afterwards.
- Use `resize_window` with the mobile preset and reload, so touch mode and "Tap to explore" appear. Drive the joystick and orbit with synthetic TouchEvents on `.touch-ui`. To act, click `.hud-prompt .hud-prompt-btn` in the same tick the prompt appears, because strays wander out of range fast.
- To find things in the 3D world, capture the scene without changing any code:
  1. Import `/node_modules/.vite/deps/three.js?v=…`. Take the exact URL from `performance.getEntriesByType('resource')`.
  2. Wrap `Object3D.prototype.updateMatrixWorld` to grab the scene. `WebGLRenderer.render` is defined on each instance, so patching its prototype does nothing.
  3. Stray name tags are sprites with `userData.tagName`. Find the player's cat by pushing the joystick and seeing which non-stray cat moves.

## Small follow-ups left from Stream 2 (optional, not Stream 3)
- A sibling alone in the pair room can start a walk. If the other sibling then joins and becomes host, a second walk can start in the same room.
- Six toasts stack over the cat at a taming moment.
- The sticky home-base header takes about half of a phone screen. That belongs to Stream 5.
- `.claude/launch.json` has a redundant `whisker-walk-colony` config on port 5175, which can be deleted.
