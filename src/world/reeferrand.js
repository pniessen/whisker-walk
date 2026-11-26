// =============================================================================
// MARLO'S ERRAND OF THE DAY: THE PURE RULES (milestone R7, Replay). No THREE, no clock, no random number, no save write. After the housewarming (story step 7), each walk
// Marlo has one small errand worth AWARDS.reefjob (25 paws) once a walk, and one more postcard in the album of twelve. world/reeferrandlive.js carries it out on a walk.
//
// THE SIX ERRANDS (plan 3.4):
//   glass   bring him the three pieces of sea-glass (the walk's own collectibles, picked up as always), then Interact beside him
//   school  follow a little school of fish through a ring of kelp (it swims on only while she is near; no clock)
//   shell   one of the five shells has changed colour (the day's pick): pick it up
//   rings   float through five bubble rings in order (the only errand that needs the float: the rings hang 1.8 to 2.0 m over the sand)
//   snail   carry a small hat shell to a sleepy snail
//   glove   a lost glove lies at one of six spots (the seed picks): carry it to Marlo
//
// WHICH ERRAND AND WHERE comes only from planReefErrand(roomSeed, visits): a room's seed when there is one (every cat in the room gets the same errand, the same shell and the
// same glove spot; nothing is sent to a partner and nothing about it is saved), else the count of Reef walks (a solo cat's day). The ALBUM is the twelve bits of state.reef.album
// (src/progression.js sanitises them to 12 bits and src/catmerge.js unions them): the postcard an errand pays is the lowest bit not yet set. Every spot is on open sand
// reachable on foot from the spawn; only the rings ask for the float. North is -z; heights are metres over the seabed.
// =============================================================================

export const ERRAND_KINDS = Object.freeze(['glass', 'school', 'shell', 'rings', 'snail', 'glove']);
export const ERRAND_SALT = 0x5e1f93;
export const SHELL_SALT = 0x3a7c21;
export const GLOVE_SALT = 0x71d4b9;
export const ERRAND_KEY = 'reef-errand'; // the discovery log's once-a-walk key
export const ALBUM_SIZE = 12;
export const ERRAND_ICON = Object.freeze({ glass: '🔷', school: '🐟', shell: '🐚', rings: '🫧', snail: '🐌', glove: '🧤' });

// The twelve postcards, in the order they are earned: a picture each and a colour.
export const ALBUM = Object.freeze([
  ['🐚', '#e9b7c4'], ['🦀', '#e0705a'], ['🐠', '#f5a742'], ['🐢', '#5fae78'], ['🪼', '#b6a3e8'], ['🐙', '#c9607a'],
  ['🪸', '#ff8f7a'], ['🐡', '#e8d36b'], ['🦞', '#d9533f'], ['🐬', '#6fa8d8'], ['⭐', '#f5c542'], ['🌊', '#4aa6a8'],
].map((p) => Object.freeze(p)));

function hash01(x, z, salt) {
  const h = Math.sin(x * 12.9898 + z * 78.233 + salt * 37.719) * 43758.5453;
  return h - Math.floor(h);
}
const keyOf = (roomSeed, visits) => {
  const solo = roomSeed === undefined || roomSeed === null;
  const a = solo ? Number(visits) || 0 : Number(roomSeed) % 9973;
  const b = solo ? 5 : (Number(roomSeed) >>> 4) % 7919;
  return [Number.isFinite(a) ? a : 0, Number.isFinite(b) ? b : 5];
};
const pickOf = (a, b, salt, n) => {
  const i = Math.floor(hash01(a, b, salt) * n);
  return Number.isFinite(i) ? Math.min(n - 1, Math.max(0, i)) : 0;
};

// planReefErrand(roomSeed, visits) -> { kind, shell, glove }. Pure. `shell` is the index (0..4) of the shell that changed colour, `glove` the glove's spot (0..5).
export function planReefErrand(roomSeed, visits = 0) {
  const [a, b] = keyOf(roomSeed, visits);
  return { kind: ERRAND_KINDS[pickOf(a, b, ERRAND_SALT, ERRAND_KINDS.length)], shell: pickOf(a, b, SHELL_SALT, SHELL_IDS.length), glove: pickOf(a, b, GLOVE_SALT, GLOVE_SPOTS.length) };
}

