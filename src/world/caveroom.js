import * as THREE from 'three';
import { CHAMBER_HEADROOM, CORRIDOR_HEADROOM } from './gorgeshape.js';
import { mulberry32 } from '../rng.js';
import { litMaterial } from '../render/materials.js';

// =============================================================================
// A deep cave's chamber, dressed (polish-gorgesky, Task 5).
//
// The chamber is a box cut into the rock (builder.rockTerrain's rockFaces).
// This turns it into a room: a LINER just inside the box's walls, rounded in
// plan at every corner and curving inward as a cove under the roof, with a
// soft seeded unevenness; a few stubby STALACTITES hanging from the cove and
// the roof (the Echo Cave the most, with two little stalagmites under them);
// MOSS in lumpy mounds along the wall feet and on the lower walls; and in
// the Snug Cave, a NEST of twigs lined with moss and fur. Near the cave's
// crystal clusters the liner and the moss are tinted toward their colour, a
// baked glow (Task 6). The clusters themselves are crystalClusters, below.
//
// Pure geometry from the cave's record and a seed: no Math.random, no scene.
// It never touches gameplay: the walk stands on the ground record, which this
// does not change. What stands into the room low down (below COVE_FROM, more
// than LINER_IN in from the wall line) keeps clear of the cave's walking line
// and its finds: `clear(x, z, reach)` (gorge.js's caveClear for the cave) is
// asked for every such liner vertex, and a vertex that fails is put back on
// the wall line. `rockAt(x, z)` says whether the wall at a point on the
// chamber's wall line is rock (not the opening into the bend); the liner and
// everything on it skip the opening.
// =============================================================================

export const COVE_FROM = 2.0; // above the floor: where the liner may lean in
export const LINER_IN = 0.05; // the most a low liner vertex stands in, unchecked
export const CORNER_R = 1.1; // each corner's radius in plan
export const STALACTITE_MIN_Y = 2.0; // a stalactite's tip, over the floor
export const STALACTITE_MAX_LEN = 0.6; // stubby: none hangs longer than this
export const CLUSTER_SPREAD = 0.32; // a crystal cluster's half-width along its wall
export const CLUSTER_REACH = CLUSTER_SPREAD + 0.1; // every crystal vertex, across the ground, from its spot
export const GLOW_R = 1.5; // the walls catch a cluster's light this far

const TOP = CHAMBER_HEADROOM - 0.01; // the liner's top edge, just under the roof
const FOOT = -0.02; // its foot, just into the floor
const COVE_IN = 0.7; // how far the cove reaches in at the roof
const COVE_IN_ = COVE_IN, COVE_FROM_ = COVE_FROM; // (caveRoom's `look` defaults)
const COL_W_ = 0.3;
const ROW_H_ = 0.3;
const COVE_ROWS_ = 4;
const WALL_BUMP_ = 0.07; // the unevenness, inward only: 0..0.07 on the wall,
const COVE_BUMP = 0.12; // up to 0.12 on the cove
const TAPER = 0.6; // the bumps and cove fade out over this beside the opening
const NOISE_STEP = [0.7, 0.3]; // two octaves, metres per lattice step
const NOISE_ROWS = 12;

export const LINER_COLORS = Object.freeze({ echo: 0x6e7682, snug: 0x8a7058, glitter: 0x9a8664 });
const MOSS = [0x4f6b3a, 0x6f8a4a];
const TWIGS = [0x6b4f33, 0x7f6142, 0x5e452d];
const FUR = 0xa89f94;

const STALACTITES = { echo: [7, 3], glitter: [5, 3], snug: [4, 2] }; // [min, spread]
// The Snug Cave keeps its first 11 floor mounds (of 14 flat blobs): a mound
// is 45 triangles, and the room may grow by 300 at most (polish-gorgeway Task 3).
const FLOOR_MOSS = { echo: 9, glitter: 5, snug: 11 };
const WALL_MOSS = { echo: 3, glitter: 1, snug: 4 };
const NEST_R = 0.45;
const NEST_RIM = 0.02; // the twig rim's jitter reaches a little past NEST_R
const MOSS_REACH = 1.25; // a floor mound's rim reaches at most 1.2 of its radius
const MOUTH_KEEP = 2.0; // no stalactite this near the opening, where the camera mostly is
const GLOW_MIX = 0.6; // how far a vertex right by a cluster goes toward its colour
const GLOW_CENTRE_Y = 0.35; // the glow's centre, over a cluster's spot
const NEST_FROM = { x: 20.6, z: 8.4 };

const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const lerp = (a, b, t) => a + (b - a) * t;

// --- the outline: the chamber's rectangle with its corners rounded ----------------
// Walked from the north wall's west end eastward, then down the east wall, and
// so round. s is the distance along it. Each point carries its normal into
// the room and the point on the square wall line straight behind it.
// `radius`: CORNER_R, or one radius per corner [(maxX, minZ), (maxX, maxZ),
// (minX, maxZ), (minX, minZ)] (0: a square corner, its arc of no length).
function outlineOf(r, radius = CORNER_R) {
  const [R0, R1, R2, R3] = Array.isArray(radius) ? radius : [radius, radius, radius, radius];
  const segs = [];
  const line = (x0, z0, x1, z1, nx, nz) => segs.push({ line: true, x0, z0, x1, z1, nx, nz, len: Math.hypot(x1 - x0, z1 - z0) });
  const arc = (cx, cz, a0, R) => segs.push({ line: false, cx, cz, a0, R, len: (R * Math.PI) / 2 });
  line(r.minX + R3, r.minZ, r.maxX - R0, r.minZ, 0, 1);
  arc(r.maxX - R0, r.minZ + R0, -Math.PI / 2, R0);
  line(r.maxX, r.minZ + R0, r.maxX, r.maxZ - R1, -1, 0);
  arc(r.maxX - R1, r.maxZ - R1, 0, R1);
  line(r.maxX - R1, r.maxZ, r.minX + R2, r.maxZ, 0, -1);
  arc(r.minX + R2, r.maxZ - R2, Math.PI / 2, R2);
  line(r.minX, r.maxZ - R2, r.minX, r.minZ + R3, 1, 0);
  arc(r.minX + R3, r.minZ + R3, Math.PI, R3);
  let s = 0;
  for (const g of segs) { g.s0 = s; s += g.len; }
  const length = s;
  const at = (sIn) => {
    let t = ((sIn % length) + length) % length;
    let g = segs[segs.length - 1];
    for (const q of segs) if (t < q.s0 + q.len) { g = q; break; }
    t -= g.s0;
    if (g.line) {
      const u = g.len ? t / g.len : 0;
      const x = lerp(g.x0, g.x1, u), z = lerp(g.z0, g.z1, u);
      return { x, z, nx: g.nx, nz: g.nz, wx: x, wz: z };
    }
    const R = g.R;
    const a = g.a0 + t / R;
    const ox = Math.cos(a), oz = Math.sin(a);
    // out along the radius to the square corner's wall line
    const k = Math.min(Math.abs(ox) > 1e-9 ? R / Math.abs(ox) : Infinity, Math.abs(oz) > 1e-9 ? R / Math.abs(oz) : Infinity);
    return { x: g.cx + ox * R, z: g.cz + oz * R, nx: -ox, nz: -oz, wx: g.cx + ox * k, wz: g.cz + oz * k };
  };
  const breaks = segs.map((g) => g.s0);
  return { at, length, segs, breaks };
}

// --- seeded value noise on (s, h), periodic in s round the outline -------------
function noiseOf(rng, length) {
  const octaves = NOISE_STEP.map((step) => {
    const ns = Math.max(4, Math.round(length / step));
    const table = Array.from({ length: ns * NOISE_ROWS }, () => rng());
    return { ns, ds: length / ns, dh: step, table };
  });
  const one = ({ ns, ds, dh, table }, s, h) => {
    const fs = s / ds, fh = Math.max(0, h + 0.5) / dh;
    const i0 = Math.floor(fs), j0 = Math.min(NOISE_ROWS - 2, Math.floor(fh));
    const u = smooth(fs - i0), v = smooth(Math.min(1, fh - j0));
    const cell = (i, j) => table[(((i % ns) + ns) % ns) * NOISE_ROWS + j];
    return lerp(lerp(cell(i0, j0), cell(i0 + 1, j0), u), lerp(cell(i0, j0 + 1), cell(i0 + 1, j0 + 1), u), v);
  };
  return (s, h) => (one(octaves[0], s, h) * 2 + one(octaves[1], s, h)) / 3;
}

// The cove: 0 up to `from` (COVE_FROM), then a quarter-round reaching `reach`
// (COVE_IN) at the liner's top edge `top` (TOP); and its height at `d` in
// from the outline (d < reach), with no bumps.
function coveOf(from = COVE_FROM, reach = COVE_IN, top = TOP) {
  const coveIn = (h) => {
    if (h <= from) return 0;
    const u = Math.min(1, (h - from) / (top - from));
    return reach * (1 - Math.sqrt(Math.max(0, 1 - u * u)));
  };
  const coveHeight = (d) => {
    const w = 1 - d / reach;
    return from + (top - from) * Math.sqrt(Math.max(0, 1 - w * w));
  };
  return { coveIn, coveHeight };
}

// One growing list of triangles, by part.
export function mesher(names = ['liner', 'stalactites', 'moss', 'nest']) {
  const pos = [], col = [], idx = [];
  const parts = Object.fromEntries(names.map((k) => [k, 0]));
  return {
    pos, col, idx, parts,
    vert(x, y, z, c) { pos.push(x, y, z); col.push(c.r, c.g, c.b); return pos.length / 3 - 1; },
    tri(part, a, b, c) { idx.push(a, b, c); parts[part]++; },
  };
}

// --- a blunt stalactite (or, pointing up, a stalagmite) ------------------------------
// Rings from a wide root to a blunt, rounded tip: the last two rings close in
// over the last 10% like a dome, and the point is a short drop below a ring
// still a quarter of the root's width (no fangs). Appended to a mesher() as
// `part`; `sides` round, the rings turned by `turn`, coloured col0 to col1.
const spikeColor = new THREE.Color();
const SPIKE_PROFILE = [[0, 1], [0.4, 0.8], [0.7, 0.58], [0.9, 0.4], [0.97, 0.25]];
function spike(m, part, x, z, yBase, yTip, r0, sides, turn, col0, col1) {
  const c = spikeColor;
  const ringIds = SPIKE_PROFILE.map(([t, k], ri) => {
    const y = lerp(yBase, yTip, t);
    const ids = [];
    for (let i = 0; i < sides; i++) {
      const a = turn + ri * 0.35 + (i / sides) * Math.PI * 2;
      c.copy(col0).lerp(col1, t);
      ids.push(m.vert(x + Math.cos(a) * r0 * k, y, z + Math.sin(a) * r0 * k, c));
    }
    return ids;
  });
  c.copy(col1);
  const tip = m.vert(x, yTip, z, c);
  const down = yTip < yBase; // a stalactite hangs; a stalagmite stands
  for (let ri = 0; ri + 1 < ringIds.length; ri++) {
    for (let i = 0; i < sides; i++) {
      const j = (i + 1) % sides;
      const a = ringIds[ri][i], b = ringIds[ri][j], cc = ringIds[ri + 1][j], d = ringIds[ri + 1][i];
      if (down) { m.tri(part, a, b, cc); m.tri(part, a, cc, d); } else { m.tri(part, a, cc, b); m.tri(part, a, d, cc); }
    }
  }
  const last = ringIds[ringIds.length - 1];
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    if (down) m.tri(part, last[i], last[j], tip); else m.tri(part, last[i], tip, last[j]);
  }
}

