import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

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
        if (key === 'measureText') return () => ({ width: 10 });
        return () => {};
      },
      set: () => true,
    }),
  }),
  addEventListener() {},
  pointerLockElement: null,
  exitPointerLock() {},
});

const { applyDusk } = await import('../src/render/dusk.js');
const WORLDS = {
  woods: await import('../src/world/woods.js'),
  neighborhood: await import('../src/world/neighborhood.js'),
  river: await import('../src/world/river.js'),
  moor: await import('../src/world/moor.js'),
  pines: await import('../src/world/pines.js'),
  park: await import('../src/world/park.js'),
  seaside: await import('../src/world/seaside.js'),
  docks: await import('../src/world/docks.js'),
};

const tris = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;

describe('Woods cottage lights', () => {
  const scene = new THREE.Scene();
  const areaData = WORLDS.woods.build(scene);
  const band = scene.getObjectByName('horizonBand');
  const lights = band.getObjectByName('houseLights');

  it('woods band carries one hidden houseLights child', () => {
    expect(lights).toBeDefined();
    expect(lights.visible).toBe(false);
    expect(lights.userData.duskWindow).toBe(true);
    expect(lights.userData.noCast).toBe(true);
    expect(lights.castShadow).toBe(false);
    expect(lights.material.fog).toBe(false);
    expect(lights.material.toneMapped).toBe(false);
    const t = tris(lights.geometry);
    expect(t).toBeGreaterThanOrEqual(14);
    expect(t).toBeLessThanOrEqual(14 * 3 * 2);
  });

  it('every lit window sits just in front of a cottage window quad', () => {
    const lp = lights.geometry.attributes.position;
    const bp = band.geometry.attributes.position;
    const centre = new THREE.Vector3();
    let quads = 0;
    for (let q = 0; q < lp.count; q += 4) {
      centre.set(0, 0, 0);
      for (let v = 0; v < 4; v++) centre.add(new THREE.Vector3().fromBufferAttribute(lp, q + v));
      centre.multiplyScalar(0.25);
      let best = Infinity;
      for (let i = 0; i < bp.count; i++) {
        const d = Math.hypot(bp.getX(i) - centre.x, bp.getY(i) - centre.y, bp.getZ(i) - centre.z);
        if (d < best) best = d;
      }
      expect(best).toBeLessThan(0.6);
      quads++;
    }
    expect(quads).toBeGreaterThan(0);
  });

  it('applyDusk reveals houseLights', () => {
    applyDusk({ scene, sun: new THREE.DirectionalLight(), fill: new THREE.HemisphereLight(), areaData });
    expect(lights.visible).toBe(true);
  });

  it('other areas have no houseLights', () => {
    for (const id of Object.keys(WORLDS)) {
      if (id === 'woods') continue;
      const s = new THREE.Scene();
      WORLDS[id].build(s);
      expect(s.getObjectByName('houseLights'), id).toBeUndefined();
    }
  }, 240_000);
});
