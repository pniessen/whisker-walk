import { describe, it, expect, afterEach } from 'vitest';
import * as on from '../src/clanwords.js';
import { WORDS, SLOTS, line } from '../src/tutorialwords.js';
import { PAD_WORDS, padLine } from '../src/tv/padwords.js';
import { TOKENS, plainify } from '../src/tv/glyphs.js';
import { tvState, setTv, resetTv, padText } from '../src/tvseam.js';
import { addWordSet, removeWordSet, setSeriesMode, SERIES_ON } from '../src/wordset.js';
import { withOffWords } from './helpers/offwords.js';

// Words that would only make sense with the book-series wording on (as in tutorialwords.test.js).
const SERIES = ['clan', 'warrior', 'kit', 'apprentice', 'kittypet', 'twoleg', 'patrol', 'loner', 'rogue'];
// The lines whose keyboard form names a key or the mouse: each needs a pad form.
const KEYISH = /\bPress\b|\bHold\b|\bSpace\b|\bEsc\b|\bEnter\b|\bShift\b|\bClick\b|\bScroll\b|\bthe mouse\b|\bWASD\b|\b[Aa]rrow keys\b|\b[A-Z]\b\.|\bpress [A-Z]\b/;
// Lists of controls, one piece each: the sentence limits are for sentences.
const LISTS = new Set(['pad.strip', 'pad.strip.reef', 'pad.pause.controls']);

const inBoth = (fn) => { fn('on'); withOffWords(() => fn('off')); };

afterEach(() => resetTv());

describe('PAD_WORDS', () => {
  it('has a pad form for every line whose keyboard form names a key (both word sets)', () => {
    inBoth((set) => {
      for (const [id, w] of Object.entries(WORDS)) {
        // pad.settings.* are read on a keyboard screen, by a grown-up
        if (!id.startsWith('pad.') && KEYISH.test(w.keys)) expect(Object.hasOwn(PAD_WORDS, id), `${set}: ${id} ("${w.keys}")`).toBe(true);
      }
    });
  });

  it('every pad form is for a line that exists, or is a TV-only pad.* line', () => {
    for (const id of Object.keys(PAD_WORDS)) expect(Object.hasOwn(WORDS, id) || id.startsWith('pad.'), id).toBe(true);
  });

  it('every {slot} is one the code fills, and every token is a known button picture', () => {
    for (const [id, text] of Object.entries(PAD_WORDS)) {
      for (const m of text.matchAll(/\{(\w+)\}/g)) expect(SLOTS, id).toContain(m[1]);
      for (const m of text.matchAll(/⟦(\w+)⟧/g)) expect(TOKENS, `${id}: ${m[1]}`).toContain(m[1]);
    }
  });

  it('no sentence is over nine words and no line over 60 letters (a token counts as one)', () => {
    for (const [id, text] of Object.entries(PAD_WORDS)) {
      const flat = text.replace(/⟦\w+⟧/g, '#');
      if (!LISTS.has(id)) expect(flat.length, id).toBeLessThanOrEqual(60);
      for (const sentence of flat.split(/[.!?:·]+/).map((s) => s.trim()).filter(Boolean)) {
        expect(sentence.split(/\s+/).length, `${id}: "${sentence}"`).toBeLessThanOrEqual(9);
      }
    }
  });

  it('names no button (a token is a picture) and no series word, in both word sets', () => {
    inBoth((set) => {
      for (const [id, text] of Object.entries(PAD_WORDS)) {
        const words = text.replace(/⟦\w+⟧/g, ' ').toLowerCase().split(/[^a-z]+/);
        for (const w of SERIES) expect(words.includes(w) || words.includes(`${w}s`), `${set}: ${id}: ${w}`).toBe(false);
        expect(/\b(cross|circle|square|triangle|l1|r1|xbox|playstation)\b/i.test(text.replace(/⟦\w+⟧/g, '')), id).toBe(false);
      }
    });
  });

  it('every line reads as plain text with no token left behind, for both kinds of pad', () => {
    for (const [id, text] of Object.entries(PAD_WORDS)) {
      for (const kind of ['ps', 'xbox']) expect(plainify(text, kind), `${id} ${kind}`).not.toContain('⟦');
    }
  });
});

describe('padLine', () => {
  it('fills the slots of a pad form', () => {
    expect(padLine('hint.creep', { name: 'Biscuit' })).toBe('Biscuit is shy. Push ⟦move⟧ gently to creep.');
    expect(padLine('hint.jump')).toBe('Press ⟦jump⟧ to jump up.');
  });

  it('falls back to the keyboard form for a line with no pad form, and to null for no line', () => {
    expect(padLine('hint.roofs')).toBe(line('hint.roofs'));
    expect(padLine('hint.hiss', { name: 'Moss' })).toBe('Moss is cross today. Try again next time.');
    expect(padLine('no.such.line')).toBeNull();
    expect(padLine('__proto__')).toBeNull();
  });

  it('a word set\'s own PAD_LINES win over the table (and a line it leaves out falls through)', () => {
    addWordSet('pad-stand-in', { ...on, PAD_LINES: { 'hint.jump': 'Stand-in: ⟦jump⟧!' } });
    try {
      setSeriesMode('pad-stand-in');
      expect(padLine('hint.jump')).toBe('Stand-in: ⟦jump⟧!');
      expect(padLine('hint.hop')).toBe('Press ⟦jump⟧ again to hop down.');
    } finally {
      setSeriesMode(SERIES_ON);
      removeWordSet('pad-stand-in');
    }
    expect(padLine('hint.jump')).toBe('Press ⟦jump⟧ to jump up.');
  });
});

describe('line() with TV mode', () => {
  const tvOn = (input) => setTv({ on: true, input, padLine, text: (s) => plainify(s, 'ps') });

  it('is today\'s text with TV mode off, and with the keyboard as the input', () => {
    expect(line('hint.jump', { touch: false })).toBe('Press Space to jump up.');
    tvOn('keys');
    expect(line('hint.jump', { touch: false })).toBe('Press Space to jump up.');
    expect(line('hint.jump', { touch: true })).toBe('Tap the paw to jump up.');
  });

  it('says the pad form once the pad is the input, as plain symbols by default', () => {
    tvOn('pad');
    expect(line('hint.jump')).toBe('Press ✕ to jump up.');
    expect(line('guide.fish', { name: 'Mochi', touch: true })).toBe('Mochi is hungry. Press □ again.');
    expect(padText('⟦meow⟧')).toBe('○');
  });

  it('gives the tokens to a caller that asks for glyph: true, and leaves a line with no pad form alone', () => {
    tvOn('pad');
    expect(line('hint.jump', { glyph: true })).toBe('Press ⟦jump⟧ to jump up.');
    expect(line('hint.roofs')).toBe('Follow the white pigeon up onto the roofs!');
  });

  it('every line in the table comes out token-free by default, in both word sets', () => {
    tvOn('pad');
    inBoth((set) => {
      for (const id of Object.keys(WORDS)) expect(line(id, { name: 'Mochi', place: 'x', place2: 'y', place3: 'z', thing: 't', n: 2, rank: 'r' }), `${set}: ${id}`).not.toContain('⟦');
    });
  });

  it('with TV off the pad branch is dead even if a stale padLine is set', () => {
    setTv({ padLine, input: 'keys' });
    expect(tvState.on).toBe(false);
    expect(line('hint.jump')).toBe('Press Space to jump up.');
  });
});
