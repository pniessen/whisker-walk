// Water footprints and the queries on them: how far a point is from the
// water, whether it is on a deck over it, the shore pieces, and the nearest
// dry ground. Plain arithmetic on footprint records, no three.js. Every name
// exported here is re-exported by builder.js, the import path the rest of the
// game uses.

// =============================================================================
// WATER FOOTPRINTS — v19.
//
// Water in this game has never carried a collider: the park pond, the seaside
// sea and the Docks canal are all walk-over surfaces as shipped. A later wave
// makes them solid (and reinstates Sea Legs with them), and the one thing that
// wave must not have to do is re-derive three footprints from the mesh
// literals that draw them — a PlaneGeometry nudged half a metre would silently
// move the water out from under every invariant that depends on it.
//
// So every area that has water returns `waters`, and everything that needs to
// know where the water is reads THAT: the invariant tests in
// test/water.test.js, scent.js's buried-treat placement, and eventually the
// collider wave itself. In all three areas the mesh is now BUILT FROM the
// declaration rather than sitting beside it, so the two cannot disagree.
//
// Two footprint kinds, which between them cover all three bodies of water:
//
//   { id, kind: 'circle', x, z, r }                the park pond
//   { id, kind: 'rect', minX, maxX, minZ, maxZ }   the seaside sea — and the
//                                                  Docks canal, which is just
//                                                  a rect that happens to span
//                                                  the whole map width, i.e. a
//                                                  band
//
// A footprint may also carry `decks`: axis-aligned rectangles of DRY structure
// standing over the water — the seaside pier, the Docks' two bridges. A deck
// is how an area says "content may stand here, and a future water collider
// must leave this hole in itself". Every function below treats a point on a
// deck as dry land.
//
// A footprint may also carry `shallow`, in metres (missing means 0): the width
// of the wadeable band along its REAL shore. Real shore means the footprint's
// outline minus the parts that run under another water (see shorePieces), so
// two touching bodies of water have one shore, not two. Depth is measured to
// that shore (shallowExcess); waterGap, waterClearance, inWater and nearestDry
// ignore `shallow` entirely.
//
// A rect footprint may carry `islands: [{ x, z, r }]`: round holes of dry
// ground cut out of the water. An island is not a deck, because a deck means
// raised boards (ruling R42: carrying will not set things down on one, and
// paw prints skip it); an island is ground, so it gets neither rule. A circle
// footprint does not support islands. An island's rim is shore (outline
// chords it), so depth near an island is measured to the island.
//
// A deck may also be a strip `{ x1, z1, x2, z2, halfW }` — a centreline from
// end 1 to end 2 and a half-width — instead of an axis-aligned rect, so a
// bridge on a diagonal is still one deck. `Number.isFinite(d.x1)` tells the
// two shapes apart.
//
// All of this is plain data and pure geometry: no THREE, no renderer, so the
// world files stay unit-testable headless.
// =============================================================================

// Signed distance from (x, z) to a footprint's edge: negative inside the
// water, positive on dry land. For a rect the inside case reports the
// SHALLOWEST penetration (the nearest way out), which is what makes the
// push-out below take the short route to shore.
//
// Islands only exist on rects; a circle's `islands`, if one were ever given,
// is ignored. An island is a hole in the water, so the gap is the larger of
// the rect's own and each island's "how far inside its rim".
export function waterGap(w, x, z) {
  if (w.kind === 'circle') return Math.hypot(x - w.x, z - w.z) - w.r;
  const dx = Math.max(w.minX - x, x - w.maxX);
  const dz = Math.max(w.minZ - z, z - w.maxZ);
  let gap = (dx > 0 || dz > 0)
    ? Math.hypot(Math.max(dx, 0), Math.max(dz, 0))
    : Math.max(dx, dz);
  for (const i of w.islands ?? []) gap = Math.max(gap, i.r - Math.hypot(x - i.x, z - i.z));
  return gap;
}

