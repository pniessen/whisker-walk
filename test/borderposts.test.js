import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { existsSync, readFileSync } from 'node:fs';

// The same headless canvas stub every world test uses (see test/moor.test.js).
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

const {
  BORDER_POSTS, POST_R, POST_REACH, TOWN_FOOTPATH, FOOTPATH_W, postsFor, postNear, FACINGS, borderPost,
} = await import('../src/borderposts.js');
const neighborhood = await import('../src/world/neighborhood.js');
const woods = await import('../src/world/woods.js');
const river = await import('../src/world/river.js');
const moor = await import('../src/world/moor.js');
const pines = await import('../src/world/pines.js');
const { waterGap } = await import('../src/world/builder.js');
const { isWalkableAt } = await import('../src/player.js');
const { GOLD_MICE } = await import('../src/goldmice.js');
const { DISCS } = await import('../src/rivalclans.js');
const { keepOutPoint } = await import('../src/keepout.js');
const { FRAMES } = await import('../src/world/lake.js');

// The Neighborhood's two roads are 5 m wide: [x1, z1, x2, z2] centrelines.
const TOWN_ROADS = [[0, -50, 0, 50], [-50, 0, 50, 0]];
const ROAD_W = 5;

const maps = {
  neighborhood: { mod: neighborhood, paths: [...TOWN_ROADS, ...TOWN_FOOTPATH], roads: TOWN_ROADS },
  woods: { mod: woods, paths: woods.WOODS_PATHS, roads: [] },
  river: { mod: river, paths: river.RIVER_PATHS, roads: [] },
  moor: { mod: moor, paths: [...moor.MOOR_PATHS, ...moor.MOOR_TRAIL], roads: [] },
  pines: { mod: pines, paths: [...pines.PINES_PATHS, ...pines.PINES_TRAIL], roads: [] },
};
for (const m of Object.values(maps)) m.area = m.mod.build(new THREE.Scene());
const isRoad = (areaId, s) => maps[areaId].roads.includes(s);

function segDist(x, z, [x1, z1, x2, z2]) {
  const dx = x2 - x1, dz = z2 - z1;
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (z - z1) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(x - (x1 + t * dx), z - (z1 + t * dz));
}

// Which bounds edge a point is nearest, named by the way a cat faces to leave.
function nearestSide(b, p) {
  const d = { west: p.x - b.minX, east: b.maxX - p.x, north: p.z - b.minZ, south: b.maxZ - p.z };
  return Object.keys(d).reduce((a, k) => (d[k] < d[a] ? k : a));
}

// Flood the cells a grounded cat may stand on (player.js's own rule) on a
// 0.5 m grid from the map's spawn, once per area.
const STEP = 0.5;
const floods = new Map();
function flood(areaId) {
  if (floods.has(areaId)) return floods.get(areaId);
  const { area, mod } = maps[areaId];
  const { minX, maxX, minZ, maxZ } = area.bounds;
  const nx = Math.round((maxX - minX) / STEP) + 1;
  const nz = Math.round((maxZ - minZ) / STEP) + 1;
  const seen = new Uint8Array(nx * nz);
  const ok = (i, j) => isWalkableAt(area, minX + i * STEP, minZ + j * STEP);
  const si = Math.round((mod.SPAWN.x - minX) / STEP);
  const sj = Math.round((mod.SPAWN.z - minZ) / STEP);
  expect(ok(si, sj), `${areaId}: the spawn is walkable`).toBe(true);
  const stack = [[si, sj]];
  seen[si * nz + sj] = 1;
  while (stack.length) {
    const [i, j] = stack.pop();
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const p = i + di, q = j + dj;
      if (p < 0 || q < 0 || p >= nx || q >= nz || seen[p * nz + q] || !ok(p, q)) continue;
      seen[p * nz + q] = 1;
      stack.push([p, q]);
    }
  }
  const f = { minX, minZ, nx, nz, seen };
  floods.set(areaId, f);
  return f;
}
function reachesWithin(areaId, x, z, r) {
  const f = flood(areaId);
  for (let i = Math.floor((x - r - f.minX) / STEP); i <= Math.ceil((x + r - f.minX) / STEP); i++) {
    for (let j = Math.floor((z - r - f.minZ) / STEP); j <= Math.ceil((z + r - f.minZ) / STEP); j++) {
      if (i < 0 || j < 0 || i >= f.nx || j >= f.nz || !f.seen[i * f.nz + j]) continue;
      if (Math.hypot(f.minX + i * STEP - x, f.minZ + j * STEP - z) < r) return true;
    }
  }
  return false;
}
function reaches(areaId, x, z) {
  const f = flood(areaId);
  const i = Math.round((x - f.minX) / STEP), j = Math.round((z - f.minZ) / STEP);
  return i >= 0 && j >= 0 && i < f.nx && j < f.nz && f.seen[i * f.nz + j] === 1;
}

