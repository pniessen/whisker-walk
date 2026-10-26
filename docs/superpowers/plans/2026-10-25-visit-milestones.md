# Visit Counter and Milestone Celebrations — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Count every time the game is opened, show the count on the home screen, and celebrate visits 1, 5, 10, 20, 30, … with confetti and a win-only cat accessory.

**Architecture:** A new pure module `src/visits.js` owns the schedule: which visits are milestones, which prize and which celebration style each one gets. `src/progression.js` owns the save fields and one `recordVisit()` call that counts the visit and grants the prize in a single save. A new `src/ui/visitcelebration.js` draws the three celebration styles. `homebase.js` and `main.js` wire it in ahead of the other cards that show when the game opens.

**Tech Stack:** Three.js 0.185, Vite 8, Vitest 4, plain DOM and CSS. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-25-whisker-walk-visit-milestones-design.md`

## Global Constraints

- No new dependencies (Three.js, Vite, Vitest, Supabase JS only).
- `SAVE_VERSION` stays 4. New fields get a default and a sanitizer with a ceiling.
- Works with no network.
- Confetti is DOM/CSS over the home screen, with a capped number of pieces. No WebGL effect.
- Add-only: nothing ever lowers `visits` or `visitPrizesSeen`, and nothing removes a won prize.
- No progress meter and no "N more visits" text anywhere.
- No guilt copy ("Where were you?"). Warm, never needy.
- Prizes can't be bought, traded, or given by redeem codes.
- Neither kid's visit count is ever shown to the other.
- Anything interpolated into `innerHTML` is escaped with `escapeHtml` (the existing util).
- Run the whole suite with `npm test`. It must pass at the end of every task.

## Review Focus

1. **A prize at price 0 being buyable.** `canBuy` checks `points >= price`, so a prize with no price would be free in the shop. Expect `canBuy('accessories', prizeId)` to be false always. (Task 2)
2. **A reload or closed tab between unwrapping and the tap (styles A and C).** Expect the prize to be owned already and worn on the next open. (Task 2)
3. **A hostile or old cloud payload** with `visits: 1e15`, `visitPrizesSeen: 'x'`, `visitPrizePending: '__proto__'`, or a cloud save older than local. Expect clamping, counts that never go down, and prizes rebuilt. (Task 2)
4. **The sibling pressing Start, or the colony news pull landing, mid-celebration.** Expect the celebration to close, the prize to be worn, and the news to show after it, not over it or never. (Tasks 6 and 7)
5. **A partner payload offering a prize in a trade.** Expect the trade to be ignored for that item and nothing added. (Task 3)

---

### Task 1: The visit schedule (`src/visits.js`)

**Files:**
- Create: `src/visits.js`
- Test: `test/visits.test.js`

**Interfaces:**
- Produces:
  - `VISIT_PRIZES: readonly string[]`, the 10 prize accessory ids in award order:
    `['partycrown', 'confetticape', 'starshades', 'leafcrown', 'balloonbunch', 'sparklecollar', 'warpaint', 'candlehat', 'streamerscarf', 'goldbooties']`
  - `isMilestone(n: number) → boolean`
  - `milestoneIndex(n: number) → number`: the index for a milestone visit, `-1` otherwise.
  - `latestMilestoneUpTo(n: number) → number`: the largest milestone ≤ n, or `0`.
  - `styleFor(index: number) → 'A' | 'B' | 'C'`
  - `prizeFor(index: number) → { id: string, isNew: boolean }`
  - `prizesWonBy(seen: number) → string[]`: prize ids whose milestone ≤ `seen`.
  - `prizeVisit(id: string) → number | null`: the visit that awards that prize.
  - `welcomeLine(n: number) → string`: the line for an ordinary visit.
  - `confettiCount(visit: number) → number`
- The module imports nothing (pure, so `progression.js` can import it).

- [ ] **Step 1: Write the failing tests**

```js
import { describe, it, expect } from 'vitest';
import { VISIT_PRIZES, isMilestone, milestoneIndex, latestMilestoneUpTo, styleFor, prizeFor, prizesWonBy, prizeVisit, welcomeLine, confettiCount } from '../src/visits.js';

