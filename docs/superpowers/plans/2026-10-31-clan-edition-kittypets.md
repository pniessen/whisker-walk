# Clan Edition: Kittypets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In Clan Edition, twelve of the old strays (and Duchess) become kittypets: they read "Marmalade the kittypet", wear a collar, show "once a kittypet called Marmalade" on the Colony card, and now and then one wanders into a clan territory where a kid can befriend it and bring it home through the existing feeding and taming.

**Architecture:** Everything is derived from a cat's stored name, so nothing new is stored, sent or synced. One new pure module, `src/housecats.js`, holds the kittypet rules (collars, the wander roll, the wanderer's spot, the toast lines). The wanderer is a stray "extra", the same mechanism the legendary cats use: decided outside `walkRng`, drawn from its own stream, placed by a pure function of the map. "Bringing it home" is the ordinary feed: the first feed records it as a colony cat at its spot in that territory, and six feeds (less a head start) tame it into the den. **No server change.**

**Tech Stack:** Three.js 0.185, Vite 8, Vitest 4, plain ES modules.

**Spec:** `docs/superpowers/specs/2026-10-31-editions-and-territories-design.md`: "Owner's answers" (decisions 1, 6, 9), §1's "What differs" table ("Some strays" row), §2 Kittypets, §3 "Twolegplace, and kittypets who wander", §8 step 3. The clan spec (`docs/superpowers/specs/2026-10-25-whisker-walk-v21-the-clan-design.md`) §6.2 and §8 still hold.

## Global Constraints

- **Legacy Edition never changes**: no "kittypet" word, no collar, no "once a kittypet" line. The wanderer still appears in Legacy in a co-walk (spawns must not depend on the edition), but it reads as plain "Marmalade".
- **Nothing takes a kid's progress away.** No cat un-tames, no cat is dropped, no stored name changes. `SAVE_VERSION` stays 4. **This plan adds no save field at all.** Everything is derived from the stored name.
- **The caps don't move:** `COLONY_MAX` 24 and `SOLO_MAX` 12. A wanderer joins the colony only through `feedColonyCat`, so a full colony refuses it with the existing 'full' answer.
- **Nothing new on the wire.** The wanderer is a local extra decided from the UTC date, the area and the shared colony (decision 6).
- **`CAT_NAMES` is untouched** (its length drives the seeded shuffle). `KITTYPET_NAMES` is a subset of the existing names.
- **`walkRng` is never drawn from.** The strays' own stream (`strayStream`) isn't drawn from by anything new either. The wanderer uses its own `mulberry32`, as the legendary extra does.
- **Borrowed words live only in `src/clanwords.js`.** The scan in `test/clanwords.test.js` flags any `src/` string literal containing `kittypet`, `Twolegplace`, `Clan` and the rest. So `src/` code never writes `'kittypet'` as a literal, not even as a key. Use `OUTSIDE_WORDS.house` and `PLACE_WORDS.town` by reference. (The module is called `housecats.js` for the same reason.)
- **Spawns don't depend on the edition**: which cats spawn, where, and the wanderer roll. Only the words and the collar (a decoration with no collider) may vary.
- **Tests assert membership, never whole lists of territory ids**, so they survive the Moor, the Pines and Swamp and the island landing.
- Commit with an explicit `git add <files>`. Messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Test command: `npx vitest run --exclude '.claude/**' --exclude '.worktrees/**'`.

## Defaults this plan picks (owner to confirm; each is a one-line change)

1. **The kittypets:** **Baron von Fluff, Sir Pounce, Marmalade, Biscuit, Mochi, Clementine, Petunia, Butterscotch, Truffle, Custard, Peaches, Waffles**, plus **Duchess**. This is the spec §2 list. Duchess is a kittypet in the words and the collar, but she never wanders: she stays the Neighborhood's legendary cat, with her own find rules. Only Biscuit is shy (`isShy`), so with a partner she needs both kids to feed her, as today.
2. **The collar:** the shop's **Bell Collar** (`bell`: red band, gold bell) on every kittypet. Duchess wears the **Heart Charm Collar** (`heart`), the grandest look. Clan Edition only. A kittypet wears it only while it is outside the kid's colony: once it has been fed it is "joining the clan" and wears whatever its finder gives it, as Rusty lost his collar. The collar meshes never cast shadows.
3. **How often, and where:**
   - Each **UTC day, each territory a Twolegplace path reaches (the Woods, the River and Marshes, the Moor)** has a 1-in-5 chance of a wanderer. A Twolegplace path reaches each of these (spec §3).
   - On a wander day the same kittypet is there on every walk that day, so a kid who meets it can come back.
   - At most one per walk. Never in Twolegplace, the Pines and Swamp, the island, the Gorge, the Park, the Seaside, the Docks or the den.
   - It stands about 6 m in from the walk's arrival point, which is on the Twolegplace path in each of these maps.
   - It never turns cross when greeted. A kittypet already in the shared colony doesn't wander (the same rule as the legendary cats).
4. **What befriending takes:** exactly today's rules, nothing new.
   - Greet it (met, friend, best friend), then **feed it once** while you're there. That makes it a colony cat that "waits for you here" at its spot in that territory, on every later walk.
   - Five more feeds on later walks tame it (fewer with a head start from earlier greets), and it moves into the den.
   - The first feed needs that territory's colony feeding to be switched on. The Woods and the River have it today. In the Moor you can only greet until the Moor's own step adds `'moor'` to `COLONY_AREAS`.
