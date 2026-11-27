// =============================================================================
// SNOWVILLE: THE ROUND-TWO DETAIL PLAN (the owner's live play: more to look at). Pure data and pure functions (no THREE, no clock, no Math.random; its own seeded streams, so every older
// layout in snowvilleplan.js stays put). Stage chunk (snowvillestageb.js); start-up never imports it. It places: the bare frosted birches and the snow-capped stumps, three more snowmen,
// the well, the leaning sleds, the extra woodpiles, the footprints to every door, the extra pennant strings, the notice board's pinned notices and the per-cottage trim hues.
// Everything is placed in open ground: clear of every collider, find spot, candle and the sled run (snowvillesledplan.js), and each thing clear of the others. North is -z.
// No visible words here: the notices are drawn pictures and mark-lines only.
// =============================================================================

import * as P from './snowvilleplan.js';
import { wingColliders, CANDLES_B, LANTERNS_B } from './snowvillewingplan.js';
const W_CANDLES = [...CANDLES_B, ...LANTERNS_B];
import { SNOWVILLE_FIND_ZONES, SNOWVILLE_COLLECTIBLES, SNOWVILLE_GOLD } from './snowvillefindsplan.js';
import { ALL_SPOTS as JOB_SPOTS } from './snowvillejob.js';
import { mulberry32 } from '../rng.js';

const r2 = (v) => Math.round(v * 100) / 100;
const f = Object.freeze;

// What nothing small may stand on: finds, collectibles, golden mice, the walk's own spots (a collider list is added by `isOpen`).
const SPOTS = [
  ...Object.values(SNOWVILLE_FIND_ZONES).flat().map((z) => [z.x, z.z, z.r + 1.2]),
  ...SNOWVILLE_COLLECTIBLES.map((c) => [c.x, c.z, 1.6]),
  ...SNOWVILLE_GOLD.map((c) => [c.x, c.z, 1.6]),
  [8, -30, 2.6], [-8, -26, 2.6], // the Great Fir's foot and the burrow
  ...JOB_SPOTS.map((q) => [q.x, q.z, 2.8]), // Tilly's errand's places
  ...[...W_CANDLES].map((q) => [q.x, q.z, 2.6]),
];
/** The sled run's corridor is kept clear too: its corner points (the sled plan reads this same list, so the two never differ). */
export const SLED_KEEP = f([[22.4, -15.2], [26.2, -13.2], [27.6, -10.2], [26.0, -7.2], [27.0, -3.8], [24.6, -0.6], [22.2, 1.4]]); // the sled run's corner points (snowvillesledplan.js smooths them)
/** The ski slope's corridor on the hill's west flank is kept clear too (snowvilleskisplan.js smooths these corner points). */
export const SKI_KEEP = f([[20.4, -27.4], [18.6, -24.4], [16.0, -21.4], [16.8, -18.2], [14.6, -15.2], [15.6, -12.2], [14.2, -9.8], [13.8, -8.4]]);
let _solid = null;
const solids = () => (_solid ??= [...P.snowvilleColliders(), ...wingColliders()]);
export function isOpen(x, z, clear = 1.2, placed = []) {
  for (const o of placed) if (Math.hypot(x - o.x, z - o.z) < 1.3 + clear * 0.4) return false;
  if (!P.clearOf(x, z, clear * 0.5)) return false;
  for (const c of solids()) if (Math.hypot(x - c.x, z - c.z) < c.r + clear) return false;
  for (const [sx, sz, sr] of SPOTS) if (Math.hypot(x - sx, z - sz) < sr + clear * 0.4) return false;
  for (const [sx, sz] of SLED_KEEP) if (Math.hypot(x - sx, z - sz) < 3.2 + clear * 0.4) return false;
  for (const [sx, sz] of SKI_KEEP) if (Math.hypot(x - sx, z - sz) < 2.5 + clear * 0.4) return false;
  return true;
}

function scatter(seed, n, tries, keepApart, test, placed) {
  const rng = mulberry32(seed);
  const B = P.SNOWVILLE_BOUNDS;
  const out = [];
  let t = 0;
  while (out.length < n && t++ < tries) {
    const x = B.minX + 3 + rng() * (B.maxX - B.minX - 6);
    const z = B.minZ + 3 + rng() * (B.maxZ - B.minZ - 6);
    const s = 0.8 + rng() * 0.5;
    const yaw = rng() * 6.28;
    if (!isOpen(x, z, 1.4, placed) || !test(x, z)) continue;
    if (out.some((o) => Math.hypot(o.x - x, o.z - z) < keepApart)) continue;
    out.push({ x: r2(x), z: r2(z), s: r2(s), yaw: r2(yaw) });
    placed.push({ x: r2(x), z: r2(z) });
  }
  return out;
}

