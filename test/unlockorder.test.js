// World map step 1 (docs/superpowers/specs/2026-11-19-world-map-design.md,
// decision 5): the unlock order follows the map. The Park opens the Farm, the
// Fairground and the Docks; the Docks open the Seaside. Fresh saves only here.
import { describe, it, expect } from 'vitest';
import { createProgression, CATALOG } from '../src/progression.js';
import { nextThing } from '../src/ui/nextthing.js';
import { placeWhyLine } from '../src/ui/dressingroom.js';
import { areaOffer } from '../src/areaoffer.js';

const KEY = 'whisker-walk-save';
function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
  };
}
// A stored v4 save run through createProgression, as test/nextthing.test.js's save() does.
const save = (fields) => createProgression(fakeStorage({ [KEY]: JSON.stringify({ version: 4, ...fields }) })).state;
const allWear = Object.keys(CATALOG.accessories);
const parkSave = (edition) => save({
  edition,
  walks: { neighborhood: 3, woods: 1, park: 1 },
  unlocked: { accessories: allWear, areas: ['neighborhood', 'woods', 'park'] },
  area: 'park',
  clanPick: { mine: 'woods' },
});
const docksSave = (edition) => save({
  edition,
  walks: { neighborhood: 3, woods: 1, park: 2, docks: 1 },
  unlocked: { accessories: allWear, areas: ['neighborhood', 'woods', 'park', 'docks'] },
  area: 'docks',
  clanPick: { mine: 'woods' },
  keptOffers: [],
});
const storageWith = (fields) => fakeStorage({ [KEY]: JSON.stringify({ version: 4, ...fields }) });
const load = (fields) => createProgression(storageWith(fields));
const freshPlain = (edition) => ({ edition, points: 0, walks: {}, unlocked: { areas: ['neighborhood'] } });

describe('the new unlock order (world map decision 5)', () => {
  it('the Docks open after 2 Park explores, for 100', () => {
    expect(CATALOG.areas.docks).toEqual({ name: 'The Old Docks', price: 100, requires: { area: 'park', walks: 2 } });
    const p = createProgression(fakeStorage());
    p.addPoints(99);
    p.completeWalk('park');
    expect(p.canBuy('areas', 'docks')).toBe(false); // one explore is not two
    p.completeWalk('park');
    expect(p.canBuy('areas', 'docks')).toBe(false); // 99 is not 100
    p.addPoints(1);
    expect(p.canBuy('areas', 'docks')).toBe(true);
  });
  it('the Seaside opens after 2 Docks explores, for 200, and no longer after the Park', () => {
    expect(CATALOG.areas.seaside).toEqual({ name: 'Seaside', price: 200, requires: { area: 'docks', walks: 2 } });
    const p = createProgression(fakeStorage());
    p.addPoints(9999);
    p.completeWalk('park'); p.completeWalk('park');
    expect(p.canBuy('areas', 'seaside')).toBe(false);
    p.completeWalk('docks'); p.completeWalk('docks');
    expect(p.canBuy('areas', 'seaside')).toBe(true);
    expect(p.buy('areas', 'seaside')).toBe(true);
    expect(p.state.points).toBe(9999 - 200);
  });
  it("the Park's home line names the Farm, the Fairground and the Docks", () => {
    // walks.park 1, standing in the Park, both editions
    for (const edition of ['canon', 'legacy']) {
      expect(nextThing(parkSave(edition))).toMatchObject({ rule: 7, id: 'home.opens-three',
        text: 'Explore here again to open Appletree Farm, the Fairground and the Old Docks!' });
    }
  });
  it("the Docks' home line names the Seaside", () => {
    expect(nextThing(docksSave('canon'))).toMatchObject({ rule: 7, id: 'home.opens', text: 'Explore here again and Seaside opens!' });
  });
  it('a locked Seaside says it waits for the Docks', () => {
    expect(placeWhyLine(freshPlain('legacy'), CATALOG, 'seaside')).toBe('opens after you explore The Old Docks 2 times · 0/2');
    expect(placeWhyLine(freshPlain('legacy'), CATALOG, 'docks')).toBe('opens after you explore City Park 2 times · 0/2');
  });
});

