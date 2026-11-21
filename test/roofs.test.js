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
  // createPlayer (the first-roof tour, below) listens on it
  addEventListener() {},
  pointerLockElement: null,
  exitPointerLock() {},
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
    const [realNow, realPerf] = [Date.now, performance.now];
    let draws = 0;
    let clocks = 0;
    Math.random = () => { draws++; return real(); };
    Date.now = () => { clocks++; return realNow(); };
    performance.now = () => { clocks++; return realPerf.call(performance); };
    let again;
    try {
      build(s2);
      again = budgetStats(s2);
    } finally {
      Math.random = real;
      Date.now = realNow;
      performance.now = realPerf;
    }
    expect(draws).toBe(MEASURED_DRAWS);
    expect(clocks).toBe(0); // the bus and the evening are functions of walk time, never the clock
    expect(again).toEqual(stats);
  });
});

// =============================================================================
// Task 10: every per-area list. ROOFS_REGISTRATION holds each row in its
// table's own shape (test/fair.test.js is the model). The one row held back is
// CATALOG.areas.roofs (R1): `catalog` is null until Task 11 and step 4.
// =============================================================================
describe('The Rooftops: in every per-area list (ROOFS_REGISTRATION)', async () => {
  const { ROOFS_REGISTRATION: REG } = await import('../src/world/roofsplan.js');
  const { propsFor, yarnSpotsFor, frameColliders, allPropIds, isPropId, CARRY_KINDS, KNOCK_KINDS, REST_KINDS } = await import('../src/propsets.js');
  const { MARK_AREAS, emptyMarks } = await import('../src/marks.js');
  const { REST_LOOKS } = await import('../src/rests.js');
  const { CLOUD_AREAS, AREA_SKY } = await import('../src/render/clouds.js');
  const { ambientKind } = await import('../src/render/ambient.js');
  const { AREA_RULES } = await import('../src/render/pawprints.js');
  const { GRASS_STYLES } = await import('../src/render/grass.js');
  const { COLONY_AREAS, feedsHere } = await import('../src/colony.js');
  const { LEGENDARY_BY_AREA } = await import('../src/legendary.js');
  const { CATALOG, createProgression } = await import('../src/progression.js');
  const { isWalkableAt, CAT_RADIUS } = await import('../src/player.js');
  const set = REG.propSet;
  const plain = (v) => JSON.parse(JSON.stringify(v));
  const dist = (a, c) => Math.hypot(a.x - c.x, a.z - c.z);
  const MARGIN = 0.3;
  const got = () => baseFlood().reachable(baseFlood().regionAt(ROOFS_SPAWN.x, ROOFS_SPAWN.z));
  // the ground at a point and a small ring round it is one level
  const oneLevel = (x, z, ring = 0.4) => {
    const ys = [[0, 0], ...[0, 1, 2, 3, 4, 5, 6, 7].map((k) => [ring * Math.cos(k * Math.PI / 4), ring * Math.sin(k * Math.PI / 4)])]
      .map(([dx, dz]) => area.ground.y(x + dx, z + dz));
    return Math.max(...ys) - Math.min(...ys) < 1e-6;
  };
  const reachedAt = (x, z) => got().has(baseFlood().regionAt(x, z, area.ground.y(x, z)));
  const clear = (p, extra = MARGIN) => area.colliders.every((c) => dist(p, c) >= c.r + CAT_RADIUS + extra);
  // a spot beside a collider-held markable the cat can stand on
  const standSide = (m) => {
    for (let k = 0; k < 16; k++) {
      const p = { x: m.x + Math.cos((k * Math.PI) / 8) * 1.0, z: m.z + Math.sin((k * Math.PI) / 8) * 1.0 };
      if (isWalkableAt(area, p.x, p.z) && clear(p) && oneLevel(p.x, p.z) && reachedAt(p.x, p.z)) return p;
    }
    return null;
  };

  it('each registration row is in its table', async () => {
    expect(REG.id).toBe('roofs');
    expect(propsFor('roofs')).toEqual(plain(set));
    expect(yarnSpotsFor('roofs')).toEqual(plain(REG.yarnSpots));
    expect(Object.fromEntries(Object.entries(REST_LOOKS).filter(([k]) => k.startsWith('roofs-')))).toEqual(plain(REG.restLooks));
    expect(CLOUD_AREAS).toContain('roofs');
    expect(AREA_SKY.roofs).toEqual(plain(REG.clouds));
    expect(AREA_SKY.roofs).toEqual({ clouds: 6, banks: 4 });
    expect(ambientKind('roofs')).toBe(REG.ambient);
    expect(ambientKind('roofs', { dusk: true })).toBe('moths');
    expect(AREA_RULES.roofs).toEqual(plain(REG.pawprints));
    expect(AREA_RULES.roofs).toEqual({ ground: null, path: 'gravel', strip: null });
    expect(MARK_AREAS).toContain('roofs');
    expect(emptyMarks().roofs).toEqual([]);
    // no grass, no ground tint
    expect(Object.hasOwn(GRASS_STYLES, 'roofs')).toBe(false);
    expect((await import('../src/world/roofs.js')).GRASS_HOOKS).toBeUndefined();
  });

  it('holds its row out of the catalog (R1); its view is the card shot', async () => {
    const { ROOFS_SHOTS } = await import('../src/world/roofsplan.js');
    expect(REG.catalog).toEqual({ name: 'The Rooftops', price: 100, requires: { area: 'fair', walks: 2 } });
    expect(REG.view).toBe(ROOFS_SHOTS.card);
    expect(Object.hasOwn(CATALOG.areas, 'roofs')).toBe(false);
    expect(REG.marks).toBe(true);
  });

  it('has the street areas’ prop counts, and no dog', () => {
    expect(Object.keys(set).sort()).toEqual(['carryables', 'dogYard', 'flaps', 'hides', 'keepSlots', 'knockables', 'markables', 'rests']);
    expect(set.carryables).toHaveLength(4);
    expect(set.knockables).toHaveLength(3);
    expect(set.markables).toHaveLength(3);
    expect(set.flaps.map((f) => f.kind)).toEqual(['flap']);
    expect(set.rests.map((r) => r.kind).sort()).toEqual([...REST_KINDS].sort());
    expect(set.rests.every((r) => r.mesh === true)).toBe(true);
    expect(set.hides).toHaveLength(3);
    expect(set.dogYard).toBeNull();
    expect(set.keepSlots).toEqual([]);
    expect(set.markables.every((m) => m.nearBorder === false)).toBe(true);
    for (const c of set.carryables) expect(CARRY_KINDS).toContain(c.kind);
    for (const k of set.knockables) expect(KNOCK_KINDS).toContain(k.kind);
    for (const m of set.markables) expect(['post', 'tree', 'bollard']).toContain(m.kind);
    const looks = new Set(Object.values(REST_LOOKS).map((v) => v.look));
    expect(Object.keys(REG.restLooks).sort()).toEqual(set.rests.map((r) => r.id).sort());
    for (const v of Object.values(REG.restLooks)) expect(looks.has(v.look), v.look).toBe(true);
    // ids: well-formed, namespaced by area and kind, none shared with another area
    const mine = [];
    for (const list of ['carryables', 'knockables', 'markables', 'flaps', 'rests']) {
      for (const p of set[list]) {
        expect(isPropId(p.id), p.id).toBe(true);
        expect(p.id.startsWith(`roofs-${p.kind}-`), p.id).toBe(true);
        mine.push(p.id);
      }
    }
    expect(new Set(mine).size).toBe(mine.length);
    expect(mine).toHaveLength(14);
    const taken = allPropIds();
    expect(new Set([...taken].filter((id) => id.startsWith('roofs-')))).toEqual(new Set(mine));
  });

  it('each prop sits on its own level, clear of colliders, reached without Long Leap', () => {
    const walkUps = [
      ...set.carryables.map((p) => ({ what: p.id, p })),
      ...set.rests.map((p) => ({ what: p.id, p })),
      ...set.markables.map((m) => ({ what: m.id, m, p: standSide(m) })),
    ];
    for (const { what, p, m } of walkUps) {
      expect(p, `${what} has no side to stand on`).not.toBeNull();
      expect(isWalkableAt(area, p.x, p.z), `${what} walkable`).toBe(true);
      expect(clear(p), `${what} clear of colliders`).toBe(true);
      expect(oneLevel(m ? m.x : p.x, m ? m.z : p.z), `${what} on one level`).toBe(true);
      expect(oneLevel(p.x, p.z), `${what} stand spot on one level`).toBe(true);
      expect(reachedAt(p.x, p.z), `${what} reached without Long Leap`).toBe(true);
    }
    for (const h of set.hides) {
      expect(isWalkableAt(area, h.x, h.z), `hide ${h.x},${h.z}`).toBe(true);
      expect(clear(h), `hide ${h.x},${h.z} clear`).toBe(true);
      expect(oneLevel(h.x, h.z), `hide ${h.x},${h.z} one level`).toBe(true);
      expect(reachedAt(h.x, h.z), `hide ${h.x},${h.z} reached`).toBe(true);
    }
    // a prompt's width apart
    for (let i = 0; i < walkUps.length; i++) {
      for (let j = i + 1; j < walkUps.length; j++) {
        expect(dist(walkUps[i].p, walkUps[j].p), `${walkUps[i].what} vs ${walkUps[j].what}`).toBeGreaterThanOrEqual(2.5);
      }
    }
    // clear of the spawn, the finds, the view spots and the POIs
    const anchors = [area.spawn, ...area.collectibles, ...area.scenics, ...area.pois];
    const points = [...set.carryables, ...set.knockables, ...set.markables, ...set.rests, ...set.hides, ...set.flaps, ...set.flaps.flatMap((f) => frameColliders(f))];
    for (const p of points) for (const q of anchors) expect(dist(p, q), `${p.id ?? 'prop'} ${p.x},${p.z} vs ${q.x},${q.z}`).toBeGreaterThanOrEqual(2);
    // the knockables stand on a crate perch and land on the alley, apart
    for (const k of set.knockables) {
      const perch = area.perches.find((q) => dist(q, k) <= 0.6 && Math.abs(q.y - k.y) < 0.1);
      expect(perch, `${k.id} has no perch under it`).toBeDefined();
      expect(isWalkableAt(area, k.fallTo.x, k.fallTo.z), `${k.id} lands`).toBe(true);
      expect(area.ground.y(k.fallTo.x, k.fallTo.z), `${k.id} lands on the alley`).toBe(0);
      expect(area.ground.y(k.x, k.z), `${k.id} stands over the alley`).toBe(0);
      expect(oneLevel(k.x, k.z, 0.3), k.id).toBe(true);
      expect(reachedAt(k.fallTo.x, k.fallTo.z), `${k.id} landing reached`).toBe(true);
      expect(dist(k, k.fallTo)).toBeGreaterThanOrEqual(0.6);
      expect(dist(k, k.fallTo)).toBeLessThanOrEqual(1.6);
    }
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) expect(dist(set.knockables[i].fallTo, set.knockables[j].fallTo)).toBeGreaterThanOrEqual(0.5);
    // the flap: an opening she can walk through, a frame she cannot, all on the alley
    for (const f of set.flaps) {
      const frame = frameColliders(f);
      const withFrame = { ...area, colliders: [...area.colliders, ...frame] };
      const nx = Math.sin(f.rotY);
      const nz = Math.cos(f.rotY);
      for (const side of [-1, 0, 1]) {
        expect(isWalkableAt(withFrame, f.x + nx * side, f.z + nz * side), `${f.id} side ${side}`).toBe(true);
        expect(reachedAt(f.x + nx * side, f.z + nz * side), `${f.id} side ${side} reached`).toBe(true);
      }
      for (const c of frame) {
        expect(oneLevel(c.x, c.z, c.r), `${f.id} frame at ${c.x},${c.z} on one level`).toBe(true);
        for (const o of area.colliders) expect(dist(c, o)).toBeGreaterThanOrEqual(c.r + o.r);
      }
      for (const p of [...set.carryables, ...set.rests, ...set.markables, ...set.hides, ...set.knockables.map((k) => k.fallTo)]) {
        expect(dist(f, p) - 0.3, `${f.id} vs ${p.id ?? 'prop'}`).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('has something real to scratch at every markable', () => {
    const solid = [];
    scene.traverse((o) => { if (o.isMesh && o.geometry?.type !== 'PlaneGeometry') solid.push(o); });
    const rc = new THREE.Raycaster();
    for (const m of set.markables) {
      expect(m.mesh).toBe(false);
      const y0 = area.ground.y(m.x, m.z);
      let found = false;
      for (const [dx, dz] of [[0, 0], [0.2, 0], [-0.2, 0], [0, 0.2], [0, -0.2]]) {
        rc.set(new THREE.Vector3(m.x + dx, y0 + 7, m.z + dz), new THREE.Vector3(0, -1, 0));
        rc.far = 8;
        if (rc.intersectObjects(solid, false).some((h) => h.point.y > y0 + 0.3)) found = true;
      }
      expect(found, m.id).toBe(true);
    }
  });

  it('puts the yarn ball in two spots a cat can walk up to, on one level', () => {
    const spots = yarnSpotsFor('roofs');
    expect(spots).toHaveLength(2);
    expect(dist(spots[0], spots[1])).toBeGreaterThan(5);
    const anchors = [area.spawn, ...area.collectibles, ...area.scenics, ...area.pois];
    const walkUps = [...set.carryables, ...set.rests, ...set.markables];
    for (const p of spots) {
      const at = `${p.x},${p.z}`;
      expect(p.where.length).toBeGreaterThan(3);
      expect(p.where).not.toMatch(/[.!]$/);
      expect(p.where.split(/\s+/).length, p.where).toBeLessThanOrEqual(5);
      expect(isWalkableAt(area, p.x, p.z), at).toBe(true);
      expect(clear(p), at).toBe(true);
      expect(oneLevel(p.x, p.z, 1.5), `${at} is on a slope or a rim`).toBe(true);
      expect(reachedAt(p.x, p.z), `${at} reached`).toBe(true);
      for (const q of walkUps) expect(dist(p, q), `${at} vs ${q.id}`).toBeGreaterThanOrEqual(2.5);
      for (const k of set.knockables) expect(dist(p, k.fallTo), `${at} vs ${k.id} landed`).toBeGreaterThanOrEqual(1.5);
      for (const f of set.flaps) expect(dist(p, f), `${at} vs ${f.id}`).toBeGreaterThanOrEqual(2.5);
      for (const q of anchors) expect(dist(p, q), `${at} vs ${q.x},${q.z}`).toBeGreaterThanOrEqual(2);
    }
  });

  it('an old save loads with walks.roofs 0 and marks.roofs []', () => {
    const map = new Map();
    const storage = { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
    const old = JSON.parse(JSON.stringify(createProgression(storage).state));
    delete old.walks.roofs;
    delete old.marks.roofs;
    map.set('whisker-walk-save', JSON.stringify(old));
    const p = createProgression(storage);
    expect(p.state.walks.roofs).toBe(0);
    expect(p.state.marks.roofs).toEqual([]);
    expect(p.marksIn('roofs')).toEqual([]);
    // and a mark left on the Rooftops is kept
    expect(p.addMark('roofs', { kind: 'scratch', id: 'roofs-post-1', x: -3, z: 44.5, at: 1 })).toBe(true);
    expect(p.marksIn('roofs')).toHaveLength(1);
  });

  it('not a colony area, and no legendary cat, dog or strays', () => {
    expect(REG.colony).toBe(false);
    expect(REG.strays).toBe(false);
    expect(COLONY_AREAS).not.toContain('roofs');
    expect(feedsHere('roofs')).toBe(false);
    expect(Object.hasOwn(LEGENDARY_BY_AREA, 'roofs')).toBe(false);
    expect(propsFor('roofs').dogYard).toBeNull();
    expect(area.critterSpawns).toEqual([]);
    expect(area.strays).toBe(false);
  });

  it('the budget row is the measured counts', () => {
    expect(REG.budget.built).toEqual([MEASURED_BUILT.meshes, MEASURED_BUILT.casters, MEASURED_BUILT.triangles]);
    expect(REG.budget.merged).toEqual([MEASURED_MERGED.meshes, MEASURED_MERGED.casters]);
  });
});

// =============================================================================
// Task 13: the first roof in seconds, on the real player (the spec's goal: "A
// child gets onto the first roof within the first minute"), and the picture
// views.
// =============================================================================
describe('The Rooftops: the first roof, and the picture views', async () => {
  const { ROOFS_TOURS, ROOFS_SHOTS, roofsArea } = await import('../src/world/roofsplan.js');
  const { createYardPilot } = await import('../src/world/traversalyard.js');
  const { yardWalk } = await import('./helpers/traversalwalk.js');

  it('the first roof in seconds, on the real player', () => {
    const tour = ROOFS_TOURS.firstRoof;
    expect([tour.start.x, tour.start.z]).toEqual([ROOFS_SPAWN.x, ROOFS_SPAWN.z]);
    const w = yardWalk({ area: roofsArea(), at: [ROOFS_SPAWN.x, ROOFS_SPAWN.z], face: [0, -1] });
    const pilot = createYardPilot(tour);
    const DT = 1 / 30;
    let r; let frames = 0;
    do { r = pilot.step(DT, w); w.frame(DT); frames++; } while (!r.done && frames < 30 * 60);
    expect(r.done).toBe(true);
    expect(r.failed ?? null).toBeNull();
    expect(frames * DT).toBeLessThan(20);
    const p = w.cat.position;
    expect(w.area.ground.y(p.x, p.z)).toBe(LEVELS.GARAGE);
    expect(p.y).toBeCloseTo(LEVELS.GARAGE, 6);
    const kinds = w.events.map((e) => `${e.type}:${e.id ?? e.kind}`);
    expect(kinds).toEqual(expect.arrayContaining(['climb:bin-up', 'climb:shed-up', 'climb:garages-up']));
  });

  it('the terrace tour (the film) runs on from the garages, over plank-2, onto the flat roof, in under 30 s', () => {
    const tour = ROOFS_TOURS.terrace;
    const w = yardWalk({ area: roofsArea(), at: [tour.start.x, tour.start.z], face: tour.start.face });
    const pilot = createYardPilot(tour);
    const DT = 1 / 30;
    let r; let frames = 0;
    do { r = pilot.step(DT, w); w.frame(DT); frames++; } while (!r.done && frames < 30 * 60);
    expect(r.failed ?? null).toBeNull();
    expect(frames * DT).toBeLessThan(30);
    const p = w.cat.position;
    expect(w.area.ground.y(p.x, p.z)).toBe(LEVELS.FLAT);
    const kinds = w.events.map((e) => `${e.type}:${e.id ?? e.kind}`);
    expect(kinds).toEqual(expect.arrayContaining(['climb:garages-up', 'cross:plank-2', 'climb:out-7-up', 'climb:flatHouse-up']));
  });

  it('has a card picture for the home screen', async () => {
    const { readFileSync } = await import('node:fs');
    const jpg = readFileSync(new URL('../public/places/roofs.jpg', import.meta.url));
    expect(jpg[0]).toBe(0xff);
    expect(jpg[1]).toBe(0xd8);
    expect(jpg.length).toBeGreaterThan(5000);
  });

  it('has its eight picture views, each six numbers', () => {
    expect(Object.keys(ROOFS_SHOTS)).toEqual(['alley', 'terraces', 'ridge', 'gap', 'warehouse', 'tower', 'edge', 'card']);
    for (const [name, v] of Object.entries(ROOFS_SHOTS)) {
      const n = v.split(',').map(Number);
      expect([name, n.length, n.every(Number.isFinite)]).toEqual([name, 6, true]);
    }
  });
});