5. **Wording:**
   - Clan Edition: "You met Marmalade the kittypet! ♡".
   - A cross kittypet gets no outsider word at all (never "the rogue"; she stays a kittypet).
   - On arrival: "Marmalade the kittypet has wandered in from Twolegplace 🔔" (Legacy: "Marmalade has wandered in from the Cozy Neighborhood 🔔").
   - On the first feed: "Marmalade will wait for you here in The Woods 🐾".
   - On taming, in Clan Edition: "Marmalade left Twolegplace to join you! She'll be waiting in the den 🏠".
   - On the Colony card: "*Amberpaw*: once a kittypet called Marmalade".
   - A kittypet on the Colony card is never a "-kit": it starts at "-paw".

**Not in this plan:**
- §2 rule 7's home-screen line ("Robbie, a kittypet who walks with …") needs the clan names from the "pick your clan" step, so it waits for that step.
- "Den" → "Camp" is a later words step.

## Overlaps with parallel work

- **`src/clanwords.js`** (also edited by the "pick your clan" plan): **one additive key**, `OUTSIDE_WORDS.house = 'kittypet'`. No other line changes.
- **`src/edition.js`**: **not edited.** This plan only imports `isClanEdition` and `placeName`.
- **`src/cat/model.js`** (the cat body/builder work may be touching it): one line, `collar.name = 'collar'` in `buildCat`'s collar block (~line 1010). Rebase onto whichever lands first.
- **`src/game/walk.js`** (the Moor branch `moor` registers its area elsewhere in this file): the edit is confined to the legendary/extras block (~lines 790–815) and one toast after `hud.setArea` (~line 1525).
- **`src/colony.js`**: only `outsideTag` changes. `COLONY_AREAS` is not touched; the Moor branch adds `'moor'` there.
- **Territory builds (Moor, Pines and Swamp, island):** nothing to do for them. `WANDER_AREAS` already lists `'moor'`, which is harmless until the Moor is walkable. `test/wanderspot.test.js` checks each wander area whose world file exists. When the Moor lands, add one line there (Task 4 says which).
- **`test/editions.invariants.test.js`**: two new tests are appended. The existing "edition is the only new top-level key" test isn't touched (the clan-pick plan owns that line), and this plan adds no key.

## Review Focus

1. **Co-walk agreement on the wanderer.** Two devices with different stray counts (22 vs 14) or different editions must see the same wanderer at the same spot. The wanderer's name is excluded from the ordinary cast on every walk, so a 22-stray device can't also draw it at a random spot.
2. **A kittypet fixture in existing tests.** `CAT_NAMES[1..3]` (Marmalade, Baron von Fluff, Mochi) are kittypets, and older tests use them as "any cat". Where a test fails only because its fixture became a kittypet, swap the fixture to a non-kittypet name (Noodle, Pumpkin, Sardine…), not the expectation. List each swap in the commit body.
3. **A wanderer the kid holds a grudge against.** It spawns cross, as any cross stray does, and the treat makes up as today. It must never turn cross on a greet.
4. **A full colony.** Feeding a wanderer with the colony at the cap gives today's 'full' answer and no "will wait for you here" toast.
5. **The collar on a colony kittypet.** A kittypet already in the colony, tamed or not, wears its finder's accessory or nothing, never the kittypet collar. A Legacy walk shows no collar anywhere.

---

### Task 1: Kittypet names and "the kittypet" wording

**Files:**
- Modify: `src/straynames.js` (add `KITTYPET_NAMES`, `isKittypetName` after `LEGENDARY_NAMES`)
- Modify: `src/clanwords.js:184-188` (`OUTSIDE_WORDS`: add `house`)
- Modify: `src/colony.js:805-816` (`outsideTag`)
- Test: `test/housecats.test.js` (create), `test/clanwords.test.js`

**Interfaces:**
- Produces:
  - `KITTYPET_NAMES: readonly string[]` (13 names);
  - `isKittypetName(v: unknown) => boolean`, from `src/straynames.js`;
  - `OUTSIDE_WORDS.house === 'kittypet'`;
  - `outsideTag(colony, name, key, make)`. For a kittypet not in the colony, key `'met'` reads `OUTSIDE_WORDS.house` and key `'grudge'` reads `''`.

- [ ] **Step 1: Write the failing tests**

In `test/housecats.test.js`:

```js
import { test, expect } from 'vitest';
import { CAT_NAMES, KIT_NAMES, LEGENDARY_NAMES, KITTYPET_NAMES, isKittypetName, isStrayName } from '../src/straynames.js';

test('the kittypets are the spec list plus Duchess, all existing stray names', () => {
  expect([...KITTYPET_NAMES].sort()).toEqual(['Baron von Fluff', 'Biscuit', 'Butterscotch', 'Clementine', 'Custard',
    'Duchess', 'Marmalade', 'Mochi', 'Peaches', 'Petunia', 'Sir Pounce', 'Truffle', 'Waffles'].sort());
  for (const n of KITTYPET_NAMES) expect(isStrayName(n)).toBe(true);
  expect(Object.isFrozen(KITTYPET_NAMES)).toBe(true);
});
test('no kit is a kittypet, and CAT_NAMES is untouched', () => {
  for (const n of KIT_NAMES) expect(isKittypetName(n)).toBe(false);
  expect(CAT_NAMES).toHaveLength(48);
  expect([CAT_NAMES[0], CAT_NAMES[47]]).toEqual(['Pickles', 'Comet']);
  expect(LEGENDARY_NAMES.filter(isKittypetName)).toEqual(['Duchess']);
});
test('isKittypetName is total', () => {
  for (const v of [null, undefined, 3, {}, '__proto__', 'marmalade', '']) expect(isKittypetName(v)).toBe(false);
});
```

