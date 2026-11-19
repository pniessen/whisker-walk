# World Map Step 1: The New Unlock Order Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Docks open after 2 Park walks for 100 🐾 and the Seaside after 2 Docks walks for 200 🐾, while a save whose Seaside is open-to-buy today keeps that offer.

**Architecture:** The catalog gets the new gates and prices. One small pure module, `src/areaoffer.js`, answers "what does opening this place take, for this save?" (the catalog's gate and price, or the kept old offer). A new additive save field `keptOffers` records, once, the places a save from before this change could already buy. Every reader of a street place's gate or price (buying, the place cards, the home line, border posts, the "Get it?" card) asks `areaOffer`, so no two screens disagree. (The territory map shows only wild places today; step 2's world map reads `areaOffer` from its first task.)

**Tech Stack:** Plain ES modules, Vite, Vitest (`npx vitest run <file>`).

**Spec:** `docs/superpowers/specs/2026-11-19-world-map-design.md` (section "The new unlock order (decision 5)"; build order item 1).

## Global Constraints

- New order: Park 50 after 2 Neighborhood walks (unchanged); Farm 75 and Fairground 75 after 2 Park walks (unchanged); **Docks 100 after 2 Park walks**; **Seaside 200 after 2 Docks walks**; wild places as today, free.
- Saves keep every place they own. A save that owns the Seaside but not the Docks keeps the Seaside; the Docks open for it under the new rule.
- A save whose Seaside is open-to-buy today (2 Park walks done, Seaside not owned) keeps it open-to-buy: gate `{ area: 'park', walks: 2 }` and its old price 100 (the old offer kept whole; owner decision flagged in the report).
- The Park's home line names the places it opens, Farm, Fairground and Docks, with today's three-place line (`home.opens-three`): `Explore here again to open Appletree Farm, the Fairground and the Old Docks!`
- Child-facing words follow main's current wording ("explore", not "walk"): `opens after you explore City Park 2 times · 0/2`.
- `SAVE_VERSION` stays 4: `keptOffers` is additive, like every field since v4. Offline-first; no database change.
- The catalog's key order does not change (Legacy's picture cards keep their order; `test/fair.test.js` pins it).
- Never touch the main checkout; work in `.claude/worktrees/world-map` on branch `world-map`. Run single test files only, until the last step of Task 3 (the full suite, once).
- Word-snapshot fixtures are re-recorded only in Task 1, where the owner-approved order moves them, and the diff is read line by line.
- Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A save opened by an old cached build and then by this one** (the iOS app before its nightly refresh, a stale browser tab): the old build drops `keptOffers`, so the next load here treats the save as "from before" and may give the old Seaside offer to a child who did 2 Park walks under the new order. Expected: generous, never a lost place. Pinned in Task 2 ("a save with no keptOffers is read as from before").
2. **"Load from cloud" with a payload from before this change**: the kept offer is worked out from the payload's own walks and places, not the device's. Pinned in Task 2.
3. **Junk `keptOffers` in a cloud payload** (`'__proto__'`, `'docks'`, a string, duplicates): only ids of `KEPT_OFFERS` survive, once each, and none that the save already owns. Pinned in Task 2.
4. **Screens disagreeing for a kept save**: the place card, `placeWhyLine`, the home line, a border post and the "Get it?" card must all say the Seaside opens after the Park for 100. Pinned in Task 3, one assertion per reader.
5. **Spending the wrong amount**: buying the kept Seaside takes 100 🐾, and its "Get it?" card says `Open Seaside for 100 🐾?`. Pinned in Tasks 2 and 3.

---

## File Structure

- Create `src/areaoffer.js`: `KEPT_OFFERS`, `areaOffer`, `keptOffersOnLoad`. Pure, no imports (the catalog is a parameter).
- Modify `src/progression.js`: CATALOG `docks` and `seaside` entries and their comments (lines 298-326); `defaultState` gets `keptOffers: []` (after `tutorial`, ~line 590); `sanitizeState` sets it (~line 1083); `canBuy` / `buy` ask `areaOffer` (lines 1398-1412).
- Modify `src/bordercross.js` (`postStatus`, ~line 37), `src/ui/dressingroom.js` (`placeWhyLine` line 57, `buildDressingModel` places ~line 151), `src/ui/dressingroomview.js` (`onPlace`, line 475), `src/ui/nextthing.js` (rules 5-7, lines 66-104): each reads gate and price through `areaOffer`.
- Create `test/unlockorder.test.js`: the new order, the kept offer, every reader.
- Modify pins of the old order: `test/docks.test.js:345-385`, `test/fair.test.js:1647-1654` and `1769-1775`, `test/farm.test.js:892-895`, `test/nextthing.test.js:165-178`, `test/dressingroom.test.js:96`, `test/progression.test.js:764-790` and `2398-2410`, `test/editions.invariants.test.js:99-101`, and the fixtures `test/fixtures/series-words-on.json`, `series-words-off.json`, `series-words-on-tutorial.json`, `series-words-off-tutorial.json`.

---

### Task 1: The new order in the catalog

**Files:**
- Modify: `src/progression.js:298-326` (the `seaside` and `docks` entries and the Farm / Fairground / Docks comments that describe the old order)
- Modify: `src/ui/nextthing.js:94-98` and `src/ui/dressingroom.js:167-168` (comments only: the Park opens the Farm, the Fairground and the Docks; the Seaside opens after the Docks)
- Create: `test/unlockorder.test.js`
- Modify: `test/docks.test.js`, `test/fair.test.js`, `test/farm.test.js`, `test/nextthing.test.js`, `test/dressingroom.test.js`, the four series-words fixtures

**Interfaces:**
- Produces: `CATALOG.areas.docks = { name: 'The Old Docks', price: 100, requires: { area: 'park', walks: 2 } }`, `CATALOG.areas.seaside = { name: 'Seaside', price: 200, requires: { area: 'docks', walks: 2 } }`.

- [ ] **Step 1: Write the failing tests** in `test/unlockorder.test.js` (fresh saves only; `fakeStorage` as in `test/docks.test.js`):

```js
describe('the new unlock order (world map decision 5)', () => {
  it('the Docks open after 2 Park explores, for 100', () => {
    expect(CATALOG.areas.docks).toEqual({ name: 'The Old Docks', price: 100, requires: { area: 'park', walks: 2 } });
    const p = createProgression(fakeStorage());
    p.addPoints(99);
    p.completeWalk('park');
    expect(p.canBuy('areas', 'docks')).toBe(false); // one explore is not two
    p.completeWalk('park');
    expect(p.canBuy('areas', 'docks')).toBe(false); // 99 is not 100
    p.addPoints(1);
    expect(p.canBuy('areas', 'docks')).toBe(true);
  });
  it('the Seaside opens after 2 Docks explores, for 200, and no longer after the Park', () => {
    expect(CATALOG.areas.seaside).toEqual({ name: 'Seaside', price: 200, requires: { area: 'docks', walks: 2 } });
    const p = createProgression(fakeStorage());
    p.addPoints(9999);
    p.completeWalk('park'); p.completeWalk('park');
    expect(p.canBuy('areas', 'seaside')).toBe(false);
    p.completeWalk('docks'); p.completeWalk('docks');
    expect(p.canBuy('areas', 'seaside')).toBe(true);
    expect(p.buy('areas', 'seaside')).toBe(true);
    expect(p.state.points).toBe(9999 - 200);
  });
  it("the Park's home line names the Farm, the Fairground and the Docks", () => {
    // walks.park 1, standing in the Park, both editions
    for (const edition of ['canon', 'legacy']) {
      expect(nextThing(parkSave(edition))).toMatchObject({ rule: 7, id: 'home.opens-three',
        text: 'Explore here again to open Appletree Farm, the Fairground and the Old Docks!' });
    }
  });
  it("the Docks' home line names the Seaside", () => {
    expect(nextThing(docksSave('canon'))).toMatchObject({ rule: 7, id: 'home.opens', text: 'Explore here again and Seaside opens!' });
  });
  it('a locked Seaside says it waits for the Docks', () => {
    expect(placeWhyLine(freshPlain('legacy'), CATALOG, 'seaside')).toBe('opens after you explore The Old Docks 2 times · 0/2');
    expect(placeWhyLine(freshPlain('legacy'), CATALOG, 'docks')).toBe('opens after you explore City Park 2 times · 0/2');
  });
});
```

`parkSave(edition)` / `docksSave(edition)` build the state the way `test/nextthing.test.js`'s `save()` does (a stored v4 save run through `createProgression`): `{ edition, walks: { neighborhood: 3, woods: 1, park: 1 }, unlocked: { accessories: <every accessory>, areas: ['neighborhood', 'woods', 'park'] }, area: 'park', clanPick: { mine: 'woods' } }`; for the Docks, `walks: { neighborhood: 3, woods: 1, park: 2, docks: 1 }`, areas `[..., 'park', 'docks']`, `area: 'docks'`. Give `docksSave` the field `keptOffers: []` (Task 2 reads a missing field as "from before"; harmless before Task 2 exists). `freshPlain(edition)` is a plain object `{ edition, points: 0, walks: {}, unlocked: { areas: ['neighborhood'] } }`.

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run test/unlockorder.test.js`
Expected: FAIL (the catalog still has `seaside` 100 after the Park and `docks` 200 after the Seaside).

- [ ] **Step 3: Change the two catalog entries** in `src/progression.js` to the values in the Interfaces block, keeping the key order. Rewrite the comments above `farm`, `fair` and `docks` so they describe the new order (the Farm and the Fairground open beside the Docks after two Park explores; the Docks follow the Park on the map, the Seaside follows the Docks; spec path `docs/superpowers/specs/2026-11-19-world-map-design.md`). Update the comments at `src/ui/nextthing.js:94-98` and `src/ui/dressingroom.js:167-168` the same way.

- [ ] **Step 4: Run it to see it pass**

Run: `npx vitest run test/unlockorder.test.js`
Expected: PASS

- [ ] **Step 5: Update the pins of the old order**, each to the new values:
  - `test/docks.test.js:346-385`: title `is priced at 100 and gated behind 2 Park explores`, the `toEqual` from the Interfaces block; the three buying tests walk `'park'` instead of `'seaside'`; "cannot be bought without the points either" adds 99 then 1 and expects `points` 0 after the buy; "can then be equipped" adds 100.
  - `test/fair.test.js:1651-1653`: `CATALOG.areas.seaside` → the new entry, `CATALOG.areas.docks.requires` → `{ area: 'park', walks: 2 }` (the `ids.slice(0, 5)` order line stays). `1769-1775`: title `is named with the Farm and the Docks on the Park’s home line, …`, text `'Explore here again to open Appletree Farm, the Fairground and the Old Docks!'`.
  - `test/farm.test.js:892-895`: title `the Docks open beside it after the Park, and the Seaside after the Docks`, the two new entries.
  - `test/nextthing.test.js:165-178`: title `… the Park opens the Farm, the Fairground and the Docks`; texts `'… Appletree Farm, the Fairground and the Old Docks!'`, `'Explore here again to open the Fairground and the Old Docks!'`, `'Explore here again to open Appletree Farm and the Old Docks!'`, `'Explore here again and the Old Docks opens!'`.
  - `test/dressingroom.test.js:96`: `toContain('opens after you explore The Old Docks')`.

- [ ] **Step 6: Run the pinned files**

Run: `npx vitest run test/unlockorder.test.js test/docks.test.js test/fair.test.js test/farm.test.js test/nextthing.test.js test/dressingroom.test.js`
Expected: PASS

- [ ] **Step 7: Re-record the word snapshots** (the owner approved the new order on 2026-11-19; this is the wording change the fixtures' header allows)

Run: `npx vitest run test/serieswords` (expect FAIL, listing only Seaside / Docks / Park lines), then `UPDATE_SERIES_SNAPSHOT=1 UPDATE_OFF_SNAPSHOT=1 npx vitest run test/serieswords`, then `npx vitest run test/serieswords` (PASS).
Check: `git diff --stat test/fixtures` names only `series-words-on.json`, `series-words-off.json`, `series-words-on-tutorial.json`, `series-words-off-tutorial.json`; every changed line in `git diff -U0 test/fixtures | grep '^[-+] '` is the Seaside's or the Docks' gate line (`seaside` now `… explore The Old Docks 2 times …`, `docks` now `… explore City Park 2 times …`) or a rule-7 line (`farm`/`fair`/`docks` keys now `… Appletree Farm, the Fairground and the Old Docks!`, `seaside` key now `Explore here again and Seaside opens!`). Anything else moving is a bug: stop and find it.

- [ ] **Step 8: Commit**

```bash
git add src/progression.js src/ui/nextthing.js src/ui/dressingroom.js test/unlockorder.test.js test/docks.test.js test/fair.test.js test/farm.test.js test/nextthing.test.js test/dressingroom.test.js test/fixtures/series-words-on.json test/fixtures/series-words-off.json test/fixtures/series-words-on-tutorial.json test/fixtures/series-words-off-tutorial.json
git commit -m "World map step 1: the Docks open after the Park for 100, the Seaside after the Docks for 200

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The kept offer on the save

**Files:**
- Create: `src/areaoffer.js`
- Modify: `src/progression.js` (`defaultState`, `sanitizeState`, `canBuy`, `buy`)
- Modify: `test/unlockorder.test.js`, `test/progression.test.js:764-790` and `2398-2410`, `test/editions.invariants.test.js:99-101`

**Interfaces:**
- Produces (from `src/areaoffer.js`):
  - `KEPT_OFFERS`: frozen `{ seaside: { requires: { area: 'park', walks: 2 }, price: 100 } }`, the old offer a save from before this change keeps.
  - `areaOffer(state, catalog, id) -> { requires: { area: string, walks: number } | null, price: number } | null`: `null` for an id that is not an own key of `catalog.areas`; the `KEPT_OFFERS[id]` offer when `state.keptOffers` (an array) includes `id` and `KEPT_OFFERS` has it; otherwise the catalog's `requires` (or `null`) and its price as a whole non-negative number. Never reads anything else from `state`, so plain test states without `keptOffers` get the catalog's offer.
  - `keptOffersOnLoad(raw, { walks, owned }) -> string[]`: when `raw` is an array, the ids in it that are own keys of `KEPT_OFFERS`, once each, minus any in `owned`; when `raw` is anything else (missing: a save from before this change), every `KEPT_OFFERS` id not in `owned` whose old gate the save meets (`walks[requires.area] >= requires.walks`).
- Produces (save): `state.keptOffers: string[]`, `[]` on a new save.

- [ ] **Step 1: Write the failing tests** in `test/unlockorder.test.js`, a `describe('the kept offer', …)` using a stored v4 save (`fakeStorage({ 'whisker-walk-save': JSON.stringify({ version: 4, ... }) })`):

```js
it('a save whose Seaside was open-to-buy keeps the old offer: after the Park, for 100', () => {
  const p = load({ points: 150, walks: { neighborhood: 3, park: 2 }, unlocked: { areas: ['neighborhood', 'park'] } });
  expect(p.state.keptOffers).toEqual(['seaside']);
  expect(areaOffer(p.state, CATALOG, 'seaside')).toEqual({ requires: { area: 'park', walks: 2 }, price: 100 });
  expect(p.canBuy('areas', 'seaside')).toBe(true);
  expect(p.buy('areas', 'seaside')).toBe(true);
  expect(p.state.points).toBe(50);
});
it('a save with one Park explore keeps nothing: the Seaside waits for the Docks', () => {
  const p = load({ walks: { neighborhood: 3, park: 1 }, unlocked: { areas: ['neighborhood', 'park'] } });
  expect(p.state.keptOffers).toEqual([]);
  expect(areaOffer(p.state, CATALOG, 'seaside')).toEqual({ requires: { area: 'docks', walks: 2 }, price: 200 });
});
it('a new save keeps nothing, even after 2 Park explores', () => {
  const s = fakeStorage();
  const p = createProgression(s);
  p.addPoints(500); p.completeWalk('park'); p.completeWalk('park');
  expect(p.canBuy('areas', 'seaside')).toBe(false);
  expect(createProgression(s).state.keptOffers).toEqual([]); // and a reload does not grant it
});
it('the kept offer survives a reload, and is gone once the Seaside is bought', () => {
  const s = storageWith({ points: 150, walks: { park: 2 }, unlocked: { areas: ['neighborhood', 'park'] } });
  createProgression(s).addPoints(0); // any save() writes the field
  const p = createProgression(s);
  expect(p.state.keptOffers).toEqual(['seaside']);
  p.buy('areas', 'seaside');
  expect(createProgression(s).state.keptOffers).toEqual([]);
});
it('a save that owns the Seaside but not the Docks keeps the Seaside; the Docks open under the new rule', () => {
  const p = load({ points: 100, walks: { park: 3, seaside: 2 }, unlocked: { areas: ['neighborhood', 'park', 'seaside'] }, area: 'seaside' });
  expect(p.isUnlocked('areas', 'seaside')).toBe(true);
  expect(p.state.area).toBe('seaside');
  expect(p.state.keptOffers).toEqual([]);
  expect(p.canBuy('areas', 'docks')).toBe(true);
});
it('a save with no keptOffers is read as from before (an old cached build wrote it)', () => {
  const p = load({ walks: { park: 2 }, unlocked: { areas: ['neighborhood', 'park'] } });
  expect(p.state.keptOffers).toEqual(['seaside']);
});
it("Load from cloud works the kept offer out from the payload's walks, not the device's", () => {
  const p = createProgression(fakeStorage());
  p.replaceFromPayload({ version: 4, walks: { park: 2 }, unlocked: { areas: ['neighborhood', 'park'] } });
  expect(p.state.keptOffers).toEqual(['seaside']);
  p.replaceFromPayload({ version: 4, walks: { park: 1 }, unlocked: { areas: ['neighborhood', 'park'] } });
  expect(p.state.keptOffers).toEqual([]);
});
it('junk in keptOffers is dropped', () => {
  expect(load({ keptOffers: ['__proto__', 'docks', 'woods', 'seaside', 'seaside'], walks: {}, unlocked: { areas: ['neighborhood'] } }).state.keptOffers).toEqual(['seaside']);
  expect(load({ keptOffers: 'seaside', walks: { park: 0 } }).state.keptOffers).toEqual([]); // not an array: read as from before; the gate is not met
  expect(load({ keptOffers: ['seaside'], unlocked: { areas: ['neighborhood', 'seaside'] } }).state.keptOffers).toEqual([]); // owned
});
it('areaOffer: an unknown id, a plain state, and a catalog entry with no gate', () => {
  expect(areaOffer({}, CATALOG, 'nowhere')).toBeNull();
  expect(areaOffer({}, CATALOG, '__proto__')).toBeNull();
  expect(areaOffer({}, CATALOG, 'seaside')).toEqual({ requires: { area: 'docks', walks: 2 }, price: 200 });
  expect(areaOffer({ keptOffers: ['farm'] }, CATALOG, 'farm')).toEqual({ requires: { area: 'park', walks: 2 }, price: 75 }); // not a kept id: the catalog's
  expect(areaOffer({}, CATALOG, 'neighborhood')).toEqual({ requires: null, price: 0 });
});
```

(`load(fields)` = `createProgression(storageWith(fields))`, `storageWith(fields)` = `fakeStorage({ 'whisker-walk-save': JSON.stringify({ version: 4, ...fields }) })`.)

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run test/unlockorder.test.js`
Expected: FAIL (`src/areaoffer.js` does not exist).

- [ ] **Step 3: Write `src/areaoffer.js`** with the three exports in the Interfaces block (header comment: what a kept offer is and why it exists, spec path). In `src/progression.js`: `defaultState()` gets `keptOffers: []` with an "Additive, so SAVE_VERSION stays 4" comment in the house style; `sanitizeState` sets `keptOffers: keptOffersOnLoad(parsed.keptOffers, { walks, owned: unlockedAreas })` from the already-sanitised `walks` and `unlockedAreas`; `canBuy` reads the gate and price from `areaOffer(state, CATALOG, id)` when `kind === 'areas'` (cats and accessories unchanged); `buy` deducts `areaOffer(...).price` for an area and `CATALOG[kind][id].price` otherwise.

- [ ] **Step 4: Run it to see it pass**

Run: `npx vitest run test/unlockorder.test.js`
Expected: PASS

- [ ] **Step 5: Update the tests that list the save's keys**
  - `test/progression.test.js:764-790` (the bare `{ version: 3 }` payload): add `keptOffers: []` to the expected state.
  - `test/progression.test.js:2398-2410` (the v20 save, `walks.park` 2, Seaside not owned): add `keptOffers` to the destructured names and `expect(keptOffers).toEqual(['seaside'])` (this old save keeps the old offer, which is the point).
  - `test/editions.invariants.test.js:99-101`: title `… tutorial and keptOffers are the only new top-level keys`, add `'keptOffers'` to the list.

Run: `npx vitest run test/progression.test.js test/editions.invariants.test.js test/savebackup.test.js test/farmjobs.test.js test/fairgames.test.js test/docks.test.js`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/areaoffer.js src/progression.js test/unlockorder.test.js test/progression.test.js test/editions.invariants.test.js
git commit -m "World map step 1: a save whose Seaside was open-to-buy keeps that offer (after the Park, for 100)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Every screen asks the same question

**Files:**
- Modify: `src/bordercross.js:37-58` (`postStatus`), `src/ui/dressingroom.js:57-64` (`placeWhyLine`) and `151-162` (the places list), `src/ui/dressingroomview.js:475-486` (`onPlace`), `src/ui/nextthing.js:66-104` (rules 5, 6 and 7)
- Modify: `test/unlockorder.test.js`

**Interfaces:**
- Consumes: `areaOffer(state, catalog, id)` from Task 2. Each reader replaces its own `catalog.areas[id].requires` and `.price` reads with it; nothing else in those functions changes.

- [ ] **Step 1: Write the failing tests** in `test/unlockorder.test.js`, `describe('a kept Seaside reads the same on every screen', …)`, with `kept = load({ points: 40, edition: 'legacy', walks: { neighborhood: 3, park: 2, docks: 1 }, unlocked: { accessories: <every accessory>, areas: ['neighborhood', 'park', 'docks'] }, area: 'docks' }).state` (keptOffers `['seaside']`, 40 🐾):

```js
it('the place card and placeWhyLine: open after the Park, 100, 60 to go', () => {
  const card = buildDressingModel(kept, CATALOG).places.find((p) => p.id === 'seaside');
  expect(card).toMatchObject({ locked: false, price: 100, canBuy: false, lockLine: '100 🐾 — keep exploring!' });
  expect(placeWhyLine(kept, CATALOG, 'seaside')).toBe('60 more 🐾 to go');
});
it("the home line at the Docks does not say the Seaside opens after one more explore", () => {
  expect(nextThing(kept).text).not.toContain('Seaside');
});
it('a post that names the Seaside reads the kept price, not the new one', () => {
  // the catalog's gate would count this Docks explore (1 + 1) and ask 200
  expect(postStatus({ to: 'seaside' }, kept, CATALOG, 'docks')).toMatchObject({ kind: 'locked', line: '🔒 Seaside needs 100 🐾' });
});
it("the Get it? card asks for the kept price", () => {
  // createDressingRoom over a real progression with the kept save (as test/spendconfirm.test.js does), points 150
  dr.handleClick(click({ drPlaceBuy: 'seaside' }));
  expect(asks[0]).toMatchObject({ text: 'Open Seaside for 100 🐾?', note: 'You’ll have 50 🐾 left.' });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run test/unlockorder.test.js`
Expected: FAIL (the readers still use the catalog: the card says locked, the home line names the Seaside, the post and the card ask for 200).

- [ ] **Step 3: Switch each reader to `areaOffer`** in the files listed. In `nextthing.js`, `gate(id)`, `open(id)` and rule 7's filter and price sort read `areaOffer(s, catalog, id)`; rule 6's walk up the chain (`areas[via].requires`) reads `areaOffer(s, catalog, via).requires`. In `dressingroomview.js`, `onPlace` takes `price` from `areaOffer(progression.state, catalog, id)`.

- [ ] **Step 4: Run it to see it pass, with the neighbours**

Run: `npx vitest run test/unlockorder.test.js test/bordercross.test.js test/dressingroom.test.js test/dressingroomcontroller.test.js test/spendconfirm.test.js test/nextthing.test.js test/clanpicker.test.js test/serieswords.test.js test/serieswords.tutorial.test.js`
Expected: PASS, with no fixture change (`git status test/fixtures` clean).

- [ ] **Step 5: Run the full suite once**

Run: `npx vitest run`
Expected: every file passes. A failure in a file this plan did not list is a pin of the old order or of the save's keys this plan missed: fix it the way Task 1 Step 5 or Task 2 Step 5 did, and say so in the hand-back.

- [ ] **Step 6: Commit**

```bash
git add src/bordercross.js src/ui/dressingroom.js src/ui/dressingroomview.js src/ui/nextthing.js test/unlockorder.test.js
git commit -m "World map step 1: the place cards, home line, border posts and Get it? card all read a place's offer through areaOffer

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 7: Hand back to the owner** (no merge, no push: those need his yes): the three commit hashes, the full-suite count, and the fixture lines that moved in Task 1 Step 7, quoted, so he sees every child-facing sentence that changed.

---

## Self-review

- Spec coverage: Docks 100 after 2 Park (Task 1); Seaside 200 after 2 Docks (Task 1); saves keep every place, Seaside-without-Docks (Task 2); open-to-buy Seaside grandfathered (Task 2) and read alike everywhere (Task 3); the Park's home line names Farm, Fairground, Docks in the three-place words (Task 1); every pin of the old order and the word tables' fixtures (Task 1 Steps 5 and 7, Task 2 Step 5, Task 3 Step 5).
- Names: `areaOffer`, `KEPT_OFFERS`, `keptOffersOnLoad`, `keptOffers` are the same in every task.
- Not in this plan (later steps): the map screen, gateways, Legacy retirement.
