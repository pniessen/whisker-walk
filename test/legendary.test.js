import { test, expect } from 'vitest';
import { CAT_NAMES, KIT_NAMES, LEGENDARY_NAMES, isStrayName } from '../src/straynames.js';
import { LEGENDARY_BY_AREA, isLegendaryName } from '../src/legendary.js';
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
