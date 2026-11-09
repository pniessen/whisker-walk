import * as THREE from 'three';
import { hash01, waterGap } from './builder.js';
import { segDist } from '../segdist.js';
import { DISCS } from '../rivalclans.js';
import {
  colorParts, dressMesh, paintMesh, ribbon, smoothField, bothSidesLit,
  Tris, lin, scale3, unit, lerp3, clamp01, smoothstep, rectDist, once, r2,
} from './dressing.js';
import {
  MOOR_WATERS, MOOR_PATHS, MOOR_TRAIL, MOOR_GORGE_TRAIL, MOOR_KEEP_CLEAR, MOOR_DECKS, MOOR_LAKE,
  MOOR_RIVER_MOUTH, HIGH_TOR, MOOR_CHAIN_ROCKS, TORS, SPAWN, moorTrunks, moorReeds, moorHeather, moorGorse,
} from './moor.js';

// =============================================================================
// The Moor's dressing (polish-rivermoor Task 4).
//
// The Moor used to read as a wide pale lawn with heather cushions and a lake.
// This makes it a rolling granite moor: the ground tinted pale on the crests
// and darker in the hollows (about 34 m apart, lit a little from the sun's
// side, so the flat ground reads as rolling), with rusty bracken patches and
// greener grass by the water; two winding sheep paths worn between the tors;
// clitter (the broken rock that falls off a tor) round each tor and the High
// Tor's pillar; small groups of half-buried boulders over the open moor;
// stones along the lake's north and east shores on a pale shingle beach;
// tufts of moor grass bent by the wind; and five big tors out past the
// bounds, in front of the far wall, so the skyline is a moor's.
//
// Looks only. Everything is in two noCast meshes (`dressing`, `groundPaint`);
// nothing has a collider or a perch, nothing is walkable, and a cat walks
// through every prop as it does through the heather. Every prop keeps off the
// paths, the trails, the finds, the decks, the spawn, the camp, the tors and
// the trunks (fitsMoor), and inside the bounds stands no taller than its
// class: rocks 0.35 m, grass 0.45 m. The ground stays flat (ruling R3): the
// roll is colour only.
//
// moor.js imports this module and this module imports moor.js, so nothing at
// this module's top level may read moor.js's bindings: every list is worked
// out on first call and kept.
// =============================================================================

const BOUNDS = { minX: -50, maxX: 50, minZ: -50, maxZ: 50 };
const inBounds = (x, z) => x >= BOUNDS.minX && x <= BOUNDS.maxX && z >= BOUNDS.minZ && z <= BOUNDS.maxZ;
// How far (x, z) is from the nearest water's edge, decks ignored (negative
// inside the water).
const waterDist = (x, z) => {
  let m = Infinity;
  for (const w of MOOR_WATERS) m = Math.min(m, waterGap(w, x, z));
  return m;
};
const nearest = (list, x, z) => {
  let m = Infinity;
  for (const p of list) m = Math.min(m, Math.hypot(x - p.x, z - p.z));
  return m;
};

// grass.js's WIND_DIR (x, z), restated so this module needs no render import;
// test/moordress.test.js holds the two equal.
export const MOOR_WIND = Object.freeze([0.8, 0.6]);

// The tors the clitter rings and everything else keeps off: the four scenery
// tors and the High Tor's pillar; the two chain boulders keep the same room.
const torList = once(() => [...TORS, HIGH_TOR].map(({ x, z, r }) => ({ x, z, r })));
const rockList = once(() => [...torList(), ...MOOR_CHAIN_ROCKS.map(({ x, z, r }) => ({ x, z, r }))]);
const TRAILS = once(() => [...MOOR_TRAIL, ...MOOR_GORGE_TRAIL]);
const heather = once(() => moorHeather());
const gorse = once(() => moorGorse());
const reeds = once(() => moorReeds());

