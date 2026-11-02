import { describe, it, expect } from 'vitest';
import { MAP_RADIUS_M, mapRadiusFor, toMap, pinToRim, mapMarkers, faceAngle, badgeAt, clearOfBadge } from '../src/ui/minimapmath.js';

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

describe('mapMarkers camp', () => {
  const base = { race: null, quest: null, scenics: [{ id: 's', x: 3, z: 3 }], visitedScenics: new Set(), remotes: [{ x: 1, z: 1, color: 0 }] };
  it('puts the camp first, so every other marker draws over it', () => {
    const ms = mapMarkers({ ...base, camp: { x: 1, z: 2, color: '#000' } });
    expect(ms[0]).toEqual({ kind: 'camp', x: 1, z: 2, color: '#000' });
    expect(ms.length).toBeGreaterThan(1);
  });
  it('has no camp marker without a camp', () => {
    expect(mapMarkers({ ...base, camp: null }).some((m) => m.kind === 'camp')).toBe(false);
    expect(mapMarkers(base).some((m) => m.kind === 'camp')).toBe(false);
  });
  it('a far camp pins to the rim like the other markers', () => {
    const view = { cx: 0, cz: 0, radiusPx: 50, radiusM: 35, mode: 'north' };
    const p = pinToRim(toMap(500, 0, view), view.radiusPx, 6);
    expect(Math.hypot(p.u, p.v)).toBeCloseTo(44, 5);
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

describe('mapMarkers posts (border crossings)', () => {
  const base = { race: { state: 'idle', pad: { x: 9, z: 9 } }, quest: null, scenics: [], visitedScenics: new Set(), remotes: [] };
  const north = { cx: 0, cz: 0, heading: 0, mode: 'north', radiusM: 35, radiusPx: 55 };
  const turned = { ...north, mode: 'turn', heading: Math.PI / 2 };
  const DIRS = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] };
  // Canvas angle of the map-space vector from the post to a point 1 m out.
  const viaToMap = (faces, view) => {
    const post = { x: 5, z: -3 };
    const a = toMap(post.x, post.z, view);
    const b = toMap(post.x + DIRS[faces][0], post.z + DIRS[faces][1], view);
    return Math.atan2(b.v - a.v, b.u - a.u);
  };

  it('puts a post marker after the camp and before the race', () => {
    const ms = mapMarkers({ ...base, camp: { x: 1, z: 1, color: '#000' }, posts: [{ x: 1, z: 2, faces: 'north' }] });
    expect(ms.map((m) => m.kind)).toEqual(['camp', 'post', 'pad']);
    expect(ms[1]).toEqual({ kind: 'post', x: 1, z: 2, faces: 'north' });
  });

  it('adds none for null or missing posts', () => {
    expect(mapMarkers({ ...base, posts: null }).some((m) => m.kind === 'post')).toBe(false);
    expect(mapMarkers(base).some((m) => m.kind === 'post')).toBe(false);
  });

  it('north faces up the map in north mode and sideways in a turned view', () => {
    expect(faceAngle('north', north)).toBeCloseTo(-Math.PI / 2);
    expect(Math.abs(Math.cos(faceAngle('north', turned)))).toBeCloseTo(1, 5);
    expect(Math.abs(Math.sin(faceAngle('north', turned)))).toBeCloseTo(0, 5);
    // heading PI/2: world -x is up, so west faces up
    expect(faceAngle('west', turned)).toBeCloseTo(-Math.PI / 2);
  });

  it('agrees with toMap for a point 1 m out from the post, every direction and view', () => {
    for (const view of [north, turned, { ...north, mode: 'turn', heading: 0.7 }]) {
      for (const f of Object.keys(DIRS)) {
        const want = viaToMap(f, view);
        const got = faceAngle(f, view);
        expect(Math.cos(got)).toBeCloseTo(Math.cos(want), 6);
        expect(Math.sin(got)).toBeCloseTo(Math.sin(want), 6);
      }
    }
  });
});

describe('mapMarkers intruder', () => {
  it('no intruder on the corner map: a frame carrying one gets no marker for it', () => {
    const frame = {
      race: null, quest: null, scenics: [], visitedScenics: new Set(), remotes: [],
      intruder: { x: 4, z: 5, clan: 'moor' },
    };
    expect(mapMarkers(frame)).toEqual([]);
  });
});

describe('clearOfBadge (Polish 3)', () => {
  const north = { cx: 0, cz: 0, heading: 0, mode: 'north', radiusM: 35, radiusPx: 55 };
  it('the badge sits up in north mode and at north in turn mode', () => {
    expect(badgeAt(north)).toEqual({ u: 0, v: -46 });
    const b = badgeAt({ ...north, mode: 'turn', heading: Math.PI / 2 });
    expect(b.u).toBeCloseTo(46, 6);
    expect(b.v).toBeCloseTo(0, 6);
  });
  it('slides a point under the badge round the rim, toward its own side, just clear', () => {
    const b = badgeAt(north);
    for (const [u, lean] of [[2, 1], [-2, -1], [0, 1]]) {
      const p = { u, v: -49 };
      const q = clearOfBadge(p, b, 13);
      expect(Math.hypot(q.u - b.u, q.v - b.v)).toBeCloseTo(13, 6);
      expect(Math.hypot(q.u, q.v)).toBeCloseTo(Math.hypot(p.u, p.v), 6);
      expect(Math.sign(q.u)).toBe(lean);
    }
  });
  it('leaves a point that is already clear exactly as it was', () => {
    const p = { u: 20, v: -40 };
    expect(clearOfBadge(p, badgeAt(north), 13)).toBe(p);
  });
});
