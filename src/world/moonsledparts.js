// =============================================================================
// THE MOON'S SLED LANE AS DRAWING (milestone M2). Three small groups, none of them a light:
//   the RACK   two low posts, a crossbar and a hazard band round the bay where the sled waits (static);
//   the SLED   a friendly pale hover sled: a rounded body, a nose cap with two round "eyes", a seat cushion and a handle, two runners, and a soft glow strip under it (it moves; the live bobs it);
//   the LAMPS  the marker lamps along the lane's two outer edges: ONE merged mesh of posts (lit) and ONE of lamp balls (unlit), two draws in all.
// The lite rung draws half the lamps, no crossbar sign and no cast shadows. No random number: every number here is a constant. Imports the Moon's own kit (already in the Moon's chunk).
// =============================================================================
import * as THREE from 'three';
import { createKit, paint, box, cyl, at, moonMaterials } from './moonparts.js';
import { LAMPS, RACK, SLED } from './moonsledplan.js';

export const COL = Object.freeze({ white: 0xf1f3f8, shell: 0xdfe8f2, steel: 0x7d848f, navy: 0x1a2340, hazard: 0xf0c43c, teal: 0x6fe3d2, lamp: 0xffd987, post: 0x8e8c92, pink: 0xff8fb3 });
const TAU = Math.PI * 2;
// a local placement for the sled itself (its own origin; the live puts it on the ground): sideways x, along z, dy up
const L = (geo, x, z, dy = 0, ry = 0, rz = 0) => { if (rz) geo.rotateZ(rz); if (ry) geo.rotateY(ry); geo.translate(x, dy, z); return geo; };
const named = (kit, prefix, name, noCastAll = false) => {
  const g = new THREE.Group();
  g.name = name;
  for (const m of kit.meshes()) { if (noCastAll) { m.castShadow = false; m.userData.noCast = true; } g.add(m); }
  void prefix;
  return g;
};

/** drawRack(M, yaw, { lite }) -> Group at the origin; the bay is round (RACK.x, RACK.z), the sled facing `yaw` (the lane's heading there). */
export function drawRack(M = moonMaterials(), yaw = 0, { lite = false } = {}) {
  const kit = createKit('moonS');
  const rx = Math.cos(yaw);
  const rz = -Math.sin(yaw); // sideways (the sled's own left-right axis) in world x, z
  for (const k of [-1, 1]) {
    const x = RACK.x + rx * RACK.postGap * k;
    const z = RACK.z + rz * RACK.postGap * k;
    kit.put('paint', M.paint, paint(at(cyl(RACK.postR * 0.8, RACK.postR, 1.3, 7), x, z, 0.65), COL.post));
    kit.put('paint', M.paint, paint(at(cyl(RACK.postR * 1.25, RACK.postR * 1.25, 0.12, 7), x, z, 0.06), COL.steel));
  }
  // the crossbar and a hazard band over the bay
  kit.put('paint', M.paint, paint(at(box(RACK.postGap * 2 + 0.3, 0.12, 0.2), RACK.x, RACK.z, 1.3, yaw), COL.white));
  kit.put('paint', M.paint, paint(at(box(RACK.postGap * 2 - 0.1, 0.05, 0.22), RACK.x, RACK.z, 1.21, yaw), COL.hazard), { noCast: true });
  if (!lite) {
    // a small round sign on the bar: a sled's nose (the glow is the sign's face)
    kit.put('glow', M.glow, paint(at(new THREE.SphereGeometry(0.16, 8, 6), RACK.x, RACK.z, 1.55), COL.teal), { noCast: true });
    kit.put('paint', M.paint, paint(at(cyl(0.025, 0.025, 0.22, 4), RACK.x, RACK.z, 1.4), COL.steel));
  }
  // the bay's mat: a flat pale disc under the sled
  kit.put('paint', M.paint, paint(at(cyl(RACK.park * 1.15, RACK.park * 1.15, 0.03, 14), RACK.x, RACK.z, 0.02), COL.shell), { noCast: true });
  return named(kit, 'moonS', 'moon:sledrack', lite);
}

