import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';

// The headless canvas stub every world test uses (see test/park.test.js).
vi.stubGlobal('document', {
  createElement: () => ({
    width: 0,
    height: 0,
    getContext: () => new Proxy({}, {
      get: (_target, key) => {
        if (key === 'getImageData') return (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
        if (key === 'createLinearGradient' || key === 'createRadialGradient') {
          return () => ({ addColorStop: () => {} });
        }
        return () => {};
      },
      set: () => true,
    }),
  }),
});

const { createGoals, GOAL_POOL } = await import('../src/goals.js');
const { mulberry32 } = await import('../src/rng.js');

const AREAS = {};
for (const id of ['neighborhood', 'park', 'seaside', 'docks', 'woods']) {
  const { build } = await import(`../src/world/${id}.js`);
  AREAS[id] = build(new THREE.Scene());
}

// What each goal needs from the area's own data to be finishable. The other
// goals (critters, finds, strays, photos, the yarn, buried treats, scenics,
// pounce-tag) are on offer in every outdoor area.
function completable(goal, area) {
  if (goal.type === 'mischief') return area.tippables.length >= goal.target;
  if (goal.type === 'sits') return area.boxes.length >= goal.target;
  if (goal.type === 'pet') return area.critterSpawns.some((c) => c.type === 'villager');
  return true;
}

// An rng that counts its draws, so a test can see how many createGoals took.
function counted(seed) {
  const rng = mulberry32(seed);
  const wrapped = () => { wrapped.draws += 1; return rng(); };
  wrapped.draws = 0;
  return wrapped;
}

const SEEDS = Array.from({ length: 400 }, (_, i) => 1000 + i * 7919);

describe('goals fit the area', () => {
  for (const [id, area] of Object.entries(AREAS)) {
    it(`every goal drawn in ${id} can be finished there`, () => {
      for (const seed of SEEDS) {
        for (const g of createGoals(mulberry32(seed), area).goals) {
          expect(completable(g, area), `${id} seed ${seed}: ${g.id}`).toBe(true);
        }
      }
    });
  }

  it('the Woods never offers tipping, a box or head scratches', () => {
    const seen = new Set();
    for (const seed of SEEDS) for (const g of createGoals(mulberry32(seed), AREAS.woods).goals) seen.add(g.id);
    expect(seen.has('tip-things')).toBe(false);
    expect(seen.has('box-sit')).toBe(false);
    expect(seen.has('get-scratches')).toBe(false);
    // and still offers everything else
    expect(seen.size).toBe(GOAL_POOL.length - 3);
  });

  it('areas that can finish every goal draw exactly what they drew before', () => {
    for (const id of ['neighborhood', 'park', 'seaside', 'docks']) {
      for (const seed of SEEDS) {
        const before = createGoals(mulberry32(seed)).goals.map((g) => g.id);
        const now = createGoals(mulberry32(seed), AREAS[id]).goals.map((g) => g.id);
        expect(now, `${id} seed ${seed}`).toEqual(before);
      }
    }
  });
});

describe('goals and the shared walkRng', () => {
  it('takes exactly three draws in every area', () => {
    for (const area of [undefined, ...Object.values(AREAS)]) {
      for (const seed of SEEDS.slice(0, 50)) {
        const rng = counted(seed);
        createGoals(rng, area);
        expect(rng.draws).toBe(3);
      }
    }
  });

  it('leaves the walkRng at the same place whatever the area', () => {
    for (const seed of SEEDS.slice(0, 50)) {
      const next = Object.values(AREAS).map((area) => {
        const rng = mulberry32(seed);
        createGoals(rng, area);
        return rng();
      });
      expect(new Set(next).size).toBe(1);
    }
  });

  it('two co-walkers in the Woods with the same seed draw the same goals', () => {
    for (const seed of SEEDS.slice(0, 50)) {
      // a fresh build per device: the goals read only the area's own data
      const phone = createGoals(mulberry32(seed), AREAS.woods).goals.map((g) => g.id);
      const desktop = createGoals(mulberry32(seed), structuredClone({
        tippables: AREAS.woods.tippables, boxes: AREAS.woods.boxes, critterSpawns: AREAS.woods.critterSpawns,
      })).goals.map((g) => g.id);
      expect(phone).toEqual(desktop);
    }
  });

  it('walk.js hands createGoals the area data', () => {
    const src = readFileSync(new URL('../src/game/walk.js', import.meta.url), 'utf8');
    expect(src).toContain('createGoals(walkRng, areaData)');
  });
});
