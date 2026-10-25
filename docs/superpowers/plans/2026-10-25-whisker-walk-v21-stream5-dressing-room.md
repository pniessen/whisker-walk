# Whisker Walk v21 Stream 5 — The Dressing Room Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the home screen's Cats and Accessories tabs with "the dressing room": a live, spinnable hero cat with a portrait strip, accessory slots beside it, destination cards with pictures, a quiet bottom row for everything else, and a phone layout with the start button pinned to the bottom. The den shop moves inside the den.

**Architecture:** Everything new is built in new modules first, behind the existing screen, and checked in its own `verify-dressingroom.html` harness: a pure, DOM-free model + renderer (`src/ui/dressingroom.js`), pure spin math (`src/ui/spin.js`), a THREE stage that owns one long-lived canvas (`src/ui/catstage.js`), and a DOM controller (`src/ui/dressingroomview.js`). `homebase.js` keeps all its state, panels and handlers; at cutover it swaps its top bar, tab bar and Cats/Accessories panels for the dressing room, and its other panels become "sheets" opened from the quiet row. The two clash-prone steps (cutover, den shop) run last, each after merging main.

**Tech Stack:** Vanilla JS ES modules, three.js, Vite, Vitest. No framework.

**Spec:** `docs/superpowers/specs/2026-10-24-whisker-walk-v21-reason-to-come-back-design.md`, "Stream 5 — The start screen (last)". Accepted mockup (git-ignored, main checkout only): `/Users/pniessen/CLAUDE-CODE/projects/cat-game/.superpowers/brainstorm/69803-1792884520/content/dressing-room-v2.html`.

## Global Constraints

