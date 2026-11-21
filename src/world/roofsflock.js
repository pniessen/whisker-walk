// =============================================================================
// THE ROOFTOPS' FLOCK, THE PLAN (Rooftops step 3). Pure: no THREE, no
// randomness, no clock. Where the birds perch, which flights join the perches,
// the fourteen birds and their homes, the guide pigeon's route, and how a
// flushed bird chooses where to go. roofsbirds.js draws and drives them.
//
// A PERCH is a spot a bird sits on: { id, x, y, z, kind, peck, aliases }.
//   * move: each end of every move she makes (a crossing's `${id}:0` and
//     `${id}:1`, a leap's, climb's or drop's `${id}:from` and `${id}:to`), at
//     the rail's or the ground's height there: so the birds wait where she
//     stands, at a plank's far end and a gap's landing;
//   * ridge: every 2 m along each ridge rail; roof: peck spots on the flat
//     roofs (`peck`); loft: six on the pigeon loft's roof; ground: the guide's
//     spot in the alley;
//   * drawn, from roofs.js's build: pot tops, aerial tops, parapets, washing
//     posts' T-bars, yard walls' copings (their ids: DRAWN_ID).
// Two perches within 0.5 m and 0.3 m of height are one: the first keeps its
// id, the other's goes in its `aliases`. No perch is over the street, low
// over a pitched roof's slates (the void, R4) or on a smoking pot. A move
// perch on something soft drawn over the ground she lands on is lifted to its
// top (PERCH_LIFT: the bin bags' heap).
//
// A LINK is a flight between two perches, { to, kind, d, shape }, of two kinds:
//   * move: along a move she makes, up to 12 m: a crossing's two ends both
//     ways, and a leap's, climb's or drop's take-off to its landing. Not a
//     leap that needs a skill (`requires`: she has none in step 3), which is
//     at most a hop. Each is checked against the move's own path: a
//     crossing's flight keeps 0.25 m over the rail she walks (a gutter runs
//     under the slates' skyline, and the birds fly along it all the same); a
//     climb's or a drop's goes up and over (`shape` 'step': up to 0.4 m over
//     its higher end, across, down onto its perch) and keeps 0.25 m over the
//     skyline; a leap's is the arc, over the skyline;
//   * hop: any other two perches 3-10 m apart, at most 5 m up or 6 m down,
//     the arc keeping 0.25 m over the skyline.
// A FLIGHT (flightPlan(a, b, shape), flightPoint) is the link's shape: the
// 'arc' (default) or the 'step'. Either is short and never more than 1.4 m
// over its higher end: not up into the sky.
//
// THE CHOICE: a flushed bird takes the best link from its perch that lands at
// least 4 m from her and 0.5 m further from her than it was, never comes
// within 1.5 m of her on the way, and ends on a perch no other bird is on
// and with a flight on from it for its kind (flightGraph's landable).
// A pigeon scores each link:
//   2 for a move link (it flies a move of hers),
//   + 1 if it lands a flight nearer the loft (homeDist),
//   + 1 if it lands on a move end she can make (a crossing's end, or the
//     landing of a leap with no skill needed, a climb or a drop: moveEnds)
//     by a move link, or by a hop no further from the loft,
//   + 0.25 x hash01, the tie-break.
// So a pigeon flies her move from where it sits, else waits where one of
// her moves ends ("they like to wait at the far end of a plank or a gap's
// landing spot"), and a chase walks a child along the planks, ridges and
// leaps, up the place to the warehouse and the loft. Sparrows and gulls
// make local hops near 5 m: -|d - 5| / 5 + the tie-break.
// With no such link it flutters where it is (null). That is the anti-goal
// ("nothing that chases the cat"): no bird ever flies toward her, over her,
// or lands nearer her than it was.
//
// THE GUIDE (GUIDE): one pigeon starts in the alley in front of the spawn
// and, each time she flushes it, flies to its next stop: the bin's lid, the
// shed's roof, plank-3's near end, its far end. Where the next stop will not
// do (no flight there, another bird on it, or it would break the rules near
// her: she ran straight at it, or got ahead of it) it flies to the first
// later stop that will, and leads on from there; with none, it takes the
// ordinary choice and leads on from wherever that lands. After the last stop
// it is a pigeon like the others. THE LOFT is the pigeons' home: homeDist
// counts the flights from each perch to it, and a pigeon resting there goes
// home after LOFT_REST seconds, out of her sight (roofsbirds.js).
// =============================================================================

import { LEVELS, STREETS, PITCHED, BLOCKS, skylineY, ROOFS_COLLIDERS, ROOFS_DISCOVERIES, ROOFS_PERCHES } from './roofsplan.js';
import { hash01 } from './warehouselook.js';