// A strip deck's frame: start point a, unit vector u along it, side normal n
// = (-u.z, u.x), and its length. A strip is how a diagonal bridge stays one
// deck rather than a staircase of axis-aligned rects.
const isStrip = (d) => Number.isFinite(d.x1);
function stripFrame(d) {
  const len = Math.hypot(d.x2 - d.x1, d.z2 - d.z1);
  const ux = (d.x2 - d.x1) / len, uz = (d.z2 - d.z1) / len;
  return { ax: d.x1, az: d.z1, ux, uz, nx: -uz, nz: ux, len };
}

// A point built exactly on a strip's end or edge (a + t·u + s·n) comes back
// from the dot products a few 1e-16 off, so the strip test allows 1e-9 of
// slack. A rect deck needs none: its edges are compared as given.
const STRIP_EPS = 1e-9;
function onOneDeck(d, x, z) {
  if (!isStrip(d)) return x >= d.minX && x <= d.maxX && z >= d.minZ && z <= d.maxZ;
  const f = stripFrame(d);
  const px = x - f.ax, pz = z - f.az;
  const t = px * f.ux + pz * f.uz;
  const s = px * f.nx + pz * f.nz;
  return t >= -STRIP_EPS && t <= f.len + STRIP_EPS && Math.abs(s) <= d.halfW + STRIP_EPS;
}

// Is (x, z) standing on one of this footprint's dry decks?
export function onDeck(w, x, z) {
  return (w.decks ?? []).some((d) => onOneDeck(d, x, z));
}

// Signed distance from (x, z) to the nearest deck of any of these waters:
// negative inside (how far in from the nearest edge), positive outside, and
// Infinity where there are no decks. Beside onDeck: when onDeck learns a new
// kind of deck, this must too. A strip is measured in its own frame, as the
// rectangle onOneDeck reads (flat at both ends, not a capsule), so its sign
// agrees with onDeck everywhere but onOneDeck's STRIP_EPS of slack. Any other
// shape fails the guard in test/shore.test.js ("uses only shapes the shore
// and deck code understand").
function boxDistance(dx, dz) {
  return dx > 0 || dz > 0
    ? Math.hypot(Math.max(dx, 0), Math.max(dz, 0))
    : Math.max(dx, dz);
}
function oneDeckDistance(d, x, z) {
  if (!isStrip(d)) return boxDistance(Math.max(d.minX - x, x - d.maxX), Math.max(d.minZ - z, z - d.maxZ));
  const f = stripFrame(d);
  const px = x - f.ax, pz = z - f.az;
  const t = px * f.ux + pz * f.uz;
  const s = px * f.nx + pz * f.nz;
  return boxDistance(Math.max(-t, t - f.len), Math.abs(s) - d.halfW);
}
export function deckDistance(waters, x, z) {
  let min = Infinity;
  for (const w of waters ?? []) {
    for (const d of w.decks ?? []) {
      const g = oneDeckDistance(d, x, z);
      if (g < min) min = g;
    }
  }
  return min;
}

// Is (x, z) on any deck of any of these waters? The carry's "never put a
// thing down here" test (v21 3b ruling R42): a deck is raised structure, and a
// thing set down lands at ground height, under its boards. Total: no waters,
// or no decks, is false.
export function onAnyDeck(waters, x, z) {
  return (waters ?? []).some((w) => onDeck(w, x, z));
}

// waterClearance(waters, x, z) — how far the point is from the nearest water's
// edge: positive on dry land, negative in the water, Infinity where there is
// no water to be near (an area with none, or a point standing on a deck).
export function waterClearance(waters, x, z) {
  let min = Infinity;
  for (const w of waters ?? []) {
    if (onDeck(w, x, z)) continue;
    min = Math.min(min, waterGap(w, x, z));
  }
  return min;
}

export function inWater(waters, x, z) {
  return waterClearance(waters, x, z) < 0;
}

// -----------------------------------------------------------------------------
// THE REAL SHORE, AND DEPTH MEASURED TO IT (swimming). Contiguous block.
// -----------------------------------------------------------------------------
const CIRCLE_CHORDS = 64;
const SHORE_STEP = 0.25;
const SHORE_INSIDE = -1e-6;