- Never implement on main. Never merge or push without asking the owner.
- No SQL. `SAVE_VERSION` stays 4. No new save field: preview/try-on state is UI-only and never persisted.
- Every count on screen is computed from the live `CATALOG` (`src/progression.js`), `SKILLS` (`src/skills.js`), `DEN_ITEMS`/`DEN_SPOTS` (`src/den.js`), `GOLD_TOTAL` (`src/goldmice.js`). Never hard-code a number from the spec or mockups. Today that is 11 cats (D2 and Digit in, Rosa gone), 28 accessories, 7 slots, 12 skills, 12 den items, 12 den spots, 12 gold mice — these appear only in tests, as values derived from the catalog.
- Slot order is homebase.js's `ACCESSORY_SLOTS`: `collar, head, face, neck, body, back, feet`, labels `Collar, Head, Face, Neck, Body, Back, Feet`.
- Nothing on today's home screen may disappear. Feature checklist (each must be reachable after cutover, on phone too): cat pick/buy; accessory buy/wear/take off; area pick/buy with lock lines; Start (solo, room "together", "Starting…" disabled); Dusk walk toggle (only with the glow collar on); Visit your den (hidden in a room); points, rank + next, streak (≥2), best walk, today's race best, Mochi line, gold-mice "x of 12" (if Stream 3b landed); Skills; Colony (pairing, trading, dressing, clan name); Social (walk together, host/join/leave, pet name + star-name picker, partner walk, friends, player pets, friend codes, hide player); Journal; Album; Sync; Settings (volume, music, mute, invert-Y, left-handed, reduced motion, hide chat, perf readout, Graphics quality, Start over); 🎁 secret-code box; colony news card and the farewell notice.
- Every interpolated string is escaped (`escapeHtml`, same as `hometabs.js`); every number from state goes through `asFiniteNonNeg` before display.
- Copy is for players aged 11 and 9: short, warm, no jargon.
- Phone first. Target iPhone 18 (≈402×874 CSS px); check at the browser pane's `mobile` preset (375×812), which is stricter. The Start button is visible without scrolling on every phone view. No control may sit off-screen or behind a horizontal scroll.
- Asset URLs use `import.meta.env.BASE_URL` (production is served from `/whisker-walk/`).
- Tests: `npx vitest run --exclude '.claude/**'`.
- Commit trailer: `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- Eye-check every visible change in the browser pane at desktop and at the `mobile` preset; reset to `desktop` after.

## Review Focus

1. **Previewing a locked cat or trying on an unowned accessory, then pressing Start.** The walk must use the equipped (owned) cat and accessories, never the preview. Kids will tap every locked portrait.
2. **A full `render()` while the player is dragging the cat** (a room roster change, a colony poll, a sync). The canvas must survive the rebuild, keep its angle, and the drag must not jam.
3. **Phone height.** At 375×812 with a long state (room joined, dusk toggle on, every chip shown), the Start button and current place still sit pinned and tappable; the "More" panel reaches every sheet.
4. **No WebGL, or a lost context.** The hero falls back to the cat's thumbnail image (or its name if thumbnails also failed); nothing throws; no rAF loop runs while the home screen is hidden.
5. **Production base path.** Place pictures load under `/whisker-walk/`, and a missing picture falls back to the area's gradient, not a broken image.

---

### Task 1: Static mockup with real data, for sign-off — STOP for owner OK

**Files:**
- Create: `verify-dressingroom-mockup.html` (repo root, served by Vite dev)
- Create: `verify-places.html` (repo root): builds each `CATALOG.areas` world with the game's rig (copy `verify-park.html`'s setup, one area at a time) and snaps a 640×360 picture from a fixed, flattering camera per area.
- Create: `public/places/{neighborhood,park,seaside,docks}.jpg` (quality ~0.8, each < 120 KB)

**Interfaces:**
- Produces: `public/places/<areaId>.jpg` for every `CATALOG.areas` id, reused by Task 2.

- [ ] **Step 1:** Build `verify-places.html`; capture each area via `renderer.domElement.toDataURL('image/jpeg', 0.8)` in the browser pane and write the decoded bytes to `public/places/<id>.jpg`. Eye-check each picture.
- [ ] **Step 2:** Build `verify-dressingroom-mockup.html`: static markup and CSS following `dressing-room-v2.html`'s spacing and treatments, filled from the real `CATALOG`, `SKILLS`, `rankFor`, `menuThumbnails()` portraits, and the Step 1 pictures, against a realistic mid-game sample save (some cats owned, 2 accessories worn, Park unlocked, Seaside locked). Hero = the equipped cat's thumbnail scaled up (labelled "live 3D cat, drag to spin"). Desktop: header chips, hero + strip (all 11 portraits), slot column (7 slots, "Wearing · 2 of 7"), Start column, place cards with pictures, quiet row (Skills, Colony, Social, Journal, Album, Sync, Settings, 🎁 Code). Phone (≤ 600 px): hero, strip (scrolls sideways inside its own row only), three pills Wearing / Where to / More, chosen panel, pinned dock with current place + Start. A tap on a pill switches panel (mockup-only JS).
- [ ] **Step 3:** Eye-check at desktop and `mobile` preset; screenshot both.
- [ ] **Step 4:** Commit: `docs(stream5): static dressing-room mockup with real catalog data and place pictures`
- [ ] **Step 5: STOP.** Show the owner both screenshots and wait for sign-off. Fold any changes into the mockup and Tasks 2-5 before continuing.

### Task 2: The dressing-room model and renderer (pure)

**Files:**
- Create: `src/ui/dressingroom.js`, `src/ui/catblurbs.js`
- Test: `test/dressingroom.test.js`

**Interfaces:**
- `CAT_BLURBS`, `ACC_BLURBS` in `catblurbs.js`: copied verbatim from `homebase.js` (homebase switches to importing them at cutover).
- `HOME_SHEETS = ['skills','colony','social','journal','album','sync','settings','code']`, `SHEET_LABEL` (`🐾 Skills, 🐈 Colony, 👥 Social, 📖 Journal, 📸 Album, ☁️ Sync, ⚙️ Settings, 🎁 Code`), `resolveSheet(id) → id | null`.
- `PLACE_PICTURE(id) → string` = `${import.meta.env.BASE_URL}places/${id}.jpg` (in tests `BASE_URL` is `/`).
- `buildDressingModel(state, catalog, { previewCat, tryOn } = {}) → { hero, cats, slots, wearingCount, slotCount, places, currentPlace }`:
  - `hero: { id, name, blurb, owned, price, canBuy }` — `previewCat` if it is a known cat id, else `state.equipped.cat`.
  - `cats: [{ id, name, owned, selected, previewing }]` in `CATALOG.cats` order.
  - `slots: [{ slot, label, itemId|null, itemName|null, trying: bool }]` in slot order; `tryOn = { slot, id }` overrides one slot for display only.
  - `wearingCount` = equipped slots that are non-null; `slotCount` = number of slots (7).
  - `places: [{ id, name, owned, selected, canBuy, price, lockLine }]`; `lockLine` for a locked area with `requires`: `opens after ${walks} walks in ${areaName}` plus ` · ${have}/${walks} so far`; for an unlocked-by-gate but unbought area: `${price} 🐾 to unlock`.
  - `currentPlace: { id, name }`.
- `renderSlotPickerHtml(state, catalog, slot, tryOn) → string`: every accessory in that slot as a button with `data-dr-acc`, labelled Wear / On ✓ (with Take off) / Try on / Unlock — N 🐾 / N 🐾 (can't afford).
- `renderDressingRoomHtml({ model, headerHtml, startHtml, sheets, ui }) → string` where `ui = { pill: 'wearing'|'where'|'more', openSlot: slot|null, pickerHtml }`. Regions, by class: `.dr` (with `dr-pill-${pill}`), `.dr-header` (holds `headerHtml` verbatim), `.dr-stage#dr-stage` (empty: the canvas mounts here) with hero name/blurb/buy button and "drag to spin", `.dr-strip` (one `button.dr-portrait[data-dr-cat]` per cat, `aria-pressed` on the selected one), `.dr-pills` (three `button[data-dr-pill]`), `.dr-wearing` (`button.dr-slot[data-dr-slot]` per slot + picker), `.dr-where` (`button.dr-place[data-dr-place]` per place, with `<img>` picture and gradient fallback via `onerror` removing the img), `.dr-more` (quiet row: one `button[data-dr-sheet]` per entry of `sheets`), `.dr-dock` (current place line + `startHtml` verbatim).