export const FLIGHT = Object.freeze({ min: 3, maxHop: 10, maxMove: 12, up: 5, down: 6, clearSky: 0.25, clearCat: 1.5, landFromCat: 4, speed: 6 });
export const LOFT_REST = 90; // s a pigeon rests on the loft before it is back home
export const OUT_OF_SIGHT = 30; // m from her, for that going home

const ALL_KINDS = Object.freeze(['move', 'ridge', 'roof', 'loft', 'ground', 'pot', 'aerial', 'parapet', 'post', 'wall']);
const DRAWN_KINDS = new Set(['pot', 'aerial', 'parapet', 'post', 'wall']);
const birdKind = (k) => Object.freeze({ ...k, hop: Object.freeze(k.hop), perches: Object.freeze(k.perches) });
// `below`: the perches a kind lands on are lower than this (m). The sparrow's
// 'gutter' is the plan's word for its gutter perches: today the gutters'
// perches are their crossings' ends, kind 'move'.
export const BIRD_KINDS = Object.freeze({
  pigeon: birdKind({ critter: 'bird', scale: 1, hop: { min: 3, max: 10 }, perches: ALL_KINDS.filter((k) => k !== 'post'), below: Infinity, leads: true }),
  sparrow: birdKind({ critter: 'bird', scale: 0.65, hop: { min: 3, max: 6 }, perches: ['post', 'wall', 'roof', 'move', 'gutter'], below: 7, leads: false }),
  gull: birdKind({ critter: 'seagull', scale: 1.6, hop: { min: 4, max: 10 }, perches: ['parapet', 'pot', 'aerial'], below: Infinity, leads: false }),
});

// The ids of the spots roofs.js draws and pushes as perches (ruling R3):
//   pot(stack, side)    a pot's top: `stack` the stack's x (its block is
//                       `stack-${x}`), `side` -1 (north of the ridge) or 1;
//   aerial(stack)       an aerial's top, on that stack;
//   parapet(block, n)   'warehouse' and 'cornerShop': n counts the spots 3 m
//                       apart clockwise round the block's edge from its
//                       north-west corner (n 0 at that corner; spots over a
//                       street are left out, the rest keep their n);
//                       'tower-1': its ring's corners, n 0..3 clockwise from
//                       the north-west;
//   post(i, end)        WASHING_POSTS[i]'s T-bar at its z0 (end 0) or z1 (1);
//   wall(i)             YARD_WALLS[i]'s coping, at its middle.
const PARAPET_BLOCKS = new Set(['warehouse', 'cornerShop', 'tower-1']);
export const DRAWN_ID = Object.freeze({
  pot: (stack, side) => `pot:${stack}:${side}`,
  aerial: (stack) => `aerial:${stack}`,
  parapet: (block, n) => {
    if (!PARAPET_BLOCKS.has(block)) throw new Error(`roofsflock: no parapet perches on ${block}`);
    return `parapet:${block}:${n}`;
  },
  post: (i, end) => `post:${i}:${end}`,
  wall: (i) => `wall:${i}`,
});

// The fourteen birds (S2) and their homes. The pigeons wait at moves' far
// ends and on the warehouse; the sparrows keep low, in the back yards and on
// the low roofs; the gulls take the high places. Drawn homes are roofs.js's
// (test/roofsbirds.test.js resolves them on the built area).
export const ROOFS_BIRDS = Object.freeze([
  { id: 'pigeon-guide', kind: 'pigeon', home: 'plank-3:1' },
  { id: 'pigeon-1', kind: 'pigeon', home: 'plank-1:1' },
  { id: 'pigeon-2', kind: 'pigeon', home: 'plank-2:1' },
  { id: 'pigeon-3', kind: 'pigeon', home: 'return-4-east:to' },
  { id: 'pigeon-4', kind: 'pigeon', home: 'gutter-2:1' },
  // on a chimney's TV aerial over the alley, and pecking on the warehouse
  // roof, so the place's first view has a bird on an aerial and birds
  // pecking (the spec's "perch on ridges, chimneys, aerials and gutters, and
  // peck on flat roofs"; the controller's ruling on Task 3's C3)
  { id: 'pigeon-5', kind: 'pigeon', home: DRAWN_ID.aerial(5) },
  { id: 'pigeon-6', kind: 'pigeon', home: 'roof:warehouse:0' },
  { id: 'pigeon-7', kind: 'pigeon', home: 'loft:0' },
  { id: 'sparrow-1', kind: 'sparrow', home: DRAWN_ID.post(0, 1) }, // in house 3's back yard
  { id: 'sparrow-2', kind: 'sparrow', home: DRAWN_ID.wall(13) }, // the wall between yards 7 and 8, by the garages
  { id: 'sparrow-3', kind: 'sparrow', home: 'roof:garages:1' },
  { id: 'sparrow-4', kind: 'sparrow', home: 'roof:dormer:0' },
  // the east parapet, over the ginnel by the stair's top flights (n 27: 3 m
  // south of the north-east corner; the north parapet is outside the bounds)
  { id: 'gull-1', kind: 'gull', home: DRAWN_ID.parapet('warehouse', 27) },
  { id: 'gull-2', kind: 'gull', home: DRAWN_ID.parapet('tower-1', 0) },
].map(Object.freeze));

