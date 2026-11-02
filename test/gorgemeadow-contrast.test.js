import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

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

const { gorgeMeadow, topColor, MEADOW_SAND, MEADOW_GREEN } = await import('../src/world/gorge.js');

describe('Gorge clifftop colour patches', () => {
  it('show real contrast: a fifth of cells read green and a fifth read sand', () => {
    const tops = gorgeMeadow().patches.filter((p) => p.kind === 'top');
    const srgb = (c) => { const o = {}; c.getRGB(o, THREE.SRGBColorSpace); return o; };
    const near = (a, b) => Math.abs(a.r - b.r) <= 0.05 && Math.abs(a.g - b.g) <= 0.05 && Math.abs(a.b - b.b) <= 0.05;
    const green = srgb(new THREE.Color(MEADOW_GREEN)), sand = srgb(new THREE.Color(MEADOW_SAND));
    let g = 0, s = 0;
    const c = new THREE.Color();
    for (const p of tops) {
      const col = srgb(topColor(c, (p.x0 + p.x1) / 2, (p.z0 + p.z1) / 2));
      if (near(col, green)) g++;
      if (near(col, sand)) s++;
    }
    expect(g / tops.length).toBeGreaterThanOrEqual(0.2);
    expect(s / tops.length).toBeGreaterThanOrEqual(0.2);
  });
});
