// =============================================================================
// LIGHTHOUSE POINT: THE BEAUTY PASS (2026-11-23). Detail on the places a child looks at: the lawn's tufts and
// flowers, the sand's ripples, wrack, shells and marram, the foam where the sea meets the shore, the far sea
// under the horizon, the cliffs' foot, the cave's roof, the tower's courses and brackets, the gallery's seams,
// the cottage's quoins, slates and pots, the garden's sunflowers, and the cove's pots, rope and net.
//
// All of it is merged, vertex-coloured, flat-lit shapes put into the kit's existing buckets (nothing here casts a
// shadow, nothing is a collider, nothing moves, nothing draws a random number: every number is hash01's).
// =============================================================================

import * as THREE from 'three';
import { hash01 } from './builder.js';
import * as P from './lighthouseplan.js';
import { seasonData } from './lighthouseseason.js';
import { COL, paint, paintBy, bx, bm, cy, sp, boulder, PLATEAU_PATH_LINES } from './lighthouseparts.js';

const _c = new THREE.Color();
export const mixHex = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t).getHex();
export const shadeHex = (hex, k) => new THREE.Color(hex).multiplyScalar(k).getHex();
const h01 = hash01;
const UP = [0, 1, 0];

// A soup of loose triangles with a colour per corner and a fixed normal (flat things lit like the ground under them).
export class Soup {
  constructor() { this.pos = []; this.col = []; this.nor = []; }
  tri(a, b, c, ha, hb = ha, hc = ha, n = UP) {
    for (const [p, h] of [[a, ha], [b, hb], [c, hc]]) {
      this.pos.push(p[0], p[1], p[2]);
      _c.setHex(h);
      this.col.push(_c.r, _c.g, _c.b);
      this.nor.push(n[0], n[1], n[2]);
    }
  }
  // a triangle wound to face up whichever way round it was given
  up(a, b, c, ha, hb = ha, hc = ha) {
    const ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
    if (ny >= 0) this.tri(a, c, b, ha, hc, hb); else this.tri(a, b, c, ha, hb, hc);
  }
  both(a, b, c, ha, hb, hc) { this.tri(a, b, c, ha, hb, hc); this.tri(a, c, b, ha, hc, hb); }
  get empty() { return this.pos.length === 0; }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((this.pos.length / 3) * 2), 2));
    return g;
  }
}

// ---- small shapes -------------------------------------------------------------------------------------

// A tuft of `n` blades radiating from one root, each a thin triangle that leans outward, dark at the root and sun-caught at the
// tip. Single-sided (it faces up and out), so the sky-side camera always sees most of them.
export function tuft(S, x, y, z, seed, h, base, tip, n = 4) {
  const a0 = h01(seed, 0, 201) * 6.283;
  for (let k = 0; k < n; k++) {
    const a = a0 + (k / n) * 6.283 + 0.5 * (h01(seed, k, 203) - 0.5);
    const hh = h * (0.7 + 0.5 * h01(seed, k, 205));
    const lean = hh * (0.3 + 0.4 * h01(seed, k, 207));
    const w = 0.045 + 0.03 * h01(seed, k, 209);
    const px = -Math.sin(a) * w; const pz = Math.cos(a) * w;
    const ox = x + Math.cos(a) * 0.03; const oz = z + Math.sin(a) * 0.03;
    const A = [ox - px, y, oz - pz]; const B = [ox + px, y, oz + pz]; const C = [x + Math.cos(a) * lean, y + hh, z + Math.sin(a) * lean];
    const ny = (B[2] - A[2]) * (C[0] - A[0]) - (B[0] - A[0]) * (C[2] - A[2]); // y of (B - A) x (C - A)... the facing the camera sees
    if (ny >= 0) S.tri(A, C, B, base, tip, base); else S.tri(A, B, C, base, base, tip);
  }
}

// A flower: a thin stem and a small cup of petals (a bowl, so it reads from the side), with a bright eye.
function flower(S, x, y, z, seed, hex, r = 0.05, stem = 0.16) {
  const a = h01(seed, 1, 211) * 6.28;
  S.both([x - 0.012, y, z], [x + 0.012, y, z], [x, y + stem, z], 0x4d6b34, 0x4d6b34, 0x6f8c4a);
  const seg = 5;
  const lo = [x, y + stem, z];
  for (let k = 0; k < seg; k++) {
    const a0 = a + (k / seg) * 6.283; const a1 = a + ((k + 1) / seg) * 6.283;
    const rim = (t) => [x + Math.cos(t) * r, y + stem + r * 0.9, z + Math.sin(t) * r];
    S.tri(lo, rim(a1), rim(a0), 0xf1c93e, hex, shadeHex(hex, 0.92), [Math.cos((a0 + a1) / 2) * 0.6, 0.8, Math.sin((a0 + a1) / 2) * 0.6]);
  }
}

// An irregular flat patch (seaweed, a stain, a puddle's edge): a fan of `seg` points round (x, z), radii wobbling.
export function patch(S, x, y, z, r, seed, ha, hb = ha, seg = 6, sx = 1, sz = 1) {
  const pts = [];
  for (let k = 0; k < seg; k++) {
    const a = (k / seg) * 6.283;
    const rr = r * (0.6 + 0.6 * h01(seed, k, 221));
    pts.push([x + Math.cos(a) * rr * sx, y, z + Math.sin(a) * rr * sz]);
  }
  for (let k = 0; k < seg; k++) S.tri([x, y, z], pts[(k + 1) % seg], pts[k], ha, hb, hb);
}

// A flat ribbon along a polyline of [x, z] points at height y, `w` wide, with a colour per end of each piece.
export function ribbon(S, pts, y, w, ha, hb = ha) {
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, az] = pts[i]; const [bx2, bz] = pts[i + 1];
    const l = Math.hypot(bx2 - ax, bz - az) || 1;
    const nx = (-(bz - az) / l) * w / 2; const nz = ((bx2 - ax) / l) * w / 2;
    S.tri([ax + nx, y, az + nz], [bx2 - nx, y, bz - nz], [ax - nx, y, az - nz], ha, hb, ha);
    S.tri([ax + nx, y, az + nz], [bx2 + nx, y, bz + nz], [bx2 - nx, y, bz - nz], ha, hb, hb);
  }
}

// A low cone (a shell or a limpet): `seg` sides, a rim and an apex.
export function shell(S, x, y, z, r, seed, hex) {
  const seg = 5;
  const apex = [x, y + r * 0.7, z];
  for (let k = 0; k < seg; k++) {
    const a0 = (k / seg) * 6.283 + seed; const a1 = ((k + 1) / seg) * 6.283 + seed;
    const tone = k % 2 ? shadeHex(hex, 0.86) : hex;
    S.tri(apex, [x + Math.cos(a1) * r, y, z + Math.sin(a1) * r], [x + Math.cos(a0) * r, y, z + Math.sin(a0) * r], hex, tone, tone, [Math.cos((a0 + a1) / 2) * 0.5, 0.85, Math.sin((a0 + a1) / 2) * 0.5]);
  }
}

// A starfish: five arms.
function starfish(S, x, y, z, r, seed, hex) {
  for (let k = 0; k < 5; k++) {
    const a = seed + (k / 5) * 6.283;
    const a0 = a - 0.32; const a1 = a + 0.32;
    S.tri([x + Math.cos(a) * r, y, z + Math.sin(a) * r], [x + Math.cos(a1) * r * 0.32, y, z + Math.sin(a1) * r * 0.32], [x + Math.cos(a0) * r * 0.32, y, z + Math.sin(a0) * r * 0.32], mixHex(hex, 0xfff0d0, 0.2), hex, hex);
  }
  S.tri([x + Math.cos(seed) * r * 0.3, y, z + Math.sin(seed) * r * 0.3], [x + Math.cos(seed + 2.1) * r * 0.3, y, z + Math.sin(seed + 2.1) * r * 0.3], [x + Math.cos(seed + 4.2) * r * 0.3, y, z + Math.sin(seed + 4.2) * r * 0.3], hex);
}

// A soft band from (ax, az) to (bx, bz): the middle line in `ma` and `mb`, both sides fading to `edge`.
function S_band(S, ax, az, bx2, bz, half, y, ma, mb, edge) {
  const l = Math.hypot(bx2 - ax, bz - az) || 1;
  const nx = (-(bz - az) / l) * half; const nz = ((bx2 - ax) / l) * half;
  const A = [ax, y, az]; const B = [bx2, y, bz];
  for (const sgn of [1, -1]) {
    const A2 = [ax + nx * sgn, y, az + nz * sgn]; const B2 = [bx2 + nx * sgn, y, bz + nz * sgn];
    S.up(A, B, B2, ma, mb, edge);
    S.up(A, B2, A2, ma, edge, edge);
  }
}

// ---- where things may go -----------------------------------------------------------------------------

