import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

// The same headless canvas stub every world test uses (test/flattrace.test.js).
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
        if (key === 'measureText') return () => ({ width: 10 });
        return () => {};
      },
      set: () => true,
    }),
  }),
});

const { build } = await import('../src/world/roofs.js');
const { BLOCKS, LEVELS, ROOFS_TRAVERSAL, ROOFS_COLLIDERS, YARD } = await import('../src/world/roofsplan.js');
const { STEP_MAX } = await import('../src/ground.js');
const { findFadeOccluders } = await import('../src/treefade.js');
const { castsFromBox, isTransparentMat } = await import('../src/render/rig.js');

// =============================================================================
// The Rooftops drawn (Rooftops step 2, Task 7: part one, the alley and the
// terrace). Task 8 adds the warehouse, the clock tower, the street and the
// evening, and widens PART_ONE below to every block and crossing.
// =============================================================================

const scene = new THREE.Scene();
const area = build(scene);
scene.updateMatrixWorld(true);

const meshes = [];
scene.traverse((o) => { if (o.isMesh) meshes.push(o); });
const boxOf = (o) => new THREE.Box3().setFromObject(o, true);

// What part one draws: the alley, the garages, the back yards, the
// extensions, the outriggers and the terrace.
const PART_ONE_BLOCKS = BLOCKS.filter((b) => /^(bin-1|shed|garages|alleyStair|bunker-|ext-|out-|terrace|flatHouse|dormer|roofTerrace|stack-)/.test(b.id));
const PART_ONE_CROSSINGS = ROOFS_TRAVERSAL.crossings.filter((c) => c.kind !== 'pipe');

const topOf = (b) => (b.kind === 'pitched' ? b.ridge : b.kind === 'stair' ? Math.max(b.y0, b.y1) : b.y);
const centreOf = (b) => {
  if (b.kind === 'disc') return { x: b.x, z: b.z };
  if (b.kind === 'stair') {
    const r = [...b.flights, ...b.landings];
    const x0 = Math.min(...r.map((q) => q.x0)), x1 = Math.max(...r.map((q) => q.x1));
    const z0 = Math.min(...r.map((q) => Math.min(q.z0, q.z1))), z1 = Math.max(...r.map((q) => Math.max(q.z0, q.z1)));
    return { x: (x0 + x1) / 2, z: (z0 + z1) / 2 };
  }
  return { x: (b.x0 + b.x1) / 2, z: (b.z0 + b.z1) / 2 };
};

