// =============================================================================
// THE JUNGLE LODGE: LIVED-IN PROPS (round two, from the owner's live play). Hammocks, baskets, crates, a drying rack, a water barrel, a rope bridge with its hand-lines, and stepping stones
// with moss: the clutter that says people live here. The places are written down (PROPS) and every one is clear of the story's places, the river and the trees (test/jungleplace.test.js);
// the solid ones (crates, barrel, rack) are small colliders added by jungleplan.js's caller (propColliders) and the rest are soft. Pure data, then drawing in stage b's merged buckets: no mesh of
// its own, no random number, nothing that moves.
// =============================================================================
import * as THREE from 'three';
import * as P from './jungleplan.js';
import { COL, paint } from './jungleparts.js';
import { limb } from './jungletrees.js';

// { kind, x, z, yaw, r (its footprint), solid }
const PR = (kind, x, z, yaw, r, solid = false) => Object.freeze({ kind, x, z, yaw, r, solid });
export const PROPS = Object.freeze([
  PR('barrel', -14.9, 12.2, 0, 0.5, true), PR('crates', -14.8, 14.2, 0.3, 0.7, true), PR('basket', -15.2, 15.9, 0, 0.35), PR('basket', -14.3, 16.3, 0.5, 0.3),
  PR('rack', -16.8, 21.6, 0.15, 1.2, true), PR('hammock', 3.4, 14.5, Math.PI / 2, 1.8),
  PR('crates', 3.1, 20.4, -0.2, 0.7, true), PR('basket', 2.2, 18.8, 0.2, 0.3), PR('pots', 4.4, 12.0, 0, 0.5),
  PR('basket', -21.2, 3.6, 0, 0.35), PR('barrel', -27, 13.8, 0, 0.5, true), PR('crates', 22.5, 7.5, 0.6, 0.7, true), PR('basket', 23.7, 8.8, 0, 0.3),
]);
export const propColliders = () => PROPS.filter((p) => p.solid).map((p) => Object.freeze({ x: p.x, z: p.z, r: Math.min(p.r, 0.6) }));

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, seg = 7) => new THREE.CylinderGeometry(rt, rb, h, seg, 1);

/** One prop's pieces at the origin: [geometry, colour, jitter]. */
export function propParts(p) {
  const out = [];
  switch (p.kind) {
    case 'barrel': {
      out.push([cyl(0.38, 0.38, 0.9, 9).translate(0, 0.45, 0), 0x8a6238, 0]);
      for (const y of [0.18, 0.72]) out.push([cyl(0.405, 0.405, 0.05, 9).translate(0, y, 0), 0x4a4a46, 0]);
      out.push([cyl(0.34, 0.34, 0.04, 9).translate(0, 0.9, 0), 0x6a8aa0, 0]); // the water
      out.push([box(0.5, 0.05, 0.1).translate(0, 0.95, 0.2), COL.woodDark, 0]); // a ladle across
      break;
    }
    case 'crates': {
      out.push([box(0.8, 0.6, 0.8).translate(0, 0.3, 0), 0xb08850, 0]);
      for (const y of [0.15, 0.45]) out.push([box(0.84, 0.05, 0.84).translate(0, y, 0), COL.woodDark, 1]);
      out.push([box(0.6, 0.5, 0.6).translate(0.05, 0.85, 0.05).rotateY(0.4), 0xa07a46, 1]);
      out.push([new THREE.IcosahedronGeometry(0.18, 0).translate(0.15, 1.15, 0), 0xffb02e, 2]); // a mango on top
      break;
    }
    case 'basket': {
      out.push([new THREE.CylinderGeometry(0.28, 0.2, 0.34, 8, 1, true).translate(0, 0.17, 0), 0xc8a060, 0]);
      out.push([cyl(0.2, 0.2, 0.03, 8).translate(0, 0.02, 0), 0xa88040, 0]);
      for (let i = 0; i < 4; i++) out.push([new THREE.IcosahedronGeometry(0.1, 0).translate(Math.cos(i * 1.6) * 0.1, 0.34, Math.sin(i * 1.6) * 0.1), [0xffb02e, 0x9ac040, 0xf0508a, 0xffd23c][i], i]);
      break;
    }
    case 'rack': { // an A-frame with two cross-poles, and cloth and leaves hung to dry
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) out.push([limb(sx * 1.1, 0, sz * 0.4, sx * 1.0, 1.7, 0, 0.05, 0.04, 5), COL.woodDark, 0]);
      for (const y of [1.0, 1.7]) out.push([cyl(0.035, 0.035, 2.2, 5).rotateZ(Math.PI / 2).translate(0, y, 0), COL.wood, 0]);
      for (let i = 0; i < 5; i++) { // pass 4: painted gourds on strings, each a bulb and a neck (the same twelve triangles the cloth strip had)
        const gx = -0.8 + i * 0.4; const gy = 1.12 - (i % 2) * 0.1;
        out.push([new THREE.OctahedronGeometry(0.2, 0).scale(0.9, 1.1, 0.9).translate(gx, gy, 0.02), [0xe8402c, 0x2fb8a8, 0xffc22a, 0xb04aff, 0xff7ad0][i], i]);
        out.push([new THREE.ConeGeometry(0.06, 0.2, 4, 1, true).translate(gx, gy + 0.3, 0.02), [0xffd21a, 0xfaf4e0, 0xe8402c, 0xffd21a, 0x2fb8a8][i], 0]);
      }
      break;
    }
    case 'pots': {
      for (let i = 0; i < 3; i++) {
        out.push([new THREE.CylinderGeometry(0.2 - i * 0.03, 0.14, 0.3 + i * 0.05, 7).translate(Math.cos(i * 2.2) * 0.3, 0.17, Math.sin(i * 2.2) * 0.3), 0xb4643c, i]);
        out.push([new THREE.SphereGeometry(0.2 - i * 0.03, 6, 4).scale(1, 0.6, 1).translate(Math.cos(i * 2.2) * 0.3, 0.36, Math.sin(i * 2.2) * 0.3), COL.leaf, i]);
      }
      break;
    }
    case 'hammock': { // two posts and a sagging bed of cloth between them; yaw 0 runs along x
      const half = p.r;
      for (const sx of [-1, 1]) {
        out.push([limb(sx * half, 0, 0, sx * half, 1.9, 0, 0.09, 0.07), COL.woodDark, 0]);
        out.push([limb(sx * (half + 0.4), 0, 0, sx * half, 1.7, 0, 0.04, 0.04, 4), COL.wood, 1]); // a brace
      }
      const N = 8;
      for (let i = 0; i < N; i++) {
        const t0 = i / N; const t1 = (i + 1) / N;
        const x0 = -half + 2 * half * t0; const x1 = -half + 2 * half * t1;
        const y0 = 1.55 - Math.sin(t0 * Math.PI) * 0.65; const y1 = 1.55 - Math.sin(t1 * Math.PI) * 0.65;
        const len = Math.hypot(x1 - x0, y1 - y0);
        out.push([box(len + 0.02, 0.05, 0.62).rotateZ(Math.atan2(y1 - y0, x1 - x0)).translate((x0 + x1) / 2, (y0 + y1) / 2, 0), i % 2 ? 0xd88a4a : 0xe8c880, i]);
      }
      out.push([box(0.5, 0.1, 0.64).translate(-half * 0.55, 1.06, 0), 0xc8302c, 0]); // pass 4: a book left face-down on the cloth (red cover) with a pale page edge
      out.push([new THREE.PlaneGeometry(0.44, 0.58).rotateX(-Math.PI / 2).translate(-half * 0.55, 1.112, 0), 0xf6ecd0, 0]);
      break;
    }
    default:
  }
  return out;
}