const segDist = (px, pz, ax, az, bx2, bz) => {
  const dx = bx2 - ax; const dz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
};
export const nearCollider = (x, z, pad) => P.LIGHTHOUSE_COLLIDERS.some((q) => Math.hypot(x - q.x, z - q.z) < q.r + pad);
const nearPath = (x, z, pad) => PLATEAU_PATH_LINES.some(([pts, w]) => pts.some((p, i) => i + 1 < pts.length && segDist(x, z, p[0], p[1], pts[i + 1][0], pts[i + 1][1]) < w / 2 + pad));
const C0 = P.COTTAGE;
const CX0 = C0.x - C0.w / 2; const CX1 = C0.x + C0.w / 2; const CZ0 = C0.z - C0.d / 2; const CZ1 = C0.z + C0.d / 2;
export const lawnOk = (x, z) => x > -39.6 && x < -6.9 && z < 3.5 && z > -62
  && !(x > -16.8 && z > -22.4 && z < -15.6)
  && Math.hypot(x - P.TOWER.x, z - P.TOWER.z) > 4.6
  && !(x > CX0 - 0.7 && x < CX1 + 2.7 && z > CZ0 - 0.7 && z < CZ1 + 0.9)
  && !(x > P.GARDEN.minX - 1 && x < P.GARDEN.maxX + 1 && z > P.GARDEN.minZ - 1)
  && !nearPath(x, z, 0.35) && !nearCollider(x, z, 0.45);
export const poolNear = (x, z, pad) => P.POOLS.some((q) => Math.hypot(x - q.x, z - q.z) < q.r + pad);
export const sandOk = (x, z) => ((x > -5.4 && x < 35.2) || (z > 5.4 && x > -38.5 && x < 35.2))
  && !poolNear(x, z, 1.9) && !nearCollider(x, z, 0.5)
  && !(Math.abs(z - 16) < 2.6 && x > -26 && x < -0.5)
  && !(z < 5 && x < -4.6)
  && Math.hypot(x - P.BOAT.x, z - P.BOAT.z) > 2.4;

// ---- the lawn -----------------------------------------------------------------------------------------

function drawLawn(kit, M) {
  const S = new Soup();
  const F = new Soup();
  const SEA = seasonData();
  const greens = SEA.greens;
  let n = 0;
  for (let gx = -39.4; gx < -7; gx += 1.6) {
    for (let gz = -62; gz < 3.4; gz += 1.6) {
      const x = gx + 1.1 * h01(Math.round(gx * 10), Math.round(gz * 10), 301);
      const z = gz + 1.1 * h01(Math.round(gx * 10), Math.round(gz * 10), 303);
      if (z < -44 && h01(n, 5, 305) > 0.2) continue; // beyond the walk's bounds: sparse
      if (!lawnOk(x, z)) continue;
      n++;
      const g = greens[Math.floor(h01(n, 7, 307) * 4) % 4];
      tuft(S, x, P.PLATEAU_Y, z, n, 0.26 + 0.22 * h01(n, 9, 309), shadeHex(g, 0.55), mixHex(g, SEA.tip, 0.45), 4);
    }
  }
  // flower clusters: white daisies, buttercups, sea pinks, clover purple; a few more along the sea-side lip
  const pal = SEA.flowers;
  for (let i = 0; i < 44; i++) {
    const lip = i % 3 === 0;
    const cx = lip ? -39.2 + 1.2 * h01(i, 1, 311) : -39 + 32 * h01(i, 2, 311);
    const cz = lip ? -40 + 43 * h01(i, 3, 311) : -43 + 46 * h01(i, 4, 311);
    const hex = pal[(lip ? 2 : i % 4) % 4];
    for (let k = 0; k < 7; k++) {
      const x = cx + (h01(i, k, 313) - 0.5) * 1.8; const z = cz + (h01(i, k, 315) - 0.5) * 1.8;
      if (!lawnOk(x, z)) continue;
      flower(F, x, P.PLATEAU_Y, z, i * 10 + k, hex, 0.05, 0.13 + 0.08 * h01(i, k, 317));
    }
  }
  kit.put('flora', M.stone, [S.geometry(), F.geometry()], { noCast: true });
  // sea-pink cushions along the cliff lips: a green hump studded with pink
  const C = new Soup();
  for (let i = 0; i < 26; i++) {
    const east = i % 2 === 0;
    const x = east ? -6.9 - 0.2 * h01(i, 1, 321) : -39.5 + 0.4 * h01(i, 1, 321);
    const z = east ? -42 + 44 * h01(i, 2, 321) : -42 + 44 * h01(i, 3, 321);
    if ((east && z > -22.4 && z < -15.6) || nearCollider(x, z, 0.2) || !lawnOk(x + (east ? -0.3 : 0.3), z)) continue;
    patch(C, x, P.PLATEAU_Y + 0.05, z, 0.38 + 0.2 * h01(i, 4, 321), 400 + i, 0x5e8a47, 0x74a055, 7);
    for (let k = 0; k < 5; k++) shell(C, x + (h01(i, k, 323) - 0.5) * 0.5, P.PLATEAU_Y + 0.08, z + (h01(i, k, 325) - 0.5) * 0.5, 0.05, k, 0xee9db8);
  }
  if (!C.empty) kit.put('flora', M.stone, C.geometry(), { noCast: true });
}

// ---- the sand: ripples, wrack, shells, marram, mussels ---------------------------------------------------

function drawSand(kit, M) {
  const R = new Soup();
  const W = new Soup();
  const G = new Soup();
  // ripple marks: broad soft bands lying with the shore, a shade darker along the middle and fading into the sand at the edges
  let placed = 0;
  for (let i = 0; i < 500 && placed < 50; i++) {
    const x = -4.5 + 38 * h01(i, 1, 331);
    const z = -42 + 84 * h01(i, 2, 331);
    if (!sandOk(x, z)) continue;
    placed++;
    const len = 3 + 5 * h01(i, 3, 331);
    const w = 0.32 + 0.3 * h01(i, 4, 331);
    const pts = [];
    for (let k = 0; k < 5; k++) pts.push([x + 0.4 * Math.sin(k * 1.3 + i), z + (k / 4 - 0.5) * len]);
    const edge = 0xbfab84; const mid = i % 3 === 0 ? 0xc6b289 : 0xb5a07a; // (pass 8: the darker bands were half as dark again, and read as a stray line at the grazing arrival view)
    for (let k = 0; k + 1 < pts.length; k++) {
      const [ax, az] = pts[k]; const [bx2, bz] = pts[k + 1];
      const fa = k === 0 ? edge : mid; const fb = k + 2 === pts.length ? edge : mid;
      const ha = (w / 2);
      S_band(R, ax, az, bx2, bz, ha, 0.02, fa, fb, edge);
    }
  }
  // wrack along the high-tide line (x about 29 to 31) and round the low rocks: dark weed patches with a pale stalk or two
  const wrackX = (z) => 30.2 + 1.4 * Math.sin(z * 0.23) + 0.8 * Math.sin(z * 0.71 + 1);
  for (let i = 0; i < 46; i++) {
    const z = -42 + 84 * h01(i, 1, 341);
    const x = wrackX(z) + (h01(i, 2, 341) - 0.5) * 0.9;
    if (poolNear(x, z, 0.8)) continue;
    // a drift: a tangle of curved strands (olive, brown, a little green) with pale bladders along them
    const strands = 3 + (i % 3);
    for (let k = 0; k < strands; k++) {
      const a0 = h01(i, k, 343) * 6.283; const len = 0.35 + 0.5 * h01(i, k, 345);
      const tone = [0x6d5f30, 0x7d6c36, 0x56673a, 0x8a7440][(i + k) % 4];
      const pts = [];
      for (let m = 0; m < 4; m++) pts.push([x + Math.cos(a0 + 0.35 * m * (k % 2 ? 1 : -1)) * len * m / 3, z + Math.sin(a0 + 0.35 * m * (k % 2 ? 1 : -1)) * len * m / 3]);
      ribbon(W, pts, 0.03 + 0.008 * k, 0.07 + 0.05 * h01(i, k, 347), shadeHex(tone, 0.8), tone);
      if (k < 2) shell(W, pts[2][0], 0.035, pts[2][1], 0.035, k, 0xa89a58);
    }
    patch(W, x, 0.026, z, 0.2 + 0.14 * h01(i, 3, 341), 500 + i, 0x5e5429, 0x74683a, 7, 1.5, 0.9);
  }
  // shells and starfish
  const shellTones = [0xf3e6cf, 0xe9b9a8, 0xcfc4b0, 0xf7efe0];
  let sh = 0;
  for (let i = 0; i < 400 && sh < 80; i++) {
    const x = -5 + 40 * h01(i, 1, 351);
    const z = -42 + 84 * h01(i, 2, 351);
    if (!sandOk(x, z)) continue;
    sh++;
    shell(W, x, 0.02, z, 0.08 + 0.09 * h01(i, 3, 351), i, shellTones[i % 4]);
  }
  for (const [x, z, r, hex] of [[14.5, 20.5, 0.22, 0xe0793c], [19.5, 8.2, 0.2, 0xd9663b], [26.8, 28.5, 0.24, 0xe58a4a], [11, 33.4, 0.18, 0xe0793c], [27.5, 4, 0.2, 0xd9663b], [3.5, 12, 0.2, 0xe58a4a]]) starfish(W, x, 0.03, z, r, x, hex);
  const SEA = seasonData();
  // marram on the low dunes under the cliffs and round the boulders: clumps of long grey-green blades
  const MC = [];
  for (let i = 0; i < 260 && MC.length < 44; i++) {
    const nearCliffFoot = i % 2 === 0;
    const x = nearCliffFoot ? -5.4 + 3.2 * h01(i, 1, 361) : -38 + 33 * h01(i, 1, 361);
    const z = nearCliffFoot ? -42 + 46 * h01(i, 2, 361) : 5.6 + 2.8 * h01(i, 2, 361);
    if (!sandOk(x, z) && !(nearCliffFoot && x > -5.4 && !nearCollider(x, z, 0.5) && !(z > -22.6 && z < -15.4))) continue;
    if (nearCliffFoot && z > -22.6 && z < -15.4) continue;
    MC.push([x, z]);
  }
  MC.forEach(([x, z], i) => {
    const hh = 0.5 + 0.4 * h01(i, 1, 363);
    const bloom = SEA.dune.bloom; // (spring: a third of the clumps flower on their tips, the dunes' wildflowers)
    tuft(G, x, 0.02, z, 700 + i, hh, SEA.dune.base, bloom && i % 3 === 0 ? bloom[(i / 3 | 0) % bloom.length] : SEA.dune.tip, 7);
  });
  // pebble drifts and a few bigger stones across the sand in front of the arrival, so the near ground is never bare
  for (let i = 0; i < 46; i++) {
    const x = 3 + 24 * h01(i, 1, 355); const z = 22 + 20 * h01(i, 2, 355);
    if (!sandOk(x, z) || Math.hypot(x - 14, z - 36) < 1.2) continue;
    const big = i % 7 === 0;
    const r = big ? 0.22 + 0.12 * h01(i, 3, 355) : 0.07 + 0.1 * h01(i, 3, 355);
    kit.put('rocks', M.stone, boulder(x, 0, z, r, r * 0.65, 600 + i, [0xb9a88e, 0x9c8a74, 0xcfc3a8, 0x8a7a6b], 0), { noCast: true });
    if (!big && i % 2 === 0) kit.put('rocks', M.stone, boulder(x + 0.22, 0, z + 0.12, r * 0.7, r * 0.45, 650 + i, [0xcfc3a8, 0xb9a88e], 0), { noCast: true });
  }
  // mussels and limpets on each pool's shelf
  P.POOLS.forEach((p, k) => {
    for (let m = 0; m < 9; m++) {
      const a = h01(k, m, 371) * 6.283; const rr = p.r + 0.4 + 0.7 * h01(k, m, 373);
      const dark = m % 3 === 0;
      shell(W, p.x + Math.cos(a) * rr, 0.06, p.z + Math.sin(a) * rr, 0.07 + 0.05 * h01(k, m, 375), m, dark ? 0x5b6785 : 0xc9bfa8);
    }
    starfish(W, p.x + Math.cos(k * 1.7) * (p.r + 0.9), 0.065, p.z + Math.sin(k * 1.7) * (p.r + 0.9), 0.16, k, [0xe0793c, 0xc2402f, 0xe9a04a][k % 3]);
    // weed fringe on the shelf's rim
    for (let m = 0; m < 5; m++) {
      const a = h01(k, m, 377) * 6.283;
      patch(W, p.x + Math.cos(a) * (p.r + 0.35), 0.07, p.z + Math.sin(a) * (p.r + 0.35), 0.18, 800 + k * 7 + m, 0x2f4a38, 0x4f7a48, 5);
    }
  });
  kit.put('wet', M.stone, [R.geometry(), W.geometry(), G.geometry()], { noCast: true });
}

