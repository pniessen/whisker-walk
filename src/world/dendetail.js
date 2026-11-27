// den-beauty: what a lived-in room has on its floor and walls. Looks only,
// folded into the existing denRagRug mesh (noCast, one draw): no new mesh,
// no collider, no shadow caster.
//
//   floor   boards that differ a little in tone with butt joints, a worn
//           lane from the cat flap, a warm pool under the lamp and another
//           before the hearth, the window sunlight laid on the boards
//   mats    two round nests with a raised rim and a cushion
//   prints  a trail of muddy paw prints in from the cat flap, fading out
//   walls   herb bundles hung under the picture rail (north and east) and
//           claw scratches low on the west wall
//
// Everything is flat paint on the floor (under 2 cm) or within 3 cm of a
// wall plane, so nothing here can touch the camera wedge or a walkable
// surface. Own seeded stream, so the older draws of the shell do not move.
import { mulberry32, seedFromCode } from '../rng.js';

const FLOOR = 0x9a7048;
const BOARD = 0.6;       // the seams are 0.6 m apart (floorSeams(18, 30))
const UP = [0, 1, 0];

// the worn lane: from the cat flap across the room to the middle of the floor
const LANE = [[-7.3, -8.6], [-5.6, -5.4], [-3.0, -2.4], [0, 0.6]];

function laneDist(x, z) {
  let best = 99;
  for (let i = 0; i < LANE.length - 1; i++) {
    const [ax, az] = LANE[i];
    const [bx, bz] = LANE[i + 1];
    const dx = bx - ax;
    const dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(x - (ax + dx * t), z - (az + dz * t)));
  }
  return best;
}

function floorBoards(s, rnd) {
  const y = 0.009;
  const n = 30;
  for (let i = 0; i < n; i++) {
    const x0 = -9 + i * BOARD + 0.03;
    const x1 = x0 + BOARD - 0.06;
    let z = -8.9 + rnd() * 1.4;
    let first = true;
    let z0 = -8.9;
    while (z0 < 8.9) {
      const len = 1.8 + rnd() * 2.6;
      const z1 = Math.min(8.9, z0 + (first ? z - z0 + 0.4 : len));
      first = false;
      const mid = (z0 + z1) / 2;
      const worn = Math.max(0, 1 - laneDist((x0 + x1) / 2, mid) / 1.3);
      const tone = (0.93 + rnd() * 0.15) * (1 + worn * 0.07);
      s.quad([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], UP, FLOOR, tone);
      // the butt joint: a thin dark line across the end of the board
      s.quad([x0, y + 0.001, z1 - 0.012], [x1, y + 0.001, z1 - 0.012], [x1, y + 0.001, z1 + 0.012],
        [x0, y + 0.001, z1 + 0.012], UP, 0x7a5636, 0.95);
      z0 = z1;
    }
  }
}

// concentric rings of a lighter, warmer tone, soft by stepping
function glowPool(s, cx, cz, rx, rz, hexes, y) {
  const SEG = 24;
  const pt = (f, i) => {
    const a = (i / SEG) * Math.PI * 2;
    return [cx + Math.cos(a) * rx * f, y, cz + Math.sin(a) * rz * f];
  };
  hexes.forEach((hex, r) => {
    const f0 = r / hexes.length;
    const f1 = (r + 1) / hexes.length;
    for (let i = 0; i < SEG; i++) {
      if (r === 0) s.tri([cx, y, cz], pt(f1, i), pt(f1, i + 1), UP, hex);
      else s.quad(pt(f0, i), pt(f1, i), pt(f1, i + 1), pt(f0, i + 1), UP, hex);
    }
  });
  // draw order of overlapping pools is by height, so the outer ring is the
  // lowest layer: callers pass hexes from the centre outward at one y
}

// the three window panes' light, thrown across the boards and skewed east
function sunOnFloor(s) {
  const y = 0.0115;
  const skew = 1.5;
  const zNear = -8.6;
  const zFar = -4.6;
  const panes = [[-2.0, -0.75], [-0.55, 0.7], [0.9, 2.15]];
  for (const [xa, xb] of panes) {
    s.quad([xa - 0.1, y, zNear], [xb + 0.1, y, zNear], [xb + 0.1 + skew, y, zFar], [xa - 0.1 + skew, y, zFar],
      UP, 0xc99a5c);
    s.quad([xa, y + 0.0008, zNear + 0.3], [xb, y + 0.0008, zNear + 0.3],
      [xb + skew * 0.93, y + 0.0008, zFar - 0.35], [xa + skew * 0.93, y + 0.0008, zFar - 0.35], UP, 0xe6bd78);
  }
}

