import { describe, it, expect } from 'vitest';
import { intentFor, countsAsGreet, replyFor, PERSONALITY_KEYS } from '../src/catreplies.js';
import { PHRASES } from '../src/chat.js';

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
});
