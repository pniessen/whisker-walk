// =============================================================================
// THE CRYSTAL CAVE, WING C: THE RIVER, THE FALLS AND THE BOAT (milestone C1): THE PLAN. Pure data and pure functions (no THREE, no clock, no random number): the
// water's centreline, the two pools, both banks as chains of circle colliders, the docks and their hop-off spots, the cliff and the fall (9 m or more beyond the
// walkable edge), the clear rectangles for the rim rocks, and the boat's closed path for world/pathride.js (the spec boat). North is -z. Numbers are "start" values.
// docs/superpowers/plans/2026-11-27-crystal-moon-wave2.md decisions 4 and 5. crystalY never changes: the water is drawn 0.04 m over it.
// The "fall end" of the river is at z about 23 (the plunge pool); the "pool end" is at z about -6 (the still pool).
// =============================================================================

import { SPECS, withStops, pathLength, posAt } from './pathride.js';

const f = Object.freeze;
export const WATER_LIFT = 0.04; // the water is drawn this far over crystalY
export const HALF_WIDTH = 1.55; // the river's water, centre to edge
export const BANK = f({ off: 1.9, r: 0.6, step: 1.1 }); // the bank chain: circles of radius r, every `step` m, `off` m from the centreline

// the centreline, from the fall end to the pool end (start values)
export const CENTRE = f([[33.0, 20.4], [32.9, 15.5], [32.2, 10.5], [31.4, 6.0], [30.2, 2.0], [29.5, -1.8], [29.0, -4.0]].map(([x, z]) => f({ x, z })));
export const PLUNGE = f({ x: 32.4, z: 23.2, r: 2.8 }); // the plunge pool the fall pours into (about (32, 22) in the plan)
export const STILL = f({ x: 28.4, z: -6.4, r: 2.5 }); // the still pool the river ends in (about (31, -6) in the plan; moved off the cluster at (32.8, -7.1))
export const RING = f({ plunge: PLUNGE.r + 0.4, still: STILL.r + 0.4 }); // the shore chains round the two pools

// the cliff and the fall: the wall's foot is 12 m past the walkable edge (x 36); the sheet falls from the lip into a basin, a channel runs back to the plunge pool
export const FALLS = f({ x: 48.4, z: 23.2, w: 3.2, top: 4.8, basin: f({ x: 45.2, z: 23.2, r: 2.2 }), channelX0: 36.0, channelW: 2.6, cliff: f({ x0: 48.7, x1: 49.8, z0: 20.4, z1: 26.0, h: 5.2 }) });
export const FALLS_TOP_BEYOND = 9; // the falls stand at least this far beyond the walkable edge

// the rectangles { minX, maxX, minZ, maxZ } where the rim rocks and pebbles are cleared (CRYSTAL_CLEARS, after the scatter; never KEEP_OUT)
export const CLEARS = f([f({ minX: 35.5, maxX: 52, minZ: 18.2, maxZ: 28.2 })]);

// ---- small helpers ----------------------------------------------------------------------------------------------------------
const hyp = Math.hypot;
const lerp = (a, b, t) => a + (b - a) * t;
const normal = (a, b) => { const h = Math.atan2(b.x - a.x, b.z - a.z); return { x: -Math.cos(h), z: Math.sin(h) }; }; // to the right of travel a -> b (pathride's lat)

/** Points every `step` metres along a polyline, each with the unit normal to its right: [{ x, z, nx, nz, s }]. */
export function sampleLine(pts, step) {
  const out = [];
  const segs = [];
  let L = 0;
  for (let i = 0; i + 1 < pts.length; i++) { const len = hyp(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z); segs.push({ a: pts[i], b: pts[i + 1], len, s0: L, n: normal(pts[i], pts[i + 1]) }); L += len; }
  let i = 0;
  for (let s = 0; s < L; s += step) {
    while (i < segs.length - 1 && s >= segs[i].s0 + segs[i].len) i++;
    const g = segs[i];
    const t = (s - g.s0) / g.len;
    out.push({ x: lerp(g.a.x, g.b.x, t), z: lerp(g.a.z, g.b.z, t), nx: g.n.x, nz: g.n.z, s });
  }
  return out;
}
const round2 = (v) => Math.round(v * 100) / 100;

// ---- the banks: two chains of circles, plus a ring round each pool with a gap where the river runs in -----------------------------------------------
// A shore chain round a pool, open only where the river's own banks come in (a piece within `mouth` of the river's end point is left out).
const ringChain = (c, r, end, mouth) => {
  const out = [];
  const n = Math.round((2 * Math.PI * r) / BANK.step);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = round2(c.x + Math.cos(a) * r), z = round2(c.z + Math.sin(a) * r);
    if (hyp(x - end.x, z - end.z) < mouth) continue;
    out.push({ x, z, r: BANK.r });
  }
  return out;
};
export const bankColliders = (o = {}) => {
  const out = [];
  for (const side of [-1, 1]) {
    for (const p of sampleLine(CENTRE, BANK.step)) out.push({ x: round2(p.x + p.nx * BANK.off * side), z: round2(p.z + p.nz * BANK.off * side), r: BANK.r });
  }
  out.push(...ringChain(PLUNGE, RING.plunge, CENTRE[0], o.mouthPlunge ?? BANK.off + 0.2)); // the outlet stays open
  out.push(...ringChain(STILL, RING.still, CENTRE[CENTRE.length - 1], o.mouthStill ?? BANK.off + 0.2)); // the inlet stays open
  return out.map(f);
};
export const riverColliders = () => bankColliders();

