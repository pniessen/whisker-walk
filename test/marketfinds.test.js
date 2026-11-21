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

// =============================================================================
// Market step 3, Task 6: where each of the six is found (findAt, FIND_RULES).
// Automatic, no prompt: each by a thing she does at its own spot, and each its
// own way, so one spot never finds two (the fountain's drink is 2 m from the
// musician's pitch: drinking there is the fountain, listening is the musician).
// =============================================================================
const { findAt, FIND_RULES, MARKET_FIND_ANCHORS } = await import('../src/world/marketfinds.js');
const { MUSICIAN, BICYCLE_BASKET, TRESTLE_PERCH, PIGEON_PATCH, MARKET_REGISTRATION } = await import('../src/world/marketplan.js');
const { MARKET_ANCHORS } = await import('../src/world/market.js');

const A = MARKET_FIND_ANCHORS;
const BLANK = Object.freeze({ y: 0, speed: 0, still: 0, perched: null, rest: null, pigeonFlush: null, crateTipped: false, yaw: 0 });
const spotAt = (p, o = {}) => ({ ...BLANK, x: p.x, z: p.z, ...o });
const off4 = (p) => ({ x: p.x + 4, z: p.z }); // 4 m east
// her heading to face `to` from `from` (the cat faces -z at yaw 0: player.js)
const faceTo = (from, to) => Math.atan2(-(to.x - from.x), -(to.z - from.z));
// 1.5 m out from the musician, toward the spawn, facing them
const LISTEN = { x: MUSICIAN.x + 0.9, z: MUSICIAN.z + 1.2 };
const LISTENING = { still: 2, yaw: faceTo(LISTEN, MUSICIAN) };
const drink = (t = 0.5) => ({ kind: 'drink', t });
const nap = (t = 2) => ({ kind: 'nap', t });