// ---- foam where the sea meets the land, and the far sea under the horizon ------------------------------------

// A band of foam along a coast: lines of pale, scalloped water-wash, additive (so it only ever lightens).
function foamBand(S, pts, wide, bright, alongX = false) {
  // pts: [x, z] along the coast; the band runs from each point out `wide` toward `dir` (+1 toward larger x)
  for (let i = 0; i + 1 < pts.length; i++) {
    const [a, b] = [pts[i], pts[i + 1]];
    const q = (p, k) => (alongX ? [p[1], 0.075, p[0] + p[2] * wide * k] : [p[0] + p[2] * wide * k, 0.075, p[1]]);
    const fb = Math.round(bright * 255);
    const hot = (fb << 16) | (Math.round(fb * 0.97) << 8) | Math.round(fb * 0.92);
    const mid = ((fb >> 1) << 16) | ((Math.round(fb * 0.97) >> 1) << 8) | (Math.round(fb * 0.92) >> 1);
    // inner edge dark, a bright ridge a third of the way out, fading to nothing at the wet outer edge
    S.tri(q(a, 0), q(b, 0.33), q(a, 0.33), 0x000000, hot, hot);
    S.tri(q(a, 0), q(b, 0), q(b, 0.33), 0x000000, 0x000000, hot);
    S.tri(q(a, 0.33), q(b, 0.33), q(a, 1), hot, hot, mid);
    S.tri(q(b, 0.33), q(b, 1), q(a, 1), hot, mid, mid);
  }
}

function drawFoam(kit, M) {
  const S = new Soup();
  const step = 2.8;
  const line = (xAt, z0, z1, dir) => {
    const pts = [];
    for (let z = z0; z <= z1 + 0.01; z += step) pts.push([xAt(z), z, dir]);
    return pts;
  };
  // the east sea, on the cove's sand: a wash, a thinner second line behind it
  const e1 = (z) => 36.35 - 0.5 - 0.35 * Math.sin(z * 0.5) - 0.3 * Math.sin(z * 1.9 + 2);
  const e2 = (z) => 34.2 - 0.7 * Math.sin(z * 0.37 + 1.3) - 0.35 * Math.sin(z * 1.3);
  foamBand(S, line(e1, -68, 68, 1), 1.5, 0.34);
  foamBand(S, line(e2, -68, 68, 1), 0.9, 0.17);
  // the west sea, on the lower shore under the plateau's face (the sea is to the west of x -40)
  const w1 = (z) => -40.2 + 0.4 * Math.sin(z * 0.45) + 0.25 * Math.sin(z * 1.7);
  foamBand(S, line(w1, -66, 68, -1), 1.7, 0.34);
  foamBand(S, line((z) => -39 + 0.5 * Math.sin(z * 0.33 + 2), 6, 68, -1), 1.0, 0.16);
  // the sand's far edges, north and south, where it runs out into the open sea (x runs along the line, z is the wash's)
  const n1 = (x) => -69.4 + 0.3 * Math.sin(x * 0.4) + 0.2 * Math.sin(x * 1.3);
  foamBand(S, line(n1, -6, 36, -1), 1.5, 0.3, true);
  const s1 = (x) => 69.4 + 0.3 * Math.sin(x * 0.4 + 1) + 0.2 * Math.sin(x * 1.1);
  foamBand(S, line(s1, -40, 36, 1), 1.5, 0.3, true);
  // rings round the two stacks
  for (const R of [P.GULL_ROCK, P.PINNACLE]) {
    const seg = 22;
    for (let k = 0; k < seg; k++) {
      const a0 = (k / seg) * 6.283; const a1 = ((k + 1) / seg) * 6.283;
      const r0 = R.r * 1.18; const r1 = R.r * 1.18 + 1.5;
      const v = (a, r) => [R.x + Math.cos(a) * r, 0.075, R.z + Math.sin(a) * r];
      const bright = 0x5c6266;
      S.tri(v(a0, r0), v(a1, r0 + 0.45), v(a0, r0 + 0.45), 0x000000, bright, bright);
      S.tri(v(a0, r0), v(a1, r0), v(a1, r0 + 0.45), 0x000000, 0x000000, bright);
      S.tri(v(a0, r0 + 0.45), v(a1, r0 + 0.45), v(a0, r1), bright, bright, 0x2c3032);
      S.tri(v(a1, r0 + 0.45), v(a1, r1), v(a0, r1), bright, 0x2c3032, 0x2c3032);
    }
  }
  // a little wash round each rock pool's edge
  P.POOLS.forEach((p) => {
    const seg = 20;
    for (let k = 0; k < seg; k++) {
      const a0 = (k / seg) * 6.283; const a1 = ((k + 1) / seg) * 6.283;
      const v = (a, r) => [p.x + Math.cos(a) * r, 0.058, p.z + Math.sin(a) * r];
      const edge = 0x2f3638;
      S.tri(v(a0, p.r - 0.3), v(a1, p.r - 0.05), v(a0, p.r - 0.05), 0x000000, edge, edge);
      S.tri(v(a0, p.r - 0.3), v(a1, p.r - 0.3), v(a1, p.r - 0.05), 0x000000, 0x000000, edge);
    }
  });
  kit.put('glowpatch', M.patch, S.geometry(), { noCast: true });
}

// The sea past the sand's edge: one big plane of deep water colour under everything, so the sea runs on to the horizon and the
// fog takes it into the sky instead of the sand stopping in a straight line against nothing.
function drawFarSea(kit, M) {
  const g = new THREE.PlaneGeometry(1400, 1400, 1, 1);
  g.rotateX(-Math.PI / 2);
  g.translate(0, -0.06, 0);
  kit.put('far', M.stone, paintBy(g, () => 0x2a5d86), { noCast: true });
}

