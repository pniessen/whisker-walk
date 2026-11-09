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
      expect(glass.userData.noCast).toBe(true);
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

const { build: buildNeighborhood } = await import('../src/world/neighborhood.js');

describe('the Neighbourhood street of houses', () => {
  const scene = new THREE.Scene();
  buildNeighborhood(scene);
  scene.updateMatrixWorld(true);
  const houses = scene.children.filter((c) => c.getObjectByName && c.getObjectByName('houseTrim') && c.children.length >= 5 && c.children[1].isMesh);

  it('all eight lot houses are dressed', () => {
    expect(houses.length).toBe(8);
  });

  it('uses each roof style at least twice (pyramid is the cone)', () => {
    const cones = houses.filter((h) => h.children[1].geometry.type === 'ConeGeometry').length;
    expect(cones).toBeGreaterThanOrEqual(2);
    expect(houses.length - cones).toBeGreaterThanOrEqual(4);
    // gable roofs are 4-triangle meshes; front vs side differ in ridge direction
    const ridge = (h) => {
      const p = h.children[1].geometry.attributes.position;
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (let i = 0; i < p.count; i++) if (p.getY(i) > 4.9) {
        minX = Math.min(minX, p.getX(i)); maxX = Math.max(maxX, p.getX(i));
        minZ = Math.min(minZ, p.getZ(i)); maxZ = Math.max(maxZ, p.getZ(i));
      }
      return maxX - minX > maxZ - minZ ? 'side' : 'front';
    };
    const gables = houses.filter((h) => h.children[1].geometry.type !== 'ConeGeometry');
    expect(cones).toBe(3);
    expect(gables.filter((h) => ridge(h) === 'front').length).toBe(3);
    expect(gables.filter((h) => ridge(h) === 'side').length).toBe(2);
  });

  it('every house trim stays inside local x,z +-2.8 and y <= 5', () => {
    for (const h of houses) {
      for (const name of ['houseTrim', 'houseGlass']) {
        const b = new THREE.Box3().setFromObject(h.getObjectByName(name), true);
        expect(b.min.x - h.position.x).toBeGreaterThanOrEqual(-2.8 - 1e-6);
        expect(b.max.x - h.position.x).toBeLessThanOrEqual(2.8 + 1e-6);
        expect(b.min.z - h.position.z).toBeGreaterThanOrEqual(-2.8 - 1e-6);
        expect(b.max.z - h.position.z).toBeLessThanOrEqual(2.8 + 1e-6);
        expect(b.max.y).toBeLessThanOrEqual(5 + 1e-6);
      }
    }
  });

  it('the (-12,15) house keeps its cone roof and nothing rises over the climb chain', () => {
    const h = houses.find((c) => c.position.x === -12 && c.position.z === 15);
    expect(h.children[1].geometry.type).toBe('ConeGeometry');
    for (const name of ['houseTrim', 'houseGlass']) {
      const g = h.getObjectByName(name).geometry;
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        const inside = x >= 0 && x <= 3 && z >= -0.5 && z <= 1.5 && y > 3;
        expect(inside, `${name} vertex ${i}`).toBe(false);
      }
    }
  });
});

