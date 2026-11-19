import { box, cyl, ball, sheet, hash01 } from './fairkit.js';
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
