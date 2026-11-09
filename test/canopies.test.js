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

  // Every crown sits on its 2 m trunk: straight up from the trunk top (the
  // axis and 0.2 round it), the canopy's underside is never above 1.9 in the
  // Group's unscaled frame, at any of 240 hashed spots per kind.
  it('every kind\'s crown sits on the trunk: underside over the axis <= 1.9', () => {
    const rc = new THREE.Raycaster();
    const up = new THREE.Vector3(0, 1, 0);
    const offs = [[0, 0], [0.2, 0], [-0.2, 0], [0, 0.2], [0, -0.2]];
    const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    for (const kind of KINDS) {
      let worst = -Infinity;
      for (let i = 0; i < 240; i++) {
        const x = Math.round((b.hash01(i, kind.length, 7) - 0.5) * 24000) / 100;
        const z = Math.round((b.hash01(i, kind.length, 8) - 0.5) * 24000) / 100;
        const g = b.tree(x, z, 1, { kind });
        const leaves = new THREE.Mesh(canopyOf(g).geometry, mat);
        leaves.position.y = g.userData.canopy.y;
        leaves.rotation.y = canopyOf(g).rotation.y;
        leaves.updateMatrixWorld(true);
        for (const [dx, dz] of offs) {
          rc.set(new THREE.Vector3(dx, -10, dz), up);
          const hit = rc.intersectObject(leaves)[0];
          expect(hit, `${kind} at (${x}, ${z}) has canopy over its trunk`).toBeTruthy();
          worst = Math.max(worst, hit.point.y);
          expect(hit.point.y, `${kind} at (${x}, ${z}) underside +${dx},${dz}`).toBeLessThanOrEqual(1.9);
        }
      }
      expect(worst, kind).toBeGreaterThan(1.2); // and it is the trunk's top it sits on, not swallowing it
    }
  });

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

  describe('old oaks in the Woods', () => {
    it('woodsOldOaks picks 4-6 spots by the camp or the trail, apart, deterministically; woodsTreeSpots is unchanged', async () => {
      const { woodsTreeSpots, woodsOldOaks, WOODS_PATHS } = await import('../src/world/woods.js');
      const { campLayout } = await import('../src/world/camp.js');
      const { segDist } = await import('../src/segdist.js');
      const spots = woodsTreeSpots();
      expect(spots.length).toBe(69);
      expect(spots.slice(0, 3)).toEqual([{ x: -7.61, z: -46.95, scale: 1.07 }, { x: 3.44, z: -45.4, scale: 1.09 }, { x: 9.32, z: -45.67, scale: 1.51 }]);
      expect(spots.slice(-3)).toEqual([{ x: 25.81, z: 34.65, scale: 1.58 }, { x: 32.86, z: 34.33, scale: 1.27 }, { x: 44.34, z: 34.83, scale: 1.2 }]);
      const old = woodsOldOaks(spots);
      expect([...woodsOldOaks(spots)]).toEqual([...old]);
      expect(old.size).toBeGreaterThanOrEqual(4);
      expect(old.size).toBeLessThanOrEqual(6);
      const L = campLayout('woods');
      const picked = [...old].map((i) => spots[i]);
      for (const { x, z } of picked) {
        const ok = Math.hypot(x - L.cx, z - L.cz) <= 16 || WOODS_PATHS.some((s) => segDist(x, z, ...s) <= 6);
        expect(ok).toBe(true);
      }
      for (let i = 0; i < picked.length; i++) {
        for (let j = i + 1; j < picked.length; j++) expect(Math.hypot(picked[i].x - picked[j].x, picked[i].z - picked[j].z)).toBeGreaterThanOrEqual(7);
      }
    });

    it('a built Woods has those old oaks, and a Great Oak of kind oak', async () => {
      const { build, woodsTreeSpots, woodsOldOaks } = await import('../src/world/woods.js');
      const scene = new THREE.Scene();
      build(scene);
      const kinds = [];
      scene.traverse((o) => { if (o.userData?.canopyKind) kinds.push(o.userData.canopyKind); });
      expect(kinds.filter((k) => k === 'old').length).toBe(woodsOldOaks(woodsTreeSpots()).size);
      expect(scene.getObjectByName('greatOak').userData.canopyKind).toBe('oak');
    }, 120_000);
  });
});

