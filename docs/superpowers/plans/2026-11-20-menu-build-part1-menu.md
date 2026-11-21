# Menu build, Part 1: the menu-review changes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the owner's approved menu-review items (#3, #4, #6, #7, #8, #10, #12, #13, #14) on the home screen and Menu.

**Architecture:** The home screen and Menu are `src/ui/homebase.js` (sheets, `renderMenu`, `setSheet`/`backTo`, `depth()`/`back()`), `src/ui/dressingroom.js` (`MENU_TILES`, `GROWNUP_SHEETS`, `HOME_SHEETS`, `SHEET_NAME`, the place card `todayHtml`, `renderPlacesSheetHtml`), `src/ui/walkingname.js`, `src/ui/colonypanel.js`, `src/ui/territorymap.js`, `src/territories.js`, `src/style.css`. Series words go through `phrase()` (`src/clanphrases.js`) with everyday overrides in `src/offclanwords.js` PHRASES.

**Tech Stack:** plain ES modules, Vite, Vitest (jsdom stand-in pages in `test/homebase.*.test.js`).

**Spec:** `docs/superpowers/specs/2026-11-20-menu-build-design.md` (and the review it builds on, `docs/superpowers/specs/2026-11-19-menu-review-report.md`).

## Global Constraints

- Work only in `/Users/pniessen/CLAUDE-CODE/projects/cat-game/.claude/worktrees/menu-build`. Never touch the main checkout `/Users/pniessen/CLAUDE-CODE/projects/cat-game`. Never read or print `.env.local`. No database work. No merge, no push.
- Pink (`.primary`) only on Start. Nothing removed from the game, only moved.
- No series word (clan, colony, rank words, place words from `clanwords.js`) typed in a string literal outside the word tables; `test/clanwords.test.js` scans `src`. New phrase ids are our own words. Read `words()`/`phrase()` at render time, never in a module-level const.
- Text is pitched for a 9-year-old.
- After a wording change, refresh snapshots with `UPDATE_SERIES_SNAPSHOT=1 UPDATE_OFF_SNAPSHOT=1 npx vitest run test/serieswords` (and `test/offwords.test.js` when it pins the change), then read the fixture diff and revert any drift unrelated to the task.
- No tests that read source text (rule S1, `docs/SESSION-HANDOFF.md`).
- Float fixtures use `closeDiffs` (CI runs on Linux).
- Targeted test files any time. A FULL suite only when `ps -ax -o command | grep -c "[v]itest"` prints 0, and never 18:30–19:30; the full suite is `WW_PGLITE=/Users/pniessen/.npm/_npx/90d26507e643fcc0/node_modules/@electric-sql/pglite/dist/index.js npx vitest run`. Implementers run targeted files only; the controller runs full suites.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Ids never change: the sheet id `colony` stays `colony`.

## Review Focus

- Offline (no rooms, no cloud): the Menu has no Play together tile, My clan has no Player pets, For grown-ups has no Cloud save; nothing throws. Tests in Tasks 2 and 3.
- Back (button, Esc, iOS back gesture via `backstack.js`) from Game settings / Cloud save / Gift code lands on For grown-ups, then the Menu, then home; `depth()` agrees at every layer. Test in Task 2.
- Play together with no name saved: tapping Start a room or Join a room still leads her to the friend-name box (`needName()`); in a room the roster view is unchanged. Test in Task 4.
- Legacy Edition (no world map) still renders the Menu, My clan and Change place (picture cards). Tests in Tasks 2 and 6.
- Everyday words: "My cats" everywhere "My clan" shows; no "the town" line. Tests in Tasks 3 and 5.

---

### Task 1: One name for points: "paw points" (#4)

**Files:**
- Modify: `src/ui/hud.js` (~line 72 aria), `src/ui/homebase.js` (~1616 home pill aria), `src/ui/screencards.js` (~75 summary tile label), `src/ui/denshop.js` (~70, 74, 120 aria)
- Test: update `test/homebase.launch.test.js` (~115), and any other test pinning "whisker points"; re-record word fixtures

