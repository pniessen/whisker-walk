import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

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

const moor = await import('../src/world/moor.js');
const pines = await import('../src/world/pines.js');
const { waterGap } = await import('../src/world/builder.js');
const { isWalkableAt } = await import('../src/player.js');
const { FRAMES } = await import('../src/world/lake.js');
const { DISCS } = await import('../src/rivalclans.js');
const { keepOutPoint } = await import('../src/keepout.js');
const { flatFootprints } = await import('../src/render/grass.js');
const { ZOOM_STEPS } = await import('../src/camzoom.js');

const { MOOR_TRAIL, MOOR_GORGE_TRAIL, MOOR_PATHS, MOOR_WATERS, moorTrees, moorHeather, moorGorse, moorReeds } = moor;
// The Moor's beds also keep off the trail to the Gorge (Gorge part 2, Task 12),
// which is filtered last in the same way.
const MOOR_BOTH = [...MOOR_TRAIL, ...MOOR_GORGE_TRAIL];
const { PINES_TRAIL, PINES_PATHS, PINES_WATERS, TRUCE_PATH, pinesTrees, pinesUndergrowth, pinesReeds } = pines;

const before = JSON.parse(readFileSync(
  fileURLToPath(new URL('./fixtures/trail-scatter-before.json', import.meta.url)), 'utf8'));

function segDist(x, z, [x1, z1, x2, z2]) {
  const dx = x2 - x1, dz = z2 - z1;
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (z - z1) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(x - (x1 + t * dx), z - (z1 + t * dz));
}
const nearest = (segs, x, z) => Math.min(...segs.map((s) => segDist(x, z, s)));

const MAPS = {
  moor: { mod: moor, trail: MOOR_TRAIL, waters: MOOR_WATERS },
  pines: { mod: pines, trail: PINES_TRAIL, waters: PINES_WATERS },
};
const built = {};
for (const [id, m] of Object.entries(MAPS)) {
  const scene = new THREE.Scene();
  built[id] = { scene, area: m.mod.build(scene) };
}

// Flood-fill the cells a grounded cat may stand on (player.js's own rule) on a
// 0.5 m grid from the map's spawn.
const STEP = 0.5;
function flood(a, spawn) {
  const { minX, maxX, minZ, maxZ } = a.bounds;
  const nx = Math.round((maxX - minX) / STEP) + 1;
  const nz = Math.round((maxZ - minZ) / STEP) + 1;
  const seen = new Uint8Array(nx * nz);
  const ok = (i, j) => isWalkableAt(a, minX + i * STEP, minZ + j * STEP);
  const stack = [[Math.round((spawn.x - minX) / STEP), Math.round((spawn.z - minZ) / STEP)]];
  seen[stack[0][0] * nz + stack[0][1]] = 1;
  while (stack.length) {
    const [i, j] = stack.pop();
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const p = i + di, q = j + dj;
      if (p < 0 || q < 0 || p >= nx || q >= nz || seen[p * nz + q] || !ok(p, q)) continue;
      seen[p * nz + q] = 1;
      stack.push([p, q]);
    }
  }
  return (x, z) => {
    const i = Math.round((x - minX) / STEP), j = Math.round((z - minZ) / STEP);
    return i >= 0 && j >= 0 && i < nx && j < nz && seen[i * nz + j] === 1;
  };
}

// Every 0.5 m along each segment, ends included.
function samples(trail) {
  const out = [];
  for (const [x1, z1, x2, z2] of trail) {
    const len = Math.hypot(x2 - x1, z2 - z1);
    const n = Math.ceil(len / 0.5);
    for (let i = 0; i <= n; i++) out.push([x1 + ((x2 - x1) * i) / n, z1 + ((z2 - z1) * i) / n]);
  }
  return out;
}

const woodsFrame = (areaId, [x, z]) => [x - FRAMES[areaId][0], z - FRAMES[areaId][1]];

