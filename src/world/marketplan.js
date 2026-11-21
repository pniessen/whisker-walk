// The plan of the Market Square (step 1), pure: where everything stands, with no
// three.js and no rng, so the tests and the build read the same numbers.
//
//   north = -z, east = +x, metres.      Bounds x -21..21, z -21..23. Spawn (0, 20.5).
//
//                       [hide] fruit
//              baker                  lamp   cheese
//             lamp
//     fish                 (fountain)            flowers [hide]
//                   lamp         lamp
//        café tables                     milk cart
//          (crumbs)        ^ spawn
//   (town shop fronts close the square just outside the bounds, all four sides;
//    the south row has a gap at x = 0 for step 4's gateway, a tub of flowers
//    either side of it; MARKET_CLUTTER's barrows, benches, tubs, crate stacks,
//    noticeboard and bicycle dress the cobbles between the stalls)
//
// THE SIZE (controller's ruling, Task 6, 2026-11-21): the first square was
// 60 x 62 m and read as big and empty to a cat; it is now 42 x 44, everything
// drawn in with it, the milk cart about 12 m from the spawn, and the cobbles
// between the stalls dressed with clutter a cat weaves through (MARKET_CLUTTER).
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
// V3 (step 3): the fruit and flower stalls are playable, so each has a hide too
// (a trestle she walks under, a short dash from its front, no keeper's watch to
// hide from). The hide's side is the stall's own `hideSide` (default 1; the
// fruit stall's is -1, so its hide is away from the apple crate on the +1 side).
// V4: the two lamp posts that stood in the fruit and flower stalls' view lanes
// moved: (0, -10.4) to (0, -6.8) and (5.5, 1) to (5.5, 3), still ringing the
// fountain. The lane test runs over all six stalls with a counter.
//
// The treats' stands, the crate of apples and the lamp posts are small solid
// circles too (MARKET_COLLIDERS), each well inside a cat's reach of its treat.
//
// V5 (step 3): THE CLIMBS. Beside each stall with a counter, on its side away
// from its hide, a stack of crates (CLIMB_STACKS, solid) one hop up from the
// cobbles; from its top the stall's awning is one hop up, at or over
// MARKET.HIGH_Y, where nobody notices her. The flower trestle, the bicycle's
// basket, the tops of stack-w and stack-e and the three café tables are one hop
// up too (MARKET_PERCHES). The awning's perch is over the end of the counter by
// its crates, so the button up there takes her back down to them (a drop in
// reach), never bare into the counter's middle.
//
// STRAYS (U5) are allowed in the square. MARKET_KEEPOUT keeps them out of every
// treat counter's watch zone and its hide, so they never blur a stallholder's
// rhythm; her own cat ignores keepOut (isWalkableAt does not read it).

const freeze = Object.freeze;
const pt = (x, z) => freeze({ x, z });

export const MARKET_BOUNDS = freeze({ minX: -21, maxX: 21, minZ: -21, maxZ: 23 });
export const MARKET_SPAWN = freeze({ x: 0, z: 20.5 });
export const FOUNTAIN = freeze({ x: 0, z: 0, r: 3.2 });
const FOUNTAIN_COLLIDER_R = 3.4;

// The crumbs lie under table 0's top, 0.32 m west of its centre: clear of its
// foot (r 0.2, a central pole), still under its top (r 0.4). Its hide is the
// table itself.
export const CAFE = freeze({
  tables: freeze([pt(-6.3, 13.5), pt(-8.8, 15.3), pt(-6.6, 17.2)]),
  crumbs: pt(-6.62, 13.5),
});

// How a treat is reached and where a hide sits, in a stall's local frame.
const HIDE_SIDE = 1;
const treatSpot = (w, d, side = HIDE_SIDE) => ({ lx: side * (w / 2 - 0.3), lz: d / 2 + 0.35 });
const hideSpot = (w, d, side = HIDE_SIDE) => ({ lx: side * (w / 2 + 1.2), lz: d / 2 - 0.3 });
const HIDE_R = 0.6;

const unitToFountain = (x, z) => {
  const len = Math.hypot(x, z);
  return { x: -x / len, z: -z / len };
};

