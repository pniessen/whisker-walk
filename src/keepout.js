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
// Strays also keep off the water now: they go through dryGroundPoint (at the
// bottom of this file), which is keepOutPoint plus the water. Ghosts still
// use keepOutPoint alone.
//
// Pure and deterministic, with no rng: both co-walkers compute the same push
// from the same area record, and no stream shifts. An area without a keepOut
// gets every point back untouched, so its cats stand where they always did.
//
// area.keepOut = {
//   rects:    [{ minX, maxX, minZ, maxZ }],   inside if within `margin` of one
//   capsules: [{ x1, z1, x2, z2, r }],         inside if within `r` of its segment
//   margin,
//   onlyOn:   [{ minX, maxX, minZ, maxZ }],   optional: the ONLY places a cat may stand
// }
//
// onlyOn (Gorge part 2, G7) is the other way round: where the walkable ground
// is a few strips among rock, it names where strays and ghosts may stand, and
// a point in none of those rectangles goes to the nearest point inside the
// nearest one, `margin` in from its edges. It runs after the rects and
// capsules, so every caller of keepOutPoint (and dryGroundPoint) inherits it.
// An area without onlyOn is unchanged.
//
// The margin is for a spot being CHOSEN (a spawn, a wander target, a puddle).
// A cat's own position, clamped every frame, passes `hold` instead: outside
// every rectangle it goes to the nearest point ON the nearest one's edge
// (margin 0), so a cat walking into an edge is held there. Thrown back the
// whole margin, it walked into the edge again a few frames later, a 0.4 m
// sawtooth (review F30). `hold` changes nothing in an area without onlyOn.

// A point pushed to exactly the margin is out; float rounding in the push must
// not count it as in and start another one (the same reason as builder.js's
// DRY_EPS).
import { CAT_RADIUS } from './player.js';
import { waterClearance, nearestDry, waterGap } from './world/builder.js';
import { segT } from './segdist.js';

const EPS = 1e-9;
// Exits and ring samples must stay this far inside the bounds, the same inset
// the strays' own clamps use.
const INSET = 0.5;
// Up to sixteen pushes, stopping as soon as the point is clear. Four is
// enough almost everywhere, but where the bay's edge meets the bridge's round
// land end the pushes alternate between the two, closing in on the corner a
// little each time; four leave the point a hair inside, and a ring search then
// moves it a whole ring step, so a stray walking into that corner hopped a
// quarter metre every frame. Sixteen reach the corner itself.
const PASSES = 16;
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
  const t = segT(x, z, c.x1, c.z1, c.x2, c.z2);
  return { x: c.x1 + (c.x2 - c.x1) * t, z: c.z1 + (c.z2 - c.z1) * t };
}

// The shapes are built once per keepOut record, not on every call: the strays
// and ghosts ask several times a frame. Keyed weakly, so a dropped area takes
// its entry with it.
const SHAPES = new WeakMap();
function shapesOf(ko) {
  let cached = SHAPES.get(ko);
  if (!cached) {
    cached = buildShapes(ko);
    SHAPES.set(ko, cached);
  }
  return cached;
}

function buildShapes(ko) {
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
    const out = [
      { x: r.minX - margin, z }, { x: r.maxX + margin, z },
      { x, z: r.minZ - margin }, { x, z: r.maxZ + margin },
    ];
    // Past a corner the margin is round (rectGap), so the way out is straight
    // away from the corner. Pushed along an edge instead, a stray walking
    // round the corner jumped up to about a fifth of the margin more than a
    // step (seen at the Black Mire's corner in the Pines).
    const cx = x < r.minX ? r.minX : x > r.maxX ? r.maxX : null;
    const cz = z < r.minZ ? r.minZ : z > r.maxZ ? r.maxZ : null;
    if (cx !== null && cz !== null) {
      const dx = x - cx, dz = z - cz;
      const d = Math.hypot(dx, dz);
      out.push({ x: cx + (dx / d) * margin, z: cz + (dz / d) * margin });
    }
    return out;
  }
  const q = segNearest(s.c, x, z);
  let dx = x - q.x, dz = z - q.z;
  let d = Math.hypot(dx, dz);
  if (d < 1e-6) { dx = 1; dz = 0; d = 1; }
  return [{ x: q.x + (dx / d) * s.c.r, z: q.z + (dz / d) * s.c.r }];
}

function inBounds(b, x, z) {
  return !b || (x >= b.minX + INSET && x <= b.maxX - INSET && z >= b.minZ + INSET && z <= b.maxZ - INSET);
}

