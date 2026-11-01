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