// A stall's awning (market.js draws it, marketparts.js's sheet scaled by `rise`
// about `y`): `over` wider than the counter, `front` over its front and `back`
// behind. awningHeight is the sheet's height over a stall's plan-local point,
// its sag and its slope to the front, the one formula the drawing and the
// perches share.
export const AWNING = freeze({ y: 2.35, rise: 2.5, over: 0.4, front: 0.45, back: 0.15 });
const clamp01 = (v) => Math.min(1, Math.max(0, v));
export function awningHeight(s, lx, lz) {
  const sx = s.w + AWNING.over;
  const z0 = -s.d / 2 - AWNING.back;
  const t = clamp01((lz - z0) / (s.d / 2 + AWNING.front - z0));
  const u = clamp01(-lx / sx + 0.5); // the drawing's x is the plan's -lx (market.js pl)
  return AWNING.y + AWNING.rise * (0.12 * (0.5 - t) - 0.05 * Math.sin(Math.PI * u) * t);
}

// Raw table: id, kind, at, face, w, d, treat (kind, y), hasHide, hideSide (default 1; step 3's fruit stall is -1), serving keeper.
const RAW = [
  { id: 'fish', kind: 'treat', at: [-11, 2], w: 3.0, d: 2.0, treat: ['fishhead', 0.55], hide: true, keeper: true },
  { id: 'baker', kind: 'treat', at: [-7, -10.5], w: 3.0, d: 2.0, treat: ['sausageroll', 0.6], hide: true, keeper: true },
  { id: 'cheese', kind: 'treat', at: [7, -10.5], w: 2.6, d: 1.8, treat: ['cheddar', 0.55], hide: true, keeper: true },
  { id: 'milk', kind: 'treat', at: [8, 11.5], w: 2.2, d: 1.4, treat: ['cream', 0.3], hide: true, keeper: true },
  { id: 'flowers', kind: 'serve', at: [12, 0], w: 2.6, d: 1.6, treat: null, hide: true, keeper: true },
  { id: 'fruit', kind: 'serve', at: [0, -17], face: [0, 1], w: 3.0, d: 1.8, treat: null, hide: true, hideSide: -1, keeper: true },
  { id: 'cafe', kind: 'cafe', at: [-6.3, 13.5], w: 0, d: 0, treat: ['crumbs', 0], hide: false, keeper: false },
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
  const side = raw.hideSide ?? HIDE_SIDE;
  const s = { id: raw.id, kind: raw.kind, at, face, w: raw.w, d: raw.d, hideSide: side };
  if (raw.kind === 'cafe') {
    s.treat = freeze({ kind: 'crumbs', x: CAFE.crumbs.x, z: CAFE.crumbs.z, y: 0 });
    s.keeper = null;
    s.hide = freeze({ x: CAFE.tables[0].x, z: CAFE.tables[0].z, r: HIDE_R });
    return freeze(s);
  }
  if (raw.treat) {
    const t = treatSpot(raw.w, raw.d, side);
    s.treat = freeze({ kind: raw.treat[0], ...fromStall(s, t.lx, t.lz), y: raw.treat[1] });
  } else s.treat = null;
  s.keeper = raw.keeper ? freeze(fromStall(s, 0, -raw.d / 2 + 0.45)) : null;
  if (raw.hide) {
    const h = hideSpot(raw.w, raw.d, side);
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
  const fc = fromStall(s, -s.hideSide * s.w / 2, s.d / 2);
  out.push(freeze({ x: fc.x, z: fc.z, r: 0.3 }));
  // The hide-side front corner, the treat's approach, gets only a post: it keeps
  // a cat's centre 0.4 m off the corner and leaves the way in open.
  const hc = fromStall(s, s.hideSide * s.w / 2, s.d / 2);
  out.push(freeze({ x: hc.x, z: hc.z, r: 0.05 }));
  return out;
}

// The small solid things the square draws on the cobbles: each treat's stand
// (an ice crate, a stool, a barrel, the cart's step) at its treat, r 0.2, so a
// cat's centre stops 0.55 from the treat, inside TREAT_REACH; the crate of
// apples at the fruit stall's end (step 3 rolls its fruit); the four lamp posts.
// FRUIT_CRATE: where the crate stands (lx, lz), the crate as marketfruit.js draws
// it (w, d, h: it stands on local x -w..0 of its spot, the edge it tips over) and
// its collider (r 0.4: the drawn crate's far corner is 0.40 m off its spot).
export const STAND_R = 0.2;
export const FRUIT_CRATE = freeze({ lx: stallById('fruit').w / 2 + 0.45, lz: 0.3, w: 0.36, h: 0.3, d: 0.34, r: 0.4 });
// The four lamp posts ring the fountain, each out of every treat counter's view
// from in front of it (the final review: the old two at (+-5, -5) stood 4.7 m
// in front of the baker's and the cheese counters, between the chase camera and
// the counter; (5, 5) stood 7 m out in front of the milk cart). marketplan.test.js
// holds each one out of every counter's view lane.
export const MARKET_LAMPS = freeze([pt(-8, -5), pt(0, -6.8), pt(-5, 5), pt(5.5, 3)]);
const LAMP_R = 0.12;

// THE CLUTTER (Task 6's ruling): things a cat weaves through and hides behind
// on the cobbles between the stalls, morning-busy and calm. { id, kind, x, z,
// yaw } (yaw turns the thing's own +x the way three.js's rotation.y does:
// world (cos yaw, -sin yaw)), and `solid`: the small circles that stop a cat
// walking through it. None stands in a treat counter's watch zone or across a
// hide-to-treat line, and none in the gateway's lane (marketplan.test.js).
//   barrow  a market handcart of produce, 1.4 x 0.8, two circles along it
//   bench   she walks under its seat, so nothing solid; the one by the
//           fountain is the step-3 anchor (MARKET_ANCHORS.bench in market.js)
//   tub     a half-barrel of flowers, r 0.4
//   stack   crates and sacks, r 0.5
//   board   the noticeboard on two posts (she walks under the board)
//   bicycle parked on its stand by the south row, just inside the bounds: its
//           rear wheel and frame are solid, its basket over the front wheel is
//           the step-3 anchor (market.js MARKET_ANCHORS.basket)
//   chalkboard the café's A-frame board of chalk pictures (step 3, V11), on the
//           cobbles beside its door, turned a little toward the spawn, r 0.25
// `half` is each thing's half-extent in its own frame [along x, along z], so
// the plan test can check its whole footprint, not just its centre.
// Five of them (the review, 2026-11-21) fill the open middle: a barrow and a
// stack either side of the spawn-to-fountain walk (off the crumbs' line), and a
// bench, a stack and a tub between the café and the fish stall.
const CLUTTER_RAW = [
  ['tub-gate-w', 'tub', -2.5, 21.9, 0], ['tub-gate-e', 'tub', 2.5, 21.9, 0],
  ['tub-nw', 'tub', -19.3, -19.3, 0], ['tub-ne', 'tub', 19.3, -19.3, 0],
  ['tub-sw', 'tub', -19.3, 21.3, 0], ['tub-se', 'tub', 19.3, 21.3, 0],
  ['barrow-w', 'barrow', -16.5, -8, 0.5], ['barrow-e', 'barrow', 16, -4.5, -0.4],
  ['bench-fountain', 'bench', -4.5, 6, 0], ['bench-east', 'bench', 5.5, -2.5, 0],
  ['stack-w', 'stack', -17.5, 12, 0.3], ['stack-e', 'stack', 16.5, 13, -0.2], ['stack-fruit', 'stack', 3.4, -18, 0.1],
  ['board', 'board', 4.8, 21.9, Math.PI], // its face to the square (-z)
  ['bicycle', 'bicycle', 9, 22.72, 0],
  ['chalkboard', 'chalkboard', -6.45, 22.55, Math.PI - 0.35], // its face to the square, turned toward the spawn
  ['barrow-mid', 'barrow', 3.6, 13.6, 0.9], ['stack-mid', 'stack', -3.6, 10.4, 0.2],
  ['bench-sw', 'bench', -9.2, 9.6, 0], ['stack-sw', 'stack', -14, 7.6, -0.3], ['tub-sw-mid', 'tub', -11.6, 12.4, 0],
];
// V5 (step 3): THE CLIMBING STACKS, `crates` (three crates, CLIMB_STACK.h high,
// solid r 0.3), one beside each stall with a counter on the side away from its
// hide, `out` past the counter's end, at `CLIMB_LZ` along its depth: clear of
// its front (every view lane ends 0.5 m inside the front line) and, for the
// baker, of the flour sacks behind; the milk cart's behind its shafts.
export const CLIMB_STACK = freeze({ h: 0.95, r: 0.3, out: 0.55 });
const CLIMB_LZ = freeze({ fish: 0.1, baker: 0.15, cheese: 0, milk: -0.9, flowers: -0.2, fruit: -0.6 });
const climbAt = (s) => fromStall(s, -s.hideSide * (s.w / 2 + CLIMB_STACK.out), CLIMB_LZ[s.id]);
const r2 = (v) => Math.round(v * 100) / 100;
for (const s of STALLS.filter((q) => q.w > 0)) {
  const p = climbAt(s);
  CLUTTER_RAW.push([`crates-${s.id}`, 'crates', r2(p.x), r2(p.z), r2(Math.atan2(s.face.x, s.face.z) + 0.15)]);
}
const CLUTTER_HALF = freeze({ barrow: [1.26, 0.5], bench: [0.83, 0.25], tub: [0.4, 0.4], stack: [0.55, 0.5], board: [0.75, 0.15], bicycle: [0.85, 0.26], crates: [0.27, 0.27], chalkboard: [0.28, 0.26] });
// a bench faces the fountain: its yaw turns its seat's front (+z) to (0, 0)
const benchYaw = (x, z) => Math.atan2(FOUNTAIN.x - x, FOUNTAIN.z - z);
function clutterSolid(kind, x, z, yaw) {
  const along = (d) => ({ x: x + d * Math.cos(yaw), z: z - d * Math.sin(yaw) });
  if (kind === 'barrow') return [-0.4, 0.4].map((d) => freeze({ ...along(d), r: 0.45 }));
  if (kind === 'tub') return [freeze({ x, z, r: 0.4 })];
  if (kind === 'stack') return [freeze({ x, z, r: 0.5 })];
  if (kind === 'crates') return [freeze({ x, z, r: CLIMB_STACK.r })];
  if (kind === 'board') return [-0.55, 0.55].map((d) => freeze({ ...along(d), r: 0.1 }));
  if (kind === 'bicycle') return [-0.5, 0].map((d) => freeze({ ...along(d), r: 0.3 }));
  if (kind === 'chalkboard') return [freeze({ x, z, r: 0.25 })];
  return [];
}
export const MARKET_CLUTTER = freeze(CLUTTER_RAW.map(([id, kind, x, z, y]) => {
  const yaw = kind === 'bench' ? benchYaw(x, z) : y;
  return freeze({ id, kind, x, z, yaw, half: CLUTTER_HALF[kind], solid: freeze(clutterSolid(kind, x, z, yaw)) });
}));
const clutterById = (id) => MARKET_CLUTTER.find((c) => c.id === id);
export const BENCH_AT = clutterById('bench-fountain');
export const BICYCLE_AT = clutterById('bicycle');
// the climbing stacks (V5), one per stall with a counter, in STALLS' order: { ..., stall }
export const CLIMB_STACKS = freeze(MARKET_CLUTTER.filter((c) => c.kind === 'crates').map((c) => freeze({ ...c, stall: c.id.slice('crates-'.length) })));
// The bicycle's shape (market.js draws it): its basket's centre is basketX along
// it, basketY up, before its lean (about x, to the wall). Its yaw is 0.
export const BIKE = freeze({ wheelR: 0.33, axle: 0.52, basketX: 0.62, basketY: 0.87, lean: 0.05 });
// the centre of its basket, as drawn (MARKET_ANCHORS.basket, V8's perch)
export const BICYCLE_BASKET_AT = freeze({
  x: BICYCLE_AT.x + BIKE.basketX,
  z: BICYCLE_AT.z + BIKE.basketY * Math.sin(BIKE.lean),
  y: BIKE.basketY * Math.cos(BIKE.lean),
});
const standColliders = (s) => (s.kind === 'treat' ? [freeze({ x: s.treat.x, z: s.treat.z, r: STAND_R })] : []);
const FRUIT_CRATE_AT = fromStall(stallById('fruit'), FRUIT_CRATE.lx, FRUIT_CRATE.lz);
// The milk cart's shafts (Task 6) lie out from its end away from the hide, down
// to the cobbles (market.js draws them, `len` long from the cart's end, at the
// cart body's middle depth): one circle over them, so a cat goes round them.
const MILK = stallById('milk');
export const MILK_SHAFTS = freeze({ lx: -HIDE_SIDE * (MILK.w / 2 + 0.5), lz: MILK.d / 2 - 0.4, len: 1.0, r: 0.5 });
const MILK_SHAFTS_AT = fromStall(MILK, MILK_SHAFTS.lx, MILK_SHAFTS.lz);

// The baker's warm flour sacks, beside the stall on the side away from its hide:
// the nap's spot (propSet.rests) and market.js's anchor (MARKET_ANCHORS.flourSacks).
const BAKER = stallById('baker');
export const FLOUR_SACKS = freeze(fromStall(BAKER, -(BAKER.w / 2 + 0.6), -BAKER.d / 2 + 0.5));

// V7 (step 3): THE STREET MUSICIAN's pitch, against the fountain's south-east
// rim, turned out to the square (yaw as a keeper's: their front is (sin yaw,
// cos yaw)), so she sees them playing as she comes up from the spawn. Solid,
// r 0.45 (the person and the open fiddle case at their feet), its circle into
// the fountain's own, so there is no gap to squeeze into. Out of every
// counter's view lane, every watch zone and every dash from a hide, 3 m from
// every POI and collectible, 1.5 m from the golden mice and the found-outfit
// spots (marketplan.test.js): between the flower stall's lane and the
// fountain's drink there is about a hand's width of room for it. Nobody moves
// it: world/marketfolk.js stands the person here.
export const MUSICIAN = freeze({ x: 1.9, z: 3.3, yaw: 0.45, r: 0.45 });
// The pigeons' patch (Task 6 spawns the birds here): free cobbles between the
// fountain and its bench, where the bench's crumbs fall, off every lane, zone
// and hide line, a way off from the musician.
export const PIGEON_PATCH = freeze({ x: -2.8, z: 5.3, r: 1.2 });

export const MARKET_COLLIDERS = freeze([
  freeze({ x: FOUNTAIN.x, z: FOUNTAIN.z, r: FOUNTAIN_COLLIDER_R }),
  ...STALLS.flatMap(stallColliders),
  ...STALLS.flatMap(standColliders),
  freeze({ x: FRUIT_CRATE_AT.x, z: FRUIT_CRATE_AT.z, r: FRUIT_CRATE.r }),
  freeze({ x: MILK_SHAFTS_AT.x, z: MILK_SHAFTS_AT.z, r: MILK_SHAFTS.r }),
  ...MARKET_LAMPS.map((p) => freeze({ x: p.x, z: p.z, r: LAMP_R })),
  ...MARKET_CLUTTER.flatMap((c) => c.solid),
  freeze({ x: MUSICIAN.x, z: MUSICIAN.z, r: MUSICIAN.r }),
]);

export const MARKET_HIDES = freeze(STALLS.filter((s) => s.hide).map((s) => s.hide));

// Strays keep out of every treat counter's watch zone (local |lx| <= w/2 + 1.0,
// d/2 <= lz <= d/2 + 3.2) plus 0.5 m, and out of each treat stall's hide.
// These are MARKET.WATCH_DEPTH and MARKET.WATCH_SIDE (src/marketrules.js), kept as
// literals here because the rules import this plan; test/marketrules.test.js holds
// MARKET_KEEPOUT to the real zone.
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
    perches: MARKET_PERCHES,
    pois: MARKET_POIS,
    collectibles: MARKET_COLLECTIBLES,
    keepOut: MARKET_KEEPOUT,
  };
}

