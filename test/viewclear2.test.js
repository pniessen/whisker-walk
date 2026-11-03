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

const { findFadeOccluders, createTreeFade } = await import('../src/treefade.js');
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

  it('neighborhood: house boxes follow the walls, and a cat on the street does not fade one', () => {
    const { boxes } = found(buildNeighborhood);
    for (const e of boxes) {
      const b = e.box;
      expect(Math.abs((b.maxX - b.minX) / 2 - 2.5)).toBeLessThan(0.15);
      expect(Math.abs((b.maxZ - b.minZ) / 2 - 2.0)).toBeLessThan(0.15);
      expect(b.maxY).toBeCloseTo(5, 1);
    }
    // the door faces +z: a cat 3.5 m out on the front, camera further out on the street side
    const fade = createTreeFade(boxes);
    const camera = new THREE.PerspectiveCamera();
    for (const e of boxes) {
      const hx = e.obj.position.x, hz = e.obj.position.z;
      camera.position.set(hx, 2.5, hz + 8);
      fade.update(1, camera, { x: hx, y: 0.35, z: hz + 3.5 });
    }
    expect(fade.faded().size).toBe(0);
    fade.dispose();
  }, 120_000);

  it('docks: 5 warehouses, 13 lamps', () => {
    const { boxes, lamps } = found(buildDocks);
    expect(boxes.length).toBe(5);
    expect(lamps.length).toBe(13);
    // box xz half-extents match each warehouse's w x d (windows/door add < 0.3 m)
    for (const e of boxes) {
      const b = e.box;
      const g = e.obj;
      const body = g.children[0];
      const bw = body.geometry.parameters.width, bd = body.geometry.parameters.depth;
      expect(b.maxX - b.minX).toBeGreaterThanOrEqual(bw - 1e-6);
      expect(b.maxX - b.minX).toBeLessThan(bw + 0.3);
      expect(b.maxZ - b.minZ).toBeGreaterThanOrEqual(bd - 1e-6);
      expect(b.maxZ - b.minZ).toBeLessThan(bd + 0.5);
    }
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