// ---- the cliffs' foot, the cave's roof ---------------------------------------------------------------

function drawCliffFoot(kit, M) {
  const S = new Soup();
  const stones = [0xa59882, 0x8d7d68, 0xb3a58c, 0x837565, 0x9a7a5e, 0x6f7469];
  let i = 0;
  const stone = (x, z, r, salt) => {
    const g = boulder(x, -0.03, z, r, r * 0.62, salt, stones, 0);
    kit.put('scree', M.stone, g, { noCast: true });
  };
  // a scatter of fallen rock along the east face (not at the cave's mouth) and the south face (not at the path)
  for (let z = -43; z < 3.5; z += 1.9) {
    if (z > -23.5 && z < -14.5) continue;
    const j = i++;
    stone(-5.1 + 2.4 * h01(j, 1, 381), z + h01(j, 2, 381), 0.18 + 0.2 * h01(j, 3, 381), 900 + j);
  }
  for (let x = -38; x < -6; x += 2.1) {
    if (Math.abs(x + 24.4) < 2.4) continue;
    const j = i++;
    stone(x + h01(j, 2, 383), 4.6 + 1.8 * h01(j, 1, 383), 0.18 + 0.2 * h01(j, 3, 383), 900 + j);
  }
  void S;
}

function drawCaveRoof(kit, M) {
  const { CAVE: V } = P;
  const tones = [0xb39c7c, 0xa28d70, 0xbea887];
  for (let i = 0; i < 18; i++) {
    const x = V.minX + 0.6 + (V.maxX - V.minX - 1.2) * h01(i, 1, 391);
    const z = V.minZ + 0.5 + (V.maxZ - V.minZ - 1) * h01(i, 2, 391);
    const hh = 0.22 + 0.5 * h01(i, 3, 391);
    const r = 0.06 + 0.08 * h01(i, 4, 391);
    const g = new THREE.ConeGeometry(r, hh, 6, 1, true);
    g.rotateX(Math.PI);
    g.translate(x, V.roof - hh / 2 + 0.02, z);
    kit.put('scree', M.stone, paintBy(g, (px, py) => shadeHex(tones[i % 3], 0.85 + 0.25 * (1 - (py - (V.roof - hh)) / hh))), { noCast: true });
    if (i % 3 === 0) { // a stalagmite under it, stubbier
      const s = new THREE.ConeGeometry(r * 1.3, hh * 0.45, 6, 1, true);
      s.translate(x + 0.02, hh * 0.22, z + 0.02);
      kit.put('scree', M.stone, paintBy(s, (px, py) => shadeHex(tones[(i + 1) % 3], 0.8 + 0.3 * (py / (hh * 0.45)))), { noCast: true });
    }
  }
  // a damp, darker stain along the cave floor's edges and wet sheen pools (flat, darker)
  const S = new Soup();
  for (let i = 0; i < 6; i++) patch(S, V.minX + 1 + (V.maxX - V.minX - 2) * h01(i, 1, 395), 0.02, V.minZ + 0.8 + (V.maxZ - V.minZ - 1.6) * h01(i, 2, 395), 0.5 + 0.5 * h01(i, 3, 395), 950 + i, 0xa08d70, 0xa8957a, 7, 1.4, 1);
  kit.put('wet', M.stone, S.geometry(), { noCast: true });
}

// ---- the tower ---------------------------------------------------------------------------------------

function drawTowerDetail(kit, M) {
  const { TOWER: T, PLATEAU_Y: Y0, GALLERY_Y: Y1 } = P;
  const bands = 5;
  const h = (Y1 - 0.9 - (Y0 + 1.05)) / bands;
  const taper = (y) => T.shaft - 0.5 * ((y - (Y0 + 1.05)) / (Y1 - (Y0 + 1.05)));
  const bandCol = (i) => (i % 2 ? COL.white : COL.red);
  // courses of stone: a thin ring a little proud of the paint, mid-band and at each joint
  const ring = (y, r, hex) => {
    const g = new THREE.CylinderGeometry(r, r, 0.06, 28, 1, true).translate(T.x, y, T.z);
    kit.put('paint', M.paint, paint(g, hex), { noCast: true });
  };
  for (let i = 0; i < bands; i++) {
    const ya = Y0 + 1.05 + i * h;
    ring(ya + h * 0.5, taper(ya + h * 0.5) + 0.012, shadeHex(bandCol(i), 0.84));
    if (i > 0) ring(ya, taper(ya) + 0.016, shadeHex(bandCol(i), 0.72));
  }
  // the foot of the shaft is grimy: dark at the plinth, fading into the red
  const foot = new THREE.CylinderGeometry(taper(Y0 + 2.2) + 0.014, taper(Y0 + 1.05) + 0.014, 1.15, 28, 1, true).translate(T.x, Y0 + 1.05 + 0.575, T.z);
  kit.put('paint', M.paint, paintBy(foot, (x, y) => mixHex(0x3d2c24, COL.red, Math.min(1, Math.max(0, (y - (Y0 + 1.05)) / 1.15)) ** 0.8)), { noCast: true });
  // rain streaks under the lit slits
  for (const [deg, y] of [[200, 9.2], [290, 10.9], [20, 12.2], [110, 8.4]]) {
    const r = (deg * Math.PI) / 180;
    const rr = taper(y) + 0.012;
    const band = Math.floor((y - (Y0 + 1.05)) / h);
    const g = new THREE.BoxGeometry(0.2, 1.3, 0.03);
    g.rotateY(Math.PI / 2 - r);
    g.translate(T.x + rr * Math.cos(r), y - 0.45 - 0.65, T.z + rr * Math.sin(r));
    kit.put('paint', M.paint, paint(g, shadeHex(bandCol(band), 0.8)), { noCast: true });
  }
  // brackets (corbels) under the gallery's lip, every 15 degrees
  for (let deg = 0; deg < 360; deg += 15) {
    const a = (deg * Math.PI) / 180;
    kit.put('stone', M.stone, bm(T.x + (taper(Y1) + 0.15) * Math.cos(a), Y1 - 0.95, T.z + (taper(Y1) + 0.15) * Math.sin(a), T.x + (T.gallery - 0.35) * Math.cos(a), Y1 - 0.48, T.z + (T.gallery - 0.35) * Math.sin(a), 0.2, 0.2, shadeHex(COL.stone, 0.82)), { noCast: true });
  }
  // the deck's flagstone seams: a ring at two radii and radial joints, a shade darker than the stone
  const S = new Soup();
  const seam = shadeHex(0xb2a690, 0.86);
  const pol = (deg, r) => [T.x + r * Math.cos((deg * Math.PI) / 180), T.z + r * Math.sin((deg * Math.PI) / 180)];
  for (const rr of [3.1, 3.85]) {
    const pts = [];
    for (let d = 0; d <= 360; d += 12) pts.push(pol(d, rr));
    ribbon(S, pts, Y1 + 0.03, 0.045, seam);
  }
  for (let d = 0; d < 360; d += 20) {
    ribbon(S, [pol(d, 2.6), pol(d, 3.1)], Y1 + 0.03, 0.04, seam);
    ribbon(S, [pol(d + 10, 3.1), pol(d + 10, 3.85)], Y1 + 0.03, 0.04, seam);
    ribbon(S, [pol(d, 3.85), pol(d, 4.5)], Y1 + 0.03, 0.04, seam);
  }
  kit.put('wet', M.stone, S.geometry(), { noCast: true });
  // a boot scraper and a stone step flank are already drawn; add a hanging lantern bracket by the door
  const a = Math.PI / 4;
  const dx = T.x + (T.shaft + 0.2) * Math.cos(a); const dz = T.z + (T.shaft + 0.2) * Math.sin(a);
  kit.put('glow', M.glow, sp(dx - 0.9 * Math.sin(a), Y0 + 2.6, dz + 0.9 * Math.cos(a), 0.11, COL.warm, { seg: 6, rings: 4 }), { noCast: true });
  kit.put('paint', M.paint, cy(dx - 0.9 * Math.sin(a), dz + 0.9 * Math.cos(a), Y0 + 2.72, Y0 + 2.78, 0.1, 0.1, COL.dark, 6), { noCast: true });
}

// ---- the cottage and its garden ---------------------------------------------------------------------

