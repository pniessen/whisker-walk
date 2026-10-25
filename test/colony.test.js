import { describe, it, expect } from 'vitest';
import { CAT_NAMES, KIT_NAMES, strayBreed, isStrayName } from '../src/straynames.js';
import { CAT_NAMES as LEGACY } from '../src/straycats.js';
import { TAME_FEEDS, COLONY_MAX, SOLO_MAX, FEEDS_MAX, HEAD_START_MAX, SHY_PARTNER_DAYS, emptyColony, headStartFor, isShy, tamingProgress,
  canFeed, feedCat, catsInArea, tamedCats, settleTaming, denMoment, denHome, denResidents } from '../src/colony.js';
import { DEN_SPOTS, DEN_HOMES } from '../src/den.js';
import { sanitizeColony, mergeColony, unsyncedFeeds, tradeEffect, rewardsDue, COLONY_REWARDS } from '../src/colony.js';

const ME = 'aaaaaaaa-1111', SIB = 'bbbbbbbb-2222';
const feed = (c, name, by, n, extra = {}) =>
  feedCat(c, { name, by, walk: `walk-${1000 + n}`, area: 'park', x: 3, z: -4, head: 0, ...extra }, extra.ctx);
const shyName = CAT_NAMES.find(isShy), boldName = CAT_NAMES.find((n) => !isShy(n));
// The shy rule needs a partner who is still playing (final review I1): it
// holds only while the other member has fed some colony cat within
// SHY_PARTNER_DAYS of `now`. The stamps below are walk-1000..walk-1100 (ms), so
// NOW sits just after them, and sibActive() is a colony where SIB fed a bold
// cat a moment ago.
const NOW = 5000;
const PAIRED = { members: 2, now: NOW };
const sibActive = () => feed(emptyColony(), boldName, SIB, 900, { ctx: PAIRED }).colony;
const catOf = (c, name) => c.cats.find((k) => k.name === name);

describe('straynames', () => {
  it('is the same list straycats exports, and breed is stable', () => {
    expect(LEGACY).toBe(CAT_NAMES);
    expect(strayBreed('Pickles')).toBe(strayBreed('Pickles'));
    expect(isStrayName('Pickles')).toBe(true);
    for (const bad of ['Zeetoo', '__proto__', '', null, 7]) expect(isStrayName(bad)).toBe(false);
  });
});

describe('emptyColony', () => {
  it('is exactly the shared Colony shape, and fresh each call', () => {
    expect(emptyColony()).toEqual({
      id: null, partner: null, cats: [], feeds: [], trades: [],
      tradesApplied: [], rewarded: [],
      seen: { feedKeys: [], tamed: [], trades: [], day: null },
    });
    expect(emptyColony()).not.toBe(emptyColony());
    expect(emptyColony().cats).not.toBe(emptyColony().cats);
  });
});

describe('the taming ladder', () => {
  it('head start follows the base 1/3/6 rungs and never exceeds 3', () => {
    expect([0, 1, 2, 3, 5, 6, 40].map(headStartFor)).toEqual([0, 1, 1, 2, 2, 3, 3]);
    for (const bad of [NaN, -1, '6', undefined]) expect(headStartFor(bad)).toBe(0);
  });
  it('a stranger takes TAME_FEEDS feeds; a known cat fewer, on ONE bar', () => {
    let c = emptyColony();
    for (let i = 0; i < TAME_FEEDS - 1; i++) c = feed(c, boldName, ME, i).colony;
    expect(tamingProgress(c, boldName).tamed).toBe(false);
    const r = feed(c, boldName, ME, 99);
    expect(r.tamedNow).toBe(true);
    let k = emptyColony();
    k = feed(k, boldName, ME, 1, { head: 3 }).colony;
    const p = tamingProgress(k, boldName);
    expect(p).toMatchObject({ have: 4, need: TAME_FEEDS, headStart: 3 });
  });
  it('once per player per cat per walk; a second player in the same walk counts', () => {
    let c = feed(emptyColony(), boldName, ME, 1).colony;
    expect(canFeed(c, boldName, ME, 'walk-1001')).toBe('fed-this-walk');
    expect(canFeed(c, boldName, SIB, 'walk-1001', { members: 2 })).toBe('ok');
  });
  it('attribution counts each feeder separately', () => {
    let c = emptyColony();
    c = feed(c, boldName, ME, 1).colony; c = feed(c, boldName, ME, 2).colony;
    c = feed(c, boldName, SIB, 3, { ctx: { members: 2 } }).colony;
    expect(tamingProgress(c, boldName, { members: 2 }).byPlayer)
      .toEqual(expect.arrayContaining([{ by: ME, n: 2 }, { by: SIB, n: 1 }]));
  });
  it('the finder and fixed spot are set by the first feed and never move', () => {
    let c = feed(emptyColony(), boldName, ME, 1, { x: 3, z: -4 }).colony;
    c = feed(c, boldName, SIB, 2, { x: 30, z: 30, ctx: { members: 2 } }).colony;
    expect(c.cats[0]).toMatchObject({ name: boldName, finder: ME, area: 'park', x: 3, z: -4 });
  });
  it('a full colony refuses a new cat but still feeds existing ones', () => {
    let c = emptyColony();
    CAT_NAMES.slice(0, COLONY_MAX).forEach((n, i) => { c = feed(c, n, ME, i, { ctx: { members: 2 } }).colony; });
    expect(c.cats).toHaveLength(COLONY_MAX);
    expect(canFeed(c, CAT_NAMES[COLONY_MAX], ME, 'walk-9', { members: 2 })).toBe('full');
    expect(canFeed(c, CAT_NAMES[0], ME, 'walk-9')).toBe('ok');
  });
  it('tamed cats leave their area and line up in taming order', () => {
    let c = emptyColony();
    for (let i = 0; i < TAME_FEEDS; i++) c = feed(c, boldName, ME, i).colony;
    expect(catsInArea(c, 'park').map((x) => x.name)).not.toContain(boldName);
    expect(tamedCats(c).map((x) => x.name)).toEqual([boldName]);
    expect(canFeed(c, boldName, ME, 'walk-77')).toBe('tamed');
  });
  it('isShy is deterministic and roughly one in four', () => {
    const shy = CAT_NAMES.filter(isShy).length;
    expect(shy).toBeGreaterThanOrEqual(8); expect(shy).toBeLessThanOrEqual(16);
  });
  // Review Focus 3
  it('a shy cat with a full bar waits for a SECOND feeder only when paired', () => {
    let c = sibActive();
    for (let i = 0; i < TAME_FEEDS; i++) c = feed(c, shyName, ME, i, { ctx: PAIRED }).colony;
    expect(tamingProgress(c, shyName, PAIRED)).toMatchObject({ tamed: false, needsSecondFeeder: true });
    expect(canFeed(c, shyName, ME, 'walk-50', PAIRED)).toBe('waiting');
    expect(feed(c, shyName, SIB, 51, { ctx: PAIRED }).tamedNow).toBe(true);
    let solo = emptyColony();
    for (let i = 0; i < TAME_FEEDS; i++) solo = feed(solo, shyName, ME, i).colony;
    expect(tamingProgress(solo, shyName).tamed).toBe(true);
    expect(tamingProgress(solo, shyName, { members: 2 }).tamed).toBe(true); // pairing later never un-tames
  });
  // Review Focus 3: the owner unpaired us after I filled a shy cat's bar alone.
  it('a full shy bar left behind by an unpair can still be tamed by its feeder', () => {
    let c = sibActive();
    for (let i = 0; i < TAME_FEEDS; i++) c = feed(c, shyName, ME, i, { ctx: PAIRED }).colony;
    expect(canFeed(c, shyName, ME, 'walk-50', PAIRED)).toBe('waiting');
    // now a lone member: the shy rule is off, and the cap must not read 'tamed'
    expect(tamingProgress(c, shyName, { members: 1 })).toMatchObject({ tamed: false, needsSecondFeeder: false, have: TAME_FEEDS });
    expect(canFeed(c, shyName, ME, 'walk-50', { members: 1 })).toBe('ok');
    const r = feed(c, shyName, ME, 50, { ctx: { members: 1 } });
    expect(r).toMatchObject({ result: 'ok', tamedNow: true });
    expect(catOf(r.colony, shyName)).toMatchObject({ tamedBy: ME, tamedWalk: 'walk-1050' });
    expect(canFeed(r.colony, shyName, ME, 'walk-51', { members: 1 })).toBe('tamed');
  });
  it('settleTaming tames a full, untamed, not-waiting bar that I have fed, at my latest feed', () => {
    let c = sibActive();
    // fed in walk order 1003, 1001, 1005, ... so "latest" is by stamp, not position
    for (const n of [3, 1, 5, 0, 2, 4]) c = feed(c, shyName, ME, n, { ctx: PAIRED }).colony;
    const frozen = JSON.stringify(c);
    // still paired: it is waiting for a second feeder, nothing to settle
    expect(settleTaming(c, ME, PAIRED)).toEqual({ colony: c, settled: [] });
    const s = settleTaming(c, ME, { members: 1 });
    expect(s.settled).toEqual([{ name: shyName, walk: 'walk-1005' }]);
    expect(catOf(s.colony, shyName)).toMatchObject({ name: shyName, tamedBy: ME, tamedWalk: 'walk-1005' });
    expect(s.colony.feeds).toEqual(c.feeds);
    expect(JSON.stringify(c)).toBe(frozen); // pure
    // idempotent
    expect(settleTaming(s.colony, ME, { members: 1 }).settled).toEqual([]);
  });
  it('settleTaming also settles a bar two siblings filled offline between them', () => {
    let c = emptyColony();
    for (let i = 0; i < 3; i++) c = feed(c, boldName, ME, i, { ctx: { members: 2 } }).colony;
    for (let i = 0; i < 3; i++) c = feed(c, boldName, SIB, 10 + i, { ctx: { members: 2 } }).colony;
    // (feedCat itself tamed it here; rebuild the merged-but-untamed shape a merge produces)
    c = { ...c, cats: c.cats.map((k) => ({ ...k, tamedBy: null, tamedWalk: null })) };
    expect(settleTaming(c, ME, { members: 2 }).settled).toEqual([{ name: boldName, walk: 'walk-1002' }]);
    expect(settleTaming(c, SIB, { members: 2 }).settled).toEqual([{ name: boldName, walk: 'walk-1012' }]);
  });
  it('settleTaming leaves alone: a bar not full, a cat I never fed, a tamed cat, a bad id', () => {
    let c = emptyColony();
    for (let i = 0; i < TAME_FEEDS - 1; i++) c = feed(c, boldName, ME, i).colony;
    expect(settleTaming(c, ME).settled).toEqual([]);
    let theirs = emptyColony();
    for (let i = 0; i < TAME_FEEDS; i++) theirs = feed(theirs, shyName, SIB, i, { ctx: { members: 2 } }).colony;
    expect(settleTaming(theirs, ME, { members: 1 }).settled).toEqual([]);
    let tamed = emptyColony();
    for (let i = 0; i < TAME_FEEDS; i++) tamed = feed(tamed, boldName, ME, i).colony;
    expect(settleTaming(tamed, ME).settled).toEqual([]);
    for (const bad of [null, '', '<img>', 7]) expect(settleTaming(theirs, bad, { members: 1 }).settled).toEqual([]);
  });
  it('feedCat never mutates its input', () => {
    const c = emptyColony();
    const snapshot = JSON.stringify(c);
    feed(c, boldName, ME, 1);
    expect(JSON.stringify(c)).toBe(snapshot);
  });

  // Extra coverage beyond the brief
  it('refuses with the same answer canFeed gives, and changes nothing', () => {
    let c = feed(emptyColony(), boldName, ME, 1).colony;
    const again = feed(c, boldName, ME, 1);
    expect(again.result).toBe('fed-this-walk');
    expect(again.colony).toEqual(c);
    expect(again.tamedNow).toBe(false);
  });
  it('fed-this-walk beats waiting; on a new walk the waiting player is told waiting, the unfed sibling ok', () => {
    let c = sibActive();
    for (let i = 0; i < TAME_FEEDS; i++) c = feed(c, shyName, ME, i, { ctx: PAIRED }).colony;
    // fed-this-walk takes precedence over waiting
    expect(canFeed(c, shyName, ME, `walk-${1000 + TAME_FEEDS - 1}`, PAIRED)).toBe('fed-this-walk');
    expect(canFeed(c, shyName, ME, 'walk-50', PAIRED)).toBe('waiting');
    expect(canFeed(c, shyName, SIB, 'walk-50', PAIRED)).toBe('ok');
  });
  it('a cat only counts as tamed once, tamedBy/tamedWalk are stored and never cleared', () => {
    let c = emptyColony();
    for (let i = 0; i < TAME_FEEDS; i++) c = feed(c, boldName, ME, i).colony;
    expect(c.cats[0]).toMatchObject({ tamedBy: ME, tamedWalk: `walk-${1000 + TAME_FEEDS - 1}` });
    const r = feed(c, boldName, SIB, 60, { ctx: { members: 2 } });
    expect(r.result).toBe('tamed');
    expect(r.colony).toEqual(c);
  });
  it('the head start only grows, and the spot is rounded to 0.1 m', () => {
    let c = feed(emptyColony(), boldName, ME, 1, { head: 3, x: 3.14159, z: -4.96 }).colony;
    c = feed(c, boldName, ME, 2, { head: 1 }).colony;
    expect(tamingProgress(c, boldName).headStart).toBe(3);
    expect(c.cats[0]).toMatchObject({ x: 3.1, z: -5 });
  });
  it('head start can tame a cat sooner: have is clamped to need', () => {
    let c = emptyColony();
    for (let i = 0; i < TAME_FEEDS - 3; i++) c = feed(c, boldName, ME, i, { head: 3 }).colony;
    expect(tamingProgress(c, boldName)).toMatchObject({ have: TAME_FEEDS, tamed: true });
  });
  it('tamedCats sorts by taming walk, then name; catsInArea sorts by name', () => {
    let c = emptyColony();
    const [a, b] = [CAT_NAMES.find((n) => !isShy(n)), CAT_NAMES.filter((n) => !isShy(n))[1]];
    for (let i = 0; i < TAME_FEEDS; i++) c = feed(c, b, ME, i).colony; // b tamed first
    for (let i = 0; i < TAME_FEEDS; i++) c = feed(c, a, ME, 20 + i).colony;
    expect(tamedCats(c).map((x) => x.name)).toEqual([b, a]);
    const x = CAT_NAMES.filter((n) => !isShy(n))[2], y = CAT_NAMES.filter((n) => !isShy(n))[3];
    let d = feed(emptyColony(), y, ME, 1).colony; d = feed(d, x, ME, 2).colony;
    expect(catsInArea(d, 'park').map((k) => k.name)).toEqual([x, y].sort());
    expect(catsInArea(d, 'docks')).toEqual([]);
  });
  it('refuses names that are not strays', () => {
    const c = emptyColony();
    const r = feedCat(c, { name: 'Zeetoo', by: ME, walk: 'walk-1', area: 'park', x: 0, z: 0, head: 0 });
    expect(r.result).toBe('bad');
    expect(r.colony.cats).toEqual([]);
  });
  it('canFeed and feedCat agree: malformed input is "bad" and changes nothing', () => {
    const c = feed(emptyColony(), boldName, ME, 1).colony;
    const before = JSON.stringify(c);
    const ok = { name: boldName, by: SIB, walk: 'walk-77', area: 'park', x: 1, z: 1, head: 0 };
    const cases = [
      { name: 'Zeetoo' }, { name: '__proto__' }, { name: 7 },
      { by: 'short' }, { by: '<img src=x>' }, { by: null },
      { walk: 'walk-' }, { walk: 'walk-1x' }, { walk: 12 },
      { area: 'moon' }, { area: 'den' }, { area: undefined },
      { x: NaN }, { z: Infinity }, { x: '3' },
    ];
    for (const bad of cases) {
      const input = { ...ok, ...bad };
      const r = feedCat(c, input, { members: 2 });
      expect(r.result, JSON.stringify(bad)).toBe('bad');
      expect(r.tamedNow).toBe(false);
      expect(JSON.stringify(r.colony)).toBe(before);
      if (!('area' in bad) && !('x' in bad) && !('z' in bad)) {
        expect(canFeed(c, input.name, input.by, input.walk, { members: 2 })).toBe('bad');
      }
    }
    // a bad area/spot is refused for a brand-new cat too
    for (const bad of [{ area: 'moon' }, { x: NaN }, { z: -Infinity }]) {
      const r = feedCat(emptyColony(), { ...ok, name: CAT_NAMES[5], ...bad });
      expect(r.result).toBe('bad');
      expect(r.colony.cats).toEqual([]);
    }
    expect(feedCat(c, ok, { members: 2 }).result).toBe('ok');
  });
  it('feedCat clamps the fixed spot to ±200 m after rounding', () => {
    const c = feed(emptyColony(), boldName, ME, 1, { x: 1e9, z: -250.04 }).colony;
    expect(c.cats[0]).toMatchObject({ x: 200, z: -200 });
    const d = feed(emptyColony(), boldName, ME, 1, { x: 199.96, z: -0.04 }).colony;
    expect(d.cats[0].x).toBe(200);
    expect(Object.is(d.cats[0].z, 0)).toBe(true); // never -0
  });
});

