// The Gorge's rock relief: how far each rock vertex moves so the shell reads
// as weathered rock rather than boxes. Pure, no THREE.
//
// The field `at(x, y, z)` is a PURE FUNCTION OF POSITION: it reads only the
// shape records and the point, never the triangle or vertex it is asked for.
// rockTerrain's shell is conforming (no T-junctions, positions quantised to
// 1e-6), so every copy of a vertex shared by neighbouring triangles sits at
// the same position and gets the same move: the moved mesh stays watertight.
//
// The terms, in order:
//   1. Walk surfaces don't move. h = height above the walkable top under the
//      point; the foot factor smoothstep(0, FOOT_RISE, h) is 0 on every walk,
//      cave and den floor, so ledge tops, ramps and wall feet stay put and
//      every seam with them stays closed. A point on a lip's top (in its
//      closed rectangle, at its height) doesn't move either: the 0.4 m top
//      would fold.
//   2. Inward direction: the normalised sum of the 8 compass directions whose
//      point 0.3 m away is rock (just under the point's height, so a vertex at
//      a column's top still sees its column). Too weak a sum (inside rock, in
//      open air, on a sliver) means no horizontal move.
//   3. Recess: value noise plus strata (a per-band depth: the shelves), from
//      ROCK_PROUD proud to RELIEF_DEPTH deep, plus a corner cut that rounds
//      convex corners (a 0.75 m ring is about half rock on a flat wall, a
//      quarter at a convex corner).
//   4. Clamps: never more than half the rock's thickness along the inward
//      direction less 0.05 m (two faces of thin rock, like a 0.4 m lip, can
//      never cross); in a cave or den never proud (and at most 0.08 m deep,
//      plus the corner cut), so nothing new pokes into a corridor; elsewhere
//      never more than ROCK_PROUD proud, so the walls stay where the cat
//      stops.
//   5. Fades: the foot factor, and FRAME_FADE metres in from the map's frame
//      (the frame's faces are never drawn; nothing tears at its edge).
//   6. A rock top's vertex stops short of the top's next grid line: at most
//      half way, less 0.05, to the nearest boundary (of a shape touching the
//      top) ahead of it along x and along z, so a narrow column of the top's
//      grid by a crest can't fold.
//   7. Crest jag: a rock top (a mass or a ceiling cap, never a walk or lip)
//      within CREST_BAND of a drop of at least 1 m (cap tops count as
//      ground: the plateau over a cave is no drop) is lifted or dropped by
//      noise, so the rims' silhouettes break up. In the keep discs, where
//      things stand on the rock, a rock top doesn't move at all.
//
// Determinism: noise3 and every hash use Math.imul on integer lattice
// coordinates; the field uses only + - * / floor and Math.sqrt (no Math.sin,
// cos, hypot or random), so the same input gives the same output everywhere.

export const ROCK_PROUD = 0.15; // the most a wall vertex may stand proud of its wall
export const CAVE_PROUD = 0.02; // inside a cave or den void
export const RELIEF_DEPTH = 0.8; // the deepest recess
export const CORNER_CUT = 0.7; // the extra recess at a convex corner
export const FOOT_RISE = 1.0; // the relief grows to full over this height above the walk
export const CREST_JAG = 1.2; // the largest lift of a crest
export const CREST_BAND = 1.5; // how far in from a drop a rock top is a crest
export const FRAME_FADE = 3; // the relief fades out over this distance to the map's frame

const BUCKET = 4; // the shape index's cell size
const PROBE = 0.3; // the inward-direction samples' radius
const UNDER = 0.02; // how far below the point the rock is sampled
const RING = 0.75; // the corner cut's ring
const STEP = 0.05; // the thickness march's step (and wallNear's ring spacing)
const THICK_MAX = 2; // the thickness march's reach
const EPS = 1e-6;