// --- a moss mound -------------------------------------------------------------------
// One lumpy mound, appended to a mesher() as part 'moss': a centre and three
// rings of 9 at 0.35, 0.7 and 1.0 of `rad` round (x, y, z) in the plane across
// the normal (nx, ny, nz), lifted along it by 0.4, 0.28 and 0.02 of `rad` (the
// centre a touch over the first ring, at least 0.03 m; no vertex higher
// than MOUND_MAX, the jittered first ring clamped to it too). Each ring vertex's radius is jittered ±20% (by a
// wobble round the mound that all three rings share, so neighbouring rings
// keep their order and the rim's slope never folds over) and its lift ±30%,
// all by hashOf on (x, z, salt): it draws nothing. Darker at the rim (×0.9),
// lighter on top (×1.08). 45 triangles, facing along the normal.
// Returns the centre's top point, and the rim as appended: `rim` (vertex ids).
const MOUND_SEGS = 9;
const MOUND_RINGS = [[0.35, 0.4, 1.05], [0.7, 0.28, 0.99], [1.0, 0.02, 0.9]]; // [radius, lift, shade]
const MOUND_TOP = 0.42; // the centre's lift, of rad
const MOUND_MAX = 0.14; // no mound stands taller than this, however wide
export function mossLump(m, { x, y, z, nx, ny, nz, rad, color, salt = 0 }) {
  const nl = Math.hypot(nx, ny, nz) || 1;
  nx /= nl; ny /= nl; nz /= nl;
  // u across the normal (level where it can be), v = n × u: u × v = n
  let ux, uy, uz;
  if (Math.abs(ny) < 0.9) { ux = nz; uy = 0; uz = -nx; } else { ux = 0; uy = -nz; uz = ny; }
  const ul = Math.hypot(ux, uy, uz);
  ux /= ul; uy /= ul; uz /= ul;
  const vx = ny * uz - nz * uy, vy = nz * ux - nx * uz, vz = nx * uy - ny * ux;
  const k = Math.min(1, MOUND_MAX / (MOUND_TOP * rad)); // a wide mound is squatter
  const turn = hashOf(x + salt, z - salt) * Math.PI * 2;
  // the outline's wobble round the mound, -1..1: two lobes and three, at hashed
  // phases. Every ring follows it, so a ring never reaches past the next one out.
  const p2 = hashOf(x * 1.7 - salt, z + 0.3) * Math.PI * 2, p3 = hashOf(z * 2.3 + salt, x - 0.7) * Math.PI * 2;
  const wobble = (a) => 0.6 * Math.sin(2 * a + p2) + 0.4 * Math.sin(3 * a + p3);
  const c = new THREE.Color();
  const at = (a, rr, lift) => {
    const cu = Math.cos(a) * rr, sv = Math.sin(a) * rr;
    return [x + ux * cu + vx * sv + nx * lift, y + uy * cu + vy * sv + ny * lift, z + uz * cu + vz * sv + nz * lift];
  };
  c.copy(color).multiplyScalar(1.08);
  const lift0 = Math.max(0.03, MOUND_TOP * rad * k);
  const top = at(0, 0, lift0);
  const mid = m.vert(...top, c);
  const rings = MOUND_RINGS.map(([kr, kl, shade], ri) => {
    c.copy(color).multiplyScalar(shade);
    return Array.from({ length: MOUND_SEGS }, (_, i) => {
      const a = turn + ((i + 0.5 * ri) / MOUND_SEGS) * Math.PI * 2;
      const jr = 1 + 0.2 * wobble(a);
      const jl = 1 + 0.6 * (hashOf(z * 1.9 + i * 2.11 + salt, x * 1.3 + ri * 3.7) - 0.5);
      return m.vert(...at(a, rad * kr * jr, Math.min(MOUND_MAX, rad * kl * k * jl)), c);
    });
  });
  for (let i = 0; i < MOUND_SEGS; i++) {
    const j = (i + 1) % MOUND_SEGS;
    // round from u toward v, i.e. anticlockwise seen from along the normal
    m.tri('moss', mid, rings[0][i], rings[0][j]);
    // each ring sits half a step round from the one inside it: ring ri + 1's
    // vertex i stands between ring ri's i and j
    for (let ri = 0; ri + 1 < rings.length; ri++) {
      const a = rings[ri][i], b = rings[ri][j], d = rings[ri + 1][i], e = rings[ri + 1][j];
      m.tri('moss', a, d, b);
      m.tri('moss', b, d, e);
    }
  }
  return { x: top[0], y: top[1], z: top[2], rim: rings[rings.length - 1] };
}

// The baked glow: vertices [from, to) of a mesher() within GLOW_R of a
// crystal cluster (its spot, GLOW_CENTRE_Y over the floor y0) go toward the
// cluster's colour, by GLOW_MIX right by it, fading out by GLOW_R.
function glowTint(m, crystals, y0, from, to) {
  const glow = new THREE.Color(crystals.color ?? 0xffffff);
  for (let i = from; i < to; i++) {
    const x = m.pos[i * 3], y = m.pos[i * 3 + 1], z = m.pos[i * 3 + 2];
    let d = Infinity;
    for (const sp of crystals.spots) d = Math.min(d, Math.hypot(x - sp.x, y - (y0 + GLOW_CENTRE_Y), z - sp.z));
    if (d >= GLOW_R) continue;
    const w = GLOW_MIX * (1 - d / GLOW_R) ** 2;
    m.col[i * 3] = lerp(m.col[i * 3], glow.r, w);
    m.col[i * 3 + 1] = lerp(m.col[i * 3 + 1], glow.g, w);
    m.col[i * 3 + 2] = lerp(m.col[i * 3 + 2], glow.b, w);
  }
}