describe('visit schedule', () => {
  it('milestones are 1, 5, then every 10', () => {
    expect([1, 5, 10, 20, 30, 90, 100, 1000].every(isMilestone)).toBe(true);
    expect([0, 2, 4, 6, 9, 11, 15, 25, 99, -10, 1.5, NaN].some(isMilestone)).toBe(false);
  });
  it('indexes milestones in order', () => {
    expect([1, 5, 10, 20, 30, 80, 90, 100].map(milestoneIndex)).toEqual([0, 1, 2, 3, 4, 9, 10, 11]);
    expect(milestoneIndex(7)).toBe(-1);
  });
  it('finds the latest milestone at or below n', () => {
    expect([0, 1, 4, 5, 9, 10, 19, 35, 100].map(latestMilestoneUpTo)).toEqual([0, 1, 1, 5, 5, 10, 10, 30, 100]);
  });
  it('visit 1 is the cat greeting, then A, B, C rotate', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(styleFor)).toEqual(['C', 'A', 'B', 'C', 'A', 'B', 'C']);
  });
  it('gives each prize once, then cycles back through owned ones', () => {
    expect(prizeFor(0)).toEqual({ id: 'partycrown', isNew: true });
    expect(prizeFor(9)).toEqual({ id: 'goldbooties', isNew: true });
    expect(prizeFor(10)).toEqual({ id: 'partycrown', isNew: false });
    expect(prizeFor(21)).toEqual({ id: 'confetticape', isNew: false });
  });
  it('lists prizes won up to a milestone', () => {
    expect(prizesWonBy(0)).toEqual([]);
    expect(prizesWonBy(5)).toEqual(['partycrown', 'confetticape']);
    expect(prizesWonBy(500)).toEqual(VISIT_PRIZES);
  });
  it('knows which visit awards a prize', () => {
    expect(prizeVisit('partycrown')).toBe(1);
    expect(prizeVisit('starshades')).toBe(10);
    expect(prizeVisit('goldbooties')).toBe(80);
    expect(prizeVisit('bell')).toBe(null);
  });
  it('welcome lines name the visit and never guilt', () => {
    for (let n = 2; n < 40; n++) {
      expect(welcomeLine(n)).toContain(String(n));
      expect(welcomeLine(n)).not.toMatch(/where were you|missed a day|finally/i);
    }
  });
  it('confetti is bigger on 10, 50 and 100, and capped', () => {
    expect(confettiCount(10)).toBeGreaterThan(confettiCount(20));
    expect(confettiCount(50)).toBeGreaterThan(confettiCount(30));
    expect(confettiCount(1)).toBeLessThan(confettiCount(20));
    expect(Math.max(...[1, 5, 10, 50, 100, 1000].map(confettiCount))).toBeLessThanOrEqual(160);
  });
});
```

- [ ] **Step 2: Run the tests and see them fail**

Run: `npx vitest run test/visits.test.js`
Expected: FAIL, cannot resolve `../src/visits.js`.

- [ ] **Step 3: Implement `src/visits.js`**

Index rule: `1 → 0`, `5 → 1`, `n ≥ 10 → n / 10 + 1`. `styleFor(0) = 'C'`, otherwise `['A','B','C'][(index - 1) % 3]`. `prizeFor(i)` returns `VISIT_PRIZES[i % 10]`, with `isNew` true when `i < 10`. Non-integer or negative input is never a milestone. Give `welcomeLine` four or five warm lines picked by `n % lines.length`, for example `Welcome back! Visit ${n} 🐾` and `Visit ${n}. Your cat missed you.` Confetti counts: visit 1 → 40, visits 10, 50 and every 100 → 160, other milestones → 90.

- [ ] **Step 4: Run the tests and see them pass**

Run: `npx vitest run test/visits.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/visits.js test/visits.test.js
git commit -m "feat(visits): the milestone schedule, prizes and styles"
```

---

### Task 2: Prizes in the catalog and visits in the save (`src/progression.js`)

**Files:**
- Modify: `src/progression.js` (CATALOG.accessories at ~L216; `defaultState` ~L330; `sanitizeState` ~L737; the `api` object: `canBuy` ~L1013, `redeemCode` ~L947, `replaceFromPayload` ~L1701)
- Test: `test/progression.visits.test.js` (new file, in the style of `test/progression.redeem.test.js`)

**Interfaces:**
- Consumes: everything from Task 1.
- Produces:
  - Ten new `CATALOG.accessories` entries, each `{ name, slot, price: 0, prize: true }`:
    `partycrown` Party Crown/head · `confetticape` Confetti Cape/body · `starshades` Star Sunglasses/face · `leafcrown` Leaf Crown/head · `balloonbunch` Balloon Bunch/back · `sparklecollar` Sparkle Collar/collar · `warpaint` Clan War Paint/face · `candlehat` Birthday-Candle Hat/head · `streamerscarf` Streamer Scarf/neck · `goldbooties` Golden Paw Booties/feet
  - `export function isPrizeAccessory(id) → boolean`
  - `export function isTradeableAccessory(id) → boolean`: a known accessory that is not a starter and not a prize. Task 3 uses it.
  - State fields: `visits` (int, default 0), `visitPrizesSeen` (int, default 0), `visitPrizePending` (prize id or `null`).
  - `api.recordVisit() → { visits: number, milestone: null | { visit, index, style, prize: { id, name, slot, isNew } } }`
  - `api.wearPendingVisitPrize() → string | null`: equips and clears the pending prize, and returns its id.

- [ ] **Step 1: Write the failing tests**

Use an in-memory storage object (`{ getItem, setItem }` over a `Map`), as the existing progression tests do. Tests to write, with the exact assertions:

```js
it('a fresh save counts its first visit and wins the Party Crown, held for the tap', () => {
  const p = createProgression(memStorage());
  const r = p.recordVisit();
  expect(r.visits).toBe(1);
  expect(r.milestone).toMatchObject({ visit: 1, index: 0, style: 'C', prize: { id: 'partycrown', isNew: true } });
  expect(p.isUnlocked('accessories', 'partycrown')).toBe(true);       // owned at once: never lost
  expect(p.state.equipped.head).toBe(null);                           // style C: worn on tap
  expect(p.state.visitPrizePending).toBe('partycrown');
  expect(p.wearPendingVisitPrize()).toBe('partycrown');
  expect(p.state.equipped.head).toBe('partycrown');
  expect(p.state.visitPrizePending).toBe(null);
});
it('style B is worn immediately, replacing the slot but keeping the old item', () => { /* visits=9 + crown head equipped → recordVisit: visit 10, style B, starshades on face; set face to 'glasses' first and expect glasses still owned */ });
it('ordinary visits count but do not celebrate', () => { /* visits 2..4 → milestone null; visitPrizesSeen stays 1 */ });
it('three opens in an afternoon are three visits', () => { /* three recordVisit() on three createProgression() over one storage → visits 3 */ });
it('a pending prize from a closed tab is worn on the next open', () => {
  const s = memStorage();
  createProgression(s).recordVisit();                 // visit 1, pending partycrown
  const p = createProgression(s);                     // the tab was closed before the tap
  p.recordVisit();
  expect(p.state.equipped.head).toBe('partycrown');
  expect(p.state.visitPrizePending).toBe(null);
});
it('a skipped milestone celebrates only the latest and still grants the ones before it', () => { /* save with visits:18, visitPrizesSeen:10 → set visits to 34 via payload → recordVisit (35) → milestone.visit 30, prize balloonbunch; leafcrown (20) also owned */ });
it('after prize 10 the cycle shows an owned prize without granting or equipping', () => { /* visits:89, seen:80 → recordVisit → visit 90, prize { id:'partycrown', isNew:false }; equipped unchanged; pending null */ });
it('prizes are never for sale', () => {
  const p = createProgression(memStorage());
  p.addPoints(10000);
  for (const id of VISIT_PRIZES) { expect(p.canBuy('accessories', id)).toBe(false); expect(p.buy('accessories', id)).toBe(false); }
});
it('a redeem code cannot grant a prize', () => { /* redeemCode(validHash, { accessories: ['partycrown'] }) → not owned, items has no prize */ });
it('old saves start at zero', () => { /* a v4 payload without the fields → visits 0, seen 0, pending null */ });
it('sanitizes hostile values', () => { /* visits:1e15 → ≤ 1_000_000; visits:'7' → 0; visitPrizesSeen:-3 → 0; visitPrizePending:'__proto__' → null; visitPrizePending:'bell' → null */ });
it('rebuilds won prizes on load', () => { /* payload visitPrizesSeen:20 with unlocked.accessories lacking prizes → partycrown, confetticape, starshades, leafcrown owned */ });
it('loading an older cloud save never lowers the count or strips a prize', () => {
  const p = createProgression(memStorage());
  for (let i = 0; i < 12; i++) p.recordVisit();          // visits 12, seen 10, three prizes
  p.replaceFromPayload({ version: 4, visits: 3, visitPrizesSeen: 1 });
  expect(p.state.visits).toBe(12);
  expect(p.state.visitPrizesSeen).toBe(10);
  expect(p.isUnlocked('accessories', 'starshades')).toBe(true);
});
```

- [ ] **Step 2: Run the tests and see them fail**

Run: `npx vitest run test/progression.visits.test.js`
Expected: FAIL, `recordVisit is not a function`.

- [ ] **Step 3: Implement**

- Add the ten catalog entries. Add a `VISITS_MAX = 1_000_000` ceiling constant next to `STREAK_COUNT_MAX`, with a one-line comment.
- `sanitizeState`: clamp `visits` and `visitPrizesSeen` with `Math.min(VISITS_MAX, asFiniteNonNegInt(...))`. Keep `visitPrizePending` only if `isPrizeAccessory(v)`. Then add every id in `prizesWonBy(visitPrizesSeen)` to `unlockedAcc` if missing (the rebuild). Old saves going through `migrateV3ToV4` end up in `sanitizeState` too, so they get the defaults.
- `canBuy`: return false when `item.prize`.
- `redeemCode`: `continue` past any prize id (no unlock, no refund).
- `recordVisit()`, in this order and in one `save()`:
  1. If `visitPrizePending` is set, equip it and clear it.
  2. `visits += 1`, capped at `VISITS_MAX`.
  3. `m = latestMilestoneUpTo(visits)`. If `m <= visitPrizesSeen`, return `{ visits, milestone: null }`.
  4. Otherwise set `visitPrizesSeen = m` and add the missing `prizesWonBy(m)` ids to owned.
  5. `index = milestoneIndex(m)`, `style = styleFor(index)`, `prize = prizeFor(index)`. If `prize.isNew`: in style B, equip it now; in A or C, set `visitPrizePending = prize.id`.
- `wearPendingVisitPrize()`: equip the pending prize (reuse `equipAccessory`), clear it, save, return the id (or `null` when nothing is pending).
- `replaceFromPayload`: read local `visits` and `visitPrizesSeen` before replacing. After `adopt`, set each to the max of local and loaded, add the missing `prizesWonBy(visitPrizesSeen)` ids, and `save()`.

- [ ] **Step 4: Run the new tests and the whole suite**

Run: `npx vitest run test/progression.visits.test.js && npm test`
Expected: PASS. Any existing test that counts `CATALOG.accessories` or lists every accessory (`test/dressingroom.test.js` L78, L119) may need updating only if Task 5 changes the count. Leave them alone here; they should still pass.

- [ ] **Step 5: Commit**

```bash
git add src/progression.js test/progression.visits.test.js
git commit -m "feat(visits): count visits and grant prizes in the save"
```

---

### Task 3: Prizes stay with the kid who won them (trading, redeem script)

**Files:**
- Modify: `src/progression.js` `applyColonyTrades` (~L1611)
- Modify: `src/game/colonysync.js:66` (`isTradeable`)
- Modify: `src/ui/colonypanel.js:405-406, 438-440`
- Modify: `scripts/make-code.mjs` `validateReward` (~L85)
- Test: `test/colony.test.js` or `test/progression.test.js` (wherever `applyColonyTrades` is tested now), `test/colonypanel.test.js`, `test/colonysync.test.js`, `test/makecode.test.js`

**Interfaces:**
- Consumes: `isTradeableAccessory`, `isPrizeAccessory` (Task 2).

- [ ] **Step 1: Write the failing tests**

- `applyColonyTrades`: an accepted trade where I give `partycrown` (owned) for `glasses` → `partycrown` stays owned. An accepted trade where the partner gives me `starshades` → `starshades` is not added. In both cases the trade id still goes into `tradesApplied`, so it never reapplies.
- `colonysync`: the pushed wardrobe never contains a prize id, even when the save owns three. Proposing a trade with `give: 'partycrown'` resolves `{ ok: false, status: 'bad' }`.
- `colonypanel`: when the save owns `partycrown`, the swap form's give options don't include it, and a partner wardrobe listing `starshades` doesn't offer it. A received offer naming a prize renders `"… can't be swapped"`, the same as a starter.
- `make-code`: `validateReward({ points: 0, accessories: ['partycrown'], cats: [], label: '' })` returns one message containing `partycrown` and `visit prize`.

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run test/colonysync.test.js test/colonypanel.test.js test/makecode.test.js test/progression.test.js`
Expected: FAIL on the new cases.

