# polish-home2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the home's rough edges from polish survey 2 (#12, #14): coloured clan cards with emblems, a pictured colony empty state, a builder footer that no longer slices rows or goes khaki, and a fight sheet without dead space or khaki "waiting" buttons.

**Architecture:** Pure renderers (`src/ui/clanpicker.js`, `src/ui/emptystates.js`, `src/ui/catbuilder.js`, `src/ui/fightui.js`) gain small markup changes; the look lives in the home / builder / fight sections of `src/style.css`. One small behaviour fix in `src/ui/homebase.js` (the welcome bubble leaves on scroll). No world, walk or cat code changes, so the flat trace and draw counts cannot move.

**Tech Stack:** plain ES modules, CSS, Vitest 4 (node, string-level DOM tests).

**Spec:** scratchpad `polish-survey-2.md` → "Build B4 polish-home2", ranked rows #12 and #14; shared rules `polish-common.md`.

## Global Constraints

- Words the kids read are short, warm and plain. No sarcasm, nothing scary.
- No borrowed word (the clan suffix, rank, outside or place words from `src/clanwords.js`) may appear in a string literal outside clanwords.js — `test/clanwords.test.js` scans `src/**/*.js`. Compose names with `clanName(id)` / `CLAN_SUFFIX`.
- Do NOT touch `src/ui/catstage.js` or `src/cat/*`. Stay out of the HUD/touch/toast/chat sections of `src/style.css`.
- White text on any new card colour keeps ≥ 4.5:1 contrast on the lighter gradient stop.
- Every tappable control stays ≥ 44 px.
- Respect `prefers-reduced-motion: reduce` for any new animation.
- Tests: `npx vitest run --exclude '.claude/**' --exclude '.worktrees/**'`; also `npm run build`. Commits use explicit `git add <paths>` and end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. A partner's tag ("🤝 Robin's") and "✓ yours" on the same coloured card still read (white on every clan colour) — pinned by the exact-markup test in Task 1.
2. A not-pickable card (`dr-home-off`) keeps its grey look and gets no clan colour class — Task 1 test.
3. The fight sheet's buttons do not move between the clue and the beat (the top block's height must not shrink below the clue's height) — Task 4 checks live, measured with the fights script.
4. Legacy edition colony page still shows the same empty line (the picture is edition-neutral) — Task 2 keeps the line text exact.
5. The disabled Done button's new label fits one line on a 375-wide phone — Task 3 live check.

---

### Task 1: Clan cards get their own colour and an emblem

**Files:**
- Modify: `src/ui/clanpicker.js` (`renderClanPickerHtml`)
- Modify: `src/style.css` (Clan Edition pick-your-clan block, ~l.1168–1182)
- Test: `test/clanpicker.test.js`

**Interfaces:**
- Produces: `export const CLAN_EMBLEMS` (frozen `{ woods, river, moor, pines, gorge }` → inline SVG string) in clanpicker.js.

Decisions:
- Each pickable card's button gets the extra class `dr-home-<id>` (e.g. `class="dr-home sel dr-home-woods"`; keep the existing order `dr-home ${sel}` then the id class). The off card (`dr-home-off`) gets no id class.
- The name span becomes `<span class="dr-home-name"><span class="dr-home-emblem">${svg}</span>${name}</span>` — so `>${clanName(id)}<` still matches.
- Emblems: woods = storm cloud with a gold lightning bolt; river = a fish; moor = three wind swooshes; pines = crescent moon with a small star; gorge = a flat-topped cliff with a step. Each `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">`, drawn in the clan's dark colour on a cream (`#f1e0c2`) round badge (the `.dr-home-emblem` span: 30 px circle, inline-flex, vertical-align middle, margin-right 6px). An unknown id gets no emblem.
- Gradients (light → dark, 165deg), all ≥ 4.5:1 for white on the light stop: woods `#47804a → #2f5a33`, river `#3a789a → #24516b`, moor `#865f92 → #5c3f68`, pines `#56609c → #353d68`, gorge `#965f3c → #6b4128`. Keep the old green as the `.dr .dr-home` fallback.

