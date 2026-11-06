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