// ---------------------------------------------------------------------------
// Task 2: the save key's sanitizer, the add-only merge, trades and rewards.
// ---------------------------------------------------------------------------
const ITEMS = new Set(['heart', 'crown', 'tophat', 'bowtie', 'socks', 'wizard']);

// Final review I1: a shy cat must not be stranded by a sibling who stops
// playing. The shy rule holds only while the partner has fed some colony cat
// in the last SHY_PARTNER_DAYS days; otherwise the bar's own feeder tames it.
describe('the shy rule lapses when the partner stops playing', () => {
  const DAY = 24 * 60 * 60 * 1000;
  const T = Date.UTC(2026, 9, 25, 12);
  const at = (ms) => `walk-${ms}`;
  const ctx = { members: 2, now: T };
  // A shy cat I filled alone over the last week, plus the partner's last feed
  // (on another cat), `partnerAgo` days ago, or none at all.
  function colonyWith(partnerAgo) {
    let c = emptyColony();
    if (partnerAgo !== null) {
      c = feedCat(c, { name: boldName, by: SIB, walk: at(T - partnerAgo * DAY), area: 'park', x: 0, z: 0, head: 0 }, ctx).colony;
    }
    for (let i = 0; i < TAME_FEEDS - 1; i++) {
      c = feedCat(c, { name: shyName, by: ME, walk: at(T - (7 - i) * DAY), area: 'park', x: 1, z: 1, head: 0 }, { members: 1 }).colony;
    }
    // the bar's last feed, made while paired, so feedCat itself applies the rule
    return feedCat(c, { name: shyName, by: ME, walk: at(T - DAY), area: 'park', x: 1, z: 1, head: 0 }, ctx);
  }

  it('is two weeks', () => {
    expect(SHY_PARTNER_DAYS).toBe(14);
  });
  it('partner fed 3 days ago: the cat still waits for them', () => {
    const r = colonyWith(3);
    expect(r.tamedNow).toBe(false);
    expect(tamingProgress(r.colony, shyName, ctx)).toMatchObject({ tamed: false, needsSecondFeeder: true });
    expect(canFeed(r.colony, shyName, ME, at(T), ctx)).toBe('waiting');
    expect(settleTaming(r.colony, ME, ctx).settled).toEqual([]);
  });
  it('exactly 14 days ago still counts as playing', () => {
    expect(tamingProgress(colonyWith(14).colony, shyName, ctx).needsSecondFeeder).toBe(true);
  });
  it('partner last fed 15 days ago: the rule lapses, feeding tames it, and so does the settle step', () => {
    const r = colonyWith(15);
    // the bar filled on a lapsed partner: that very feed tamed it
    expect(r.tamedNow).toBe(true);
    // a bar that filled while they were still playing, and they have lapsed since
    const earlier = colonyWith(3).colony;
    const later = { ...ctx, now: T + 13 * DAY };
    expect(tamingProgress(earlier, shyName, later)).toMatchObject({ tamed: false, needsSecondFeeder: false });
    expect(canFeed(earlier, shyName, ME, at(T + 13 * DAY), later)).toBe('ok');
    const s = settleTaming(earlier, ME, later);
    expect(s.settled).toEqual([{ name: shyName, walk: at(T - DAY) }]);
    // tamed is stored: the partner coming back changes nothing
    const back = feedCat(s.colony, { name: boldName, by: SIB, walk: at(T + 13 * DAY), area: 'park', x: 0, z: 0, head: 0 }, later).colony;
    expect(catOf(back, shyName)).toMatchObject({ tamedBy: ME, tamedWalk: at(T - DAY) });
    expect(tamingProgress(back, shyName, later).tamed).toBe(true);
  });
  it('a partner who never fed anything holds nothing back', () => {
    const r = colonyWith(null);
    expect(r.tamedNow).toBe(true);
    expect(catOf(r.colony, shyName).tamedBy).toBe(ME);
  });
  it('a stamp from the future, or one that does not parse, is not recent', () => {
    const future = colonyWith(-3); // "fed" three days from now
    expect(future.tamedNow).toBe(true);
    let c = colonyWith(3).colony;
    c = { ...c, feeds: c.feeds.map((f) => (f.by === SIB ? { ...f, walk: 'walk-soon' } : f)) };
    expect(tamingProgress(c, shyName, ctx).needsSecondFeeder).toBe(false);
    const huge = { ...c, feeds: c.feeds.map((f) => (f.by === SIB ? { ...f, walk: `walk-${'9'.repeat(16)}` } : f)) };
    expect(tamingProgress(huge, shyName, ctx).needsSecondFeeder).toBe(false);
  });
  it('without a usable now, the rule lapses rather than hold a cat', () => {
    const c = colonyWith(3).colony;
    for (const now of [undefined, NaN, Infinity, '5000', null]) {
      expect(tamingProgress(c, shyName, { members: 2, now }).needsSecondFeeder, String(now)).toBe(false);
    }
  });
  it('only the OTHER member\'s feeds count as the partner playing', () => {
    // I keep playing (a bold cat fed today), the partner has not fed for 20 days
    let c = colonyWith(20).colony;
    c = feedCat(c, { name: CAT_NAMES.filter((n) => !isShy(n))[1], by: ME, walk: at(T), area: 'park', x: 0, z: 0, head: 0 }, ctx).colony;
    expect(catOf(c, shyName).tamedBy).toBe(ME);
    // and a shy bar the PARTNER filled alone waits for me while I play
    let theirs = feedCat(emptyColony(), { name: boldName, by: ME, walk: at(T - DAY), area: 'park', x: 0, z: 0, head: 0 }, ctx).colony;
    for (let i = 0; i < TAME_FEEDS; i++) {
      theirs = feedCat(theirs, { name: shyName, by: SIB, walk: at(T - (6 - i) * DAY), area: 'park', x: 0, z: 0, head: 0 }, ctx).colony;
    }
    expect(tamingProgress(theirs, shyName, ctx)).toMatchObject({ tamed: false, needsSecondFeeder: true });
    expect(canFeed(theirs, shyName, ME, at(T), ctx)).toBe('ok');
  });
});