// ---- Directions, from Math.sqrt only ----
const R2 = Math.sqrt(0.5);
const C1 = Math.sqrt(2 + Math.sqrt(2)) / 2; // cos 22.5
const S1 = Math.sqrt(2 - Math.sqrt(2)) / 2; // sin 22.5
const CH = Math.sqrt(2 + Math.sqrt(2 + Math.sqrt(2))) / 2; // cos 11.25
const SH = Math.sqrt(2 - Math.sqrt(2 + Math.sqrt(2))) / 2; // sin 11.25
const C3 = Math.sqrt(2 + Math.sqrt(2 - Math.sqrt(2))) / 2; // cos 33.75
const S3 = Math.sqrt(2 - Math.sqrt(2 - Math.sqrt(2))) / 2; // sin 33.75

// The 8 compass directions.
const DIR8 = [[1, 0], [R2, R2], [0, 1], [-R2, R2], [-1, 0], [-R2, -R2], [0, -1], [R2, -R2]];
// 16 directions, a quarter turn's four in each quadrant, rotated round.
const quad = (pts) => [0, 1, 2, 3].flatMap((q) => pts.map(([a, b]) => {
  // rotate (a, b) by q quarter turns
  if (q === 0) return [a, b];
  if (q === 1) return [-b, a];
  if (q === 2) return [-a, -b];
  return [b, -a];
}));
// wallNear's 16 compass directions (every 22.5 degrees from +x).
const DIR16 = quad([[1, 0], [C1, S1], [R2, R2], [S1, C1]]);
// The corner ring's 16 points, half a step off the axes (11.25 + k * 22.5
// degrees), so none lies on an axis-aligned wall's plane: exactly 8 of 16
// are rock on a flat wall, 4 at a convex corner.
const RING16 = quad([[CH, SH], [C3, S3], [S3, C3], [SH, CH]]);

