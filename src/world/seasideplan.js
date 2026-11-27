// =============================================================================
// THE SEASIDE'S HOLIDAY LIFE, AS DATA (the owner, 2026-11-26: "the Seaside is
// somewhat bland"). Pure: no imports, no three.js, no clock, no Math.random.
// Everything here is DECORATION, laid at hand-picked spots (the way the
// Market's plan is): bathers on the sand and at the water's edge, sand castles
// at three stages, gulls on the pier posts, the sand and the wing, and two
// vendors on the boardwalk. Nothing here is a find, a perch, a prompt or a
// word: there is no text at all, so no word table.
//
// Where things stand is checked against the real built area by
// test/seasideplan.test.js (in bounds, off the pier, off the Reef gate end,
// the finds, the pois, the colliders, the mice, the spawn and the boardwalk's
// own props).
//
// Yaw is the game's: a group's front is its +z, so a figure that faces the
// sea (+x) has yaw pi/2 (atan2(dx, dz)).
// =============================================================================

export const SEA_YAW = Math.PI / 2;
export const yawToward = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);

// The deck (as seaside.js has it), the sea's near edge, the boardwalk and the
// Reef gate end: where nothing here may stand.
export const PIER_DECK = Object.freeze({ minX: 22, maxX: 46, minZ: -11.5, maxZ: -8.5 });
export const SEA_EDGE_X = 25;
export const BOARDWALK = Object.freeze({ minX: 18, maxX: 22, minZ: -45, maxZ: 45 });
export const REEF_GATE_END = Object.freeze({ x: 21.5, z: -14.5 });

// The ground height under a foot at (x, z): the boardwalk's deck, the wet
// sand's film, or the dry beach.
export const footY = (x, z) => (x >= BOARDWALK.minX && x <= BOARDWALK.maxX && Math.abs(z) <= BOARDWALK.maxZ ? 0.03 : x > 21.8 ? 0.008 : 0);

// A rung's ceiling on what is drawn: 0 high to 2 low (LITE draws the first rank
// only; the people are the draw calls, the rest is merged).
export const RANK_FOR_RUNG = (rung) => (rung >= 5 ? 0 : rung >= 3 ? 1 : 2);

const SKIN = Object.freeze({ fair: 0xefcfb4, light: 0xe6bf9e, tan: 0xcf9d74, brown: 0xa8734c, deep: 0x7a5236 });

// --- the bathers -------------------------------------------------------------
// role: stand | sit | wade | toss (catches the beach ball) | kneel (a child at
// a castle: its grown-up stands beside it, the `kid` spot's own pair).
// bare: bare-chested (the top is skin coloured); top/bottom the swim colours.
// rank: 0 always, 1 not on LOW's rung and below, 2 only on the upper rungs.
const f = (o) => Object.freeze(o);
export const SEASIDE_FOLK = Object.freeze([
  // the ball players, one a grown-up, one a child, either side of the middle beach
  f({ id: 'toss-adult', role: 'toss', kind: 'adult', sex: 'm', skin: SKIN.light, bare: true, bottom: 0x2f7fb8, x: 9.2, z: -3.4, yaw: yawToward({ x: 9.2, z: -3.4 }, { x: 12, z: -5.8 }), rank: 0, partner: 'toss-child' }),
  f({ id: 'toss-child', role: 'toss', kind: 'child', sex: 'f', skin: SKIN.tan, top: 0xf06a4a, bottom: 0xf7c93b, x: 12, z: -5.8, yaw: yawToward({ x: 12, z: -5.8 }, { x: 9.2, z: -3.4 }), rank: 0, partner: 'toss-adult' }),
  // the child at the castle that is only a mound so far, its grown-up behind
  f({ id: 'kneel-kid', role: 'kneel', kind: 'child', sex: 'm', skin: SKIN.fair, top: 0x4a9ad0, bottom: 0xe2433a, x: 7, z: 12.5, yaw: Math.PI, rank: 0, hat: 0xe8b83a, adultAt: Object.freeze({ x: 8.7, z: 13.8 }), adultTop: 0xd27a96, adultBottom: 0x3e5a7a, adultSkin: SKIN.light }),
  f({ id: 'sit-a', role: 'sit', kind: 'adult', sex: 'f', skin: SKIN.brown, top: 0xe4e0d6, bottom: 0xd8503a, x: 6.2, z: 20.2, yaw: SEA_YAW + 0.25, rank: 1, hat: 0xe8d8a8 }),
  f({ id: 'wade', role: 'wade', kind: 'adult', sex: 'm', skin: SKIN.deep, bare: true, bottom: 0xf0a020, x: 25.7, z: 14, yaw: SEA_YAW - 0.2, rank: 1 }),
  f({ id: 'edge-stand', role: 'stand', kind: 'adult', sex: 'f', skin: SKIN.light, top: 0x4eb86a, bottom: 0xf7f2e4, x: 23.9, z: -19.8, yaw: SEA_YAW + 0.1, rank: 1, hat: 0xe8d8a8 }),
  f({ id: 'sit-b', role: 'sit', kind: 'adult', sex: 'm', skin: SKIN.tan, bare: true, bottom: 0x4a9ad0, x: 7.4, z: 21.6, yaw: SEA_YAW - 0.15, rank: 2 }),
  f({ id: 'shore-stand', role: 'stand', kind: 'adult', sex: 'f', skin: SKIN.fair, top: 0xe070b0, bottom: 0x5ab06a, x: 11.2, z: 31, yaw: SEA_YAW, rank: 2 }),
]);