- [ ] **Step 1: Update the test** — in `'the four pickable cards are unchanged'` change the expected button markup to the new class and name span:
```js
expect(html).toContain(`<button class="dr-home ${mine ? 'sel' : ''} dr-home-${id}" ${PICK_ATTR}="${id}" aria-pressed="${mine}">`
  + `<span class="dr-home-name"><span class="dr-home-emblem">${CLAN_EMBLEMS[id]}</span>${clanName(id)}</span><small>of ${t.name}</small>` ...
```
and add `it('every clan has its own emblem and colour class; the off card has neither')`: for each `pickableClans()` id, `CLAN_EMBLEMS[id]` starts with `<svg` and contains `aria-hidden="true"`, the five emblems are distinct, and the HTML contains `dr-home-${id}`; with `gorge` made unpickable (as in the existing "not pickable" test) the off card contains no `dr-home-gorge` and no `dr-home-emblem`... (the off card may keep a plain name span). Also assert `readFileSync('src/style.css','utf8')` contains `.dr-home-woods`, `.dr-home-river`, `.dr-home-moor`, `.dr-home-pines`, `.dr-home-gorge`.
- [ ] **Step 2:** `npx vitest run test/clanpicker.test.js` → FAIL.
- [ ] **Step 3:** Implement as decided; add the five gradient rules and `.dr-home-emblem` to style.css next to the existing `.dr .dr-home` rule.
- [ ] **Step 4:** `npx vitest run test/clanpicker.test.js test/clanwords.test.js test/dressingroom.test.js` → PASS.
- [ ] **Step 5:** Commit `feat(home): each clan card wears its own colour and emblem`.

### Task 2: The colony page's empty state gets a picture

**Files:**
- Modify: `src/ui/emptystates.js` (new `colony` entry)
- Modify: `src/ui/colonypanel.js:303`
- Modify: `src/style.css` only if `.empty-state` needs a left-aligned variant inside the colony panel
- Test: `test/screens.empty.test.js`, `test/colonypanel.test.js`

**Interfaces:**
- Consumes: `emptyStateHtml(kind)` (existing). Produces: `emptyStateHtml('colony')`.

