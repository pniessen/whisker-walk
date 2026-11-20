import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../src/rng.js';
import { FIND_KEY, spotsIn } from '../src/foundwear/spots/index.js';
import {
  FIND_SALT, FIND_LOG_KEY, PICKUP, TWINKLE_RANGE, CHIME_RANGE, CHIME_REARM, NOSE_RANGE, SPAWN_CLEAR,
  POUCH_COINS, HEN_SLOTS, planFind, findsAgreed, pickFindItem, catReaches, partnerReaches, createChime, canWearNow,
} from '../src/foundwear/rules.js';

const roster = (...keys) => keys.map((finds, i) => ({ playerId: `p${i}`, finds }));

describe('found outfits: the rules', () => {
  it('the spec values, verbatim', () => {
    expect(FIND_SALT).toBe(0x5eedf1d0);
    expect(FIND_LOG_KEY).toBe('wear-find');
    expect(PICKUP).toEqual({ r: 1.0, dy: 0.9 });
    expect([TWINKLE_RANGE, CHIME_RANGE, CHIME_REARM, NOSE_RANGE, SPAWN_CLEAR, POUCH_COINS]).toEqual([20, 6, 10, 20, 15, 5]);
    expect(HEN_SLOTS).toEqual(['head', 'face', 'neck', 'collar']);
  });
  it('the same seed picks the same spot and roll, twice', () => {
    const a = planFind({ areaId: 'park', seed: 12345 }), b = planFind({ areaId: 'park', seed: 12345 });
    expect(a).toEqual(b); expect(spotsIn('park')).toContain(a.spot);
  });
  it('the spot comes from the salted seed only: two draws, in order', () => {
    const r = mulberry32((777 ^ FIND_SALT) >>> 0); const list = spotsIn('park');
    const want = list[Math.floor(r() * list.length)]; const roll = r();
    expect(planFind({ areaId: 'park', seed: 777 })).toEqual({ areaId: 'park', spot: want, roll });
  });
  it('over many seeds every spot of the area gets picked', () => {
    const seen = new Set(); for (let s = 0; s < 4000; s++) seen.add(planFind({ areaId: 'woods', seed: s }).spot.id);
    expect(seen.size).toBe(spotsIn('woods').length);
  });
  it('no find in the den, on the guided first walk, in an area with no spots, or without a seed', () => {
    expect(planFind({ areaId: 'den', isDen: true, seed: 1 })).toBe(null);
    expect(planFind({ areaId: 'park', lessonKind: 'first', seed: 1 })).toBe(null);
    expect(planFind({ areaId: 'park', lessonKind: 'camp', seed: 1 })).not.toBe(null); // the first camp walk is an ordinary walk
    expect(planFind({ areaId: 'not-an-area', seed: 1 })).toBe(null);
    for (const seed of [undefined, NaN, '7']) expect(planFind({ areaId: 'park', seed })).toBe(null);
  });
  it('a room walk has a find only when every member carries the same key', () => {
    expect(planFind({ areaId: 'park', seed: 9, roster: roster(FIND_KEY, FIND_KEY) })).not.toBe(null);
    expect(planFind({ areaId: 'park', seed: 9, roster: roster(FIND_KEY, undefined) })).toBe(null);   // an older build
    expect(planFind({ areaId: 'park', seed: 9, roster: roster(FIND_KEY, FIND_KEY ^ 1) })).toBe(null); // different spots
    expect(planFind({ areaId: 'park', seed: 9, roster: [] })).toBe(null);                            // nobody listed yet
    expect(findsAgreed([null, { finds: FIND_KEY }])).toBe(false);
  });
  it('both partners pick the same spot from the room seed, whatever they own', () => {
    const r = roster(FIND_KEY, FIND_KEY);
    expect(planFind({ areaId: 'park', seed: 4242, roster: r }).spot).toBe(planFind({ areaId: 'park', seed: 4242, roster: r }).spot);
  });
  it('pickFindItem: the first not-owned from the seed\'s start, then the pouch', () => {
    const recs = ['a', 'b', 'c', 'd'].map((id) => ({ id }));
    expect(pickFindItem(recs, [], 0)).toEqual({ kind: 'wear', id: 'a' });
    expect(pickFindItem(recs, [], 0.6)).toEqual({ kind: 'wear', id: 'c' });
    expect(pickFindItem(recs, new Set(['c']), 0.6)).toEqual({ kind: 'wear', id: 'd' });
    expect(pickFindItem(recs, ['d', 'c'], 0.6)).toEqual({ kind: 'wear', id: 'a' });   // wraps round
    expect(pickFindItem(recs, ['a', 'b', 'c', 'd'], 0.3)).toEqual({ kind: 'pouch' });
    expect(pickFindItem([], [], 0.3)).toEqual({ kind: 'pouch' });                     // spots, no outfits yet (the Woods in step 1)
    expect(pickFindItem(recs, [], 0.9999999)).toEqual({ kind: 'wear', id: 'd' });
  });
  it('reach: the golden mouse\'s window for her, flat for a partner', () => {
    const s = { x: 0, z: 0, y: 1.9 };
    expect(catReaches(s, 1.9, 0.9, 0, 1.9)).toBe(true);
    expect(catReaches(s, 1.9, 1.0, 0, 1.9)).toBe(false);
    expect(catReaches(s, 1.9, 0, 0, 0)).toBe(false);   // under the perch
    expect(partnerReaches(s, 0.5, 0.5)).toBe(true);    // under the perch counts for a partner (Claude's call)
    expect(partnerReaches(s, 1, 0.2)).toBe(false);
  });
  it('the chime: once on coming within 6 m, again only after leaving 10 m', () => {
    const c = createChime();
    expect([25, 7, 5.9, 3, 8, 5, 11, 5.5].map((d) => c.step(d))).toEqual([false, false, true, false, false, false, false, true]);
  });
  it('Hagrid wears head, face, neck and collar only; every cat wears everything', () => {
    for (const slot of ['head', 'face', 'neck', 'collar']) expect(canWearNow('hagrid', slot)).toBe(true);
    for (const slot of ['body', 'back', 'feet']) expect(canWearNow('hagrid', slot)).toBe(false);
    for (const slot of ['body', 'feet']) expect(canWearNow('tabby', slot)).toBe(true);
  });
});
