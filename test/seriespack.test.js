import { test, expect } from 'vitest';
import * as on from '../src/clanwords.js';
import { packSet, unpackSet } from '../src/seriespack.js';

// A module's own exports as plain data, with Sets as sorted arrays.
const plain = (v) => (v instanceof Set ? { set: [...v].sort() } : Array.isArray(v) ? v.map(plain) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).map((k) => [k, plain(v[k])])) : v);

test('unpackSet(packSet(on)) is the family set, with its Set a Set', () => {
  const back = unpackSet(packSet(on));
  expect(plain({ ...back })).toEqual(plain({ ...on }));
  expect(back.DENIED_NAMES).toBeInstanceOf(Set);
  expect(back.DENIED_NAMES.size).toBe(on.DENIED_NAMES.size);
});

test('the order the game reads is kept, and the set is frozen', () => {
  const back = unpackSet(packSet(on));
  expect(Object.values(back.CAT_PREFIXES)).toEqual(Object.values(on.CAT_PREFIXES));
  expect(Object.keys(back.RANK_WORDS)).toEqual(Object.keys(on.RANK_WORDS));
  expect(Object.isFrozen(back)).toBe(true);
  expect(Object.isFrozen(back.PREFIXES)).toBe(true);
  expect(Object.isFrozen(back.RANK_WORDS)).toBe(true);
  expect(Object.keys(back)).toEqual(Object.keys(on).sort());
});

test('packing is the same text every time', () => {
  expect(packSet(on)).toBe(packSet({ ...on }));
});

test('a function in a set is refused, and the text names where', () => {
  expect(() => packSet({ f: () => 1 })).toThrow(/function at f/);
  expect(() => packSet({ a: { b: [1, () => 2] } })).toThrow(/function at a\.b\[1\]/);
});

test('a packed set must be a table', () => {
  expect(() => unpackSet('[1]')).toThrow();
  expect(() => unpackSet('"x"')).toThrow();
});
