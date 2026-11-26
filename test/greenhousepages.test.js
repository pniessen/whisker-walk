import { describe, it, expect } from 'vitest';
import { GREENHOUSE_PAGES, GREENHOUSE_JOURNAL_TYPES, GREENHOUSE_FIND_IDS, GREENHOUSE_PAGE_WORDS } from '../src/greenhousepages.js';
import { JOURNAL_TYPES, sanitizeSave, freshStateKeys } from '../src/progression.js';
import { AWARDS } from '../src/discoveries.js';
import { HINTS } from '../src/world/greenhousewords.js';
import { withOffWords, bannedIn } from './helpers/offwords.js';
import { CRITTER_INFO, renderJournalHtml } from '../src/journal.js';
import { setGreenhouse } from '../src/greenhouseflag.js';
import { phrase } from '../src/clanphrases.js';

describe('the Greenhouse pages (milestone G2)', () => {
  it('six finds and two jobs, ids reserved in JOURNAL_TYPES, no state key', () => {
    expect(GREENHOUSE_FIND_IDS).toEqual(['palm', 'koi', 'catnip', 'orchid', 'cactus', 'butterfly']);
    expect(GREENHOUSE_JOURNAL_TYPES).toHaveLength(8);
    for (const id of GREENHOUSE_JOURNAL_TYPES) expect(JOURNAL_TYPES.includes(id), id).toBe(true);
    expect(new Set(JOURNAL_TYPES).size).toBe(JOURNAL_TYPES.length);
    for (const k of GREENHOUSE_FIND_IDS) expect(GREENHOUSE_PAGES.some((p) => p[2] === k)).toBe(true);
    expect(freshStateKeys().includes('greenhouse')).toBe(false);
  });
  it('the sanitiser keeps a count on each id and drops an unknown one', () => {
    const journal = Object.fromEntries(GREENHOUSE_JOURNAL_TYPES.map((id, i) => [id, i + 1]));
    const s = sanitizeSave({ version: 4, journal: { ...journal, ghnope: 3 } });
    for (const [id, n] of Object.entries(journal)) expect(s.journal[id], id).toBe(n);
    expect(s.journal.ghnope).toBeUndefined();
  });
  it('the awards are 12 and 25', () => {
    expect(AWARDS.greenhousefind).toBe(12);
    expect(AWARDS.greenhousejob).toBe(25);
  });
  it('names are start-up strings, hints are lazy and read from the same table; no series word in either set', () => {
    expect(Object.keys(HINTS)).toEqual(GREENHOUSE_JOURNAL_TYPES);
    for (const id of GREENHOUSE_JOURNAL_TYPES) {
      expect(GREENHOUSE_PAGE_WORDS[id].name()).toMatch(/\S/);
      expect(GREENHOUSE_PAGE_WORDS[id].hint()).toBe(HINTS[id]);
      expect(HINTS[id].length).toBeLessThanOrEqual(90);
      expect(bannedIn(HINTS[id]) ?? bannedIn(GREENHOUSE_PAGE_WORDS[id].name())).toBeNull();
    }
  });
  it('the six find lines: the same in both sets but the catnip one, which the Clan set flavours', () => {
    const ids = GREENHOUSE_FIND_IDS.map((k) => `greenhouse.find.${k}`);
    const clan = ids.map((i) => phrase(i));
    let everyday;
    withOffWords(() => { everyday = ids.map((i) => phrase(i)); });
    for (const t of everyday) expect(bannedIn(t)).toBeNull();
    expect(clan[2]).toMatch(/Catmint/);
    expect(everyday[2]).toMatch(/Catnip/);
    clan.splice(2, 1); everyday.splice(2, 1);
    expect(everyday).toEqual(clan);
  });
  it('the eight cards are drawn only behind ?greenhouse=1', () => {
    expect(CRITTER_INFO.filter((c) => c.greenhouse).map((c) => c.id)).toEqual(GREENHOUSE_JOURNAL_TYPES);
    try {
      setGreenhouse(false);
      expect(renderJournalHtml({ ghkoi: 1 }, 0, 9)).not.toContain('Pond Watcher');
      setGreenhouse(true);
      expect(renderJournalHtml({ ghkoi: 1 }, 0, 9)).toContain('Pond Watcher');
    } finally { setGreenhouse(null); }
  });
});
