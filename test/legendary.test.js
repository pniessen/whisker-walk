import { test, expect, vi } from 'vitest';
import { CAT_NAMES, KIT_NAMES, LEGENDARY_NAMES, isStrayName } from '../src/straynames.js';
import {
  LEGENDARY_BY_AREA, isLegendaryName,
  ODDS_EARLY, ODDS_LATE, A_COUPLE, LEGEND_SALT,
  isFound, foundCount, legendaryOdds, legendaryFor, legendaryRoll,
} from '../src/legendary.js';
import { mulberry32 } from '../src/rng.js';
import { COLONY_AREAS, TAME_FEEDS, emptyColony, feedCat, isShy } from '../src/colony.js';
import { isGrudgeableStray } from '../src/straycats.js';
import { CATALOG } from '../src/progression.js';
import { DENIED_NAMES, PREFIXES, RIVAL_PREFIXES } from '../src/clanwords.js';

test('four legendary names, one per colony area, in a block of their own', () => {
  expect(LEGENDARY_NAMES).toHaveLength(4);
  expect(new Set(LEGENDARY_NAMES).size).toBe(4);
  expect(Object.keys(LEGENDARY_BY_AREA).sort()).toEqual([...COLONY_AREAS].sort());
  expect(Object.values(LEGENDARY_BY_AREA).sort()).toEqual([...LEGENDARY_NAMES].sort());
  for (const n of LEGENDARY_NAMES) { expect(CAT_NAMES).not.toContain(n); expect(KIT_NAMES).not.toContain(n); }
  // The 48 strays are untouched: a new name never shifts a walk's shuffle.
  expect(CAT_NAMES).toHaveLength(48);
});

test('the area table is pinned and frozen', () => {
  expect(LEGENDARY_BY_AREA).toEqual({
    neighborhood: 'Duchess', park: 'Professor Whiskers', seaside: 'Captain Barnacle', docks: 'Lord Lantern',
  });
  expect(Object.isFrozen(LEGENDARY_BY_AREA)).toBe(true);
});

test('every legendary name passes isStrayName, the feed RPC regex and the family-pet gate', () => {
  for (const n of LEGENDARY_NAMES) {
    expect(isStrayName(n)).toBe(true);
    expect(n).toMatch(/^[A-Za-z][A-Za-z ]{0,23}$/);
    const cat = { name: n };
    expect(isGrudgeableStray({ strays: [cat] }, cat)).toBe(true);
  }
});

// Case-insensitive, against the REAL catalog (D2 and Digit included once the
// family-cats branch lands), so a legendary cat is never mistaken for a pet.
test('no legendary name is a family pet, in any case', () => {
  const pets = new Set(Object.values(CATALOG.cats).map((c) => c.name.toLowerCase()));
  for (const extra of ['d2', 'digit', 'rosa']) pets.add(extra);
  for (const n of LEGENDARY_NAMES) expect(pets.has(n.toLowerCase())).toBe(false);
});

// Ruling R36: a legendary cat must never read as a published character, so no
// word of its name may be a DENIED_NAMES entry (case-insensitive, whole word),
// nor a clan prefix word that could sit beside a clan name built from it.
test('no legendary name contains a denied, prefix or rival word as a whole word', () => {
  const denied = new Set([...DENIED_NAMES].map((w) => w.toLowerCase()));
  const prefixes = new Set([...PREFIXES, ...Object.values(RIVAL_PREFIXES)].map((w) => w.toLowerCase()));
  for (const n of LEGENDARY_NAMES) {
    for (const w of n.toLowerCase().split(' ')) {
      expect(denied.has(w)).toBe(false);
      expect(prefixes.has(w)).toBe(false);
    }
  }
  // Mutation check: the old docks name is caught.
  expect('Lord Midnight'.toLowerCase().split(' ').some((w) => denied.has(w))).toBe(true);
});

test('no legendary cat needs a second feeder', () => {
  for (const n of LEGENDARY_NAMES) expect(isShy(n)).toBe(false);
});

test('isLegendaryName knows the four and nothing else', () => {
  for (const n of LEGENDARY_NAMES) expect(isLegendaryName(n)).toBe(true);
  for (const bad of [CAT_NAMES[0], KIT_NAMES[0], 'duchess', 'Stranger', '__proto__', 'constructor', '', null, undefined, 42, {}, ['Duchess']]) {
    expect(isLegendaryName(bad)).toBe(false);
  }
});

test('a legendary cat can be fed and tamed through the ordinary feed path', () => {
  const ME = 'aaaaaaaa-1111';
  for (const [area, name] of Object.entries(LEGENDARY_BY_AREA)) {
    let c = emptyColony();
    let r;
    for (let i = 0; i < TAME_FEEDS; i++) {
      r = feedCat(c, { name, by: ME, walk: `walk-${1000 + i}`, area, x: 3, z: -4, head: 0 });
      expect(r.result).toBe('ok');
      expect(r.tamedNow).toBe(i === TAME_FEEDS - 1);
      c = r.colony;
    }
    expect(r.progress.tamed).toBe(true);
    const cat = c.cats.find((k) => k.name === name);
    // An ordinary colony cat: exactly the fields any fed stray gets, no more.
    expect(Object.keys(cat).sort()).toEqual(['area', 'finder', 'name', 'tamedBy', 'tamedWalk', 'wear', 'x', 'z']);
    expect(cat.tamedBy).toBe(ME);
  }
});