export const GUIDE = Object.freeze({
  bird: 'pigeon-guide',
  start: 'guide:alley',
  route: Object.freeze(['bin-up:to', 'shed-up:to', 'plank-3:0', 'plank-3:1']),
});

// ---------------------------------------------------------------------------
// The perches

const L = LEVELS;
const BLOCK = Object.fromEntries(BLOCKS.map((b) => [b.id, b]));
const MERGE_2D = 0.5;
const MERGE_Y = 0.3;
const OVER_SLATES = new Set(['ridge', 'pot', 'aerial']); // the only perches over a pitched roof under FLAT
const RIDGE_EVERY = 2; // m
const GUIDE_SPOT = Object.freeze({ x: 5.5, z: 36.5 });
// How far a move perch sits over the ground there, by its id: the bin bags'
// heap is drawn 0.08 m over the cobbles where she lands on it (roofs.js
// drawBinBags), so a bird stands on the bags, not in them.
export const PERCH_LIFT = Object.freeze({ 'garages-bags:to': 0.08 });

// The peck spots (`roof`): about where each lies, as [x, z]; the spot is the
// point of the roof's 1 m grid within PECK_NEAR of it, clear of the rules
// below, with the lowest hash01. Spread along the ways she walks, so a chased
// pigeon always has a peck spot to hop to: the warehouse's eight run from
// where she climbs up from the corner shop, round the clock tower and past
// the lantern, to the loft's foot (every pigeon home has a way to the loft).
const PECK_SPOTS = Object.freeze({
  garages: [[-17, 31.5], [-6, 32.5], [6, 30.5]],
  'ext-3': [[-18.25, 16.5]],
  'ext-6': [[-3.25, 14.5]],
  'ext-9': [[11.75, 16.5]],
  'ext-12': [[26.75, 16.5]],
  flatHouse: [[1.5, 4.5]],
  dormer: [[-6, 9.5]],
  cornerShop: [[32.5, 1.5], [34.5, -6]],
  warehouse: [[33, -21.5], [25, -24], [17, -23], [9, -25.5], [1, -28], [-7, -30.5], [-14.5, -33], [-26, -39.5]],
});
const PECK_NEAR = 1.5; // m
const PECK_SALT = 83;
const PECK_CLEAR = Object.freeze({ takeoff: 0.8, rail: 0.5, edge: 0.4, things: 1.2 });

// The loft's six: along its west, north and east sides, 0.5 m in, off the
// way up (loft-up) and the pipe's end on its south side.
const LOFT_SPOTS = Object.freeze([[-35.5, -45.5], [-35.5, -47.5], [-33, -47.5], [-30.5, -47.5], [-30.5, -45.6], [-35.5, -43.6]]);

const inRect = (r, x, z) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;

function segDist(px, pz, a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const n = dx * dx + dz * dz;
  const t = n > 0 ? Math.max(0, Math.min(1, ((px - a.x) * dx + (pz - a.z) * dz) / n)) : 0;
  return Math.hypot(px - a.x - dx * t, pz - a.z - dz * t);
}

const hopsOf = (traversal) => [...(traversal.gaps || []), ...(traversal.climbs || []), ...(traversal.drops || [])];