- [ ] **Step 3: Implement**

Replace each `STARTER_ACCESSORIES.includes(x)` trade check with `!isTradeableAccessory(x)`. In `applyColonyTrades`, the remove branch needs `isTradeableAccessory(eff.remove)` and the add branch needs `!isPrizeAccessory(eff.add)`. In `make-code.mjs`, add the message `"<id>" is a visit prize, so a code can't give it.`

- [ ] **Step 4: Run the suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/progression.js src/game/colonysync.js src/ui/colonypanel.js scripts/make-code.mjs test/
git commit -m "feat(visits): prizes can't be traded or given by codes"
```

---

### Task 4: The ten prize models (`src/cat/model.js`)

**Files:**
- Modify: `src/cat/model.js`. Cat branches go in `buildCat` (~L838 head, ~L873 face, ~L907 neck, ~L946 body, ~L1005 back, ~L1043 feet, and the collar style via `buildCollar` ~L234). Chicken branches go in `buildChicken` (~L372–470) for the collar, head, face and neck prizes only, since the chicken has no body, back or feet accessories.
- Modify: `src/thumbnails.js` only if a back item needs the camera offset that `backpack`/`jetpack` get (L83).
- Test: `test/catmodel.test.js`

**Interfaces:**
- Consumes: the catalog ids and slots from Task 2.

- [ ] **Step 1: Write the failing test**

```js
import { VISIT_PRIZES } from '../src/visits.js';
it.each(VISIT_PRIZES)('prize %s adds geometry to the cat', (id) => {
  const slot = CATALOG.accessories[id].slot;
  const bare = meshCount(buildCat('tabby'));
  const worn = meshCount(buildCat('tabby', { collar: null, head: null, face: null, neck: null, body: null, back: null, feet: null, [slot]: id }));
  expect(worn).toBeGreaterThan(bare);
});
it.each(VISIT_PRIZES.filter((id) => ['collar', 'head', 'face', 'neck'].includes(CATALOG.accessories[id].slot)))(
  'prize %s fits Hagrid', (id) => { /* same, with buildCat('hagrid', …) */ });