// A save whose Seaside was open-to-buy before this change (2 Park explores,
// not bought) keeps that offer whole: after the Park, for 100.
describe('the kept offer', () => {
  it('a save whose Seaside was open-to-buy keeps the old offer: after the Park, for 100', () => {
    const p = load({ points: 150, walks: { neighborhood: 3, park: 2 }, unlocked: { areas: ['neighborhood', 'park'] } });
    expect(p.state.keptOffers).toEqual(['seaside']);
    expect(areaOffer(p.state, CATALOG, 'seaside')).toEqual({ requires: { area: 'park', walks: 2 }, price: 100 });
    expect(p.canBuy('areas', 'seaside')).toBe(true);
    expect(p.buy('areas', 'seaside')).toBe(true);
    expect(p.state.points).toBe(50);
  });
  it('a save with one Park explore keeps nothing: the Seaside waits for the Docks', () => {
    const p = load({ walks: { neighborhood: 3, park: 1 }, unlocked: { areas: ['neighborhood', 'park'] } });
    expect(p.state.keptOffers).toEqual([]);
    expect(areaOffer(p.state, CATALOG, 'seaside')).toEqual({ requires: { area: 'docks', walks: 2 }, price: 200 });
  });
  it('a new save keeps nothing, even after 2 Park explores', () => {
    const s = fakeStorage();
    const p = createProgression(s);
    p.addPoints(500); p.completeWalk('park'); p.completeWalk('park');
    expect(p.canBuy('areas', 'seaside')).toBe(false);
    expect(createProgression(s).state.keptOffers).toEqual([]); // and a reload does not grant it
  });
  it('the kept offer survives a reload, and is gone once the Seaside is bought', () => {
    const s = storageWith({ points: 150, walks: { park: 2 }, unlocked: { areas: ['neighborhood', 'park'] } });
    createProgression(s).addPoints(0); // any save() writes the field
    const p = createProgression(s);
    expect(p.state.keptOffers).toEqual(['seaside']);
    p.buy('areas', 'seaside');
    expect(createProgression(s).state.keptOffers).toEqual([]);
  });
  it('a save that owns the Seaside but not the Docks keeps the Seaside; the Docks open under the new rule', () => {
    const p = load({ points: 100, walks: { park: 3, seaside: 2 }, unlocked: { areas: ['neighborhood', 'park', 'seaside'] }, area: 'seaside' });
    expect(p.isUnlocked('areas', 'seaside')).toBe(true);
    expect(p.state.area).toBe('seaside');
    expect(p.state.keptOffers).toEqual([]);
    expect(p.canBuy('areas', 'docks')).toBe(true);
  });
  it('a save with no keptOffers is read as from before (an old cached build wrote it)', () => {
    const p = load({ walks: { park: 2 }, unlocked: { areas: ['neighborhood', 'park'] } });
    expect(p.state.keptOffers).toEqual(['seaside']);
  });
  it("Load from cloud works the kept offer out from the payload's walks, not the device's", () => {
    const p = createProgression(fakeStorage());
    p.replaceFromPayload({ version: 4, walks: { park: 2 }, unlocked: { areas: ['neighborhood', 'park'] } });
    expect(p.state.keptOffers).toEqual(['seaside']);
    p.replaceFromPayload({ version: 4, walks: { park: 1 }, unlocked: { areas: ['neighborhood', 'park'] } });
    expect(p.state.keptOffers).toEqual([]);
  });
  it('junk in keptOffers is dropped', () => {
    expect(load({ keptOffers: ['__proto__', 'docks', 'woods', 'seaside', 'seaside'], walks: {}, unlocked: { areas: ['neighborhood'] } }).state.keptOffers).toEqual(['seaside']);
    expect(load({ keptOffers: 'seaside', walks: { park: 0 } }).state.keptOffers).toEqual([]); // not an array: read as from before; the gate is not met
    expect(load({ keptOffers: ['seaside'], unlocked: { areas: ['neighborhood', 'seaside'] } }).state.keptOffers).toEqual([]); // owned
  });
  it('areaOffer: an unknown id, a plain state, and a catalog entry with no gate', () => {
    expect(areaOffer({}, CATALOG, 'nowhere')).toBeNull();
    expect(areaOffer({}, CATALOG, '__proto__')).toBeNull();
    expect(areaOffer({}, CATALOG, 'seaside')).toEqual({ requires: { area: 'docks', walks: 2 }, price: 200 });
    expect(areaOffer({ keptOffers: ['farm'] }, CATALOG, 'farm')).toEqual({ requires: { area: 'park', walks: 2 }, price: 75 }); // not a kept id: the catalog's
    expect(areaOffer({}, CATALOG, 'neighborhood')).toEqual({ requires: null, price: 0 });
  });
});
