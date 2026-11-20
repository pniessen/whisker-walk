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
const {
  BLOCKS, LEVELS, ROOFS_TRAVERSAL, ROOFS_COLLIDERS, YARD, STREETS, VANE, VANE_TIP, ROOFS_SPAWN,
  ROOFS_POIS, ROOFS_COLLECTIBLES, ROOFS_SCENICS, ROOFS_PERCHES, ROOFS_DISCOVERIES,
} = await import('../src/world/roofsplan.js');
const { STEP_MAX } = await import('../src/ground.js');
const { findFadeOccluders } = await import('../src/treefade.js');
const { castsFromBox, isTransparentMat } = await import('../src/render/rig.js');
const { mergeStaticProps } = await import('../src/render/mergeprops.js');
const { clearSpot } = await import('../src/world/spots.js');
const { BASE_ABILITIES } = await import('../src/traversal.js');
const { floodTraversal } = await import('./helpers/traversalflood.js');

// =============================================================================
// The Rooftops drawn (Rooftops step 2). Task 7: part one, the alley and the
// terrace. Task 8: part two (the corner shop, the warehouse, the clock tower,
// the street below, the far town, the six discoveries) and the rest of the
// record. Every block and every crossing is drawn.
// =============================================================================

const scene = new THREE.Scene();
const area = build(scene);
scene.updateMatrixWorld(true);

const meshes = [];
scene.traverse((o) => { if (o.isMesh) meshes.push(o); });
const boxOf = (o) => new THREE.Box3().setFromObject(o, true);

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

// Measured 2026-11-20 (Task 8), the whole place, as test/budget.test.js counts
// it. Part one (Task 7) was 76 / 42 / 13,284. Part two adds the corner shop,
// the warehouse and its roof, the tower, the street below with its bus, the
// far town (3,992 triangles, one unlit mesh) and the discoveries. The build
// runs inside withLocalUuids, so it draws nothing from Math.random.
const MEASURED_BUILT = { meshes: 113, casters: 67, triangles: 32202 };
const MEASURED_MERGED = { meshes: 57, casters: 30, triangles: 32202 };
const MEASURED_DRAWS = 0;

let flood0 = null;
const baseFlood = () => (flood0 ??= floodTraversal(area, { abilities: BASE_ABILITIES }));

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

