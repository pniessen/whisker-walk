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
        return () => {};
      },
      set: () => true,
    }),
  }),
});

const { addBorderDressing, clothKey } = await import('../src/world/borderpost.js');
const { postsFor, POST_R, TOWN_FOOTPATH, FOOTPATH_W } = await import('../src/borderposts.js');
const { LAND } = await import('../src/territories.js');
const { flatFootprints } = await import('../src/render/grass.js');
const { mergeStaticProps } = await import('../src/render/mergeprops.js');
const { build: buildNeighborhood } = await import('../src/world/neighborhood.js');
const { build: buildWoods } = await import('../src/world/woods.js');
const { build: buildRiver } = await import('../src/world/river.js');
const { build: buildMoor } = await import('../src/world/moor.js');
const { build: buildPines } = await import('../src/world/pines.js');

const MAPS = { neighborhood: buildNeighborhood, woods: buildWoods, river: buildRiver, moor: buildMoor, pines: buildPines };
const posts = (scene) => scene.children.filter((c) => c.name === 'borderPost');
const DIR = { west: [-1, 0], east: [1, 0], north: [0, -1], south: [0, 1] };

describe('LAND', () => {
  it('is frozen and holds the six map colours', () => {
    expect(Object.isFrozen(LAND)).toBe(true);
    expect(LAND).toEqual({ town: '#d9a57e', woods: '#8fbf74', moor: '#c9a9c6', river: '#a8cf9c', pines: '#6e9d78', gorge: '#b5a48d' });
  });
  it('clothKey maps the Neighborhood to town and leaves the rest', () => {
    expect(clothKey('neighborhood')).toBe('town');
    expect(clothKey('woods')).toBe('woods');
    expect(clothKey('gorge')).toBe('gorge');
  });
});

describe('addBorderDressing', () => {
  for (const [id, build] of Object.entries(MAPS)) {
    describe(id, () => {
      const scene = new THREE.Scene();
      const area = build(scene);
      const before = JSON.stringify(area.colliders);
      const res = addBorderDressing(scene, id);

      it('adds one named group per post at its spot, with one collider each', () => {
        const list = postsFor(id);
        expect(posts(scene)).toHaveLength(list.length);
        for (const p of list) {
          const g = posts(scene).find((x) => x.userData.postId === p.id);
          expect(g).toBeTruthy();
          expect([g.position.x, g.position.y, g.position.z]).toEqual([p.x, 0, p.z]);
        }
        expect(res.colliders).toEqual(list.map((p) => ({ x: p.x, z: p.z, r: POST_R })));
        expect(POST_R).toBe(0.2);
      });

      it('leaves area.colliders as the build made it', () => {
        expect(JSON.stringify(area.colliders)).toBe(before);
      });

      it('has one wood, one cloth in the neighbour colour and one stone material; 1.15 m tall; arrow points out', () => {
        for (const p of postsFor(id)) {
          const g = posts(scene).find((x) => x.userData.postId === p.id);
          const meshes = [];
          g.traverse((o) => { if (o.isMesh) meshes.push(o); });
          const mats = new Set(meshes.map((m) => m.material));
          expect(mats.size).toBe(3);
          const hexes = [...mats].map((m) => m.color.getHexString());
          expect(hexes).toContain(new THREE.Color(LAND[clothKey(p.to)]).getHexString());
          expect(hexes).toContain('8a6a48');
          expect(hexes).toContain('8e8c88');
          g.updateMatrixWorld(true);
          const box = new THREE.Box3().setFromObject(g);
          expect(box.max.y).toBeGreaterThan(1.1);
          expect(box.max.y).toBeLessThan(1.2);
          // the arrow tip (the 3-sided cylinder) lies further toward `faces` than the post
          const tip = meshes.find((m) => m.geometry.parameters?.radialSegments === 3);
          const [dx, dz] = DIR[p.faces];
          const c = new THREE.Vector3().setFromMatrixPosition(tip.matrixWorld);
          expect((c.x - p.x) * dx + (c.z - p.z) * dz).toBeGreaterThan(0.3);
        }
      });

      it('merges to at most 3 meshes per post', () => {
        mergeStaticProps(scene);
        for (const g of posts(scene)) {
          let n = 0;
          g.traverse((o) => { if (o.isMesh) n++; });
          expect(n).toBeLessThanOrEqual(3);
        }
      });
    });
  }

  it('two dressings give identical colliders', () => {
    const a = addBorderDressing(new THREE.Scene(), 'moor');
    const b = addBorderDressing(new THREE.Scene(), 'moor');
    expect(a.colliders).toEqual(b.colliders);
  });

  it('the Neighborhood footpath is a top-level 2 m strip, only with the dressing', () => {
    const [x1, z1, x2, z2] = TOWN_FOOTPATH[0];
    const mx = (x1 + x2) / 2;
    const mz = (z1 + z2) / 2;
    const hasStrip = (s) => flatFootprints(s).some((f) => f.kind === 'strip'
      && Math.hypot(f.x - mx, f.z - mz) < 0.01 && Math.abs(f.halfW * 2 - FOOTPATH_W) < 1e-6);
    const bare = new THREE.Scene();
    buildNeighborhood(bare);
    expect(hasStrip(bare)).toBe(false);
    expect(posts(bare)).toHaveLength(0);
    const dressed = new THREE.Scene();
    buildNeighborhood(dressed);
    addBorderDressing(dressed, 'neighborhood');
    expect(hasStrip(dressed)).toBe(true);
    expect(FOOTPATH_W).toBe(2);
  });

  it('adds nothing for the den or a hostile id', () => {
    for (const id of ['den', '__proto__', 'constructor', undefined]) {
      const s = new THREE.Scene();
      expect(addBorderDressing(s, id)).toEqual({ colliders: [] });
      expect(s.children).toHaveLength(0);
    }
  });
});
