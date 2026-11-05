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

const { build, GORGE_DEN_ARCHES, mouthArchesFor } = await import('../src/world/gorge.js');
const { caveMouth, MOUTH_LOW_H, MOUTH_LOW_IN, MOUTH_CAM_HALF } = await import('../src/world/caveroom.js');
const { GORGE_DENS, DEN_HEADROOM, gorgeGround } = await import('../src/world/gorgeshape.js');
const { CAM_CEIL_CLEAR } = await import('../src/camzoom.js');

let built = null;
function gorgeBuilt() {
  if (!built) {
    const scene = new THREE.Scene();
    build(scene);
    built = { scene, rock: scene.getObjectByName('gorgeRock'), rockFaces: scene.getObjectByName('rockFaces') };
  }
  return built;
}
function local(a, pos, i) {
  const dx = pos[i * 3] - a.x, dz = pos[i * 3 + 2] - a.z;
  return { u: dx * -a.nz + dz * a.nx, h: pos[i * 3 + 1] - a.y, w: dx * a.nx + dz * a.nz };
}
const flat = () => 0;
const DEN_CAM_H = DEN_HEADROOM - CAM_CEIL_CLEAR;

describe('polish-gorge6: arches at the small dens', () => {
  it('lists one arch per small den, its normal out of the rock', () => {
    expect(GORGE_DEN_ARCHES.map((a) => a.id)).toEqual(GORGE_DENS.map((d) => d.id));
    const byId = Object.fromEntries(GORGE_DEN_ARCHES.map((a) => [a.id, a]));
    expect(byId.denW1).toMatchObject({ x: -18, z: 7.3, y: 0, nx: 1, nz: 0, headroom: DEN_HEADROOM });
    for (const a of GORGE_DEN_ARCHES) expect(a.half).toBeCloseTo(1.3, 9);
    expect(byId.denE).toMatchObject({ x: 2, z: -44.7, nx: -1, nz: 0 });
    expect(byId.denLookout).toMatchObject({ x: 5.3, z: -8, y: 4, nx: 0, nz: 1 });
    expect(byId.denTop).toMatchObject({ x: 11.3, z: -40, y: 12, nx: 0, nz: 1 });
    // the camera crosses a den's mouth at most CAM_CEIL_CLEAR under its ceiling
    for (const a of GORGE_DEN_ARCHES) expect(a.camH).toBeCloseTo(DEN_CAM_H, 9);
  });

  it('keeps the low walk and the camera line clear (flat face)', () => {
    for (const a of GORGE_DEN_ARCHES) {
      const m = caveMouth({ ...a, seed: 7, surface: flat });
      for (let i = 0; i < m.pos.length / 3; i++) {
        const { u, h, w } = local(a, m.pos, i);
        if (h < MOUTH_LOW_H && Math.abs(u) < a.half && w <= 0.6) {
          expect(a.half - Math.abs(u), `${a.id} vertex ${i} low`).toBeLessThanOrEqual(MOUTH_LOW_IN + 1e-9);
        }
        if (Math.abs(u) < MOUTH_CAM_HALF && h > MOUTH_LOW_H && w < 0.6) {
          expect(h, `${a.id} vertex ${i} over the camera line`).toBeGreaterThanOrEqual(DEN_CAM_H - 1e-9);
        }
        // nothing reaches into the den (the stones are set into the face beside it)
        if (i < m.ranges.stones[0]) expect(w, `${a.id} vertex ${i}`).toBeGreaterThanOrEqual(-0.05);
      }
      // the arch fits the opening: nothing in the opening's span higher than the ceiling
      for (const [u, h] of m.outline) {
        expect(h).toBeLessThanOrEqual(a.headroom);
        expect(Math.abs(u)).toBeLessThanOrEqual(a.half + 1e-9);
      }
    }
  });

  it('appends the den arches to rockFaces, seated on the real face, within budget', () => {
    const { rock, rockFaces } = gorgeBuilt();
    const byId = rock.userData.mouthArches;
    const arches = mouthArchesFor(rockFaces);
    let total = 0;
    for (const a of GORGE_DEN_ARCHES) {
      expect(byId[a.id], a.id).toBeGreaterThan(0);
      expect(byId[a.id], a.id).toBeLessThanOrEqual(300);
      expect(arches.misses[a.id], `${a.id} surface() misses`).toBe(0);
      expect(arches.rimBuried[a.id], `${a.id} rim buried`).toBe(0);
      expect(arches.stones[a.id].length, `${a.id} stones`).toBeGreaterThan(0);
      total += byId[a.id];
      // ranges in the mesh are recorded for every den
      expect(rock.userData.mouthArchRanges[a.id].to).toBeGreaterThan(rock.userData.mouthArchRanges[a.id].from);
    }
    console.log('gorge6 den arches', JSON.stringify(Object.fromEntries(GORGE_DEN_ARCHES.map((a) => [a.id, byId[a.id]]))), total);
    expect(total).toBeLessThanOrEqual(1300);
  }, 120_000);

  it('den stones keep out of the den and off the walk in front of it', () => {
    const { rockFaces } = gorgeBuilt();
    const arches = mouthArchesFor(rockFaces);
    const g = gorgeGround();
    for (const a of GORGE_DEN_ARCHES) {
      for (const s of arches.stones[a.id]) {
        const dx = s.x - a.x, dz = s.z - a.z;
        const u = dx * -a.nz + dz * a.nx, w = dx * a.nx + dz * a.nz;
        expect(Math.abs(u), `${a.id} stone beside the opening`).toBeGreaterThanOrEqual(a.half);
        expect(w).toBeLessThanOrEqual(0.12);
        // open ground at the den's level just in front of it
        expect(Math.abs(g.y(s.x + a.nx * s.r, s.z + a.nz * s.r) - a.y)).toBeLessThanOrEqual(0.02);
      }
    }
  }, 120_000);
});