// `crystals` (optional): { spots: [{ x, z }], color } — the liner and the moss
// within GLOW_R of a cluster are tinted toward its colour (a baked glow; no
// lights), most strongly right by it.
//
// `look` (optional, polish-gorge5) overrides the room's constants for a room
// that is not a deep cave's chamber (CliffClan's camp den): { headroom
// (CHAMBER_HEADROOM), colW (COL_W), rowH (ROW_H), coveRows (COVE_ROWS),
// coveFrom (COVE_FROM), coveIn (COVE_IN), wallBump (WALL_BUMP), cornerR
// (CORNER_R), stalactites (the cave's count; 0 for none), floorMoss,
// wallMoss (the cave's counts), color (LINER_COLORS[cave.id]), lowH,
// standoff }. cornerR may be one radius per corner (outlineOf). lowH: below
// it, nothing of the liner stands more than LINER_IN in from the wall line,
// clear or not (unset: only `clear` decides). standoff: the least the liner
// stands in from its outline (off the box's own walls, so they never fight). With no `look` the
// chambers are built exactly as before (test/gorge5.test.js pins their arrays).
// `raw: true` returns the arrays ({ pos, col, idx, nor }, normals by
// normalsOf) instead of a BufferGeometry, which would draw Math.random for
// its uuid in a build.
export function caveRoom(cave, { clear, rockAt, seed, crystals, look = {}, raw = false } = {}) {
  const r = cave.rects.find((q) => q.tag.endsWith('-chamber'));
  const y0 = cave.y;
  const headroom = look.headroom ?? CHAMBER_HEADROOM;
  const TOP = headroom - 0.01, ROOF = headroom - 0.005;
  const COL_W = look.colW ?? COL_W_, ROW_H = look.rowH ?? ROW_H_, COVE_ROWS = look.coveRows ?? COVE_ROWS_;
  const COVE_FROM = look.coveFrom ?? COVE_FROM_, COVE_IN = look.coveIn ?? COVE_IN_;
  const WALL_BUMP = look.wallBump ?? WALL_BUMP_;
  const lowH = look.lowH ?? -Infinity;
  const standoff = look.standoff ?? 0; // the least a liner vertex stands in from its outline
  const { coveIn, coveHeight } = coveOf(COVE_FROM, COVE_IN, TOP);
  const out = outlineOf(r, look.cornerR ?? CORNER_R);
  const rng = mulberry32(seed >>> 0);
  const noise = noiseOf(rng, out.length);
  const m = mesher();
  const inward = (x, z) => Math.min(x - r.minX, r.maxX - x, z - r.minZ, r.maxZ - z);
  const rockOn = (s) => { const p = out.at(s); return rockAt(p.wx, p.wz); };

  // --- the columns: ~COL_W apart, with a break at each segment's start and at
  // each edge of the opening (found by bisection, on the rock side)
  const cuts = [];
  for (const g of out.segs) {
    if (!g.len) continue; // a square corner
    const n = Math.max(1, Math.round(g.len / COL_W));
    for (let i = 0; i < n; i++) cuts.push(g.s0 + (g.len * i) / n);
  }
  const ss = [];
  for (let i = 0; i < cuts.length; i++) {
    const a = cuts[i], b = i + 1 < cuts.length ? cuts[i + 1] : out.length;
    ss.push(a);
    const ra = rockOn(a), rb = rockOn(b);
    if (ra === rb) continue;
    let lo = a, hi = b; // lo keeps ra's side
    for (let k = 0; k < 24; k++) {
      const mid = (lo + hi) / 2;
      if (rockOn(mid) === ra) lo = mid; else hi = mid;
    }
    // the edge point itself, on the rock side
    const edge = ra ? lo : hi;
    if (edge - a > 1e-4 && b - edge > 1e-4) ss.push(edge);
  }
  const rock = ss.map(rockOn);
  const L = out.length;
  // the open stretches (both ends of a span not rock), for the taper
  const gaps = [];
  for (let i = 0; i < ss.length; i++) {
    const j = (i + 1) % ss.length;
    if (!rock[i] || !rock[j]) gaps.push([ss[i], j ? ss[j] : L]);
  }
  const gapDist = (s) => {
    let d = Infinity;
    for (const [a, b] of gaps) {
      for (const k of [-L, 0, L]) {
        const t = s + k;
        d = Math.min(d, t < a ? a - t : t > b ? t - b : 0);
      }
    }
    return d;
  };
  const taper = (s) => smooth(gapDist(s) / TAPER);

  // A point on the liner (before the clear check): out from the outline by
  // the cove and the bumps, faded out beside the opening.
  const bumpAt = (s, h) => noise(s, h) * lerp(WALL_BUMP, COVE_BUMP, smooth((h - COVE_FROM + 0.4) / 0.8));
  const linerAt = (s, h) => {
    const p = out.at(s);
    const k = taper(s);
    const d0 = k * (coveIn(h) + bumpAt(s, h));
    const d = standoff ? Math.max(standoff, d0) : d0;
    return { x: p.x + p.nx * d, y: y0 + h, z: p.z + p.nz * d, p, k };
  };
  // The clear rule: low and in from the wall line, it must be clear, or it goes
  // back onto the wall line. Below look.lowH it comes back toward the wall
  // line until it stands LINER_IN in, clear or not.
  const settle = (q, h) => {
    if (h < lowH && inward(q.x, q.z) > LINER_IN) {
      let lo = 0, hi = 1; // along the wall point -> q
      const at = (t) => ({ x: lerp(q.p.wx, q.x, t), z: lerp(q.p.wz, q.z, t) });
      for (let i = 0; i < 24; i++) {
        const mid = (lo + hi) / 2, pt = at(mid);
        if (inward(pt.x, pt.z) > LINER_IN) hi = mid; else lo = mid;
      }
      return { ...q, ...at(lo) };
    }
    if (h < COVE_FROM && inward(q.x, q.z) > LINER_IN && !clear(q.x, q.z, 0)) {
      return { ...q, x: q.p.wx, z: q.p.wz, flat: true };
    }
    return q;
  };

  // --- the liner -------------------------------------------------------------------
  const rows = [];
  const low = Math.ceil((COVE_FROM - FOOT) / ROW_H);
  for (let j = 0; j <= low; j++) rows.push(FOOT + ((COVE_FROM - FOOT) * j) / low);
  for (let j = 1; j <= COVE_ROWS; j++) rows.push(COVE_FROM + ((TOP - COVE_FROM) * j) / COVE_ROWS);
  const base = new THREE.Color(look.color ?? LINER_COLORS[cave.id] ?? LINER_COLORS.echo);
  const c = new THREE.Color();
  const linerTris = [];
  const grid = ss.map((s, i) => (rock[i] && (rock[(i + ss.length - 1) % ss.length] || rock[(i + 1) % ss.length])
    ? rows.map((h) => {
      const q = settle(linerAt(s, h), h);
      const hT = Math.min(1, Math.max(0, h) / 1.6);
      const n = q.flat ? 0 : noise(s, h);
      c.copy(base).multiplyScalar(0.75 + 0.25 * (0.5 * hT + 0.5 * n));
      return m.vert(q.x, q.y, q.z, c);
    })
    : null));
  const linerVerts = m.pos.length / 3;
  for (let i = 0; i < ss.length; i++) {
    const j = (i + 1) % ss.length;
    if (!rock[i] || !rock[j]) continue;
    for (let k = 0; k + 1 < rows.length; k++) {
      const a = grid[i][k], b = grid[j][k], cc = grid[j][k + 1], d = grid[i][k + 1];
      // (b - a) x (c - a) along the walk and up points into the room
      m.tri('liner', a, b, cc);
      m.tri('liner', a, cc, d);
      linerTris.push(a, b, cc, a, cc, d);
    }
  }

  // --- stalactites ------------------------------------------------------------------
  const [sMin, sSpread] = look.stalactites !== undefined ? [look.stalactites, 1] : STALACTITES[cave.id] ?? STALACTITES.echo;
  const want = sMin + Math.floor(rng() * sSpread);
  const hangs = [];
  // the opening's middle(s), on the wall line: the camera mostly looks in from there
  const mouths = gaps.map(([a, b2]) => out.at((a + b2) / 2)).map((p) => ({ x: p.wx, z: p.wz }));
  for (let t = 0; t < 80; t++) {
    const s = rng() * L, d = 0.45 + rng() * 0.7, len = 0.25 + rng() * (STALACTITE_MAX_LEN - 0.25);
    const sides = 5 + Math.floor(rng() * 3), turn = rng() * Math.PI * 2, lean = rng();
    if (hangs.length >= want) continue;
    if (!rockOn(s) || taper(s) < 1) continue;
    const p = out.at(s);
    // d (0.45-1.15 in from the outline) keeps each within 1.2 m of the walls
    const x = p.x + p.nx * d, z = p.z + p.nz * d;
    if (mouths.some((q) => Math.hypot(q.x - x, q.z - z) < MOUTH_KEEP)) continue;
    if (!clear(x, z, 0.3)) continue;
    if (!hangs.every((o) => Math.hypot(o.x - x, o.z - z) >= 0.8)) continue;
    // its root, up in the rock above the cove (or at the roof past it)
    const root = d >= COVE_IN ? ROOF : Math.min(ROOF, coveHeight(d) + 0.1);
    const tipH = Math.max(STALACTITE_MIN_Y + 0.01, root - len);
    hangs.push({ x, z, root, tipH, sides, turn, lean });
  }
  const hangColor = base.clone().multiplyScalar(1.05);
  const tipColor = base.clone().lerp(new THREE.Color(0xffffff), 0.15);
  const stalactiteTips = [];
  for (const h of hangs) {
    const len = h.root - h.tipH;
    spike(m, 'stalactites', h.x, h.z, y0 + h.root, y0 + h.tipH, 0.13 + 0.12 * len, h.sides, h.turn, hangColor, tipColor);
    stalactiteTips.push({ x: h.x, y: y0 + h.tipH, z: h.z, root: y0 + h.root });
  }
  // The Echo Cave's two stubby stalagmites, each under a stalactite.
  if (cave.id === 'echo') {
    let made = 0;
    for (const h of hangs) {
      if (made >= 2 || !clear(h.x, h.z, 0.35)) continue;
      spike(m, 'stalactites', h.x, h.z, y0 - 0.02, y0 + 0.18 + 0.12 * h.lean, 0.2, h.sides, h.turn + 1, hangColor.clone().multiplyScalar(0.9), tipColor);
      made++;
    }
  }

  // --- the nest (the Snug Cave) -----------------------------------------------------
  let nest = null;
  if (cave.id === 'snug') {
    const midX = (r.minX + r.maxX) / 2;
    const fits = (x, z) => x <= midX && inward(x, z) >= NEST_R + 0.25 && clear(x, z, NEST_R + NEST_RIM)
      && cornerRoom(r, x, z) >= NEST_R + 0.2;
    search: for (let k = 0; k <= 30; k++) {
      const rad = k * 0.1;
      const n = k === 0 ? 1 : 12;
      for (let i = 0; i < n; i++) {
        // west first, then alternating either side of it
        const a = Math.PI + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * (Math.PI / 6);
        const x = NEST_FROM.x + Math.cos(a) * rad, z = NEST_FROM.z + Math.sin(a) * rad;
        if (fits(x, z)) { nest = { x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100, r: NEST_R }; break search; }
      }
    }
    if (nest) nestMesh(m, nest, y0, rng, c);
  }

  // --- moss ---------------------------------------------------------------------
  const mossFrom = m.pos.length / 3;
  const mossA = new THREE.Color(MOSS[0]), mossB = new THREE.Color(MOSS[1]);
  const blobs = [];
  const floorCap = look.floorMoss ?? FLOOR_MOSS[cave.id] ?? 6;
  for (let t = 0; t < 160; t++) {
    const s = rng() * L, rad = 0.15 + rng() * 0.25, tint = rng(), turn = rng() * Math.PI * 2;
    if (blobs.length >= floorCap) continue;
    if (!rockOn(s)) continue;
    const p = out.at(s);
    const x = p.x + p.nx * rad * 0.8, z = p.z + p.nz * rad * 0.8;
    if (!clear(x, z, rad * MOSS_REACH)) continue;
    if (nest && Math.hypot(x - nest.x, z - nest.z) < nest.r + rad) continue;
    if (!blobs.every((o) => Math.hypot(o.x - x, o.z - z) >= 0.6 * (o.rad + rad))) continue;
    blobs.push({ x, z, rad, tint, turn });
  }
  // Each a lumpy mound on the floor; any rim point past the chamber's walls is
  // pulled back inside them, as the flat blobs' were.
  const mossBlobs = [];
  for (const bl of blobs) {
    const from = m.pos.length / 3;
    const top = mossLump(m, { x: bl.x, y: y0, z: bl.z, nx: 0, ny: 1, nz: 0, rad: bl.rad, color: mossA.clone().lerp(mossB, bl.tint), salt: bl.turn });
    for (let i = from; i < m.pos.length / 3; i++) {
      m.pos[i * 3] = Math.min(r.maxX - 0.005, Math.max(r.minX + 0.005, m.pos[i * 3]));
      m.pos[i * 3 + 2] = Math.min(r.maxZ - 0.005, Math.max(r.minZ + 0.005, m.pos[i * 3 + 2]));
    }
    const rim = top.rim.map((i) => ({ x: m.pos[i * 3], y: m.pos[i * 3 + 1], z: m.pos[i * 3 + 2] }));
    mossBlobs.push({ x: bl.x, z: bl.z, rad: bl.rad, top: top.y, rim });
  }
  // A few on the lower walls.
  const wallCap = look.wallMoss ?? WALL_MOSS[cave.id] ?? 1;
  const patches = [];
  for (let t = 0; t < 60; t++) {
    const s = rng() * L, h = 0.3 + rng() * 0.6, rad = 0.12 + rng() * 0.1, tint = rng();
    if (patches.length >= wallCap) continue;
    if (!rockOn(s - rad) || !rockOn(s) || !rockOn(s + rad) || taper(s - rad) < 1 || taper(s + rad) < 1) continue;
    const p = out.at(s);
    if (!clear(p.x, p.z, rad + 0.2 + WALL_BUMP)) continue;
    if (!patches.every((o) => Math.abs(o.s - s) >= 0.8)) continue;
    patches.push({ s, h, rad, tint });
  }
  // Each a mound standing out of the liner at its spot, along the wall's
  // normal into the room, 0.02 off it.
  const wallMoss = [];
  for (const pt of patches) {
    const q = linerAt(pt.s, pt.h);
    const p = q.p;
    const top = mossLump(m, {
      x: q.x + p.nx * 0.02, y: q.y, z: q.z + p.nz * 0.02, nx: p.nx, ny: 0, nz: p.nz,
      rad: pt.rad, color: mossA.clone().lerp(mossB, pt.tint).multiplyScalar(0.95), salt: pt.s + pt.h,
    });
    wallMoss.push({ x: p.wx, y: q.y, z: p.wz, nx: p.nx, nz: p.nz, top: { x: top.x, y: top.y, z: top.z } });
  }

  // --- the glow: the liner and the moss near a crystal cluster catch its colour
  if (crystals?.spots?.length) {
    glowTint(m, crystals, y0, 0, linerVerts);
    glowTint(m, crystals, y0, mossFrom, m.pos.length / 3);
  }

  let geometry = null;
  if (!raw) {
    geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(m.pos, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(m.col, 3));
    geometry.setIndex(m.idx);
    geometry.computeVertexNormals();
  }

  // How far in from (x, y, z) on the wall line, along the wall's normal into
  // the room, the liner's face stands (0 where there is no liner): gorge.js
  // sets the Glitter Cave's flecks on the liner rather than behind it.
  const ray = new THREE.Ray();
  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), hit = new THREE.Vector3();
  const P = m.pos;
  const linerDepth = (x, y, z, nx, nz) => {
    ray.origin.set(x - nx * 0.05, y, z - nz * 0.05);
    ray.direction.set(nx, 0, nz).normalize();
    let best = null;
    for (let i = 0; i < linerTris.length; i += 3) {
      const [a, b, cc] = [linerTris[i], linerTris[i + 1], linerTris[i + 2]];
      if (Math.abs(P[a * 3 + 1] - y) > 0.5 && Math.abs(P[cc * 3 + 1] - y) > 0.5) continue;
      A.fromArray(P, a * 3); B.fromArray(P, b * 3); C.fromArray(P, cc * 3);
      if (!ray.intersectTriangle(A, B, C, false, hit)) continue;
      const d = hit.distanceTo(ray.origin) - 0.05;
      if (d < 1.0 && (best === null || d < best)) best = d;
    }
    return Math.max(0, best ?? 0);
  };

  const arrays = raw ? { pos: m.pos, col: m.col, idx: m.idx, nor: normalsOf(m.pos, m.idx), linerVerts } : {};
  return { geometry, ...arrays, parts: { ...m.parts }, stalactiteTips, nest, linerDepth, mossBlobs, wallMoss };
}

