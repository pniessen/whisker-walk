import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

// The same headless canvas stub every world test uses (see test/park.test.js).
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

const { forestFloorMesh, canopyShade, woodsFloorTint, pinesFloorTint } = await import('../src/world/forestfloor.js');
const woods = await import('../src/world/woods.js');
const b = await import('../src/world/builder.js');
const { waterGap } = b;
const { build, SPAWN, WOODS_WATERS, WOODS_PATHS, woodsTreeSpots, woodsFloor, woodsGroundTint, CLEARING, FALLEN_LOG } = woods;
const pines = await import('../src/world/pines.js');
const { ISLAND_LAND, BRIDGE_DECK } = await import('../src/world/island.js');
const { DISCS } = await import('../src/rivalclans.js');

const PATH_W = 3;

function segDist(x, z, [x1, z1, x2, z2]) {
  const dx = x2 - x1, dz = z2 - z1;
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (z - z1) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(x - (x1 + t * dx), z - (z1 + t * dz));
}
const waterDist = (x, z) => Math.min(...WOODS_WATERS.map((w) => waterGap(w, x, z)));
const trianglesOf = (g) => (g.index ? g.index.count : g.attributes.position?.count ?? 0) / 3;
function maxY(mesh) {
  const p = mesh.geometry.attributes.position;
  let m = -Infinity;
  for (let i = 0; i < p.count; i++) m = Math.max(m, p.getY(i));
  return m;
}

describe('forestFloorMesh', () => {
  it('is one non-casting vertex-coloured mesh, empty for no parts', () => {
    const m = forestFloorMesh({});
    expect(m.isMesh).toBe(true);
    expect(m.name).toBe('forestFloor');
    expect(m.castShadow).toBe(false);
    expect(m.userData.noCast).toBe(true);
    expect(m.material.vertexColors).toBe(true);
    expect(trianglesOf(m.geometry)).toBe(0);
    expect(forestFloorMesh({}, { name: 'x' }).name).toBe('x');
  });

  const CAPS = {
    leaves: 0.035, moss: 0.12, mushrooms: 0.2, bluebells: 0.3, foxgloves: 0.6, needles: 0.035, cones: 0.08, blueberries: 0.25,
  };
  const spots = [];
  for (let i = 0; i < 40; i++) spots.push({ x: i * 1.37 - 20, z: (i * 7.31) % 23 - 11, s: 0.8 + (i % 5) * 0.1, a: i * 0.7 });
  for (const [kind, cap] of Object.entries(CAPS)) {
    it(`keeps ${kind} under ${cap} m, with triangles and colours`, () => {
      const m = forestFloorMesh({ [kind]: spots });
      expect(trianglesOf(m.geometry)).toBeGreaterThan(0);
      expect(m.geometry.attributes.color.count).toBe(m.geometry.attributes.position.count);
      expect(maxY(m)).toBeLessThanOrEqual(cap);
      expect(maxY(m)).toBeGreaterThan(0);
    });
  }

  it('lays each leaf as a pointed oval: two triangles on four points, 0.12-0.18 m long, folded at the vein', () => {
    const m = forestFloorMesh({ leaves: spots });
    expect(trianglesOf(m.geometry)).toBe(2 * spots.length);
    const pos = m.geometry.attributes.position;
    const nor = m.geometry.attributes.normal;
    for (let k = 0; k < spots.length; k++) {
      const pts = [];
      for (let i = 0; i < 6; i++) pts.push([pos.getX(k * 6 + i), pos.getY(k * 6 + i), pos.getZ(k * 6 + i)]);
      const keys = new Set(pts.map((q) => q.map((v) => v.toFixed(5)).join(',')));
      expect(keys.size).toBe(4);
      let len = 0;
      for (const a of pts) for (const c of pts) len = Math.max(len, Math.hypot(a[0] - c[0], a[2] - c[2]));
      expect(len).toBeGreaterThanOrEqual(0.12 - 1e-6);
      expect(len).toBeLessThanOrEqual(0.18 + 1e-6);
      for (const q of pts) expect(q[1]).toBeGreaterThanOrEqual(0.018);
      // the two halves face up, at slightly different slopes (the vein fold)
      const n0 = [nor.getX(k * 6), nor.getY(k * 6), nor.getZ(k * 6)];
      const n1 = [nor.getX(k * 6 + 3), nor.getY(k * 6 + 3), nor.getZ(k * 6 + 3)];
      expect(n0[1]).toBeGreaterThan(0.9);
      expect(n1[1]).toBeGreaterThan(0.9);
      expect(n0[0] * n1[0] + n0[1] * n1[1] + n0[2] * n1[2]).toBeLessThan(0.9999);
    }
  });
});

