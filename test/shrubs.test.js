import { describe, it, expect, vi } from 'vitest';

// polish-pines2 Task 2: the default bush stops being one green faceted rock
// and becomes a leafy shrub — small leaf clusters round a hidden core,
// darker inside and underneath, lighter at the tips, with a little per-bush
// size and tint drift. Same one Mesh, same lift and wind hinge, same uuid
// draws, and the footprint stays where it shipped.

// The same headless stub every world test uses (see test/docks.test.js).
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

const b = await import('../src/world/builder.js');

const SPOTS = [[3, 4], [-2.4, -17], [0, 0], [5, 5], [-8, 13], [22, -17], [-30, 30], [11.3, -6.7]];

const lum = (c, i) => 0.2126 * c.getX(i) + 0.7152 * c.getY(i) + 0.0722 * c.getZ(i);

describe('bush() leafy shrub', () => {
  it('stays one bare Mesh with a vertex-coloured, indexed geometry, ≤ 353 triangles', () => {
    for (const [x, z] of SPOTS) {
      const m = b.bush(x, z);
      expect(m.isMesh).toBe(true);
      expect(m.children.length).toBe(0);
      expect([m.position.x, m.position.y, m.position.z]).toEqual([x, 0.5, z]);
      const g = m.geometry;
      expect(g.index).not.toBeNull();
      expect(g.attributes.color).toBeDefined();
      expect(g.attributes.color.count).toBe(g.attributes.position.count);
      expect(m.material.vertexColors).toBe(true);
      const tris = g.index.count / 3;
      // polish-bushes: main's worst (133) + the Pass 10 allowance of 220
      expect(tris).toBeLessThanOrEqual(353);
      expect(tris).toBeGreaterThan(100); // more, smaller lumps than the old 100-triangle blob
    }
  });

  it('is deterministic per spot and differs between spots', () => {
    const a = b.bush(3, -2).geometry, a2 = b.bush(3, -2).geometry, c = b.bush(11, 4).geometry;
    expect(Array.from(a2.attributes.position.array)).toEqual(Array.from(a.attributes.position.array));
    expect(Array.from(a2.attributes.color.array)).toEqual(Array.from(a.attributes.color.array));
    expect(Array.from(c.attributes.position.array)).not.toEqual(Array.from(a.attributes.position.array));
    expect(Array.from(c.attributes.color.array)).not.toEqual(Array.from(a.attributes.color.array));
  });

  it('keeps the footprint: bounding sphere < 0.91, sits on the ground and never floats', () => {
    for (const [x, z] of SPOTS) {
      const g = b.bush(x, z).geometry;
      g.computeBoundingSphere();
      expect(g.boundingSphere.radius).toBeLessThan(0.91);
      g.computeBoundingBox();
      // mesh origin is the belly at y 0.5: the shrub's foot is at or just below the ground
      expect(g.boundingBox.min.y).toBeLessThanOrEqual(-0.48);
      expect(g.boundingBox.min.y).toBeGreaterThan(-0.6);
      expect(g.boundingBox.max.y).toBeGreaterThan(0.2);
    }
  });

  it('is darker underneath than at the top (≥ 0.1 luminance, lowest vs highest 20%)', () => {
    for (const [x, z] of SPOTS) {
      const g = b.bush(x, z).geometry;
      const p = g.attributes.position, c = g.attributes.color;
      const ids = [...Array(p.count).keys()].sort((i, j) => p.getY(i) - p.getY(j));
      const n = Math.max(1, Math.floor(ids.length * 0.2));
      const mean = (list) => list.reduce((s, i) => s + lum(c, i), 0) / list.length;
      const low = mean(ids.slice(0, n)), high = mean(ids.slice(-n));
      expect(high - low).toBeGreaterThanOrEqual(0.1);
    }
  });

  it('has more than one shade: leaf clusters drift, not one flat green', () => {
    const g = b.bush(5, 5).geometry;
    const c = g.attributes.color;
    const shades = new Set();
    for (let i = 0; i < c.count; i++) shades.add(lum(c, i).toFixed(3));
    expect(shades.size).toBeGreaterThan(20);
  });

  it('draws exactly the Math.random values main did (uuids only): 20 bare, 24 with wind', () => {
    // recorded on main (0eb173e): bush(3,4) = 20, bush(3,4,{wind}) = 24
    const count = (f) => {
      const spy = vi.spyOn(Math, 'random');
      f();
      const n = spy.mock.calls.length;
      spy.mockRestore();
      return n;
    };
    b.bush(3, 4); // warm
    expect(count(() => b.bush(3, 4))).toBe(20);
    expect(count(() => b.bush(3, 4, { wind: { add() {} } }))).toBe(24);
  });
});

// polish-shrubs (Pass 9): bushes, gorse, brambles and the edge's hedges and
// scrub stop reading as faceted green rocks and prisms. Render-only.
const THREE = await import('three');
const triSpread = (g) => {
  // the largest angle between the three normals of one triangle, over all
  // triangles (0 = every facet flat)
  const n = g.attributes.normal;
  const idx = g.index ? g.index.array : null;
  let worst = 0;
  const count = idx ? idx.length : n.count;
  const at = (i) => new THREE.Vector3(n.getX(i), n.getY(i), n.getZ(i));
  for (let f = 0; f < count; f += 3) {
    const [a, b2, c] = [0, 1, 2].map((j) => at(idx ? idx[f + j] : f + j));
    worst = Math.max(worst, a.angleTo(b2), b2.angleTo(c), a.angleTo(c));
  }
  return worst;
};
const SPOTS9 = [{ x: 0, z: 0 }, { x: 4, z: 1 }, { x: -3, z: 6 }];

