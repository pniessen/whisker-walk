import { test, expect } from 'vitest';
import { CAT_NAMES, KIT_NAMES } from '../src/straynames.js';
import { RIVAL_PREFIXES, PREFIXES, WARRIOR_SUFFIXES, RANK_SUFFIX, DENIED_NAMES, RANK_WORDS, OUTSIDE_WORDS, CLAN_SUFFIX, RANK_KEYS } from '../src/clanwords.js';
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

// R10: internal identifiers live in RANK_KEYS so no other src/ module has to
// spell a borrowed word as a string literal. Each key must name itself, or a
// module using RANK_KEYS.x would disagree with the RANK_WORDS lookup it feeds.
test('every RANK_WORDS key has a RANK_KEYS entry whose value is that key', () => {
  expect(Object.isFrozen(RANK_KEYS)).toBe(true);
  for (const k of Object.keys(RANK_WORDS)) expect(RANK_KEYS[k]).toBe(k);
  expect(Object.keys(RANK_KEYS).sort()).toEqual(Object.keys(RANK_WORDS).sort());
});

// R18: the rival clans have their own hand-authored words, so a player's own
// clan (drawn from PREFIXES) can never share a rival's name.
test('RIVAL_PREFIXES: four distinct short words, frozen, one per area', () => {
  expect(Object.isFrozen(RIVAL_PREFIXES)).toBe(true);
  expect(Object.keys(RIVAL_PREFIXES).sort()).toEqual(['docks', 'neighborhood', 'park', 'seaside']);
  const words = Object.values(RIVAL_PREFIXES);
  expect(new Set(words).size).toBe(4);
  for (const w of words) expect(w.length).toBeLessThanOrEqual(8);
});

test('no RIVAL_PREFIXES word is a PREFIXES word, a stray or kit name, or a denied clan', () => {
  const strays = new Set([...CAT_NAMES, ...KIT_NAMES].map((n) => n.toLowerCase()));
  for (const w of Object.values(RIVAL_PREFIXES)) {
    expect(PREFIXES).not.toContain(w);
    expect(strays.has(w.toLowerCase())).toBe(false);
    expect(DENIED_NAMES.has(w + CLAN_SUFFIX)).toBe(false);
    expect(DENIED_NAMES.has(w)).toBe(false);
    expect(validPetName(w + CLAN_SUFFIX)).toBe(true);
  }
});

test('RIVAL_PREFIXES has only its own keys', () => {
  for (const k of ['__proto__', 'constructor', 'toString']) {
    expect(Object.hasOwn(RIVAL_PREFIXES, k)).toBe(false);
  }
});