// ---- the places (open sand, 2 m clear of every collider; test/reeferrand.test.js walks to each from the spawn) ----------------------------------
const pt = (x, z) => Object.freeze({ x, z });
export const GLASS_IDS = Object.freeze(['reef-6', 'reef-7', 'reef-8']); // the three pieces of sea-glass (reeffindsplan.js)
export const SHELL_IDS = Object.freeze(['reef-1', 'reef-2', 'reef-3', 'reef-4', 'reef-5']);
export const GLOVE_SPOTS = Object.freeze([pt(-9, 27), pt(14, 29), pt(32, 14), pt(-33, 3), pt(-2, -5), pt(37, -6)]);
export const HAT = Object.freeze({ x: 5, z: 17, reach: 1.8 }); // the small hat shell
export const SNAIL = Object.freeze({ x: -18, z: -3, reach: 2.4 }); // the sleepy snail
export const SCHOOL = Object.freeze({ start: pt(-6, 24), ring: Object.freeze({ x: -14, z: 7, r: 1.5, stalks: 8 }), wake: 4.5, lag: 9, speed: 2.2 });
export const RING_R = 1.3; // m: near enough (across) to a ring's middle
export const RING_TOL = 0.7; // m: and within this of its height
export const RINGS = Object.freeze([[4, 25, 1.8], [12, 22, 2.0], [20, 26, 1.8], [28, 29, 2.0], [34, 23, 1.8]].map(([x, z, y]) => Object.freeze({ x, z, y }))); // y over the seabed
export const MARLO_REACH = 3.2; // she hands it over from this far

// ---- the progress rules, each a pure step -------------------------------------------------------------------------------------------------
// How many of the glass pieces were taken this walk: the ids that were present at the start and are gone now.
export function taken(startIds, nowIds, ids) {
  const now = new Set(nowIds);
  let n = 0;
  for (const id of ids) if (startIds.has(id) && !now.has(id)) n++;
  return n;
}
// The school's way along its line (0 to 1): it swims on while she is within `wake` of it (and stays once started while she is within `lag`); never backwards, never a failure.
export function schoolStep(p, catDist, dt, started = p > 0) {
  const len = Math.hypot(SCHOOL.ring.x - SCHOOL.start.x, SCHOOL.ring.z - SCHOOL.start.z) || 1;
  if (!(dt > 0) || !(p >= 0) || p >= 1) return p >= 1 ? 1 : 0;
  const near = started ? catDist <= SCHOOL.lag : catDist <= SCHOOL.wake;
  return near ? Math.min(1, p + (SCHOOL.speed * Math.min(dt, 0.1)) / len) : p;
}
export const schoolAt = (p) => ({ x: SCHOOL.start.x + (SCHOOL.ring.x - SCHOOL.start.x) * p, z: SCHOOL.start.z + (SCHOOL.ring.z - SCHOOL.start.z) * p });
// The rings, in order: the next number after she is at (x, z) with float `lift` (height over the sand). Out of order or too low: no change.
export function ringStep(next, x, z, lift, rings = RINGS) {
  if (!(next >= 0 && next < rings.length)) return next;
  const r = rings[next];
  return Math.hypot(x - r.x, z - r.z) <= RING_R && Math.abs(lift - r.y) <= RING_TOL ? next + 1 : next;
}

// ---- the album ----------------------------------------------------------------------------------------------------------------------------
const bitsOf = (v) => (Number.isFinite(v) && v > 0 ? Math.floor(v) & 4095 : 0);
export function albumCount(bits) {
  let n = 0;
  for (let b = bitsOf(bits); b; b &= b - 1) n++;
  return n;
}
// The index of the postcard an errand pays now: the lowest bit not yet set, or -1 when the album is full.
export function nextPostcard(bits) {
  const b = bitsOf(bits);
  for (let i = 0; i < ALBUM_SIZE; i++) if (!(b & (1 << i))) return i;
  return -1;
}
export const withPostcard = (bits, i) => (i >= 0 && i < ALBUM_SIZE ? bitsOf(bits) | (1 << i) : bitsOf(bits));
