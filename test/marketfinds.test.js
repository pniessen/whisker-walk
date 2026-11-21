import { describe, it, expect, vi } from 'vitest';
import { createProgression, JOURNAL_TYPES } from '../src/progression.js';
import { CRITTER_INFO, renderJournalHtml } from '../src/journal.js';
import { createDiscoveryLog, AWARDS } from '../src/discoveries.js';
import { bus } from '../src/events.js';
import { discoveryText } from '../src/ui/hud.js';
import * as on from '../src/clanwords.js';
import * as off from '../src/offclanwords.js';
import { MARKET_FIND_IDS, MARKET_JOURNAL_TYPES, marketPageId, MARKET_PAGE_WORDS } from '../src/marketpages.js';
import { MARKET_FIND_WORDS, marketFindKey, noteMarketFind } from '../src/world/marketfinds.js';
import { withStandInWords } from './helpers/standinwords.js';
import { withOffWords } from './helpers/offwords.js';
import { seriesFilter } from './helpers/serieswords.js';

const mem = (initial = {}) => {
  const map = new Map(Object.entries(initial));
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), map };
};

const PAGES = {
  fountain: ['The Market Fountain', 'Where can a thirsty cat get a drink in the square?', 'A cool drink from the fountain. Splish! 💧', '💧'],
  pigeons: ['Pigeon Scatter', 'Some birds in the square peck at crumbs.', 'Whoosh! The pigeons flap off in a flurry. 🕊️', '🕊️'],
  sacks: ['Warm Flour Sacks', 'The baker\'s sacks look soft and warm.', 'A nap on warm flour sacks. Soft and toasty. 😴', '🌾'],
  musician: ['The Street Musician', 'Somebody in the square plays a happy tune.', 'Music! One of the Twolegs plays a fiddle just for you. 🎻', '🎻'],
  basket: ['Bicycle Basket', 'A bicycle is parked by the shops. Is there room for a cat?', 'A bicycle basket! It rocks, and the bell goes ding ding! 🚲', '🚲'],
  apples: ['Rolling Apples', 'What happens if a cat paws the apple crate?', 'Oops! Apples everywhere, rolling over the cobbles. 🍎', '🍎'],
};

