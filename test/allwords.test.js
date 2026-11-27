// One banned-word scan over every src/**/*words.js table (engineering review
// B7, 2026-11-27). Each module's exported tables are read in BOTH word sets
// (the family's 'on' and the everyday 'off', through the word-table seam);
// under 'off' every string runs through the banned-word list of
// offwords.test.js (test/helpers/offwords.js). The family's set is SUPPOSED to
// use those words, so it is only loaded and walked, not scanned.
// A failure names the file and key. Hits already known are listed in
// KNOWN_HITS below for the owner to decide; remove an entry when it is fixed.
// clanwords.js and offclanwords.js are the sets themselves (offwords.test.js
// scans the second one).
import { describe, it, expect } from 'vitest';
import { globSync } from 'node:fs';
import { bannedLeaks, withOffWords } from './helpers/offwords.js';
import { seriesMode } from '../src/wordset.js';

const SETS_THEMSELVES = new Set(['src/clanwords.js', 'src/offclanwords.js']);
const FILES = globSync('src/**/*words.js').map((f) => f.split('\\').join('/')).filter((f) => !SETS_THEMSELVES.has(f)).sort();
const LOADERS = import.meta.glob('../src/**/*words.js');
const load = (file) => LOADERS[`../${file}`]();

// KNOWN_HITS: "file :: key" -> owner decides. Filled in from the first run.
// First run, 2026-11-27: the family's "camp" lines of tutorialwords.js WORDS. The
// everyday set overrides them through line() (offwords.test.js covers that),
// so the raw table is the only place the word stays; the owner decides.
const KNOWN_HITS = new Set([
  'src/tutorialwords.js :: WORDS.home.camp.touch',
  'src/tutorialwords.js :: WORDS.home.camp.keys',
  'src/tutorialwords.js :: WORDS.camp.follow.touch',
  'src/tutorialwords.js :: WORDS.camp.follow.keys',
  'src/tutorialwords.js :: WORDS.camp.here.touch',
  'src/tutorialwords.js :: WORDS.camp.here.keys',
  'src/tutorialwords.js :: WORDS.camp.trail.touch',
  'src/tutorialwords.js :: WORDS.camp.trail.keys',
  'src/tutorialwords.js :: WORDS.camp.pill.touch',
  'src/tutorialwords.js :: WORDS.camp.pill.keys',
]);

const scan = (mod) => {
  const out = [];
  for (const [name, table] of Object.entries(mod)) {
    if (table == null || typeof table === 'function') continue; // helper functions, not tables
    for (const leak of bannedLeaks({ [name]: table })) out.push(leak);
  }
  return out;
};
const idOf = (file, leak) => `${file} :: ${leak.split(':  ')[0].split(': "')[0]}`;

describe('every *words.js table, in both word sets', () => {
  it('finds the word files', () => {
    expect(FILES.length).toBeGreaterThan(30);
  });

  for (const file of FILES) {
    it(`${file}: loads in the family set and shows no banned word in the everyday set`, async () => {
      const mod = await load(file);
      expect(seriesMode()).toBe('on');
      scan(mod); // the family's set: must at least walk without throwing
      const hits = withOffWords(() => scan(mod)).filter((l) => !KNOWN_HITS.has(idOf(file, l)));
      expect(hits.map((l) => `${file} :: ${l}`)).toEqual([]);
    });
  }

  it('every known hit still hits (an entry that no longer does should be removed)', async () => {
    const live = new Set();
    for (const file of FILES) {
      const mod = await load(file);
      for (const l of withOffWords(() => scan(mod))) live.add(idOf(file, l));
    }
    expect([...KNOWN_HITS].filter((k) => !live.has(k))).toEqual([]);
  });
});
