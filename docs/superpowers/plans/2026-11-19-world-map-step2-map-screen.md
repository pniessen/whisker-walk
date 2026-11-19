# World Map Step 2: Change Place Becomes the World Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In Clan Edition (and the everyday-words version, which is Clan Edition with the 'off' word set), Change place is one map of the whole world: every place drawn where draft 2 puts it, a tap opens a pop-up card with the place's picture, name, line and one button, and the map pans and pinch-zooms on small phones. Legacy Edition keeps today's picture cards untouched.

**Architecture:** A new pure model, `src/worldmap.js`, widens her 1000 x 700 board to a 1500 x 880 world (east and south of her board, so none of her coordinates move) and adds the five street places, the coast and the five gateway roads from draft 2. It reuses her board's model (`territoryMapModel`) and one shared place-state function, so the map, the card and the home line agree. `renderWorldMapHtml` (in `src/ui/territorymap.js`, beside the helpers it shares) draws it once per render as one SVG whose places are labelled keyboard buttons. A new `src/ui/placecard.js` builds the pop-up card; the dressing-room controller keeps which card is open in its UI state. A new `src/ui/mappan.js` pans and zooms by rewriting the SVG's `viewBox` only (no re-render), with a zoom-out floor that keeps every tap target at least 44 px.

**Tech Stack:** Plain ES modules, Vite, Vitest (`npx vitest run <file>`), SVG, Pointer Events.

**Spec:** `docs/superpowers/specs/2026-11-19-world-map-design.md` (section "The map screen (decision 7)", "The world (draft 2)", constraints) and `docs/superpowers/specs/img/2026-11-19-world-map-draft-2.svg`. Builds on step 1 (`docs/superpowers/plans/2026-11-19-world-map-step1-unlock-order.md`: `areaOffer` in `src/areaoffer.js`), which must be merged into this branch first.

## Global Constraints

