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
