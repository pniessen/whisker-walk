# Menu build, Part 2: first-time hints for found outfits and the world map — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three new once-per-save hints (`find`, `find-kept`, `map`) in the existing hint system, plus a seam for a place's own hint (Rooftops, later).

**Architecture:** `src/hints.js` is the table and the rules (pure); `src/game/tips.js` gathers the walk's facts, offers event hints from the bus (`bus.emit('tip', { id })`, `bus.emit('tip:did', { id })`) and puts the line up (`HINT_PICS`); words are `hint.<id>` in `src/tutorialwords.js`; counts live on the save (`progression.countHint(id)`, and the "did it without being told" call near `src/progression.js:1769`). The find is `session.find` (`src/foundwear/live.js`, `NO_FIND`); the find card is `src/game/findcard.js`. The world map opens as the `places` sheet in `src/ui/homebase.js` (`renderPlacesSheetHtml` in `src/ui/dressingroom.js`).

**Tech Stack:** plain ES modules, Vite, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-20-menu-build-design.md`, section "Part 2".

## Global Constraints

- Work only in `/Users/pniessen/CLAUDE-CODE/projects/cat-game/.claude/worktrees/menu-build`. Never touch the main checkout. Never read or print `.env.local`. No database work. No merge, no push.
- Hint words in `src/tutorialwords.js` only, neutral (no group, rank or outsider word), so they read the same in both word sets; `test/tutorialwords.test.js` must stay green.
- Each new hint has `max: 1`; all respect "Show tips" (`settings.showTips`), the one-at-a-time rule and the guided walk's block.
- Exact words (owner checks them later; use verbatim):
  - `hint.find`: `same('Something is twinkling! Go and see. ✨')`, picture `✨`
  - `hint.find-kept`: `same('It\'s yours to keep! Change clothes in Dress up.')`, picture `👕`
  - `hint.map`: `two('Tap a place to see it. Pinch to zoom.', 'Click a place to see it. Scroll to zoom.')`, picture `🗺️`
- Nothing here is sent to a co-walker or uses dice (tips.js header).
- No tests that read source text (rule S1). Targeted test files only for implementers. Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Re-record word snapshots if a fixture records tutorial lines: `UPDATE_SERIES_SNAPSHOT=1 UPDATE_OFF_SNAPSHOT=1 npx vitest run test/serieswords`; the diff may only add these lines.

## Review Focus

- A save that predates the new ids loads cleanly and a save with `tutorial.hints.map = 1` keeps it through `progression.js`'s cleaning (`HINT_IDS`). Test in Task 1.
- A walk with no find (`NO_FIND`: den, guided first walk, places with no spots) never offers `find`. Test in Task 2.
- "Show tips" off: no `map` line on the map sheet, and it is not counted. Test in Task 3.
- `find-kept` right after `find` (inside 60 s) still shows; any other hint still waits the full gap. Test in Task 1.
- Legacy Edition's Change place (picture cards, no map) shows no `map` line. Test in Task 3.

---

### Task 1: The table: three new hints, a `soon` flag, and the place seam

**Files:**
- Modify: `src/hints.js`, `src/tutorialwords.js`, `src/game/tips.js` (`HINT_PICS`, `walkFacts`)
- Test: `test/hints.test.js`, `test/tutorialwords.test.js`, `test/tips.test.js`, `test/progression.tutorial.test.js`

**Interfaces:**
- Produces: hint ids `'find'` (polled: `when: (f) => f.findNear`, `until: (f) => !f.findNear`), `'find-kept'` (event, `soon: true`), `'map'` (event; never offered by the walk; shown by the home screen in Task 3), each `max: 1`, `ring: null`. Walk facts gain `f.findNear` (boolean, filled in Task 2; `false` here) and `f.place` (the session's area id, `session.areaId`). `offer(id)` of a hint with `soon: true` ignores the `HINT_GAP_S` gap (every other rule still applies) and still resets the gap for the hints after it.

- [ ] **Step 1: Failing tests:**
  - `HINT_IDS` contains `find`, `find-kept`, `map`; `hintMax` is 1 for each.
  - `line('hint.find')`, `line('hint.find-kept')`, `line('hint.map', { touch: true })`, `line('hint.map')` equal the Global Constraints words; `HINT_PICS` has `✨`, `👕`, `🗺️` for them.
  - A `soon` hint offered 5 s after another hint went up (and that one has gone away) goes up; a plain event hint offered at the same moment does not.
  - A polled `find` goes up when `findNear` is true (walk two or later is not required) and goes away when it turns false.
  - `walkFacts` sets `place` to `session.areaId`.
  - A save with `tutorial.hints: { map: 1, 'find-kept': 1, find: 1 }` loads with those counts; one with none loads with none.
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3: Implement**: the three rows in `HINTS` (after the yarn rows), the `soon` check in `mayShow` for `offer`, the words, the pictures, the two facts. Add to the header comment of `src/hints.js` a short "A PLACE'S OWN HINT (Rooftops, later)" recipe: a row `{ id: '<place>', max: 1, ring: null, when: (f) => f.place === '<area id>' }`, its `hint.<id>` line in tutorialwords.js, its picture in tips.js `HINT_PICS`. Add no Rooftops row.
- [ ] **Step 4:** Run the targeted tests; expect PASS.
- [ ] **Step 5:** Commit: `Hints: find, find-kept and map in the table (once each), a soon flag for a follow-on hint, and the walk's place in the facts for a place's own hint later`.

### Task 2: The find hints on a walk

**Files:**
- Modify: `src/game/tips.js` (`walkFacts`), `src/game/findcard.js` (or wherever the card's Wear it / Later close is handled; `src/foundwear/play.js` `handleFindArrival` for the pick-up)
- Test: `test/tips.test.js`, the find card's test (find it: `grep -rln findcard test`)

**Interfaces:**
- Consumes: Task 1's ids and facts.
- Produces: `f.findNear` true when `session.find` exists, is not `NO_FIND`, is not taken, and its spot is within `TWINKLE_RANGE` (`src/foundwear/rules.js`) of her cat and ahead of her view (the `ahead()` helper in tips.js). Find the find's position and taken flag in `src/foundwear/live.js`.

- [ ] **Step 1: Failing tests:**
  - `walkFacts` with a stand-in find 10 m ahead, not taken → `findNear` true; 10 m behind → false; 30 m ahead → false; taken → false; `NO_FIND` or no `session.find` → false.
  - Closing the find card (Wear it, and Later, and Back = Later) emits `bus.emit('tip', { id: 'find-kept' })` once.
  - Picking up the find marks `find` done on the save when it has never been shown (the progression call near `src/progression.js:1769`), so a child who found it on her own is not told later.
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3: Implement** the fact (no allocation per call beyond today's pattern), the emit after the card closes (after the walk resumes, so the line shows over the walk), the mark-done on pick-up.
- [ ] **Step 4:** Run the targeted tests + `test/foundwear*.test.js`; expect PASS.
- [ ] **Step 5:** Commit: `Hints: the first twinkle of a find says go and see; after the find card, its outfit is in Dress up`.

### Task 3: The world map's hint on Change place

**Files:**
- Modify: `src/ui/homebase.js` (opening the `places` sheet, `setSheet` ~1327-1340, the places render), `src/ui/dressingroom.js` (`renderPlacesSheetHtml`: an optional `hintHtml`), `src/style.css` (a small line in the map sheet's own style)
- Test: `test/homebase.map.test.js`

**Interfaces:**
- Consumes: Task 1's `'map'` id; `progression.countHint(id)`; `progression.state.tutorial.hints`; `hintMax('map')`; `settings.get('showTips')`; `line('hint.map', { touch })` (home knows touch the way the rest of homebase does).
- Produces: a `<p class="wm-hint">🗺️ {line}</p>` above the map frame, inside `.dr-where`.

- [ ] **Step 1: Failing tests:**
  - First open of Change place on a Clan Edition save with `hints.map` unset and tips on: the sheet shows `.wm-hint` with the touch or keys words, and `tutorial.hints.map` becomes 1 once (not once per render).
  - Re-rendering while the sheet stays open keeps the line; closing and opening again shows no line.
  - Tips off: no line, count stays unset.
  - Legacy Edition: no line, count stays unset.
  - The line is set as text (a name never goes in it, but escape it as the file does).
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3: Implement**: decide on the transition into `places` (in `setSheet`) whether this opening shows the hint, count it then, and keep that decision for the sheet's life.
- [ ] **Step 4:** Run the targeted tests + `test/homebase.launch.test.js test/mappan.test.js`; expect PASS.
- [ ] **Step 5:** Commit: `Hints: the first time Change place opens the world map, one line says tap a place, pinch to zoom`.

### Task 4: Real-game check of every hint, the yarn ones included

**Files:** none in `src` unless a bug is found (then fix with a test, in its own commit).

- [ ] **Step 1:** Dev server `npx vite --port 5395 --strictPort` in the worktree; headless Chrome `--headless=new --mute-audio`, settings seeded `{"muted":true}`. Seed a save that has walked (walks ≥ 2, Clan Edition) with empty `tutorial.hints`.
- [ ] **Step 2:** On a walk in the Park (it has find spots): walk toward the nearest find spot (read the spots from `src/foundwear/spots`) until the `find` line shows; pick it up; close the card; see the `find-kept` line. Note each line's text and screenshot it (phone 375×812 touch, desktop 1440×900).
- [ ] **Step 3:** The yarn ball: walk near a lying yarn ball until `hint.yarn` shows; screenshot.
- [ ] **Step 4:** Home: open Change place; screenshot the `map` line; reopen; no line.
- [ ] **Step 5:** Record in the report what showed, when, and any defect. Stop the server.