Append to `test/clanwords.test.js`:

```js
test('a kittypet reads as the kittypet, never a loner or a rogue', () => {
  const colony = { cats: [] };
  expect(OUTSIDE_WORDS.house).toBe('kittypet');
  expect(outsideTag(colony, 'Marmalade', 'met')).toBe(` the ${OUTSIDE_WORDS.house}`);
  expect(outsideTag(colony, 'Marmalade', 'grudge')).toBe('');
  expect(outsideTag(colony, 'Marmalade', 'grudge', (w) => ` a ${w} now!`)).toBe('');
  expect(outsideTag(colony, 'Pickles', 'met')).toBe(` the ${OUTSIDE_WORDS.met}`);
  expect(outsideTag({ cats: [{ name: 'Marmalade' }] }, 'Marmalade', 'met')).toBe('');
});
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run test/housecats.test.js test/clanwords.test.js`
Expected: FAIL (`KITTYPET_NAMES` is undefined; `OUTSIDE_WORDS.house` is undefined).

- [ ] **Step 3: Implement**
  - `src/straynames.js`:
    - add `export const KITTYPET_NAMES = Object.freeze([...])` (the 13 names above, the 12 in `CAT_NAMES` order, then 'Duchess');
    - add `isKittypetName(v)`, built from a Set like `isStrayName` (a Set, so `'__proto__'` is a stranger);
    - update the module header to note the subset rule ("a subset, never a new block; `CAT_NAMES` untouched").
  - `src/clanwords.js`: add `house: 'kittypet'` to `OUTSIDE_WORDS`, with a comment: "a stray who lives in Twolegplace (a kittypet name, straynames.js)". Nothing else in the file changes.
  - `src/colony.js` `outsideTag`: before the word lookup, when `isKittypetName(name)`:
    - key `'met'` becomes `'house'`;
    - key `'grudge'` returns `''`.

    Import `isKittypetName` from `./straynames.js`, which `colony.js` already imports from. Update the comment above `outsideTag`.

- [ ] **Step 4: Run the tests, then the full suite**

Run: `npx vitest run --exclude '.claude/**' --exclude '.worktrees/**'`
Expected: all PASS. If an interactions test pins "Marmalade the loner", apply Review Focus 2: swap the fixture name.

- [ ] **Step 5: Commit**

```bash
git add src/straynames.js src/clanwords.js src/colony.js test/housecats.test.js test/clanwords.test.js
git commit -m "feat(kittypets): twelve strays and Duchess read as the kittypet in Clan Edition

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The Colony card: "once a kittypet called…" and the -paw floor

**Files:**
- Modify: `src/clannames.js:79-87` (`colonyRankFor`)
- Modify: `src/ui/colonypanel.js` (`catCard`, the `titleLine`, ~lines 136–141)
- Test: `test/clannames.test.js`, `test/colonypanel.test.js`

**Interfaces:**
- Consumes: `isKittypetName`, `OUTSIDE_WORDS.house` (Task 1).
- Produces:
  - `colonyRankFor(name, progress)` now floors a kittypet at apprentice, as it already does for `KIT_NAMES`;
  - a Clan Edition card for a kittypet carries `<span class="colony-once">once a kittypet called Marmalade</span>` in its title line, in place of the bare stored name.

- [ ] **Step 1: Write the failing tests**

`test/clannames.test.js`:

```js
test('a kittypet in the colony is never a kit: it starts at apprentice, as Rusty did', () => {
  expect(colonyRankFor('Marmalade', { have: 1, tamed: false })).toBe(RANK_KEYS.apprentice);
  expect(colonyRankFor('Duchess', { have: 0, tamed: false })).toBe(RANK_KEYS.apprentice);
  expect(colonyRankFor('Pickles', { have: 1, tamed: false })).toBe(RANK_KEYS.kit);
  expect(colonyRankFor('Marmalade', { have: 6, tamed: true })).toBe(RANK_KEYS.warrior);
});
```

`test/colonypanel.test.js` (use the file's own `render`, `colonyOf`, `cat`, `feed` helpers):

```js
it('a kittypet card says once a kittypet called <name> in Clan Edition only', () => {
  const colony = colonyOf({ cats: [cat('Marmalade')], feeds: feed('Marmalade', ME, 1) });
  const clan = render(colony, { edition: 'canon' });
  expect(clan).toContain(`once a ${OUTSIDE_WORDS.house} called Marmalade`);
  expect(clan).toContain(clanNameOf('Marmalade', { have: 1 }, RANK_KEYS.apprentice)); // Amberpaw
  const legacy = render(colony, { edition: 'legacy' });
  expect(legacy).not.toContain(OUTSIDE_WORDS.house);
  expect(legacy).toMatch(/class="card-name">Marmalade<\/div>/);
});
it('a plain stray card is unchanged', () => {
  const html = render(colonyOf({ cats: [cat('Pickles')] }), { edition: 'canon' });
  expect(html).not.toContain('colony-once');
});
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run test/clannames.test.js test/colonypanel.test.js`
Expected: FAIL (the rank is still 'kit'; there's no `colony-once`).

- [ ] **Step 3: Implement**
  - `colonyRankFor`: the floor applies when `KIT_SET.has(name) || isKittypetName(name)`. Update its comment (spec §2 rule 6).
  - `catCard`: when `!legacy && isKittypetName(cat.name)`, build `stored` as `` `<span class="colony-once">once a ${OUTSIDE_WORDS.house} called ${name}</span> ` `` (where `name` is the already-escaped stored name) in place of `` `${name} ` ``. The breed span follows as before.
  - Add `.colony-once { font-style: italic; }` to `src/style.css` beside the other `.colony-*` rules.

- [ ] **Step 4: Run the full suite**

Run: `npx vitest run --exclude '.claude/**' --exclude '.worktrees/**'`
Expected: PASS. Older card tests use `B`/`C`/`D` (Marmalade, Baron von Fluff, Mochi) as "any cat". Where one fails only because of the new floor or line (for example `descriptor(...) === RANK_WORDS.kit`), swap that fixture to a non-kittypet name and note it in the commit body.

- [ ] **Step 5: Commit**

```bash
git add src/clannames.js src/ui/colonypanel.js src/style.css test/clannames.test.js test/colonypanel.test.js
git commit -m "feat(kittypets): Colony card says once a kittypet called…, kittypets start at -paw

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Collars in Clan Edition

