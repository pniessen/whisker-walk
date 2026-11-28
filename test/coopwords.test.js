import { describe, it, expect } from 'vitest';
import { LINES } from '../src/coop/words.js';
import { phrase, hasPhrase } from '../src/clanphrases.js';
import { setSeriesMode, addWordSet, removeWordSet } from '../src/wordset.js';
import * as off from '../src/offclanwords.js';
import { plainify, glyphify, TOKENS } from '../src/tv/glyphs.js';
import { readFileSync, readdirSync } from 'node:fs';

// Couch play's words: one lazy table, set-aware, read in both word sets. No "Player 1/2".
const NAME = 'Mochi';

describe('couch play words', () => {
  for (const mode of ['on', 'off']) {
    it(`says every line in the ${mode} word set, with the cat's name and no button left as a token`, () => {
      setSeriesMode(mode);
      try {
        for (const id of Object.keys(LINES)) {
          expect(hasPhrase(id), id).toBe(true);
          const t = phrase(id, NAME);
          expect(t.length, id).toBeGreaterThan(3);
          for (const kind of ['ps', 'xbox', 'nin']) expect(plainify(t, kind), `${id} ${kind}`).not.toContain('⟦');
          expect(t, id).not.toMatch(/player\s*[12]|clan|warrior|twoleg/i);
          for (const [, tok] of t.matchAll(/⟦(\w+)⟧/g)) expect(TOKENS, `${id} ${tok}`).toContain(tok);
        }
        expect(phrase('coop.lost.title', NAME)).toContain(NAME);
        expect(phrase('coop.joined', NAME)).toContain(NAME);
      } finally { setSeriesMode('on'); }
    });
  }

  it('the join line is the button picture, not a name: a PlayStation pad and an Xbox pad each get their own', () => {
    const t = phrase('coop.join');
    expect(plainify(t, 'ps')).toContain('✕');
    expect(plainify(t, 'xbox')).toContain('A');
    expect(glyphify(t, 'ps')).toContain('<svg');
  });

  it('a word set\'s own PHRASES win', () => {
    addWordSet('coop-stand-in', { ...off, PHRASES: { ...off.PHRASES, 'coop.joined': () => 'Stand-in!' } });
    try {
      setSeriesMode('coop-stand-in');
      expect(phrase('coop.joined', NAME)).toBe('Stand-in!');
    } finally { setSeriesMode('on'); removeWordSet('coop-stand-in'); }
    expect(phrase('coop.joined', NAME)).toBe('Mochi is here too!');
  });

  it('no file of the chunk holds a sentence of its own: every phrase( id is in the table', () => {
    const dir = new URL('../src/coop/', import.meta.url);
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.js') && x !== 'words.js')) {
      const src = readFileSync(new URL(f, dir), 'utf8');
      for (const [, id] of src.matchAll(/phrase\('([\w.]+)'/g)) expect(Object.keys(LINES), `${f}: ${id}`).toContain(id);
    }
  });
});
