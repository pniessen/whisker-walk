// =============================================================================
// THE MOON'S RELAY ARC AS DRAWING (milestone M3). Small things, none of them a light: a RELAY PART (a little board on a square foot with a drum, a short antenna and a lamp; one mesh,
// local to its own origin: the live puts it on the dust, turns it and bobs it) and the LISTENING POST (a short post with a small dish turned to Earth, and a lamp that shows once the station
// is awake: two meshes, the lamp's an unlit one). Imports the Moon's own kit (already in the Moon's chunk). The lite rung drops the antenna and the cast shadows. No random number.
// =============================================================================
import * as THREE from 'three';
import { createKit, paint, box, cyl, moonMaterials } from './moonparts.js';

export const COL = Object.freeze({ board: 0x2f7d6a, foot: 0x8e8c92, steel: 0x7d848f, white: 0xf1f3f8, lamp: 0xffd987, teal: 0x6fe3d2, hazard: 0xf0c43c });
const TAU = Math.PI * 2;
const L = (geo, x, z, dy = 0, ry = 0) => { if (ry) geo.rotateY(ry); geo.translate(x, dy, z); return geo; };
const group = (kit, name) => { const g = new THREE.Group(); g.name = name; for (const m of kit.meshes()) g.add(m); return g; };

/** drawPart(M, { lite }) -> Group at the origin (a part resting on its own foot, 0.5 m across). One mesh. */
export function drawPart(M = moonMaterials(), { lite = false } = {}) {
  const kit = createKit('moonR');
  kit.put('paint', M.paint, paint(L(box(0.42, 0.06, 0.32), 0, 0, 0.03), COL.foot));
  kit.put('paint', M.paint, paint(L(box(0.34, 0.05, 0.24), 0, 0, 0.085), COL.board));
  kit.put('paint', M.paint, paint(L(cyl(0.07, 0.07, 0.14, 7), -0.09, 0, 0.18), COL.white));
  kit.put('paint', M.paint, paint(L(box(0.1, 0.05, 0.06), 0.09, 0.05, 0.135), COL.hazard));
  kit.put('paint', M.paint, paint(L(new THREE.SphereGeometry(0.045, 6, 4), 0.1, -0.04, 0.17), COL.lamp));
  if (!lite) kit.put('paint', M.paint, paint(L(cyl(0.012, 0.012, 0.28, 4), -0.09, 0, 0.39), COL.steel));
  const g = group(kit, 'moon:relaypart');
  if (lite) g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.userData.noCast = true; } });
  return g;
}

/** drawPost(M, { lite }) -> { group, lamp } at the origin: the lamp is the unlit mesh (`group` holds it; the live shows it once the station is awake). */
export function drawPost(M = moonMaterials(), { lite = false } = {}) {
  const kit = createKit('moonR');
  kit.put('paint', M.paint, paint(L(cyl(0.3, 0.36, 0.14, 8), 0, 0, 0.07), COL.foot));
  kit.put('paint', M.paint, paint(L(cyl(0.05, 0.07, 1.1, 5), 0, 0, 0.65), COL.steel));
  kit.put('paint', M.paint, paint(L(new THREE.SphereGeometry(0.42, 10, 4, 0, TAU, 0, 0.9).rotateX(-1.0), 0, -0.05, 1.3, 0), COL.white));
  kit.put('paint', M.paint, paint(L(cyl(0.02, 0.02, 0.4, 4).rotateX(-0.5), 0, -0.2, 1.45), COL.steel));
  kit.put('glow', M.glow, paint(L(new THREE.SphereGeometry(0.075, 6, 4), 0, 0, 1.25 + 0.45), COL.teal), { noCast: true });
  const g = group(kit, 'moon:relaypost');
  const lamp = g.children.find((m) => m.name.endsWith(':glow')) ?? null;
  if (lite) g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.userData.noCast = true; } });
  return { group: g, lamp };
}