describe('sanitizeColony', () => {
  it('returns an empty colony for garbage', () => {
    for (const bad of [null, 7, 'x', [], { cats: 'no' }]) expect(sanitizeColony(bad, { knownItems: ITEMS })).toEqual(emptyColony());
  });
  // Review Focus 4
  it('drops hostile cats, feeds and items', () => {
    const v = { cats: [
      { name: '__proto__', finder: ME, area: 'park', x: 0, z: 0 },
      { name: 'Pickles', finder: ME, area: 'moon', x: 0, z: 0 },
      { name: 'Noodle', finder: '<img>', area: 'park', x: 0, z: 0 },
      { name: 'Biscuit', finder: ME, area: 'park', x: NaN, z: 1e9, wear: 'laser' },
      ...Array.from({ length: 10000 }, () => ({ name: 'Fig', finder: ME, area: 'park', x: 0, z: 0 })) ],
      feeds: [{ cat: 'Ghost', by: ME, walk: 'walk-1', head: 0 }, { cat: 'Biscuit', by: ME, walk: 'walk-1', head: 99 }] };
    const c = sanitizeColony(v, { knownItems: ITEMS });
    expect(c.cats.map((x) => x.name)).toEqual(['Biscuit', 'Fig']);
    const b = c.cats[0];
    expect(Number.isFinite(b.x) && Math.abs(b.z) <= 200).toBe(true);
    expect(b.wear).toBe(null);
    expect(c.feeds).toEqual([{ cat: 'Biscuit', by: ME, walk: 'walk-1', head: 3 }]);
  });

  // Extra coverage beyond the brief
  it('a well-formed colony survives unchanged, and the output is a fresh copy', () => {
    let c = emptyColony();
    for (let i = 0; i < TAME_FEEDS; i++) c = feed(c, boldName, ME, i).colony;
    c = { ...c, id: 'col-1', partner: { playerId: SIB, petName: 'Robin', wardrobe: ['crown'] },
      cats: c.cats.map((k) => ({ ...k, wear: 'tophat' })),
      trades: [{ id: 3, from: ME, to: SIB, give: 'tophat', want: 'crown', status: 'offered' }],
      tradesApplied: [1, 2], rewarded: ['tamed-1'],
      seen: { feedKeys: [`${boldName}|${ME}|walk-1000`], tamed: [boldName], trades: [3], day: '2026-10-24' } };
    const s = sanitizeColony(c, { knownItems: ITEMS });
    expect(s).toEqual(c);
    expect(s.cats[0]).not.toBe(c.cats[0]);
    expect(sanitizeColony(JSON.parse(JSON.stringify(s)), { knownItems: ITEMS })).toEqual(s);
  });
  it('coerces non-finite coordinates to 0, then clamps to ±200 m and rounds to 0.1', () => {
    const cat = (x, z) => ({ name: 'Mochi', finder: ME, area: 'docks', x, z });
    const read = (x, z) => sanitizeColony({ cats: [cat(x, z)] }).cats[0];
    expect(read(NaN, Infinity)).toMatchObject({ x: 0, z: 0 });
    expect(read('5', null)).toMatchObject({ x: 0, z: 0 });
    expect(read(-1e9, 12.345)).toMatchObject({ x: -200, z: 12.3 });
    expect(Object.is(read(-0.01, 0).x, 0)).toBe(true);
  });
  it('caps cats at COLONY_MAX, first valid entry wins by name', () => {
    const cats = CAT_NAMES.map((name, i) => ({ name, finder: i === 0 ? SIB : ME, area: 'park', x: i, z: 0 }));
    const dup = { name: CAT_NAMES[0], finder: ME, area: 'seaside', x: 50, z: 50 };
    const c = sanitizeColony({ cats: [cats[0], dup, ...cats.slice(1)] });
    expect(c.cats).toHaveLength(COLONY_MAX);
    expect(c.cats[0]).toMatchObject({ name: CAT_NAMES[0], finder: SIB, area: 'park' });
    expect(c.cats.map((k) => k.name)).toEqual(CAT_NAMES.slice(0, COLONY_MAX));
  });
  it('keeps tamedBy only as a valid player id, with tamedWalk paired to it', () => {
    const base = { name: 'Mochi', finder: ME, area: 'park', x: 0, z: 0 };
    const read = (extra) => sanitizeColony({ cats: [{ ...base, ...extra }] }).cats[0];
    expect(read({ tamedBy: ME, tamedWalk: 'walk-9' })).toMatchObject({ tamedBy: ME, tamedWalk: 'walk-9' });
    expect(read({ tamedBy: ME, tamedWalk: 'nope' })).toMatchObject({ tamedBy: ME, tamedWalk: null });
    expect(read({ tamedBy: '<b>', tamedWalk: 'walk-9' })).toMatchObject({ tamedBy: null, tamedWalk: null });
    expect(read({ tamedBy: null, tamedWalk: 'walk-9' })).toMatchObject({ tamedBy: null, tamedWalk: null });
  });
  it('feeds: dedupe by key, at most TAME_FEEDS per (cat, by), FEEDS_MAX in total, head clamped', () => {
    const cats = CAT_NAMES.slice(0, COLONY_MAX).map((name) => ({ name, finder: ME, area: 'park', x: 0, z: 0 }));
    const feeds = [];
    for (const { name } of cats) {
      for (let w = 0; w < 20; w++) {
        feeds.push({ cat: name, by: ME, walk: `walk-${w}`, head: -4 });
        feeds.push({ cat: name, by: ME, walk: `walk-${w}`, head: 1 }); // duplicate key
        feeds.push({ cat: name, by: SIB, walk: `walk-${w}`, head: 2.5 });
      }
    }
    feeds.push({ cat: CAT_NAMES[0], by: 'cccccccc-3333', walk: 'walk-1', head: 0 });
    const c = sanitizeColony({ cats, feeds });
    const per = new Map();
    for (const f of c.feeds) per.set(`${f.cat}|${f.by}`, (per.get(`${f.cat}|${f.by}`) || 0) + 1);
    expect(Math.max(...per.values())).toBe(TAME_FEEDS);
    expect(c.feeds.length).toBe(COLONY_MAX * 2 * TAME_FEEDS + 1); // 289 <= FEEDS_MAX (the +1 is the third feeder)
    expect(new Set(c.feeds.map((f) => `${f.cat}|${f.by}|${f.walk}`)).size).toBe(c.feeds.length);
    expect(c.feeds.every((f) => f.head >= 0 && f.head <= HEAD_START_MAX && Number.isInteger(f.head))).toBe(true);
    expect(c.feeds[0]).toEqual({ cat: CAT_NAMES[0], by: ME, walk: 'walk-0', head: 0 });
    // a third feeder still fits under the total cap, which holds regardless
    const many = [];
    for (let i = 0; i < 60; i++) {
      const by = `player-${String(i).padStart(4, '0')}`;
      for (let w = 0; w < TAME_FEEDS; w++) many.push({ cat: CAT_NAMES[0], by, walk: `walk-${w}`, head: 0 });
    }
    expect(sanitizeColony({ cats, feeds: many }).feeds).toHaveLength(FEEDS_MAX);
  });
  it('partner: valid id required, pet name checked, wardrobe filtered to known items and capped', () => {
    const read = (partner) => sanitizeColony({ partner }, { knownItems: ITEMS }).partner;
    expect(read({ playerId: SIB, petName: 'Robin', wardrobe: ['crown', 'laser', 'crown', 'tophat', 7] }))
      .toEqual({ playerId: SIB, petName: 'Robin', wardrobe: ['crown', 'tophat'] });
    expect(read({ playerId: SIB, petName: '<script>', wardrobe: 'crown' }))
      .toEqual({ playerId: SIB, petName: 'your partner', wardrobe: [] });
    expect(read({ playerId: 'x', petName: 'Robin', wardrobe: [] })).toBe(null);
    expect(read(['nope'])).toBe(null);
    const big = Array.from({ length: 100 }, (_, i) => `item${i}`);
    const wardrobe = sanitizeColony({ partner: { playerId: SIB, petName: 'Robin', wardrobe: big } },
      { knownItems: new Set(big) }).partner.wardrobe;
    expect(wardrobe).toEqual(big.slice(0, 40));
    // without knownItems every item is dropped: it fails closed
    expect(sanitizeColony({ partner: { playerId: SIB, petName: 'Robin', wardrobe: ['crown'] } }).partner.wardrobe).toEqual([]);
  });
  it('keeps a colony id only if it is a short plain token', () => {
    expect(sanitizeColony({ id: 'col-1' }).id).toBe('col-1');
    for (const bad of ['', '<x>', 'a'.repeat(65), 7, {}]) expect(sanitizeColony({ id: bad }).id).toBe(null);
  });
  it('trades: only well-formed ones, deduped by id, the 20 newest', () => {
    const t = (id, extra = {}) => ({ id, from: ME, to: SIB, give: 'tophat', want: 'crown', status: 'accepted', ...extra });
    const trades = [
      ...Array.from({ length: 30 }, (_, i) => t(i + 1)),
      t(5, { give: 'heart' }), // duplicate id: first wins
      t(0), t(-1), t(1.5), t('31'), t(99, { status: 'stolen' }), t(98, { give: 'laser' }),
      t(97, { from: '<img>' }), t(96, { to: ME }), null, 'x',
    ];
    const c = sanitizeColony({ trades }, { knownItems: ITEMS });
    expect(c.trades.map((x) => x.id)).toEqual(Array.from({ length: 20 }, (_, i) => i + 11));
    expect(c.trades[0]).toEqual(t(11));
    expect(sanitizeColony({ trades: [t(5), t(5, { give: 'heart' })] }, { knownItems: ITEMS }).trades).toEqual([t(5)]);
  });
  it('tradesApplied keeps the last 50 distinct ids; rewarded only known milestone ids', () => {
    const ids = Array.from({ length: 80 }, (_, i) => i + 1);
    const c = sanitizeColony({ tradesApplied: [...ids, 3, -1, 2.5, 'x'],
      rewarded: ['tamed-1', 'tamed-1', 'tamed-99', '__proto__', 'tamed-6', 3] });
    expect(c.tradesApplied).toEqual(ids.slice(30));
    expect(c.rewarded).toEqual(['tamed-1', 'tamed-6']);
  });
  it('seen: well-formed keys only, feedKeys capped at FEEDS_MAX, day a plain date', () => {
    const keys = Array.from({ length: 400 }, (_, i) => `${boldName}|${ME}|walk-${i}`);
    const c = sanitizeColony({ seen: { feedKeys: [...keys, 'nope', `Zeetoo|${ME}|walk-1`, keys[0]],
      tamed: [boldName, boldName, '__proto__'], trades: [4, 4, 'x', 0], day: '2026-10-24' } });
    expect(c.seen.feedKeys).toHaveLength(FEEDS_MAX);
    expect(c.seen.feedKeys).toEqual(keys.slice(400 - FEEDS_MAX));
    expect(c.seen.tamed).toEqual([boldName]);
    expect(c.seen.trades).toEqual([4]);
    expect(c.seen.day).toBe('2026-10-24');
    expect(sanitizeColony({ seen: { day: 'Tuesday' } }).seen.day).toBe(null);
    expect(sanitizeColony({ seen: 'x' }).seen).toEqual(emptyColony().seen);
  });
  it('never throws, even on a payload whose getters throw', () => {
    const evil = { get cats() { throw new Error('boom'); } };
    expect(() => sanitizeColony(evil)).not.toThrow();
    expect(sanitizeColony(evil)).toEqual(emptyColony());
  });
});

