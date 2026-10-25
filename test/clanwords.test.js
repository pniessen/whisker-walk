import { test, expect } from 'vitest';
import { readFileSync, globSync } from 'node:fs';
import { FRIEND_RUNGS } from '../src/skills.js';
import { outsideTag } from '../src/colony.js';
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

// ---- Task 14: no borrowed word is hard-coded outside clanwords.js ----

// Blank out // and /* */ comments but leave string/template literals intact,
// so a URL like 'https://x' keeps its //. Newlines are kept for line numbers.
function stripComments(src) {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < src.length && src[j] !== c) {
        if (src[j] === '\\') j++;
        else if (c !== '`' && src[j] === '\n') break;
        j++;
      }
      out += src.slice(i, j + 1);
      i = j + 1;
    } else if (c === '/' && n === '/') {
      while (i < src.length && src[i] !== '\n') i++;
    } else if (c === '/' && n === '*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end < 0 ? src.length : end + 2;
      out += src.slice(i, stop).replace(/[^\n]/g, '');
      i = stop;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

const BORROWED = [...Object.values(OUTSIDE_WORDS), ...Object.values(RANK_WORDS), CLAN_SUFFIX];

// Borrowed words found inside a string literal of a source text.
function borrowedIn(src) {
  const code = stripComments(src);
  return BORROWED.filter((w) => new RegExp(`['\`"][^'\`"\\n]*\\b${w}\\b`, 'i').test(code));
}

// Pre-existing literals where the word means something unrelated to the clan.
const ALLOW = [];

test('no borrowed word is hard-coded anywhere but clanwords.js', () => {
  const files = globSync('src/**/*.js').filter((f) => !f.endsWith('clanwords.js'));
  const offenders = [];
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    for (const w of borrowedIn(src)) {
      if (!ALLOW.some((a) => f.endsWith(a.file) && a.words.includes(w))) offenders.push(`${f}: ${w}`);
    }
  }
  expect(offenders).toEqual([]);
});

test('the scanner flags a literal and ignores a comment (mutation check)', () => {
  expect(borrowedIn(`const a = 'the loner sat';`)).toContain('loner');
  expect(borrowedIn(`// the loner sat\nconst a = 1;`)).toEqual([]);
  expect(borrowedIn(`/* a rogue\n here */ const a = 1;`)).toEqual([]);
  expect(borrowedIn(`const u = 'http://x.y'; const b = "rogue";`)).toContain('rogue');
});

test('the rung ladder itself has not moved', () => {
  expect(FRIEND_RUNGS).toEqual({ met: 1, friend: 3, best: 6 });
});

// ---- Fix round 1: a colony cat is never called an outsider ----

test('outsideTag words a non-member, and says nothing for a colony cat', () => {
  const colony = { cats: [{ name: 'Tamed', tamed: true }, { name: 'Wild', tamed: false }] };
  expect(outsideTag(colony, 'Stranger', 'met')).toBe(` the ${OUTSIDE_WORDS.met}`);
  expect(outsideTag(colony, 'Stranger', 'grudge', (w) => ` a ${w} now!`)).toBe(` a ${OUTSIDE_WORDS.grudge} now!`);
  expect(outsideTag(colony, 'Wild', 'met')).toBe('');
  expect(outsideTag(colony, 'Tamed', 'grudge')).toBe('');
});

test('outsideTag never throws on hostile input', () => {
  expect(outsideTag(null, 'Stranger', 'met')).toBe(` the ${OUTSIDE_WORDS.met}`);
  expect(outsideTag({ cats: 'x' }, 'Stranger', 'met')).toBe(` the ${OUTSIDE_WORDS.met}`);
  expect(outsideTag({ cats: [null, 3] }, 'Stranger', 'met')).toBe(` the ${OUTSIDE_WORDS.met}`);
  for (const bad of [undefined, null, 5, {}, []]) expect(outsideTag({ cats: [] }, bad, 'met')).toBe('');
  expect(outsideTag({ cats: [] }, 'Stranger', 'nope')).toBe('');
});
