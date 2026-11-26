// The Reef, milestone R3: three golden mice (one on the sand behind the boat, two at float height in bubble columns) and the Pearl Collar's four spots. The
// totals stay 57 (Clan) and 33 (everyday): the R0 stubs already counted the three ids.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { stubCanvasDocument } from './helpers/canvas.js';
import { memoryStorage } from './helpers/storage.js';
import { GOLD_MICE, KNOWN_GOLD, GOLD_TOTAL, goldForEdition } from '../src/goldmice.js';
import { CATALOG, createProgression } from '../src/progression.js';
import { spotsIn, FIND_KEY } from '../src/foundwear/spots/index.js';
import { PICKUP } from '../src/foundwear/rules.js';
import { placeFloat } from '../src/placephysics.js';
import { isWalkableAt } from '../src/player.js';
import { floodFrom } from './helpers/flood.js';

stubCanvasDocument();
const { build } = await import('../src/world/reef.js');
const Q = await import('../src/world/reeffindsplan.js');
const P = await import('../src/world/reefplan.js');

const area = build(new THREE.Scene());
const GOLD = GOLD_MICE.reef;
const near = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const flood = floodFrom(area, area.spawn, (x, z) => isWalkableAt(area, x, z));

describe('three golden mice', () => {
  it('ids gm-reef-1..3, valid, known, unique, and the plan holds the same three', () => {
    expect(GOLD.map((m) => m.id)).toEqual(['gm-reef-1', 'gm-reef-2', 'gm-reef-3']);
    for (const m of GOLD) { expect(m.id).toMatch(/^gm-[a-z]{1,24}-[1-9]$/); expect(KNOWN_GOLD.has(m.id)).toBe(true); }
    expect(Q.REEF_GOLD.map((m) => ({ ...m }))).toEqual(GOLD);
  });
  it('a save keeps them', () => {
    const p = createProgression(memoryStorage());
    for (const m of GOLD) p.recordGolden?.(m.id);
    expect(p.state.golden).toEqual(GOLD.map((m) => m.id));
  });
  it('one on the sand, two at float height (1.9 m and 2.0 m) in the bubble columns; the columns reach a little over each mouse', () => {
    expect(GOLD.map((m) => m.y)).toEqual([0, 1.9, 2.0]);
    for (const c of Q.BUBBLE_COLUMNS) { const m = GOLD.find((g) => g.x === c.x && g.z === c.z); expect(m, 'a column holds a mouse').toBeTruthy(); expect(c.top).toBeGreaterThan(m.y); }
  });
  it('all in the bounds, clear of every collider, 2 m from every find ring (and 1 m past its edge), collectible and found-outfit spot, and far from the spawn', () => {
    const b = area.bounds;
    for (const m of GOLD) {
      expect(m.x > b.minX + 2 && m.x < b.maxX - 2 && m.z > b.minZ + 2 && m.z < b.maxZ - 2, m.id).toBe(true);
      for (const c of area.colliders) expect(near(m, c), m.id).toBeGreaterThan(c.r + 0.5);
      for (const z of Object.values(Q.REEF_FIND_ZONES).flat()) expect(near(m, z), `${m.id} vs a find`).toBeGreaterThan(Math.max(2, z.r + 1));
      for (const k of area.collectibles) expect(near(m, k), `${m.id} vs ${k.id}`).toBeGreaterThan(2);
      for (const s of spotsIn('reef')) expect(near(m, s), `${m.id} vs ${s.id}`).toBeGreaterThanOrEqual(2);
      expect(near(m, area.spawn), m.id).toBeGreaterThan(15);
    }
  });
  it('every one is reached from the spawn with no skills: on foot to within 1 m, and the float row reaches the two high ones inside checkFind\'s 0.9 m window', () => {
    const { floatMax } = placeFloat('reef');
    for (const m of GOLD) {
      expect(flood.reachesWithin(m.x, m.z, 0.9), `${m.id} is reached on foot`).toBe(true);
      // the paws' height is a float of 0..floatMax over the seabed under her: some float in that range lands inside |paws - mouse| < 0.9
      expect(floatMax > m.y - 0.9 && 0 < m.y + 0.9, m.id).toBe(true);
      if (m.y > 0.9) expect(m.y - 0.9, `${m.id} needs a float, no skill`).toBeGreaterThan(0);
      expect(m.y + 0.8, `${m.id} is within the float's top`).toBeLessThanOrEqual(floatMax + 0.9);
    }
  });
});

describe('the totals', () => {
  it('Clan Edition counts 57 and the everyday edition 33 (the Reef row, gate-only, has no edition key: it counts in both)', () => {
    expect(GOLD_TOTAL).toBe(57);
    expect(goldForEdition('canon', CATALOG).size).toBe(57);
    expect(goldForEdition('legacy', CATALOG).size).toBe(33);
    for (const e of ['canon', 'legacy']) for (const m of GOLD) expect(goldForEdition(e, CATALOG).has(m.id), `${e} ${m.id}`).toBe(true);
    expect(CATALOG.areas.reef.edition).toBeUndefined();
  });
});

describe('the Pearl Collar\'s four spots', () => {
  const spots = spotsIn('reef');
  it('four, ids fw-reef-1..4, all on the seabed (no hop), in both editions (the collar has no edition key)', () => {
    expect(spots.map((s) => s.id)).toEqual(['fw-reef-1', 'fw-reef-2', 'fw-reef-3', 'fw-reef-4']);
    for (const s of spots) expect(s.y, s.id).toBe(0);
    expect(CATALOG.accessories.pearlcollar.edition).toBeUndefined();
    expect(Number.isInteger(FIND_KEY)).toBe(true);
  });
  it('none within 15 m of the spawn, each reached on foot, clear of colliders, finds, collectibles and mice', () => {
    for (const s of spots) {
      expect(near(s, area.spawn), s.id).toBeGreaterThanOrEqual(15);
      expect(flood.reachesWithin(s.x, s.z, PICKUP.r), s.id).toBe(true);
      for (const c of area.colliders) expect(near(s, c), s.id).toBeGreaterThan(c.r + 0.4);
      for (const z of Object.values(Q.REEF_FIND_ZONES).flat()) expect(near(s, z), `${s.id} vs a find`).toBeGreaterThan(z.r + 1);
      for (const k of area.collectibles) expect(near(s, k), `${s.id} vs ${k.id}`).toBeGreaterThanOrEqual(2);
      for (const m of GOLD) expect(near(s, m), `${s.id} vs ${m.id}`).toBeGreaterThanOrEqual(2);
      expect(s.x).toBeGreaterThan(P.REEF_BOUNDS.minX + 1.5); expect(s.z).toBeGreaterThan(P.REEF_BOUNDS.minZ + 1.5);
    }
  });
  it('a floating cat reaches a spot through the same window as a mouse (catReaches with the paws\' height), the existing readers only', async () => {
    const { catReaches } = await import('../src/foundwear/rules.js');
    const s = spots[0];
    expect(catReaches(s, 0, s.x, s.z, 0)).toBe(true);
    expect(catReaches(s, 0, s.x, s.z, 1.2)).toBe(false); // a cat floating well above a find on the sand does not pick it up
    expect(catReaches(s, 0, s.x + 0.5, s.z, 0.4)).toBe(true);
  });
});
