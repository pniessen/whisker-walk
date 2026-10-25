import { test, expect } from 'vitest';
import { roleFor, pickMedicineCat, pickDeputy, kitsFor, placedKits } from '../src/clanroles.js';
import { CAT_NAMES, KIT_NAMES } from '../src/straynames.js';
import { tamedCats, denResidents, denHome } from '../src/colony.js';
import { DEN_HOMES } from '../src/den.js';

test('roles spread across the shipped names rather than landing on one', () => {
  const counts = { elder: 0, queen: 0, warrior: 0 };
  for (const n of CAT_NAMES) counts[roleFor(n)] += 1;
  expect(counts.warrior).toBeGreaterThan(counts.elder + counts.queen);
  expect(counts.elder).toBeGreaterThan(0);
  expect(counts.queen).toBeGreaterThan(0);
  // Each queen later gets kits from a 12-name pool; keep queens modest.
  expect(counts.queen).toBeLessThan(10);
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

test('adding any later-tamed cat never displaces the incumbent medicine cat', () => {
  // Cats are tamed in reverse-name order with rising stamps, so every newcomer
  // sorts BEFORE the incumbent by name; taming order must still hold the post.
  const grown = [];
  let incumbent = null;
  [...CAT_NAMES].reverse().forEach((n, i) => {
    grown.push({ name: n, tamedWalk: `walk-${1000 + i}` });
    const now = pickMedicineCat(grown);
    if (incumbent !== null) expect(now).toBe(incumbent);
    incumbent = now;
  });
});

test('the medicine cat is the earliest-tamed eligible cat, not the first by name', () => {
  // Tamed in non-alphabetical order: Mochi, then Olive, then Pickles.
  const base = [
    { name: 'Pickles', tamedWalk: 'walk-3000' },
    { name: 'Mochi', tamedWalk: 'walk-1000' },
    { name: 'Olive', tamedWalk: 'walk-2000' },
  ];
  const eligible = base.filter((c) => ['warrior', 'elder'].includes(roleFor(c.name)));
  const earliest = [...eligible].sort((a, b) => a.tamedWalk.localeCompare(b.tamedWalk))[0].name;
  expect(pickMedicineCat(base)).toBe(earliest);
  // A later-tamed cat that sorts first by name does not take the post.
  const aName = CAT_NAMES.filter((n) => roleFor(n) === 'warrior').sort()[0];
  expect(aName < 'Mochi').toBe(true);
  const withA = [...base, { name: aName, tamedWalk: 'walk-9000' }];
  expect(pickMedicineCat(withA)).toBe(earliest);
});

const FEEDS = [
  { cat: 'Mochi', by: 'player-aaaaaaaa', walk: 'walk-3000' },
  { cat: 'Pickles', by: 'player-aaaaaaaa', walk: 'walk-1000' },
  { cat: 'Pickles', by: 'player-bbbbbbbb', walk: 'walk-2000' },
  { cat: 'Mochi', by: 'player-bbbbbbbb', walk: 'walk-4000' },
];

test('the deputy is the first cat two different players fed', () => {
  expect(pickDeputy(FEEDS)).toBe('Pickles');
});

test('a cat only one player fed is never deputy', () => {
  const feeds = [
    { cat: 'Pickles', by: 'player-aaaaaaaa', walk: 'walk-1000' },
    { cat: 'Pickles', by: 'player-aaaaaaaa', walk: 'walk-2000' },
  ];
  expect(pickDeputy(feeds)).toBeNull();
});

test('the deputy does not depend on the order the feed list arrives in', () => {
  const reversed = [...FEEDS].reverse();
  expect(pickDeputy(reversed)).toBe(pickDeputy(FEEDS));
});

test('every permutation of a feed list gives the same deputy', () => {
  const perms = (xs) => (xs.length < 2 ? [xs]
    : xs.flatMap((x, i) => perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p])));
  for (const p of perms(FEEDS)) expect(pickDeputy(p)).toBe('Pickles');
});

test('arrival order is never used: a late second feeder completes a cat late', () => {
  // X: A@1000, A@2000, B@3000 completes at 3000. Y: A@2100, B@2500 completes at
  // 2500. An arrival-order walk of the reversed list would complete X at 2000
  // and wrongly name X. The correct deputy is Y.
  const feeds = [
    { cat: 'Mochi', by: 'player-aaaaaaaa', walk: 'walk-1000' },
    { cat: 'Mochi', by: 'player-aaaaaaaa', walk: 'walk-2000' },
    { cat: 'Mochi', by: 'player-bbbbbbbb', walk: 'walk-3000' },
    { cat: 'Pickles', by: 'player-aaaaaaaa', walk: 'walk-2100' },
    { cat: 'Pickles', by: 'player-bbbbbbbb', walk: 'walk-2500' },
  ];
  const perms = (xs) => (xs.length < 2 ? [xs]
    : xs.flatMap((x, i) => perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p])));
  for (const p of perms(feeds)) expect(pickDeputy(p)).toBe('Pickles');
});