```

(`meshCount` counts `isMesh` objects via `traverse`. If the file already has a helper like this, use it.)

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run test/catmodel.test.js`
Expected: FAIL for all ten.

- [ ] **Step 3: Build the ten models**

Use the existing helpers (`ball`, `mat`, Three.js primitives) and the existing low poly counts. Each prize must read differently from its nearest shop item:

- Party Crown: gold points, unlike the Flower Crown's petals.
- Confetti Cape: dotted, unlike the Superhero Cape.
- Star Sunglasses: star-shaped lenses.
- Leaf Crown: green leaf ring.
- Balloon Bunch: three balloons, unlike the one Party Balloon.
- Sparkle Collar: a new `buildCollar` style with small bright beads.
- Clan War Paint: thin stripes on the cheeks.
- Birthday-Candle Hat: a small cake with a candle and flame.
- Streamer Scarf: a multicolour scarf.
- Golden Paw Booties: gold booties.

Add new colour constants at the top with the others.

- [ ] **Step 4: Run the suite and eyeball the thumbnails**

Run: `npm test`
Expected: PASS. Then run `npm run dev`, open `verify-dressingroom.html`, give the save every prize from the console, and check each one on the hero cat and in its picker thumbnail.

- [ ] **Step 5: Commit**

```bash
git add src/cat/model.js src/thumbnails.js test/catmodel.test.js
git commit -m "feat(visits): models for the ten visit prizes"
```

