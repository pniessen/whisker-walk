import { describe, it, expect } from 'vitest';
import { CATALOG, createProgression, isPrizeAccessory, isTradeableAccessory } from '../src/progression.js';
import { HEAD_WEAR } from '../src/foundwear/head.js';
import { FACE_WEAR } from '../src/foundwear/face.js';
import { NECK_WEAR } from '../src/foundwear/neck.js';
import { BODY_WEAR } from '../src/foundwear/body.js';
import { FEET_WEAR } from '../src/foundwear/feet.js';
import { validateFoundWear, foundWearIn, foundRecord } from '../src/foundwear/index.js';
import { withOffWords } from './helpers/offwords.js';

// Found outfits (step 1): one find-only outfit hidden on every walk. These
// are the records' own checks, the catalog entry they make, and its name.

function fakeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
  };
}

describe('found outfits: the records', () => {
  it('the registry passes its own checks', () => {
    const takenIds = Object.keys(CATALOG.accessories).filter((id) => !CATALOG.accessories[id].find);
    expect(validateFoundWear({ head: HEAD_WEAR, face: FACE_WEAR, neck: NECK_WEAR, body: BODY_WEAR, feet: FEET_WEAR },
      { areaIds: Object.keys(CATALOG.areas), takenIds })).toEqual([]);
  });
  it('the checks catch each kind of mistake', () => {
    const ok = { id: 'mosscap', slot: 'head', find: 'woods', emoji: '🌿', name: () => 'Moss Cap' };
    const run = (head) => validateFoundWear({ head, face: [], neck: [], body: [], feet: [] }, { areaIds: ['park', 'woods'], takenIds: ['bell'] });
    expect(run([ok])).toEqual([]);
    expect(run([{ ...ok, id: 'Bad-Id' }])).toHaveLength(1);
    expect(run([ok, ok])).toHaveLength(1);                           // duplicate
    expect(run([{ ...ok, id: 'bell' }])).toHaveLength(1);           // a shop id
    expect(run([{ ...ok, slot: 'neck' }])).toHaveLength(1);          // not this file's slot
    expect(run([{ ...ok, find: 'mars' }])).toHaveLength(1);
    expect(run([{ ...ok, emoji: '' }])).toHaveLength(1);
    expect(run([{ ...ok, name: () => '' }])).toHaveLength(1);
    expect(run(['a', 'b', 'c', 'd', 'e'].map((c) => ({ ...ok, id: `moss${c}aa` })))).toHaveLength(1); // five in the Woods
  });
  it('the Acorn Cap is a find-only prize from the Park', () => {
    const a = CATALOG.accessories.acorncap;
    expect([a.name, a.slot, a.price, a.prize, a.find, a.emoji]).toEqual(['Acorn Cap', 'head', 0, true, 'park', '🌰']);
    expect(isPrizeAccessory('acorncap')).toBe(true);
    expect(isTradeableAccessory('acorncap')).toBe(false);
    expect(Object.keys(CATALOG.accessories).at(-1)).toBe('acorncap');
  });
  it('the name is read when asked, through the phrase table', () => {
    expect(Object.getOwnPropertyDescriptor(CATALOG.accessories.acorncap, 'name').get).toBeTypeOf('function');
    expect(withOffWords(() => CATALOG.accessories.acorncap.name)).toBe('Acorn Cap');
  });
  it('cannot be bought, even with points to spare', () => {
    const p = createProgression(fakeStorage()); p.addPoints(999);
    expect(p.canBuy('accessories', 'acorncap')).toBe(false);
    expect(p.buy('accessories', 'acorncap')).toBe(false);
  });
  it('foundWearIn lists an area\'s records in order, and nothing for junk', () => {
    expect(foundWearIn('park').map((r) => r.id)).toEqual(['acorncap']);
    for (const id of ['woods', 'den', '__proto__', 'toString', null]) expect(foundWearIn(id)).toEqual([]);
    expect(foundRecord('acorncap').find).toBe('park');
    expect(foundRecord('bell')).toBe(null);
  });
});
