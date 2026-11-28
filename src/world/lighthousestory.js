// =============================================================================
// LIGHTHOUSE POINT: BEAUTY PASS FOUR, THE KEEPER'S LIFE IN THE DETAILS (2026-11-28). Little things that say somebody lives
// here and loves it, each readable from where the cat walks:
//
//   THE HARBOUR POST at the top of the arrival beach (the colour anchor of the first view): a post with a painted board
//   (a wave, a fish: pictures only, no letters), a red-and-white lifebuoy hung from it, and initials carved in its face;
//   THE KEEPER'S DRYING RACK by the sandcastle: silver fish with one smoked red one, and two striped socks;
//   A PATCHED SAIL propped on a mast beside the upturned boat (cream, three patches);
//   A SMALL SIGN at the pools with a painted crab; A LOGBOOK AND A SPYGLASS on the barrel;
//   BY THE COTTAGE DOOR the keeper's cat's food bowl and a patchwork blanket.
//
// All of it goes into the kit's EXISTING noCast buckets (wood, paint, boat, stone): no new mesh, no new caster, nothing
// to collide with and nothing to stand on (every piece is small or out of the walk's way). Boxes and flat shapes only, the
// undersides never drawn. The triangles it adds are paid for in lighthouseparts.js (the pool rim stones) and measured by the
// picture page.
// =============================================================================

import * as THREE from 'three';
import * as P from './lighthouseplan.js';
import { COL, paintBy, bx, bm, cy, sp } from './lighthouseparts.js';
import { Soup } from './lighthousebeauty.js';

const UP = [0, 1, 0];

// A flat quad (four corners in order) facing `n`: wound so the front is the side `n` points to.
function face(S, a, b, c, d, hex, n = [0, 0, 1], both = false) {
  const ux = b[0] - a[0]; const uy = b[1] - a[1]; const uz = b[2] - a[2];
  const vx = c[0] - a[0]; const vy = c[1] - a[1]; const vz = c[2] - a[2];
  const dot = (uy * vz - uz * vy) * n[0] + (uz * vx - ux * vz) * n[1] + (ux * vy - uy * vx) * n[2];
  const f = dot >= 0;
  const t = (p, q, r) => (f ? S.tri(p, q, r, hex, hex, hex, n) : S.tri(p, r, q, hex, hex, hex, n));
  t(a, b, c); t(a, c, d);
  if (both) { const m = [-n[0], -n[1], -n[2]]; (f ? S.tri(a, c, b, hex, hex, hex, m) : S.tri(a, b, c, hex, hex, hex, m)); (f ? S.tri(a, d, c, hex, hex, hex, m) : S.tri(a, c, d, hex, hex, hex, m)); }
}
// One triangle facing `n` (and the back too when `both`).
function tri1(S, a, b, c, hex, n = [0, 0, 1], both = false) {
  const dot = ((b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1])) * n[0] + ((b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2])) * n[1] + ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) * n[2];
  if (dot >= 0) S.tri(a, b, c, hex, hex, hex, n); else S.tri(a, c, b, hex, hex, hex, n);
  if (both) { const m = [-n[0], -n[1], -n[2]]; if (dot >= 0) S.tri(a, c, b, hex, hex, hex, m); else S.tri(a, b, c, hex, hex, hex, m); }
}

