// =============================================================================
// THE MOON: THE BOUND'S COURSES, DRAWN (milestone 7b). The static pieces go into the kit's own buckets like the rest of the Moon (no draw call of their own): the three rifts
// (a pale lip band and a dark trench floor laid a hair over the dust, a stadium each) and the five ring gates' posts and arms. The one thing that changes is made here and
// moved by the life (world/moonboundlive.js): the five hoops, ONE InstancedMesh (one draw call, each dim, lit or gold by its instance colour). Nothing here when the
// switch (world/moonswitch.js) is off: the plan's lists are empty.
// =============================================================================

import * as THREE from 'three';
import * as P from './moonplan.js';
import { paint, at, cyl } from './moonparts.js';

export const BOUND_COL = Object.freeze({ lip: 0x8a8f9c, trench: 0x07090f, post: 0xc9cdd6, arm: 0xf0c43c, dim: 0x6b7a99, lit: 0xfff0c4, gold: 0xffc83a });

// a stadium (a straight axis of length L with a half circle on each end, half width r) laid flat, its axis along local -z, from the origin
function stadium(L, r) {
  const s = new THREE.Shape();
  s.absarc(0, 0, r, Math.PI, Math.PI * 2, false); // the near cap: (-r, 0) round the bottom to (r, 0)
  s.lineTo(r, L);
  s.absarc(0, L, r, 0, Math.PI, false); // the far cap
  s.lineTo(-r, 0);
  return new THREE.ShapeGeometry(s, 8);
}

export function drawRifts(kit, M) {
  for (const f of P.RIFTS) {
    const dx = f.x1 - f.x0;
    const dz = f.z1 - f.z0;
    const L = Math.hypot(dx, dz);
    const yaw = Math.atan2(-dx / L, -dz / L);
    const g = P.moonY((f.x0 + f.x1) / 2, (f.z0 + f.z1) / 2);
    for (const [r, hex, dy] of [[f.w / 2 + 0.45, BOUND_COL.lip, 0.04], [f.w / 2, BOUND_COL.trench, 0.055]]) {
      const geo = stadium(L, r).rotateX(-Math.PI / 2).rotateY(yaw).translate(f.x0, g + dy, f.z0);
      kit.put('floor', M.paint, paint(geo, hex), { noCast: true });
    }
  }
}

export function drawRingPosts(kit, M) {
  for (const g of P.RING_GATES) {
    const top = P.moonY(g.x, g.z) + g.y;
    const pg = P.moonY(g.post.x, g.post.z); // the post's own ground
    const h = top + 0.1 - pg;
    kit.put('paint', M.paint, paint(at(cyl(0.07, 0.1, h, 6), g.post.x, g.post.z, h / 2), BOUND_COL.post));
    kit.put('paint', M.paint, paint(new THREE.BoxGeometry(0.09, 0.09, g.post.z - g.z - g.r + 0.05).translate(g.x, top, (g.post.z + g.z + g.r) / 2), BOUND_COL.arm), { noCast: true });
    kit.put('paint', M.paint, paint(at(cyl(0.3, 0.34, 0.1, 8), g.post.x, g.post.z, 0.05), BOUND_COL.post));
  }
}

// ---- the hoops: one InstancedMesh (a thin torus standing in the north-south plane each) ----------------------------------------------------------------------------
export function makeRings() {
  const geo = new THREE.TorusGeometry(P.RING_R, 0.09, 6, 18).rotateY(Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const gates = P.RING_GATES;
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, gates.length));
  mesh.name = 'moon:rings';
  mesh.count = gates.length;
  const m4 = new THREE.Matrix4();
  const col = new THREE.Color();
  gates.forEach((g, i) => {
    m4.makeTranslation(g.x, P.moonY(g.x, g.z) + g.y, g.z);
    mesh.setMatrixAt(i, m4);
    mesh.setColorAt(i, col.setHex(BOUND_COL.dim));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  Object.assign(mesh.userData, { noMerge: true, noCast: true, noContactShadow: true });
  return {
    mesh,
    paint(i, hex) { mesh.setColorAt(i, col.setHex(hex)); mesh.instanceColor.needsUpdate = true; },
    dispose() { geo.dispose(); mat.dispose(); mesh.dispose?.(); },
  };
}