// Extending the shore: a new kind of water edge needs two things.
//   1. Give outline(w) its segments. Each `islands` disc adds CIRCLE_CHORDS
//      chords, phased as a circle footprint's are.
//   2. Make waterGap see it as not-water (waterGap's island term does).
// Decks are never shore, so strip decks need nothing here.
//
// Each segment is [ax, az, bx, bz, kind]. A rect's own edge ('edge') is not
// shore where it runs across one of its own islands (that is dry ground), and
// an island's rim ('rim') is shore only where it faces its own rect's water:
// an island that overhangs its rect's edge, or one shared by two waters (the
// Pines' lake and bay), gives each water just its own side of the rim.
function circleChords(segs, cx, cz, r, kind) {
  for (let k = 0; k < CIRCLE_CHORDS; k++) {
    // Half a chord of phase, so a chord's midpoint (not a vertex) faces due east.
    const a0 = ((k + 0.5) / CIRCLE_CHORDS) * Math.PI * 2;
    const a1 = ((k + 1.5) / CIRCLE_CHORDS) * Math.PI * 2;
    segs.push([
      cx + Math.cos(a0) * r, cz + Math.sin(a0) * r,
      cx + Math.cos(a1) * r, cz + Math.sin(a1) * r, kind,
    ]);
  }
}
function outline(w) {
  const segs = [];
  if (w.kind === 'circle') {
    circleChords(segs, w.x, w.z, w.r, 'edge');
    return segs;
  }
  segs.push([w.minX, w.minZ, w.maxX, w.minZ, 'edge']);
  segs.push([w.maxX, w.minZ, w.maxX, w.maxZ, 'edge']);
  segs.push([w.maxX, w.maxZ, w.minX, w.maxZ, 'edge']);
  segs.push([w.minX, w.maxZ, w.minX, w.minZ, 'edge']);
  for (const i of w.islands ?? []) circleChords(segs, i.x, i.z, i.r, 'rim');
  return segs;
}

// Is a point of one of w's own outline segments not shore of w? A rect edge
// inside one of w's islands, or an island rim outside w's rect.
function offOwnWater(w, kind, x, z) {
  if (w.kind === 'circle') return false;
  if (kind === 'rim') {
    return Math.max(w.minX - x, x - w.maxX, w.minZ - z, z - w.maxZ) > -SHORE_INSIDE;
  }
  for (const i of w.islands ?? []) if (i.r - Math.hypot(x - i.x, z - i.z) > -SHORE_INSIDE) return true;
  return false;
}

// The runs of one outline segment that lie outside every other footprint (and
// on w's own water, see offOwnWater). Walk in steps of at most SHORE_STEP,
// bisect where "strictly inside" flips, keep the outside runs. Clips by
// waterGap alone, so any shape waterGap understands clips correctly.
function clipOutside(list, w, seg) {
  const [ax, az, bx, bz, kind] = seg;
  const inside = (t) => {
    const x = ax + (bx - ax) * t;
    const z = az + (bz - az) * t;
    if (offOwnWater(w, kind, x, z)) return true;
    for (const o of list) if (o !== w && waterGap(o, x, z) < SHORE_INSIDE) return true;
    return false;
  };
  const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / SHORE_STEP));
  const edge = (t0, t1, from) => {
    let lo = t0, hi = t1;
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      if (inside(mid) === from) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  };
  const runs = [];
  let prevT = 0;
  let prevIn = inside(0);
  let runStart = prevIn ? -1 : 0;
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const cur = inside(t);
    if (cur !== prevIn) {
      const e = edge(prevT, t, prevIn);
      if (cur) runs.push([runStart, e]); else runStart = e;
    }
    prevT = t;
    prevIn = cur;
  }
  if (!prevIn) runs.push([runStart, 1]);
  return runs.map(([t0, t1]) => [
    ax + (bx - ax) * t0, az + (bz - az) * t0, ax + (bx - ax) * t1, az + (bz - az) * t1,
  ]);
}

const shoreCache = new WeakMap();
const NO_SHORE = Object.freeze([]);

/**
 * shorePieces(waters) — the real shore as segments { ax, az, bx, bz, shallow,
 * id }: every footprint's outline, minus the stretches strictly inside another
 * footprint. Not clipped by decks (water under a deck is still deep). Cached
 * per `waters` array.
 */