// The clearances, per class (brief values): `path` from MOOR_PATHS'
// centrelines, `trail` from the 2 m trails', `tor` past each tor's radius,
// `trunk` per unit of the tree's scale, `camp` past the camp disc's radius.
export const MOOR_RULES = Object.freeze({
  boulder: Object.freeze({ water: 1.0, deck: 3, path: 2.0, trail: 1.8, clear: 2.5, spawn: 5, tor: 0.8, trunk: 1.2, camp: 1 }),
  grass: Object.freeze({ water: 0.4, deck: 2, path: 1.9, trail: 1.4, clear: 1.5, spawn: 3, tor: 0.2, trunk: 0.6, camp: 0 }),
});

export function fitsMoor(x, z, rule) {
  if (!inBounds(x, z)) return false;
  if (waterDist(x, z) < rule.water) return false;
  if (MOOR_DECKS.some((d) => rectDist(d, x, z) < rule.deck)) return false;
  if (MOOR_PATHS.some((s) => segDist(x, z, ...s) < rule.path)) return false;
  if (TRAILS().some((s) => segDist(x, z, ...s) < rule.trail)) return false;
  if (MOOR_KEEP_CLEAR.some(([px, pz]) => Math.hypot(x - px, z - pz) < rule.clear)) return false;
  if (Math.hypot(x - SPAWN.x, z - SPAWN.z) < rule.spawn) return false;
  if (rockList().some((t) => Math.hypot(x - t.x, z - t.z) < t.r + rule.tor)) return false;
  const disc = DISCS.moor;
  if (Math.hypot(x - disc.cx, z - disc.cz) < disc.r + rule.camp) return false;
  return moorTrunks().every((t) => Math.hypot(x - t.x, z - t.z) >= rule.trunk * t.scale);
}

// --- the sheep paths -------------------------------------------------------------
// Two narrow worn tracks, the way sheep wander between tors: from the Gorge
// trail by the east tor north past the warren to the north tor, and from the
// High Tor west to the west tor. Each is a Catmull-Rom curve
// through its waypoints.
export const SHEEP_PATHS = Object.freeze([
  [[40, -11], [45, -19], [41, -27], [44, -36], [36, -41], [30, -42.5]],
  [[-19, -33], [-26, -30], [-31, -24], [-37, -22.5]],
].map((line) => Object.freeze(line.map((p) => Object.freeze(p)))));

// A uniform Catmull-Rom spline through `pts` (the ends doubled), sampled about
// every `step` metres, through every waypoint, rounded to the centimetre.
function catmullRom(pts, step) {
  const out = [];
  const P = (i) => pts[Math.max(0, Math.min(pts.length - 1, i))];
  for (let s = 0; s < pts.length - 1; s++) {
    const [p0, p1, p2, p3] = [P(s - 1), P(s), P(s + 1), P(s + 2)];
    const n = Math.max(1, Math.round(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let j = 0; j < n; j++) {
      const t = j / n, t2 = t * t, t3 = t2 * t;
      const f = (k) => 0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t
        + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3);
      out.push(Object.freeze([r2(f(0)), r2(f(1))]));
    }
  }
  out.push(Object.freeze([pts[pts.length - 1][0], pts[pts.length - 1][1]]));
  return Object.freeze(out);
}
export const sheepPathLines = once(() => Object.freeze(SHEEP_PATHS.map((line) => catmullRom(line, 0.8))));
const sheepDist = (x, z) => {
  let m = Infinity;
  for (const line of sheepPathLines()) {
    for (let i = 0; i < line.length - 1; i++) m = Math.min(m, segDist(x, z, ...line[i], ...line[i + 1]));
  }
  return m;
};