describe('mergeColony — add-only', () => {
  const remoteOf = (c) => ({ id: 'col1', partner: { playerId: SIB, petName: 'Robin', wardrobe: [] }, cats: c.cats, feeds: c.feeds, trades: [] });
  it('unions feeds, keeps the server finder/spot, and never clears tamed', () => {
    let local = emptyColony();
    for (let i = 0; i < TAME_FEEDS; i++) local = feed(local, boldName, ME, i, { x: 1, z: 1 }).colony;
    let remote = feed(emptyColony(), boldName, SIB, 50, { x: 9, z: 9 }).colony;
    const m = mergeColony(local, remoteOf(remote));
    expect(m.cats[0]).toMatchObject({ finder: SIB, x: 9, z: 9, tamedBy: ME });
    expect(m.feeds).toHaveLength(TAME_FEEDS + 1);
    expect(m.id).toBe('col1');
  });
  it('is idempotent', () => {
    const r = remoteOf(feed(emptyColony(), boldName, SIB, 1).colony);
    const once = mergeColony(emptyColony(), r);
    expect(mergeColony(once, r)).toEqual(once);
  });
  it('unsyncedFeeds lists only MY feeds the server lacks', () => {
    let local = feed(emptyColony(), boldName, ME, 1).colony;
    local = feed(local, boldName, SIB, 2, { ctx: { members: 2 } }).colony;
    expect(unsyncedFeeds(local, remoteOf(emptyColony()), ME).map((f) => f.by)).toEqual([ME]);
  });

  // Extra coverage beyond the brief
  it('the server tamedBy/tamedWalk pair wins when set, and local keeps its own when the server has none', () => {
    let local = emptyColony();
    for (let i = 0; i < TAME_FEEDS; i++) local = feed(local, boldName, ME, i).colony;
    const remoteCat = { ...local.cats[0], tamedBy: SIB, tamedWalk: 'walk-5' };
    const m = mergeColony(local, remoteOf({ cats: [remoteCat], feeds: [] }));
    expect(m.cats[0]).toMatchObject({ tamedBy: SIB, tamedWalk: 'walk-5' });
    const untamed = { ...local.cats[0], tamedBy: null, tamedWalk: null };
    expect(mergeColony(local, remoteOf({ cats: [untamed], feeds: [] })).cats[0])
      .toMatchObject({ tamedBy: ME, tamedWalk: `walk-${1000 + TAME_FEEDS - 1}` });
  });
  it('keeps local-only cats and feeds, takes id/partner/trades from the server and the rest from local', () => {
    let local = feed(emptyColony(), boldName, ME, 1).colony;
    local = { ...local, tradesApplied: [2], rewarded: ['tamed-1'], seen: { feedKeys: [], tamed: [], trades: [2], day: '2026-10-01' },
      id: 'old', trades: [{ id: 1, from: ME, to: SIB, give: 'tophat', want: 'crown', status: 'offered' }] };
    const other = CAT_NAMES.find((n) => n !== boldName && !isShy(n));
    const r = { ...remoteOf(feed(emptyColony(), other, SIB, 2).colony),
      trades: [{ id: 2, from: SIB, to: ME, give: 'crown', want: 'tophat', status: 'accepted' }] };
    const m = mergeColony(local, r, { knownItems: ITEMS });
    expect(m.cats.map((k) => k.name).sort()).toEqual([boldName, other].sort());
    expect(m.feeds).toHaveLength(2);
    expect(m.id).toBe('col1');
    expect(m.partner).toEqual({ playerId: SIB, petName: 'Robin', wardrobe: [] });
    expect(m.trades.map((t) => t.id)).toEqual([2]);
    expect(m).toMatchObject({ tradesApplied: [2], rewarded: ['tamed-1'], seen: { trades: [2], day: '2026-10-01' } });
  });
  it('a hostile remote cannot remove or un-tame anything local', () => {
    let local = emptyColony();
    for (let i = 0; i < TAME_FEEDS; i++) local = feed(local, boldName, ME, i).colony;
    for (const r of [null, 'x', { cats: 'no', feeds: 7 }, { cats: [{ name: boldName, finder: '<x>' }], feeds: [{ cat: boldName }] }]) {
      const m = mergeColony(local, r);
      expect(m.cats).toEqual(local.cats);
      expect(m.feeds).toEqual(local.feeds);
    }
  });
  it('the result is sanitized: an untamed union past COLONY_MAX trims local-only cats first, and items are filtered', () => {
    // 16 + 16: colonies that grew past SOLO_MAX while paired (or a hostile remote)
    const mk = (names, by) => {
      let c = emptyColony();
      names.forEach((n, i) => { c = feed(c, n, by, i, { ctx: { members: 2 } }).colony; });
      return c;
    };
    const local = mk(CAT_NAMES.slice(0, 16), ME);
    const remote = mk(CAT_NAMES.slice(16, 32), SIB);
    remote.cats[0] = { ...remote.cats[0], wear: 'laser' };
    const m = mergeColony(local, remoteOf(remote), { knownItems: ITEMS });
    expect(m.cats).toHaveLength(COLONY_MAX);
    // all 16 remote cats stay; the local-only ones fill what is left
    expect(m.cats.map((k) => k.name)).toEqual([...CAT_NAMES.slice(16, 32), ...CAT_NAMES.slice(0, COLONY_MAX - 16)]);
    expect(m.cats.find((k) => k.name === CAT_NAMES[16]).wear).toBe(null);
    expect(m.feeds.every((f) => m.cats.some((k) => k.name === f.cat))).toBe(true);
  });
  it('unsyncedFeeds tolerates a garbage remote and returns copies', () => {
    const local = feed(emptyColony(), boldName, ME, 1).colony;
    expect(unsyncedFeeds(local, null, ME)).toEqual(local.feeds);
    expect(unsyncedFeeds(local, { feeds: 'x' }, ME)).toEqual(local.feeds);
    expect(unsyncedFeeds(local, remoteOf(local), ME)).toEqual([]);
    expect(unsyncedFeeds(local, null, ME)[0]).not.toBe(local.feeds[0]);
  });
});