// A grid point of `block` a peck spot may take: on the roof's own height all
// round (0.4 m from its edge and from anything standing on it), open to the
// sky, off the moves' ends and rails, the colliders, the discoveries and her
// perches.
function peckable(x, z, block, ground, traversal) {
  const y = block.y;
  const e = PECK_CLEAR.edge;
  const k = e * Math.SQRT1_2;
  for (const [dx, dz] of [[0, 0], [e, 0], [-e, 0], [0, e], [0, -e], [k, k], [-k, k], [k, -k], [-k, -k]]) {
    if (ground.y(x + dx, z + dz) !== y) return false;
  }
  if (skylineY(x, z) !== y) return false;
  for (const h of hopsOf(traversal)) {
    for (const q of [h.from, h.to]) if (Math.hypot(x - q.x, z - q.z) < PECK_CLEAR.takeoff) return false;
  }
  for (const c of traversal.crossings || []) {
    const pts = c.points;
    for (const q of [pts[0], pts[pts.length - 1]]) if (Math.hypot(x - q.x, z - q.z) < PECK_CLEAR.takeoff) return false;
    for (let i = 1; i < pts.length; i++) if (segDist(x, z, pts[i - 1], pts[i]) < PECK_CLEAR.rail) return false;
  }
  for (const c of ROOFS_COLLIDERS) if (Math.hypot(x - c.x, z - c.z) - c.r < PECK_CLEAR.things) return false;
  for (const q of [...Object.values(ROOFS_DISCOVERIES), ...ROOFS_PERCHES]) if (Math.hypot(x - q.x, z - q.z) < PECK_CLEAR.things) return false;
  return true;
}

function peckSpot(blockId, [cx, cz], ground, traversal) {
  const b = BLOCK[blockId];
  let best = null;
  let bestH = Infinity;
  for (let x = b.x0 + 0.5; x < b.x1; x += 1) {
    for (let z = b.z0 + 0.5; z < b.z1; z += 1) {
      if (Math.hypot(x - cx, z - cz) > PECK_NEAR || !peckable(x, z, b, ground, traversal)) continue;
      const h = hash01(x, z, PECK_SALT);
      if (h < bestH) { best = { x, z }; bestH = h; }
    }
  }
  if (!best) throw new Error(`roofsflock: no peck spot on ${blockId} near ${cx}, ${cz}`);
  return best;
}

// The perches: the moves' ends, then the plan's own (ridges, peck spots, the
// loft, the guide's spot), then the drawn spots roofs.js passes, less any
// pot in `smoking` and anything in its smoke: within SMOKE_CLEAR.r (2D) of
// a smoking pot's top (its drawn spot) and no lower than SMOKE_CLEAR.below
// under it (the smoke rises; a perch beside and below the pot stays).
export const SMOKE_CLEAR = Object.freeze({ r: 0.6, below: 0.3 }); // m
export function flockPerches({ traversal, ground, drawn = [], smoking = [] }) {
  const out = [];
  const smoke = new Set(smoking);
  const smokeTops = drawn.filter((d) => smoke.has(d.id));
  const inSmoke = (x, y, z) => smokeTops.some((t) => Math.hypot(t.x - x, t.z - z) < SMOKE_CLEAR.r && y >= t.y - SMOKE_CLEAR.below);
  const add = (id, kind, x, y, z) => {
    if (STREETS.some((s) => inRect(s, x, z))) return;
    if (inSmoke(x, y, z)) return;
    if (!OVER_SLATES.has(kind) && y < L.FLAT && PITCHED.some((r) => inRect(r, x, z))) return;
    const same = out.find((p) => Math.hypot(p.x - x, p.z - z) < MERGE_2D && Math.abs(p.y - y) <= MERGE_Y);
    if (same) same.aliases.push(id);
    else out.push({ id, x, y, z, kind, peck: kind === 'roof', aliases: [] });
  };

  for (const c of traversal.crossings || []) {
    const pts = c.points;
    add(`${c.id}:0`, 'move', pts[0].x, pts[0].y, pts[0].z);
    add(`${c.id}:1`, 'move', pts[pts.length - 1].x, pts[pts.length - 1].y, pts[pts.length - 1].z);
  }
  for (const h of hopsOf(traversal)) {
    for (const [end, q] of [['from', h.from], ['to', h.to]]) {
      const id = `${h.id}:${end}`;
      add(id, 'move', q.x, ground.y(q.x, q.z) + (PERCH_LIFT[id] ?? 0), q.z);
    }
  }

  // every 2 m along each ridge rail, between its ends
  for (const c of (traversal.crossings || []).filter((r) => r.kind === 'ridge')) {
    const a = c.points[0];
    const b = c.points[c.points.length - 1];
    const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / RIDGE_EVERY);
    for (let i = 1; i < n; i++) {
      const t = i / n;
      add(`${c.id}:r${i}`, 'ridge', a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
    }
  }
  for (const [blockId, spots] of Object.entries(PECK_SPOTS)) {
    spots.forEach((spot, n) => {
      const { x, z } = peckSpot(blockId, spot, ground, traversal);
      add(`roof:${blockId}:${n}`, 'roof', x, BLOCK[blockId].y, z);
    });
  }
  LOFT_SPOTS.forEach(([x, z], n) => add(`loft:${n}`, 'loft', x, BLOCK.loft.y, z));
  add(GUIDE.start, 'ground', GUIDE_SPOT.x, ground.y(GUIDE_SPOT.x, GUIDE_SPOT.z), GUIDE_SPOT.z);

  for (const d of drawn) {
    if (!DRAWN_KINDS.has(d.kind)) throw new Error(`roofsflock: a drawn perch of kind ${d.kind} (${d.id})`);
    add(d.id, d.kind, d.x, d.y, d.z); // (a smoking pot is in its own smoke)
  }
  return Object.freeze(out.map((p) => Object.freeze({ ...p, aliases: Object.freeze(p.aliases) })));
}

