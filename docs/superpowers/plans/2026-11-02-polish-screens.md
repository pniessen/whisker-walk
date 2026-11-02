# polish-screens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dress up the screens around a walk (Ready/pause card, walk summary) and smooth the home's rough edges (Settings controls, Journal, Album/Social empty states, the visit bubble), looks only.

**Architecture:** The Ready/pause card and the summary get one shared "screen panel" look (navy card panel, the home's pink pill, her cat's portrait). Her cat's portrait is a cached snapshot from `src/thumbnails.js` (same throwaway-context snapper the home uses), taken under a seeded local `Math.random`. Count-up and confetti live in a small new module `src/ui/screencards.js`; confetti reuses `confettiHtml` from `src/ui/visitcelebration.js`. Home fixes are markup + CSS in `src/ui/homebase.js`, `src/journal.js`, a new `src/ui/emptystates.js` and `src/style.css`.

**Tech Stack:** Vanilla JS + DOM, Three 0.185 (portrait only), Vite 8, Vitest 4 (jsdom-free tests build HTML strings; homebase tests use the fake doc in test/homebase.visits.test.js).

**Spec:** survey items #10 and #17 in `/private/tmp/claude-501/-Users-pniessen-CLAUDE-CODE-projects-cat-game/6f2ddd3a-4768-4d57-890f-2d7e74238375/scratchpad/polish-survey.md` (l.65, l.72) and the shared rules in `.../scratchpad/polish-common.md`.

## Global Constraints

- Looks only. No saved-data change, no change to what any button does. Keep every element id (`btn-resume`, `btn-end`, `btn-summary-continue`, `set-*`, `btn-reset`, `hb-back`, …) and every input's type and `change`/`input` wiring.
- **Buttons hold plain text only.** main.js routes overlay clicks by `e.target.id`, so a child `<span>`/`<img>` inside `#btn-resume`, `#btn-end` or `#btn-summary-continue` would swallow the click. Emoji are text, fine.
- main.js rewrites `#btn-resume`'s `textContent` to `'Tap to explore'` on first touch: keep that working.
- No `Math.random` anywhere new. Confetti uses `mulberry32(seedFromCode(...))` from `src/rng.js`. The portrait snapshot swaps `Math.random` for a seeded `mulberry32` while it builds (the `withLocalUuids` pattern in src/world/camp.js:466) so it makes zero global draws.
- Reduced motion = `settings.get('reducedMotion')` OR `matchMedia('(prefers-reduced-motion: reduce)').matches`. Under it: numbers show final values at once, no confetti nodes are added. CSS also hides `.visit-confetti` under the media query (already).
- Pink pill = `background: #e7a9a0; color: #1c2431; border-radius: 999px; min-height: 48px; font-weight: 700` (as `.summary-card .primary` already is; test/hud.test.js pins it). Secondary pill = transparent with a 1px `#8c9bb4` border, cream text `#f1e0c2`, same radius/height. Panel = `#2c3d58`→`#223047` gradient, 1px `#33425e` border, radius 20px, shadow. Font: `Avenir, Nunito, 'Trebuchet MS', sans-serif`.
- Copy the kids read: short, warm, plain. No sarcasm, nothing scary.
- Must look right at desktop 1280×720, phone 390×844, and (Ready + summary) landscape phone 844×390: nothing cut off, no horizontal scroll; the panel may scroll inside itself on landscape.
- On the phone the summary scrim stays edge to edge (`padding: 16px 4vw` on `.summary-card` in the 480px block, no max-width there — pinned by hud.test.js).
- Tests: `npx vitest run --exclude '.claude/**' --exclude '.worktrees/**'` (all green), `npm run build`. Commits: explicit `git add <paths>`, message ends `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Files: stay inside src/game/walk.js (Ready/pause/summary code only — NOT the dusk-light lines, polish-gorgesky owns those), src/game/crossing.js (one call), src/thumbnails.js, src/ui/* (not catbuilder.js/catstage.js), src/journal.js, src/style.css, tests.
- Live check: dev server already running at http://localhost:5198 (worktree). Shot script: `OUT=<dir> node <scratchpad>/snaps-polish-screens/shoot/screens.mjs home|menus|walk` (writes `home-*`, `builder-*`, `menu-*`, `ready-*`, `pause-*`, `summary-*`). Look at your own shots before reporting.

## Review Focus

1. A custom cat (state.equipped.custom) or a cat with accessories → the portrait shows that cat as worn, not a plain tabby. Test in Task 1 (`portraitEntry` maps state to breed/look/wear).
2. No WebGL (tests, a failing GPU) → `herCatPortrait` returns null and the card renders without an `<img>`, no throw. Test in Task 1.
3. A den walk (no goals) and a walk with 0 points → summary still renders, count-up of 0 is instant, no "0/3" tile. Test in Task 2.
4. Reduced motion via the in-game setting only (OS not set) → no confetti markup, final numbers immediately. Test in Task 2.
5. The welcome bubble when the builder or a sheet opens, or a walk starts, while it is up → removed at once. Test in Task 5.

---

### Task 1: Ready/pause card panel and her cat's portrait

**Files:**
- Modify: `src/thumbnails.js` (add exports), `src/game/walk.js:166-175` (`pauseCardHtml`) and `:1813-1814` (compute portrait), `src/game/crossing.js:29`, `src/style.css` (`.pause-card` ~l.458 and the shared button rule ~l.350)
- Test: `test/screens.test.js` (new), `test/crossing.test.js` (update only if signature use changes)

**Interfaces:**
- Produces: `portraitEntry(state) → { key: string, breed: string, look: object|null, wear: object }` (pure; `wear` = state.equipped minus `cat`/`custom`, nulls dropped; key = `'her:' + breed + ':' + JSON of look + ':' + JSON of wear`).
- Produces: `herCatPortrait(state) → string|null` — data URL of the whole cat, three-quarter view (the `snap(cat, false)` framing), cached by key; null on any failure. Makes zero global `Math.random` draws.
- Produces: `pauseCardHtml({ welcome, touch, portrait })` — `portrait` optional data URL.
- Produces: `session.portrait` (string|null), set in walk.js before the Ready card is first drawn.

- [ ] **Step 1: Write failing tests** in `test/screens.test.js`:
  - `portraitEntry` for `{ equipped: { cat: 'siamese', collar: 'bell', head: null } }` → breed `'siamese'`, look null, wear `{ collar: 'bell' }`; for a custom cat state (copy a valid customCats fixture from test/customcats*.test.js) → its look and preset breed.
  - `herCatPortrait(state)` in Vitest (no WebGL) returns `null`, does not throw, and `Math.random` is called 0 times (spy).
  - `pauseCardHtml({ welcome: 'Hi', touch: false, portrait: 'data:image/png;base64,AA' })` contains `class="screen-panel"`, an `<img class="screen-cat"` with that src and `alt=""`; without portrait → no `<img`. `#btn-resume` has class `primary` and its inner text has no `<`; `#btn-end` has class `secondary`.
