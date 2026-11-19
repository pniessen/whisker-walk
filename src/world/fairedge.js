import { box, cyl, ball, sheet, stripes, bunting, hash01 } from './fairkit.js';
import { FAIR_PAINT } from './fairparts.js';

// =============================================================================
// THE FAIRGROUND'S EDGES AND ODDS AND ENDS (polish): the things a village
// fair has round its rides and along its boundary that are nobody's ride or
// stall. Built with the kit (world/fairkit.js) onto a kit's lists, like
// everything in fairparts.js, so they cost triangles but no mesh, no draw
// and no caster of their own. fair.js places them and owns their colliders.
//
// The rules are fairparts.js's: everything here makes THREE objects, so it
// runs inside fair.js's withLocalUuids; variation is hash01, never random.
// =============================================================================

const C = FAIR_PAINT;

// A flat polygon of n corners, radius r, centred at (x, y, z), facing up;
// `tilt` leans its face outward, towards the angle `a` (a flower head on a
// mound). One face: the kit's solid mesh draws front faces only.
function lid(P, r, y, hex, n = 7, x = 0, z = 0, turn = 0, tilt = 0, a = 0) {
  // the face's normal, and two directions in its plane whose cross product is it
  const nx = Math.sin(tilt) * Math.cos(a);
  const ny = Math.cos(tilt);
  const nz = Math.sin(tilt) * Math.sin(a);
  const e1 = [-Math.sin(a), 0, Math.cos(a)];
  const e2 = [ny * e1[2] - nz * e1[1], nz * e1[0] - nx * e1[2], nx * e1[1] - ny * e1[0]];
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = turn + (i / n) * Math.PI * 2;
    const c = Math.cos(t) * r;
    const s = Math.sin(t) * r;
    pts.push([x + c * e1[0] + s * e2[0], y + c * e1[1] + s * e2[1], z + c * e1[2] + s * e2[2]]);
  }
  return sheet(P, pts, hex);
}

// ---- a flower tub -------------------------------------------------------------------------
// A half barrel of flowers: what the fair plants where the lawns have their
// flower patches (the butterflies' corners). About 90 triangles.
export const TUB = Object.freeze({ r: 0.42, h: 0.42 });
const TUB_FLOWERS = Object.freeze([0xf2a0c0, 0xf9d648, 0xffffff, 0xf58a2e, 0xe8423a, 0xb98ae0]);
export function flowerTub(K, salt = 0) {
  const P = K.solid;
  const { r, h } = TUB;
  // the staves (open: the soil and the leaves fill the top), one iron hoop, the soil
  cyl(P, r, r - 0.06, h, 0, 0, 0, 0xa8743f, { sides: 9, open: true });
  cyl(P, r + 0.012, r - 0.005, 0.06, 0, h - 0.13, 0, 0x4a4038, { sides: 9, open: true });
  lid(P, r - 0.02, h - 0.04, 0x5a3d26, 9);
  // a mound of leaves, and flowers all over it, each leaning out a little
  const mr = r - 0.05;
  const mh = 0.17;
  ball(P, mr, 0, h, 0, 0x4e9440, { sy: mh / mr, yaw: salt });
  for (let i = 0; i < 12; i++) {
    const a = i * 2.4 + salt;
    const d = (mr - 0.03) * Math.sqrt((i + 0.4 * hash01(i, salt, 3)) / 12); // spread evenly over the mound
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    const y = h + mh * 0.98 * Math.sqrt(Math.max(0, 1 - (d / mr) ** 2)) + 0.012;
    const tilt = Math.min(0.9, (d / mr) * 1.1);
    const hex = TUB_FLOWERS[(i + Math.round(salt * 3)) % TUB_FLOWERS.length];
    lid(P, 0.085, y, hex, 5, x, z, a, tilt, a);
    lid(P, 0.028, y + 0.008, hex === C.yellow ? C.orange : C.yellow, 3, x + Math.sin(tilt) * Math.cos(a) * 0.008, z + Math.sin(tilt) * Math.sin(a) * 0.008, a, tilt, a);
  }
}

