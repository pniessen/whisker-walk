import { describe, it, expect } from 'vitest';
import { createProgression } from '../src/progression.js';

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    dump: () => Object.fromEntries(map),
  };
}
const SAVE_KEY = 'whisker-walk-save';
const look = { coat: 'black', marks: 'white', pattern: 'socks', fur: 'long', eyes: 'gold', size: 0.9 };
const withSave = (patch) => createProgression(fakeStorage({ [SAVE_KEY]: JSON.stringify({ ...createProgression(fakeStorage()).state, ...patch }) }));

describe('custom cats in the save', () => {
  it('a new save has none and walks a ready-made cat', () => {
    const p = createProgression(fakeStorage());
    expect(p.state.customCats).toEqual([]);
    expect(p.state.equipped.custom).toBe(null);
  });
  it('make, equip, reload: the cat and the choice survive', () => {
    const storage = fakeStorage();
    const p = createProgression(storage);
    const id = p.createCustomCat({ name: 'Ember', personality: 'pouncer', look });
    expect(id).toBe('mine1');
    expect(p.equipCustom(id)).toBe(true);
    const again = createProgression(storage);
    expect(again.state.customCats).toEqual([{ id: 'mine1', name: 'Ember', personality: 'pouncer', look }]);
    expect(again.state.equipped.custom).toBe('mine1');
    expect(again.state.equipped.cat).toBe('tabby');
  });
  it('refuses a fourth cat, a bad name and a family personality', () => {
    const p = createProgression(fakeStorage());
    for (const n of ['Ember', 'Ash', 'Fern']) expect(p.createCustomCat({ name: n, personality: 'steady', look })).not.toBe(null);
    expect(p.createCustomCat({ name: 'Moss', personality: 'steady', look })).toBe(null);
    const q = createProgression(fakeStorage());
    expect(q.createCustomCat({ name: '1x', personality: 'steady', look })).toBe(null);
    expect(q.createCustomCat({ name: 'Moss', personality: 'bird', look })).toBe(null);
    expect(q.state.customCats).toEqual([]);
  });
  it('editing changes looks, name and personality but never the outfit', () => {
    const p = createProgression(fakeStorage());
    p.equipAccessory('bell');
    const id = p.createCustomCat({ name: 'Ember', personality: 'keenNose', look });
    p.equipCustom(id);
    const before = { ...p.state.equipped };
    expect(p.updateCustomCat(id, { name: 'Ember Star', personality: 'napper', look: { ...look, coat: 'cream' } })).toBe(true);
    expect(p.state.customCats[0]).toMatchObject({ name: 'Ember Star', personality: 'napper' });
    expect(p.state.equipped).toEqual(before);
    expect(p.updateCustomCat('mine2', { name: 'Ash', personality: 'napper', look })).toBe(false);
  });
  it('choosing a ready-made cat clears the custom choice and keeps equipped.cat a preset', () => {
    const p = createProgression(fakeStorage());
    p.equipCustom(p.createCustomCat({ name: 'Ember', personality: 'keenNose', look }));
    p.equipCat('tabby');
    expect(p.state.equipped.custom).toBe(null);
    expect(p.equipCustom('mine3')).toBe(false);
  });
});

describe('malformed saves', () => {
  it('a dangling or junk equipped.custom loads as null', () => {
    expect(withSave({ customCats: [], equipped: { cat: 'tabby', custom: 'mine2' } }).state.equipped.custom).toBe(null);
    expect(withSave({ customCats: 'x', equipped: { cat: 'tabby', custom: { a: 1 } } }).state.equipped.custom).toBe(null);
  });
  it('a custom id is never accepted as equipped.cat', () => {
    expect(withSave({ customCats: [{ id: 'mine1', name: 'Ember', personality: 'chaser', look }], equipped: { cat: 'mine1' } }).state.equipped.cat).toBe('tabby');
  });
  it('a bad field is repaired, the cat kept', () => {
    const s = withSave({ customCats: [{ id: 'mine1', name: '!!', personality: 'zeetoo', look: { size: 40 } }] }).state;
    expect(s.customCats[0]).toMatchObject({ name: 'My Cat', personality: 'keenNose' });
    expect(s.customCats[0].look.size).toBe(1.15);
  });
  it('the Rosa farewell with a custom cat equipped falls back to the named preset', () => {
    const raw = { ...createProgression(fakeStorage()).state, retired: [], unlocked: { cats: ['tabby', 'rosa'], accessories: [], areas: ['neighborhood'] },
      equipped: { cat: 'rosa', custom: 'mine1' }, customCats: [{ id: 'mine1', name: 'Ember', personality: 'chaser', look }] };
    const p = createProgression(fakeStorage({ [SAVE_KEY]: JSON.stringify(raw) }));
    expect(p.takeFarewell()).toContain('Tabby will walk with you');
    expect(p.state.equipped.custom).toBe(null);
    expect(p.state.customCats).toHaveLength(1);
  });
});

describe('cloud restore', () => {
  const mine = [{ id: 'mine1', name: 'Ember', personality: 'chaser', look }];
  it('an older-build payload (no customCats key) keeps this phone\'s cats', () => {
    const p = createProgression(fakeStorage());
    p.equipCustom(p.createCustomCat({ name: 'Ember', personality: 'chaser', look }));
    const { customCats, ...older } = { ...p.state, points: 77 };
    p.replaceFromPayload(older);
    expect(p.state.points).toBe(77);
    expect(p.state.customCats).toEqual(mine);
    expect(p.state.equipped.custom).toBe(null);
  });
  it('a payload with the key is a normal restore', () => {
    const p = createProgression(fakeStorage());
    p.createCustomCat({ name: 'Ember', personality: 'chaser', look });
    p.replaceFromPayload({ ...p.state, customCats: [] });
    expect(p.state.customCats).toEqual([]);
  });
});
