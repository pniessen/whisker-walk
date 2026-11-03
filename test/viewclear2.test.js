import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

// The same headless canvas stub every world test uses (see test/ambient.test.js).
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

const { findFadeOccluders } = await import('../src/treefade.js');
const { mergeStaticProps } = await import('../src/render/mergeprops.js');
const { build: buildNeighborhood } = await import('../src/world/neighborhood.js');
const { build: buildDocks } = await import('../src/world/docks.js');
const { build: buildPark } = await import('../src/world/park.js');
const { build: buildSeaside } = await import('../src/world/seaside.js');

// walk.js's order: build, then merge; the fade entries are found after that.
function found(buildArea) {
  const scene = new THREE.Scene();
  buildArea(scene, {});
  mergeStaticProps(scene);
  const entries = findFadeOccluders(scene);
  return { scene, boxes: entries.filter((e) => e.box), lamps: entries.filter((e) => e.shapes) };
}
const count = (g, test) => { let n = 0; g.traverse((o) => { if (test(o)) n++; }); return n; };

describe('viewclear2 fade entries per area', () => {
  it('neighborhood: 8 houses, 4 lamps', () => {
    const { boxes, lamps } = found(buildNeighborhood);
    expect(boxes.length).toBe(8);
    expect(lamps.length).toBe(4);
    for (const e of boxes) expect(count(e.obj, (o) => o.isMesh && o.userData.window)).toBeGreaterThan(0);
    for (const e of lamps) expect(count(e.obj, (o) => o.isMesh)).toBe(2);
  }, 120_000);

  it('docks: 5 warehouses, 13 lamps', () => {
    const { boxes, lamps } = found(buildDocks);
    expect(boxes.length).toBe(5);
    expect(lamps.length).toBe(13);
    for (const e of boxes) expect(count(e.obj, (o) => o.isMesh && o.userData.window)).toBeGreaterThan(0);
    for (const e of lamps) expect(count(e.obj, (o) => o.isMesh)).toBe(2);
  }, 120_000);

  it('park: 4 lamps, no boxes', () => {
    const { boxes, lamps } = found(buildPark);
    expect(boxes.length).toBe(0);
    expect(lamps.length).toBe(4);
    for (const e of lamps) expect(count(e.obj, (o) => o.isMesh)).toBe(2);
  }, 120_000);

  it('seaside: 2 lamps', () => {
    const { lamps } = found(buildSeaside);
    expect(lamps.length).toBe(2);
    for (const e of lamps) expect(count(e.obj, (o) => o.isMesh)).toBe(2);
  }, 120_000);
});
