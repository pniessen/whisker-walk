import { describe, it, expect } from 'vitest';
import { GOLD_MICE, KNOWN_GOLD, GOLD_TOTAL, goldForEdition } from '../src/goldmice.js';
import { CATALOG, createProgression } from '../src/progression.js';
import { greenhouseArea, SEED_SPOT_SETS, WATER_POT_SPOTS } from '../src/world/greenhouseplan.js';
import { inWater } from '../src/world/water.js';
import { memoryStorage } from './helpers/storage.js';

// The Greenhouse, milestone G2: three golden mice on walkable ground (G3 may refine the spots).
const GOLD = GOLD_MICE.greenhouse;
const area = greenhouseArea();
const near = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

describe('three golden mice', () => {
  it('ids gm-green-1..3, valid, known, unique', () => {
    expect(GOLD.map((m) => m.id)).toEqual(['gm-green-1', 'gm-green-2', 'gm-green-3']);
    for (const m of GOLD) { expect(m.id).toMatch(/^gm-[a-z]{1,24}-[1-9]$/); expect(KNOWN_GOLD.has(m.id)).toBe(true); }
  });
  it('a save keeps them', () => {
    const p = createProgression(memoryStorage());
    for (const m of GOLD) p.recordGolden?.(m.id);
    expect(p.state.golden).toEqual(GOLD.map((m) => m.id));
  });
  it('none is in the water, in a wall or a plant, outside the bounds, or beside a seed or pot spot (2 m)', () => {
    const { minX, maxX, minZ, maxZ } = area.bounds;
    for (const m of GOLD) {
      expect(m.x > minX && m.x < maxX && m.z > minZ && m.z < maxZ, m.id).toBe(true);
      expect(inWater(area.waters, m.x, m.z), m.id).toBe(false);
      expect(area.colliders.every((c) => near(m, c) >= c.r + 0.35), m.id).toBe(true);
      for (const s of [...SEED_SPOT_SETS.flat(), ...WATER_POT_SPOTS]) expect(near(m, s), m.id).toBeGreaterThan(2);
      expect(m.y).toBe(0);
    }
  });
  it('each is reached from the spawn on foot (no skill: a flood fill over the free ground)', () => {
    const step = 0.5;
    const key = (i, j) => `${i},${j}`;
    const free = (x, z) => !inWater(area.waters, x, z) && area.colliders.every((c) => Math.hypot(x - c.x, z - c.z) >= c.r + 0.25);
    const seen = new Set([key(Math.round(area.spawn.x / step), Math.round(area.spawn.z / step))]);
    const todo = [[Math.round(area.spawn.x / step), Math.round(area.spawn.z / step)]];
    while (todo.length) {
      const [i, j] = todo.pop();
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = i + di; const b = j + dj; const x = a * step; const z = b * step;
        if (x < area.bounds.minX || x > area.bounds.maxX || z < area.bounds.minZ || z > area.bounds.maxZ) continue;
        if (seen.has(key(a, b)) || !free(x, z)) continue;
        seen.add(key(a, b)); todo.push([a, b]);
      }
    }
    for (const m of GOLD) expect(seen.has(key(Math.round(m.x / step), Math.round(m.z / step))), m.id).toBe(true);
  });
});

describe('the totals', () => {
  it('Clan Edition counts 54 and Legacy 30 (the Greenhouse has no edition key and no catalog row)', () => {
    expect(GOLD_TOTAL).toBe(54);
    expect(goldForEdition('canon', CATALOG).size).toBe(54);
    expect(goldForEdition('legacy', CATALOG).size).toBe(30);
    for (const e of ['canon', 'legacy']) for (const m of GOLD) expect(goldForEdition(e, CATALOG).has(m.id), `${e} ${m.id}`).toBe(true);
    expect(Object.hasOwn(CATALOG.areas, 'greenhouse')).toBe(false);
  });
});
