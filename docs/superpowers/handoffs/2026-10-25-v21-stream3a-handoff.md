# Hand-off: Whisker Walk v21, Stream 3a (the clan)

Supersedes `2026-10-25-v21-stream3-handoff.md`, whose planning job is done.

## Where things stand (2026-10-25)
- `main` is at **5809130** and pushed. Streams 1 and 2 are merged. Tests: **85 files, 2043 passing** — re-measured at 5809130, not quoted from the older hand-off.
- **Stream 3 has been split and reordered by the owner.** 3a is the clan and goes first; 3b is the deeper verbs the v21 spec describes.
- The design is **approved**; the plan is **written and self-reviewed**. There is **no branch and no code yet**.
- Still not done, carried over: the two-device colony check (`COLONY-SETUP.md` §4).

## What to build
Two documents, in this order of authority:
1. `docs/superpowers/plans/2026-10-25-whisker-walk-v21-stream3a-clan.md` — 14 TDD tasks in four phases. **This is what you execute.** Start at Task 1 and do not reorder.
2. `docs/superpowers/specs/2026-10-25-whisker-walk-v21-the-clan-design.md` — the why, and the decision log. Its §2 records what the owner settled; its §12 records what a builder check corrected.

The parent spec, `2026-10-24-whisker-walk-v21-reason-to-come-back-design.md`, still governs goals, non-goals and anti-goals where the clan document is silent.

## The five things most likely to bite you
All five were found the hard way — a builder check against the source killed the first draft of the design. Do not re-derive them.

1. **Clan names are DERIVED from the stored cat name, never stored.** `isStrayName()` gates `sanitizeCat`, `canFeed`, `isFeedKey` and `seen.tamed`; `colony_cats`'s primary key **is** `(colony_id, name)`; and breed is both stored per friend *and* re-derived at render in `ui/colonypanel.js` and `game/walk.js`. Re-key a cat and it is dropped on the next load and changes coat colour.
2. **`mergeColony` is not a safe home for anything new.** It returns the **remote** cat object for any cat both devices hold, keeping only `tamedBy`/`tamedWalk`. A new per-cat field is silently discarded at the next sync.
3. **`CAT_NAMES` is never extended, reordered or resized.** `shuffled(CAT_NAMES, rng)` consumes `CAT_NAMES.length - 1` `walkRng` draws; shifting them moves gifts, weather, secrets and goals. Task 7 adds a *separate* `KIT_NAMES` list for exactly this reason, and pins `CAT_NAMES.length === 48` with a test.
4. **Border marks are flat decals, not `render/mergeprops.js`.** That module merges only build-time, per-leaf-immutable geometry inside one top-level scene child, and `contactshadows.js`'s 6.5 m `MAX_SPAN` would make a long merged strip's ground decal vanish *silently*. Use `scent.js`'s `CircleGeometry` + `MeshBasicMaterial` idiom.
5. **`rankFor` is already taken.** `progression.js` exports it for the player's *points* ladder. The clan's function is `clanRankFor`, and the two must never be merged — a clan rank is not a score.

## The one decision that may come back to the owner
**Task 7 is the gate.** A fed kit's name must pass `isStrayName()` and the server's `(colony_id, name)` primary key. The plan's route is a reserved, validated `KIT_NAMES` block, which keeps 3a SQL-free. If that proves unworkable, kits need a schema change — which reverses the owner's decision 11. **Stop and ask. Never write or run SQL; the owner runs it from a file.**

## Owner decisions that are settled — do not re-open
- **Carry waits**, even though the v21 spec makes it REQUIRED (§9 item 5). The owner chose this knowing it.
- **Four rival clans, one per area** — the largest item in v21. Phase 4 carries an explicit cut line: if 3a must be shortened, build Task 11 for **the Docks only** and stop. Phases 1–3 ship without it.
- Both leaders (`-star`), all four den roles, the inviter's clan name winning at pairing, and derived rather than chosen colony-cat names.
- Every 3b answer is already recorded in the clan spec's §11, so **3b needs no second brainstorm**.

## Before you build Phase 4, ask the real 11-year-old
She reads the books, she is the reason this stream exists, and the v21 spec says she overrules the roleplayed playtest readers. Worth asking about: the word pools, the fact that a colony cat's clan name is revealed rather than chosen, and whether four rival clans sound good or annoying.

## Process (unchanged — it worked for Stream 2)
1. Use `superpowers:using-git-worktrees`, then `superpowers:subagent-driven-development` on a feature branch: one implementer per task, plus a task reviewer.
2. **The controller checks every visible change by eye in the browser pane.** Stream 2's visual checks caught a den nap pose that read as a pot, a tab bar that overflowed at 375px, and a cluttered news card. The plan marks which tasks need an eye check.
3. An Opus whole-branch review at the end, with one fix wave and **one re-review** — the re-review is what caught Stream 2's last regression.
4. Offer the branch for merge. **Never implement on main, never merge or push without asking.** (Docs are the exception: every spec, plan and hand-off is committed to main.)

## Standing rules
- `SAVE_VERSION` stays **4**. New fields are additive with sanitize-with-default.
- Coerce untrusted data on load, escape it at render. Pure logic in DOM-free leaf modules.
- `walkRng` determinism: a co-walk with a non-partner must behave exactly as before.
- `COLONY_MAX` (24) and `SOLO_MAX` (12) are not touched. Taming never regresses.
- Rank and role are never a score: never in a points total, a goal, or `AWARDS`.
- Every borrowed word lives only in `src/clanwords.js` — Task 14's test enforces it, so the owner's "maybe one day public" swap stays one commit.
- Commit trailer: `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
- 3a needs **no** Supabase change. See the gate above if that ever looks false.

## Browser-pane tips (pointer lock does not work in the pane)
Carried forward unchanged from the previous hand-off, still accurate:
- Start the dev server with `preview_start` → `whisker-walk-dev`, which serves on port 5174. In a worktree, add a config pointing vite at the worktree folder and remove it afterwards.
- `resize_window` with the mobile preset, then reload, so touch mode and "Tap to explore" appear. Drive the joystick and orbit with synthetic TouchEvents on `.touch-ui`. To act, click `.hud-prompt .hud-prompt-btn` in the same tick the prompt appears — strays wander out of range fast.
- To find things in the 3D world without changing code: import `/node_modules/.vite/deps/three.js?v=…` (take the exact URL from `performance.getEntriesByType('resource')`), then wrap `Object3D.prototype.updateMatrixWorld` to grab the scene — `WebGLRenderer.render` is per-instance, so patching its prototype does nothing. Stray name tags are sprites with `userData.tagName`; find the player's cat by pushing the joystick and seeing which non-stray cat moves.

## Small follow-ups still open (not Stream 3a)
- A sibling alone in the pair room can start a walk; if the other then joins and becomes host, a second walk can start in the same room.
- Six toasts stack over the cat at a taming moment.
- The sticky home-base header takes about half a phone screen — that belongs to Stream 5.
- `.claude/launch.json` has a redundant `whisker-walk-colony` config on port 5175 that can be deleted.
