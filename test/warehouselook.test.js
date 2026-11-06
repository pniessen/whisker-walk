import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

// polish-docks2 Task 1: the warehouses' masonry, window trim and downpipes are
// baked into meshes warehouse() already makes. These pins hold the costs that
// a world build is measured by — mesh count, Math.random draws, merged draws —
// at their shipped values, and bound the triangles.

// Same headless stub every world test uses (see test/docks.test.js).
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

const { warehouse } = await import('../src/world/builder.js');
const { build: buildDocks } = await import('../src/world/docks.js');
const { mergeStaticProps, mergeKey } = await import('../src/render/mergeprops.js');
const { lookFor, pieceBuffer } = await import('../src/world/warehouselook.js');

const W1 = () => warehouse(20, 16, 10, 8, 5, 0x8a6a5a, 0x44404a, 'brick');
const SHED = () => warehouse(6.5, -23.5, 6, 5, 1.8, 0x7a6a5a, 0x44404a, 'siding');

const meshesOf = (g) => { const out = []; g.traverse((o) => { if (o.isMesh) out.push(o); }); return out; };
const trianglesOf = (root) => {
  let t = 0;
  root.traverse((o) => {
    if (!o.isMesh) return;
    const geo = o.geometry;
    t += (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
  });
  return Math.round(t);
};
function drawsDuring(fn) {
  const real = Math.random;
  let n = 0;
  Math.random = () => { n++; return real(); };
  try { fn(); } finally { Math.random = real; }
  return n;
}

// Measured on the shipped warehouse() (0eb173e) before this change.
const SHIPPED = {
  meshes: { w1: 24, shed: 14 },
  // Draws for a call whose roundedBox geometries and surface textures are
  // already cached (the first call of a size also pays the BoxGeometry uuids
  // of every new cache entry: 268 / 156 on the shipped code in a module that
  // had built nothing). Every warehouse() in the Docks after the first of its
  // sizes is a warm call, and a cold call's extra draws are cache entries,
  // which this change must not add — that is checked by the cold case below.
  warmDraws: { w1: 196, shed: 116 },
  coldDraws: { w1: 268, shed: 156 },
  docksTriangles: 64334,
  docksMerged: 316,
};

describe('warehouse() keeps its shipped costs', () => {
  it('(a) mesh count is unchanged', () => {
    expect(meshesOf(W1()).length).toBe(SHIPPED.meshes.w1);
    expect(meshesOf(SHED()).length).toBe(SHIPPED.meshes.shed);
  });

  it('(b) Math.random draws per call are unchanged, cold and warm', async () => {
    // A fresh module graph, so roundedBox's geometry cache and the texture
    // caches start empty exactly as they did when the shipped numbers above
    // were taken: the cold count proves no new cache entry is made on the
    // real stream, the warm count that no new uuid is.
    vi.resetModules();
    const fresh = await import('../src/world/builder.js');
    const a = () => fresh.warehouse(20, 16, 10, 8, 5, 0x8a6a5a, 0x44404a, 'brick');
    const s = () => fresh.warehouse(6.5, -23.5, 6, 5, 1.8, 0x7a6a5a, 0x44404a, 'siding');
    expect(drawsDuring(a)).toBe(SHIPPED.coldDraws.w1);
    expect(drawsDuring(a)).toBe(SHIPPED.warmDraws.w1);
    expect(drawsDuring(s)).toBe(SHIPPED.coldDraws.shed);
    expect(drawsDuring(s)).toBe(SHIPPED.warmDraws.shed);
  });

  it('(c) every non-pane mesh is vertex coloured; the four lips share one merge class', () => {
    for (const g of [W1(), SHED()]) {
      for (const m of meshesOf(g)) {
        if (m.userData.window) continue;
        expect(m.geometry.attributes.color).toBeTruthy();
        expect(m.material.vertexColors).toBe(true);
      }
      // children: body, deck, 4 lips, panes..., door, lintel
      const lips = g.children.slice(2, 6);
      const sets = lips.map((m) => Object.keys(m.geometry.attributes).sort().join('+'));
      expect(new Set(sets).size).toBe(1);
      expect(sets[0]).toBe('color+normal+position+uv');
      const keys = lips.map((m) => mergeKey(m));
      expect(keys[0]).not.toBeNull();
      expect(new Set(keys).size).toBe(1);
    }
  });

  it('(c) the body keeps its parameters for viewclear2 and is still children[0]', () => {
    const body = W1().children[0];
    expect(body.geometry.parameters).toMatchObject({ width: 10, height: 5, depth: 8 });
  });

  it('(d) every pane keeps userData.window, its size and its shipped position', () => {
    const g = W1();
    const panes = meshesOf(g).filter((m) => m.userData.window);
    // cols = floor(10 / 2.6) = 3, two rows (h 5 > 3.4), two long faces; plus
    // one column of two on each gable.
    expect(panes.length).toBe(3 * 2 * 2 + 2 * 2);
    const want = [];
    for (const face of [1, -1]) for (let i = 0; i < 3; i++) for (const wy of [1.1, 2.7]) want.push([-5 + (i + 0.5) * (10 / 3), wy, face * 4.02]);
    for (const face of [1, -1]) for (const wy of [1.1, 2.7]) want.push([face * 5.02, wy, 0]);
    panes.forEach((p, i) => {
      expect(p.position.toArray().map((v) => +v.toFixed(6))).toEqual(want[i].map((v) => +v.toFixed(6)));
      expect(p.geometry.type).toBe('BoxGeometry');
    });
  });

  it('(e) two builds give identical geometry', () => {
    const a = meshesOf(W1()), b = meshesOf(W1());
    expect(a.length).toBe(b.length);
    for (let i = 0; i < a.length; i++) {
      expect(Array.from(a[i].geometry.attributes.position.array)).toEqual(Array.from(b[i].geometry.attributes.position.array));
      if (a[i].geometry.attributes.color) {
        expect(Array.from(a[i].geometry.attributes.color.array)).toEqual(Array.from(b[i].geometry.attributes.color.array));
      }
    }
  });

  it('(f) the Docks stays inside +12k triangles and does not add a merged draw', () => {
    const scene = new THREE.Scene();
    buildDocks(scene);
    const tris = trianglesOf(scene);
    expect(tris).toBeGreaterThan(SHIPPED.docksTriangles);
    expect(tris - SHIPPED.docksTriangles).toBeLessThanOrEqual(12000);
    mergeStaticProps(scene);
    let meshes = 0;
    scene.traverse((o) => { if (o.isMesh) meshes++; });
    // The lintel (now white + vertex colours, flat material) joins the four
    // lips' merge class, so each warehouse is one draw cheaper: 316 - 5.
    expect(meshes).toBeLessThanOrEqual(SHIPPED.docksMerged);
    expect(meshes).toBe(SHIPPED.docksMerged - 5);
  }, 120_000);
});

// polish-docks2 Task 2: loading bays, hoists and rooflines.
describe('warehouse loading bays, hoists and rooflines', () => {
  // docks.js's perches on or beside a warehouse roof, and the fire escape's
  // top landing (its two perches stand at (18.0, 10.4)).
  const ROOF_PERCHES = [
    { x: 17.0, z: 12.1, y: 5.3 }, { x: 18.6, z: 13.6, y: 6.2 }, { x: 18.0, z: 10.4, y: 3.9 },
    { x: 5.2, z: -21.1, y: 2.1 },
  ];
  let docks;
  const docksScene = () => {
    if (!docks) { docks = new THREE.Scene(); buildDocks(docks); docks.updateMatrixWorld(true); }
    return docks;
  };
  // Warehouse groups, keyed by their footprint origin.
  const warehouses = () => {
    const out = new Map();
    for (const o of docksScene().children) if (o.isGroup && o.userData.look) out.set(`${o.position.x},${o.position.z}`, o);
    return out;
  };
  const worldVerts = (mesh, filter = () => true) => {
    const a = mesh.geometry.attributes.position, v = new THREE.Vector3(), local = new THREE.Vector3(), out = [];
    const toGroup = new THREE.Matrix4().copy(mesh.matrix);
    for (let i = 0; i < a.count; i++) {
      local.fromBufferAttribute(a, i).applyMatrix4(toGroup); // the group's own frame
      if (!filter(local)) continue;
      v.fromBufferAttribute(a, i).applyMatrix4(mesh.matrixWorld);
      out.push({ w: v.clone(), g: local.clone() });
    }
    return out;
  };

  it('W1 and the fish shed stay flat; W2-W4 get rooflines of both kinds', () => {
    const ws = warehouses();
    expect(ws.size).toBe(5);
    expect(ws.get('20,16').userData.look.roofline).toBe('flat');
    expect(ws.get('6.5,-23.5').userData.look.roofline).toBe('flat');
    const others = ['-6,20', '-26,15', '12,32'].map((k) => ws.get(k).userData.look.roofline);
    for (const r of others) expect(r).not.toBe('flat');
    expect(new Set(others)).toEqual(new Set(['stepped', 'sawtooth']));
  }, 120_000);

  it('a stepped roofline rises from the body, a saw-tooth one from the deck', () => {
    for (const g of warehouses().values()) {
      const h = g.children[0].geometry.parameters.height;
      const r = g.userData.look.roofline;
      const bodyTop = new THREE.Box3().setFromObject(g.children[0]).max.y;
      const deckTop = new THREE.Box3().setFromObject(g.children[1]).max.y;
      if (r === 'stepped') expect(bodyTop).toBeGreaterThan(h + 0.8); else expect(bodyTop).toBeCloseTo(h, 5);
      if (r === 'sawtooth') expect(deckTop).toBeGreaterThan(h + 0.8); else expect(deckTop).toBeCloseTo(h + 0.12, 5);
    }
  }, 120_000);

  it('no new geometry stands within 0.6 m of a roof perch or the fire escape', () => {
    for (const g of warehouses().values()) {
      const d = g.children[0].geometry.parameters.depth;
      const kids = g.children;
      // body and deck whole; the door and lintel only on the canal (-z) face,
      // where the loading bay goes (the shipped +z door and lintel are as before)
      const checked = [
        ...worldVerts(kids[0]), ...worldVerts(kids[1]),
        ...worldVerts(kids[kids.length - 2], (p) => p.z < -d / 2 + 0.01),
        ...worldVerts(kids[kids.length - 1], (p) => p.z < -d / 2 + 0.01),
      ];
      for (const p of ROOF_PERCHES) {
        const bad = checked.filter(({ w }) => Math.hypot(w.x - p.x, w.z - p.z) < 0.6 && w.y >= p.y - 0.3);
        expect(bad.map(({ w }) => w.toArray())).toEqual([]);
      }
    }
  }, 120_000);

  it('the hoist exists only when h >= 3.4, keeps 1.8 m (x) from the perches and stays above the fade half', () => {
    for (const g of warehouses().values()) {
      const { height: h, depth: d } = g.children[0].geometry.parameters;
      const deck = g.children[1];
      const hoist = worldVerts(deck, (p) => p.z < -d / 2 - 0.05);
      if (h >= 3.4) expect(hoist.length).toBeGreaterThan(0); else expect(hoist).toEqual([]);
      for (const p of ROOF_PERCHES) for (const { w } of hoist) expect(Math.abs(w.x - p.x)).toBeGreaterThanOrEqual(1.8);
      // treefade only takes xz from meshes whose min.y is under the group's
      // half height: the deck (and its hoist) must never be one of them.
      const all = new THREE.Box3().setFromObject(g);
      expect(new THREE.Box3().setFromObject(deck).min.y).toBeGreaterThan((all.min.y + all.max.y) / 2);
    }
  }, 120_000);

  it('the loading bay sits on the -z face between window trims, 1.8 m (x) clear of every perch', () => {
    for (const g of warehouses().values()) {
      const { width: w, height: h, depth: d } = g.children[0].geometry.parameters;
      const kids = g.children;
      const bayDoor = worldVerts(kids[kids.length - 2], (p) => p.z < -d / 2 + 0.01);
      const bayStone = worldVerts(kids[kids.length - 1], (p) => p.z < -d / 2 + 0.01 && Math.abs(p.x - g.userData.look.bayX) < 0.8);
      if (h < 3.4) { expect(bayDoor).toEqual([]); continue; }
      expect(bayDoor.length).toBeGreaterThan(0);
      expect(bayStone.length).toBeGreaterThan(0);
      const xs = [...bayDoor, ...bayStone].map(({ g: p }) => p.x);
      const lo = Math.min(...xs), hi = Math.max(...xs);
      // the upper loading door only on a building of h >= 4
      const upper = bayDoor.some(({ g: p }) => p.y > 2.25);
      expect(upper).toBe(h >= 4);
      // between window trims: each -z pane's trim spans its x +- 0.5
      for (const pane of kids.filter((m) => m.userData.window && m.position.z < 0 && Math.abs(m.position.x) < w / 2)) {
        expect(hi < pane.position.x - 0.5 || lo > pane.position.x + 0.5).toBe(true);
      }
      for (const p of ROOF_PERCHES) expect(Math.abs(g.position.x + g.userData.look.bayX - p.x)).toBeGreaterThanOrEqual(1.8);
    }
  }, 120_000);
});

describe('warehouselook pieces', () => {
  it('a box with skipped faces drops two triangles per face and stays indexed', () => {
    const pb = pieceBuffer();
    pb.box(0, 0, 0, 1, 1, 1, [1, 1, 1]);
    pb.box(0, 2, 0, 1, 1, 1, [1, 0, 0], { skip: ['-z', '-y'] });
    const geo = pb.toGeometry();
    expect(geo.index.count / 3).toBe(12 + 8);
    expect(Object.keys(geo.attributes).sort()).toEqual(['color', 'normal', 'position', 'uv']);
  });

  it('lookFor is a pure function of its arguments', () => {
    const a = lookFor(20, 16, 10, 8, 5), b = lookFor(20, 16, 10, 8, 5);
    expect(a).toEqual(b);
    expect(a.frame).toHaveLength(3);
    expect(a.stone).toHaveLength(3);
  });
});
