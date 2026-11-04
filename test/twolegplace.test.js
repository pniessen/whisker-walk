import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

// The same headless canvas stub every world test uses (see test/budget.test.js):
// the texture painters read back their own canvas via getImageData.
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

const { house } = await import('../src/world/builder.js');
const { findFadeOccluders } = await import('../src/treefade.js');
const { mergeStaticProps } = await import('../src/render/mergeprops.js');

const LOOK = {
  door: 0x4a7ab0, trim: 0xf4efe4, shutters: 0x5a8a6a, flowerBox: true, entry: 'porch',
  chimney: [1.2, -0.8], gable: 0xf2d6c8,
};
const looks = {
  pyramid: { ...LOOK, roof: 'pyramid', entry: 'hood' },
  frontGable: { ...LOOK, roof: 'frontGable', entry: 'porch' },
  sideGable: { ...LOOK, roof: 'sideGable', entry: 'flat', chimney: [1.6, -1.1] },
};
const dressed = (roof, x = 0, z = 0) => house(x, z, 0xe8d8b0, 0xb05a4a, 'siding', looks[roof]);

const tris = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;
function trianglesOf(obj) {
  let n = 0;
  obj.traverse((o) => { if (o.isMesh) n += tris(o.geometry); });
  return n;
}
function countDraws(fn) {
  const real = Math.random;
  let draws = 0;
  Math.random = () => { draws++; return real(); };
  try { fn(); } finally { Math.random = real; }
  return draws;
}
const near = (a, b) => {
  for (const k of ['x', 'y', 'z']) {
    expect(a.min[k]).toBeCloseTo(b.min[k], 6);
    expect(a.max[k]).toBeCloseTo(b.max[k], 6);
  }
};

