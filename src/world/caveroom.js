import * as THREE from 'three';
import { CHAMBER_HEADROOM } from './gorgeshape.js';
import { mulberry32 } from '../rng.js';

// =============================================================================
// A deep cave's chamber, dressed (polish-gorgesky, Task 5).
//
// The chamber is a box cut into the rock (builder.rockTerrain's rockFaces).
// This turns it into a room: a LINER just inside the box's walls, rounded in
// plan at every corner and curving inward as a cove under the roof, with a
// soft seeded unevenness; a few stubby STALACTITES hanging from the cove and
// the roof (the Echo Cave the most, with two little stalagmites under them);
// MOSS in low flat blobs along the wall feet and on the lower walls; and in
// the Snug Cave, a NEST of twigs lined with moss and fur.
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

const TOP = CHAMBER_HEADROOM - 0.01; // the liner's top edge, just under the roof
const FOOT = -0.02; // its foot, just into the floor
const ROOF = CHAMBER_HEADROOM - 0.005; // a stalactite's root, at the roof
const COVE_IN = 0.7; // how far the cove reaches in at the roof
const COL_W = 0.3;
const ROW_H = 0.3;
const COVE_ROWS = 4;
const WALL_BUMP = 0.07; // the unevenness, inward only: 0..0.07 on the wall,
const COVE_BUMP = 0.12; // up to 0.12 on the cove
const TAPER = 0.6; // the bumps and cove fade out over this beside the opening
const NOISE_STEP = [0.7, 0.3]; // two octaves, metres per lattice step
const NOISE_ROWS = 12;

export const LINER_COLORS = Object.freeze({ echo: 0x6e7682, snug: 0x8a7058, glitter: 0x9a8664 });
const MOSS = [0x4f6b3a, 0x6f8a4a];
const TWIGS = [0x6b4f33, 0x7f6142, 0x5e452d];
const FUR = 0xa89f94;

const STALACTITES = { echo: [7, 3], glitter: [5, 3], snug: [4, 2] }; // [min, spread]
const FLOOR_MOSS = { echo: 9, glitter: 5, snug: 14 };
const WALL_MOSS = { echo: 3, glitter: 1, snug: 4 };
const NEST_R = 0.45;
const NEST_FROM = { x: 20.6, z: 8.4 };

const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const lerp = (a, b, t) => a + (b - a) * t;