- [ ] **Step 2: Run** `npx vitest run test/screens.test.js` → FAIL.
- [ ] **Step 3: Implement.** `herCatPortrait` reuses `makeSnapper` and the same lights as `customThumbnails`, builds `buildCat(breed, wear, look ? { look } : {})`, swaps `Math.random = mulberry32(seedFromCode('portrait'))` around context creation + build + snap, restores in `finally`. Markup: `<div class="pause-card"><div class="screen-panel">[img]<h1>Ready?</h1>[welcome]<div class="screen-actions">resume, end</div><p class="controls-hint">…</p></div></div>`. In walk.js compute `session.portrait = herCatPortrait(progression.state)` right before the Ready card's `overlay.innerHTML` (after the build, so area draw counts can't move). crossing.js passes `portrait: s.portrait`. CSS: `.pause-card` keeps its full-screen dim; `.screen-panel` is the panel (max-width 440px, padding 22px 26px, grid gap 12px, centred); `.screen-cat` 132px square (96px under `max-height: 500px`); `.pause-card .primary` pink pill, `.pause-card .secondary` secondary pill, both `min-width: 220px`; actions stack in a column; controls hint at 0.85rem in a soft rounded box. Remove `.pause-card button` from the old blue button rule. Landscape (`max-height: 500px`): panel becomes two columns (cat left, text + buttons right) or scrolls; nothing cut off.
- [ ] **Step 4: Run** the test file, then the full suite → PASS. Take `ready-*` and `pause-*` shots and look at them (desk, phone, land).
- [ ] **Step 5: Commit** `feat(screens): Ready card on a panel with pink pills and her cat`.

### Task 2: Walk summary — panel, cat, stat tiles, cheer, count-up, best-walk confetti

