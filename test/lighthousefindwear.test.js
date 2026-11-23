import { describe, it, expect } from 'vitest';
import { planFind, pickFindItem, findsAgreed } from '../src/foundwear/rules.js';
import { FIND_SPOTS, FIND_KEY, spotsIn, findSpotsKey } from '../src/foundwear/spots/index.js';
import { foundWearIn, foundRecord } from '../src/foundwear/index.js';
import { CATALOG } from '../src/progression.js';
import { buildHat } from '../src/cat/hats.js';
import { setLighthouse } from '../src/lighthouseflag.js';

// Lighthouse milestone 4: the keeper's cap and its twelve spots. Where every spot stands is proved against the
// built place by test/foundspots.test.js; this file holds the find's rules (a co-walk agrees on the spot by the
// seed, as every place's find does) and the cap itself.

describe('the keeper\'s cap and the twelve spots', () => {
  it('twelve spots, ids fw-lighthouse-1..12, and the find key moves with them', () => {
    expect(spotsIn('lighthouse').map((s) => s.id)).toEqual(Array.from({ length: 12 }, (_, i) => `fw-lighthouse-${i + 1}`));
    const without = { ...FIND_SPOTS };
    delete without.lighthouse;
    expect(findSpotsKey(without)).not.toBe(FIND_KEY);
  });
  it('a solo walk plans one spot from its seed, the same on every device, with the cap before the pouch', () => {
    for (const seed of [1, 7, 20261122, 4294967295]) {
      const a = planFind({ areaId: 'lighthouse', seed });
      const b = planFind({ areaId: 'lighthouse', seed });
      expect(a).toEqual(b);
      expect(spotsIn('lighthouse')).toContain(a.spot);
      expect(pickFindItem(foundWearIn('lighthouse'), [], a.roll)).toEqual({ kind: 'wear', id: 'keepercap' });
      expect(pickFindItem(foundWearIn('lighthouse'), ['keepercap'], a.roll)).toEqual({ kind: 'pouch' });
    }
  });
  it('a room walk finds only when every device holds the same spots (findsAgreed), then agrees on the spot', () => {
    const roster = [{ finds: FIND_KEY }, { finds: FIND_KEY }];
    expect(findsAgreed(roster, FIND_KEY)).toBe(true);
    const a = planFind({ areaId: 'lighthouse', seed: 99, roster });
    expect(a).not.toBeNull();
    expect(a).toEqual(planFind({ areaId: 'lighthouse', seed: 99, roster }));
    expect(planFind({ areaId: 'lighthouse', seed: 99, roster: [{ finds: FIND_KEY }, { finds: FIND_KEY ^ 1 }] })).toBeNull();
  });
  it('no find in the guided first walk, and the flag changes nothing about it', () => {
    setLighthouse(true);
    try {
      expect(planFind({ areaId: 'lighthouse', seed: 5, lessonKind: 'first' })).toBeNull();
      expect(planFind({ areaId: 'lighthouse', seed: 5 })).not.toBeNull();
    } finally { setLighthouse(null); }
  });
  it('the cap is a head piece found only at Lighthouse Point, never bought, and it draws as a cap in navy', () => {
    const rec = foundRecord('keepercap');
    expect(rec).toMatchObject({ slot: 'head', find: 'lighthouse' });
    expect(CATALOG.accessories.keepercap).toMatchObject({ slot: 'head', price: 0, prize: true, find: 'lighthouse' });
    const hat = buildHat('keepercap');
    expect(hat).toBeTruthy();
    const tris = (g) => { let n = 0; g.traverse((o) => { if (o.isMesh) n += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; }); return n; };
    expect(tris(hat)).toBe(tris(buildHat('tradercap'))); // the trader's cap's shape, its own colours
  });
});