function nest(s, cx, cz, r, rim, bed, cushion) {
  const SEG = 20;
  const ring = (a, b, y, hex, shade = 1) => {
    for (let i = 0; i < SEG; i++) {
      const t0 = (i / SEG) * Math.PI * 2;
      const t1 = ((i + 1) / SEG) * Math.PI * 2;
      const p = (rad, t) => [cx + Math.cos(t) * rad, y, cz + Math.sin(t) * rad];
      s.quad(p(a, t0), p(b, t0), p(b, t1), p(a, t1), UP, hex, shade * (i % 2 ? 0.93 : 1));
    }
  };
  ring(0, r, 0.013, bed);                 // the bed
  ring(r * 0.78, r, 0.018, rim);          // a rolled rim
  ring(r * 0.66, r * 0.78, 0.0155, rim, 0.8); // its inner shadow
  for (let i = 0; i < SEG; i++) {         // the cushion, two steps
    const t0 = (i / SEG) * Math.PI * 2;
    const t1 = ((i + 1) / SEG) * Math.PI * 2;
    const c = [cx, 0.0185, cz];
    s.tri(c, [cx + Math.cos(t0) * r * 0.5, 0.0185, cz + Math.sin(t0) * r * 0.5],
      [cx + Math.cos(t1) * r * 0.5, 0.0185, cz + Math.sin(t1) * r * 0.5], UP, cushion, i % 2 ? 0.95 : 1);
  }
}

// a paw print flat on the boards at (x, z), the toes pointing along `yaw`
function paw(s, x, z, yaw, hex, shade) {
  const y = 0.016;
  const c = Math.cos(yaw);
  const sn = Math.sin(yaw);
  // (u across, v forward) to world
  const K = 1.6; // a full-grown cat print
  const P = (u, v) => [x + K * (u * c + v * sn), y, z + K * (-u * sn + v * c)];
  const blob = (u, v, w, h) => {
    s.quad(P(u - w, v - h), P(u + w, v - h), P(u + w * 0.8, v + h), P(u - w * 0.8, v + h), UP, hex, shade);
  };
  s.tri(P(-0.045, -0.03), P(0.045, -0.03), P(0, 0.05), UP, hex, shade);   // the pad
  s.quad(P(-0.05, -0.05), P(0.05, -0.05), P(0.04, -0.02), P(-0.04, -0.02), UP, hex, shade);
  blob(-0.058, 0.085, 0.017, 0.022);
  blob(-0.02, 0.115, 0.017, 0.024);
  blob(0.02, 0.115, 0.017, 0.024);
  blob(0.058, 0.085, 0.017, 0.022);
}

function pawTrail(s, rnd) {
  // from the cat flap in towards the middle, fading as the mud wears off
  const from = [-7.45, -8.0];
  const to = [-4.4, -3.6];
  const n = 9;
  const yaw = Math.atan2(to[0] - from[0], to[1] - from[1]);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const side = i % 2 ? 1 : -1;
    const ux = Math.cos(yaw);
    const uz = -Math.sin(yaw);
    const x = from[0] + (to[0] - from[0]) * t + ux * side * 0.11 + (rnd() - 0.5) * 0.05;
    const z = from[1] + (to[1] - from[1]) * t + uz * side * 0.11 + (rnd() - 0.5) * 0.05;
    paw(s, x, z, yaw + (rnd() - 0.5) * 0.25, 0x4a3220, 1 + t * 0.9);
  }
}

// ---- the walls ----------------------------------------------------------------------------------
// plane: maps (u along the wall, h up, depth off the plane) to world, n faces the room
const NORTH = { at: (u, h, d) => [u, h, -8.86 + d], n: [0, 0, 1] };
const EAST = { at: (u, h, d) => [8.86 - d, h, u], n: [-1, 0, 0] };