// Task 3: the Seaside's six bushes become beach plants (marram grass clumps
// and sea holly). bush(x, z, { style: 'beach' }) must cost exactly the default
// bush's Math.random draws (Three's uuids, 4 per object), because the
// Seaside's build count is pinned (test/waterlooks.test.js) and feeds the
// pinned flat trace.
describe('bush() beach style', async () => {
  const { bush, SWAY_BUSH } = await import('../src/world/builder.js');
  const { build: buildSeaside, SEASIDE_BUSHES, SEASIDE_BUSHES_EXTRA } = await import('../src/world/seaside.js');
  const SPOTS = [...SEASIDE_BUSHES, ...SEASIDE_BUSHES_EXTRA];
  const fakeWind = () => {
    const added = [];
    return { added, add: (obj, opts) => added.push({ obj, opts }) };
  };
  const meshOf = (o) => {
    let m = null;
    o.traverse((c) => { if (c.isMesh) m = c; });
    return m;
  };

  it('draws exactly as many Math.random values as a default bush, warm, with and without wind', () => {
    for (const [x, z] of SPOTS) {
      bush(x, z); bush(x, z, { style: 'beach' }); // warm
      expect(countDraws(() => bush(x, z, { style: 'beach' }))).toBe(countDraws(() => bush(x, z)));
      expect(countDraws(() => bush(x, z, { style: 'beach', wind: fakeWind() })))
        .toBe(countDraws(() => bush(x, z, { wind: fakeWind() })));
    }
  });

  it('is one mesh of at most 100 triangles (the shrub it replaces), standing on the ground', () => {
    for (const [x, z] of SPOTS) {
      const m = bush(x, z, { style: 'beach' });
      expect(m.isMesh).toBe(true);
      expect(m.position.toArray()).toEqual([x, 0, z]);
      expect(trianglesOf(m)).toBeLessThanOrEqual(100);
      m.geometry.computeBoundingBox();
      expect(m.geometry.boundingBox.min.y).toBeGreaterThanOrEqual(-1e-6);
      expect(m.geometry.boundingBox.min.y).toBeLessThan(0.05);
      expect(m.material.vertexColors).toBe(true);
      expect(m.material.side).toBe(THREE.DoubleSide);
    }
  });

  it('with wind: a Group hinged at (x, 0, z), registered as a bush, mesh at local y 0', () => {
    const [x, z] = SPOTS[0];
    const wind = fakeWind();
    const g = bush(x, z, { style: 'beach', wind });
    expect(g.isGroup).toBe(true);
    expect(g.position.toArray()).toEqual([x, 0, z]);
    expect(wind.added).toHaveLength(1);
    expect(wind.added[0].obj).toBe(g);
    expect(wind.added[0].opts).toEqual({ sizeHint: 0.55, amplitude: SWAY_BUSH });
    expect(g.children).toHaveLength(1);
    expect(g.children[0].position.toArray()).toEqual([0, 0, 0]);
  });

  it('the six Seaside spots hold at least two marram and two sea holly, with the right heights', async () => {
    const kinds = { marram: 0, holly: 0 };
    const { propsFor } = await import('../src/propsets.js');
    for (const [x, z] of SPOTS) {
      const isHide = propsFor('seaside').hides.some((h) => h.x === x && h.z === z);
      const m = bush(x, z, { style: 'beach', kind: isHide ? 'marram' : (x === -24 && z === -20 ? 'holly' : undefined) });
      const kind = m.userData.beachPlant;
      kinds[kind]++;
      m.geometry.computeBoundingBox();
      const top = m.geometry.boundingBox.max.y;
      if (kind === 'marram') expect(top).toBeGreaterThan(0.75);
      if (kind === 'marram') expect(top).toBeLessThan(1.4);
      if (kind === 'holly') expect(top).toBeLessThan(0.75);
    }
    expect(kinds.marram).toBeGreaterThanOrEqual(2);
    expect(kinds.holly).toBeGreaterThanOrEqual(2);
  });

  it('every Seaside mouse hide has marram on it (holly is too low to hide in)', async () => {
    const { propsFor } = await import('../src/propsets.js');
    const hides = propsFor('seaside').hides;
    expect(hides.length).toBe(3);
    const scene = new THREE.Scene();
    buildSeaside(scene, { wind: fakeWind() });
    for (const h of hides) {
      const plants = [];
      scene.traverse((o) => {
        if (o.userData.beachPlant && Math.hypot((o.parent.isGroup ? o.parent : o).position.x - h.x, (o.parent.isGroup ? o.parent : o).position.z - h.z) < 0.01) plants.push(o);
      });
      expect(plants.length, `plant at ${h.x},${h.z}`).toBe(1);
      expect(plants[0].userData.beachPlant).toBe('marram');
    }
  }, 30000);

  it('the Seaside builds beach plants, not shrubs, and stays at or under 29,521 triangles', () => {
    const scene = new THREE.Scene();
    const wind = fakeWind();
    buildSeaside(scene, { wind });
    expect(wind.added).toHaveLength(6);
    for (const { obj } of wind.added) expect(meshOf(obj).userData.beachPlant).toMatch(/^(marram|holly)$/);
    let n = 0;
    scene.traverse((o) => { if (o.isMesh) n += tris(o.geometry); });
    expect(Math.round(n)).toBeLessThanOrEqual(29521);
  }, 30000);

  it('a default bush is unchanged: the canopy shrub at belly height', () => {
    const m = bush(8, 2);
    expect(m.position.toArray()).toEqual([8, 0.5, 2]);
    expect(m.userData.beachPlant).toBeUndefined();
    // polish-pines2: the default bush is a leafy shrub with vertex colours
    // now too (test/shrubs.test.js), so tell it from a beach clump by the
    // clump's double-sided material instead.
    // polish-bushes: the shrub is double-sided now too (its leaf cards), so
    // tell it from a beach clump by its tinted (non-white) material colour.
    expect(m.material.color.getHex()).not.toBe(0xffffff);
  });
});