function insideAny(shapes, x, z) {
  for (const s of shapes) if (inside(s, x, z)) return true;
  return false;
}

/**
 * keepOutPoint(area, x, z, hold) -> { x, z }
 *
 * The point itself when it is outside every shape of area.keepOut (or the area
 * has none); otherwise the nearby point a cat should stand on instead. Settles
 * the way nearestDry does: pushes out of whichever shape it is in, then, if two
 * shapes still have it bouncing between them, a ring search outward from where
 * the pushes left it (close to the answer, so the search finds a point close
 * to it too).
 */
export function keepOutPoint(area, x, z, hold = false) {
  const ko = area?.keepOut;
  if (!ko) return { x, z };
  const p = pushOut(area, ko, x, z);
  // onlyOn's result is not checked against the rects and capsules again: an
  // area with both would need it (the Gorge's rects and capsules are empty).
  if (!ko.onlyOn) return p;
  return onlyOnPoint(ko, p.x, p.z, hold ? 0 : (Number.isFinite(ko.margin) ? ko.margin : 0));
}

// standSpot(area, x, z) -> { x, z }
//
// For a spot a walk picks with no thought of where a cat can stand (the rain
// puddles, the dusk fireflies, the unicorn's next step): keepOutPoint where
// the area names where cats may stand (keepOut.onlyOn), and the point itself
// everywhere else, so on every shipped map these spots land where they always
// did. Draws nothing. `hold` for a position clamped every frame (above).
export function standSpot(area, x, z, hold = false) {
  return area?.keepOut?.onlyOn ? keepOutPoint(area, x, z, hold) : { x, z };
}

// Inside one of onlyOn's rectangles, edges included.
function onAllowed(rects, x, z) {
  for (const r of rects) {
    if (x >= r.minX - EPS && x <= r.maxX + EPS && z >= r.minZ - EPS && z <= r.maxZ + EPS) return true;
  }
  return false;
}

// A point in none of onlyOn's rectangles goes to the nearest point of the
// nearest one, `margin` in from its edges (its middle, across a rectangle
// narrower than twice the margin). A point in one comes back as it is.
function onlyOnPoint(ko, x, z, margin) {
  const rects = ko.onlyOn;
  if (rects.length === 0 || onAllowed(rects, x, z)) return { x, z };
  let best = null;
  let bestD = Infinity;
  for (const r of rects) {
    const d = rectGap(r, x, z);
    if (d < bestD) { best = r; bestD = d; }
  }
  const into = (v, lo, hi) => (hi - lo < 2 * margin ? (lo + hi) / 2 : Math.min(hi - margin, Math.max(lo + margin, v)));
  return { x: into(x, best.minX, best.maxX), z: into(z, best.minZ, best.maxZ) };
}

// The rects and capsules: the point itself when it is outside every one.
function pushOut(area, ko, x, z) {
  const shapes = shapesOf(ko);
  const b = area.bounds;
  let p = { x, z };
  for (let pass = 0; pass < PASSES; pass++) {
    let s = null;
    for (const sh of shapes) if (inside(sh, p.x, p.z)) { s = sh; break; }
    if (!s) return p;
    let best = null;
    let bestD = Infinity;
    for (const e of exits(s, p.x, p.z)) {
      if (!inBounds(b, e.x, e.z)) continue;
      const d = Math.hypot(e.x - p.x, e.z - p.z);
      if (d < bestD) { best = e; bestD = d; }
    }
    if (!best) break;
    p = best;
  }
  if (!insideAny(shapes, p.x, p.z)) return p;

  // Rings outward from where the pushes left it, each sampled from due east.
  const ox = p.x, oz = p.z;
  for (let k = 1; k * RING_STEP <= RING_MAX; k++) {
    const rad = k * RING_STEP;
    for (let j = 0; j < RING_ANGLES; j++) {
      const a = (j / RING_ANGLES) * Math.PI * 2;
      const px = ox + Math.cos(a) * rad;
      const pz = oz + Math.sin(a) * rad;
      if (inBounds(b, px, pz) && !insideAny(shapes, px, pz)) return { x: px, z: pz };
    }
  }
  return p;
}

