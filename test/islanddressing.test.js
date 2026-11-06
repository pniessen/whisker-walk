import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

vi.stubGlobal('document', {
  createElement: () => ({
    width: 0,
    height: 0,
    getContext: () => new Proxy({}, {
      get: (_t, key) => {
        if (key === 'getImageData') return (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
        if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop: () => {} });
        return () => {};
      },
      set: () => true,
    }),
  }),
});

const I = await import('../src/world/island.js');
const { segDist } = await import('../src/segdist.js');
const { ISLAND_DRESSING, ISLAND_LAND, BRIDGE_DECK } = I;

const records = [
  ...I.ISLAND_POIS, ...I.ISLAND_SCENICS, ...I.ISLAND_COLLECTIBLES, ...I.ISLAND_GOLD, ...I.ISLAND_PERCHES,
  ...I.MEETING_STONES, ...I.ISLAND_BUSHES, ...I.ISLAND_PUDDLES, ...I.ISLAND_MOMENTS,
];
const deck = (p) => segDist(p.x, p.z, BRIDGE_DECK.x1, BRIDGE_DECK.z1, BRIDGE_DECK.x2, BRIDGE_DECK.z2);

function colliders() {
  return I.buildIsland(new THREE.Scene(), {}).colliders;
}
const logPoints = () => {
  const { x, z, length, yaw } = ISLAND_DRESSING.log;
  const d = [Math.sin(yaw), Math.cos(yaw)];
  return [-0.5, -0.25, 0, 0.25, 0.5].map((t) => ({ x: x + d[0] * length * t, z: z + d[1] * length * t }));
};

describe('island dressing spots', () => {
  const cols = colliders();
  const groups = {
    ferns: ISLAND_DRESSING.ferns, toadstools: ISLAND_DRESSING.toadstools,
    log: logPoints(), reeds: ISLAND_DRESSING.reeds,
  };
  it('has the counts the plan asks for', () => {
    expect(ISLAND_DRESSING.ferns.length).toBeGreaterThanOrEqual(6);
    expect(ISLAND_DRESSING.ferns.length).toBeLessThanOrEqual(8);
    expect(ISLAND_DRESSING.toadstools.length).toBeGreaterThanOrEqual(3);
    expect(ISLAND_DRESSING.toadstools.length).toBeLessThanOrEqual(4);
    expect(ISLAND_DRESSING.reeds.length).toBeGreaterThan(10);
  });
  for (const [name, spots] of Object.entries(groups)) {
    const reed = name === 'reeds';
    it(`${name}: inside the land, clear of colliders, records and the deck`, () => {
      for (const p of spots) {
        expect(Math.hypot(p.x - ISLAND_LAND.x, p.z - ISLAND_LAND.z)).toBeLessThanOrEqual(ISLAND_LAND.r - 0.8 + 1e-9);
        if (!reed) for (const c of cols) expect(Math.hypot(p.x - c.x, p.z - c.z)).toBeGreaterThanOrEqual(c.r + 1.6);
        for (const r of records) expect(Math.hypot(p.x - r.x, p.z - r.z)).toBeGreaterThanOrEqual(reed ? 2.5 : 2);
        expect(deck(p)).toBeGreaterThanOrEqual(reed ? 2.5 : 1.5);
      }
    });
  }
});

describe('island dressing meshes', () => {
  const build = () => {
    const scene = new THREE.Scene();
    I.buildIsland(scene, {});
    return scene;
  };
  const names = ['islandFerns', 'islandToadstools', 'islandLog', 'islandReeds2'];
  const tris = (o) => {
    let t = 0;
    o.traverse((m) => {
      if (m.isMesh) t += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
    });
    return t;
  };
  it('is named, and every mesh is out of the shadow pass', () => {
    const scene = build();
    for (const n of names) {
      const o = scene.getObjectByName(n);
      expect(o, n).toBeTruthy();
      let meshes = 0;
      o.traverse((m) => {
        if (!m.isMesh) return;
        meshes++;
        expect(m.castShadow).toBe(false);
        expect(m.userData.noCast).toBe(true);
      });
      expect(meshes).toBeGreaterThan(0);
    }
  });
  it('is deterministic, and small', () => {
    const a = build();
    const b2 = build();
    let total = 0;
    for (const n of names) {
      const ga = a.getObjectByName(n);
      const gb = b2.getObjectByName(n);
      total += tris(ga);
      const pa = [];
      const pb = [];
      ga.traverse((m) => { if (m.isMesh) pa.push(Array.from(m.geometry.attributes.position.array)); });
      gb.traverse((m) => { if (m.isMesh) pb.push(Array.from(m.geometry.attributes.position.array)); });
      expect(pa).toEqual(pb);
    }
    expect(total).toBeLessThanOrEqual(1500);
  });
});
