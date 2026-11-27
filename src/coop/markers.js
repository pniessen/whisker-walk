// The mark under each cat in couch play: cat one a blue circle, cat two an
// orange diamond (colour is never the only cue). A flat ring each, a few dozen
// triangles, not a shadow caster, drawn over the ground and under the cats.
import * as THREE from 'three';

export const MARK_ONE = 0x3b82f6;
export const MARK_TWO = 0xf59e0b;
const LIFT = 0.04;
const PUFF_S = 0.4;

function ring(color, segments) {
  const geo = new THREE.RingGeometry(0.46, 0.62, segments);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = -2;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 2;
  mesh.userData.noCast = true;
  mesh.userData.noMerge = true;
  mesh.visible = false;
  return mesh;
}

/** Two marks in `scene`. place(i, x, y, z) puts mark i (0 circle, 1 diamond) under a cat; hide() takes both away. */
export function createMarkers(scene) {
  const marks = [ring(MARK_ONE, 32), ring(MARK_TWO, 4)];
  for (const m of marks) scene.add(m);
  // The puff where a hop to a friend lands: one ring that opens and fades (nothing under reduced motion).
  const puffMesh = ring(0xffffff, 8);
  puffMesh.userData.puff = true;
  scene.add(puffMesh);
  let puffT = PUFF_S;
  return {
    marks,
    puffMesh,
    puff(x, y, z, reduced = false) { if (reduced) return; puffMesh.position.set(x, y + LIFT, z); puffT = 0; puffMesh.visible = true; puffMesh.scale.setScalar(0.5); puffMesh.material.opacity = 0.9; },
    step(dt) {
      if (puffT >= PUFF_S) return;
      puffT += dt;
      const k = Math.min(1, puffT / PUFF_S);
      puffMesh.scale.setScalar(0.5 + 2 * k);
      puffMesh.material.opacity = 0.9 * (1 - k);
      if (k >= 1) puffMesh.visible = false;
    },
    place(i, x, y, z) { const m = marks[i]; m.position.set(x, y + LIFT, z); m.visible = true; },
    hide() { for (const m of marks) m.visible = false; puffMesh.visible = false; puffT = PUFF_S; },
    dispose() {
      for (const m of [...marks, puffMesh]) { scene.remove(m); m.geometry.dispose(); m.material.dispose(); }
    },
  };
}