// The towels the sitters are on (and the one beach umbrella over them).
export const SEASIDE_TOWELS = Object.freeze([
  f({ x: 6.2, z: 20.2, yaw: 0.25, colors: Object.freeze([0xe2433a, 0xf4efe4]) }),
  f({ x: 7.4, z: 21.6, yaw: -0.15, colors: Object.freeze([0x3d7cc9, 0xf7c93b]) }),
]);
export const SEASIDE_UMBRELLA = f({ x: 5.0, z: 20.9, tilt: 0.18, colors: Object.freeze([0xf7c93b, 0xf4efe4]) });

// --- the sand castles --------------------------------------------------------
// stage 0 a mound with two bucket-turrets begun; 1 a keep and two towers; 2 the
// finished castle with four towers, a wall and a flag. r: how far it reaches.
export const SEASIDE_CASTLES = Object.freeze([
  f({ x: 7, z: 11.5, stage: 0, r: 0.5, yaw: 0.2, bucket: Object.freeze({ x: 6.3, z: 12.6 }), flag: null }),
  f({ x: 6, z: -8, stage: 2, r: 0.7, yaw: -0.3, bucket: null, flag: 0xe0473c }),
  f({ x: 14.8, z: -22, stage: 1, r: 0.55, yaw: 0.6, bucket: Object.freeze({ x: 14, z: -21.2 }), flag: 0x3d7cc9 }),
]);

// --- the vendors -------------------------------------------------------------
// Two stands on the boardwalk's sand edge, facing the boardwalk (east): the
// counter's front a hand's breadth off the kerb (x 18), so the walkway itself
// stays clear; the vendor stands just behind (west of) the counter. They carry
// no collider: the area record's colliders are pinned (test/beachdress.test.js).
export const SEASIDE_VENDORS = Object.freeze([
  f({ id: 'ice-cream', kind: 'cart', x: 17.2, z: -4.5, vendorAt: Object.freeze({ x: 16.35, z: -4.5 }), yaw: SEA_YAW, sex: 'f', skin: SKIN.light, top: 0xf4efe4, bottom: 0x3e4a66, hat: 0xe2433a, rank: 0 }),
  f({ id: 'lemonade', kind: 'stand', x: 17.2, z: 22, vendorAt: Object.freeze({ x: 16.35, z: 22 }), yaw: SEA_YAW, sex: 'm', skin: SKIN.brown, top: 0xf7c93b, bottom: 0x4a4a52, hat: 0xe8d8a8, rank: 0 }),
]);

// --- the gulls ---------------------------------------------------------------
// The pier's posts, just outside the deck (not on it: a cat walking the pier
// is never in their way). A gull sits on the top, y = POST_TOP.
export const POST_TOP = 1.2;
export const SEASIDE_POSTS = Object.freeze([
  Object.freeze({ x: 30, z: -11.8 }), Object.freeze({ x: 34, z: -8.2 }), Object.freeze({ x: 38, z: -11.8 }), Object.freeze({ x: 42, z: -8.2 }),
]);

