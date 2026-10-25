# Whisker Walk v21 Stream 3a — The Clan: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Whisker Walk's shared colony a Warrior Cats-style clan — two-part names that show each cat's rung, den roles, queens with kits, a clan of its own, and a rival clan holding territory in each of the four areas.

**Architecture:** Four new DOM-free, THREE-free leaf modules carry all the pure logic (`clanwords.js` for every borrowed string, `clannames.js` for name and rank derivation, `clanroles.js` for roles and kits, `rivalclans.js` for territory), plus two render modules that follow the `scent.js` flat-decal and `goldmice.js` dispose patterns. **Clan names are derived from the stored cat name, never stored** — `isStrayName()`, `strayBreed()`, the friends/grudge/den-home keys and `colony_cats`'s `(colony_id, name)` primary key are all untouched, so nothing new has to cross the wire and `mergeColony` cannot discard it.

**Tech Stack:** Three.js ~0.185, Vite 8, Vitest 4, Supabase JS 2. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-25-whisker-walk-v21-the-clan-design.md` (and its parent, `docs/superpowers/specs/2026-10-24-whisker-walk-v21-reason-to-come-back-design.md`)

## Global Constraints

- `SAVE_VERSION` stays **4**. New save fields are additive with sanitize-with-default; never a migration.
- **No new SQL and no change to the colony RPCs.** If a task appears to need one, stop and ask the owner — it reverses spec decision 11. The owner runs SQL from a file; never run it yourself.
- **`CAT_NAMES` is never extended, reordered or resized.** `shuffled(CAT_NAMES, rng)` in `straycats.js` consumes `CAT_NAMES.length - 1` `walkRng` draws, and `game/walk.js` carries a standing warning that shifting draws changes gifts, weather, secrets and goals downstream. A co-walk with a non-partner must behave exactly as it does today.
- **Nothing new is stored per colony cat.** `mergeColony` returns the remote cat object for any cat both devices hold, preserving only `tamedBy`/`tamedWalk`.
- **`COLONY_MAX` (24) and `SOLO_MAX` (12) are not touched.** `DEN_HOMES.length === COLONY_MAX` by construction.
- **Taming never regresses.** `tamedBy`/`tamedWalk` are stored, never re-derived.
- **Rank is never a score.** No rank or role may appear in a points total, a goal, or `AWARDS`.
- **`rankFor` is already taken.** `src/progression.js` exports `rankFor` and `RANKS` for the player's *points* ladder. The clan ladder is a different thing and must never be merged into it — the clan's function is `clanRankFor`.
- Pure logic in DOM-free leaf modules; `ui/*` renderers return strings and escape every interpolated value.
- Hostile-input discipline: coerce at the sanitizer, escape at render, never throw.
- Border marks are **flat decals** (`scent.js`'s `CircleGeometry` + `MeshBasicMaterial`), never `render/mergeprops.js`.
- Solo play never depends on the network. Everything here works with no Supabase configured.
- `render/quality.js` stays the only place a render tier is decided.
- Test command is `npx vitest run <file>` for one file, `npm test` for the suite.
- Commit trailer on every commit: `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`

## Review Focus

Five input classes the spec implies that no task's happy path exercises. Each has its test added to the task that owns the code.

1. **A stored cat name that is in no pool** (a legacy save, a hostile cloud payload, a future name). `clanNameOf` must fall back to the stored name rather than return `undefined`, blank, or throw — a cat must never become nameless. *Task 2.*
2. **An area id that is not one of the four** — the den, and the fifth area the v21 spec's Stream 6 adds. `rivalFor` / `isTrespassing` / `borderMarks` must return nothing rather than throw, following `createGoldMice`'s precedent for an unknown `areaId`. *Task 11.*
3. **A colony holding more than 24 tamed cats.** Tamed cats are never trimmed, so this is reachable today. Role selection and kit derivation must not read past `DEN_HOMES.length` or produce a kit for a cat with no den home. *Task 5.*
4. **The same cat at a different `have` on the two devices** (mid-sync, or an unsynced local feed). A rank is derived and may differ for a moment; nothing may write a stored verdict from it. *Task 6.*
5. **A player whose `petName` is legacy free text** ("Noodle", or `null` before it is ever set). The clan layer must display it unchanged and must not try to parse a prefix out of it. *Task 4.*

---

## File Structure

**Create:**
- `src/clanwords.js` — every borrowed string, no logic. Zero imports (spec §6.8's swappable file).
- `src/clannames.js` — name and rank derivation. Imports `clanwords.js`, `rng.js`.
- `src/clanroles.js` — roles, role selection, kit derivation. Imports `clanwords.js`, `straynames.js`, `rng.js`.
- `src/rivalclans.js` — rival territory, borders, patrol paths. Imports `clanwords.js`, `rng.js`.
- `src/render/bordermarks.js` — flat-decal border rendering.
- `src/rivalcats.js` — the patrol entities and the chase.
- `test/clanwords.test.js`, `test/clannames.test.js`, `test/clanroles.test.js`, `test/rivalclans.test.js`, `test/bordermarks.test.js`, `test/rivalcats.test.js`

**Modify:**
- `src/straynames.js` — add `KIT_NAMES`; widen `isStrayName`. `CAT_NAMES` untouched.
- `src/progression.js` — additive `state.clan`, `state.clanRoles`, their sanitizers and setters.
- `src/ui/colonypanel.js` — clan names, ranks, roles in the Colony tab.
- `src/ui/hometabs.js` — the `-star` name picker renderer (pure, like the Skills renderer).
- `src/dencats.js` — kit meshes beside a queen.
- `src/game/walk.js` — wire rival clans, border marks and the patrol into a walk.
- `test/colony.test.js`, `test/progression.test.js`, `test/colonypanel.test.js`, `test/straycats.test.js`

---

# Phase 1 — Names and ranks

### Task 1: The borrowed-words module

**Files:**
- Create: `src/clanwords.js`
- Test: `test/clanwords.test.js`

**Interfaces:**
- Consumes: nothing. This module imports nothing, by design.
- Produces: `PREFIXES: readonly string[]`, `WARRIOR_SUFFIXES: readonly string[]`, `RANK_SUFFIX: { kit: 'kit', apprentice: 'paw', leader: 'star' }`, `RANK_WORDS: { kit, apprentice, warrior, elder, queen, medicine, deputy, leader }` (all display strings), `OUTSIDE_WORDS: { met, grudge, player }`, `CLAN_SUFFIX: 'Clan'`, `DENIED_NAMES: ReadonlySet<string>`.

Pool sizing is yours. Aim for ~24 prefixes and ~14 warrior suffixes; capitalised prefixes (`Moss`), lowercase suffixes (`fur`). Every object is `Object.freeze`d.

- [ ] **Step 1: Write the failing tests**

```js
import { PREFIXES, WARRIOR_SUFFIXES, RANK_SUFFIX, DENIED_NAMES, RANK_WORDS, OUTSIDE_WORDS, CLAN_SUFFIX } from '../src/clanwords.js';
import { validPetName } from '../src/net.js';

test('pools are frozen, non-empty and free of duplicates', () => {
  expect(Object.isFrozen(PREFIXES)).toBe(true);
  expect(Object.isFrozen(WARRIOR_SUFFIXES)).toBe(true);
  expect(PREFIXES.length).toBeGreaterThanOrEqual(20);
  expect(WARRIOR_SUFFIXES.length).toBeGreaterThanOrEqual(10);
  expect(new Set(PREFIXES).size).toBe(PREFIXES.length);
  expect(new Set(WARRIOR_SUFFIXES).size).toBe(WARRIOR_SUFFIXES.length);
});

test('every name the pools can make passes validPetName', () => {
  const suffixes = [...WARRIOR_SUFFIXES, ...Object.values(RANK_SUFFIX)];
  const bad = [];
  for (const p of PREFIXES) for (const s of suffixes) {
    if (!validPetName(p + s)) bad.push(p + s);
  }
  expect(bad).toEqual([]);
});

test('no combination the pools can make is a published character name', () => {
  const suffixes = [...WARRIOR_SUFFIXES, ...Object.values(RANK_SUFFIX)];
  const hits = [];
  for (const p of PREFIXES) for (const s of suffixes) {
    if (DENIED_NAMES.has(p + s)) hits.push(p + s);
  }
  expect(hits).toEqual([]);
});

test('every clan title the prefixes can make passes validPetName', () => {
  for (const p of PREFIXES) expect(validPetName(p + CLAN_SUFFIX)).toBe(true);
});

test('display vocabularies are complete', () => {
  for (const k of ['kit', 'apprentice', 'warrior', 'elder', 'queen', 'medicine', 'deputy', 'leader']) {
    expect(typeof RANK_WORDS[k]).toBe('string');
    expect(RANK_WORDS[k].length).toBeGreaterThan(0);
  }
  for (const k of ['met', 'grudge', 'player']) expect(typeof OUTSIDE_WORDS[k]).toBe('string');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/clanwords.test.js`
Expected: FAIL — cannot resolve `../src/clanwords.js`.

- [ ] **Step 3: Write `src/clanwords.js`**

Data only, no functions. Header comment must record (a) that this is the one file holding vocabulary borrowed from Erin Hunter's *Warrior Cats*, per spec §6.8 and decision 3, so a future swap is one commit; and (b) that pool size must never be derived from or feed `CAT_NAMES`, per the Global Constraints.

`DENIED_NAMES` holds the well-known published character names findable on warriorcats.com's Cats pages — `Firestar`, `Bluestar`, `Graystripe`, `Tigerclaw`, `Thunderstar`, and the rest you can gather. Where the deny list and `validPetName` force a choice, drop the pool word rather than the rule.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run test/clanwords.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/clanwords.js test/clanwords.test.js
git commit -m "feat(clan): the one file that holds every borrowed word"
```

---

### Task 2: Name and rank derivation

**Files:**
- Create: `src/clannames.js`
- Test: `test/clannames.test.js`

**Interfaces:**
- Consumes: Task 1's `PREFIXES`, `WARRIOR_SUFFIXES`, `RANK_SUFFIX`, `CLAN_SUFFIX`; `seedFromCode` from `src/rng.js`; `CAT_NAMES` from `src/straynames.js` (read-only, for the distinctness test).
- Produces:
  - `prefixFor(storedName: string) -> string | null` — a `PREFIXES` entry, or `null` for a non-string or empty name.
  - `clanRankFor(progress: {have: number, tamed: boolean}) -> 'kit' | 'apprentice' | 'warrior'` — named to avoid `progression.js`'s existing `rankFor`.
  - `warriorSuffixFor(storedName: string) -> string` — a `WARRIOR_SUFFIXES` entry.
  - `clanNameOf(storedName: string, progress: {have, tamed}) -> string`
  - `clanTitleFor(seed: string) -> string` — e.g. `'MossClan'`.

- [ ] **Step 1: Write the failing tests**

```js
test('rank is read off the taming bar, not the feed count', () => {
  expect(clanRankFor({ have: 0, tamed: false })).toBe('kit');
  expect(clanRankFor({ have: 1, tamed: false })).toBe('kit');
  expect(clanRankFor({ have: 2, tamed: false })).toBe('apprentice');
  expect(clanRankFor({ have: 5, tamed: false })).toBe('apprentice');
  expect(clanRankFor({ have: TAME_FEEDS, tamed: false })).toBe('warrior');
  expect(clanRankFor({ have: TAME_FEEDS, tamed: true })).toBe('warrior');
});

// headStartFor gives a cat you already know up to HEAD_START_MAX of the bar,
// so a familiar cat is never a kit. That is correct and is the point.
test('a cat with a full head start is already an apprentice', () => {
  expect(clanRankFor({ have: HEAD_START_MAX, tamed: false })).toBe('apprentice');
});

test('the 48 shipped names give 48 distinct clan names', () => {
  const tamed = CAT_NAMES.map((n) => clanNameOf(n, { have: 6, tamed: true }));
  expect(new Set(tamed).size).toBe(CAT_NAMES.length);
});

test('a clan name is stable and changes only its suffix as the cat rises', () => {
  const kit = clanNameOf('Pickles', { have: 0, tamed: false });
  const paw = clanNameOf('Pickles', { have: 3, tamed: false });
  const war = clanNameOf('Pickles', { have: 6, tamed: true });
  const p = prefixFor('Pickles');
  for (const n of [kit, paw, war]) expect(n.startsWith(p)).toBe(true);
  expect(kit.endsWith(RANK_SUFFIX.kit)).toBe(true);
  expect(paw.endsWith(RANK_SUFFIX.apprentice)).toBe(true);
  expect(new Set([kit, paw, war]).size).toBe(3);
  expect(clanNameOf('Pickles', { have: 6, tamed: true })).toBe(war);
});

// Review Focus 1 — a cat must never become nameless.
test.each([null, undefined, '', 42, {}, 'NotInAnyPool', '__proto__'])(
  'an unknown stored name falls back rather than vanishing: %p', (bad) => {
    const out = clanNameOf(bad, { have: 6, tamed: true });
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
  });

test('a stored name that is a non-empty string falls back to itself', () => {
  expect(clanNameOf('NotInAnyPool', { have: 6, tamed: true })).toBe('NotInAnyPool');
});

test.each([null, undefined, '', 42, {}])('prefixFor is total over junk: %p', (bad) => {
  expect(prefixFor(bad)).toBeNull();
});

test('a malformed progress object reads as a kit rather than throwing', () => {
  for (const bad of [null, undefined, {}, { have: NaN }, { have: -1 }, { have: '6' }]) {
    expect(clanRankFor(bad)).toBe('kit');
  }
});

test('clanTitleFor is stable per seed and always ends in the clan suffix', () => {
  const a = clanTitleFor('player-abc12345');
  expect(a).toBe(clanTitleFor('player-abc12345'));
  expect(a.endsWith(CLAN_SUFFIX)).toBe(true);
  expect(clanTitleFor('player-abc12345')).not.toBe(clanTitleFor('player-zzz99999'));
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/clannames.test.js`
Expected: FAIL — cannot resolve `../src/clannames.js`.

- [ ] **Step 3: Implement `src/clannames.js`**

`prefixFor` and `warriorSuffixFor` hash the stored name with `seedFromCode` and index the pools. They must use a **different slice of the hash each** — follow `denMoment`'s `seed` / `seed >>> 8` idiom — so a cat's prefix and suffix are not correlated.

If the 48 shipped names collide on a composed warrior name, salt the suffix index with a second hash slice until they are distinct; the distinctness test is the contract, not the hash.

Header comment must record why nothing here is stored: `mergeColony` returns the remote cat object for any cat both devices hold, so a stored clan name would be discarded at the next sync (spec §6.2, §8.4).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run test/clannames.test.js`
Expected: PASS

- [ ] **Step 5: Run the whole suite — nothing may have shifted**

Run: `npm test`
Expected: PASS, same count as before this task (85 files, 2043 tests at `cb2f079`) plus this file's.

- [ ] **Step 6: Commit**

```bash
git add src/clannames.js test/clannames.test.js
git commit -m "feat(clan): derive a two-part name and a rank from the name a cat already has"
```

---

### Task 3: Clan names and ranks in the Colony tab

**Files:**
- Modify: `src/ui/colonypanel.js`
- Test: `test/colonypanel.test.js`

**Interfaces:**
- Consumes: Task 2's `clanNameOf`, `clanRankFor`; Task 1's `RANK_WORDS`.
- Produces: no new exports. The Colony tab's card shows the clan name as the cat's headline and its rank in words.

The real export is `renderColonyHtml({ colony, me, members, status, owned, catalog })`. `test/colonypanel.test.js` already has the fixtures to drive it — `cat(name, extra)`, `feed(c, by, n, head)`, `colonyOf({cats, feeds, partner})`, `render(colony, over)`, `count(s, re)`, and `const [A, B, C, D] = CAT_NAMES`. Use those; do not add new ones.

The card currently prints `cat.name` as `.card-name` with `strayBreed(cat.name)` beside it, and computes `const p = tamingProgress(...)` already — pass that straight to `clanRankFor`. Keep `strayBreed(cat.name)` reading the **stored** name.

- [ ] **Step 1: Write the failing tests**

```js
it('leads each card with the clan name and names the rank in words', () => {
  const colony = colonyOf({
    cats: [cat(A), cat(C, { tamedBy: ME, tamedWalk: 'walk-1' })],
    feeds: [...feed(A, ME, 2), ...feed(C, ME, TAME_FEEDS)],
  });
  const html = render(colony);
  expect(html).toContain(clanNameOf(A, { have: 2, tamed: false }));
  expect(html).toContain(clanNameOf(C, { have: TAME_FEEDS, tamed: true }));
  expect(html).toContain(RANK_WORDS.apprentice);
  expect(html).toContain(RANK_WORDS.warrior);
});

it('still reads the breed off the stored name', () => {
  const colony = colonyOf({ cats: [cat(A, { tamedBy: ME, tamedWalk: 'walk-1' })] });
  expect(render(colony)).toContain(strayBreed(A));
});

it('still shows the stored name, so a cat stays findable by it', () => {
  const colony = colonyOf({ cats: [cat(A, { tamedBy: ME, tamedWalk: 'walk-1' })] });
  expect(render(colony)).toContain(A);
});

it('still renders exactly one progress bar per cat', () => {
  const colony = colonyOf({ cats: [cat(A), cat(B), cat(C)] });
  expect(count(render(colony), /role="progressbar"/g)).toBe(3);
});

it('escapes a hostile stored name rather than trusting the sanitizer', () => {
  const colony = colonyOf({ cats: [cat('<img src=x>')] });
  const html = render(colony);
  expect(html).not.toContain('<img');
});
```

`cat('<img src=x>')` is deliberately a name `isStrayName` would reject — the renderer's rule is to escape rather than trust that `colony.js` already did.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/colonypanel.test.js`
Expected: FAIL — the clan name and rank word are absent.

- [ ] **Step 3: Render the clan name and rank in the card**

Everything interpolated goes through `escapeHtml`, including the derived clan name — it is composed from local pools, but the renderer's rule is to escape rather than trust.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run test/colonypanel.test.js`
Expected: PASS

- [ ] **Step 5: Check it by eye**

Start the dev server with `preview_start` → `whisker-walk-dev` (port 5174). Open the home base, Colony tab. Confirm: the clan name reads as a name and not a mangled compound, the rank word sits legibly next to the one bar, and nothing overflows at the mobile preset (375px) — a tab bar overflow at that width was a real Stream 2 finding.

- [ ] **Step 6: Commit**

```bash
git add src/ui/colonypanel.js test/colonypanel.test.js
git commit -m "feat(clan): lead each colony card with the cat's clan name and rank"
```

---

### Task 4: A chosen `-star` name for the player's own cat

**Files:**
- Modify: `src/clannames.js`, `src/ui/hometabs.js`, `src/ui/homebase.js`
- Test: `test/clannames.test.js`, `test/hometabs.test.js`

**Interfaces:**
- Consumes: Task 1's `PREFIXES`, `RANK_SUFFIX.leader`; `validPetName` from `src/net.js`.
- Produces:
  - `candidateStarNames(seed: string, n = 3) -> string[]` in `clannames.js`.
  - `renderStarNamePicker(candidates: string[], current: string | null) -> string` in `ui/hometabs.js`, following the Skills renderer's shape in that file.

`homebase.js` wires the picker's click to the existing `progression.setPetName(name)` — spec §6.1: a composed name already passes `validPetName`, so **no wire change, no schema change, no new column**. The free-text field stays exactly as it is.

- [ ] **Step 1: Write the failing tests**

```js
test('three distinct leader names, all usable as a pet name', () => {
  const c = candidateStarNames('player-abc12345', 3);
  expect(c).toHaveLength(3);
  expect(new Set(c).size).toBe(3);
  for (const n of c) {
    expect(n.endsWith(RANK_SUFFIX.leader)).toBe(true);
    expect(validPetName(n)).toBe(true);
    expect(DENIED_NAMES.has(n)).toBe(false);
  }
});

test('the same seed offers the same three names', () => {
  expect(candidateStarNames('player-abc12345')).toEqual(candidateStarNames('player-abc12345'));
});

test.each([null, undefined, '', 42])('a junk seed still offers usable names: %p', (bad) => {
  const c = candidateStarNames(bad);
  expect(c).toHaveLength(3);
  for (const n of c) expect(validPetName(n)).toBe(true);
});

test('asking for more names than the pools can make returns what it can, all distinct', () => {
  const c = candidateStarNames('player-abc12345', 9999);
  expect(new Set(c).size).toBe(c.length);
  expect(c.length).toBeGreaterThan(0);
});

// Review Focus 5 — a legacy free-text pet name, and no pet name at all.
test.each(['Noodle', null])('the picker shows a legacy pet name unchanged: %p', (cur) => {
  const html = renderStarNamePicker(candidateStarNames('player-abc12345'), cur);
  expect(typeof html).toBe('string');
  if (cur) expect(html).toContain(cur);
});

test('the picker escapes a hostile current name', () => {
  const html = renderStarNamePicker(candidateStarNames('seed'), '<img src=x>');
  expect(html).not.toContain('<img');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/clannames.test.js test/hometabs.test.js`
Expected: FAIL — `candidateStarNames` and `renderStarNamePicker` are not defined.

- [ ] **Step 3: Implement `candidateStarNames` and `renderStarNamePicker`**

Draw prefixes by walking the pool from a `seedFromCode(seed)` offset, skipping any candidate that fails `validPetName` or is in `DENIED_NAMES`, until `n` are found or the pool is exhausted. Deterministic — no `Math.random`.

- [ ] **Step 4: Wire the picker in `homebase.js`**

Rendered by `renderStarNamePicker`, clicks call the existing `setPetName`. No new save field: the chosen name **is** `state.petName`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run test/clannames.test.js test/hometabs.test.js`
Expected: PASS

- [ ] **Step 6: Check it by eye**

In the browser pane, pick a name, reload, and confirm it persisted and shows on your own cat's nametag. Confirm the free-text field still works.

- [ ] **Step 7: Commit**

```bash
git add src/clannames.js src/ui/hometabs.js src/ui/homebase.js test/clannames.test.js test/hometabs.test.js
git commit -m "feat(clan): let each player pick a leader name for their own cat"
```

---

# Phase 2 — Roles, and queens with kits

### Task 5: Roles and role selection

**Files:**
- Create: `src/clanroles.js`
- Test: `test/clanroles.test.js`

**Interfaces:**
- Consumes: Task 1's `RANK_WORDS`; `seedFromCode` from `src/rng.js`; `CAT_NAMES` from `src/straynames.js` (read-only).
- Produces:
  - `roleFor(storedName: string) -> 'elder' | 'queen' | 'warrior'`
  - `pickMedicineCat(tamed: {name: string}[]) -> string | null` — a stored name.
  - `pickDeputy(feeds: {cat: string, by: string, walk: string}[]) -> string | null` — the first cat fed by two different players, by feed stamp.

`pickDeputy` must be **device-independent**: `mergeColony` puts remote feeds first and local-only feeds after, so the feed list's order differs per device. Order by the feed's `walk-<ms>` stamp with the cat name as tiebreak — reuse `tamedCats()`'s `walkMs(a) - walkMs(b) || byName(a, b)` idiom rather than inventing one.

- [ ] **Step 1: Write the failing tests**

```js
test('roles spread across the shipped names rather than landing on one', () => {
  const counts = { elder: 0, queen: 0, warrior: 0 };
  for (const n of CAT_NAMES) counts[roleFor(n)] += 1;
  expect(counts.warrior).toBeGreaterThan(counts.elder + counts.queen);
  expect(counts.elder).toBeGreaterThan(0);
  expect(counts.queen).toBeGreaterThan(0);
});

test('a role is stable for a given name', () => {
  expect(roleFor('Pickles')).toBe(roleFor('Pickles'));
});

test.each([null, undefined, '', 42, {}])('roleFor is total over junk: %p', (bad) => {
  expect(roleFor(bad)).toBe('warrior');
});

test('exactly one medicine cat, and it does not change hands when another cat is tamed', () => {
  const three = [{ name: 'Pickles' }, { name: 'Mochi' }, { name: 'Olive' }];
  const first = pickMedicineCat(three);
  expect(typeof first).toBe('string');
  expect(pickMedicineCat([...three, { name: 'Waffles' }])).toBe(first);
});

test('no tamed cats means no medicine cat rather than a crash', () => {
  for (const bad of [[], null, undefined, 'nope', [null, {}, { name: 42 }]]) {
    expect(pickMedicineCat(bad)).toBeNull();
  }
});

test('the deputy is the first cat two different players fed', () => {
  const feeds = [
    { cat: 'Mochi', by: 'player-aaaaaaaa', walk: 'walk-3000' },
    { cat: 'Pickles', by: 'player-aaaaaaaa', walk: 'walk-1000' },
    { cat: 'Pickles', by: 'player-bbbbbbbb', walk: 'walk-2000' },
    { cat: 'Mochi', by: 'player-bbbbbbbb', walk: 'walk-4000' },
  ];
  expect(pickDeputy(feeds)).toBe('Pickles');
});

test('a cat only one player fed is never deputy', () => {
  const feeds = [
    { cat: 'Pickles', by: 'player-aaaaaaaa', walk: 'walk-1000' },
    { cat: 'Pickles', by: 'player-aaaaaaaa', walk: 'walk-2000' },
  ];
  expect(pickDeputy(feeds)).toBeNull();
});

test('the deputy does not depend on the order the feed list arrives in', () => {
  const feeds = [/* the four feeds above */];
  const reversed = [...feeds].reverse();
  expect(pickDeputy(reversed)).toBe(pickDeputy(feeds));
});

