# Den and Den shop: finding it, buying it, placing it (design)

Date 2026-11-22. Branch `den-ux-design`. Design only: no feature code in this branch.

## 1. Problems (owner, on a real pad)

1. The Den is hard to find and odd to reach.
2. The Den shop is buried inside the den walk.
3. Buying and placing are two separate steps, and placing is a per-spot dropdown.

What the code does today (read, not guessed):

| Fact | Where |
|---|---|
| Den is the 6th tile (last) of the Menu sheet, "My den / go now". Not on the home screen, not on Change place. Hidden while a room is pending. | `src/ui/homebase.js` `denTileHtml`, `renderMenu` |
| One more route: the "next thing" line can say "your cat X is at home" and goes to the den. | `src/ui/nextthing.js` (`'den'`), `homebase.js` `nextTap` |
| Both routes call `onVisitDen` = `beginDenWalk` = `startWalkWhenReady({ areaOverride: 'den' })`. A den visit is a full walk start (loads the den chunk, "Ready?" card). | `src/game/walk.js` |
| The shop is a HUD button `#btn-den-shop` ("🛋️ Den shop"), created in main.js start-up, shown only on den walks (`setActive`). It sits outside `#overlay` at z-index 11. | `src/ui/denshopview.js`, `src/style.css` ~2212 |
| Desktop: Esc, pause card, then the button; a hint line floats under the card. Pad: Start, pause card, d-pad to the button (gamepadnav `layerControls` adds the HUD button to the pause card's list). Touch: the button is on the HUD during the walk. | `denshopview.js` (hint), `src/gamepadnav.js` 49-59, `src/tv/padwords.js` `pad.den.hint` |
| Opening the shop calls `pause()` (the ⏸ action), hides the pause card, touch controls and chat wheel, and mounts a bottom sheet (right panel at 900 px+). Done / Esc closes and `resume()`s. | `denshopview.js` |
| Buy: "Get it for N?" confirm card, then `progression.buyDenItem(id)` (deducts points, pushes id to `den.owned`). Nothing appears in the room. Note says "Now pick a spot for it." | `denshopview.js` `askBuy`, `buy`; `progression.js` ~1681 |
| Place: 12 `<select>` rows ("Arrange your den") with owned items; a change calls `placeDenItem(spotId, itemId or null)` (moves the piece if it stood elsewhere) then `applyDenSpot` swaps the mesh live. TV mode swaps each select for a button that opens a list card (`src/tv/spotlist.js`). | `denshop.js`, `denshopview.js`, `game/denlive.js` |
| Spots are keyed by `DEN_SPOTS` ids (12), labels in `SPOT_LABEL` ("Back left corner", "By the clock", ...). Catalog is `DEN_ITEMS` (12 items, append-only). | `src/den.js`, `denshop.js` |
| Save: `state.den = { owned: [ids], placed: { spotId: itemId } }`, cleaned by `sanitizeDen` (unknown ids dropped, a placed item must be owned, one spot per item). | `src/progression.js` 885 |
| Start-up weight: `denshopview.js` is a STATIC import in main.js, so the shop code ships in the start-up chunk although only den walks use it. | `src/main.js` 63, 567 |
| Tests: `denshop.test.js` (render, spotChoices, changedSpots), `denshopview.test.js` (input guards, buy confirm), `denshop-pad.test.js` (TV list), `denlive.test.js`, `den.test.js`, `denfurniture.test.js`, plus `gamepadnav.test.js` / `backstack.test.js` / `padwords.test.js` mentions. | `test/` |

Why it feels odd: the den is a place you must start a whole walk to enter, the shop is a thing you can only reach while "paused" in it, buying shows nothing, and placing is a 12-row form of dropdowns that a pad cannot read at a glance.

## 2. Goals and non-goals

Goals: Den findable in one look from the home screen; shop reachable in two presses from home AND from inside the den without a pause card; buy offers "Place it now"; spot picking is a picture, not a form; identical in capability on touch, keyboard, pad and TV.

Non-goals: no new furniture, no new spots, no change to the room geometry, no save change, no economy change, no free-roam furniture dragging (spots stay fixed anchors), no change to what Start/Esc does in other walks.

## 3. Screen flows

### 3.1 Current

```
HOME (dressing room)
  [Explore] [Change place] [☰ Menu]
        |
        v
  MENU sheet: 5 tiles + "My den" tile (6th) + Sound & controls + For grown-ups
        |  tap My den ("go now")
        v
  den walk starts ("Getting ready", then Ready? card)
        |  walk...
        |  touch: tap HUD "🛋️ Den shop"
        |  keyboard: Esc -> pause card -> click "Den shop" (hint line says so)
        |  pad: Start -> pause card -> d-pad to HUD button -> A
        v
  DEN SHOP sheet (walk paused, room visible behind)
     [Shop: cards  Buy 45]  -> "Get it for 45?" -> Yes
        -> note "Now pick a spot for it"   (nothing visible in room yet)
     [Arrange: 12 rows, each a dropdown]  -> pick item per spot
        -> piece appears in room
     [Done] -> resume walk
```

### 3.2 Proposed

```
HOME (dressing room)
  [Explore] [🏠 My den] [Change place] [☰ Menu]      <- new home-base tile
        |                    |
        |                    +--> DEN SHEET on the home screen (no walk start)
        |                           [Shop] [My things] tabs, plan-view room, "Walk in" button
        |
  MENU: "My den" tile stays (same place, now opens the same Den sheet)
        |  inside the sheet: [🚶 Walk in]  -> den walk, as today

DEN WALK (inside)
  HUD: [🛋️ Den] button (top, always shown on den walks, also in the pause card list)
  pad: Y (Triangle) opens it in the den only (camera/photo stays on L3-free mapping, see 6)
        |
        v
  DEN PANEL docked (walk keeps running? NO: cat stands still, "engaged" off,
  same as today, but with no pause card behind it)

BOTH PLACES, same panel (one component, two mounts):

  Shop tab:  item cards -> [Buy 45]
       -> "Get it for 45?" [Yes] [Not now]            (existing confirm card)
       -> "Sunbeam Rug is yours!"  [📍 Place it now] [Later]
            Place it now -> PLACE MODE (below)
            Later        -> back to Shop tab, card says "✓ Yours · not placed"

  My things tab (and Place mode):
       plan-view room, 12 big spots, item "in hand"
       tap/A on a spot -> placed (live mesh swap if in the den); item leaves hand
       tap an occupied spot with nothing in hand -> "Pick up" (hand) / "Put away"
       [Done]
```

Rules that make it one flow:
- "Place it now" is the default focus after a buy (A twice = buy + place mode).
- Place mode always has an item "in hand"; Back/B/Esc drops it (piece stays owned, unplaced).
- Picking up an already placed piece puts it in hand and highlights its old spot; choosing another spot moves it (this is exactly `placeDenItem`'s existing move semantics).
- "Put away" (clear a spot) is one button in the hand bar, `placeDenItem(spotId, null)`.

## 4. Where the Den lives (problems 1 and 2)

Recommendation: a Den button in the home screen's main row, plus the same Den sheet from the Menu tile.

- Home screen: add a third big button "🏠 My den" beside Explore and Change place (`startRowHtml` / dressing room start row). Shown for everyone, hidden only while a room is pending (as the tile is today). It opens the Den sheet, NOT a walk. The sheet is where the shop is, so the shop is two presses from home (Den, then Shop tab, which is the default tab when she owns nothing placed).
- The Menu tile stays (muscle memory, and "next thing" line) but its sub-label changes from "go now" to a count ("3 things placed"), and it opens the sheet.
- "Walk in" is a button in the sheet and the sheet's primary action once something is placed. This keeps the old "go now" meaning one tap away.
- Inside the den: the HUD button stays, relabelled "🛋️ Den", and the hint line and the `layerControls` pause-card special case go away because the pause card is no longer the route. Pad: Triangle/Y opens it on a den walk only (Y is "photo mode" elsewhere; see risks), plus the HUD button remains reachable by touch.
- The shop never pauses via the pause card: opening the panel calls the existing `pause()` action internally (so `player.engaged` goes false and the sheet owns input) but the pause card is not shown (CSS rule exists: `body.den-shop-open #overlay { display:none }`). Closing resumes. Net effect for the player: "I pressed Den, a panel opened, I pressed Done, I walk again."

Not recommended: putting the shop on the Change place world map (the den is not a place on the map; world-map step 3 gateways is separate work), or a second HUD-only shop entry that bypasses the sheet.

## 5. Spot picking model

Options:

| Option | Touch | Pad / keyboard | TV (10 ft) | Verdict |
|---|---|---|---|---|
| A. Per-spot dropdown (today) | small targets, native pickers | blind cycling or list card per spot, 12 lists | unreadable | reject |
| B. Item list then name-labelled spot list | ok | 2 lists, 12 rows of text | ok | fallback only |
| C. Big-icon spot grid (12 buttons, text labels) | good | spatial nav works (gamepadnav is geometric) | good | good |
| D. Plan-view room map: the 12 spots drawn where they are in the room, as a 5x5 schematic | best: "point at the room" | spatial nav works on the same buttons | good, large | **recommended** |
| E. Point in the live 3D room (raycast, cursor) | needs picking, occlusion, camera wedge limits; can hide spots behind furniture | needs a virtual cursor for pad | poor | reject for v1 |

Recommendation: D, built as a grid of 12 real `<button>`s positioned on a 5x5 schematic. It IS option C for the controllers (plain buttons, so the existing geometric pad navigation and Tab order work with no new nav code) and it IS "pointing at the room" for touch. Layout (cols = x, rows = z; the back wall, with the window, is the top):

```
        col0        col1       col2       col3        col4
row0   [corner-a]  [nook]    [window]   [alcove]   [corner-b]      back wall (window)
row1      .          .         .      [east-mid]       .
row2  [west-wall]    .      [center]      .        [shelf]
row3      .          .      [rug-spot]    .            .
row4  [corner-c]     .         .          .        [corner-d]      open front (camera side)
```

Why 5x5 and not true x,z: true positions put rug-spot/center and the three back-wall spots only ~2 to 3.5 units apart, about 40 px on a 330 px phone map, under the 44 px touch minimum. The schematic keeps relative order, gives every cell at least 60 px on a 330 px sheet, and is checked by a test against `DEN_SPOTS` (a unit test rejects a layout where the order of x or z between any two spots flips, and where a spot id has no cell, so a future 13th spot cannot be forgotten).

Each spot button shows: the placed piece's emoji/icon (small drawn set keyed by `DEN_ITEMS` id, ~12 glyphs, in the lazy chunk), or a dashed "+" when empty, plus a short label from `SPOT_LABEL` shown under the icon on wide screens and as `aria-label` always. Hand state: empty spots pulse; the spot an item came from shows a ghost.

Phone fit: the plan fills the top of the sheet (about 320 x 250 px incl. labels), the item shelf (owned, unplaced pieces as big chips) is a single horizontal row under it. In the den the sheet is the existing 52 dvh bottom sheet, room visible above; at 900 px+ the right-hand 380 px panel.

## 6. Per-input behaviour

| Action | Touch | Keyboard | Pad (Standard layout) | TV mode |
|---|---|---|---|---|
| Find the Den (home) | tap "🏠 My den" | Tab to the button, Enter (no new global key) | d-pad to the button, A | same; glyph hints from `padHtml` |
| Open shop inside the den | tap "🛋️ Den" HUD button | Tab to the HUD button, Enter (no new key; Esc still pauses as today) | **Y/Triangle** on a den walk only | same; `pad.den.hint` becomes "Press ⟦photo⟧ for the 🛋️ Den" via padwords |
| Switch Shop / My things tab | tap tab | Left/Right on tab strip, Tab | L1/R1 (tab strip is a `role=tablist`), or d-pad | L1/R1 glyphs |
| Buy | tap Buy, then Yes | Enter, Enter | A, A | A, A (existing confirm card, already pad-ready) |
| "Place it now" | tap | Enter (default focus) | A (default focus) | A |
| Pick spot | tap the spot | arrows (spatial) + Enter | d-pad/left stick + A | same, larger scale via `html.tv` |
| Pick up / move a placed piece | tap it (goes in hand), tap target | Enter on it, arrows, Enter | A on it, d-pad, A | same |
| Put away | tap "Put away" in hand bar | Enter on it | X/Square on a spot | X glyph hint |
| Cancel placing (keep piece owned) | tap "Later"/outside | Esc | B | B (`tvHooks.back`, already used by spotlist) |
| Close panel / walk on | Done | Esc or Done | B on the tabs level, or Start | B |

Pad rules that must hold (from the gamepad-menus design): the panel carries `data-pad-layer`; first focus uses `data-pad-default`; B closes one layer at a time (confirm card, then place mode, then panel) using the same `walkBackAction` ladder (`shopAsk` then `shop`; add a `placing` step); Start still means pause in the walk, and with the panel open it closes the panel (as B). Y inside the den: today Y is `camera` (photo mode); on a den walk with the panel closed Y opens the Den panel and photo mode stays on the touch and keyboard photo buttons only. This is an owner decision (question 3).

TV mode: the existing `spotlist.js` list card and `padSpots` select-hiding branch are deleted, not extended, because the spot map is plain buttons that already work with spatial pad navigation; `tv.css` only needs sizes for `.dn-spot` (min 96 px at 1080p safe area).

## 7. Save format impact

None. `state.den = { owned, placed }`, `DEN_ITEMS` ids, `DEN_SPOTS` ids, `sanitizeDen` and the cloud sanitiser are untouched. The "in hand" item and the current tab are UI state, never saved. A bought-but-unplaced piece is already representable (`owned` without a `placed` entry) and survives across devices and versions as today. Old saves, new saves and cloud saves behave identically, and an old build reading a save from a new build sees nothing new. Guard: a test that `JSON.stringify(state.den)` after a buy + place-now + move + put-away sequence has exactly the same two keys and only valid ids.

If question 5 is accepted (remember last tab), it goes in `localStorage` device settings, not the save.

Both word sets: the den furniture names and spot labels are not series words, so 'on' and the everyday 'off' set carry identical den text. New strings (tab names, "Place it now", "Put away", hand-bar prompts, pad glyph lines) go in a small word table in the lazy den chunk (`src/ui/denwords.js`, both sets present and compared in a test) and in `src/tv/padwords.js` for pad lines, not inline in UI code. The existing inline English in `denshop.js` / `denshopview.js` moves there as part of the rewrite.

## 8. Files to touch

New (all in the lazy den chunk; none imported by start-up modules):
- `src/ui/denpanel.js`: the one panel (tabs, shop cards, plan-view, hand bar, "Place it now"), pure render + small controller. Replaces the render half of `denshop.js` and the overlay half of `denshopview.js`.
- `src/ui/denplan.js`: pure: the 5x5 schematic layout table, `cellFor(spotId)`, order-check helper, icon table.
- `src/ui/denwords.js`: both word sets for the panel.
- `src/ui/denpanel.css` (or a block in `style.css` if a separate file cannot be lazy, see budgets).

Changed:
- `src/main.js`: replace the static `createDenShopView` import with a lazy `import('./ui/denpanel.js')`; keep a tiny stub (`open()`, `isOpen`, `isAsking`, `notNow()`, `close()`) so the backstack, gamepad and walk.js call sites are unchanged until the chunk loads. Wire `onOpenDen` for the home button.
- `src/ui/homebase.js`: a "🏠 My den" button in `startRowHtml`; `denTileHtml` opens the sheet and shows a count; new `onOpenDen` option; `nextTap('den')` stays a walk-in. Hidden when `roomState`.
- `src/ui/dressingroom.js`: the start row (layout of the new third button, left/right order for pad focus).
- `src/game/walk.js`: `denShop.setActive(isDen)` stays; add `denShop.openFromHome` path only if the home sheet reuses the live apply (it does not need a session: placement on the home screen only calls `progression`, the den meshes are rebuilt from `den.placed` at the next walk start).
- `src/gamepad.js` / `src/gamepadinput.js`: on a den walk, Y opens the panel (guarded, one `if`), still `camera` elsewhere.
- `src/gamepadnav.js`: delete the `btn-den-shop` special case in `layerControls`.
- `src/ui/backstack.js`: add `placing` between `shopAsk` and `shop` in `walkBackAction` / `padBackAction`; the home-screen sheet uses the existing sheet back chain (`backTargetFor`).
- `src/tv/padwords.js`: new pad lines; remove `pad.spot.*` and `pad.list.close` if nothing else uses them. `src/tv/spotlist.js` deleted if the den was its only caller (check first).
- `src/style.css`: remove `.den-shop-hint` and old `.ds-*` once replaced; keep `.hud-den-shop` for the relabelled button.
- Untouched: `src/den.js`, `src/progression.js`, `src/game/denlive.js` (reused as is), all den world code.

## 9. Budgets

- Start-up chunk: 709.5 of 720 kB gzipped (ceiling never raised). Target change: **negative**. Moving `denshop.js` (~7 kB raw) and `denshopview.js` (~9 kB raw) out of main.js into a lazy chunk saves roughly 3 to 4 kB gzipped. New start-up cost is limited to: the home button markup (about 0.2 kB), the `onOpenDen` wiring and the stub (about 0.5 kB). Stop and re-plan if start-up goes above 709.5.
- New chunk `den-panel` (panel + plan + words + icons): aim under 14 kB gzipped; loaded on first tap of My den or at den-walk start (the den area chunk is already fetched then, so add the panel to the same prefetch). Listed in `precache.json` automatically (every file under `assets/`), so it works offline.
- Fair chunk (96.1 / 100) and triangle budgets: not touched. The plan view is DOM, not WebGL; it adds no triangles and no draw calls. In the den the live mesh swap is the existing `applyDenSpot`.
- Save size: unchanged (cat-login M2 guard stays: under 150 kB).

## 10. Test plan

Pure (fast): `denplan.test.js` (every `DEN_SPOTS` id has exactly one cell; no two spots share a cell; relative x and z order preserved; cell centre spacing at least 44 px at 320 px width); `denwords.test.js` (both sets, no missing ids, no blocklisted words); `denpanel.test.js` render (tabs, hand state, ids escaped, hostile save input dropped as in `denshop.test.js`).

Behaviour (stub DOM as in `denshopview.test.js`): buy then "Place it now" leads to place mode with the item in hand; place sets `den.placed`, calls `applyDenSpot` once (den walk) or not at all (home); "Later" leaves owned, unplaced; move updates two spots; put away clears one; Esc/B ladder (confirm, place mode, panel); points never go negative on a double tap; the guards from today (canvas click swallow, pointer-lock, Arrow/Space stop) carried over.

Pad: extend `gamepadnav.test.js` (spot buttons reachable by geometry in all four directions from every cell; no dead end; default focus), `gamepad-cards.test.js` (panel layer), `backstack.test.js` (`placing` step), `padwords.test.js` (new lines exist and have glyph slots), `tvcss.test.js` / `tvclutter.test.js` (min target sizes under `html.tv`).

Save: round-trip a save through `sanitizeDen` after each action; an old fixture with `owned` but empty `placed` loads and shows the piece in the shelf. `home` tests: the new button exists, is hidden with `roomState`, opens the sheet without calling `onVisitDen`.

Build check: start-up gzip not above 709.5 kB, the panel is not statically imported (`tvchunk.test.js`-style test), precache lists it.

Owner hand checks (agents cannot do these): DualSense on the Mac (Y in the den, spatial moves, B ladder), TV glyph sizes at 10 ft, iPhone touch target feel.

## 11. ASCII wireframes

Home screen (phone, portrait):

```
+--------------------------------+
| 🐾 Whisker Walk 2   🐾 120  🏆 |  ☰ Menu
|                                |
|          (your cat)            |
|                                |
|  [      ▶  Explore        ]    |
|  [ 🏠 My den ] [ 🗺 Change place ]   <- new
+--------------------------------+
```

Den sheet from home, Shop tab:

```
+--------------------------------+
| 🏠 My den        🐾 120   [x]  |
| [ Shop ]  My things   3 placed |
|--------------------------------|
| Sunbeam Rug        [Buy 30 🐾] |
| Deluxe Cat Tree    [ 60 🐾 ]   |  (locked: dim)
| Bubbling Fish Tank ✓ Yours     |
|                  not placed    |
|                                |
|              [ 🚶 Walk in ]     |
+--------------------------------+
```

After buy:

```
+--------------------------------+
|  Bubbling Fish Tank is yours!  |
|  [ 📍 Place it now ]  [ Later ]|
+--------------------------------+
```

Place mode (My things / after Place it now), in hand: Fish Tank:

```
+----------------------------------------+
| In hand: 🐠 Bubbling Fish Tank  [Later]|
|        back wall (window)              |
|  [🪴] [ + ] [🪟 ] [ + ] [ + ]          |
|          .   .   [🛋] .   .            |
|  [ + ]   .   [🔥] .   [📺]             |
|          .   [🟫 rug] .   .            |
|  [ + ]   .    .    .   [ + ]           |
|        open front (camera)             |
| Tap or press A on a spot to put it     |
| [ Put away ]            [ Done ]       |
+----------------------------------------+
```

In the den, panel docked (room visible above):

```
+--------------------------------+
|     (3D room, cat standing)    |
|        [new tank appears]      |
|--------------------------------|
| plan view / shop (52 dvh)      |
+--------------------------------+
```

Wide screen (900 px+): same panel as the existing 380 px right column, room full height on the left.

## 12. Risks

| Risk | Mitigation |
|---|---|
| Y/Triangle already means photo mode in the walk; stealing it in the den surprises a pad player | Den-only, and photo stays on touch/keyboard; or choose a different pad entry (question 3). Hint line shows the glyph on first den visit. |
| Home sheet and in-den panel diverge | One component, two mounts; the only difference is `applyDenSpot` (no session on home). Shared tests. |
| Schematic 5x5 lies about true positions | Order-preserving test; the live room is visible behind the panel in the den; labels from `SPOT_LABEL`. |
| A 13th spot later has no cell | Test fails loudly (every `DEN_SPOTS` id needs a cell). |
| Lazy chunk not loaded offline or slow when she taps Den | Prefetched with the den area; the stub shows "Getting ready" like Explore does; precache covers it. |
| Pause-card removal breaks other pause-card users | `pause()` stays the same action; only the card is hidden by existing CSS. Backstack ladder test covers it. |
| Home-screen placement while a cat sits on a perch in a live den | Not possible: no den session on home, and the next walk rebuilds from `den.placed`. |
| Double tap buys twice | `buyDenItem` already refuses owned ids; keep the confirm card and disable Buy after the first. |
| TV scale makes 5x5 plan overflow | Plan sized by container query; TV min cell 96 px at 1080p checked in `tvcss.test.js`. |
| Family home / Old House worlds may want their own furniture UI | The panel takes `items`, `spots`, layout as arguments (as `renderDenShopHtml` does today), so a later world can pass its own plan. |

## 13. Open questions (recommended answers)

1. Where does the home-screen Den button go: a third main-row button, or a tile inside the Menu only? **Recommend the main-row button** (plus keep the Menu tile). It answers "hard to find" directly; the Menu stays as the second route.
2. Should the home sheet let her place furniture without walking in? **Yes.** Placement only edits the save; the den shows it at the next walk. This is what makes "buy, place, done" one calm moment.
3. Pad entry inside the den: take Y/Triangle (den walks only), or keep Start then a button? **Y in the den only**, with a one-time hint, photo mode staying on its other inputs. If the owner dislikes losing photo on the pad in the den, fall back to a d-pad-up shortcut.
4. Spot picking: plan-view 5x5 schematic (recommended) or a plain grid of 12 labelled buttons? **Plan-view**; the plain grid is the automatic fallback inside the same component if the owner prefers text.
5. Remember the last tab (Shop vs My things) per device? **Yes, in device settings**, default Shop when nothing is owned, My things otherwise. Never in the save.
6. When she has no points for anything, show the shop locked or hide it? **Show it** with prices and "need N more", as today; hiding it makes the room look empty and the den look pointless.

## 14. Out of scope but adjacent

World-map gateways (step 3) and teleport doors might later make the den a mapped place; this design does not block that, since the Den sheet and `onVisitDen` stay separate. The family-home world can reuse `denpanel.js` with its own spot table.
