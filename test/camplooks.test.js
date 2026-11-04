import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

// polish-camps3: each clan's camp in its own colours (CAMP_LOOKS), with no new
// vertices, meshes or Math.random draws. The headless canvas stub every world
// test uses (see test/camp.test.js).
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

const { addCamp, CAMP_LOOKS, campLook, campDressing } = await import('../src/world/camp.js');
const { gorgeGround } = await import('../src/world/gorgeshape.js');

const CAMPS = ['woods', 'river', 'moor', 'pines'];
const ALL = [...CAMPS, 'gorge'];

// position.count of each camp geometry, recorded on the code before
// polish-camps3 (addCamp into a fresh Scene, { colliders: [] }; the Gorge with
// its ground). The clearing is 57 since polish-camps4 (two-ring fading disc; was 30).
const BASE_VERTS = {
  woods: { campDen: 3474, campRock: 348, campNests: 1620, campClearing: 57 },
  river: { campDen: 3474, campRock: 348, campNests: 1620, campClearing: 57 },
  moor: { campDen: 3474, campRock: 348, campNests: 1620, campClearing: 57 },
  pines: { campDen: 3474, campRock: 348, campNests: 1620, campClearing: 57 },
  gorge: { campBedding: 1620, campRock: 348 },
};

const build = (a) => {
  const scene = new THREE.Scene();
  addCamp(scene, a === 'gorge' ? { colliders: [], ground: gorgeGround() } : { colliders: [] }, a);
  return scene;
};
const distinct = (xs) => new Set(xs).size === xs.length;
const lin = (hex) => new THREE.Color(hex);
const sameColor = (col, i, c) => Math.abs(col.getX(i) - c.r) < 1e-6
  && Math.abs(col.getY(i) - c.g) < 1e-6 && Math.abs(col.getZ(i) - c.b) < 1e-6;

