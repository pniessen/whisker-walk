// The plan of the Market Square (step 1), pure: where everything stands, with no
// three.js and no rng, so the tests and the build read the same numbers.
//
//   north = -z, east = +x, metres.      Bounds x -21..21, z -21..23. Spawn (0, 20.5).
//
//                         fruit
//            baker                    cheese
//                     lamp       lamp
//     fish            (fountain)          flowers
//                     lamp       lamp
//        café tables                   milk
//          (crumbs)       ^ spawn
//   (town shop fronts close the square just outside the bounds, all four sides;
//    the south row has a gap at x = 0 for step 4's gateway)
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
// The treats' stands, the crate of apples and the lamp posts are small solid
// circles too (MARKET_COLLIDERS), each well inside a cat's reach of its treat.
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
const treatSpot = (w, d) => ({ lx: HIDE_SIDE * (w / 2 - 0.3), lz: d / 2 + 0.35 });
const hideSpot = (w, d) => ({ lx: HIDE_SIDE * (w / 2 + 1.2), lz: d / 2 - 0.3 });
const HIDE_R = 0.6;

const unitToFountain = (x, z) => {
  const len = Math.hypot(x, z);
  return { x: -x / len, z: -z / len };
};

// Raw table: id, kind, at, face, w, d, treat (kind, y), hasHide, serving keeper.
const RAW = [
  { id: 'fish', kind: 'treat', at: [-11, 2], w: 3.0, d: 2.0, treat: ['fishhead', 0.55], hide: true, keeper: true },
  { id: 'baker', kind: 'treat', at: [-7, -10.5], w: 3.0, d: 2.0, treat: ['sausageroll', 0.6], hide: true, keeper: true },
  { id: 'cheese', kind: 'treat', at: [7, -10.5], w: 2.6, d: 1.8, treat: ['cheddar', 0.55], hide: true, keeper: true },
  { id: 'milk', kind: 'treat', at: [8, 11.5], w: 2.2, d: 1.4, treat: ['cream', 0.3], hide: true, keeper: true },
  { id: 'flowers', kind: 'serve', at: [12, 0], w: 2.6, d: 1.6, treat: null, hide: true, keeper: true },
  { id: 'fruit', kind: 'serve', at: [0, -17], face: [0, 1], w: 3.0, d: 1.8, treat: null, hide: false, keeper: true },
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

// The small solid things the square draws on the cobbles: each treat's stand
// (an ice crate, a stool, a barrel, the cart's step) at its treat, r 0.2, so a
// cat's centre stops 0.55 from the treat, inside TREAT_REACH; the crate of
// apples at the fruit stall's end (step 3 rolls its fruit); the four lamp posts.
export const STAND_R = 0.2;
export const FRUIT_CRATE = freeze({ lx: stallById('fruit').w / 2 + 0.45, lz: 0.3, w: 0.5, h: 0.4, d: 0.4, r: 0.3 });
export const MARKET_LAMPS = freeze([pt(-5, -5), pt(5, -5), pt(-5, 5), pt(5, 5)]);
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
  ['barrow-mid', 'barrow', 3.6, 13.6, 0.9], ['stack-mid', 'stack', -3.6, 10.4, 0.2],
  ['bench-sw', 'bench', -9.2, 9.6, 0], ['stack-sw', 'stack', -14, 7.6, -0.3], ['tub-sw-mid', 'tub', -11.6, 12.4, 0],
];
const CLUTTER_HALF = freeze({ barrow: [1.26, 0.5], bench: [0.83, 0.25], tub: [0.4, 0.4], stack: [0.55, 0.5], board: [0.75, 0.15], bicycle: [0.85, 0.26] });
// a bench faces the fountain: its yaw turns its seat's front (+z) to (0, 0)
const benchYaw = (x, z) => Math.atan2(FOUNTAIN.x - x, FOUNTAIN.z - z);
function clutterSolid(kind, x, z, yaw) {
  const along = (d) => ({ x: x + d * Math.cos(yaw), z: z - d * Math.sin(yaw) });
  if (kind === 'barrow') return [-0.4, 0.4].map((d) => freeze({ ...along(d), r: 0.45 }));
  if (kind === 'tub') return [freeze({ x, z, r: 0.4 })];
  if (kind === 'stack') return [freeze({ x, z, r: 0.5 })];
  if (kind === 'board') return [-0.55, 0.55].map((d) => freeze({ ...along(d), r: 0.1 }));
  if (kind === 'bicycle') return [-0.5, 0].map((d) => freeze({ ...along(d), r: 0.3 }));
  return [];
}
export const MARKET_CLUTTER = freeze(CLUTTER_RAW.map(([id, kind, x, z, y]) => {
  const yaw = kind === 'bench' ? benchYaw(x, z) : y;
  return freeze({ id, kind, x, z, yaw, half: CLUTTER_HALF[kind], solid: freeze(clutterSolid(kind, x, z, yaw)) });
}));
const clutterById = (id) => MARKET_CLUTTER.find((c) => c.id === id);
export const BENCH_AT = clutterById('bench-fountain');
export const BICYCLE_AT = clutterById('bicycle');
const standColliders = (s) => (s.kind === 'treat' ? [freeze({ x: s.treat.x, z: s.treat.z, r: STAND_R })] : []);
const FRUIT_CRATE_AT = fromStall(stallById('fruit'), FRUIT_CRATE.lx, FRUIT_CRATE.lz);
// The milk cart's shafts (Task 6) lie out from its end away from the hide, down
// to the cobbles (market.js draws them, `len` long from the cart's end, at the
// cart body's middle depth): one circle over them, so a cat goes round them.
const MILK = stallById('milk');
export const MILK_SHAFTS = freeze({ lx: -HIDE_SIDE * (MILK.w / 2 + 0.5), lz: MILK.d / 2 - 0.4, len: 1.0, r: 0.5 });
const MILK_SHAFTS_AT = fromStall(MILK, MILK_SHAFTS.lx, MILK_SHAFTS.lz);