// Every perch by its id and by each of its aliases.
export function perchIndex(perches) {
  const m = new Map();
  for (const p of perches) {
    m.set(p.id, p);
    for (const a of p.aliases) m.set(a, p);
  }
  return m;
}

// ---------------------------------------------------------------------------
// Flights

const smoothstep = (s) => s * s * (3 - 2 * s);
// smoothstep's inverse on [0, 1]: the s at which a flight is share f across
const unsmooth = (f) => 0.5 - Math.sin(Math.asin(1 - 2 * f) / 3);

const clamp01 = (u) => (u < 0 ? 0 : u > 1 ? 1 : u);
const ease = (u) => smoothstep(clamp01(u));
// The 'step', in shares of s: up over its first 0.45, across from 0.25 to
// 0.85, down onto its perch from 0.6; `lift` m over its higher end.
const STEP = Object.freeze({ lift: 0.4, up: 0.45, across0: 0.25, across: 0.6, down0: 0.6 });

// A flight's plan: `d` across (m); `h`, for the arc its bump over the
// straight line between its ends, for the step its lift over the higher end;
// `time` (s), at FLIGHT.speed along its way; `shape` as given ('arc' or
// 'step': the link's); and the step's `top`.
// `out`, if given, is filled and returned instead of a new object (the
// choice's own scratch, so a bird retrying its flight allocates nothing).
export function flightPlan(a, b, shape = 'arc', out = null) {
  const d = Math.hypot(b.x - a.x, b.z - a.z);
  const o = out ?? {};
  o.d = d;
  if (shape === 'step') {
    const top = Math.max(a.y, b.y) + STEP.lift;
    o.h = STEP.lift;
    o.time = 0.5 + (d + (top - a.y) + (top - b.y)) / FLIGHT.speed;
    o.shape = shape;
    o.top = top;
    return o;
  }
  o.h = Math.min(1.4, 0.6 + 0.08 * d);
  o.time = 0.5 + d / FLIGHT.speed;
  o.shape = 'arc';
  return o;
}

// The bird's spot at s (0..1) of the flight from a to b. The arc: across by
// smoothstep(s), up the straight line between its ends plus the bump. The
// step: up to its top, across, and down onto b. Either is at a for s 0 and
// exactly at b for s 1.
export function flightPoint(a, b, plan, s, out) {
  if (plan.shape === 'step') {
    const f = ease((s - STEP.across0) / STEP.across);
    out.x = a.x + (b.x - a.x) * f;
    out.z = a.z + (b.z - a.z) * f;
    out.y = a.y + (plan.top - a.y) * ease(s / STEP.up) - (plan.top - b.y) * ease((s - STEP.down0) / (1 - STEP.down0));
    return out;
  }
  const f = smoothstep(s);
  out.x = a.x + (b.x - a.x) * f;
  out.z = a.z + (b.z - a.z) * f;
  out.y = a.y + (b.y - a.y) * s + plan.h * 4 * s * (1 - s);
  return out;
}

const SKY_STEP = 0.5; // m between the sky check's samples
const SKY_ENDS = 0.6; // m round either end left unchecked (she stands there)
const tmp = { x: 0, y: 0, z: 0 };

const STEP_SAMPLES = 50; // the step's sky check, s every 0.02

// The flight keeps FLIGHT.clearSky over what lies under it (`under(x, z)`:
// the skyline, or a crossing's rail), except within SKY_ENDS of either end.
// The arc is sampled every SKY_STEP across; the step, finer, by s.
function clears(a, b, plan, under) {
  const step = plan.shape === 'step';
  const n = step ? STEP_SAMPLES : Math.max(1, Math.ceil(plan.d / SKY_STEP));
  for (let i = 0; i <= n; i++) {
    flightPoint(a, b, plan, step ? i / n : unsmooth(i / n), tmp);
    if (Math.hypot(tmp.x - a.x, tmp.z - a.z) < SKY_ENDS || Math.hypot(tmp.x - b.x, tmp.z - b.z) < SKY_ENDS) continue;
    if (tmp.y < under(tmp.x, tmp.z) + FLIGHT.clearSky - 1e-9) return false;
  }
  return true;
}

