// The walk camera's tree fade (src/treefade.js, polish pass 1a Task 4): a tree
// between the camera and the cat, or round the camera, fades to see-through
// on a per-tree material clone. It never writes `visible` (the fight camera
// owns that), never mutates a shared original material, fades a merged pine
// stand's trees one by one (geometry groups over each tree's index range, a
// clone per faded tree), and puts every original back when clear and on dispose.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { tree, pine, pineStand } from '../src/world/builder.js';
import { findOccluders } from '../src/fightcam.js';
import { createTreeFade, FADE_OPACITY } from '../src/treefade.js';
import { closeDiffs } from './helpers/closeto.js';

const meshesOf = (g) => {
  const out = [];
  g.traverse((o) => { if (o.isMesh) out.push(o); });
  return out;
};

function world() {
  const scene = new THREE.Scene();
  const near = tree(0, 0);
  const far = tree(10, 0);
  const pn = pine(-10, 6);
  scene.add(near, far, pn);
  const occ = findOccluders(scene);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 500);
  return { scene, near, far, pn, occ, camera };
}

const LOOK = { x: 0, y: 0.35, z: 3 };

describe('treefade', () => {
  it('fades a tree between the camera and the cat', () => {
    const { near, occ, camera } = world();
    const fade = createTreeFade(occ);
    camera.position.set(0, 2, -3);
    fade.update(1, camera, LOOK);
    expect(fade.faded().has(near)).toBe(true);
    for (const m of meshesOf(near)) {
      expect(closeDiffs(m.material.opacity, FADE_OPACITY)).toEqual([]);
      expect(m.material.transparent).toBe(true);
      expect(m.material.depthWrite).toBe(false);
    }
  });

  it('leaves a tree off the line alone', () => {
    const { far, pn, occ, camera } = world();
    const before = meshesOf(far).map((m) => m.material);
    const fade = createTreeFade(occ);
    camera.position.set(0, 2, -3);
    fade.update(1, camera, LOOK);
    expect(fade.faded().has(far)).toBe(false);
    expect(fade.faded().has(pn)).toBe(false);
    meshesOf(far).forEach((m, i) => expect(m.material).toBe(before[i]));
  });

  it('a neighbour sharing the material is untouched', () => {
    const { near, far, occ, camera } = world();
    // Make the two trees share their materials, as a cached material would.
    const nm = meshesOf(near), fm = meshesOf(far);
    fm.forEach((m, i) => { m.material = nm[i].material; });
    const shared = nm.map((m) => m.material);
    const fade = createTreeFade(occ);
    camera.position.set(0, 2, -3);
    fade.update(1, camera, LOOK);
    expect(fade.faded().has(near)).toBe(true);
    fm.forEach((m, i) => {
      expect(m.material).toBe(shared[i]);
      expect(m.material.opacity).toBe(1);
      expect(m.material.transparent).toBe(false);
    });
    nm.forEach((m, i) => expect(m.material).not.toBe(shared[i]));
  });

  it('fades a tree the camera is inside', () => {
    const { near, occ, camera } = world();
    const fade = createTreeFade(occ);
    camera.position.set(0, 2.8, 0);
    fade.update(1, camera, { x: 3, y: 0.35, z: 0 });
    expect(fade.faded().has(near)).toBe(true);
  });

  it('eases rather than snapping, and reducedMotion snaps', () => {
    const { near, occ, camera } = world();
    camera.position.set(0, 2, -3);
    const fade = createTreeFade(occ);
    fade.update(0.1, camera, LOOK);
    const mid = meshesOf(near)[0].material.opacity;
    expect(mid).toBeGreaterThan(FADE_OPACITY);
    expect(mid).toBeLessThan(1);
    const snap = createTreeFade(occ, { reducedMotion: true });
    fade.dispose();
    snap.update(0.01, camera, LOOK);
    expect(closeDiffs(meshesOf(near)[0].material.opacity, FADE_OPACITY)).toEqual([]);
    snap.dispose();
  });

  it('restores when clear, and on dispose', () => {
    const { near, occ, camera } = world();
    const originals = meshesOf(near).map((m) => m.material);
    const fade = createTreeFade(occ);
    camera.position.set(0, 2, -3);
    fade.update(1, camera, LOOK);
    expect(fade.faded().has(near)).toBe(true);
    camera.position.set(0, 2, 8); // behind the cat, nothing in the way
    fade.update(5, camera, LOOK);
    expect(fade.faded().size).toBe(0);
    meshesOf(near).forEach((m, i) => expect(m.material).toBe(originals[i]));
    for (const m of originals) {
      expect(m.opacity).toBe(1);
      expect(m.transparent).toBe(false);
      expect(m.depthWrite).toBe(true);
    }
    camera.position.set(0, 2, -3);
    fade.update(1, camera, LOOK);
    expect(fade.faded().has(near)).toBe(true);
    fade.dispose();
    expect(fade.faded().size).toBe(0);
    meshesOf(near).forEach((m, i) => expect(m.material).toBe(originals[i]));
    // after dispose, update is a harmless no-op
    fade.update(1, camera, LOOK);
    meshesOf(near).forEach((m, i) => expect(m.material).toBe(originals[i]));
  });

  it('never writes visible', () => {
    const { near, occ, camera } = world();
    near.visible = false; // the fight camera hid it
    let writes = 0;
    let v = false;
    Object.defineProperty(near, 'visible', { get: () => v, set: (x) => { writes++; v = x; }, configurable: true });
    const fade = createTreeFade(occ);
    camera.position.set(0, 2, -3);
    fade.update(1, camera, LOOK);
    camera.position.set(0, 2, 8);
    fade.update(5, camera, LOOK);
    camera.position.set(0, 2, -3);
    fade.update(1, camera, LOOK);
    fade.dispose();
    expect(writes).toBe(0);
    expect(near.visible).toBe(false);
  });

  // Fix wave M2: a tree the fight camera hid comes back already faded, not
  // opaque-then-easing (a flash in front of the cat as the fight ends).
  it('a hidden tree that is in the way snaps to faded, so it reappears see-through', () => {
    const { near, occ, camera } = world();
    const fade = createTreeFade(occ);
    camera.position.set(0, 2, -3);
    near.visible = false; // the fight camera hid it
    fade.update(1 / 60, camera, LOOK);
    near.visible = true; // and shows it again on exit
    fade.update(1 / 60, camera, LOOK);
    for (const m of meshesOf(near)) expect(closeDiffs(m.material.opacity, FADE_OPACITY)).toEqual([]);
    // a visible tree still eases in: one frame takes it only a little way down
    const w = world();
    const eased = createTreeFade(w.occ);
    w.camera.position.set(0, 2, -3);
    eased.update(1 / 60, w.camera, LOOK);
    for (const m of meshesOf(w.near)) expect(m.material.opacity).toBeGreaterThan(0.9);
    // a hidden tree out of the way is left alone
    w.far.visible = false;
    eased.update(1 / 60, w.camera, LOOK);
    expect(eased.faded().has(w.far)).toBe(false);
    fade.dispose(); eased.dispose();
  });

  // Fix wave M1: the first fade would compile the transparent variant mid-walk.
  it('prewarm puts one tree of each kind in its clones for the compile, then puts every original back', () => {
    const { near, far, pn, occ } = world();
    // a third kind of material on the pine: it needs its own compile
    for (const m of meshesOf(pn)) m.material = new THREE.MeshLambertMaterial({ color: m.material.color });
    const fade = createTreeFade(occ);
    const originals = [near, far, pn].map((g) => meshesOf(g).map((m) => m.material));
    let seen = null;
    fade.prewarm(() => {
      seen = [near, far, pn].map((g) => meshesOf(g).every((m) => m.material.transparent && !m.material.depthWrite));
    });
    // two kinds: the two trees share one, the Lambert pine is its own
    expect(seen.filter(Boolean).length).toBe(2);
    expect(seen[2]).toBe(true);
    expect(seen[0] !== seen[1]).toBe(true);
    [near, far, pn].forEach((g, k) => meshesOf(g).forEach((m, i) => expect(m.material).toBe(originals[k][i])));
    expect(fade.faded().size).toBe(0);
    // a throwing compile still puts the originals back
    expect(() => fade.prewarm(() => { throw new Error('no GL'); })).toThrow();
    [near, far, pn].forEach((g, k) => meshesOf(g).forEach((m, i) => expect(m.material).toBe(originals[k][i])));
    fade.dispose();
    expect(() => fade.prewarm(() => {})).not.toThrow(); // after dispose, a no-op
  });

  it('FADE_OPACITY is 0.1', () => {
    expect(FADE_OPACITY).toBe(0.1);
  });

  // A merged pine stand: three pines on a line along x.
  function standWorld() {
    const scene = new THREE.Scene();
    const stand = pineStand([{ x: 0, z: 0, scale: 1 }, { x: 6, z: 0, scale: 1 }, { x: 12, z: 0, scale: 1 }], 7);
    scene.add(stand);
    const occ = findOccluders(scene);
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 500);
    const meshes = meshesOf(stand);
    const originals = meshes.map((m) => m.material);
    return { scene, stand, occ, camera, meshes, originals };
  }

  // [start, end, materialIndex] per group, and whether they tile [0, count).
  const groupsOf = (m) => m.geometry.groups.map((g) => [g.start, g.start + g.count, g.materialIndex]);
  function tiles(m) {
    let at = 0;
    for (const [a, b] of groupsOf(m)) { if (a !== at || b <= a) return false; at = b; }
    return at === m.geometry.index.count;
  }

  it('findOccluders tags each stand tree with its stand and index', () => {
    const { stand, occ } = standWorld();
    expect(occ.length).toBe(3);
    occ.forEach((o, i) => {
      expect(o.obj).toBe(null);
      expect(o.stand).toBe(stand);
      expect(o.index).toBe(i);
    });
  });

  it('each stand tree owns a contiguous index range of count / trees, in tree order', () => {
    const { stand, meshes } = standWorld();
    const trees = stand.userData.occluderStand.trees;
    expect(meshes.map((m) => m.name).sort()).toEqual(['standFoliage', 'standTrunks']);
    for (const m of meshes) {
      const idx = m.geometry.index, pos = m.geometry.attributes.position;
      expect(idx.count % (trees.length * 3)).toBe(0);
      const per = idx.count / trees.length;
      trees.forEach((t, i) => {
        for (let k = i * per; k < (i + 1) * per; k++) {
          const v = idx.getX(k);
          expect(Math.hypot(pos.getX(v) - t.x, pos.getZ(v) - t.z)).toBeLessThan(1.5 * t.scale);
        }
      });
    }
  });

  it('fades a stand tree in the way, and only it', () => {
    const { occ, camera, meshes, originals } = standWorld();
    const fade = createTreeFade(occ);
    camera.position.set(6, 1.5, -4);
    fade.update(1, camera, { x: 6, y: 0.6, z: 4 });
    meshes.forEach((m, k) => {
      expect(Array.isArray(m.material)).toBe(true);
      expect(m.material.length).toBe(2);
      expect(m.material[0]).toBe(originals[k]);
      expect(tiles(m)).toBe(true);
      const per = m.geometry.index.count / 3;
      const faded = groupsOf(m).filter((g) => g[2] !== 0);
      expect(faded).toEqual([[per, 2 * per, 1]]);
      const c = m.material[1];
      expect(c).not.toBe(originals[k]);
      expect(c.transparent).toBe(true);
      expect(c.depthWrite).toBe(false);
      expect(closeDiffs(c.opacity, originals[k].opacity * FADE_OPACITY)).toEqual([]);
      // the original is never touched
      expect(originals[k].transparent).toBe(false);
      expect(originals[k].opacity).toBe(1);
    });
    expect(fade.faded().size).toBe(0); // stand trees are not tree Groups
    fade.dispose();
  });

  it('two stand trees fade on their own', () => {
    const { occ, camera, meshes } = standWorld();
    const fade = createTreeFade(occ);
    camera.position.set(0, 1.5, 0.5); // inside tree 0
    fade.update(1, camera, { x: 9, y: 0.6, z: 0.5 }); // the line passes tree 1
    for (const m of meshes) {
      expect(tiles(m)).toBe(true);
      const per = m.geometry.index.count / 3;
      const at = (k) => groupsOf(m).find((g) => g[0] <= k && k < g[1])[2];
      const i0 = at(0), i1 = at(per), i2 = at(2 * per);
      expect(i0).not.toBe(0);
      expect(i1).not.toBe(0);
      expect(i2).toBe(0);
      expect(m.material[i0]).not.toBe(m.material[i1]);
      expect(m.material.length).toBe(3);
    }
    fade.dispose();
  });

  it('a stand tree eases rather than snapping', () => {
    const { occ, camera, meshes } = standWorld();
    const fade = createTreeFade(occ);
    camera.position.set(6, 1.5, -4);
    fade.update(0.05, camera, { x: 6, y: 0.6, z: 4 });
    const op = meshes[0].material[1].opacity;
    expect(op).toBeGreaterThan(FADE_OPACITY);
    expect(op).toBeLessThan(1);
    fade.update(1, camera, { x: 6, y: 0.6, z: 4 });
    expect(closeDiffs(meshes[0].material[1].opacity, FADE_OPACITY)).toEqual([]);
    fade.dispose();
  });

  it('restores a stand when clear, and on dispose', () => {
    const { occ, camera, meshes, originals } = standWorld();
    const fade = createTreeFade(occ);
    camera.position.set(6, 1.5, -4);
    const look = { x: 6, y: 0.6, z: 4 };
    fade.update(1, camera, look);
    expect(Array.isArray(meshes[0].material)).toBe(true);
    camera.position.set(6, 1.5, 10); // behind the cat, nothing in the way
    fade.update(5, camera, look);
    meshes.forEach((m, k) => {
      expect(m.material).toBe(originals[k]);
      expect(m.geometry.groups.length).toBe(0);
    });
    camera.position.set(6, 1.5, -4);
    fade.update(1, camera, look);
    expect(Array.isArray(meshes[0].material)).toBe(true);
    fade.dispose();
    meshes.forEach((m, k) => {
      expect(m.material).toBe(originals[k]);
      expect(m.geometry.groups.length).toBe(0);
    });
    fade.update(1, camera, look); // after dispose, a no-op
    meshes.forEach((m, k) => expect(m.material).toBe(originals[k]));
  });

  it('prewarm puts a stand tree in its faded state for the compile, then restores', () => {
    const { occ, meshes, originals } = standWorld();
    const fade = createTreeFade(occ);
    let seen = null;
    fade.prewarm(() => {
      seen = meshes.map((m) => Array.isArray(m.material) && m.material.length === 2
        && m.material[1].transparent && !m.material[1].depthWrite && tiles(m));
    });
    expect(seen).toEqual([true, true]);
    meshes.forEach((m, k) => {
      expect(m.material).toBe(originals[k]);
      expect(m.geometry.groups.length).toBe(0);
    });
    fade.dispose();
  });

  it('a stand that does not split evenly is left alone', () => {
    const { stand, occ, camera } = standWorld();
    const odd = new THREE.Group();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0], 3));
    geo.setIndex([0, 1, 2, 1, 3, 2]); // 6 indices: not a multiple of 3 trees x 3
    const mat = new THREE.MeshLambertMaterial();
    const mesh = new THREE.Mesh(geo, mat);
    odd.add(mesh);
    odd.userData.occluderStand = stand.userData.occluderStand;
    for (const o of occ) o.stand = odd;
    const fade = createTreeFade(occ);
    camera.position.set(6, 1.5, -4);
    expect(() => fade.update(1, camera, { x: 6, y: 0.6, z: 4 })).not.toThrow();
    expect(mesh.material).toBe(mat);
    expect(geo.groups.length).toBe(0);
    expect(() => fade.prewarm(() => {})).not.toThrow();
    expect(mesh.material).toBe(mat);
    fade.dispose();
  });

  it('a clone renders like its original (onBeforeCompile, cache key carried)', () => {
    const { near, occ, camera } = world();
    const hook = () => {};
    const key = () => 'tree-test';
    const orig = meshesOf(near)[0].material;
    orig.onBeforeCompile = hook;
    orig.customProgramCacheKey = key;
    const fade = createTreeFade(occ);
    camera.position.set(0, 2, -3);
    fade.update(1, camera, LOOK);
    const clone = meshesOf(near)[0].material;
    expect(clone).not.toBe(orig);
    expect(clone.onBeforeCompile).toBe(hook);
    expect(clone.customProgramCacheKey).toBe(key);
    expect(clone.color.getHex()).toBe(orig.color.getHex());
    fade.dispose();
  });

  it('an empty occluder list (the den) is a no-op', () => {
    const fade = createTreeFade([]);
    const camera = new THREE.PerspectiveCamera();
    expect(() => fade.update(1, camera, LOOK)).not.toThrow();
    expect(fade.faded().size).toBe(0);
    fade.dispose();
  });
});