// Twelve places for the daily race and the quests, five golden finds. Plain
// words, the same in both word sets. All on free cobbles, 3 m from every
// collider (the clutter's too) and off the café's tables; the south strip
// behind the spawn (about x 0, z 23) is kept free.
export const MARKET_POIS = freeze([
  { x: 0, z: 18 }, // the south cobbles, by the spawn
  { x: -12.5, z: 20 }, // the south-west corner, past the café
  { x: -19.5, z: 1.5 }, // the west edge, behind the fish
  { x: -19.5, z: -15.5 }, // the north-west corner
  { x: -6.5, z: -19.5 }, // the north cobbles, behind the baker
  { x: 15.5, z: -19.5 }, // the north-east corner
  { x: 19.5, z: 8.5 }, // the east edge, past the flowers
  { x: 17.5, z: 17.5 }, // the south-east corner
  { x: -2, z: 7 }, // the fountain's south side, by the bench
  { x: -3.5, z: -7 }, // the fountain's north-west side, clear of the north lamp
  { x: 9, z: -4 }, // between the fountain and the flowers
  { x: -12.5, z: -7 }, // between the fish and the baker
].map(freeze));

export const MARKET_COLLECTIBLES = freeze([
  { id: 'market-1', x: -15.5, z: 15.5, label: 'a shiny button' },
  { id: 'market-2', x: -7, z: -1.5, label: 'a dropped coin' },
  { id: 'market-3', x: 7, z: -16, label: 'a red ribbon' },
  { id: 'market-4', x: 18.5, z: 1, label: 'a paper ticket' },
  { id: 'market-5', x: 4.5, z: 8.5, label: 'a little brass key' },
].map(freeze));

