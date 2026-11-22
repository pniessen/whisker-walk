// World map step 1 (docs/superpowers/specs/2026-11-19-world-map-design.md,
// decision 5): the unlock order follows the map. The Park opens the Farm, the
// Fairground and the Docks; the Docks open the Seaside. Fresh saves only here.
import { describe, it, expect } from 'vitest';
import { createProgression, CATALOG } from '../src/progression.js';
import { nextThing } from '../src/ui/nextthing.js';
import { placeWhyLine, buildDressingModel } from '../src/ui/dressingroom.js';
import { createDressingRoom } from '../src/ui/dressingroomview.js';
import { postStatus } from '../src/bordercross.js';
import { areaOffer } from '../src/areaoffer.js';
import { memoryStorage as fakeStorage } from './helpers/storage.js';

const KEY = 'whisker-walk-save';
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
    expect(nextThing(docksSave('canon'))).toMatchObject({ rule: 7, id: 'home.opens', text: 'Explore here again to open Seaside!' });
  });
  it('a locked Seaside says it waits for the Docks', () => {
    expect(placeWhyLine(freshPlain('legacy'), CATALOG, 'seaside')).toBe('opens after you explore the Old Docks 2 times · 0/2');
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
  it('buying the Seaside drops its kept mark at once, so no stale mark is left in the save', () => {
    const s = storageWith({ points: 150, walks: { park: 2 }, unlocked: { areas: ['neighborhood', 'park'] } });
    const p = createProgression(s);
    expect(p.state.keptOffers).toEqual(['seaside']);
    expect(p.buy('areas', 'seaside')).toBe(true);
    expect(p.state.keptOffers).toEqual([]);
    expect(JSON.parse(s.getItem(KEY)).keptOffers).toEqual([]); // as written, before any reload cleans it
  });
  it('buying another place leaves the kept Seaside alone', () => {
    const p = load({ points: 150, walks: { park: 2 }, unlocked: { areas: ['neighborhood', 'park'] } });
    expect(p.buy('areas', 'farm')).toBe(true);
    expect(p.state.keptOffers).toEqual(['seaside']);
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

// The kept offer is read through areaOffer by every screen that names a
// place's gate or price, so a kept Seaside says "100, after the Park" alike.
describe('a kept Seaside reads the same on every screen', () => {
  const keptFields = (points) => ({
    points, edition: 'legacy', walks: { neighborhood: 3, park: 2, docks: 1 },
    unlocked: { accessories: allWear, areas: ['neighborhood', 'park', 'docks'] }, area: 'docks',
  });
  const kept = load(keptFields(40)).state;
  it('the save keeps the old offer, with 40 🐾', () => {
    expect(kept.keptOffers).toEqual(['seaside']);
    expect(kept.points).toBe(40);
  });
  it('the place card and placeWhyLine: open after the Park, 100, 60 to go', () => {
    const card = buildDressingModel(kept, CATALOG).places.find((p) => p.id === 'seaside');
    expect(card).toMatchObject({ locked: false, price: 100, canBuy: false, lockLine: '100 🐾 — keep exploring!' });
    expect(placeWhyLine(kept, CATALOG, 'seaside')).toBe('60 more 🐾 to go');
  });
  it('with 100 🐾 the card can buy it, for 100', () => {
    const card = buildDressingModel(load(keptFields(100)).state, CATALOG).places.find((p) => p.id === 'seaside');
    expect(card).toMatchObject({ locked: false, price: 100, canBuy: true, lockLine: 'Unlock — 100 🐾' });
  });
  it('the home line at the Docks does not say the Seaside opens after one more explore', () => {
    expect(nextThing(kept).text).not.toContain('Seaside');
  });
  it('a post that names the Seaside reads the kept price, not the new one', () => {
    // the catalog's gate would count this Docks explore (1 + 1) and ask 200
    expect(postStatus({ to: 'seaside' }, kept, CATALOG, 'docks')).toMatchObject({ kind: 'locked', line: '🔒 Seaside needs 100 🐾' });
  });
  it('the Get it? card asks for the kept price', () => {
    const progression = load(keptFields(150));
    const asks = [];
    const dr = createDressingRoom({ progression, sync: { autoSync() {} }, thumbs: {}, confirmSpend: (o) => { asks.push(o); return true; } });
    const click = (dataset) => ({ target: { closest: () => ({ dataset }) } });
    dr.handleClick(click({ drPlaceBuy: 'seaside' }));
    expect(asks[0]).toMatchObject({ text: 'Open Seaside for 100 🐾?', note: 'You’ll have 50 🐾 left.' });
  });
  it('a save without the kept mark still sees the new order on every screen', () => {
    const plain = load({ ...keptFields(40), keptOffers: [] }).state;
    expect(plain.keptOffers).toEqual([]);
    expect(buildDressingModel(plain, CATALOG).places.find((p) => p.id === 'seaside')).toMatchObject({ locked: true, price: 200 });
    expect(placeWhyLine(plain, CATALOG, 'seaside')).toBe('opens after you explore the Old Docks 2 times · 1/2');
    expect(postStatus({ to: 'seaside' }, plain, CATALOG, 'docks')).toMatchObject({ kind: 'locked', line: '🔒 Seaside needs 200 🐾' });
  });
});