// =============================================================================
// A deep cave's corridor and bend, dressed (polish-gorgeway, Task 4).
//
// The corridor and the bend are a bare L of rock box (builder.rockTerrain):
// flat slab walls and a flat ceiling the chase camera often hugs. This sweeps
// a rounded, rough TUNNEL liner along the cave's walking line from the mouth
// (path[0]) round the corner (path[1]) to the chamber's edge (path[2]):
// straight walls low down, rounding over into a vault under the roof. Each
// liner vertex moves only inward (toward the axis, and down on the vault) by
// seeded value noise: at most TUNNEL_BUMP_LOW below COVE_FROM, where the
// camera sits between the cat and the wall, and TUNNEL_BUMP_VAULT above;
// the bumps fade out over TUNNEL_TAPER at both ends, where an END FRAME fills
// between the arch and the box's rectangle so no bare box shows round it.
// Two stubby STALACTITES (the chamber's blunt spike) hang from the vault, none
// near the mouth; three thin hanging ROOTS hang near the mouth, no lower than
// ROOT_MIN_Y; three lumpy MOSS mounds (mossLump) grow on the low walls.
//
// The corner: on each leg a station's lateral axis is level and points to the
// bend's outer side, so u = ±1.5 lands on the box's side walls. Within 1.5 m
// either side of the corner the stations fan round the L's inner corner I: a
// station's u = -1.5 stays at I and u = +1.5 walks along the outer walls, so
// the corner station's axis is the legs' bisector scaled by √2 (a mitre) and
// |u| = 1.5 lands exactly on the L's inner and outer corners. (Ordinary leg
// stations there would fold over behind the inner corner.)
//
// Pure geometry from the cave's record and a seed: no Math.random, no scene.
// `clear(x, z, reach)` (gorge.js's caveClear for the cave) is asked for every
// low liner vertex, and one that fails goes back to the wall line.
// =============================================================================
export const TUNNEL_BUMP_LOW = 0.12; // the most a liner vertex stands in below COVE_FROM
export const TUNNEL_BUMP_VAULT = 0.2; // ... and on the vault above it
export const ROOT_MIN_Y = 1.7; // no hanging root comes lower over the floor
const TUNNEL_HALF = 1.5; // the corridor's and the bend's half-width
const TUNNEL_STEP = 0.55; // at most this between stations along the walking line
const TUNNEL_TAPER = 0.8; // the bumps fade out over this at both ends
// (u, h): one side of the profile, from the foot up to the vault's crown
const TUNNEL_SIDE = [[1.5, -0.02], [1.5, 0.8], [1.5, 1.55], [1.35, 2.1], [0.9, 2.45]];
const TUNNEL_PROFILE = [
  ...TUNNEL_SIDE,
  [0, CORRIDOR_HEADROOM - 0.02],
  ...TUNNEL_SIDE.slice().reverse().map(([u, h]) => [-u, h]),
];
const EDGE_R = 0.08; // the L's inner corner, rounded to this radius low down
const EDGE_FADE = 0.6; // ... blending into the legs' bumps over this
const ROOT_COLORS = [0x5e452d, 0x6b4f33];
const TUNNEL_STALACTITES = 2;
const HANG_BURY = 0.1; // a tunnel stalactite's root, this far up into the vault
const TUNNEL_ROOTS = 3;
const TUNNEL_MOSS = 3;
const MOSS_SEAT = 0.02; // a tunnel moss mound's foot, this far behind the liner's face

// Seeded value noise on (s along the tunnel, p along the profile), two octaves.
function tunnelNoise(rng, sLen, pLen) {
  const octaves = NOISE_STEP.map((step) => {
    const ns = Math.ceil(sLen / step) + 2, np = Math.ceil(pLen / step) + 2;
    return { ns, np, step, table: Array.from({ length: ns * np }, () => rng()) };
  });
  const one = ({ np, step, table }, s, p) => {
    const fs = Math.max(0, s) / step, fp = Math.max(0, p) / step;
    const i0 = Math.floor(fs), j0 = Math.floor(fp);
    const u = smooth(fs - i0), v = smooth(fp - j0);
    const cell = (i, j) => table[i * np + j];
    return lerp(lerp(cell(i0, j0), cell(i0 + 1, j0), u), lerp(cell(i0, j0 + 1), cell(i0 + 1, j0 + 1), u), v);
  };
  // stretched about the middle for a rougher look, held to 0..1
  return (s, p) => Math.min(1, Math.max(0, ((one(octaves[0], s, p) * 2 + one(octaves[1], s, p)) / 3 - 0.5) * 1.8 + 0.5));
}

// The vault's height over the floor at |u| (the profile without its bumps).
function vaultHeight(au) {
  const side = TUNNEL_PROFILE.slice(2, 6).reverse(); // crown out to (1.5, 1.55)
  for (let k = 0; k + 1 < side.length; k++) {
    const [u0, h0] = side[k], [u1, h1] = side[k + 1];
    if (au <= u1) return lerp(h0, h1, (au - u0) / (u1 - u0));
  }
  return side[side.length - 1][1];
}

