import { box, cyl, ball, sheet, hash01, FARM_COLORS } from './farmparts.js';

// Appletree Farm beauty round (docs/beauty-backlog.md FRM-1 and FRM-3, plus a
// few story props). Nothing here is a mesh of its own: farmBeautyParts hands
// back painted geometry that farmparts.crops folds into the existing noCast
// farmCrops mesh, so the farm gains no mesh and no draw. It draws nothing
// from Math.random (hash01 only), so every seeded layout stays put, and it
// builds inside the farm-models local uuid stream (farm.js).
//   * wildflower clumps along the wheat field edge, and daisy and grass tufts
//     at the foot of the pasture, paddock and hen run fences;
//   * ground wear: tractor ruts, a mud wallow and hoof prints at the trough,
//     scattered straw by the barn, the sheds and the round bales;
//   * the vegetable beds: board edging and a row of marigolds each end;
//   * the pond: shore pebbles and marsh marigolds;
//   * story props: milk churns, feed sacks, a wheelbarrow, a bucket, a
//     watering can.
// The holiday spots (the porch tree and the barn menorah, holidayspots.js FARM)
// are kept clear, so the decor sits clean.

const FLOWERS = [0xd8382e, 0x5a7ad8, 0xf4f0e6, 0xf2c94c, 0xe090c0];
const T = {
  grass: 0x4e8a3e, grassLo: 0x3c6e32, rut: 0x7a6242, mud: 0x5a4430, mudLo: 0x4a3626,
  straw: FARM_COLORS.straw, strawDark: FARM_COLORS.strawDark, plank: 0xa07a4c, pebble: 0x9a968c,
  pebbleLo: 0x7c786f, tin: 0x9aa4a8, tinDark: 0x6c767a, sack: 0xd8c79a, marigold: 0xf08a2a, can: 0x4f7ea8,
};
// Where decor stands: [x, z, radius] clear zones.
const KEEP = Object.freeze([[-15.8, 11, 2.8], [-16, 8, 2.4], [0, -10.4, 2.0]]);
const kept = (x, z) => KEEP.some(([kx, kz, r]) => Math.hypot(x - kx, z - kz) < r);
function distSeg(px, pz, x1, z1, x2, z2) {
  const dx = x2 - x1, dz = z2 - z1;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (pz - z1) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(px - x1 - dx * t, pz - z1 - dz * t);
}

// A grass tuft: three thin double-sided blades.
function tuft(P, x, z, s = 1, salt = 0) {
  for (let k = 0; k < 2; k++) {
    const a = hash01(x + k, z, 71 + salt) * Math.PI * 2;
    const h = (0.16 + 0.12 * hash01(x, z + k, 72 + salt)) * s;
    const dx = Math.cos(a) * 0.05, dz = Math.sin(a) * 0.05;
    sheet(P, [[x - dz, 0, z + dx], [x + dz, 0, z - dx], [x + dx * 1.4, h, z + dz * 1.4]], k ? T.grass : T.grassLo);
  }
}
// A wildflower: a leaning stem and a small head.
function flower(P, x, z, hex, salt = 0) {
  const h = 0.2 + 0.18 * hash01(x, z, 73 + salt);
  const a = hash01(x, z, 74 + salt) * Math.PI * 2;
  const lx = Math.cos(a) * 0.03, lz = Math.sin(a) * 0.03;
  sheet(P, [[x - 0.012, 0, z], [x + 0.012, 0, z], [x + lx, h, z + lz]], T.grass);
  // the head: a small upturned cone, a cup of petals (about 8 triangles with its stem)
  cyl(P, 0.05 + 0.02 * hash01(x, z, 75 + salt), 0, 0.09, x + lx, h - 0.02, z + lz, hex, { sides: 4, yaw: a });
}
function clump(P, cx, cz, hex, n = 3, spread = 0.3, salt = 0) {
  for (let i = 0; i < n; i++) {
    const x = cx + (hash01(cx + i, cz, 76 + salt) - 0.5) * spread * 2;
    const z = cz + (hash01(cx, cz + i, 77 + salt) - 0.5) * spread * 2;
    if (!kept(x, z)) flower(P, x, z, hex, salt + i);
  }
  tuft(P, cx, cz + 0.05, 1.1, salt);
}

function fieldEdge(P, f, trackSeg) {
  const spots = [];
  for (let x = f.minX + 0.6; x < f.maxX; x += 2.4) { spots.push([x, f.maxZ + 0.55 + hash01(x, 1, 80) * 0.6]); spots.push([x + 0.9, f.minZ - 0.7 - hash01(x, 2, 81) * 0.6]); }
  for (let z = f.minZ + 1; z < f.maxZ; z += 2.6) { spots.push([f.minX - 0.6 - hash01(z, 3, 82) * 0.5, z]); spots.push([f.maxX + 0.6 + hash01(z, 4, 83) * 0.5, z + 0.7]); }
  spots.forEach(([x, z], i) => {
    if (hash01(x, z, 84) < 0.45 || kept(x, z)) return;
    if (distSeg(x, z, ...trackSeg) < 1.6) return;
    clump(P, x, z, FLOWERS[i % FLOWERS.length], 3, 0.32, i);
  });
}