---

### Task 5: The dressing room shows prizes, and teases unwon ones (`src/ui/dressingroom.js`)

**Files:**
- Modify: `src/ui/dressingroom.js`, `renderSlotPickerHtml` (~L125) and the totals in `buildDressingModel` (~L112)
- Modify: `src/style.css` (a `.dr-pick.prize-surprise` rule)
- Test: `test/dressingroom.test.js`

**Interfaces:**
- Consumes: `prizeVisit` (Task 1), `prize` flag (Task 2).

- [ ] **Step 1: Write the failing tests**

- An unowned prize renders a `div.dr-pick.prize-surprise` containing `A surprise at visit 20` (for `leafcrown`), with no `data-dr-acc` attribute, no price, and no Try on.
- An owned prize renders exactly like an owned shop item: a `Wear` button, or `On ✓` when worn.
- `accessoryTotal` equals the number of non-prize accessories. `ownedAccessories` counts only owned non-prize ones, even when the save owns prizes.
- Update the existing L78 "lists every accessory in the slot" test, if needed, so it still counts every tile, surprises included.

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run test/dressingroom.test.js`

- [ ] **Step 3: Implement**

In `renderSlotPickerHtml`, branch on `a.prize && !owned` before the locked branch: `<div class="dr-pick locked prize-surprise">🎁<span>A surprise at visit ${prizeVisit(id)}</span></div>`. The `dr-pick` class keeps it in the grid, and the missing `data-dr-acc` means the controller ignores taps on it. Filter prize ids out of both totals.

- [ ] **Step 4: Run the suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/dressingroom.js src/style.css test/dressingroom.test.js
git commit -m "feat(visits): won prizes in the dressing room, wrapped surprises for the rest"
```