function herbBundle(s, plane, u, top, leafHex, stemHex, bloomHex, rnd) {
  // twine knot on a nail
  s.quad(plane.at(u - 0.035, top, 0.004), plane.at(u + 0.035, top, 0.004),
    plane.at(u + 0.035, top - 0.07, 0.004), plane.at(u - 0.035, top - 0.07, 0.004), plane.n, 0xb89a62);
  const stems = 5;
  for (let k = 0; k < stems; k++) {
    const f = k / (stems - 1) - 0.5;
    const len = 0.42 + rnd() * 0.3;
    const x0 = u + f * 0.03;
    const x1 = u + f * 0.2;
    const hb = top - 0.07 - len;
    const d = 0.006 + k * 0.001;
    // the stem, a thin tapered strip
    s.quad(plane.at(x0 - 0.007, top - 0.07, d), plane.at(x0 + 0.007, top - 0.07, d),
      plane.at(x1 + 0.004, hb, d), plane.at(x1 - 0.004, hb, d), plane.n, stemHex);
    // leaves in pairs down the lower two thirds
    for (let j = 0; j < 4; j++) {
      const t = 0.3 + j * 0.2;
      const lx = x0 + (x1 - x0) * t;
      const ly = top - 0.07 - len * t;
      const lw = 0.05 - j * 0.004;
      const shade = 0.9 + rnd() * 0.2;
      for (const sd of [-1, 1]) {
        s.tri(plane.at(lx, ly, d + 0.001), plane.at(lx + sd * lw, ly - 0.025, d + 0.001),
          plane.at(lx + sd * lw * 0.3, ly - 0.07, d + 0.001), plane.n, leafHex, shade);
      }
    }
    // the tip: a bud or a bloom
    s.quad(plane.at(x1 - 0.014, hb + 0.02, d + 0.002), plane.at(x1 + 0.014, hb + 0.02, d + 0.002),
      plane.at(x1 + 0.01, hb - 0.035, d + 0.002), plane.at(x1 - 0.01, hb - 0.035, d + 0.002),
      plane.n, bloomHex, 0.9 + rnd() * 0.2);
  }
}

// four claw scratches, pale where the paint is gone, on the sage wainscot
function scratches(s, z, y0) {
  const plane = { at: (u, h, d) => [-8.86 + d, h, u], n: [1, 0, 0] };
  for (let k = 0; k < 4; k++) {
    const u = z + (k - 1.5) * 0.045;
    s.quad(plane.at(u - 0.004, y0 + 0.08, 0.004), plane.at(u + 0.004, y0 + 0.08, 0.004),
      plane.at(u + 0.012, y0 + 0.55 - k * 0.03, 0.004), plane.at(u + 0.002, y0 + 0.55 - k * 0.03, 0.004),
      plane.n, 0xdde2c4, 1);
  }
}

export function addDenDetail(s) {
  const rnd = mulberry32(seedFromCode('DENDETAIL'));
  floorBoards(s, rnd);
  // the pools, widest and dimmest underneath
  glowPool(s, 0, -6, 2.3, 2.0, [0xc08a58, 0xb98352, 0xb07c4d, 0xa87548], 0.0098);
  glowPool(s, -6, 6.9, 2.9, 1.7, [0xc88a52, 0xbd8250, 0xb37a4b, 0xa87249], 0.0099);
  sunOnFloor(s);
  nest(s, -3.5, 3.6, 0.72, 0xe8d0b8, 0xc98a8a, 0xdba3a0);
  nest(s, 4.6, 2.2, 0.62, 0xe0d8c4, 0x7a8fa6, 0x9fb4c8);
  pawTrail(s, rnd);
  herbBundle(s, NORTH, 3.4, 2.24, 0x7a8f56, 0x6a7a44, 0x9a82b0, rnd);
  herbBundle(s, NORTH, 4.05, 2.24, 0x93a46a, 0x7a8456, 0xd8c070, rnd);
  herbBundle(s, NORTH, 4.7, 2.24, 0x6f8a5c, 0x66783f, 0xb8483a, rnd);
  herbBundle(s, EAST, 6.3, 2.24, 0x8a9c60, 0x6a7a44, 0xc87a5a, rnd);
  herbBundle(s, EAST, 6.95, 2.24, 0x7a8f56, 0x6a7a44, 0x9a82b0, rnd);
  scratches(s, 3.6, 0.2);
  scratches(s, 4.2, 0.28);
}