// The picture views (verify-market.html's __shot, scripts/record-page.mjs
// --shots), 'px,py,pz,lx,ly,lz' in world metres. A counter's shot stands 3 m in
// front of its counter, on its middle, at a cat's height, looking at the counter
// (built from the plan, so it follows a stall that moves).
const view = (...n) => n.map((v) => +v.toFixed(2)).join(',');
const COUNTER_EYE = 0.5; // m: a cat's eye, near enough
const COUNTER_LOOK = 1.5; // m: up a little, so the stall's sign over its awning is in
function counterShot(id) {
  const s = stallById(id);
  const eye = fromStall(s, 0, s.d / 2 + 3);
  const at = fromStall(s, 0, 0);
  return view(eye.x, COUNTER_EYE, eye.z, at.x, COUNTER_LOOK, at.z);
}
const SPAWN_VIEW = '0,2.2,25,0,0.4,20.5';
export const MARKET_SHOTS = Object.freeze({
  // the walk's own camera at the spawn (4.5 m behind her, 2.2 m up), up the square to the fountain
  spawn: SPAWN_VIEW,
  fountain: '4.5,1.5,7,0,1.4,0',
  fish: counterShot('fish'),
  baker: counterShot('baker'),
  cheese: counterShot('cheese'),
  milk: counterShot('milk'),
  // from the fountain's side, the tables in front of the café's awning
  cafe: '-1,1.3,11.5,-7.5,1.2,18',
  // high over the south-west corner, the whole square and all six stalls
  overview: '-17,17,21,1,0,-1',
  // the spawn view again, at 390 x 844
  phone: SPAWN_VIEW,
  // the place card: from the café side, under the bunting, to the milk cart, the flower
  // stall and the fountain, the baker's, cheese and fruit stalls beyond
  card: '-4,3.2,17,5,1.5,2',
});