// ---- the harbour post ---------------------------------------------------------------------------------
const HX = 11.6; const HZ = 32.6;
// the board's geometry 1.3 times as large about its middle (HX + 0.7, 1.35, HZ); the post and the cormorant's perch do not move
const boardUp = (g) => { g.translate(-(HX + 0.7), -1.35, -HZ); g.scale(1.3, 1.3, 1.3); g.translate(HX + 0.7, 1.35, HZ); return g; };
function harbourPost(kit, M) {
  kit.put('wood', M.wood, [
    bx(HX - 0.07, HX + 0.07, 0, 1.95, HZ - 0.07, HZ + 0.07, COL.post),
    bx(HX + 1.33, HX + 1.47, 0, 1.55, HZ - 0.07, HZ + 0.07, COL.post),
  ], { noCast: true });
  // the board and its blue cap, bigger (pass 8: the arrival view's focal point; the same boxes, 1.3 times as large about the board's middle)
  kit.put('wood', M.wood, [
    boardUp(bx(HX + 0.07, HX + 1.33, 0.98, 1.72, HZ - 0.04, HZ + 0.04, 0xf4ecd2)), // the board
    boardUp(bx(HX + 0.07, HX + 1.33, 1.72, 1.77, HZ - 0.05, HZ + 0.05, 0x2f78c4)), // its blue cap
  ], { noCast: true });
  // the pictures, painted on the board's face (+z, toward the cove)
  const S = new Soup(); const z = HZ + 0.045; const n = [0, 0, 1];
  for (let k = 0; k < 3; k++) tri1(S, [HX + 0.2 + k * 0.17, 1.08, z], [HX + 0.285 + k * 0.17, 1.3, z], [HX + 0.37 + k * 0.17, 1.08, z], 0x2f78c4, n);
  face(S, [HX + 0.2, 1.0, z], [HX + 0.71, 1.0, z], [HX + 0.71, 1.07, z], [HX + 0.2, 1.07, z], 0x2f78c4, n);
  const fx = HX + 0.98; const fy = 1.44;
  face(S, [fx - 0.18, fy, z], [fx, fy + 0.11, z], [fx + 0.18, fy, z], [fx, fy - 0.11, z], 0xe0793c, n);
  tri1(S, [fx + 0.17, fy, z], [fx + 0.3, fy + 0.11, z], [fx + 0.3, fy - 0.11, z], 0xe0793c, n);
  face(S, [fx - 0.12, fy - 0.01, z + 0.002], [fx - 0.09, fy - 0.01, z + 0.002], [fx - 0.09, fy + 0.02, z + 0.002], [fx - 0.12, fy + 0.02, z + 0.002], 0x2a211b, n);
  kit.put('paint', M.paint, boardUp(S.geometry()), { noCast: true }); // (the pictures grow with the board; the carved initials below do not)
  const S2 = new Soup();
  // initials carved in the post's face: two strokes and a little heart between them
  const cz = HZ + 0.072; const hx = HX; const cc = 0x3a2a1c;
  face(S2, [hx - 0.04, 1.25, cz], [hx - 0.025, 1.25, cz], [hx - 0.025, 1.42, cz], [hx - 0.04, 1.42, cz], cc, n);
  face(S2, [hx + 0.025, 1.25, cz], [hx + 0.04, 1.25, cz], [hx + 0.04, 1.42, cz], [hx + 0.025, 1.42, cz], cc, n);
  face(S2, [hx, 1.3, cz], [hx + 0.016, 1.34, cz], [hx, 1.38, cz], [hx - 0.016, 1.34, cz], 0xa23a2c, n);
  kit.put('paint', M.paint, S2.geometry(), { noCast: true });
  // the lifebuoy on its rope: red and white by the quarter (pass 8: a third bigger, so it reads from the arrival)
  const bxc = HX - 0.5; const byc = 1.2;
  const ring = new THREE.TorusGeometry(0.36, 0.1, 4, 8).translate(bxc, byc, HZ + 0.1);
  kit.put('paint', M.paint, paintBy(ring, (x, y) => (Math.floor(((Math.atan2(y - byc, x - bxc) + Math.PI) / (Math.PI / 4)) % 8) % 2 ? 0xf2eee4 : COL.red)), { noCast: true });
  kit.put('wood', M.wood, bm(HX - 0.05, 1.9, HZ + 0.09, bxc, byc + 0.4, HZ + 0.1, 0.025, 0.025, COL.rope), { noCast: true });
}

// ---- the drying rack ----------------------------------------------------------------------------------
const RX = 23.6; const RZ = 30.6;
const rackUp = (g) => { g.translate(-RX, 0, -RZ); g.scale(1.25, 1.25, 1.25); g.translate(RX, 0, RZ); return g; }; // (pass 8: a quarter bigger, standing on the same ground)
function dryingRack(kit, M) {
  kit.put('wood', M.wood, [
    bx(RX - 1.25, RX - 1.15, 0, 1.7, RZ - 0.05, RZ + 0.05, COL.post),
    bx(RX + 1.15, RX + 1.25, 0, 1.7, RZ - 0.05, RZ + 0.05, COL.post),
    bm(RX - 1.28, 1.66, RZ, RX + 1.28, 1.66, RZ, 0.05, 0.05, COL.post),
  ].map(rackUp), { noCast: true });
  const S = new Soup();
  const tones = [0xaab6c0, 0xc4ced4, 0xaab6c0, 0xe0793c];
  tones.forEach((hex, i) => {
    const x = RX - 1.0 + i * 0.36; const z = RZ + 0.03;
    face(S, [x, 1.62, z], [x + 0.1, 1.4, z], [x, 1.1, z], [x - 0.1, 1.4, z], hex, [0, 0, 1], true);
    tri1(S, [x, 1.12, z], [x + 0.08, 0.98, z], [x - 0.08, 0.98, z], shade(hex), [0, 0, 1], true);
  });
  // two striped socks on the same rail
  [0.62, 0.98].forEach((dx, i) => {
    const x = RX + dx; const z = RZ + 0.03;
    for (let s = 0; s < 3; s++) face(S, [x - 0.06, 1.64 - s * 0.1, z], [x + 0.06, 1.64 - s * 0.1, z], [x + 0.06, 1.54 - s * 0.1, z], [x - 0.06, 1.54 - s * 0.1, z], (s + i) % 2 ? 0xf2eee4 : 0xc2402f, [0, 0, 1], true);
    face(S, [x - 0.06, 1.34, z], [x + 0.14, 1.34, z], [x + 0.14, 1.26, z], [x - 0.06, 1.26, z], 0xc2402f, [0, 0, 1], true); // the foot
  });
  kit.put('paint', M.paint, rackUp(S.geometry()), { noCast: true });
}
const shade = (hex) => new THREE.Color(hex).multiplyScalar(0.8).getHex();

