import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';

const { LINES, TAKES } = await import('../src/world/housewingwords.js');
const { phrase, hasPhrase } = await import('../src/clanphrases.js');
const { words } = await import('../src/wordset.js');
const { withOffWords, bannedIn } = await import('./helpers/offwords.js');
const clan = await import('../src/clanwords.js');
const off = await import('../src/offclanwords.js');
const { HOUSE_WING_FINDS, HOUSE_WING_HINTS } = await import('../src/world/housewingthings.js');

// The Old House's east wing, milestone 2: every line in both word sets. Three lines take a word from the set
// (the children, the bathroom); every other line reads the same in both.

const IDS = Object.keys(LINES);
const read = (id) => (TAKES[id] ? phrase(id, words().OUTSIDE_WORDS[TAKES[id]]) : phrase(id));

describe('the east wing\'s words', () => {
  it('every find, hint and the yarn spot has a line, in both sets, and none is empty', () => {
    for (const f of HOUSE_WING_FINDS) expect(hasPhrase(`house.find.${f.id}`), f.id).toBe(true);
    for (const h of HOUSE_WING_HINTS) expect(hasPhrase(h.words), h.words).toBe(true);
    expect(hasPhrase('house.yarn.living')).toBe(true);
    for (const id of IDS) expect(read(id), id).toMatch(/\S/);
    withOffWords(() => { for (const id of IDS) expect(read(id), id).toMatch(/\S/); });
  });

  it('the lines read the same in both sets, except the three that take a word, which differ only in that word', () => {
    const family = Object.fromEntries(IDS.map((id) => [id, read(id)]));
    let everyday;
    withOffWords(() => { everyday = Object.fromEntries(IDS.map((id) => [id, read(id)])); });
    for (const id of IDS) {
      if (!TAKES[id]) { expect(everyday[id], id).toBe(family[id]); continue; }
      expect(everyday[id], id).not.toBe(family[id]);
    }
    expect(Object.keys(TAKES).length).toBe(3);
    expect(family['house.find.bunk']).toBe('Top bunk! The best view in the Twoleg kits’ room.');
    expect(everyday['house.find.bunk']).toBe('Top bunk! The best view in the kids’ room.');
    expect(family['house.hint.bath']).toBe('Something drips in the washing-place. Plink, plink.');
    expect(everyday['house.hint.bath']).toBe('Something drips in the bathroom. Plink, plink.');
  });

  it('the word keys `kids` and `wash` are in both sets and differ', () => {
    for (const k of ['kids', 'wash']) {
      expect(typeof clan.OUTSIDE_WORDS[k]).toBe('string');
      expect(typeof off.OUTSIDE_WORDS[k]).toBe('string');
      expect(clan.OUTSIDE_WORDS[k]).not.toBe(off.OUTSIDE_WORDS[k]);
    }
  });

  it('the everyday lines carry no series word', () => {
    withOffWords(() => { for (const id of IDS) expect(bannedIn(read(id)), id).toBeNull(); });
  });

  it('no series word is a string literal in the wing\'s own files', () => {
    const dir = new URL('../src/world/', import.meta.url);
    const series = /\b(Twoleg|Twolegs|kittypet|loner|rogue|Clan|ThunderClan|warrior|apprentice|kits?)\b/;
    for (const f of readdirSync(dir).filter((n) => /^housewing(finds|things|parts|plan|moves|far)\.js$/.test(n))) {
      const src = readFileSync(new URL(f, dir), 'utf8').split('\n').filter((l) => !l.trim().startsWith('//')).map((l) => l.replace(/\/\/.*$/, '')).join('\n');
      const literals = src.match(/'[^'\n]*'|"[^"\n]*"|`[^`\n]*`/g) ?? [];
      expect(literals.filter((s) => series.test(s)), f).toEqual([]);
    }
  });
});