- Her board is kept as she drew it: every value in `TERRITORIES`, `CAMP_AT`, `LAKE`, `ISLAND`, `STAR`, `POND`, `RIVER`, `PATHS`, `BRIDGE` and `BOARD` in `src/territories.js` stays exactly as it is.
- Draft 2's world: 1500 x 880 board units (draft 2's map group, without its title strip). Street places (x, y, r): Park (1080, 470, 90), Fairground (1060, 230, 85), Appletree Farm (1235, 320, 85), Docks (900, 770, 80), Seaside (1185, 680, 90). Colours: park `#b9dc8f`, fair `#e9b7c9`, farm `#e3cf7e`, docks `#b7b9bf`, seaside `#ecdca8`; sea `#a9d3e3`; gateway roads `#b04a2e`.
- The coast (cubic chain): `M1340 0 C1320 160 1360 300 1335 430 C1315 540 1350 640 1310 730 C1280 800 1180 860 1000 880 L1500 880 L1500 0 Z`.
- The five gateways (from, to, road as cubic M/C points): town-park `neighborhood → park` [952,570] [1000,580] [1060,590] [1080,560]; park-fair `park → fair` [1080,380] [1080,350] [1060,340] [1060,315]; park-farm `park → farm` [1168,450] [1210,440] [1240,430] [1235,405]; town-docks `neighborhood → docks` [860,676] [870,700] [885,700] [892,690]; docks-seaside `docks → seaside` [980,780] [1040,790] [1110,790] [1140,765]. Drawn as small marks only; step 3 gives them gates and states.
- Not on the map: the den (home, a Menu tile), the Rooftops and the House (not built yet), today's border posts.
- Every place is on the map in Clan Edition and in the everyday-words version, with its state: open (bright), locked (soft, `🔒` and main's words, e.g. `opens after you explore City Park 2 times · 0/2`), today's place (a ring), and the clans' camps as today (Clan Edition word set 'on' says "camp", 'off' says "home base").
- Tap a place: a pop-up card with its picture (`public/places/<id>.jpg`), name, a line, and its one button: `Go here` (owned, today's, or a free open place), `Open for N 🐾` (through the usual "Get it?" card), or none (the lock line or the paws still needed).
- Day / Dusk and the clan line stay at the top of the sheet, as today.
- Small phones: the map pans and pinch-zooms; every tap target is at least 44 px at every zoom; every place has a screen-reader label; places are reachable by keyboard.
- Older iPads: the map is one SVG, drawn once per render; panning and zooming only change its `viewBox`.
- Legacy Edition: `renderPlacesSheetHtml` output for a Legacy save does not change by one byte.
- Text for a 9-year-old. The new words (`Go here`, `Open for N 🐾`, `You have N 🐾`, `Map of the world`, `Zoom in`, `Zoom out`, `Close`) are the same in both word sets; place names and the camp word come from the word tables (`placeName`, `phrase`).
- Never touch the main checkout. Single test files only until Task 7. Word-snapshot fixtures change only in Task 3, re-recorded on purpose and read line by line.
- Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A drag that starts on a place** must pan the map and never open that place's card. Pinned in Task 5 (the click after a drag of more than `DRAG_PX` is swallowed).
2. **Back or Escape with the card open** closes the card and leaves Change place open; the next Back closes the sheet. Pinned in Tasks 4 and 6.
3. **A re-render while she is looking** (a colony poll, a partner re-track, a toast): the open card and the pan/zoom stay where they were; opening Change place afresh recentres on today's place. Pinned in Tasks 4 and 6.
4. **A keyboard or screen-reader child**: each place is a focusable button with a label (name and line), Enter or Space opens its card, focus moves to the card's button and back to the place on close, and a place focused off-screen is panned into view. Pinned in Tasks 2, 4 and 5.
5. **Today's place at the world's edge on a phone** (the Seaside, the Fairground, the Pines): the start view stays inside the world and still shows it. Pinned in Task 5.

---

## File Structure

- Create `src/worldmap.js`: the world's data (draft 2) and `worldMapModel`, `tapTargets`, `focusOf`. Pure.
- Modify `src/territories.js`: `stateOf` becomes the exported `placeState`, reading `areaOffer` and saying a street place's price.
- Modify `src/ui/territorymap.js`: `renderWorldMapHtml` replaces `renderTerritoryMapHtml` (Task 2 adds it, Task 3 deletes the old one).
- Create `src/ui/placecard.js`: `placeCardFor`, `renderPlaceCardHtml`.
- Modify `src/ui/dressingroom.js`: the Clan model carries `worldMap` and `placeCard` (no `territoryMap`, no `otherPlaces`); `renderPlacesSheetHtml`'s Clan branch is the map only.
- Modify `src/ui/dressingroomview.js`: `ui.mapCard`; open/close the card by click and by key; Back closes it; a pick closes it.
- Create `src/ui/mappan.js`: view math and `attachMapPan`.
- Modify `src/ui/homebase.js`: attaches the pan after the places sheet renders, keeps the view, the card as a Back layer, the keydown hand-off, the focus twin on the sheet path, the wobble on the map.
- Modify `src/style.css`: the world map, its zoom buttons and the card (replacing the territory map's two-column sheet rules at lines 1867-1891).
- Tests: create `test/worldmap.test.js`, `test/placecard.test.js`, `test/mappan.test.js`; modify `test/territories.test.js`, `test/campmarks.test.js`, `test/dressingroom.test.js`, `test/dressingroomcontroller.test.js`, `test/spendconfirm.test.js`, `test/homebase.map.test.js`, `test/serieswords.test.js` and `test/fixtures/series-words-on.json`, `series-words-off.json`.

---

### Task 1: The world as data

**Files:**
- Create: `src/worldmap.js`
- Modify: `src/territories.js:83-114` (`stateOf` → exported `placeState`; `territoryMapModel` calls it)
- Test: `test/worldmap.test.js`

**Interfaces:**
- Consumes: `areaOffer(state, catalog, id)` (step 1), `opensAfterLine`, `territoryMapModel`, `TERRITORIES`, `ISLAND`, `STAR`, `LAKE`, `POND`, `RIVER`, `PATHS`, `BRIDGE` from `src/territories.js`; `placeName` from `src/edition.js`.
- Produces from `src/territories.js`: `placeState(state, catalog, areaId) -> { owned, selected, locked, canOpen, price, line }`. Lines: today's place `you’re going here`; owned `tap to go here`; locked `opensAfterLine(...)`; open and free `Tap to explore`; open, priced, affordable `Open for ${price} 🐾`; open, priced, short `${price} 🐾 — keep exploring!`. Gate and price come from `areaOffer`. An area not in the catalog gives `{ owned: false, selected: false, locked: false, canOpen: false, price: 0, line: 'coming soon' }` as `stateOf` does today.
- Produces from `src/worldmap.js`:
  - `WORLD` `{ w: 1500, h: 880 }`; `STREET_PLACES` (frozen `{ id, areaId, x, y, r }`, ids = area ids, in the order park, fair, farm, docks, seaside); `STREET_LAND` (id → colour); `COAST` (the ten points of the cubic chain, frozen); `GATEWAYS` (frozen `{ id, from, to, road: [[x, y] x 4] }`, values in Global Constraints); `ISLAND_HIT_R = 46`.
  - `worldMapModel(state, catalog) -> { world, regions, island, star, lake, pond, river, paths, bridge, coast, gateways }`: `regions` is `territoryMapModel(state, catalog).regions`, each with `kind: 'board'` and `price`, then one region per street place with `kind: 'street'`, `name: placeName(areaId, edition, catalog)`, `status: 'built'`, `camp: null` and `placeState(...)`.
  - `tapTargets(model) -> Array<{ areaId, x, y, r }>`: every region's circle, then the island's (`STAR`, `ISLAND_HIT_R`, areaId `'pines'`).
  - `focusOf(model) -> [x, y]`: the selected region's centre, else the town's.

- [ ] **Step 1: Write the failing tests** in `test/worldmap.test.js`:

```js
it('her board is untouched: every place, path, the river, the lake and the bridge as she drew them', () => {
  const m = worldMapModel(fresh(), CATALOG);
  expect(BOARD).toEqual({ w: 1000, h: 700 });
  expect(m.regions.filter((r) => r.kind === 'board').map(({ id, x, y, r }) => ({ id, x, y, r })))
    .toEqual(TERRITORIES.map(({ id, x, y, r }) => ({ id, x, y, r })));
  expect([m.lake, m.river, m.paths, m.bridge, m.pond, m.star]).toEqual([LAKE, RIVER, PATHS, BRIDGE, POND, STAR]);
});
it("draft 2's street places, world and coast", () => {
  expect(WORLD).toEqual({ w: 1500, h: 880 });
  expect(STREET_PLACES.map(({ id, x, y, r }) => [id, x, y, r])).toEqual([
    ['park', 1080, 470, 90], ['fair', 1060, 230, 85], ['farm', 1235, 320, 85], ['docks', 900, 770, 80], ['seaside', 1185, 680, 90]]);
  expect(COAST).toEqual([[1340, 0], [1320, 160], [1360, 300], [1335, 430], [1315, 540], [1350, 640], [1310, 730], [1280, 800], [1180, 860], [1000, 880]]);
});
it('every place in the catalog is on the map exactly once, inside the world', () => {
  const m = worldMapModel(fresh(), CATALOG);
  expect(m.regions.map((r) => r.areaId).sort()).toEqual(Object.keys(CATALOG.areas).sort());
  for (const r of m.regions) expect(r.x - r.r >= 0 && r.y - r.r >= 0 && r.x + r.r <= 1500 && r.y + r.r <= 880, r.id).toBe(true);
});
it('no street place overlaps another place, and the sea is east of every place', () => {
  // for each street place and every other region: distance >= r1 + r2
  // for each region: every COAST point with |py - y| <= r has px > x + r
});
it('five gateways join the places draft 2 joins, edge to edge', () => {
  expect(GATEWAYS.map((g) => [g.id, g.from, g.to])).toEqual([
    ['town-park', 'neighborhood', 'park'], ['park-fair', 'park', 'fair'], ['park-farm', 'park', 'farm'],
    ['town-docks', 'neighborhood', 'docks'], ['docks-seaside', 'docks', 'seaside']]);
  // the road's first point is within 8 units of the `from` region's edge, its last within 8 of the `to` region's
});
it('the Park, Fairground, Farm and Seaside are entered from their south side, as their walks are', () => {
  // for those four `to` places the road's last point has y > the place's y
});
it('a street place shows its state in the words of its card', () => {
  // fresh canon save: park line 'opens after you explore Twolegplace 2 times · 0/2', locked true
  // walks.neighborhood 2, points 10: { locked: false, canOpen: false, price: 50, line: '50 🐾 — keep exploring!' }
  // points 50: { canOpen: true, line: 'Open for 50 🐾' }; owned: 'tap to go here'; area 'park': 'you’re going here'
  // seaside on a fresh save: 'opens after you explore The Old Docks 2 times · 0/2'
  // a kept Seaside (keptOffers ['seaside'], walks.park 2, points 100): 'Open for 100 🐾'
});
it('the town is Peopleville in the everyday words', () => {
  withOffWords(() => expect(worldMapModel(fresh(), CATALOG).regions.find((r) => r.id === 'town').name).toBe('Peopleville'));
});
it('tap targets: every place and the island, the island the smallest at 92 across', () => {
  const t = tapTargets(worldMapModel(fresh(), CATALOG));
  expect(t).toHaveLength(12);
  expect(t.at(-1)).toEqual({ areaId: 'pines', x: 455, y: 314, r: 46 });
  expect(Math.min(...t.map((x) => 2 * x.r))).toBe(92);
});
it("focusOf is today's place, else the town", () => {
  expect(focusOf(worldMapModel({ ...fresh(), unlocked: { areas: ['neighborhood', 'docks'] }, area: 'docks' }, CATALOG))).toEqual([900, 770]);
  expect(focusOf(worldMapModel(fresh(), CATALOG))).toEqual([843, 566]);
});
```

(`fresh()` = a plain canon state like `clanState()` in `test/territories.test.js`, with `points: 0`; `withOffWords` from `test/helpers/offwords.js`. Write the commented assertions out in full.)

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run test/worldmap.test.js`
Expected: FAIL (`src/worldmap.js` does not exist).

- [ ] **Step 3: Implement** `placeState` in `src/territories.js` (the body of today's `stateOf`, with gate and price from `areaOffer` and the two priced lines) and `src/worldmap.js` (header comment: what the world is, that her board's coordinates are untouched, draft 2's path, that `GATEWAYS` is ready for step 3's gates).

- [ ] **Step 4: Run them to see them pass, with her board's tests**

Run: `npx vitest run test/worldmap.test.js test/territories.test.js test/unlockorder.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/worldmap.js src/territories.js test/worldmap.test.js
git commit -m "World map step 2: the world as data, her board untouched and draft 2's street places, coast and gateways around it

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Drawing the world

**Files:**
- Modify: `src/ui/territorymap.js` (add `renderWorldMapHtml`; `renderTerritoryMapHtml` stays until Task 3)
- Test: `test/worldmap.test.js` (a `describe('drawing the world', …)`)

**Interfaces:**
- Consumes: `worldMapModel`, `STREET_LAND`, `ISLAND_HIT_R` (Task 1); `LAND` from `src/territories.js`; the file's own `smoothPath`, `blobPath`, `labelHtml`, `campHtml`, `wrap`.
- Produces: `renderWorldMapHtml(model) -> string`. One `<svg viewBox="0 0 1500 880" class="territory-map world-map" role="group" aria-label="Map of the world" xmlns=…>`. Layers, bottom to top: paper (`tm-paper`, 0 0 1500 880), sea (`<path class="tm-sea" d=…coast…>`), lands (`tm-land`, board ones in `LAND` colours, street ones in `STREET_LAND` with class `street`), water, her paths and bridge, gateway roads (`<path class="wm-road" d="M… C… … …"/>`) and a mark at each road's end (`<circle class="wm-gate" cx cy r="8"/>`), then one group per region and the island's group, then the frame. Each region group: `<g class="tm-region <state classes>" data-region="<id>" data-dr-map-place="<areaId>" data-x="<x>" data-y="<y>" role="button" tabindex="0" aria-label="<name>: <line>">`, its `tm-hit` blob, its label (icon, `🔒 ` when locked, name, line) and its camp. No `<title>` on a region (the camp keeps its own). Icons: `ICON` plus park `⛲`, fair `🎡`, farm `🚜`, docks `⚓`, seaside `🏖️`. Label anchors: `LABEL_AT` plus park [1080, 478], fair [1060, 236], farm [1235, 326], docks [900, 778], seaside [1170, 688]. Sizes: a region with `r >= 140` keeps name 44 / line class `tm-line`; a smaller one (the street places and the Gorge) gets name 36 and line class `tm-line tm-line-small` (CSS 24px): give `labelHtml` a second argument `{ small }` so the old renderer's output does not move before Task 3 deletes it. The island group: `data-dr-map-place="pines"`, `aria-label="<island name>, <ISLAND_WHERE>: <line>"`, its outline drawing plus `<circle class="tm-hit" cx="455" cy="314" r="46"/>`.

- [ ] **Step 1: Write the failing tests**:

```js
it('one SVG, labelled, the whole world', () => {
  expect(html.startsWith('<svg viewBox="0 0 1500 880" class="territory-map world-map" role="group" aria-label="Map of the world"')).toBe(true);
  expect(html).toContain('class="tm-sea"');
});
it('every place is a labelled keyboard button that opens its card', () => {
  const ids = [...html.matchAll(/data-dr-map-place="([a-z]+)"/g)].map(([, id]) => id);
  expect(new Set(ids).size).toBe(11);
  expect(ids).toHaveLength(12); // the island is a second way into the Pines
  expect(html).not.toContain('data-dr-place=');
  expect(regionHtml(html, 'park')).toMatch(/role="button" tabindex="0" aria-label="City Park: opens after you explore Twolegplace 2 times · 0\/2"/);
  expect(regionHtml(html, 'park')).toContain('data-x="1080" data-y="470"');
  expect(regionHtml(html, 'island')).toContain('<circle class="tm-hit" cx="455" cy="314" r="46"/>');
});
it('her paths and bridge, five roads and five gate marks', () => {
  expect((html.match(/class="tm-path"/g) || []).length).toBe(3);
  expect((html.match(/class="wm-road"/g) || []).length).toBe(5);
  expect((html.match(/class="wm-gate"/g) || []).length).toBe(5);
  expect(html).toContain('<path class="wm-road" d="M952 570 C1000 580 1060 590 1080 560"/>');
});
it('locked, today and owned look different; street places carry their lock and price', () => {
  // fresh save: park region class contains 'locked', its label starts '🔒 City Park'
  // area 'park' owned: class contains 'sel', no 'locked'
  // street land paths carry class 'street' and their STREET_LAND fill
});
it('camps only on her board, only in Clan Edition', () => {
  // pick('woods'): regionHtml(html, 'woods') contains 'tm-camp mine'; no street region contains 'tm-camp'
});
it('small places get smaller words', () => {
  expect(regionHtml(html, 'docks')).toContain('font-size="36"');
  expect(regionHtml(html, 'woods')).toContain('font-size="44"');
});
it('names are escaped', () => { /* a catalog whose park name is '<b>': '&lt;b&gt;', never '<b>' */ });
```

(`html = renderWorldMapHtml(worldMapModel(fresh(), CATALOG))`; copy `regionHtml` from `test/territories.test.js`.)

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run test/worldmap.test.js`
Expected: FAIL (`renderWorldMapHtml` is not exported).

- [ ] **Step 3: Implement `renderWorldMapHtml(model)`** as specified in the Interfaces block. The coast path is `M` + `COAST[0]` + three `C` triples + `L1500 880 L1500 0 Z`; a road is `M` + road[0] + ` C` + road[1..3].

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run test/worldmap.test.js test/territories.test.js test/campmarks.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/ui/territorymap.js test/worldmap.test.js
git commit -m "World map step 2: draw the world as one SVG, every place a labelled keyboard button

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The map-only sheet and its pop-up card

**Files:**
- Create: `src/ui/placecard.js`
- Modify: `src/ui/dressingroom.js:164-172` (Clan model) and `478-492` (`renderPlacesSheetHtml`)
- Modify: `src/ui/territorymap.js` (delete `renderTerritoryMapHtml`; update the file's header comment)
- Test: create `test/placecard.test.js`; modify `test/dressingroom.test.js:386-405` and `756-767`, `test/territories.test.js` (every `renderTerritoryMapHtml(territoryMapModel(s, CATALOG))` → `renderWorldMapHtml(worldMapModel(s, CATALOG))`, `data-dr-place` → `data-dr-map-place`, the counts 6/7 → 11/12, the viewBox line → Task 2's header, `<title>The island, …` → `aria-label="The island, …`), `test/campmarks.test.js:43-56` (call `renderWorldMapHtml`, add `world`, `coast: COAST`, `gateways: []` to the hand-built model), `test/dressingroomcontroller.test.js:7-8,88,233-238` (imports, comment, the island check), `test/serieswords.test.js:68,508,605` (`mapText` uses `renderWorldMapHtml(worldMapModel(…))`; Legacy's `hasTerritoryMap: !!m.worldMap`), the fixtures `series-words-on.json`, `series-words-off.json`

**Interfaces:**
- Consumes: `worldMapModel`, `renderWorldMapHtml`, `PLACE_PICTURE`.
- Produces from `src/ui/placecard.js`:
  - `placeCardFor(worldModel, areaId, points) -> { id, name, line, locked, action: 'go' | 'open' | null, label: string | null } | null`: from the region with that `areaId` (null when none). `action` `'go'` with label `Go here` when owned or open and free; `'open'` with label `Open for ${price} 🐾` when open, priced and affordable; otherwise `null`. `line` is the region's line, except for `'open'`, where it is `You have ${points} 🐾`.
  - `renderPlaceCardHtml(card, { picture }) -> string`: `<div class="wm-card" role="dialog" aria-labelledby="wm-card-name" data-wm-card="<id>">`, `<img class="wm-card-pic" src="<picture>" alt="" onerror="this.style.display='none'">`, `<h3 id="wm-card-name">` (`🔒 ` before a locked name), `<p class="wm-card-line">`, then for `'go'` `<button type="button" class="wm-card-go" data-dr-place="<id>">Go here</button>`, for `'open'` `<button type="button" class="wm-card-buy" data-dr-place-buy="<id>">Open for N 🐾</button>`, then `<button type="button" class="wm-card-close" data-dr-map-close="<id>" aria-label="Close">✕</button>`. Everything escaped.
- Produces from `src/ui/dressingroom.js`: `buildDressingModel(state, catalog, { previewCat, tryOn, mapCard })` gives Clan saves `worldMap` and `placeCard` (`placeCardFor(worldMap, mapCard, points)` when `mapCard` is a string, else `null`) beside `clanPicker` and `clanPartnerName`; `territoryMap` and `otherPlaces` are gone. A Legacy model has `placeCard: null` and no `worldMap`. `renderPlacesSheetHtml(model, { clanLineHtml, denHtml })` for a model with `worldMap`: `<div class="dr-where">${clanLineHtml}<div class="wm-frame">${map}<div class="wm-zoom"><button type="button" class="wm-zoom-in" data-wm-zoom="in" aria-label="Zoom in">＋</button><button type="button" class="wm-zoom-out" data-wm-zoom="out" aria-label="Zoom out">－</button></div>${card}</div></div>` (no picture cards, no "More places", no den). The Legacy branch is unchanged.

- [ ] **Step 1: Write the failing tests** in `test/placecard.test.js`:

```js
it('an owned place: Go here', () => expect(cardOn(owned, 'woods')).toMatchObject({ action: 'go', label: 'Go here', line: 'tap to go here', locked: false }));
it("today's place: Go here, and says so", () => expect(cardOn(today, 'park')).toMatchObject({ action: 'go', line: 'you’re going here' }));
it('a free wild place that is open: Go here', () => expect(cardOn(woodsOpen, 'woods')).toMatchObject({ action: 'go', line: 'Tap to explore' }));
it('a street place she can open: Open for 50 🐾, and how many she has', () =>
  expect(cardOn(park60, 'park')).toMatchObject({ action: 'open', label: 'Open for 50 🐾', line: 'You have 60 🐾' }));
it('a street place she cannot afford: no button, the paws it costs', () =>
  expect(cardOn(park10, 'park')).toMatchObject({ action: null, label: null, line: '50 🐾 — keep exploring!' }));
it('a locked place: no button, the lock line', () =>
  expect(cardOn(fresh, 'seaside')).toMatchObject({ action: null, locked: true, line: 'opens after you explore The Old Docks 2 times · 0/2' }));
it("the island's card is the Pines'", () => expect(cardOn(fresh, 'pines').id).toBe('pines'));
it('no card for a place not on the map', () => expect(placeCardFor(worldMapModel(fresh, CATALOG), 'den', 0)).toBeNull());
it('the card markup: a labelled dialog, its picture, one button, a close', () => {
  const html = renderPlaceCardHtml(cardOn(park60, 'park'), { picture: '/places/park.jpg' });
  expect(html).toMatch(/^<div class="wm-card" role="dialog" aria-labelledby="wm-card-name" data-wm-card="park">/);
  expect(html).toContain('<img class="wm-card-pic" src="/places/park.jpg" alt=""');
  expect(html).toContain('<button type="button" class="wm-card-buy" data-dr-place-buy="park">Open for 50 🐾</button>');
  expect(html).toContain('data-dr-map-close="park" aria-label="Close"');
  expect(html).not.toContain('data-dr-place=');
  const locked = renderPlaceCardHtml(cardOn(fresh, 'seaside'), { picture: 'x' });
  expect(locked).toContain('<h3 id="wm-card-name">🔒 Seaside</h3>');
  expect(locked).not.toMatch(/wm-card-(go|buy)/);
});
it('the Clan sheet is the map only, with the card when one is open', () => {
  const html = renderPlacesSheetHtml(buildDressingModel(park60, CATALOG, { mapCard: 'park' }), { clanLineHtml: '<p id="CL">x</p>' });
  expect(html.indexOf('id="CL"')).toBeLessThan(html.indexOf('class="wm-frame"'));
  expect(html.indexOf('world-map')).toBeLessThan(html.indexOf('class="wm-card"'));
  expect((html.match(/class="wm-card"/g) || []).length).toBe(1);
  expect(html).not.toContain('More places');
  expect(html).not.toContain('class="dr-place');
  expect(html).toContain('data-wm-zoom="in"');
  expect(renderPlacesSheetHtml(buildDressingModel(park60, CATALOG))).not.toContain('wm-card"');
});
it('Legacy keeps its picture cards, byte for byte, and never gets a card', () => {
  const s = { ...park60, edition: 'legacy' };
  expect(buildDressingModel(s, CATALOG, { mapCard: 'park' }).placeCard).toBeNull();
  expect(renderPlacesSheetHtml(buildDressingModel(s, CATALOG, { mapCard: 'park' }))).toBe(renderPlacesSheetHtml(buildDressingModel(s, CATALOG)));
  expect(renderPlacesSheetHtml(buildDressingModel(s, CATALOG))).not.toContain('world-map');
});
it('the everyday-words version: every place on the map, no family word anywhere', () => {
  withOffWords(() => {
    const html = renderPlacesSheetHtml(buildDressingModel(midSave, CATALOG, { mapCard: 'neighborhood' }));
    expect(new Set([...html.matchAll(/data-dr-map-place="([a-z]+)"/g)].map(([, id]) => id)).size).toBe(11);
    expect(bannedLeaks(htmlText(html))).toEqual([]);
    expect(html).toContain('Peopleville');
  });
});
```

(`cardOn(state, id)` = `placeCardFor(worldMapModel(state, CATALOG), id, state.points)`; plain canon states: `fresh` (nothing walked), `owned` (woods owned, area neighborhood), `today` (park owned, area park), `woodsOpen` (walks.neighborhood 2), `park60` / `park10` (walks.neighborhood 2, points 60 / 10), `midSave` (a camp picked, a partner's pick, woods and park owned, so camps and the ally ring show). `bannedLeaks` from `test/helpers/offwords.js`, `htmlText` from `test/helpers/serieswords.js`.)

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run test/placecard.test.js`
Expected: FAIL (`src/ui/placecard.js` does not exist).

- [ ] **Step 3: Implement** `src/ui/placecard.js`, the Clan model and sheet in `src/ui/dressingroom.js` (the comment above `renderPlacesSheetHtml` says the Clan sheet is the world map only and why the den is not on it), and delete `renderTerritoryMapHtml`.

- [ ] **Step 4: Move the old renderer's tests** in the files listed above to `renderWorldMapHtml(worldMapModel(…))`, and update `test/dressingroom.test.js`: the describe at 386 becomes `the world map in the dressing room` (`m.worldMap.regions` has 11 areaIds; no `otherPlaces`; the sheet has `world-map` and no `More places` and no `dr-place` buttons; `Twolegplace` shown, `Cozy Neighborhood` not); the test at 762 (`Clan puts the den inside More places`) becomes `Clan's sheet has no den: the den is a Menu tile` (`denHtml` passed in is not in the Clan sheet; Legacy's still is).

Run: `npx vitest run test/placecard.test.js test/dressingroom.test.js test/territories.test.js test/campmarks.test.js test/dressingroomcontroller.test.js test/spendconfirm.test.js test/worldmap.test.js`
Expected: PASS

- [ ] **Step 5: Re-record the word snapshots** (the owner approved this screen on 2026-11-19)

Run: `npx vitest run test/serieswords.test.js` (FAIL), then `UPDATE_SERIES_SNAPSHOT=1 UPDATE_OFF_SNAPSHOT=1 npx vitest run test/serieswords`, then `npx vitest run test/serieswords` (PASS).
Check: `git diff --stat test/fixtures` names only `series-words-on.json` and `series-words-off.json`; inside them only the Clan sections' `map.*` and `places.*.sheet` entries move (the five street places' names, lines and `[aria-label]` entries arrive, `[aria-label] Map of the world`, `Zoom in`, `Zoom out`; `More places` and the street picture-card texts leave). The Legacy section and every other key are unchanged. A word of the family's set in the 'off' fixture is a bug.

- [ ] **Step 6: Commit**

```bash
git add src/ui/placecard.js src/ui/dressingroom.js src/ui/territorymap.js test/placecard.test.js test/dressingroom.test.js test/territories.test.js test/campmarks.test.js test/dressingroomcontroller.test.js test/serieswords.test.js test/fixtures/series-words-on.json test/fixtures/series-words-off.json
git commit -m "World map step 2: Change place is the world map only, with a pop-up card per place; Legacy keeps its picture cards

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Opening and closing the card

**Files:**
- Modify: `src/ui/dressingroomview.js` (`INITIAL_DRESSING_UI` line 19, `reduceDressingUi`, `DR_SELECTOR` line 87, `pick` line 488, `focusTwin` line 496, `back` line 523, `handleClick` line 536, the returned object line 700)
- Test: `test/dressingroomcontroller.test.js`, `test/spendconfirm.test.js`

**Interfaces:**
- Consumes: the card markup (Task 3): regions carry `data-dr-map-place`, the card's buttons `data-dr-place` / `data-dr-place-buy` / `data-dr-map-close`.
- Produces: `ui.mapCard: string | null` (`INITIAL_DRESSING_UI.mapCard === null`); reducer action `{ type: 'map-card', id }` (a string opens that card, anything else closes it; the same value returns the same object); `'clear-preview'` also closes the card. `handleClick` opens the card on `drMapPlace` and closes it on `drMapClose`; a keyboard tap's focus twin is `'.wm-card-go, .wm-card-buy, .wm-card-close'` on open and `[data-dr-map-place="<id>"]` on close. `handleKeydown(e) -> boolean`: Enter or Space on a `[data-dr-map-place]` calls `e.preventDefault()` and does what a click does; anything else returns `false`. `back()` closes an open card first (returns `true`). `pick(id)` closes the card before `onPlaced`.

- [ ] **Step 1: Write the failing tests** in `test/dressingroomcontroller.test.js`, `describe("the world map's card", …)` (real progression, `realSetup()`):

```js
it('a tap on a place opens its card and changes nothing else', () => {
  expect(t.dr.handleClick(click({ drMapPlace: 'park' }))).toBe(true);
  expect(t.dr.ui.mapCard).toBe('park');
  expect(buy).not.toHaveBeenCalled(); expect(t.progression.state.area).toBe('neighborhood');
});
it('✕ closes it', () => { /* drMapPlace park, then drMapClose park: mapCard null */ });
it("the card's Go here picks the place and closes the card", () => {
  // woods owned: drMapPlace woods, then drPlace woods -> state.area 'woods', mapCard null, onPlaced('woods', 'set')
});
it("the card's Open for 50 only asks; Yes opens the Park and closes the card", () => {
  // walks.neighborhood 2, points 60, confirmSpend captured: drPlaceBuy park -> asks[0].text 'Open City Park for 50 🐾?', points still 60
  // asks[0].onYes() -> park owned, area 'park', points 10, mapCard null
});
it('Enter and Space on a place open its card; other keys do nothing', () => {
  // key('Enter', { drMapPlace: 'woods' }) -> true, preventDefault called, mapCard 'woods'; key(' ', …) the same; key('a', …) -> false
});
it("a keyboard open puts focus on the card's button, a close puts it back on the place", () => {
  // target whose ownerDocument.activeElement is itself; restoreFocus(root) with root.querySelector recording the selector
});
it('Back closes the card first; clearPreview closes it too', () => {
  // drMapPlace park; back() -> true, mapCard null; back() -> false. Open again; clearPreview(); mapCard null
});
it('reduceDressingUi map-card', () => {
  expect(reduceDressingUi(INITIAL_DRESSING_UI, { type: 'map-card', id: 'park' }).mapCard).toBe('park');
  const open = { ...INITIAL_DRESSING_UI, mapCard: 'park' };
  expect(reduceDressingUi(open, { type: 'map-card', id: 'park' })).toBe(open);
  expect(reduceDressingUi(open, { type: 'map-card', id: null }).mapCard).toBeNull();
});
```

And in `test/spendconfirm.test.js`, a `describe('the map card never buys on the tap', …)`: the real confirm card; `drMapPlace park` then `drPlaceBuy park` mounts one card (`Open City Park for 50 🐾?`), points unchanged; Not now leaves the place unowned and the map card open; Yes (after `CONFIRM_DELAY_MS`) opens it once, even on a double tap.

(`key(k, dataset)` = `t.dr.handleKeydown({ key: k, preventDefault: vi.fn(), target: { closest: () => ({ dataset }) } })`.)

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run test/dressingroomcontroller.test.js test/spendconfirm.test.js`
Expected: FAIL (`drMapPlace` is not a dressing-room control; `handleKeydown` is not a function).

- [ ] **Step 3: Implement** the Interfaces block in `src/ui/dressingroomview.js` (add `handleKeydown` to the returned object; document `map-card` in the reducer's comment list).

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run test/dressingroomcontroller.test.js test/spendconfirm.test.js test/dressingroomview.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/ui/dressingroomview.js test/dressingroomcontroller.test.js test/spendconfirm.test.js
git commit -m "World map step 2: a tap or Enter on a place opens its card; Go here and Open (through Get it?) pick it; Back closes the card

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Pan and pinch

**Files:**
- Create: `src/ui/mappan.js`
- Test: `test/mappan.test.js`

**Interfaces:**
- Consumes: a `.wm-frame` element holding the `svg.world-map` and the `[data-wm-zoom]` buttons (Task 3); `tapTargets`, `focusOf`, `WORLD` (Task 1).
- Produces:
  - `MIN_TARGET_PX = 44`, `DRAG_PX = 8`, `MAX_ZOOM = 4`, `ZOOM_STEP = 1.25`.
  - `minScaleFor(targets, minPx = MIN_TARGET_PX) -> number`: screen px per board unit at which the smallest target (`2 * r`) is `minPx` across.
  - `startView(world, box, focus, minScale) -> { x, y, w, h }`: scale = max(fit, `minScale`), fit = min(`box.w / world.w`, `box.h / world.h`); `w = box.w / scale`, `h = box.h / scale`; centred on `focus`, then `clampView`.
  - `clampView(view, world) -> view`: a side shorter than the world stays inside it; a side longer is centred on it.
  - `panView(view, dxPx, dyPx, box, world) -> view` (a finger moving right moves the view left by `dxPx / scale`), clamped.
  - `zoomView(view, factor, [px, py], box, world, minScale) -> view`: the board point under `[px, py]` stays under it; the scale stays within [max(fit, `minScale`), `MAX_ZOOM` times that]; clamped.
  - `viewBoxAttr(view) -> string`: `"x y w h"`, each rounded to one decimal.
  - `attachMapPan(frame, { world, targets, focus, view = null, onView = () => {} }) -> { view, detach() } | null`: `null` when `frame` is missing, holds no `svg.world-map`, or the svg has no size (no layout). Sets the `viewBox` at once (the kept `view` clamped, else `startView`). Pointer events on the svg: one pointer pans; two pinch (zoom about their midpoint); after a pointer has moved more than `DRAG_PX`, the next `click` is stopped in the capture phase (`preventDefault` and `stopPropagation`). `wheel` with `ctrlKey` (a trackpad pinch) zooms and calls `preventDefault`; a plain wheel does nothing. A `click` on `[data-wm-zoom="in"|"out"]` zooms by `ZOOM_STEP` about the box's centre. `focusin` on a `[data-dr-map-place]` whose `data-x`/`data-y` lies outside the view centres the view on it. Every change sets the `viewBox` and calls `onView(view)`. `detach()` removes every listener.

- [ ] **Step 1: Write the failing tests** in `test/mappan.test.js`:

```js
const targets = tapTargets(worldMapModel(fresh(), CATALOG));
const k = minScaleFor(targets); // 44 / 92
it('the zoom-out floor keeps the smallest target 44 px across', () => expect(k).toBeCloseTo(44 / 92, 6));
it('a phone starts zoomed in round today\'s place, inside the world', () => {
  const v = startView(WORLD, { w: 343, h: 420 }, [1080, 470], k); // the phone's map box (CSS: min(62vh, 440px) tall)
  expect(v.w).toBeCloseTo(343 / k, 3);
  expect(v.x).toBeGreaterThanOrEqual(0); expect(v.x + v.w).toBeLessThanOrEqual(1500);
  expect(1080 > v.x && 1080 < v.x + v.w).toBe(true);
});
it('an iPad and a desktop see the whole world', () => {
  expect(startView(WORLD, { w: 736, h: 432 }, [843, 566], k)).toMatchObject({ x: 0, w: 1500 });
  expect(startView(WORLD, { w: 1200, h: 704 }, [843, 566], k)).toEqual({ x: 0, y: 0, w: 1500, h: 880 });
});
it("today's place at the world's edge is still in view", () => {
  for (const focus of [[1185, 680], [1060, 230], [308, 199]]) {
    const v = startView(WORLD, { w: 343, h: 420 }, focus, k);
    expect(v.x >= 0 && v.y >= 0 && v.x + v.w <= 1500 + 1e-9).toBe(true);
    expect(focus[0] >= v.x && focus[0] <= v.x + v.w && focus[1] >= v.y && focus[1] <= v.y + v.h).toBe(true);
  }
});
it('panning moves the view against the finger and stops at the edge', () => { /* panView 100 px right: x drops by 100 / scale; a huge pan: x 0 */ });
it('zooming keeps the point under the fingers and stops at both limits', () => { /* … */ });
it('viewBoxAttr rounds to one decimal', () => expect(viewBoxAttr({ x: 1.234, y: 0, w: 717.39, h: 1003.95 })).toBe('1.2 0 717.4 1004'));
describe('attachMapPan', () => {
  it('sets the viewBox at once, and keeps a view it is handed', () => { /* … */ });
  it('a drag pans and swallows the click that ends it; a tap does not', () => {
    // pointerdown at (100,100), pointermove to (130,100), pointerup -> viewBox changed, onView called;
    // the capture click listener calls preventDefault and stopPropagation;
    // pointerdown/move 3 px/up: the click goes through untouched
  });
  it('two fingers spreading zoom in; a ctrl-wheel zooms; a plain wheel does not', () => { /* … */ });
  it('the zoom buttons zoom about the centre', () => { /* … */ });
  it('a place focused off-screen is brought into view', () => { /* … */ });
  it('nothing to attach to: null; detach removes every listener', () => { /* … */ });
});
```

(A fake frame: `{ querySelector(sel) }` returning a fake svg with `getBoundingClientRect() → { left: 0, top: 0, width: 343, height: 420 }`, `setAttribute`, and listener maps keyed by type and capture; events are plain objects with `pointerId`, `clientX`, `clientY`, `preventDefault`, `stopPropagation`, `target.closest`. Write each commented test out in full.)

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run test/mappan.test.js`
Expected: FAIL (`src/ui/mappan.js` does not exist).

- [ ] **Step 3: Implement `src/ui/mappan.js`** as in the Interfaces block (`setPointerCapture` only when the element has it; every DOM call guarded so a missing method never throws).

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run test/mappan.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/ui/mappan.js test/mappan.test.js
git commit -m "World map step 2: the map pans and pinch-zooms by its viewBox, never below 44 px tap targets

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The home screen wiring and the sheet's look

**Files:**
- Modify: `src/ui/homebase.js` (imports; `setSheet` ~line 1277; the sheet render branch ~lines 1492-1535; `depth` line 2305; `back` line 2317; a `keydown` listener beside the `click` one at line 1637)
- Modify: `src/style.css:1630-1672` (world map rules beside the territory map's) and `1867-1891` (the places sheet's grid rules)
- Test: `test/homebase.map.test.js`

**Interfaces:**
- Consumes: `attachMapPan` (Task 5); `worldMapModel`, `tapTargets`, `focusOf`, `WORLD` (Task 1); the controller's `ui.mapCard`, `back()`, `handleKeydown(e)`, `restoreFocus(root, null)` (Task 4).
- Produces (homebase behaviour): after the places sheet renders for a Clan save, `attachMapPan(root.querySelector('.wm-frame'), { world: WORLD, targets, focus, view: mapView, onView })` with `mapView` kept across renders and set back to `null` whenever Change place is opened from another screen; the previous attachment is detached before each render and when the sheet closes; `dressing.restoreFocus(root, null)` runs after the places sheet renders; `depth()` counts an open card as one more layer; `back()` with the card open calls `dressing.back()` and leaves the sheet open; `keydown` on the root goes to `dressing.handleKeydown`; the wobble after a failed pick also finds `[data-dr-map-place="<id>"]` (a second `querySelectorAll`, so the existing `[data-dr-place="<id>"]` query is unchanged).

- [ ] **Step 1: Write the failing tests** in `test/homebase.map.test.js`. Mock `../src/ui/mappan.js` (`attachMapPan: vi.fn((frame, opts) => { attaches.push(opts); return { view: opts.view, detach: vi.fn() }; })`) and give the dressing-room stub a mutable `ui` object, `back: vi.fn(() => { stub.ui.mapCard = null; return true; })`, `restoreFocus: vi.fn()`, `handleKeydown: vi.fn(() => false)`.

```js
describe('Change place: the world map on the home screen', () => {
  it('opening Change place attaches the pan, centred on today\'s place, and hands focus to the dressing room', () => {
    // openSheet('places') -> attaches.at(-1) has world { w: 1500, h: 880 }, view null, focus [843, 566], targets length 12; restoreFocus called
  });
  it('the view survives a re-render and is forgotten when the sheet is opened afresh', () => {
    // attaches.at(-1).onView(V); a re-render (opts.onChange()) -> next attach has view V; Back home, open again -> view null
  });
  it('an open card is a layer: Back closes it and Change place stays', () => {
    // stub.ui.mapCard = 'park'; hb.depth() === 2; hb.back() === true; stub.back called; html still has data-sheet="places"; hb.depth() === 1
  });
  it('a key press on the home screen goes to the dressing room', () => {
    // doc.root.listeners.keydown(e) -> stub.handleKeydown called with e
  });
  it('Legacy attaches no pan', () => { /* setEdition('legacy'); openSheet('places'); attaches unchanged */ });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run test/homebase.map.test.js`
Expected: FAIL (no attach, no keydown listener, depth 1).

- [ ] **Step 3: Implement the homebase wiring** in the Interfaces block.

- [ ] **Step 4: Write the styles** in `src/style.css` (no test; the pictures in Task 7 check them):
  - `.wm-frame { position: relative; }`; `.world-map { width: 100%; max-width: none; height: min(62vh, 440px); touch-action: none; }` (440 px is about the world's height at the zoom-out floor, so a phone shows the whole height with no blank paper); from 768 px wide `height: auto; aspect-ratio: 1500 / 880`.
  - `.world-map [data-dr-map-place] { cursor: pointer; }` (iOS taps, as the comment at line 1633 explains); `:focus-visible` on a region outlines its `tm-hit` (white, 10 units); `.tm-sea { fill: #a9d3e3; }`; `.wm-road { fill: none; stroke: #b04a2e; stroke-width: 4; stroke-linecap: round; stroke-dasharray: 3 9; }`; `.wm-gate { fill: #b04a2e; }`; `.tm-land.street.locked` as `.tm-land.built.locked`; `.tm-line-small { font-size: 24px; }`.
  - `.wm-zoom`: top right of the frame, two round buttons 44 x 44 px.
  - `.wm-card`: over the map's bottom edge, 8 px from the frame's sides on a phone, 360 px wide at the right from 768 px; picture 16:10 with rounded top corners; `.wm-card-go`, `.wm-card-buy` at least 44 px tall, outlined, never pink (pink is Explore's alone); `.wm-card-close` 44 x 44 px in the top right corner.
  - Replace the `:has(.territory-map)` two-column grid rules at 1867-1891 so the Clan sheet is one column with the map at full width (keep the `.dr-places` grid rules for Legacy's cards).

- [ ] **Step 5: Run the home screen's tests**

Run: `npx vitest run test/homebase.map.test.js test/homebase.launch.test.js test/homebase.edition.test.js test/homebase.safety.test.js test/homebase.visits.test.js`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/ui/homebase.js src/style.css test/homebase.map.test.js
git commit -m "World map step 2: the home screen pans the map, keeps its view, treats the card as a Back layer; the map's look

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Full suite, build and pictures for the owner

**Files:** none in the repo. Pictures and the picture script go in the session's scratchpad, `$SCRATCH/world-map-step2/` (`$SCRATCH` = the scratchpad directory the session's system prompt names).

- [ ] **Step 1: Run the full suite and the build**

Run: `npx vitest run` then `npm run build`
Expected: every test file passes; the build succeeds (the main-chunk gzip ceiling test is part of the suite). Fix any failure before taking pictures.

- [ ] **Step 2: Serve before and after**
  - Before: the parent of this plan's first commit, `BASE=$(git log --reverse --format=%H --grep='^World map step 2' | head -1)^`; `git worktree add "$SCRATCH/world-map-step2/before" "$BASE"`; in it `ln -s /Users/pniessen/CLAUDE-CODE/projects/cat-game/node_modules node_modules`; run `npx vite --port 5366 --strictPort` there in the background.
  - After: in this worktree, `npx vite --port 5365 --strictPort` in the background.

- [ ] **Step 3: Take the pictures** with a scratch script `$SCRATCH/world-map-step2/shots.mjs` that drives headless Chrome (`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome --headless=new --remote-debugging-port=9335 --user-data-dir=$SCRATCH/world-map-step2/profile`) over the DevTools protocol with Node's built-in `WebSocket`: per size, `Emulation.setDeviceMetricsOverride` (phone 375 x 812, scale 2, mobile; iPad 768 x 1024, scale 2, mobile; desktop 1440 x 900, scale 1), navigate, write the save below to `localStorage['whisker-walk-save']`, reload, press Escape once for any greeting card, click `[data-dr-sheet="places"]`, wait 800 ms, `Page.captureScreenshot`. The save (a mid-game Clan Edition child: owned, today's, open-to-buy, free-open and locked places all on show):

```json
{ "version": 4, "points": 120, "lifetimePoints": 400, "edition": "canon", "area": "park",
  "walks": { "neighborhood": 4, "park": 2, "woods": 2, "farm": 1 },
  "unlocked": { "cats": ["tabby", "siamese", "persian"], "accessories": ["bell", "bandana"], "areas": ["neighborhood", "park", "woods", "farm"] },
  "clanPick": { "mine": "woods", "partner": null, "partnerId": null },
  "tutorial": { "first": "done", "camp": true, "hints": {}, "told": { "thing": null, "visits": 0 } },
  "visits": 40, "visitPrizesSeen": 40, "keptOffers": [] }
```

  Shots: `before-phone.png`, `before-ipad.png`, `before-desktop.png` from 5366; `after-phone.png`, `after-ipad.png`, `after-desktop.png` from 5365; then on 5365 also `after-card-phone.png` and `after-card-desktop.png` (click `[data-dr-map-place="fair"]` first: the card says `Open for 75 🐾`, `You have 120 🐾`) and `after-phone-panned.png` (a scripted drag of 200 px to the left on the map). Look at every picture: names readable, no label spilling out of its land, the card inside the screen, the Day / Dusk switch and the clan line at the top, the zoom buttons clear of the card.

- [ ] **Step 4: Clean up**: stop both Vite servers and Chrome; `git worktree remove "$SCRATCH/world-map-step2/before"`.

- [ ] **Step 5: Hand back to the owner** (no merge, no push: those need his yes): the commit hashes, the suite count, the absolute paths of the nine pictures, and what he should look at: the phone opens zoomed to about half the world round today's place (the 44 px floor; the island's tap circle is the smallest target), the iPad and desktop show the whole world, Legacy is unchanged, and the everyday-words version is checked by tests only (no switch exists to show it live yet).

---

## Self-review

- Spec coverage: the map fills the sheet with every place in both versions (Tasks 1-3, the everyday-words test in Task 3); land shapes, water, paths, gateways as marks, a name on every place (Task 2); open / locked / today / camps (Tasks 1-2); tap → pop-up card with picture, name, line, one button, Open through "Get it?" (Tasks 3-4); Day / Dusk and the clan line kept at the top (Task 3's sheet keeps `clanLineHtml` first; homebase's `duskChoiceHtml` is untouched); pan, pinch, 44 px, screen-reader labels (Tasks 2, 5, 6); one SVG drawn once per render (Tasks 2, 5); Legacy untouched (Task 3); her coordinates, paths and bridge kept (Task 1); the model ready for gateway marks (`GATEWAYS`, Task 1); pictures (Task 7).
- Names used across tasks: `worldMapModel`, `tapTargets`, `focusOf`, `WORLD`, `STREET_PLACES`, `STREET_LAND`, `COAST`, `GATEWAYS`, `ISLAND_HIT_R`, `placeState`, `renderWorldMapHtml`, `placeCardFor`, `renderPlaceCardHtml`, `ui.mapCard`, `handleKeydown`, `attachMapPan`, `minScaleFor`, `startView`, `panView`, `zoomView`, `clampView`, `viewBoxAttr`; attributes `data-dr-map-place`, `data-dr-map-close`, `data-wm-zoom`, `data-x`, `data-y`.
- Not in this plan: gateways in the walks (step 3), Legacy's retirement (step 4), counts of outfits or mice on the map.