// --- clitter ---------------------------------------------------------------------
// Six to nine rounded rocks fallen round the foot of each tor and the High
// Tor's pillar, their centres 0.7-1.05 of the tor's radius out (so mostly in
// its collider, ruling R4), never on a path or a trail (1.2 m clear of the
// path's edge), and clear of the High Tor's chain boulder so the hop onto it
// stays open.
// Clitter keeps off every find (the High Tor's own perch and golden mouse,
// on its pillar, excepted), the decks, the camp and the spawn.
const clitterClear = (x, z) => {
  if (MOOR_KEEP_CLEAR.some(([px, pz]) => Math.hypot(px - HIGH_TOR.x, pz - HIGH_TOR.z) > HIGH_TOR.r
    && Math.hypot(x - px, z - pz) < 1.5)) return false;
  if (MOOR_DECKS.some((d) => rectDist(d, x, z) < 3)) return false;
  const disc = DISCS.moor;
  if (Math.hypot(x - disc.cx, z - disc.cz) < disc.r + 1) return false;
  return Math.hypot(x - SPAWN.x, z - SPAWN.z) >= 5;
};
export const moorClitter = once(() => {
  const out = [];
  const paths = MOOR_PATHS, trails = TRAILS();
  torList().forEach((t, ti) => {
    const want = 6 + Math.floor(hash01(t.x, t.z, 901) * 4);
    const SLOTS = 40;
    const slots = Array.from({ length: SLOTS }, (_, k) => k)
      .sort((a, b) => hash01(a, ti, 915) - hash01(b, ti, 915));
    const mine = [];
    for (const k of slots) {
      if (mine.length >= want) break;
      const a = ((k + hash01(k, ti, 929) * 0.6) / SLOTS) * Math.PI * 2;
      const d = t.r * (0.7 + 0.35 * hash01(ti, k, 943));
      const x = r2(t.x + Math.cos(a) * d);
      const z = r2(t.z + Math.sin(a) * d);
      const dd = Math.hypot(x - t.x, z - t.z);
      if (dd < t.r * 0.7 || dd > t.r * 1.05) continue;
      if (paths.some((s) => segDist(x, z, ...s) - 1.5 < 1.2)) continue;
      if (trails.some((s) => segDist(x, z, ...s) - 1 < 1.2)) continue;
      if (MOOR_CHAIN_ROCKS.some((c) => Math.hypot(x - c.x, z - c.z) < 1.2)) continue;
      if (waterDist(x, z) < 1) continue;
      if (!clitterClear(x, z)) continue;
      // smaller round the High Tor's slim pillar
      const r = r2(0.18 + (t.r < 1 ? 0.17 : 0.27) * hash01(x, z, 957));
      if (mine.some((c) => Math.hypot(c.x - x, c.z - z) < (c.r + r) * 0.6)) continue;
      const h = r2(Math.min(0.35, r * (0.6 + 0.35 * hash01(z, x, 971))));
      mine.push(Object.freeze({ x, z, r, h }));
    }
    out.push(...mine);
  });
  return Object.freeze(out);
});

// --- boulders --------------------------------------------------------------------
// Small groups of two or three half-buried granite boulders over the open
// moor, a big one with smaller ones leaning on it, off the heather and gorse
// and off the sheep paths.
export const MAX_BOULDERS = 30;
const boulderOk = (x, z, r) => fitsMoor(x, z, MOOR_RULES.boulder)
  && sheepDist(x, z) >= r + 0.6
  && nearest(heather(), x, z) >= 1.1 + r && nearest(gorse(), x, z) >= 1.6 + r
  && nearest(reeds(), x, z) >= 1.2;
export const moorBoulders = once(() => {
  const CELL = 9;
  const cands = [];
  for (let gz = BOUNDS.minZ + CELL / 2; gz < BOUNDS.maxZ; gz += CELL) {
    for (let gx = BOUNDS.minX + CELL / 2; gx < BOUNDS.maxX; gx += CELL) {
      const x = gx + (hash01(gx, gz, 1001) * 2 - 1) * 3;
      const z = gz + (hash01(gx, gz, 1015) * 2 - 1) * 3;
      cands.push({ x, z, order: hash01(gx, gz, 1029) });
    }
  }
  cands.sort((a, b) => a.order - b.order);
  const out = [];
  for (const c of cands) {
    if (out.length >= MAX_BOULDERS - 1) break;
    const lead = { x: r2(c.x), z: r2(c.z), r: r2(0.42 + 0.18 * hash01(c.x, c.z, 1043)) };
    if (!boulderOk(lead.x, lead.z, lead.r)) continue;
    if (out.some((o) => Math.hypot(o.x - lead.x, o.z - lead.z) < 6)) continue;
    const group = [Object.freeze({ ...lead, h: r2(0.27 + 0.08 * hash01(c.z, c.x, 1057)) })];
    const n = 1 + Math.floor(hash01(c.x, c.z, 1071) * 2);
    for (let k = 0; k < n * 3 && group.length <= n && out.length + group.length < MAX_BOULDERS; k++) {
      const a = hash01(c.x + k, c.z, 1085) * Math.PI * 2;
      const r = r2(0.22 + 0.16 * hash01(c.x, c.z + k, 1099));
      const d = lead.r + r * 0.7 + 0.1 * hash01(k, c.x, 1113);
      const x = r2(lead.x + Math.cos(a) * d), z = r2(lead.z + Math.sin(a) * d);
      if (!boulderOk(x, z, r)) continue;
      if (group.some((g) => Math.hypot(g.x - x, g.z - z) < (g.r + r) * 0.8)) continue;
      group.push(Object.freeze({ x, z, r, h: r2(0.14 + 0.14 * hash01(z, x, 1127)) }));
    }
    if (group.length < 2) continue;
    out.push(...group);
  }
  return Object.freeze(out);
});

