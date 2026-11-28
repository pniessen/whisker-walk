// Dress up's "Remove my other cats": the state change, never none, the cloud merge, both word sets.
import { describe, it, expect, afterEach } from 'vitest';
import { createProgression, sanitizeSave, CATALOG, freshStateKeys } from '../src/progression.js';
import { mergeSaves, trimBase, useSaveTools } from '../src/catmerge.js';
import { mergeColony } from '../src/colony.js';
import { mergeUsage } from '../src/usage.js';
import { sanitizeMarks, MARK_AREAS } from '../src/marks.js';
import { CUSTOM_IDS, CUSTOM_BASE, CUSTOM_MAX } from '../src/customcats.js';
import { OUTFIT_IDS, sameWear } from '../src/outfits.js';
import { phrase } from '../src/clanphrases.js';
import { addWordSet, removeWordSet, setSeriesMode, seriesModes, SERIES_ON } from '../src/wordset.js';
import * as off from '../src/offclanwords.js';
import { memoryStorage } from './helpers/storage.js';

useSaveTools({ CATALOG, sanitizeSave, mergeColony, mergeUsage, sanitizeMarks, MARK_AREAS, CUSTOM_IDS, CUSTOM_BASE, CUSTOM_MAX, OUTFIT_IDS, sameWear });
const look = { coat: 'black', marks: 'white', pattern: 'socks', fur: 'long', eyes: 'gold', size: 0.9 };
const made = (names) => {
  const p = createProgression(memoryStorage({}, { removeItem: true, expose: 'm' }));
  for (const n of names) p.createCustomCat({ name: n, personality: 'steady', look });
  return p;
};
afterEach(() => { setSeriesMode(SERIES_ON); for (const id of seriesModes()) if (id !== 'on' && id !== 'off') removeWordSet(id); });

describe('removeOtherCats', () => {
  it('keeps the cat she walks as and drops the rest, their scars and her sleepers', () => {
    const p = made(['Ember', 'Ash', 'Fern']);
    p.equipCustom('mine3');
    p.state.sleepingCats.push({ id: 'mine1', name: 'Zed', personality: 'steady', look });
    p.state.scars.mine1 = [{ left: 2 }];
    expect(p.removeOtherCats()).toBe(3);
    expect(p.state.customCats.map((c) => c.id)).toEqual(['mine3']);
    expect(p.state.sleepingCats).toEqual([]);
    expect(p.state.scars.mine1).toBeUndefined();
    expect(p.state.equipped.custom).toBe('mine3');
  });
  it('never leaves her without a cat: a ready-made cat stays when none of hers is worn', () => {
    const p = made(['Ember']);
    expect(p.removeOtherCats()).toBe(1);
    expect(p.state.customCats).toEqual([]);
    expect(typeof p.state.equipped.cat).toBe('string');
    expect(p.removeOtherCats()).toBe(0);
  });
  it('adds no save key', () => {
    expect(freshStateKeys()).not.toContain('removedCats');
  });
});

describe('the cloud merge does not bring removed cats back', () => {
  const cat = (id, name) => ({ id, name, personality: 'steady', look });
  const save = (cats, extra = {}) => sanitizeSave({ version: 4, customCats: cats, ...extra });
  const A = [cat('mine1', 'Ember'), cat('mine2', 'Ash'), cat('mine3', 'Fern')];
  it('a removal here is kept when the cloud still has the old cats', () => {
    const base = trimBase(save(A));
    const local = save([A[1]], { equipped: { custom: 'mine2' } });
    const { save: out } = mergeSaves({ local, cloud: save(A), base });
    expect(out.customCats.map((c) => c.id)).toEqual(['mine2']);
  });
  it('a removal on the other device is kept here too', () => {
    const base = trimBase(save(A));
    const { save: out } = mergeSaves({ local: save(A), cloud: save([A[1]]), base });
    expect(out.customCats.map((c) => c.id)).toEqual(['mine2']);
  });
  it('a cat made on the other device since the base still arrives', () => {
    const base = trimBase(save([A[0]]));
    const { save: out } = mergeSaves({ local: save([]), cloud: save([A[0], A[1]]), base });
    expect(out.customCats.map((c) => c.id)).toEqual(['mine2']);
  });
  it('sleeping cats removed here do not wake from the cloud', () => {
    const sleeper = cat('mine1', 'Zed');
    const base = trimBase(save([], { sleepingCats: [sleeper] }));
    const { save: out } = mergeSaves({ local: save([]), cloud: save([], { sleepingCats: [sleeper] }), base });
    expect(out.customCats).toEqual([]);
    expect(out.sleepingCats).toEqual([]);
  });
  it('no base (a new device) or a wiped cloud: nothing is lost', () => {
    expect(mergeSaves({ local: save(A), cloud: save([]), base: null }).save.customCats).toHaveLength(3);
    expect(mergeSaves({ local: save(A), cloud: {}, base: trimBase(save(A)) }).save.customCats).toHaveLength(3);
    expect(mergeSaves({ local: save([]), cloud: save(A), base: null }).save.customCats).toHaveLength(3);
  });
});

describe('the words', () => {
  it('read plainly in the family set and the everyday set', () => {
    const lines = () => [phrase('cats.removeOthers'), phrase('cats.removeAsk', 2), phrase('cats.removeAsk', 1), phrase('cats.removeKeep', 'Ash'), phrase('cats.removeKeepNone'), phrase('cats.removeYes')];
    const on = lines();
    expect(on.join(' ')).toMatch(/cannot be undone/);
    setSeriesMode('off');
    expect(lines()).toEqual(on);
  });
});