// A crossing's rail height under (x, z): at the rail's nearest point.
function railUnder(c) {
  const pts = c.points;
  return (x, z) => {
    let best = Infinity;
    let y = pts[0].y;
    for (let i = 1; i < pts.length; i++) {
      const [p, q] = [pts[i - 1], pts[i]];
      const dx = q.x - p.x;
      const dz = q.z - p.z;
      const n = dx * dx + dz * dz;
      const t = n > 0 ? Math.max(0, Math.min(1, ((x - p.x) * dx + (z - p.z) * dz) / n)) : 0;
      const e = Math.hypot(x - p.x - dx * t, z - p.z - dz * t);
      if (e < best) { best = e; y = p.y + (q.y - p.y) * t; }
    }
    return y;
  };
}

// A link a bird of kind K may fly: onto a perch of its kinds, under its
// `below`; a hop within its hop range; a move link of any length for a kind
// that leads, else within its hop range too.
function usable(K, l, to) {
  if (!K.perches.includes(to.kind) || to.y >= K.below) return false;
  return l.kind === 'hop' ? l.d >= K.hop.min && l.d <= K.hop.max : K.leads || l.d <= K.hop.max;
}

// The links from every perch, each perch's flights to the loft (homeDist),
// the perches at her moves' ends (moveEnds), and per kind the perches it may
// land on (landable): those of its kinds with a usable flight on to another
// of them, pruned until none is left without one, so no bird lands where it
// could only flutter for ever (the bin bags under the garages' drop: one
// flight in, none out).
export function flightGraph(perches, traversal) {
  const index = perchIndex(perches);
  const links = new Map(perches.map((p) => [p.id, []]));
  const has = (a, b) => links.get(a.id).some((l) => l.to === b.id);
  const tryLink = (a, b, kind, shape = 'arc', under = skylineY) => {
    if (!a || !b || a === b || has(a, b)) return;
    const plan = flightPlan(a, b, shape);
    if (kind === 'move' ? plan.d > FLIGHT.maxMove : plan.d < FLIGHT.min || plan.d > FLIGHT.maxHop) return;
    if (b.y - a.y > FLIGHT.up || a.y - b.y > FLIGHT.down) return;
    if (!clears(a, b, plan, under)) return;
    links.get(a.id).push(Object.freeze({ to: b.id, kind, d: plan.d, shape }));
  };
  for (const c of traversal.crossings || []) {
    const a = index.get(`${c.id}:0`);
    const b = index.get(`${c.id}:1`);
    tryLink(a, b, 'move', 'arc', railUnder(c));
    tryLink(b, a, 'move', 'arc', railUnder(c));
  }
  for (const g of traversal.gaps || []) if (!g.requires) tryLink(index.get(`${g.id}:from`), index.get(`${g.id}:to`), 'move');
  for (const h of [...(traversal.climbs || []), ...(traversal.drops || [])]) {
    tryLink(index.get(`${h.id}:from`), index.get(`${h.id}:to`), 'move', 'step');
  }
  for (const a of perches) {
    for (const b of perches) {
      if (Math.abs(a.x - b.x) <= FLIGHT.maxHop && Math.abs(a.z - b.z) <= FLIGHT.maxHop) tryLink(a, b, 'hop');
    }
  }
  for (const [id, l] of links) links.set(id, Object.freeze(l));

  // homeDist: flights to a loft perch, breadth first back from the loft, over
  // the perches a pigeon may use
  const ok = (p) => BIRD_KINDS.pigeon.perches.includes(p.kind);
  const into = new Map(perches.map((p) => [p.id, []]));
  for (const [id, l] of links) for (const { to } of l) into.get(to).push(id);
  const homeDist = new Map(perches.map((p) => [p.id, Infinity]));
  let ring = perches.filter((p) => p.kind === 'loft').map((p) => p.id);
  for (const id of ring) homeDist.set(id, 0);
  for (let n = 1; ring.length; n++) {
    const next = [];
    for (const id of ring) {
      for (const from of into.get(id)) {
        if (homeDist.get(from) === Infinity && ok(index.get(from))) { homeDist.set(from, n); next.push(from); }
      }
    }
    ring = next;
  }
  // moveEnds: the perches at the ends of the moves she can make (a crossing's
  // two ends, the landing of a leap with no skill needed, a climb's, a drop's)
  const moveEnds = new Set();
  for (const c of traversal.crossings || []) for (const k of [0, 1]) if (index.has(`${c.id}:${k}`)) moveEnds.add(index.get(`${c.id}:${k}`).id);
  for (const h of hopsOf(traversal)) if (!h.requires && index.has(`${h.id}:to`)) moveEnds.add(index.get(`${h.id}:to`).id);

  const landable = {};
  for (const [kind, K] of Object.entries(BIRD_KINDS)) {
    const set = new Set(perches.filter((p) => K.perches.includes(p.kind) && p.y < K.below).map((p) => p.id));
    for (let pruned = true; pruned;) {
      pruned = false;
      for (const id of set) {
        if (!links.get(id).some((l) => set.has(l.to) && usable(K, l, index.get(l.to)))) {
          set.delete(id);
          pruned = true;
        }
      }
    }
    landable[kind] = set;
  }
  return Object.freeze({ links, homeDist, moveEnds, landable: Object.freeze(landable) });
}