// Step 3's moment views (verify-market.html's __shot('moment-<name>')): each a
// view and `t`, the walk seconds the page runs after the moment's own start (the
// crate going over, the bucket landing, the pigeons taking off, her landing on
// the awning; for the rest the life's own clock). The page puts a stand-in cat
// at the moment's spot. Test and picture data only: nothing in the game reads it.
export const MARKET_MOMENT_SHOTS = Object.freeze({
  lookup: Object.freeze({ view: '6,0.95,-4.9,7,0.95,-9.3', t: 1 }),
  cafe: Object.freeze({ view: '-4,1.2,14.5,-8,1.4,19.5', t: 0 }),
  tubs: Object.freeze({ view: '-6,0.9,19,-2.5,0.4,21.9', t: 0 }),
  cobbles: Object.freeze({ view: '1.5,0.7,15,0,0,18', t: 0 }),
  fruit: Object.freeze({ view: '-5.2,1,-13,-1.9,0.2,-15.6', t: 0 }),
  apples: Object.freeze({ view: '-5.2,1,-13,-1.9,0.2,-15.6', t: 2 }),
  flowers: Object.freeze({ view: '8.4,0.9,-0.9,10.9,0.3,-2.6', t: 0 }),
  petals: Object.freeze({ view: '8.4,0.9,-0.9,10.9,0.3,-2.6', t: 1 }),
  awning: Object.freeze({ view: '4,3,-6.3,8,1.9,-9.8', t: 1 }),
  fountain: Object.freeze({ view: '-3,1.2,7.5,0,0.7,3.2', t: 1.5 }),
  pigeons: Object.freeze({ view: '-0.6,1.3,9.6,-2.8,1.1,5.8', t: 0.35 }),
  sacks: Object.freeze({ view: '-3.4,0.9,-14.6,-5.5,0.15,-12.1', t: 1 }),
  musician: Object.freeze({ view: '4.6,1.3,6.5,1.9,1.1,3.3', t: 1.3 }),
  basket: Object.freeze({ view: '11.5,1.3,19.3,9.6,0.9,22.7', t: 1 }),
  mice: Object.freeze({ view: '9.4,3.3,-8.4,7.3,2.35,-10.3', t: 0 }),
});

