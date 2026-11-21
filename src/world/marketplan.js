// The plan of the Market Square (step 1), pure: where everything stands, with no
// three.js and no rng, so the tests and the build read the same numbers.
//
//   north = -z, east = +x, metres.      Bounds x -30..30, z -30..32. Spawn (0, 29).
//
//                         fruit
//            baker                       cheese
//
//     fish           (fountain)                  milk
//
//     flowers                                café tables
//                              ^ spawn          (crumbs)
//   (town shop fronts close the square just outside the bounds, all four sides;
//    the south row has a gap at x = 0 for step 4's gateway)
//
// THE LOCAL FRAME of a stall: +z runs along `face` (the unit vector from the
// stall toward the fountain; the fruit stall faces south), +x is the stall's
// right-hand side (-fz, fx). The counter's front line is local z = d/2, the keeper
// stands at local (0, -d/2 + 0.45), the back shelf is at local z = -d/2.
// toStall / fromStall convert between the world and that frame.
//
// M2 - WHO STANDS WHERE. Every stallholder stands inside their stall's
// colliders, so no cat can ever reach one (a keeper can't be touched, jumped on
// or sniffed). The colliders are circles along the counter's width, r = d/2+0.1.
// A treat sits at the counter's front corner on the hide's side; a hide is a
// trestle table the cat walks under (no collider), a short dash from the treat.
// The cafe has no keeper watching: its crumbs lie under table 0.
//
// STRAYS (U5) are allowed in the square. MARKET_KEEPOUT keeps them out of every
// treat counter's watch zone and its hide, so they never blur a stallholder's
// rhythm; her own cat ignores keepOut (isWalkableAt does not read it).

const freeze = Object.freeze;
const pt = (x, z) => freeze({ x, z });

export const MARKET_BOUNDS = freeze({ minX: -30, maxX: 30, minZ: -30, maxZ: 32 });
export const MARKET_SPAWN = freeze({ x: 0, z: 29 });
export const FOUNTAIN = freeze({ x: 0, z: 0, r: 3.2 });
const FOUNTAIN_COLLIDER_R = 3.4;

export const CAFE = freeze({
  tables: freeze([pt(9, 19), pt(12.5, 21.5), pt(9.4, 24.2)]),
  crumbs: pt(9, 19),
});

// How a treat is reached and where a hide sits, in a stall's local frame.
const HIDE_SIDE = 1;
const treatSpot = (w, d) => ({ lx: HIDE_SIDE * (w / 2 - 0.3), lz: d / 2 + 0.35 });
const hideSpot = (w, d) => ({ lx: HIDE_SIDE * (w / 2 + 1.2), lz: d / 2 - 0.3 });
const HIDE_R = 0.6;

const unitToFountain = (x, z) => {
  const len = Math.hypot(x, z);
  return { x: -x / len, z: -z / len };
};

// Raw table: id, kind, at, face, w, d, treat (kind, y), hasHide, serving keeper.
const RAW = [
  { id: 'fish', kind: 'treat', at: [-15, 4], w: 3.0, d: 2.0, treat: ['fishhead', 0.55], hide: true, keeper: true },
  { id: 'baker', kind: 'treat', at: [-9, -15], w: 3.0, d: 2.0, treat: ['sausageroll', 0.6], hide: true, keeper: true },
  { id: 'cheese', kind: 'treat', at: [9, -15], w: 2.6, d: 1.8, treat: ['cheddar', 0.55], hide: true, keeper: true },
  { id: 'milk', kind: 'treat', at: [15, 4], w: 2.2, d: 1.4, treat: ['cream', 0.3], hide: true, keeper: true },
  { id: 'flowers', kind: 'serve', at: [-15, 18], w: 2.6, d: 1.6, treat: null, hide: true, keeper: true },
  { id: 'fruit', kind: 'serve', at: [0, -24], face: [0, 1], w: 3.0, d: 1.8, treat: null, hide: false, keeper: true },
  { id: 'cafe', kind: 'cafe', at: [9, 19], w: 0, d: 0, treat: ['crumbs', 0], hide: false, keeper: false },
];

