import { describe, it, expect } from 'vitest';
import { MAP_RADIUS_M, mapRadiusFor, toMap, pinToRim, mapMarkers } from '../src/ui/minimapmath.js';

const view = { cx: 0, cz: 0, heading: 0, mode: 'north', radiusM: 35, radiusPx: 55 };

describe('toMap', () => {
  it('north mode: a point 10 m north of the cat is straight up', () => {
    const p = toMap(0, -10, view);
    expect(p.u).toBeCloseTo(0);
    expect(p.v).toBeCloseTo(-10 * 55 / 35);
    expect(p.inside).toBe(true);
  });

  it('north mode ignores heading', () => {
    expect(toMap(10, 0, { ...view, heading: 1.2 })).toEqual(toMap(10, 0, view));
  });

  it('turn mode: whatever is ahead is up', () => {
    // heading PI/2 means forward is world -x
    const p = toMap(-10, 0, { ...view, mode: 'turn', heading: Math.PI / 2 });
    expect(p.u).toBeCloseTo(0);
    expect(p.v).toBeLessThan(0);
  });

  it('turn mode: behind is down', () => {
    const p = toMap(10, 0, { ...view, mode: 'turn', heading: Math.PI / 2 });
    expect(p.u).toBeCloseTo(0);
    expect(p.v).toBeGreaterThan(0);
  });

  it('turn mode: the camera\'s right is screen right', () => {
    // facing -z (heading 0), world +x is on the right
    const p = toMap(10, 0, { ...view, mode: 'turn', heading: 0 });
    expect(p.u).toBeGreaterThan(0);
    expect(p.v).toBeCloseTo(0);
  });

  it('is relative to the cat, not the world origin', () => {
    const p = toMap(5, -20, { ...view, cx: 5, cz: -10 });
    expect(p.u).toBeCloseTo(0);
    expect(p.v).toBeCloseTo(-10 * 55 / 35);
  });

  it('outside the radius is flagged', () => {
    expect(toMap(0, -60, view).inside).toBe(false);
  });
});

describe('pinToRim', () => {
  it('keeps the bearing and lands on the rim', () => {
    const p = pinToRim({ u: 300, v: -400 }, 55, 6);
    expect(Math.hypot(p.u, p.v)).toBeCloseTo(49);
    expect(Math.atan2(p.v, p.u)).toBeCloseTo(Math.atan2(-400, 300));
  });

  it('leaves inside points alone', () => {
    expect(pinToRim({ u: 10, v: -20 }, 55, 6)).toEqual({ u: 10, v: -20 });
  });
});

describe('mapRadiusFor', () => {
  it('falls back to the default radius', () => {
    expect(MAP_RADIUS_M).toBe(35);
    expect(mapRadiusFor('nowhere')).toBe(35);
  });
});

describe('mapMarkers', () => {
  const rings = [1, 2, 3, 4, 5].map((i) => ({ x: i * 10, z: -i * 10 }));
  const pad = { x: 3, z: 4 };
  const frame = (over = {}) => ({
    race: null, quest: null, scenics: [], visitedScenics: new Set(), remotes: [], ...over,
  });
  const race = (over) => ({ state: 'running', currentRing: 2, rings, pad, ...over });
  const of = (ms, kind) => ms.filter((m) => m.kind === kind);

  it('running race shows the next ring bright and the one after dim', () => {
    const rs = of(mapMarkers(frame({ race: race() })), 'ring');
    expect(rs).toHaveLength(2);
    expect(rs[0]).toMatchObject({ n: 2, dim: false, x: rings[1].x, z: rings[1].z });
    expect(rs[1]).toMatchObject({ n: 3, dim: true, x: rings[2].x, z: rings[2].z });
  });

  it('last ring has no dim follower', () => {
    const rs = of(mapMarkers(frame({ race: race({ currentRing: 5 }) })), 'ring');
    expect(rs).toHaveLength(1);
    expect(rs[0]).toMatchObject({ n: 5, dim: false });
  });

  it('idle race shows only the pad', () => {
    const ms = mapMarkers(frame({ race: race({ state: 'idle', currentRing: 0 }) }));
    expect(of(ms, 'pad')).toHaveLength(1);
    expect(of(ms, 'pad')[0]).toMatchObject({ x: 3, z: 4 });
    expect(of(ms, 'ring')).toHaveLength(0);
  });

  it('done race and the stub race show nothing', () => {
    const stub = { state: 'idle', currentRing: 0, rings: [], pad: null };
    for (const r of [race({ state: 'done', currentRing: 6 }), stub]) {
      const ms = mapMarkers(frame({ race: r }));
      expect(of(ms, 'ring')).toHaveLength(0);
      expect(of(ms, 'pad')).toHaveLength(0);
    }
  });

  it('quest shows only while active', () => {
    const q = (state) => ({ state, target: { x: 7, z: 8 } });
    const active = of(mapMarkers(frame({ quest: q('active') })), 'quest');
    expect(active).toHaveLength(1);
    expect(active[0]).toMatchObject({ x: 7, z: 8 });
    for (const state of ['offered', 'complete']) {
      expect(of(mapMarkers(frame({ quest: q(state) })), 'quest')).toHaveLength(0);
    }
    expect(of(mapMarkers(frame({ quest: null })), 'quest')).toHaveLength(0);
  });

  it('scenic stars fill once visited', () => {
    const ms = mapMarkers(frame({
      scenics: [{ id: 'pier-end', x: 1, z: 2 }, { id: 'lighthouse', x: 3, z: 4 }],
      visitedScenics: new Set(['pier-end']),
    }));
    const ss = of(ms, 'scenic');
    expect(ss).toHaveLength(2);
    expect(ss.find((m) => m.x === 1).filled).toBe(true);
    expect(ss.find((m) => m.x === 3).filled).toBe(false);
  });

  it('remote cats keep their colour', () => {
    const ms = mapMarkers(frame({ remotes: [{ x: 5, z: 6, color: '#ff8800' }] }));
    expect(of(ms, 'remote')).toEqual([{ kind: 'remote', x: 5, z: 6, color: '#ff8800' }]);
  });

  it('extra keys never become markers', () => {
    const ms = mapMarkers({
      ...frame(),
      goldMice: [{ x: 1, z: 1 }],
      collectibles: [{ x: 2, z: 2 }],
      secrets: [{ x: 3, z: 3 }],
    });
    expect(ms).toEqual([]);
  });
});