// Step 3's props (V2, V4): numbers to the centimetre, so SETS.market's literals
// equal them exactly. A drink at the fountain's south rim, a nap on the flour
// sacks (neither drawn: mesh false), a bucket of flowers on the flower trestle's
// top that falls toward the cobbles in front of it, a cafe cup on table 2 (the
// third), two lamp-post-and-board marks, a paper bag and a dropped glove.
const cm = (v) => Math.round(v * 100) / 100;
const FLOWERS = stallById('flowers');
const TRESTLE_TOP = fromStall(FLOWERS, FLOWERS.w / 2 + 1.2, FLOWERS.d / 2 - 0.3); // the flower trestle's middle
const BUCKET_LANDS = fromStall(FLOWERS, FLOWERS.w / 2 + 1.2, FLOWERS.d / 2 + 1.1);
const CUP_TABLE = CAFE.tables[2];
// the bucket stands on the trestle's cloth, whose top is 0.775 (market.js: the
// cloth's box at 0.765, 0.02 deep, over the plank top at 0.75)
const BUCKET_Y = 0.775;
const PROP_ROWS = {
  rests: [
    { id: 'market-drink-1', kind: 'drink', x: 0, z: 3.8, mesh: false },
    { id: 'market-nap-1', kind: 'nap', x: cm(FLOUR_SACKS.x), z: cm(FLOUR_SACKS.z), mesh: false },
  ].map(freeze),
  knockables: [
    { id: 'market-bucket-1', kind: 'bucket', x: cm(TRESTLE_TOP.x), z: cm(TRESTLE_TOP.z), y: BUCKET_Y, fallTo: freeze({ x: cm(BUCKET_LANDS.x), z: cm(BUCKET_LANDS.z), y: 0.01 }) },
    { id: 'market-cup-1', kind: 'cup', x: cm(CUP_TABLE.x + 0.1), z: cm(CUP_TABLE.z + 0.1), y: 0.74, fallTo: freeze({ x: cm(CUP_TABLE.x + 1), z: cm(CUP_TABLE.z - 0.4) }) },
  ].map(freeze),
  markables: [
    { id: 'market-post-1', kind: 'post', x: -8, z: -4.4, nearBorder: false, mesh: false }, // a lamp post's foot
    { id: 'market-post-2', kind: 'post', x: 5.35, z: 22.5, nearBorder: false, mesh: false }, // the noticeboard's post
  ].map(freeze),
  carryables: [
    { id: 'market-bag-1', kind: 'ribbon', x: -16.2, z: -6.5 }, // a paper bag's ribbon by the west barrow
    { id: 'market-glove-1', kind: 'glove', x: 6.5, z: -2.8 }, // a dropped glove by the east bench
  ].map(freeze),
};

