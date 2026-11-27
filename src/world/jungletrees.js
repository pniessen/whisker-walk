// =============================================================================
// THE JUNGLE LODGE: TREE SHAPES (round two, from the owner's live play). The tall emergent with its buttressed roots and umbrella crown, the leaning trunk, the forked limbs with two
// crowns, the dead snag (bare limbs, a broken top) and the palms (a bending trunk and a fan of drooping fronds), beside the plain broad tree. jungleplan.js gives every tree inside the walk
// its `shape`, `tall` (a height factor) and `top`; the green wall at the edge (rim) keeps the plain look. Pure geometry and no random number: every number is the tree's own. Merged into
// the area's buckets by jungleparts.js; trunks keep the old collider radius (the roots and limbs are the picture, not the wall).
// =============================================================================
import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _q = new THREE.Quaternion();

/** A tapered limb from (ax, ay, az) to (bx, by, bz): radius r0 at the start, r1 at the end. */
export function limb(ax, ay, az, bx, by, bz, r0, r1, seg = 5) {
  _a.set(ax, ay, az);
  _b.set(bx - ax, by - ay, bz - az);
  const len = _b.length();
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1).translate(0, len / 2, 0);
  g.applyQuaternion(_q.setFromUnitVectors(UP, _b.normalize()));
  return g.translate(_a.x, _a.y, _a.z);
}
const lump = (r, x, y, z, sy = 0.75) => new THREE.IcosahedronGeometry(r, 0).scale(1, sy, 1).translate(x, y, z);
const flare = (s, h, a, w = 0.2) => new THREE.ConeGeometry(w * s, h, 4).scale(1, 1, 0.45).translate(0, h / 2, 0).rotateZ(1.18).rotateY(a); // a buttress, a flat fin leaning out from the foot

