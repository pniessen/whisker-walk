// The words of Start a fresh cat: every line is used, short enough to read one at a time, the same in both word sets,
// and says nothing that belongs to the series. The two Settings buttons are plain words in the start-up door.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { LINES } from '../src/ui/freshcatwords.js';
import { phrase, addPhrases } from '../src/clanphrases.js';
import { withOffWords, bannedLeaks } from './helpers/offwords.js';

addPhrases(LINES);
const chunk = readFileSync('src/ui/freshcat.js', 'utf8');
const home = readFileSync('src/ui/homebase.js', 'utf8');
const say = () => Object.fromEntries(Object.keys(LINES).map((id) => [id, phrase(id, 'A', 'B')]));

describe('Start a fresh cat: the words', () => {
  it('every line is read by the chunk, and every fresh.* id the chunk reads is a line', () => {
    const used = new Set([...chunk.matchAll(/'(fresh\.[A-Za-z.]+)'/g)].map((m) => m[1]));
    expect([...used].filter((id) => !Object.hasOwn(LINES, id))).toEqual([]);
    expect(Object.keys(LINES).filter((id) => !used.has(id))).toEqual([]);
  });
  it('each line is plain, at most 90 characters, with no placeholder left in it', () => {
    for (const [id, text] of Object.entries(say())) {
      expect(typeof text, id).toBe('string');
      expect(text.length, id).toBeGreaterThan(0);
      expect(text.length, id).toBeLessThanOrEqual(90);
      expect(text, id).not.toMatch(/undefined|null|NaN|\[object|\{/);
    }
  });
  it('is the same in the everyday set, and never says a series word', () => {
    const on = say();
    withOffWords(() => {
      const off = say();
      expect(off).toEqual(on);
      expect(bannedLeaks(off)).toEqual([]);
    });
  });
  it('tells the truth about the copy: a cat only here is kept in a copy, and a cloud cat is never deleted', () => {
    expect(phrase('fresh.local.only')).toBe('This cat is only on this device.');
    expect(phrase('fresh.local.gone')).toMatch(/copy/);
    expect(phrase('fresh.local.gone')).toMatch(/gone for good/);
    expect(phrase('fresh.cloud.kept')).toMatch(/Nothing in the cloud is deleted/);
    expect(phrase('fresh.cloud.back')).toMatch(/Load cat/);
    expect(phrase('fresh.local.save')).toMatch(/Save this cat first/);
    expect(phrase('fresh.save')).toBe('Save this cat first');
  });
  it('the Settings door uses the owner\'s own words for the two buttons', () => {
    expect(home).toContain('>Start a fresh cat</button>');
    expect(home).toContain("'Bring back my old cat'");
    expect(home).toContain("'Switch back to the other cat'");
  });
  it('the chunk never says the old cat is gone without saying a copy is kept', () => {
    for (const id of ['fresh.what', 'fresh.local.only']) expect(phrase(id)).not.toMatch(/gone/);
  });
});