// V5 (step 3): THE PERCHES, { x, z, y, kind, label?, vantage? } (src/climbing.js;
// every one of them reached with no skill, BASE_CLIMB_BUDGET).
// Each stall with a counter: the crates' top (CLIMB_STACK.h, 0.1 m out past the
// stack's middle, so a bare hop down sets her outside it), then the awning, at the
// sheet's own height over the counter's end by the crates (0.3 m in from the end,
// about 0.95 m from the crates: in reach both ways, so from the awning the button
// is the crates again, and clear of the stallholder under it). The four treat stalls' awnings are lookouts, plainly named.
const ROOF_LABELS = freeze({
  fish: 'the fish stall’s awning', baker: 'the baker’s awning', cheese: 'the cheese stall’s awning', milk: 'the milk cart’s awning',
});
function stallPerches(s) {
  const side = -s.hideSide;
  const lz = CLIMB_LZ[s.id];
  const crate = fromStall(s, side * (s.w / 2 + CLIMB_STACK.out + 0.1), lz);
  const rlx = side * (s.w / 2 - 0.3);
  const rlz = Math.max(lz, -s.d / 2 - AWNING.back + 0.25); // on the sheet (the milk cart's crates stand behind it)
  const roof = fromStall(s, rlx, rlz);
  const label = ROOF_LABELS[s.id];
  return {
    stack: CLIMB_STACKS.find((c) => c.stall === s.id),
    crate: freeze({ x: r2(crate.x), z: r2(crate.z), y: CLIMB_STACK.h, kind: 'crate' }),
    roof: freeze({ x: r2(roof.x), z: r2(roof.z), y: r2(awningHeight(s, rlx, rlz)), kind: 'roof', ...(label ? { label, vantage: true } : {}) }),
  };
}
const CLIMBS = Object.fromEntries(STALLS.filter((s) => s.w > 0).map((s) => [s.id, freeze(stallPerches(s))]));
// stallClimb(id) -> that stall's { stack, crate, roof } (the stack a MARKET_CLUTTER row)
export const stallClimb = (id) => CLIMBS[id] ?? null;
// The flower trestle's top (V2), its cloth's top, at its back end behind the bucket
// (the bucket is knocked off from here: knockables.js's 0.3 m and the knock's 1 m)
export const TRESTLE_PERCH = freeze({ ...(({ x, z }) => ({ x: r2(x), z: r2(z) }))(fromStall(FLOWERS, FLOWERS.w / 2 + 1.2, FLOWERS.d / 2 - 0.3 - 0.6)), y: BUCKET_Y, kind: 'crate' });
// The bicycle's basket (V8): she sits in it
export const BICYCLE_BASKET = freeze({ x: r2(BICYCLE_BASKET_AT.x), z: r2(BICYCLE_BASKET_AT.z), y: r2(BICYCLE_BASKET_AT.y), kind: 'crate' });
// The tops of stack-w and stack-e (market.js draws a basket of apples on the top
// crate, 0.16 m along from the stack's middle): she sits on the apples, 1.04 up
const RIM_Y = 1.04;
export const RIM_PERCHES = freeze(['stack-w', 'stack-e'].map((id) => {
  const c = clutterById(id);
  return freeze({ x: r2(c.x - 0.16 * Math.cos(c.yaw)), z: r2(c.z + 0.16 * Math.sin(c.yaw)), y: RIM_Y, kind: 'crate' });
}));
// The café tables' tops (marketparts.js cafeTable: 0.74): the cup on table 2 is
// knocked off from beside it, 0.15 m the other way from its middle
const TABLE_TOP = 0.74;
export const TABLE_PERCHES = freeze(CAFE.tables.map((t, i) => freeze({
  x: r2(t.x - (i === 2 ? 0.15 : 0)), z: r2(t.z - (i === 2 ? 0.15 : 0)), y: TABLE_TOP, kind: 'furniture',
})));
export const MARKET_PERCHES = freeze([
  ...Object.values(CLIMBS).flatMap((c) => [c.crate, c.roof]),
  TRESTLE_PERCH,
  BICYCLE_BASKET,
  ...RIM_PERCHES,
  ...TABLE_PERCHES,
]);