describe('the Pines-Moor trail: where it runs', () => {
  it('is deep-frozen, 2 m wide, and kept out of both path lists', () => {
    expect(PINES_TRAIL).toEqual([[33, -11, 50, -11]]);
    expect(MOOR_TRAIL).toEqual([[-50, -11, -47, -9.6], [-47, -9.6, -30, -12], [-30, -12, 4, -7]]);
    for (const t of [PINES_TRAIL, MOOR_TRAIL]) {
      expect(Object.isFrozen(t)).toBe(true);
      for (const s of t) expect(Object.isFrozen(s)).toBe(true);
    }
    expect(pines.TRAIL_W).toBe(2);
    expect(moor.TRAIL_W).toBe(2);
    for (const s of PINES_TRAIL) expect(PINES_PATHS).not.toContainEqual(s);
    for (const s of MOOR_TRAIL) expect(MOOR_PATHS).not.toContainEqual(s);
  });

  it('the trail crosses the border at one point', () => {
    expect(PINES_TRAIL.at(-1).slice(2)).toEqual([50, -11]);
    expect(MOOR_TRAIL[0].slice(0, 2)).toEqual([-50, -11]);
    expect(woodsFrame('pines', [50, -11])).toEqual(woodsFrame('moor', [-50, -11]));
  });

  it('the Pines end joins the east path, and the Moor end the bridge path', () => {
    expect(segDist(33, -11, [18, -26, 40, -4])).toBeLessThan(0.01);
    expect(PINES_TRAIL[0].slice(0, 2)).toEqual([33, -11]);
    expect(MOOR_PATHS).toContainEqual([34, -8, 4, -7]);
    expect(MOOR_TRAIL.at(-1).slice(2)).toEqual([4, -7]);
  });
});

describe.each(Object.keys(MAPS))('the %s trail is open ground', (id) => {
  const { mod, trail, waters } = MAPS[id];
  const { area } = built[id];
  const reached = flood(area, mod.SPAWN);
  const pts = samples(trail);
  const undecked = waters.map((w) => ({ ...w, decks: [] }));

  it('keeps 1.2 m off every collider and 2 m off every water', () => {
    for (const [x, z] of pts) {
      for (const c of area.colliders) {
        expect(Math.hypot(x - c.x, z - c.z) - c.r, `${id} (${x}, ${z}) collider`).toBeGreaterThanOrEqual(1.2);
      }
      for (const w of undecked) expect(waterGap(w, x, z), `${id} (${x}, ${z}) ${w.id}`).toBeGreaterThanOrEqual(2);
    }
  });

  it('stays outside the camp disc by its radius plus 3 m', () => {
    const d = DISCS[id];
    for (const [x, z] of pts) expect(Math.hypot(x - d.cx, z - d.cz)).toBeGreaterThanOrEqual(d.r + 3);
  });

  it('is reached from the spawn by walking, with no wading', () => {
    for (const [x, z] of pts) expect(reached(x, z), `${id} (${x}, ${z})`).toBe(true);
  });
});

