import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

// The same headless canvas stub every world test uses (see test/builder.test.js).
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

const { build, GORGE_FOG, GORGE_SKY } = await import('../src/world/gorge.js');
const { ROCK_FRAGMENT, ROCK_SHADE } = await import('../src/world/rockshade.js');

describe('polish-gorge5 task 1', () => {
  it('pushes the Gorge day fog out', () => {
    const scene = new THREE.Scene();
    build(scene);
    expect(GORGE_FOG).toEqual({ near: 60, far: 175 });
    expect(scene.fog.near).toBe(60);
    expect(scene.fog.far).toBe(175);
    expect(scene.fog.color.getHex()).toBe(GORGE_SKY.horizon);
  }, 120_000);

  it('fades the flutes and stretches the grain near the camera', () => {
    expect(ROCK_FRAGMENT).toContain('cameraPosition');
    const body = ROCK_FRAGMENT;
    const calls = (body.match(/\bvnoise\s*\(/g) ?? []).length - (body.match(/float\s+vnoise\s*\(/g) ?? []).length;
    expect(calls).toBeLessThanOrEqual(3);
    expect(ROCK_SHADE.nearLo).toBe(1.5);
    expect(ROCK_SHADE.nearHi).toBe(4);
  });
});
