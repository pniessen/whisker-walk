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
// over a pitched roof's slates (the void, R4) or on a smoking pot.
//
// A LINK is a flight between two perches, of two kinds:
//   * move: along a move of hers (a crossing's two ends both ways, a hop's
//     take-off to its landing), up to 12 m;
//   * hop: any other two perches 3-10 m apart, at most 5 m up or 6 m down.
// Each only if its arc keeps 0.25 m over the skyline between. A flight is a
// short arc, never more than 1.4 m over its higher end: not up into the sky.
//
// THE CHOICE: a flushed bird takes the best link from its perch that lands at
// least 4 m from her and 0.5 m further from her than it was, never comes
// within 1.5 m of her on the way, and ends on a perch no other bird is on.
// A pigeon likes a move link best, then one a flight nearer the loft (so a
// chase walks a child along the planks, ridges and leaps, up the place to
// the warehouse and the loft); sparrows and gulls make local hops near 5 m.
// With no such link it flutters where it is (null). That is the anti-goal
// ("nothing that chases the cat"): no bird ever flies toward her, over her,
// or lands nearer her than it was.
//
// THE GUIDE (GUIDE): one pigeon starts in the alley in front of the spawn
// and, each time she flushes it, flies to its next stop: the bin's lid, the
// shed's roof, plank-3's near end, its far end. Then it is a pigeon like the
// others. THE LOFT is the pigeons' home: homeDist counts the flights from
// each perch to it, and a pigeon resting there goes home after LOFT_REST
// seconds, out of her sight (roofsbirds.js).
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
// (test/roofs.test.js resolves them on the built area).
export const ROOFS_BIRDS = Object.freeze([
  { id: 'pigeon-guide', kind: 'pigeon', home: 'plank-3:1' },
  { id: 'pigeon-1', kind: 'pigeon', home: 'plank-1:1' },
  { id: 'pigeon-2', kind: 'pigeon', home: 'plank-2:1' },
  { id: 'pigeon-3', kind: 'pigeon', home: 'return-4-east:to' },
  { id: 'pigeon-4', kind: 'pigeon', home: 'gutter-2:1' },
  { id: 'pigeon-5', kind: 'pigeon', home: 'cornerShop-up:to' },
  { id: 'pigeon-6', kind: 'pigeon', home: 'warehouse-up:to' },
  { id: 'pigeon-7', kind: 'pigeon', home: 'loft:0' },
  { id: 'sparrow-1', kind: 'sparrow', home: DRAWN_ID.post(0, 1) }, // in house 3's back yard
  { id: 'sparrow-2', kind: 'sparrow', home: DRAWN_ID.wall(13) }, // the wall between yards 7 and 8, by the garages
  { id: 'sparrow-3', kind: 'sparrow', home: 'roof:garages:1' },
  { id: 'sparrow-4', kind: 'sparrow', home: 'roof:dormer:0' },
  { id: 'gull-1', kind: 'gull', home: DRAWN_ID.parapet('warehouse', 3) }, // the north parapet, by the loft
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
// pot in `smoking`.
export function flockPerches({ traversal, ground, drawn = [], smoking = [] }) {
  const out = [];
  const smoke = new Set(smoking);
  const add = (id, kind, x, y, z) => {
    if (STREETS.some((s) => inRect(s, x, z))) return;
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
    add(`${h.id}:from`, 'move', h.from.x, ground.y(h.from.x, h.from.z), h.from.z);
    add(`${h.id}:to`, 'move', h.to.x, ground.y(h.to.x, h.to.z), h.to.z);
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
    if (!smoke.has(d.id)) add(d.id, d.kind, d.x, d.y, d.z);
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

export function flightPlan(a, b) {
  const d = Math.hypot(b.x - a.x, b.z - a.z);
  return { d, h: Math.min(1.4, 0.6 + 0.08 * d), time: 0.5 + d / FLIGHT.speed };
}

// The bird's spot at s (0..1) of the flight from a to b: across by
// smoothstep(s), up the straight line between its ends plus the arc.
export function flightPoint(a, b, plan, s, out) {
  const f = smoothstep(s);
  out.x = a.x + (b.x - a.x) * f;
  out.z = a.z + (b.z - a.z) * f;
  out.y = a.y + (b.y - a.y) * s + plan.h * 4 * s * (1 - s);
  return out;
}

const SKY_STEP = 0.5; // m between the sky check's samples
const SKY_ENDS = 0.6; // m round either end left unchecked (she stands there)
const tmp = { x: 0, y: 0, z: 0 };

function clearsSky(a, b, plan) {
  const n = Math.max(1, Math.ceil(plan.d / SKY_STEP));
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const x = a.x + (b.x - a.x) * f;
    const z = a.z + (b.z - a.z) * f;
    if (Math.hypot(x - a.x, z - a.z) < SKY_ENDS || Math.hypot(x - b.x, z - b.z) < SKY_ENDS) continue;
    flightPoint(a, b, plan, unsmooth(f), tmp);
    if (tmp.y < skylineY(tmp.x, tmp.z) + FLIGHT.clearSky - 1e-9) return false;
  }
  return true;
}

// The links from every perch, and each perch's flights to the loft.
export function flightGraph(perches, traversal) {
  const index = perchIndex(perches);
  const links = new Map(perches.map((p) => [p.id, []]));
  const has = (a, b) => links.get(a.id).some((l) => l.to === b.id);
  const tryLink = (a, b, kind) => {
    if (!a || !b || a === b || has(a, b)) return;
    const plan = flightPlan(a, b);
    if (kind === 'move' ? plan.d > FLIGHT.maxMove : plan.d < FLIGHT.min || plan.d > FLIGHT.maxHop) return;
    if (b.y - a.y > FLIGHT.up || a.y - b.y > FLIGHT.down) return;
    if (!clearsSky(a, b, plan)) return;
    links.get(a.id).push(Object.freeze({ to: b.id, kind, d: plan.d }));
  };
  for (const c of traversal.crossings || []) {
    const a = index.get(`${c.id}:0`);
    const b = index.get(`${c.id}:1`);
    tryLink(a, b, 'move');
    tryLink(b, a, 'move');
  }
  for (const h of hopsOf(traversal)) tryLink(index.get(`${h.id}:from`), index.get(`${h.id}:to`), 'move');
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
  return Object.freeze({ links, homeDist });
}

// ---------------------------------------------------------------------------
// The choice

const CAT_S0 = 0.1;
const CAT_S1 = 0.9;
const CAT_SAMPLES = 32; // s 0.1..0.9 in steps of 0.025
const TIE = 0.25; // the hash's share of a score
const TIE_SALT = 7;
const dist3 = (p, c) => Math.hypot(p.x - c.x, p.y - c.y, p.z - c.z);

// The rules near her: it lands 4 m from her and 0.5 m further than it was,
// and keeps 1.5 m from her on the way.
function keepsOff(from, to, cat) {
  const end = dist3(to, cat);
  if (end < FLIGHT.landFromCat || end <= dist3(from, cat) + 0.5) return false;
  const plan = flightPlan(from, to);
  for (let i = 0; i <= CAT_SAMPLES; i++) {
    flightPoint(from, to, plan, CAT_S0 + ((CAT_S1 - CAT_S0) * i) / CAT_SAMPLES, tmp);
    if (dist3(tmp, cat) < FLIGHT.clearCat) return false;
  }
  return true;
}

const isTaken = (p, taken) => taken.has(p.id) || p.aliases.some((a) => taken.has(a));

// Where a flushed bird flies: { to, kind } (`to` a perch id), or null for a
// flutter where it is. `bird` is { index, kind, at, flights, guideStep }; her
// spot `cat` is { x, y, z }; `taken` holds the perches other birds are on.
export function chooseFlight(graph, index, bird, cat, taken) {
  const from = index.get(bird.at);
  if (!from) throw new Error(`roofsflock: ${bird.at} is not a perch`);
  const links = graph.links.get(from.id) || [];

  // the guide, on its route: the next stop, or a flutter
  if (bird.guideStep >= 0 && bird.guideStep < GUIDE.route.length) {
    const stop = index.get(GUIDE.route[bird.guideStep]);
    const link = stop && links.find((l) => l.to === stop.id);
    if (!link || isTaken(stop, taken) || !keepsOff(from, stop, cat)) return null;
    return { to: stop.id, kind: link.kind };
  }

  const K = BIRD_KINDS[bird.kind];
  const here = graph.homeDist.get(from.id);
  let best = null;
  let bestScore = -Infinity;
  for (const l of links) {
    const to = index.get(l.to);
    if (!K.perches.includes(to.kind) || to.y >= K.below || isTaken(to, taken)) continue;
    if (l.kind === 'hop' ? l.d < K.hop.min || l.d > K.hop.max : !K.leads && l.d > K.hop.max) continue;
    if (!keepsOff(from, to, cat)) continue;
    // the plan's hash01(index, flights, 7), offset by where the link lands
    // so that it breaks ties between links rather than adding the same to all
    const tie = TIE * hash01(bird.index + to.x, bird.flights + to.z, TIE_SALT);
    const score = K.leads
      ? 2 * (l.kind === 'move') + (graph.homeDist.get(to.id) < here) + tie
      : -Math.abs(l.d - 5) / 5 + tie;
    if (score > bestScore) { best = l; bestScore = score; }
  }
  return best && { to: best.to, kind: best.kind };
}

// ---------------------------------------------------------------------------
// The birds as critters (critters.js): one each, at its home.

export function roofsCritterSpawns(birds, index) {
  return birds.map((b) => {
    const home = index.get(b.home);
    if (!home) throw new Error(`roofsflock: ${b.id}'s home ${b.home} is not a perch`);
    return Object.freeze({ type: BIRD_KINDS[b.kind].critter, x: home.x, z: home.z, roofBird: b.id });
  });
}
