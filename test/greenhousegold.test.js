import { describe, it, expect } from 'vitest';
import { stubCanvasDocument } from './helpers/canvas.js';
import { GOLD_MICE, KNOWN_GOLD, GOLD_TOTAL, goldForEdition } from '../src/goldmice.js';
import { CATALOG, createProgression } from '../src/progression.js';
import { SEED_SPOT_SETS, WATER_POT_SPOTS, GREENHOUSE_GOLD, GREENHOUSE_FIND_ZONES, GREENHOUSE_COLLECTIBLES, ISLAND } from '../src/world/greenhouseplan.js';
import { inWater } from '../src/world/water.js';
import { memoryStorage } from './helpers/storage.js';
import { setTele } from '../src/teleflag.js';

stubCanvasDocument();
const W = await import('./helpers/greenhousewalk.js');

// The Greenhouse: three golden mice, none needing a skill. Milestone G3 refined the spots to the spec: the shed's roof (a climb), the
// hall's corner (on foot) and the willow log (one hop).
const GOLD = GOLD_MICE.greenhouse;
const area = W.area;
const near = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

describe('three golden mice', () => {
  it('ids gm-green-1..3, valid, known, unique, and the plan holds the same three', () => {
    expect(GOLD.map((m) => m.id)).toEqual(['gm-green-1', 'gm-green-2', 'gm-green-3']);
    for (const m of GOLD) { expect(m.id).toMatch(/^gm-[a-z]{1,24}-[1-9]$/); expect(KNOWN_GOLD.has(m.id)).toBe(true); }
    expect(GREENHOUSE_GOLD.map((m) => ({ ...m }))).toEqual(GOLD);
  });
  it('a save keeps them', () => {
    const p = createProgression(memoryStorage());
    for (const m of GOLD) p.recordGolden?.(m.id);
    expect(p.state.golden).toEqual(GOLD.map((m) => m.id));
  });
  it('none is in the water or outside the bounds, none beside a seed, pot, collectible or find spot (2 m), a ground one is clear of every collider', () => {
    const { minX, maxX, minZ, maxZ } = area.bounds;
    const finds = Object.values(GREENHOUSE_FIND_ZONES).flat();
    for (const m of GOLD) {
      expect(m.x > minX && m.x < maxX && m.z > minZ && m.z < maxZ, m.id).toBe(true);
      expect(inWater(area.waters, m.x, m.z), m.id).toBe(false);
      for (const s of [...SEED_SPOT_SETS.flat(), ...WATER_POT_SPOTS, ...GREENHOUSE_COLLECTIBLES]) expect(near(m, s), m.id).toBeGreaterThan(2);
      for (const f of finds) if (f.rest) continue; else expect(near(m, f), `${m.id} vs a find`).toBeGreaterThan(f.rMin ? f.r : 2);
    }
    expect(GOLD[1].y).toBe(0);
    expect(area.colliders.every((c) => near(GOLD[1], c) >= c.r + 0.35)).toBe(true);
    void ISLAND;
  });
  it('the ground one is reached on foot from the spawn; the others by perches within the base budget (no skill)', () => {
    expect(W.reachable(GOLD[1].x, GOLD[1].z)).toBe(true);
    expect(W.hopsTo(GOLD[0])).toBeGreaterThan(1);
    expect(W.hopsTo(GOLD[0])).toBeLessThanOrEqual(3); // ground -> pot stack -> rain barrel -> shed roof
    expect(W.hopsTo(GOLD[2])).toBe(1); // the willow log, 0.8 m
    expect(GOLD[0].y).toBe(2.4);
    expect(GOLD[2].y).toBe(0.8);
  });
});

describe('the totals', () => {
  it('Clan Edition counts 57 and Legacy 33 (the Reef joined) (the Greenhouse has no edition key), whatever the gates switch says: the total counts by edition alone, as it counts the Moon', () => {
    expect(GOLD_TOTAL).toBe(62);
    for (const on of [true, false]) {
      setTele(on);
      try {
        expect(goldForEdition('canon', CATALOG).size).toBe(62);
        expect(goldForEdition('legacy', CATALOG).size).toBe(38);
        for (const e of ['canon', 'legacy']) for (const m of GOLD) expect(goldForEdition(e, CATALOG).has(m.id), `${e} ${m.id}`).toBe(true);
      } finally { setTele(null); }
    }
    expect(CATALOG.areas.greenhouse.edition).toBeUndefined();
  });
});