export function toStall(stall, x, z) {
  const dx = x - stall.at.x, dz = z - stall.at.z;
  const { x: fx, z: fz } = stall.face;
  return { lx: dx * -fz + dz * fx, lz: dx * fx + dz * fz };
}
export function fromStall(stall, lx, lz) {
  const { x: fx, z: fz } = stall.face;
  return { x: stall.at.x + lx * -fz + lz * fx, z: stall.at.z + lx * fx + lz * fz };
}

function makeStall(raw) {
  const at = pt(raw.at[0], raw.at[1]);
  const face = raw.face ? pt(raw.face[0], raw.face[1]) : freeze(unitToFountain(at.x, at.z));
  const s = { id: raw.id, kind: raw.kind, at, face, w: raw.w, d: raw.d };
  if (raw.kind === 'cafe') {
    s.treat = freeze({ kind: 'crumbs', x: CAFE.crumbs.x, z: CAFE.crumbs.z, y: 0 });
    s.keeper = null;
    s.hide = freeze({ x: CAFE.tables[0].x, z: CAFE.tables[0].z, r: HIDE_R });
    return freeze(s);
  }
  if (raw.treat) {
    const t = treatSpot(raw.w, raw.d);
    s.treat = freeze({ kind: raw.treat[0], ...fromStall(s, t.lx, t.lz), y: raw.treat[1] });
  } else s.treat = null;
  s.keeper = raw.keeper ? freeze(fromStall(s, 0, -raw.d / 2 + 0.45)) : null;
  if (raw.hide) {
    const h = hideSpot(raw.w, raw.d);
    s.hide = freeze({ ...fromStall(s, h.lx, h.lz), r: HIDE_R });
  } else s.hide = null;
  return freeze(s);
}

export const STALLS = freeze(RAW.map(makeStall));
export const TREAT_STALLS = freeze(['fish', 'baker', 'cheese', 'milk']);
export const stallById = (id) => STALLS.find((s) => s.id === id);

// Colliders: circles along each counter's width, r = d/2 + 0.1, centred on the
// counter's axis (local z = 0). The outer circle sits 0.9 m inside the counter's
// end, so a cat can get from the hide to the treat's corner. The cafe has none.
function stallColliders(s) {
  if (s.w <= 0) return [];
  const r = s.d / 2 + 0.1;
  const half = s.w / 2 - 0.9;
  const n = Math.max(2, Math.ceil((2 * half) / (r * 1.2)) + 1);
  const out = [];
  for (let i = 0; i < n; i++) {
    const p = fromStall(s, -half + (2 * half * i) / (n - 1), 0);
    out.push(freeze({ x: p.x, z: p.z, r }));
  }
  // The counter's two BACK corners, so a cat never stands overlapping them. The
  // hide-side FRONT corner stays open: it is the way in to the treat.
  for (const sx of [-1, 1]) {
    const p = fromStall(s, sx * s.w / 2, -s.d / 2);
    out.push(freeze({ x: p.x, z: p.z, r: 0.3 }));
  }
  // and the front corner on the side away from the hide, a full one
  const fc = fromStall(s, -HIDE_SIDE * s.w / 2, s.d / 2);
  out.push(freeze({ x: fc.x, z: fc.z, r: 0.3 }));
  // The hide-side front corner, the treat's approach, gets only a post: it keeps
  // a cat's centre 0.4 m off the corner and leaves the way in open.
  const hc = fromStall(s, HIDE_SIDE * s.w / 2, s.d / 2);
  out.push(freeze({ x: hc.x, z: hc.z, r: 0.05 }));
  return out;
}

export const MARKET_COLLIDERS = freeze([
  freeze({ x: FOUNTAIN.x, z: FOUNTAIN.z, r: FOUNTAIN_COLLIDER_R }),
  ...STALLS.flatMap(stallColliders),
]);

export const MARKET_HIDES = freeze(STALLS.filter((s) => s.hide).map((s) => s.hide));

