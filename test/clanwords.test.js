import { test, expect } from 'vitest';
import { readFileSync, globSync } from 'node:fs';
import { FRIEND_RUNGS } from '../src/skills.js';
import { outsideTag } from '../src/colony.js';
import { CAT_NAMES, KIT_NAMES, LEGENDARY_NAMES } from '../src/straynames.js';
import { RIVAL_PREFIXES, PREFIXES, CAT_PREFIXES, WARRIOR_SUFFIXES, RANK_SUFFIX, DENIED_NAMES, RANK_WORDS, OUTSIDE_WORDS, CLAN_SUFFIX, RANK_KEYS } from '../src/clanwords.js';
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

// DENIED_NAMES is the only guard behind the spec rule that no published
// character name can be composed; an emptied or gutted list would make the
// cross-product tests pass vacuously.
test('DENIED_NAMES is a real, sizeable list', () => {
  expect(DENIED_NAMES.size).toBeGreaterThan(100);
  expect(DENIED_NAMES.has('Firestar')).toBe(true);
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
  const strays = new Set([...CAT_NAMES, ...KIT_NAMES, ...LEGENDARY_NAMES].map((n) => n.toLowerCase()));
  for (const w of Object.values(RIVAL_PREFIXES)) {
    expect(PREFIXES).not.toContain(w);
    expect(strays.has(w.toLowerCase())).toBe(false);
    expect(DENIED_NAMES.has(w + CLAN_SUFFIX)).toBe(false);
    expect(DENIED_NAMES.has(w)).toBe(false);
    expect(validPetName(w + CLAN_SUFFIX)).toBe(true);
  }
});

// A stored name that is also a prefix word would sit beside a clan name built
// from it (a "Juniperkit" card next to a cat called Juniper).
test('no stray, kit or legendary name is a PREFIXES, CAT_PREFIXES or RIVAL_PREFIXES word', () => {
  const words = new Set([...PREFIXES, ...Object.values(CAT_PREFIXES), ...Object.values(RIVAL_PREFIXES)].map((w) => w.toLowerCase()));
  const hits = [...CAT_NAMES, ...KIT_NAMES, ...LEGENDARY_NAMES].filter((n) => words.has(n.toLowerCase()));
  expect(hits).toEqual([]);
});

test('RIVAL_PREFIXES has only its own keys', () => {
  for (const k of ['__proto__', 'constructor', 'toString']) {
    expect(Object.hasOwn(RIVAL_PREFIXES, k)).toBe(false);
  }
});

// ---- Task 14: no borrowed word is hard-coded outside clanwords.js ----

const BORROWED = [...Object.values(OUTSIDE_WORDS), ...Object.values(RANK_WORDS), CLAN_SUFFIX];

// The contents of every string and template literal in a source text, with
// comments skipped. A template's text is kept across its lines, and each
// `${...}` expression is blanked in it (scanned as code instead, so a literal
// nested inside the expression is collected on its own). That way a word on
// the 2nd line of a multi-line template is seen, and code between two literals
// never is.
function literalsIn(src) {
  const out = [];
  const code = (i, inExpr) => {
    let depth = 0;
    while (i < src.length) {
      const c = src[i], n = src[i + 1];
      if (c === '/' && n === '/') {
        while (i < src.length && src[i] !== '\n') i++;
      } else if (c === '/' && n === '*') {
        const end = src.indexOf('*/', i + 2);
        i = end < 0 ? src.length : end + 2;
      } else if (c === '"' || c === "'") {
        let j = i + 1, buf = '';
        while (j < src.length && src[j] !== c && src[j] !== '\n') {
          if (src[j] === '\\') { buf += src.slice(j, j + 2); j += 2; } else buf += src[j++];
        }
        out.push(buf);
        i = j + 1;
      } else if (c === '`') {
        i = template(i + 1);
      } else if (c === '{') {
        depth++; i++;
      } else if (c === '}') {
        if (inExpr && depth === 0) return i + 1;
        depth--; i++;
      } else {
        i++;
      }
    }
    return i;
  };
  const template = (i) => {
    let buf = '';
    while (i < src.length) {
      const c = src[i];
      if (c === '\\') { buf += src.slice(i, i + 2); i += 2; }
      else if (c === '`') { out.push(buf); return i + 1; }
      else if (c === '$' && src[i + 1] === '{') { buf += ' '; i = code(i + 2, true); }
      else { buf += c; i++; }
    }
    out.push(buf);
    return i;
  };
  code(0, false);
  return out;
}

// Borrowed words found inside a string literal of a source text.
function borrowedIn(src) {
  const lits = literalsIn(src);
  return BORROWED.filter((w) => {
    const re = new RegExp(`\\b${w}\\b`, 'i');
    return lits.some((l) => re.test(l));
  });
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
  // A word on the 2nd or a later line of a multi-line template literal.
  expect(borrowedIn('return `<div>\n  warrior\n</div>`;')).toContain('warrior');
  expect(borrowedIn('const t = `<p>\n  ${x}\n  <b>a\n  loner</b>\n</p>`;')).toContain('loner');
  // An expression is code, not text: an identifier there is not a word...
  expect(borrowedIn('const t = `<p>\n  ${warrior}\n</p>`;')).toEqual([]);
  // ...but a literal nested inside the expression is still scanned.
  expect(borrowedIn('const t = `<p>\n  ${ok ? `the\n rogue` : \'\'}\n</p>`;')).toContain('rogue');
  // Code between two literals is not a literal.
  expect(borrowedIn(`const a = 'x'; const warrior = 1; const b = 'y';`)).toEqual([]);
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