Decisions:
- Line stays exactly `No colony cats yet — touch noses with a stray, then feed it 🐟` (test already pins it; it reads fine and works in both editions).
- Picture (120×90, same palette consts): a small cat sitting beside a food bowl with a fish in it, a little heart above — the "make a friend, feed it" story. Decorative (`aria-hidden`).
- colonypanel renders `emptyStateHtml('colony')` in place of the `<p class="colony-empty">…</p>`; keep the `colony-empty` class on the wrapper so old styling hooks still work: output `<div class="empty-state empty-colony colony-empty">…`. (Change `emptyStateHtml` so it can't break album/friends: add an optional `extraClass` only for colony, or just bake `colony-empty` into the colony entry.)
- Check `.colony-empty` CSS (l.840: font-size/colour/max-width) does not fight `.empty-state`; scope it to `p.colony-empty` if needed.

- [ ] **Step 1:** In screens.empty.test.js add `it('colony: a decorative svg picture and the exact line')` mirroring the album test with `empty-colony` and the line above. In colonypanel.test.js's empty-state test add `expect(empty).toContain('class="empty-state empty-colony')` and `expect(empty).toMatch(/<svg[^>]*aria-hidden="true"/)`.
- [ ] **Step 2:** Run both files → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run both files + `test/clanwords.test.js` → PASS.
- [ ] **Step 5:** Commit `feat(colony): the empty colony page shows a picture`.

### Task 3: Builder footer — rows fade under the bar; Done never goes khaki

**Files:**
- Modify: `src/ui/catbuilder.js` (`renderBuilderHtml`)
- Modify: `src/style.css` (builder block ~l.1575–1583)
- Test: `test/catbuilder.test.js`

Decisions:
- The sticky `.cb-foot` gets a 28 px fade strip above it (`.cb-foot::before`, absolute, `bottom: 100%`, `linear-gradient(to bottom, transparent, var(--navy))`, `pointer-events: none`) so a row passing under the bar dissolves instead of being sliced; this is the fix for the half-hidden eye row at 1280×720 and the pattern row on phones. Do not change the foot's sticky behaviour or the rows' order.
- Disabled Done: background `rgba(231,169,160,.30)` (dimmed pink), text `#f6dcd7`, no khaki. When `!model.canDone` its label is `Name your cat first ✏️`; when enabled it stays `Done, now dress it up →`.

- [ ] **Step 1:** Tests: `it('Done asks for a name while it is disabled')` → `html(newBuilder())` contains `data-cb-done disabled>Name your cat first ✏️</button>`; after a valid name (`reduceBuilder(b, { type: 'name', value: 'Mossy' })`) contains `data-cb-done>Done, now dress it up →</button>`. `it('the disabled Done is dimmed pink, not khaki')` → style.css does not contain `#6a6250` and contains `.cb-foot::before`.
- [ ] **Step 2:** Run `test/catbuilder.test.js` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run → PASS (the existing footer-band regex test must still pass).
- [ ] **Step 5:** Commit `fix(builder): rows fade under the footer; a nameless Done asks for a name`.

### Task 4: Fight sheet — no dead band, "waiting" buttons that look like waiting

**Files:**
- Modify: `src/style.css` (fight block ~l.1626–1729 only)
- Test: `test/fightui.test.js`

Decisions:
- `.fight-top`: `min-height: 120px` → `100px` (the clue row's own height: 30 px pips + 4 gap + 64 px icon ≈ 98) and `justify-content: center`, so the beat's pips and line sit in the middle of the block instead of under ~75 px of empty band, and the buttons still don't jump between clue and beat. Sheet top padding 10px → 8px. Keep the short-portrait and landscape rules as they are.
- `.fight-moves.idle .fight-move` (between beats): no opacity khaki. Use `background: rgba(242,193,78,.14); color: #ffd45a; box-shadow: inset 0 0 0 2px rgba(255,212,90,.55);` with a soft 1.6 s ease-in-out alternate "breathe" (`opacity .7 ↔ 1`) via `@keyframes fight-wait`; under `prefers-reduced-motion: reduce` no animation (opacity .85). Active buttons stay solid gold `#f2c14e`. Specials' `.used` stays as is.
- Ruling vs the survey's "dimmed pink": the live buttons are gold, so waiting = outlined gold, not a different colour; pink would read as a different button.

- [ ] **Step 1:** Test `it('waiting moves are outlined gold that breathes, never a dimmed khaki')`: read style.css; the `.fight-moves.idle .fight-move` rule does not contain `opacity: 0.6`, contains `fight-wait`; `@keyframes fight-wait` exists; a `prefers-reduced-motion` block sets `.fight-moves.idle .fight-move` animation to none. And `.fight-top` rule contains `min-height: 100px`.
- [ ] **Step 2:** Run `test/fightui.test.js` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `fix(fight): the sheet loses its dead band; waiting moves are outlined, not khaki`.

### Task 5: The welcome bubble leaves when the page scrolls

**Files:**
- Modify: `src/ui/homebase.js` (`showWelcome` / `closeWelcome`, ~l.655–700)
- Test: `test/homebase.visits.test.js`

Decision: the bubble is `position: fixed` beside the hero cat's head; if the kid scrolls (e.g. taps "Where to") within its 4.5 s it floats over other buttons as ghost text. While it shows, a `scroll` listener on `document` (capture, passive) calls `closeWelcome()`; `closeWelcome()` removes the listener.

- [ ] **Step 1:** Test `it('the welcome bubble closes when the page scrolls')`: using the file's existing harness, show a welcome, assert `.visit-welcome` exists, `document.dispatchEvent(new Event('scroll'))`, assert it is gone; and that a second scroll after that does not throw.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run file → PASS.
- [ ] **Step 5:** Commit `fix(home): the visit welcome bubble leaves on scroll`.

### Task 6: Live check and full suite (parent session)

- [ ] Full suite + `npm run build`; flat-trace sha256 unchanged (`6b502ab6…54a7`).
- [ ] AFTER shots with `snaps-polish-home2/shoot/home2.mjs` and `fights/fights.mjs` (desk + pp), pairs into `snaps-polish-home2/pairs/`.