// V12: THREE GOLDEN MICE (src/goldmice.js GOLD_MICE.market; test/market.test.js
// holds the two equal). `y` is metres over the cobbles.
const CHEESE = stallById('cheese');
const GM1 = fromStall(CHEESE, -CHEESE.hideSide * 0.35, CLIMB_LZ.cheese);
const MARKET_GOLD = freeze([
  // on the cheese stall's awning, by its middle: up its crates, then onto the awning (2 hops)
  freeze({ id: 'gm-market-1', x: r2(GM1.x), z: r2(GM1.z), y: r2(awningHeight(CHEESE, -CHEESE.hideSide * 0.35, CLIMB_LZ.cheese)) }),
  // on the apples on top of stack-e, the east crate stack: one hop off the cobbles
  freeze({ id: 'gm-market-2', x: RIM_PERCHES[1].x, z: RIM_PERCHES[1].z, y: RIM_Y }),
  // hidden low at the foot of the west shop fronts, tucked at the end of the handcart there
  freeze({ id: 'gm-market-3', x: -20.5, z: -4.3, y: 0 }),
]);

export const MARKET_REGISTRATION = freeze({
  id: 'market',
  // src/progression.js CATALOG.areas: held back (M1) until Market step 4
  // copied it into the catalog, after the Rooftops, Clan Edition only (V15, V16)
  catalog: freeze({ name: 'The Market Square', price: 150, requires: freeze({ area: 'neighborhood', walks: 2 }), edition: 'canon' }),
  // src/propsets.js SETS.market (test/market.test.js holds the two equal)
  propSet: freeze({
    carryables: freeze(PROP_ROWS.carryables),
    knockables: freeze(PROP_ROWS.knockables),
    markables: freeze(PROP_ROWS.markables),
    flaps: freeze([]),
    rests: freeze(PROP_ROWS.rests),
    hides: freeze(MARKET_HIDES.map((h) => freeze({ x: h.x, z: h.z }))),
    dogYard: null,
    keepSlots: freeze([]),
  }),
  // src/render/clouds.js CLOUD_AREAS and AREA_SKY.market
  clouds: freeze({ clouds: 8, banks: 2 }),
  // src/render/ambient.js ambientKind
  ambient: 'fluff',
  // src/render/pawprints.js AREA_RULES.market: cobbles, no grass
  pawprints: freeze({ ground: null, path: 'gravel', strip: null }),
  // the Farm's ceilings, never raised: [meshes, casters, triangles] built, [meshes, casters] merged
  budget: freeze({ built: freeze([280, 210, 62000]), merged: freeze([280, 210]) }),
  view: MARKET_SHOTS.card,
  // not a colony area; strays are allowed (U5) and kept out by MARKET_KEEPOUT
  colony: false,
  // src/goldmice.js GOLD_MICE.market (V12)
  goldMice: MARKET_GOLD,
});