---

### Task 6: The celebration card (`src/ui/visitcelebration.js`)

**Files:**
- Create: `src/ui/visitcelebration.js`
- Modify: `src/style.css` (a block headed `/* Visit celebrations (src/ui/visitcelebration.js) */`)
- Test: `test/visitcelebration.test.js`

**Interfaces:**
- Consumes: `confettiCount` (Task 1). Takes the `milestone` object returned by `recordVisit` (Task 2).
- Produces:
  - `celebrationHtml(milestone, { petName }) → string`: pure, escaped.
  - `createVisitCelebration(mount, { onOpen, onWear, onClose, setTimer = setTimeout, clearTimer = clearTimeout }) → { show(milestone, { petName }) → boolean, close(reason: 'done' | 'walk'), isOpen() → boolean }`
    - `onOpen(milestone)`: the present was tapped (A, C), or B was shown. Main uses it to wear the pending prize and play the fanfare.
    - `onWear(id)`: the "Wear it" button on a cycle-back celebration.
    - `onClose(reason)`: always called exactly once per `show`.

Copy, fixed by the spec (`N` is the visit number, `X` the prize name, and `petName` falls back to "your cat"):

| Style | New prize | Cycle-back (isNew false) |
|---|---|---|
| A | "Visit #N!", "You've come back N times!", 🎁 "Open it!" → "It's a X!", "Yay!" closes | "Visit #N!", "Remember this? You looked great in it!", X, "Wear it" + "Yay!" |
| B | "Visit N! Your cat got a X. It's already on!" (auto-fades after ~5 s) | "Visit N! Remember your X? You looked great in it!" + an optional "Wear it" that never blocks Start |
| C | bubble "You came back! This is our Nth visit. I found something for you…", 🎁 button → bubble "It's a X!" (closes ~3 s later) | bubble "You came back! Visit N! Remember this? You looked great in it!" + X + "Wear it" |