// --- moor grass -------------------------------------------------------------------
// Tufts of wind-bent grass in clumps of two or three, most on the crests of
// the roll (the same field the ground tint lifts) and round the tors, few in
// the hollows. Straw, olive or rusty (rust on the bracken patches).
export const MAX_GRASS = 450;
const ROLL = (x, z) => smoothField(x, z, 41, 34);
const BRACKEN = (x, z) => smoothField(x, z, 7, 18);
const grassOk = (x, z) => fitsMoor(x, z, MOOR_RULES.grass)
  && sheepDist(x, z) >= 0.5
  && nearest(heather(), x, z) >= 0.95 && nearest(gorse(), x, z) >= 1.5
  && nearest(reeds(), x, z) >= 0.8;
export const moorGrass = once(() => {
  const CELL = 2.4;
  const cands = [];
  for (let gz = BOUNDS.minZ + CELL / 2; gz < BOUNDS.maxZ; gz += CELL) {
    for (let gx = BOUNDS.minX + CELL / 2; gx < BOUNDS.maxX; gx += CELL) {
      const x = gx + (hash01(gx, gz, 1201) * 2 - 1) * 1;
      const z = gz + (hash01(gx, gz, 1215) * 2 - 1) * 1;
      const crest = smoothstep(-0.15, 0.55, ROLL(x, z));
      const tor = torList().some((t) => Math.hypot(x - t.x, z - t.z) < t.r + 4) ? 0.6 : 0;
      const w = 0.02 + 0.3 * crest + tor;
      if (hash01(gx, gz, 1229) < w) cands.push({ x, z, order: hash01(gx, gz, 1243) });
    }
  }
  cands.sort((a, b) => a.order - b.order);
  const out = [];
  for (const c of cands) {
    if (out.length >= MAX_GRASS) break;
    const n = 3 + Math.floor(hash01(c.x, c.z, 1257) * 3);
    for (let k = 0; k < n && out.length < MAX_GRASS; k++) {
      const a = hash01(c.x + k, c.z, 1271) * Math.PI * 2;
      const d = k === 0 ? 0 : 0.3 + 0.35 * hash01(c.x, c.z + k, 1285);
      const x = r2(c.x + Math.cos(a) * d), z = r2(c.z + Math.sin(a) * d);
      if (!grassOk(x, z)) continue;
      if (out.some((g) => Math.hypot(g.x - x, g.z - z) < 0.28)) continue;
      const br = smoothstep(0.25, 0.6, BRACKEN(x, z));
      const p = hash01(x, z, 1299);
      const tone = p < br * 0.7 ? 'rust' : p < 0.6 ? 'straw' : p < 0.92 ? 'olive' : 'rust';
      out.push(Object.freeze({ x, z, h: r2(0.25 + 0.23 * hash01(z, x, 1313)), tone }));
    }
  }
  return Object.freeze(out);
});