// Final review C1: each child plays a solo colony before the owner runs the
// SQL, then they pair. Whichever side's cats reach the server second used to
// be cut by the 12-cat cap, tamed cats included. A tamed cat must never go.
describe('pairing two solo colonies never loses a tamed cat', () => {
  const remoteOf = (c) => ({ id: 'col1', partner: { playerId: SIB, petName: 'Robin', wardrobe: [] }, cats: c.cats, feeds: c.feeds, trades: [] });
  const tameAll = (names, by, base = 0) => {
    let c = emptyColony();
    names.forEach((n, k) => {
      for (let i = 0; i < TAME_FEEDS; i++) c = feed(c, n, by, base + k * 10 + i).colony;
    });
    return c;
  };
  const tamedNames = (c) => c.cats.filter((k) => k.tamedBy !== null).map((k) => k.name).sort();

  it('the colony holds 24 cats and 320 feeds: two full solo colonies always fit', () => {
    expect(COLONY_MAX).toBe(24);
    expect(FEEDS_MAX).toBe(320);
    expect(COLONY_MAX * 2 * TAME_FEEDS).toBeLessThanOrEqual(FEEDS_MAX);
  });
  it('12 tamed on each side: all 24 survive on both devices, through merge and sanitize', () => {
    const a = tameAll(CAT_NAMES.slice(0, 12), ME);
    const b = tameAll(CAT_NAMES.slice(12, 24), SIB, 500);
    const all = CAT_NAMES.slice(0, 24).sort();
    // A's device: the server has only B's cats so far (B pushed first)
    const onA = mergeColony(a, remoteOf(b));
    // B's device: the server has only A's cats so far
    const onB = mergeColony(b, { ...remoteOf(a), partner: { playerId: ME, petName: 'Mo', wardrobe: [] } });
    for (const side of [onA, onB]) {
      expect(side.cats).toHaveLength(24);
      expect(tamedNames(side)).toEqual(all);
      expect(tamedNames(sanitizeColony(side))).toEqual(all);
      expect(side.feeds).toHaveLength(24 * TAME_FEEDS);
    }
    // and once the server holds the whole union, a later merge keeps it all
    expect(tamedNames(mergeColony(onA, remoteOf(onB)))).toEqual(all);
    expect(mergeColony(onA, remoteOf(onA))).toEqual(mergeColony(onA, remoteOf(onA)));
  });
  it('a cat both children tamed merges to one cat, tamed by the server\'s side', () => {
    const shared = CAT_NAMES[0];
    const a = tameAll([shared, ...CAT_NAMES.slice(1, 12)], ME);
    const b = tameAll([shared, ...CAT_NAMES.slice(12, 23)], SIB, 500);
    const onA = mergeColony(a, remoteOf(b));
    expect(onA.cats.filter((k) => k.name === shared)).toHaveLength(1);
    expect(onA.cats).toHaveLength(23);
    expect(onA.cats.find((k) => k.name === shared)).toMatchObject({ tamedBy: SIB, finder: SIB });
    expect(tamedNames(onA)).toHaveLength(23);
    // both children's feeds on the shared cat are kept
    expect(new Set(onA.feeds.filter((f) => f.cat === shared).map((f) => f.by))).toEqual(new Set([ME, SIB]));
  });
  it('past the cap, every tamed cat stays: untamed local-only cats go first, then untamed remote ones', () => {
    // remote: 20 untamed cats. local: 6 tamed + 4 untamed, all local-only.
    let remote = emptyColony();
    CAT_NAMES.slice(0, 20).forEach((n, i) => { remote = feed(remote, n, SIB, i, { ctx: { members: 2 } }).colony; });
    let local = tameAll(CAT_NAMES.slice(20, 26), ME, 500);
    CAT_NAMES.slice(26, 30).forEach((n, i) => { local = feed(local, n, ME, 900 + i).colony; });
    const m = mergeColony(local, remoteOf(remote));
    expect(m.cats).toHaveLength(COLONY_MAX);
    expect(tamedNames(m)).toEqual(CAT_NAMES.slice(20, 26).sort());
    // 24 - 6 tamed = 18 untamed places, all taken by remote cats in order
    expect(m.cats.filter((k) => k.tamedBy === null).map((k) => k.name)).toEqual(CAT_NAMES.slice(0, 18));
    // feeds kept for every kept cat (the tamed ones' too), none for a dropped one
    for (const k of m.cats) expect(m.feeds.some((f) => f.cat === k.name), k.name).toBe(true);
    expect(m.feeds.some((f) => CAT_NAMES.slice(26, 30).includes(f.cat))).toBe(false);
  });
  it('tamed cats past COLONY_MAX are all kept (they never regress), and only they', () => {
    const cats = CAT_NAMES.slice(0, 30).map((name, i) => ({ name, finder: ME, area: 'park', x: 0, z: 0,
      tamedBy: i >= 2 ? ME : null, tamedWalk: i >= 2 ? `walk-${i}` : null }));
    const c = sanitizeColony({ cats });
    expect(c.cats).toHaveLength(28);
    expect(c.cats.every((k) => k.tamedBy === ME)).toBe(true);
    expect(c.cats.map((k) => k.name)).toEqual(CAT_NAMES.slice(2, 30));
    expect(sanitizeColony(c)).toEqual(c);
    // the order of what is kept is the order it came in
    const mixed = sanitizeColony({ cats: [...cats.slice(0, 2), ...cats.slice(2, 4)] });
    expect(mixed.cats.map((k) => k.name)).toEqual(CAT_NAMES.slice(0, 4));
  });
});

// Re-review N1: each child holds at most SOLO_MAX (12) cats alone; a pair
// shares COLONY_MAX (24). So two colonies filled solo always fit when the
// siblings pair, and nothing is trimmed or refused by the 24 cap.
describe('the solo cap: 12 alone, 24 together', () => {
  const remoteOf = (c, partner = SIB) => ({ id: 'col1', partner: { playerId: partner, petName: 'Robin', wardrobe: [] }, cats: c.cats, feeds: c.feeds, trades: [] });
  // Feed new cats from `names` solo until canFeed says 'full'; every other one
  // is fed to a full bar, so the colony holds tamed and in-progress cats.
  function fillSolo(names, by, base) {
    let c = emptyColony();
    let k = 0;
    for (const n of names) {
      const walk = `walk-${base + k * 10}`;
      if (canFeed(c, n, by, walk) === 'full') break;
      const times = k % 2 === 0 ? TAME_FEEDS : 2;
      for (let i = 0; i < times; i++) c = feed(c, n, by, base - 1000 + k * 10 + i).colony;
      k++;
    }
    return c;
  }

  it('is 12 alone and 24 together', () => {
    expect(SOLO_MAX).toBe(12);
    expect(SOLO_MAX * 2).toBe(COLONY_MAX);
  });
  it('solo feeding stops at 12 new cats; the 12 already there can still be fed', () => {
    const c = fillSolo(CAT_NAMES, ME, 1000);
    expect(c.cats).toHaveLength(SOLO_MAX);
    expect(canFeed(c, CAT_NAMES[SOLO_MAX], ME, 'walk-99999')).toBe('full');
    expect(feedCat(c, { name: CAT_NAMES[SOLO_MAX], by: ME, walk: 'walk-99999', area: 'park', x: 0, z: 0, head: 0 }).result).toBe('full');
    const untamed = c.cats.find((k) => k.tamedBy === null);
    expect(canFeed(c, untamed.name, ME, 'walk-99999')).toBe('ok');
  });
  it('two colonies filled solo until full pair with every cat kept on both sides', () => {
    const a = fillSolo(CAT_NAMES.slice(0, 24), ME, 1000);
    const b = fillSolo(CAT_NAMES.slice(24), SIB, 5000);
    expect([a.cats.length, b.cats.length]).toEqual([SOLO_MAX, SOLO_MAX]);
    const all = [...a.cats, ...b.cats].map((k) => k.name).sort();
    const tamedAll = [...a.cats, ...b.cats].filter((k) => k.tamedBy).map((k) => k.name).sort();
    // either device may reach the server first; the server never holds more
    // than the union, which is within its cap of 24
    const onA = mergeColony(a, remoteOf(b));
    const onB = mergeColony(b, remoteOf(a, ME));
    for (const side of [onA, onB]) {
      expect(side.cats.length).toBeLessThanOrEqual(COLONY_MAX);
      expect(side.cats.map((k) => k.name).sort()).toEqual(all);
      expect(side.cats.filter((k) => k.tamedBy).map((k) => k.name).sort()).toEqual(tamedAll);
      expect(side.feeds).toHaveLength(a.feeds.length + b.feeds.length);
      expect(sanitizeColony(side)).toEqual(side); // nothing trimmed on a later load
    }
  });
  it('a paired colony can grow to 24, and no further', () => {
    let c = fillSolo(CAT_NAMES, ME, 1000);
    for (const n of CAT_NAMES.slice(SOLO_MAX, COLONY_MAX)) {
      expect(canFeed(c, n, SIB, 'walk-7777', { members: 2 }), n).toBe('ok');
      c = feed(c, n, SIB, 6777, { ctx: { members: 2 } }).colony;
    }
    expect(c.cats).toHaveLength(COLONY_MAX);
    expect(canFeed(c, CAT_NAMES[COLONY_MAX], SIB, 'walk-8888', { members: 2 })).toBe('full');
  });
  it('a lone member left with a bigger colony keeps every cat and can still feed them, but starts no new one', () => {
    let c = fillSolo(CAT_NAMES, ME, 1000);
    for (const n of CAT_NAMES.slice(SOLO_MAX, 20)) c = feed(c, n, SIB, 6777, { ctx: { members: 2 } }).colony;
    // the owner unpairs: members is 1 again
    const kept = sanitizeColony(c);
    expect(kept).toEqual(c);
    expect(kept.cats).toHaveLength(20);
    expect(canFeed(kept, CAT_NAMES[20], ME, 'walk-9999')).toBe('full');
    expect(canFeed(kept, CAT_NAMES[19], ME, 'walk-9999')).toBe('ok');
  });
});