// ---- the patched sail ---------------------------------------------------------------------------------
function patchedSail(kit, M) {
  const mx = 7.9; const mz = 31.3;
  kit.put('wood', M.wood, [
    cy(mx, mz, 0, 2.35, 0.03, 0.04, COL.post, 5),
    bm(mx, 0.6, mz, mx - 1.75, 0.72, mz - 0.25, 0.04, 0.04, COL.post),
  ], { noCast: true });
  const S = new Soup();
  const A = [mx, 2.25, mz]; const B = [mx, 0.64, mz]; const C = [mx - 1.7, 0.74, mz - 0.24];
  const n = [0, 0.14, 1];
  tri1(S, A, B, C, 0xeee3c6, n, true);
  const at = (u, v) => [A[0] + (B[0] - A[0]) * u + (C[0] - A[0]) * v, A[1] + (B[1] - A[1]) * u + (C[1] - A[1]) * v, A[2] + (B[2] - A[2]) * u + (C[2] - A[2]) * v];
  [[0.22, 0.16, 0xc2402f], [0.5, 0.2, 0x3a6ea5], [0.4, 0.38, 0xd9a93a]].forEach(([u, v, hex]) => {
    const pts = [at(u, v), at(u + 0.12, v), at(u + 0.12, v + 0.14), at(u, v + 0.14)];
    for (const o of [0.012, -0.012]) face(S, pts[0].map((q, k) => q + n[k] * o), pts[1].map((q, k) => q + n[k] * o), pts[2].map((q, k) => q + n[k] * o), pts[3].map((q, k) => q + n[k] * o), hex, o > 0 ? n : [-n[0], -n[1], -n[2]]);
  });
  kit.put('paint', M.paint, S.geometry(), { noCast: true });
}

// ---- the pool sign, the logbook and spyglass ------------------------------------------------------------
function poolSign(kit, M) {
  const x = 19.6; const z = 27.6;
  kit.put('wood', M.wood, [bx(x - 0.06, x + 0.06, 0, 1.25, z - 0.06, z + 0.06, COL.post), bx(x - 0.42, x + 0.42, 0.78, 1.22, z + 0.05, z + 0.09, 0xd9cfae)], { noCast: true });
  const S = new Soup(); const zz = z + 0.095; const n = [0, 0, 1];
  face(S, [x - 0.14, 0.95, zz], [x + 0.14, 0.95, zz], [x + 0.14, 1.05, zz], [x - 0.14, 1.05, zz], 0xd9663b, n); // a crab's shell
  tri1(S, [x - 0.14, 1.03, zz], [x - 0.3, 1.14, zz], [x - 0.2, 0.96, zz], 0xd9663b, n);
  tri1(S, [x + 0.14, 1.03, zz], [x + 0.3, 1.14, zz], [x + 0.2, 0.96, zz], 0xd9663b, n);
  kit.put('paint', M.paint, S.geometry(), { noCast: true });
}
function logbook(kit, M) {
  const x = 7.2; const z = 35.6; const y = 0.62; // the barrel's lid
  kit.put('paint', M.paint, [
    bx(x - 0.12, x + 0.1, y, y + 0.045, z - 0.08, z + 0.08, 0x7a2d24), // the logbook
    bx(x - 0.1, x + 0.09, y + 0.045, y + 0.055, z - 0.07, z + 0.07, 0xf0e6cc), // its pages
    bm(x - 0.1, y + 0.05, z + 0.2, x + 0.14, y + 0.05, z + 0.17, 0.045, 0.045, COL.brass), // the spyglass
    bm(x + 0.14, y + 0.05, z + 0.17, x + 0.22, y + 0.05, z + 0.16, 0.06, 0.06, 0x2a211b),
  ], { noCast: true });
}

// ---- by the cottage door and on the bench ---------------------------------------------------------------
function keepersThings(kit, M) {
  const Y = P.PLATEAU_Y;
  // the keeper's cat's bowl and a patchwork blanket by the door
  kit.put('paint', M.paint, [cy(-28.7, -4.7, Y, Y + 0.07, 0.11, 0.08, 0xc2402f, 7), cy(-28.7, -4.7, Y + 0.065, Y + 0.075, 0.075, 0.075, 0xd9b27a, 7)], { noCast: true });
  const S = new Soup(); const bx0 = -27.9; const bz0 = -4.1;
  [[0xc2402f, 0], [0x3a6ea5, 1], [0xd9a93a, 2], [0x6f9a45, 3]].forEach(([hex, k]) => {
    const u = k % 2; const v = k >> 1;
    face(S, [bx0 + u * 0.4, Y + 0.035, bz0 + v * 0.3], [bx0 + u * 0.4 + 0.4, Y + 0.035, bz0 + v * 0.3], [bx0 + u * 0.4 + 0.4, Y + 0.035, bz0 + v * 0.3 + 0.3], [bx0 + u * 0.4, Y + 0.035, bz0 + v * 0.3 + 0.3], hex, UP);
  });
  kit.put('paint', M.paint, S.geometry(), { noCast: true });
}

export function drawStory(kit, M) {
  harbourPost(kit, M);
  dryingRack(kit, M);
  patchedSail(kit, M);
  poolSign(kit, M);
  logbook(kit, M);
  keepersThings(kit, M);
}
