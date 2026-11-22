// Cat login M3: the cat code word list (1,024 words), its guards, and making, reading and
// snapping a code. Pure: no network, no DOM.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { CAT_WORDS, generateCatCode, normalizeCatCode, snapWord, completeWord, checkCatCode, oneEditApart } from '../src/catcodes.js';
import { randomIndex } from '../src/randomindex.js';
import { randomIndex as randomIndexFromSavecode } from '../src/savecode.js';
import { CATALOG } from '../src/progression.js';

const src = (f) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
const badwords = JSON.parse(readFileSync(new URL('./fixtures/badwords.json', import.meta.url), 'utf8'));

function fakeCrypto(values) {
  let i = 0;
  return { getRandomValues(buf) { for (let j = 0; j < buf.length; j++) buf[j] = values[i++ % values.length]; return buf; } };
}

// every word inside a quoted string of a source file, upper-cased (the words the series sets and the stray names say)
const literalWords = (text) => {
  const out = new Set();
  for (const m of text.matchAll(/(['"`])((?:\\.|(?!\1)[^\\])*)\1/g)) for (const w of m[2].toUpperCase().match(/[A-Z]+/g) ?? []) out.add(w);
  return out;
};

describe('the 1,024 cat code words', () => {
  it('are exactly 1,024', () => expect(CAT_WORDS).toHaveLength(1024));
  it('are 3 to 6 letters, A-Z only, upper case', () => {
    for (const w of CAT_WORDS) expect(w, w).toMatch(/^[A-Z]{3,6}$/);
  });
  it('are all different', () => expect(new Set(CAT_WORDS).size).toBe(1024));
  it('start with three letters no other word starts with (so three letters and a tap always finish a word)', () => {
    const seen = new Map();
    for (const w of CAT_WORDS) {
      const p = w.slice(0, 3);
      expect(seen.get(p), `${w} and ${seen.get(p)} share ${p}`).toBeUndefined();
      seen.set(p, w);
    }
  });
  it('have no word that is the start of another', () => {
    for (const a of CAT_WORDS) for (const b of CAT_WORDS) if (a !== b) expect(b.startsWith(a), `${a} starts ${b}`).toBe(false);
  });
  it('have no pair one edit apart, so snapping a typo can never turn one valid word into another', () => {
    for (let i = 0; i < CAT_WORDS.length; i++) for (let j = i + 1; j < CAT_WORDS.length; j++) {
      expect(oneEditApart(CAT_WORDS[i], CAT_WORDS[j]), `${CAT_WORDS[i]} ${CAT_WORDS[j]}`).toBe(false);
    }
  });
  it('are not any word of the series sets, the stray names or the family cats (so the public bundle carries no series word)', () => {
    const taken = new Set();
    for (const f of ['clanwords.js', 'offclanwords.js', 'straynames.js']) for (const w of literalWords(src(f))) taken.add(w);
    for (const c of Object.values(CATALOG.cats)) for (const w of String(c.name).toUpperCase().match(/[A-Z]+/g) ?? []) taken.add(w);
    expect(taken.size).toBeGreaterThan(500); // the harvest really read them
    expect(CAT_WORDS.filter((w) => taken.has(w))).toEqual([]);
  });
  it('are not on the block list, whole or inside a longer word (the list stays in the test folder, never shipped)', () => {
    expect(badwords.length).toBeGreaterThan(150);
    for (const w of CAT_WORDS) for (const b of badwords) {
      const B = String(b).toUpperCase();
      expect(w === B || (B.length >= 4 && w.includes(B)), `${w} ~ ${B}`).toBe(false);
    }
  });
  it('are not the sound of a different spelling the kids might type (a few homophones are ruled out by name)', () => {
    for (const w of ['TAIL', 'TALE', 'BEAR', 'BARE', 'DEER', 'DEAR', 'HARE', 'HAIR', 'PAIR', 'PEAR', 'WHALE', 'WAIL', 'SAIL', 'SALE', 'SUN', 'SON', 'SEA', 'SEE', 'KNIGHT', 'NIGHT', 'KNOT', 'NOT']) {
      expect(CAT_WORDS.includes(w), w).toBe(false);
    }
  });
});

describe('the code maker', () => {
  it('uses the one unbiased index function (moved to its own file, still exported from savecode)', () => {
    expect(randomIndexFromSavecode).toBe(randomIndex);
  });
  it('makes four words from the list, joined with hyphens', () => {
    const code = generateCatCode();
    const words = code.split('-');
    expect(words).toHaveLength(4);
    for (const w of words) expect(CAT_WORDS).toContain(w);
  });
  it('is deterministic for a fake crypto: indexes 0, 1, 2, 1023', () => {
    expect(generateCatCode(fakeCrypto([0, 1, 2, 1023]))).toBe([CAT_WORDS[0], CAT_WORDS[1], CAT_WORDS[2], CAT_WORDS[1023]].join('-'));
  });
  it('never mods a number that is not a multiple of 1,024 (a draw above the limit is redrawn: for 1,024 nothing is ever thrown away)', () => {
    expect(randomIndex(1024, () => 0xffffffff)).toBe(1023);
    expect(generateCatCode(fakeCrypto([0xffffffff]))).toBe(Array(4).fill(CAT_WORDS[1023]).join('-'));
  });
  it('covers the whole list with a flat draw', () => {
    const hit = new Set();
    for (let i = 0; i < 1024; i++) hit.add(randomIndex(1024, () => i + 1024 * 3000));
    expect(hit.size).toBe(1024);
  });
  it('works with no crypto at all', () => {
    expect(generateCatCode(null).split('-')).toHaveLength(4);
    expect(generateCatCode({}).split('-')).toHaveLength(4);
  });
});

describe('reading a typed code', () => {
  const a = CAT_WORDS[10], b = CAT_WORDS[200], c = CAT_WORDS[300], d = CAT_WORDS[400];
  const want = [a, b, c, d].join('-');
  it('takes spaces, dots, dashes, middle dots, commas and any case', () => {
    for (const sep of [' ', '  ', '.', '-', '--', '_', ' - ', '·', ',', ', ']) {
      expect(normalizeCatCode([a, b, c, d].map((w) => w.toLowerCase()).join(sep)), JSON.stringify(sep)).toBe(want);
    }
    expect(normalizeCatCode(`  ${a} ${b}\n${c}\t${d}  `)).toBe(want);
  });
  it('takes the old shape WORD-WORD-WORD-00 and keeps it exactly as the old normaliser did', () => {
    expect(normalizeCatCode('plum otter_crow-42')).toBe('PLUM-OTTER-CROW-42');
    expect(normalizeCatCode('plum.otter.crow.42')).toBe('PLUM-OTTER-CROW-42');
  });
  it('answers an empty string for anything that is not a code', () => {
    for (const bad of [undefined, null, 5, {}, '', '   ', 'one two three', 'a b c d', `${a} ${b} ${c}`, `${a} ${b} ${c} ${d} ${a}`, 'ABC-DEF-GHI-JK-LM', 'PLUM-OTTER-CROW-4', 'ab1 cd2 ef3 gh4', 'TOOLONGWORD-B-C-D']) {
      expect(normalizeCatCode(bad), String(bad)).toBe('');
    }
  });
  it('makes no network call while typing (the module imports nothing that talks)', () => {
    const text = src('catcodes.js');
    expect(text).not.toMatch(/\bfetch\b|XMLHttpRequest|WebSocket|supabase|from '\.\/cloud\.js'|from '\.\/net\.js'/);
  });
});

describe('snapping a mistyped word', () => {
  const w = CAT_WORDS.find((x) => x.length >= 5);
  it('leaves a word on the list as it is, any case', () => {
    expect(snapWord(w)).toBe(w);
    expect(snapWord(w.toLowerCase())).toBe(w);
  });
  it('fixes a wrong letter, a missing letter, an extra letter and a swapped pair when exactly one list word is one edit away', () => {
    const swapped = w[0] + w[2] + w[1] + w.slice(3);
    const wrong = (w[0] === 'Q' ? 'X' : 'Q') + w.slice(1);
    const missing = w.slice(0, 2) + w.slice(3);
    const extra = w.slice(0, 3) + 'Q' + w.slice(3);
    for (const typo of [wrong, missing, extra, swapped]) {
      const hits = CAT_WORDS.filter((x) => oneEditApart(typo, x));
      if (hits.length === 1) expect(snapWord(typo), typo).toBe(hits[0]);
      else expect(snapWord(typo), typo).toBeNull();
    }
    // at least a plain wrong-letter typo of a long word is fixed
    const twoWays = CAT_WORDS.find((x) => x.length === 6 && CAT_WORDS.filter((y) => oneEditApart(x.slice(0, 5) + 'Q', y)).length === 1);
    if (twoWays) expect(snapWord(twoWays.slice(0, 5) + 'Q')).toBe(twoWays);
  });
  it('gives null when nothing is near, or when two words are equally near', () => {
    expect(snapWord('ZZZZZZ')).toBeNull();
    expect(snapWord('')).toBeNull();
    expect(snapWord(7)).toBeNull();
    // build a string one edit from two list words, if any exist, and check it is refused
    let found = null;
    outer: for (let i = 0; i < CAT_WORDS.length && !found; i++) {
      const x = CAT_WORDS[i];
      for (let p = 0; p < x.length; p++) for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
        const t = x.slice(0, p) + ch + x.slice(p + 1);
        if (t === x || CAT_WORDS.includes(t)) continue;
        if (CAT_WORDS.filter((y) => oneEditApart(t, y)).length >= 2) { found = t; break outer; }
      }
    }
    if (found) expect(snapWord(found)).toBeNull();
  });
  it('finishes a word from its first three letters', () => {
    for (const x of CAT_WORDS.slice(0, 40)) {
      expect(completeWord(x.slice(0, 3))).toBe(x);
      expect(completeWord(x.slice(0, 3).toLowerCase())).toBe(x);
    }
    expect(completeWord('QQQ')).toBeNull();
    expect(completeWord('AB')).toBeNull();
    expect(completeWord(null)).toBeNull();
  });
});

describe('checking a code word by word for the chips', () => {
  const [a, b, c, d] = [CAT_WORDS[3], CAT_WORDS[33], CAT_WORDS[333], CAT_WORDS[633]];
  it('marks each word ok, a typo it can fix, or bad', () => {
    const r = checkCatCode(`${a} ${b.toLowerCase()} ZZZZ ${d}`);
    expect(r.words.map((x) => x.state)).toEqual(['ok', 'ok', 'bad', 'ok']);
    expect(r.ok).toBe(false);
    expect(r.code).toBe('');
  });
  it('gives the code when every word is on the list or can be snapped, and says which were changed', () => {
    const all = checkCatCode(`${a} ${b} ${c} ${d}`);
    expect(all.ok).toBe(true);
    expect(all.code).toBe(`${a}-${b}-${c}-${d}`);
    expect(all.words.every((x) => x.state === 'ok')).toBe(true);
  });
  it('says nothing is wrong with a code that is still being typed (fewer than four words)', () => {
    const r = checkCatCode(`${a} ${b}`);
    expect(r.ok).toBe(false);
    expect(r.words.map((x) => x.state)).toEqual(['ok', 'ok']);
  });
  it('accepts the old shape as ok, with no word chips', () => {
    const r = checkCatCode('plum-otter-crow-42');
    expect(r.ok).toBe(true);
    expect(r.code).toBe('PLUM-OTTER-CROW-42');
    expect(r.old).toBe(true);
  });
  it('sends nothing, it only reads', () => {
    expect(() => checkCatCode(undefined)).not.toThrow();
    expect(checkCatCode(undefined).ok).toBe(false);
  });
});