describe('trades and rewards', () => {
  it('tradeEffect reads each side of an accepted swap, and nothing else', () => {
    const t = { id: 4, from: ME, to: SIB, give: 'tophat', want: 'crown', status: 'accepted' };
    expect(tradeEffect(t, ME)).toEqual({ remove: 'tophat', add: 'crown' });
    expect(tradeEffect(t, SIB)).toEqual({ remove: 'crown', add: 'tophat' });
    expect(tradeEffect({ ...t, status: 'offered' }, ME)).toBe(null);
    expect(tradeEffect(t, 'cccccccc-3333')).toBe(null);
  });
  it('rewardsDue skips owned items and milestones already granted', () => {
    let c = emptyColony();
    for (let i = 0; i < TAME_FEEDS; i++) c = feed(c, boldName, ME, i).colony;
    expect(rewardsDue(c, ['heart'])).toEqual([{ id: 'tamed-1', item: 'bowtie' }]);
    expect(rewardsDue({ ...c, rewarded: ['tamed-1'] }, [])).toEqual([]);
  });

  // Extra coverage beyond the brief
  it('COLONY_REWARDS is exactly the milestone table', () => {
    expect(COLONY_REWARDS).toEqual([
      { id: 'tamed-1', tamed: 1, items: ['heart', 'bowtie', 'socks'] },
      { id: 'tamed-3', tamed: 3, items: ['crown', 'wizard', 'tophat'] },
      { id: 'tamed-6', tamed: 6, items: ['wings', 'cape', 'jetpack'] },
      { id: 'tamed-12', tamed: 12, items: ['monocle', 'balloon', 'raincoat'] },
    ]);
  });
  it('tradeEffect ignores garbage', () => {
    for (const bad of [null, 'x', [], { status: 'accepted' }]) expect(tradeEffect(bad, ME)).toBe(null);
    expect(tradeEffect({ id: 1, from: ME, to: SIB, give: 'a', want: 'b', status: 'accepted' }, null)).toBe(null);
  });
  it('rewardsDue reaches every milestone passed, and reports null when all three items are owned', () => {
    const cats = CAT_NAMES.slice(0, 6).map((name, i) => ({ name, finder: ME, area: 'park', x: 0, z: 0, wear: null, tamedBy: ME, tamedWalk: `walk-${i}` }));
    const c = { ...emptyColony(), cats };
    expect(rewardsDue(c, ['heart', 'bowtie', 'socks'])).toEqual([
      { id: 'tamed-1', item: null }, { id: 'tamed-3', item: 'crown' }, { id: 'tamed-6', item: 'wings' }]);
    expect(rewardsDue(emptyColony(), [])).toEqual([]);
    // an untamed cat counts for nothing
    expect(rewardsDue(feed(emptyColony(), boldName, ME, 1).colony, [])).toEqual([]);
  });
});

import { sanitizeSnapshot } from '../src/colony.js';
describe('sanitizeSnapshot', () => {
  const opts = { me: ME, knownItems: ITEMS };
  const paired = (extra = {}) => ({ status: 'paired', colony_id: 'c0ffee00c0ffee00',
    members: [{ player_id: ME, pet_name: 'Mo', wardrobe: [] }, { player_id: SIB, pet_name: 'Robin', wardrobe: ['crown', 'laser'] }],
    cats: [], feeds: [], trades: [], ...extra });
  it('maps a paired snapshot and picks out the partner', () => {
    const s = sanitizeSnapshot({ status: 'paired', colony_id: 'c0ffee00c0ffee00',
      members: [{ player_id: ME, pet_name: 'Mo', wardrobe: [] }, { player_id: SIB, pet_name: 'Robin', wardrobe: ['crown', 'laser'] }],
      cats: [{ name: 'Pickles', finder_id: SIB, area: 'park', x: 1, z: 2, wear: null, tamed_by: null, tamed_walk: null }],
      feeds: [{ cat: 'Pickles', by_id: SIB, walk: 'walk-1', head: 0 }], trades: [] }, opts);
    expect(s.status).toBe('paired');
    expect(s.remote.partner).toEqual({ playerId: SIB, petName: 'Robin', wardrobe: ['crown'] });
    expect(s.remote.cats[0].finder).toBe(SIB);
  });
  it('escape-proofs a hostile pet name and survives any shape', () => {
    const s = sanitizeSnapshot({ status: 'paired', colony_id: 'x', members: [{ player_id: SIB, pet_name: '<script>' }] }, opts);
    expect(s.remote.partner.petName).toBe('your partner');
    for (const bad of [null, 'paired', [], 7, undefined, { status: 'paired', members: 'x', cats: {} }, { status: 'paired', colony_id: 'x', members: [null, 3] }]) {
      expect(() => sanitizeSnapshot(bad, opts)).not.toThrow();
    }
  });
  it('maps every snake_case field and keeps the colony id', () => {
    const s = sanitizeSnapshot(paired({
      cats: [{ name: 'Pickles', finder_id: SIB, area: 'park', x: 1, z: 2, wear: 'crown', tamed_by: ME, tamed_walk: 'walk-5' }],
      feeds: [{ cat: 'Pickles', by_id: ME, walk: 'walk-5', head: 2 }],
      trades: [{ id: 3, from_id: SIB, to_id: ME, give: 'crown', want: 'heart', status: 'offered' }] }), opts);
    expect(s.remote.id).toBe('c0ffee00c0ffee00');
    expect(s.remote.cats[0]).toEqual({ name: 'Pickles', finder: SIB, area: 'park', x: 1, z: 2, wear: 'crown', tamedBy: ME, tamedWalk: 'walk-5' });
    expect(s.remote.feeds).toEqual([{ cat: 'Pickles', by: ME, walk: 'walk-5', head: 2 }]);
    expect(s.remote.trades).toEqual([{ id: 3, from: SIB, to: ME, give: 'crown', want: 'heart', status: 'offered' }]);
  });
  it('reuses the colony sanitizer: bad entries, caps, hostile coordinates', () => {
    const cat = (name, extra = {}) => ({ name, finder_id: SIB, area: 'park', x: 1, z: 2, wear: null, tamed_by: null, tamed_walk: null, ...extra });
    const s = sanitizeSnapshot(paired({
      cats: [cat('Pickles', { x: 'NaN', z: 1e9 }), cat('Zeetoo'), cat('Mochi', { wear: 'laser' }), cat('Mochi', { x: 9 })],
      feeds: [{ cat: 'Zeetoo', by_id: SIB, walk: 'walk-1', head: 0 }, { cat: 'Pickles', by_id: SIB, walk: 'junk', head: 0 }],
      trades: [{ id: 1, from_id: SIB, to_id: SIB, give: 'crown', want: 'heart', status: 'offered' }] }), opts);
    expect(s.remote.cats.map((c) => c.name)).toEqual(['Pickles', 'Mochi']);
    expect(s.remote.cats[0].x).toBe(0);
    expect(s.remote.cats[0].z).toBe(200);
    expect(s.remote.cats[1].wear).toBe(null);
    expect(s.remote.feeds).toEqual([]);
    expect(s.remote.trades).toEqual([]);
  });
  it('caps the partner wardrobe at 40 known items', () => {
    // 60 distinct items, all known, so only the cap can cut the list.
    const sixty = Array.from({ length: 60 }, (_, i) => `item${String.fromCharCode(97 + Math.floor(i / 26))}${String.fromCharCode(97 + (i % 26))}`);
    const known = new Set(sixty);
    const s = sanitizeSnapshot(paired({ members: [{ player_id: SIB, pet_name: 'Robin', wardrobe: sixty }] }), { me: ME, knownItems: known });
    expect(s.remote.partner.wardrobe).toHaveLength(40);
    expect(s.remote.partner.wardrobe).toEqual(sixty.slice(0, 40));
    // duplicates don't use up the cap
    const dup = sanitizeSnapshot(paired({ members: [{ player_id: SIB, pet_name: 'Robin', wardrobe: [...sixty.slice(0, 5), ...sixty] }] }), { me: ME, knownItems: known });
    expect(dup.remote.partner.wardrobe).toEqual(sixty.slice(0, 40));
  });
  it('is bad when `me` is not a valid player id (fails closed)', () => {
    const good = paired();
    expect(sanitizeSnapshot(good, opts).status).toBe('paired');
    for (const me of [undefined, null, '', 'short', '<img src=x>', 42, {}, 'a'.repeat(65)]) {
      expect(sanitizeSnapshot(good, { me, knownItems: ITEMS }), String(me)).toEqual({ status: 'bad' });
      expect(sanitizeSnapshot({ status: 'unpaired', invite: null, joining: null }, { me, knownItems: ITEMS })).toEqual({ status: 'bad' });
    }
    expect(sanitizeSnapshot(good)).toEqual({ status: 'bad' });
  });
  it('passes denied through and rejects unknown or malformed statuses', () => {
    expect(sanitizeSnapshot({ status: 'denied' }, opts)).toEqual({ status: 'denied' });
    for (const bad of [{ status: 'weird' }, {}, { status: 7 }, { status: '__proto__' }]) expect(sanitizeSnapshot(bad, opts)).toEqual({ status: 'bad' });
  });
  it('is bad when paired has no usable colony id or partner', () => {
    expect(sanitizeSnapshot(paired({ colony_id: null }), opts)).toEqual({ status: 'bad' });
    expect(sanitizeSnapshot(paired({ colony_id: '<img>' }), opts)).toEqual({ status: 'bad' });
    expect(sanitizeSnapshot(paired({ members: [{ player_id: ME, pet_name: 'Mo' }] }), opts)).toEqual({ status: 'bad' });
    expect(sanitizeSnapshot(paired({ members: [{ player_id: 'x!', pet_name: 'Robin' }, { player_id: ME }] }), opts)).toEqual({ status: 'bad' });
  });
  it('maps an unpaired snapshot: invite and joining, camelCased and sanitized', () => {
    const u = (extra) => sanitizeSnapshot({ status: 'unpaired', invite: null, joining: null, ...extra }, opts);
    expect(u({})).toEqual({ status: 'unpaired', invite: null, joining: null });
    expect(u({ invite: { code: 'K7P2QM', expires_at: '2026-10-24T10:00:00Z', joiner_pet_name: 'Robin' }, joining: { inviter_pet_name: 'Mo' } }))
      .toEqual({ status: 'unpaired', invite: { code: 'K7P2QM', expiresAt: '2026-10-24T10:00:00Z', joinerPetName: 'Robin' }, joining: { inviterPetName: 'Mo' } });
    expect(u({ invite: { code: 'K7P2QM', expires_at: 5, joiner_pet_name: null } }).invite).toEqual({ code: 'K7P2QM', expiresAt: null, joinerPetName: null });
    expect(u({ invite: { code: 'K7P2QM', expires_at: 'x', joiner_pet_name: '<b>' } }).invite.joinerPetName).toBe('your partner');
    expect(u({ joining: { inviter_pet_name: '<b>' } }).joining).toEqual({ inviterPetName: 'your partner' });
    for (const code of ['k7p2qm', 'K7P2Q', 'K7P2QMX', 'K7P2Q0', 'K7P2QI', '<script>', 7, null]) {
      expect(u({ invite: { code, expires_at: null } }).invite).toBe(null);
    }
    expect(u({ invite: 'x', joining: 7 })).toEqual({ status: 'unpaired', invite: null, joining: null });
  });
});