describe('the Pines trail keeps off the Pines\' reserved ground', () => {
  it('is outside PINES_KEEP_OUT and 4.5 m off the truce path', () => {
    const { area } = built.pines;
    for (const [x, z] of samples(PINES_TRAIL)) {
      expect(keepOutPoint(area, x, z)).toEqual({ x, z });
      expect(nearest(TRUCE_PATH, x, z)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('the trail clearing', () => {
  // The six trees R15 names, by position.
  const DROPPED = {
    near: [[25.08, -8.71], [42.73, -8.57], [46.61, -8.27]],
    stand: [[43.48, -13.43]],
    moorPines: [[-46.95, -11.93], [-46.65, -7.43]],
  };
  const without = (list, drops) => list.filter((t) => !drops.some(([x, z]) => t.x === x && t.z === z));
  const beds = (list, trail) => list.filter((s) => nearest(trail, s.x, s.z) >= 1.8);

  it('drops exactly these trees and beds, and nothing else moves', () => {
    expect(before.heather).toHaveLength(398);
    expect(before.pinesReeds).toHaveLength(160);
    const pt = pinesTrees(), mt = moorTrees(), pu = pinesUndergrowth();
    expect(pt.near).toEqual(without(before.pinesNear, DROPPED.near));
    expect(pt.stand).toEqual(without(before.pinesStand, DROPPED.stand));
    expect(mt.pines).toEqual(without(before.moorPines, DROPPED.moorPines));
    expect(mt.thorns).toEqual(before.thorns);
    expect(moorHeather()).toEqual(beds(before.heather, MOOR_BOTH));
    expect(moorGorse()).toEqual(beds(before.gorse, MOOR_BOTH));
    expect(moorReeds()).toEqual(beds(before.moorReeds, MOOR_BOTH));
    expect(pu.ferns).toEqual(beds(before.ferns, PINES_TRAIL));
    expect(pu.toadstools).toEqual(beds(before.toadstools, PINES_TRAIL));
    expect(pinesReeds()).toEqual(beds(before.pinesReeds, PINES_TRAIL));
  });

  it('removed the counts the measurements promised', () => {
    // as measured: the plan's 7 counted only cushions within 1 m; 12, then 13
    // with the trail to the Gorge (Task 12), which takes one heather and one gorse
    expect(before.heather.length - moorHeather().length).toBe(13);
    expect(before.gorse.length - moorGorse().length).toBe(1);
    expect(before.moorReeds.length - moorReeds().length).toBe(before.moorReeds.length - beds(before.moorReeds, MOOR_TRAIL).length);
    expect(before.ferns.length - pinesUndergrowth().ferns.length).toBe(2);
    expect(before.toadstools.length - pinesUndergrowth().toadstools.length).toBe(2);
  });

  it('the trail is clear: no canopy over it and no bed within 1.8 m', () => {
    const camBack = ZOOM_STEPS[2].dist;
    const stretch = ([x1, z1, x2, z2]) => {
      const len = Math.hypot(x2 - x1, z2 - z1);
      const ux = ((x2 - x1) / len) * camBack, uz = ((z2 - z1) / len) * camBack;
      return [x1 - ux, z1 - uz, x2 + ux, z2 + uz];
    };
    const camTrail = PINES_TRAIL.map(stretch);
    const { near, stand } = pinesTrees();
    for (const t of [...near, ...stand]) {
      expect(nearest(camTrail, t.x, t.z), `pine (${t.x}, ${t.z})`).toBeGreaterThanOrEqual(1 + 1.3 * t.scale + 0.5);
    }
    const { thorns, pines: mp } = moorTrees();
    for (const t of thorns) expect(nearest(MOOR_TRAIL, t.x, t.z)).toBeGreaterThanOrEqual(1 + 1.6 * t.scale + 0.5);
    for (const t of mp) expect(nearest(MOOR_TRAIL, t.x, t.z)).toBeGreaterThanOrEqual(1 + 1.3 * t.scale + 0.5);
    const pu = pinesUndergrowth();
    for (const s of [...pu.ferns, ...pu.toadstools, ...pinesReeds()]) {
      expect(nearest(PINES_TRAIL, s.x, s.z)).toBeGreaterThanOrEqual(1.8);
    }
    for (const s of [...moorHeather(), ...moorGorse(), ...moorReeds()]) {
      expect(nearest(MOOR_TRAIL, s.x, s.z)).toBeGreaterThanOrEqual(1.8);
    }
  });
});

describe('each map draws its trail', () => {
  it.each([['moor', MOOR_TRAIL], ['pines', PINES_TRAIL]])('%s has a 2 m strip at every segment midpoint', (id, trail) => {
    const strips = flatFootprints(built[id].scene).filter((f) => f.kind === 'strip');
    for (const [x1, z1, x2, z2] of trail) {
      const mx = (x1 + x2) / 2, mz = (z1 + z2) / 2;
      const hit = strips.find((f) => Math.hypot(f.x - mx, f.z - mz) < 0.01);
      expect(hit, `${id} strip at (${mx}, ${mz})`).toBeTruthy();
      expect(hit.halfW).toBeCloseTo(1, 6);
      expect(hit.halfL).toBeCloseTo(Math.hypot(x2 - x1, z2 - z1) / 2, 6);
    }
  });
});