describe('the Market Square journal pages', () => {
  it('six pages after the Rooftops\', each with its name and hint', () => {
    const ids = ['marketfountain', 'marketpigeons', 'marketsacks', 'marketmusician', 'marketbasket', 'marketapples'];
    expect(MARKET_FIND_IDS).toEqual(['fountain', 'pigeons', 'sacks', 'musician', 'basket', 'apples']);
    expect(MARKET_JOURNAL_TYPES).toEqual(ids);
    expect(JOURNAL_TYPES.slice(-6)).toEqual(MARKET_JOURNAL_TYPES);
    expect(MARKET_FIND_IDS.map(marketPageId)).toEqual(ids);
    for (const id of MARKET_FIND_IDS) {
      const [name, hint, line, emoji] = PAGES[id];
      const row = CRITTER_INFO.find((c) => c.id === marketPageId(id));
      expect(row.name).toBe(name);
      expect(row.hint).toBe(hint);
      expect(row.emoji).toBe(emoji);
      expect(MARKET_PAGE_WORDS[marketPageId(id)].name()).toBe(name);
      expect(MARKET_PAGE_WORDS[marketPageId(id)].hint()).toBe(hint);
      expect(MARKET_FIND_WORDS[id]()).toBe(line);
    }
    const html = renderJournalHtml({}, 0, 39);
    for (const id of MARKET_FIND_IDS) {
      expect(html).toContain(PAGES[id][1]);
      expect(html).not.toContain(PAGES[id][0]);
    }
  });

  it('the first find ever pays 12 and says its line once; a later walk counts the page and says nothing', () => {
    const progression = createProgression(mem());
    const log = createDiscoveryLog(progression);
    log.startWalk();
    const spy = vi.spyOn(bus, 'emit');
    expect(noteMarketFind('sacks', { log, progression })).toEqual({ fresh: true, first: true, points: 12 });
    expect(progression.state.journal.marketsacks).toBe(1);
    const ev = spy.mock.calls.filter((c) => c[0] === 'discovery');
    expect(ev).toHaveLength(1);
    expect(ev[0][1].label).toBe(PAGES.sacks[2]);
    expect(noteMarketFind('sacks', { log, progression }).fresh).toBe(false);
    expect(progression.state.journal.marketsacks).toBe(1);
    expect(progression.state.points).toBe(12);
    log.startWalk();
    spy.mockClear();
    expect(noteMarketFind('sacks', { log, progression })).toEqual({ fresh: true, first: false, points: 0 });
    expect(progression.state.journal.marketsacks).toBe(2);
    expect(progression.state.points).toBe(12);
    expect(spy.mock.calls.filter((c) => c[0] === 'discovery')).toHaveLength(0);
    expect(noteMarketFind('nope', { log, progression }).fresh).toBe(false);
    expect(marketFindKey('sacks')).toBe('market-find-sacks');
    spy.mockRestore();
  });

  it('the musician\'s line says Twolegs in the clan words and townspeople in the everyday words', () => {
    expect(MARKET_FIND_WORDS.musician()).toBe('Music! One of the Twolegs plays a fiddle just for you. 🎻');
    expect(withOffWords(() => MARKET_FIND_WORDS.musician())).toBe('Music! One of the townspeople plays a fiddle just for you. 🎻');
    const stand = withStandInWords(() => MARKET_FIND_WORDS.musician());
    expect(stand).not.toContain('Twolegs');
    expect(stand).not.toContain('townspeople');
    expect(on.OUTSIDE_WORDS.people).toBe('Twolegs');
    expect(off.OUTSIDE_WORDS.people).toBe('townspeople');
  });

  it('the market has a place name in both sets', () => {
    expect(on.PLACE_WORDS.market).toBe('The Market Square');
    expect(off.PLACE_WORDS.market).toBe('The Market Square');
  });

  it('no other market line or page holds a series word', () => {
    const tableWords = [...new Set([...on.PREFIXES, ...off.PREFIXES, on.CLAN_SUFFIX, off.CLAN_SUFFIX,
      ...Object.values(on.RANK_WORDS), ...Object.values(off.RANK_WORDS)])].filter((w) => w && w.length > 2);
    const found = seriesFilter(tableWords);
    for (const id of MARKET_FIND_IDS) {
      const page = MARKET_PAGE_WORDS[marketPageId(id)];
      expect(found(page.name()), id).toBe(false);
      expect(found(page.hint()), id).toBe(false);
      expect(found(MARKET_FIND_WORDS[id]()), id).toBe(false);
      // the same in both sets, but for the musician's one word
      expect(withOffWords(() => page.name())).toBe(page.name());
      expect(withOffWords(() => page.hint())).toBe(page.hint());
      if (id !== 'musician') expect(withOffWords(() => MARKET_FIND_WORDS[id]())).toBe(MARKET_FIND_WORDS[id]());
    }
  });

  it('an old save without the pages loads with each at 0', () => {
    const raw = JSON.stringify({ version: 1, points: 5, journal: { cardinal: 2, marketfountain: '<script>' } });
    const p = createProgression(mem({ 'whisker-walk-save': raw }));
    for (const id of MARKET_JOURNAL_TYPES) expect(p.state.journal[id] ?? 0).toBe(0);
    expect(p.state.journal.marketfountain).toBeUndefined();
    expect(renderJournalHtml(p.state.journal, 0, 39)).not.toContain('<script>');
  });

  it('pays what the Rooftops\' find pays, and the HUD shows its label', () => {
    expect(AWARDS.marketfind).toBe(AWARDS.roofsfind);
    expect(AWARDS.marketfind).toBe(12);
    expect(discoveryText({ type: 'marketfind', label: 'X' })).toBe('X');
  });
});
