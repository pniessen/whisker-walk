// =============================================================================
// THE REEF, THE SEALAB'S SMALL DRAWINGS (milestone R14): the three fuses, the aquarium's fish and the shy shark. Vertex-coloured, no texture, no random number,
// no clock (the live part hands in the walk's time); three comes through reeflabparts.js's kit (this chunk imports none of its own).
//   fuse   a glass tube with brass caps and an amber glow inside, about 0.4 m: one mesh each, 'lab:fuse0' to 'lab:fuse2' (unlit, so it reads in a dim room)
//   fish   one InstancedMesh ('lab:fish'): a tinted body, a tail and a fin; the tint is the instance's colour
//   shark  one mesh ('lab:shark'): a grey body with a pale belly and seven dark spots, a tail, a tall fin and two side fins, about 2.4 m, facing +x
// Nothing here casts a shadow (the Reef's walk sweeps leave them be).
// =============================================================================

import { kitOf, COL } from './reeflabparts.js';

const NOFX = Object.freeze({ noCast: true, noContactShadow: true, noMerge: true });
function flag(m, name) { m.name = name; m.castShadow = false; m.receiveShadow = false; m.frustumCulled = false; Object.assign(m.userData, NOFX); return m; }

export const FISH_TINTS = Object.freeze([0xff9a3a, 0x4aa8ff, 0xffd84a, 0xf06a8a]);

// ---- a fuse: upright on its base, 0.42 m tall -----------------------------------------------------------------------------------------------------
export function makeFuse(id) {
  const { THREE, mergeGeometries, tone, cy } = kitOf();
  const parts = [
    cy(0.075, 0.075, 0.30, 0, 0.06, 0, 0xffc860, 10), // the glass, glowing amber
    cy(0.035, 0.035, 0.30, 0, 0.06, 0, 0xfff1c4, 6), // the bright thread inside
    cy(0.085, 0.085, 0.07, 0, 0, 0, COL.brass, 10), cy(0.085, 0.085, 0.07, 0, 0.35, 0, COL.brass, 10),
    cy(0.02, 0.02, 0.06, 0, 0.41, 0, COL.brass, 5),
    tone(new THREE.RingGeometry(0.13, 0.2, 14).rotateX(-Math.PI / 2).translate(0, 0.01, 0), 0xffd27a), // a soft ring on the floor under it
  ];
  const m = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  m.userData.fuse = id;
  return flag(m, `lab:fuse${id}`);
}

// ---- the aquarium's fish ------------------------------------------------------------------------------------------------------------------------
// One fish faces +x: a body 0.34 m long, a tail, a back fin and an eye on each side. White parts take the instance's tint.
export function makeFish(count) {
  const { THREE, mergeGeometries, tone } = kitOf();
  const parts = [
    tone(new THREE.SphereGeometry(0.5, 7, 5).scale(0.34, 0.2, 0.1), 0xffffff),
    tone(new THREE.ConeGeometry(0.1, 0.16, 4).rotateZ(Math.PI / 2).translate(-0.24, 0, 0), 0xffffff),
    tone(new THREE.ConeGeometry(0.06, 0.12, 3).translate(-0.02, 0.12, 0), 0xffffff),
    tone(new THREE.SphereGeometry(0.02, 4, 3).translate(0.12, 0.03, 0.045), 0x101820),
    tone(new THREE.SphereGeometry(0.02, 4, 3).translate(0.12, 0.03, -0.045), 0x101820),
  ];
  const mesh = new THREE.InstancedMesh(mergeGeometries(parts), new THREE.MeshBasicMaterial({ vertexColors: true }), count);
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) mesh.setColorAt(i, c.setHex(FISH_TINTS[i % FISH_TINTS.length]));
  mesh.instanceColor.needsUpdate = true;
  mesh.count = count;
  return flag(mesh, 'lab:fish');
}

// ---- the shy shark ------------------------------------------------------------------------------------------------------------------------------------
// About 2.4 m nose to tail, +x forward, y up. Sandy grey on top, pale underneath; the spots are small flat dark ovals along its back.
export function makeShark(spots = 7) {
  const { THREE, mergeGeometries, tone } = kitOf();
  const back = 0x8f9fa3; const belly = 0xe8e6da; const dark = 0x46565b;
  const parts = [
    tone(new THREE.SphereGeometry(0.5, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.2, 0.36, 0.34), back), // the top half of the body
    tone(new THREE.SphereGeometry(0.5, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).scale(1.2, 0.3, 0.34), belly), // the pale underside
    tone(new THREE.ConeGeometry(0.17, 0.7, 6).rotateZ(Math.PI / 2).translate(-0.98, 0.02, 0), back), // the tail's stem
    tone(new THREE.ConeGeometry(0.22, 0.5, 3).translate(-1.3, 0.2, 0), back), // the tail fin, upper lobe
    tone(new THREE.ConeGeometry(0.14, 0.34, 3).rotateX(Math.PI).translate(-1.26, -0.17, 0), back), // lower lobe
    tone(new THREE.ConeGeometry(0.16, 0.42, 3).translate(0.05, 0.38, 0), back), // the tall back fin
    tone(new THREE.ConeGeometry(0.1, 0.5, 3).rotateX(-Math.PI / 2.4).translate(0.25, -0.08, 0.3), back),
    tone(new THREE.ConeGeometry(0.1, 0.5, 3).rotateX(Math.PI / 2.4).translate(0.25, -0.08, -0.3), back),
    tone(new THREE.SphereGeometry(0.025, 5, 4).translate(0.52, 0.06, 0.15), 0x101820),
    tone(new THREE.SphereGeometry(0.025, 5, 4).translate(0.52, 0.06, -0.15), 0x101820),
  ];
  for (let i = 0; i < spots; i++) {
    const x = 0.5 - i * 0.2;
    const side = i % 2 ? 1 : -1;
    parts.push(tone(new THREE.SphereGeometry(0.05, 5, 4).scale(1, 0.4, 1).translate(x, 0.17 * (1 - Math.abs(x) * 0.25), 0.07 * side), dark));
  }
  const m = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshLambertMaterial({ vertexColors: true }));
  m.scale.setScalar(1.1);
  return flag(m, 'lab:shark');
}
