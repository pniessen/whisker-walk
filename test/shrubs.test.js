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
  it('stays one bare Mesh with a vertex-coloured, indexed geometry, ≤ 150 triangles', () => {
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
      expect(tris).toBeLessThanOrEqual(150);
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
