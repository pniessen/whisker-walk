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

## Design
- **Mode owner.** `gamepad.js` already polls. Add a mode: `walk` when a walk is engaged, `menu` otherwise. In `menu` mode the walk mapping is off and the new navigator handles input.
- **Navigator (`src/gamepadnav.js`, pure core + thin DOM glue).**
  - Candidates: visible, enabled elements matching button, a[href], [role=button], [tabindex>=0], summary, input type checkbox/radio/range, select. Skip text/search/tel/email/number/textarea inputs and anything inside `[inert]` or hidden ancestors.
  - Scope: the topmost modal layer only (`aria-modal`, the top card, or the pause overlay); otherwise the home-base root. Focus never escapes a card.
  - Direction pick: from the focused element's rect centre, choose the candidate in the pushed half-plane minimising `distance + 2 × off-axis offset`; wrap does not happen. Pure function, unit-tested with fake rects.
  - Input: D-pad, or left stick past 0.5, with a first-repeat delay and slower auto-repeat.
  - A = `click()` (or toggle for checkbox/radio); on a range slider, left/right changes the value by one step instead of moving focus; on a select, A opens it and the browser takes over.
  - B = the same Back action as Escape (`backstack`), Start = pause toggle as in the walk.
  - Right stick: scrolls the nearest scrollable ancestor; over the map it pans the view.
  - L1/R1 or triggers: map zoom through the map's own zoom buttons.
  - Focus ring: class `pad-focus` on body, added on the first pad input and removed on pointerdown/keydown/touchstart; styled like existing `:focus-visible` outlines.
- **Map.** Focusing a place already recentres the view; the left stick/D-pad hops by direction among `[data-dr-map-place]`, the right stick pans through the map's existing pan API.
- **Entry focus.** When a card or screen opens in pad mode and nothing is focused, focus its first candidate (a card's default button where one exists, like the news card's OK).
- **Leaving menu mode.** A walk starting hands the pad back to the walk layer; pause hands it to the navigator.

## Left to the builder
- Exact repeat timings and distance weighting (tune by hand with a pad).
- Which screens need a manual default focus or tuning after a pass through each home-base card, pause, map, dressing room, cat builder, den shop.
- Whether the module is lazily loaded.

## Check by hand (owner, real DualSense)
Every home-base card; settings sliders and switches; map hop/pan/zoom; dressing room pick; Back from nested cards; pause/resume; mouse and touch look unchanged (no ring).
