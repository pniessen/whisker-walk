// Canopy kinds (polish-canopies): every broadleaf tree() is an oak, a birch or
// a round tree, picked per (x, z), or an old oak when an area asks. Each kind
// keeps the tree's contracts: two meshes, deterministic geometry, a darker
// under-canopy, every vertex inside its occluder, a truthful canopy radius.
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

const b = await import('../src/world/builder.js');
const { mergeStaticProps } = await import('../src/render/mergeprops.js');

const KINDS = ['oak', 'birch', 'round', 'old'];
const SPOTS = [[0, 0], [5, 5], [-8, 13], [22, -17], [-30, 30], [41.3, -7.7]];
const TRI_CAP = { round: 160, birch: 100, oak: 340, old: 420 };

const canopyOf = (g) => g.children[1];
const trunkOf = (g) => g.children[0];

// Canopy vertices in the tree Group's own (unscaled) frame.
function groupVerts(g) {
  const leaves = canopyOf(g);
  leaves.updateMatrix();
  const pos = leaves.geometry.attributes.position;
  const v = new THREE.Vector3();
  const out = [];
  for (let i = 0; i < pos.count; i++) out.push(v.fromBufferAttribute(pos, i).applyMatrix4(leaves.matrix).clone());
  return out;
}

describe('canopy kinds', () => {
  it('canopyKind mixes all three kinds across a grid, deterministically', () => {
    const n = { oak: 0, birch: 0, round: 0 };
    let total = 0;
    for (let x = -100; x < 100; x += 5) {
      for (let z = -100; z < 100; z += 5) {
        const k = b.canopyKind(x, z);
        expect(k).toBe(b.canopyKind(x, z));
        n[k]++;
        total++;
      }
    }
    expect(Object.keys(n)).toEqual(['oak', 'birch', 'round']);
    for (const k of Object.keys(n)) expect(n[k] / total, k).toBeGreaterThanOrEqual(0.15);
  });

  it('CANOPY_KINDS is frozen and TREE_OCCLUDER is the round kind\'s', () => {
    expect(Object.isFrozen(b.CANOPY_KINDS)).toBe(true);
    for (const k of KINDS) {
      const K = b.CANOPY_KINDS[k];
      expect(K.y).toBeGreaterThan(2);
      expect(K.r).toBeGreaterThan(0.8);
      expect(K.occluder).toHaveLength(2);
    }
    expect(b.TREE_OCCLUDER).toBe(b.CANOPY_KINDS.round.occluder);
  });

  for (const kind of KINDS) {
    it(`${kind}: two meshes, deterministic, shaded underneath, inside its occluder, truthful radius`, () => {
      const K = b.CANOPY_KINDS[kind];
      const [, ell] = K.occluder;
      expect(ell.t).toBe('ell');
      for (const [x, z] of SPOTS) {
        const g = b.tree(x, z, 1, { kind });
        const at = `${kind} at (${x}, ${z})`;
        expect(g.children.filter((c) => c.isMesh), at).toHaveLength(2);
        expect(g.userData.canopyKind).toBe(kind);
        expect(g.userData.occluder).toBe(K.occluder);
        const geo = canopyOf(g).geometry;
        expect(geo.index).toBeNull();
        expect(geo.attributes.color, at).toBeTruthy();
        expect(geo.attributes.normal, at).toBeTruthy();
        expect(geo.attributes.position.count / 3, at).toBeLessThanOrEqual(TRI_CAP[kind]);
        expect(canopyOf(g).material.vertexColors).toBe(true);

        const again = canopyOf(b.tree(x, z, 1, { kind })).geometry;
        expect(Array.from(again.attributes.position.array)).toEqual(Array.from(geo.attributes.position.array));
        expect(Array.from(again.attributes.color.array)).toEqual(Array.from(geo.attributes.color.array));

        // darker under the canopy than on top
        const pos = geo.attributes.position;
        const col = geo.attributes.color;
        const idx = [...Array(pos.count).keys()].sort((a, c) => pos.getY(a) - pos.getY(c));
        const fifth = Math.floor(pos.count / 5);
        const mean = (ids) => ids.reduce((s, i) => s + (col.getX(i) + col.getY(i) + col.getZ(i)) / 3, 0) / ids.length;
        expect(mean(idx.slice(-fifth)) - mean(idx.slice(0, fifth)), at).toBeGreaterThanOrEqual(0.15);

        // every vertex inside the kind's ellipsoid; the canopy radius is true
        let maxH = 0;
        for (const v of groupVerts(g)) {
          const h = Math.hypot(v.x, v.z);
          maxH = Math.max(maxH, h);
          const d = Math.hypot(h, (v.y - ell.y) * (ell.r / ell.ry));
          expect(d, `${at} vertex ${v.x.toFixed(2)},${v.y.toFixed(2)},${v.z.toFixed(2)}`).toBeLessThanOrEqual(ell.r + 1e-3);
        }
        expect(Math.abs(g.userData.canopy.r - maxH), at).toBeLessThanOrEqual(0.25);
        expect(g.userData.canopy.y).toBe(canopyOf(g).position.y);
      }
    });
  }

  it('canopyGeometry is the canopy tree() draws', () => {
    for (const kind of KINDS) {
      const geo = b.canopyGeometry(5, 5, kind);
      expect(geo.index).toBeNull();
      for (const a of ['position', 'normal', 'color']) expect(geo.attributes[a], `${kind} ${a}`).toBeTruthy();
      expect(Array.from(geo.attributes.position.array))
        .toEqual(Array.from(canopyOf(b.tree(5, 5, 1, { kind })).geometry.attributes.position.array));
    }
  });

  it('a tree with no kind takes canopyKind(x, z)', () => {
    for (const [x, z] of SPOTS) expect(b.tree(x, z).userData.canopyKind).toBe(b.canopyKind(x, z));
  });

  it('a birch trunk is pale with marks; the others keep the bark trunk', () => {
    const birch = trunkOf(b.tree(5, 5, 1, { kind: 'birch' }));
    const oak = trunkOf(b.tree(5, 5, 1, { kind: 'oak' }));
    const col = birch.geometry.attributes.color;
    expect(col).toBeTruthy();
    expect(birch.material.vertexColors).toBe(true);
    let sum = 0, darkest = 1;
    for (let i = 0; i < col.count; i++) {
      const c = (col.getX(i) + col.getY(i) + col.getZ(i)) / 3;
      sum += c;
      darkest = Math.min(darkest, c);
    }
    const lum = (c) => (c.r + c.g + c.b) / 3;
    expect(lum(birch.material.color) * (sum / col.count)).toBeGreaterThan(lum(oak.material.color));
    expect(darkest).toBeLessThan(0.5); // it has dark marks
    expect(oak.geometry.attributes.color).toBeUndefined();
    for (const kind of KINDS) {
      const t = trunkOf(b.tree(5, 5, 1, { kind }));
      t.geometry.computeBoundingBox();
      expect(t.geometry.boundingBox.min.y).toBeCloseTo(-1, 5);
      expect(t.geometry.boundingBox.max.y).toBeCloseTo(1, 5);
      expect(t.position.y).toBe(1);
      expect(t.geometry.parameters.radiusBottom).toBeLessThanOrEqual(0.35);
    }
  });

  it('the Moor builds and merges with its colour-carrying trees', async () => {
    const { build } = await import('../src/world/moor.js');
    const scene = new THREE.Scene();
    build(scene, {});
    expect(() => mergeStaticProps(scene)).not.toThrow();
  }, 120_000);
});