Visit 1's C bubble says "You came back!" only from the second visit on. For visit 1 use "Hi! This is our first visit together. I found something for you…".

- [ ] **Step 1: Write the failing tests** (jsdom, a detached mount, fake timers)

- `celebrationHtml` escapes a pet name `<b>x</b>` (no raw `<b>` in the output). The output contains the visit number. A cycle-back contains "Remember this" or "Remember your".
- Style A: `show` mounts a dimmed element (`.visit-cel.style-a`). Clicking `[data-vc="open"]` calls `onOpen` once and shows the prize name. Clicking `[data-vc="done"]` removes the element and calls `onClose('done')` once.
- Style B: `show` calls `onOpen` immediately. The element has no dimmer (no `.visit-cel-dim`). After the fade timers run, it is removed and `onClose('done')` is called.
- Style C: the 🎁 button calls `onOpen`.
- A cycle-back in any style: `[data-vc="wear"]` calls `onWear(prize.id)` and nothing else changes.
- `close('walk')` while A is up (before the tap) removes the element and calls `onClose('walk')`. `onOpen` is not called by the card; main handles wearing in `onClose`.
- Confetti: the element has exactly `confettiCount(visit)` `.visit-confetti i` pieces.
- A second `show` while one is open returns `false`.

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run test/visitcelebration.test.js`

- [ ] **Step 3: Implement the module and the CSS**

Follow the shape of `src/game/celebrate.js`: an injected mount and injected timers. Confetti pieces are `<i>` elements with randomized inline `left`, `animation-delay` and colour, falling by a CSS keyframe. Under `@media (prefers-reduced-motion: reduce)`, the confetti doesn't animate and is just hidden. Use the badge pink `#ff8fb1`. The card must fit a 375 px phone. In A and C, every button is at least 44 px tall.

