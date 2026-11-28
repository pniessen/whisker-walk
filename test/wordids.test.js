import { test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as on from '../src/clanwords.js';
import * as off from '../src/offclanwords.js';
import { SET_SHAPE, shapeProblem, RANK_KEYS, GROUP_KEY, SERIES_ON, SERIES_OFF } from '../src/wordids.js';
import { TABLES } from '../src/wordset.js';

// The shape of a set, derived the way it used to be: from the family's own tables.
function deriveShape(set) {
  const out = {};
  for (const name of TABLES) {
    const v = set[name];
    if (Array.isArray(v)) out[name] = name === 'PREFIXES' ? { kind: 'list', length: v.length } : { kind: 'list' };
    else if (v instanceof Set) out[name] = { kind: 'set' };
    else if (typeof v === 'string') out[name] = { kind: 'text' };
    else out[name] = { kind: 'table', keys: Object.fromEntries(Object.keys(v).map((k) => [k, Array.isArray(v[k]) ? v[k].length : 0])) };
  }
  return out;
}

test("SET_SHAPE is the shape the family's set has", () => {
  expect(SET_SHAPE).toEqual(deriveShape(on));
  expect(Object.isFrozen(SET_SHAPE)).toBe(true);
  expect(Object.isFrozen(SET_SHAPE.RANK_WORDS.keys)).toBe(true);
  expect(TABLES).toEqual(Object.keys(SET_SHAPE));
});

test('the ids', () => {
  expect(Object.isFrozen(RANK_KEYS)).toBe(true);
  expect(Object.keys(RANK_KEYS).sort()).toEqual(Object.keys(on.RANK_WORDS).sort());
  expect(GROUP_KEY).toBe('clan');
  expect([SERIES_ON, SERIES_OFF]).toEqual(['on', 'off']);
});

test('shapeProblem knows a whole set and names what is missing', () => {
  expect(shapeProblem(on)).toBeNull();
  expect(shapeProblem(off)).toBeNull();
  expect(shapeProblem(null)).toMatch(/not a table/);
  const { deputy, ...noDeputy } = on.RANK_WORDS;
  expect(shapeProblem({ ...on, RANK_WORDS: noDeputy })).toBe('no RANK_WORDS.deputy');
  expect(shapeProblem({ ...on, CLAN_CAT_PREFIXES: { ...on.CLAN_CAT_PREFIXES, woods: on.CLAN_CAT_PREFIXES.woods.slice(1) } })).toBe('the wrong number of CLAN_CAT_PREFIXES.woods');
  expect(shapeProblem({ ...on, PREFIXES: on.PREFIXES.slice(1) })).toBe('the wrong number of PREFIXES');
  expect(shapeProblem({ ...on, DENIED_NAMES: [] })).toBe('no DENIED_NAMES');
});

const importsOf = (f) => [...readFileSync(f, 'utf8').matchAll(/^import\b[^'"]*from\s*'([^']+)'/gm)].map((m) => m[1]);

test('offclanwords.js imports wordids.js and straynames.js only', () => {
  expect(importsOf('src/offclanwords.js').sort()).toEqual(['./straynames.js', './wordids.js']);
  expect(importsOf('src/wordids.js')).toEqual([]);
});

test('clanwords.js exports no RANK_KEYS', () => {
  expect(Object.hasOwn(on, 'RANK_KEYS')).toBe(false);
});