describe('polish-shrubs', () => {
  it('bush clusters are rounded: normals lean out of each lump (positions unchanged)', () => {
    const g = b.bush(5, 5).geometry;
    const p = g.attributes.position, n = g.attributes.normal;
    // the highest vertex of each cluster (its tip) faces mostly up
    let top = 0;
    for (let v = 0; v < p.count; v++) if (p.getY(v) > p.getY(top)) top = v;
    expect(n.getY(top)).toBeGreaterThan(0.8);
    // and the normals spread across triangles (not one flat facet a face)
    expect(triSpread(g)).toBeGreaterThan(0.3);
  });

  it('gorse: vertex-coloured, soft spiny lobes, darker foot; flowers are small pale three-sided pyramids', () => {
    const g = b.gorseBed(SPOTS9, 7);
    const lobes = g.children.find((m) => m.name === 'gorse');
    const bloom = g.children.find((m) => m.name === 'gorseBloom');
    expect(lobes.material.vertexColors).toBe(true);
    expect(lobes.material.color.getHex()).toBe(0xffffff);
    expect(triSpread(lobes.geometry)).toBeGreaterThan(0.2);
    const p = lobes.geometry.attributes.position, c = lobes.geometry.attributes.color;
    const ids = [...Array(p.count).keys()].sort((i, j) => p.getY(i) - p.getY(j));
    const k = Math.floor(ids.length * 0.2);
    const mean = (l) => l.reduce((s, i) => s + lum(c, i), 0) / l.length;
    expect(mean(ids.slice(-k)) - mean(ids.slice(0, k))).toBeGreaterThan(0.03);
    // each lobe: 20 triangles + 7 two-triangle spines (102 vertices)
    expect(lobes.geometry.attributes.position.count % 102).toBe(0);
    expect(lobes.material.side).toBe(THREE.DoubleSide);
    // flowers: 3 triangles each, 8 a lobe, and pale butter (no channel at 0)
    const lobeCount = lobes.geometry.attributes.position.count / 102;
    expect(bloom.geometry.attributes.position.count / 3).toBe(lobeCount * 8 * 3);
    expect(bloom.material.vertexColors).toBe(true);
    expect(bloom.material.roughness).toBe(1);
    const bc = bloom.geometry.attributes.color;
    for (let v = 0; v < bc.count; v++) {
      expect(bc.getX(v)).toBeLessThanOrEqual(1);
      expect(bc.getZ(v)).toBeGreaterThan(0.05);
    }
  });

  it('brambles: each 20-triangle lobe wears 7 two-triangle leaf cards, seen from both sides', () => {
    const m = b.brambleBed(SPOTS9, 11);
    const tris = m.geometry.attributes.position.count / 3;
    expect(tris % 34).toBe(0);
    expect(m.material.side).toBe(THREE.DoubleSide);
    expect(m.geometry.attributes.color.count).toBe(m.geometry.attributes.position.count);
  });
});

// polish-bushes (Pass 10): the bushes still read as faceted green rocks at
// walk height, because the outline was still five-sided lumps with no leaves
// on it. Seven-point rings with corner jitter, a leaf-card fringe and creases.
describe('polish-bushes', () => {
  it('adds at most 220 triangles a bush over main (108-133)', () => {
    for (const [x, z] of SPOTS) {
      const t = b.bush(x, z).geometry.index.count / 3;
      expect(t).toBeGreaterThanOrEqual(108 + 120);
      expect(t).toBeLessThanOrEqual(133 + 220);
    }
  });

  it('is two-sided and lit by its built normals on both faces (the leaf cards)', () => {
    const m = b.bush(5, 5);
    expect(m.material.side).toBe(THREE.DoubleSide);
    expect(m.material.customProgramCacheKey()).toBe('dressing-both-sides-v1');
  });

  it('breaks the outline: many distinct corner radii round the bush, not a few facets', () => {
    // horizontal reach of every vertex in the upper half, binned by azimuth:
    // a leafy outline has its farthest points spread round the whole bush
    const g = b.bush(-8, 13).geometry;
    const p = g.attributes.position;
    const bins = new Array(24).fill(0);
    for (let v = 0; v < p.count; v++) {
      if (p.getY(v) < -0.2) continue;
      const a = Math.atan2(p.getZ(v), p.getX(v));
      const k = Math.floor(((a + Math.PI) / (Math.PI * 2)) * 24) % 24;
      bins[k] = Math.max(bins[k], Math.hypot(p.getX(v), p.getZ(v)));
    }
    expect(bins.filter((r) => r > 0.3).length).toBe(24);
  });

  it('shades the creases: inward faces of the side lumps are darker than outward ones', () => {
    const g = b.bush(0, 0).geometry;
    const p = g.attributes.position, c = g.attributes.color;
    let inner = 0, ni = 0, outer = 0, no = 0;
    for (let v = 0; v < p.count; v++) {
      const r = Math.hypot(p.getX(v), p.getZ(v));
      if (p.getY(v) > 0 || p.getY(v) < -0.45) continue;
      if (r < 0.2) { inner += lum(c, v); ni++; } else if (r > 0.5) { outer += lum(c, v); no++; }
    }
    expect(ni).toBeGreaterThan(0);
    expect(outer / no).toBeGreaterThan(inner / ni);
  });
});

