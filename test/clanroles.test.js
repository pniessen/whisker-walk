import { test, expect } from 'vitest';
import { roleFor, pickMedicineCat, pickDeputy } from '../src/clanroles.js';
import { CAT_NAMES } from '../src/straynames.js';
import { tamedCats } from '../src/colony.js';

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