function drawCottageDetail(kit, M) {
  const Y0 = P.PLATEAU_Y;
  const wallTop = Y0 + 2.5;
  // quoins: alternating long and short stones up each corner
  for (const [cx, cz, sx, sz] of [[CX0, CZ0, -1, -1], [CX1, CZ0, 1, -1], [CX0, CZ1, -1, 1], [CX1, CZ1, 1, 1]]) {
    for (let k = 0; k < 5; k++) {
      const y = Y0 + 0.75 + k * 0.35;
      const long = k % 2 === 0;
      kit.put('stone', M.stone, bx(Math.min(cx, cx + sx * (long ? 0.6 : 0.3)) - (sx > 0 ? 0 : 0.03) , Math.max(cx, cx + sx * (long ? 0.6 : 0.3)) + (sx > 0 ? 0.03 : 0), y, y + 0.32, Math.min(cz, cz + sz * (long ? 0.3 : 0.6)) - (sz > 0 ? 0 : 0.03), Math.max(cz, cz + sz * (long ? 0.3 : 0.6)) + (sz > 0 ? 0.03 : 0), shadeHex(COL.stone, 0.95 + 0.12 * h01(k, sx + sz, 401))), { noCast: true });
    }
  }
  // a damp stain along the foot of the walls, a lintel over the window and the door
  const stain = mixHex(COL.plaster, 0x7f7762, 0.5);
  kit.put('paint', M.paint, bx(CX0 + 0.5, CX1 - 0.5, Y0 + 0.7, Y0 + 1.15, CZ1 + 0.005, CZ1 + 0.02, stain), { noCast: true });
  kit.put('paint', M.paint, bx(CX0 + 0.5, CX1 - 0.5, Y0 + 0.7, Y0 + 1.15, CZ0 - 0.02, CZ0 - 0.005, stain), { noCast: true });
  kit.put('stone', M.stone, bx(C0.x - 1.3, C0.x + 0.5, Y0 + 2.1, Y0 + 2.3, CZ1 - 0.02, CZ1 + 0.1, shadeHex(COL.stone, 0.9)), { noCast: true });
  // slate courses on both roof planes, a lighter row here and there
  const o = 0.45; const y0 = wallTop; const y1 = wallTop + 1.7;
  for (const side of [1, -1]) {
    const zEave = (side > 0 ? CZ1 + o : CZ0 - o); const zRidge = C0.z;
    for (let k = 1; k <= 6; k++) {
      const t = k / 7;
      const z = zEave + (zRidge - zEave) * t; const y = y0 + (y1 - y0) * t + 0.03;
      kit.put('paint', M.paint, bm(CX0 - o, y, z, CX1 + o, y, z, 0.05, 0.03, shadeHex(COL.slate, k % 2 ? 0.7 : 1.22)), { noCast: true });
    }
  }
  // chimney pots
  for (const dz of [-0.17, 0.17]) kit.put('stone', M.stone, cy(CX0 + 1.05, C0.z + dz, wallTop + 3.05, wallTop + 3.4, 0.1, 0.12, 0xb06a48, 7), { noCast: true });
  // the south window's flower box, bright against the plaster
  const wx = C0.x - 0.4;
  kit.put('wood', M.wood, bx(wx - 0.62, wx + 0.62, Y0 + 0.78, Y0 + 1.04, CZ1 + 0.02, CZ1 + 0.26, 0x7a5232), { noCast: true });
  for (let k = 0; k < 7; k++) {
    kit.put('paint', M.paint, sp(wx - 0.5 + k * 0.17, Y0 + 1.1, CZ1 + 0.14, 0.08, [0xe6586a, 0xf5d24a, 0xf4efe0][k % 3], { seg: 4, rings: 2 }), { noCast: true });
    kit.put('paint', M.paint, sp(wx - 0.5 + k * 0.17, Y0 + 1.04, CZ1 + 0.2, 0.07, 0x5f8a40, { seg: 4, rings: 2 }), { noCast: true });
  }
  // terracotta pots by the door's step
  const dz0 = C0.z;
  for (const [px, pz, c1] of [[CX1 + 0.5, dz0 + 1.25, 0xe6586a], [CX1 + 0.5, dz0 - 1.25, 0xf5d24a], [CX1 + 1.6, dz0 + 1.3, 0xf4efe0]]) {
    kit.put('stone', M.stone, cy(px, pz, Y0 + 0.14, Y0 + 0.46, 0.15, 0.2, 0xb5653a, 8), { noCast: true });
    kit.put('paint', M.paint, sp(px, Y0 + 0.58, pz, 0.2, 0x5f8a40, { seg: 6, rings: 4, sy: 0.7 }), { noCast: true });
    for (let k = 0; k < 4; k++) kit.put('paint', M.paint, sp(px + (k - 1.5) * 0.08, Y0 + 0.7 + (k % 2) * 0.05, pz + ((k * 5) % 3 - 1) * 0.07, 0.055, c1, { seg: 4, rings: 2 }), { noCast: true });
  }
  // a woodpile on the north wall, three logs deep
  let n = 0;
  for (let row = 0; row < 3; row++) {
    for (let k = 0; k < 4 - row; k++) {
      const z = CZ0 - 0.35 - 0.0; const x = CX0 + 1.9 + k * 0.27 + row * 0.135;
      const g = new THREE.CylinderGeometry(0.12, 0.12, 1.5, 6);
      g.rotateX(Math.PI / 2);
      g.translate(x, Y0 + 0.13 + row * 0.22, z - 0.0);
      kit.put('wood', M.wood, paint(g, [0x8a6a44, 0x7a5a38, 0x9a7a52][(n++) % 3]), { noCast: true });
    }
  }
  // a washing line on the west side: two poles and four cloths
  const lx = CX0 - 1.3;
  for (const z of [CZ0 + 0.4, CZ1 - 0.4]) kit.put('wood', M.wood, cy(lx, z, Y0, Y0 + 2.1, 0.04, 0.04, COL.post, 6), { noCast: true });
  kit.put('wood', M.wood, bm(lx, Y0 + 2.0, CZ0 + 0.4, lx, Y0 + 1.95, CZ1 - 0.4, 0.015, 0.015, COL.rope), { noCast: true });
  [[0xf4efe0, 0.5], [0xc2402f, 0.7], [0x3f6f9e, 0.45], [0xf2cf3a, 0.55]].forEach(([hex, len], k) => {
    const z = CZ0 + 0.7 + k * 0.62;
    kit.put('paint', M.paint, bx(lx - 0.012, lx + 0.012, Y0 + 1.95 - len, Y0 + 1.95, z - 0.22, z + 0.22, hex), { noCast: true });
  });
  // lobster pots and a coil of rope against the west wall
  for (const [px, pz, k] of [[CX0 - 0.55, CZ1 - 1.0, 0], [CX0 - 0.6, CZ1 - 1.9, 1]]) {
    kit.put('wood', M.wood, bx(px - 0.32, px + 0.32, Y0 + k * 0.05, Y0 + 0.38 + k * 0.05, pz - 0.26, pz + 0.26, 0x8b6a45), { noCast: true });
    for (const s of [-0.18, 0, 0.18]) kit.put('wood', M.wood, bx(px + s - 0.03, px + s + 0.03, Y0 + k * 0.05 + 0.02, Y0 + 0.4 + k * 0.05, pz - 0.28, pz + 0.28, 0x5b4630), { noCast: true });
  }
  const rope = new THREE.TorusGeometry(0.22, 0.05, 5, 12).rotateX(Math.PI / 2).translate(CX0 - 0.7, Y0 + 0.07, CZ1 - 2.7);
  kit.put('wood', M.wood, paint(rope, COL.rope), { noCast: true });
}

function drawGardenDetail(kit, M) {
  const { GARDEN: G, PLATEAU_Y: Y0 } = P;
  // sunflowers along the back, taller than the cat, heads turned to the low sun
  for (let k = 0; k < 6; k++) {
    const x = G.minX + 1.4 + k * 1.2; const z = G.minZ + 0.55;
    const hh = 1.15 + 0.35 * h01(k, 1, 421);
    kit.put('flora', M.stone, cy(x, z, Y0, Y0 + hh, 0.03, 0.035, 0x4d6b34, 5), { noCast: true });
    const head = new THREE.CylinderGeometry(0.2, 0.2, 0.05, 9);
    head.rotateX(Math.PI / 2 - 0.35);
    head.translate(x, Y0 + hh + 0.04, z + 0.03);
    kit.put('paint', M.paint, paintBy(head, (px, py, pz, nx, ny, nz) => (Math.hypot(px - x, py - (Y0 + hh + 0.04)) < 0.1 && nz > 0.5 ? 0x5a3c1e : 0xf2c030)), { noCast: true });
    kit.put('paint', M.paint, sp(x - 0.12, Y0 + hh * 0.55, z, 0.1, 0x5f8a40, { seg: 5, rings: 3, sy: 0.5, sx: 1.6 }), { noCast: true });
  }
  // bean poles with green climbing the front
  for (let k = 0; k < 3; k++) {
    const x = G.minX + 2.2 + k * 2.4; const z = G.minZ + 4.0;
    kit.put('wood', M.wood, bm(x - 0.3, Y0, z, x, Y0 + 1.5, z, 0.04, 0.04, COL.post), { noCast: true });
    kit.put('wood', M.wood, bm(x + 0.3, Y0, z, x, Y0 + 1.5, z, 0.04, 0.04, COL.post), { noCast: true });
    kit.put('paint', M.paint, sp(x, Y0 + 0.75, z, 0.28, 0x5f8a40, { seg: 6, rings: 4, sy: 1.7, sx: 0.8, sz: 0.6 }), { noCast: true });
  }
}

// ---- the cove's props ---------------------------------------------------------------------------------

