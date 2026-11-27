// =============================================================================
// SNOWVILLE: THE SKI SLOPE, DRAWN (round three). All of it static and merged into the kit's buckets at build (no mesh of its own, no caster of its own):
//   the PISTE    a wide packed-snow ribbon down the hill's west flank with two faint groove lines (vertex colour only; in the non-casting bucket), a bright Finish strip across its foot;
//   the MARKS    green stakes on its left edge and blue on its right, a little flag on each;
//   the GATES    six pairs of flags across the line, red and blue in turn, a thin bar between each pair;
//   the TOP      the gate arch (two stakes and a string of pennants), the rack (a frame with three pairs of skis and their poles leaning on it), the bench with the goggles lying on it;
//   the FOOT     the Finish flag.
// The skis ON her feet are the live's one small moving mesh (buildSkis below, in the same chunk, never start-up). No random number, no clock.
// =============================================================================
import * as THREE from 'three';
import * as K from './snowvilleskisplan.js';
import { COL, paint, stand, box, cyl } from './snowvilleparts.js';
import { meshY } from './snowvillesledparts.js';

export const SKI_COL = Object.freeze({ piste: 0xeef3fb, groove: 0xcddcf0, edge: 0xb4c7e2, finish: 0xd9e4f5, green: 0x2f9a5a, blue: 0x2f6fc8, red: 0xc8483f, pole: 0x5a4a3c, skiA: 0xc8483f, skiB: 0x2f6fc8, skiC: 0xe8b53a, iron: 0x3a3f4a, strap: 0x2f6fc8, lens: 0xf2a93c, pennant: 0xe8b53a, cream: 0xf5ecd4 });
const SKI_PAIRS = [SKI_COL.skiA, SKI_COL.skiB, SKI_COL.skiC];