describe('house() look', () => {
  it('a plain house is exactly the shipped five meshes', () => {
    const h = house(0, 0);
    expect(h.children.length).toBe(5);
    expect(h.children[1].geometry.type).toBe('ConeGeometry');
    expect(h.getObjectByName('houseTrim')).toBeUndefined();
    expect(h.getObjectByName('houseGlass')).toBeUndefined();
  });

  for (const roof of ['pyramid', 'frontGable', 'sideGable']) {
    it(`${roof}: keeps the shipped non-precise box`, () => {
      near(new THREE.Box3().setFromObject(dressed(roof)), new THREE.Box3().setFromObject(house(0, 0)));
    });

    it(`${roof}: draws the same Math.random count as a plain house`, () => {
      dressed(roof, 3, 4); // warm the texture caches, uncounted
      house(3, 4);
      const plain = countDraws(() => house(3, 4));
      const look = countDraws(() => dressed(roof, 3, 4));
      expect(look).toBe(plain);
    });

    it(`${roof}: all dressing stays inside x,z ±2.8 and y 0..5 (precise box of houseTrim/houseGlass)`, () => {
      const h = dressed(roof);
      h.updateMatrixWorld(true);
      for (const name of ['houseTrim', 'houseGlass']) {
        const m = h.getObjectByName(name);
        expect(m, name).toBeDefined();
        const b = new THREE.Box3().setFromObject(m, true);
        expect(b.min.x).toBeGreaterThanOrEqual(-2.8 - 1e-6);
        expect(b.max.x).toBeLessThanOrEqual(2.8 + 1e-6);
        expect(b.min.z).toBeGreaterThanOrEqual(-2.8 - 1e-6);
        expect(b.max.z).toBeLessThanOrEqual(2.8 + 1e-6);
        expect(b.min.y).toBeGreaterThanOrEqual(-1e-6);
        expect(b.max.y).toBeLessThanOrEqual(5 + 1e-6);
      }
    });

    it(`${roof}: the roof is still child 1, one shingle mesh whose slopes face up`, () => {
      const h = dressed(roof);
      const r = h.children[1];
      expect(r.isMesh).toBe(true);
      expect(r.material.map).toBeTruthy();
      if (roof === 'pyramid') {
        expect(r.geometry.type).toBe('ConeGeometry');
        return;
      }
      expect(r.geometry.index).toBeNull();
      expect(tris(r.geometry)).toBe(4);
      expect(r.position.y).toBe(0);
      const n = r.geometry.attributes.normal;
      for (let i = 0; i < n.count; i++) expect(n.getY(i)).toBeGreaterThan(0.5);
      const p = r.geometry.attributes.position;
      let lo = Infinity, hi = -Infinity;
      for (let i = 0; i < p.count; i++) { lo = Math.min(lo, p.getY(i)); hi = Math.max(hi, p.getY(i)); }
      expect(lo).toBeCloseTo(2.8, 6);
      expect(hi).toBeCloseTo(5, 6);
    });
  }

  it('front windows and door are where they shipped', () => {
    const h = dressed('frontGable');
    const wins = h.children.filter((c) => c.userData.window && c.geometry.parameters?.width === 0.9);
    expect(wins.map((w) => w.position.toArray())).toEqual([[-1.6, 1.8, 2.01], [1.6, 1.8, 2.01]]);
    expect(h.children[2].position.toArray()).toEqual([0, 0.9, 2.01]);
    expect(h.children[2].material.color.getHex()).toBe(new THREE.Color(LOOK.door).getHex());
  });

  it('houseGlass is tagged window and treefade still finds the house', () => {
    for (const roof of Object.keys(looks)) {
      const scene = new THREE.Scene();
      scene.add(dressed(roof));
      const glass = scene.getObjectByName('houseGlass');
      expect(glass.userData.window).toBe(true);
      expect(glass.material.map).toBeNull();
      expect(glass.material.color.getHex()).toBe(new THREE.Color(0xa8d8e8).getHex());
      const occ = findFadeOccluders(scene);
      expect(occ.length).toBe(1);
      expect(occ[0].box.maxZ).toBeLessThanOrEqual(2.81);
    }
  });

  it('the trim survives the prop merge with its vertex colours', () => {
    const scene = new THREE.Scene();
    scene.add(dressed('sideGable'));
    mergeStaticProps(scene);
    const vc = [];
    scene.traverse((o) => { if (o.isMesh && o.material.vertexColors) vc.push(o); });
    expect(vc.length).toBeGreaterThan(0);
    for (const m of vc) expect(m.geometry.attributes.color).toBeDefined();
    // Every corner of the colour range is a real colour, not the default white.
    const c = vc[0].geometry.attributes.color;
    let dark = 0;
    for (let i = 0; i < c.count; i++) if (c.getX(i) + c.getY(i) + c.getZ(i) < 1.5) dark++;
    expect(dark).toBeGreaterThan(0);
  });

  it('a dressed house stays under 1,400 triangles more than a plain one', () => {
    const plain = trianglesOf(house(0, 0));
    for (const roof of Object.keys(looks)) {
      const extra = trianglesOf(dressed(roof)) - plain;
      expect(extra, roof).toBeGreaterThan(0);
      expect(extra, roof).toBeLessThanOrEqual(1400);
    }
  });

  it('is deterministic: the same look at the same spot builds the same trim', () => {
    const a = dressed('frontGable', 7, -3).getObjectByName('houseTrim').geometry.attributes;
    const b = dressed('frontGable', 7, -3).getObjectByName('houseTrim').geometry.attributes;
    expect(Array.from(a.position.array)).toEqual(Array.from(b.position.array));
    expect(Array.from(a.color.array)).toEqual(Array.from(b.color.array));
  });

  it('every look field is optional', () => {
    const h = house(0, 0, 0xe8d8b0, 0xb05a4a, 'siding', {});
    expect(h.children[1].geometry.type).toBe('ConeGeometry');
    expect(h.getObjectByName('houseTrim')).toBeDefined();
    expect(h.getObjectByName('houseGlass')).toBeDefined();
  });
});