// `mouthTint` (optional, polish-gorge5): { color, len } — the liner and the
// mouth's end frame start in `color` (the sandstone round the mouth) at s = 0
// and blend to the cave's own colours by s = len (smoothstep), so the warm
// arch outside does not frame a cold box. Without it, as before.
export function caveTunnel(cave, { clear, seed, crystals, mouthTint } = {}) {
  const y0 = cave.y;
  const [p0, pc, p2] = cave.path;
  const L1 = Math.hypot(pc[0] - p0[0], pc[1] - p0[1]);
  const L2 = Math.hypot(p2[0] - pc[0], p2[1] - pc[1]);
  const S = L1 + L2;
  const d1 = [(pc[0] - p0[0]) / L1, (pc[1] - p0[1]) / L1];
  const d2 = [(p2[0] - pc[0]) / L2, (p2[1] - pc[1]) / L2];
  const H = TUNNEL_HALF;
  const at = (o, a, ka, b, kb) => [o[0] + a[0] * ka + b[0] * kb, o[1] + a[1] * ka + b[1] * kb];
  const I = at(pc, d1, -H, d2, H); // the L's inner corner
  const A = at(pc, d1, -H, d2, -H); // the outer walls' corner zone: A, the outer corner, B
  const Oc = at(pc, d1, H, d2, -H);
  const B = at(pc, d1, H, d2, H);
  // A station's frame at s along the walking line: its centre, its lateral
  // axis (u = 1.5 on the outer side's wall) and its forward direction.
  const frameAt = (s) => {
    if (s <= L1 - H) return { c: at(p0, d1, s, d1, 0), l: [-d2[0], -d2[1]], f: d1 };
    if (s >= L1 + H) return { c: at(pc, d2, s - L1, d2, 0), l: d1, f: d2 };
    const O = s < L1
      ? [lerp(A[0], Oc[0], (s - L1 + H) / H), lerp(A[1], Oc[1], (s - L1 + H) / H)]
      : [lerp(Oc[0], B[0], (s - L1) / H), lerp(Oc[1], B[1], (s - L1) / H)];
    const f = [d1[0] + d2[0], d1[1] + d2[1]];
    const fl = Math.hypot(...f);
    return { c: [(I[0] + O[0]) / 2, (I[1] + O[1]) / 2], l: [(O[0] - I[0]) / (2 * H), (O[1] - I[1]) / (2 * H)], f: [f[0] / fl, f[1] / fl] };
  };
  const onLeg = (s) => s <= L1 - H || s >= L1 + H;
  // 1 through the corner's fan, fading out over EDGE_FADE either side of it
  const fanW = (s) => smooth(1 - (Math.abs(s - L1) - H) / EDGE_FADE);

  // the stations: ~TUNNEL_STEP apart on each leg, and as many either side of
  // the corner through its fan
  const ss = [];
  const run = (from, to, first) => {
    const n = Math.max(1, Math.ceil((to - from) / TUNNEL_STEP - 1e-9));
    for (let i = first; i <= n; i++) ss.push(from + ((to - from) * i) / n);
  };
  run(0, L1 - H, 0);
  run(L1 - H, L1, 1);
  run(L1, L1 + H, 1);
  run(L1 + H, S, 1);

  // the profile's length along itself (for the noise) and its inward normals
  const P = TUNNEL_PROFILE;
  const pa = [0];
  for (let k = 1; k < P.length; k++) pa.push(pa[k - 1] + Math.hypot(P[k][0] - P[k - 1][0], P[k][1] - P[k - 1][1]));
  const inN = P.map(([u, h], k) => {
    if (Math.abs(u) >= H - 1e-9 && h < COVE_FROM) return [-Math.sign(u), 0]; // the low walls: straight in
    const a = P[Math.max(0, k - 1)], b = P[Math.min(P.length - 1, k + 1)];
    const tu = b[0] - a[0], th = b[1] - a[1], tl = Math.hypot(tu, th);
    return [-th / tl, tu / tl];
  });

  const rng = mulberry32(seed >>> 0);
  const noise = tunnelNoise(rng, S, pa[pa.length - 1]);
  const m = mesher(['liner', 'frames', 'stalactites', 'roots', 'moss']);
  const ranges = {};
  const mark = (part, from) => { ranges[part] = [from, m.pos.length / 3]; };
  const taper = (s) => smooth(Math.min(s, S - s) / TUNNEL_TAPER);
  const world = (fr, u, h) => ({ x: fr.c[0] + fr.l[0] * u, y: y0 + h, z: fr.c[1] + fr.l[1] * u });
  // how far in a liner vertex at (s, k) stands, and whether it went back to the wall
  const bumpOf = (s, k) => {
    const n = noise(s, pa[k]);
    return { n, b: taper(s) * n * (P[k][1] < COVE_FROM ? TUNNEL_BUMP_LOW : TUNNEL_BUMP_VAULT) };
  };
  const base = new THREE.Color(LINER_COLORS[cave.id] ?? LINER_COLORS.echo);
  const c = new THREE.Color();
  const shade = (h, n) => c.copy(base).multiplyScalar(0.75 + 0.25 * (0.5 * Math.min(1, Math.max(0, h) / 1.6) + 0.5 * n));
  const tint = mouthTint ? new THREE.Color(mouthTint.color) : null;
  const tintLen = mouthTint?.len ?? 3.5;
  const tinted = (s, col) => (tint ? col.lerp(tint, 1 - smooth(s / tintLen)) : col);

  // --- the liner ---------------------------------------------------------------------
  let from = 0;
  const stations = [];
  const bumps = []; // per station, per profile point: how far in it stands
  for (const s of ss) {
    const fr = frameAt(s);
    const row = [];
    const ids = P.map(([u, h], k) => {
      let { n, b } = bumpOf(s, k);
      // the inner corner's low wall: a steady rounded edge round I (a bump of
      // changing depth there would turn its faces along the walk)
      if (u <= -H + 1e-9 && h < COVE_FROM) b = lerp(b, EDGE_R / Math.hypot(...fr.l), fanW(s));
      let q = world(fr, u + inN[k][0] * b, h + inN[k][1] * b);
      if (h < COVE_FROM && !clear(q.x, q.z, 0)) { q = world(fr, u, h); b = 0; n = 0; }
      row.push(b);
      return m.vert(q.x, q.y, q.z, tinted(s, shade(h, n)));
    });
    bumps.push(row);
    stations.push({ s, x: fr.c[0], z: fr.c[1], lx: fr.l[0], lz: fr.l[1], ids });
  }
  // (b - a) × (cc - a), along the walk and up the outer wall, faces into the
  // tunnel when the bend turns to the legs' right; else the other way round
  const flip = -d1[1] * d2[0] + d1[0] * d2[1] < 0;
  const quad = (part, a, b, cc, d) => {
    if (flip) { m.tri(part, a, cc, b); m.tri(part, a, d, cc); } else { m.tri(part, a, b, cc); m.tri(part, a, cc, d); }
  };
  for (let i = 0; i + 1 < stations.length; i++) {
    const s0 = stations[i].ids, s1 = stations[i + 1].ids;
    for (let k = 0; k + 1 < P.length; k++) quad('liner', s0[k], s1[k], s1[k + 1], s0[k + 1]);
  }
  mark('liner', from);

  // A triangle turned to face along (wx, wy, wz).
  const V = (i) => new THREE.Vector3(m.pos[i * 3], m.pos[i * 3 + 1], m.pos[i * 3 + 2]);
  const facing = (part, a, b, cc, want) => {
    const n = V(b).sub(V(a)).cross(V(cc).sub(V(a)));
    if (n.dot(want) >= 0) m.tri(part, a, b, cc); else m.tri(part, a, cc, b);
  };

  // --- the end frames: between the end's arch and the box's rectangle ---------------
  from = m.pos.length / 3;
  for (const [s, out] of [[0, -1], [S, 1]]) {
    const fr = frameAt(s);
    const want = new THREE.Vector3(fr.f[0] * out, 0, fr.f[1] * out);
    const v = (u, h) => { const q = world(fr, u, h); return m.vert(q.x, q.y, q.z, tinted(s, shade(h, 0.5))); };
    // the arch from (1.5, 1.55) over to (-1.5, 1.55); the bumps are tapered away here
    const arch = P.map(([u, h], k) => (k >= 2 && k <= 8 ? v(u, h) : -1));
    const top = v(0, CORRIDOR_HEADROOM);
    for (const [sgn, ks] of [[1, [2, 3, 4, 5]], [-1, [8, 7, 6, 5]]]) {
      const q = v(sgn * H, CORRIDOR_HEADROOM);
      for (let j = 0; j + 1 < ks.length; j++) facing('frames', q, arch[ks[j]], arch[ks[j + 1]], want);
      facing('frames', q, arch[5], top, want);
    }
  }
  mark('frames', from);

  // --- stalactites ---------------------------------------------------------------------
  // The liner's height over the floor at (s, u) on a leg, |u| < 0.9: across
  // the two stations either side of s, between the vault's profile points
  // (u 0.9, 0, -0.9), bumps and all.
  const clamp01 = (t) => Math.min(1, Math.max(0, t));
  const linerVault = (s, u) => {
    let i = 0;
    while (i + 2 < stations.length && stations[i + 1].s < s) i++;
    const heightOn = (st) => {
      const pts = [4, 5, 6].map((k) => {
        const id = st.ids[k];
        const dx = m.pos[id * 3] - st.x, dz = m.pos[id * 3 + 2] - st.z;
        return [dx * st.lx + dz * st.lz, m.pos[id * 3 + 1] - y0];
      }).sort((a, b) => a[0] - b[0]);
      const [a, b] = u <= pts[1][0] ? [pts[0], pts[1]] : [pts[1], pts[2]];
      return lerp(a[1], b[1], clamp01((u - a[0]) / (b[0] - a[0])));
    };
    const s0 = stations[i], s1 = stations[i + 1];
    return lerp(heightOn(s0), heightOn(s1), clamp01((s - s0.s) / (s1.s - s0.s)));
  };
  from = m.pos.length / 3;
  const hangColor = base.clone().multiplyScalar(1.05);
  const tipColor = base.clone().lerp(new THREE.Color(0xffffff), 0.15);
  const hangs = [];
  for (let t = 0; t < 60; t++) {
    const s = 2.2 + rng() * (S - 3.0), u = (rng() * 2 - 1) * 0.6, len = 0.25 + rng() * 0.25;
    const sides = 5 + Math.floor(rng() * 2), turn = rng() * Math.PI * 2;
    if (hangs.length >= TUNNEL_STALACTITES) continue;
    if (!onLeg(s) || Math.abs(s - L1 + H) < 0.3 || Math.abs(s - L1 - H) < 0.3) continue;
    const q = world(frameAt(s), u, 0);
    if (Math.hypot(q.x - p0[0], q.z - p0[1]) < MOUTH_KEEP) continue;
    if (!hangs.every((o) => Math.abs(o.s - s) >= 1.5)) continue;
    // Measured from the liner's bumped vault there (it can stand 0.2 lower
    // than the bare one): the visible length stays len, and the root goes
    // HANG_BURY up into the vault, no higher than the box's roof.
    const vault = linerVault(s, u);
    const root = Math.min(vault + HANG_BURY, CORRIDOR_HEADROOM - 0.005);
    hangs.push({ s, x: q.x, z: q.z, root, vault, tipH: Math.max(STALACTITE_MIN_Y + 0.01, vault - len), sides, turn });
  }
  const stalactiteTips = [];
  for (const h of hangs) {
    const len = h.vault - h.tipH;
    spike(m, 'stalactites', h.x, h.z, y0 + h.root, y0 + h.tipH, 0.13 + 0.12 * len, h.sides, h.turn, hangColor, tipColor);
    stalactiteTips.push({ x: h.x, y: y0 + h.tipH, z: h.z, root: y0 + h.root });
  }
  mark('stalactites', from);

  // --- hanging roots: two crossed thin strips, both faces, curling at the end -------
  from = m.pos.length / 3;
  const rootTips = [];
  const roots = [];
  for (let t = 0; t < 40; t++) {
    const s = 1 + rng() * 2, au = 0.5 + rng() * 0.6, side = rng() < 0.5 ? -1 : 1;
    const tipH = ROOT_MIN_Y + 0.05 + rng() * 0.25, w = 0.02 + rng() * 0.01;
    const twist = rng() * Math.PI, curl = rng() * Math.PI * 2, tint = rng();
    if (roots.length >= TUNNEL_ROOTS) continue;
    if (!roots.every((o) => Math.abs(o.s - s) >= 0.5)) continue;
    roots.push({ s, u: side * au, tipH, w, twist, curl, tint });
  }
  const rootA = new THREE.Color(ROOT_COLORS[0]), rootB = new THREE.Color(ROOT_COLORS[1]);
  for (const rt of roots) {
    const q = world(frameAt(rt.s), rt.u, 0);
    const topH = vaultHeight(Math.abs(rt.u));
    // the line down it: 3 segments, swinging out a little toward the tip
    const line = [0, 1 / 3, 2 / 3, 1].map((t) => ({
      x: q.x + Math.cos(rt.curl) * 0.07 * t * t,
      y: y0 + lerp(topH, rt.tipH, t),
      z: q.z + Math.sin(rt.curl) * 0.07 * t * t,
      w: rt.w * (1 - 0.45 * t),
    }));
    for (const a of [rt.twist, rt.twist + Math.PI / 2]) {
      const ex = Math.cos(a), ez = Math.sin(a);
      const want = new THREE.Vector3(-ez, 0, ex);
      for (const face of [1, -1]) {
        const ids = line.map((p, i) => {
          c.copy(rootA).lerp(rootB, rt.tint).multiplyScalar(1 - 0.15 * (i / 3));
          return [m.vert(p.x - ex * p.w / 2, p.y, p.z - ez * p.w / 2, c), m.vert(p.x + ex * p.w / 2, p.y, p.z + ez * p.w / 2, c)];
        });
        const fw = want.clone().multiplyScalar(face);
        for (let i = 0; i + 1 < ids.length; i++) {
          facing('roots', ids[i][0], ids[i][1], ids[i + 1][1], fw);
          facing('roots', ids[i][0], ids[i + 1][1], ids[i + 1][0], fw);
        }
      }
    }
    const tip = line[line.length - 1];
    rootTips.push({ x: tip.x, y: tip.y, z: tip.z });
  }
  mark('roots', from);

  // --- moss on the low walls, in the first 4 m ---------------------------------------
  // Each mound is draped over the liner: every vertex moves in along the
  // wall's normal by the liner's own depth at its spot (the bumps interpolated
  // between stations and up the low wall's profile points), less MOSS_SEAT,
  // so the rim sits a touch into the rock and none of it hangs in front.
  // (The mounds stand on the first leg, s < 4.3 < L1 - 1.5, where a
  // station's lateral axis is a unit.)
  from = m.pos.length / 3;
  const mossA = new THREE.Color(MOSS[0]), mossB = new THREE.Color(MOSS[1]);
  // the liner's depth in from the wall line at (s, h) on a low side wall: on
  // the very triangles the liner's quads split into (a-b-cc and a-cc-d, a at
  // station i's profile point k, cc at station i + 1's point k + 1)
  const wallDepth = (s, h, side) => {
    const kWall = side > 0 ? [0, 1, 2] : [10, 9, 8]; // up the wall: h -0.02, 0.8, 1.55
    let i = 0;
    while (i + 2 < stations.length && stations[i + 1].s < s) i++;
    let w = 0;
    while (w + 2 < kWall.length && P[kWall[w + 1]][1] < h) w++;
    const k = Math.min(kWall[w], kWall[w + 1]);
    const ts = clamp01((s - stations[i].s) / (stations[i + 1].s - stations[i].s));
    const th = clamp01((h - P[k][1]) / (P[k + 1][1] - P[k][1]));
    const at = (j, kk) => bumps[j][kk] * Math.hypot(stations[j].lx, stations[j].lz);
    const da = at(i, k), db = at(i + 1, k), dc = at(i + 1, k + 1), dd = at(i, k + 1);
    return ts >= th ? da + ts * (db - da) + th * (dc - db) : da + th * (dd - da) + ts * (dc - dd);
  };
  const mounds = [];
  for (let t = 0; t < 60; t++) {
    const s = 0.9 + rng() * 3.1, side = rng() < 0.5 ? -1 : 1, h = 0.35 + rng() * 0.4;
    const rad = 0.15 + rng() * 0.1, tint = rng();
    if (mounds.length >= TUNNEL_MOSS) continue;
    if (!mounds.every((o) => Math.abs(o.s - s) >= 0.8)) continue;
    const fr = frameAt(s);
    const ll = Math.hypot(...fr.l);
    const depth = Math.max(0, wallDepth(s, h, side) - MOSS_SEAT);
    const q = world(fr, side * (H - depth / ll), h);
    if (!clear(q.x, q.z, rad * MOSS_REACH + 0.15)) continue;
    mounds.push({ s, side, h, q, nx: -side * fr.l[0] / ll, nz: -side * fr.l[1] / ll, fx: fr.f[0], fz: fr.f[1], depth, rad, tint });
  }
  const mossMounds = [];
  for (const md of mounds) {
    const first = m.pos.length / 3;
    const { rim } = mossLump(m, {
      x: md.q.x, y: md.q.y, z: md.q.z, nx: md.nx, ny: 0, nz: md.nz,
      rad: md.rad, color: mossA.clone().lerp(mossB, md.tint).multiplyScalar(0.95), salt: md.s,
    });
    for (let i = first; i < m.pos.length / 3; i++) {
      const dx = m.pos[i * 3] - md.q.x, dz = m.pos[i * 3 + 2] - md.q.z;
      const sv = md.s + dx * md.fx + dz * md.fz, hv = m.pos[i * 3 + 1] - y0;
      const shift = Math.max(0, wallDepth(sv, hv, md.side) - MOSS_SEAT) - md.depth;
      m.pos[i * 3] += md.nx * shift;
      m.pos[i * 3 + 2] += md.nz * shift;
    }
    mossMounds.push({ s: md.s, nx: md.nx, nz: md.nz, rim });
  }
  mark('moss', from);

  // the chamber's glow reaches the tunnel's last stations and its end frame too
  // (the same rule as caveRoom's), so no colour seam shows where they meet
  if (crystals?.spots?.length) {
    glowTint(m, crystals, y0, ...ranges.liner);
    glowTint(m, crystals, y0, ...ranges.frames);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(m.pos, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(m.col, 3));
  geometry.setIndex(m.idx);
  geometry.computeVertexNormals();
  return { geometry, parts: { ...m.parts }, stalactiteTips, rootTips, stations, ranges, mossMounds };
}

// How far (x, z) stands inside the chamber's rounded corners (Infinity away from them).
function cornerRoom(r, x, z) {
  const R = CORNER_R;
  const cx = x < r.minX + R ? r.minX + R : x > r.maxX - R ? r.maxX - R : null;
  const cz = z < r.minZ + R ? r.minZ + R : z > r.maxZ - R ? r.maxZ - R : null;
  if (cx === null || cz === null) return Infinity;
  return R - Math.hypot(x - cx, z - cz);
}

// A small sin hash (builder.js's), for per-vertex jitter that draws nothing.
function hashOf(x, z) {
  const h = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return h - Math.floor(h);
}

// The Snug Cave's nest: a shallow bowl turned round its centre, twig rings
// outside and a soft moss-and-fur lining in the hollow; at most 0.16 m high.
function nestMesh(m, nest, y0, rng, c) {
  // [radius, height] from the middle of the hollow out over the rim to the floor
  const prof = [[0, 0.035], [0.14, 0.04], [0.24, 0.065], [0.3, 0.11], [0.35, 0.15], [0.41, 0.125], [0.45, 0.04], [0.44, -0.01]];
  const LINING = 3; // the first three rings are lining, the rest twigs
  const segsN = 16;
  const twigs = TWIGS.map((h) => new THREE.Color(h));
  const moss = new THREE.Color(MOSS[1]), fur = new THREE.Color(FUR);
  const turn = rng() * Math.PI * 2;
  const ids = prof.map(([rad, hy], pi) => Array.from({ length: segsN }, (_, i) => {
    const a = turn + (i / segsN) * Math.PI * 2;
    const twig = pi >= LINING;
    const jr = twig && pi < prof.length - 1 ? 0.012 * (hashOf(pi * 7 + i, nest.x) - 0.5) * 2 : 0;
    const jy = twig && hy > 0.05 ? 0.008 * (hashOf(i, pi + nest.z) - 0.5) : 0;
    if (twig) c.copy(twigs[(pi + i + Math.floor(hashOf(i, pi) * 2)) % twigs.length]);
    else c.copy(moss).lerp(fur, hashOf(i + pi * 3, nest.z));
    return m.vert(nest.x + Math.cos(a) * (rad + jr), y0 + Math.min(0.158, hy + jy), nest.z + Math.sin(a) * (rad + jr), c);
  }));
  for (let pi = 0; pi + 1 < prof.length; pi++) {
    for (let i = 0; i < segsN; i++) {
      const j = (i + 1) % segsN;
      const a = ids[pi][i], b = ids[pi][j], cc = ids[pi + 1][j], d = ids[pi + 1][i];
      if (pi === 0) { m.tri('nest', a, cc, d); continue; } // the middle's ring is one point
      // round and outward along the profile: faces up and out
      m.tri('nest', a, b, cc);
      m.tri('nest', a, cc, d);
    }
  }
}

// --- crystal clusters (Task 6) -----------------------------------------------------
// Each spot { x, y, z, nx, nz } is a point on the cave's floor in front of a
// wall, (nx, nz) the wall's normal into the room. A spot grows 4-7 hexagonal
// prisms with pointed tips: the tallest in the middle (0.62-0.75 m × size),
// the rest shorter toward either side (0.25-0.6 m × size), 0.06-0.14 m × size
// in radius, each leaning out from the wall 10-35° (the middle least) and
// fanning a little to its side. Every vertex stays within CLUSTER_REACH of its
// spot across the ground (a prism that would reach further leans less), and
// each prism's foot sits flat on the floor. One merged, emissive, flat-shaded
// mesh, out of the shadow pass, the same every time for one seed.
const DEG = Math.PI / 180;
const BACK_KEEP = 0.07;
export function crystalClusters(spots, seed, { color = 0x9fc7d8, size = 1, id = 'cave' } = {}) {
  const pos = [], col = [], idx = [];
  // vertex colours shade the material's own colour: darker at the foot
  const foot = new THREE.Color(0.65, 0.65, 0.65), tone = new THREE.Color(0.95, 0.95, 0.95), tip = new THREE.Color(1, 1, 1);
  const vert = (v, c) => { pos.push(v.x, v.y, v.z); col.push(c.r, c.g, c.b); return pos.length / 3 - 1; };
  const a = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  const o = new THREE.Vector3(), q = new THREE.Vector3(), X = new THREE.Vector3(1, 0, 0);
  spots.forEach((sp, si) => {
    const rng = mulberry32((seed + Math.imul(si + 1, 0x9e3779b1)) >>> 0);
    const n = 4 + Math.floor(rng() * 4);
    const maxRank = Math.ceil((n - 1) / 2);
    const tx = -sp.nz, tz = sp.nx; // along the wall
    for (let i = 0; i < n; i++) {
      const hr = rng(), hu = rng(), hh = rng(), hl = rng(), hv = rng(), hp = rng();
      const rank = Math.ceil(i / 2), side = i % 2 ? 1 : -1, f = rank / maxRank;
      const rad = (rank === 0 ? 0.11 + 0.03 * hr : 0.06 + 0.06 * hr * (1 - 0.5 * f)) * size;
      let u = rank === 0 ? (hu - 0.5) * 0.06 : side * f * (0.7 + 0.3 * hu) * Math.max(0.02, CLUSTER_SPREAD - rad);
      // out from the spot enough that its foot never reaches back more than
      // BACK_KEEP behind it (a spot stands 0.1 m and more off the wall line)
      // (a leaning prism's foot reaches back rad / cos(lean))
      const v0 = 0.02 + 0.05 * hv;
      const H = size * (rank === 0 ? 0.62 + 0.13 * hh : 0.25 + 0.35 * (1 - rank / (maxRank + 1)) * (0.75 + 0.25 * hh));
      let lean = rank === 0 ? (10 + 5 * hl) * DEG : (10 + 25 * f * (0.6 + 0.4 * hl)) * DEG;
      const fan = rank === 0 ? 0 : side * 0.5 * f;
      const ring = [], cap = [];
      let tipV = null;
      // build it, and lean it less (then draw it in) until it fits its reach
      for (let k = 0; k < 40; k++) {
        let dx = sp.nx + tx * fan, dz = sp.nz + tz * fan;
        const dl = Math.hypot(dx, dz);
        dx /= dl; dz /= dl;
        a.set(Math.sin(lean) * dx, Math.cos(lean), Math.sin(lean) * dz);
        e1.crossVectors(X, a).normalize();
        e2.crossVectors(a, e1);
        const v = Math.max(v0, rad / Math.cos(lean) - BACK_KEEP);
        const bx = sp.x + tx * u + sp.nx * v, bz = sp.z + tz * u + sp.nz * v;
        const shoulder = H - rad * 1.6;
        ring.length = 0; cap.length = 0;
        let far = 0;
        for (let j = 0; j < 6; j++) {
          const phi = hp * Math.PI + (j / 6) * Math.PI * 2;
          o.copy(e1).multiplyScalar(Math.cos(phi) * rad).addScaledVector(e2, Math.sin(phi) * rad);
          // the foot: straight down the axis onto the floor
          const t0 = -o.y / a.y;
          q.set(bx, sp.y, bz).add(o).addScaledVector(a, t0);
          ring.push(q.clone());
          q.set(bx, sp.y, bz).add(o).addScaledVector(a, shoulder);
          cap.push(q.clone());
        }
        tipV = new THREE.Vector3(bx, sp.y, bz).addScaledVector(a, H);
        for (const p of [...ring, ...cap, tipV]) far = Math.max(far, Math.hypot(p.x - sp.x, p.z - sp.z));
        if (far <= CLUSTER_REACH - 0.005) break;
        if (lean > 4 * DEG) lean *= 0.85;
        else u *= 0.9;
      }
      const r0 = ring.map((p) => vert(p, foot));
      const r1 = cap.map((p) => vert(p, tone));
      const t = vert(tipV, tip);
      for (let j = 0; j < 6; j++) {
        const jn = (j + 1) % 6;
        idx.push(r0[j], r0[jn], r1[jn], r0[j], r1[jn], r1[j]);
        idx.push(r1[j], r1[jn], t);
      }
    }
  });
  let geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  // flat facets: a crystal's faces catch the light one by one
  const flat = geo.toNonIndexed();
  geo.dispose();
  geo = flat;
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, litMaterial(color, { emissive: color, emissiveIntensity: 0.9, vertexColors: true }));
  mesh.name = `caveCrystals:${id}`;
  mesh.castShadow = false;
  mesh.userData.noCast = true;
  return mesh;
}

