import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

// polish-gorgeday2: the Gorge by day in colour. A clear walk repaints the
// built canyon once (paintGorgeDay); dusk, rain and sunset keep the build's
// colours and the rock's ROCK_SHADE program, unchanged.

vi.stubGlobal('document', {
  addEventListener() {},
  pointerLockElement: null,
  exitPointerLock() {},
  createElement: () => ({
    width: 0,
    height: 0,
    getContext: () => new Proxy({}, {
      get: (_t, key) => {
        if (key === 'getImageData') return (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
        if (key === 'measureText') return () => ({ width: 0 });
        if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop: () => {} });
        return () => {};
      },
      set: () => true,
    }),
  }),
});

const gorge = await import('../src/world/gorge.js');
const { patchRockMaterial, ROCK_FRAGMENT, ROCK_DAY_FRAGMENT } = await import('../src/world/rockshade.js');
const { clearDaySky } = await import('../src/weather.js');

const colours = (scene) => {
  const out = new Map();
  scene.traverse((o) => { const c = o.isMesh && o.geometry.getAttribute('color'); if (c) out.set(o, c); });
  return out;
};
const hsl = (r, g, b) => { const h = {}; new THREE.Color(r, g, b).getHSL(h); return h; };

describe('the Gorge clear-day paint (polish-gorgeday2)', () => {
  const scene = new THREE.Scene();
  gorge.build(scene);
  const before = colours(scene);
  const arrays = new Map([...before].map(([m, c]) => [m, c.array.slice()]));

  it('only a clear, non-dusk walk paints', () => {
    expect(gorge.gorgeDayPaints({ weather: { condition: 'clear' }, dusk: false })).toBe(true);
    expect(gorge.gorgeDayPaints({ weather: { condition: 'clear' }, dusk: true })).toBe(false);
    expect(gorge.gorgeDayPaints({ weather: { condition: 'rain' } })).toBe(false);
    expect(gorge.gorgeDayPaints({ weather: { condition: 'sunset' } })).toBe(false);
  });

  it('paints new attributes, leaving the build (and its cached arrays) as they were', () => {
    const n = gorge.paintGorgeDay(scene);
    expect(n).toBeGreaterThan(5);
    for (const [m, c] of before) {
      // the build's own arrays are untouched
      expect(c.array).toEqual(arrays.get(m));
    }
    const rock = scene.getObjectByName('rockFaces');
    expect(rock.geometry.getAttribute('color')).not.toBe(before.get(rock));
    expect(rock.material.userData.rockDay).toBe(true);
    expect(rock.material.customProgramCacheKey()).toContain('-day');
  }, 120_000);

  it('walls are warmer and deeper than the floor, the floor cooler', () => {
    const W = gorge.gorgeDayRockMul(0, 6, 0, 0);
    expect(W[0]).toBeGreaterThan(W[1]);
    expect(W[1]).toBeGreaterThan(W[2]);
    expect(W[2]).toBeLessThan(0.7);
    // the damp foot keeps nearly its own colour
    const foot = gorge.gorgeDayRockMul(0, 0.1, 0, 0);
    expect(Math.max(...foot) - Math.min(...foot)).toBeLessThan(0.15);
    // the open floor goes cooler: blue gains on red
    const F = gorge.gorgeDayFloorMul(-1, 40);
    expect(F[2]).toBeGreaterThan(F[0]);
  });

  it('the floor is darker by the stream and green in a few patches near it', () => {
    let greenest = 0, far = 0;
    for (let z = -50; z <= 50; z += 0.5) {
      const near = gorge.gorgeDayFloorMul(-6.5, z);
      greenest = Math.max(greenest, near[1] / near[0]);
      const away = gorge.gorgeDayFloorMul(-1, z);
      far = Math.max(far, away[1] / away[0]);
    }
    expect(greenest).toBeGreaterThan(1.25);
    expect(far).toBeLessThan(1.1);
    const wet = gorge.gorgeDayFloorMul(-7.6, 40), dry = gorge.gorgeDayFloorMul(-1, 40);
    expect(wet[0]).toBeLessThan(dry[0]);
  });

  it('the clifftop drifts darker in places, a shade warmer everywhere', () => {
    let lo = Infinity, hi = 0;
    for (let x = 4; x < 34; x += 0.5) for (let z = -39; z < -19; z += 0.5) {
      const m = gorge.gorgeDayClifftopMul(x, z);
      expect(m[0]).toBeGreaterThan(m[2]);
      lo = Math.min(lo, m[1]); hi = Math.max(hi, m[1]);
    }
    expect(hi - lo).toBeGreaterThan(0.12);
  });

  it('tors go grey-brown and keep their lichen', () => {
    const tors = scene.getObjectByName('tors');
    let browner = 0, all = 0;
    tors.traverse((t) => {
      if (!t.isMesh) return;
      const c = t.geometry.getAttribute('color');
      for (let i = 0; i < c.count; i++) {
        all++;
        const h = hsl(c.getX(i), c.getY(i), c.getZ(i));
        if (c.getX(i) > c.getZ(i) * 1.2 && h.s < 0.5) browner++;
      }
    });
    expect(browner / all).toBeGreaterThan(0.5);
  });
});

describe('dusk and rain keep the build to the bit (polish-gorgeday2)', () => {
  it('a build is the same with or without a day walk before it', () => {
    const a = new THREE.Scene();
    gorge.build(a);
    gorge.paintGorgeDay(a);
    const b = new THREE.Scene();
    gorge.build(b);
    const c = new THREE.Scene();
    gorge.build(c);
    const cb = colours(b), cc = [...colours(c).values()];
    [...cb.values()].forEach((v, i) => expect(v.array).toEqual(cc[i].array));
    expect(b.getObjectByName('rockFaces').material.userData.rockDay).toBeUndefined();
  }, 180_000);

  it('the night program is the old one; the day one only bolder strata', () => {
    const shader = () => ({
      vertexShader: '#include <common>\n#include <worldpos_vertex>',
      fragmentShader: '#include <common>\n#include <color_fragment>\n#include <normal_fragment_maps>',
    });
    const night = patchRockMaterial(new THREE.MeshStandardMaterial());
    const s1 = shader();
    night.onBeforeCompile(s1);
    expect(night.customProgramCacheKey()).toBe('gorge-rock-v3');
    const day = patchRockMaterial(new THREE.MeshStandardMaterial());
    day.userData.rockDay = true;
    const s2 = shader();
    day.onBeforeCompile(s2);
    expect(day.customProgramCacheKey()).toBe('gorge-rock-v3-day');
    expect(s1.fragmentShader).not.toBe(s2.fragmentShader);
    expect(ROCK_DAY_FRAGMENT).not.toBe(ROCK_FRAGMENT);
  });

  it('the sky band is a clear blue, the haze farther and bluer', () => {
    const L = gorge.GORGE_DAY_LOOK;
    const g = clearDaySky(gorge.GORGE_SKY.top, gorge.GORGE_SKY.horizon, L);
    const h = new THREE.Color(g.horizon);
    expect(h.b).toBeGreaterThan(h.r);
    expect(L.fogNear).toBeGreaterThanOrEqual(100);
    expect(L.fogFar).toBeGreaterThanOrEqual(270);
  });
});