// ---- Noise ----
function hash3(ix, iy, iz, seed) {
  let h = Math.imul(ix | 0, 0x27d4eb2d) ^ Math.imul(iy | 0, 0x165667b1)
    ^ Math.imul(iz | 0, 0x1b873593) ^ Math.imul(seed | 0, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

const fade = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;

// Value noise on the integer lattice, smoothstep-trilinear, in [0, 1).
export function noise3(x, y, z, seed = 0) {
  const fx = Math.floor(x);
  const fy = Math.floor(y);
  const fz = Math.floor(z);
  const u = fade(x - fx);
  const v = fade(y - fy);
  const w = fade(z - fz);
  const h = (i, j, k) => hash3(fx + i, fy + j, fz + k, seed);
  return lerp(
    lerp(lerp(h(0, 0, 0), h(1, 0, 0), u), lerp(h(0, 1, 0), h(1, 1, 0), u), v),
    lerp(lerp(h(0, 0, 1), h(1, 0, 1), u), lerp(h(0, 1, 1), h(1, 1, 1), u), v),
    w,
  );
}

// The strata band a point is in: 1.1 m bands, their lines warped by up to
// 0.6 m of noise. The relief's shelves are cut per band (each band its own
// depth), and rockTerrain colours by the same band so the two line up.
const STRATUM = 1.1;
export function strataBand(x, y, z, seed = 0) {
  return Math.floor((y + 0.6 * noise3(x / 6, 0, z / 6, seed + 1)) / STRATUM);
}

const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
const smoothstep = (e0, e1, x) => fade(clamp01((x - e0) / (e1 - e0)));

// A shape's height at (x, z): flat, or a ramp along z (builder.js's shapeY).
function shapeY(s, x, z) {
  if (s.along !== 'z' || s.maxZ === s.minZ) return s.y0;
  const f = Math.min(1, Math.max(0, (z - s.minZ) / (s.maxZ - s.minZ)));
  return s.y0 + f * (s.y1 - s.y0);
}

// The highest mass touching r along an edge, or overlapping it: how high a
// ceiling's cap is drawn. builder.js's capTopFor, copied (no import).
function capTopFor(r, masses) {
  let top = -Infinity;
  for (const m of masses) {
    const ox = Math.min(r.maxX, m.maxX) - Math.max(r.minX, m.minX);
    const oz = Math.min(r.maxZ, m.maxZ) - Math.max(r.minZ, m.minZ);
    if ((ox >= 0 && oz > 0) || (ox > 0 && oz >= 0)) top = Math.max(top, m.y0, m.y1);
  }
  return top;
}

const inClosed = (s, x, z, e = 0) => x >= s.minX - e && x <= s.maxX + e && z >= s.minZ - e && z <= s.maxZ + e;
const inOpen = (s, x, z) => x > s.minX && x < s.maxX && z > s.minZ && z < s.maxZ;

export function createRockRelief({ walks, masses, ceilings, seed = 0, keep = [] }) {
  const all = [...walks, ...masses];
  const frame = {
    minX: Math.min(...all.map((s) => s.minX)),
    maxX: Math.max(...all.map((s) => s.maxX)),
    minZ: Math.min(...all.map((s) => s.minZ)),
    maxZ: Math.max(...all.map((s) => s.maxZ)),
  };

  // Columns (solid from 0 to the top), caps (solid from the ceiling to the
  // top), and the walkable tops step 1 measures from.
  const columns = [
    ...masses.map((s) => ({ s, kind: 'rock' })),
    ...walks.filter((s) => Math.max(s.y0, s.y1) > 0).map((s) => ({ s, kind: s.kind === 'lip' ? 'lip' : 'walk' })),
  ];
  const caps = ceilings
    .map((c) => ({ s: c, ceil: c.y0, top: capTopFor(c, masses) }))
    .filter((c) => c.top > c.ceil);
  const tops = walks.filter((s) => s.kind === 'walk' || s.kind === 'cave' || s.kind === 'den');
  const lipTops = walks.filter((s) => s.kind === 'lip');
  // Each ceiling's void: from its cave or den floor (the walk rect it covers) up.
  const voids = ceilings.map((c) => {
    const f = walks.find((w) => (w.kind === 'cave' || w.kind === 'den')
      && w.minX === c.minX && w.maxX === c.maxX && w.minZ === c.minZ && w.maxZ === c.maxZ);
    let floor = f ? Math.max(f.y0, f.y1) : -Infinity;
    if (!f) { // the highest cave or den floor under it, else the base
      floor = 0;
      for (const w of walks) {
        if ((w.kind === 'cave' || w.kind === 'den') && w.y0 < c.y0
          && Math.min(c.maxX, w.maxX) > Math.max(c.minX, w.minX)
          && Math.min(c.maxZ, w.maxZ) > Math.max(c.minZ, w.minZ)) floor = Math.max(floor, w.y0);
      }
    }
    return { s: c, floor, ceil: c.y0 };
  });

  // ---- The bucket grid ----
  const nx = Math.max(1, Math.ceil((frame.maxX - frame.minX) / BUCKET));
  const nz = Math.max(1, Math.ceil((frame.maxZ - frame.minZ) / BUCKET));
  const cell = (v, min, n) => {
    const i = Math.floor((v - min) / BUCKET);
    return i < 0 ? 0 : i >= n ? n - 1 : i;
  };
  const grid = (items) => {
    const g = Array.from({ length: nx * nz }, () => []);
    for (const it of items) {
      const s = it.s ?? it;
      const i0 = cell(s.minX - 2 * EPS, frame.minX, nx);
      const i1 = cell(s.maxX + 2 * EPS, frame.minX, nx);
      const k0 = cell(s.minZ - 2 * EPS, frame.minZ, nz);
      const k1 = cell(s.maxZ + 2 * EPS, frame.minZ, nz);
      for (let i = i0; i <= i1; i++) for (let k = k0; k <= k1; k++) g[k * nx + i].push(it);
    }
    return g;
  };
  const colGrid = grid(columns);
  const capGrid = grid(caps);
  const topGrid = grid(tops);
  const lipGrid = grid(lipTops);
  const voidGrid = grid(voids);
  const at2 = (g, x, z) => g[cell(z, frame.minZ, nz) * nx + cell(x, frame.minX, nx)];

  // Closed rectangles: a point on a shape's edge is in it.
  function rockAt(x, y, z) {
    for (const c of at2(colGrid, x, z)) if (inClosed(c.s, x, z) && y < shapeY(c.s, x, z)) return true;
    for (const c of at2(capGrid, x, z)) if (inClosed(c.s, x, z) && y > c.ceil && y < c.top) return true;
    return false;
  }
  // Open rectangles, for the thickness march: a point exactly on the far
  // face of thin rock is already out of it.
  function rockIn(x, y, z) {
    for (const c of at2(colGrid, x, z)) if (inOpen(c.s, x, z) && y < shapeY(c.s, x, z)) return true;
    for (const c of at2(capGrid, x, z)) if (inOpen(c.s, x, z) && y > c.ceil && y < c.top) return true;
    return false;
  }

  function wallNear(x, y, z, r) {
    if (rockAt(x, y, z)) return true;
    if (!(r > 0)) return false; // a NaN or non-positive radius: the centre only
    for (let k = 1; ; k++) {
      const d = k * STEP < r ? k * STEP : r;
      for (const [ux, uz] of DIR16) if (rockAt(x + ux * d, y, z + uz * d)) return true;
      if (d >= r) return false;
    }
  }

  // Step 1: the highest walkable top under (x, z) at or below y.
  function walkTop(x, y, z) {
    let w = 0;
    for (const s of at2(topGrid, x, z)) {
      if (!inClosed(s, x, z, EPS)) continue;
      const t = shapeY(s, x, z);
      if (t <= y + EPS && t > w) w = t;
    }
    return w;
  }

  // On a lip's top: in its closed rectangle, at its height. A lip is 0.4 m
  // across and its top one long quad fanned at the T-points along it, so a
  // horizontal move of its edges (up to ROCK_PROUD each way) folds the top;
  // like a walk top it stays where it is.
  function onLipTop(x, y, z) {
    for (const s of at2(lipGrid, x, z)) if (inClosed(s, x, z, EPS) && Math.abs(y - shapeY(s, x, z)) <= EPS) return true;
    return false;
  }

  // The ground for the crest search: the highest column or cap top. A cap's
  // top is rock top, so the plateau over a cave or den is no drop.
  function groundAt(x, z) {
    let g = 0;
    for (const c of at2(colGrid, x, z)) {
      if (!inClosed(c.s, x, z)) continue;
      const t = shapeY(c.s, x, z);
      if (t > g) g = t;
    }
    for (const c of at2(capGrid, x, z)) if (inClosed(c.s, x, z) && c.top > g) g = c.top;
    return g;
  }

  // Is (x, y, z) on a rock top: y within EPS of the highest top here, and
  // that top a mass or a cap (not a walk or a lip, even when tied).
  // Returns the rock tops it is on (the masses or caps whose top is there),
  // or null.
  function onRockTop(x, y, z) {
    let best = -Infinity;
    let rock = false;
    let on = [];
    const consider = (s, t, isRock) => {
      if (t > best + EPS) { best = t; rock = isRock; on = [s]; } else if (t >= best - EPS) {
        if (t > best) best = t;
        rock = rock && isRock;
        on.push(s);
      }
    };
    for (const c of at2(colGrid, x, z)) if (inClosed(c.s, x, z, EPS)) consider(c.s, shapeY(c.s, x, z), c.kind === 'rock');
    for (const c of at2(capGrid, x, z)) if (inClosed(c.s, x, z, EPS)) consider(c.s, c.top, true);
    return rock && Math.abs(y - best) <= EPS ? on : null;
  }

  // A rock top is cut (builder.rockTerrain) along the boundaries of every
  // shape touching its edges' lines, so a grid line can run a few tenths in
  // from a crest (the shoulder's top, 0.4 m in from its west edge, at the
  // clifftop's x 2.4). A crest vertex recessed past it would fold the top.
  // How far a top vertex may move along +-x (axis 0) or +-z (axis 1): half
  // the way to the nearest such boundary ahead of it, less 0.05.
  const cutters = [...all, ...ceilings];
  function topRoom(x, z, tops, axis, dir) {
    const p = axis === 0 ? x : z;
    let room = Infinity;
    for (const c of cutters) {
      // c touches some top's extent across the move's axis
      if (!tops.some((t) => (axis === 0
        ? c.maxZ >= t.minZ - EPS && c.minZ <= t.maxZ + EPS
        : c.maxX >= t.minX - EPS && c.minX <= t.maxX + EPS))) continue;
      for (const v of axis === 0 ? [c.minX, c.maxX] : [c.minZ, c.maxZ]) {
        const d = (v - p) * dir;
        if (d > EPS && d < room) room = d;
      }
    }
    return Math.max(0, room / 2 - 0.05);
  }

  // In a cave or den's void, its ceiling plane included (a wall vertex at
  // exactly the ceiling's height is still a cave wall).
  const inVoid = (x, y, z) => {
    for (const v of at2(voidGrid, x, z)) if (inClosed(v.s, x, z) && y > v.floor && y <= v.ceil) return true;
    return false;
  };

  // Distance along (ux, uz) to the first point not rock at height y.
  function march(x, y, z, ux, uz) {
    for (let k = 1; k * STEP <= THICK_MAX + EPS; k++) {
      const d = k * STEP;
      if (!rockIn(x + ux * d, y, z + uz * d)) return d;
    }
    return THICK_MAX;
  }

  // The rock's thickness along (ux, uz) from (x, z): the thinner of the
  // march just under the point and the march just over it (the latter only
  // where the rock does go on up past the point: at a column's top it would
  // read no rock at all).
  function thickAlong(x, y, z, ux, uz) {
    const under = march(x, y - UNDER, z, ux, uz);
    const over = march(x, y + EPS, z, ux, uz);
    return over > STEP && over < under ? over : under;
  }

  const frameFade = (x, z) => {
    const d = Math.min(x - frame.minX, frame.maxX - x, z - frame.minZ, frame.maxZ - z);
    return clamp01((d - 1) / FRAME_FADE);
  };
  const keepFade = (x, z) => {
    let f = 1;
    for (const k of keep) {
      const dx = x - k.x;
      const dz = z - k.z;
      f = Math.min(f, clamp01((Math.sqrt(dx * dx + dz * dz) - k.r) / 1));
    }
    return f;
  };

  function recessAt(x, y, z, fadeAll) {
    // 2. the inward direction
    const ys = y - UNDER;
    // Summed as whole counts of the axis and diagonal unit parts, so the
    // two sides of a flat wall cancel exactly (an axis wall's n_in is exact).
    let ax = 0;
    let az = 0;
    let gx = 0;
    let gz = 0;
    let cave = false;
    for (let i = 0; i < 8; i++) {
      const [ux, uz] = DIR8[i];
      const px = x + ux * PROBE;
      const pz = z + uz * PROBE;
      if (rockAt(px, ys, pz)) {
        const sx = Math.sign(ux);
        const sz = Math.sign(uz);
        if (i % 2) { gx += sx; gz += sz; } else { ax += sx; az += sz; }
      }
      if (!cave && inVoid(px, y, pz)) cave = true;
    }
    const sx = ax + R2 * gx;
    const sz = az + R2 * gz;
    const len = Math.sqrt(sx * sx + sz * sz);
    if (len < 0.2) return null;
    const ix = sx / len;
    const iz = sz / len;

    // 3. noise, strata and the corner cut
    const band = strataBand(x, y, z, seed);
    const strata = hash3(band, 0, 0, seed + 3);
    let r = -ROCK_PROUD + (ROCK_PROUD + RELIEF_DEPTH) * (0.55 * noise3(x / 2.4, y / 3.0, z / 2.4, seed) + 0.45 * strata);
    let rock = 0;
    for (const [ux, uz] of RING16) if (rockAt(x + ux * RING, ys, z + uz * RING)) rock++;
    const cut = CORNER_CUT * clamp01((0.5 - rock / 16) / 0.25);

    // 4. clamps: half the thickness (the thinner of just under the point and
    // just over it, the latter only where the rock does go on up), then the
    // cave or open-air bound.
    // A slanted n_in (near a corner or a step in a top) also may not carry
    // a face more than half the rock's width along x or along z towards the
    // face opposite: the rock is made of axis-aligned boxes, so that is where
    // the opposite face is (a 0.4 m lip's slanted n_in at a ramp's step).
    const thick = thickAlong(x, y, z, ix, iz);
    if (cave) r = Math.min(Math.max(r, 0), 0.08) + cut;
    else r = Math.max(r + cut, -ROCK_PROUD);
    r = Math.min(r, thick / 2 - 0.05);
    if (ix !== 0 && iz !== 0) {
      const tx = thickAlong(x, y, z, Math.sign(ix), 0);
      const tz = thickAlong(x, y, z, 0, Math.sign(iz));
      r = Math.min(r, Math.max(0, tx / 2 - 0.05) / Math.abs(ix), Math.max(0, tz / 2 - 0.05) / Math.abs(iz));
    }
    if (cave && r < 0) r = 0;

    // 5. fades
    return { ix, iz, r: r * fadeAll };
  }

  function crestAt(x, y, z) {
    let crest = Infinity;
    let drop = 0;
    for (const [ux, uz] of DIR8) {
      for (let k = 1; k <= 15; k++) {
        const d = k / 10;
        const g = groundAt(x + ux * d, z + uz * d);
        if (g <= y - 1) {
          if (d < crest) crest = d;
          if (y - g > drop) drop = y - g;
          break;
        }
      }
    }
    if (crest > CREST_BAND) return 0;
    return Math.min(CREST_JAG, 0.3 * drop) * (1 - crest / CREST_BAND)
      * (1.3 * noise3(x / 1.3, 7.7, z / 1.3, seed + 2) - 0.3);
  }

  function at(x, y, z) {
    const ff = frameFade(x, z);
    let dx = 0;
    let dz = 0;
    let recess = 0;
    if (ff > 0 && !onLipTop(x, y, z)) {
      const s = smoothstep(0, FOOT_RISE, y - walkTop(x, y, z));
      if (s > 0) {
        const m = recessAt(x, y, z, s * ff);
        if (m) {
          recess = m.r;
          dx = m.ix * m.r;
          dz = m.iz * m.r;
        }
      }
    }
    let dy = 0;
    const tops = ff > 0 ? onRockTop(x, y, z) : null;
    if (tops) {
      // The keep discs hold a rock top still: no crest, and no horizontal move.
      const kf = keepFade(x, z);
      if (kf > 0) dy = crestAt(x, y, z) * ff * kf;
      // and a top vertex stops short of the top's next grid line (topRoom)
      let f = kf;
      if (dx !== 0) f = Math.min(f, topRoom(x, z, tops, 0, Math.sign(dx)) / Math.abs(dx));
      if (dz !== 0) f = Math.min(f, topRoom(x, z, tops, 1, Math.sign(dz)) / Math.abs(dz));
      recess *= f;
      dx *= f;
      dz *= f;
    }
    // + 0 turns -0 into 0
    return { dx: dx + 0, dy: dy + 0, dz: dz + 0, recess: recess + 0 };
  }

  return { at, rockAt, wallNear };
}