describe('the Woods floor tint', () => {
  const trees = woodsTreeSpots();
  const tint = woodsFloorTint(trees, CLEARING);

  it('shades 1 at a trunk and 0 far from every tree', () => {
    const t = trees[0];
    expect(canopyShade(trees, t.x, t.z)).toBe(1);
    expect(canopyShade([{ x: 0, z: 0, scale: 1 }], 3.3, 0)).toBe(0);
    expect(canopyShade([{ x: 0, z: 0, scale: 1 }], 1.1, 0)).toBe(1);
  });

  it('keeps every channel within [0.5, 1.5], and the clearing untouched', () => {
    for (let x = -60; x <= 60; x++) {
      for (let z = -60; z <= 60; z++) {
        for (const c of tint(x, z)) {
          expect(c).toBeGreaterThanOrEqual(0.5);
          expect(c).toBeLessThanOrEqual(1.5);
        }
      }
    }
    expect(tint(CLEARING.x, CLEARING.z)).toEqual([1, 1, 1]);
  });

  it('with the ground edge given, is plain base colour at the edge', () => {
    const edged = woodsFloorTint(trees, CLEARING, { edge: 60 });
    for (let k = -60; k <= 60; k += 2) {
      for (const [x, z] of [[k, 60], [k, -60], [60, k], [-60, k], [k, 59], [59, k]]) expect(edged(x, z)).toEqual([1, 1, 1]);
    }
    expect(edged(20, 20)).toEqual(tint(20, 20));
  });

  it('is darker in the shade of the trees than in the open', () => {
    const lum = ([r, g, bl]) => r + g + bl;
    const shade = [];
    const open = [];
    for (let x = -50; x <= 50; x += 0.5) {
      for (let z = -50; z <= 50; z += 0.5) {
        if (Math.hypot(x - CLEARING.x, z - CLEARING.z) < CLEARING.r) continue;
        const near = Math.min(...trees.map((t) => Math.hypot(x - t.x, z - t.z)));
        if (near < 1) shade.push(lum(tint(x, z)));
        else if (near > 5) open.push(lum(tint(x, z)));
      }
    }
    const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
    expect(shade.length).toBeGreaterThan(20);
    expect(open.length).toBeGreaterThan(20);
    expect(mean(shade)).toBeLessThan(mean(open) - 0.15);
  });
});

describe('the Woods floor', () => {
  const floor = woodsFloor();
  const trees = woodsTreeSpots();
  const keep = (a) => [...a.pois, ...a.collectibles, ...a.scenics, a.spawn];

  it('is seeded: the same floor every time, with every kind on it', () => {
    expect(woodsFloor()).toEqual(floor);
    expect(floor.leaves.length).toBeGreaterThan(500);
    expect(floor.moss.length).toBeGreaterThanOrEqual(15);
    expect(floor.mushrooms.length).toBeGreaterThanOrEqual(8);
    expect(floor.bluebells.length).toBeGreaterThanOrEqual(20);
    expect(floor.foxgloves.length).toBeGreaterThanOrEqual(5);
  });

  it('keeps every trunk-foot moss cushion at least 0.45 x scale out from its trunk', () => {
    // the log's moss lies within 0.6 m of its centreline (woods.js FALLEN_LOG)
    const L = FALLEN_LOG;
    const h = L.length / 2;
    const log = [L.x - Math.sin(L.yaw) * h, L.z - Math.cos(L.yaw) * h, L.x + Math.sin(L.yaw) * h, L.z + Math.cos(L.yaw) * h];
    const feet = floor.moss.filter((p) => segDist(p.x, p.z, log) > 0.7);
    expect(feet.length).toBeGreaterThanOrEqual(15);
    for (const p of feet) {
      const at = `moss (${p.x}, ${p.z})`;
      for (const t of trees) expect(Math.hypot(p.x - t.x, p.z - t.z), at).toBeGreaterThanOrEqual(0.45 * t.scale);
      expect(trees.some((t) => Math.hypot(p.x - t.x, p.z - t.z) <= 0.9 * t.scale + 0.01), at).toBe(true);
    }
  });

  it('keeps every leaf off the paths and out of the water', () => {
    for (const p of floor.leaves) {
      const at = `leaf (${p.x}, ${p.z})`;
      for (const seg of WOODS_PATHS) expect(segDist(p.x, p.z, seg), at).toBeGreaterThanOrEqual(PATH_W / 2 + 0.15);
      expect(waterDist(p.x, p.z), at).toBeGreaterThanOrEqual(0.6);
    }
  });

  it('builds one forestFloor mesh out of the shadow pass, inside the triangle budget', () => {
    const scene = new THREE.Scene();
    const area = build(scene);
    const meshes = [];
    let tris = 0;
    scene.traverse((o) => {
      if (!o.isMesh) return;
      if (o.name === 'forestFloor') meshes.push(o);
      tris += trianglesOf(o.geometry);
    });
    expect(meshes).toHaveLength(1);
    expect(meshes[0].userData.noCast).toBe(true);
    expect(meshes[0].castShadow).toBe(false);
    // polish-brambles: the camp's bramble mounds cost 2,604 more triangles (+2,700);
    // polish-canopies: oak, birch and round crowns and the old oaks (+6,000)
    expect(tris).toBeLessThanOrEqual(67_200);

    const places = keep(area);
    expect(places.some((p) => p.x === SPAWN.x && p.z === SPAWN.z)).toBe(true);
    for (const kind of ['moss', 'mushrooms', 'bluebells', 'foxgloves']) {
      for (const p of floor[kind]) {
        const at = `${kind} (${p.x}, ${p.z})`;
        for (const q of places) expect(Math.hypot(p.x - q.x, p.z - q.z), at).toBeGreaterThanOrEqual(3);
        for (const seg of WOODS_PATHS) expect(segDist(p.x, p.z, seg), at).toBeGreaterThanOrEqual(2.3);
      }
    }
  }, 120_000);
});

