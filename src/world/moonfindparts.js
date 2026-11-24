// =============================================================================
// THE MOON: THE FINDS' DRAWING KIT (milestone 4). Earthrise Rock (a three-ledge climb on the ridge's south flank, golden mouse 2 on
// its top), the Sample Pit's rock (mouse 3 hides behind it), the Great Bowl's golden wedge (the Moon Cheese), the Echo Crater's ring of
// studs and the Quiet Plain's four lamp posts. Gathered into the same material buckets as the rest of the place (one merged mesh per
// material, no mesh of its own). Chunk code. No random number, no clock: every number is moonplan.js's.
// =============================================================================

import * as THREE from 'three';
import * as P from './moonplan.js';
import { COL, paint, at, box, cyl } from './moonparts.js';
import { BASE_COL } from './moonbase.js';

export const FIND_COL = Object.freeze({ cheese: 0xf5c542, hole: 0xc89a24, stud: 0xdff4ff, post: 0x9aa3b0 });

// A rock ledge: a stone drum rooted 0.6 m under the dust, a paler cap, and a few loose stones at its foot.
function drawLedges(kit, M) {
  for (const p of P.ROCK_LEDGES) {
    const g = P.moonY(p.x, p.z);
    kit.put('stone', M.stone, paint(new THREE.CylinderGeometry(p.r * 0.86, p.r * 1.15, p.y + 0.6, 9).translate(p.x, g + (p.y - 0.6) / 2, p.z), BASE_COL.stone));
    kit.put('stone', M.stone, paint(new THREE.CylinderGeometry(p.r * 0.95, p.r * 0.86, 0.28, 9).translate(p.x, g + p.y - 0.1, p.z), BASE_COL.stoneTop));
    for (let i = 0; i < 2; i++) {
      const a = i * 2.6 + p.z;
      kit.put('stone', M.stone, paint(at(new THREE.DodecahedronGeometry(0.34 + 0.1 * i, 0), p.x + Math.cos(a) * (p.r + 0.5), p.z + Math.sin(a) * (p.r + 0.5), 0.2), BASE_COL.stone));
    }
  }
}

// The Sample Pit's rock, standing between the mouse and the way the walk arrives (south-west).
function drawPitRock(kit, M) {
  const r = P.PIT_ROCK;
  kit.put('stone', M.stone, paint(at(new THREE.DodecahedronGeometry(r.r * 0.95, 0).scale(1, 0.9, 1.1), r.x, r.z, r.r * 0.45, 0.6), COL.rock));
  kit.put('stone', M.stone, paint(at(new THREE.DodecahedronGeometry(0.42, 0), r.x - 0.9, r.z + 0.8, 0.2, 1.1), COL.rock));
}

// The wedge: a gold slice of moon cheese lying on its side (a thick triangle), three darker holes in its top, a faint column of light over it.
const SLICE = 0.4;
function wedgeGeometry() {
  const shape = new THREE.Shape([new THREE.Vector2(-0.55, -0.32), new THREE.Vector2(0.55, -0.32), new THREE.Vector2(-0.55, 0.38)]);
  return new THREE.ExtrudeGeometry(shape, { depth: SLICE, bevelEnabled: false, curveSegments: 1 }).translate(0, 0, -SLICE / 2).rotateX(-Math.PI / 2);
}
function drawCheese(kit, M) {
  const { x, z } = P.CHEESE;
  kit.put('glow', M.glow, paint(at(wedgeGeometry(), x, z, SLICE / 2 + 0.02, 0.5), FIND_COL.cheese), { noCast: true });
  [[0.1, 0.2, 0.09], [-0.3, 0.1, 0.07], [-0.4, -0.1, 0.05]].forEach(([dx, dz, r]) => {
    kit.put('glow', M.glow, paint(at(new THREE.CylinderGeometry(r, r, 0.04, 6).translate(dx, 0, dz), x, z, SLICE + 0.03, 0.5), FIND_COL.hole), { noCast: true });
  });
  // a faint column of light so the wedge shows from the rim (the gate ring's own transparent bucket)
  kit.put('shaft', M.shaft, paint(at(cyl(0.7, 0.7, 4.5, 14, true), x, z, 2.25), 0xffd987), { noCast: true });
}

// The Echo Crater's middle: twelve small pale studs round a 2.6 m ring, so she knows where to stand.
function drawEcho(kit, M) {
  const { x, z } = P.ECHO;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    kit.put('glow', M.glow, paint(at(new THREE.ConeGeometry(0.1, 0.14, 5), x + Math.cos(a) * 2.6, z + Math.sin(a) * 2.6, 0.07), FIND_COL.stud), { noCast: true });
  }
}

// The Quiet Plain's four posts: a slim post and a small cool lamp, set 0.8 m outside the plain's corners.
function drawPlainPosts(kit, M) {
  for (const p of P.PLAIN_POSTS) {
    kit.put('paint', M.paint, paint(at(cyl(0.04, 0.06, 1.6, 6), p.x, p.z, 0.8), FIND_COL.post));
    kit.put('glow', M.glow, paint(at(new THREE.SphereGeometry(0.12, 8, 6), p.x, p.z, 1.7), COL.ring), { noCast: true });
  }
}

export function drawFinds(kit, M) {
  drawLedges(kit, M);
  drawPitRock(kit, M);
  drawCheese(kit, M);
  drawEcho(kit, M);
  drawPlainPosts(kit, M);
}