export function drawProps(kit, M) {
  const soft = { noCast: true };
  PROPS.forEach((p) => {
    for (const [geo, hex, j] of propParts(p)) {
      geo.rotateY(p.yaw).translate(p.x, P.jungleY(p.x, p.z), p.z);
      kit.put('paint', M.paint, paint(geo, hex, j), p.solid ? {} : soft);
    }
  });
  // the log bridge's other rail: a second pair of posts and two rope hand-lines the length of the log with a knot at every post, a rope along the log's side and a few stones set at each end
  const B = P.LOG_BRIDGE; const g0 = P.jungleY(B.x, B.z);
  for (const sz of [-1, 1]) {
    kit.put('paint', M.paint, paint(limb(B.x - 0.75, g0, B.z + sz * (B.len / 2 - 0.5), B.x - 0.75, g0 + 1.3, B.z + sz * (B.len / 2 - 0.5), 0.06, 0.05, 5), COL.woodDark));
  }
  for (const sx of [-0.75, 0.75]) {
    kit.put('paint', M.paint, paint(limb(B.x + sx, g0 + 1.15, B.z - (B.len / 2 - 0.5), B.x + sx, g0 + 0.95, B.z, 0.02, 0.02, 4), COL.rope), soft);
    kit.put('paint', M.paint, paint(limb(B.x + sx, g0 + 0.95, B.z, B.x + sx, g0 + 1.15, B.z + (B.len / 2 - 0.5), 0.02, 0.02, 4), COL.rope), soft);
    kit.put('paint', M.paint, paint(limb(B.x + sx, g0 + 1.0, B.z - 1, B.x + sx, g0 + 0.62, B.z - 1, 0.012, 0.012, 3), COL.rope), soft); // a drop-line to the log
    for (const sz of [-1, 1]) kit.put('paint', M.paint, paint(new THREE.IcosahedronGeometry(0.06, 0).translate(B.x + sx, g0 + 1.22, B.z + sz * (B.len / 2 - 0.5)), COL.rope), soft);
  }
  for (const sz of [-1, 1]) for (let i = 0; i < 3; i++) kit.put('paint', M.paint, paint(new THREE.DodecahedronGeometry(0.22 + 0.05 * i, 0).scale(1, 0.6, 1).translate(B.x - 1.1 + i * 1.1, g0 + 0.05, B.z + sz * (B.len / 2 + 0.55 + (i % 2) * 0.2)), COL.stone, i), soft);
  // the stepping stones: a moss cap on each and a few pebbles on the bank where the line begins
  P.STEPPING.forEach((s, i) => {
    kit.put('paint', M.paint, paint(new THREE.SphereGeometry(0.4, 6, 3).scale(1, 0.25, 1).translate(s.x + 0.05, P.jungleY(s.x, s.z) + 0.11, s.z), COL.moss, i), soft);
  });
  for (let i = 0; i < 5; i++) kit.put('paint', M.paint, paint(new THREE.DodecahedronGeometry(0.1 + 0.03 * (i % 3), 0).translate(-14.6 + i * 0.3, P.jungleY(-14.6, -2.6) + 0.05, -2.5 - (i % 2) * 0.3), COL.stone, i), soft);
}