// Strays keep out of every treat counter's watch zone (local |lx| <= w/2 + 1.0,
// d/2 <= lz <= d/2 + 3.2) plus 0.5 m, and out of each treat stall's hide.
// Task 9 replaces 3.2 and 1.0 with MARKET.WATCH_DEPTH and MARKET.WATCH_SIDE.
const ZONE_DEPTH = 3.2;
const ZONE_SIDE = 1.0;
const ZONE_MARGIN = 0.5;
function zoneCapsule(s) {
  const mid = s.d / 2 + ZONE_DEPTH / 2;
  const a = fromStall(s, -(s.w / 2 + ZONE_SIDE), mid);
  const b = fromStall(s, s.w / 2 + ZONE_SIDE, mid);
  return freeze({ x1: a.x, z1: a.z, x2: b.x, z2: b.z, r: ZONE_DEPTH / 2 + ZONE_MARGIN });
}
const hideCapsule = (s) => freeze({ x1: s.hide.x, z1: s.hide.z, x2: s.hide.x, z2: s.hide.z, r: s.hide.r + ZONE_MARGIN });
const TREAT_STALL_ROWS = TREAT_STALLS.map(stallById);
export const MARKET_KEEPOUT = freeze({
  rects: freeze([]),
  capsules: freeze([...TREAT_STALL_ROWS.map(zoneCapsule), ...TREAT_STALL_ROWS.map(hideCapsule)]),
  margin: 0.4,
});

export function marketArea() {
  return {
    name: 'The Market Square',
    bounds: MARKET_BOUNDS,
    spawn: MARKET_SPAWN,
    colliders: MARKET_COLLIDERS,
    waters: [],
    perches: [],
    pois: MARKET_POIS,
    collectibles: MARKET_COLLECTIBLES,
    keepOut: MARKET_KEEPOUT,
  };
}

// Twelve places for the daily race and the quests, five golden finds. Plain
// words, the same in both word sets. All on free cobbles, 3 m from every
// collider; the south strip behind the spawn (about x 0, z 32) is kept free.
export const MARKET_POIS = freeze([
  { x: 0, z: 22 }, // the south cobbles, by the spawn
  { x: -8, z: 24 }, // the south-west cobbles
  { x: -21, z: 12 }, // the west edge, by the flowers
  { x: -22, z: -2 }, // the west edge, by the fish
  { x: -22, z: -22 }, // the north-west corner
  { x: 0, z: -14 }, // the north cobbles, under the fruit stall's row
  { x: -4, z: 9 }, // the fountain's south side
  { x: 5, z: -8 }, // the fountain's north side
  { x: 22, z: -20 }, // the north-east corner
  { x: 23, z: 0 }, // the east edge, past the milk cart
  { x: 21, z: 15 }, // the east cobbles, by the café
  { x: 18, z: 27 }, // the south-east corner
].map(freeze));

export const MARKET_COLLECTIBLES = freeze([
  { id: 'market-1', x: -4, z: 18, label: 'a shiny button' },
  { id: 'market-2', x: -25, z: 5, label: 'a dropped coin' },
  { id: 'market-3', x: 4, z: -19, label: 'a red ribbon' },
  { id: 'market-4', x: 26, z: -10, label: 'a paper ticket' },
  { id: 'market-5', x: 17, z: 12, label: 'a little brass key' },
].map(freeze));

// The picture views, 'px,py,pz,lx,ly,lz' (Task 6 fills the rest).
export const MARKET_SHOTS = Object.freeze({
  card: '0,3.2,31,0,1.2,0',
});

export const MARKET_REGISTRATION = freeze({
  id: 'market',
  // src/progression.js CATALOG.areas: nothing offers the Market until step 4 (M1)
  catalog: null,
  // src/propsets.js SETS.market (Task 5 fills the rows)
  propSet: freeze({
    carryables: freeze([]),
    knockables: freeze([]),
    markables: freeze([]),
    flaps: freeze([]),
    rests: freeze([]),
    hides: freeze(MARKET_HIDES.map((h) => freeze({ x: h.x, z: h.z }))),
    dogYard: null,
    keepSlots: freeze([]),
  }),
  // src/render/clouds.js CLOUD_AREAS and AREA_SKY.market
  clouds: freeze({ clouds: 6, banks: 3 }),
  // src/render/ambient.js ambientKind
  ambient: 'fluff',
  // src/render/pawprints.js AREA_RULES.market: cobbles, no grass
  pawprints: freeze({ ground: null, path: 'gravel', strip: null }),
  // the Farm's ceilings, never raised: [meshes, casters, triangles] built, [meshes, casters] merged
  budget: freeze({ built: freeze([280, 210, 62000]), merged: freeze([280, 210]) }),
  view: MARKET_SHOTS.card,
  // not a colony area; strays are allowed (U5) and kept out by MARKET_KEEPOUT
  colony: false,
});
