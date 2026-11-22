// The den panel's words (den shop UX, M1). The furniture names and spot labels
// are not series words, so both word sets carry the same den text.
import { describe, it, expect } from 'vitest';
import { WORDS, denWord, DEN_WORD_IDS } from '../src/ui/denwords.js';
import { SERIES_ON } from '../src/wordset.js';

const SERIES = ['clan', 'warrior', 'kit', 'apprentice', 'kittypet', 'twoleg', 'patrol', 'loner', 'rogue'];

describe('denwords', () => {
  it('every id has a non-empty line', () => {
    expect(DEN_WORD_IDS.length).toBeGreaterThan(8);
    for (const id of DEN_WORD_IDS) expect(WORDS[id].length, id).toBeGreaterThan(0);
  });
  it('the family set and the everyday set read the same', () => {
    for (const id of DEN_WORD_IDS) expect(denWord(id, SERIES_ON), id).toBe(denWord(id, 'off'));
  });
  it('no line uses a book-series word', () => {
    for (const id of DEN_WORD_IDS) {
      const ws = WORDS[id].toLowerCase().split(/[^a-z]+/);
      for (const w of SERIES) expect(ws.includes(w), `${id}: ${w}`).toBe(false);
    }
  });
  it('slots fill in, and an unknown id is an empty line, never a throw', () => {
    expect(denWord('placeIt', 'off')).toBe(WORDS.placeIt);
    expect(denWord('needMore', 'off', { n: 5 })).toContain('5');
    expect(denWord('nope', 'off')).toBe('');
  });
});