describe('where the six are found (findAt)', () => {
  it('the anchors are the plan\'s: the drink, the nap, the pitch, the basket, the crate', () => {
    const rest = (id) => MARKET_REGISTRATION.propSet.rests.find((r) => r.id === id);
    expect({ x: A.fountain.x, z: A.fountain.z }).toEqual({ x: rest('market-drink-1').x, z: rest('market-drink-1').z });
    expect({ x: A.sacks.x, z: A.sacks.z }).toEqual({ x: rest('market-nap-1').x, z: rest('market-nap-1').z });
    expect({ x: A.musician.x, z: A.musician.z }).toEqual({ x: MUSICIAN.x, z: MUSICIAN.z });
    expect({ x: A.basket.x, z: A.basket.z }).toEqual({ x: BICYCLE_BASKET.x, z: BICYCLE_BASKET.z });
    expect(A.apples.x).toBeCloseTo(MARKET_ANCHORS.apples.x, 9);
    expect(A.apples.z).toBeCloseTo(MARKET_ANCHORS.apples.z, 9);
    expect(Object.isFrozen(A)).toBe(true);
    expect(Object.isFrozen(FIND_RULES)).toBe(true);
    expect(Object.keys(FIND_RULES)).toEqual(MARKET_FIND_IDS);
  });

  it('each discovery is found at its own spot, and only there', () => {
    const near = { x: PIGEON_PATCH.x + 1, z: PIGEON_PATCH.z };
    const rows = [
      ['fountain', A.fountain, { rest: drink() }],
      ['pigeons', near, { speed: 2, pigeonFlush: { x: PIGEON_PATCH.x, z: PIGEON_PATCH.z } }],
      ['sacks', A.sacks, { rest: nap(2) }],
      ['musician', LISTEN, LISTENING],
      ['basket', A.basket, { perched: { ...BICYCLE_BASKET } }],
      ['apples', { x: A.apples.x + 1.5, z: A.apples.z }, { crateTipped: true }],
    ];
    for (const [id, p, o] of rows) {
      expect(findAt(A, spotAt(p, o)), id).toBe(id);
      // the same, 4 m off: nothing (for the basket, a perch 4 m off; for the
      // musician, still and facing them from 4 m further out)
      const far = id === 'basket' ? { ...o, perched: { ...BICYCLE_BASKET, x: BICYCLE_BASKET.x + 4 } }
        : id === 'musician' ? { still: 2, yaw: faceTo({ x: LISTEN.x + 3.2, z: LISTEN.z + 2.4 }, MUSICIAN) }
          : o;
      const at = id === 'musician' ? { x: LISTEN.x + 3.2, z: LISTEN.z + 2.4 } : off4(p);
      expect(findAt(A, spotAt(at, far)), `${id} 4 m off`).toBe(null);
    }
    // nothing at all: nothing found
    expect(findAt(A, spotAt(A.fountain))).toBe(null);
    expect(findAt(null, spotAt(A.fountain, { rest: drink() }))).toBe(null);
    expect(findAt(A, null)).toBe(null);
  });

  it('drinking by the fountain is the fountain only; listening is the musician only', () => {
    // she drinks at the fountain's rest, 2 m from the pitch, still, facing it
    // or facing the musician: the fountain, never the musician
    for (const dx of [-0.6, 0, 0.6]) {
      const p = { x: A.fountain.x + dx, z: A.fountain.z + 0.4 };
      for (const yaw of [0, faceTo(p, MUSICIAN)]) {
        expect(findAt(A, spotAt(p, { rest: drink(2.5), still: 5, yaw })), `${dx},${yaw}`).toBe('fountain');
      }
      // the drink over, still there facing the fountain: nothing more
      expect(findAt(A, spotAt(p, { still: 5, yaw: faceTo(p, { x: 0, z: 0 }) })), `${dx} after`).toBe(null);
    }
    // a nap by the musician is no listening either
    expect(findAt(A, spotAt(LISTEN, { ...LISTENING, rest: nap(5) }))).toBe(null);
    // listening by the pitch: never the fountain
    expect(findAt(A, spotAt(LISTEN, LISTENING))).toBe('musician');
    // still near them but facing away: nothing
    expect(findAt(A, spotAt(LISTEN, { still: 5, yaw: LISTENING.yaw + Math.PI }))).toBe(null);
    expect(findAt(A, spotAt(LISTEN, { still: 5, yaw: LISTENING.yaw + 1.2 }))).toBe(null);
    expect(findAt(A, spotAt(LISTEN, { still: 5, yaw: null }))).toBe(null);
  });

  it('the pigeons want her running when they take off', () => {
    const p = { x: PIGEON_PATCH.x + 1, z: PIGEON_PATCH.z };
    const flush = { x: PIGEON_PATCH.x, z: PIGEON_PATCH.z };
    expect(findAt(A, spotAt(p, { speed: 1.0, pigeonFlush: flush }))).toBe(null);
    expect(findAt(A, spotAt(p, { speed: 2.0, pigeonFlush: flush }))).toBe('pigeons');
    expect(findAt(A, spotAt(p, { speed: 1.5, pigeonFlush: flush }))).toBe('pigeons');
    // running there with nobody taking off: nothing
    expect(findAt(A, spotAt(p, { speed: 3 }))).toBe(null);
    // one taking off 3 m away counts; 3.2 m does not
    expect(findAt(A, spotAt({ x: flush.x + 3, z: flush.z }, { speed: 2, pigeonFlush: flush }))).toBe('pigeons');
    expect(findAt(A, spotAt({ x: flush.x + 3.2, z: flush.z }, { speed: 2, pigeonFlush: flush }))).toBe(null);
  });

  it('the musician wants her still for 2 s', () => {
    expect(findAt(A, spotAt(LISTEN, { ...LISTENING, still: 0 }))).toBe(null);
    expect(findAt(A, spotAt(LISTEN, { ...LISTENING, still: 1.9 }))).toBe(null);
    expect(findAt(A, spotAt(LISTEN, { ...LISTENING, still: 2 }))).toBe('musician');
    expect(findAt(A, spotAt(LISTEN, { ...LISTENING, still: 30 }))).toBe('musician');
  });

  it('the sacks want a nap of 2 s, the fountain a drink, each within 0.8 m', () => {
    expect(findAt(A, spotAt(A.sacks, { rest: nap(1.9) }))).toBe(null);
    expect(findAt(A, spotAt(A.sacks, { rest: drink(3) }))).toBe(null);
    expect(findAt(A, spotAt({ x: A.sacks.x + 0.75, z: A.sacks.z }, { rest: nap(2) }))).toBe('sacks');
    expect(findAt(A, spotAt({ x: A.sacks.x + 0.85, z: A.sacks.z }, { rest: nap(2) }))).toBe(null);
    expect(findAt(A, spotAt(A.fountain, { rest: nap(3) }))).toBe(null);
    expect(findAt(A, spotAt({ x: A.fountain.x, z: A.fountain.z + 0.75 }, { rest: drink() }))).toBe('fountain');
    expect(findAt(A, spotAt({ x: A.fountain.x, z: A.fountain.z + 0.85 }, { rest: drink() }))).toBe(null);
  });

  it('the basket from its perch, not beside it', () => {
    expect(findAt(A, spotAt(A.basket, { perched: { ...BICYCLE_BASKET } }))).toBe('basket');
    expect(findAt(A, spotAt(A.basket, { y: A.basket.y }))).toBe(null); // beside it, at its height
    expect(findAt(A, spotAt(A.basket, { perched: { ...TRESTLE_PERCH } }))).toBe(null);
    expect(findAt(A, spotAt(A.basket, { perched: { ...BICYCLE_BASKET, x: BICYCLE_BASKET.x + 0.06 } }))).toBe(null);
    expect(findAt(A, spotAt(A.basket, { perched: { ...BICYCLE_BASKET, z: BICYCLE_BASKET.z + 0.04 } }))).toBe('basket');
  });

  it('the apples when the crate goes over within 2.5 m of her, that frame', () => {
    expect(findAt(A, spotAt({ x: A.apples.x + 2.4, z: A.apples.z }, { crateTipped: true }))).toBe('apples');
    expect(findAt(A, spotAt({ x: A.apples.x + 2.6, z: A.apples.z }, { crateTipped: true }))).toBe(null);
    expect(findAt(A, spotAt({ x: A.apples.x + 1, z: A.apples.z }, { crateTipped: false }))).toBe(null);
  });
});