// -----------------------------------------------------------------------------
// Dry ground: the keep-out, and the water too.
//
// Since the player's cat wades and swims, a stray strolling across a pond
// looked wrong, so strays now keep off the water the way clan cats do
// (src/world/clanground.js): CAT_RADIUS or more clear of every footprint, a
// deck (a bridge, a pier) counting as dry ground. Critters and ducks still
// ignore the water on purpose (ducks paddle), and ghosts are unchanged.
//
// Pure and rng-free like keepOutPoint, so co-walkers agree and no stream
// shifts. A point that is already dry and outside the keep-out is handed back
// as it is, after one waterClearance test: that is the per-frame path.
// -----------------------------------------------------------------------------
const WATER_MARGIN = CAT_RADIUS;
const DRY_PASSES = 8;
const DRY_EPS = 1e-9;
// The ring search may have to cross a lake from a target dropped deep in it
// (a toy, a call): far wider than keepOutPoint's 30 m. Only reached when the
// pushes fail or would leave the map, which a stray's own position never does.
const DRY_RING_MAX = 150;

function isDry(waters, x, z) {
  return waterClearance(waters, x, z) >= WATER_MARGIN - DRY_EPS;
}

function isClear(area, x, z) {
  if (!isDry(area.waters, x, z)) return false;
  const ko = area.keepOut;
  if (!ko) return true;
  if (ko.onlyOn && !onAllowed(ko.onlyOn, x, z)) return false;
  return !insideAny(shapesOf(ko), x, z);
}

// The nearest point ON a deck (margin 0) of a water that (x, z) is in, or
// null. nearestDry puts a point that stepped off a deck a whole margin back
// in from its edge, so a stray walking along a bridge's edge hopped on and
// off it; landing on the edge itself, the next step simply carries on.
function deckEdge(waters, x, z) {
  let best = null, bestD = Infinity;
  for (const w of waters) {
    if (!w.decks || waterGap(w, x, z) >= 0) continue;
    for (const d of w.decks) {
      let px, pz;
      if (Number.isFinite(d.x1)) {
        const len = Math.hypot(d.x2 - d.x1, d.z2 - d.z1);
        const ux = (d.x2 - d.x1) / len, uz = (d.z2 - d.z1) / len;
        const rx = x - d.x1, rz = z - d.z1;
        const t = Math.max(0, Math.min(len, rx * ux + rz * uz));
        const sd = Math.max(-d.halfW, Math.min(d.halfW, rx * -uz + rz * ux));
        px = d.x1 + t * ux - sd * uz;
        pz = d.z1 + t * uz + sd * ux;
      } else {
        px = Math.max(d.minX, Math.min(d.maxX, x));
        pz = Math.max(d.minZ, Math.min(d.maxZ, z));
      }
      const dd = Math.hypot(px - x, pz - z);
      if (dd < bestD) { bestD = dd; best = { x: px, z: pz }; }
    }
  }
  return best;
}

/**
 * dryGroundPoint(area, x, z, hold) -> { x, z }
 *
 * keepOutPoint, and then CAT_RADIUS clear of every water in area.waters. Where
 * a keep-out and a water meet, the two pushes take turns until the point is
 * clear of both; if they still disagree, a ring search outward finds the
 * nearest point that is. `hold` is keepOutPoint's (a cat's own position).
 */
export function dryGroundPoint(area, x, z, hold = false) {
  let p = keepOutPoint(area, x, z, hold);
  const waters = area?.waters;
  if (!waters || waters.length === 0) return p;
  if (isDry(waters, p.x, p.z)) return p;
  const b = area.bounds;
  for (let pass = 0; pass < DRY_PASSES; pass++) {
    const prev = p;
    const dry = nearestDry(waters, p.x, p.z, WATER_MARGIN);
    const edge = deckEdge(waters, p.x, p.z);
    if (edge && isDry(waters, edge.x, edge.z)
      && Math.hypot(edge.x - p.x, edge.z - p.z) <= Math.hypot(dry.x - p.x, dry.z - p.z)) p = edge;
    else p = dry;
    // A push over a water's far edge can leave the map (a lake running out
    // past the bounds): the ring search below keeps to the bounds.
    if (!inBounds(b, p.x, p.z)) { p = prev; break; }
    if (!area.keepOut) return p;
    const q = keepOutPoint(area, p.x, p.z, hold);
    if (q.x === p.x && q.z === p.z) return p;
    p = q;
    if (isDry(waters, p.x, p.z)) return p;
  }
  const ox = p.x, oz = p.z;
  for (let k = 1; k * RING_STEP <= DRY_RING_MAX; k++) {
    const rad = k * RING_STEP;
    for (let j = 0; j < RING_ANGLES; j++) {
      const a = (j / RING_ANGLES) * Math.PI * 2;
      const px = ox + Math.cos(a) * rad;
      const pz = oz + Math.sin(a) * rad;
      if (inBounds(b, px, pz) && isClear(area, px, pz)) return { x: px, z: pz };
    }
  }
  return p;
}