// ---- the layout: the well, three more snowmen, the bare frosted birches and the snow-capped stumps, placed one after another so none touches another ------------------------------
export const BIRCH_COUNT = 10;
export const STUMP_COUNT = 8;
const pick = (list, placed) => { const p = list.find(([x, z]) => isOpen(x, z, 1.4, placed)) ?? list[list.length - 1]; placed.push({ x: p[0], z: p[1] }); return p; };
let _layout = null;
function layout() {
  if (_layout) return _layout;
  const placed = [];
  // the well, in the square's north-east corner (the first open spot)
  const [wx, wz] = pick([[14, 8], [16, 10], [13, 12], [-13, 20], [-24, 12]], placed);
  const well = f({ x: wx, z: wz, r: 0.85, yaw: 0.4 });
  // three more snowmen: by the pond's south-east bank, at the hill's foot, by the west row
  const snowmen = [
    [[-15, -15], [-14, -13], [-13, -17], [-12, -14]],
    [[14, -4], [15, -6], [13, -6], [14, -8]],
    [[-12, 20], [-11, 19], [-10, 22], [-13, 22]],
  ].map((l, i) => { const [x, z] = pick(l, placed); return f({ x, z, yaw: r2(0.5 + i * 1.7), kit: i }); });
  // bare frosted birches: tall pale trunks with dark bands and a few bare branches, round the edges and the fir wood
  const birches = scatter(0x62697263, BIRCH_COUNT, 5000, 3.2, (x, z) => Math.hypot(x - P.SQUARE_FIR.x, z - P.SQUARE_FIR.z) > 9 && (Math.abs(x) > 19 || z < -14), placed);
  // stumps with snow caps, chopped at the wood's edge and about the pond
  const stumps = scatter(0x73746d70, STUMP_COUNT, 5000, 4, (x, z) => z < 6, placed);
  return (_layout = { well, snowmen, birches, stumps });
}
export const birches = () => layout().birches;
export const stumps = () => layout().stumps;
export const snowmen = () => layout().snowmen;
export const well = () => layout().well;

// ---- the leaning sleds (against a cottage's +x wall, near its front) and the extra woodpiles (the cottages the beauty pass left bare) -----------------------------
export const LEANING_SLEDS = f([{ id: 'east1', hue: 0xb8453a }, { id: 'west2', hue: 0x3f7f9a }, { id: 'gate2', hue: 0xd69a2e }]);
export const EXTRA_WOODPILES = f(['west1', 'gate1', 'gate2']);

// ---- per-cottage tones: shutters and the lantern-bracket trim (the roof and door hues are the plan's) -------------------------------------------------------------
export const SHUTTER_HUE = f({ baker: 0x3f6f58, west1: 0xd9a441, west2: 0x4a6f9a, east1: 0xcf5a4a, north1: 0xe0c27a, gate1: 0xd9694a, gate2: 0xe6d9a0 });
export const ROOF_BOARD = f({ baker: 0x6f3a2f, west1: 0x4a5a74, west2: 0x7a4a3c, east1: 0x4a5a74, north1: 0x5a3a48, gate1: 0x4a5a74, gate2: 0x6f3a2f });

// ---- the footprints to each door: alternate left and right, one per 0.6 m out from the steps, in the cottage's own frame ------------------------------------------
export const PRINTS = 8;
export function footprints(c) {
  const out = [];
  for (let i = 0; i < PRINTS; i++) out.push({ lx: (i % 2 ? 1 : -1) * 0.17, lz: c.d / 2 + 1.15 + i * 0.62, yaw: (i % 2 ? 0.08 : -0.08) * (1 + (i % 3)) });
  return out;
}
export const toWorld = (c, lx, lz) => [r2(c.x + lx * Math.cos(c.yaw) + lz * Math.sin(c.yaw)), r2(c.z - lx * Math.sin(c.yaw) + lz * Math.cos(c.yaw))];

// ---- the clumps of snow on the fir tiers: a seeded handful per fir, on one side (the wind's), more where the tree is bigger ------------------------------------------
export const CLUMPS_PER_FIR = 3;
export function clumps(k, i) {
  const rng = mulberry32((0x636c6d70 ^ Math.imul(i + 1, 0x9e3779b1)) >>> 0);
  const wind = rng() * 6.28;
  const out = [];
  for (let n = 0; n < CLUMPS_PER_FIR; n++) {
    out.push({ tier: Math.floor(rng() * Math.max(1, k.tiers - 1)), a: wind + (rng() - 0.5) * 2.2, u: 0.18 + rng() * 0.3, s: 0.8 + rng() * 0.6 });
  }
  return out;
}

// ---- the notice board: eight pinned notices, each { x, y (on the board's face), w, h, tilt, paper, pic } -----------------------------------------------------------
// pic: 'pond' (a skating pond), 'mitten' (a lost mitten), 'lantern' (Lantern Night), 'fish' (the fish stall), 'paw', 'star', 'mug', 'none' (only mark-lines).
export const NOTICES = f([
  f({ x: -0.84, y: 1.82, w: 0.5, h: 0.38, tilt: 0.05, paper: 0xf4ecd8, pic: 'pond' }),
  f({ x: -0.28, y: 1.8, w: 0.46, h: 0.42, tilt: -0.07, paper: 0xf2c8c0, pic: 'mitten' }),
  f({ x: 0.3, y: 1.83, w: 0.5, h: 0.36, tilt: 0.03, paper: 0xfbe6a8, pic: 'lantern' }),
  f({ x: 0.84, y: 1.8, w: 0.44, h: 0.4, tilt: -0.05, paper: 0xcfe0f4, pic: 'fish' }),
  f({ x: -0.8, y: 1.3, w: 0.44, h: 0.38, tilt: -0.06, paper: 0xd9ecd2, pic: 'paw' }),
  f({ x: -0.25, y: 1.3, w: 0.5, h: 0.4, tilt: 0.06, paper: 0xf4ecd8, pic: 'none' }),
  f({ x: 0.3, y: 1.28, w: 0.46, h: 0.38, tilt: -0.03, paper: 0xe6d2ee, pic: 'star' }),
  f({ x: 0.84, y: 1.3, w: 0.44, h: 0.4, tilt: 0.07, paper: 0xf9d7a8, pic: 'mug' }),
]);

export const detailColliders = () => [
  ...birches().map((b) => f({ x: b.x, z: b.z, r: 0.25 })),
  ...stumps().map((b) => f({ x: b.x, z: b.z, r: 0.42 })),
  ...snowmen().map((b) => f({ x: b.x, z: b.z, r: 0.6 })),
  f({ x: well().x, z: well().z, r: well().r }),
];