const deepFrozen = (o) => Object.isFrozen(o) && Object.values(o).every((v) => typeof v !== 'object' || v === null || deepFrozen(v));

describe('border posts: where they stand', () => {
  it('has the constants and is deep-frozen', () => {
    expect(POST_R).toBe(0.2);
    expect(POST_REACH).toBe(1.6);
    expect(FOOTPATH_W).toBe(2);
    expect(TOWN_FOOTPATH).toEqual([[-2.5, 42, -55, 42]]);
    expect(deepFrozen(BORDER_POSTS)).toBe(true);
    expect(deepFrozen(TOWN_FOOTPATH)).toBe(true);
    expect(Object.keys(BORDER_POSTS)).toEqual(['neighborhood', 'woods', 'river', 'moor', 'pines']);
  });

  it('every post stands where R5 says', () => {
    for (const [areaId, posts] of Object.entries(BORDER_POSTS)) {
      const { area, mod, paths } = maps[areaId];
      const spawn = mod.SPAWN;
      for (const p of posts) {
        const at = `${areaId}/${p.id}`;
        const edge = Math.min(p.x - area.bounds.minX, area.bounds.maxX - p.x, p.z - area.bounds.minZ, area.bounds.maxZ - p.z);
        expect(edge, at).toBeGreaterThanOrEqual(2.5);
        expect(edge, at).toBeLessThanOrEqual(3.5);
        expect(nearestSide(area.bounds, p), at).toBe(p.faces);
        for (const s of paths) expect(segDist(p.x, p.z, s), at).toBeGreaterThanOrEqual(isRoad(areaId, s) ? 3.0 : 2.0);
        for (const c of area.colliders) expect(Math.hypot(p.x - c.x, p.z - c.z) - c.r, at).toBeGreaterThanOrEqual(1.2);
        for (const w of area.waters ?? []) expect(waterGap(w, p.x, p.z), at).toBeGreaterThanOrEqual(2.0);
        for (const t of [...(area.pois ?? []), ...(area.collectibles ?? []), ...(area.scenics ?? []), ...(GOLD_MICE[areaId] ?? [])]) {
          expect(Math.hypot(p.x - t.x, p.z - t.z), at).toBeGreaterThanOrEqual(3.0);
        }
        // The daily race: its start pad stands at spawn + (2, -3) (race.js); its rings
        // are generated per walk but always on a point of interest, which is covered above.
        expect(Math.hypot(p.x - (spawn.x + 2), p.z - (spawn.z - 3)), `${at} vs the race start pad`).toBeGreaterThanOrEqual(3.0);
        for (const t of area.perches ?? []) expect(Math.hypot(p.x - t.x, p.z - t.z), at).toBeGreaterThanOrEqual(2.0);
        const d = DISCS[areaId];
        if (d) expect(Math.hypot(p.x - d.cx, p.z - d.cz), at).toBeGreaterThanOrEqual(d.r + 3);
        expect(Math.hypot(p.x - spawn.x, p.z - spawn.z), at).toBeGreaterThanOrEqual(POST_REACH + 2);
        expect(reachesWithin(areaId, p.x, p.z, 1.2), at).toBe(true);
      }
    }
  });

  it('the footpath is open lawn', () => {
    const [x1, z1, x2, z2] = TOWN_FOOTPATH[0];
    expect([x1, z1]).toEqual([-2.5, 42]);
    expect(x2).toBe(-55);
    expect(maps.neighborhood.area.bounds.minX).toBe(-55);
    const n = Math.round(Math.hypot(x2 - x1, z2 - z1) / 0.5);
    for (let i = 0; i <= n; i++) {
      const x = x1 + ((x2 - x1) * i) / n, z = z1 + ((z2 - z1) * i) / n;
      const at = `footpath (${x}, ${z})`;
      for (const c of maps.neighborhood.area.colliders) {
        expect(Math.hypot(x - c.x, z - c.z) - c.r, at).toBeGreaterThanOrEqual(3.0);
      }
      expect(reaches('neighborhood', x, z), at).toBe(true);
    }
  });

  it('names the place over the edge', () => {
    const places = ['neighborhood', 'woods', 'river', 'moor', 'pines', 'gorge'];
    const pairs = [];
    const ids = new Set();
    for (const [areaId, posts] of Object.entries(BORDER_POSTS)) {
      for (const p of posts) {
        expect(places, p.id).toContain(p.to);
        expect(p.to, p.id).not.toBe(areaId);
        expect(ids.has(p.id), `${p.id} unique`).toBe(false);
        ids.add(p.id);
        pairs.push(`${areaId}>${p.to}`);
      }
    }
    expect(pairs.sort()).toEqual([
      'moor>gorge', 'moor>pines', 'moor>woods', 'moor>woods',
      'neighborhood>moor', 'neighborhood>river', 'neighborhood>woods',
      'pines>moor', 'pines>river',
      'river>neighborhood', 'river>pines', 'river>woods', 'river>woods',
      'woods>moor', 'woods>moor', 'woods>neighborhood', 'woods>neighborhood', 'woods>river', 'woods>river',
    ].sort());
    // R1: each post names the place directly over its edge, except the two
    // R2 posts that name the long path's far end (town-river and river-town-long).
    const over = { woods: { west: 'river', north: 'moor' }, river: { east: 'woods', north: 'pines' }, moor: { south: 'woods', west: 'pines', east: 'gorge' }, pines: { south: 'river', east: 'moor' }, neighborhood: { west: ['woods', 'river'], north: 'moor' } };
    const R2 = new Set(['town-river', 'river-town-long']);
    for (const [areaId, posts] of Object.entries(BORDER_POSTS)) {
      for (const p of posts) {
        if (R2.has(p.id)) continue;
        const want = over[areaId][p.faces];
        if (areaId === 'woods' && p.faces === 'east') expect(p.to, p.id).toBe('neighborhood');
        else expect([].concat(want), p.id).toContain(p.to);
      }
    }
  });

  it('twins line up across each border', () => {
    const pairsOk = new Set(['woods>river', 'river>woods', 'woods>moor', 'moor>woods', 'river>pines', 'pines>river', 'pines>moor', 'moor>pines']);
    const inWoods = (a, p) => ({ x: p.x - FRAMES[a][0], z: p.z - FRAMES[a][1] });
    let checked = 0;
    for (const [a, posts] of Object.entries(BORDER_POSTS)) {
      for (const p of posts) {
        if (!pairsOk.has(`${a}>${p.to}`)) continue;
        const wp = inWoods(a, p);
        const cands = BORDER_POSTS[p.to].filter((q) => q.to === a)
          .map((q) => ({ q, w: inWoods(p.to, q) }))
          .sort((u, v) => Math.hypot(u.w.x - wp.x, u.w.z - wp.z) - Math.hypot(v.w.x - wp.x, v.w.z - wp.z));
        expect(cands.length, p.id).toBeGreaterThan(0);
        const { q, w } = cands[0];
        const ew = p.faces === 'east' || p.faces === 'west';
        const along = Math.abs(ew ? w.z - wp.z : w.x - wp.x);
        const across = Math.abs(ew ? w.x - wp.x : w.z - wp.z);
        expect(along, `${p.id} ~ ${q.id} along`).toBeLessThanOrEqual(1);
        expect(across, `${p.id} ~ ${q.id} across`).toBeCloseTo(5, 2);
        checked++;
      }
    }
    expect(checked).toBe(12);
  });

  it('keeps clear of the Pines island and the truce stones', () => {
    const area = maps.pines.area;
    for (const p of BORDER_POSTS.pines) expect(keepOutPoint(area, p.x, p.z), p.id).toEqual({ x: p.x, z: p.z });
  });

  it('postsFor and postNear', () => {
    expect(postsFor('woods')).toHaveLength(6);
    expect(postsFor('neighborhood')).toHaveLength(3);
    expect(postsFor('river')).toHaveLength(4);
    expect(postsFor('moor')).toHaveLength(4);
    expect(postsFor('pines')).toHaveLength(2);
    expect(postsFor('island')).toEqual([]);
    expect(postsFor('__proto__')).toEqual([]);
    expect(postsFor(7)).toEqual([]);
    expect(postNear('woods', 47.5, 13.0).id).toBe('woods-town-short');
    expect(postNear('woods', 47.5, 12.8)).toBeNull();
    expect(postNear('woods', NaN, 0)).toBeNull();
  });
});