function budgetStats(s) {
  let n = 0;
  let casters = 0;
  let triangles = 0;
  const box = new THREE.Box3();
  for (const child of s.children) {
    box.setFromObject(child);
    const eligible = castsFromBox(box);
    child.traverse((obj) => {
      if (!obj.isMesh) return;
      n++;
      const geo = obj.geometry;
      triangles += (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
      if (eligible && !isTransparentMat(obj.material) && !obj.userData.noCast) casters++;
    });
  }
  return { meshes: n, casters, triangles: Math.round(triangles) };
}

describe('the Rooftops, part one', () => {
  it('each block\'s top is drawn at its ground height', () => {
    const byId = new Map();
    for (const m of meshes) {
      const id = m.userData.block;
      if (!id) continue;
      if (!byId.has(id)) byId.set(id, []);
      byId.get(id).push(m);
    }
    for (const b of PART_ONE_BLOCKS) expect(byId.has(b.id), b.id).toBe(true);
    const blocks = new Map(BLOCKS.map((b) => [b.id, b]));
    for (const [id, list] of byId) {
      const b = blocks.get(id);
      expect(b, id).toBeTruthy();
      for (const m of list) {
        const box = boxOf(m);
        expect(Math.abs(box.max.y - topOf(b)), `${id} top ${box.max.y}`).toBeLessThanOrEqual(0.03);
        // ...and over its own footprint
        const c = centreOf(b);
        expect(Math.abs((box.min.x + box.max.x) / 2 - c.x), `${id} x`).toBeLessThanOrEqual(0.3);
        expect(Math.abs((box.min.z + box.max.z) / 2 - c.z), `${id} z`).toBeLessThanOrEqual(0.3);
      }
    }
    // the pitched roof's slates rise to the ridge, never past it
    const slates = byId.get('terrace');
    expect(Math.max(...slates.map((m) => boxOf(m).max.y))).toBeCloseTo(LEVELS.RIDGE, 2);
  });

  it('each crossing is drawn along its rail', () => {
    const byId = new Map();
    for (const m of meshes) if (m.userData.crossing) byId.set(m.userData.crossing, [...(byId.get(m.userData.crossing) ?? []), m]);
    for (const c of PART_ONE_CROSSINGS) expect(byId.has(c.id), c.id).toBe(true);
    const crossings = new Map(ROOFS_TRAVERSAL.crossings.map((c) => [c.id, c]));
    for (const [id, list] of byId) {
      const c = crossings.get(id);
      expect(c, id).toBeTruthy();
      expect(list, id).toHaveLength(1);
      const box = boxOf(list[0]);
      for (const p of [c.points[0], c.points[c.points.length - 1]]) {
        expect(box.distanceToPoint(new THREE.Vector3(p.x, p.y, p.z)), `${id} end ${p.x},${p.z}`).toBeLessThanOrEqual(0.3);
      }
      // a rail, not a slab: its box is no wider than a board across the rail
      const size = box.getSize(new THREE.Vector3());
      expect(Math.min(size.x, size.z), id).toBeLessThanOrEqual(0.6);
    }
  });

  it('each hop has its mark within 0.5 m of its take-off', () => {
    // every merged mark mesh says which vertices each hop's mark put in it
    const marked = meshes.filter((m) => m.userData.markRanges);
    const glow = marked.find((m) => m.userData.markGlow);
    expect(glow).toBeTruthy();
    expect(marked.length).toBeGreaterThan(1);
    const v = new THREE.Vector3();
    const pointsOf = (m, r) => Array.from({ length: r.count }, (_, i) => v.fromBufferAttribute(m.geometry.attributes.position, r.start + i).applyMatrix4(m.matrixWorld).clone());
    const hops = area.traversal.hops;
    expect(hops).toHaveLength(ROOFS_TRAVERSAL.gaps.length + ROOFS_TRAVERSAL.climbs.length + ROOFS_TRAVERSAL.drops.length);
    expect(glow.userData.markRanges).toHaveLength(hops.length);
    for (const h of hops) {
      // its glow disc: one per hop, centred on the take-off, just above it
      const g = glow.userData.markRanges.filter((r) => r.id === h.id);
      expect(g, h.id).toHaveLength(1);
      expect(g[0].kind, h.id).toBe(h.mark);
      const disc = pointsOf(glow, g[0]);
      const c = disc.reduce((t, p) => t.add(p), new THREE.Vector3()).divideScalar(disc.length);
      expect(Math.hypot(c.x - h.x0, c.z - h.z0), `${h.id} glow centre`).toBeLessThanOrEqual(0.05);
      expect(Math.abs(c.y - h.y0 - 0.03), `${h.id} glow height`).toBeLessThanOrEqual(0.05);
      // its pieces: their own vertices, within 0.5 m of the take-off across, standing on it
      const box = new THREE.Box3();
      for (const m of marked) {
        if (m === glow) continue;
        for (const r of m.userData.markRanges) if (r.id === h.id) for (const p of pointsOf(m, r)) box.expandByPoint(p);
      }
      expect(box.isEmpty(), `${h.id} pieces`).toBe(false);
      const mid = box.getCenter(new THREE.Vector3());
      expect(Math.hypot(mid.x - h.x0, mid.z - h.z0), `${h.id} pieces across`).toBeLessThanOrEqual(0.5);
      expect(Math.abs(box.min.y - h.y0), `${h.id} pieces height`).toBeLessThanOrEqual(0.2);
    }
  });

  it('no chimney stack and no yard wall is drawn over ground she walks on', () => {
    // sampled from above: wherever the stack's (or the walls') own mesh is,
    // the ground there is as high as its top, or the void under the slates
    const rc = new THREE.Raycaster();
    const down = new THREE.Vector3(0, -1, 0);
    const checks = [
      ...meshes.filter((m) => /^stack-/.test(m.userData.block ?? '')).map((m) => [m, LEVELS.RIDGE]),
      ...meshes.filter((m) => m.userData.yardWalls).map((m) => [m, YARD.h]),
    ];
    expect(checks.length).toBe(8);
    for (const [m, top] of checks) {
      const box = boxOf(m);
      let drawn = 0;
      const bad = [];
      for (let x = box.min.x + 0.013; x < box.max.x; x += 0.05) {
        for (let z = box.min.z + 0.013; z < box.max.z; z += 0.05) {
          rc.set(new THREE.Vector3(x, box.max.y + 1, z), down);
          if (!rc.intersectObject(m, false).length) continue;
          drawn++;
          const y = area.ground.y(x, z);
          if (!(y >= top - STEP_MAX || Math.abs(y - LEVELS.VOID) < 1e-6)) bad.push([+x.toFixed(2), +z.toFixed(2), y]);
        }
      }
      expect(drawn, m.name).toBeGreaterThan(50);
      expect(bad.slice(0, 4), m.name).toEqual([]);
    }
  });

  it('nothing on the Rooftops fades', () => {
    expect(meshes.filter((m) => m.userData.window)).toEqual([]);
    const found = findFadeOccluders(scene);
    expect(found.length).toBeGreaterThan(0);
    // lamp posts only, so far (Task 8 adds the clock tower's body)
    for (const f of found) expect(f.obj.userData.lampGlobeY, f.obj.name).toBeGreaterThan(0);
  });

  it('the record has every key an area has', () => {
    const keys = [
      'name', 'colliders', 'bounds', 'spawn', 'boxes', 'waters', 'waterFx', 'pois', 'collectibles', 'scenics',
      'critterSpawns', 'moments', 'puddles', 'groundBounce', 'skyDusk', 'tippables', 'perches',
      'ground', 'traversal', 'anchors', 'evening', 'strays', 'skySunset', 'duskLight',
    ];
    for (const k of keys) expect(area, k).toHaveProperty(k);
    expect(area.name).toBe('The Rooftops');
    expect(area.evening).toBe(true);
    expect(area.strays).toBe(false);
    expect(area.waters).toEqual([]);
    expect(area.waterFx).toEqual([]);
    expect(area.critterSpawns).toEqual([]);
    expect(area.moments).toEqual([]);
    for (const k of ['boxes', 'pois', 'collectibles', 'scenics', 'puddles', 'tippables', 'perches', 'colliders']) {
      expect(Array.isArray(area[k]), k).toBe(true);
    }
    expect(area.spawn).toEqual({ x: 4, z: 41 });
    expect(area.bounds).toEqual({ minX: -46, maxX: 46, minZ: -50, maxZ: 46 });
    expect(typeof area.ground.y).toBe('function');
    expect(area.ground.y(4, 41)).toBe(0);
    expect(area.traversal.crossings).toHaveLength(ROOFS_TRAVERSAL.crossings.length);
    // the plan's colliders, and only those (the plan's tests hold them to R6)
    expect(area.colliders).toEqual(ROOFS_COLLIDERS.map((c) => ({ ...c })));
    for (const c of area.colliders) {
      const ys = [[0, 0], [c.r, 0], [-c.r, 0], [0, c.r], [0, -c.r]].map(([dx, dz]) => area.ground.y(c.x + dx, c.z + dz));
      expect(Math.max(...ys) - Math.min(...ys), `${c.x},${c.z}`).toBeLessThan(0.05);
    }
  });

  it('part one is well inside the place\'s budget, and draws nothing from Math.random', () => {
    const stats = budgetStats(scene);
    // the whole place aims for 300 / 120 / 60,000 after Task 8
    expect(stats.meshes).toBeLessThanOrEqual(130);
    expect(stats.casters).toBeLessThanOrEqual(60);
    expect(stats.triangles).toBeLessThanOrEqual(30000);
    const s2 = new THREE.Scene(); // its own uuid, before the count starts
    const real = Math.random;
    let draws = 0;
    Math.random = () => { draws++; return real(); };
    let again;
    try {
      build(s2);
      again = budgetStats(s2);
    } finally {
      Math.random = real;
    }
    expect(draws).toBe(0);
    expect(again).toEqual(stats);
  });
});
