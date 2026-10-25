import * as THREE from 'three';
import { borderMarks } from '../rivalclans.js';

// createBorderMarks(scene, areaId, { contested = [], maxMarks } = {})
// Draws a rival territory's border as flat scent-mark decals on the ground,
// one mesh per mark (<= 16 draw calls per area). Same idiom as scent.js:
// CircleGeometry + MeshBasicMaterial, laid flat. The y lift (0.025) sits
// between scent.js's 0.03 trail dots and kitten.js's 0.02 paw prints; with
// depthWrite off and a polygonOffset it will not z-fight the ground.
//
// A contested mark changes appearance and is NEVER removed. Two materials
// are shared by every mark (normal: warm earthy brown; contested: pale
// sandy), so dispose() releases each exactly once.
//
// maxMarks (optional): the caller may pass a smaller number for the low
// quality tier; every k-th mark is kept. quality.js has no field for it yet.
const RADIUS = 0.2; // ~0.4 m across
const Y = 0.025;
const BASE_OPACITY = 0.6;
const CONTESTED_OPACITY = 0.75;

export function createBorderMarks(scene, areaId, { contested = [], maxMarks } = {}) {
  let pts = borderMarks(areaId);
  if (Number.isInteger(maxMarks) && maxMarks > 0 && pts.length > maxMarks) {
    const k = Math.ceil(pts.length / maxMarks);
    pts = pts.filter((_, i) => i % k === 0);
  }

  const make = (color, opacity) =>
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
  const normalMat = make(0x8a5a2b, BASE_OPACITY);
  const contestedMat = make(0xe6d9b8, CONTESTED_OPACITY);

  const list = pts.map((p) => {
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(RADIUS, 10), normalMat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(p.x, Y, p.z);
    scene.add(mesh);
    return { x: p.x, z: p.z, mesh, contested: false };
  });

  function setContested(index) {
    if (!Number.isInteger(index) || index < 0 || index >= list.length) return;
    list[index].contested = true;
    list[index].mesh.material = contestedMat;
  }
  if (Array.isArray(contested)) for (const i of contested) setContested(i);

  let disposed = false;
  return {
    list,
    // gentle pulse on the two shared materials; no allocation
    update(t) {
      if (!list.length) return;
      const s = Math.sin(t * 1.5);
      normalMat.opacity = BASE_OPACITY + 0.08 * s;
      contestedMat.opacity = CONTESTED_OPACITY + 0.1 * s;
    },
    setContested,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const m of list) {
        scene.remove(m.mesh);
        m.mesh.geometry.dispose();
      }
      normalMat.dispose();
      contestedMat.dispose();
    },
  };
}