test('the deputy is the cat that BECAME two-fed first, not the one first fed', () => {
  const feeds = [
    { cat: 'Mochi', by: 'player-aaaaaaaa', walk: 'walk-1000' },
    { cat: 'Pickles', by: 'player-aaaaaaaa', walk: 'walk-2000' },
    { cat: 'Pickles', by: 'player-bbbbbbbb', walk: 'walk-3000' },
    { cat: 'Mochi', by: 'player-bbbbbbbb', walk: 'walk-5000' },
  ];
  expect(pickDeputy(feeds)).toBe('Pickles');
  expect(pickDeputy([...feeds].reverse())).toBe('Pickles');
});

test('two cats completed on the same stamp break the tie by name, identically on both devices', () => {
  const mk = (cat, by) => ({ cat, by, walk: 'walk-1000' });
  const a = [mk('Mochi', 'player-aaaaaaaa'), mk('Mochi', 'player-bbbbbbbb'),
             mk('Pickles', 'player-aaaaaaaa'), mk('Pickles', 'player-bbbbbbbb')];
  expect(pickDeputy(a)).toBe('Mochi');
  expect(pickDeputy([...a].reverse())).toBe('Mochi');
});

test('junk feeds among good ones are ignored, not thrown on', () => {
  const feeds = [
    null, { cat: 'NotACat', by: 'player-aaaaaaaa', walk: 'walk-1' },
    { cat: 'Pickles', by: 7, walk: 'walk-1000' },
    { cat: 'Pickles', by: 'player-aaaaaaaa', walk: 'yesterday' },
    ...FEEDS,
  ];
  expect(pickDeputy(feeds)).toBe('Pickles');
});

test.each([null, undefined, 'nope', [{}, null, { cat: 42, by: 7 }]])(
  'pickDeputy is total over junk: %p', (bad) => {
    expect(pickDeputy(bad)).toBeNull();
  });

// Review Focus 3: tamed cats are never trimmed, so a colony can hold more than
// DEN_HOMES.length of them.
test('a colony of 30 tamed cats still yields exactly one medicine cat', () => {
  const many = Array.from({ length: 30 }, (_, i) => ({ name: CAT_NAMES[i % CAT_NAMES.length] }));
  expect(typeof pickMedicineCat(many)).toBe('string');
});

// The walk-stamp parse and its stamp-then-name order are mirrored in
// clanroles.js (importing colony.js would drag net.js into a leaf). Pin the
// mirror: when each cat completes on its own tamedWalk, the deputy must be the
// first cat in colony.js's tamedCats() order.
test('the deputy ordering matches colony.js tamedCats stamp-then-name order', () => {
  const cats = [['Mochi', 'walk-300'], ['Pickles', 'walk-100'], ['Olive', 'walk-100'], ['Waffles', 'walk-200']]
    .map(([name, tamedWalk]) => ({ name, tamedBy: 'player-aaaaaaaa', tamedWalk }));
  const feeds = cats.flatMap((c) => [
    { cat: c.name, by: 'player-aaaaaaaa', walk: c.tamedWalk },
    { cat: c.name, by: 'player-bbbbbbbb', walk: c.tamedWalk },
  ]);
  expect(pickDeputy(feeds)).toBe(tamedCats({ cats })[0].name);
});

// ---- Queens and their kits (Task 8) ----------------------------------------

// A colony whose named cats are all tamed, in the order given (the walk stamps
// ascend, so taming order == array order). colony.js is imported by the TEST
// only; clanroles.js stays a leaf.
const AREAS = ['neighborhood', 'park', 'seaside', 'docks'];
function colonyWithTamed(names, { untamed = [] } = {}) {
  const tamed = names.map((name, i) => ({
    name, finder: 'player-aaaaaaaa', area: AREAS[i % 4], x: 0, z: 0, wear: null,
    tamedBy: 'player-aaaaaaaa', tamedWalk: `walk-${1000 + i}`,
  }));
  const rest = untamed.map((name) => ({
    name, finder: 'player-aaaaaaaa', area: 'park', x: 0, z: 0, wear: null, tamedBy: null, tamedWalk: null,
  }));
  return { id: null, partner: null, cats: [...tamed, ...rest], feeds: [], trades: [], tradesApplied: [], rewarded: [], seen: { feedKeys: [], tamed: [], trades: [], day: null } };
}
const placed = (colony) => placedKits(denResidents(colony), colony.cats);
const QUEENS = CAT_NAMES.filter((n) => roleFor(n) === 'queen');