describe('the Woods ground tint for the grass', () => {
  it('is the multiplier the ground is tinted with', () => {
    const tint = woodsFloorTint(woodsTreeSpots(), CLEARING, { edge: 60 });
    for (const [x, z] of [[0, 0], [-30, 20], [25, -35], [59, 59], [-12.3, 7.7]]) expect(woodsGroundTint(x, z)).toEqual(tint(x, z));
  });
});

// --- the Pines ----------------------------------------------------------------

const P = pines;
const ptrees = () => { const { near, stand } = P.pinesTrees(); return [...near, ...stand]; };
const pWaterDist = (x, z) => Math.min(...P.PINES_WATERS.map((w) => waterGap({ ...w, decks: [] }, x, z)));
const CAMP = DISCS.pines;

describe('the Pines floor tint', () => {
  const trees = ptrees();
  // the multiplier the ground is tinted with and the grass reads
  const tint = P.pinesGroundTint;

  it('keeps every channel within [0.5, 1.5], and is plain base colour at the ground edge', () => {
    for (let x = -60; x <= 60; x++) {
      for (let z = -60; z <= 60; z++) {
        for (const c of tint(x, z)) {
          expect(c).toBeGreaterThanOrEqual(0.5);
          expect(c).toBeLessThanOrEqual(1.5);
        }
      }
    }
    for (let k = -60; k <= 60; k += 2) {
      for (const [x, z] of [[k, 60], [k, -60], [60, k], [-60, k], [k, 59], [59, k]]) expect(tint(x, z)).toEqual([1, 1, 1]);
    }
  });

  it('is plain on the island', () => {
    expect(tint(ISLAND_LAND.x, ISLAND_LAND.z)).toEqual([1, 1, 1]);
  });

  it('reads redder (r/g higher) under the pines than in the open', () => {
    const rg = ([r, g]) => r / g;
    const under = [];
    const open = [];
    for (let x = -50; x <= 50; x += 0.5) {
      for (let z = -50; z <= 50; z += 0.5) {
        const near = Math.min(...trees.map((t) => Math.hypot(x - t.x, z - t.z)));
        if (near < 1.2) under.push(rg(tint(x, z)));
        else if (near > 7) open.push(rg(tint(x, z)));
      }
    }
    const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
    expect(under.length).toBeGreaterThan(20);
    expect(open.length).toBeGreaterThan(20);
    expect(mean(under)).toBeGreaterThan(mean(open) + 0.25);
  });

  it('is the plain floor tint, edged and with the island kept plain', () => {
    const bare = pinesFloorTint(trees);
    for (const [x, z] of [[0, -20], [-30, 20], [25, -35], [-12.3, 7.7]]) expect(tint(x, z)).toEqual(bare(x, z));
    for (const c of bare(ISLAND_LAND.x + 0.5, ISLAND_LAND.z)) expect(c).toBeGreaterThan(0);
  });
});

