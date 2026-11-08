import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

// polish-gorge7 Task 2: the Gorge floor's wash (damp by the stream, faint
// drift bands) lives in the ground plane's vertex colours, and its dusk
// lawnTint keeps the floor warm. polish-gorgelight: the wall feet are darker
// damp sand now (they were paler, a haze band), and the open middle warm ochre.

// The same headless canvas stub every world test uses (see test/park.test.js).
vi.stubGlobal('document', {
  addEventListener() {},
  pointerLockElement: null,
  exitPointerLock() {},
  createElement: () => ({
    width: 0,
    height: 0,
    getContext: () => new Proxy({}, {
      get: (_target, key) => {
        if (key === 'getImageData') return (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
        if (key === 'measureText') return () => ({ width: 0 });
        if (key === 'createLinearGradient' || key === 'createRadialGradient') {
          return () => ({ addColorStop: () => {} });
        }
        return () => {};
      },
      set: () => true,
    }),
  }),
});

const gorge = await import('../src/world/gorge.js');
const b = await import('../src/world/builder.js');
const { duskLook, duskLawnColor } = await import('../src/render/dusk.js');
const { gorgeFloorWash, FLOOR_WASH, GORGE_FLOOR_COLOR, build } = gorge;

// Rec.709 luminance of a multiplier triple.
const lum = ([r, g, bb]) => 0.2126 * r + 0.7152 * g + 0.0722 * bb;

const scene = new THREE.Scene();
const area = build(scene);
const plane = scene.getObjectByName('groundPlane');

describe('Gorge floor wash (polish-gorge7)', () => {
  it('exports frozen constants', () => {
    expect(Object.isFrozen(FLOOR_WASH)).toBe(true);
    expect(Object.keys(FLOOR_WASH).sort()).toEqual(['band', 'damp', 'foot', 'ochre']);
  });

  it('is darker and browner within 1 m of the stream than mid-Narrows', () => {
    const mid = gorgeFloorWash(-34, -11);
    for (const [x, z] of [[-10.3, 0], [-7.2, 20], [-8.75, -30], [-10.4, -11]]) {
      const w = gorgeFloorWash(x, z);
      expect(lum(w)).toBeLessThanOrEqual(lum(mid) - 0.1);
      // browner than the plain floor: blue drops more than red (the open
      // middle is ochre, yellower still: that is a hue, not damp)
      expect(w[2] / w[0]).toBeLessThan(0.97);
    }
  });

  it('is darker at a wall foot than mid-Narrows (polish-gorgelight: was paler, a haze band)', () => {
    expect(lum(gorgeFloorWash(-34, -15.2))).toBeLessThan(lum(gorgeFloorWash(-34, -11)) - 0.05);
    expect(lum(gorgeFloorWash(-34, -6.8))).toBeLessThan(lum(gorgeFloorWash(-34, -11)) - 0.05);
  });

  it('is a warm ochre in the open middle: red up, blue down, about the same light', () => {
    const w = gorgeFloorWash(-3, 10);
    expect(w[0]).toBeGreaterThan(1.0);
    expect(w[2]).toBeLessThan(0.95);
    expect(Math.abs(lum(w) - 1)).toBeLessThanOrEqual(0.06);
  });

  it('has faint drift bands: not constant across the Narrows, within ±6 %', () => {
    const ls = [];
    for (let z = -15; z <= -7; z += 0.25) ls.push(lum(gorgeFloorWash(-34, z)));
    expect(Math.max(...ls) - Math.min(...ls)).toBeGreaterThanOrEqual(0.03);
    // the darker feet take up to 11 % (polish-gorgelight)
    for (const l of ls) expect(Math.abs(l - 1)).toBeLessThanOrEqual(0.12);
    // and the bands alone (away from walls and water) vary too
    const open = [];
    for (let z = -40; z <= 40; z += 0.5) open.push(lum(gorgeFloorWash(-3, z)));
    expect(Math.max(...open) - Math.min(...open)).toBeGreaterThanOrEqual(0.05);
    for (const l of open) expect(Math.abs(l - 1)).toBeLessThanOrEqual(0.045);
  });

  it('stays in 0.75..1.12 per channel, finite and deterministic at every plane vertex', () => {
    plane.updateMatrix();
    const pos = plane.geometry.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(plane.matrix);
      const w = gorgeFloorWash(v.x, v.z);
      expect(gorgeFloorWash(v.x, v.z)).toEqual(w);
      for (const c of w) {
        expect(Number.isFinite(c)).toBe(true);
        expect(c).toBeGreaterThanOrEqual(0.75);
        expect(c).toBeLessThanOrEqual(1.12);
      }
    }
    // far off any wall or water, and inside the water itself
    for (const [x, z] of [[-60, 60], [60, -60], [-8.75, 0], [-8.75, -11]]) {
      for (const c of gorgeFloorWash(x, z)) expect(Number.isFinite(c)).toBe(true);
    }
  });

  it('is written into the built groundPlane vertex colours', () => {
    const fresh = b.ground(120, GORGE_FLOOR_COLOR, { surface: 'grass' });
    fresh.updateMatrix();
    const pos = plane.geometry.attributes.position;
    const col = plane.geometry.attributes.color;
    const ref = fresh.geometry.attributes.color;
    expect(plane.material.vertexColors).toBe(true);
    const v = new THREE.Vector3();
    let near = 0;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(fresh.matrix);
      const w = gorgeFloorWash(v.x, v.z);
      for (let k = 0; k < 3; k++) {
        expect(col.array[i * 3 + k]).toBeCloseTo(ref.array[i * 3 + k] * w[k], 5);
      }
      if (Math.abs(v.x + 8.75) < 1.8 && Math.abs(v.z) < 50) {
        near++;
        expect(lum([col.getX(i), col.getY(i), col.getZ(i)]))
          .toBeLessThan(lum([ref.getX(i), ref.getY(i), ref.getZ(i)]) - 0.05);
      }
    }
    expect(near).toBeGreaterThan(20);
  });
});

describe('Gorge dusk floor (polish-gorge7)', () => {
  it('keeps the floor warm at dusk but still darker', () => {
    const t = area.duskLight.lawnTint;
    expect(t.desat).toBeLessThanOrEqual(0.15);
    expect(t.dark).toBeGreaterThanOrEqual(0.7);
    expect(t.dark).toBeLessThanOrEqual(0.85);
    expect(t.cool[0]).toBeGreaterThanOrEqual(t.cool[1]);
    expect(t.cool[1]).toBeGreaterThanOrEqual(t.cool[2]);
    const look = duskLook(area);
    expect(look.lawnTint).toEqual(t);
    expect(look.sunColor).toBe(0xff9a52);
    const c = duskLawnColor(new THREE.Color(GORGE_FLOOR_COLOR), look);
    expect(c.r - c.b).toBeGreaterThanOrEqual(0.04);
    expect(c.r).toBeLessThan(new THREE.Color(GORGE_FLOOR_COLOR).r);
  });
});