test('only a queen has kits, and between one and three of them', () => {
  for (const queen of QUEENS) {
    const kits = kitsFor(queen, 'colony-1');
    expect(kits.length).toBeGreaterThanOrEqual(1);
    expect(kits.length).toBeLessThanOrEqual(3);
    for (const k of kits) expect(KIT_NAMES).toContain(k);
    expect(new Set(kits).size).toBe(kits.length);
  }
  const warrior = CAT_NAMES.find((n) => roleFor(n) === 'warrior');
  expect(kitsFor(warrior, 'colony-1')).toEqual([]);
});

test('the same queen and salt give the same kits on both devices', () => {
  expect(kitsFor(QUEENS[0], 'colony-1')).toEqual(kitsFor(QUEENS[0], 'colony-1'));
});

test.each([null, undefined, '', 42, {}])('kitsFor is total over junk: %p', (bad) => {
  expect(kitsFor(bad, 'colony-1')).toEqual([]);
});

test('a kit name is never given kits of her own, even if it hashes to queen', () => {
  for (const k of KIT_NAMES) expect(kitsFor(k, 'x')).toEqual([]);
  expect(placedKits([{ cat: { name: KIT_NAMES[0] }, home: DEN_HOMES[0] }], [])).toEqual([]);
});

test('with all five shipped queens tamed no kit appears twice, and each queen has one', () => {
  expect(QUEENS).toHaveLength(5);
  const out = placed(colonyWithTamed(QUEENS));
  expect(out.map((p) => p.queen)).toEqual(QUEENS);
  const all = out.flatMap((p) => p.kits);
  expect(new Set(all).size).toBe(all.length);
  expect(all.length).toBeLessThanOrEqual(KIT_NAMES.length);
  for (const p of out) {
    expect(p.kits.length).toBeGreaterThanOrEqual(1);
    expect(p.kits.length).toBeLessThanOrEqual(3);
    expect(p.home).toEqual(DEN_HOMES[QUEENS.indexOf(p.queen)]);
  }
});

test("an earlier queen's kits never change when a later queen is tamed", () => {
  for (let n = 1; n < QUEENS.length; n++) {
    const before = placed(colonyWithTamed(QUEENS.slice(0, n)));
    const after = placed(colonyWithTamed(QUEENS.slice(0, n + 1)));
    expect(after.slice(0, n)).toEqual(before);
  }
});

test('placedKits does not depend on a colony id, and warriors add nothing', () => {
  const colony = colonyWithTamed(QUEENS);
  expect(placed({ ...colony, id: 'colony-abcdef12' })).toEqual(placed(colony));
  const warriors = CAT_NAMES.filter((n) => roleFor(n) === 'warrior').slice(0, 4);
  expect(placed(colonyWithTamed(warriors))).toEqual([]);
});

test('a kit that has been fed is no longer a kit: its mother shrinks by one, nobody else moves', () => {
  const base = placed(colonyWithTamed(QUEENS));
  const target = base[0].kits[0];
  const after = placed(colonyWithTamed(QUEENS, { untamed: [target] }));
  const mother = after.find((p) => p.queen === base[0].queen);
  const expectedMother = base[0].kits.filter((k) => k !== target);
  if (expectedMother.length === 0) expect(mother).toBeUndefined();
  else expect(mother.kits).toEqual(expectedMother);
  for (const p of base.slice(1)) expect(after.find((a) => a.queen === p.queen).kits).toEqual(p.kits);
  expect(after.flatMap((p) => p.kits)).not.toContain(target);
});

// A tamed cat past the last den home has no home to sit beside.
test('a queen past the last den home has no kits placed', () => {
  const extra = QUEENS[QUEENS.length - 1];
  const filler = CAT_NAMES.filter((n) => n !== extra).slice(0, DEN_HOMES.length);
  const colony = colonyWithTamed([...filler, extra]);
  expect(denHome(colony, extra)).toBeNull();
  expect(placed(colony)).not.toContainEqual(expect.objectContaining({ queen: extra }));
});

// A kit the child fed and raised must never be labelled an elder once tamed
// (final re-review N2: 'Thimble' derived elder and was swapped for 'Wiggle').
test('no kit name derives the elder role', () => {
  for (const n of KIT_NAMES) expect(roleFor(n)).not.toBe('elder');
});
