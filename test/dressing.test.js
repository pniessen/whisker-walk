import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

// Same headless canvas stub every world test uses (see test/budget.test.js).
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
const { withLocalUuids } = await import('../src/world/localuuids.js');
const D = await import('../src/world/dressing.js');
const { PAINT_Y, colorParts, dressMesh, paintMesh, ribbon, blob, tintGround, smoothField } = D;

const triCount = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;

describe('dressing helpers', () => {
  it('dressMesh merges parts into one noCast vertex-coloured mesh', () => {
    const parts = [
      colorParts(new THREE.BoxGeometry(1, 1, 1), 0xff0000),
      colorParts(new THREE.BoxGeometry(1, 1, 1).translate(3, 0, 0), 0x00ff00),
    ];
    const m = dressMesh(parts, { name: 'dress' });
    expect(m.isMesh).toBe(true);
    expect(m.name).toBe('dress');
    expect(m.geometry.index).toBe(null);
    expect(m.geometry.attributes.color.count).toBe(m.geometry.attributes.position.count);
    expect(m.geometry.attributes.color.itemSize).toBe(3);
    expect(m.geometry.attributes.uv).toBeUndefined();
    expect(m.userData.noCast).toBe(true);
    expect(m.castShadow).toBe(false);
    expect(m.receiveShadow).toBe(true);
    expect(m.material.vertexColors).toBe(true);
    expect(triCount(m.geometry)).toBe(24);
  });

  it('dressMesh with no parts gives an empty geometry', () => {
    const m = dressMesh([], { name: 'none' });
    expect(m.geometry.attributes.position?.count ?? 0).toBe(0);
  });

  it('colorParts takes a per-vertex function', () => {
    const g = colorParts(new THREE.BoxGeometry(1, 1, 1), (x, y) => (y > 0 ? [1, 0, 0] : [0, 0, 1]));
    const p = g.attributes.position;
    const c = g.attributes.color;
    let up = -1;
    let down = -1;
    for (let i = 0; i < p.count; i++) {
      if (p.getY(i) > 0 && up < 0) up = i;
      if (p.getY(i) < 0 && down < 0) down = i;
    }
    expect(c.getX(up)).not.toBe(c.getX(down));
    expect(c.getX(up)).toBe(1);
    expect(c.getZ(down)).toBe(1);
  });

  it('paintMesh lies at PAINT_Y and offsets its polygons', () => {
    const m = paintMesh([colorParts(blob(1, 2, 1.5, { salt: 3 }).translate(0, PAINT_Y, 0), 0x335522)], {});
    const p = m.geometry.attributes.position;
    expect(p.count).toBeGreaterThan(0);
    for (let i = 0; i < p.count; i++) expect(p.getY(i)).toBeCloseTo(PAINT_Y, 6);
    expect(m.material.polygonOffset).toBe(true);
    expect(m.material.polygonOffsetFactor).toBe(-1);
    expect(m.material.polygonOffsetUnits).toBe(-1);
    expect(m.material.side).toBe(THREE.FrontSide);
    expect(m.name).toBe('groundPaint');
    expect(m.userData.noCast).toBe(true);
  });

  it('paintMesh flattens geometry that is not at PAINT_Y', () => {
    const m = paintMesh([colorParts(blob(0, 0, 1, {}), 0x335522)], {});
    const p = m.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) expect(p.getY(i)).toBeCloseTo(PAINT_Y, 6);
  });

  it('ribbon has 2 triangles per step and an irregular edge', () => {
    const g = ribbon([[0, 0], [8, 0]], 1, { salt: 1 });
    expect(Math.abs(triCount(g) - 20)).toBeLessThanOrEqual(2);
    const p = g.attributes.position;
    const widths = new Set();
    for (let i = 0; i < p.count; i++) {
      expect(p.getY(i)).toBe(0);
      widths.add(Math.round(Math.abs(p.getZ(i)) * 1000));
    }
    expect(widths.size).toBeGreaterThan(2);
    const n = g.attributes.normal;
    if (n) for (let i = 0; i < n.count; i++) expect(n.getY(i)).toBeGreaterThan(0.99);
  });

  it('blob is a triangle fan of n triangles facing up', () => {
    const g = blob(5, -3, 2, { n: 8, salt: 2 });
    expect(triCount(g)).toBe(8);
    const p = g.attributes.position;
    const a = new THREE.Vector3(), c = new THREE.Vector3(), d = new THREE.Vector3(), nrm = new THREE.Vector3();
    for (let t = 0; t < 8; t++) {
      a.fromBufferAttribute(p, t * 3);
      c.fromBufferAttribute(p, t * 3 + 1).sub(a);
      d.fromBufferAttribute(p, t * 3 + 2).sub(a);
      nrm.crossVectors(c, d);
      expect(nrm.y).toBeGreaterThan(0);
    }
  });

  it('tintGround multiplies the ground colours in place', () => {
    const m = b.ground(120, 0x7d9c55, { surface: 'grass' });
    m.updateMatrix();
    const attr = m.geometry.attributes.color;
    const before = Array.from(attr.array);
    tintGround(m, () => [0.5, 0.5, 0.5]);
    expect(m.geometry.attributes.color).toBe(attr);
    for (let i = 0; i < before.length; i++) expect(attr.array[i]).toBeCloseTo(before[i] * 0.5, 6);
  });

  it('tintGround hands fn world coordinates', () => {
    const m = b.ground(40, 0x7d9c55, { surface: 'grass' });
    m.position.set(10, 0, 20);
    m.updateMatrix();
    let minX = Infinity, maxZ = -Infinity;
    tintGround(m, (x, z) => { minX = Math.min(minX, x); maxZ = Math.max(maxZ, z); return [1, 1, 1]; });
    expect(minX).toBeCloseTo(-10, 4);
    expect(maxZ).toBeCloseTo(40, 4);
  });

  it('smoothField is pure and roughly -1..1', () => {
    expect(smoothField(3, 4, 7, 10)).toBe(smoothField(3, 4, 7, 10));
    for (let i = 0; i < 200; i++) {
      const v = smoothField(i * 1.7, i * -0.9, 5, 8);
      expect(Math.abs(v)).toBeLessThanOrEqual(1.0001);
    }
  });

  it('the helpers draw no Math.random inside withLocalUuids', () => {
    const real = Math.random;
    let n = 0;
    Math.random = () => { n++; return real(); };
    try {
      withLocalUuids('t', () => {
        const parts = [
          colorParts(new THREE.BoxGeometry(1, 1, 1), 0xff0000),
          colorParts(ribbon([[0, 0], [6, 2]], 1, {}), [0.2, 0.3, 0.1]),
        ];
        dressMesh(parts, { name: 'x' });
        paintMesh([colorParts(blob(0, 0, 1, {}), 0x335522)], {});
      });
    } finally {
      Math.random = real;
    }
    // withLocalUuids swaps Math.random for its own stream, so our counter is
    // never reached: any draw would have gone to the local stream instead.
    expect(n).toBe(0);
  });
});