describe('CAMP_LOOKS', () => {
  it('every clan camp has its own look', () => {
    expect(Object.isFrozen(CAMP_LOOKS)).toBe(true);
    for (const a of ALL) {
      const L = CAMP_LOOKS[a];
      expect(L, a).toBeDefined();
      expect(campLook(a)).toBe(L);
      for (const k of ['ring', 'den', 'floor', 'nest']) expect(L[k], `${a} ${k}`).toBeDefined();
      expect(Number.isInteger(L.rock)).toBe(true);
      expect(['sand', 'gravel', 'grass']).toContain(L.floor.surface);
    }
    expect(distinct(CAMPS.map((a) => CAMP_LOOKS[a].floor.color))).toBe(true);
    expect(distinct(ALL.map((a) => CAMP_LOOKS[a].rock))).toBe(true);
    expect(distinct(CAMPS.map((a) => CAMP_LOOKS[a].ring.greens[0]))).toBe(true);
    expect(campLook('legacy-x')).toEqual(CAMP_LOOKS.woods);
    expect(campLook(undefined)).toEqual(CAMP_LOOKS.woods);
    expect(campLook('__proto__')).toEqual(CAMP_LOOKS.woods);
  });

  it('addCamp paints the floor and the rock in the clan\'s colours', () => {
    for (const a of CAMPS) {
      const scene = build(a);
      const look = CAMP_LOOKS[a];
      const clearing = scene.getObjectByName('campClearing');
      expect(clearing.material.color.getHex(), a).toBe(look.floor.color);
      expect(clearing.material.map?.name, a).toBe(`surface:${look.floor.surface}`);
      expect(scene.getObjectByName('campRock').material.color.getHex(), a).toBe(look.rock);
    }
    expect(CAMP_LOOKS.river.floor.surface).toBe('gravel');
    expect(build('gorge').getObjectByName('campRock').material.color.getHex()).toBe(0xb8825a);
  }, 120_000);

  it('the ring carries the clan\'s specks as whole facets', () => {
    for (const a of CAMPS) {
      const look = CAMP_LOOKS[a];
      const col = build(a).getObjectByName('campRing').geometry.attributes.color;
      const tris = col.count / 3;
      // clump triangles (28 a clump: 20 + 8) come first in the merged ring,
      // the canes' after them
      const clumpTris = 28 * campDressing(a, []).ring.clumps.length;
      expect(tris, a).toBeGreaterThan(clumpTris);
      const specks = look.ring.specks.map(([hex, share]) => ({ c: lin(hex), share, n: 0 }));
      for (let t = 0; t < tris; t++) {
        for (const s of specks) {
          const hits = [0, 1, 2].filter((k) => sameColor(col, t * 3 + k, s.c)).length;
          expect(hits === 0 || hits === 3, `${a} tri ${t}: ${hits} speck corners`).toBe(true);
          if (hits === 3) {
            expect(t, `${a} speck on a cane triangle`).toBeLessThan(clumpTris);
            s.n++;
          }
        }
      }
      for (const s of specks) {
        expect(s.n, `${a} ${s.c.getHexString()}`).toBeGreaterThanOrEqual(1);
        expect(s.n / clumpTris, `${a} ${s.c.getHexString()}`).toBeLessThanOrEqual(1.5 * s.share);
      }
    }
  }, 120_000);

  it('the den and the nests take the clan\'s colours', () => {
    const denCols = {};
    for (const a of ALL) {
      const scene = build(a);
      if (a !== 'gorge') denCols[a] = Array.from(scene.getObjectByName('campDen').geometry.attributes.color.array);
      const nests = scene.getObjectByName(a === 'gorge' ? 'campBedding' : 'campNests');
      const col = nests.geometry.attributes.color;
      const moss = lin(CAMP_LOOKS[a].nest.moss);
      let found = false;
      for (let i = 0; i < col.count && !found; i++) {
        const k = [col.getX(i) / moss.r, col.getY(i) / moss.g, col.getZ(i) / moss.b];
        found = k.every((v) => v >= 0.8 - 1e-4 && v <= 1.15 + 1e-4 && Math.abs(v - k[0]) < 1e-3);
      }
      expect(found, a).toBe(true);
    }
    for (let i = 0; i < CAMPS.length; i++) {
      for (let j = i + 1; j < CAMPS.length; j++) {
        expect(denCols[CAMPS[i]], `${CAMPS[i]}/${CAMPS[j]}`).not.toEqual(denCols[CAMPS[j]]);
      }
    }
  }, 120_000);

  it('the ring canes and the den frame take the clan\'s colours', () => {
    // some vertex whose colour is `base` times one factor in [lo, hi]
    const scaled = (col, base, lo, hi) => {
      for (let i = 0; i < col.count; i++) {
        const k = [col.getX(i) / base.r, col.getY(i) / base.g, col.getZ(i) / base.b];
        if (k.every((v) => v >= lo - 1e-4 && v <= hi + 1e-4 && Math.abs(v - k[0]) < 1e-3)) return true;
      }
      return false;
    };
    const rings = {};
    for (const a of CAMPS) {
      const scene = build(a);
      const look = CAMP_LOOKS[a];
      const ring = scene.getObjectByName('campRing').geometry.attributes.color;
      rings[a] = Array.from(ring.array);
      expect(scaled(ring, lin(look.ring.strand), 0.85, 1.15), `${a} cane`).toBe(true);
      const den = scene.getObjectByName('campDen').geometry.attributes.color;
      expect(scaled(den, lin(look.den.frame), 0.8, 1.2), `${a} den frame`).toBe(true);
    }
    expect(rings.woods).not.toEqual(rings.pines);
  }, 120_000);

  it('no new vertices', () => {
    for (const a of ALL) {
      const scene = build(a);
      // the ring: 28 triangles a clump and 6 a cane segment (polish-camps4),
      // no more than the 10,080 vertices it had with the arched strands
      if (a !== 'gorge') {
        const { clumps, canes } = campDressing(a, []).ring;
        const segs = canes.reduce((n, c) => n + c.length - 1, 0);
        const ring = scene.getObjectByName('campRing').geometry.attributes.position.count;
        expect(ring, `${a} campRing`).toBe(3 * (28 * clumps.length + 6 * segs));
        expect(ring, `${a} campRing`).toBeLessThanOrEqual(10080);
      }
      for (const [name, n] of Object.entries(BASE_VERTS[a])) {
        expect(scene.getObjectByName(name).geometry.attributes.position.count, `${a} ${name}`).toBe(n);
      }
    }
  }, 120_000);

  it('the same camp twice is the same colours', () => {
    const a = build('moor').getObjectByName('campRing').geometry.attributes.color.array;
    const b = build('moor').getObjectByName('campRing').geometry.attributes.color.array;
    expect(Array.from(a)).toEqual(Array.from(b));
  }, 120_000);
});