// =============================================================================
// A cave mouth's rounded rock arch (polish-gorge5, Task 2).
//
// builder.rockTerrain cuts each cave corridor and the camp den as a plain
// rectangle in the organic sandstone. This builds the rock round one such
// opening, in the mouth plane's frame: u lateral (along (-nz, nx)), h up from
// the floor, w out of the rock along (nx, nz).
//
// The OUTLINE is the opening's arch: for a 3 m cave corridor it follows the
// tunnel liner's profile (TUNNEL_PROFILE, through its points on a smooth
// curve), so the liner's end frame and the arch line up; for a wider opening
// (the camp den) straight jambs to MOUTH_LOW_H, then a half-ellipse over the
// top (a quarter-ellipse each side, jamb to crown) with its crown at
// headroom - 0.04. Resampled evenly, each point moved in (never out)
// by seeded value noise up to MOUTH_JITTER. Then, out from the outline:
//   FRAME   on the mouth plane (w = MOUTH_FRAME_W, just outside the liner's
//           end frame at w = 0), from the outline out to the opening's
//           rectangle, so the box's square corners never show; for the camp
//           den (no tunnel liner behind it) twice, the copy facing in;
//   REVEAL  the arch's soffit: the outline from w = 0 out to the BROW
//           (0.05 at the foot, 0.35 at the crown, bumped by noise);
//   RIM     the brow rolling over (a quarter-round) through a lumpy middle
//           ring to an outer ring MOUTH_RIM (and always MOUTH_RIM_PAST past
//           the rectangle) out in the plane, seated MOUTH_SEAT behind the
//           real face: `surface(u, h)` is the face's measured offset along n
//           from the mouth plane (positive = proud), so the rim always meets
//           the relief-moved rock and never floats in front of it; over the
//           camp den's wide opening the rim also wanders by MOUTH_MOUND and
//           the brow swells with it, so its top edge is mounded rock;
//   STONES  a few low lumpy threshold boulders just outside the jambs,
//           flattened and set into the measured face (none stands more than
//           MOUTH_STONE_OUT out of the mouth plane, where a cat walks), never
//           in front of the opening; `clear(x, z, reach)` vets each.
// Nothing stands at w < 0 but the rim, just behind a recessed face, and the
// stones beside the opening, sunk into it. Below
// MOUTH_LOW_H nothing stands more than `lowIn` (MOUTH_LOW_IN) inside the
// opening's rectangle unless it is more than 0.6 m out; within MOUTH_CAM_HALF
// of the centre line nothing above MOUTH_LOW_H comes lower than MOUTH_CAM_H
// (the cave and chase cameras pass through there). The camp den's arch keeps
// the corridors' MOUTH_LOW_IN (0.12), not the den lining's LINER_IN (0.05),
// on purpose: its jambs stand at most 0.08 m in (measured), which at a 6 m
// wide den mouth is negligible (ruled so in the polish-gorge5 Task 2 review).
//
// Pure, seeded geometry (mulberry32 only, no THREE objects): returns indexed
// world positions with area-weighted smooth normals (normalsOf), the rim's
// vertex indices, the outline (u, h), the stones and vertex ranges per part.
// gorge.js colours it from the rock round it and appends it to rockFaces.
// =============================================================================
export const MOUTH_LOW_H = 1.0; // below this over the floor, the low walk rule
export const MOUTH_LOW_IN = 0.12; // ... the most anything stands inside the rectangle there
export const MOUTH_CAM_H = 1.9; // nothing over the camera line comes lower than this
export const MOUTH_CAM_HALF = 0.9; // ... within this of the centre line
const MOUTH_FOOT = -0.02; // the rings' feet, just into the floor
const MOUTH_JITTER = 0.08; // the outline's inward noise
const MOUTH_FRAME_W = 0.02; // the frame stands this far out (the liner's end frame is at 0)
const MOUTH_SEAT = 0.04; // the rim, this far behind the measured face
const MOUTH_RIM = 0.55; // the rim's reach out from the outline in the plane
const MOUTH_RIM_PAST = 0.45; // ... and at least this past the opening's rectangle
const MOUTH_MID = 0.45; // the middle ring, this far along to the rim
const MOUTH_MID_MIN = -0.04; // ... and never further than this behind the mouth plane
const BROW_FOOT = 0.05;
const BROW_CROWN = 0.35;
const BROW_BUMP = 0.06;
const MOUTH_STEP = 0.5; // the noise's lattice step along the outline, metres
// The camp den's arch is 6 m wide: an even rim over it reads as a slab with a
// ruled top edge. Its rim wanders in and out in the plane by up to ±MOUTH_MOUND
// (a quarter of that at the springline, all of it at the crown) and its brow
// and middle ring swell and sink with it, on mounds about MOUND_STEP apart.
// Its own seeded stream: the corridors' arches are untouched.
export const MOUTH_MOUND = 0.4;
const MOUND_STEP = 0.7;
const STONE_R = [0.18, 0.35];
const STONE_FLAT = 0.7; // a stone's height, of its width
const STONE_SINK = 0.3; // of its height, under the floor
const STONE_LUMP = 0.15; // ± a stone vertex's radius
const STONE_DEPTH = 0.55; // a stone's depth out from the wall, of its width
const MOUTH_STONE_OUT = 0.12; // no stone reaches further out of the mouth plane
const STONE_SHOW = 0.1; // ... and at least this of it stands proud of the face
// the icosahedron (three's IcosahedronGeometry, detail 0)
const ICO_T = (1 + Math.sqrt(5)) / 2;
const ICO_V = [
  [-1, ICO_T, 0], [1, ICO_T, 0], [-1, -ICO_T, 0], [1, -ICO_T, 0],
  [0, -1, ICO_T], [0, 1, ICO_T], [0, -1, -ICO_T], [0, 1, -ICO_T],
  [ICO_T, 0, -1], [ICO_T, 0, 1], [-ICO_T, 0, -1], [-ICO_T, 0, 1],
].map(([a, b, c]) => { const l = Math.hypot(a, b, c); return [a / l, b / l, c / l]; });
const ICO_F = [
  [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
  [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
];

// Area-weighted smooth vertex normals of an indexed triangle list, by hand
// (no scratch BufferGeometry: each would draw Math.random for its uuid).
export function normalsOf(pos, idx) {
  const nor = new Array(pos.length).fill(0);
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const e1x = pos[b] - pos[a], e1y = pos[b + 1] - pos[a + 1], e1z = pos[b + 2] - pos[a + 2];
    const e2x = pos[c] - pos[a], e2y = pos[c + 1] - pos[a + 1], e2z = pos[c + 2] - pos[a + 2];
    const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
    for (const v of [a, b, c]) { nor[v] += nx; nor[v + 1] += ny; nor[v + 2] += nz; }
  }
  for (let v = 0; v < nor.length; v += 3) {
    const l = Math.hypot(nor[v], nor[v + 1], nor[v + 2]);
    if (l > 1e-12) { nor[v] /= l; nor[v + 1] /= l; nor[v + 2] /= l; } else nor[v + 1] = 1;
  }
  return nor;
}

// Seeded 1-D value noise along [0, len], 0..1.
function lineNoise(rng, len, step = MOUTH_STEP) {
  const n = Math.ceil(len / step) + 2;
  const table = Array.from({ length: n }, () => rng());
  return (s) => {
    const f = Math.min(n - 1.000001, Math.max(0, s / step));
    const i = Math.floor(f);
    return lerp(table[i], table[i + 1], smooth(f - i));
  };
}

// One side of the outline, foot to crown, |u| decreasing: dense (u, h) samples.
function mouthSide({ half, headroom, tunnel }) {
  const out = [];
  if (tunnel) {
    // a Catmull-Rom through the liner's profile points, held inside |u| <= half
    const P = [...TUNNEL_SIDE, [0, CORRIDOR_HEADROOM - 0.02]];
    const at = (k) => P[Math.min(P.length - 1, Math.max(0, k))];
    // past the crown the curve mirrors, so its tangent there is level
    const ghost = (k) => (k >= P.length ? [-at(2 * (P.length - 1) - k)[0], at(2 * (P.length - 1) - k)[1]] : at(k));
    for (let k = 0; k + 1 < P.length; k++) {
      const p0 = ghost(k - 1), p1 = ghost(k), p2 = ghost(k + 1), p3 = ghost(k + 2);
      for (let i = 0; i < 16; i++) {
        const t = i / 16, t2 = t * t, t3 = t2 * t;
        const c = (j) => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2
          + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3);
        out.push([Math.min(half, Math.max(0, c(0))), c(1)]);
      }
    }
    out.push(P[P.length - 1].slice());
    return { side: out, spring: TUNNEL_SIDE[2][1] };
  }
  // straight jambs to MOUTH_LOW_H, then this side's quarter of the half-ellipse up to the crown
  const a = half, crown = headroom - 0.04, b = crown - MOUTH_LOW_H;
  for (let i = 0; i <= 8; i++) out.push([a, lerp(MOUTH_FOOT, MOUTH_LOW_H, i / 8)]);
  for (let i = 1; i <= 48; i++) {
    const th = (i / 48) * (Math.PI / 2);
    out.push([a * Math.cos(th), MOUTH_LOW_H + b * Math.sin(th)]);
  }
  return { side: out, spring: MOUTH_LOW_H };
}