- [ ] **Step 1:** `grep -rni "whisker points\|whisker point" src test` and list every player-facing hit (labels, aria-labels, title attributes). Comments in `src/progression.js` and `src/game/interactions.js` stay.
- [ ] **Step 2:** Change the tests first: `test/homebase.launch.test.js` expects aria `"42 paw points"`; add an assertion in the summary-card test (find it: `grep -rln screencards test`) that the points tile label reads `paw points` (match today's capitalisation of the label).
- [ ] **Step 3:** Run those test files; expect FAIL on the new words.
- [ ] **Step 4:** Swap every player-facing "whisker points"/"Whisker points" to "paw points"/"Paw points" (keep each string's capitalisation and singular/plural).
- [ ] **Step 5:** Run the targeted tests; expect PASS. Re-record word snapshots (Global Constraints); the fixture diff may only swap these words.
- [ ] **Step 6:** `grep -rni "whisker point" src` shows comments only. Commit: `Menu review #4: one name for points, "paw points" everywhere a child reads or hears it`.

### Task 2: The Menu's doors: For grown-ups, a slim Sound & controls row, My den "go now" (#6, #14)

**Files:**
- Modify: `src/ui/dressingroom.js` (`MENU_TILES`, `GROWNUP_SHEETS`, `HOME_SHEETS`, `SHEET_ICON`, `SHEET_NAME`, `resolveSheet` ~lines 30-60), `src/ui/homebase.js` (`renderMenu` ~1400-1416, `denTileHtml` ~1394, `renderControls` ~484-520 and the `#set-replay-first` handler ~1848, `setSheet` ~1327, `sheetBack` ~1353, sheet chrome ~1559-1571, `depth()`/`back()` ~2390-2412, `renderSheetBody` cases), `src/style.css` (Menu grid ~1991-2014, `.hb-grownups`)
- Test: `test/homebase.launch.test.js`, `test/dressingroom.test.js` (~823-825), `test/backstack.test.js` if it pins depths; a new `test/homebase.grownups.test.js`

**Interfaces:**
- Produces: sheet id `'grownups'` in `HOME_SHEETS`; `SHEET_NAME.grownups = 'For grown-ups'`, `SHEET_ICON.grownups = '⚙️'`. `GROWNUP_SHEETS` keeps `['settings','sync','code']` and now means "the sheets For grown-ups opens". Opening one of them from `grownups` sets the back target to `'grownups'`.

- [ ] **Step 1: Failing tests** (follow the stand-in page pattern in `test/homebase.launch.test.js`):
  - `menu has six tiles then a Sound & controls row then one For grown-ups door`: tiles in order `together, colony, journal, album, skills`, then `#btn-visit-den`; `[data-dr-sheet="controls"]` is outside `.hb-tiles` with class `hb-row`; exactly one `[data-dr-sheet="grownups"]` (class `hb-grownups-door`) and no `[data-dr-sheet="settings"]`, `"sync"` or `"code"` in the Menu.
  - `den tile says go now`: `#btn-visit-den small` text is `go now`.
  - `For grown-ups lists Game settings, Cloud save, Gift code and Do the first lesson again`: opening `grownups` shows buttons `[data-dr-sheet="settings"]`, `[data-dr-sheet="sync"]` (only when `sync.available`), `[data-dr-sheet="code"]`, and `#set-replay-first` with label `tutorialLine('guide.replay')`; with sync unavailable there is no sync button.
  - `Sound & controls no longer has the replay button`: no `#set-replay-first` in the `controls` sheet.
  - `back from Game settings goes to For grown-ups, then the Menu`: Menu → grownups → settings; `depth()` is 3 at settings, 2 at grownups, 1 at Menu; `back()` steps settings → grownups → menu → home; the sheet's back button label from settings reads `← Back` (keep today's "← Back to the menu" for sheets opened from the Menu).
  - `Legacy Edition Menu renders the same doors` (save with `edition: 'legacy'`).
  - No Start dock on `grownups`.
  - Offline (no `rooms`): five tiles + den, no `together` tile, nothing throws.
- [ ] **Step 2:** Run them; expect FAIL.
- [ ] **Step 3: Implement.** Add `grownups` to the sheet tables; `renderSheetBody` case `'grownups'` renders `<h2>For grown-ups ⚙️</h2>` and the four buttons as quiet full-width rows (not `.primary`); move the replay button markup and handler unchanged from `renderControls` into it. `renderMenu` renders the tiles, then `controls` as `<button class="hb-row" data-dr-sheet="controls">🔊 Sound & controls ›</button>` (icon + name spans as the tiles use), then `<button class="hb-grownups-door" data-dr-sheet="grownups">⚙️ For grown-ups ›</button>`; remove the old chip block. `denTileHtml` sub → `go now`. Make the back target a small chain: from the Menu → `'menu'`; from `grownups` → `'grownups'`; `sheetBack()` and the back button go to that target; `depth()` adds the extra layer for a sheet opened from `grownups`. The `.hb-grownups-door` is small quiet text-button style (like today's chips' label), `.hb-row` a slim full-width outlined row; the six tiles sit in the 2-column grid (drop the special seven-tile CSS rule; keep the odd-last-tile-spans rule).
- [ ] **Step 4:** Run the targeted tests + `test/dressingroom.test.js` + `test/backstack.test.js`; expect PASS. Update existing pins of `MENU_TILES`/exact Menu HTML to the new structure (only what this task changed).
- [ ] **Step 5:** Re-record word snapshots; the diff may only show the Menu's doors and the moved replay button.
- [ ] **Step 6:** Commit: `Menu review #6 and #14: one For grown-ups door (Game settings, Cloud save, Gift code, Do the first lesson again), Sound & controls a slim row, My den says go now`.

### Task 3: My clan: cat friends in one place (#7)

**Files:**
- Modify: `src/clanphrases.js` (new id), `src/offclanwords.js` (PHRASES override), `src/ui/dressingroom.js` (`SHEET_NAME.colony` read at render time), `src/ui/homebase.js` (colony case ~1460-1472, journal case ~1491, together case ~1475-1482, `renderStrayFriends` ~608, `renderPlayerPets` ~598, `loadPlayerPets` hook ~1633), `src/style.css` (`.friends-section` rules ~2130-2145 so they apply under `[data-sheet="colony"]`)
- Test: new `test/homebase.myclan.test.js`; update pins in `test/homebase.launch.test.js` (~756-794 Play together friends), journal tests

**Interfaces:**
- Produces: `phrase('menu.myCats')` → clan words `'My clan'` (built from the word set's group word, lower-cased: the same word `words()` gives for the group suffix; do not type it), everyday words `'My cats'`. The Menu tile name and the sheet heading `<h2>` both use it (`<h2>{phrase} 🐈</h2>`).

- [ ] **Step 1: Failing tests:**
  - `phrase('menu.myCats')` is `'My clan'` with the 'on' set and `'My cats'` inside `inEachWordSet`/`setSeriesMode('off')` (see `test/offwords.test.js` for how the off set is added).
  - Menu tile `[data-dr-sheet="colony"] .hb-tile-name` reads `My clan` (and `My cats` in the off set); the sheet heading reads `My clan 🐈`.
  - The colony sheet holds the colony cards, then `.friends-section` with `<h3>Stray cats</h3>` (her friends from `progression.state.friends`), then, only when cloud is available, `<h3>Player pets</h3>`; the pets load when the `colony` sheet opens (not `together`).
  - The journal sheet has no `Stray cats` heading; the together sheet has no `Player pets` heading but still has the friend code block (`#friend-code-input`, `#friend-code-add`).
  - Offline: colony sheet has Stray cats and no Player pets; nothing throws.
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3: Implement** the phrase (an entry in the main table near the other menu/colony ids; a function reading `words()` when called), the everyday override `'menu.myCats': 'My cats'`, a render-time name for the colony tile and heading, and move the two sections (markup, empty states, async pets load) into the colony case in the order above. Keep the existing headings' words.
- [ ] **Step 4:** Run the targeted tests and `test/clanwords.test.js`, `test/wordset.test.js`, `test/offwords.test.js`; expect PASS.
- [ ] **Step 5:** Re-record word snapshots (the rename and the moved sections only).
- [ ] **Step 6:** Commit: `Menu review #7: Colony is My clan (My cats in the everyday words), and cat friends live there: stray friends from the Journal, player pets from Play together`.

### Task 4: Play together: two big choices first, "friend name" (#8)

**Files:**
- Modify: `src/ui/homebase.js` (`renderWalkTogether` ~249-308, name block ~277-290, KEEPS ~440, ~453, ~583, `needName()` ~968, `WALKING_NAME_RULE` ~1904/1927, ~2063, the join handlers ~989/1957), `src/ui/walkingname.js` (~17-28), `src/ui/colonypanel.js` (~230-232), `src/style.css` (Play together layout)
- Test: `test/walkingname.test.js`, a new `test/homebase.together.test.js`; update other pins of "walking name" (`grep -rln "walking name" test`)

**Interfaces:**
- Produces: new element ids `#wt-join-open` (the big "Join a room" button) and `#wt-name-edit` (the ✏️ on the saved-name row); `#wt-host`, `#wt-join-code`, `#wt-join`, `#wt-petname-input`, `#wt-petname-save` keep their ids.

- [ ] **Step 1: Failing tests:**
  - Outside a room, the first controls in the together sheet are `#wt-host` ("Start a room") and `#wt-join-open` ("Join a room"), side by side in one `.wt-choices` row, before any name box; neither is `.primary`.
  - `#wt-join-code`/`#wt-join` are absent until `#wt-join-open` is tapped, then present (focus moves to `#wt-join-code`).
  - With no valid name saved: a `Friends` section with `#wt-petname-input` and the label `Your friend name`; with a name saved: no `#wt-petname-input`, a row reading `Your friend name: <name>` with `#wt-name-edit`; tapping it shows the box with the name filled in.
  - With no name, tapping `#wt-host` (and `#wt-join` after opening) still runs the need-a-name path: the box is shown and focused with today's message, worded "friend name".
  - No player-facing "walking name" anywhere: `walkingname.js` strings read `Your friend name`, `Pick your friend name`, `A friend name is 2–16…`, and its intro lines say `friend name`; the colony panel's lines too.
  - In a room the roster view is unchanged (existing tests stay green).
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3: Implement** the order (Play now: choices row, join reveal, nearby rows, sibling "Explore with X"; Friends: name box or saved-name row, star-name picker in Clan Edition, friend code and Add a friend by code), the join reveal as a view flag that resets when the sheet closes, the saved-name row with the pencil, and the word change in every literal found by `grep -rn "walking name\|Walking name" src`.
- [ ] **Step 4:** Run the targeted tests plus `test/nearby*.test.js test/homebase.safety.test.js test/homebase.deleteonline.test.js test/onlinedelete.test.js test/offlinefirst.test.js test/colonypanel.test.js`; expect PASS (update only the word "walking name" → "friend name" and the new order in their pins).
- [ ] **Step 5:** Re-record word snapshots.
- [ ] **Step 6:** Commit: `Menu review #8: Play together opens on two big choices, Start a room and Join a room; the name box only until a name is saved; walking name is friend name`.

### Task 5: One voice on Home, and "the town" (#3, #13)

**Files:**
- Modify: `src/ui/homebase.js` (`showVisit` ~1176-1207), `src/clanphrases.js`, `src/offclanwords.js`, `src/ui/dressingroom.js` (`buildDressingModel` place line ~214, `todayHtml` ~424-441), `src/ui/placecard.js` (the map pop-up card), `src/style.css` (a small line style)
- Test: `test/homebase.visits.test.js`, `test/placecard.test.js`, new cases in `test/dressingroom.test.js` or a new `test/townnote.test.js`

**Interfaces:**
- Produces: `phrase('place.townNote')` → `'the town'` (clan words), `''` (everyday override). `export const TOWN_NOTE_VISITS = 5` in `src/ui/dressingroom.js`.

- [ ] **Step 1: Failing tests:**
  - An ordinary visit (n = 2, 7, 42) shows no welcome bubble (`.dr-welcome` or whatever `showWelcome` creates is absent).
  - A milestone visit (1, 5, 10) whose celebration opens shows the celebration and no bubble; one whose celebration cannot open shows the bubble with `welcomeLine(n)`.
  - The home place card for the Neighborhood shows a `<small class="dr-town-note">the town</small>` under the name at visits 0..5, not at 6; never for another place; never in the off set (empty phrase draws no element).
  - The map pop-up card for the Neighborhood shows the same line under the same rule.
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3: Implement:** in `showVisit`, call `showWelcome` only when `isMilestone(n)` (the celebration path returned early when it opened); the place model gets `townNote` (the phrase when `id === 'neighborhood'` and `visits <= TOWN_NOTE_VISITS`, else `''`), rendered only when non-empty.
- [ ] **Step 4:** Run targeted tests + `test/visitcelebration.test.js test/visits.test.js test/twolegplace.test.js`; expect PASS.
- [ ] **Step 5:** Re-record word snapshots.
- [ ] **Step 6:** Commit: `Menu review #3 and #13: the cat's greeting only on first and milestone visits; a small "the town" line under Twolegplace for the first five visits`.

### Task 6: Change place for a new child (#10)

**Files:**
- Modify: `src/territories.js` (`placeState` ~98-121, beside `opensAfterLine` ~86), `src/worldmap.js` (whatever passes `line` to the map rows), `src/ui/territorymap.js` (`labelHtml` ~93-106), `src/ui/dressingroom.js` (Legacy `renderPlacesSheetHtml` list ~521)
- Test: `test/worldmap.test.js`, `test/territories*.test.js` (find the `placeState` tests), `test/homebase.map.test.js`, `test/dressingroom.test.js`

**Interfaces:**
- Produces: `export function shortLockLine(req, have, edition, catalog)` in `src/territories.js` → `'explore {place} {k} more times'`, or `'explore {place} once more'` when k = 1, where k = `req.walks - have` and `{place}` is spelled exactly as `opensAfterLine` spells it. `placeState(...)` gains `mapLine`: `shortLockLine(...)` when locked, else equal to `line`.

- [ ] **Step 1: Failing tests:**
  - `shortLockLine({ area: 'neighborhood', walks: 2 }, 0, 'canon', CATALOG)` is `explore twolegplace 2 more times` — spell the place exactly as `opensAfterLine` lowercases it today (check `lower`) and assert against that same spelling; with `have = 1` it is `explore … once more`.
  - `placeState` for a locked place: `line` unchanged (`opens after you explore … · 0/2`), `mapLine` the short line; for an open place `mapLine === line`.
  - The world map SVG label for a locked place contains the short line and not `0/2`; the pop-up card for that place still shows the full line with the counter.
  - Legacy picture cards: owned/open places come before locked ones, each group in catalog order.
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3: Implement**, the map label reading `mapLine`; Legacy list a stable partition (open first).
- [ ] **Step 4:** Run the targeted tests + `test/mappan.test.js test/placecard.test.js`; expect PASS.
- [ ] **Step 5:** Re-record word snapshots.
- [ ] **Step 6:** Commit: `Menu review #10: a locked place on the world map says it in one short line (explore Twolegplace 2 more times); Legacy's list puts open places first`.

### Task 7: iPad portrait gets the phone's stacked home (#12)

**Files:**
- Modify: `src/style.css` (`.dr` grid ~1413-1427, phone block `@media (max-width: 600px)` ~1877-1943)

- [ ] **Step 1:** Change the phone block's query to `@media (max-width: 600px), (orientation: portrait) and (max-width: 1100px)` for the home layout rules only (`.dr` grid areas, the stacked hero/today/dock, `.dr-today-card` phone-tile styles). Rules in that block that are about phone width alone (tiny type, a phone-only gap) stay under `max-width: 600px`: split the block if needed and say which rules went where in the commit message.
- [ ] **Step 2: Real-game check.** Start `npx vite --port 5395 --strictPort` in the worktree; with headless Chrome (`--headless=new --mute-audio`, save seeded with `muted:true` in `whisker-walk-settings`) at 768×1024, 820×1180 and 1024×1366 (mobile, touch), measure on home: `.dr` uses one column (hero, today card and Start stacked), the gap between the bottom of the place card and the top of Start is under 48 px, nothing overflows horizontally (`document.documentElement.scrollWidth <= innerWidth`); at 1180×820 (iPad landscape) and 1440×900 the two columns are unchanged. Save the measurements and screenshots in the task report folder. Stop the server.
- [ ] **Step 3:** Run `test/homebase.launch.test.js` and any CSS-pinning test (`grep -rln "max-width: 600px" test`); expect PASS.
- [ ] **Step 4:** Commit: `Menu review #12: iPad portrait gets the phone's stacked home, no gap between the place card and Start`.