// ---------------------------------------------------------------------------
// The choice

const CAT_S0 = 0.1;
const CAT_S1 = 0.9;
const CAT_SAMPLES = 32; // s 0.1..0.9 in steps of 0.025
const TIE = 0.25; // the hash's share of a score
// A landing on a move end: as much as a flight nearer the loft, so the
// tie-break chooses between them (more and the chases dawdle; less and
// they seldom wait where her moves end).
const END = 1;
const TIE_SALT = 7;
const dist3 = (p, c) => Math.hypot(p.x - c.x, p.y - c.y, p.z - c.z);

// The rules near her: it lands 4 m from her and 0.5 m further than it was,
// and keeps 1.5 m from her on the way.
const planTmp = { d: 0, h: 0, time: 0, shape: 'arc', top: 0 };
function keepsOff(from, to, cat, shape) {
  const end = dist3(to, cat);
  if (end < FLIGHT.landFromCat || end <= dist3(from, cat) + 0.5) return false;
  return passesOff(from, to, cat, shape);
}
// ... and on the way, never within FLIGHT.clearCat of her (the follower's
// flights too: chooseFollow). With `vel` (her velocity, m/s) she is taken to
// walk on at it while the bird flies: at s she is at cat + vel x s x time.
function passesOff(from, to, cat, shape, vel = null) {
  const plan = flightPlan(from, to, shape, planTmp);
  for (let i = 0; i <= CAT_SAMPLES; i++) {
    const s = CAT_S0 + ((CAT_S1 - CAT_S0) * i) / CAT_SAMPLES;
    flightPoint(from, to, plan, s, tmp);
    const k = vel ? s * plan.time : 0;
    const d = vel ? Math.hypot(tmp.x - cat.x - vel.x * k, tmp.y - cat.y - vel.y * k, tmp.z - cat.z - vel.z * k) : dist3(tmp, cat);
    if (d < FLIGHT.clearCat) return false;
  }
  return true;
}

function isTaken(p, taken) {
  if (taken.has(p.id)) return true;
  for (const a of p.aliases) if (taken.has(a)) return true;
  return false;
}
const NO_LINKS = Object.freeze([]);

// Where a flushed bird flies: { to, kind, shape } (`to` a perch id; `shape`
// for flightPlan), or null for a flutter where it is. `bird` is
// { index, kind, at, flights, guideStep }; her spot `cat` is { x, y, z };
// `taken` holds the perches other birds are on. For the guide on its route
// the flight also carries `guideStep`, the bird's guideStep once it lands.
export function chooseFlight(graph, index, bird, cat, taken) {
  const from = index.get(bird.at);
  if (!from) throw new Error(`roofsflock: ${bird.at} is not a perch`);
  const links = graph.links.get(from.id) || NO_LINKS;

  const K = BIRD_KINDS[bird.kind];
  const lands = graph.landable[bird.kind];

  // the guide, on its route: its next stop, else the first later stop it can
  // reach by the rules (it skips ahead of her: `guideStep` is then the stop
  // after the one it lands on); with none, the ordinary choice below, its
  // guideStep kept, so it leads on from wherever it lands
  const guiding = bird.guideStep >= 0 && bird.guideStep < GUIDE.route.length;
  if (guiding) {
    for (let k = bird.guideStep; k < GUIDE.route.length; k++) {
      const stop = index.get(GUIDE.route[k]);
      if (!stop || !lands.has(stop.id) || isTaken(stop, taken)) continue;
      let link = null;
      for (const l of links) if (l.to === stop.id) { link = l; break; }
      if (!link || !keepsOff(from, stop, cat, link.shape)) continue;
      return { to: stop.id, kind: link.kind, shape: link.shape, guideStep: k + 1 < GUIDE.route.length ? k + 1 : -1 };
    }
  }

  const here = graph.homeDist.get(from.id);
  let best = null;
  let bestScore = -Infinity;
  for (const l of links) {
    const to = index.get(l.to);
    if (!usable(K, l, to) || !lands.has(to.id) || isTaken(to, taken)) continue;
    if (!keepsOff(from, to, cat, l.shape)) continue;
    // the plan's hash01(index, flights, 7), offset by where the link lands
    // so that it breaks ties between links rather than adding the same to all
    const tie = TIE * hash01(bird.index + to.x, bird.flights + to.z, TIE_SALT);
    const move = l.kind === 'move';
    const there = graph.homeDist.get(to.id);
    const waits = graph.moveEnds.has(to.id) && (move || there <= here); // at a move end of hers
    const score = K.leads ? 2 * move + (there < here) + END * waits + tie : -Math.abs(l.d - 5) / 5 + tie;
    if (score > bestScore) { best = l; bestScore = score; }
  }
  if (!best) return null;
  return guiding ? { to: best.to, kind: best.kind, shape: best.shape, guideStep: bird.guideStep } : { to: best.to, kind: best.kind, shape: best.shape };
}