- [ ] **Step 4: Run the suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/visitcelebration.js src/style.css test/visitcelebration.test.js
git commit -m "feat(visits): the three celebration styles with confetti"
```

---

### Task 7: The home screen and boot order (`homebase.js`, `main.js`)

**Files:**
- Modify: `src/ui/homebase.js`: `headerHtml` (~L715), `showNews` (~L508), `showNotice` (~L537), `hide()` (~L1185), and the returned API (~L1171)
- Modify: `src/main.js` (~L404–431, the boot cards)
- Modify: `src/style.css` (`.dr-chip.visit`, `.visit-welcome`)
- Test: `test/hometabs.test.js` or a new `test/homebase.visits.test.js`, if homebase's pure pieces can be reached. Otherwise test the pure helper below.

**Interfaces:**
- Consumes: `recordVisit`, `wearPendingVisitPrize` (Task 2); `createVisitCelebration` (Task 6); `isMilestone`, `welcomeLine` (Task 1).
- Produces on the homebase API:
  - `showVisit(result, { onClosed }) → boolean`: takes `recordVisit()`'s result. A milestone shows the celebration (returns true). Otherwise it shows the welcome line (returns false, and `onClosed` is not called).
  - `visitOpen() → boolean`
- Produces in `homebase.js`: `export function visitBadgeHtml(visits) → string`, which returns `''` for 0, `<div class="dr-chip visit">🐾 Visit N</div>`, or 🎉 on a milestone.

- [ ] **Step 1: Write the failing tests**

- `visitBadgeHtml(23)` contains `🐾 Visit 23`. `visitBadgeHtml(30)` contains `🎉 Visit 30`. `visitBadgeHtml(0)` is `''`.
- If homebase can be driven in jsdom (check how the existing homebase-adjacent tests set it up): while a celebration is open, `showNews` and `showNotice` return `false`, and `hide()` closes the celebration with `'walk'`.

- [ ] **Step 2: Run them and see them fail**

- [ ] **Step 3: Implement**

`homebase.js`:
- Put `visitBadgeHtml(s.visits)` right after the `<h1>` in `headerHtml`, before the points chip. Header chips stay in the header on a phone; only `statsHtml` moves into More.
- Make one `createVisitCelebration(document.body, …)`, mounted outside `root` like the news card, so `render()` can't wipe it.
  - `onOpen`: `progression.wearPendingVisitPrize()`, then `render()`.
  - `onWear`: `progression.equipAccessory(id)`, then `render()`.
  - `onClose(reason)`: `progression.wearPendingVisitPrize()` (a no-op when nothing is pending, so a mid-celebration Start still wears the prize), `render()`, then the caller's `onClosed(reason)`.
- `showNews` and `showNotice` also bail while `visitOpen()`.
- `hide()` calls `celebration.close('walk')` first.
- The welcome line is a small element over the hero stage (`.visit-welcome`). It fades after ~4 s and never blocks clicks (`pointer-events: none`).

`main.js` boot, replacing the farewell-then-news block:
```js
const visit = progression.recordVisit();   // before show(), so the badge has the number
homebase.show();
const afterCards = (reason) => {
  if (reason === 'walk') return;           // the walk's own summary pull shows the news later
  const farewell = progression.takeFarewell();
  if (farewell) homebase.showNotice(farewell);
  showColonyNews([]);                      // whatever the boot pull left in pendingRewards
};
if (!homebase.showVisit(visit, { onClosed: afterCards })) afterCards('done');
```
`pullThenNews()` still fires straight away. If it lands while the celebration is up, `showNews` returns false, `pendingRewards` keeps its rewards, and `afterCards` shows the card. Play `audio.unlockFanfare()` from the celebration's `onOpen`: pass an `onCelebrate` callback into homebase, or call it from `main.js`. Pick whichever matches how homebase gets other side effects today. The browser may keep audio silent until the first tap, which is fine.

- [ ] **Step 4: Run the suite, then check it in the browser**

Run: `npm test`
Expected: PASS. Then `npm run dev`:
- With a cleared `whisker-walk-save`, open → the badge shows `🎉 Visit 1` and style C appears. Tap 🎁 → the Party Crown is on the hero cat.
- Reload four times → the welcome line shows and nothing else. The fifth reload gives style A.
- With a save that triggers the "While you were out" card (or a stub in the console), the news shows after the celebration closes.

- [ ] **Step 5: Commit**

```bash
git add src/ui/homebase.js src/main.js src/style.css test/
git commit -m "feat(visits): visit badge, welcome line and celebrations on the home screen"
```

---

### Task 8: The verify page and a final pass

**Files:**
- Create: `verify-visits.html` (in the `verify-dressingroom.html` style: a real progression on an in-memory save, never touching localStorage)

- [ ] **Step 1: Build the page**

Buttons: "Visit 1", "5", "10", "20", "30", "90", "100" (each sets `visits` to n − 1 and `visitPrizesSeen` to the milestone before, then calls `recordVisit()` and `homebase.showVisit()`), plus "Ordinary visit", "All prizes", and "Start mid-celebration" (calls `homebase.hide()`).

- [ ] **Step 2: Walk through it in the browser**

Run: `npm run dev`, open `/verify-visits.html`. Check:
- Each style appears where the schedule says.
- Every prize shows on the hero cat.
- B and the cycle-back celebrations leave Start reachable.
- At 375 px wide (phone), the badge is visible and the card fits.
- "Start mid-celebration" leaves the prize worn.

Take a screenshot of visits 1, 10 and 90 for the hand-off.

- [ ] **Step 3: Full suite and build**

Run: `npm test && npm run build`
Expected: all tests pass, and the build succeeds with no new warnings.

- [ ] **Step 4: Commit**

```bash
git add verify-visits.html
git commit -m "test(visits): a verify page for every celebration and prize"
```