**Files:**
- Create: `src/ui/screencards.js`
- Modify: `src/game/walk.js` (summary markup ~l.1915-1933 and after `overlay.innerHTML = summaryHtml` ~l.2051), `src/style.css` (summary rules ~l.468-485 and the 480px block ~l.508)
- Test: `test/screens.test.js`

**Interfaces:**
- Consumes: `session.portrait` (Task 1), `confettiHtml(visit, rng, count)` from `src/ui/visitcelebration.js`, `mulberry32`, `seedFromCode` from `src/rng.js`.
- Produces: `summaryCheer(earned, discoveries) → string` — deterministic pick (`(earned + discoveries) % n`) from: `'What a walk!'`, `'Great exploring!'`, `'Happy paws!'`, `'You did it!'`, `'Lovely walk!'`.
- Produces: `prefersReducedMotion(settings) → boolean` (setting OR media query; media query guarded when `matchMedia` is absent).
- Produces: `countUp(root, { reduced, raf = requestAnimationFrame, now = () => performance.now(), ms = 900 })` — every `[data-count]` inside root counts 0→N (ease-out) writing `N + (data-suffix ?? '')`; reduced → final text at once. Markup already carries the final text, so a missed frame never leaves a wrong number.
- Produces: `bestWalkConfetti(earned, { reduced }) → string` — `''` when reduced, else `confettiHtml(0, mulberry32(seedFromCode('best-walk-' + earned)), 40)`.

- [ ] **Step 1: Write failing tests:** `summaryCheer(5, 0)` is one of the five and equal across calls; `countUp` with a fake `raf`/`now` steps a `data-count="12"` node through values ending at `"12"`, `data-count="2" data-suffix="/3"` ends `"2/3"`, `data-count="0"` is `"0"` after the first frame; reduced → final text with zero raf calls; `bestWalkConfetti(5, { reduced: true }) === ''`, unreduced contains 40 `<i ` and is identical on two calls; `prefersReducedMotion({ get: () => true })` true with no matchMedia. (Use a tiny fake element: `{ querySelectorAll: () => nodes }`, nodes `{ dataset, textContent }`.)
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `screencards.js`; rebuild the summary markup: `.summary-card` (scrim, `position: relative`) › confetti (record only) › `.screen-panel.summary-panel` › cat img (when portrait) › `h1 Walk complete!` › `.summary-cheer` line › record banner or best line › `.summary-stats` of tiles (`.stat` gets a panel-tone rounded tile with an emoji line above the number: 🐾 whisker points, 🔍 discoveries, 😺 cats greeted, ⭐ goals done) › the existing extra lines › `#btn-summary-continue.primary` (text `Continue`). Stat values carry `data-count` (and `data-suffix="/3"` for goals) with the final number as text. After `overlay.innerHTML = summaryHtml`, call `countUp(overlay, { reduced: prefersReducedMotion(settings) })`. Phone: tiles in a 2×2 grid; landscape: cat 80px, tiles in one row, panel scrolls.
- [ ] **Step 4: Run** tests + suite → PASS; shots `summary-*` (incl. `-best`), look at them.
- [ ] **Step 5: Commit** `feat(screens): walk summary on a panel with her cat, counting numbers and best-walk confetti`.

### Task 3: Settings — styled switches, sliders and pill selects

**Files:**
- Modify: `src/ui/homebase.js:300-345` (`renderSettings` markup only), `src/style.css` (settings rules)
- Test: `test/screens.test.js` (CSS/markup assertions; read style.css as text like test/hud.test.js does)

**Interfaces:** none new. Ruling: selects stay `<select>` (styled as pills) rather than becoming radio pills, so no handler changes.

- [ ] **Step 1: Failing tests:** each checkbox row in the rendered settings has `class="settings-row settings-switch"`, the `<input type="checkbox"` keeps its id and gets `role="switch"`, followed by `<span class="switch" aria-hidden="true"></span>`; CSS has `.settings-switch input` with `appearance: none` (or visually hidden but focusable — NOT `display:none`), a `:focus-visible` rule for the switch, `input[type=range]` styled with `accent` pink thumb, `.settings-section select` with `appearance: none` and `border-radius: 999px`. Get the HTML by rendering the settings sheet through the fake-doc harness in test/homebase.visits.test.js, or by asserting on the source string if that harness can't open Settings.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** Switch: 46×26 track (`#33425e`, on: `#e7a9a0`), 20px cream knob that slides (no transition under reduced motion), label text left, switch right, rows 48px tall with a soft divider; the whole row stays a `<label>` so clicking the text toggles. Sliders: 8px rounded track filled pink to the value (CSS `accent-color: #e7a9a0` plus `-webkit-slider-thumb`/`-moz-range-thumb` 22px cream thumb with pink ring). Selects: pill (`#2c3d58`, 1px `#8c9bb4` border, cream text, custom ▾ via background SVG data URI, padding-right 34px, min-height 40px). Focus ring: `outline: 3px solid #fff; outline-offset: 2px` on `:focus-visible`. "Start over" becomes a small outline pill in soft red `#e98a8a` (still `.danger`, still `#btn-reset`). Section headed by the existing h2.
- [ ] **Step 4: Run** → PASS; shots `menu-Settings-*` incl. `-focus-` (Tab focus visible), look.
- [ ] **Step 5: Commit** `feat(screens): Settings gets switches, soft sliders and pill selects`.

