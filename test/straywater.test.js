import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { createStrayCats, strayStream } from '../src/straycats.js';
import { CAT_RADIUS } from '../src/player.js';
import { waterClearance } from '../src/world/builder.js';
import { dryGroundPoint } from '../src/keepout.js';

// The area builders run headless (no jsdom): the same canvas stub
// test/climbing.test.js uses, installed before the world modules import.
vi.stubGlobal('document', {
  createElement: () => ({
    width: 0,
    height: 0,
    getContext: () => new Proxy({}, {
      get: (_target, key) => {
        if (key === 'getImageData') return (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
        if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop: () => {} });
        if (key === 'measureText') return () => ({ width: 10 });
        return () => {};
      },
      set: () => true,
    }),
  }),
});
const { build: buildPark } = await import('../src/world/park.js');
const { build: buildWoods } = await import('../src/world/woods.js');
const { build: buildPines } = await import('../src/world/pines.js');

// Strays keep off the water the way clan cats do (src/world/clanground.js):
// CAT_RADIUS or more clear of every footprint, a deck counting as dry. The
// push is pure arithmetic, so it draws nothing: co-walkers sharing a room
// seed still agree on every stray, and the stream's draw count is unchanged.

function fakeScene() {
  return { add() {}, remove() {} };
}
const EPS = 1e-6;
const dry = (area, x, z) => waterClearance(area.waters, x, z) >= CAT_RADIUS - EPS;

// A park-sized walk with the park's pond and a river with a bridge across it.
const AREA = {
  bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 },
  waters: [
    { id: 'pond', kind: 'circle', x: -10, z: 5, r: 8 },
    { id: 'river', kind: 'rect', minX: -50, maxX: 50, minZ: 20, maxZ: 26, decks: [{ minX: 0, maxX: 3, minZ: 20, maxZ: 26 }] },
  ],
};

function counting(rng) {
  const c = { n: 0 };
  c.rng = () => { c.n++; return rng(); };
  return c;
}

function run(area, seed, frames, catPath) {
  const cats = createStrayCats(fakeScene(), area, 22, strayStream(seed), { roomSeed: seed });
  const where = [];
  for (let i = 0; i < frames; i++) {
    const t = i / 30;
    cats.update(1 / 30, t, catPath(i), { stalking: false, catSpeed: i % 300 < 20 ? 3 : 0, toy: null });
    where.push(cats.strays.map((s) => [s.group.position.x, s.group.position.z]));
  }
  return { cats, where };
}

describe('dryGroundPoint', () => {
  it('hands a dry point back unchanged, and moves a wet one to the nearest dry ground', () => {
    expect(dryGroundPoint(AREA, 30, -30)).toEqual({ x: 30, z: -30 });
    const p = dryGroundPoint(AREA, -10, 4);
    expect(dry(AREA, p.x, p.z)).toBe(true);
    expect(Math.hypot(p.x + 10, p.z - 5)).toBeCloseTo(8 + CAT_RADIUS, 6);
    // the bridge is dry ground
    expect(dryGroundPoint(AREA, 1.5, 23)).toEqual({ x: 1.5, z: 23 });
  });

  it('keeps out of both the keep-out and the water where they meet', () => {
    const area = { ...AREA, keepOut: { rects: [{ minX: -2, maxX: 6, minZ: 12, maxZ: 19 }], margin: 0.6 } };
    for (const [x, z] of [[2, 19.5], [2, 15], [-3, 19.9], [6.5, 20.2]]) {
      const p = dryGroundPoint(area, x, z);
      expect(dry(area, p.x, p.z), `${x},${z}`).toBe(true);
      const r = area.keepOut.rects[0];
      const gap = Math.hypot(Math.max(r.minX - p.x, 0, p.x - r.maxX), Math.max(r.minZ - p.z, 0, p.z - r.maxZ));
      expect(gap, `${x},${z}`).toBeGreaterThanOrEqual(0.6 - EPS);
    }
  });
});