function drawCoveProps(kit, M) {
  // a drying rack on the lower shore: two posts, a rail and a net hung with cork floats and two fish
  const rx = 1.5; const rz = 9;
  for (const dx of [-1.4, 1.4]) kit.put('wood', M.wood, cy(rx + dx, rz, 0, 1.7, 0.05, 0.06, COL.post, 6), { noCast: true });
  kit.put('wood', M.wood, bm(rx - 1.45, 1.6, rz, rx + 1.45, 1.6, rz, 0.06, 0.06, COL.post), { noCast: true });
  kit.put('rope', M.wood, bx(rx - 1.3, rx + 1.3, 0.55, 1.58, rz - 0.015, rz + 0.015, 0xb89d6a), { noCast: true });
  for (let k = 0; k <= 8; k++) kit.put('wood', M.wood, bx(rx - 1.3 + k * 0.325 - 0.012, rx - 1.3 + k * 0.325 + 0.012, 0.55, 1.6, rz - 0.025, rz + 0.025, 0x6e5a3a), { noCast: true });
  for (let k = 0; k <= 3; k++) kit.put('wood', M.wood, bx(rx - 1.3, rx + 1.3, 0.55 + k * 0.34 - 0.012, 0.55 + k * 0.34 + 0.012, rz - 0.025, rz + 0.025, 0x6e5a3a), { noCast: true });
  for (let k = 0; k < 6; k++) kit.put('boat', M.paint, sp(rx - 1.1 + k * 0.44, 0.58, rz + 0.04, 0.07, k % 2 ? COL.red : 0xf2eee4, { seg: 4, rings: 2 }), { noCast: true });
  for (const fx of [-0.4, 0.5]) kit.put('boat', M.paint, sp(rx + fx, 1.3, rz + 0.04, 0.22, 0xaab4bc, { sx: 0.4, sy: 1, sz: 0.2, seg: 6, rings: 4 }), { noCast: true });
  // lobster pots, a stack of three and a coil of rope, by the boat
  const px = 8.4; const pz = 32.6;
  for (const [dx, dy, dz] of [[0, 0, 0], [0.8, 0, 0.1], [0.35, 0.4, 0.05]]) {
    kit.put('wood', M.wood, bx(px + dx - 0.34, px + dx + 0.34, dy, dy + 0.4, pz + dz - 0.27, pz + dz + 0.27, 0x8b6a45), { noCast: true });
    for (const s of [-0.2, 0, 0.2]) kit.put('wood', M.wood, bx(px + dx + s - 0.03, px + dx + s + 0.03, dy + 0.02, dy + 0.42, pz + dz - 0.29, pz + dz + 0.29, 0x5b4630), { noCast: true });
    kit.put('wood', M.wood, bx(px + dx - 0.35, px + dx + 0.35, dy + 0.36, dy + 0.4, pz + dz - 0.12, pz + dz + 0.12, 0x5b4630), { noCast: true });
  }
  kit.put('wood', M.wood, paint(new THREE.TorusGeometry(0.28, 0.06, 5, 14).rotateX(Math.PI / 2).translate(px + 1.8, 0.07, pz + 0.6), COL.rope), { noCast: true });
  kit.put('wood', M.wood, paint(new THREE.TorusGeometry(0.2, 0.06, 5, 12).rotateX(Math.PI / 2).translate(px + 1.8, 0.19, pz + 0.6), COL.rope), { noCast: true });
  // a child's sandcastle left on the sand in front of the arrival: a keep, four turrets, a moat, shells and a flag
  const sx = 18.4; const sz = 32.6; const sand1 = 0xcdb182; const sand2 = 0xe3cc9c;
  kit.put('stone', M.stone, cy(sx, sz, 0, 0.42, 0.52, 0.4, sand2, 10), { noCast: true });
  kit.put('stone', M.stone, cy(sx, sz, 0.42, 0.52, 0.46, 0.46, sand1, 10), { noCast: true });
  for (const [dx, dz] of [[-0.75, -0.75], [0.75, -0.75], [-0.75, 0.75], [0.75, 0.75]]) {
    kit.put('stone', M.stone, cy(sx + dx, sz + dz, 0, 0.5, 0.2, 0.17, sand2, 8), { noCast: true });
    kit.put('stone', M.stone, paint(new THREE.ConeGeometry(0.2, 0.22, 8).translate(sx + dx, 0.61, sz + dz), sand1), { noCast: true });
  }
  for (const [x2, z2, w2, d2] of [[0, -0.75, 1.3, 0.2], [0, 0.75, 1.3, 0.2], [-0.75, 0, 0.2, 1.3], [0.75, 0, 0.2, 1.3]]) kit.put('stone', M.stone, bx(sx + x2 - w2 / 2, sx + x2 + w2 / 2, 0, 0.3, sz + z2 - d2 / 2, sz + z2 + d2 / 2, sand2), { noCast: true });
  kit.put('wood', M.wood, cy(sx, sz, 0.52, 1.15, 0.012, 0.012, 0xc7a572, 4), { noCast: true });
  kit.put('paint', M.paint, bx(sx, sx + 0.3, 0.92, 1.1, sz - 0.008, sz + 0.008, COL.red), { noCast: true });
  for (let k = 0; k < 5; k++) kit.put('paint', M.paint, sp(sx + Math.cos(k * 1.3) * 1.5, 0.03, sz + Math.sin(k * 1.3) * 1.5, 0.07, [0xf3e6cf, 0xe9b9a8][k % 2], { seg: 4, rings: 2, sy: 0.5 }), { noCast: true });
  // her spade and a little red bucket
  kit.put('wood', M.wood, bm(sx + 1.7, 0.12, sz - 0.3, sx + 2.3, 0.2, sz - 0.9, 0.04, 0.03, 0xc7a572), { noCast: true });
  kit.put('paint', M.paint, bx(sx + 2.3 - 0.08, sx + 2.3 + 0.08, 0.1, 0.13, sz - 1.0, sz - 0.82, 0xd6c28f), { noCast: true });
  kit.put('paint', M.paint, cy(sx - 1.6, sz + 0.9, 0, 0.26, 0.11, 0.15, 0xe0463a, 8), { noCast: true });
  // a post at the cliff path's foot with a lantern, and a lantern on every other path post going up
  kit.put('wood', M.wood, cy(-0.8, 14.6, 0, 1.7, 0.05, 0.06, COL.post, 6), { noCast: true });
  kit.put('glow', M.glow, sp(-0.8, 1.85, 14.6, 0.14, COL.warm, { seg: 6, rings: 4 }), { noCast: true });
  kit.put('paint', M.paint, cy(-0.8, 14.6, 1.7, 1.74, 0.16, 0.16, COL.dark, 6), { noCast: true });
  kit.put('paint', M.paint, cy(-0.8, 14.6, 1.97, 2.03, 0.14, 0.04, COL.dark, 6), { noCast: true });
}


// =============================================================================
// ROUND TWO
// =============================================================================

// ---- the cave: a wet cobbled floor, a tide pool, driftwood, a cask, and the light from the mouth -------------

function drawCaveFloor(kit, M) {
  const { CAVE: V } = P;
  const S = new Soup();
  // wet cobbles: flat rounded stones, dark and pale, packed across the floor with a gap for the walking line
  for (let i = 0; i < 70; i++) {
    const x = V.minX + 0.7 + (V.maxX - V.minX - 1.4) * h01(i, 1, 431);
    const z = V.minZ + 0.5 + (V.maxZ - V.minZ - 1.0) * h01(i, 2, 431);
    if (Math.hypot(x - -11.6, z - -20.2) < 0.5) continue;
    const tone = [0xa0916f, 0xb0a283, 0x8d7f63, 0xb9ab8c][i % 4];
    patch(S, x, 0.018, z, 0.09 + 0.1 * h01(i, 3, 431), 1100 + i, shadeHex(tone, 0.82), tone, 6, 1.2, 1);
  }
  // a tide pool with a sheen, and a dark wet fringe
  for (const [px, pz, r] of [[-9.6, -17.4, 0.3], [-13.4, -20.6, 0.3]]) {
    patch(S, px, 0.02, pz, r * 1.3, 1200 + r * 10, 0x8a7c62, 0x9a8c70, 9, 1.2, 1);
    patch(S, px, 0.028, pz, r, 1250 + r * 10, 0x4a7a8a, 0x6aa2b0, 9, 1.2, 1);
  }
  // a strand of weed along one wall's foot
  ribbon(S, [[-15.2, -21.2], [-13.8, -21.4], [-12.2, -21.1], [-10.8, -21.4]], 0.03, 0.14, 0x4e5a30, 0x66703a);
  kit.put('wet', M.stone, S.geometry(), { noCast: true });
  // a cask on its side, a plank of driftwood and a coil of rope by the lantern's pool of light
  const cx = -13.0; const cz = -17.4;
  const cask = new THREE.CylinderGeometry(0.34, 0.34, 0.7, 10);
  cask.rotateZ(Math.PI / 2);
  cask.translate(cx, 0.36, cz);
  kit.put('wood', M.wood, paint(cask, 0x8a5e38), { noCast: true });
  for (const dx of [-0.22, 0.22]) kit.put('wood', M.wood, paint(new THREE.CylinderGeometry(0.355, 0.355, 0.05, 10).rotateZ(Math.PI / 2).translate(cx + dx, 0.36, cz), 0x3c3a3a), { noCast: true });
  kit.put('wood', M.wood, bm(-9.8, 0.05, -20.8, -8.2, 0.07, -21.3, 0.2, 0.06, 0x9a8468), { noCast: true });
  kit.put('wood', M.wood, paint(new THREE.TorusGeometry(0.26, 0.055, 5, 12).rotateX(Math.PI / 2).translate(-10.8, 0.07, -17.2), COL.rope), { noCast: true });
  // the light from the mouth: a warm fan on the floor and two soft shafts leaning in from the opening (additive)
  const L = new Soup();
  const warm = 0x5a3a18;
  const fan = (z0, z1, xin) => {
    L.tri([V.maxX, 0.035, z0], [V.maxX, 0.035, z1], [xin, 0.035, (z0 + z1) / 2], warm, warm, 0x000000);
  };
  fan(V.minZ + 0.4, V.maxZ - 0.4, V.maxX - 5.5);
  for (const zz of [-20.4, -17.8]) {
    const shaft = 0x2c1e0c;
    L.both([V.maxX - 0.05, 0.1, zz - 0.25], [V.maxX - 0.05, V.roof - 0.15, zz - 0.25], [V.maxX - 3.4, 0.05, zz + 0.1], shaft, shaft, 0x000000);
    L.both([V.maxX - 0.05, V.roof - 0.15, zz - 0.25], [V.maxX - 0.05, V.roof - 0.15, zz + 0.25], [V.maxX - 3.4, 0.05, zz + 0.1], shaft, shaft, 0x000000);
  }
  kit.put('glowpatch', M.patch, L.geometry(), { noCast: true });
}