// mode: post (on SEASIDE_POSTS[post]) | stand | walk (back and forth along
// yaw, `reach` m) | hop (home and away: flies to whichever is farther from her
// cat when she comes within HOP_NEAR, and never toward her) | glide (a circle
// over the water, `flap` how much of it is wing beats).
export const HOP_NEAR = 3.2;
export const SEASIDE_GULLS = Object.freeze([
  f({ id: 'post-1', mode: 'post', post: 0, yaw: 0.7, rank: 0 }),
  f({ id: 'hop', mode: 'hop', home: Object.freeze({ x: 15, z: 30.5 }), away: Object.freeze({ x: 6, z: 27.5 }), yaw: SEA_YAW, rank: 0 }),
  f({ id: 'glide-1', mode: 'glide', cx: 35, cz: 18, radius: 7, height: 6, speed: 0.22, flap: 0.1, phase: 0.1, rank: 0 }),
  f({ id: 'post-2', mode: 'post', post: 2, yaw: 3.6, rank: 1 }),
  f({ id: 'walk-1', mode: 'walk', x: 14, z: 9.5, yaw: 1.2, reach: 1.2, phase: 0.3, rank: 1 }),
  f({ id: 'glide-2', mode: 'glide', cx: 38, cz: -24, radius: 9, height: 7.5, speed: -0.18, flap: 0.5, phase: 0.55, rank: 1 }),
  f({ id: 'stand-1', mode: 'stand', x: 23.4, z: 22, yaw: SEA_YAW - 0.5, phase: 0.8, rank: 2 }),
  f({ id: 'walk-2', mode: 'walk', x: 4, z: -17, yaw: -0.8, reach: 1.4, phase: 0.7, rank: 2 }),
  f({ id: 'post-3', mode: 'post', post: 3, yaw: 2.6, rank: 2 }),
]);

// --- everything that stands on the ground, for the checks --------------------
// { id, x, z, r } at the spot's own radius: the figures (0.45), the castles, the
// stands, the gulls' spots (0.3), the towels (1.1), the umbrella. The gliders
// are in the air and not listed.
export function seasideSpots() {
  const out = [];
  for (const p of SEASIDE_FOLK) {
    out.push({ id: p.id, x: p.x, z: p.z, r: 0.45 });
    if (p.adultAt) out.push({ id: `${p.id}-adult`, x: p.adultAt.x, z: p.adultAt.z, r: 0.45 });
  }
  for (const [i, t] of SEASIDE_TOWELS.entries()) out.push({ id: `towel-${i}`, x: t.x, z: t.z, r: 1.1 });
  out.push({ id: 'umbrella', x: SEASIDE_UMBRELLA.x, z: SEASIDE_UMBRELLA.z, r: 1.1 });
  for (const [i, c] of SEASIDE_CASTLES.entries()) {
    out.push({ id: `castle-${i}`, x: c.x, z: c.z, r: c.r });
    if (c.bucket) out.push({ id: `bucket-${i}`, x: c.bucket.x, z: c.bucket.z, r: 0.15 });
  }
  for (const v of SEASIDE_VENDORS) {
    out.push({ id: v.id, x: v.x, z: v.z, r: 1.0 });
    out.push({ id: `${v.id}-vendor`, x: v.vendorAt.x, z: v.vendorAt.z, r: 0.45 });
  }
  for (const g of SEASIDE_GULLS) {
    if (g.mode === 'stand' || g.mode === 'walk') out.push({ id: g.id, x: g.x, z: g.z, r: 0.3 });
    if (g.mode === 'walk') out.push({ id: `${g.id}-end`, x: g.x + Math.sin(g.yaw) * g.reach, z: g.z + Math.cos(g.yaw) * g.reach, r: 0.3 });
    if (g.mode === 'hop') { out.push({ id: `${g.id}-home`, x: g.home.x, z: g.home.z, r: 0.3 }); out.push({ id: `${g.id}-away`, x: g.away.x, z: g.away.z, r: 0.3 }); }
  }
  return out;
}
