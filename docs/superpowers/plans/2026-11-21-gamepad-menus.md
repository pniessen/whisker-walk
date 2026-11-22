# Controller for Menus and the Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A DualSense (standard-mapping pad) moves focus through home base, cards, the pause card and the world map, presses controls, and goes back.

**Architecture:** A pure navigation core (direction pick, repeat timing, lost-focus recovery) plus a thin DOM navigator (`src/gamepadnav.js`) that the existing `createGamepad` poller hands the pad to whenever no walk owns it. Presses reuse the existing paths (`click()`, Enter on SVG places, `homebase.back()` through the back stack).

**Tech Stack:** vanilla JS, vite, vitest (fake-DOM style as in `test/touchui-controls.test.js`).

**Spec:** `docs/superpowers/specs/2026-11-21-gamepad-menus-design.md`

## Global Constraints

- Work in worktree `.worktrees/gamepad-menus` (branch `gamepad-menus`); commit there only; do not merge or push main.
- Start-up ceiling 720 kB gzipped (last measured 698.2 kB with the walk layer).
- Touch, mouse and keyboard behaviour must not change; the focus ring appears only after pad input (`body.pad-focus`).
- Text-like inputs are skipped by the mover; no on-screen keyboard; no drag gestures; no TV layout.
- Pad Back never fakes an Escape key; in a walk B stays Meow.
- Commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

- A card re-renders (`homebase.render()`) while a pad-focused element has no id: focus must land on the nearest remaining control, not the first.
- A button held while the walk starts or pauses: it must not press anything in the other mode until released.
- A pressed within `CONFIRM_DELAY_MS` of the confirm card opening: shows a wait state, then works; never silently ignored, never double-fires.
- A card stacked on a card (news over home, confirm over a sheet): focus and B only affect the top layer.
- A map place off-screen: hopping to it recentres the view even when `:focus-visible` does not match.

---

## File structure

- Create `src/gamepadnavcore.js` — pure: `pickNext`, `nearestTo`, `repeatGate`.
- Create `src/gamepadnav.js` — DOM glue: layers, candidates, press, sliders/selects, scroll, ring class, `padBack`.
- Modify `src/gamepad.js`, `src/main.js` — mode owner, hand the pad to the navigator.
- Modify `src/ui/mappan.js` — add `api.pan`, `api.zoom`.
- Modify `src/ui/homebase.js` (+ card roots in `colonypanel.js`, `clanpicker.js`, `confirmcard.js`, `visitcelebration.js`, `dressingroomview.js` as found) — `data-pad-layer` on each card root.
- Modify `src/style.css` — `.pad-focus` ring.
- Tests: `test/gamepadnavcore.test.js`, `test/gamepadnav.test.js`, `test/mappan-api.test.js`.

### Task 1: Base branch

**Files:** none.

- [ ] **Step 1:** In `.worktrees/gamepad-menus`, run `git merge gamepad` (branch-local; brings `src/gamepad.js`, `src/gamepadinput.js`).
- [ ] **Step 2:** Run `npm test`. Expected: all pass. Do not continue if not.

### Task 2: Navigation core (pure)

**Files:** Create `src/gamepadnavcore.js`; Test `test/gamepadnavcore.test.js`.

**Interfaces:**
- Produces: `pickNext(from: Rect, candidates: {id, rect: Rect}[], dir: 'up'|'down'|'left'|'right') -> id|null`; `nearestTo(point: {x,y}, candidates) -> id|null`; `repeatGate(state, now, held: boolean, {first=400, every=140}) -> {fire: boolean, state}`. `Rect = {x,y,w,h}`.

- [ ] **Step 1: Tests** (fake rects): `pickNext` right from a button picks the nearest to its right and ignores ones on its left; off-axis penalty: a far-aligned control beats a near-but-offset one (`distance + 2×off-axis`); returns null at an edge (no wrap); `nearestTo` picks by centre distance; `repeatGate` fires at once on press, not again before `first` ms, then every `every` ms, and resets on release.
- [ ] **Step 2:** Run `npx vitest run test/gamepadnavcore.test.js`. Expected: FAIL (module missing).
- [ ] **Step 3:** Implement the three functions as specified; half-plane test uses rect centres.
- [ ] **Step 4:** Run tests. Expected: PASS.
- [ ] **Step 5:** Commit `feat: pad navigation core`.

### Task 3: Layers and candidates

**Files:** Create `src/gamepadnav.js` (first part); Modify card roots listed above; Test `test/gamepadnav.test.js`.

**Interfaces:**
- Consumes: Task 2 functions.
- Produces: `topLayer(doc) -> Element` (last `[data-pad-layer]` in DOM order that is visible, else `#overlay` when it holds a card, else the home root); `candidates(layer) -> Element[]` (visible, enabled button / a[href] / [role=button] / [tabindex>=0] / summary / checkbox / radio / range / select; excludes text-like inputs, textarea, `.hidden`, `[inert]`, `disabled`).

