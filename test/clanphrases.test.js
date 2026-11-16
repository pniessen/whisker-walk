// The phrase table (src/clanphrases.js, series switch phase 1, 2026-11-16):
// one lookup for the lines the game writes with, or beside, the words in
// clanwords.js. What each phrase SAYS is recorded in the series-words snapshot
// (test/serieswords.test.js, "phrases"); this file checks the table's rules,
// and pins by hand the eleven lines that used to be built inside closures.
import { describe, it, expect } from 'vitest';
import { readFileSync, globSync } from 'node:fs';
import { PHRASE_IDS, phrase, hasPhrase } from '../src/clanphrases.js';
import { RANK_WORDS, OUTSIDE_WORDS, PLACE_WORDS, CLAN_SUFFIX } from '../src/clanwords.js';
import { contestToast } from '../src/markcontest.js';
import { BORDER_ASK, borderWords } from '../src/game/borderfight.js';
import { FIGHT_MOVES } from '../src/fightmoves.js';
import { literalsIn } from './helpers/serieswords.js';

const FILES = globSync('src/**/*.js').map((f) => f.split('\\').join('/'));
const read = (f) => readFileSync(f, 'utf8');
const noComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('the phrase table', () => {
  it('is a plain lookup: a string for every id, the same one each time', () => {
    expect(PHRASE_IDS.length).toBeGreaterThan(60);
    expect(Object.isFrozen(PHRASE_IDS)).toBe(true);
    expect(new Set(PHRASE_IDS).size).toBe(PHRASE_IDS.length);
    for (const id of PHRASE_IDS) {
      expect(hasPhrase(id), id).toBe(true);
      expect(typeof phrase(id, 'A', 'B', 'C'), id).toBe('string');
      expect(phrase(id, 'A', 'B', 'C'), id).toBe(phrase(id, 'A', 'B', 'C'));
    }
  });

  it('throws on an id it does not have, inherited keys included', () => {
    for (const bad of ['nope', '', 'toString', '__proto__', 'constructor', null, undefined, 5]) {
      expect(hasPhrase(bad)).toBe(false);
      expect(() => phrase(bad)).toThrow(/no phrase/);
    }
  });

  it('ids are our own lowercase dotted words, and none spells a word from clanwords.js', () => {
    const borrowed = [...Object.values(RANK_WORDS), ...Object.values(OUTSIDE_WORDS), ...Object.values(PLACE_WORDS), CLAN_SUFFIX]
      .map((w) => w.toLowerCase());
    for (const id of PHRASE_IDS) {
      expect(id, id).toMatch(/^[a-z]+(\.[A-Za-z]+)+$/);
      const parts = id.toLowerCase().split('.');
      for (const w of borrowed) expect(parts, `${id} spells "${w}"`).not.toContain(w);
    }
  });

  it('imports only the word file, so anything may import it', () => {
    const specs = [...read('src/clanphrases.js').matchAll(/^import[^'"]*['"]([^'"]+)['"]/gm)].map((m) => m[1]);
    expect(specs).toEqual(['./clanwords.js']);
    expect(noComments(read('src/clanphrases.js'))).not.toMatch(/document|window|localStorage|THREE/);
  });

  it('every phrase(...) call in src/ names an id the table has, and every id is used', () => {
    const used = new Set();
    const unknown = [];
    for (const f of FILES) {
      if (f === 'src/clanphrases.js') continue;
      const code = noComments(read(f));
      for (const m of code.matchAll(/\bphrase\(/g)) {
        // the first argument: up to the first comma or the closing bracket at depth 0
        let i = m.index + m[0].length;
        let depth = 0;
        let arg = '';
        for (; i < code.length; i++) {
          const c = code[i];
          if (c === '(') depth++;
          if (c === ')') { if (depth === 0) break; depth--; }
          if (c === ',' && depth === 0) break;
          arg += c;
        }
        const ids = [...arg.matchAll(/'([^']*)'/g)].map((x) => x[1]).filter((s) => s.includes('.'));
        if (ids.length === 0) unknown.push(`${f}: phrase(${arg.trim()}) has no literal id`);
        for (const id of ids) {
          if (hasPhrase(id)) used.add(id); else unknown.push(`${f}: ${id}`);
        }
      }
    }
    expect(unknown).toEqual([]);
    expect(PHRASE_IDS.filter((id) => !used.has(id)), 'ids nothing in src/ reads').toEqual([]);
  });

  it('the lines that moved are no longer spelled anywhere else in src/', () => {
    // the fixed part of each moved line that is long enough to be telling
    const tells = [
      'chased off', 'ran back to', 'shook it off', 'off together', 'faced down', 'lets you pass', 'won this time',
      'is already facing', 'chased you back', 'leading the way', 'marks it too', 'scent over their mark',
      'scratch your mark into it', 'scented over your mark', 'is on your land', 'blocks your path',
      'heads back to camp', 'patrol with', 'has wandered in from', 'have noticed you', 'will you join',
      'camp coming soon', 'territory coming soon', 'pick a star name', 'great oak', 'sun-warmed', 'meeting ring',
      'meeting stone', 'War Paint', 'Rear-up Swat', 'Leap and Scratch', 'Rolling Tumble',
    ];
    // Not searched, as in test/serieswords.source.test.js: the guided first
    // walk's own words, and a list of field notes nobody is shown.
    const skip = ['src/clanphrases.js', 'src/tutorialwords.js', 'src/hints.js', 'src/game/tips.js', 'src/game/session.js'];
    const found = [];
    for (const f of FILES) {
      if (skip.includes(f)) continue;
      for (const lit of literalsIn(read(f))) for (const t of tells) if (lit.includes(t)) found.push(`${f}: ${t}`);
    }
    expect(found).toEqual([]);
  });
});

describe('the eleven lines that were built inside closures say what they said', () => {
  it('a fight at home', () => {
    expect(phrase('fight.homeAward', 'Stoatfur')).toBe('You chased off Stoatfur! 🛡️');
    expect(phrase('fight.homeWon', 'Stoatfur', 'GaleClan')).toBe("Stoatfur ran back to GaleClan's land! 🏃");
    expect(phrase('fight.homeLostScar', 'Stoatfur')).toBe('Stoatfur shook it off and walked on. That scratch will heal in a few walks!');
    expect(phrase('fight.homeLost', 'Stoatfur')).toBe('Stoatfur shook it off and walked on. Try again soon!');
    expect(phrase('fight.homeTogether', 'Robin', 'Stoatfur')).toBe('You and Robin chased Stoatfur off together! 🏃');
    expect(phrase('fight.alreadyFacing', 'Robin', 'Stoatfur')).toBe('Robin is already facing Stoatfur!');
  });

  it('borders, crossings and marks', () => {
    expect(phrase('border.chasedBack', 'Stoatfur')).toBe('Stoatfur chased you back over their border! 🐾');
    expect(phrase('cross.leading', 'Robin', 'the Moor')).toBe('Robin is leading the way to the Moor! 🧭');
    expect(phrase('mark.buddyToo', 'Fawnleaf')).toBe('Fawnleaf marks it too 🐾');
    expect(phrase('mark.promptScent')).toBe('E — scent over their mark');
    expect(phrase('mark.promptScratch')).toBe('E — scratch your mark into it');
  });

  it('the exported helpers that already existed still say the same', () => {
    expect(contestToast('HedgeClan', 'scratch')).toBe('HedgeClan scented over your mark! Scratch it again to take it back. 🐾');
    expect(contestToast('HedgeClan', 'dig')).toBe('HedgeClan scented over your mark! 🐾');
    expect({ ...BORDER_ASK }).toEqual({ ask: 'blocks your path!', off: 'Run' });
    expect(Object.isFrozen(BORDER_ASK)).toBe(true);
    const w = borderWords('moor');
    expect(w.award('Stoatfur')).toEqual({ type: 'border', key: 'border-moor', text: 'You faced down Stoatfur! 🛡️' });
    expect(w.won('Stoatfur')).toBe('Stoatfur lets you pass. 🐾');
    expect(w.lost('Stoatfur', true)).toBe('Stoatfur won this time. That scratch will heal in a few walks!');
    expect(w.lost('Stoatfur', false)).toBe('Stoatfur won this time. Try again soon!');
    expect(FIGHT_MOVES.map((m) => `${m.name} / ${m.short}`)).toEqual(['Rear-up Swat / Swat', 'Leap and Scratch / Leap', 'Pin / Pin', 'Rolling Tumble / Tumble']);
  });
});