// ---- distance: low islands and headlands in the haze, gulls on the horizon, the low sun's glow ----------------

function drawDistance(kit, M) {
  const hazeCol = 0xf0b878;
  const isle = (x, z, r, h, salt, tone = 0x59607a) => {
    const g = new THREE.IcosahedronGeometry(r, 1);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const k = 0.8 + 0.4 * h01(Math.round(pos.getX(i) * 7) + salt, Math.round(pos.getZ(i) * 7), salt);
      pos.setXYZ(i, pos.getX(i) * k, Math.max(0, pos.getY(i)) * (h / r) * k, pos.getZ(i) * k);
    }
    g.translate(x, -0.2, z);
    kit.put('far', M.stone, paintBy(g, (px, py) => mixHex(tone, py > h * 0.62 ? 0x667a58 : 0x6a6470, 0.5)), { noCast: true });
  };
  // east, west and north headlands and a few small rocks, far enough to be half-fogged
  isle(118, -38, 26, 9, 11); isle(138, 26, 16, 6, 13); isle(-122, 42, 24, 8, 17, 0x5b5f78); isle(-98, -78, 14, 5, 19); isle(24, -132, 30, 10, 23);
  isle(86, 70, 8, 3, 29); isle(-70, 96, 10, 3.5, 31);
  // a far light: a thin white tower on the east headland
  kit.put('far', M.stone, cy(118, -38, 8, 12.6, 0.55, 0.4, 0xd8cfc0, 6), { noCast: true });
  kit.put('far', M.stone, cy(118, -38, 12.6, 13.4, 0.5, 0.5, 0xc2402f, 6), { noCast: true });
  void hazeCol;
  // gulls: small flat W shapes at different heights and distances (two wing tris each), still against the glow
  const G = new Soup();
  for (let i = 0; i < 14; i++) {
    const a = 3.4 + 2.6 * h01(i, 1, 441); const d = 70 + 90 * h01(i, 2, 441);
    const x = Math.cos(a) * d; const z = Math.sin(a) * d; const y = 14 + 28 * h01(i, 3, 441);
    const sz = 0.9 + 0.7 * h01(i, 4, 441);
    const yaw = h01(i, 5, 441) * 3;
    const ux = Math.cos(yaw) * sz; const uz = Math.sin(yaw) * sz;
    const c = 0xf4efe6;
    G.both([x, y, z], [x - ux, y + sz * 0.35, z - uz], [x - ux * 0.4, y + sz * 0.05, z - uz * 0.4 + 0.3], c, c, c);
    G.both([x, y, z], [x + ux, y + sz * 0.35, z + uz], [x + ux * 0.4, y + sz * 0.05, z + uz * 0.4 + 0.3], c, c, c);
  }
  kit.put('far', M.stone, G.geometry(), { noCast: true });
  // the low sun's glow: a wide additive gradient (no disc) standing in the sun's direction, low over the sea
  const sx = -36; const sz2 = -24;
  const len = Math.hypot(sx, sz2);
  const D = 232; const dx = (sx / len) * D; const dz = (sz2 / len) * D; const cyy = 16;
  const rx = -dz / D; const rz = dx / D; // the glow's own horizontal axis
  const SG = new Soup();
  const rings = [[0, 0xffe2a0], [28, 0x9a5c28], [62, 0x4a2a12], [110, 0x180e06]];
  const seg = 24;
  const at = (r, ang, ky) => [dx + rx * Math.cos(ang) * r, cyy + Math.sin(ang) * r * ky, dz + rz * Math.cos(ang) * r];
  for (let ring = 0; ring + 1 < rings.length; ring++) {
    for (let k = 0; k < seg; k++) {
      const a0 = (k / seg) * 6.283; const a1 = ((k + 1) / seg) * 6.283;
      const [r0, c0] = rings[ring]; const [r1, c1] = rings[ring + 1];
      SG.tri(at(r0, a0, 0.55), at(r1, a0, 0.55), at(r1, a1, 0.55), c0, c1, c1);
      SG.tri(at(r0, a0, 0.55), at(r1, a1, 0.55), at(r0, a1, 0.55), c0, c1, c0);
    }
  }
  // the glow hangs below the horizon too (it is drawn by view direction, so it just needs to stand clear of the sea): lift it
  const sunMesh = new THREE.Mesh(SG.geometry(), M.sunglow);
  sunMesh.name = 'lighthouse:sunglow';
  sunMesh.castShadow = false;
  sunMesh.userData.noCast = true;
  sunMesh.userData.noMerge = true;
  sunMesh.renderOrder = -1;
  sunMesh.frustumCulled = false;
  kit.addExtra(sunMesh);
}

// ---- soft contact shadows under the big things ------------------------------------------------------------

function drawContact(kit, M) {
  const S = new Soup();
  const disc = (x, y, z, rx, rz, strength, seg = 14) => {
    const mid = Math.round(255 * (1 - strength));
    const dark = (mid << 16) | (mid << 8) | mid;
    const half = (Math.round(255 * (1 - strength * 0.4)) << 16) | (Math.round(255 * (1 - strength * 0.4)) << 8) | Math.round(255 * (1 - strength * 0.4));
    const pt = (a, k) => [x + Math.cos(a) * rx * k, y, z + Math.sin(a) * rz * k];
    for (let k = 0; k < seg; k++) {
      const a0 = (k / seg) * 6.283; const a1 = ((k + 1) / seg) * 6.283;
      S.up([x, y, z], pt(a0, 0.55), pt(a1, 0.55), dark, half, half);
      S.up(pt(a0, 0.55), pt(a0, 1), pt(a1, 1), half, 0xffffff, 0xffffff);
      S.up(pt(a0, 0.55), pt(a1, 1), pt(a1, 0.55), half, 0xffffff, half);
    }
  };
  const Y0 = P.PLATEAU_Y;
  disc(P.TOWER.x, Y0 + 0.04, P.TOWER.z, 5.6, 5.6, 0.5, 22);
  disc(C0.x - 0.4, Y0 + 0.04, C0.z + 0.2, 5.6, 4.2, 0.42, 16);
  disc(P.FLAGPOLE.x, Y0 + 0.04, P.FLAGPOLE.z, 0.7, 0.7, 0.4, 8);
  for (const q of P.BOULDERS) {
    const onPlateau = P.PLATEAU.minX < q.x && q.x < P.PLATEAU.maxX && q.z < P.PLATEAU.maxZ;
    disc(q.x, (onPlateau ? Y0 : 0) + 0.04, q.z, q.r * 1.5, q.r * 1.5, 0.38, 10);
  }
  disc(P.BOAT.x, 0.04, P.BOAT.z, 2.5, 1.5, 0.4, 12);
  disc(8.8, 0.04, 32.7, 1.5, 0.9, 0.35, 8);
  disc(18.4, 0.04, 32.6, 1.5, 1.5, 0.3, 10);
  disc(1.5, 0.04, 9, 1.6, 0.6, 0.3, 8);
  P.POOLS.forEach((p) => disc(p.x, 0.045, p.z, p.r + 1.5, p.r + 1.5, 0.22, 12));
  disc(P.BENCH.x, Y0 + 0.04, P.BENCH.z, 1.4, 0.9, 0.35, 8);
  const mesh = new THREE.Mesh(S.geometry(), M.contact);
  mesh.name = 'lighthouse:contact';
  mesh.castShadow = false;
  mesh.userData.noCast = true;
  mesh.userData.noMerge = true;
  mesh.renderOrder = 1;
  kit.addExtra(mesh);
}

// ---- warm glows on the walls round the lit windows and slits -------------------------------------------------