// --- the rocky lake shore ----------------------------------------------------------
// Stones along the lake's north shore (z 8, west of the river mouth and east
// of it) and its east shore (x -14), their centres from 0.6 m out in the water
// to 0.5 m up the bank, in clumps, low (tops at most 0.22 m), and not within
// 1.0 m of a reed clump (fix round 1 ruling: at 1.5 m the reeds every 2.5 m
// left room for one stone a gap) or 1.5 m of a deck.
// 60 rather than the brief's 70 cap: the triangle allowance (fix round 1)
export const MAX_SHORE_STONES = 60;
const MOUTH_SKIP = [-41, -34]; // the river mouth's x, ±1 m
export const moorShoreStones = once(() => {
  const L = MOOR_LAKE;
  const STEP = 0.25;
  const OFFS = [-0.6, -0.35, -0.1, 0.15, 0.4]; // + up the bank
  // points on the waterline, each with (nx, nz) pointing up the bank and
  // (tx, tz) along it
  const line = [];
  for (let x = BOUNDS.minX; x <= L.maxX; x += STEP) {
    if (x >= MOUTH_SKIP[0] && x <= MOUTH_SKIP[1]) continue;
    line.push({ x, z: L.minZ, nx: 0, nz: -1, tx: 1, tz: 0 });
  }
  for (let z = L.minZ + STEP; z <= BOUNDS.maxZ; z += STEP) line.push({ x: L.maxX, z, nx: 1, nz: 0, tx: 0, tz: 1 });
  const cands = [];
  for (const c of line) {
    // in clumps where the shore is open; between the reed clumps every gap
    // that has room keeps a stone
    if (hash01(c.x, c.z, 1415) > (smoothField(c.x, c.z, 1401, 7) > -0.2 ? 0.8 : 0.35)) continue;
    OFFS.forEach((o, k) => {
      const off = o + (hash01(c.z, c.x + k, 1429) - 0.5) * 0.2;
      const slide = (hash01(c.x + k, c.z, 1443) - 0.5) * STEP;
      cands.push({
        x: r2(c.x + c.nx * off + c.tx * slide), z: r2(c.z + c.nz * off + c.tz * slide),
        order: hash01(c.x + k, c.z + k, 1457),
      });
    });
  }
  cands.sort((a, b) => a.order - b.order);
  const out = [];
  for (const { x, z } of cands) {
    if (out.length >= MAX_SHORE_STONES) break;
    if (!inBounds(x, z)) continue;
    if (Math.abs(waterGap(L, x, z)) > 0.65) continue;
    if (waterGap(MOOR_RIVER_MOUTH, x, z) < 0.4) continue;
    if (nearest(reeds(), x, z) < 1.0) continue;
    if (MOOR_DECKS.some((d) => rectDist(d, x, z) < 1.5)) continue;
    if (MOOR_KEEP_CLEAR.some(([px, pz]) => Math.hypot(x - px, z - pz) < 1.5)) continue;
    const r = r2(0.18 + 0.24 * hash01(x, z, 1471));
    if (out.some((s) => Math.hypot(s.x - x, s.z - z) < (s.r + r) * 0.9)) continue;
    const h = r2(0.08 + 0.14 * hash01(z, x, 1485));
    out.push(Object.freeze({ x, z, r, h }));
  }
  return Object.freeze(out);
});

// --- far tors -------------------------------------------------------------------------
// Five big tors out past the bounds, in front of the far wall, none past a
// water: the skyline a cat sees from the moor top.
export const FAR_TORS = Object.freeze([
  { x: 54, z: -30, r: 2.3, h: 3.4 },
  { x: 54, z: 12, r: 1.9, h: 2.6 },
  { x: 20, z: -54, r: 2.6, h: 3.9 },
  { x: -14, z: -54, r: 2.1, h: 3.0 },
  { x: 38, z: -53.5, r: 1.8, h: 2.7 },
].map((t) => Object.freeze(t)));

