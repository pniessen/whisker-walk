# Controller for menus and the map — design

Status: draft for owner approval (2026-11-21). Builds on the walk-only controller layer (branch `gamepad`, `src/gamepadinput.js`, `src/gamepad.js`).

## Intent
Someone playing on a laptop with a DualSense (standard-mapping pad) can get through everything outside the walk — home base, cards, pause, the world map, dressing room, cat builder, shops — without putting the pad down. Later, TV mode (no mouse or keyboard nearby) builds on the same layer.

## Goals
- A pad moves focus between on-screen controls, presses them, and goes back.
- The world map: pick a place by hopping between places; pan freely with the right stick; zoom with triggers or bumpers.
- Same pairing as the walk: left stick/D-pad = move (focus), right stick = look around (scroll, pan).
- Works on screens added later with no per-screen code.

## Non-goals
- TV mode layout, font scale, safe margins (later).
- On-screen keyboard. Text boxes (friend code, cat name, redeem code) are skipped by the mover; the laptop keyboard types in them.
- Dragging gestures (the dressing room and cat builder use pick-by-press only).
- Touch or mouse behaviour changes of any kind.

## Anti-goals (a failure even if it works)
- A visible focus ring for mouse or touch players. The ring shows only after the pad has been used, and hides again on mouse or touch input.
- Pad input leaking into a walk, a fight prompt, or the chat wheel.
- Double handling: a press must not both click a control and fire a walk action.

## Constraints
- Start-up ceiling 720 kB; keep the module small and in the main chunk only if tiny, otherwise lazy.
- Feed the existing paths: `backstack.js` for Back, `.click()` for presses, existing focus handlers (the map already centres on focused places, `mappan.js` onFocusIn).
- Walk and menu modes must never both read the pad: one owner at a time (see Design).

## Approaches considered
1. **Generic focus mover (chosen).** One module moves focus to the nearest focusable control in the pushed direction; A clicks; B goes back. Cheap, works on future screens; "nearest" is sometimes wrong, so a few screens get small hand tuning.
2. Per-screen pad maps: precise but touches ~35 files and every new screen. Worth it only for TV polish.
3. Keyboard bridge (fake Tab/Enter/Escape): tiny, but Tab order is linear, so maps and grids feel bad. Stopgap only.

## Design (revised after an adversarial review against the code, 2026-11-21)
- **Mode owner, by state.** `gamepad.js` already polls. The walk layer owns the pad whenever a walk is engaged, **and** during a clan-fight sheet (fight keeps the walk owner). Everything else is the navigator's: home base, pause card, Ready? card. During the "Off to…" crossing (`session.walkingOn`) the pad does nothing (Back is already null there). A button held across a mode switch is ignored until released. The chat wheel and the walk's zoom/HUD buttons are out of scope.
- **Navigator (`src/gamepadnav.js`, pure core + thin DOM glue).**
  - *Layers.* Only `clanpicker` and `confirmcard` mark `aria-modal`; most cards are unmarked and nothing uses `inert`. So every card root gets `data-pad-layer`, and the top layer is the last one in DOM order; the pause card (`#overlay`) and home base root are the fallbacks. Focus never leaves the top layer.
  - *Candidates.* Visible, enabled: button, a[href], [role=button] (including SVG places), [tabindex>=0], summary, checkbox/radio/range, select. Skip text-like inputs and `.hidden`. Built lazily on each press and refreshed by a MutationObserver, never per frame.
  - *Direction pick.* From the focused element's rect centre, the candidate in the pushed half-plane minimising `distance + 2 × off-axis`; no wrap. Pure and unit-tested with fake rects.
  - *Lost focus.* Re-renders (`homebase.render()`, roster polls, settings changes) rebuild the DOM, so a focused element without an id vanishes. When focus falls to `body`, re-pick the candidate nearest the last known rect centre — never reset to the first.
  - *Input.* D-pad or left stick past 0.5, first-repeat delay then slower repeat.
  - *A (press).* HTML elements: `click()`. SVG/role=button elements (map places have no `.click()`; the real handler is a keydown for Enter/Space): dispatch Enter keydown+keyup (as `dressingroomview.js` expects), verified on a place. On the confirm card the existing `CONFIRM_DELAY_MS` deliberate-tap rule applies to the pad too, so an A press inside the delay shows a short "wait…" state instead of failing silently.
  - *Sliders, selects.* Range: left/right sets the value by one step **and dispatches `input`** (the fill var listens to it). Select: A cycles to the next option and dispatches `change`; no native list opens.
  - *Scrolling.* A newly focused element is scrolled into view (carousels such as `.dr-strip`, scrollable cards); the right stick scrolls the nearest scrollable ancestor.
  - *B (back).* One function `padBack()` = `homebase.back() || walkBack()`, then `stack.sync()`. It never fakes Escape (a synthetic Escape would also close the den-shop sheet and hit bubbling card handlers) and in a walk B stays Meow, not Pause.
  - *Start.* Pause toggle as in the walk layer.
  - *Focus ring.* `body.pad-focus` is added on the first pad input and removed on pointerdown/keydown/touchstart. Its rules are scoped under `.pad-focus` (a new ring, not edits to the ten-plus per-component `:focus-visible` rules; `.tm-region:focus:not(:focus-visible)` is overridden there).
- **Map.** Add `api.pan(dxPx, dyPx)` and `api.zoom(dir)` to `attachMapPan` (it returns only `{view, detach}` today). The navigator recentres on the focused place itself through that api (the existing `onFocusIn` recentre only runs when `:focus-visible` matches, which a scripted `focus()` often fails). Left stick/D-pad hops among `[data-dr-map-place]`; right stick pans; L1/R1 zoom.
- **Dragging screens.** The cat-stage canvas (`catstage.js`) uses pointer drag: the pad only picks items, and turning the cat is out of scope (checked by the builder, listed below).
- **Entry focus.** On opening a card or screen in pad mode with nothing focused, focus its default button (e.g. the news card's OK), else the first candidate.
- **Testing.** The glue takes injected `getGamepads` and `document` (as `createGamepad` already does); unit tests cover the direction pick, lost-focus recovery, the A press split (HTML vs SVG), slider/select behaviour, `padBack` and the handoff table.

## Left to the builder
- Exact repeat timings and distance weighting (tune by hand with a pad).
- Per-screen tuning after a pass through each home-base card, pause, map, dressing room, cat builder, den shop (including low-opacity targets such as `.hb-grownups-door`).
- Whether `homebase.js`'s `enterStarts` keydown handling reacts to a pad-focused element, and Safari/WKWebView focus behaviour: both need a check on a real device.
- Whether the module is lazily loaded.

## Check by hand (owner, real DualSense)
Every home-base card; settings sliders, switches and dropdowns; map hop/pan/zoom; dressing room pick; Back from nested cards; confirm card Yes after its delay; pause/resume; mouse and touch look unchanged (no ring).