// ---------------------------------------------------------------------------
// v21 3b Task 18 — finding a legendary cat.
// ---------------------------------------------------------------------------
const saveWith = ({ friends = {}, cats = [] } = {}) => ({ friends, colony: { ...emptyColony(), cats } });
const colonyCat = (name, area, tamedBy = null) => ({ name, area, x: 1, z: 2, finder: 'me', wear: null, tamedBy, tamedWalk: null });

test('the odds are pinned', () => {
  expect([ODDS_EARLY, ODDS_LATE, A_COUPLE, LEGEND_SALT]).toEqual([1 / 5, 1 / 20, 2, 0x1e6e7d00]);
});

test('one in five until a couple are found, then one in twenty', () => {
  expect(legendaryOdds(0)).toBe(1 / 5); expect(legendaryOdds(1)).toBe(1 / 5);
  expect(legendaryOdds(2)).toBe(1 / 20); expect(legendaryOdds(4)).toBe(1 / 20);
});

test('found means I greeted it or it is a colony cat, read off the save alone', () => {
  expect(isFound(saveWith(), 'Duchess')).toBe(false);
  expect(isFound(saveWith({ friends: { Duchess: { breed: 'tabby', greets: 0, lastWalk: null } } }), 'Duchess')).toBe(false);
  expect(isFound(saveWith({ friends: { Duchess: { breed: 'tabby', greets: 1, lastWalk: 'w' } } }), 'Duchess')).toBe(true);
  expect(isFound(saveWith({ cats: [colonyCat('Duchess', 'neighborhood')] }), 'Duchess')).toBe(true);
  expect(isFound(saveWith({ cats: [colonyCat('Duchess', 'neighborhood', 'me')] }), 'Duchess')).toBe(true);
  // Total over garbage, own properties only.
  for (const bad of [null, undefined, {}, { friends: null, colony: null }, { friends: { Duchess: { greets: 'lots' } } },
    { friends: { Duchess: { greets: NaN } } }, { friends: Object.create({ Duchess: { greets: 9 } }) },
    { colony: { cats: 'Duchess' } }, { colony: { cats: [null, 7] } }]) {
    expect(isFound(bad, 'Duchess')).toBe(false);
  }
  expect(isFound(saveWith(), '__proto__')).toBe(false);
  expect(isFound(saveWith(), 42)).toBe(false);
  expect(foundCount(saveWith({
    friends: { Duchess: { greets: 2 }, Pickles: { greets: 9 } },
    cats: [colonyCat('Lord Lantern', 'docks')],
  }))).toBe(2);
  expect(foundCount(null)).toBe(0);
});

test('a found cat always comes back until it is fed; a colony cat is cast as one instead', () => {
  const met = saveWith({ friends: { 'Captain Barnacle': { breed: 'tabby', greets: 1, lastWalk: 'w' } } });
  // Found and not fed: every walk, whatever the roll.
  for (const u of [0, 0.5, 0.999]) expect(legendaryFor(met, 'seaside', u)).toBe('Captain Barnacle');
  // Fed once (an untamed colony cat): cast as a colony cat at its spot, so no extra.
  const fed = saveWith({ friends: met.friends, cats: [colonyCat('Captain Barnacle', 'seaside')] });
  for (const u of [0, 0.5]) expect(legendaryFor(fed, 'seaside', u)).toBe(null);
  // Tamed: it lives in the den now, so it never wanders in as an extra either.
  const tamed = saveWith({ friends: met.friends, cats: [colonyCat('Captain Barnacle', 'seaside', 'me')] });
  expect(legendaryFor(tamed, 'seaside', 0)).toBe(null);
  // Unfound: only on a lucky roll, one in five while fewer than a couple are found...
  const none = saveWith();
  expect(legendaryFor(none, 'seaside', 0.19)).toBe('Captain Barnacle');
  expect(legendaryFor(none, 'seaside', 0.2)).toBe(null);
  // ...and one in twenty after.
  const two = saveWith({ friends: { Duchess: { greets: 1 }, 'Professor Whiskers': { greets: 3 } } });
  expect(legendaryFor(two, 'seaside', 0.04)).toBe('Captain Barnacle');
  expect(legendaryFor(two, 'seaside', 0.06)).toBe(null);
  // Each area has its own cat.
  for (const [area, name] of Object.entries(LEGENDARY_BY_AREA)) expect(legendaryFor(none, area, 0)).toBe(name);
});

