// =============================================================================
// THE REEF, WING B: THE DRAWING (milestone R5). The shallow cave (three boulders and a lintel slab with a little coral on it), the three lantern corals' stalks
// (their glowing orbs are the life's, world/reefhouse.js), the clumps of coral at three heights (low and middle ones merged into the kit's 'paint' bucket by
// material, the tall spires ONE InstancedMesh like the kelp), and a few sea-floor details by the cave. No real lights, no canvas, no rng of its own (every
// number is reefwing.js's seeded plan; the area builds in withLocalUuids).
// =============================================================================

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { litMaterial } from '../render/materials.js';
import { COL, STONES, paint, at, coralGeometry } from './reefparts.js';
import * as W from './reefwing.js';
import { inReefClear } from './reefplan.js';

const cyl = (rt, rb, h, seg = 6) => new THREE.CylinderGeometry(rt, rb, h, seg, 1);

export function drawCave(kit, M) {
  const C = W.CAVE;
  C.boulders.forEach((b, i) => {
    kit.put('paint', M.paint, paint(at(new THREE.DodecahedronGeometry(b.r, 0).scale(1.15, b.h / (b.r * 2), 1.05).translate(0, b.h / 2 - 0.2, 0), b.x, b.z, 0, i * 1.3), STONES[(i + 1) * 2 % 5]));
    kit.put('paint', M.paint, paint(at(new THREE.DodecahedronGeometry(b.r * 0.55, 0).translate(b.r * 0.8, b.r * 0.3, b.r * 0.4), b.x, b.z, 0, i), COL.stoneLight));
  });
  const L = C.lintel;
  kit.put('paint', M.paint, paint(at(new THREE.BoxGeometry(L.w, 0.5, L.d), L.x, L.z, L.y, 0, 0.02), COL.stone));
  kit.put('paint', M.paint, paint(at(new THREE.BoxGeometry(L.w - 0.5, 0.16, L.d + 0.1), L.x, L.z, L.y - 0.3), COL.stoneLight));
  // a little coral growing on the lintel, so the cave is the garden's own
  for (let i = 0; i < 6; i++) {
    const x = L.x - 2.2 + i * 0.9;
    kit.put('paint', M.paint, paint(at(cyl(0.05, 0.14, 0.4 + (i % 3) * 0.22, 6), x, L.z + 0.1, L.y + 0.45), COL.coral[i % 4]));
  }
  // a pale patch of sand glow on the cave floor under the shell (a flat disc, vertex-coloured: no light, no texture)
  kit.put('glow', M.glow, paint(at(new THREE.CircleGeometry(1.1, 10).rotateX(-Math.PI / 2), W.SHELL_THREE.x, W.SHELL_THREE.z, 0.03), 0xdff7ee), { noCast: true });
}

// The lantern corals' stalks: a thick fan of tube coral clusters each in its own colour, 3 m tall (the orb on top is the life's), a cup under the orb, and a
// wide soft disc of the lantern's colour on the sea floor round the foot so it can be seen from far across the garden (all in the kit's buckets; the disc
// does not cast).
const mix = (hex, to, k) => { const a = new THREE.Color(hex).lerp(new THREE.Color(to), k); return a.getHex(); };
export function drawLanternStalks(kit, M) {
  W.LANTERNS.forEach((l, i) => {
    const hue = COL.coral[i];
    const deep = COL.coralDeep[i];
    const glowHex = W.LANTERN_COLORS[i];
    // the floor disc: the lantern's own colour thinned out towards the sand, two rings so it fades at the edge (a few triangles each)
    kit.put('glow', M.glow, paint(at(new THREE.CircleGeometry(2.3, 8).rotateX(-Math.PI / 2), l.x, l.z, 0.035), mix(glowHex, 0xecd9a0, 0.78)), { noCast: true });
    kit.put('glow', M.glow, paint(at(new THREE.CircleGeometry(1.3, 8).rotateX(-Math.PI / 2), l.x, l.z, 0.045), mix(glowHex, 0xecd9a0, 0.5)), { noCast: true });
    // the main spire runs right up to the orb, a flared cup holds the orb on top, two shorter tubes lean beside it, a low mound makes the foot
    // (the same number of triangles the old three thin tubes and cap had: the Reef's row is tight)
    kit.put('paint', M.paint, paint(at(cyl(0.14, 0.27, l.h, 6).translate(0, l.h / 2, 0), l.x, l.z, 0), hue));
    kit.put('paint', M.paint, paint(at(cyl(0.36, 0.14, 0.3, 6).translate(0, l.h + 0.05, 0), l.x, l.z, 0), deep));
    for (let b = 0; b < 2; b++) {
      const a = b * 3.1 + i;
      const h = l.h * (0.55 + 0.2 * b);
      kit.put('paint', M.paint, paint(at(new THREE.CylinderGeometry(0.07, 0.2, h, 5, 1, true).translate(0, h / 2, 0), l.x + Math.cos(a) * 0.3, l.z + Math.sin(a) * 0.3, 0), b ? hue : deep));
    }
    kit.put('paint', M.paint, paint(at(new THREE.SphereGeometry(0.6, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.5, 1), l.x, l.z, 0), deep));
  });
}

// The clumps: the low and the middle ones (brain, rock, branch, fan, tube) through the same geometry the first coral uses.
export function drawWingClumps(kit, M) {
  W.scatterWingAll().filter((k) => k.h < 3).forEach((k, i) => { if (inReefClear(k.x, k.z, k.s)) return; for (const g of coralGeometry(k, i + 100)) kit.put('paint', M.paint, g, { noCast: k.s < 0.7 }); });
}

// The tall spires: one cluster of three tubes (height 1, scaled by the instance), the colour from the instance (white vertex colours).
export function spireGeometry() {
  const parts = [];
  [[0, 0, 1, 0.1, 0.24], [0.28, 0.12, 0.74, 0.08, 0.19], [-0.2, -0.22, 0.55, 0.07, 0.16]].forEach(([x, z, h, rt, rb]) => {
    parts.push(paint(cyl(rt, rb, h, 6).translate(x, h / 2, z), 0xffffff));
    parts.push(paint(new THREE.CircleGeometry(rt * 0.9, 6).rotateX(-Math.PI / 2).translate(x, h + 0.005, z), 0xcfd8d4));
  });
  return mergeGeometries(parts);
}

export function drawSpires() {
  const list = W.wingSpires();
  const mesh = new THREE.InstancedMesh(spireGeometry(), litMaterial(0xffffff, { vertexColors: true, roughness: 0.75 }), Math.max(1, list.length));
  mesh.name = 'reef:spires';
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const eu = new THREE.Euler();
  const pos = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const tint = new THREE.Color();
  list.forEach((k, i) => {
    eu.set(0, k.yaw, 0);
    q.setFromEuler(eu);
    pos.set(k.x, W.spireBaseY(k), k.z);
    const w = k.s * 1.5;
    sc.set(w, W.spireHeight(k.s), w);
    m4.compose(pos, q, sc);
    mesh.setMatrixAt(i, m4);
    tint.setHex(COL.coral[k.hue]);
    mesh.setColorAt(i, tint);
  });
  mesh.count = list.length;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  Object.assign(mesh.userData, { noCast: true, noContactShadow: true, noMerge: true });
  mesh.frustumCulled = false;
  return mesh;
}