// polish-dusk7: the birch trunk's vertex colours are a warm grey-white (not the
// full white that glowed at dusk) with near-black dashes, and every one is finite.
describe('birch trunk colours (polish-dusk7)', () => {
  it('are finite, pale runs sit below full white, dashes are dark', () => {
    for (let i = 0; i < 40; i++) {
      const g = b.tree(i * 3.1, i * 1.7, 1, { kind: "birch" });
      const c = g.children[0].geometry.attributes.color.array;
      let dark = 0;
      for (let v = 0; v < c.length; v += 3) {
        for (let k = 0; k < 3; k++) expect(Number.isFinite(c[v + k])).toBe(true);
        expect(Math.max(c[v], c[v + 1], c[v + 2])).toBeLessThanOrEqual(0.5601);
        if (c[v] < 0.1) dark++;
      }
      expect(dark).toBeGreaterThan(0);
    }
  });
});

// polish-foliage: soft facets (normals part-way to round, positions as they
// were), no trunk caps, and bramble thickets that read as leaves, not rocks.
describe('soft foliage (polish-foliage)', () => {
  it('canopy normals are unit, outward and no longer one flat normal per facet', () => {
    for (const kind of KINDS) {
      const geo = b.canopyGeometry(5, 5, kind);
      const pos = geo.attributes.position, nrm = geo.attributes.normal;
      let split = 0;
      for (let f = 0; f < pos.count; f += 3) {
        for (let v = f; v < f + 3; v++) {
          expect(Math.hypot(nrm.getX(v), nrm.getY(v), nrm.getZ(v))).toBeCloseTo(1, 5);
          // outward: along the direction from the crown centre (the main lobe's origin)
          const out = nrm.getX(v) * pos.getX(v) + nrm.getY(v) * pos.getY(v) + nrm.getZ(v) * pos.getZ(v);
          if (kind === 'round' || kind === 'birch') expect(out, kind).toBeGreaterThan(-0.5);
        }
        const same = [1, 2].every((k) => Math.abs(nrm.getX(f) - nrm.getX(f + k)) + Math.abs(nrm.getY(f) - nrm.getY(f + k)) + Math.abs(nrm.getZ(f) - nrm.getZ(f + k)) < 1e-6);
        if (!same) split++;
      }
      expect(split / (pos.count / 3), kind).toBeGreaterThan(0.9);
    }
  });

  it('a bark trunk is open-ended: no flat cap at its top inside the crown', () => {
    for (const kind of ['oak', 'round', 'old']) {
      const p = trunkOf(b.tree(3, 4, 1, { kind })).geometry.parameters;
      expect(p.openEnded, kind).toBe(true);
      expect(p.height).toBe(2);
    }
  });

  it('brambleBed keeps its triangles and lobe count, with leaf colours light on top and dark below', () => {
    const spots = [{ x: 0, z: 0 }, { x: 5, z: 2 }, { x: -3, z: 7 }];
    const m = b.brambleBed(spots, 3);
    const lobes = spots.reduce((s, sp) => s + 3 + Math.floor(b.hash01(sp.x, sp.z, 4) * 2), 0);
    // polish-shrubs: each 20-triangle lobe also wears 7 two-triangle leaf cards
    // polish-bushes: 14 broad shingle cards a lobe instead (20 + 28)
    expect(m.geometry.attributes.position.count / 3).toBe(lobes * 48);
    expect(m.material.vertexColors).toBe(true);
    const pos = m.geometry.attributes.position, col = m.geometry.attributes.color;
    let hi = 0, lo = 0, nh = 0, nl = 0;
    for (let v = 0; v < pos.count; v++) {
      const g = col.getY(v);
      expect(g).toBeGreaterThan(col.getZ(v)); // green, not grey
      if (pos.getY(v) > 0.55) { hi += g; nh++; } else if (pos.getY(v) < 0.2) { lo += g; nl++; }
    }
    expect(hi / nh - lo / nl).toBeGreaterThan(0.1);
    const again = b.brambleBed(spots, 3);
    expect(Array.from(again.geometry.attributes.position.array)).toEqual(Array.from(pos.array));
  });
});