test('the den, unknown areas and a bad roll show no legendary cat', () => {
  const met = saveWith({ friends: { Duchess: { greets: 1 } } });
  for (const area of ['den', 'moon', '__proto__', 'constructor', 'toString', '', null, undefined, 3]) {
    expect(legendaryFor(met, area, 0)).toBe(null);
  }
  for (const u of [NaN, Infinity, -Infinity, undefined, null, '0']) {
    expect(legendaryFor(met, 'neighborhood', u)).toBe(null);
    expect(legendaryFor(saveWith(), 'neighborhood', u)).toBe(null);
  }
  expect(legendaryFor(null, 'neighborhood', 0)).toBe('Duchess');   // no save: unfound, lucky roll
});

// Ruling R40: on a partner (room) walk the answer reads only what both screens
// share — the roll and the colony — so two sisters side by side always agree.
test('partners with different saves but one colony and one room seed get the same answer', () => {
  const shared = [colonyCat('Duchess', 'neighborhood'), colonyCat('Pickles', 'seaside')];
  // She has met Captain Barnacle and two other legends (found count 3, past
  // A_COUPLE); I have met nobody (found count 1, from the colony alone).
  const her = saveWith({
    friends: { 'Captain Barnacle': { greets: 1 }, 'Professor Whiskers': { greets: 4 }, 'Lord Lantern': { greets: 2 } },
    cats: shared,
  });
  const me = saveWith({ cats: shared });
  expect(foundCount(her)).toBeGreaterThanOrEqual(A_COUPLE);
  expect(foundCount(me)).toBeLessThan(A_COUPLE);
  // Solo, those saves really do disagree (the brief's rule, kept exactly)...
  expect(legendaryFor(her, 'seaside', 0.5)).toBe('Captain Barnacle');
  expect(legendaryFor(me, 'seaside', 0.5)).toBe(null);
  // ...and on a partner walk they never do: every seed, every area.
  for (let seed = 1; seed <= 400; seed++) {
    const u = legendaryRoll(seed);
    for (const area of [...COLONY_AREAS, 'den']) {
      expect(legendaryFor(her, area, u, { shared: true })).toBe(legendaryFor(me, area, u, { shared: true }));
    }
  }
  // The shared rule itself: not in the colony, and u under the odds for the
  // colony's own legendary count (one here, so one in five).
  expect(legendaryFor(her, 'seaside', 0.19, { shared: true })).toBe('Captain Barnacle');
  expect(legendaryFor(her, 'seaside', 0.21, { shared: true })).toBe(null);     // met, but no guarantee
  expect(legendaryFor(her, 'neighborhood', 0, { shared: true })).toBe(null);   // Duchess is a colony cat
  const two = saveWith({ cats: [...shared, colonyCat('Lord Lantern', 'docks', 'me')] });
  expect(legendaryFor(two, 'seaside', 0.04, { shared: true })).toBe('Captain Barnacle');
  expect(legendaryFor(two, 'seaside', 0.06, { shared: true })).toBe(null);     // two in the colony: one in twenty
  // Garbage and the den still show nobody.
  expect(legendaryFor(her, 'den', 0, { shared: true })).toBe(null);
  expect(legendaryFor(her, 'seaside', NaN, { shared: true })).toBe(null);
});

test('solo keeps the found-always-returns rule', () => {
  const met = saveWith({ friends: { 'Captain Barnacle': { greets: 1 } } });
  for (const u of [0.3, 0.9, 0.999]) {
    expect(legendaryFor(met, 'seaside', u)).toBe('Captain Barnacle');
    expect(legendaryFor(met, 'seaside', u, { shared: false })).toBe('Captain Barnacle');
    expect(legendaryFor(met, 'seaside', u, {})).toBe('Captain Barnacle');
    expect(legendaryFor(met, 'seaside', u, { shared: true })).toBe(null);
  }
});

test('partners roll the same number; solo rolls do not touch walkRng', () => {
  // A room walk: the same seed, the same u, on every client, and it is not the
  // walk stream's first value (which would tie the roll to the name shuffle).
  for (const seed of [1, 42, 0xdeadbeef, 2 ** 31 - 1]) {
    expect(legendaryRoll(seed)).toBe(legendaryRoll(seed));
    expect(legendaryRoll(seed)).toBe(mulberry32((seed ^ LEGEND_SALT) >>> 0)());
    expect(legendaryRoll(seed)).not.toBe(mulberry32(seed)());
    const u = legendaryRoll(seed);
    expect(u >= 0 && u < 1).toBe(true);
  }
  const spy = vi.spyOn(Math, 'random');
  try {
    // A room walk never calls Math.random...
    legendaryRoll(7);
    expect(spy).not.toHaveBeenCalled();
    // ...and solo it is exactly one Math.random(): the solo walk's own
    // unseeded stream, which nobody shares. It takes no rng argument at all,
    // so it cannot be handed walkRng by mistake.
    spy.mockReturnValueOnce(0.123);
    expect(legendaryRoll(undefined)).toBe(0.123);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(legendaryRoll.length).toBe(1);
  } finally {
    spy.mockRestore();
  }
});
