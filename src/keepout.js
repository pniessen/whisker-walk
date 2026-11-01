// Places a walk's cats never stand.
//
// The island in the Pines' lake is the meeting place, under a truce, and no
// cat stands on it (owner's decision 4); in the Pines the strays stay off the
// lake and the bridge too. Strays and ghosts only respect the area's bounds,
// by design (see the note in player.js: water does not block them), so the
// area names the places they never go, as `keepOut`, and straycats.js and
// ghosts.js pass every position and target they give a cat through
// keepOutPoint.
//
// Pure and deterministic, with no rng: both co-walkers compute the same push
// from the same area record, and no stream shifts. An area without a keepOut
// gets every point back untouched, so its cats stand where they always did.
//
// area.keepOut = {
//   rects:    [{ minX, maxX, minZ, maxZ }],   inside if within `margin` of one
//   capsules: [{ x1, z1, x2, z2, r }],         inside if within `r` of its segment
//   margin,
// }

// A point pushed to exactly the margin is out; float rounding in the push must
// not count it as in and start another one (the same reason as builder.js's
// DRY_EPS).
const EPS = 1e-9;
// Exits and ring samples must stay this far inside the bounds, the same inset
// the strays' own clamps use.
const INSET = 0.5;
const PASSES = 4;
const RING_STEP = 0.25;
const RING_ANGLES = 32;
const RING_MAX = 30;

function rectGap(r, x, z) {
  const dx = Math.max(r.minX - x, 0, x - r.maxX);
  const dz = Math.max(r.minZ - z, 0, z - r.maxZ);
  return Math.hypot(dx, dz);
}

// The nearest point on a capsule's segment to (x, z).
function segNearest(c, x, z) {
  const sx = c.x2 - c.x1, sz = c.z2 - c.z1;
  const len2 = sx * sx + sz * sz;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - c.x1) * sx + (z - c.z1) * sz) / len2)) : 0;
  return { x: c.x1 + sx * t, z: c.z1 + sz * t };
}

function shapesOf(ko) {
  const margin = Number.isFinite(ko.margin) ? ko.margin : 0;
  const shapes = [];
  for (const r of ko.rects ?? []) shapes.push({ kind: 'rect', r, margin });
  for (const c of ko.capsules ?? []) shapes.push({ kind: 'capsule', c });
  return shapes;
}

function inside(s, x, z) {
  if (s.kind === 'rect') return rectGap(s.r, x, z) < s.margin - EPS;
  const q = segNearest(s.c, x, z);
  return Math.hypot(x - q.x, z - q.z) < s.c.r - EPS;
}

// The ways out of one shape from (x, z): a rect's four edges pushed out by the
// margin, or straight out from the nearest point on a capsule's segment (+x
// when the point is exactly on it).
function exits(s, x, z) {
  if (s.kind === 'rect') {
    const { r, margin } = s;
    return [
      { x: r.minX - margin, z }, { x: r.maxX + margin, z },
      { x, z: r.minZ - margin }, { x, z: r.maxZ + margin },
    ];
  }
  const q = segNearest(s.c, x, z);
  let dx = x - q.x, dz = z - q.z;
  let d = Math.hypot(dx, dz);
  if (d < 1e-6) { dx = 1; dz = 0; d = 1; }
  return [{ x: q.x + (dx / d) * s.c.r, z: q.z + (dz / d) * s.c.r }];
}

/**
 * keepOutPoint(area, x, z) -> { x, z }
 *
 * The point itself when it is outside every shape of area.keepOut (or the area
 * has none); otherwise the nearby point a cat should stand on instead. Settles
 * the way nearestDry does: up to four pushes out of whichever shape it is in,
 * then, if two shapes keep bouncing it between them, a ring search outward
 * from the original point.
 */
export function keepOutPoint(area, x, z) {
  const ko = area?.keepOut;
  if (!ko) return { x, z };
  const shapes = shapesOf(ko);
  const b = area.bounds;
  const inBounds = (px, pz) => !b || (
    px >= b.minX + INSET && px <= b.maxX - INSET && pz >= b.minZ + INSET && pz <= b.maxZ - INSET);
  const insideAny = (px, pz) => shapes.some((s) => inside(s, px, pz));

  let p = { x, z };
  for (let pass = 0; pass < PASSES; pass++) {
    const s = shapes.find((sh) => inside(sh, p.x, p.z));
    if (!s) return p;
    let best = null;
    let bestD = Infinity;
    for (const e of exits(s, p.x, p.z)) {
      if (!inBounds(e.x, e.z)) continue;
      const d = Math.hypot(e.x - p.x, e.z - p.z);
      if (d < bestD) { best = e; bestD = d; }
    }
    if (!best) break;
    p = best;
  }
  if (!insideAny(p.x, p.z)) return p;

  // Rings outward from the original point, each sampled from due east.
  for (let k = 1; k * RING_STEP <= RING_MAX; k++) {
    const rad = k * RING_STEP;
    for (let j = 0; j < RING_ANGLES; j++) {
      const a = (j / RING_ANGLES) * Math.PI * 2;
      const px = x + Math.cos(a) * rad;
      const pz = z + Math.sin(a) * rad;
      if (inBounds(px, pz) && !insideAny(px, pz)) return { x: px, z: pz };
    }
  }
  return p;
}
