// =============================================================================
// THE CRYSTAL CAVE: SMALL STORIES (beauty round 4), THE PLAN. Traces of who came before, one small tableau in each chamber, so the cave feels visited and lived in:
//   * the Entry Hall: an old CAMP (a cold fire ring, a bedroll, a satchel, a lantern that still glows) and three carved WAYMARKS where the paths part;
//   * the Rose Hall: a toppled CART WHEEL by the old rail, with the ore it spilled, and a trail of PAW PRINTS that leads to it from the camp;
//   * the Blue Pool: a tiny collector's WORKBENCH with sparkling samples on it;
//   * the Gold Gallery: a cat-sized BED of moss with a ring of glow-worms;
//   * the Heart: a MURAL of cats, painted with glowing pigments on a slab of the south wall (outside the walk, so nothing to stand on);
//   * the Blue Pool's mist: a RAINBOW that only shows when the prismatic bloom rolls through (a rare surprise, crystalalive.js).
// Pure data and pure functions (no THREE, no clock, no Math.random). All of it is DECORATION: not solid, not a find, not a perch (nothing here is registered anywhere, so
// the cat walks straight through and nothing new can be stood on). The sites are hand-placed in the gaps the small decor leaves; test/crystaltales.test.js holds them clear.
// Drawing is world/crystaltalesparts.js (folded into the decor's three existing meshes: no new draw, light or caster). LOW keeps most, with fewer prints and marks.
// =============================================================================

import { decorAvoid, smallSites, beautySites } from './crystaldecor.js';
import { POOL } from './crystalwingplan.js';

const f = Object.freeze;
const yawTo = (dx, dz) => Math.atan2(dx, dz); // local +z turned to look along (dx, dz)

// The five tableaux (x, z on the floor; yaw turns the prop's own +z). r is the radius the prop stays inside.
export const CAMP = f({ x: -11, z: 19.8, yaw: yawTo(1, -0.3), r: 1.4, k: 1.6 });
export const WHEEL = f({ x: -29.5, z: 9.5, yaw: yawTo(1, 0.4), r: 1.9, k: 1 });
export const BENCH = f({ x: 22.5, z: -10.2, yaw: yawTo(POOL.x - 22.5, POOL.z + 10.2), r: 1.4, k: 1.35 });
export const MURAL = f({ x: 20, z: -32.9, yaw: 0, w: 6.4, h: 4.2 }); // a slab just OUTSIDE the walkable edge (z -32), its painted face toward +z
export const BED = f({ x: -15, z: -24, yaw: 0.6, r: 1.2, k: 1 });
// the Blue Pool's rainbow: a standing arc over the water, its plane turned toward the way she comes in from the north-west
export const RAINBOW = f({ x: POOL.x, z: POOL.z, R: 4.8, tx: 0.92, tz: 0.4 });

// Three carved waymarks where the paths part south of the arch: each a leaning stone with a glowing arrow pointing to a chamber.
export const WAYMARKS = f([
  f({ x: -3, z: 15, to: 'rose', yaw: yawTo(-18 + 3, 4 - 15) }),
  f({ x: 3.5, z: 14, to: 'pool', yaw: yawTo(14 - 3.5, -4 - 14) }),
  f({ x: 0, z: 13.5, to: 'gold', yaw: yawTo(-6, -22 - 13.5) }),
]);

// The glow-worms round the moss bed: where they sit (x, z, height), computed from the ring so a test can find them.
export const WORMS = f(Array.from({ length: 8 }, (_, i) => {
  const a = (i / 8) * Math.PI * 2 + 0.2; const r = 1.2 + 0.14 * (i % 2);
  return f({ x: Math.round((BED.x + Math.cos(a) * r) * 100) / 100, z: Math.round((BED.z + Math.sin(a) * r) * 100) / 100, y: 0.28 + 0.07 * (i % 3), ph: (i * 1.9) % 6.28 });
}));

// A trail of paw prints from the camp toward the wheel: walk the corner points every 1.1 m, left and right in turn, and drop any print that would land on a small decor site.
const TRAIL_PATH = f([[-6, 17], [-8, 14.5], [-11, 13], [-12.5, 9.5], [-16, 8.5], [-20, 8.2], [-24.5, 8.8]]);
let _trail = null;
export function trailPrints() {
  if (_trail) return _trail;
  const avoid = decorAvoid(); const small = [...smallSites('high'), ...beautySites('high')];
  const out = []; let side = 1; let carry = 0;
  for (let i = 0; i + 1 < TRAIL_PATH.length; i++) {
    const [ax, az] = TRAIL_PATH[i]; const [bx, bz] = TRAIL_PATH[i + 1];
    const len = Math.hypot(bx - ax, bz - az); const ux = (bx - ax) / len; const uz = (bz - az) / len;
    for (let s = carry; s < len; s += 1.1) {
      const x = ax + ux * s - uz * 0.16 * side; const z = az + uz * s + ux * 0.16 * side; side = -side;
      const ok = avoid.every((k) => Math.hypot(x - k[0], z - k[1]) >= k[2] + 0.2) && small.every((k) => Math.hypot(x - k.x, z - k.z) >= (k.rad || 1) + 0.2);
      if (ok) out.push(f({ x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100, yaw: yawTo(ux, uz), side: -side }));
      carry = s + 1.1 - len;
    }
  }
  return (_trail = f(out));
}

// how much a rung keeps: LOW draws fewer prints and marks, and no rainbow
export const talesRung = (rung) => (rung === 'low' ? { prints: 5, marks: 2, rainbow: false, worms: 5 } : { prints: 99, marks: 3, rainbow: true, worms: 8 });