export function shorePieces(waters) {
  if (!waters || waters.length === 0) return NO_SHORE;
  let pieces = shoreCache.get(waters);
  if (pieces) return pieces;
  pieces = [];
  for (const w of waters) {
    for (const seg of outline(w)) {
      for (const [ax, az, bx, bz] of clipOutside(waters, w, seg)) {
        if (Math.hypot(bx - ax, bz - az) < 1e-9) continue;
        pieces.push({ ax, az, bx, bz, shallow: w.shallow ?? 0, id: w.id });
      }
    }
  }
  Object.freeze(pieces);
  shoreCache.set(waters, pieces);
  return pieces;
}

// Parameter (0..1) of the point on piece p nearest (x, z).
function pieceParam(p, x, z) {
  const dx = p.bx - p.ax, dz = p.bz - p.az;
  const l2 = dx * dx + dz * dz;
  if (l2 === 0) return 0;
  const t = ((x - p.ax) * dx + (z - p.az) * dz) / l2;
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

function pieceExcess(p, t, x, z) {
  return Math.hypot(x - (p.ax + (p.bx - p.ax) * t), z - (p.az + (p.bz - p.az) * t)) - p.shallow;
}

/**
 * shallowExcess(waters, x, z) — how far past the wadeable band (positive) or
 * how far inside it (negative) a point in the water is. -Infinity on dry
 * ground and on decks. <= 0 is the shallow band; > 0 is deep.
 */
export function shallowExcess(waters, x, z) {
  if (waterClearance(waters, x, z) >= 0) return -Infinity;
  let min = Infinity;
  for (const p of shorePieces(waters)) {
    const d = pieceExcess(p, pieceParam(p, x, z), x, z);
    if (d < min) min = d;
  }
  return min;
}

/**
 * nearestShallow(waters, x, z, out) — fills `out` with the nearer of the
 * shallow band's edge and the edge of any deck over the water the point is in.
 * A point already in the band, or dry, is returned as it is. The deck margin
 * is 0 on purpose: onDeck is inclusive, so a cat 5 cm off a deck lands exactly
 * on its edge (a margin would throw it inward every frame).
 */
export function nearestShallow(waters, x, z, out) {
  out.x = x;
  out.z = z;
  if (!(shallowExcess(waters, x, z) > 0)) return out;
  let best = null, bestT = 0, bestD = Infinity;
  for (const p of shorePieces(waters)) {
    const t = pieceParam(p, x, z);
    const d = pieceExcess(p, t, x, z);
    if (d < bestD) { bestD = d; best = p; bestT = t; }
  }
  if (best) {
    const qx = best.ax + (best.bx - best.ax) * bestT;
    const qz = best.az + (best.bz - best.az) * bestT;
    const dist = Math.hypot(x - qx, z - qz);
    out.x = qx + ((x - qx) / dist) * best.shallow;
    out.z = qz + ((z - qz) / dist) * best.shallow;
  }
  for (const w of waters ?? []) {
    if (!w.decks || waterGap(w, x, z) >= 0) continue;
    for (const d of w.decks) {
      const c = clampInto(d, x, z, 0);
      const dd = Math.hypot(c.x - x, c.z - z);
      if (dd < bestD) { bestD = dd; out.x = c.x; out.z = c.z; }
    }
  }
  return out;
}

function pushOutOf(w, x, z, margin) {
  if (w.kind === 'circle') {
    let dx = x - w.x, dz = z - w.z;
    let d = Math.hypot(dx, dz);
    if (d < 1e-6) { dx = 1; dz = 0; d = 1; } // dead-centre: fixed +x push
    const need = w.r + margin;
    return { x: w.x + (dx / d) * need, z: w.z + (dz / d) * need };
  }
  // An island is a way out too: onto the ground, `margin` inside its rim,
  // straight along the line from its centre (a fixed +x at the dead centre).
  const islandExits = (w.islands ?? []).map((i) => {
    let dx = x - i.x, dz = z - i.z;
    let d = Math.hypot(dx, dz);
    if (d < 1e-6) { dx = 1; dz = 0; d = 1; }
    const need = i.r - margin;
    return { x: i.x + (dx / d) * need, z: i.z + (dz / d) * need };
  });
  return nearestOf(x, z, [
    { x: w.minX - margin, z }, { x: w.maxX + margin, z },
    { x, z: w.minZ - margin }, { x, z: w.maxZ + margin },
    ...islandExits,
  ]);
}

function clampInto(d, x, z, margin) {
  if (isStrip(d)) {
    // The strip's own frame: clamp along it and across it, then map back.
    // Too short or too narrow for the margin, it takes the middle instead.
    const f = stripFrame(d);
    const px = x - f.ax, pz = z - f.az;
    const t = f.len <= 2 * margin
      ? f.len / 2
      : Math.min(f.len - margin, Math.max(margin, px * f.ux + pz * f.uz));
    const side = d.halfW - margin;
    const s = d.halfW <= margin ? 0 : Math.min(side, Math.max(-side, px * f.nx + pz * f.nz));
    return { x: f.ax + t * f.ux + s * f.nx, z: f.az + t * f.uz + s * f.nz };
  }
  const cl = (v, lo, hi) => (lo + margin >= hi - margin
    ? (lo + hi) / 2
    : Math.min(hi - margin, Math.max(lo + margin, v)));
  return { x: cl(x, d.minX, d.maxX), z: cl(z, d.minZ, d.maxZ) };
}

function nearestOf(x, z, cands) {
  let best = cands[0];
  let bestD = Math.hypot(best.x - x, best.z - z);
  for (const c of cands) {
    const d = Math.hypot(c.x - x, c.z - z);
    if (d < bestD) { best = c; bestD = d; }
  }
  return best;
}

/**
 * nearestDry(waters, x, z, margin) — the closest point to (x, z) that is out
 * of every water by at least `margin`, or the point itself when it already is.
 * Pure and deterministic (no rng), because its one caller places buried treats
 * for a co-walk both clients must agree on.
 *
 * Two candidate escapes per footprint, because over a long pier the short way
 * out is not the shore:
 *   * straight out over the nearest edge of the footprint;
 *   * onto the nearest of its decks.
 * The closer candidate wins, so a treat that rolled off the seaside's pier POI
 * climbs back onto the pier instead of being flung 11m west to the sand.
 */
// A point exactly `margin` out is dry; float rounding in a push (18 - 0.35 is
// not exactly 17.65) must not make it count as wet and start another push.
const DRY_EPS = 1e-9;
const tooClose = (w, x, z, margin) => !onDeck(w, x, z) && waterGap(w, x, z) < margin - DRY_EPS;

export function nearestDry(waters, x, z, margin = 0.6) {
  let p = { x, z };
  const list = waters ?? [];
  // A push out of one footprint can land inside, or within the margin of,
  // another where two bodies of water touch, and the Woods has two such
  // places: its pond sits over the river, and the river's two reaches meet at
  // a right angle. So the push repeats a few times, and if that still has not
  // reached dry ground (an inside corner can bounce between the two waters),
  // the ring search below finds the nearest point that is.
  for (let pass = 0; pass < 4; pass++) {
    const w = list.find((wt) => tooClose(wt, p.x, p.z, margin));
    if (!w) return p;
    p = nearestOf(x, z, [
      pushOutOf(w, p.x, p.z, margin),
      ...(w.decks ?? []).map((d) => clampInto(d, p.x, p.z, margin)),
    ]);
  }
  if (!list.some((w) => tooClose(w, p.x, p.z, margin))) return p;
  return ringSearchDry(list, x, z, margin) ?? p;
}

// The nearest dry point to (x, z), to within RING_STEP: rings outward from the
// point, each sampled at RING_ANGLES evenly spaced angles from due east.
// Deterministic (no rng), as nearestDry must be. Only reached when the pushes
// above fail, so its cost (a few thousand footprint tests at worst) is rare.
const RING_STEP = 0.05;
const RING_ANGLES = 64;
const RING_MAX = 30;
function ringSearchDry(list, x, z, margin) {
  for (let r = RING_STEP; r <= RING_MAX; r += RING_STEP) {
    for (let k = 0; k < RING_ANGLES; k++) {
      const a = (k / RING_ANGLES) * Math.PI * 2;
      const px = x + Math.cos(a) * r;
      const pz = z + Math.sin(a) * r;
      if (!list.some((w) => tooClose(w, px, pz, margin))) return { x: px, z: pz };
    }
  }
  return null;
}