// The intruders' routes (clan-life-2) are checked once that branch has merged.
const intruders = existsSync('src/intruders.js') ? await import('../src/intruders.js') : null;

describe('border posts: intruder routes', () => {
  it.skipIf(!intruders)('keeps off the intruders\' routes', () => {
    for (const [areaId, routes] of Object.entries(intruders.INTRUDER_ROUTES)) {
      for (const [clan, r] of Object.entries(routes)) {
        for (let i = 0; i + 1 < r.length; i++) {
          for (const p of postsFor(areaId)) {
            const d = segDist(p.x, p.z, [r[i].x, r[i].z, r[i + 1].x, r[i + 1].z]);
            expect(d, `${p.id} vs ${areaId}/${clan} segment ${i}`).toBeGreaterThanOrEqual(0.8);
          }
        }
      }
    }
  });
});

describe('border posts: faces and the plan (Polish 3)', () => {
  it('every post faces one of the four ways; a misspelt facing throws instead of pointing north', () => {
    for (const p of Object.values(BORDER_POSTS).flat()) expect(FACINGS, p.id).toContain(p.faces);
    expect(FACINGS).toEqual(['north', 'south', 'east', 'west']);
    expect(() => borderPost('x', 0, 0, 'nort', 'moor')).toThrow(/x.*nort/);
    expect(() => borderPost('x', 0, 0, undefined, 'moor')).toThrow();
    expect(borderPost('x', 1, 2, 'east', 'moor')).toEqual({ id: 'x', x: 1, z: 2, faces: 'east', to: 'moor' });
  });

  it("the plan's coordinates table matches where the posts really stand", () => {
    const md = readFileSync(new URL('../docs/superpowers/plans/2026-11-01-border-crossings.md', import.meta.url), 'utf8');
    const rows = md.split('\n')
      .map((l) => l.match(/^\| [A-Za-z]+ \| `([a-z-]+)` \| (-?[\d.]+) \| (-?[\d.]+) \| (\w+) \| (\w+) \|/))
      .filter(Boolean)
      .map(([, id, x, z, faces, to]) => ({ id, x: Number(x), z: Number(z), faces, to }));
    const posts = Object.values(BORDER_POSTS).flat().map(({ id, x, z, faces, to }) => ({ id, x, z, faces, to }));
    expect(rows).toEqual(posts);
  });
});