describe('strays keep off the water', () => {
  const path = (i) => new THREE.Vector3(Math.sin(i / 200) * 30, 0, Math.cos(i / 170) * 30);

  it('never stand in a footprint (or within CAT_RADIUS of one), over a long walk, across seeds', () => {
    let bad = null;
    for (const seed of [1, 7, 42, 1234]) {
      const { cats, where } = run(AREA, seed, 1800, path);
      for (const s of cats.strays) if (!dry(AREA, s.home.x, s.home.z)) bad ??= `home of ${s.name}, seed ${seed}`;
      where.forEach((frame, i) => frame.forEach(([x, z], k) => {
        if (!dry(AREA, x, z)) bad ??= `seed ${seed} frame ${i} stray ${k} at (${x}, ${z})`;
      }));
    }
    expect(bad).toBe(null);
  }, 60000);

  it('on the real park and Woods too', () => {
    for (const build of [buildPark, buildWoods]) {
      const area = build(new THREE.Scene());
      const { where } = run(area, 99, 900, path);
      let bad = null;
      where.forEach((frame, i) => frame.forEach(([x, z], k) => {
        if (!dry(area, x, z)) bad ??= `frame ${i} stray ${k} at (${x}, ${z})`;
      }));
      expect(bad).toBe(null);
    }
  }, 60000);

  it('draws exactly as many numbers from the shared stream as on a dry walk', () => {
    const wet = counting(strayStream(5));
    createStrayCats(fakeScene(), AREA, 22, wet.rng, { roomSeed: 5 });
    const plain = counting(strayStream(5));
    createStrayCats(fakeScene(), { bounds: AREA.bounds }, 22, plain.rng, { roomSeed: 5 });
    expect(wet.n).toBe(plain.n);
  });

  it('two co-walkers on one room seed see every stray in the same place, frame for frame', () => {
    const a = run(AREA, 31, 900, path).where;
    const b = run(AREA, 31, 900, path).where;
    expect(b).toEqual(a);
  });
});

describe('dryGroundPoint, review follow-ups', () => {
  it('never pushes a point out of the bounds over a water running past them', () => {
    // a lake out past the north edge: its near shore is z 10, its far edge
    // z 80 is off the map
    const area = { bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 }, waters: [{ id: 'l', kind: 'rect', minX: -60, maxX: 60, minZ: 10, maxZ: 80 }] };
    for (let z = 10; z <= 49.5; z += 0.5) {
      for (const x of [-40, 0, 33]) {
        const p = dryGroundPoint(area, x, z);
        expect(p.z, `${x},${z}`).toBeLessThanOrEqual(50 - 0.5 + 1e-9);
        expect(p.z, `${x},${z}`).toBeGreaterThanOrEqual(-50);
        expect(dry(area, p.x, p.z), `${x},${z}`).toBe(true);
      }
    }
  });

  it('a stray stepping off the side of a bridge lands on its edge, not a margin back in', () => {
    // walking along the bridge (x 0..3) a hair past its east edge
    const p = dryGroundPoint(AREA, 3.04, 23);
    expect(p.x).toBeCloseTo(3, 9);
    expect(p.z).toBeCloseTo(23, 9);
    // so a walk along the edge moves smoothly: every step is a step
    let q = { x: 2.9, z: 20.5 };
    for (let i = 0; i < 100; i++) {
      const n = dryGroundPoint(AREA, q.x + 0.01, q.z + 0.05);
      expect(Math.hypot(n.x - q.x, n.z - q.z)).toBeLessThan(0.06);
      q = n;
    }
  });
});

// Polish 3: a stray rolled into the Pines' bay was pushed to the nearest dry
// ground, its shore, so every walk's bay strays stood in a row along the bay's
// west and north shores. They are mirrored inland now, by how far out they
// were, from the values already rolled.
describe('the bay strays at the start of a walk (Polish 3)', () => {
  const pines = buildPines(new THREE.Scene());
  const starts = (seed) => createStrayCats(fakeScene(), pines, 22, strayStream(seed), { roomSeed: seed })
    .strays.map((st) => st.group.position);

  it('no longer stand in a row along the bay shore', () => {
    let westShore = 0;
    let atWater = 0;
    for (let seed = 1; seed <= 40; seed++) {
      for (const p of starts(seed)) {
        if (p.x > -1.5 && p.x < 0 && p.z > 5 && p.z < 44) westShore++;
        if (waterClearance(pines.waters, p.x, p.z) < 0.8) atWater++;
      }
    }
    // Before: 61 on the west shore line and 198 of 880 at a water's edge.
    expect(westShore).toBeLessThan(10);
    expect(atWater).toBeLessThan(50);
  });

  it('still stand dry, draw exactly what a dry walk draws, and agree between co-walkers', () => {
    for (const seed of [3, 17]) {
      for (const p of starts(seed)) expect(dry(pines, p.x, p.z)).toBe(true);
      expect(starts(seed).map((p) => [p.x, p.z])).toEqual(starts(seed).map((p) => [p.x, p.z]));
    }
    const wet = counting(strayStream(9));
    createStrayCats(fakeScene(), pines, 22, wet.rng, { roomSeed: 9 });
    const plain = counting(strayStream(9));
    createStrayCats(fakeScene(), { bounds: pines.bounds }, 22, plain.rng, { roomSeed: 9 });
    expect(wet.n).toBe(plain.n);
  });
});