// --- the ground tint ---------------------------------------------------------------
// Multiplies the lawn's vertex colour. The roll: warm on the crests, darker
// and cooler in the hollows (about 34 m apart), and a little lighter on the
// slopes that face the sun (north-west, rig.js's SUN_POSITION), so the flat
// ground reads as rolling. Rusty bracken in patches about 18 m across, and
// greener grass within 5 m of the water.
// polish-moorlook (Pass 10): a heath, not a pale lawn. The crests no longer
// bleach toward straw (they were x 1.14 / 1.09 / 0.88: the palest map), and a
// slow heath mottle (~12 m patches, its own field) runs the turf between peaty
// brown and a deeper moss green, so the open moor has some colour in it at
// walk distance. The heather beds are parked; this is the ground under them.
const CREST = [1.05, 1.03, 0.86];
const HOLLOW = [0.76, 0.85, 0.74];
const BRACKEN_TINT = [1.06, 0.82, 0.64];
const WET = [0.9, 0.98, 0.88];
const HEATH = (x, z) => smoothField(x, z, 59, 12);
const PEAT = [0.98, 0.8, 0.66];
const MOSS = [0.82, 0.98, 0.8];
const MOTTLE = 0.85; // how far a patch's heart goes toward PEAT or MOSS
const SUN = (() => { const l = Math.hypot(-36, -24); return [-36 / l, -24 / l]; })();
const SLOPE_LIGHT = 0.8;
export function moorGroundTint(x, z) {
  const u = ROLL(x, z);
  let m = lerp3([1, 1, 1], CREST, smoothstep(0, 0.6, u));
  m = lerp3(m, HOLLOW, smoothstep(0, 0.6, -u));
  const e = 1.5;
  const gx = (ROLL(x + e, z) - ROLL(x - e, z)) / (2 * e);
  const gz = (ROLL(x, z + e) - ROLL(x, z - e)) / (2 * e);
  const lit = Math.max(-0.1, Math.min(0.1, -(gx * SUN[0] + gz * SUN[1]) * SLOPE_LIGHT));
  m = m.map((v) => v * (1 + lit));
  const h = HEATH(x, z);
  const peat = lerp3([1, 1, 1], PEAT, MOTTLE * smoothstep(0.05, 0.6, h));
  const moss = lerp3([1, 1, 1], MOSS, MOTTLE * smoothstep(0.05, 0.6, -h));
  m = m.map((v, i) => v * peat[i] * moss[i]);
  const wet = smoothstep(0, 1, 1 - waterDist(x, z) / 5);
  m = lerp3(m, BRACKEN_TINT, smoothstep(0.2, 0.55, BRACKEN(x, z)) * (1 - wet));
  return lerp3(m, WET, wet);
}

// --- geometry (Tris, lin and the rest are dressing.js's) ----------------------------

// Four single-triangle blades per tuft, broadside to the wind and leaning
// 25-40 degrees along it, a little fanned; dark at the root, pale at the tip.
const TONES = { straw: lin(0xc8b878), olive: lin(0x8a9550), rust: lin(0xa06a40) };
function addGrass(tris) {
  for (const g of moorGrass()) {
    const base = TONES[g.tone];
    // darker than the tones' own hex: the blades face the sun, and at full
    // strength they read as pale flames on the lawn
    const tone = 0.62 + 0.16 * hash01(g.x, g.z, 1501);
    const root = scale3(lerp3(base, TONES.olive, 0.4), 0.5 * tone);
    const tip = scale3(g.tone === 'rust' ? lerp3(base, TONES.olive, 0.25) : base, tone);
    for (let k = 0; k < 4; k++) {
      const a = ((k + hash01(g.x + k, g.z, 1515) * 0.6) / 4) * Math.PI * 2;
      const bx = g.x + Math.cos(a) * 0.05, bz = g.z + Math.sin(a) * 0.05;
      // the wind's direction, fanned up to ±18 degrees per blade
      const fan = (hash01(g.x, g.z + k, 1529) - 0.5) * 0.63;
      const lx = MOOR_WIND[0] * Math.cos(fan) - MOOR_WIND[1] * Math.sin(fan);
      const lz = MOOR_WIND[0] * Math.sin(fan) + MOOR_WIND[1] * Math.cos(fan);
      const lean = (25 + 15 * hash01(g.z, g.x + k, 1543)) * (Math.PI / 180);
      const len = g.h * (0.78 + 0.22 * hash01(g.x + k, g.z + k, 1557));
      const w = 0.02 + 0.012 * hash01(k, g.x, 1571);
      const sx = -lz, sz = lx; // across the blade
      const tx = bx + lx * len * Math.sin(lean), tz = bz + lz * len * Math.sin(lean);
      const ty = len * Math.cos(lean);
      // the blade's face normal, the upper side, softened toward straight up
      const bv = [lx * Math.sin(lean), Math.cos(lean), lz * Math.sin(lean)];
      let n = unit(-sz * bv[1], sz * bv[0] - sx * bv[2], sx * bv[1]); // across x along
      if (n[1] < 0) n = [-n[0], -n[1], -n[2]];
      n = unit(n[0] * 0.8, n[1] * 0.8 + 0.2, n[2] * 0.8);
      tris.v(bx - sx * w, 0, bz - sz * w, n, root);
      tris.v(bx + sx * w, 0, bz + sz * w, n, root);
      tris.v(tx, ty, tz, n, tip);
    }
  }
}