- [ ] **Step 1: Tests**: two stacked layers → `topLayer` returns the later; a hidden later layer is skipped; `candidates` excludes `input[type=text]`, `.hidden` and disabled buttons, includes an SVG `<g role=button tabindex=0>`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement both. Add `data-pad-layer` to every card root in `homebase.js` (news, notice, nearby, visit, wardrobe, sheets), `confirmcard.js`, `clanpicker.js`, `visitcelebration.js`, and the pause card markup in `main.js`'s `pauseCardFor` caller; grep each `*El` card creation (`homebase.js` ~963, 994, 1067, 1215, 1308).
- [ ] **Step 4:** Run → PASS; run `npm test` for regressions.
- [ ] **Step 5:** Commit `feat: pad navigator layers and candidates`.

### Task 4: Move, press, sliders, selects, scroll

**Files:** Modify `src/gamepadnav.js`; Test `test/gamepadnav.test.js`.

**Interfaces:**
- Consumes: Tasks 2–3.
- Produces: `createNav({doc, back: () => boolean, onActive}) -> {step(dirOrNull, now), press(), alt(dir), enter()}`; `activate(el)`; `nudgeRange(el, dir)`; `cycleSelect(el)`.

- [ ] **Step 1: Tests**: `step('right')` focuses the next candidate in the top layer only (not under it); when `document.activeElement` is body (re-render) `step` focuses `nearestTo` the remembered last rect centre, not candidate 0; `press` on an HTML button calls `click()` once; on an SVG `role=button` element dispatches keydown+keyup Enter (spy) and no `click()`; on a checkbox toggles via click; `alt('right')` on a range raises value by one step and dispatches `input`; `cycleSelect` picks the next option and dispatches `change`; focusing an element calls `scrollIntoView({block:'nearest',inline:'nearest'})`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement `createNav` and the helpers; remember last focused rect before every `step`; candidates computed lazily per call and invalidated by a `MutationObserver` on the root (no per-frame layout reads).
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat: pad focus move, press, slider and select handling`.

### Task 5: Mode owner, Back, ring, handoff

**Files:** Modify `src/gamepad.js`, `src/main.js`, `src/style.css`; Test `test/gamepadnav.test.js`.

**Interfaces:**
- Consumes: `createNav`; existing `createGamepad({... getEngaged, isFighting, canResume, onResume ...})`, `homebase.back()`, `walkBack()` (`main.js:870`), `stack.sync()` returned by `attachBackStack`.
- Produces: `createGamepad({..., nav, menuOwns: () => boolean})` — when `menuOwns()` is true the poll feeds D-pad / left stick (>0.5, `repeatGate`), A→`nav.press()`, B→`padBack()`, Start→pause toggle, right stick→`nav.scroll(dx,dy)` and L1/R1→`nav.zoom(dir)`; `padBack() = homebase.back() || walkBack()` then `stack.sync()`.

- [ ] **Step 1: Tests** (fake `getGamepads`): menu mode A calls `nav.press` once per press, not per frame; owner flips to walk mid-hold: the still-held button does nothing until released; fight sheet (`isFighting`) keeps the walk owner; `walkingOn` makes the pad do nothing; B in menu mode calls `padBack` and never dispatches an Escape event; `body.pad-focus` added on first pad input and removed on `pointerdown` / `keydown` / `touchstart`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement `menuOwns = !engaged && !fighting && !walkingOn`; wire in `main.js`; add `.pad-focus :focus` outline rules in `style.css` (scoped under `.pad-focus`, override `.tm-region:focus:not(:focus-visible)`).
- [ ] **Step 4:** Run `npm test` → PASS.
- [ ] **Step 5:** Commit `feat: pad owns menus when no walk does`.

### Task 6: Confirm card and map

**Files:** Modify `src/ui/mappan.js`, `src/gamepadnav.js`; Test `test/mappan-api.test.js`, `test/gamepadnav.test.js`.

**Interfaces:**
- Produces: `attachMapPan(...)` api gains `pan(dxPx, dyPx)` and `zoom(dir: 'in'|'out')`; `nav` map hooks `hopPlace(dir)`, using `[data-dr-map-place]` rects and recentring through `api.pan` when the target is off-screen.

- [ ] **Step 1: Tests**: `api.pan(40, 0)` shifts `api.view.x` by the scaled amount and is clamped to the world; `api.zoom('in')` equals the existing `data-wm-zoom="in"` result; hopping to an off-screen place recentres even when `matches(':focus-visible')` is false; A inside `CONFIRM_DELAY_MS` on the confirm card shows a "wait" state and a second A after the delay confirms exactly once.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement; share `change(...)` and `zoomView(...)` already in `mappan.js`; wait state is a short class on the card, not a toast.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat: pad map hop, pan, zoom and confirm wait`.

### Task 7: Screen pass and handover

**Files:** Modify screens as found; Create `docs/superpowers/specs/2026-11-21-gamepad-menus-handcheck.md`.

- [ ] **Step 1:** Run `npm run dev`, load each screen with a fake pad through the Gamepad API test hook used in `test/gamepadnav.test.js` (or the browser pane), and list controls the mover cannot reach (carousel strips, low-opacity `.hb-grownups-door`, the cat stage). Fix the cheap ones with `tabindex` / `data-pad-layer`; list the rest.
- [ ] **Step 2:** Run `npm test` and `npm run build`; record the gzipped start-up size (must be ≤ 720 kB).
- [ ] **Step 3:** Write the hand-check file from the spec's list with the unreachable-controls list.
- [ ] **Step 4:** Commit `docs: pad menus hand-check`.
