// polish-beach Task 1: the sand tint, the wet band that matches it, the sky top.
import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

// Same headless document stub as test/seaside-visuals.test.js.
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

const { sandTint } = await import('../src/world/beachdress.js');
const { build, SKY_TOP, wetness } = await import('../src/world/seaside.js');

const grid = [];
for (let x = -48; x <= 24; x += 2) for (let z = -34; z <= 48; z += 2) grid.push([x, z]);

describe('sandTint', () => {
  it('is warm and a touch darker on average', () => {
    const mean = [0, 0, 0];
    for (const [x, z] of grid) sandTint(x, z).forEach((v, c) => { mean[c] += v / grid.length; });
    expect(mean[0]).toBeGreaterThan(0.93); expect(mean[0]).toBeLessThan(0.99);
    expect(mean[1]).toBeGreaterThan(0.90); expect(mean[1]).toBeLessThan(0.97);
    expect(mean[2]).toBeGreaterThan(0.84); expect(mean[2]).toBeLessThan(0.93);
    expect(mean[0]).toBeGreaterThan(mean[1]);
    expect(mean[1]).toBeGreaterThan(mean[2]);
  });

  it('varies across the beach', () => {
    const gs = grid.map(([x, z]) => sandTint(x, z)[1]);
    const spread = Math.max(...gs) - Math.min(...gs);
    expect(spread).toBeGreaterThanOrEqual(0.07);
    expect(spread).toBeLessThanOrEqual(0.2);
  });

  it('is smooth', () => {
    for (const [x, z] of grid) {
      expect(Math.abs(sandTint(x, z)[1] - sandTint(x + 1, z)[1])).toBeLessThan(0.02);
    }
  });
});

describe('seaside sand', () => {
  const scene = new THREE.Scene();
  build(scene);

  it('the ground plane carries the tint', () => {
    const ground = scene.children.find((c) => c.userData.ground && c.name !== 'wet-sand' && c.geometry.parameters && c.geometry.parameters.width === 140);
    expect(ground).toBeTruthy();
    const col = ground.geometry.attributes.color;
    let sum = 0;
    for (let i = 0; i < col.count; i++) sum += col.getY(i);
    expect(sum / col.count).toBeLessThan(0.975);
  });

  it('wet sand is tagged ground and matches sandTint at its dry edge', () => {
    const band = scene.children.find((c) => c.name === 'wet-sand');
    expect(band.userData.ground).toBe(true);
    const pos = band.geometry.attributes.position;
    const col = band.geometry.attributes.color;
    let checked = 0;
    for (let i = 0; i < pos.count; i++) {
      const wx = pos.getX(i) + band.position.x;
      // The wet edge wanders along the beach; only the dry vertices must match.
      if (wx > 21.9 || wetness(wx, pos.getZ(i)) > 0) continue;
      const t = sandTint(wx, pos.getZ(i));
      for (let c = 0; c < 3; c++) expect(col.array[i * 3 + c]).toBeCloseTo(t[c], 3);
      checked++;
    }
    expect(checked).toBeGreaterThan(20);
  });

  it('the sky top is deeper and the horizon is unchanged', () => {
    expect(SKY_TOP).toBe(0x88bce6);
    expect(scene.fog.color.getHex()).toBe(0xe8e0d0);
  });
});