test('two cats completed on the same stamp break the tie by name, identically on both devices', () => {
  const mk = (cat, by) => ({ cat, by, walk: 'walk-1000' });
  const a = [mk('Mochi', 'player-aaaaaaaa'), mk('Mochi', 'player-bbbbbbbb'),
              mk('Pickles', 'player-aaaaaaaa'), mk('Pickles', 'player-bbbbbbbb')];
  expect(pickDeputy(a)).toBe(pickDeputy([...a].reverse()));
});

test.each([null, undefined, 'nope', [{}, null, { cat: 42, by: 7 }]])(
  'pickDeputy is total over junk: %p', (bad) => {
    expect(pickDeputy(bad)).toBeNull();
  });

// Review Focus 3 — tamed cats are never trimmed, so a colony can hold more
// than DEN_HOMES.length of them.
test('a colony of 30 tamed cats still yields exactly one medicine cat', () => {
  const many = Array.from({ length: 30 }, (_, i) => ({ name: CAT_NAMES[i % CAT_NAMES.length] }));
  expect(typeof pickMedicineCat(many)).toBe('string');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/clanroles.test.js`
Expected: FAIL — cannot resolve `../src/clanroles.js`.

- [ ] **Step 3: Implement `src/clanroles.js`**

`roleFor` hashes the stored name and uses a band — most names land on `warrior`, which the distribution test pins. `pickMedicineCat` is a **selection**, not a predicate: sort the tamed list by name and take the first whose `roleFor` is eligible, so adding a cat cannot displace the incumbent.

Header comment must record that a role is derived from the stored name for the same reason breed is — so both devices agree with no wire message (spec §6.4).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run test/clanroles.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/clanroles.js test/clanroles.test.js
git commit -m "feat(clan): derive den roles, and pick a medicine cat and a deputy the same way on both devices"
```

---

### Task 6: Role verdicts in the save

**Files:**
- Modify: `src/progression.js`
- Test: `test/progression.test.js`

**Interfaces:**
- Consumes: Task 5's `pickMedicineCat`, `pickDeputy`.
- Produces: `state.clanRoles = { medicine: string | null, deputy: string | null }`, `sanitizeClanRoles(v)`, and `progression.settleClanRoles(colony)` — computes any unset verdict, writes it once, and **never overwrites one already set**.

Follow `sanitizeGolden`/`sanitizeStreak`'s shape exactly. Additive, so `SAVE_VERSION` stays 4.

- [ ] **Step 1: Write the failing tests**

Use `test/progression.test.js`'s own harness: `fakeStorage(initial)`, `createProgression(storage)`, and `p.state`.

```js
it('starts with no clan roles', () => {
  expect(p.state.clanRoles).toEqual({ medicine: null, deputy: null });
});

it('keeps a settled verdict across a reload', () => {
  p.settleClanRoles(colonyWithADeputy());
  const first = p.state.clanRoles.deputy;
  expect(first).not.toBeNull();
  expect(createProgression(storage).state.clanRoles.deputy).toBe(first);
});

test.each([null, undefined, 42, 'x', [], { medicine: 42 }, { deputy: {} },
          { medicine: 'x'.repeat(100) }, Object.create({ medicine: 'Pickles' })])(
  'sanitizeClanRoles is total over a hostile payload: %p', (bad) => {
    const out = sanitizeClanRoles(bad);
    expect(Object.keys(out).sort()).toEqual(['deputy', 'medicine']);
    for (const v of Object.values(out)) expect(v === null || typeof v === 'string').toBe(true);
  });

test('a name that is not a known cat name is not accepted as a verdict', () => {
  expect(sanitizeClanRoles({ medicine: 'NotACat' }).medicine).toBeNull();
});

it('never moves a verdict once it is set', () => {
  p.settleClanRoles(colonyWithADeputy());
  const first = p.state.clanRoles.deputy;
  p.settleClanRoles(colonyWithADifferentEarlierDeputy());
  expect(p.state.clanRoles.deputy).toBe(first);
});

// Review Focus 4 — the two devices can disagree about `have` mid-sync, so a
// verdict must only ever be written from a condition that has actually been met.
it('writes nothing while no cat yet qualifies', () => {
  const solo = { ...emptyColony(), cats: [cat(A)], feeds: feed(A, ME, 3) };
  p.settleClanRoles(solo);
  expect(p.state.clanRoles).toEqual({ medicine: null, deputy: null });
});

it('loads a version-4 save that predates clanRoles, and stays version 4', () => {
  const p2 = createProgression(fakeStorage({
    'whisker-walk-save': JSON.stringify({ version: 4, points: 10 }),
  }));
  expect(p2.state.clanRoles).toEqual({ medicine: null, deputy: null });
  expect(p2.state.version).toBe(4);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/progression.test.js`
Expected: FAIL — `clanRoles` is undefined.

- [ ] **Step 3: Add the field, its sanitizer and `settleClanRoles`**

Validate a verdict name with `isStrayName`, own-property checked, exactly as `greetsFor` in `enemies.js` explains. Comment the field with why it is additive and why `SAVE_VERSION` stays 4, matching `duskWalks`' neighbouring comment.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run test/progression.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/progression.js test/progression.test.js
git commit -m "feat(clan): store the medicine cat and deputy once, and never move them"
```

---

### Task 7: Reserved kit names

**Files:**
- Modify: `src/straynames.js`
- Test: `test/straycats.test.js`, `test/clanroles.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `KIT_NAMES: readonly string[]` (12 names), and `isStrayName` accepting `CAT_NAMES ∪ KIT_NAMES`.

This is spec §6.5's recommended route and the reason 3a needs no SQL: a fed kit's name must pass `isStrayName` and the server's `(colony_id, name)` primary key, and `colony_cats.name` is plain `text` with no check constraint. **`CAT_NAMES` itself is not touched** — see the Global Constraints.

- [ ] **Step 1: Write the failing tests**

```js
// The walkRng guard. shuffled(CAT_NAMES, rng) consumes CAT_NAMES.length - 1
// draws; changing this number shifts gifts, weather, secrets and goals.
test('CAT_NAMES is still exactly 48 names', () => {
  expect(CAT_NAMES.length).toBe(48);
});

test('kit names are a separate, disjoint, validated block', () => {
  expect(KIT_NAMES.length).toBe(12);
  expect(new Set(KIT_NAMES).size).toBe(12);
  for (const n of KIT_NAMES) expect(CAT_NAMES).not.toContain(n);
});

test('isStrayName accepts a kit name and still rejects a stranger', () => {
  for (const n of KIT_NAMES) expect(isStrayName(n)).toBe(true);
  for (const bad of ['Stranger', '__proto__', '', null, 42, {}]) expect(isStrayName(bad)).toBe(false);
});

test('strayBreed is total over kit names', () => {
  for (const n of KIT_NAMES) expect(STRAY_BREEDS).toContain(strayBreed(n));
});

test('a kit name never joins a walk as an ordinary stray', () => {
  const kits = new Set(KIT_NAMES);
  for (const area of ['neighborhood', 'park', 'seaside', 'docks']) {
    const strays = createStrayCats(new THREE.Scene(), areaFor(area), 22, mulberry32(7)).strays;
    for (const s of strays) expect(kits.has(s.name)).toBe(false);
  }
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/straycats.test.js`
Expected: FAIL — `KIT_NAMES` is not exported.

- [ ] **Step 3: Add `KIT_NAMES` and widen `isStrayName`**

`isStrayName` keeps its `Set`-membership shape — add a second `Set`, or one union `Set` built from both arrays. Do not change `CAT_NAMES`, and do not make `createStrayCats` draw from the union: kits are not strays.

Header comment must say why the list is separate rather than appended: `shuffled(CAT_NAMES, rng)`'s draw count is load-bearing for `walkRng` determinism.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run test/straycats.test.js && npm test`
Expected: PASS, with no change to any existing seeded expectation. **If any seeded test shifts, stop — the draw count has moved.**

- [ ] **Step 5: Commit**

```bash
git add src/straynames.js test/straycats.test.js
git commit -m "feat(clan): reserve a validated name block for kits, leaving CAT_NAMES alone"
```

---

### Task 8: Queens and their kits

**Files:**
- Modify: `src/clanroles.js`, `src/dencats.js`
- Test: `test/clanroles.test.js`, `test/dencats-den.test.js`

**Interfaces:**
- Consumes: Task 5's `roleFor`, Task 7's `KIT_NAMES`.
- Produces: `kitsFor(queenName: string, salt: string) -> string[]` — 1 to 3 `KIT_NAMES` entries, deterministic, and `[]` for a cat whose role is not `queen`.

A kit renders **beside its mother in her den home**: no `DEN_HOMES` entry, no `colony_cats` row, nothing in `COLONY_MAX`'s accounting (spec §6.5, Global Constraints).

- [ ] **Step 1: Write the failing tests**

```js
test('only a queen has kits, and between one and three of them', () => {
  const queen = CAT_NAMES.find((n) => roleFor(n) === 'queen');
  const kits = kitsFor(queen, 'colony-1');
  expect(kits.length).toBeGreaterThanOrEqual(1);
  expect(kits.length).toBeLessThanOrEqual(3);
  for (const k of kits) expect(KIT_NAMES).toContain(k);
  const warrior = CAT_NAMES.find((n) => roleFor(n) === 'warrior');
  expect(kitsFor(warrior, 'colony-1')).toEqual([]);
});

test('the same queen and salt give the same kits on both devices', () => {
  const queen = CAT_NAMES.find((n) => roleFor(n) === 'queen');
  expect(kitsFor(queen, 'colony-1')).toEqual(kitsFor(queen, 'colony-1'));
});

test('two queens in one colony never share a kit', () => {
  const queens = CAT_NAMES.filter((n) => roleFor(n) === 'queen').slice(0, 2);
  const [a, b] = queens.map((q) => kitsFor(q, 'colony-1'));
  expect(a.filter((k) => b.includes(k))).toEqual([]);
});

test.each([null, undefined, '', 42, {}])('kitsFor is total over junk: %p', (bad) => {
  expect(kitsFor(bad, 'colony-1')).toEqual([]);
});

// Review Focus 3 — a tamed cat past the last den home has no home to sit beside.
test('a queen past the last den home has no kits placed', () => {
  // denHome returns null past DEN_HOMES.length, and tamed cats are never
  // trimmed, so this colony is reachable today.
  const queens = CAT_NAMES.filter((n) => roleFor(n) === 'queen');
  const extra = queens[queens.length - 1];
  const colony = colonyWithTamed([...CAT_NAMES.slice(0, DEN_HOMES.length), extra]);
  expect(denHome(colony, extra)).toBeNull();
  expect(placedKits(colony)).not.toContainEqual(expect.objectContaining({ queen: extra }));
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/clanroles.test.js`
Expected: FAIL — `kitsFor` is not defined.

- [ ] **Step 3: Implement `kitsFor`, then place kits in `dencats.js`**

Pick kits by walking `KIT_NAMES` from a per-queen hash offset so two queens cannot collide. Placement offsets from the queen's home should reuse `STAND_OFF`; follow `createDenCats`'s existing dispose discipline — every geometry and material disposed exactly once, as `goldmice.js` documents.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run test/clanroles.test.js test/dencats-den.test.js`
Expected: PASS

- [ ] **Step 5: Check it by eye**

In the den, with at least one queen tamed: kits sit beside their mother, read as kittens rather than small adults, and do not clip her or the furniture. A Stream 2 finding was a den nap pose that read as a pot — look properly.

- [ ] **Step 6: Commit**

```bash
git add src/clanroles.js src/dencats.js test/clanroles.test.js test/dencats-den.test.js
git commit -m "feat(clan): give a queen kits that sit beside her and take no den slot"
```

---

### Task 9: A fed kit becomes an apprentice

**Files:**
- Modify: `src/game/walk.js`
- Test: `test/colony.test.js`

**Interfaces:**
- Consumes: Task 7's `KIT_NAMES`, Task 8's `kitsFor`, and the shipped `canFeed` / `feedCat`.
- Produces: no new exports. Feeding a kit makes it an ordinary colony cat on the ordinary ladder.

No change to `canFeed`, `feedCat`, `colonyCap` or the caps — Task 7's widened `isStrayName` is what makes this work.

- [ ] **Step 1: Write the failing tests**

```js
test('a kit can be fed, and is then an ordinary colony cat', () => {
  const kit = KIT_NAMES[0];
  expect(canFeed(emptyColony(), kit, 'player-aaaaaaaa', 'walk-1000')).toBe('ok');
  const c = feedCat(emptyColony(), { name: kit, by: 'player-aaaaaaaa', walk: 'walk-1000', area: 'den', x: 0, z: 0, head: 0 });
  expect(c.cats.map((x) => x.name)).toContain(kit);
  expect(tamingProgress(c, kit).have).toBe(1);
});

test('the caps are unchanged and a kit counts against them like any cat', () => {
  expect(COLONY_MAX).toBe(24);
  expect(SOLO_MAX).toBe(12);
  expect(colonyCap(1)).toBe(12);
  expect(colonyCap(2)).toBe(24);
});

test('a kit survives a save round trip and a merge', () => {
  const kit = KIT_NAMES[0];
  const c = feedCat(emptyColony(), { name: kit, by: ME, walk: 'walk-1000', area: 'den', x: 0, z: 0, head: 0 });
  expect(sanitizeColony(c).cats.map((x) => x.name)).toContain(kit);
  expect(mergeColony(c, emptyColony()).cats.map((x) => x.name)).toContain(kit);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/colony.test.js`
Expected: FAIL if `isStrayName` has not been widened; otherwise these pass immediately and the work is the walk wiring in step 3.

- [ ] **Step 3: Wire the feed prompt for a kit in `game/walk.js`**

A kit in the den gets the same feed affordance a colony cat has. Once fed it is in `colony.cats` and every shipped path — the bar, the rank, `denHome`, the panel — already handles it.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run test/colony.test.js && npm test`
Expected: PASS

- [ ] **Step 5: Check it by eye**

Feed a kit in the den. It should appear in the Colony tab as a kit-ranked cat with one feed, and take a den home only once it is tamed.

- [ ] **Step 6: Commit**

```bash
git add src/game/walk.js test/colony.test.js
git commit -m "feat(clan): a fed kit joins the colony on the ordinary ladder"
```

---

# Phase 3 — The clan's own name

### Task 10: The clan name, and what happens at pairing

**Files:**
- Modify: `src/progression.js`
- Test: `test/progression.test.js`

**Interfaces:**
- Consumes: Task 2's `clanTitleFor`.
- Produces: `state.clan = { name: string | null, adopted: boolean }`, `sanitizeClan(v)`, `progression.ensureClanName(playerId)` (mints from `clanTitleFor(playerId)` if unset), and `progression.adoptClanName(name)` (sets `name` and `adopted: true`; a no-op once `adopted`).

**It cannot be seeded from the colony id**: `emptyColony()` sets `id: null`, the id is server-minted, and it is deliberately never displayed. Seed from the player's own id, which exists before any pairing (spec §6.6).

At pairing, **the inviter's name wins** — the owner's "the elder's wins", implemented against what the code can know. The invite flow already tells each device which role it had; the joiner calls `adoptClanName(partnerClanName)`.

- [ ] **Step 1: Write the failing tests**

Same harness as Task 6: `fakeStorage`, `createProgression`, `p.state`.

```js
it('starts with no clan name', () => {
  expect(p.state.clan).toEqual({ name: null, adopted: false });
});

it('mints a name for a solo player, with no colony id at all', () => {
  expect(p.state.colony.id).toBeNull();
  p.ensureClanName(ME);
  expect(p.state.clan.name).toBe(clanTitleFor(ME));
  expect(p.state.clan.adopted).toBe(false);
});

it('does not change the name when it mints twice', () => {
  p.ensureClanName(ME);
  const first = p.state.clan.name;
  p.ensureClanName(ME);
  expect(p.state.clan.name).toBe(first);
});

it("adopts the inviter's name once, and a re-pair cannot change it again", () => {
  p.ensureClanName(ME);
  p.adoptClanName(clanTitleFor(PARTNER));
  expect(p.state.clan).toEqual({ name: clanTitleFor(PARTNER), adopted: true });
  p.adoptClanName(clanTitleFor('player-cccccccc'));
  expect(p.state.clan.name).toBe(clanTitleFor(PARTNER));
});

test.each([null, undefined, 42, 'x', [], { name: 42 }, { name: 'NotAClanName' },
          { name: 'x'.repeat(200) }, Object.create({ name: 'MossClan' })])(
  'sanitizeClan is total over a hostile payload: %p', (bad) => {
    const out = sanitizeClan(bad);
    expect(out.name === null || typeof out.name === 'string').toBe(true);
    expect(typeof out.adopted).toBe('boolean');
  });

it('loads a version-4 save that predates clan, and stays version 4', () => {
  const p2 = createProgression(fakeStorage({
    'whisker-walk-save': JSON.stringify({ version: 4, points: 10 }),
  }));
  expect(p2.state.clan).toEqual({ name: null, adopted: false });
  expect(p2.state.version).toBe(4);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/progression.test.js`
Expected: FAIL — `clan` is undefined.

- [ ] **Step 3: Add the field, its sanitizer and the two setters**

`sanitizeClan` accepts a name only if it is a title `clanTitleFor` could have produced — a `PREFIXES` entry plus `CLAN_SUFFIX` — so a cloud payload cannot inject an arbitrary string into a displayed name.

Comment the field with why the colony id cannot seed it, so nobody "fixes" it back later.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run test/progression.test.js`
Expected: PASS

- [ ] **Step 5: Show the clan name in the Colony tab**

Through `escapeHtml` like everything else. One line; no new test file.

- [ ] **Step 6: Commit**

```bash
git add src/progression.js src/ui/colonypanel.js test/progression.test.js
git commit -m "feat(clan): mint a clan name locally, and let the inviter's win at pairing"
```

---

# Phase 4 — Rival clans

> **Cut line (spec §10):** this phase is the largest item in v21. If 3a has to be shortened, build Task 11 for **the Docks only** and stop — Phases 1 to 3 ship without it.

### Task 11: Rival territory, borders and patrol paths

**Files:**
- Create: `src/rivalclans.js`
- Test: `test/rivalclans.test.js`

**Interfaces:**
- Consumes: Task 1's `PREFIXES`, `CLAN_SUFFIX`, `DENIED_NAMES`; `seedFromCode`/`mulberry32` from `src/rng.js`; `GOLD_MICE` from `src/goldmice.js` (read-only, for the reachability test).
- Produces:
  - `rivalFor(areaId: string) -> { name: string, cx: number, cz: number, r: number } | null`
  - `isTrespassing(areaId: string, x: number, z: number) -> boolean`
  - `borderMarks(areaId: string) -> {x: number, z: number}[]`
  - `patrolPath(areaId: string) -> {x: number, z: number}[]`

All four derive from `areaId` alone, so both devices agree in a co-walk with no wire message — the same discipline `spots.js`'s `clearSpot` follows. Territory is a disc: a centre and a radius is enough, and it keeps `isTrespassing` a cheap per-frame call.

- [ ] **Step 1: Write the failing tests**

```js
const AREAS = ['neighborhood', 'park', 'seaside', 'docks'];

test('each of the four areas has one rival clan with a usable name', () => {
  for (const a of AREAS) {
    const r = rivalFor(a);
    expect(r).not.toBeNull();
    expect(r.name.endsWith(CLAN_SUFFIX)).toBe(true);
    expect(DENIED_NAMES.has(r.name)).toBe(false);
    expect(r.r).toBeGreaterThan(0);
  }
});

test('the four rival clans have four different names', () => {
  expect(new Set(AREAS.map((a) => rivalFor(a).name)).size).toBe(4);
});

test('territory, marks and patrol are identical on a second call', () => {
  for (const a of AREAS) {
    expect(rivalFor(a)).toEqual(rivalFor(a));
    expect(borderMarks(a)).toEqual(borderMarks(a));
    expect(patrolPath(a)).toEqual(patrolPath(a));
  }
});

test('border marks sit on the border, not scattered through the area', () => {
  for (const a of AREAS) {
    const { cx, cz, r } = rivalFor(a);
    for (const m of borderMarks(a)) {
      expect(Math.abs(Math.hypot(m.x - cx, m.z - cz) - r)).toBeLessThan(1.0);
    }
  }
});

test('trespassing is inside the disc and nowhere else', () => {
  for (const a of AREAS) {
    const { cx, cz, r } = rivalFor(a);
    expect(isTrespassing(a, cx, cz)).toBe(true);
    expect(isTrespassing(a, cx + r * 2, cz)).toBe(false);
  }
});

// No golden mouse may sit behind a gate. docks.js's invariant is that the
// Docks stays playable without Sea Legs; the same reasoning applies here.
test('no golden mouse is inside a rival territory', () => {
  for (const a of AREAS) {
    for (const m of GOLD_MICE[a]) expect(isTrespassing(a, m.x, m.z)).toBe(false);
  }
});

// Review Focus 2 — the den, and the fifth area Stream 6 adds.
test.each(['den', 'future-area', '', null, undefined, 42, {}])(
  'an unknown area has no rival rather than throwing: %p', (bad) => {
    expect(rivalFor(bad)).toBeNull();
    expect(borderMarks(bad)).toEqual([]);
    expect(patrolPath(bad)).toEqual([]);
    expect(isTrespassing(bad, 0, 0)).toBe(false);
  });

test.each([NaN, Infinity, -Infinity, '0', null, undefined])(
  'a non-finite position is not trespassing: %p', (bad) => {
    expect(isTrespassing('park', bad, 0)).toBe(false);
    expect(isTrespassing('park', 0, bad)).toBe(false);
  });

test('the mark count is bounded, so the decal budget is bounded', () => {
  for (const a of AREAS) expect(borderMarks(a).length).toBeLessThanOrEqual(16);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/rivalclans.test.js`
Expected: FAIL — cannot resolve `../src/rivalclans.js`.

- [ ] **Step 3: Implement `src/rivalclans.js`**

Hand-author the four `{cx, cz, r}` discs against the real coordinates in `src/world/neighborhood.js`, `park.js`, `seaside.js` and `docks.js` — read the shipped numbers rather than inventing them, exactly as `goldmice.js`'s header records doing for the perch chains. The golden-mouse test will tell you when a disc is wrong.

`borderMarks` places points evenly round the circle from a seeded offset; `patrolPath` walks the same circle. Neither may use `walkRng`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run test/rivalclans.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/rivalclans.js test/rivalclans.test.js
git commit -m "feat(clan): give each area a rival clan with a border both devices agree on"
```

---

### Task 12: Border marks on the ground

**Files:**
- Create: `src/render/bordermarks.js`
- Test: `test/bordermarks.test.js`

**Interfaces:**
- Consumes: Task 11's `borderMarks`, `rivalFor`.
- Produces: `createBorderMarks(scene, areaId, { contested = [] } = {}) -> { list, update(t), setContested(index), dispose() }`

**Flat decals, not merged props.** `mergeprops.js` merges only build-time, per-leaf-immutable geometry inside one top-level scene child, and `contactshadows.js`'s `MAX_SPAN` of 6.5 m would make a long merged strip's ground decal vanish silently. Use `scent.js`'s `CircleGeometry` + `MeshBasicMaterial` idiom, which `kitten.js` already copies. Budget this as fill rate, so `render/quality.js` may give the low tier fewer.

**A contested mark is never deleted** — spec §6.7 and the v21 spec's §10.1. `setContested` changes a mark's appearance; nothing removes one.

- [ ] **Step 1: Write the failing tests**

```js
test('one decal per border mark, added to the scene', () => {
  const scene = new THREE.Scene();
  const api = createBorderMarks(scene, 'park');
  expect(api.list).toHaveLength(borderMarks('park').length);
});

test('an unknown area makes nothing rather than throwing', () => {
  const scene = new THREE.Scene();
  expect(createBorderMarks(scene, 'den').list).toHaveLength(0);
});

test('contesting a mark changes it and never removes it', () => {
  const api = createBorderMarks(new THREE.Scene(), 'park');
  const before = api.list.length;
  api.setContested(0);
  expect(api.list).toHaveLength(before);
});

test('dispose empties the scene and disposes every geometry and material once', () => {
  // test/goldmice.test.js's pattern: spy on each geometry.dispose and the
  // shared material.dispose, then assert one call each and an empty scene.
  const scene = new THREE.Scene();
  const api = createBorderMarks(scene, 'park');
  const spies = api.list.map((m) => vi.spyOn(m.mesh.geometry, 'dispose'));
  api.dispose();
  for (const sp of spies) expect(sp).toHaveBeenCalledTimes(1);
  expect(scene.children).toHaveLength(0);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/bordermarks.test.js`
Expected: FAIL — cannot resolve `../src/render/bordermarks.js`.

- [ ] **Step 3: Implement `createBorderMarks`**

Mirror `createGoldMice`'s shape: build, `update(t)`, `remove`-free, `dispose()` that disposes each geometry and the shared material exactly once. Lay decals flat (`rotation.x = -Math.PI / 2`) just above ground to avoid z-fighting, as `scent.js` does.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run test/bordermarks.test.js`
Expected: PASS

- [ ] **Step 5: Check it by eye, and take a draw-call reading**

In each of the four areas: the border reads as a line you could follow, the decals do not z-fight with the ground, and they are visible at walking pace without stalking. Take a fresh `renderer.info` reading in-game before and after — the v21 spec's §5 says the recorded baseline is stale and to measure rather than quote, and that a harness understates real cost by roughly 2×.

- [ ] **Step 6: Commit**

```bash
git add src/render/bordermarks.js test/bordermarks.test.js
git commit -m "feat(clan): mark a rival border with flat decals you can follow"
```

---

### Task 13: The patrol, and being chased back over the border

**Files:**
- Create: `src/rivalcats.js`
- Modify: `src/game/walk.js`
- Test: `test/rivalcats.test.js`

**Interfaces:**
- Consumes: Task 11's `patrolPath`, `isTrespassing`, `rivalFor`; Task 12's `createBorderMarks`.
- Produces:
  - `patrolAt(areaId: string, t: number) -> {x: number, z: number} | null` — pure, for tests and for both devices.
  - `chaseOutcome(areaId, catPos, patrolPos) -> { chased: boolean, to: {x, z} | null }` — pure. `to` is a point just outside the border.
  - `createRivalPatrol(scene, areaId, { reducedMotion = false } = {}) -> { update(dt, catPos), dispose() }`

**The crossing cost must be recoverable, funny and never retroactive** (v21 spec §4 as revised, §10.1). Being chased back over the border is the whole of it. It may not reduce taming, remove a colony cat, delete a mark, reverse a trade, or touch points.

- [ ] **Step 1: Write the failing tests**

```js
test('the patrol is in the same place on both devices at the same time', () => {
  for (const a of AREAS) expect(patrolAt(a, 12.5)).toEqual(patrolAt(a, 12.5));
});

test('the patrol walks the border', () => {
  const { cx, cz, r } = rivalFor('park');
  for (const t of [0, 3, 7.5, 60]) {
    const p = patrolAt('park', t);
    expect(Math.abs(Math.hypot(p.x - cx, p.z - cz) - r)).toBeLessThan(1.0);
  }
});

test('an unknown area has no patrol', () => {
  expect(patrolAt('den', 0)).toBeNull();
});

test('you are chased only when inside the border and the patrol is near', () => {
  const { cx, cz, r } = rivalFor('park');
  const inside = { x: cx, z: cz };
  expect(chaseOutcome('park', inside, inside).chased).toBe(true);
  expect(chaseOutcome('park', { x: cx + r * 3, z: cz }, inside).chased).toBe(false);
});

test('being chased puts you outside the border, and nothing else', () => {
  const { cx, cz, r } = rivalFor('park');
  const out = chaseOutcome('park', { x: cx, z: cz }, { x: cx, z: cz });
  expect(Math.hypot(out.to.x - cx, out.to.z - cz)).toBeGreaterThan(r);
  expect(Object.keys(out).sort()).toEqual(['chased', 'to']);
});

// The anti-goal, as a test: recoverable, funny, never retroactive.
test('a chase has no channel to progress at all', () => {
  // Structural, because this is an anti-goal rather than a behaviour: the
  // module cannot take anything away if it cannot reach anything that stores
  // progress. Same discipline enemies.js's header documents for its own
  // two-import rule.
  const src = readFileSync(new URL('../src/rivalcats.js', import.meta.url), 'utf8');
  for (const forbidden of ['progression.js', 'colony.js', 'discoveries.js']) {
    expect(src).not.toContain(forbidden);
  }
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/rivalcats.test.js`
Expected: FAIL — cannot resolve `../src/rivalcats.js`.

- [ ] **Step 3: Implement `rivalcats.js`, then wire it into a walk**

Keep `patrolAt` and `chaseOutcome` pure and free of THREE, in the leaf-module discipline `enemies.js` and `skills.js` document; the THREE half is `createRivalPatrol`. In `game/walk.js`, build the patrol and the border marks per area and call `update` from the existing per-frame tick. Reuse the stray cat model rather than authoring a new one.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run test/rivalcats.test.js && npm test`
Expected: PASS

- [ ] **Step 5: Check it by eye, on a phone profile**

Use `resize_window` with the mobile preset and reload so touch mode appears. Drive the joystick over a border with synthetic TouchEvents on `.touch-ui`. Confirm: the chase reads as funny rather than punishing, you end up outside the border facing in, nothing is taken, and no toast stack covers the cat — six stacked toasts over the cat was a real Stream 2 finding.

- [ ] **Step 6: Commit**

```bash
git add src/rivalcats.js src/game/walk.js test/rivalcats.test.js
git commit -m "feat(clan): a rival patrol that chases you back over the border and takes nothing"
```

---

### Task 14: Clan vocabulary for cats outside the clan

**Files:**
- Modify: `src/game/interactions.js`, `src/game/walk.js`
- Test: `test/clanwords.test.js`

**Interfaces:**
- Consumes: Task 1's `OUTSIDE_WORDS`.
- Produces: no new exports. Display strings only.

Spec §6.3's third table: a greeted stray reads as a **loner**, a cross cat (`enemies.js`'s grudge) as a **rogue**, the player's own cat as a **kittypet** turned warrior. **No mechanical change whatsoever** — `FRIEND_RUNGS`, `enemies.js`, the grudge rules and the nametag moods are untouched.

Note where these words actually live: a grudge surfaces as `nametag.js`'s dusky-red tag in the 3D world, not as text in the Colony tab, so the words to change are in the HUD prompts and toasts that `game/interactions.js` and `game/walk.js` write. `nametag.js` paints the cat's name only — leave it alone.

- [ ] **Step 1: Write the failing tests**

The behavioural assertion here is a structural one, which is the honest shape for spec §6.8's requirement that **nothing outside `clanwords.js` hard-codes a borrowed word**. Toasts and HUD prompts are not unit-testable without a DOM; this invariant is, and it is the one that actually has to hold for decision 3's one-commit swap.

```js
test('no borrowed word is hard-coded anywhere but clanwords.js', () => {
  const words = [...Object.values(OUTSIDE_WORDS), ...Object.values(RANK_WORDS), CLAN_SUFFIX];
  const files = globSync('src/**/*.js').filter((f) => !f.endsWith('clanwords.js'));
  const offenders = [];
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    for (const w of words) {
      // a borrowed word inside a string literal, not in a comment
      if (new RegExp(`['\`"][^'\`"\\n]*\\b${w}\\b`, 'i').test(stripComments(src))) {
        offenders.push(`${f}: ${w}`);
      }
    }
  }
  expect(offenders).toEqual([]);
});

test('the rung ladder itself has not moved', () => {
  expect(FRIEND_RUNGS).toEqual({ met: 1, friend: 3, best: 6 });
});
```

`stripComments` is a few lines in the test file — a word in a `//` or `/* */` comment is documentation, not a hard-coded string, and the codebase comments heavily.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/clanwords.test.js`
Expected: FAIL — the prompts and toasts still carry their own words.

- [ ] **Step 3: Route every display string through `OUTSIDE_WORDS` and `RANK_WORDS`**

No logic changes, no new branches: only the strings the player reads. If a word is awkward in a prompt's sentence, change the sentence around it in `clanwords.js`-sourced pieces rather than hard-coding a variant.

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Check it by eye**

Greet a stray, then find a cross cat (the dusky-red tag is visible from roughly three times the normal range). Confirm the prompts and toasts read naturally with the clan words in them, and that a player who has not read the books could still tell what the game is telling her.

- [ ] **Step 6: Commit**

```bash
git add src/game/interactions.js src/game/walk.js test/clanwords.test.js
git commit -m "feat(clan): call a cat outside the clan a loner or a rogue"
```

---

## Self-review notes

Checked against the spec, 2026-10-25:

- **Coverage.** §6.1 → Tasks 1, 4. §6.2 → Task 2. §6.3 → Tasks 2, 3, 14. §6.4 → Tasks 5, 6, and the leader half in Task 4. §6.5 → Tasks 7, 8, 9. §6.6 → Task 10. §6.7 → Tasks 11, 12, 13. §6.8 → Task 1.
- **Deliberately not in this plan:** everything in §9's Stream 3b list, and the fifth area's rival clan (§6.7 assigns it to Stream 6; Task 11's Review Focus 2 test is what keeps 3a from breaking when it arrives).
- **Deliberately left open:** §11's builder list — pool contents and size, the hashes' tiebreak, role distribution bands, territory shapes, and what a chase looks like on screen.
- **Naming consistency:** `clanNameOf`, `clanRankFor`, `prefixFor`, `warriorSuffixFor`, `clanTitleFor`, `candidateStarNames` (Task 2/4); `roleFor`, `pickMedicineCat`, `pickDeputy`, `kitsFor` (Task 5/8); `rivalFor`, `isTrespassing`, `borderMarks`, `patrolPath` (Task 11); `createBorderMarks` (Task 12); `patrolAt`, `chaseOutcome`, `createRivalPatrol` (Task 13). Each is defined once and consumed under the same name.
- **One collision caught in review:** `progression.js` already exports `rankFor` and `RANKS` for the player's points ladder, so the clan ladder's function is `clanRankFor`. The two must never be merged — a clan rank is not a score.
- **The one thing that could stop this plan:** Task 7. If reserving a validated kit-name block turns out not to work, kits need SQL and that reverses spec decision 11 — stop and ask the owner rather than writing schema.