// Tufts (and now and then a daisy) at the foot of a rail or wire fence, outside it.
function fenceFoot(P, r, gaps) {
  const run = (x1, z1, x2, z2, nx, nz) => {
    const len = Math.hypot(x2 - x1, z2 - z1), n = Math.floor(len / 3.0);
    for (let i = 0; i <= n; i++) {
      const t = i / Math.max(1, n);
      const x = x1 + (x2 - x1) * t + nx * 0.32, z = z1 + (z2 - z1) * t + nz * 0.32;
      if (gaps.some(([gx, gz, gr]) => Math.hypot(x - gx, z - gz) < gr) || kept(x, z)) continue;
      tuft(P, x, z, 1.25, i);
      if (hash01(x, z, 86) < 0.35) flower(P, x + 0.2, z + 0.1, FLOWERS[i % 3 + 1], i);
    }
  };
  run(r.minX, r.minZ, r.maxX, r.minZ, 0, -1);
  run(r.minX, r.maxZ, r.maxX, r.maxZ, 0, 1);
  run(r.minX, r.minZ, r.minX, r.maxZ, -1, 0);
  run(r.maxX, r.minZ, r.maxX, r.maxZ, 1, 0);
}

// A scatter of straw: flat little bundles at random yaws.
function straw(P, cx, cz, n, spread) {
  for (let i = 0; i < n; i++) {
    const x = cx + (hash01(cx + i, cz, 90) - 0.5) * spread * 2;
    const z = cz + (hash01(cx, cz + i, 91) - 0.5) * spread * 1.4;
    if (kept(x, z)) continue;
    box(P, 0.3 + 0.2 * hash01(x, z, 92), 0.014, 0.035, x, 0.02, z, i % 3 ? T.straw : T.strawDark, { yaw: hash01(x, z, 93) * 3.14 });
  }
}

function wear(P) {
  // tractor ruts from the mouth of the shed out into the yard
  for (const s of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      const t = i / 5, x = 12.6 - t * 4.6, z = -6 + s * 0.62 + t * 2.4 * 1.0;
      box(P, 1.2, 0.012, 0.26, x, 0.018, z, T.rut, { yaw: 0.48, shade: 0.9 + 0.1 * hash01(x, z, 94) });
    }
  }
  // the mud wallow and hoof prints at the cow trough
  cyl(P, 1.25, 1.25, 0.012, 26.0, 0.016, 2.0, T.mud, { sides: 10 });
  cyl(P, 0.8, 0.8, 0.014, 25.3, 0.02, 3.3, T.mudLo, { sides: 8 });
  cyl(P, 0.7, 0.7, 0.014, 26.4, 0.02, 0.6, T.mudLo, { sides: 8 });
  for (let i = 0; i < 5; i++) {
    const x = 25.2 + hash01(i, 1, 95) * 1.9, z = 0.2 + hash01(i, 2, 96) * 3.2;
    box(P, 0.09, 0.016, 0.06, x, 0.024, z, T.mud, { yaw: hash01(i, 3, 97) * 3 });
    box(P, 0.09, 0.016, 0.06, x + 0.06, 0.024, z + 0.12, T.mud, { yaw: hash01(i, 3, 97) * 3 });
  }
  straw(P, 4.0, -9.6, 10, 2.6);   // by the hay bales at the barn
  straw(P, 13.0, 11.6, 8, 1.2);   // the milking shed door
  straw(P, 19.1, -20.6, 5, 1.6);  // the round bales
  straw(P, 12.4, 3.8, 6, 1.0);    // the grain store door
}

function beds(P, bedRects) {
  for (const b of bedRects) {
    const w = b.maxX - b.minX, d = b.maxZ - b.minZ, cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
    for (const z of [b.minZ - 0.05, b.maxZ + 0.05]) box(P, w + 0.2, 0.16, 0.07, cx, 0, z, T.plank);
    for (const x of [b.minX - 0.05, b.maxX + 0.05]) box(P, 0.07, 0.16, d + 0.2, x, 0, cz, T.plank);
    for (const [x, z] of [[b.minX, b.minZ], [b.maxX, b.minZ], [b.minX, b.maxZ], [b.maxX, b.maxZ]]) box(P, 0.1, 0.22, 0.1, x, 0, z, T.plank, { shade: 0.8 });
  }
  // marigolds along the outer long edges
  const first = bedRects[0], last = bedRects[bedRects.length - 1];
  for (const [rect, z] of [[first, first.minZ - 0.5], [last, last.maxZ + 0.5]]) {
    for (let x = rect.minX + 0.4; x < rect.maxX; x += 0.8) flower(P, x, z + (hash01(x, z, 98) - 0.5) * 0.12, T.marigold, 9);
  }
}

