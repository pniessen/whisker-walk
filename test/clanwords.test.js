import { test, expect } from 'vitest';
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