// ---- hay bales -------------------------------------------------------------------------
// A small square bale of straw, its long side along x, two strings round it.
// About 36 triangles (the bottom faces go in fair.js's ground pass).
export const BALE = Object.freeze({ l: 1.0, h: 0.45, w: 0.5 });
const STRAW = Object.freeze([0xdcb862, 0xd2ac55, 0xe3c372]);
export function hayBale(P, x, y, z, yaw = 0, salt = 0) {
  const { l, h, w } = BALE;
  const hex = STRAW[Math.floor(hash01(x, z, salt) * STRAW.length) % STRAW.length];
  const shade = 0.92 + 0.1 * hash01(z, x, salt + 1);
  const ca = Math.cos(yaw);
  const sa = Math.sin(yaw);
  // a point `u` along the bale, in the world
  const at = (u) => [x + u * ca, z - u * sa];
  box(P, l, h, w, x, y, z, hex, { yaw, shade });
  for (const u of [-0.25, 0.25]) {
    const [bx, bz] = at(u * l);
    box(P, 0.035, h + 0.012, w + 0.012, bx, y - 0.003, bz, 0x9a7a3a, { yaw, shade });
  }
}
// A stack: `n` bales end to end along x (centred), and n - 1 on top of them.
export function baleStack(K, n = 2, salt = 0) {
  const P = K.solid;
  const { l, h } = BALE;
  for (let i = 0; i < n; i++) hayBale(P, (i - (n - 1) / 2) * (l + 0.04), 0, 0, 0, salt + i);
  for (let i = 0; i < n - 1; i++) hayBale(P, (i - (n - 2) / 2) * (l + 0.04), h, 0.02, 0.06 * (hash01(i, salt, 9) - 0.5), salt + 7 + i);
}

// ---- the edges: what stands round a fair that is nobody's ride ----------------------------
// A tall flag pole for a corner of the field, seen from anywhere inside: a
// striped pole, a gold knob, a flag at the top, and strings of bunting from
// the top down to two pegs in the grass (`lines`: [[dx, dz], ...] where the
// pegs go, in the pole's frame).
export const CORNER_FLAG = Object.freeze({ h: 8.2, flagW: 1.9, flagH: 1.1 });
export function cornerFlag(K, colors = [C.red, C.white], lines = [], salt = 0) {
  const { h, flagW, flagH } = CORNER_FLAG;
  stripes(K.solid, 0.11, 0, 0.07, h, colors, 0, 0, 0, { sides: 6 });
  ball(K.solid, 0.16, 0, h + 0.12, 0, C.gold);
  // the flag, two colours split on the diagonal, flying east
  const y1 = h - 0.08;
  const y0 = y1 - flagH;
  sheet(K.flags, [[0.06, y1, 0], [0.06 + flagW, y1 - 0.05, 0], [0.06, y0, 0]], colors[0]);
  sheet(K.flags, [[0.06 + flagW, y1 - 0.05, 0], [0.06 + flagW, y0 + 0.05, 0], [0.06, y0, 0]], colors[1] === C.white ? C.gold : colors[1]);
  for (const [i, [dx, dz]] of lines.entries()) {
    bunting(K.flags, [0, h - 0.4, 0], [dx, 0.35, dz], { sag: 0.35, every: 0.75, size: 0.3, salt: salt + i * 2 });
    box(K.solid, 0.08, 0.32, 0.08, dx, 0, dz, C.woodDark);
  }
}

// A litter bin on the grass by a path: green, with a rim and a black bag.
export const BIN = Object.freeze({ r: 0.27, h: 0.78 });
export function litterBin(K) {
  const P = K.solid;
  const { r, h } = BIN;
  cyl(P, r, r - 0.04, h, 0, 0, 0, 0x2f7d4a, { sides: 8 });
  cyl(P, r + 0.025, r + 0.02, 0.07, 0, h - 0.06, 0, 0x24603a, { sides: 8, open: true });
  lid(P, r - 0.02, h + 0.004, 0x2a2a30, 8);
}

// A low queue rail beside a ride's path: brass posts and a red rail along x,
// `len` metres long. Low enough for a cat to walk under (no collider).
export const QUEUE_RAIL = Object.freeze({ h: 0.82, every: 1.4 });
export function queueRail(K, len) {
  const P = K.solid;
  const { h, every } = QUEUE_RAIL;
  const n = Math.max(1, Math.round(len / every));
  for (let i = 0; i <= n; i++) {
    const x = -len / 2 + (len * i) / n;
    box(P, 0.06, h, 0.06, x, 0, 0, C.gold);
    box(P, 0.16, 0.03, 0.16, x, 0, 0, C.gold, { shade: 0.8 });
  }
  box(P, len + 0.06, 0.06, 0.05, 0, h - 0.1, 0, C.red);
}
