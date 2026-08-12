import { describe, it, expect } from 'vitest';
import { intentFor, countsAsGreet, replyFor, PERSONALITY_KEYS } from '../src/catreplies.js';
import { PHRASES } from '../src/chat.js';
import { seedFromCode } from '../src/rng.js';

// Mirrors src/main.js's hashName — sum of char codes, no Math.random.
function hashName(name) {
  let h = 0;
  for (const ch of String(name ?? '')) h += ch.charCodeAt(0);
  return h;
}

describe('intentFor', () => {
  it('buckets every catalog phrase into a known intent', () => {
    const known = new Set(['greeting', 'play', 'compliment', 'farewell', 'emote', 'misc']);
    for (const p of PHRASES) expect(known.has(intentFor(p.id))).toBe(true);
    expect(intentFor('hi')).toBe('greeting');
    expect(intentFor('zoomies')).toBe('play');
    expect(intentFor('nice_cat')).toBe('compliment');
    expect(intentFor('bye')).toBe('farewell');
    expect(intentFor('love')).toBe('emote');
    expect(intentFor('totally-unknown')).toBe('misc');
  });
});

describe('countsAsGreet', () => {
  it('is true only for greeting-intent phrases', () => {
    expect(countsAsGreet('hi')).toBe(true);
    expect(countsAsGreet('boop')).toBe(true);
    expect(countsAsGreet('zoomies')).toBe(false);
    expect(countsAsGreet('bye')).toBe(false);
    expect(countsAsGreet('love')).toBe(false);
  });
});

describe('replyFor', () => {
  it('returns a non-empty line for every personality and every non-emote phrase', () => {
    const sample = ['hi', 'play', 'nice_cat', 'bye'];
    for (const k of PERSONALITY_KEYS) {
      for (const id of sample) {
        const line = replyFor(k, id, 7);
        expect(typeof line).toBe('string');
        expect(line.length).toBeGreaterThan(0);
      }
    }
  });
  it('is deterministic for a fixed (personality, phrase, seed) and varies across seeds/cats', () => {
    expect(replyFor('tabby', 'hi', 3)).toBe(replyFor('tabby', 'hi', 3));
    const across = new Set([replyFor('tabby', 'hi', 1), replyFor('tabby', 'hi', 2), replyFor('tabby', 'hi', 5), replyFor('tabby', 'hi', 9)]);
    expect(across.size).toBeGreaterThan(1); // not always the same line
  });
  it('gives Hagrid cluck-flavored replies', () => {
    const line = replyFor('hagrid', 'hi', 4).toLowerCase();
    expect(/bwak|cluck|bok|🐔/.test(line)).toBe(true);
  });
  it('falls back to a generic pool for an unknown personality', () => {
    const line = replyFor('nonexistent-breed', 'hi', 1);
    expect(typeof line).toBe('string');
    expect(line.length).toBeGreaterThan(0);
  });
  it('varies by cat name under main.js\'s real seed formula (regression: same-breed cats must not reply identically)', () => {
    // Same integration contract main.js's sendPhrase uses: a numeric
    // per-walk base (seedFromCode(walkStamp)) plus a per-cat name offset
    // (hashName). A string-concatenation seed collapses to 0 for every
    // cat via pick()'s `Number(seed) >>> 0`, which is exactly the bug
    // this test guards against.
    const base = seedFromCode('walk-1');
    const names = ['Whiskers', 'Mittens', 'Tom', 'Salem', 'Biscuit'];
    const lines = new Set(names.map((n) => replyFor('tabby', 'hi', (base + hashName(n)) >>> 0)));
    expect(lines.size).toBeGreaterThan(1);
  });
});