// A granite rock: a squashed icosahedron, its top at h, a third of it buried,
// turned at random; grey, lighter toward the top, with pale lichen flecks on
// about one in five. `wet` darkens its foot (a shore stone in the water).
const GRANITE = [lin(0x8e8c88), lin(0x9a968e), lin(0x7f7d78)];
const LICHEN = lin(0xb8b48a);
const ICO_TOP = 0.8507; // IcosahedronGeometry(1, 0)'s highest vertex
function rockPart(x, z, r, h, salt, { wet = false, buried = 0.5, y0 = 0, shade = 1 } = {}) {
  const g = new THREE.IcosahedronGeometry(1, 0);
  const sy = ((1 + buried) * h) / (2 * ICO_TOP);
  g.scale(r, sy, r * 0.85);
  g.rotateY(hash01(x, z, salt) * Math.PI * 2);
  g.translate(x, y0 + h - ICO_TOP * sy, z);
  const grey = GRANITE[Math.floor(hash01(z, x, salt + 1) * 3)];
  const lichen = hash01(x, z, salt + 2) < 0.2;
  return colorParts(g, (vx, vy, vz) => {
    const up = clamp01((vy - y0) / h);
    const k = (0.78 + 0.32 * up) * (0.94 + 0.12 * hash01(Math.round(vx * 50), Math.round(vz * 50), salt + 3));
    let c = scale3(grey, shade * k * (wet ? 0.8 + 0.2 * up : 1));
    if (lichen && up > 0.45 && hash01(Math.round(vx * 60), Math.round(vz * 60), salt + 4) < 0.5) {
      c = lerp3(c, LICHEN, 0.65);
    }
    return c;
  });
}

function rockParts() {
  const parts = [];
  for (const c of moorClitter()) parts.push(rockPart(c.x, c.z, c.r, c.h, 1601));
  for (const b of moorBoulders()) parts.push(rockPart(b.x, b.z, b.r, b.h, 1611));
  for (const s of moorShoreStones()) {
    parts.push(rockPart(s.x, s.z, s.r, s.h, 1621, { wet: waterGap(MOOR_LAKE, s.x, s.z) < 0.15, shade: 0.86 }));
  }
  return parts;
}

// A far tor: three squashed icosahedra stacked, widest at the foot, each
// drifting a little off the one below, and two fallen rocks round it (all
// past the bounds).
function farTorParts() {
  const parts = [];
  // [radius share, foot share of h, height share of h, drift in r]
  const blocks = [[1, 0, 0.46, 0], [0.72, 0.36, 0.38, 0.14], [0.48, 0.66, 0.34, 0.12]];
  FAR_TORS.forEach((t, i) => {
    blocks.forEach(([rs, foot, tall, drift], k) => {
      const a = hash01(t.x, t.z, 1701 + k) * Math.PI * 2;
      const x = t.x + Math.cos(a) * t.r * drift;
      const z = t.z + Math.sin(a) * t.r * drift;
      parts.push(rockPart(x, z, t.r * rs, t.h * tall, 1711 + i * 7 + k, { buried: k === 0 ? 0.4 : 0.15, y0: t.h * foot }));
    });
    for (let k = 0; k < 2; k++) {
      const a = hash01(t.z, t.x + k, 1771) * Math.PI * 2;
      const d = t.r * (1.15 + 0.35 * hash01(t.x + k, t.z, 1785));
      const rr = 0.4 + 0.35 * hash01(k, t.x, 1799);
      let x = t.x + Math.cos(a) * d, z = t.z + Math.sin(a) * d;
      // keep every fallen rock out past the bounds too
      if (Math.max(Math.abs(x), Math.abs(z)) - rr < 50.5) { x = t.x - Math.cos(a) * d; z = t.z - Math.sin(a) * d; }
      if (Math.max(Math.abs(x), Math.abs(z)) - rr < 50.5) continue;
      parts.push(rockPart(x, z, rr, rr * 0.7, 1813 + i * 5 + k));
    }
  });
  return parts;
}