- [ ] **Step 1: Write the failing tests**

```js
test('one portrait per catalog cat, in catalog order', () => {
  const m = buildDressingModel(defaultishState(), CATALOG);
  expect(m.cats.map((c) => c.id)).toEqual(Object.keys(CATALOG.cats));
});
test('slot count and wearing count come from the catalog and save', () => {
  const s = defaultishState(); s.equipped.collar = 'bell'; s.equipped.neck = 'bandana';
  const m = buildDressingModel(s, CATALOG);
  expect(m.slotCount).toBe(new Set(Object.values(CATALOG.accessories).map((a) => a.slot)).size);
  expect(m.wearingCount).toBe(2);
});
test('previewing a locked cat changes the hero, never the save', () => {
  const s = defaultishState(); const before = JSON.stringify(s);
  const m = buildDressingModel(s, CATALOG, { previewCat: 'hagrid' });
  expect(m.hero).toMatchObject({ id: 'hagrid', owned: false });
  expect(JSON.stringify(s)).toBe(before);
});
test('an unknown preview id falls back to the equipped cat', ...);
test('a gated area says how to open it', () => {
  const m = buildDressingModel(defaultishState(), CATALOG);
  expect(m.places.find((p) => p.id === 'seaside').lockLine).toContain('opens after 2 walks in City Park');
});
test('the picker lists every accessory in the slot', ...); // count === catalog filter count
test('the renderer escapes hostile text in headerHtml-adjacent fields', ...); // a hostile cat name in a test catalog renders escaped
test('every sheet gets a button, including code', ...);
test('resolveSheet clamps unknown ids to null', ...);
test('place pictures use the base url', () => expect(PLACE_PICTURE('park')).toBe('/places/park.jpg'));
test('hostile save values never throw and render 0', ...); // equipped = 7, walks = 'x', points = NaN
```

- [ ] **Step 2:** Run `npx vitest run --exclude '.claude/**' test/dressingroom.test.js` — FAIL (module missing).
- [ ] **Step 3:** Implement `catblurbs.js` and `dressingroom.js` to the interfaces above.
- [ ] **Step 4:** Run the file, then the full suite — PASS.
- [ ] **Step 5:** Commit: `feat(dressing-room): the pure model and renderer, counted from the live catalog`

### Task 3: Spin math and the live cat stage

**Files:**
- Create: `src/ui/spin.js`, `src/ui/catstage.js`
- Test: `test/spin.test.js`