function drawGlows(kit, M) {
  const S = new Soup();
  // a soft additive disc standing on a wall: `nx, nz` the wall's outward direction
  const wallGlow = (x, y, z, nx, nz, r, hex) => {
    const tx = -nz; const tz = nx;
    const seg = 12;
    const pt = (a, k) => [x + nx * 0.04 + tx * Math.cos(a) * r * k, y + Math.sin(a) * r * k, z + nz * 0.04 + tz * Math.cos(a) * r * k];
    const mid = hex; const half = shadeHex(hex, 0.35);
    for (let k = 0; k < seg; k++) {
      const a0 = (k / seg) * 6.283; const a1 = ((k + 1) / seg) * 6.283;
      S.both([x + nx * 0.04, y, z + nz * 0.04], pt(a0, 0.5), pt(a1, 0.5), mid, half, half);
      S.both(pt(a0, 0.5), pt(a0, 1), pt(a1, 1), half, 0x000000, 0x000000);
      S.both(pt(a0, 0.5), pt(a1, 1), pt(a1, 0.5), half, 0x000000, half);
    }
  };
  const Y0 = P.PLATEAU_Y;
  const wx = C0.x - 0.4;
  wallGlow(wx, Y0 + 1.6, CZ1, 0, 1, 1.5, 0x4a3414);
  wallGlow(CX1, Y0 + 1.5, C0.z, 1, 0, 1.2, 0x3e2c10);
  for (const [deg, y] of [[200, 9.2], [290, 10.9], [20, 12.2], [110, 8.4]]) {
    const r = (deg * Math.PI) / 180;
    const rr = P.TOWER.shaft - 0.5 * ((y - (Y0 + 1.05)) / (P.GALLERY_Y - (Y0 + 1.05))) + 0.02;
    wallGlow(P.TOWER.x + rr * Math.cos(r), y, P.TOWER.z + rr * Math.sin(r), Math.cos(r), Math.sin(r), 0.9, 0x40300f);
  }
  kit.put('glowpatch', M.patch, S.geometry(), { noCast: true });
}

// ---- the lamp: facets, a bright bulb, a brass band round the glass -----------------------------------------

function drawLampDetail(kit, M) {
  const { TOWER: T, LAMP_ROOM: LR } = P;
  // twelve vertical brass ribs round the lens (its facets) and a bulb inside
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * 6.283;
    kit.put('lens', M.lens, bx(T.x + Math.cos(a) * 0.49 - 0.02, T.x + Math.cos(a) * 0.49 + 0.02, LR.lensY - 0.5, LR.lensY + 0.95, T.z + Math.sin(a) * 0.49 - 0.02, T.z + Math.sin(a) * 0.49 + 0.02, COL.brass), { noCast: true });
  }
  kit.put('lens', M.lens, sp(T.x, LR.lensY + 0.4, T.z, 0.2, 0xfff0b8, { seg: 8, rings: 5 }), { noCast: true });
  // a brass band under the roof's rim, and a second stone course round the gallery's deck edge
  kit.put('paint', M.paint, paint(new THREE.CylinderGeometry(LR.r + 0.06, LR.r + 0.06, 0.12, 28, 1, true).translate(T.x, LR.roof - 0.12, T.z), COL.brass), { noCast: true });
}

// ---- the stair: bunting, lanterns, flower tubs ------------------------------------------------------------

function drawStairDetail(kit, M) {
  const { LANDINGS, PLATEAU_Y: Y0 } = P;
  const flights = P.LIGHTHOUSE_TRAVERSAL.crossings.filter((c) => c.kind === 'stair');
  const out = (p, d) => { const a = Math.atan2(p.z - P.TOWER.z, p.x - P.TOWER.x); return { x: p.x + d * Math.cos(a), z: p.z + d * Math.sin(a) }; };
  const flags = [COL.red, 0xf4efe0, 0xf2cf3a, 0x3f6f9e];
  let n = 0;
  for (const c of flights) {
    c.points.forEach((p, k) => {
      const o = out(p, 0.58);
      if (k % 3 === 1) {
        kit.put('glow', M.glow, sp(o.x, p.y + 1.18, o.z, 0.1, COL.warm, { seg: 6, rings: 4 }), { noCast: true });
        kit.put('paint', M.paint, cy(o.x, o.z, p.y + 0.95, p.y + 1.05, 0.03, 0.03, COL.dark, 5), { noCast: true });
        kit.put('paint', M.paint, cy(o.x, o.z, p.y + 1.29, p.y + 1.33, 0.12, 0.03, COL.dark, 6), { noCast: true });
      }
      if (k + 1 < c.points.length) {
        const q = c.points[k + 1]; const o2 = out(q, 0.58);
        // pennants hanging from the handrail, three to a span
        for (let f = 0; f < 3; f++) {
          const t = (f + 0.5) / 3;
          const x = o.x + (o2.x - o.x) * t; const z = o.z + (o2.z - o.z) * t; const y = p.y + (q.y - p.y) * t + 0.93;
          const ux = (o2.x - o.x); const uz = (o2.z - o.z); const l = Math.hypot(ux, uz) || 1;
          const dx = (ux / l) * 0.1; const dz = (uz / l) * 0.1;
          const hex = flags[(n++) % 4];
          const g = new THREE.BufferGeometry();
          const pos = [x - dx, y, z - dz, x + dx, y, z + dz, x, y - 0.24, z, x + dx, y, z + dz, x - dx, y, z - dz, x, y - 0.24, z];
          g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
          kit.put('paint', M.paint, paint(g, hex), { noCast: true });
        }
      }
    });
  }
  // flower tubs on the two middle ledges
  for (const p of LANDINGS.slice(1, 3)) {
    const o = out(p, 0.95);
    kit.put('wood', M.wood, cy(o.x, o.z, p.y, p.y + 0.3, 0.2, 0.17, 0x7a5232, 8), { noCast: true });
    kit.put('paint', M.paint, sp(o.x, p.y + 0.38, o.z, 0.22, 0x5f8a40, { seg: 6, rings: 3, sy: 0.7 }), { noCast: true });
    for (let k = 0; k < 4; k++) kit.put('paint', M.paint, sp(o.x + (k - 1.5) * 0.09, p.y + 0.48 + (k % 2) * 0.04, o.z + ((k * 7) % 3 - 1) * 0.08, 0.06, [0xe6586a, 0xf5d24a, 0xf4efe0, 0xe6586a][k], { seg: 4, rings: 2 }), { noCast: true });
  }
  void Y0;
}

// ---- a few big foreground rocks and tall tufts, so the near ground has a silhouette ----------------------

function drawForeground(kit, M) {
  const tones = [0xa59882, 0x8d7d68, 0xb3a58c, 0x837565];
  for (const [x, z, r, salt] of [[6.0, 38.4, 0.62, 1], [22.8, 39.4, 0.5, 2], [10.5, 26, 0.4, 3], [29.5, 33, 0.45, 4], [-1, 28, 0.55, 5]]) {
    kit.put('rocks', M.stone, boulder(x, -0.04, z, r, r * 0.7, 1300 + salt, tones, 1), { noCast: true });
    kit.put('rocks', M.stone, boulder(x + r * 1.1, -0.03, z + r * 0.4, r * 0.5, r * 0.34, 1310 + salt, tones, 0), { noCast: true });
    const T2 = new Soup();
    for (let k = 0; k < 3; k++) tuft(T2, x - r * 0.9 + k * 0.15, 0.02, z + r * 0.6, 1400 + salt * 5 + k, 0.5, 0x6f7d4a, 0xd4c98a, 6);
    kit.put('flora', M.stone, T2.geometry(), { noCast: true });
  }
  // tall grass along the plateau's cliff-top fence and round the plateau boulders
  const T = new Soup();
  let n = 0;
  for (const q of P.BOULDERS.filter((b) => P.PLATEAU.minX < b.x && b.x < P.PLATEAU.maxX && b.z < P.PLATEAU.maxZ)) {
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * 6.283 + q.x; const d = q.r * 1.15;
      tuft(T, q.x + Math.cos(a) * d, P.PLATEAU_Y, q.z + Math.sin(a) * d, 1500 + n++, 0.5, 0x56743a, 0xd8d28a, 6);
    }
  }
  for (let i = 0; i < 40; i++) {
    const z = -42 + 45 * h01(i, 1, 451);
    const x = -39.3 + 0.9 * h01(i, 2, 451);
    if (!lawnOk(x + 0.3, z)) continue;
    tuft(T, x, P.PLATEAU_Y, z, 1600 + i, 0.45, 0x56743a, 0xd8d28a, 6);
  }
  kit.put('flora', M.stone, T.geometry(), { noCast: true });
}

// -----------------------------------------------------------------------------------------------------

export function drawBeauty(kit, M) {
  drawFarSea(kit, M);
  drawFoam(kit, M);
  drawSand(kit, M);
  drawCliffFoot(kit, M);
  drawCaveRoof(kit, M);
  drawLawn(kit, M);
  drawTowerDetail(kit, M);
  drawCottageDetail(kit, M);
  drawGardenDetail(kit, M);
  drawCoveProps(kit, M);
  drawCaveFloor(kit, M);
  drawDistance(kit, M);
  drawGlows(kit, M);
  drawLampDetail(kit, M);
  drawStairDetail(kit, M);
  drawForeground(kit, M);
  drawContact(kit, M);
}
