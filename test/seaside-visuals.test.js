// Stream 4 round three — the beach. See the block near the top of
// world/seaside.js.
import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

// Same headless stub every world test uses: the only DOM the builders touch is
// document.createElement('canvas') for the billboard texture and for
// render/textures.js's surface tiles. See test/water.test.js for the long
// version of why getImageData and createGradient need real answers.
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

const { build, BEACH, wetness } = await import('../src/world/seaside.js');

describe('seaside: wet sand at the waterline', () => {
  const scene = new THREE.Scene();
  build(scene);
  const band = scene.children.find((c) => c.name === 'wet-sand');

  it('is one flat mesh, just above the beach and below the boardwalk', () => {
    expect(band).toBeTruthy();
    expect(band.isMesh).toBe(true);
    expect(band.position.y).toBeGreaterThan(0);
    expect(band.position.y).toBeLessThan(0.03);
    expect(band.material.vertexColors).toBe(true);
    expect(band.material.color.getHex()).toBe(BEACH);
  });

  it('runs from under the boardwalk to just under the sea', () => {
    band.geometry.computeBoundingBox();
    const bb = band.geometry.boundingBox;
    expect(band.position.x + bb.min.x).toBeGreaterThan(18);
    expect(band.position.x + bb.min.x).toBeLessThan(22); // dry edge hidden under the boardwalk
    expect(band.position.x + bb.max.x).toBeGreaterThan(25); // no gap at the waterline
  });

  it('is dry at the boardwalk edge and darkest at the water', () => {
    for (const z of [-30, -10, 0, 17, 40]) {
      expect(wetness(21.8, z)).toBeLessThan(0.05);
      expect(wetness(25, z)).toBeGreaterThan(0.95);
      expect(wetness(23.5, z)).toBeGreaterThan(wetness(22.5, z));
    }
    const col = band.geometry.attributes.color;
    let min = 1;
    for (let i = 0; i < col.count; i++) min = Math.min(min, col.getX(i), col.getY(i), col.getZ(i));
    expect(min).toBeLessThan(0.45);
    expect(min).toBeGreaterThan(0.25);
  });
});

describe('seaside: the cliff keeps its face', () => {
  it('the seaward face still stands on the collider line', () => {
    const scene = new THREE.Scene();
    const area = build(scene);
    const cliff = scene.children.find((c) => c.isMesh && c.geometry.parameters?.width === 60);
    expect(cliff).toBeTruthy();
    cliff.geometry.computeBoundingBox();
    const bb = cliff.geometry.boundingBox;
    expect(cliff.position.z + bb.max.z).toBeCloseTo(-37, 5);
    expect(bb.min.y + cliff.position.y).toBeCloseTo(0, 5);
    // The broken top stays near 8m: never below 6.5, never above 8.5.
    expect(bb.max.y + cliff.position.y).toBeLessThan(8.5);
    expect(bb.max.y + cliff.position.y).toBeGreaterThan(7);
    const pos = cliff.geometry.attributes.position;
    let lowest = Infinity;
    for (let i = 0; i < pos.count; i++) if (pos.getY(i) > 0) lowest = Math.min(lowest, pos.getY(i));
    const colliders = area.colliders.filter((c) => c.z === -37);
    expect(colliders).toHaveLength(12);
  });
});
