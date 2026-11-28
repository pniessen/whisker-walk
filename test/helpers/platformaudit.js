import * as THREE from 'three';
import { groundOf } from '../../src/ground.js';

// The invisible-platform audit's engine (test/platformaudit.test.js uses it).
// A perch is "drawn" when a visible mesh in the built scene holds its point
// (within a tolerance). Three ways a mesh counts:
//   1. a mesh (or one instance of an instanced mesh) smaller than BIG across:
//      its bounding box holds the point;
//   2. a mesh BIGGER than BIG across (many props merged into one draw, such as
//      the Farm's fences or the Fairground's deck) is not ground by size alone,
//      so its triangles are tested one by one: a triangle smaller than BIG
//      across whose box holds the point counts. Meshes tagged userData.ground,
//      water and sky never count;
//   3. a perch's y is either a height above the ground under it (the Gorge,
//      part 1 R4) or an absolute y already (the Jungle's branch), so on raised
//      ground both points are tested: perch.y and perch.y + ground.y(x, z).
export const TOL_XZ = 0.6;
export const TOL_Y = 0.45;
export const BIG = 40;

const SKIP_NAME = /^(water|sky|ground|lawn)/i;
const skip = (o) => o.userData?.ground || SKIP_NAME.test(o.name || '') || /^(water|sky)\b/i.test(o.parent?.name || '');

/** World-space boxes: one per small mesh or instance, and one per small triangle of a big mesh. */
export function collectBoxes(scene) {
  scene.updateMatrixWorld(true);
  const out = [];
  const tmp = new THREE.Box3();
  const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  scene.traverseVisible((o) => {
    if (!o.isMesh || !o.geometry || skip(o)) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    const gb = o.geometry.boundingBox;
    if (!gb) return;
    if (o.isInstancedMesh) {
      const m = new THREE.Matrix4();
      for (let i = 0; i < o.count; i++) {
        o.getMatrixAt(i, m);
        tmp.copy(gb).applyMatrix4(m).applyMatrix4(o.matrixWorld);
        if (tmp.max.x - tmp.min.x < BIG && tmp.max.z - tmp.min.z < BIG) out.push(tmp.clone());
      }
      return;
    }
    tmp.copy(gb).applyMatrix4(o.matrixWorld);
    if (tmp.max.x - tmp.min.x < BIG && tmp.max.z - tmp.min.z < BIG) { out.push(tmp.clone()); return; }
    const pos = o.geometry.attributes.position;
    if (!pos) return;
    const idx = o.geometry.index;
    const n = idx ? idx.count : pos.count;
    for (let t = 0; t + 2 < n; t += 3) {
      for (let k = 0; k < 3; k++) v[k].fromBufferAttribute(pos, idx ? idx.getX(t + k) : t + k).applyMatrix4(o.matrixWorld);
      const b = new THREE.Box3().setFromPoints(v);
      if (b.max.x - b.min.x < BIG && b.max.z - b.min.z < BIG) out.push(b);
    }
  });
  return out;
}

export function covered(p, bs) {
  return bs.some((b) => p.x >= b.min.x - TOL_XZ && p.x <= b.max.x + TOL_XZ
    && p.z >= b.min.z - TOL_XZ && p.z <= b.max.z + TOL_XZ
    && p.y >= b.min.y - TOL_Y && p.y <= b.max.y + TOL_Y);
}

/** The finite perches of a built area that have nothing drawn at them in the scene. */
export function unmatchedPerches(area, scene) {
  const g = groundOf(area);
  const perches = (area?.perches ?? []).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.z) && Number.isFinite(p.y));
  const bs = collectBoxes(scene);
  const lifted = (p) => ({ ...p, y: p.y + (g.flat ? 0 : g.y(p.x, p.z)) });
  return { perches, unmatched: perches.filter((p) => !covered(p, bs) && !covered(lifted(p), bs)) };
}