// --- the paint ------------------------------------------------------------------------
// The sheep paths, worn buff tracks with a thin second rut beside the first,
// and a pale grey-buff shingle beach along the lake's north and east shores,
// broken at the river mouth.
const TRACK_A = lin(0x9c9068);
const TRACK_B = lin(0x8f8660);
const SHINGLE_A = lin(0xa89e88);
const SHINGLE_B = lin(0x9a927e);
const MOOR_TURF = lin(0x7f8a52); // about the lawn's own colour
const mottled = (a, b, salt, cell = 1.6) => (x, y, z) => lerp3(a, b, hash01(Math.round(x * cell), Math.round(z * cell), salt));
function offsetLine(pts, d) {
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], c = pts[Math.min(pts.length - 1, i + 1)];
    const dx = c[0] - a[0], dz = c[1] - a[1];
    const l = Math.hypot(dx, dz) || 1;
    return [p[0] + (dz / l) * d, p[1] - (dx / l) * d];
  });
}
function paintParts() {
  const parts = [];
  const lines = sheepPathLines();
  lines.forEach((pts, i) => {
    parts.push(colorParts(ribbon(pts, 0.38, { salt: 1901 + i, wobble: 0.3, step: 0.8 }), mottled(TRACK_A, TRACK_B, 1911 + i)));
  });
  // the rut 0.7 m off, unwobbled: the track's edge wobbles out to 0.49 m and
  // the rut's to 0.15, so the two never overlap in the one plane
  parts.push(colorParts(ribbon(offsetLine(lines[0], 0.7), 0.15, { salt: 1921, wobble: 0, step: 0.8 }), mottled(TRACK_A, TRACK_B, 1931)));
  // the shingle, 0.95 m up the bank from the waterline, about 1.6 m wide
  const L = MOOR_LAKE;
  const off = 0.95;
  const west = [[BOUNDS.minX, L.minZ - off], [MOUTH_SKIP[0], L.minZ - off]];
  // round the lake's north-east corner on an arc, not a right angle
  const corner = [];
  for (let k = 0; k <= 6; k++) {
    const a = Math.PI / 2 + (Math.PI / 2) * (k / 6); // from up the bank (north) round to east
    corner.push([L.maxX + Math.cos(Math.PI - a) * off, L.minZ - Math.sin(a) * off]);
  }
  const eastNorth = [[MOUTH_SKIP[1], L.minZ - off], ...corner, [L.maxX + off, BOUNDS.maxZ]];
  for (const [k, line] of [west, eastNorth].entries()) {
    const stones = mottled(SHINGLE_A, SHINGLE_B, 1951 + k, 2.5);
    // its landward edge fades part-way into the grass, so it is a beach, not a strip
    const shingle = (x, y, z) => lerp3(stones(x, y, z), MOOR_TURF, 0.55 * smoothstep(0.9, 1.75, waterDist(x, z)));
    parts.push(colorParts(ribbon(line, 0.8, { salt: 1941 + k, wobble: 0.25, step: 0.5 }), shingle));
  }
  return parts;
}

// Builds the two meshes and adds them to the scene. The caller wraps this in
// withLocalUuids('moor-dressing', ...): every Three object made here draws
// Math.random for its uuid.
export function addMoorDressing(scene) {
  const tris = new Tris();
  addGrass(tris);
  const dressing = dressMesh([tris.geometry(), ...rockParts(), ...farTorParts()], { name: 'dressing', side: THREE.DoubleSide });
  bothSidesLit(dressing.material);
  const paint = paintMesh(paintParts(), { name: 'groundPaint' });
  scene.add(paint);
  scene.add(dressing);
  return { dressing, paint };
}
