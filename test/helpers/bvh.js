import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';

// Raycasts through a bounding volume hierarchy (three-mesh-bvh, a dev
// dependency: tests only, never imported from src/, never shipped).
//
// The pose sweeps (test/helpers/cape.js, backitems.js, catballoon.test.js,
// catsitupright*.test.js) cast a ray from every cloth or item vertex toward
// the body's centre, against a torso of ~3,200 triangles. Three's own
// Mesh.raycast tests every triangle of the mesh for every ray (~180 µs a
// ray); a BVH tests a few dozen. They were 44% of the suite's CPU time.
//
// useBVH(root) points every plain mesh under root at bvhRaycast below. Each
// geometry gets its own tree, kept beside it (not on it: the game's geometry
// is not touched, and the tree is built `indirect`, so its index is never
// reordered). A pose rewrites the torso's or the underside's points in place
// (animator.js, always with needsUpdate, which bumps the attribute's
// version): the tree is rebuilt for the new points the next time a ray
// meets it (~0.5 ms for the torso; a pose casts hundreds of rays). A cape
// swaps its whole geometry in the sit, and each of the two has its own tree.
//
// The answers are three's own, to rounding: the same triangles, the same
// one-sided or double-sided faces, the world point and distance worked out
// as three works them out, and near / far applied to the world distance as
// three applies them. Meshes three-mesh-bvh cannot see as posed (skinned,
// morphed, instanced, batched) keep three's raycast. test/bvhraycast.test.js
// checks the two agree to 1e-6 on a sample of the sweeps' own rays.
//
// A raycaster with firstHitOnly = true returns only the nearest hit of each
// mesh (three's own raycast ignores the flag and returns them all, nearest
// first): enough for `intersectObject(...)[0]` and `.length` tests.

const trees = new WeakMap();
const fresh = (mesh) => {
  const g = mesh.geometry, pos = g.attributes.position, index = g.index;
  const t = trees.get(g);
  if (t && t.pos === pos && t.version === pos.version && t.index === index && t.indexVersion === (index?.version ?? 0)) return t.bvh;
  // Rebuilt, not refitted, when the points move: a build pads every box by
  // float32 rounding, a refit does not, and a refitted tree can miss a ray
  // through a vertex on a box's face that three's raycast meets.
  const bvh = new MeshBVH(g, { indirect: true });
  trees.set(g, { bvh, pos, version: pos.version, index, indexVersion: index?.version ?? 0 });
  return bvh;
};
const plain = (m) => !m.isMesh || m.isSkinnedMesh || m.isInstancedMesh || m.isBatchedMesh
  || !m.geometry.attributes.position || m.geometry.morphAttributes.position || m.geometry.groups.length;

const inv = new THREE.Matrix4(), local = new THREE.Ray();
function hitOf(hit, mesh, raycaster, out) {
  if (!hit) return;
  hit.point.applyMatrix4(mesh.matrixWorld);
  hit.distance = hit.point.distanceTo(raycaster.ray.origin);
  if (hit.distance < raycaster.near || hit.distance > raycaster.far) return;
  hit.object = mesh;
  out.push(hit);
}
export function bvhRaycast(raycaster, intersects) {
  const { material } = this;
  if (material === undefined) return;
  const bvh = fresh(this);
  inv.copy(this.matrixWorld).invert();
  local.copy(raycaster.ray).applyMatrix4(inv);
  // Along one ray the local distance is a fixed multiple of the world one,
  // so the local nearest hit is the world nearest; near and far are applied
  // to the world distance afterwards, exactly (the library's own conversion
  // scales them by the matrix's column lengths, which is only exact without
  // shear).
  if (raycaster.firstHitOnly === true && raycaster.near === 0) hitOf(bvh.raycastFirst(local, material, 0, Infinity), this, raycaster, intersects);
  else for (const h of bvh.raycast(local, material, 0, Infinity)) hitOf(h, this, raycaster, intersects);
}

// Every plain mesh under root (root included) raycasts through its BVH.
// Calling it again sets up anything hung on root since.
const done = new WeakSet();
export function useBVH(root) {
  root.traverse((m) => {
    if (m.raycast !== bvhRaycast && !plain(m)) m.raycast = bvhRaycast;
  });
  done.add(root);
  return root;
}
// The same, once per root (cheap per ray).
export const ready = (o) => (done.has(o) ? o : useBVH(o));

// A raycaster that keeps only each mesh's nearest hit.
export const firstHitRaycaster = () => Object.assign(new THREE.Raycaster(), { firstHitOnly: true });