### Task 4: Journal silhouettes, Album and Social empty-state pictures

**Files:**
- Create: `src/ui/emptystates.js`
- Modify: `src/journal.js:41-51`, `src/ui/homebase.js` (album empty branch ~l.818 and `renderStrayFriends` empty branch ~l.404), `src/style.css` (journal + new `.empty-state`)
- Test: `test/journal.test.js` (update the ❓ test), `test/screens.test.js`

**Interfaces:**
- Produces: `emptyStateHtml(kind: 'album'|'friends') → string` — `<div class="empty-state empty-<kind>"><svg …aria-hidden="true">…</svg><p>LINE</p></div>`. Lines (exact): album `No photos yet. Snap one on your next walk! 📸`; friends `No cat friends yet. Go touch noses on a walk! 🐾`. Pictures: small hand-drawn inline SVGs (~120×90, flat shapes in the home palette): album = a photo frame with a cat-ear silhouette and a little camera; friends = two cat heads nose to nose with a small heart. Static, no animation.
- [ ] **Step 1: Failing tests:** unspotted card renders the critter's own emoji inside `<span class="journal-emoji silhouette" aria-hidden="true">`, has `aria-label="Not found yet"` (or a visually hidden "Not found yet"), never the critter's name, still the hint, and no `❓`; `emptyStateHtml('album')` contains `<svg` and the exact album line; homebase album sheet with no photos and friends with none contain `class="empty-state`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** CSS `.journal-emoji.silhouette { filter: brightness(0); opacity: 0.55 }` on an unspotted card tinted a little lighter (`#33425e`) so the dark shape reads; the card a rounded tile like the home's. Spotted cards unchanged except matching tile radius. `.empty-state` centred column, svg 120px wide, line in cream 1rem.
- [ ] **Step 4: Run** → PASS; shots `menu-Journal-*`, `menu-Album-*`, `menu-Social-*`, look.
- [ ] **Step 5: Commit** `feat(screens): Journal silhouettes and friendly empty album and friends`.

### Task 5: The visit bubble beside the head, gone when the builder opens

**Files:**
- Modify: `src/ui/homebase.js:651-676` (`showWelcome`, plus `closeWelcome()` calls), `src/style.css:1239-1258`
- Test: `test/homebase.visits.test.js`

**Interfaces:** none new.

- [ ] **Step 1: Failing tests** (fake-doc harness in homebase.visits.test.js): after a plain visit shows the line, (a) opening the cat builder ("Make a cat" / the dressing room's builder state), (b) opening any sheet, (c) `hide()` (walk start) each remove `.visit-welcome` from the body; the line gets a `data-side` attribute (`'right'` normally) and its inline `left` is to the right of the stage's horizontal centre (`> rect.left + rect.width / 2`).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** Placement: anchor at `x = rect.left + rect.width * 0.5 + headHalf` where `headHalf = min(90, rect.width * 0.17)`, `y = rect.top + rect.height * 0.2`; bubble is `transform: none`, `max-width: max(120px, rect.right - x - 10px)`, smaller font (0.9rem; 0.8rem when the stage is under 480px wide), and a CSS speech tail on its left side pointing at the head. If the space right of the head is under 120px, put it on the left side mirrored (`data-side="left"`, tail on the right). Close it in `render()` whenever `openSheet` is set or the dressing room is in builder mode, and in `hide()`. Keep role=status, pointer-events none, the fade and its reduced-motion variant (adjust keyframes to drop the -50% translate).
- [ ] **Step 4: Run** → PASS; shots `home-*` and `builder-phone` (no bubble), look.
- [ ] **Step 5: Commit** `fix(home): visit bubble sits beside the cat's head and leaves when the builder opens`.
