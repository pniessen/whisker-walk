# Clan Edition: Pick Your Clan — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each kid picks one of the five book clans (under our own homage names). The two kids' clans are always allies, and each built territory gets a computer-run patrol at a camp, following the "your clan's home" rule.

**Architecture:**
- **Clan ids are the home territory ids:** `woods`, `moor`, `river`, `pines` and `gorge`. "Your clan's home" is then just `areaId === pick`.
- **Homage words** live in `src/clanwords.js`. The **structural data** (each clan's neighbours, whether it can be picked yet, the truce places, the patrol rule) lives in a new leaf, `src/clanhomes.js`.
- **`rivalFor(areaId, picks)` keeps one fixed disc per area.** Only the clan that owns the disc depends on the picks, and it is worked out from an unordered set of picks. So two devices holding the same picks compute the same patrol.
- **That is not a promise that two devices always agree.** Each device holds its own cached copy of the sibling's pick.
  - A device may briefly hold a stale copy. The room-join pull refreshes it and skips the throttle (Task 5).
  - In a co-walk with a friend who is not the colony partner, neither device knows the other's pick at all.
  - Either way the mismatch is cosmetic: a different patrol clan name and coat on one screen. It takes nothing, and it never makes the sibling's own clan hostile to the sibling.
- **The pick is an additive save field.** The sibling's pick reaches the other device through the public profile row that already exists, and is cached in the save. No SQL is needed.

**Tech Stack:** Three.js 0.185, Vite 8, Vitest 4, plain ES modules.

**Spec:** `docs/superpowers/specs/2026-10-31-editions-and-territories-design.md`. Read the owner's decisions 1–3, §1's tables, §3 "Where the clans live", §5 and §8 step 2. The clan spec it builds on is `docs/superpowers/specs/2026-10-25-whisker-walk-v21-the-clan-design.md`.

## Global Constraints

- **Legacy Edition never changes.**
  - `rivalForWalk(_, 'legacy', _)` is `null`.
  - Legacy shows no picker, no homage name and no allies line.
  - A Legacy walk writes no clan field.
  - The pick stays stored in Legacy, hidden, not deleted (decision 1).
- **Nothing takes a kid's progress away.** A pick, a change of pick or a sync never touches points, cats, colony, marks, walks or unlocks.
- **Saves stay `SAVE_VERSION` 4.** `clanPick` is one additive, sanitised top-level field. Junk loads as `{ mine: null, partner: null, partnerId: null }`.
- **"Always allies":**
  - a patrol's clan is never either kid's pick;
  - nothing scores one kid's clan against the other's;
  - patrols come only from computer-run clans (decision 2).
- **Close homages, never canon names (decision 3).**
  - No homage word contains a book clan word (Thunder, Wind, River, Shadow, Sky, Star, Blood, Tiger, Lion, Leopard).
  - Each homage word must pass the existing `test/clanwords.test.js` rules (validPetName, DENIED_NAMES, not a stray, kit or legendary name, and not a PREFIXES, CAT_PREFIXES or RIVAL_PREFIXES word).
- **Borrowed-word scan.**
  - No `src/` string literal outside `clanwords.js` may contain a RANK_WORDS, OUTSIDE_WORDS or PLACE_WORDS value, or the word `Clan` (case-insensitive, whole word).
  - So UI copy that needs the word composes it from `CLAN_SUFFIX`, e.g. `` `Pick your ${CLAN_SUFFIX.toLowerCase()}` ``.
  - Avoid "leader", "kit", "warrior" and the other rank words in copy.
- **Areas build the same in both editions and for every pick.**
  - No world file reads the edition or the pick.
  - Disc **positions** never depend on edition or pick, because `marks.js`, `markcontest.js` and the saved `<area>-border-<ring>` ids read them.
- **The chase takes nothing** (clan spec §10.1). Nothing goes on the co-walk wire.
- **Tests assert membership, never whole lists of areas or territories**, so a new territory id doesn't break them.
- **Commits** use an explicit `git add <files>` and end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Test command:** `npx vitest run --exclude '.claude/**' --exclude '.worktrees/**'`

## Decisions (settled 2026-10-31: none of these is open)

The owner answered the clan questions on 2026-10-31. The coordinator ruled on the rest the same day. Each item below says which. Build exactly this.

- **D1. Names: decided by the owner.**
  - Woods **StormClan**, Moor **GaleClan**, River **BrookClan**, Pines and Swamp **DuskClan**, Gorge **CliffClan**.
  - The other words in each list stay in `HOMAGE_CHOICES` as spares (Task 1). So a later change is one line, and the spare is already tested.
  - "Cliff" was checked against the clanwords rules on 2026-10-31:
    - `CliffClan` passes validPetName;
    - it is not in DENIED_NAMES;
    - it is not a stray, kit or legendary name, or a PREFIXES, CAT_PREFIXES, RIVAL_PREFIXES or WARRIOR_SUFFIXES word;
    - it contains no book clan word.
  - It is not a RANK_WORDS, OUTSIDE_WORDS or PLACE_WORDS value, and `CliffClan` is only ever composed at runtime. So the borrowed-word scan has nothing to flag.
- **D2. What can be picked: coordinator's ruling.**
  - Four clans can be picked now: woods, moor, river and pines. That includes GaleClan and DuskClan, whose maps aren't built yet. Their cards carry a small "territory coming soon" note while their map's `TERRITORIES` status isn't `'built'`.
  - CliffClan is named now, but it can only be picked once the Gorge is built (`pickable: false` in its `HOMES` row).
- **D3. Same clan: decided by the owner.** Both kids may pick the same clan. It is celebrated ("You're both StormClan!"), never blocked.
- **D4. Changing and not picking.** The first sub-point is decided by the owner. The second is how the plan behaves before a kid picks.
  - A pick can be changed any time on the home screen, for free. Changing loses nothing.
  - Before a kid picks, the minted pair name (MossClan and the like) still shows, and every territory's own clan patrols it.
- **D5. Where picking happens.**
  - A "Pick your clan" row of cards in the **Where to** pill, above the territory map (Clan Edition only).
  - A select in Settings, labelled `` `Your ${CLAN_SUFFIX.toLowerCase()}` `` (Clan Edition only).
- **D6. Reaching the sibling: coordinator's ruling. No SQL change.**
  - Each device publishes its pick as `home` inside the `accessories` jsonb of its public profile row. `upsert_profile` already stores any jsonb, and no reader iterates its keys.
  - A paired colony pull reads the partner's row, at most once a minute, and caches the pick in `state.clanPick`.
  - **Coordinator's ruling:** the pull made on joining the siblings' room skips that minute's throttle.
  - A cached pick is only ever replaced by a valid one, never cleared, unless the partner changes. So a partner on an old build can't erase it.
- **D7. Patrols: decided by the owner.** In your own clan's territory, a neighbouring clan patrols at the same camp. Each territory has one fixed disc (its "camp"). Its clan is:
  - the territory's own clan, if neither kid picked it;
  - otherwise the first neighbour, in the row's order, that neither kid picked;
  - otherwise no patrol.
  - **Note (2026-10-31, owner's decision for clan life):** once Clan Life Part 1 lands, the owner has decided that intruders replace this neighbour patrol at your own camp: on land where you are at home (your clan's or your sibling's), no patrol runs. That supersedes D7 for the clan-life era. Build D7 here as written; Clan Life Part 1, Task 5 (`docs/superpowers/plans/2026-10-31-clan-life-1-cast-camp-verbs.md`) gates the patrol off at home, and Part 2 (`docs/superpowers/plans/2026-10-31-clan-life-2-intruders-fights.md`) adds the intruders.
- **D8. Camp spots: coordinator's ruling. They stay as proposed.**
  - **Woods:** (2, −43), r 6. It sits in the north glade across the river, facing the Moor.
    - Its ring reaches z −49, about 1 m from the map's north edge (z −50). **Coordinator's ruling: accepted.**
    - A cat chased out on that side has no room to land northward, so `findLanding` sets it down sideways, round the ring. That is the existing fallback, and `rivalworld`'s landing cases cover it.
    - The camp tree inside the disc is at (3.44, −45.4). It is also a bird perch.
  - **River:** (5, 1), r 6. It sits in open ground south-west of the foot of the river bend (16, −9) and about 20 m east of the bank path. It is not in the middle of the wet meadow, which centres on (2, 28).
    - The camp tree inside the disc is at (7.62, 3.12).
  - Both were probed against the built maps (2026-10-31). Each clears every POI, find, scenic, golden mouse, vantage and the spawn by 20 m or more.
  - Each disc has its one camp tree inside it, as the Docks container sits inside the Docks disc today. Only unlabelled perches (the tree's own, and birds') may sit inside a camp (Task 3 test).
  - The Moor and the Pines add a row when they are built. The island never gets one (truce).
- **D5 is the plan's own choice, which the coordinator did not reopen. D9, D10 and D11 are kept as written (coordinator's ruling).**
- **D9. Old areas don't change.** The Neighborhood/Twolegplace, Park, Seaside and Docks keep HedgeClan, AlderClan, DuneClan and HeronClan, whatever the picks.
- **D10. Colony title.**
  - It shows your clan, e.g. "StormClan".
  - When the sibling's pick differs, it shows "StormClan & GaleClan · allies".
  - **Coordinator's ruling:** "· allies" shows only when `mine` is set. A kid who hasn't picked sees the minted name alone, even if the sibling has picked.
- **D11. Coming home.** A walk that starts in your own clan's territory toasts once: "Home to StormClan's land 🏡".

## The questions, as answered (2026-10-31)

The chosen word is in bold; the rest are spares.

1. **Names (owner):**
   - Woods: **Storm**, Tempest, Lightning, Oak.
   - Moor: **Gale**, Gust, Heather, Swift.
   - River: **Brook**, Ripple, Reed, Otter.
   - Pines and Swamp: **Dusk**, Night, Murk, Gloom.
   - Gorge: **Cliff**, Cloud, Hawk, Falcon.
2. **Can both kids pick the same clan?** Yes, and it's celebrated (owner).
3. **Can the gorge clan be picked before the Gorge exists?** No. CliffClan becomes pickable when the Gorge is built (coordinator).
4. **How is the pick shared?** Through the public profile row, with no SQL change (coordinator).
5. **Who patrols your own clan's territory?** A neighbouring clan, at the same camp (owner).
6. **Can a kid change clans later?** Yes, any time, for free (owner).
7. **Are the camp spots right?** Yes, as proposed (coordinator).

## Review Focus

1. **The partner's pick is unknown or stale** (not paired, offline, or the sibling on an old build that pushes a profile without `home`). Expected: a known pick is never forgotten, and an unknown one simply isn't excluded. Test: Task 5, "an old-build profile without home keeps the cached pick".
2. **Any pair of picks, the same pick, or only one pick.** Expected: the patrol clan is never a pick, and the same set of picks gives the same clan in either order. Test: Task 2, an exhaustive loop over every territory × every ordered pair of picks, asserting that the result is not a pick and that it is symmetric. Devices whose cached picks differ may show different patrol names; that is cosmetic (see Architecture).
3. **Legacy** (a Legacy save with a pick, or a Legacy kid in a co-walk). Expected: no patrol, no picker, no homage name, and the pick kept. Tests: Task 3 (`rivalForWalk` legacy null), Task 4 (the flip invariant still deep-equal), Task 7 (no picker in Legacy).
4. **Hostile payloads.** A cloud save `clanPick` of `{ mine: '__proto__' }`, a profile `home` of `'constructor'`, `42` or `'gorge'` from a newer build, or a bad `partnerId`. Expected: sanitised, never thrown; a known id like `'gorge'` survives even though it can't be picked here. Tests: Tasks 4 and 5.
5. **A territory with no row yet** (the Moor before its row, the island). Expected: no patrol, no crash, and the island never gets a patrol. Test: Task 3 (`rivalFor('island', anyPicks)` null, and `DISCS` has no truce key).

---

## File structure

| File | Change | Responsibility |
|---|---|---|
| `src/clanwords.js` | modify (append at the END of the file) | `HOMAGE_CHOICES`, `HOMAGE_PREFIXES`, `HOME_LINES` (flavour copy) |
| `src/clanhomes.js` | **create** | Leaf: `HOMES`, `TRUCE_AREAS`, `isClanId`, `pickableClans`, `clanName`, `patrolClanFor`, `picksOf`, `ownClanTitle`, `alliesName`, `homeWelcome` |
| `src/rivalclans.js` | modify | `DISCS` rows `woods`, `river`; `rivalFor(areaId, picks = [])` |
| `src/edition.js` | modify (additive) | `rivalForWalk(areaId, edition, picks = [])` |
| `src/rivalcats.js`, `src/markcontest.js` | modify | take a `picks` option and pass it to `rivalFor` |
| `src/colony.js` | modify (one word) | `export` the existing `isPlayerId` |
| `src/progression.js` | modify | `clanPick` field, `sanitizeClanPick`, `setClanPick`, `setPartnerClanPick` |
| `src/game/rooms.js` | modify | `pushProfileNow` publishes `accessories.home`; the room-join pull asks for a fresh pick |
| `src/game/colonysync.js` | modify | read the partner's pick on paired pulls; `pull({ freshPick })`; `noteOwnPick()`; `clanPick` in `signature()` |
| `src/game/walk.js` | modify | pass picks to the rival, the patrol and the contest; the home toast |
| `src/ui/clanpicker.js` | **create** | Pure `clanPickerModel(state)` and `renderClanPickerHtml(model)` |
| `src/ui/dressingroom.js`, `src/ui/homebase.js`, `src/ui/colonypanel.js` | modify | mount the picker, the Settings select, clicks, and the colony title |
| tests | see each task | |

---

### Task 1: Homage names in clanwords.js

**Files:**
- Modify: `src/clanwords.js` (append at the very END of the file, after `DENIED_NAMES`)
- Test: `test/clanwords.test.js` (append)

**Interfaces:**
- Produces:
  - `HOMAGE_CHOICES: Readonly<Record<'woods'|'moor'|'river'|'pines'|'gorge', readonly string[]>>`
  - `HOMAGE_PREFIXES: Readonly<Record<same keys, string>>`
  - `HOME_LINES: Readonly<Record<same keys, string>>` (one plain flavour line per clan)

- [ ] **Step 1: Write the failing tests** (append to `test/clanwords.test.js`; the import line gains `HOMAGE_CHOICES, HOMAGE_PREFIXES, HOME_LINES`)

```js
// Kept in the TEST only: src/ never spells a book clan's name.
const CANON_CLAN_WORDS = ['thunder', 'wind', 'river', 'shadow', 'sky', 'star', 'blood', 'tiger', 'lion', 'leopard'];

test('HOMAGE_CHOICES: frozen, 3-4 distinct words per clan, the chosen one among them', () => {
  expect(Object.isFrozen(HOMAGE_CHOICES)).toBe(true);
  expect(Object.isFrozen(HOMAGE_PREFIXES)).toBe(true);
  for (const id of ['woods', 'moor', 'river', 'pines', 'gorge']) {
    const list = HOMAGE_CHOICES[id];
    expect(Object.isFrozen(list)).toBe(true);
    expect(list.length).toBeGreaterThanOrEqual(3);
    expect(list.length).toBeLessThanOrEqual(4);
    expect(list).toContain(HOMAGE_PREFIXES[id]);
    expect(typeof HOME_LINES[id]).toBe('string');
  }
  expect(Object.keys(HOMAGE_PREFIXES).sort()).toEqual(Object.keys(HOMAGE_CHOICES).sort());
});

test('every homage word is our own: no canon clan word inside it, ever', () => {
  for (const w of Object.values(HOMAGE_CHOICES).flat()) {
    for (const c of CANON_CLAN_WORDS) expect(w.toLowerCase().includes(c), `${w} has ${c}`).toBe(false);
  }
});

test('every homage word makes a valid, undenied, unclaimed clan title', () => {
  const all = Object.values(HOMAGE_CHOICES).flat();
  expect(new Set(all).size).toBe(all.length);
  const strays = new Set([...CAT_NAMES, ...KIT_NAMES, ...LEGENDARY_NAMES].map((n) => n.toLowerCase()));
  const claimed = new Set([...PREFIXES, ...Object.values(CAT_PREFIXES), ...Object.values(RIVAL_PREFIXES)]
    .map((w) => w.toLowerCase()));
  for (const w of all) {
    expect(validPetName(w + CLAN_SUFFIX), w).toBe(true);
    expect(DENIED_NAMES.has(w + CLAN_SUFFIX) || DENIED_NAMES.has(w), w).toBe(false);
    expect(strays.has(w.toLowerCase()), w).toBe(false);
    expect(claimed.has(w.toLowerCase()), w).toBe(false);
    expect(WARRIOR_SUFFIXES.includes(w.toLowerCase()), w).toBe(false);
    expect(w.length).toBeLessThanOrEqual(10);
  }
});
```

- [ ] **Step 2: Run them and check they fail**

Run: `npx vitest run test/clanwords.test.js`
Expected: FAIL. `HOMAGE_CHOICES` is undefined.

- [ ] **Step 3: Add the three exports to `src/clanwords.js`**

The values are exactly these. Keys are unquoted identifiers, and each key is the clan's home territory id.

```js
woods: ['Storm', 'Tempest', 'Lightning', 'Oak'],
moor:  ['Gale', 'Gust', 'Heather', 'Swift'],
river: ['Brook', 'Ripple', 'Reed', 'Otter'],
pines: ['Dusk', 'Night', 'Murk', 'Gloom'],
gorge: ['Cliff', 'Cloud', 'Hawk', 'Falcon'],
```

- `HOMAGE_PREFIXES` is `{ woods: 'Storm', moor: 'Gale', river: 'Brook', pines: 'Dusk', gorge: 'Cliff' }`. These are the owner's picks of 2026-10-31.
- `HOME_LINES`:
  - woods: `'oak woods, ferns and sunny clearings'`
  - moor: `'open heather, wind and rabbits'`
  - river: `'reeds, fishing and the pond'`
  - pines: `'dark pines and the swamp'`
  - gorge: `'rocks, cliff dens and tall pines'`

Freeze each list and each object.

The header comment says:
- these are homages chosen with the 11-year-old (decision 3);
- `HOMAGE_PREFIXES` holds the names chosen on 2026-10-31, and the rest of each list are spares, so a change is one line;
- once a name has shipped, change a value only if she asks, because nothing is stored by name (saves store the id).

Do **not** add these words to the scanner's `BORROWED` list. They are ordinary words that `src/` already uses for other things: "storm" (the weather) and `'CLIFF'` (a friend-code word list in `src/cloud.js`). Adding them would break the scan for no gain.

Add one more test beside the others: `expect(HOMAGE_PREFIXES.gorge + CLAN_SUFFIX).toBe('CliffClan')`. It pins the owner's choice.

- [ ] **Step 4: Run them and check they pass**

Run: `npx vitest run test/clanwords.test.js`
Expected: PASS. If a word ever fails, drop the word and put in a spare (Thorn, Hare, Kestrel or Eagle, all checked 2026-10-31). Never weaken the rule.

- [ ] **Step 5: Commit**

```bash
git add src/clanwords.js test/clanwords.test.js
git commit -m "feat(clans): homage names for the five book clans

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: clanhomes.js, the allies rule as data

**Files:**
- Create: `src/clanhomes.js` (a leaf: imports `clanwords.js` only; no DOM, no THREE, no `colony.js`)
- Test: `test/clanhomes.test.js`

**Interfaces:**
- Consumes: `HOMAGE_PREFIXES`, `CLAN_SUFFIX` (Task 1).
- Produces:
  - `HOMES: Readonly<Record<ClanId, { neighbours: readonly ClanId[], pickable: boolean }>>`. The rows:
    - `woods: { neighbours: ['moor', 'river'], pickable: true }`
    - `river: { neighbours: ['pines', 'woods'], pickable: true }`
    - `moor: { neighbours: ['woods', 'pines'], pickable: true }`
    - `pines: { neighbours: ['river', 'moor'], pickable: true }`
    - `gorge: { neighbours: [], pickable: false }`
  - `TRUCE_AREAS: readonly string[]`, which is `['island']`.
  - `isClanId(v): boolean`, an own-key check.
  - `pickableClans(): ClanId[]`, in `HOMES` order.
  - `clanName(id): string`, which is `HOMAGE_PREFIXES[id] + CLAN_SUFFIX`, or `''` for a non-id.
  - `patrolClanFor(areaId, picks): ClanId | null`
  - `picksOf(state): ClanId[]`. It returns `mine`, plus `partner` only when `state.clanPick.partnerId === state.colony?.partner?.playerId`.
    - The partner check is plain equality of ids. It does not validate the id's shape; `sanitizeClanPick` already did that.
    - Invalid clan ids are dropped, and the function is total over junk.
  - `ownClanTitle(state): string`. In Clan Edition with a valid `mine`, it is `clanName(mine)`. Otherwise it is `state.clan?.name ?? ''`. In Legacy it is `''`.
  - `alliesName(state): string`. It is `clanName(partner)` only when `mine` is set and the partner's pick is current, valid and different from `mine`. Otherwise, and in Legacy, it is `''`.
  - `homeWelcome(areaId, state): string | null`. In Clan Edition, when `areaId === mine`, it is `` `Home to ${clanName(mine)}'s land 🏡` ``; otherwise `null`.

The rule, in order:

```
patrolClanFor(areaId, picks):
  if areaId is in TRUCE_AREAS or is not an own key of HOMES -> null
  taken = the set of valid clan ids in picks (anything else in picks is ignored)
  if areaId is not taken -> areaId
  first n in HOMES[areaId].neighbours with n not taken -> n
  -> null
```

**Don't import `edition.js` here.** `edition.js` imports `rivalclans.js`, which will import `clanhomes.js`, so importing it would make a cycle. Inline the Clan Edition test as `state?.edition !== 'legacy'`, the same rule as `edition.isClanEdition`, and say why in a comment.

- [ ] **Step 1: Write the failing tests**

```js
import { test, expect } from 'vitest';
import { HOMES, TRUCE_AREAS, isClanId, pickableClans, clanName, patrolClanFor, picksOf, ownClanTitle, alliesName, homeWelcome } from '../src/clanhomes.js';
import { CLAN_SUFFIX, HOMAGE_PREFIXES } from '../src/clanwords.js';

const IDS = Object.keys(HOMES);
const PICKS = [null, ...IDS];

test('every clan has a homage name and its neighbours are clans', () => {
  for (const id of IDS) {
    expect(clanName(id)).toBe(HOMAGE_PREFIXES[id] + CLAN_SUFFIX);
    for (const n of HOMES[id].neighbours) expect(isClanId(n)).toBe(true);
  }
});

test('the four first-release clans can be picked; the gorge cannot yet', () => {
  for (const id of ['woods', 'moor', 'river', 'pines']) expect(pickableClans()).toContain(id);
  expect(pickableClans()).not.toContain('gorge');
});

test('ALLIES: a patrol is never a kid\'s clan, for every territory and every pair of picks', () => {
  for (const area of IDS) for (const a of PICKS) for (const b of PICKS) {
    const picks = [a, b].filter(Boolean);
    const clan = patrolClanFor(area, picks);
    if (clan !== null) expect(picks).not.toContain(clan);
    expect(patrolClanFor(area, [b, a].filter(Boolean))).toBe(clan); // both devices agree
  }
});

test("a territory's own clan patrols it unless a kid picked it (your clan's home)", () => {
  expect(patrolClanFor('woods', [])).toBe('woods');
  expect(patrolClanFor('woods', ['river'])).toBe('woods');
  expect(patrolClanFor('woods', ['woods'])).toBe('moor');
  expect(patrolClanFor('woods', ['woods', 'moor'])).toBe('river');
  expect(patrolClanFor('river', ['river', 'river'])).toBe('pines');
});

test('the island is a truce place, and an unknown area has no patrol', () => {
  expect(TRUCE_AREAS).toContain('island');
  for (const picks of [[], ['woods'], ['pines', 'moor']]) expect(patrolClanFor('island', picks)).toBeNull();
  for (const bad of ['park', '__proto__', 'constructor', undefined, 7]) expect(patrolClanFor(bad, [])).toBeNull();
});

test('junk in picks is ignored, never thrown on', () => {
  expect(patrolClanFor('woods', ['__proto__', 5, null, 'woods'])).toBe('moor');
  expect(patrolClanFor('woods', 'woods')).toBe('woods'); // not an array: no picks
});

test('picksOf counts the partner only while they are still the partner', () => {
  const st = (pick, partnerNow) => ({ edition: 'canon', clanPick: pick, colony: { partner: partnerNow ? { playerId: partnerNow } : null } });
  expect(picksOf(st({ mine: 'woods', partner: 'moor', partnerId: 'p2' }, 'p2'))).toEqual(['woods', 'moor']);
  expect(picksOf(st({ mine: 'woods', partner: 'moor', partnerId: 'p2' }, 'p3'))).toEqual(['woods']);
  expect(picksOf(st({ mine: null, partner: null, partnerId: null }, null))).toEqual([]);
  for (const junk of [null, undefined, {}, { clanPick: 'x' }, { clanPick: { mine: '__proto__' } }]) expect(picksOf(junk)).toEqual([]);
});

test('names on screen: own title, allies, the home toast; Legacy says none', () => {
  const s = { edition: 'canon', clan: { name: 'MossClan' }, clanPick: { mine: null, partner: 'moor', partnerId: 'p2' }, colony: { partner: { playerId: 'p2' } } };
  expect(ownClanTitle(s)).toBe('MossClan');
  expect(alliesName(s)).toBe(''); // no "· allies" until I have picked
  s.clanPick = { mine: 'woods', partner: 'moor', partnerId: 'p2' };
  expect(ownClanTitle(s)).toBe(clanName('woods'));
  expect(alliesName(s)).toBe(clanName('moor'));
  expect(homeWelcome('woods', s)).toContain(clanName('woods'));
  expect(homeWelcome('river', s)).toBeNull();
  s.clanPick.partner = 'woods';
  expect(alliesName(s)).toBe(''); // same clan: no separate ally
  s.edition = 'legacy';
  expect([ownClanTitle(s), alliesName(s), homeWelcome('woods', s)]).toEqual(['', '', null]);
});
```

- [ ] **Step 2: Run them and check they fail**

Run: `npx vitest run test/clanhomes.test.js`
Expected: FAIL. The module isn't found.

- [ ] **Step 3: Implement `src/clanhomes.js`** with the interfaces above.

- All objects are frozen.
- All reads use `Object.hasOwn`.
- The header comment states the allies rule and the "add a row" recipe. A territory that lands later:
  - edits its `HOMES` row only if its neighbours change;
  - adds its disc in `rivalclans.js`;
  - adds nothing here if it is a truce place, except an entry in `TRUCE_AREAS`.

- [ ] **Step 4: Run them and check they pass**

Run: `npx vitest run test/clanhomes.test.js test/clanwords.test.js`
Expected: PASS. The borrowed-word scan stays green: the welcome string has no literal "Clan".

- [ ] **Step 5: Commit**

```bash
git add src/clanhomes.js test/clanhomes.test.js
git commit -m "feat(clans): clan homes, neighbours and the allies patrol rule

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Camps in the Woods and the River, and picks through the rival

**Files:**
- Modify: `src/rivalclans.js`, `src/edition.js`, `src/rivalcats.js`, `src/markcontest.js`
- Test: `test/rivalclans.test.js`, `test/rivalworld.test.js`, `test/edition.test.js` (two existing pins flip, one test added), `test/rivalcats.test.js` (one case), `test/markcontest.test.js` (one case)

**Interfaces:**
- Consumes: `patrolClanFor`, `clanName`, `TRUCE_AREAS` (Task 2).
- Produces:
  - `DISCS` gains `woods: { cx: 2, cz: -43, r: 6 }` and `river: { cx: 5, cz: 1, r: 6 }`.
  - `rivalFor(areaId, picks = []) -> { name, clan, cx, cz, r } | null`:
    - For the four old areas: as today, with `clan: null`, and `picks` ignored.
    - For a territory with a disc: the clan is `patrolClanFor(areaId, picks)`, and the name is `clanName(clan)`. If the clan is `null`, the result is `null`.
    - Geometry never depends on `picks`.
  - `rivalForWalk(areaId, edition, picks = [])`: `null` in Legacy, otherwise `rivalFor(areaId, picks)`.
  - `createRivalPatrol(scene, areaId, { ..., picks = [] })` and `createMarkContest({ ..., picks = [] })` call `rivalFor(areaId, picks)` for the name. The patrol's look (`strayBreed(rival.name)`) follows the name, so both devices agree when their picks agree.
  - `isTrespassing`, `borderMarks`, `patrolPath`, `chaseOutcome`, `findLanding` and `marks.contestable` keep calling `rivalFor(areaId)` or `discOf`. They need geometry only, which `rivalFor(areaId)` gives for every disc (no picks means the territory's own clan, never `null`).

- [ ] **Step 1: Write the failing tests**

In `test/rivalclans.test.js`:
- add `woods` and `river` to `SPAWNS`, using `SPAWN` from `src/world/woods.js` and `src/world/river.js`;
- change the spawn test (R19, "each area's player spawn point is outside its rival disc") to loop over `Object.keys(SPAWNS)` instead of `AREAS`, so it covers every map with a spawn entry;
- replace "DISCS and RIVAL_PREFIXES cover the same areas" with:

```js
test('every disc belongs to an old area with a rival word, or to a clan home', () => {
  for (const a of Object.keys(DISCS)) expect(Object.hasOwn(RIVAL_PREFIXES, a) || isClanId(a), a).toBe(true);
  for (const a of Object.keys(RIVAL_PREFIXES)) expect(DISCS).toHaveProperty(a);
});

test('the truce places never get a disc', () => {
  for (const a of TRUCE_AREAS) {
    expect(Object.hasOwn(DISCS, a)).toBe(false);
    expect(rivalFor(a, ['woods'])).toBeNull();
  }
});

test('the Woods and the River have camps; the patrol follows the picks, the camp never moves', () => {
  for (const a of ['woods', 'river']) {
    const own = rivalFor(a);
    expect(own.clan).toBe(a);
    expect(own.name).toBe(clanName(a));
    const home = rivalFor(a, [a]);
    expect(home.clan).not.toBe(a);
    expect([home.cx, home.cz, home.r]).toEqual([own.cx, own.cz, own.r]);
    expect(borderMarks(a)).toEqual(borderMarks(a));
  }
});

test('the old areas ignore picks entirely', () => {
  for (const a of ['neighborhood', 'park', 'seaside', 'docks']) expect(rivalFor(a, ['woods', 'moor'])).toEqual(rivalFor(a));
});
```

In `test/rivalworld.test.js`:
- import `build` from `src/world/woods.js` and `src/world/river.js`;
- add `woods` and `river` to `BUILD`, so every existing patrol, mark, chase and landing case runs on the real built territories;
- extend "nothing the player must reach is inside a territory" to `built[a].collectibles` and `built[a].scenics` (the old areas pass already; this pins it for every map);
- add: "only unlabelled perches sit inside a camp". For every `a` in `BUILD` that `isClanId(a)`, every perch with `isTrespassing(a, p.x, p.z)` has no `label` and no `vantage`. The camp tree's own perch and its bird perch are unlabelled. A labelled lookout must never be inside.

In `test/edition.test.js`, **flip two existing pins** that hold on main 32f204e:
- line 52, inside "rivalForWalk: none in Legacy, the usual one in Clan Edition": `expect(rivalForWalk('woods', 'canon')).toBeNull();` becomes `expect(rivalForWalk('woods', 'canon').clan).toBe('woods');`
- line 73, inside "the shipped Legacy guards cover the River": `expect(rivalForWalk('river', 'canon')).toBeNull();` becomes `expect(rivalForWalk('river', 'legacy')).toBeNull();` plus `expect(rivalForWalk('river', 'canon').clan).toBe('river');`

Then add:

```js
test('rivalForWalk: Legacy never, Clan Edition follows the picks', () => {
  expect(rivalForWalk('woods', 'legacy', [])).toBeNull();
  expect(rivalForWalk('woods', 'canon', []).clan).toBe('woods');
  expect(rivalForWalk('woods', 'canon', ['woods']).clan).not.toBe('woods');
  expect(rivalForWalk('island', 'canon', [])).toBeNull();
});
```

In `test/rivalcats.test.js` and `test/markcontest.test.js`, add one case each: with `picks: ['woods']` in the Woods, the chase toast name or contest toast is `clanName(patrolClanFor('woods', ['woods']))`.

- [ ] **Step 2: Run them and check they fail**

Run: `npx vitest run test/rivalclans.test.js test/rivalworld.test.js test/edition.test.js test/rivalcats.test.js`
Expected: FAIL. There is no `woods` disc yet.

- [ ] **Step 3: Implement**

- Add the two `DISCS` rows. Each gets a header paragraph in the existing style, naming its camp tree and the clearances measured:
  - **woods (2, −43) r 6:** "the north glade beyond river-west, facing the Moor, round the oak at (3.44, −45.4), which is also a bird perch; 23 m from the nearest find. The ring comes within about 1 m of the north edge (z −50), so a cat chased out northward is set down sideways, round the ring, by findLanding's fallback."
  - **river (5, 1) r 6:** "open ground south-west of the foot of the river bend and east of the bank path (the wet meadow itself centres on (2, 28)), round the willow at (7.62, 3.12); 21 m from the nearest find."

  Read each tree's species from the built map. If it isn't an oak or a willow, name what it is.
- Then make the `rivalFor`/`rivalForWalk`/`picks` option changes listed under Interfaces.
- If a ring point fails a collider check in `rivalworld`, nudge the centre by 1 m within the probed band (Woods x 0–3, z −45 to −42; River x 3–7, z 0–3) and write down the final numbers. Do not shrink r below 5.

- [ ] **Step 4: Run them and check they pass**

Run: `npx vitest run test/rivalclans.test.js test/rivalworld.test.js test/edition.test.js test/rivalcats.test.js test/markcontest.test.js test/marks.test.js test/bordermarks.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/rivalclans.js src/edition.js src/rivalcats.js src/markcontest.js test/rivalclans.test.js test/rivalworld.test.js test/edition.test.js test/rivalcats.test.js test/markcontest.test.js
git commit -m "feat(clans): camps in the Woods and the River, patrols by the allies rule

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The pick in the save

**Files:**
- Modify: `src/colony.js` (export `isPlayerId`), `src/progression.js`
- Test: `test/progression.test.js`, `test/editions.invariants.test.js`

**Interfaces:**
- Consumes: `isClanId`, `pickableClans` (Task 2), `isClanEdition` (edition.js).
- Produces:
  - `defaultState().clanPick = { mine: null, partner: null, partnerId: null }`
  - `export function sanitizeClanPick(v): { mine, partner, partnerId }`:
    - `mine` and `partner` must pass `isClanId` (so a newer build's `'gorge'` survives);
    - `partnerId` must pass `isPlayerId`;
    - `partner` without a valid `partnerId` becomes `null`.
  - `api.setClanPick(id): boolean`. It refuses in Legacy and refuses ids not in `pickableClans()`. Saving the same id again is a no-op that returns `true`. It changes only `clanPick.mine`.
  - `api.setPartnerClanPick(partnerId, id): boolean`:
    - a new `partnerId` replaces both fields (`partner` becomes `id`, or `null` if `id` is invalid);
    - the same `partnerId` with a valid `id` updates `partner`;
    - the same `partnerId` with an invalid or missing `id` changes nothing (an old-build profile never erases a known pick);
    - it saves only on change.
- The load path (`parsed.clanPick`) goes through `sanitizeClanPick`.

- [ ] **Step 1: Write the failing tests**

```js
test('clanPick: default, sanitised, additive', () => {
  const p = createProgression(fakeStorage());
  expect(p.state.clanPick).toEqual({ mine: null, partner: null, partnerId: null });
  expect(p.state.version).toBe(4);
  for (const junk of [null, 5, 'woods', [], { mine: '__proto__' }, { mine: 'park' }, { partner: 'moor' }, { partner: 'moor', partnerId: 'not an id!' }]) {
    expect(sanitizeClanPick(junk).mine === null || isClanId(sanitizeClanPick(junk).mine)).toBe(true);
    expect(sanitizeClanPick(junk).partner).toBeNull();
  }
  expect(sanitizeClanPick({ mine: 'gorge' }).mine).toBe('gorge'); // a newer build's pick survives
});

test('setClanPick: pickable ids only, refused in Legacy, touches nothing else', () => {
  const p = createProgression(fakeStorage());
  const before = structuredClone(p.state);
  expect(p.setClanPick('gorge')).toBe(false);
  expect(p.setClanPick('park')).toBe(false);
  expect(p.setClanPick('woods')).toBe(true);
  expect({ ...p.state, clanPick: before.clanPick }).toEqual(before);
  p.setEdition('legacy');
  expect(p.setClanPick('moor')).toBe(false);
  expect(p.state.clanPick.mine).toBe('woods'); // kept, hidden
});

test('setPartnerClanPick: learns, never forgets for the same partner, resets for a new one', () => {
  const p = createProgression(fakeStorage());
  p.setPartnerClanPick(PARTNER, 'moor');
  p.setPartnerClanPick(PARTNER, undefined); // an old build's profile with no home
  expect(p.state.clanPick).toMatchObject({ partner: 'moor', partnerId: PARTNER });
  p.setPartnerClanPick(OTHER, undefined);
  expect(p.state.clanPick).toMatchObject({ partner: null, partnerId: OTHER });
});
```

(`PARTNER` and `OTHER` are valid player ids in the file's existing fixture style.)

In `test/editions.invariants.test.js`:
- change the key test to `[...KEYS_AT_FB6BA0F, 'edition', 'clanPick']`, and rename it "edition and clanPick are the only new top-level keys";
- add: with `clanPick.mine = 'woods'`, a flip to Legacy and back is still deep-equal apart from `edition`.

- [ ] **Step 2: Run them and check they fail**

Run: `npx vitest run test/progression.test.js test/editions.invariants.test.js`
Expected: FAIL. `clanPick` is undefined.

- [ ] **Step 3: Implement** the interfaces above. The new field's comment follows the file's "Additive, so SAVE_VERSION stays 4" pattern.

- [ ] **Step 4: Run the whole suite**

Run: `npx vitest run --exclude '.claude/**' --exclude '.worktrees/**'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/colony.js src/progression.js test/progression.test.js test/editions.invariants.test.js
git commit -m "feat(clans): each kid's clan pick in the save, and the partner's cached

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The pick reaches the sibling's device

**Files:**
- Modify: `src/game/rooms.js` (`pushProfileNow`), `src/game/colonysync.js`
- Test: `test/colonysync.test.js`, `test/rooms.test.js`

**Interfaces:**
- Consumes: `progression.setPartnerClanPick`, `isClanId`, `cloud.fetchProfiles(ids) -> rows` (an existing select on `profiles`, returning `{ player_id, accessories, ... }`).
- Produces:
  - `pushProfileNow` sends `accessories.home = st.clanPick.mine` (or `null`) beside the seven slots, in both editions.
  - `colonySync.noteOwnPick(): Promise<void>` calls `pushProfileNow()`.
  - `export const PICK_FETCH_MS = 60_000`
  - **`pull({ freshPick = false } = {})`.**
    - `freshPick: true` clears the throttle (`lastPickTry = -Infinity`) before the single-flight check, so it applies even when it joins a pull already in flight.
    - Existing `pull()` calls are unchanged.
    - `rooms.js` `walkWithPartner` calls `colonySync.pull({ freshPick: true })` after a successful join (coordinator's ruling: the room-join pull skips the throttle).
  - **On every paired pull,** after `setColonyLink`, the partner's pick is fetched when either:
    - the partner id differs from the last one tried this session, or
    - `PICK_FETCH_MS` has passed since the last **attempt**.

    `lastPickTry = Date.now()` is recorded on every attempt, before the request, whether it then succeeds, fails or finds nothing. So a failing server is retried at most once a minute.

    The fetch is `cloud.fetchProfiles([partnerId])`.
    - A result that is not an array means "no row", silently: no warning and no change.
    - Otherwise take the row whose `player_id === partnerId`, read `accessories.home` with an own-property check on a plain object, and call `progression.setPartnerClanPick(partnerId, home)`.
  - A fetch failure is swallowed (`warnOnce`) and never fails the pull. Solo and `!MP` make no fetch.
  - **`signature()`** becomes `JSON.stringify([status(), progression.state.colony, progression.state.unlocked.accessories, progression.state.clanPick])`. A newly learned partner pick then re-renders the home base, through `notifyIfChanged`, exactly once.

- [ ] **Step 1: Write the failing tests** (add `'fetchProfiles'` to `CLOUD_METHODS`)

```js
test('a paired pull learns the partner\'s pick from their profile', async () => {
  const { cs, progression, cloud } = setup({ script: {
    colonySync: () => pairedSnap(),
    fetchProfiles: () => [{ player_id: SIB, accessories: { collar: null, home: 'moor' } }],
  } });
  await cs.pull();
  expect(cloud.fetchProfiles).toHaveBeenCalledWith([SIB]);
  expect(progression.state.clanPick).toMatchObject({ partner: 'moor', partnerId: SIB });
});

test('a newly learned partner pick fires onChange exactly once', async () => {
  const { cs, onChange } = setup({ script: {
    colonySync: () => pairedSnap(),
    fetchProfiles: () => [{ player_id: SIB, accessories: { home: 'moor' } }],
  } });
  await cs.pull(); // learns the link, the colony and the pick
  onChange.mockClear();
  // vi.setSystemTime past PICK_FETCH_MS; the same pick comes back: no change, no call
  await cs.pull();
  expect(onChange).not.toHaveBeenCalled();
  // the sibling changes clan
  // (script.fetchProfiles now returns home 'river'; vi.setSystemTime past PICK_FETCH_MS again)
  await cs.pull();
  expect(onChange).toHaveBeenCalledTimes(1);
});

test('an old-build profile without home keeps the cached pick', async () => { /* seed partner 'moor', fetch returns { accessories: {} }, still 'moor' */ });
test('a hostile home is ignored', async () => { /* '__proto__', 42, 'park' -> partner stays null */ });
test('a non-array fetchProfiles result is "no row": no change, no warning, pull resolves', async () => { /* null, {}, 'x' */ });
test('the partner pick is tried at most once a minute, failures included', async () => {
  /* vi.useFakeTimers(); vi.setSystemTime(T0). fetchProfiles throws.
     Two pulls 3 s apart -> one attempt. vi.setSystemTime(T0 + PICK_FETCH_MS + 1) -> two attempts. vi.useRealTimers() in afterEach. */
});
test('pull({ freshPick: true }) skips the throttle', async () => { /* a pull, then pull({ freshPick: true }) 3 s later -> two fetches */ });
test('a failed profile fetch never fails the pull', async () => { /* fetchProfiles throws -> pull resolves, colony merged */ });
test('unpaired and solo pulls fetch no profile', async () => { /* unpairedSnap -> fetchProfiles not called */ });
```

`SIB` (`'bbbbbbbb-2222'`) is the partner id the file's `pairedSnap()` members already use. Control time with `vi.useFakeTimers()` and `vi.setSystemTime(...)`, and restore real timers after each test.

In `test/rooms.test.js`, give the `pushProfileNow` test **its own fake cloud**: a `{ pushProfile: vi.fn(async () => 'ok') }` returned by `getCloud`, and nothing shared with the file's other fixtures. Assert that it sends `accessories.home === 'woods'` after `setClanPick('woods')`, and `null` before it.

Also in `test/rooms.test.js`: `walkWithPartner()` calls `colonySync.pull` with `{ freshPick: true }` after a successful join.

- [ ] **Step 2: Run them and check they fail**

Run: `npx vitest run test/colonysync.test.js test/rooms.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement** the interfaces above. The new block in `colonysync.js` gets a comment explaining:
  - why the public profile is used: no SQL step, and both devices already push it;
  - why a missing `home` never clears the cache;
  - that nothing goes on the co-walk wire;
  - that two devices can briefly disagree on the patrol's name (a stale cache, or a room friend who isn't the partner), and that this is cosmetic.

- [ ] **Step 4: Run them and check they pass**

Run: `npx vitest run test/colonysync.test.js test/rooms.test.js test/ghosts.test.js test/remotecats.test.js`
Expected: PASS. The ghosts and remote cats still draw from an `accessories` object that carries `home`.

- [ ] **Step 5: Commit**

```bash
git add src/game/rooms.js src/game/colonysync.js test/colonysync.test.js test/rooms.test.js
git commit -m "feat(clans): share each kid's clan pick through the profile row

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Walks use the picks

**Files:**
- Modify: `src/game/walk.js` (the rival block around line 1208, and the line after the mark-contest block)
- Test: `test/walk.edition.test.js` (source pins only), `test/rivalcats.test.js` (the strip at line 376)

**Interfaces:**
- Consumes: `picksOf`, `homeWelcome` (Task 2); `rivalForWalk(areaId, edition, picks)` and the `picks` options (Task 3).
- Produces:
  - **`walk.js` computes `const picks = picksOf(progression.state);` once per walk start.**
    - Put it on its own line **above** the `// The rival's border and its patrol (v21 Stream 3a).` comment, not inside the branch that comment opens. `test/rivalcats.test.js` slices the source from that comment to `session.rival = {` and forbids `progression.` in the slice.
    - The value is used in `rivalForWalk(areaId, progression.state.edition, picks)`, in `createRivalPatrol(..., { picks, ... })` and in `createMarkContest({ picks, ... })`.
  - **The home toast.** Put this line directly **after the mark-contest block** (the `if (session.rival.borderMarks) { ... }` that closes around line 1271), before the yard-dog comment:

    ```js
    const welcome = isDen ? null : homeWelcome(areaId, progression.state);
    if (welcome) hud.toast(welcome);
    ```

    - It is deliberately far from the `hud.setArea(...)` line around 1525, where the kittypets plan puts its own walk-start toast.
    - `homeWelcome` is already `null` in Legacy and for any area that isn't your clan's home (Task 2's unit tests).

- [ ] **Step 1: Write the failing tests**

The `test/walk.edition.test.js` harness throws `STOP` inside the area build. It can't reach a walk's toasts or patrol, so this task pins the source. The behaviour is covered by Task 2's `homeWelcome`/`picksOf` unit tests and Task 3's `rivalForWalk` tests.

In `test/walk.edition.test.js`, replace the first source pin ("the rival patrol is gated on the edition") with:

```js
it('the rival patrol is gated on the edition and the picks', () => {
  const src = readFileSync('src/game/walk.js', 'utf8');
  expect(src).toMatch(/const picks = picksOf\(progression\.state\);/);
  expect(src).toMatch(/rivalForWalk\(areaId, progression\.state\.edition, picks\)/);
  expect(src).toMatch(/createRivalPatrol\([^)]*\{[\s\S]*?picks/);
  expect(src).toMatch(/createMarkContest\(\{[\s\S]*?picks/);
  expect(src).not.toMatch(/\brivalFor\(/);
  // picks is computed before the rival's branch, not inside it
  expect(src.indexOf('const picks = picksOf(')).toBeLessThan(src.indexOf("The rival's border and its patrol"));
});

it('the home toast is gated on the den and comes from homeWelcome', () => {
  const src = readFileSync('src/game/walk.js', 'utf8');
  expect(src).toMatch(/isDen \? null : homeWelcome\(areaId, progression\.state\)/);
});
```

In `test/rivalcats.test.js` (the "the chase branch writes nothing" test, around line 376), change the strip to the new call:

```js
const code = branch.replace(/\/\/.*$/gm, '').replace('rivalForWalk(areaId, progression.state.edition, picks)', '');
```

Update the comment above it to say the edition and the picks gate the patrol and write nothing.

- [ ] **Step 2: Run them and check they fail**

Run: `npx vitest run test/walk.edition.test.js test/rivalcats.test.js`
Expected: FAIL. The `walk.edition` pins don't match yet. The `rivalcats` strip no longer matches the old call, so `progression.` is left in the slice.

- [ ] **Step 3: Implement.** Keep the block's existing "THE CHASE TAKES NOTHING" comment, and add one line saying that the picks only choose the clan's name.

- [ ] **Step 4: Run the whole suite**

Run: `npx vitest run --exclude '.claude/**' --exclude '.worktrees/**'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/walk.js test/walk.edition.test.js test/rivalcats.test.js
git commit -m "feat(clans): walks use both kids' picks for the patrol, and welcome you home

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Picking on the home screen and in Settings

**Files:**
- Create: `src/ui/clanpicker.js`
- Modify:
  - `src/ui/dressingroom.js`: add `clanPicker` to the Clan Edition `clanPlaces` model, and render it at the top of the Where-to pill;
  - `src/ui/homebase.js`: the click handler, the Settings select, and colony panel args;
  - `src/ui/colonypanel.js`: the title and the allies line;
  - `src/style.css`: small card styles, reusing the `.dr-place` look;
  - the spec, `docs/superpowers/specs/2026-10-31-editions-and-territories-design.md`.
- Test: `test/clanpicker.test.js`, `test/homebase.edition.test.js`, `test/colonypanel.test.js`, `test/dressingroom.test.js`

**Interfaces:**
- Consumes: `pickableClans`, `clanName`, `HOME_LINES`, `ownClanTitle`, `alliesName`, `progression.setClanPick`, `colonySync.noteOwnPick`.
- Produces:
  - `clanPickerModel(state) -> { mine: ClanId|null, both: boolean, cards: [{ id, name, line, place, soon: boolean, mine: boolean, partner: boolean }] }`:
    - one card per `pickableClans()`;
    - `place` is the territory name from `TERRITORIES` (The Woods, The Moor, ...);
    - `soon` is true when that territory's `TERRITORIES` status isn't `'built'` (today the Moor and the Pines). The card can still be picked (coordinator's ruling) and shows a small "territory coming soon" note;
    - `partner` is true only when the partner's pick is current (via `picksOf`);
    - `both` is true when `mine` equals the current partner pick.
  - `renderClanPickerHtml(model, partnerName) -> string`:
    - a heading: `` `Pick your ${clanWord}` `` when `mine` is `null`, else `` `Your ${clanWord}: ${name}` ``, with `const clanWord = CLAN_SUFFIX.toLowerCase()`;
    - one `<button class="dr-clan" data-clan-pick="<id>" aria-pressed>` per card, showing the name, `of ${place}`, the flavour line, "✓ yours" on `mine`, and `🤝 ${escapeHtml(partnerName)}'s` on `partner`;
    - when `both`, a line `` `You're both ${name}!` ``.
  - `homebase.js`:
    - a click on `[data-clan-pick]` calls `progression.setClanPick(id)`, then `colonySync?.noteOwnPick()` (fire-and-forget), then `render()`;
    - Settings gains, in Clan Edition only, a row labelled `` `Your ${CLAN_SUFFIX.toLowerCase()}` `` holding `<select id="set-clan-pick">`. Its first option is `— not picked yet —` (disabled, selected while unpicked), then one option per pickable clan, labelled `clanName(id)`. A `change` does the same as a click.
    - The colony sheet passes `clanName: ownClanTitle(s)` and `alliesName: alliesName(s)`.
  - `renderColonyHtml({ ..., alliesName })`. The title is `${clanName} & ${alliesName} · allies` when `alliesName` is set; otherwise it is as today. `alliesName` is already `''` until `mine` is set (D10 ruling). It is still empty in Legacy.

- [ ] **Step 1: Write the failing tests**

`test/clanpicker.test.js`:
- an unpicked save gets the heading "Pick your …" and four cards, the gorge's not among them;
- a pick marks exactly one card `mine`;
- the partner's current pick marks `partner`, and a stale `partnerId` marks none;
- the same pick for both gives `both` and the "You're both" line;
- a hostile partner pet name is escaped;
- the Moor and Pines cards have `soon: true` and render "territory coming soon", and the Woods and River cards have `soon: false`. Write these as membership checks over the cards, not a whole-list equality.

There is **no** rendered-HTML borrowed-word test: "Pick your clan" renders the word by design. The existing source scan in `test/clanwords.test.js` already covers `src/ui/clanpicker.js`'s literals. Leave `borrowedIn` where it is.

`test/dressingroom.test.js`: the Where-to pill holds `data-clan-pick` in Clan Edition and not in Legacy.

`test/homebase.edition.test.js`:
- tapping a `[data-clan-pick="moor"]` sets `state.clanPick.mine` to `'moor'` and calls `noteOwnPick` once;
- `#set-clan-pick` is present in Clan Edition, absent in Legacy;
- in Legacy, nothing on the home screen contains `clanName('woods')`, even with a pick stored.

`test/colonypanel.test.js`:
- the title reads "StormClan & GaleClan · allies" for different picks;
- just "StormClan" for the same pick;
- just the minted name when only the sibling has picked;
- unchanged, the minted name, with no pick;
- empty in Legacy.

- [ ] **Step 2: Run them and check they fail**

Run: `npx vitest run test/clanpicker.test.js test/dressingroom.test.js test/homebase.edition.test.js test/colonypanel.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement.** The cards wrap two to a row at phone width. Reuse the existing `.dr-place` sizing and colours; no new images are needed.

- [ ] **Step 4: Run the whole suite, then check it in the app**

Run: `npx vitest run --exclude '.claude/**' --exclude '.worktrees/**'`
Expected: PASS.

Then check it in the app with `npm run dev`:
- In the Where-to pill, pick StormClan. Start a Woods walk: the home toast shows, and the patrol at the glade camp is GaleClan.
- Back home, pick BrookClan. A Woods walk now has the StormClan patrol.
- Flip to Legacy: there is no picker, no Woods card, and the colony title is plain.
- Flip back: the pick is still there.
- Check the cards at a 375 px width.
- **iPhone draw-count reading.** On the iPhone 18, with the perf readout on (Settings → Performance readout), walk the Woods and the River on High and stand where the camp is in view.
  - Note the draw calls and fps beside each map's reading from its own build.
  - The camp adds the patrol cat and up to 12 border-mark decals. Expect a few draws more than before and 60 fps held.
  - Record the numbers in the commit message body. If fps drops below 60, stop and report rather than trimming the camp.

- [ ] **Step 5: Update the spec**

In §3 "Where the clans live":
- replace "*(waits for the clan-pick step)*" with a short paragraph stating the rule (D7), the camps (D8), the truce, and "a later territory adds one row";
- point it at this plan.

In §8 step 2, add "Plan: `docs/superpowers/plans/2026-10-31-clan-edition-pick-your-clan.md`".

- [ ] **Step 6: Commit**

```bash
git add src/ui/clanpicker.js src/ui/dressingroom.js src/ui/homebase.js src/ui/colonypanel.js src/style.css test/clanpicker.test.js test/dressingroom.test.js test/homebase.edition.test.js test/colonypanel.test.js docs/superpowers/specs/2026-10-31-editions-and-territories-design.md
git commit -m "feat(clans): pick your clan on the home screen and in Settings

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8 (only once the Moor is on main): the Moor's camp

The `moor` branch (`.worktrees/moor`) is being built in parallel. It pins `rivalForWalk('moor', 'canon')` to `null` in `test/moor.test.js`, and in `test/edition.test.js` beside the Woods and River pins that Task 3 flips. Do this task only after the Moor merges. If it hasn't merged when Task 7 is done, stop and report. The Pines does the same in its own plan.

**Files:**
- Modify:
  - `src/rivalclans.js` (one `DISCS` row);
  - `test/rivalworld.test.js` (one `BUILD` entry);
  - `test/rivalclans.test.js` (`SPAWNS` entry);
  - `test/moor.test.js` (the `null` pin becomes a camp pin);
  - `test/edition.test.js` (flip the Moor branch's `rivalForWalk('moor', 'canon')` `null` pin the same way Task 3 flipped the Woods and River: Legacy `null`, Clan Edition `.clan === 'moor'`).
- Possibly modify: `src/clanhomes.js`, only to reorder the `moor` row's neighbours so that `[0]` is the side the camp faces.

**The recipe** (the same for the Pines later):

1. **Probe for a centre.** Use a throwaway test, not committed: grid-search the built map for a centre where r 6 (or 5) keeps:
   - every ring point walkable;
   - every ring point 0.4 m beyond `collider.r + CAT_RADIUS`;
   - the whole disc 3 m or more from every POI, collectible, scenic, golden mouse, labelled perch and the spawn.

   Name the camp tree (or rock) inside the disc in the row's header comment, with its coordinates, as Task 3 does.

   Prefer the side facing `HOMES.moor.neighbours[0]`.
2. **The Pines also keeps the disc clear of the truce path** to the island bridge (decision 8). Add a `rivalworld` case that the disc stays 3 m or more from every segment of the Pines' exported bridge path.
3. **Write tests first:**
   - a `rivalworld` `BUILD` entry;
   - `rivalForWalk('moor', 'canon', []).clan === 'moor'`;
   - `rivalForWalk('moor', 'canon', ['moor']).clan !== 'moor'`.

   Watch them fail, add the row, and watch them pass.
4. **Commit:**

   ```bash
   git add src/rivalclans.js test/rivalworld.test.js test/rivalclans.test.js test/moor.test.js test/edition.test.js
   git commit -m "feat(clans): the Moor's camp

   Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
   ```

---

## Overlaps (parallel work: plan around these, don't edit their files)

- **The kittypets plan** edits `src/clanwords.js` and only **imports** from `src/edition.js` (it doesn't edit it).
  - In `clanwords.js`, this plan **only appends** three new exports at the very **end of the file**, after `DENIED_NAMES`: `HOMAGE_CHOICES`, `HOMAGE_PREFIXES` and `HOME_LINES`. No existing export changes, and `BORROWED` (in the test) is not touched. If the kittypets plan also appends at the end, the merge is a trivial adjacent-hunk resolve.
  - In `edition.js`, this plan **only adds an optional third parameter** to `rivalForWalk(areaId, edition, picks = [])`. Every existing export keeps its signature and behaviour, so the kittypets plan's imports are unaffected.
  - **`src/game/walk.js`:** the kittypets plan adds a walk-start toast after `hud.setArea(...)` (around line 1525). This plan's home toast goes right after the mark-contest block (around line 1271), so the two hunks are far apart.
  - The kittypets line "Robbie, a kittypet who walks with …" should read the clan name from `ownClanTitle(state)` in `src/clanhomes.js` (Task 2).
- **The Moor** (`moor` branch) touches `src/progression.js` (2 lines), `src/goldmice.js`, `src/world/builder.js` and its own files, and pins `rivalForWalk('moor', 'canon')` to `null` (in `test/moor.test.js` and `test/edition.test.js`).
  - This plan adds no Moor disc until Task 8, so those pins hold until Task 8 flips them.
  - If the Moor merges before Task 3, its `test/edition.test.js` pin sits beside the two that Task 3 flips. Leave it alone in Task 3.
  - Both plans edit `src/progression.js` in different places: `defaultState`/the load path/api here, the catalog there.
- **The Pines and the island** (being planned):
  - each adds one `DISCS` row by Task 8's recipe;
  - the island adds **no** row, and `TRUCE_AREAS` already lists `island`;
  - the Pines must keep its camp off the truce path to the bridge.
- **Shared test files edited here:**
  - `test/rivalworld.test.js` (`BUILD` map) and `test/rivalclans.test.js` (`SPAWNS` map): each later territory adds one line;
  - `test/editions.invariants.test.js`: the top-level key list gains `'clanPick'`. Another plan that adds a top-level key must add its key beside it.
  - `test/edition.test.js`: Task 3 flips the Woods and River `null` pins; Task 8 flips the Moor's.
  - `test/rivalcats.test.js`: Task 6 changes the strip in the "chase branch writes nothing" test to the new `rivalForWalk(..., picks)` call.
- **Coming next, not in this plan:** the playtester also wants territories to feel more clan-like (clan-style names for every cat there, and the camp marked on the maps). That waits on an owner question. Nothing here starts it.
