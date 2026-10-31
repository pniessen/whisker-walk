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
    expect(band.position.y).toBeLessThan(0.015); // under contact-shadow decals
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
  const scene = new THREE.Scene();
  const area = build(scene);
  const boxes = scene.children.filter((c) => c.isMesh && c.geometry.type === 'BoxGeometry'
    && c.geometry.parameters.height === 8);

  it('finds the bluff and the overlook', () => {
    expect(boxes.map((b) => b.geometry.parameters.width).sort((a, b) => a - b)).toEqual([10, 60]);
  });

  for (const w of [60, 10]) {
    it(`${w}m box: every side face stays flat, the base stays on the sand, the top stays 7..8.5m`, () => {
      const box = boxes.find((b) => b.geometry.parameters.width === w);
      const { width, depth } = box.geometry.parameters;
      const pos = box.geometry.attributes.position;
      const eps = 1e-5;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i) + box.position.y;
        const z = pos.getZ(i);
        // x and z never move: a vertex is inside or on its box's footprint.
        expect(Math.abs(x)).toBeLessThanOrEqual(width / 2 + eps);
        expect(Math.abs(z)).toBeLessThanOrEqual(depth / 2 + eps);
        expect(y).toBeGreaterThanOrEqual(-eps);
        if (y > 0.5) {
          expect(y).toBeLessThanOrEqual(8.5 + eps);
        }
      }
      // Every top vertex (the highest few per column) is between 7 and 8.5.
      const tops = new Map();
      for (let i = 0; i < pos.count; i++) {
        const k = `${pos.getX(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
        tops.set(k, Math.max(tops.get(k) ?? -Infinity, pos.getY(i) + box.position.y));
      }
      for (const top of tops.values()) {
        expect(top).toBeGreaterThanOrEqual(7 - eps);
        expect(top).toBeLessThanOrEqual(8.5 + eps);
      }
    });
  }

  it('the seaward face still stands on the collider line', () => {
    const cliff = boxes.find((b) => b.geometry.parameters.width === 60);
    cliff.geometry.computeBoundingBox();
    expect(cliff.position.z + cliff.geometry.boundingBox.max.z).toBeCloseTo(-37, 5);
    expect(area.colliders.filter((c) => c.z === -37)).toHaveLength(12);
  });
});