/** drawSled(M, { lite }) -> Group at the origin (the nose toward +z, the seat's middle at x 0, z -0.1). The live puts it on the lane. */
export function drawSled(M = moonMaterials(), { lite = false } = {}) {
  const kit = createKit('moonSled');
  const H = SLED.len;
  // the body: a low pale tray with a rounded nose, the seat's cushion and a handle
  kit.put('paint', M.paint, paint(L(box(1.1, 0.22, H - 0.5), 0, -0.2, 0.18), COL.white));
  kit.put('paint', M.paint, paint(L(cyl(0.55, 0.55, 0.22, 12).scale(1, 1, 1), 0, H / 2 - 0.55 - 0.25, 0.18), COL.white));
  kit.put('paint', M.paint, paint(L(new THREE.SphereGeometry(0.56, 12, 6, 0, TAU, 0, Math.PI / 2).scale(1, 0.55, 1), 0, H / 2 - 0.8, 0.28), COL.shell));
  // the seat: a navy cushion, with a back rest
  kit.put('paint', M.paint, paint(L(box(0.62, 0.12, 0.6), 0, -0.1, 0.34), COL.navy));
  kit.put('paint', M.paint, paint(L(box(0.62, 0.34, 0.1), 0, -0.45, 0.46), COL.navy));
  // the handle in front of the seat, with two small grips
  kit.put('paint', M.paint, paint(L(cyl(0.025, 0.025, 0.5, 5), 0, 0.28, 0.5, 0, Math.PI / 2), COL.steel));
  for (const k of [-1, 1]) kit.put('paint', M.paint, paint(L(cyl(0.025, 0.025, 0.28, 5), 0.24 * k, 0.2, 0.4), COL.steel));
  // two runners that curl up at the front
  for (const k of [-1, 1]) {
    kit.put('paint', M.paint, paint(L(box(0.12, 0.07, H - 0.2), 0.52 * k, -0.05, 0.05), COL.steel));
    kit.put('paint', M.paint, paint(L(box(0.12, 0.07, 0.28), 0.52 * k, H / 2 - 0.1, 0.1), COL.steel));
    kit.put('paint', M.paint, paint(L(box(0.07, 0.1, 0.07), 0.46 * k, -0.35, 0.12), COL.steel));
  }
  // a stripe along the sides
  for (const k of [-1, 1]) kit.put('paint', M.paint, paint(L(box(0.04, 0.06, H - 0.7), 0.56 * k, -0.2, 0.2), COL.pink), { noCast: true });
  // two round "eyes" on the nose
  for (const k of [-1, 1]) kit.put('glow', M.glow, paint(L(new THREE.SphereGeometry(0.07, 6, 5), 0.2 * k, H / 2 - 0.35, 0.3), COL.lamp), { noCast: true });
  // the soft glow strip under it (a flat teal disc: the hover)
  if (!lite) kit.put('glow', M.glow, paint(L(cyl(0.6, 0.6, 0.03, 12).scale(1, 1, 1.3), 0, -0.1, 0.05), COL.teal), { noCast: true });
  const g = named(kit, 'moonSled', 'moon:sled');
  if (lite) g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.userData.noCast = true; } });
  return g;
}

/** drawLamps(M, { lite }) -> Group of two meshes: the posts (lit) and the lamp balls (unlit), every one a lamp along the lane's outer edges. */
export function drawLamps(M = moonMaterials(), { lite = false } = {}) {
  const kit = createKit('moonSL');
  LAMPS.forEach((l, i) => {
    if (lite && i % 2) return;
    kit.put('paint', M.paint, paint(at(cyl(0.035, 0.05, 0.62, 4), l.x, l.z, 0.31), COL.post), { noCast: true });
    kit.put('glow', M.glow, paint(at(new THREE.SphereGeometry(0.09, 5, 4), l.x, l.z, 0.68), COL.lamp), { noCast: true });
  });
  return named(kit, 'moonSL', 'moon:sledlamps', true);
}