describe('the Pines floor', () => {
  const floor = P.pinesFloor();
  const KINDS = ['needles', 'cones', 'moss', 'blueberries'];
  const all = KINDS.flatMap((k) => floor[k].map((p) => ({ ...p, kind: k })));

  it('is seeded: the same floor every time, with every kind on it', () => {
    expect(P.pinesFloor()).toEqual(floor);
    expect(floor.needles.length).toBeGreaterThan(800);
    expect(floor.cones.length).toBeGreaterThan(60);
    expect(floor.moss.length).toBeGreaterThanOrEqual(25);
    expect(floor.moss.length).toBeLessThanOrEqual(40);
    expect(floor.blueberries.length).toBeGreaterThanOrEqual(12);
    expect(floor.blueberries.length).toBeLessThanOrEqual(18);
  });

  it('keeps everything off the paths, the trail, the water, the island, the bridge and the camp, in bounds', () => {
    for (const p of all) {
      const at = `${p.kind} (${p.x}, ${p.z})`;
      for (const seg of P.PINES_PATHS) expect(segDist(p.x, p.z, seg), at).toBeGreaterThanOrEqual(PATH_W / 2 + 0.15);
      for (const seg of P.PINES_TRAIL) expect(segDist(p.x, p.z, seg), at).toBeGreaterThanOrEqual(P.TRAIL_W / 2 + 0.15);
      expect(pWaterDist(p.x, p.z), at).toBeGreaterThanOrEqual(0.6);
      expect(Math.hypot(p.x - ISLAND_LAND.x, p.z - ISLAND_LAND.z), at).toBeGreaterThanOrEqual(ISLAND_LAND.r + 1);
      expect(segDist(p.x, p.z, [BRIDGE_DECK.x1, BRIDGE_DECK.z1, BRIDGE_DECK.x2, BRIDGE_DECK.z2]), at).toBeGreaterThanOrEqual(BRIDGE_DECK.halfW + 0.5);
      expect(Math.hypot(p.x - CAMP.cx, p.z - CAMP.cz), at).toBeGreaterThanOrEqual(CAMP.r);
      expect(Math.abs(p.x), at).toBeLessThanOrEqual(50);
      expect(Math.abs(p.z), at).toBeLessThanOrEqual(50);
    }
  });

  it('builds one forestFloor mesh out of the shadow pass, inside the 66,076 triangle budget', () => {
    const scene = new THREE.Scene();
    const area = P.build(scene);
    const meshes = [];
    let tris = 0;
    scene.traverse((o) => {
      if (!o.isMesh) return;
      if (o.name === 'forestFloor') meshes.push(o);
      tris += trianglesOf(o.geometry);
    });
    expect(meshes).toHaveLength(1);
    expect(meshes[0].userData.noCast).toBe(true);
    expect(meshes[0].castShadow).toBe(false);
    expect(trianglesOf(meshes[0].geometry)).toBeGreaterThan(2000);
    // polish-brambles: the camp's bramble mounds cost 2,604 more triangles (+2,700)
    // polish-heather: the island's ferns, toadstools, fallen log and inner
    // reed fringe cost 1,366 more triangles (+1,400); polish-pines2: tiered
    // pines are 120 triangles where the cones were 66, 5,724 more over the
    // area's 106 pines (+5,724); polish-campring: three more leaf cards on
    // each of the camp ring's 84 clumps (+252)
    expect(tris).toBeLessThanOrEqual(66_076);

    // the ground carries pinesGroundTint: its colours over an untinted twin's
    const ground = scene.children.find((o) => o.userData?.ground && o.isMesh);
    const twin = b.ground(120, 0x56603e, { surface: 'grass' });
    const gc = ground.geometry.attributes.color;
    const tc = twin.geometry.attributes.color;
    const pos = ground.geometry.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i += 97) {
      v.fromBufferAttribute(pos, i).applyMatrix4(ground.matrix);
      const m = P.pinesGroundTint(v.x, v.z);
      expect(gc.getX(i)).toBeCloseTo(tc.getX(i) * m[0], 5);
      expect(gc.getY(i)).toBeCloseTo(tc.getY(i) * m[1], 5);
      expect(gc.getZ(i)).toBeCloseTo(tc.getZ(i) * m[2], 5);
    }

    // the 3D bits keep 3 m off every find, POI and the spawn
    const places = [...area.pois, ...area.collectibles, ...area.scenics, area.spawn];
    for (const kind of ['cones', 'moss', 'blueberries']) {
      for (const p of floor[kind]) {
        const at = `${kind} (${p.x}, ${p.z})`;
        for (const q of places) expect(Math.hypot(p.x - q.x, p.z - q.z), at).toBeGreaterThanOrEqual(3);
        for (const seg of P.PINES_PATHS) expect(segDist(p.x, p.z, seg), at).toBeGreaterThanOrEqual(2.3);
      }
    }
  }, 120_000);
});