/** The parts of a tree: [geometry, colour] pairs. Colours are named by the caller's palette. */
export function shapedTreeParts(k, C) {
  const s = k.s;
  const T = (k.tall ?? 1);
  const parts = [];
  const trunk = (r0, r1, h) => parts.push([new THREE.CylinderGeometry(r1 * s, r0 * s, h * s, 6, 1).translate(0, (h * s) / 2, 0), C.trunk]);
  switch (k.shape) {
    case 'emergent': {
      const H = 8.2 * T;
      trunk(0.42, 0.24, H);
      for (let i = 0; i < 5; i++) parts.push([flare(s, 2.6 * s, (i / 5) * 6.28 + k.x, 0.34), C.trunk]); // buttressed roots
      parts.push([limb(0, H * s * 0.8, 0, 1.6 * s, H * s * 0.92, 0.6 * s, 0.1 * s, 0.05 * s), C.trunk]);
      parts.push([lump(2.9 * s, 0, (H + 1.3) * s, 0, 0.42), C.leafLight]); // an umbrella crown, wide and flat
      parts.push([lump(2.1 * s, 1.9 * s, (H + 0.7) * s, 0.9 * s, 0.5), C.leaf]);
      parts.push([lump(1.9 * s, -1.8 * s, (H + 0.5) * s, -0.8 * s, 0.5), C.leafDeep]);
      break;
    }
    case 'lean': {
      const H = 4.4 * T;
      const dx = 1.5 * s; const dz = 0.5 * s;
      parts.push([limb(0, 0, 0, dx, H * s, dz, 0.34 * s, 0.2 * s), C.trunk]);
      parts.push([limb(dx * 0.55, H * s * 0.55, dz * 0.55, dx - 1.6 * s, H * s * 0.9, dz + 0.6 * s, 0.1 * s, 0.05 * s), C.trunk]);
      parts.push([lump(2.2 * s, dx, (H + 0.8) * s, dz), C.leafLight]);
      parts.push([lump(1.6 * s, dx + 1.4 * s, (H + 0.2) * s, dz - 0.5 * s), C.leaf]);
      parts.push([lump(1.3 * s, dx - 1.8 * s, (H + 0.5) * s, dz + 0.7 * s), C.leafDeep]);
      parts.push([flare(s, 1.1 * s, k.x, 0.18), C.trunk]);
      break;
    }
    case 'fork': {
      const H = 3.4 * T;
      trunk(0.36, 0.26, H);
      parts.push([limb(0, H * s, 0, -1.7 * s, (H + 2.5) * s, 0.3 * s, 0.22 * s, 0.12 * s), C.trunk]);
      parts.push([limb(0, H * s, 0, 1.6 * s, (H + 2.1) * s, -0.4 * s, 0.2 * s, 0.1 * s), C.trunk]);
      parts.push([lump(1.9 * s, -1.9 * s, (H + 2.9) * s, 0.3 * s), C.leaf]);
      parts.push([lump(2.0 * s, 1.8 * s, (H + 2.5) * s, -0.4 * s), C.leafLight]);
      parts.push([lump(1.1 * s, 0, (H + 3.2) * s, 0.2 * s), C.leafDeep]);
      break;
    }
    case 'snag': { // dead: grey wood, a broken top, bare limbs, a bracket fungus and a little moss
      const H = 4.8 * T;
      const dead = C.dead;
      parts.push([new THREE.CylinderGeometry(0.12 * s, 0.3 * s, H * s, 6, 1).translate(0, (H * s) / 2, 0), dead]);
      parts.push([new THREE.ConeGeometry(0.12 * s, 0.7 * s, 5).translate(0, (H + 0.35) * s, 0).rotateZ(0.25), dead]); // the broken point
      for (let i = 0; i < 3; i++) {
        const a = k.x + i * 2.1;
        parts.push([limb(0, (H * (0.55 + i * 0.12)) * s, 0, Math.cos(a) * 1.5 * s, (H * (0.7 + i * 0.12) + 0.9) * s, Math.sin(a) * 1.5 * s, 0.07 * s, 0.025 * s, 4), dead]);
        parts.push([limb(Math.cos(a) * 0.75 * s, (H * (0.62 + i * 0.12) + 0.4) * s, Math.sin(a) * 0.75 * s, Math.cos(a + 0.6) * 1.5 * s, (H * (0.7 + i * 0.12) + 1.5) * s, Math.sin(a + 0.6) * 1.5 * s, 0.035 * s, 0.015 * s, 3), dead]);
      }
      parts.push([lump(0.26 * s, 0.28 * s, 1.5 * s, 0.05 * s, 0.5), C.fungus]);
      parts.push([lump(0.4 * s, -0.22 * s, 0.35 * s, 0.1 * s, 0.5), C.moss]);
      break;
    }
    case 'palm': {
      const fan = k.variant === 1;
      const H = (fan ? 5.4 : 6.8) * T; // the fan palm is shorter and bends further
      const bend = fan ? 1.3 : 0.6;
      let px = 0; let py = 0;
      for (let i = 0; i < 4; i++) { // the trunk: four rings of a slow bend
        const t = (i + 1) / 4;
        const nx = Math.sin(t * 1.2) * bend * s * t; const ny = H * s * t;
        parts.push([limb(px, py, 0, nx, ny, 0, (0.17 - i * 0.02) * s, (0.15 - i * 0.02) * s), C.trunk]);
        px = nx; py = ny;
      }
      const n = fan ? 10 : 7;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + k.x;
        const up = fan ? 0.5 + (i % 3) * 0.28 : 0.9;
        const seg1 = new THREE.ConeGeometry(0.3 * s, 1.9 * s, 4).scale(1, 1, 0.22).translate(0, 0.95 * s, 0).rotateZ(-up).rotateY(a);
        const tipX = Math.sin(up) * 1.9 * s; const tipY = Math.cos(up) * 1.9 * s;
        const seg2 = new THREE.ConeGeometry(0.22 * s, 1.5 * s, 4).scale(1, 1, 0.22).translate(0, 0.75 * s, 0).rotateZ(-up - 1.0).rotateY(0).translate(tipX, tipY, 0).rotateY(a);
        parts.push([seg1.translate(px, py, 0), i % 2 ? C.leaf : C.leafLight]);
        parts.push([seg2.translate(px, py, 0), i % 2 ? C.leafDeep : C.leaf]);
      }
      if (fan) for (let i = 0; i < 3; i++) parts.push([new THREE.IcosahedronGeometry(0.16 * s, 0).translate(px + Math.cos(i * 2.1) * 0.22 * s, py - 0.2 * s, Math.sin(i * 2.1) * 0.22 * s), C.nut]);
      break;
    }
    default: { // broad: the plain tree, now with its own height
      const H = 5 * T;
      trunk(0.34, 0.2, H);
      [[0, H + 0.8, 0, 2.3], [-1.2, H + 0.1, 0.6, 1.8], [1.3, H + 0.3, -0.5, 1.9]].forEach(([lx, ly, lz, r], i) => parts.push([lump(r * s, lx * s, ly * s, lz * s), i === 0 ? C.leafLight : i === 1 ? C.leaf : C.leafDeep]));
    }
  }
  return parts;
}
