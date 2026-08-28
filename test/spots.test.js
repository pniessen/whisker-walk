import { describe, it, expect, vi } from 'vitest';
import { clearSpot } from '../src/world/spots.js';
import { waterClearance } from '../src/world/builder.js';
import * as neighborhood from '../src/world/neighborhood.js';
import * as park from '../src/world/park.js';
import * as seaside from '../src/world/seaside.js';
import * as docks from '../src/world/docks.js';

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
//
// v19: AND >= 1.2 outside every water edge, which is the half of this test
// that used not to exist. The fountain bug above was found and fixed; its
// identical twin — a POI on the exact centre of the park POND — sat here
// invisible for four waves and passed this suite every single run, because
// water carries no collider for `minGap` to measure against. The obstacle
// the cat cannot cross is not always in `colliders`; from v19 the areas
// declare their water in `waters`, and clearSpot cannot push a spot out of
// something it is never shown, so the authored coordinate has to be right in
// the first place. That is what this now checks.
describe('cleared area POIs are reachable', () => {
  const stubScene = () => ({ add() {}, background: null, fog: null });
  const areas = { neighborhood, park, seaside, docks };

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

    it(`${name}: every cleared POI sits >= 1.2 outside every water edge too`, () => {
      const area = mod.build(stubScene());
      // Infinity for an area with no water (the neighborhood) and for a spot
      // standing on a dry deck (the seaside pier), both of which pass.
      for (const poi of area.pois) {
        const cleared = clearSpot(poi, area.colliders, area.bounds);
        expect(waterClearance(area.waters, cleared.x, cleared.z), `${name} poi (${poi.x},${poi.z})`)
          .toBeGreaterThanOrEqual(1.2);
      }
    });
  }
});

// The guard on the guard. The check above is only worth anything while the
// areas actually declare their water: if `waters` were dropped or renamed,
// waterClearance would return Infinity for everything and the whole thing
// would go quietly vacuous again — which is exactly the failure mode this
// suite already shipped once.
describe('the water check above is not vacuous', () => {
  const stubScene = () => ({ add() {}, background: null, fog: null });

  it('the three areas with water declare it, and it is where the POIs are not', () => {
    for (const mod of [park, seaside, docks]) {
      const area = mod.build(stubScene());
      expect(area.waters.length).toBeGreaterThan(0);
      // some point of each footprint really does read as "in the water"
      for (const w of area.waters) {
        // a rect's centre may be a deck (the Docks canal's is the main
        // bridge), so probe 8m along it; a circle has no decks
        const [x, z] = w.kind === 'circle'
          ? [w.x, w.z]
          : [(w.minX + w.maxX) / 2 + 8, (w.minZ + w.maxZ) / 2];
        expect(waterClearance(area.waters, x, z), `${area.name} ${w.id}`).toBeLessThan(0);
      }
    }
  });
});
