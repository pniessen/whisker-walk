import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

// path()'s gravel paints a canvas texture; a stub canvas is enough here (as
// test/borderpost.world.test.js does).
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

const { buildGateLook, addGatewayDressing, NO_GATES } = await import('../src/world/gateway.js');
const { GATEWAY_ENDS, endById, gatewayEnd, GATE_HALF, GATE_POST_R } = await import('../src/gateways.js');
const { mergeStaticProps } = await import('../src/render/mergeprops.js');
const { LAND } = await import('../src/territories.js');
const { STREET_LAND } = await import('../src/worldmap.js');

// Does any vertex of `geo` carry `hex` (as Three stores it, linear), within 1/255?
function hasColour(geo, hex) {
  const c = new THREE.Color(hex);
  const col = geo.attributes.color;
  const tol = 1 / 255;
  for (let i = 0; i < col.count; i++) {
    if (Math.abs(col.getX(i) - c.r) <= tol && Math.abs(col.getY(i) - c.g) <= tol && Math.abs(col.getZ(i) - c.b) <= tol) return true;
  }
  return false;
}

describe('gate looks', () => {
  for (const look of ['signpost', 'fairgate', 'farmgate', 'promenade']) {
    it(`${look}: two meshes, at most 400 triangles, a vertex-coloured body and a leaf the merge leaves alone`, () => {
      const end = Object.values(GATEWAY_ENDS).flat().find((e) => e.look === look);
      const g = buildGateLook(end);
      expect(g.name).toBe('gateway');
      expect(g.userData.endId).toBe(end.id);
      const meshes = []; g.traverse((o) => { if (o.isMesh) meshes.push(o); });
      expect(meshes.map((m) => m.name).sort()).toEqual(['gateBody', 'gateLeaf']);
      expect(meshes.reduce((n, m) => n + m.geometry.index.count / 3, 0)).toBeLessThanOrEqual(400);
      const body = meshes.find((m) => m.name === 'gateBody');
      expect(body.geometry.attributes.color).toBeDefined();
      const leaf = meshes.find((m) => m.name === 'gateLeaf');
      expect([leaf.userData.noCast, leaf.userData.noMerge]).toEqual([true, true]);
      const scene = new THREE.Scene(); scene.add(g); mergeStaticProps(scene);
      expect(scene.getObjectByName('gateLeaf')).toBeDefined();
    });
  }

  it('stands at its end, on the ground', () => {
    const { end } = endById('park-farm');
    const ground = { flat: false, y: () => 0.5 };
    const g = buildGateLook(end, { ground });
    expect([g.position.x, g.position.y, g.position.z]).toEqual([42, 0.5, 10]);
  });

  it('the band is the neighbour\'s map colour', () => {
    const body = buildGateLook(endById('park-farm').end).getObjectByName('gateBody');
    expect(hasColour(body.geometry, STREET_LAND.farm)).toBe(true); // within 1/255
    const town = buildGateLook(endById('park-town').end).getObjectByName('gateBody');
    expect(hasColour(town.geometry, LAND.town)).toBe(true);
  });

  it("a 'none' look is null", () => {
    const door = gatewayEnd({ id: 'd', gateway: 'g', x: 0, z: 0, faces: 'north', to: 'park', twin: 'e', look: 'none', placement: 'inside', arrive: { x: 0, z: 3, yaw: Math.PI } });
    expect(buildGateLook(door)).toBeNull();
  });
});

describe('addGatewayDressing', () => {
  it('the Park gets three gates, two lanes and two posts a gate', () => {
    const scene = new THREE.Scene();
    const d = addGatewayDressing(scene, 'park');
    expect(scene.children.filter((c) => c.name === 'gateway').map((c) => c.userData.endId)).toEqual(['park-town', 'park-fair', 'park-farm']);
    expect(scene.children.filter((c) => c.name === 'gateLane')).toHaveLength(2);
    expect(d.colliders).toHaveLength(6);
    // park-farm faces east, so its posts stand along z
    expect(d.colliders.slice(4)).toEqual([{ x: 42, z: 10 - GATE_HALF, r: GATE_POST_R }, { x: 42, z: 10 + GATE_HALF, r: GATE_POST_R }]);
  });

  it('shut until open, and setOpen swings it', () => {
    const scene = new THREE.Scene();
    const d = addGatewayDressing(scene, 'park', { isOpen: (e) => e.id === 'park-town' });
    const leafOf = (id) => scene.children.find((c) => c.userData.endId === id).getObjectByName('gateLeaf').parent;
    expect(leafOf('park-town').rotation.y).not.toBe(0);
    expect(leafOf('park-farm').rotation.y).toBe(0);
    d.setOpen('park-farm', true); expect(Math.abs(leafOf('park-farm').rotation.y)).toBeCloseTo(Math.PI / 2, 9);
    d.setOpen('park-farm', true); expect(Math.abs(leafOf('park-farm').rotation.y)).toBeCloseTo(Math.PI / 2, 9);
    d.setOpen('park-farm', false); expect(leafOf('park-farm').rotation.y).toBe(0);
    expect(() => d.setOpen('nope', true)).not.toThrow();
  });

  it('an open leaf swings out of the area, the way the end faces', () => {
    const scene = new THREE.Scene();
    addGatewayDressing(scene, 'park', { isOpen: () => true });
    scene.updateMatrixWorld(true);
    for (const id of ['park-town', 'park-fair', 'park-farm']) {
      const { end } = endById(id);
      const leaf = scene.children.find((c) => c.userData.endId === id).getObjectByName('gateLeaf');
      const box = new THREE.Box3().setFromObject(leaf);
      const mid = box.getCenter(new THREE.Vector3());
      const out = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] }[end.faces];
      // the open leaf's middle lies beyond the gate line, on the far side
      expect((mid.x - end.x) * out[0] + (mid.z - end.z) * out[1]).toBeGreaterThan(0.5);
    }
  });

  it('lanes lie on the ground, top-level, where the data says', () => {
    const scene = new THREE.Scene();
    addGatewayDressing(scene, 'park', { ground: { flat: false, y: () => 0.25 } });
    const lanes = scene.children.filter((c) => c.name === 'gateLane');
    expect(lanes.every((l) => l.isMesh && Math.abs(l.position.y - 0.26) < 1e-9)).toBe(true);
    // park-farm's lane runs (16, 10) to (42, 10)
    expect(lanes.some((l) => Math.abs(l.position.x - 29) < 1e-9 && Math.abs(l.position.z - 10) < 1e-9)).toBe(true);
  });

  it('never touches area colliders and draws nothing for a place with no gates', () => {
    const scene = new THREE.Scene();
    const d = addGatewayDressing(scene, 'woods');
    expect(d.colliders).toEqual([]);
    expect(scene.children).toHaveLength(0);
    expect(() => d.dispose()).not.toThrow();
  });

  it("a 'none' look draws nothing and blocks nothing", () => {
    const door = gatewayEnd({ id: 'd', gateway: 'g', x: 0, z: 0, faces: 'north', to: 'park', twin: 'e', look: 'none', placement: 'inside', arrive: { x: 0, z: 3, yaw: Math.PI } });
    const scene = new THREE.Scene();
    expect(addGatewayDressing(scene, 'neighborhood', { ends: [door] }).colliders).toEqual([]);
    expect(scene.children).toHaveLength(0);
  });

  it('NO_GATES does nothing', () => {
    expect(NO_GATES.colliders).toEqual([]);
    expect(() => { NO_GATES.setOpen('park-town', true); NO_GATES.dispose(); }).not.toThrow();
  });
});