**Files:**
- Create: `src/housecats.js`
- Modify: `src/cat/model.js:~1010` (one line: `collar.name = 'collar'`)
- Modify: `src/straycats.js` (`createStrayCats`: new `collarFor` option; collar meshes opt out of shadows)
- Modify: `src/game/walk.js:807-813` (pass `collarFor`)
- Test: `test/housecats.test.js`, `test/straycats.test.js`

**Interfaces:**
- Consumes: `isKittypetName` (Task 1), and `isClanEdition` from `src/edition.js`.
- Produces:
  - `KITTYPET_COLLAR = 'bell'`;
  - `KITTYPET_COLLARS = Object.freeze({ Duchess: 'heart' })`;
  - `collarFor(state, name) => string | null`, from `src/housecats.js` (pure, no THREE). It returns null unless `isClanEdition(state)`, `isKittypetName(name)`, and `name` isn't in `state.colony.cats`. The lookup is an own-property read.
  - `createStrayCats(..., { collarFor = () => null })`. A non-colony stray with a collar id builds with `{ collar: id }`. A colony cat (`fixed`) keeps its own wear and is never asked. Every mesh under the cat's `'collar'` group gets `userData.noCast = true`. That flag is the existing `assignShadowCastersFor` opt-out (`src/render/rig.js:388`); the sweep runs after the strays are built (walk.js ~1005).

- [ ] **Step 1: Write the failing tests**

`test/housecats.test.js`:

```js
import { collarFor, KITTYPET_COLLAR, KITTYPET_COLLARS } from '../src/housecats.js';
import { CATALOG } from '../src/progression.js';

const S = (extra = {}) => ({ edition: 'canon', colony: { cats: [] }, ...extra });
test('kittypets wear a collar in Clan Edition only, and only outside the colony', () => {
  expect(collarFor(S(), 'Marmalade')).toBe(KITTYPET_COLLAR);
  expect(collarFor(S(), 'Duchess')).toBe('heart');
  expect(collarFor(S(), 'Pickles')).toBeNull();
  expect(collarFor(S({ edition: 'legacy' }), 'Marmalade')).toBeNull();
  expect(collarFor(S({ colony: { cats: [{ name: 'Marmalade' }] } }), 'Marmalade')).toBeNull();
  expect(collarFor(null, 'Marmalade')).toBe(KITTYPET_COLLAR); // no state reads as Clan Edition
  expect(collarFor(S(), '__proto__')).toBeNull();
});
test('every collar is a shop collar', () => {
  for (const id of [KITTYPET_COLLAR, ...Object.values(KITTYPET_COLLARS)]) {
    expect(CATALOG.accessories[id].slot).toBe('collar');
  }
});
```

`test/straycats.test.js` (reuse its `fakeScene`, `AREA`, `mulberry32`):

```js
describe('createStrayCats — kittypet collars', () => {
  const collarOf = (s) => s.group.getObjectByName('collar');
  it('collarFor puts a non-casting collar on a non-colony stray, and draws nothing extra', () => {
    const calls = []; const count = (r) => () => { const v = r(); calls.push(v); return v; };
    const a = createStrayCats(fakeScene(), AREA, 22, count(mulberry32(4)));
    const n = calls.length; calls.length = 0;
    const b = createStrayCats(fakeScene(), AREA, 22, count(mulberry32(4)), { collarFor: () => 'bell' });
    expect(calls.length).toBe(n);
    expect(b.strays.map((s) => s.name)).toEqual(a.strays.map((s) => s.name));
    const c = collarOf(b.strays[0]);
    expect(c).toBeTruthy();
    c.traverse((o) => { if (o.isMesh) expect(o.userData.noCast).toBe(true); });
  });
  it('a colony cat is never given the kittypet collar', () => {
    const asked = [];
    createStrayCats(fakeScene(), AREA, 3, mulberry32(1), {
      colonyCats: [{ name: 'Marmalade', x: 1, z: 1, wear: null }], collarFor: (n) => { asked.push(n); return 'bell'; },
    });
    expect(asked).not.toContain('Marmalade');
  });
});
```

