import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

// Polish-water Task 2: the water's looks are option values and handle fields,
// never new objects. Every THREE Object3D/geometry/material draws four
// Math.random() numbers for its uuid, and the flat trace seeds Math.random
// before each build, so an area build that makes (or drops) one object moves
// the critters after it. The per-area draw counts below were measured on the
// code before this task and must stay equal.

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
  addEventListener() {},
  pointerLockElement: null,
  exitPointerLock() {},
});

const { createWater, waterRamp } = await import('../src/render/water.js');
const WORLDS = {
  neighborhood: await import('../src/world/neighborhood.js'),
  park: await import('../src/world/park.js'),
  woods: await import('../src/world/woods.js'),
  moor: await import('../src/world/moor.js'),
  river: await import('../src/world/river.js'),
  pines: await import('../src/world/pines.js'),
  seaside: await import('../src/world/seaside.js'),
  docks: await import('../src/world/docks.js'),
  gorge: await import('../src/world/gorge.js'),
};
const { mulberry32 } = await import('../src/rng.js');
const { buildCat } = await import('../src/cat/model.js');
const { createContactShadows } = await import('../src/render/contactshadows.js');

// Built in the flat trace's order: shared geometries and materials are cached
// across builds, so a count depends on what was built before it. The Gorge is
// 5132, up 12 from 5120, from main's gorge-rock merge (edge stones, boulders,
// strata); the Gorge is not in the flat trace, so nothing else moved.
const BUILD_DRAWS = { neighborhood: 4408, park: 2252, seaside: 860, docks: 6916, woods: 11344, river: 15484, moor: 7944, pines: 11580, gorge: 5132 };

function drawsOf(world) {
  // The flat trace builds a cat and the contact shadows around every area, and
  // both fill caches the area builds then reuse; do the same, uncounted.
  const scene = new THREE.Scene();
  createContactShadows(scene);
  buildCat('tabby');
  const real = Math.random;
  const seeded = mulberry32(12345);
  let draws = 0;
  Math.random = () => { draws++; return seeded(); };
  try {
    world.build(scene);
  } finally {
    Math.random = real;
  }
  return draws;
}

const hsl = (c) => new THREE.Color(c).getHSL({}, THREE.SRGBColorSpace);
const lightOf = (rgb) => new THREE.Color().setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, THREE.SRGBColorSpace).getHSL({}, THREE.SRGBColorSpace);

describe('water looks', () => {
  // ONE case, not one per area: the counts depend on which shared geometries
  // and materials earlier builds already cached, so they are only stable when
  // every world is built in the flat trace's order (BUILD_DRAWS's key order).
  // A case run alone would see cold caches and read a few draws high.
  it('every area build draws the same Math.random count as before', () => {
    const got = {};
    for (const id of Object.keys(BUILD_DRAWS)) got[id] = drawsOf(WORLDS[id]);
    expect(got).toEqual(BUILD_DRAWS);
  }, 240_000);

  it('the handle describes its water', () => {
    const fp = { id: 't', kind: 'rect', minX: 0, maxX: 10, minZ: 0, maxZ: 10 };
    const list = [fp];
    const fx = createWater(fp, { y: 0.04, color: 0x5f98a8, shores: ['maxX'], waters: list, quality: 'low' });
    expect(fx.footprint.id).toBe('t');
    expect(fx.footprint.shores).toEqual(['maxX']);
    expect(fx.y).toBe(0.04);
    expect(fx.color).toBe(0x5f98a8);
    expect(fx.style).toBe('clear');
    expect(fx.waters).toBe(list);
    expect(createWater(fp, { style: 'bog', quality: 'low' }).style).toBe('bog');
  });

  it('real areas hand their dressing the right records', () => {
    const woods = WORLDS.woods.build(new THREE.Scene()).waterFx;
    expect(woods.find((f) => f.footprint.id === 'lake').footprint.shores).toEqual(['maxX', 'maxZ']);
    const pines = WORLDS.pines.build(new THREE.Scene()).waterFx;
    expect(pines.find((f) => f.footprint.id === 'moor-river').footprint.shores).toEqual([]);
    expect(pines.find((f) => f.footprint.id === 'bog-1').style).toBe('bog');
  }, 120_000);

  it('the bog ramp stays deep and its foam stays dull', () => {
    const base = 0x4f5a33;
    const authored = hsl(base).l;
    const ramp = waterRamp(base, 'bog');
    expect(lightOf(ramp.deep).l).toBeGreaterThanOrEqual(0.8 * authored - 1e-6);
    expect(lightOf(ramp.foam).l).toBeLessThanOrEqual(0.45);
    // the clear ramp is unchanged
    expect(lightOf(waterRamp(base).foam).l).toBeCloseTo(0.93, 1);
  });

  it('the four Pines bogs are a murky green-brown', () => {
    const fx = WORLDS.pines.build(new THREE.Scene()).waterFx;
    const bogs = fx.filter((f) => /^bog-/.test(f.footprint.id));
    expect(bogs).toHaveLength(4);
    for (const b of bogs) {
      const c = hsl(b.color);
      expect(b.style).toBe('bog');
      expect(c.h).toBeGreaterThanOrEqual(0.12);
      expect(c.h).toBeLessThanOrEqual(0.25);
      expect(c.l).toBeGreaterThanOrEqual(0.2);
      expect(c.l).toBeLessThanOrEqual(0.35);
    }
  }, 120_000);
});