// --- the outline: the chamber's rectangle with its corners rounded ----------------
// Walked from the north wall's west end eastward, then down the east wall, and
// so round. s is the distance along it. Each point carries its normal into
// the room and the point on the square wall line straight behind it.
function outlineOf(r) {
  const R = CORNER_R;
  const segs = [];
  const line = (x0, z0, x1, z1, nx, nz) => segs.push({ line: true, x0, z0, x1, z1, nx, nz, len: Math.hypot(x1 - x0, z1 - z0) });
  const arc = (cx, cz, a0) => segs.push({ line: false, cx, cz, a0, len: (R * Math.PI) / 2 });
  line(r.minX + R, r.minZ, r.maxX - R, r.minZ, 0, 1);
  arc(r.maxX - R, r.minZ + R, -Math.PI / 2);
  line(r.maxX, r.minZ + R, r.maxX, r.maxZ - R, -1, 0);
  arc(r.maxX - R, r.maxZ - R, 0);
  line(r.maxX - R, r.maxZ, r.minX + R, r.maxZ, 0, -1);
  arc(r.minX + R, r.maxZ - R, Math.PI / 2);
  line(r.minX, r.maxZ - R, r.minX, r.minZ + R, 1, 0);
  arc(r.minX + R, r.minZ + R, Math.PI);
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

// The cove: 0 up to COVE_FROM, then a quarter-round reaching COVE_IN at the top.
const coveIn = (h) => {
  if (h <= COVE_FROM) return 0;
  const u = Math.min(1, (h - COVE_FROM) / (TOP - COVE_FROM));
  return COVE_IN * (1 - Math.sqrt(Math.max(0, 1 - u * u)));
};
// The cove's height at `d` in from the outline (d < COVE_IN), with no bumps.
const coveHeight = (d) => {
  const w = 1 - d / COVE_IN;
  return COVE_FROM + (TOP - COVE_FROM) * Math.sqrt(Math.max(0, 1 - w * w));
};

// One growing list of triangles, by part.
function mesher() {
  const pos = [], col = [], idx = [];
  const parts = { liner: 0, stalactites: 0, moss: 0, nest: 0 };
  return {
    pos, col, idx, parts,
    vert(x, y, z, c) { pos.push(x, y, z); col.push(c.r, c.g, c.b); return pos.length / 3 - 1; },
    tri(part, a, b, c) { idx.push(a, b, c); parts[part]++; },
  };
}

export function caveRoom(cave, { clear, rockAt, seed, crystals } = {}) {
  void crystals; // Task 6: the liner will glow toward the cave's colour near these
  const r = cave.rects.find((q) => q.tag.endsWith('-chamber'));
  const y0 = cave.y;
  const out = outlineOf(r);
  const rng = mulberry32(seed >>> 0);
  const noise = noiseOf(rng, out.length);
  const m = mesher();
  const inward = (x, z) => Math.min(x - r.minX, r.maxX - x, z - r.minZ, r.maxZ - z);
  const rockOn = (s) => { const p = out.at(s); return rockAt(p.wx, p.wz); };

  // --- the columns: ~COL_W apart, with a break at each segment's start and at
  // each edge of the opening (found by bisection, on the rock side)
  const cuts = [];
  for (const g of out.segs) {
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
    const d = k * (coveIn(h) + bumpAt(s, h));
    return { x: p.x + p.nx * d, y: y0 + h, z: p.z + p.nz * d, p, k };
  };
  // The clear rule: low and in from the wall line, it must be clear, or it goes
  // back onto the wall line.
  const settle = (q, h) => {
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
  const base = new THREE.Color(LINER_COLORS[cave.id] ?? LINER_COLORS.echo);
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
  const [sMin, sSpread] = STALACTITES[cave.id] ?? STALACTITES.echo;
  const want = sMin + Math.floor(rng() * sSpread);
  const hangs = [];
  for (let t = 0; t < 80; t++) {
    const s = rng() * L, d = 0.45 + rng() * 0.7, len = 0.3 + rng() * 0.6;
    const sides = 5 + Math.floor(rng() * 3), turn = rng() * Math.PI * 2, lean = rng();
    if (hangs.length >= want) continue;
    if (!rockOn(s) || taper(s) < 1) continue;
    const p = out.at(s);
    const x = p.x + p.nx * d, z = p.z + p.nz * d;
    if (inward(x, z) > 1.2 + CORNER_R * (Math.SQRT2 - 1)) continue;
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
  const spike = (part, x, z, yBase, yTip, r0, sides, turn, col0, col1) => {
    // rings from the root to a blunt, rounded-looking tip
    const prof = [[0, 1], [0.45, 0.62], [0.8, 0.32], [0.93, 0.15]];
    const ringIds = prof.map(([t, k], ri) => {
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
  };
  for (const h of hangs) {
    const len = h.root - h.tipH;
    spike('stalactites', h.x, h.z, y0 + h.root, y0 + h.tipH, 0.08 + 0.1 * len, h.sides, h.turn, hangColor, tipColor);
    stalactiteTips.push({ x: h.x, y: y0 + h.tipH, z: h.z });
  }
  // The Echo Cave's two stubby stalagmites, each under a stalactite.
  if (cave.id === 'echo') {
    let made = 0;
    for (const h of hangs) {
      if (made >= 2 || !clear(h.x, h.z, 0.35)) continue;
      spike('stalactites', h.x, h.z, y0 - 0.02, y0 + 0.18 + 0.12 * h.lean, 0.2, h.sides, h.turn + 1, hangColor.clone().multiplyScalar(0.9), tipColor);
      made++;
    }
  }

  // --- the nest (the Snug Cave) -----------------------------------------------------
  let nest = null;
  if (cave.id === 'snug') {
    const midX = (r.minX + r.maxX) / 2;
    const fits = (x, z) => x <= midX && inward(x, z) >= NEST_R + 0.25 && clear(x, z, NEST_R)
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
  const mossA = new THREE.Color(MOSS[0]), mossB = new THREE.Color(MOSS[1]);
  const blobs = [];
  const floorCap = FLOOR_MOSS[cave.id] ?? 6;
  for (let t = 0; t < 160; t++) {
    const s = rng() * L, rad = 0.15 + rng() * 0.25, tint = rng(), turn = rng() * Math.PI * 2;
    if (blobs.length >= floorCap) continue;
    if (!rockOn(s)) continue;
    const p = out.at(s);
    const x = p.x + p.nx * rad * 0.8, z = p.z + p.nz * rad * 0.8;
    if (!clear(x, z, rad * 1.1)) continue;
    if (nest && Math.hypot(x - nest.x, z - nest.z) < nest.r + rad) continue;
    if (!blobs.every((o) => Math.hypot(o.x - x, o.z - z) >= 0.6 * (o.rad + rad))) continue;
    blobs.push({ x, z, rad, tint, turn });
  }
  for (const bl of blobs) {
    const col0 = mossA.clone().lerp(mossB, bl.tint);
    const segsN = 9;
    c.copy(col0).multiplyScalar(1.08);
    const mid = m.vert(bl.x, y0 + 0.028, bl.z, c);
    const ring = (k, y, jit, shade) => Array.from({ length: segsN }, (_, i) => {
      const a = bl.turn + (i / segsN) * Math.PI * 2;
      const rr = bl.rad * k * (1 + jit * (hashOf(bl.x + i, bl.z) - 0.5));
      const x = Math.min(r.maxX - 0.005, Math.max(r.minX + 0.005, bl.x + Math.cos(a) * rr));
      const z = Math.min(r.maxZ - 0.005, Math.max(r.minZ + 0.005, bl.z + Math.sin(a) * rr));
      c.copy(col0).multiplyScalar(shade);
      return m.vert(x, y0 + y, z, c);
    });
    const inner = ring(0.55, 0.022, 0.2, 1.0);
    const outer = ring(1.0, 0.004, 0.35, 0.92);
    for (let i = 0; i < segsN; i++) {
      const j = (i + 1) % segsN;
      // counter-clockwise seen from above (x east, z south): up-facing
      m.tri('moss', mid, inner[j], inner[i]);
      m.tri('moss', inner[i], inner[j], outer[j]);
      m.tri('moss', inner[i], outer[j], outer[i]);
    }
  }
  // A few on the lower walls, lying on the liner.
  const wallCap = WALL_MOSS[cave.id] ?? 1;
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
  for (const pt of patches) {
    const col0 = mossA.clone().lerp(mossB, pt.tint).multiplyScalar(0.95);
    const segsN = 8;
    const on = (ds, dh, lift) => {
      const q = linerAt(pt.s + ds, pt.h + dh);
      const p = q.p;
      return [q.x + p.nx * lift, q.y, q.z + p.nz * lift];
    };
    c.copy(col0).multiplyScalar(1.06);
    const mid = m.vert(...on(0, 0, 0.03), c);
    const ring = Array.from({ length: segsN }, (_, i) => {
      const a = (i / segsN) * Math.PI * 2;
      const k = 1 + 0.3 * (hashOf(pt.s + i, pt.h) - 0.5);
      c.copy(col0);
      return m.vert(...on(Math.cos(a) * pt.rad * k, Math.sin(a) * pt.rad * k * 0.8, 0.02), c);
    });
    for (let i = 0; i < segsN; i++) {
      const j = (i + 1) % segsN;
      // ring runs along the walk (+s) and up (+h): faces into the room
      m.tri('moss', mid, ring[i], ring[j]);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(m.pos, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(m.col, 3));
  geometry.setIndex(m.idx);
  geometry.computeVertexNormals();

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

  return { geometry, parts: { ...m.parts }, stalactiteTips, nest, linerDepth };
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