(Adapt `strays` to the actual name of the returned array in `test/straycats.test.js`.)

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run test/housecats.test.js test/straycats.test.js`
Expected: FAIL (there's no `src/housecats.js`, and no collar group).

- [ ] **Step 3: Implement**
  - `src/housecats.js`:
    - a header comment that it is pure kittypet rules, imports no THREE and writes nothing to the save;
    - the three exports above. "In the colony" means any `colony.cats` entry with that name, tamed or not; read it defensively, as `legendary.js`'s `inColony` does.
  - `src/cat/model.js`: in `buildCat`'s collar block, `collar.name = 'collar';`. `buildChicken` doesn't need it (no stray is a chicken).
  - `src/straycats.js`:
    - take `collarFor` in the options;
    - in the main loop, for a non-`fixed` stray, `const id = collarFor(name); const wear = fixedWear ?? (typeof id === 'string' ? { collar: id } : undefined);`;
    - after `buildCat`, mark every mesh under `group.getObjectByName('collar')` with `userData.noCast = true`;
    - give the extras loop the same collar rule;
    - draw nothing new from `rng`.
  - `src/game/walk.js`: pass `collarFor: (name) => collarFor(progression.state, name)` to `createStrayCats`. Import it from `../housecats.js`.

- [ ] **Step 4: Run the full suite**

Run: `npx vitest run --exclude '.claude/**' --exclude '.worktrees/**'`
Expected: PASS (`test/budget.test.js` counts world props, not strays, so it should not move).

- [ ] **Step 5: Commit**

```bash
git add src/housecats.js src/cat/model.js src/straycats.js src/game/walk.js test/housecats.test.js test/straycats.test.js
git commit -m "feat(kittypets): kittypets wear a bell collar in Clan Edition

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The wander rules (pure)

**Files:**
- Modify: `src/housecats.js`
- Test: `test/housecats.test.js`, `test/wanderspot.test.js` (create)

**Interfaces:**
- Consumes:
  - `KITTYPET_NAMES`, `CAT_NAMES` (`src/straynames.js`);
  - `seedFromCode`, `mulberry32` (`src/rng.js`);
  - `TERRITORY_AREAS` (`src/colony.js`, test only).
- Produces:
  - `WANDER_AREAS = Object.freeze(['woods', 'river', 'moor'])`;
  - `WANDER_ODDS = 1 / 5`;
  - `WANDER_NAMES`: `KITTYPET_NAMES` that are in `CAT_NAMES` (the 12; Duchess excluded);
  - `wandererFor(areaId: string, ymd: string, colonyNames: string[] = []) => string | null`:
    - `const r = mulberry32(seedFromCode(`${ymd}-wander-${areaId}`))`;
    - `u = r()`, then `pick = r()`;
    - null if the area isn't in `WANDER_AREAS`, `ymd` doesn't match `/^\d{4}-\d{2}-\d{2}$/`, or `u >= WANDER_ODDS`;
    - otherwise `candidates = WANDER_NAMES` minus `colonyNames`. Null if none, else `candidates[Math.floor(pick * candidates.length)]`;
  - `walkWanderer(state, areaId, { ymd, colonyWalk, isDen }) => string | null`:
    - null when `isDen`;
    - otherwise `wandererFor(areaId, ymd, colonyWalk ? names of state.colony.cats : [])`;
    - a colony walk is partner-only, so the colony is shared. Off one, the decision may read only the date and the area, so every co-walker agrees;
  - `WANDER_STEP = 6`;
  - `wanderStart(spawn: {x, z}) => {x, z}`: a point `WANDER_STEP` m from `spawn` toward the map's middle (0, 0), or `spawn.x - WANDER_STEP` when `spawn` is the origin. The caller passes it through `clearSpot` (Task 5).

- [ ] **Step 1: Write the failing tests**

`test/housecats.test.js`:

```js
import { WANDER_AREAS, WANDER_ODDS, WANDER_NAMES, wandererFor, walkWanderer, wanderStart, WANDER_STEP } from '../src/housecats.js';
import { TERRITORY_AREAS } from '../src/colony.js';

const days = Array.from({ length: 730 }, (_, d) => new Date(Date.UTC(2026, 0, 1) + d * 864e5).toISOString().slice(0, 10));
test('wanderers come only to territories a Twolegplace path reaches', () => {
  for (const a of WANDER_AREAS) expect(TERRITORY_AREAS).toContain(a);
  for (const a of ['woods', 'river', 'moor']) expect(WANDER_AREAS).toContain(a);
  for (const a of ['neighborhood', 'park', 'seaside', 'docks', 'den', 'pines', 'island', 'gorge', '__proto__']) {
    expect(days.some((d) => wandererFor(a, d))).toBe(false);
  }
});
test('about one day in five, per territory', () => {
  for (const a of WANDER_AREAS) {
    const rate = days.filter((d) => wandererFor(a, d)).length / days.length;
    expect(rate).toBeGreaterThan(WANDER_ODDS - 0.05);
    expect(rate).toBeLessThan(WANDER_ODDS + 0.05);
  }
});
test('the same day and territory give the same wanderer, and every one is a kittypet stray', () => {
  const seen = new Set();
  for (const d of days) {
    const w = wandererFor('woods', d);
    expect(wandererFor('woods', d)).toBe(w);
    if (w) { expect(WANDER_NAMES).toContain(w); seen.add(w); }
  }
  expect(WANDER_NAMES).not.toContain('Duchess');
  expect(seen.size).toBeGreaterThan(6);
});
test('a kittypet already in the colony does not wander on a colony walk', () => {
  const d = days.find((x) => wandererFor('woods', x));
  const w = wandererFor('woods', d);
  const state = { colony: { cats: [{ name: w }] } };
  expect(walkWanderer(state, 'woods', { ymd: d, colonyWalk: true, isDen: false })).not.toBe(w);
  expect(walkWanderer(state, 'woods', { ymd: d, colonyWalk: false, isDen: false })).toBe(w);
  expect(walkWanderer(state, 'woods', { ymd: d, colonyWalk: true, isDen: true })).toBeNull();
});
test('bad input shows nobody and never throws', () => {
  for (const ymd of [undefined, null, 5, '', '2026-1-1', 'today']) expect(wandererFor('woods', ymd)).toBeNull();
  expect(walkWanderer(null, 'woods', { ymd: days[0], colonyWalk: true })).toBe(wandererFor('woods', days[0]));
});
test('wanderStart steps WANDER_STEP metres toward the middle', () => {
  const p = wanderStart({ x: 44, z: 12 });
  expect(Math.hypot(p.x - 44, p.z - 12)).toBeCloseTo(WANDER_STEP, 5);
  expect(Math.hypot(p.x, p.z)).toBeLessThan(Math.hypot(44, 12));
});
```