function pond(P, pd, jetty) {
  for (let i = 0; i < 14; i++) {
    const a = hash01(i, 1, 100) * Math.PI * 2, r = pd.r + 0.15 + hash01(i, 2, 101) * 0.7;
    const x = pd.x + Math.cos(a) * r, z = pd.z + Math.sin(a) * r;
    if (z > jetty.minZ - 1.2 && z < jetty.maxZ + 1.2 && x > pd.x) continue; // the jetty and the track
    const s = 0.07 + 0.08 * hash01(i, 3, 102);
    ball(P, s, x, s * 0.4, z, i % 2 ? T.pebble : T.pebbleLo, { sy: 0.55, yaw: i });
  }
  for (const a of [-1.75, -1.3, 1.3, 1.75]) {
    clump(P, pd.x + Math.cos(a) * (pd.r + 0.5), pd.z + Math.sin(a) * (pd.r + 0.5), 0xf2c94c, 3, 0.22, 30);
  }
}

function props(P) {
  for (const [x, z] of [[13.05, 10.2], [13.05, 10.75]]) { // milk churns
    cyl(P, 0.2, 0.27, 0.62, x, 0, z, T.tin, { sides: 8 });
    cyl(P, 0.14, 0.2, 0.12, x, 0.62, z, T.tin, { sides: 8 });
    cyl(P, 0.06, 0.06, 0.06, x, 0.74, z, T.tinDark, { sides: 6 });
    cyl(P, 0.285, 0.285, 0.05, x, 0.22, z, T.tinDark, { sides: 8 });
  }
  for (const [x, z, y, yaw] of [[12.95, 5.5, 0, 0.1], [13.0, 6.2, 0, -0.2], [12.98, 5.85, 0.36, 0.3]]) { // feed sacks
    box(P, 0.34, 0.36, 0.5, x, y, z, T.sack, { yaw });
    box(P, 0.28, 0.07, 0.4, x, y + 0.36, z, T.sack, { yaw, shade: 0.88 });
    box(P, 0.1, 0.05, 0.1, x, y + 0.43, z, T.strawDark, { yaw });
  }
  // a wheelbarrow by the vegetable beds: tray, legs, handles and a wheel
  const wb = (lx, lz) => [-26.6 + lx * Math.cos(0.4) + lz * Math.sin(0.4), 19.9 - lx * Math.sin(0.4) + lz * Math.cos(0.4)];
  const tray = (w, h, d, lx, y, lz, hex) => { const [x, z] = wb(lx, lz); box(P, w, h, d, x, y, z, hex, { yaw: 0.4 }); };
  tray(0.7, 0.05, 0.45, 0, 0.26, 0, 0x3f6b4a);
  tray(0.7, 0.16, 0.04, 0, 0.3, 0.22, 0x3f6b4a);
  tray(0.7, 0.16, 0.04, 0, 0.3, -0.22, 0x3f6b4a);
  tray(0.04, 0.16, 0.45, 0.35, 0.3, 0, 0x3f6b4a);
  tray(0.04, 0.16, 0.45, -0.35, 0.3, 0, 0x3f6b4a);
  for (const lz of [-0.2, 0.2]) { tray(0.06, 0.26, 0.05, -0.3, 0, lz, 0x6b5138); tray(0.5, 0.03, 0.04, -0.55, 0.36, lz, 0x6b5138); }
  { const [x, z] = wb(0.42, 0); cyl(P, 0.14, 0.14, 0.05, x, 0.14, z, 0x2b2b30, { sides: 8, pitch: Math.PI / 2, c: true, yaw: 0.4 }); }
  // a bucket tipped by the well, and a watering can at the beds
  cyl(P, 0.17, 0.13, 0.26, -5.2, 0, 8.3, T.tin, { sides: 8 });
  cyl(P, 0.14, 0.14, 0.2, -24.6, 0, 23.7, T.can, { sides: 8 });
  box(P, 0.24, 0.03, 0.03, -24.4, 0.2, 23.7, T.can, { yaw: 0.5, roll: 0.5 });
  box(P, 0.03, 0.03, 0.2, -24.7, 0.3, 23.7, T.can, { yaw: 0.2 });
}

export function farmBeautyParts(spec) {
  const P = [];
  fieldEdge(P, spec.wheat, spec.wheatTrack);
  fenceFoot(P, spec.pasture, [[spec.pastureGate.x, spec.pastureGate.z, 2.2]]);
  fenceFoot(P, spec.paddock, [[spec.goatGate.x, spec.goatGate.z, 2.4]]);
  fenceFoot(P, spec.henRun, [[spec.henRun.maxX, -7, 1.6]]);
  wear(P);
  beds(P, spec.beds);
  pond(P, spec.pond, spec.jetty);
  props(P);
  return P;
}
