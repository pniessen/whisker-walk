import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

// Polish 2, item 5: the Pines race put a ring on the island (or its bridge)
// 20 days in 21, because 8 of the Pines' 17 POIs are the island's. The cap of
// one island ring stays, and now the island is in the running on about half
// the days. The course is still a pure function of (date, area): both
// co-walkers' devices draw the same one, and walkRng is never touched.

vi.stubGlobal('document', {
  createElement: () => ({
    width: 0,
    height: 0,
    getContext: () => new Proxy({}, {
      get: (_t, k) => {
        if (k === 'getImageData') return (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
        if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop: () => {} });
        return () => {};
      },
      set: () => true,
    }),
  }),
});

const { raceCourse } = await import('../src/race.js');
const { seedFromCode, mulberry32 } = await import('../src/rng.js');
const { build } = await import('../src/world/pines.js');
const { clearSpot } = await import('../src/world/spots.js');

const area = build(new THREE.Scene());
// As walk.js hands them to raceCourse.
const pois = area.pois.map((p) => clearSpot(p, area.colliders, area.bounds, area.waters));

function day(i) {
  const d = new Date(Date.UTC(2026, 10, 1 + i));
  return d.toISOString().slice(0, 10);
}
const islandRings = (c) => c.filter((p) => p.group === 'island').length;

// The course before this change, verbatim, for areas without groups.
function oldCourse(list, seed) {
  const rng = mulberry32(seed);
  const copy = list.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, 5);
}

describe('the Pines race and the island', () => {
  it('has an island ring on about half the days or fewer (21 days, and a year)', () => {
    const at = (n) => Array.from({ length: n }, (_, i) => raceCourse(pois, seedFromCode(`${day(i)}-pines`)));
    const three = at(21).filter((c) => islandRings(c) > 0).length;
    expect(three).toBeLessThanOrEqual(11);
    const year = at(365).filter((c) => islandRings(c) > 0).length;
    expect(year / 365).toBeLessThanOrEqual(0.55);
    expect(year / 365).toBeGreaterThanOrEqual(0.3); // the island still gets its days
  });

  it('never has more than one island ring, and always five rings', () => {
    for (let i = 0; i < 365; i++) {
      const c = raceCourse(pois, seedFromCode(`${day(i)}-pines`));
      expect(c).toHaveLength(5);
      expect(new Set(c).size).toBe(5);
      expect(islandRings(c)).toBeLessThanOrEqual(1);
    }
  });

  it('is the same course for the same day and area (both devices)', () => {
    const s = seedFromCode('2026-11-07-pines');
    expect(raceCourse(pois, s)).toEqual(raceCourse(pois.map((p) => ({ ...p })), s));
  });

  it('every area without groups keeps exactly the course it had', () => {
    const plain = Array.from({ length: 9 }, (_, i) => ({ x: i, z: -i }));
    for (let i = 0; i < 200; i++) {
      const s = seedFromCode(`${day(i)}-woods`);
      expect(raceCourse(plain, s)).toEqual(oldCourse(plain, s));
    }
  });
});