// v21 Stream 2, Task 6 fix round 1: the one wear lookup, shared by the area
// strays (game/walk.js) and the den's tamed cats (Task 7). The catalog is
// passed in because colony.js must not import progression.js.
import { colonyWear } from '../src/colony.js';
describe('colonyWear', () => {
  const CAT = { bell: { name: 'Bell Collar', slot: 'collar' }, crown: { name: 'Flower Crown', slot: 'head' } };
  it('resolves a known id to its slot', () => {
    expect(colonyWear('crown', CAT)).toEqual({ slot: 'head', id: 'crown' });
    expect(colonyWear('bell', CAT)).toEqual({ slot: 'collar', id: 'bell' });
  });
  it('is null for no item, an unknown id, an inherited key or garbage', () => {
    for (const bad of [null, undefined, '', 'jetpack', '__proto__', 'toString', 'constructor', 7, {}]) {
      expect(colonyWear(bad, CAT)).toBe(null);
    }
  });
  it('is null for a broken catalog or a catalog entry without a slot', () => {
    expect(colonyWear('bell', null)).toBe(null);
    expect(colonyWear('bell', undefined)).toBe(null);
    expect(colonyWear('odd', { odd: { name: 'Odd' } })).toBe(null);
  });
  it('agrees with the real CATALOG for every accessory', async () => {
    const { CATALOG } = await import('../src/progression.js');
    for (const [id, a] of Object.entries(CATALOG.accessories)) {
      expect(colonyWear(id, CATALOG.accessories)).toEqual({ slot: a.slot, id });
    }
  });
});

describe('the den: a different thing each day', () => {
  it('denMoment is the same all day and varies across days', () => {
    expect(denMoment('Pickles', '2026-10-24')).toEqual(denMoment('Pickles', '2026-10-24'));
    const acts = new Set(Array.from({ length: 14 }, (_, d) => denMoment('Pickles', `2026-11-${String(d + 1).padStart(2, '0')}`).act));
    expect(acts.size).toBeGreaterThanOrEqual(3);
  });
  it('every moment is a known act with a spot that fits it', () => {
    const ids = new Set(DEN_SPOTS.map((s) => s.id));
    const seen = new Set();
    for (const name of CAT_NAMES) {
      for (let d = 1; d <= 6; d++) {
        const m = denMoment(name, `2026-12-0${d}`);
        seen.add(m.act);
        expect(['nap', 'box', 'knocked', 'window', 'groom']).toContain(m.act);
        if (m.act === 'window') expect(m.spot).toBe('window');
        else if (m.act === 'nap' || m.act === 'groom') expect(m.spot).toBe('home');
        else expect(ids.has(m.spot)).toBe(true);
      }
    }
    expect(seen.size).toBe(5);
  });
  it('each tamed cat gets its own home spot, in taming order', () => {
    const [a, b] = CAT_NAMES.filter((n) => !isShy(n));
    let c = emptyColony();
    for (let i = 0; i < TAME_FEEDS; i++) c = feed(c, a, ME, i).colony; // a tamed first
    for (let i = 0; i < TAME_FEEDS; i++) c = feed(c, b, ME, 20 + i).colony;
    expect(denHome(c, a)).toBe(0);
    expect(denHome(c, b)).toBe(1);
    expect(denHome(c, 'Zeetoo')).toBe(null);
  });
  it('an untamed cat has no den home', () => {
    const c = feed(emptyColony(), boldName, ME, 1).colony;
    expect(denHome(c, boldName)).toBe(null);
  });
  it('there is a den home for every cat a full colony can hold, and none past them', () => {
    expect(DEN_HOMES).toHaveLength(COLONY_MAX);
    // the twelve furniture anchors stay the first twelve homes, so no cat moves
    expect(DEN_HOMES.slice(0, DEN_SPOTS.length).map(({ x, z }) => ({ x, z }))).toEqual(DEN_SPOTS.map(({ x, z }) => ({ x, z })));
    const cats = CAT_NAMES.slice(0, COLONY_MAX + 3).map((name, i) => ({ name, finder: ME, area: 'park', x: 0, z: 0,
      tamedBy: ME, tamedWalk: `walk-${i + 1}` }));
    const c = sanitizeColony({ cats });
    expect(c.cats).toHaveLength(COLONY_MAX + 3);
    expect(denHome(c, CAT_NAMES[COLONY_MAX - 1])).toBe(COLONY_MAX - 1);
    for (const n of CAT_NAMES.slice(COLONY_MAX, COLONY_MAX + 3)) expect(denHome(c, n)).toBe(null);
  });
  it('denResidents gives each tamed cat its home, and leaves out the ones past the last home', () => {
    const cats = CAT_NAMES.slice(0, COLONY_MAX + 3).map((name, i) => ({ name, finder: ME, area: 'park', x: 0, z: 0,
      tamedBy: i === 1 ? null : ME, tamedWalk: i === 1 ? null : `walk-${100 - i}` }));
    const c = sanitizeColony({ cats });
    const r = denResidents(c);
    expect(r).toHaveLength(COLONY_MAX);
    expect(r.map((e) => e.home)).toEqual(DEN_HOMES);
    // taming order (latest walk stamp last), not list order
    expect(r[0].cat.name).toBe(CAT_NAMES[COLONY_MAX + 2]);
    expect(r.every((e) => e.cat.name === tamedCats(c)[r.indexOf(e)].name)).toBe(true);
    expect(r.some((e) => e.cat.name === CAT_NAMES[1])).toBe(false);
    expect(denResidents(emptyColony())).toEqual([]);
  });
});