// The whole outline, +u foot over the crown to the -u foot, resampled to n
// points evenly along its length (n odd: the middle one is the crown).
function mouthOutline(opts, n) {
  const { side, spring } = mouthSide(opts);
  const full = [...side, ...side.slice(0, -1).reverse().map(([u, h]) => [-u, h])];
  const acc = [0];
  for (let k = 1; k < full.length; k++) acc.push(acc[k - 1] + Math.hypot(full[k][0] - full[k - 1][0], full[k][1] - full[k - 1][1]));
  const len = acc[acc.length - 1];
  const pts = [];
  let k = 0;
  for (let i = 0; i < n; i++) {
    const s = (len * i) / (n - 1);
    while (k + 2 < full.length && acc[k + 1] < s) k++;
    const t = Math.min(1, Math.max(0, (s - acc[k]) / (acc[k + 1] - acc[k] || 1)));
    pts.push({ u: lerp(full[k][0], full[k + 1][0], t), h: lerp(full[k][1], full[k + 1][1], t), s });
  }
  pts[0].h = pts[n - 1].h = MOUTH_FOOT;
  return { pts, len, spring };
}

export function caveMouth({
  x, z, y, nx, nz, half, headroom, seed, surface = () => 0, clear = () => true,
  jitter = 1, lowIn = MOUTH_LOW_IN, tunnel, stones: stoneCount, mound, backFrame,
}) {
  const isTunnel = tunnel ?? (half === TUNNEL_HALF && headroom === CORRIDOR_HEADROOM);
  const n = isTunnel ? 23 : 29;
  const nStones = stoneCount ?? (isTunnel ? 3 : 4);
  const rng = mulberry32(seed >>> 0);
  const { pts, len, spring } = mouthOutline({ half, headroom, tunnel: isTunnel }, n);
  const nIn = lineNoise(rng, len), nBrow = lineNoise(rng, len), nMid = lineNoise(rng, len), nRim = lineNoise(rng, len);
  const moundAmp = jitter * (mound ?? (isTunnel ? 0 : MOUTH_MOUND));
  const mrng = mulberry32((seed ^ 0x5bd1e995) >>> 0);
  const nMound = lineNoise(mrng, len, MOUND_STEP), nSwell = lineNoise(mrng, len, MOUND_STEP);
  // -1..1 mounds along the outline, a quarter strength at the springline and full at the crown
  const moundAt = (p, noise) => (moundAmp ? (2 * noise(p.s) - 1) * (0.25 + 0.75 * smooth((p.h - spring) / Math.max(0.3, crownH0 - spring))) : 0);
  const lx = -nz, lz = nx;
  const pos = [], idx = [];
  const vert = (u, h, w) => { pos.push(x + lx * u + nx * w, y + h, z + lz * u + nz * w); return pos.length / 3 - 1; };
  const ranges = {};
  const parts = { arch: 0, reveal: 0, rim: 0, stones: 0 };
  // a triangle wound so its normal has a positive dot with (wu, wh, ww) in the frame
  const L = (i) => { const dx = pos[i * 3] - x, dz = pos[i * 3 + 2] - z; return [dx * lx + dz * lz, pos[i * 3 + 1] - y, dx * nx + dz * nz]; };
  const tri = (part, a, b, c, want) => {
    const A = L(a), B = L(b), C = L(c);
    const e1 = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], e2 = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    // (u, h, w) is a left-handed frame when (l, up, n) is: l × up = (-nz, 0, nx) × (0, 1, 0) = (-nx, 0, -nz) = -n
    const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const d = -(cr[0] * want[0] + cr[1] * want[1] + cr[2] * want[2]);
    if (d >= 0) idx.push(a, b, c); else idx.push(a, c, b);
    parts[part]++;
  };

  const crownH0 = pts[(n - 1) >> 1].h;
  // the outline, moved in by the noise; its in-plane outward normals
  const O = pts.map((p) => ({ ...p }));
  const outN = O.map((p, k) => {
    const a = pts[Math.max(0, k - 1)], b = pts[Math.min(n - 1, k + 1)];
    const tu = b.u - a.u, th = b.h - a.h, tl = Math.hypot(tu, th) || 1;
    // the outline runs +u foot -> crown -> -u foot: its right-hand normal points out
    return [th / tl, -tu / tl];
  });
  for (let k = 0; k < n; k++) {
    const p = O[k];
    const d = jitter * MOUTH_JITTER * nIn(p.s);
    p.u -= outN[k][0] * d;
    p.h = Math.max(MOUTH_FOOT, p.h - outN[k][1] * d);
    if (p.h < MOUTH_LOW_H) {
      const minU = half - lowIn;
      if (Math.abs(p.u) < minU && Math.abs(pts[k].u) >= minU - 1e-9) p.u = Math.sign(pts[k].u) * minU;
    }
    if (Math.abs(p.u) < MOUTH_CAM_HALF && p.h > MOUTH_LOW_H) p.h = Math.max(p.h, MOUTH_CAM_H);
  }
  const crownH = O[(n - 1) >> 1].h;
  const browOf = (k) => {
    const t = smooth(Math.max(0, O[k].h) / crownH);
    return Math.max(0.02, lerp(BROW_FOOT, BROW_CROWN, t) + jitter * BROW_BUMP * (2 * nBrow(O[k].s) - 1) * Math.min(1, O[k].h / 0.5 + 0.2)
      + 0.6 * moundAmp * Math.max(0, moundAt(O[k], nSwell)));
  };
  // how far out along (du, dh) from (u, h) the opening's rectangle ends
  const toRect = (u, h, du, dh) => {
    let t = Infinity;
    if (Math.abs(du) > 1e-9) t = Math.min(t, (half - Math.sign(du) * u) / Math.abs(du));
    if (dh > 1e-9) t = Math.min(t, (headroom - h) / dh);
    return Math.max(0, t);
  };

  // --- the frame: outline out to the rectangle, on the mouth plane ---------------
  let from = pos.length / 3;
  const Hs = half + 0.03, Ht = headroom + 0.03; // a hair past the box's edges
  const proj = (p) => {
    if (p.h <= spring) return { u: Math.sign(p.u || 1) * Hs, h: p.h, side: Math.sign(p.u || 1) };
    const du = p.u, dh = p.h - spring;
    const tS = Math.abs(du) > 1e-9 ? (Hs - Math.abs(p.u)) / Math.abs(du) : Infinity;
    const tT = (Ht - p.h) / dh;
    return tS < tT ? { u: Math.sign(du) * Hs, h: p.h + dh * tS, side: Math.sign(du) } : { u: p.u + du * tT, h: Ht, side: 0 };
  };
  const want0 = [0, 0, 1];
  const frameTri0 = idx.length;
  const P = O.map((p) => vert(p.u, p.h, MOUTH_FRAME_W));
  const Q = O.map((p) => { const q = proj(p); return { ...q, i: vert(q.u, q.h, MOUTH_FRAME_W) }; });
  for (let k = 0; k + 1 < n; k++) {
    const q0 = Q[k], q1 = Q[k + 1];
    const w0 = Math.hypot(q0.u - O[k].u, q0.h - O[k].h), w1 = Math.hypot(q1.u - O[k + 1].u, q1.h - O[k + 1].h);
    if (Math.max(w0, w1) < 0.02) continue; // a jamb the outline already fills
    if (q0.side === q1.side) {
      tri('arch', P[k], P[k + 1], q1.i, want0);
      tri('arch', P[k], q1.i, q0.i, want0);
    } else {
      const s = q0.side || q1.side;
      const corner = vert(s * Hs, Ht, MOUTH_FRAME_W);
      tri('arch', P[k], q0.i, corner, want0);
      tri('arch', P[k], corner, q1.i, want0);
      tri('arch', P[k], q1.i, P[k + 1], want0);
    }
  }
  // A wide room behind the opening (the camp den) has no tunnel end frame
  // filling the box's top corners from inside: the frame again, on its own
  // vertices (shared ones would cancel the normals), facing into the room, so
  // the opening reads arched from inside too.
  if (backFrame ?? !isTunnel) {
    const frameTri1 = idx.length;
    const copy = new Map();
    const twin = (i) => {
      if (!copy.has(i)) copy.set(i, vert(...L(i)));
      return copy.get(i);
    };
    for (let t = frameTri0; t < frameTri1; t += 3) tri('arch', twin(idx[t]), twin(idx[t + 1]), twin(idx[t + 2]), [0, 0, -1]);
  }
  ranges.frame = [from, pos.length / 3];

  // --- the reveal: the soffit from the mouth plane out to the brow ----------------
  from = pos.length / 3;
  const A = O.map((p) => vert(p.u, p.h, 0));
  const brow = O.map((p, k) => browOf(k));
  const B = O.map((p, k) => vert(p.u, p.h, brow[k]));
  for (let k = 0; k + 1 < n; k++) {
    const want = [-(outN[k][0] + outN[k + 1][0]), -(outN[k][1] + outN[k + 1][1]), 0];
    tri('reveal', A[k], A[k + 1], B[k + 1], want);
    tri('reveal', A[k], B[k + 1], B[k], want);
  }
  ranges.reveal = [from, pos.length / 3];

  // --- the rim: the brow rolling over to the outer ring on the real face ----------
  from = pos.length / 3;
  const M = [], R = [], rim = [];
  for (let k = 0; k < n; k++) {
    const p = O[k], [ou, oh] = outN[k];
    const reach = Math.max(MOUTH_RIM, toRect(p.u, p.h, ou, oh) + MOUTH_RIM_PAST) * (0.92 + 0.2 * jitter * nRim(p.s))
      + moundAmp * moundAt(p, nMound);
    const ru = p.u + ou * reach, rh = Math.max(MOUTH_FOOT, p.h + oh * reach);
    const rw = surface(ru, rh) - MOUTH_SEAT;
    const md = reach * (MOUTH_MID + 0.1 * jitter * (nMid(p.s) - 0.5));
    const mu = p.u + ou * md, mh = Math.max(MOUTH_FOOT, p.h + oh * md);
    // a quarter-round from the brow down to the rim's seat, a little lumpy
    const mw = rw + (brow[k] - rw) * Math.cos((md / reach) * Math.PI / 2) + jitter * 0.04 * (nMid(p.s + 0.25) - 0.5)
      + 0.8 * moundAmp * moundAt(p, nSwell);
    // never behind the face, nor (over a deep recess) behind MOUTH_MID_MIN:
    // only the outer ring follows a recessed face in
    M.push(vert(mu, mh, Math.max(mw, rw, MOUTH_MID_MIN)));
    const r = vert(ru, rh, rw);
    R.push(r);
    rim.push(r);
  }
  for (const [X, Y] of [[B, M], [M, R]]) {
    for (let k = 0; k + 1 < n; k++) {
      const want = [0.3 * (outN[k][0] + outN[k + 1][0]), 0.3 * (outN[k][1] + outN[k + 1][1]), 1];
      tri('rim', X[k], X[k + 1], Y[k + 1], want);
      tri('rim', X[k], Y[k + 1], Y[k], want);
    }
  }
  ranges.rim = [from, pos.length / 3];

  // --- the threshold stones, just outside the jambs ------------------------------
  from = pos.length / 3;
  const stones = [];
  for (let t = 0; t < 40 && stones.length < nStones; t++) {
    const side = (stones.length + t) % 2 ? -1 : 1;
    const r = lerp(STONE_R[0], STONE_R[1], rng());
    const reachR = r * (1 + STONE_LUMP);
    // beside the jambs (wholly at |u| >= half: never behind the opening),
    // set into the measured face: no further out of the mouth plane than
    // MOUTH_STONE_OUT (the foot boulders' rule: no low rock stands out on the
    // floor where a cat can walk), and at most 70% of its depth proud of the
    // face; where the face leaves too little of it showing, none
    const reachW = reachR * STONE_DEPTH;
    const au = half + reachR + 0.02 + rng() * 0.6;
    const face = surface(side * au, r * 0.3, true);
    const wOut = Math.min(MOUTH_STONE_OUT, face + 1.4 * reachW);
    const w = wOut - reachW;
    if (wOut - face < STONE_SHOW) continue;
    const yaw = rng() * Math.PI * 2, salt = rng() * 100;
    const u = side * au;
    const cx = x + lx * u + nx * w, cz = z + lz * u + nz * w;
    if (!clear(cx, cz, reachR)) continue;
    if (!stones.every((o) => Math.hypot(o.x - cx, o.z - cz) >= o.r + reachR + 0.1)) continue;
    stones.push({ x: cx, z: cz, r: reachR });
    const ch = r * STONE_FLAT * (1 - 2 * STONE_SINK);
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const ids = ICO_V.map(([vx, vy, vz], i) => {
      const k = r * (1 + STONE_LUMP * (2 * hashOf(salt + i * 1.37, salt * 0.7 - i) - 1));
      const a = vx * cy - vz * sy, c = vx * sy + vz * cy;
      return vert(u + a * k, ch + vy * k * STONE_FLAT, w + c * k * STONE_DEPTH);
    });
    const ctr = [u, ch, w];
    for (const [a, b, c] of ICO_F) {
      const ga = L(ids[a]), gb = L(ids[b]), gc = L(ids[c]);
      tri('stones', ids[a], ids[b], ids[c], [0, 1, 2].map((j) => (ga[j] + gb[j] + gc[j]) / 3 - ctr[j]));
    }
  }
  ranges.stones = [from, pos.length / 3];

  return {
    pos, idx, nor: normalsOf(pos, idx), parts, ranges, rim, stones,
    outline: O.map((p) => [p.u, p.h]),
  };
}