// ---- the boat's path: a closed lane pair with a rounded turn in each pool, smoothed (Chaikin) ---------------------------------------------------------
const chaikin = (pts, times) => {
  let p = pts;
  for (let k = 0; k < times; k++) {
    const q = [];
    for (let i = 0; i < p.length; i++) {
      const a = p[i], b = p[(i + 1) % p.length];
      q.push({ x: 0.75 * a.x + 0.25 * b.x, z: 0.75 * a.z + 0.25 * b.z }, { x: 0.25 * a.x + 0.75 * b.x, z: 0.25 * a.z + 0.75 * b.z });
    }
    p = q;
  }
  return p;
};
const LANE = 0.45;
export const BERTH = f({ fall: f({ x: PLUNGE.x - 1.8, z: PLUNGE.z }), pool: f({ x: STILL.x - 1.6, z: STILL.z }) });
function rawPath() {
  const lane = (sign) => CENTRE.map((c, i) => {
    const n = i + 1 < CENTRE.length ? normal(c, CENTRE[i + 1]) : normal(CENTRE[i - 1], c);
    return { x: c.x + n.x * LANE * sign, z: c.z + n.z * LANE * sign };
  });
  const down = lane(1); // right of travel toward the pool end
  const up = lane(1).map((p, i) => ({ x: 2 * CENTRE[i].x - p.x, z: 2 * CENTRE[i].z - p.z })).reverse(); // the other side, travelled back
  const S = STILL, P = PLUNGE;
  const poolCap = [[S.x + 1.3, S.z + 0.8], [S.x + 1.1, S.z - 1.1], [S.x, S.z - 1.7], [S.x - 1.2, S.z - 1.0], [BERTH.pool.x, BERTH.pool.z], [S.x - 1.1, S.z + 0.9]].map(([x, z]) => ({ x, z }));
  const fallCap = [[P.x - 0.9, P.z - 1.5], [BERTH.fall.x, BERTH.fall.z], [P.x - 0.9, P.z + 1.5], [P.x + 0.9, P.z + 1.7], [P.x + 1.7, P.z + 0.6], [P.x + 1.2, P.z - 1.4]].map(([x, z]) => ({ x, z }));
  return [...down, ...poolCap, ...up, ...fallCap];
}
export const BOAT_PATH = f(chaikin(rawPath(), 2).map((p) => f({ x: round2(p.x), z: round2(p.z) })));
export const BOAT_LEN = pathLength(BOAT_PATH, true);
const nearestS = (pt) => {
  let best = 0, bd = Infinity;
  for (let s = 0; s < BOAT_LEN; s += 0.05) { const p = posAt(BOAT_PATH, s, 0, true); const d = hyp(p.x - pt.x, p.z - pt.z); if (d < bd) { bd = d; best = s; } }
  return best;
};
export const DWELL = 8; // seconds at each dock
export const STOPS = f([f({ name: 'fall', s: round2(nearestS(BERTH.fall)) }), f({ name: 'pool', s: round2(nearestS(BERTH.pool)) })]);
export const BOAT_SPEC = withStops(SPECS.boat, STOPS.map((k) => ({ name: k.name, s: k.s, dwell: DWELL })));
export const BOAT = f({ reach: 3.4, seatY: 0.3, len: 2.2, half: 0.5, lanternY: 1.0 });

// ---- the docks and every hop-off spot --------------------------------------------------------------------------------------------------------------
// A dock is a short pier on the shore chain's outside, facing its berth; its two spots stand on it, outside the colliders and within the boat's reach.
export const DOCKS = f([
  f({ id: 'fall', x: PLUNGE.x - RING.plunge - 1.5, z: PLUNGE.z, spots: f([f({ x: round2(PLUNGE.x - RING.plunge - 1.25), z: round2(PLUNGE.z - 0.65) }), f({ x: round2(PLUNGE.x - RING.plunge - 1.25), z: round2(PLUNGE.z + 0.65) })]) }),
  f({ id: 'pool', x: STILL.x - RING.still - 1.3, z: STILL.z, spots: f([f({ x: round2(STILL.x - RING.still - 1.15), z: round2(STILL.z - 0.65) }), f({ x: round2(STILL.x - RING.still - 1.15), z: round2(STILL.z + 0.65) })]) }),
]);
export const DOCK_SPOTS = f(DOCKS.flatMap((d) => d.spots));
// the banks' own spots: every few metres beside the chain, outside it, for a hop off anywhere along the river
export const BANK_SPOTS = f([-1, 1].flatMap((side) => sampleLine(CENTRE, 4.2).slice(1, -1).map((p) => f({ x: round2(p.x + p.nx * (BANK.off + BANK.r + 0.9) * side), z: round2(p.z + p.nz * (BANK.off + BANK.r + 0.9) * side) }))).filter((p) => p.x <= 34.5));
export const HOP_SPOTS = f([...DOCK_SPOTS, ...BANK_SPOTS]);

/** Is (x, z) in the river's drawn footprint (water, pools, shore chains) plus `m` metres? */
export function inRiver(x, z, m = 0) {
  if (hyp(x - PLUNGE.x, z - PLUNGE.z) < RING.plunge + BANK.r + m) return true;
  if (hyp(x - STILL.x, z - STILL.z) < RING.still + BANK.r + m) return true;
  for (let i = 0; i + 1 < CENTRE.length; i++) {
    const a = CENTRE[i], b = CENTRE[i + 1];
    const dx = b.x - a.x, dz = b.z - a.z;
    const t = Math.min(1, Math.max(0, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
    if (hyp(x - (a.x + dx * t), z - (a.z + dz * t)) < BANK.off + BANK.r + m) return true;
  }
  return false;
}
