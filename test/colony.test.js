import { describe, it, expect } from 'vitest';
import { CAT_NAMES, strayBreed, isStrayName } from '../src/straynames.js';
import { CAT_NAMES as LEGACY } from '../src/straycats.js';
import { TAME_FEEDS, COLONY_MAX, emptyColony, headStartFor, isShy, tamingProgress,
  canFeed, feedCat, catsInArea, tamedCats } from '../src/colony.js';

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
  it('the waiting player is told waiting, but the unfed sibling is told ok', () => {
    let c = emptyColony();
    for (let i = 0; i < TAME_FEEDS; i++) c = feed(c, shyName, ME, i, { ctx: { members: 2 } }).colony;
    // fed-this-walk takes precedence over waiting
    expect(canFeed(c, shyName, ME, `walk-${1000 + TAME_FEEDS - 1}`, { members: 2 })).toBe('fed-this-walk');
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
    expect(r.result).not.toBe('ok');
    expect(r.colony.cats).toEqual([]);
  });
});
