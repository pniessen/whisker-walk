import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

// Polish-water Task 3: the water dressing (src/render/waterdress.js) — a soft
// wet-earth band and foam line along the REAL shore, a few half-sunk stones.
// Each case builds the real area into a fresh scene, exactly as walk.js does,
// then dresses it.

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

const { createWaterDressing } = await import('../src/render/waterdress.js');
const { eveningWater, WATER_EVENING } = await import('../src/render/water.js');
const { resolveQuality } = await import('../src/render/quality.js');
const HIGH = resolveQuality({ override: 'high' });
const WORLDS = {
  woods: await import('../src/world/woods.js'),
  seaside: await import('../src/world/seaside.js'),
};

const built = new Map();
function area(id) {
  if (!built.has(id)) {
    const scene = new THREE.Scene();
    const areaData = WORLDS[id].build(scene);
    built.set(id, { scene, areaData });
  }
  return built.get(id);
}

function dress(id, opts = {}) {
  const { areaData } = area(id);
  const scene = new THREE.Scene();
  const fx = createWaterDressing(scene, { areaId: id, areaData, tier: HIGH, reducedMotion: false, ...opts });
  return { scene, fx, areaData };
}


const byName = (fx, name) => fx.meshes.find((m) => m.name === name);

function foamVerts(fx) {
  const g = byName(fx, 'waterdress:band').geometry;
  const col = g.getAttribute('color'), foam = g.getAttribute('aFoam');
  const out = [];
  for (let i = 0; i < foam.count; i++) {
    if (foam.getX(i) === 1 && col.getW(i) > 0) out.push({ r: col.getX(i), g: col.getY(i), b: col.getZ(i), a: col.getW(i) });
  }
  return out;
}
const lum = (v) => 0.2126 * v.r + 0.7152 * v.g + 0.0722 * v.b;
const maxOf = (list, f) => Math.max(...list.map(f));

describe('eveningWater', () => {
  it('eveningWater(null) leaves every material untouched', () => {
    const { areaData } = area('woods');
    eveningWater(areaData.waterFx, null);
    for (const h of areaData.waterFx) {
      expect(h.material.color.toArray()).toEqual([1, 1, 1]);
      expect(h.material.emissive.getHex()).toBe(0);
    }
  });
  it('sunset warms the water: red multiplier >= 1, blue <= 0.8, emissive non-black', () => {
    const scene = new THREE.Scene();
    const ad = WORLDS.woods.build(scene);
    eveningWater(ad.waterFx, 'sunset');
    for (const h of ad.waterFx) {
      expect(h.material.color.r).toBeGreaterThanOrEqual(1);
      expect(h.material.color.b).toBeLessThanOrEqual(0.8);
      expect(h.material.emissive.getHex()).not.toBe(0);
    }
  });
  it('dusk darkens: every channel <= 0.8, blue the largest', () => {
    const scene = new THREE.Scene();
    const ad = WORLDS.woods.build(scene);
    eveningWater(ad.waterFx, 'dusk');
    for (const h of ad.waterFx) {
      const { r, g, b } = h.material.color;
      expect(Math.max(r, g, b)).toBeLessThanOrEqual(0.8);
      expect(b).toBeGreaterThan(Math.max(r, g));
    }
    expect(WATER_EVENING.dusk.mul[2]).toBe(0.78);
  });
});

describe('the foam in the evening', () => {
  const day = foamVerts(dress('woods').fx);
  it('at dusk the foam rows are darker and fainter', () => {
    const dusk = foamVerts(dress('woods', { evening: 'dusk' }).fx);
    expect(day.length).toBeGreaterThan(0);
    expect(dusk.length).toBe(day.length);
    expect(maxOf(dusk, lum)).toBeLessThan(0.6 * maxOf(day, lum));
    expect(maxOf(dusk, (v) => v.a)).toBeLessThanOrEqual(0.55 * maxOf(day, (v) => v.a) + 1e-6);
  });
  it('at dusk the sea foam is darker and fainter too', () => {
    const d = foamVerts(dress('seaside').fx);
    const k = foamVerts(dress('seaside', { evening: 'dusk' }).fx);
    expect(maxOf(k, lum)).toBeLessThan(0.7 * maxOf(d, lum));
    expect(maxOf(k, (v) => v.a)).toBeLessThanOrEqual(0.6 * maxOf(d, (v) => v.a) + 1e-6);
  });
  it('at sunset the foam is warm', () => {
    for (const id of ['woods', 'seaside']) {
      const warm = foamVerts(dress(id, { evening: 'sunset' }).fx);
      expect(warm.length).toBeGreaterThan(0);
      for (const v of warm) expect(v.r).toBeGreaterThan(v.b);
    }
  });
  it('no evening gives byte-identical band geometry to before', () => {
    const a = byName(dress('woods').fx, 'waterdress:band').geometry;
    const b = byName(dress('woods', { evening: null }).fx, 'waterdress:band').geometry;
    for (const n of ['position', 'color', 'aFoam']) {
      expect(Array.from(b.getAttribute(n).array)).toEqual(Array.from(a.getAttribute(n).array));
    }
    // dusk moves only colour/alpha, never the positions
    const c = byName(dress('woods', { evening: 'dusk' }).fx, 'waterdress:band').geometry;
    expect(Array.from(c.getAttribute('position').array)).toEqual(Array.from(a.getAttribute('position').array));
  });
  it('the sea apron takes the water tint at dusk', () => {
    const d = byName(dress('seaside').fx, 'waterdress:apron').material.color;
    const k = byName(dress('seaside', { evening: 'dusk' }).fx, 'waterdress:apron').material.color;
    expect(k.r).toBeLessThan(d.r);
  });
});