describe('the Rooftops drawn', () => {
  it('each block\'s top is drawn at its ground height', () => {
    const byId = new Map();
    for (const m of meshes) {
      const id = m.userData.block;
      if (!id) continue;
      if (!byId.has(id)) byId.set(id, []);
      byId.get(id).push(m);
    }
    for (const b of BLOCKS) expect(byId.has(b.id), b.id).toBe(true);
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
    for (const c of ROOFS_TRAVERSAL.crossings) expect(byId.has(c.id), c.id).toBe(true);
    const crossings = new Map(ROOFS_TRAVERSAL.crossings.map((c) => [c.id, c]));
    for (const [id, list] of byId) {
      const c = crossings.get(id);
      expect(c, id).toBeTruthy();
      expect(list, id).toHaveLength(1);
      const box = boxOf(list[0]);
      for (const p of [c.points[0], c.points[c.points.length - 1]]) {
        expect(box.distanceToPoint(new THREE.Vector3(p.x, p.y, p.z)), `${id} end ${p.x},${p.z}`).toBeLessThanOrEqual(0.3);
      }
      // a rail, not a slab: no vertex lies more than 0.6 m across the rail
      // (from the line through its ends, seen from above; pipe-1 runs at a slant)
      const a = c.points[0];
      const e = c.points[c.points.length - 1];
      const len = Math.hypot(e.x - a.x, e.z - a.z);
      const [ux, uz] = [(e.x - a.x) / len, (e.z - a.z) / len];
      const pos = list[0].geometry.attributes.position;
      const v = new THREE.Vector3();
      let across = 0;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(list[0].matrixWorld);
        across = Math.max(across, Math.abs((v.x - a.x) * uz - (v.z - a.z) * ux));
      }
      expect(across, id).toBeLessThanOrEqual(0.6);
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

  it('the tower is the highest thing, and only its body fades', () => {
    // the vane's tip is the top of the place, and nothing but the tower reaches its top level
    const v = new THREE.Vector3();
    const peak = new THREE.Vector3(0, -Infinity, 0);
    const high = [];
    for (const m of meshes) {
      const pos = m.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
        if (v.y > peak.y) peak.copy(v);
        if (v.y >= LEVELS.TOP && !(v.x >= 21.5 && v.x <= 30.5 && v.z >= -21.5 && v.z <= -12.5)) high.push([m.name, v.x, v.y, v.z]);
      }
    }
    expect(high.slice(0, 3)).toEqual([]);
    expect(peak.y).toBeCloseTo(VANE_TIP, 2);
    expect(Math.hypot(peak.x - VANE.x, peak.z - VANE.z)).toBeLessThanOrEqual(0.05);
    // a lit clock face on each side of the belfry, at about 13.3
    const clock = meshes.filter((m) => m.userData.clockFaces);
    expect(clock).toHaveLength(1);
    const cb = boxOf(clock[0]);
    expect((cb.min.y + cb.max.y) / 2).toBeCloseTo(13.3, 1);
    expect([cb.min.x < 23, cb.max.x > 29, cb.min.z < -20, cb.max.z > -14]).toEqual([true, true, true, true]);
    expect(clock[0].material.emissive.getHex()).not.toBe(0);
    // R7: no window fades; the lamp posts and the tower's body below its first ledge do
    expect(meshes.filter((m) => m.userData.window)).toEqual([]);
    const found = findFadeOccluders(scene);
    const lamps = found.filter((f) => f.obj.userData.lampGlobeY > 0);
    const rest = found.filter((f) => !(f.obj.userData.lampGlobeY > 0));
    expect(lamps).toHaveLength(4); // the alley's, and three in the street below
    expect(rest).toHaveLength(1);
    const body = rest[0];
    expect(body.shapes).toHaveLength(1);
    expect(body.shapes[0]).toMatchObject({ t: 'cyl', y0: LEVELS.WAREHOUSE, y1: 12.3 });
    expect(Math.hypot(body.x - VANE.x, body.z - VANE.z)).toBeLessThan(0.01);
    const parts = [];
    body.obj.traverse((o) => { if (o.isMesh) parts.push(o); });
    expect(parts.length).toBeGreaterThan(0);
    for (const p of parts) {
      const box = boxOf(p);
      expect(box.min.y, p.name).toBeGreaterThanOrEqual(LEVELS.WAREHOUSE - 0.01);
      expect(box.max.y, p.name).toBeLessThanOrEqual(12.3 + 0.01);
    }
    // it is its own top-level group, so the walk's prop merge keeps its mesh
    expect(body.obj.parent).toBe(scene);
  });

  it('the street below is outside every walk region and has its lamps and the bus', () => {
    const f = floodTraversal(area, { abilities: { longLeap: true, steady: true, climb: 2.2 } });
    const got = f.reachable(f.regionAt(ROOFS_SPAWN.x, ROOFS_SPAWN.z));
    let checked = 0;
    for (const s of STREETS) {
      for (let x = s.x0 + 0.5; x < s.x1; x += 1) {
        for (let z = s.z0 + 0.5; z < s.z1; z += 1) {
          if (area.ground.y(x, z) !== LEVELS.STREET) continue;
          checked++;
          expect([x, z, got.has(f.regionAt(x, z))]).toEqual([x, z, false]);
        }
      }
    }
    expect(checked).toBeGreaterThan(1000);
    // three lamps down in the street, lit at dusk like any lampPost
    const p = new THREE.Vector3();
    const lamps = [];
    scene.traverse((o) => { if (o.userData.lampGlobeY > 0) lamps.push(o.getWorldPosition(new THREE.Vector3())); });
    const down = lamps.filter((l) => Math.abs(l.y - LEVELS.STREET) < 1e-6);
    expect(down).toHaveLength(3);
    for (const l of down) expect(STREETS.some((s) => l.x > s.x0 && l.x < s.x1 && l.z > s.z0 && l.z < s.z1), `${l.x},${l.z}`).toBe(true);
    // the road, as the street blocks' ground
    for (const id of ['street', 'sideStreet']) {
      const road = meshes.filter((m) => m.userData.block === id);
      expect(road, id).toHaveLength(1);
      expect(road[0].userData.ground, id).toBe(true);
    }
    // one bus: one mesh, its windows lit, casting nothing, never merged, on the road
    const bus = meshes.filter((m) => m.userData.bus);
    expect(bus).toHaveLength(1);
    expect(area.bus).toBe(bus[0]);
    expect(bus[0].userData.noCast).toBe(true);
    expect(bus[0].userData.noMerge).toBe(true);
    expect(bus[0].material.emissiveMap || bus[0].material.emissive.getHex()).toBeTruthy();
    const bb = boxOf(bus[0]);
    expect(bb.min.y).toBeCloseTo(LEVELS.STREET, 1);
    const street = STREETS[0];
    expect(bb.min.z).toBeGreaterThan(street.z0);
    expect(bb.max.z).toBeLessThan(street.z1);
    bus[0].getWorldPosition(p);
    expect(p.y).toBeCloseTo(LEVELS.STREET, 5);
    // the far town: one mesh, casting nothing
    const town = meshes.filter((m) => m.userData.townBand);
    expect(town).toHaveLength(1);
    expect(town[0].userData.noCast).toBe(true);
    expect(town[0].parent).toBe(scene);
  });

  it('every POI is in the walk region of the spawn', () => {
    const f = baseFlood();
    const spawnR = f.regionAt(ROOFS_SPAWN.x, ROOFS_SPAWN.z);
    expect(area.pois).toHaveLength(13);
    expect(area.pois).toEqual(ROOFS_POIS.map((q) => ({ ...q })));
    for (const q of area.pois) {
      expect([q.x, q.z, f.regionAt(q.x, q.z)]).toEqual([q.x, q.z, spawnR]);
      // the walk's clearSpot leaves each where it is (clear of every collider and the edge)
      const c = clearSpot(q, area.colliders, area.bounds, area.waters);
      expect([c.x, c.z]).toEqual([q.x, q.z]);
    }
  });

  it('every collectible, scenic and discovery anchor is reached without Long Leap', () => {
    const f = baseFlood();
    const got = f.reachable(f.regionAt(ROOFS_SPAWN.x, ROOFS_SPAWN.z));
    const reached = (x, z, y = area.ground.y(x, z)) => got.has(f.regionAt(x, z, y));
    expect(area.collectibles).toEqual(ROOFS_COLLECTIBLES.map((c) => ({ ...c })));
    expect(area.collectibles).toHaveLength(5);
    const plain = /^[a-z][a-z ’'-]+$/;
    for (const c of area.collectibles) {
      expect(c.label, c.id).toMatch(plain);
      expect(c.y, c.id).toBeUndefined(); // the walk adds the ground under it
      expect([c.id, reached(c.x, c.z)]).toEqual([c.id, true]);
    }
    const inAlley = area.collectibles.filter((c) => area.ground.y(c.x, c.z) === LEVELS.GROUND && c.z > 34);
    const onRoofs = area.collectibles.filter((c) => area.ground.y(c.x, c.z) >= LEVELS.GARAGE);
    expect([inAlley.length, onRoofs.length]).toEqual([1, 4]);
    expect(area.scenics).toEqual(ROOFS_SCENICS.map((c) => ({ ...c })));
    expect(area.scenics.map((s) => s.label)).toEqual(['the clock tower', 'the warehouse roof', 'the terrace roofs']);
    for (const s of area.scenics) expect([s.id, reached(s.x, s.z)]).toEqual([s.id, true]);
    const d = area.anchors.discoveries;
    expect(d).toEqual(ROOFS_DISCOVERIES);
    expect(Object.keys(d)).toEqual(['garden', 'loft', 'vane', 'skylight', 'telescope', 'chimney']);
    for (const [id, q] of Object.entries(d)) {
      expect([id, Math.abs(area.ground.y(q.x, q.z) - q.y) <= 1e-6]).toEqual([id, true]);
      expect([id, reached(q.x, q.z, q.y)]).toEqual([id, true]);
    }
  });

  it('the perches are the alley crates, the garden bench and the telescope crate, each on one level', () => {
    expect(area.perches).toEqual(ROOFS_PERCHES.map((q) => ({ ...q })));
    expect(area.perches.map((q) => q.kind)).toEqual(['crate', 'crate', 'crate', 'crate', 'furniture', 'crate']);
    for (const q of area.perches) {
      const ys = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => area.ground.y(q.x + 0.4 * Math.cos(k * Math.PI / 4), q.z + 0.4 * Math.sin(k * Math.PI / 4)));
      expect([q.x, q.z, Math.max(...ys) - Math.min(...ys)]).toEqual([q.x, q.z, 0]);
      expect(q.y).toBeGreaterThan(0.3);
      expect(q.y).toBeLessThan(1.6);
    }
  });

  it('the record has every key an area has', () => {
    const keys = [
      'name', 'colliders', 'bounds', 'spawn', 'boxes', 'waters', 'waterFx', 'pois', 'collectibles', 'scenics',
      'critterSpawns', 'moments', 'puddles', 'groundBounce', 'skyDusk', 'tippables', 'perches',
      'ground', 'traversal', 'anchors', 'evening', 'strays', 'skySunset', 'duskLight', 'life',
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
    expect(area.skyDusk).toEqual({ top: 0x1f2a52, horizon: 0x8a5a6a });
    expect(area.skySunset).toEqual({ top: 0x4a5a8c, horizon: 0xe89a6a });
    expect(area.duskLight).toEqual({ fogNear: 40, fogFar: 140 });
    expect(typeof area.life).toBe('function');
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

  it('the built counts are pinned, within the aim (300 / 120 / 60,000)', () => {
    const built = budgetStats(scene);
    const mergedScene = new THREE.Scene();
    build(mergedScene);
    mergeStaticProps(mergedScene);
    const merged = budgetStats(mergedScene);
    expect(built).toEqual(MEASURED_BUILT);
    expect(merged).toEqual(MEASURED_MERGED);
    expect(built.meshes).toBeLessThanOrEqual(300);
    expect(built.casters).toBeLessThanOrEqual(120);
    expect(built.triangles).toBeLessThanOrEqual(60000);
    // the tower's body keeps its own mesh through the merge, so it can still fade
    const body = findFadeOccluders(mergedScene).filter((f) => !(f.obj.userData.lampGlobeY > 0));
    expect(body).toHaveLength(1);
    let n = 0;
    body[0].obj.traverse((o) => { if (o.isMesh) n++; });
    expect(n).toBeGreaterThan(0);
  });

  it(`the build draws ${MEASURED_DRAWS} times on Math.random`, () => {
    const stats = budgetStats(scene);
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
    expect(draws).toBe(MEASURED_DRAWS);
    expect(again).toEqual(stats);
  });
});