**Interfaces:**
- `createSpin({ radPerPx = 0.012, friction = 4, rest = -0.45 } = {}) → { grab(x, t), move(x, t), release(t), step(dt) → { angle, moving }, angle }`. `release` keeps the last ~80 ms of drag velocity; `step` decays it exponentially and reports `moving: false` once |velocity| < 0.01 rad/s.
- `createCatStage({ buildCat, thumbs }) → { mount(el), show(breed, accessories), setVisible(bool), dispose(), failed }`:
  - One `THREE.WebGLRenderer` (`alpha: true, antialias: true`), created lazily on first `mount`, kept for the page's life. `mount(el)` appends the same canvas into the new `#dr-stage` after every `render()`; size follows `el` via `ResizeObserver`; pixel ratio `min(devicePixelRatio, 2)`.
  - Lighting and camera framing copied from `thumbnails.js` (whole-cat framing, height-fitted).
  - Renders on demand only: once per `show`, per resize, and per frame while dragging or coasting. No loop at rest; `setVisible(false)` cancels any frame.
  - `show` disposes the previous cat's geometries/materials (the `thumbnails.js` traverse) and keeps the spin angle.
  - Pointer events on the canvas (`pointerdown`/`move`/`up`/`cancel`, `setPointerCapture`, CSS `touch-action: pan-y` so a vertical swipe still scrolls the page on phones).
  - If renderer creation throws or `webglcontextlost` fires: `failed = true`, and `mount` puts `<img class="dr-hero-img">` (the breed's thumbnail) in the stage instead.

- [ ] **Step 1: Write the failing tests**

```js
test('dragging 100 px turns the cat by 100 × radPerPx', () => {
  const s = createSpin(); s.grab(0, 0); s.move(100, 16);
  expect(s.angle).toBeCloseTo(-0.45 + 100 * 0.012);
});
test('a flick coasts and then stops', () => {
  const s = createSpin(); s.grab(0, 0); s.move(60, 16); s.release(16);
  let r; for (let i = 0; i < 300; i++) r = s.step(1 / 60);
  expect(r.moving).toBe(false);
});
test('a slow drag released after a pause does not coast', ...); // move, wait 200 ms, release → step().moving false
test('grab during a coast stops it', ...);
```

- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement both modules. **Step 4:** Run — PASS.
- [ ] **Step 5:** Commit: `feat(dressing-room): a live, spinnable hero cat on one long-lived canvas`

### Task 4: The controller, the styles and the harness

**Files:**
- Create: `src/ui/dressingroomview.js`, `verify-dressingroom.html`
- Modify: `src/style.css` (append one `/* ---- dressing room (v21 Stream 5) ---- */` block; touch no existing rule)
- Test: `test/dressingroomview.test.js` (only the pure `reduceDressingUi` below)

**Interfaces:**
- Consumes: Task 2's `buildDressingModel`, `renderDressingRoomHtml`, `renderSlotPickerHtml`; Task 3's `createCatStage`.
- `reduceDressingUi(ui, action) → ui` (pure, exported): actions `{type:'pill', pill}`, `{type:'preview-cat', id}`, `{type:'slot', slot}` (toggle), `{type:'try-on', slot, id}`, `{type:'clear-preview'}`. Choosing an owned cat clears `previewCat`; opening another slot clears `tryOn`.
- `createDressingRoom({ progression, catalog, stage, sync, onChange }) → { html({ headerHtml, startHtml, sheets }), afterRender(rootEl), handleClick(e) → boolean, clearPreview() }`. `handleClick` returns true when it handled a `[data-dr-*]` click: portrait (owned → `equipCat`; locked → preview), hero Unlock (`progression.buy('cats', id)` then `sync?.autoSync?.()`), slot (open picker), picker Wear/Take off/Try on/Unlock (`equipAccessory` / `unequip` / try-on / `buy('accessories', id)` + autoSync), place (owned → `setArea`; buyable → `buy('areas', id)` + autoSync), pill. After a change it calls `onChange()` (the owner re-renders). `afterRender` mounts the stage and calls `stage.show(hero, accessoriesForStage)` where accessories = equipped slots with `tryOn` applied.
- `clearPreview()` is called by the owner on `hide()` and before Start, so Review Focus 1 holds by construction.
- CSS: desktop two columns (hero 1.3 : slots/start 1), place cards in one row, quiet row of ghost buttons. `@media (max-width: 600px)`: single column, `.dr-stage` height `min(38vh, 300px)`, strip `overflow-x: auto` inside its own row only, pills visible, only the chosen panel shown, `.dr-dock { position: sticky; bottom: 0; padding-bottom: max(10px, env(safe-area-inset-bottom)) }`, the More panel's sheet buttons in a 2-column grid. Tap targets ≥ 44 px.
- `verify-dressingroom.html`: a real `createProgression` on an in-memory storage seeded with the mockup's sample save, a fake `headerHtml`/`startHtml`, and buttons to seed a "long state" (room joined, glow on, every chip) for Review Focus 3.

- [ ] **Step 1:** Write failing tests for `reduceDressingUi` (owned pick clears preview; slot toggle; try-on cleared by switching slot; unknown action returns ui unchanged).
- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement controller, CSS, harness. **Step 4:** Run full suite — PASS.
- [ ] **Step 5:** Eye-check in the harness at desktop and `mobile`: spin by drag, preview a locked cat, try on a hat (it appears on the cat), buy with enough points, switch pills, Start visible without scrolling in the long state, no horizontal page scroll (`document.documentElement.scrollWidth <= innerWidth`). Compare against the signed-off mockup. Screenshot both sizes.
- [ ] **Step 6:** Commit: `feat(dressing-room): the controller, the phone layout with a pinned start, and a harness`

### Task 5: Switch the home screen to the dressing room (clash-prone — merge main first)

**Files:**
- Modify: `src/ui/homebase.js`, `src/ui/hometabs.js`, `src/style.css`, `test/hometabs.test.js`

- [ ] **Step 1:** `git merge main`. Re-read `homebase.js` (Stream 3b's gold-mice line in `hb-substats`, Stream 4's Settings rows), `hometabs.js`, and `style.css`'s home rules. Update this task's checklist with anything new on the home screen.
- [ ] **Step 2:** Write failing tests in `test/hometabs.test.js`: replace the `HOME_TABS` order test with `HOME_SHEETS` membership (from Task 2) and add `resolveSheet` cases (a stale persisted tab id such as `'cats'`, `'accessories'` or `'play'` resolves to null, i.e. the dressing room). Keep every Skills / star-name test unchanged.
- [ ] **Step 3:** In `homebase.js`: import blurbs from `catblurbs.js`; replace `activeTab` with `openSheet` (null = the dressing room); render the header substats (moved verbatim, including the gold line) as `headerHtml`, the dusk toggle + `renderStartButtonHtml` + den button as `startHtml`; render the dressing room when `openSheet` is null, else one sheet with a "← Back to my cat" button. Split the album panel into `journal` and `album` sheets, the settings panel into `sync` (only when `sync.available`) and `settings`, and the redeem box into `code`. Route clicks to `dressing.handleClick(e)` first. Call `dressing.clearPreview()` in `hide()` and on `btn-start`. `syncPairingPoll` reads `openSheet === 'colony'` where it read `activeTab`. Remove `card()`'s cats/accessories/areas use and the tab bar. Keep the den section where it is until Task 6.
- [ ] **Step 4:** Run full suite — PASS.
- [ ] **Step 5:** Eye-check every feature-checklist item at desktop and `mobile` in the real game (`whisker-walk-dev`), including hosting a room and the colony news card. No hidden off-screen control.
- [ ] **Step 6:** Commit: `feat(home): the dressing room replaces the cats and accessories tabs`

### Task 6: Move the den shop into the den (clash-prone — merge main first)

**Files:**
- Create: `src/ui/denshop.js` (pure `renderDenShopHtml(state, items, spots) → string`), `test/denshop.test.js`
- Modify: `src/ui/homebase.js` (remove `renderDenSection`/`denItemCard` and the den handlers), `src/main.js` and/or `src/game/walk.js` and `src/world/den.js` (open the shop during a den walk and re-place furniture live), `src/style.css`

- [ ] **Step 1:** `git merge main`. Re-read `src/world/den.js`, the den walk in `walk.js`/`main.js`, and Stream 3b's den changes (carried items kept in the den). Pin the exact hook points in this task before coding.
- [ ] **Step 2:** Write failing tests: one card per `DEN_ITEMS` entry and one spot row per `DEN_SPOTS` entry (counts from the imports), owned/affordable/unaffordable labels, select options = empty + owned items, hostile `state.den` renders without throwing.
- [ ] **Step 3:** Implement: a `🛋️ Den shop` button on the HUD during den walks only, opening an overlay that pauses movement, with the same buy (`buyDenItem` + autoSync) and place (`placeDenItem`) calls as today; placing or clearing a spot rebuilds that spot's furniture in the running den without restarting the walk. Remove the den section from the home screen.
- [ ] **Step 4:** Run full suite — PASS. Eye-check at desktop and `mobile`: buy, place, move, clear, and the room shows it at once.
- [ ] **Step 5:** Commit: `feat(den): the den shop and its slots move inside the den`

### Task 7: Whole-branch review

- [ ] **Step 1:** Full suite, `npm run build`, eye-check the feature checklist once more at both sizes.
- [ ] **Step 2:** Opus whole-branch review against the spec, this plan and the Review Focus list; one fix wave; one re-review.
- [ ] **Step 3:** Offer the branch to the owner (superpowers:finishing-a-development-branch). Do not merge or push.