`test/wanderspot.test.js`:
- Use the same headless `document` stub as `test/woods.test.js`.
- Build each wander area that has a world file today: `{ woods: '../src/world/woods.js', river: '../src/world/river.js' }`. When the Moor merges, add `moor: '../src/world/moor.js'` to this map.
- For each, `const spot = clearSpot(wanderStart(area.spawn), area.colliders, area.bounds, area.waters)`, then assert:
  - `inWater(area.waters, spot.x, spot.z)` is false (or `onDeck`), using the imports `test/water.test.js` uses;
  - the spot is inside `area.bounds`;
  - `Math.hypot(spot.x - area.spawn.x, spot.z - area.spawn.z)` is between 3 and 12;
  - every key in the builder map is in `WANDER_AREAS`.

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run test/housecats.test.js test/wanderspot.test.js`
Expected: FAIL (nothing is exported yet).

- [ ] **Step 3: Implement the exports above in `src/housecats.js`**

Header note: the roll is per UTC day and territory (spec §3 builder note), never `walkRng`, and it adds nothing on the wire.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run test/housecats.test.js test/wanderspot.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/housecats.js test/housecats.test.js test/wanderspot.test.js
git commit -m "feat(kittypets): the wander roll, one day in five per territory a Twolegplace path reaches

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The wanderer in a walk

**Files:**
- Modify: `src/straycats.js` (the extras loop, ~lines 495–535)
- Modify: `src/game/walk.js` (~lines 789–813, and the toast after `hud.setArea` ~line 1525)
- Modify: `src/game/interactions.js:1150` (the rupture gate)
- Modify: `src/housecats.js` (`wanderArrivalLine`)
- Test: `test/straycats.test.js`, `test/housecats.test.js`, `test/interactions.test.js`

**Interfaces:**
- Consumes: `walkWanderer`, `wanderStart`, `collarFor` (Tasks 3–4); `clearSpot` (`src/world/spots.js`).
- Produces:
  - `createStrayCats` extras accept `{ name, rng, spot?: {x, z}, wanderer?: true }`:
    - a kittypet name is allowed when `wanderer: true` (a legendary name is allowed as before);
    - the extra still takes its five draws from `ex.rng`, but stands at `spot`, clamped to bounds like a colony cat, when `spot` is given;
    - it gets the legend glow and star only if `isLegendaryName`;
    - it has `wanderer: true` on its stray entry (`false` on every other stray).
  - `wanderArrivalLine(name, edition, catalog) => string`:
    - Clan: `${name} the ${OUTSIDE_WORDS.house} has wandered in from ${PLACE_WORDS.town} 🔔`;
    - Legacy: `${name} has wandered in from ${placeName('neighborhood', 'legacy', catalog)} 🔔`.

- [ ] **Step 1: Write the failing tests**

`test/straycats.test.js`:

```js
describe('createStrayCats — a kittypet wanderer', () => {
  const wanderer = (seed = 3) => ({ name: 'Marmalade', rng: mulberry32(seed), spot: { x: 10, z: -4 }, wanderer: true });
  it('stands at its spot, is flagged, and draws nothing from the walk rng', () => {
    const calls = []; const r = mulberry32(9); const counting = () => { const v = r(); calls.push(v); return v; };
    const cats = createStrayCats(fakeScene(), AREA, 22, counting, { extras: [wanderer()], excludeNames: ['Marmalade'] });
    expect(calls.length).toBe(47 + 5 * 22);
    const w = cats.strays.find((s) => s.name === 'Marmalade');
    expect([w.home.x, w.home.z]).toEqual([10, -4]);
    expect(w.wanderer).toBe(true);
    expect(w.tag?.userData?.legend ?? false).toBe(false);
    expect(cats.strays.filter((s) => s.name === 'Marmalade')).toHaveLength(1);
  });
  it('a non-kittypet without the legendary rule is still refused as an extra', () => {
    const cats = createStrayCats(fakeScene(), AREA, 3, mulberry32(1), { extras: [{ name: 'Pickles', rng: mulberry32(2), wanderer: true }] });
    expect(cats.strays.filter((s) => s.name === 'Pickles').length).toBeLessThanOrEqual(1);
    expect(cats.strays.every((s) => !s.wanderer || s.name !== 'Pickles')).toBe(true);
  });
  it('two devices with 22 and 14 strays place the same wanderer at the same spot', () => {
    const a = createStrayCats(fakeScene(), AREA, 22, mulberry32(5), { extras: [wanderer(7)], excludeNames: ['Marmalade'] });
    const b = createStrayCats(fakeScene(), AREA, 14, mulberry32(5), { extras: [wanderer(7)], excludeNames: ['Marmalade'] });
    const at = (c) => c.strays.find((s) => s.name === 'Marmalade').group.rotation.y;
    expect(at(a)).toBe(at(b));
  });
});
```

(Use the file's existing counting-rng helper and the pinned draw count it already uses for the legendary extra; `47 + 5 * count` is the figure in the `createStrayCats` header.)

`test/housecats.test.js`:

```js
test('the arrival line names Twolegplace in Clan Edition and the Cozy Neighborhood in Legacy', () => {
  expect(wanderArrivalLine('Marmalade', 'canon', CATALOG)).toBe(`Marmalade the ${OUTSIDE_WORDS.house} has wandered in from ${PLACE_WORDS.town} 🔔`);
  const legacy = wanderArrivalLine('Marmalade', 'legacy', CATALOG);
  expect(legacy).toContain(CATALOG.areas.neighborhood.name);
  expect(legacy).not.toContain(OUTSIDE_WORDS.house);
  expect(legacy).not.toContain(PLACE_WORDS.town);
});
```

`test/interactions.test.js`: using the file's existing greet harness, assert that a stray with `wanderer: true` whose `shouldTurnHostile` roll would be true is greeted normally: `recordGrudge` is not called, and the "You met" toast fires. Mirror whichever existing rupture test sets up a hostile roll.

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run test/straycats.test.js test/housecats.test.js test/interactions.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement**
  - `src/straycats.js` extras loop:
    - the gate becomes `isLegendaryName(ex.name) || (ex.wanderer === true && isKittypetName(ex.name))`;
    - position: if `ex.spot` has finite x and z, clamp it into bounds and use it after taking the two x/z draws, so the draw count is the same;
    - glow and legend tag only `if (isLegendaryName(name))`. Today `glows.push(dressLegend(...))` would push `null`;
    - add `wanderer: ex.wanderer === true` to the extra's entry, and `wanderer: false` to the main loop's entry. Keep the "keep in step" comments true;
    - give extras the Task 3 collar rule.
  - `src/game/walk.js`, beside the legendary block:
    ```js
    const today = new Date().toISOString().slice(0, 10);   // the race's UTC date
    const wanderName = walkWanderer(state, areaId, { ymd: today, colonyWalk, isDen });
    ```
    - Push `{ name: wanderName, wanderer: true, spot: clearSpot(wanderStart(areaData.spawn), areaData.colliders ?? [], areaData.bounds, areaData.waters ?? []), rng: mulberry32((seedFromCode(wanderName) ^ (roomSeed ?? Math.floor(Math.random() * 2 ** 31))) >>> 0) }` onto `extras`. Make `extras` a `let`/array built from both.
    - Append `wanderName` to `excludeNames` **on every walk**, colony or not. Excluding filters the already-drawn shuffle and costs no draws. Every co-walker excludes the same name, so all casts still agree.
    - The existing `today` at line ~1347 can be hoisted and reused rather than computed twice.
    - After `hud.setArea(...)`: `if (wanderName) hud.toast(wanderArrivalLine(wanderName, progression.state.edition, CATALOG));`.
    - Add a comment block in the legendary block's style: no `walkRng`, nothing on the wire, the same on every edition.
  - `src/game/interactions.js` rupture: `if (grudgeable && !stray.wanderer && shouldTurnHostile(...) && ...)`, with a one-line comment: a wanderer is a harmless visitor (decision 6).

- [ ] **Step 4: Run the full suite**

Run: `npx vitest run --exclude '.claude/**' --exclude '.worktrees/**'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/straycats.js src/game/walk.js src/game/interactions.js src/housecats.js test/straycats.test.js test/housecats.test.js test/interactions.test.js
git commit -m "feat(kittypets): now and then a kittypet wanders into the Woods, the River or the Moor

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Bringing a kittypet home

No new mechanics: this task only says out loud what the existing feed already does, so a kid knows to come back.

**Files:**
- Modify: `src/housecats.js` (`wanderStayLine`, `kittypetTamedLine`)
- Modify: `src/game/interactions.js` (`feedStray`, ~lines 1239–1280)
- Test: `test/housecats.test.js`, `test/interactions.test.js`

