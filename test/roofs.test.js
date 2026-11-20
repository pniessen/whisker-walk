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
const { BLOCKS, LEVELS, ROOFS_TRAVERSAL, ROOFS_COLLIDERS } = await import('../src/world/roofsplan.js');
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
    const marks = new Map();
    scene.traverse((o) => { if (o.userData.mark) marks.set(o.userData.mark.id, o); });
    const glows = meshes.filter((m) => m.userData.markGlow);
    expect(glows.length).toBeGreaterThan(0);
    const glowPts = [];
    for (const g of glows) {
      const pos = g.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) glowPts.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(g.matrixWorld));
    }
    expect(area.traversal.hops).toHaveLength(ROOFS_TRAVERSAL.gaps.length + ROOFS_TRAVERSAL.climbs.length + ROOFS_TRAVERSAL.drops.length);
    for (const h of area.traversal.hops) {
      const m = marks.get(h.id);
      expect(m, h.id).toBeTruthy();
      expect(m.userData.mark.kind, h.id).toBe(h.mark);
      const at = m.getWorldPosition(new THREE.Vector3());
      expect(at.distanceTo(new THREE.Vector3(h.x0, h.y0, h.z0)), h.id).toBeLessThanOrEqual(0.5);
      // and its glow is drawn there, on the take-off's level
      const near = glowPts.some((p) => Math.hypot(p.x - h.x0, p.z - h.z0) <= 0.75 && Math.abs(p.y - h.y0) <= 0.15);
      expect(near, `${h.id} glow`).toBe(true);
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
    // the plan's colliders are all there, each on one level (R6)
    for (const c of ROOFS_COLLIDERS) expect(area.colliders).toContainEqual(c);
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