// ---- the piste ------------------------------------------------------------------------------------------------------------------------------------
const HALF = 2.1; // the packed piste's half width: a little wider than the lane
function ribbon() {
  const n = Math.max(8, Math.round(K.SKI_LEN / 0.7));
  const pos = []; const col = []; const idx = [];
  const c = new THREE.Color();
  const cols = [[-HALF, SKI_COL.edge], [-1.5, SKI_COL.piste], [-0.45, SKI_COL.groove], [0.45, SKI_COL.groove], [1.5, SKI_COL.piste], [HALF, SKI_COL.edge]];
  for (let i = 0; i <= n; i++) {
    const s = (K.SKI_LEN * i) / n;
    const finish = s > K.SKI_LEN - 1.3;
    for (const [lat, hex] of cols) {
      const p = K.skiPos(s, lat);
      pos.push(p.x, meshY(p.x, p.z) + 0.04, p.z);
      c.setHex(finish ? SKI_COL.finish : hex); col.push(c.r, c.g, c.b);
    }
  }
  const W = cols.length;
  for (let i = 0; i < n; i++) for (let k = 0; k < W - 1; k++) { const a = i * W + k; idx.push(a, a + 1, a + W, a + 1, a + W + 1, a + W); } // (counter-clockwise from above: the path's right is (-cos h, sin h))
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// A stake with a flag: the pole (four-sided), a three-sided flag pointing along `yaw`'s +x. `hex` is the flag's colour.
const pole = (x, z, h, hex) => paint(stand(cyl(0.03, 0.04, h, 4), x, z, h / 2), hex);
const flag = (x, z, h, yaw, hex) => paint(stand(new THREE.ConeGeometry(0.11, 0.3, 3).rotateZ(-Math.PI / 2).translate(0.13, 0, 0), x, z, h, yaw), hex);

export function drawSkis(kit, M) {
  const g = ribbon().toNonIndexed();
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  kit.put('treeBack', M.paint, g, { noCast: true });
  const put = (geo) => kit.put('paint', M.paint, geo);
  // the marked line: green on the left, blue on the right (right is (-cos h, sin h))
  for (const k of K.MARKS) {
    const hex = k.side < 0 ? SKI_COL.green : SKI_COL.blue;
    put(pole(k.x, k.z, 1.0, hex));
    put(flag(k.x, k.z, 0.9, k.side < 0 ? 0 : Math.PI, hex));
  }
  // the six gates: two poles across the line a gate's width apart, a thin bar between, a flag on each pole
  for (const gt of K.GATES) {
    const hex = gt.i % 2 ? SKI_COL.blue : SKI_COL.red;
    const rx = -Math.cos(gt.heading); const rz = Math.sin(gt.heading);
    const cx = gt.x - rx * 0; const cz = gt.z - rz * 0;
    const a = [cx + rx * K.GATE_TOL, cz + rz * K.GATE_TOL]; const b = [cx - rx * K.GATE_TOL, cz - rz * K.GATE_TOL];
    for (const [px, pz] of [a, b]) { put(pole(px, pz, 1.05, hex)); put(flag(px, pz, 0.95, gt.heading + Math.PI / 2, hex)); }
    put(paint(stand(box(K.GATE_TOL * 2, 0.025, 0.025), cx, cz, 1.0, gt.heading + Math.PI), SKI_COL.cream));
  }
  // the gate arch: two stakes across the start and a string of pennants between them
  const L = K.ARCH.left; const R = K.ARCH.right;
  put(paint(stand(cyl(0.05, 0.06, 2.3, 4), L.x, L.z, 1.15), COL.wood));
  put(paint(stand(cyl(0.05, 0.06, 2.3, 4), R.x, R.z, 1.15), COL.wood));
  const heading = K.skiPos(K.ARCH.s).heading;
  const across = Math.hypot(R.x - L.x, R.z - L.z);
  put(paint(stand(box(across, 0.04, 0.04), (L.x + R.x) / 2, (L.z + R.z) / 2, 2.1, heading + Math.PI), COL.woodDark));
  for (let i = 0; i < 7; i++) {
    const t = (i + 0.5) / 7;
    const x = L.x + (R.x - L.x) * t; const z = L.z + (R.z - L.z) * t;
    put(paint(stand(new THREE.ConeGeometry(0.09, 0.26, 3).rotateX(Math.PI), x, z, 1.95), i % 2 ? SKI_COL.red : i % 3 ? SKI_COL.pennant : SKI_COL.blue));
  }
  // the rack: a frame of two posts, a top beam and a low rail, three pairs of skis leaning on the beam and a pair of poles by each
  const { x: rx0, z: rz0, yaw } = K.RACK;
  const loc = (lx, lz) => [rx0 + lx * Math.cos(yaw) + lz * Math.sin(yaw), rz0 - lx * Math.sin(yaw) + lz * Math.cos(yaw)];
  for (const sx of [-0.62, 0.62]) { const [px, pz] = loc(sx, 0); put(paint(stand(cyl(0.04, 0.05, 1.2, 4), px, pz, 0.6), COL.wood)); }
  { const [px, pz] = loc(0, 0); put(paint(stand(box(1.4, 0.07, 0.09), px, pz, 1.15, yaw), COL.woodDark)); put(paint(stand(box(1.3, 0.05, 0.07), px, pz, 0.35, yaw), COL.woodDark)); }
  SKI_PAIRS.forEach((hex, i) => {
    for (const d of [-1, 1]) {
      const [px, pz] = loc(-0.4 + i * 0.4 + d * 0.06, -0.28);
      put(paint(stand(box(0.07, 1.55, 0.02).rotateX(0.2), px, pz, 0.74, yaw), hex)); // a ski, standing on its tail, leaning back on the beam
      const [qx, qz] = loc(-0.34 + i * 0.4 + d * 0.06, -0.14);
      put(paint(stand(cyl(0.012, 0.012, 1.1, 4).rotateX(-0.12), qx, qz, 0.56, yaw), SKI_COL.pole));
    }
  });
  // the bench beside it: a seat, two legs, and the goggles lying on it (two lenses on a strap)
  const { x: bx, z: bz, yaw: by } = K.BENCH;
  put(paint(stand(box(1.2, 0.07, 0.4), bx, bz, 0.45, by), COL.wood));
  for (const sx of [-0.5, 0.5]) { const [px, pz] = [bx + sx * Math.cos(by), bz - sx * Math.sin(by)]; put(paint(stand(box(0.07, 0.42, 0.34), px, pz, 0.21, by), COL.woodDark)); }
  for (const sx of [-0.07, 0.07]) { const [px, pz] = [bx + sx * Math.cos(by), bz - sx * Math.sin(by)]; put(paint(stand(cyl(0.05, 0.05, 0.03, 6), px, pz, 0.505, by), SKI_COL.lens)); }
  put(paint(stand(box(0.3, 0.012, 0.035), bx, bz, 0.485, by), SKI_COL.strap));
  // the Finish flag at the foot, on the right of the line: a pole and a cream and blue flag
  const F = K.FINISH_FLAG;
  put(paint(stand(cyl(0.04, 0.05, 2.0, 4), F.x, F.z, 1.0), COL.wood));
  put(paint(stand(box(0.62, 0.34, 0.02), F.x + 0.31 * Math.cos(F.yaw), F.z - 0.31 * Math.sin(F.yaw), 1.78, F.yaw), SKI_COL.cream));
  put(paint(stand(box(0.62, 0.1, 0.03), F.x + 0.31 * Math.cos(F.yaw), F.z - 0.31 * Math.sin(F.yaw), 1.78, F.yaw), SKI_COL.blue));
}
