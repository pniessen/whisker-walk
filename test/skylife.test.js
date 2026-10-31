import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

// The same headless canvas stub every world test uses (see test/grass.test.js);
// litMaterial may reach for a canvas.
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

const { createSkyLife } = await import('../src/skylife.js');
const { mulberry32 } = await import('../src/rng.js');

// src/skylife.js is birds only now (render/clouds.js owns the clouds): a flock
// of three every 40-80 seconds, flying straight across the area and removed
// once every bird is past the edge.
const birdsIn = (scene) => scene.children.filter((c) => c.isMesh);

function make(opts = {}) {
  const scene = new THREE.Scene();
  const sky = createSkyLife(scene, { rng: mulberry32(1234), ...opts });
  return { scene, sky };
}

describe('sky life birds', () => {
  it('spawns a flock within 80 seconds', () => {
    const { scene, sky } = make();
    let t = 0;
    while (birdsIn(scene).length === 0 && t < 81) { sky.update(0.25); t += 0.25; }
    expect(t).toBeLessThanOrEqual(80);
    expect(birdsIn(scene)).toHaveLength(3);
    for (const b of birdsIn(scene)) expect(b.position.y).toBeGreaterThan(10);
  });

  it('despawns a flock once it has crossed, then sends another; never more than one flock', () => {
    const { scene, sky } = make();
    let flocks = 0;
    let despawns = 0;
    let prev = 0;
    for (let s = 0; s < 20 * 60 * 4; s++) { // twenty minutes at 4 Hz
      sky.update(0.25);
      const n = birdsIn(scene).length;
      expect(n === 0 || n === 3).toBe(true); // bounded: one flock of three at most
      if (n > prev) flocks++;
      if (n < prev) despawns++;
      prev = n;
    }
    expect(flocks).toBeGreaterThanOrEqual(10); // ~one per 40-80s plus its crossing
    expect(despawns).toBeGreaterThanOrEqual(flocks - 1);
  });

  it('frees the despawned birds\' geometry and material', () => {
    const { scene, sky } = make();
    while (birdsIn(scene).length === 0) sky.update(0.25);
    const spies = birdsIn(scene).flatMap((b) => [vi.spyOn(b.geometry, 'dispose'), vi.spyOn(b.material, 'dispose')]);
    while (birdsIn(scene).length > 0) sky.update(0.25);
    for (const s of spies) expect(s).toHaveBeenCalled();
  });

  it('dispose() removes a flock in flight from the scene', () => {
    const { scene, sky } = make();
    while (birdsIn(scene).length === 0) sky.update(0.25);
    sky.update(1);
    expect(birdsIn(scene)).toHaveLength(3);
    sky.dispose();
    expect(birdsIn(scene)).toHaveLength(0);
    expect(() => sky.dispose()).not.toThrow();
  });

  it('reduced motion: no birds at all', () => {
    const { scene, sky } = make({ reducedMotion: true });
    for (let s = 0; s < 600; s++) sky.update(0.5);
    expect(birdsIn(scene)).toHaveLength(0);
  });
});