export const MARKET_COLLIDERS = freeze([
  freeze({ x: FOUNTAIN.x, z: FOUNTAIN.z, r: FOUNTAIN_COLLIDER_R }),
  ...STALLS.flatMap(stallColliders),
  ...STALLS.flatMap(standColliders),
  freeze({ x: FRUIT_CRATE_AT.x, z: FRUIT_CRATE_AT.z, r: FRUIT_CRATE.r }),
  freeze({ x: MILK_SHAFTS_AT.x, z: MILK_SHAFTS_AT.z, r: MILK_SHAFTS.r }),
  ...MARKET_LAMPS.map((p) => freeze({ x: p.x, z: p.z, r: LAMP_R })),
  ...MARKET_CLUTTER.flatMap((c) => c.solid),
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
    perches: [],
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
  { x: -1, z: -7 }, // the fountain's north side
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

// THE TOURS (Task 14): the owner's two films, driven by world/marketpilot.js's
// createMarketPilot on verify-market.html (?live=1&drive=1, __tour(name)) and,
// headless, by test/marketlive.test.js through the rig with the same pilot.
// Every point comes from a stall's own frame (fromStall), so a tour follows a
// stall that moves. Each tour has its seed and its start clock (the time of
// day the rhythm reads), so the film and the test see the same stallholders.
// The step kinds are marketpilot.js's; `view` is the page's camera ('follow',
// behind her; { stall }, her and that stallholder in one frame; { stall, wide },
// a still camera out in front of that stall, the hide's side).
const at = (id, lx, lz) => {
  const p = fromStall(stallById(id), lx, lz);
  return freeze([+p.x.toFixed(3), +p.z.toFixed(3)]);
};
// a stall's hide, and the creep in from it: out past the corner post, then at the treat
const hideOf = (id) => freeze([stallById(id).hide.x, stallById(id).hide.z]);
const creepIn = (id) => { const s = stallById(id); return at(id, s.w / 2 + 0.5, s.d / 2 + 0.6); };
// where she takes a treat to munch it: out past the hide's side of the zone, toward the camera
const munchSpot = (id) => { const s = stallById(id); return at(id, s.w / 2 + 1.3, s.d / 2 + 1.8); };
const steps = (list) => freeze(list.map(freeze));
const BAKER = stallById('baker');
// the baker's view: out on the hide's side, so the lamp post in front of the
// baker's (MARKET_LAMPS) stays out of the frame, the counter and the walk in
const BAKER_VIEW = freeze({ stall: 'baker', eye: freeze([BAKER.w / 2 + 2.9, BAKER.d / 2 + 3.4, 2.2]), at: freeze([-0.4, BAKER.d / 2 + 0.4]) });
const CHEESE = stallById('cheese');
export const MARKET_TOURS = freeze({
  // From the spawn the café crumbs; the fishmonger's hide, the bubble, the creep
  // in, the grab and the munch; then the baker walked straight into while
  // watched (the shoo, the broom, the hop back), a dash under the trestle, the
  // wait, the grab. Ends with 3 treats and one shoo.
  sneak: freeze({
    seed: 7,
    clock: 36000,
    start: freeze({ x: MARKET_SPAWN.x, z: MARKET_SPAWN.z, face: freeze([0, -1]) }),
    steps: steps([
      { view: 'follow' }, { say: 'The café crumbs first: nobody minds those' }, { grab: 'cafe' }, { wait: 2.2 },
      { say: 'Now the fish stall: under the trestle to hide' }, { view: { stall: 'fish' } }, { walk: hideOf('fish') },
      { say: 'Watch the fishmonger…' }, { until: { stall: 'fish', phase: 'serve' } }, { until: { stall: 'fish', bubble: true } },
      { say: 'The busy bubble! They are about to turn round' }, { until: { stall: 'fish', watching: false } },
      { say: 'Turned away: creep in and grab it!' }, { walk: creepIn('fish'), pace: 'creep' }, { grab: 'fish', pace: 'creep' },
      { say: 'Got it! Munch, munch' }, { walk: munchSpot('fish') }, { wait: 1.6 },
      { say: 'Over to the baker' }, { walk: at('fish', 1.6, 5.2) }, { view: 'follow' }, { walk: [-4, -4] }, { walk: at('baker', -3.0, BAKER.d / 2 + 3.4) },
      { view: BAKER_VIEW },
      { say: 'What if she just walks straight in?' }, { until: { stall: 'baker', phase: 'serve' } },
      { walk: [BAKER.treat.x, BAKER.treat.z], stopOn: 'shoo' }, { say: 'Spotted!' }, { wait: 1.0 },
      { say: 'Dash under the trestle!' }, { walk: at('baker', BAKER.w / 2 + 1.3, BAKER.d / 2 + 3.2), pace: 'dash' }, { walk: hideOf('baker'), pace: 'dash' },
      { say: 'Wait for the bubble…' }, { until: { stall: 'baker', bubble: true } }, { until: { stall: 'baker', watching: false } },
      { say: 'Now!' }, { walk: creepIn('baker'), pace: 'creep' }, { grab: 'baker', pace: 'creep' },
      { say: 'A sausage roll!' }, { walk: munchSpot('baker') }, { wait: 1.6 },
      { say: 'Treats this walk:', tally: true }, { wait: 2.0 },
    ]),
  }),
  // A partner cat walks along the cheese stall's front and stops there: the
  // stallholder turns to her and coos, and while it does, her cat comes round
  // to the hide and creeps in for the cheddar. Her device pays her the treat
  // (and says who kept them busy); the partner's pays the teamwork.
  team: freeze({
    seed: 7,
    clock: 36004,
    start: freeze({ x: at('cheese', 1.5, 6.4)[0], z: at('cheese', 1.5, 6.4)[1], face: freeze([CHEESE.face.x * -1, CHEESE.face.z * -1]) }),
    me: freeze({ id: 'mittens', name: 'Mittens' }), // her cat, as the partner's device knows her
    partner: freeze({
      id: 'biscuit',
      name: 'Biscuit',
      start: freeze({ x: at('cheese', -0.6, 6.9)[0], z: at('cheese', -0.6, 6.9)[1] }),
      steps: steps([
        { wait: 0.8 }, { walk: at('cheese', -CHEESE.w / 2 - 2.6, CHEESE.d / 2 + 4.6) }, { walk: at('cheese', -CHEESE.w / 2 - 2.2, CHEESE.d / 2 + 1.1) },
        { walk: at('cheese', -CHEESE.w / 2 - 0.8, CHEESE.d / 2 + 1.1) }, { wait: 12 },
      ]),
    }),
    steps: steps([
      { view: { stall: 'cheese', wide: true, eye: [CHEESE.w / 2 + 1.8, CHEESE.d / 2 + 4.8, 2.3] } }, { say: 'Teamwork at the cheese stall' },
      { walk: at('cheese', CHEESE.w / 2 + 2.5, CHEESE.d / 2 + 4.1) }, { walk: hideOf('cheese') },
      { say: 'Biscuit stops right in front…' }, { until: { stall: 'cheese', cooing: 'biscuit' } },
      { say: '…and while they coo at her, round the side!' }, { walk: creepIn('cheese'), pace: 'creep' }, { grab: 'cheese', pace: 'creep' },
      { say: 'The cheddar! Teamwork!' }, { walk: munchSpot('cheese') }, { wait: 4.5 },
    ]),
  }),
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
});
