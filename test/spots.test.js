import { describe, it, expect, vi } from 'vitest';
import { clearSpot } from '../src/world/spots.js';
import * as neighborhood from '../src/world/neighborhood.js';
import * as park from '../src/world/park.js';
import * as seaside from '../src/world/seaside.js';

// The area builders run headless here (no jsdom dep): the only DOM they
// touch is document.createElement('canvas') for the billboard texture, so a
// Proxy that swallows arbitrary 2D-context calls is enough. THREE's
// CanvasTexture just stores the object; nothing renders in these tests.
vi.stubGlobal('document', {
  createElement: () => ({
    width: 0,
    height: 0,
    getContext: () => new Proxy({}, { get: () => () => {}, set: () => true }),
  }),
});

const CLEARANCE = 1.6;

function minGap(p, colliders) {
  let min = Infinity;
  for (const c of colliders) {
    min = Math.min(min, Math.hypot(p.x - c.x, p.z - c.z) - c.r);
  }
  return min;
}

describe('clearSpot', () => {
  it('leaves an already-clear spot untouched', () => {
    const p = clearSpot({ x: 10, z: 10 }, [{ x: 0, z: 0, r: 1 }]);
    expect(p).toEqual({ x: 10, z: 10 });
  });

  it('pushes a spot inside a collider out past the clearance edge', () => {
    const p = clearSpot({ x: 1, z: 0 }, [{ x: 0, z: 0, r: 3 }]);
    expect(Math.hypot(p.x, p.z)).toBeCloseTo(3 + CLEARANCE, 5);
    // pushed along the existing offset direction, not somewhere arbitrary
    expect(p.x).toBeGreaterThan(0);
    expect(Math.abs(p.z)).toBeLessThan(1e-6);
  });

  it('resolves a dead-center spot deterministically (+x push)', () => {
    const a = clearSpot({ x: 0, z: 0 }, [{ x: 0, z: 0, r: 2 }]);
    const b = clearSpot({ x: 0, z: 0 }, [{ x: 0, z: 0, r: 2 }]);
    expect(a).toEqual(b);
    expect(a.x).toBeCloseTo(2 + CLEARANCE, 5);
    expect(a.z).toBeCloseTo(0, 5);
  });

  it('escapes overlapping collider clusters', () => {
    const cluster = [
      { x: 0, z: 0, r: 2 },
      { x: 3, z: 0, r: 2 },
      { x: 1.5, z: 2, r: 2 },
    ];
    const p = clearSpot({ x: 1.5, z: 0.5 }, cluster);
    expect(minGap(p, cluster)).toBeGreaterThanOrEqual(CLEARANCE - 0.25);
  });

  it('clamps into bounds', () => {
    const bounds = { minX: -10, maxX: 10, minZ: -10, maxZ: 10 };
    const p = clearSpot({ x: 9.5, z: 0 }, [{ x: 9.5, z: 0, r: 3 }], bounds);
    expect(p.x).toBeLessThanOrEqual(bounds.maxX - 2);
    expect(p.x).toBeGreaterThanOrEqual(bounds.minX + 2);
  });

  it('preserves extra fields on the spot', () => {
    const p = clearSpot({ x: 0, z: 0, label: 'poi' }, [{ x: 0, z: 0, r: 1 }]);
    expect(p.label).toBe('poi');
  });
});

// The real regression: every authored POI in every walkable area must end up
// reachable once cleared — the cat stops at collider.r + 0.35, the race
// ring-cross check needs < 1.2, quest completion needs < 2. A POI authored
// dead-center on the park fountain (r=3) or the neighborhood car made that
// day's race unwinnable before clearing.
describe('cleared area POIs are reachable', () => {
  const stubScene = () => ({ add() {}, background: null, fog: null });
  const areas = { neighborhood, park, seaside };

  for (const [name, mod] of Object.entries(areas)) {
    it(`${name}: every cleared POI sits >= 1.2 outside every collider edge`, () => {
      const area = mod.build(stubScene());
      for (const poi of area.pois) {
        const cleared = clearSpot(poi, area.colliders, area.bounds);
        // 1.2 = the tightest consumer (race CROSS_DIST); clearSpot aims for
        // 1.6 but bounds-clamping near map edges may legitimately eat margin
        expect(minGap(cleared, area.colliders), `${name} poi (${poi.x},${poi.z})`)
          .toBeGreaterThanOrEqual(1.2);
      }
    });
  }
});