// v21 Stream 2, Task 10: the "while you were out" lines.
import { colonyNews, NEWS_LINES_MAX } from '../src/colony.js';
describe('colonyNews', () => {
  const BOLD = CAT_NAMES.filter((n) => !isShy(n));
  const [N1, N2, N3, N4] = BOLD;
  const PARTNER = { playerId: SIB, petName: 'Robin', wardrobe: [] };
  const ACC = { crown: { name: 'Flower Crown', slot: 'head' } };
  const DAY = '2026-10-24';
  const cat = (name, extra = {}) => ({ name, finder: ME, area: 'park', x: 1, z: 2, wear: null, tamedBy: null, tamedWalk: null, ...extra });
  const fed = (c, by, walk) => ({ cat: c, by, walk, head: 0 });
  const key = (f) => `${f.cat}|${f.by}|${f.walk}`;
  const colonyWith = (over = {}) => ({ ...emptyColony(), id: 'col-1', partner: PARTNER, ...over });
  const news = (c, extra = {}) => colonyNews(c, { me: ME, ymd: DAY, ...extra });
  const NOSEEN = { feedKeys: [], tamed: [], trades: [], day: DAY }; // today's den already shown

  it('lists the partner\'s feeds on a cat that is not new, collapsing repeats, and never my own', () => {
    const c = colonyWith({
      cats: [cat(N1), cat(N2)],
      feeds: [fed(N1, SIB, 'walk-1'), fed(N1, SIB, 'walk-2'), fed(N1, SIB, 'walk-3'),
        fed(N2, SIB, 'walk-4'), fed(N1, ME, 'walk-5'), fed(N2, ME, 'walk-6')],
      seen: NOSEEN,
    });
    const n = news(c);
    expect(n.lines).toEqual([`Robin fed ${N1} 🐟 ×3`, `Robin fed ${N2} 🐟`]);
    expect(n.any).toBe(true);
    // my own feeds alone say nothing
    expect(news(colonyWith({ cats: [cat(N1)], feeds: [fed(N1, ME, 'walk-1')], seen: NOSEEN })).lines).toEqual([]);
  });

  it('a partner-found cat is ONE line with the feed count merged in, and no separate fed line', () => {
    const c = colonyWith({
      cats: [cat(N1, { finder: SIB }), cat(N2, { finder: SIB })],
      feeds: [fed(N1, SIB, 'walk-1'), fed(N1, SIB, 'walk-2'), fed(N1, SIB, 'walk-3'), fed(N2, SIB, 'walk-4')],
      seen: NOSEEN,
    });
    expect(news(c).lines).toEqual([
      `Robin found a new cat: ${N1} (fed ×3 🐟)`,
      `Robin found a new cat: ${N2} (fed 🐟)`,
    ]);
    // a cat I found is never announced as the partner's find
    expect(news(colonyWith({ cats: [cat(N1)], feeds: [fed(N1, SIB, 'walk-1')], seen: NOSEEN })).lines.some((l) => l.includes('found a new cat'))).toBe(false);
  });

  it('a cat is only "new" while none of its feeds were seen', () => {
    const c = colonyWith({ cats: [cat(N1, { finder: SIB })], feeds: [fed(N1, SIB, 'walk-1'), fed(N1, SIB, 'walk-2')], seen: NOSEEN });
    expect(news({ ...c, seen: { ...NOSEEN, feedKeys: [key(c.feeds[0])] } }).lines).toEqual([`Robin fed ${N1} 🐟`]);
    expect(news({ ...c, seen: { ...NOSEEN, feedKeys: c.feeds.map(key) } }).lines).toEqual([]);
  });

  it('came-home is the partner\'s taming only; my own is excluded', () => {
    const c = colonyWith({
      cats: [cat(N1, { tamedBy: SIB, tamedWalk: 'walk-9' }), cat(N2, { tamedBy: ME, tamedWalk: 'walk-8' })],
      feeds: [fed(N1, SIB, 'walk-1'), fed(N2, ME, 'walk-2')],
      seen: NOSEEN,
    });
    expect(news(c).lines).toEqual([`${N1} came home to the den! 🏠`]);
    // seen tamed names are not repeated
    expect(news({ ...c, seen: { ...NOSEEN, tamed: [N1], feedKeys: [key(c.feeds[0])] } }).lines).toEqual([]);
  });

  it('a cat both new and tamed by the partner shows only the came-home line', () => {
    const c = colonyWith({
      cats: [cat(N1, { finder: SIB, tamedBy: SIB, tamedWalk: 'walk-9' })],
      feeds: [fed(N1, SIB, 'walk-1'), fed(N1, SIB, 'walk-2')],
      seen: NOSEEN,
    });
    expect(news(c).lines).toEqual([`${N1} came home to the den! 🏠`]);
  });

  it('is empty after dismissing what was shown, and the den lines come back the next day', () => {
    const c = colonyWith({
      cats: [cat(N1, { tamedBy: SIB, tamedWalk: 'walk-1' }), cat(N2, { finder: SIB }), cat(N3)],
      feeds: [fed(N1, SIB, 'walk-1'), fed(N2, SIB, 'walk-2'), fed(N3, SIB, 'walk-3')],
      trades: [{ id: 3, from: SIB, to: ME, give: 'crown', want: 'tophat', status: 'offered' }],
    });
    const before = news(c);
    expect(before.lines).toContain(`${N1} came home to the den! 🏠`);
    expect(before.lines).toContain(`Robin found a new cat: ${N2} (fed 🐟)`);
    expect(before.lines).toContain(`Robin fed ${N3} 🐟`);
    expect(before.lines).toContain('Robin wants to swap — have a look in Colony');
    expect(before.lines.some((l) => l.startsWith('In the den: '))).toBe(true);
    const read = { ...c, seen: before.seen };
    expect(news(read)).toMatchObject({ lines: [], any: false });
    const next = news(read, { ymd: '2026-10-25' });
    expect(next.any).toBe(true);
    expect(next.lines.every((l) => l.startsWith('In the den: '))).toBe(true);
  });

  it('says nothing on a brand-new save', () => {
    expect(colonyNews(emptyColony(), { me: ME, ymd: DAY })).toMatchObject({ lines: [], any: false });
    expect(colonyNews(null, { me: ME, ymd: DAY })).toMatchObject({ lines: [], any: false });
    expect(colonyNews(undefined)).toMatchObject({ lines: [], any: false });
  });

  it('orders the lines: came home, new cat, fed, offer, rewards, den', () => {
    const c = colonyWith({
      cats: [cat(N3), cat(N1, { finder: SIB, tamedBy: SIB, tamedWalk: 'walk-9' }), cat(N2, { finder: SIB })],
      feeds: [fed(N3, SIB, 'walk-1'), fed(N2, SIB, 'walk-2')],
      trades: [{ id: 5, from: SIB, to: ME, give: 'crown', want: 'tophat', status: 'offered' }],
    });
    const lines = news(c, { rewards: ['crown'], accessories: ACC }).lines;
    const idx = (re) => lines.findIndex((l) => re.test(l));
    const order = [idx(/came home/), idx(/found a new cat/), idx(/ fed /), idx(/wants to swap/), idx(/New for your wardrobe/), idx(/^In the den/)];
    expect(order.every((i) => i >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(lines).toContain('🎁 New for your wardrobe: Flower Crown');
  });

  it('offers: only an open one to me, from them, not yet seen', () => {
    const t = (over) => ({ id: 7, from: SIB, to: ME, give: 'crown', want: 'tophat', status: 'offered', ...over });
    const has = (trade, extra) => news(colonyWith({ trades: [trade], seen: NOSEEN, ...extra })).lines.some((l) => l.includes('wants to swap'));
    expect(has(t())).toBe(true);
    expect(has(t({ status: 'accepted' }))).toBe(false);
    expect(has(t({ status: 'declined' }))).toBe(false);
    expect(has(t({ from: ME, to: SIB }))).toBe(false);
    expect(has(t(), { seen: { ...NOSEEN, trades: [7] } })).toBe(false);
  });

  it('den lines: at most three, one per cat, only with a tamed cat, phrased per act', () => {
    const names = BOLD.slice(0, 6);
    const cats = names.map((n, i) => cat(n, { tamedBy: ME, tamedWalk: `walk-${i + 1}` }));
    const seen = { feedKeys: [], tamed: names, trades: [], day: null };
    const lines = news(colonyWith({ cats, seen })).lines;
    expect(lines).toHaveLength(3);
    const actPhrase = { box: 'is stuck in a box', knocked: 'knocked something over', window: 'is napping on the windowsill', groom: 'is having a wash', nap: 'is curled up asleep' };
    const named = new Set();
    for (const l of lines) {
      const m = l.match(/^In the den: (\S+) (.+)$/);
      expect(m).not.toBeNull();
      expect(names).toContain(m[1]);
      expect(m[2]).toBe(actPhrase[denMoment(m[1], DAY).act]);
      named.add(m[1]);
    }
    expect(named.size).toBe(3);
    expect(news(colonyWith({ cats, seen })).lines).toEqual(lines);
    expect(news(colonyWith({ cats: [cat(N1)], seen })).lines).toEqual([]);
  });

  it('caps the card at 8 lines: the first 7, then "…and k more"', () => {
    const names = BOLD.slice(0, 11);
    const cats = names.map((n) => cat(n));
    const feeds = names.map((n, i) => fed(n, SIB, `walk-${i + 1}`));
    const c = colonyWith({ cats, feeds, seen: NOSEEN });
    const n = news(c);
    expect(NEWS_LINES_MAX).toBe(8);
    expect(n.lines).toHaveLength(8);
    expect(n.lines.slice(0, 7).every((l) => l.startsWith('Robin fed '))).toBe(true);
    expect(n.lines[7]).toBe('…and 4 more — have a look in Colony');
    // exactly 8 is not capped
    const eight = news(colonyWith({ cats: cats.slice(0, 8), feeds: feeds.slice(0, 8), seen: NOSEEN }));
    expect(eight.lines).toHaveLength(8);
    expect(eight.lines.some((l) => l.includes('more'))).toBe(false);
  });

  it('seen is only what the card showed: the hidden cats stay unread', () => {
    const names = BOLD.slice(0, 10);
    const cats = names.map((n) => cat(n));
    const feeds = names.map((n, i) => fed(n, SIB, `walk-${i + 1}`));
    const n = news(colonyWith({ cats, feeds, seen: NOSEEN }));
    expect(n.seen.feedKeys).toEqual(feeds.slice(0, 7).map(key));
    // dismissing leaves the three under "…and k more" for next time
    const next = news(colonyWith({ cats, feeds, seen: n.seen }));
    expect(next.lines).toEqual(names.slice(7).map((nm) => `Robin fed ${nm} 🐟`));
  });

  it('seen leaves out feeds, trades and cats that arrived after the card was built', () => {
    const c = colonyWith({ cats: [cat(N1), cat(N2, { tamedBy: ME, tamedWalk: 'walk-3' })], feeds: [fed(N1, SIB, 'walk-1')], seen: NOSEEN });
    const n = news(c);
    expect(n.seen).toEqual({ feedKeys: [`${N1}|${SIB}|walk-1`], tamed: [N2], trades: [], day: DAY });
    // a feed merged in later is not in the snapshot, so it is still news
    const later = { ...c, feeds: [...c.feeds, fed(N1, SIB, 'walk-9')], seen: n.seen };
    expect(news(later).lines).toEqual([`Robin fed ${N1} 🐟`]);
  });

  it('the day is only marked when the den lines were shown', () => {
    const names = BOLD.slice(0, 9);
    const cats = names.map((n) => cat(n, { tamedBy: ME, tamedWalk: 'walk-1' }));
    const seen0 = { feedKeys: [], tamed: names, trades: [], day: '2026-10-01' };
    expect(news(colonyWith({ cats, seen: seen0 })).seen.day).toBe(DAY);
    // the den lines fell under the cap: the day stays as it was
    const fedCats = BOLD.slice(9, 18).map((n) => cat(n));
    const busy = colonyWith({ cats: [...cats, ...fedCats], feeds: fedCats.map((c2, i) => fed(c2.name, SIB, `walk-${i + 50}`)), seen: seen0 });
    const n = news(busy);
    expect(n.lines.some((l) => l.startsWith('In the den: '))).toBe(false);
    expect(n.seen.day).toBe('2026-10-01');
  });

  it('is safe with a missing partner, bad input and unknown reward ids', () => {
    expect(news(colonyWith({ partner: null, cats: [cat(N1)], feeds: [fed(N1, SIB, 'walk-1')], seen: NOSEEN })).lines).toEqual([]);
    expect(news(colonyWith({ seen: NOSEEN }), { rewards: ['nope', 7, null], accessories: ACC }).lines).toEqual([]);
    expect(news(colonyWith({ seen: NOSEEN }), { rewards: ['__proto__', 'toString'], accessories: ACC }).lines).toEqual([]);
    expect(() => colonyNews({ cats: 'x', feeds: 4, seen: 3 }, { me: ME, ymd: DAY })).not.toThrow();
  });
});

// A kit in the den is fed the ordinary way. It has no area of its own: the den
// is not a COLONY_AREA, so the feed carries its MOTHER's area and spot ("born
// where its mother was found") — the den would be refused as 'bad'.
describe('feeding a den kit', () => {
  const MOM = { area: 'park', x: 3, z: -4 };
  const kitFeed = (c, kit, by = ME, n = 0) => feedCat(c, { name: kit, by, walk: `walk-${2000 + n}`, head: 0, ...MOM });

  it('can be fed, and is then an ordinary colony cat', () => {
    const kit = KIT_NAMES[0];
    expect(canFeed(emptyColony(), kit, ME, 'walk-2000')).toBe('ok');
    const r = kitFeed(emptyColony(), kit);
    expect(r.result).toBe('ok');
    expect(r.colony.cats.map((x) => x.name)).toContain(kit);
    expect(catOf(r.colony, kit)).toMatchObject(MOM);
    expect(tamingProgress(r.colony, kit).have).toBe(1);
  });

  it('is refused when fed in the den: the den is not a colony area', () => {
    const r = feedCat(emptyColony(), { name: KIT_NAMES[0], by: ME, walk: 'walk-2000', area: 'den', x: 0, z: 0, head: 0 });
    expect(r.result).toBe('bad');
    expect(r.colony.cats).toEqual([]);
  });

  it('leaves the caps unchanged and counts against them like any cat', () => {
    expect(COLONY_MAX).toBe(24);
    expect(SOLO_MAX).toBe(12);
    let c = emptyColony();
    CAT_NAMES.slice(0, SOLO_MAX).forEach((n, i) => { c = feed(c, n, ME, i + 10).colony; });
    expect(canFeed(c, KIT_NAMES[0], ME, 'walk-3000')).toBe('full');
  });

  it('survives a save round trip and a merge', () => {
    const kit = KIT_NAMES[0];
    const c = kitFeed(emptyColony(), kit).colony;
    expect(sanitizeColony(c).cats.map((x) => x.name)).toContain(kit);
    expect(mergeColony(c, emptyColony()).cats.map((x) => x.name)).toContain(kit);
  });
});
