import { describe, it, expect } from 'vitest';
import { CAT_NAMES, strayBreed, isStrayName } from '../src/straynames.js';
import { CAT_NAMES as LEGACY } from '../src/straycats.js';
import { TAME_FEEDS, COLONY_MAX, FEEDS_MAX, HEAD_START_MAX, emptyColony, headStartFor, isShy, tamingProgress,
  canFeed, feedCat, catsInArea, tamedCats, settleTaming } from '../src/colony.js';
import { sanitizeColony, mergeColony, unsyncedFeeds, tradeEffect, rewardsDue, COLONY_REWARDS } from '../src/colony.js';

const ME = 'aaaaaaaa-1111', SIB = 'bbbbbbbb-2222';
const feed = (c, name, by, n, extra = {}) =>
  feedCat(c, { name, by, walk: `walk-${1000 + n}`, area: 'park', x: 3, z: -4, head: 0, ...extra }, extra.ctx);
const shyName = CAT_NAMES.find(isShy), boldName = CAT_NAMES.find((n) => !isShy(n));

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
    CAT_NAMES.slice(0, COLONY_MAX).forEach((n, i) => { c = feed(c, n, ME, i).colony; });
    expect(canFeed(c, CAT_NAMES[COLONY_MAX], ME, 'walk-9')).toBe('full');
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
    let c = emptyColony();
    for (let i = 0; i < TAME_FEEDS; i++) c = feed(c, shyName, ME, i, { ctx: { members: 2 } }).colony;
    expect(tamingProgress(c, shyName, { members: 2 })).toMatchObject({ tamed: false, needsSecondFeeder: true });
    expect(canFeed(c, shyName, ME, 'walk-50', { members: 2 })).toBe('waiting');
    expect(feed(c, shyName, SIB, 51, { ctx: { members: 2 } }).tamedNow).toBe(true);
    let solo = emptyColony();
    for (let i = 0; i < TAME_FEEDS; i++) solo = feed(solo, shyName, ME, i).colony;
    expect(tamingProgress(solo, shyName).tamed).toBe(true);
    expect(tamingProgress(solo, shyName, { members: 2 }).tamed).toBe(true); // pairing later never un-tames
  });
  // Review Focus 3: the owner unpaired us after I filled a shy cat's bar alone.
  it('a full shy bar left behind by an unpair can still be tamed by its feeder', () => {
    let c = emptyColony();
    for (let i = 0; i < TAME_FEEDS; i++) c = feed(c, shyName, ME, i, { ctx: { members: 2 } }).colony;
    expect(canFeed(c, shyName, ME, 'walk-50', { members: 2 })).toBe('waiting');
    // now a lone member: the shy rule is off, and the cap must not read 'tamed'
    expect(tamingProgress(c, shyName, { members: 1 })).toMatchObject({ tamed: false, needsSecondFeeder: false, have: TAME_FEEDS });
    expect(canFeed(c, shyName, ME, 'walk-50', { members: 1 })).toBe('ok');
    const r = feed(c, shyName, ME, 50, { ctx: { members: 1 } });
    expect(r).toMatchObject({ result: 'ok', tamedNow: true });
    expect(r.colony.cats[0]).toMatchObject({ tamedBy: ME, tamedWalk: 'walk-1050' });
    expect(canFeed(r.colony, shyName, ME, 'walk-51', { members: 1 })).toBe('tamed');
  });
  it('settleTaming tames a full, untamed, not-waiting bar that I have fed, at my latest feed', () => {
    let c = emptyColony();
    // fed in walk order 1003, 1001, 1005, ... so "latest" is by stamp, not position
    for (const n of [3, 1, 5, 0, 2, 4]) c = feed(c, shyName, ME, n, { ctx: { members: 2 } }).colony;
    const frozen = JSON.stringify(c);
    // still paired: it is waiting for a second feeder, nothing to settle
    expect(settleTaming(c, ME, { members: 2 })).toEqual({ colony: c, settled: [] });
    const s = settleTaming(c, ME, { members: 1 });
    expect(s.settled).toEqual([{ name: shyName, walk: 'walk-1005' }]);
    expect(s.colony.cats[0]).toMatchObject({ name: shyName, tamedBy: ME, tamedWalk: 'walk-1005' });
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
    let c = emptyColony();
    for (let i = 0; i < TAME_FEEDS; i++) c = feed(c, shyName, ME, i, { ctx: { members: 2 } }).colony;
    // fed-this-walk takes precedence over waiting
    expect(canFeed(c, shyName, ME, `walk-${1000 + TAME_FEEDS - 1}`, { members: 2 })).toBe('fed-this-walk');
    expect(canFeed(c, shyName, ME, 'walk-50', { members: 2 })).toBe('waiting');
    expect(canFeed(c, shyName, SIB, 'walk-50', { members: 2 })).toBe('ok');
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
    expect(c.feeds.length).toBe(COLONY_MAX * 2 * TAME_FEEDS + 1); // 145 <= FEEDS_MAX (the +1 is the third feeder)
    expect(new Set(c.feeds.map((f) => `${f.cat}|${f.by}|${f.walk}`)).size).toBe(c.feeds.length);
    expect(c.feeds.every((f) => f.head >= 0 && f.head <= HEAD_START_MAX && Number.isInteger(f.head))).toBe(true);
    expect(c.feeds[0]).toEqual({ cat: CAT_NAMES[0], by: ME, walk: 'walk-0', head: 0 });
    // a third feeder still fits under the total cap, which holds regardless
    const many = [];
    for (let i = 0; i < 40; i++) {
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
    const keys = Array.from({ length: 200 }, (_, i) => `${boldName}|${ME}|walk-${i}`);
    const c = sanitizeColony({ seen: { feedKeys: [...keys, 'nope', `Zeetoo|${ME}|walk-1`, keys[0]],
      tamed: [boldName, boldName, '__proto__'], trades: [4, 4, 'x', 0], day: '2026-10-24' } });
    expect(c.seen.feedKeys).toHaveLength(FEEDS_MAX);
    expect(c.seen.feedKeys).toEqual(keys.slice(200 - FEEDS_MAX));
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
  it('the result is sanitized: the union still respects COLONY_MAX and item filtering', () => {
    const mk = (names, by) => {
      let c = emptyColony();
      names.forEach((n, i) => { c = feed(c, n, by, i).colony; });
      return c;
    };
    const local = mk(CAT_NAMES.slice(0, 8), ME);
    const remote = mk(CAT_NAMES.slice(8, 16), SIB);
    remote.cats[0] = { ...remote.cats[0], wear: 'laser' };
    const m = mergeColony(local, remoteOf(remote), { knownItems: ITEMS });
    expect(m.cats).toHaveLength(COLONY_MAX);
    expect(m.cats.find((k) => k.name === CAT_NAMES[8]).wear).toBe(null);
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