**Interfaces:**
- Consumes: `isKittypetName`, `PLACE_WORDS.town`, `isClanEdition`, `placeName`.
- Produces:
  - `wanderStayLine(name, placeLabel) => string`: `${name} will wait for you here in ${placeLabel} 🐾`;
  - `kittypetTamedLine(name) => string`: `${name} left ${PLACE_WORDS.town} to join you! She'll be waiting in the den 🏠`.

- [ ] **Step 1: Write the failing tests**

`test/housecats.test.js`:

```js
test('the bring-home lines', () => {
  expect(wanderStayLine('Marmalade', 'The Woods')).toBe('Marmalade will wait for you here in The Woods 🐾');
  expect(kittypetTamedLine('Marmalade')).toBe(`Marmalade left ${PLACE_WORDS.town} to join you! She'll be waiting in the den 🏠`);
});
```

`test/interactions.test.js`, with the file's feed harness:
- feeding a `wanderer: true` stray whose `feedColonyCat` returns `'ok'` toasts the feed line **and** `wanderStayLine(name, placeName(areaId, edition, CATALOG))`;
- the same stray with `feedColonyCat` returning `'full'` toasts neither;
- a kittypet whose feed returns `tamedNow: true` toasts `kittypetTamedLine(name)` in Clan Edition and the existing "trusts you!" line in Legacy;
- a non-kittypet toasts the existing "trusts you!" line in both editions.

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run test/housecats.test.js test/interactions.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement**
  - The two helpers in `src/housecats.js`.
  - In `feedStray`, after the existing feed toast:
    - `if (stray.wanderer) hud.toast(wanderStayLine(name, placeName(s.areaId, progression.state.edition, CATALOG) || s.areaId));`
    - In the `r.tamedNow` branch, the first toast becomes `isClanEdition(progression.state) && isKittypetName(name) ? kittypetTamedLine(name) : <the existing line>`.
  - The feed itself is untouched: `feedColonyCat` still checks the caps and the area, records the cat at `stray.home` (the wanderer's spot), and the server path is unchanged.

- [ ] **Step 4: Run the full suite**

Run: `npx vitest run --exclude '.claude/**' --exclude '.worktrees/**'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/housecats.js src/game/interactions.js test/housecats.test.js test/interactions.test.js
git commit -m "feat(kittypets): a fed wanderer waits for you; a tamed kittypet leaves Twolegplace to join you

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The invariants, and a look in the browser

**Files:**
- Modify: `test/editions.invariants.test.js` (append only)

- [ ] **Step 1: Append the tests**

```js
describe('kittypets keep every promise', () => {
  test('feeding and taming a kittypet stores its own name, and flipping the edition changes nothing', () => {
    const p = load();
    for (let i = 0; i < 6; i++) p.feedColonyCat({ name: 'Marmalade', by: ME, walk: `walk-${900 + i}`, area: 'woods', x: 3, z: 4 });
    const cat = p.state.colony.cats.find((c) => c.name === 'Marmalade');
    expect(cat).toMatchObject({ name: 'Marmalade', area: 'woods' });
    const { edition: _a, ...before } = structuredClone(p.state);
    p.setEdition('legacy'); p.setEdition('canon');
    const { edition: _b, ...after } = p.state;
    expect(after).toEqual(before);
  });
  test('the caps are unchanged by kittypets', () => {
    expect([COLONY_MAX, SOLO_MAX]).toEqual([24, 12]);
  });
});
```

If the first test hits `SOLO_MAX` because the fixture is full, it is not: the V4 fixture holds 3 cats. Feeding six times on different walk stamps is enough to tame from nothing (`TAME_FEEDS` 6). Assert `tamedBy === ME` too.

- [ ] **Step 2: Run the full suite**

Run: `npx vitest run --exclude '.claude/**' --exclude '.worktrees/**'`
Expected: PASS, with the file count and test count higher than at 32f204e.

- [ ] **Step 3: Check it in the browser**

Start the dev server with the project's run skill or `.claude/launch.json`, then:
- In Clan Edition, walk Twolegplace and find a kittypet (Marmalade, Mochi…). It wears a red collar with a gold bell. Greeting it says "…the kittypet! ♡".
- Force a wander day by temporarily calling `walkWanderer` with a known wander `ymd` from the console, or by picking a date from the Task 4 test. Walk the Woods. The arrival toast shows, the cat stands a few metres up the path from the start, greet it, feed it, and see "will wait for you here in The Woods".
- On the next Woods walk it stands at the same spot as a colony cat, with no collar.
- Open the Colony tab. Its card reads "Amberpaw" with "once a kittypet called Marmalade".
- Flip to Legacy: no collar, no "kittypet", the card reads "Marmalade".
- Revert any console-only forcing; nothing is committed for it.

- [ ] **Step 4: Commit**

```bash
git add test/editions.invariants.test.js
git commit -m "test(kittypets): kittypets keep the edition and colony invariants

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Why no server change

- The feed RPC (`colony_feed`, `docs/supabase-colony.sql:384`) already accepts all six territory ids.
- Every kittypet name is an existing stray name that already passes its name regex.
- A wanderer joins only through that RPC, under the same caps, add-only rules and taming.
- **No held server task is needed.**