// ---------------------------------------------------------------------------
// THE FOLLOWER (Rooftops step 5, ruling R5): at the loft one pigeon comes
// along with her for a while. Settled, and while she is more than `far` from
// it, it takes the link from its perch that lands nearest `sit` from her:
// never nearer her than `near`, only if that lands at least `gain` nearer her
// than it is now, and never within FLIGHT.clearCat of her on the way. So it
// lands beside her route and keeps its distance; with no such link it waits.
// It stops (roofsbirds.js) after `time` walk seconds, `flights` flights, or
// once she is more than `lost` from it: an ordinary pigeon again.
export const FOLLOW = Object.freeze({ time: 75, flights: 14, near: 3.5, sit: 4.5, far: 7, lost: 30 });
const FOLLOW_GAIN = 1; // m nearer her a follower's landing must be than its perch

// Where a follower flies next: { to, kind, shape }, or null (it waits).
// `bird`, `cat` and `taken` as chooseFlight's. The same links a flushed bird
// may take (usable, landable, not taken), scored -|dist(to, her) - sit| plus
// chooseFlight's own hash01 tie-break: no randomness, no clock.
// `vel`, if given, is her velocity (m/s; roofsbirds.js smooths it from her
// spots): then "her" is where she will be when it lands, cat + vel x the
// flight's time, and the landing keeps `near` from both that spot and where
// she is now, and FLIGHT.clearCat from her all the way as she walks on. So a
// follower never lands at her feet on the way she is walking.
const followPlan = { d: 0, h: 0, time: 0, shape: 'arc', top: 0 };
const ahead = { x: 0, y: 0, z: 0 };
export function chooseFollow(graph, index, bird, cat, taken, vel = null) {
  const from = index.get(bird.at);
  if (!from) throw new Error(`roofsflock: ${bird.at} is not a perch`);
  const here = dist3(from, cat);
  if (here <= FOLLOW.far) return null;
  const K = BIRD_KINDS[bird.kind];
  const lands = graph.landable[bird.kind];
  let best = null;
  let bestScore = -Infinity;
  for (const l of graph.links.get(from.id) || NO_LINKS) {
    const to = index.get(l.to);
    if (!usable(K, l, to) || !lands.has(to.id) || isTaken(to, taken)) continue;
    const now = dist3(to, cat);
    if (now < FOLLOW.near || now > here - FOLLOW_GAIN) continue;
    let end = now;
    if (vel) {
      const t = flightPlan(from, to, l.shape, followPlan).time;
      ahead.x = cat.x + vel.x * t;
      ahead.y = cat.y + vel.y * t;
      ahead.z = cat.z + vel.z * t;
      end = dist3(to, ahead);
      if (end < FOLLOW.near) continue;
    }
    if (!passesOff(from, to, cat, l.shape, vel)) continue;
    const score = -Math.abs(end - FOLLOW.sit) + TIE * hash01(bird.index + to.x, bird.flights + to.z, TIE_SALT);
    if (score > bestScore) { best = l; bestScore = score; }
  }
  return best ? { to: best.to, kind: best.kind, shape: best.shape } : null;
}

// ---------------------------------------------------------------------------
// The birds as critters (critters.js): one each, at its home.

export function roofsCritterSpawns(birds, index) {
  return birds.map((b) => {
    const home = index.get(b.home);
    if (!home) throw new Error(`roofsflock: ${b.id}'s home ${b.home} is not a perch`);
    const spawn = { type: BIRD_KINDS[b.kind].critter, x: home.x, z: home.z, roofBird: b.id };
    if (b.kind === 'pigeon') spawn.labelAs = 'pigeon';
    return Object.freeze(spawn);
  });
}
