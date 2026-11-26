// =============================================================================
// LUMI'S GLOW ERRAND OF THE DAY: THE PURE RULES (milestone C7, Replay). No THREE, no clock, no random number, no save write. After the story (step 7: the Heart's show), each walk
// Lumi has one small errand worth AWARDS.cavejob (25 paws) once a walk, and one more crystal rubbing in the album of twelve. world/crystalerrandlive.js carries it out on a walk.
// Modelled on world/reeferrand.js (the Reef's Marlo).
//
// THE SIX ERRANDS:
//   glints   bring Lumi the three glints (crystal bits the walk's own collectibles show: picked up as always), then Interact beside her
//   relight  one crystal cluster has gone dim (the seed picks where): stand by it and Interact to wake it
//   follow   follow a little spark through a ring of small crystals (it moves on only while she is near; no clock)
//   change   one of the six floor finds has changed colour (the day's pick): pick it up
//   bug      carry a small smooth stone to a sleepy glow-bug
//   glove    a dropped glove lies at one of six spots (the seed picks): carry it to Lumi
//
// WHICH ERRAND AND WHERE comes only from planCaveErrand(roomSeed, visits): a room's seed when there is one (every cat in the room gets the same errand, the same dim cluster, the
// same crystal bit and the same glove spot; nothing is sent to a partner and nothing about it is saved), else the count of cave walks (a solo cat's day). The ALBUM is the twelve
// bits of state.crystal.album (src/progression.js sanitises them to 4095 and src/catmerge.js unions them): the rubbing an errand pays is the lowest bit not yet set. Every spot is on
// open floor reachable on foot with no skill, 2.5 m clear of every collider and 3 m clear of the finds, the mice and the spark stones. North is -z.
// =============================================================================

export const ERRAND_KINDS = Object.freeze(['glints', 'relight', 'follow', 'change', 'bug', 'glove']);
export const ERRAND_SALT = 0x2c9d47;
export const CHANGE_SALT = 0x6b13e5;
export const SPOT_SALT = 0x4f8a0d;
export const ERRAND_KEY = 'cave-errand'; // the discovery log's once-a-walk key
export const ALBUM_SIZE = 12;
export const ERRAND_ICON = Object.freeze({ glints: '✨', relight: '💎', follow: '🌟', change: '🔮', bug: '🐛', glove: '🧤' });

// The twelve rubbings, in the order they are earned: a picture each and a colour.
export const ALBUM = Object.freeze([
  ['🌹', '#ff6fa8'], ['💎', '#62b8ff'], ['🌟', '#ffc65a'], ['💖', '#ffa8f0'], ['🔔', '#c9a3e8'], ['💧', '#6fd0e8'],
  ['🌈', '#f5a742'], ['🔮', '#a58be0'], ['🐛', '#9ae08a'], ['🪨', '#b8a8b8'], ['⭐', '#f5c542'], ['🕯️', '#ffd9a8'],
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

// planCaveErrand(roomSeed, visits) -> { kind, change, spot }. Pure. `change` is the index (0..5) of the floor find that changed colour, `spot` the glove's and the dim cluster's place (0..5).
export function planCaveErrand(roomSeed, visits = 0) {
  const [a, b] = keyOf(roomSeed, visits);
  return { kind: ERRAND_KINDS[pickOf(a, b, ERRAND_SALT, ERRAND_KINDS.length)], change: pickOf(a, b, CHANGE_SALT, CHANGE_IDS.length), spot: pickOf(a, b, SPOT_SALT, SPOTS.length) };
}

// ---- the places (open floor; test/crystalerrand.test.js walks to each from the spawn) ---------------------------------------------------------------
const pt = (x, z) => Object.freeze({ x, z });
export const GLINT_IDS = Object.freeze(['cave-1', 'cave-3', 'cave-4']); // the three crystal bits (crystalfindsplan.js)
export const CHANGE_IDS = Object.freeze(['cave-1', 'cave-2', 'cave-3', 'cave-4', 'cave-5', 'cave-6']);
export const SPOTS = Object.freeze([pt(-24, 24), pt(14, 24), pt(28, 10), pt(-30, -14), pt(8, -22), pt(30, -18)]); // the glove's six places, and the dim cluster's
export const STONE = Object.freeze({ x: -10, z: 16, reach: 1.8 }); // the small smooth stone
export const BUG = Object.freeze({ x: 18, z: 22, reach: 2.4 }); // the sleepy glow-bug
export const SPARK = Object.freeze({ start: pt(2, 12), ring: Object.freeze({ x: 2, z: -8, r: 1.5, stalks: 8 }), wake: 4.5, lag: 9, speed: 2.2 });
export const LUMI_REACH = 3.2; // she takes it from this far
export const CLUSTER_REACH = 2.2; // the dim cluster wakes from this far

// ---- the progress rules, each a pure step ---------------------------------------------------------------------------------------------------------
// How many of the ids were taken this walk: present at the start and gone now.
export function taken(startIds, nowIds, ids) {
  const now = new Set(nowIds);
  let n = 0;
  for (const id of ids) if (startIds.has(id) && !now.has(id)) n++;
  return n;
}
// The spark's way along its line (0 to 1): it moves on while she is within `wake` of it (and keeps on once started while she is within `lag`); never backwards, never a failure.
export function sparkStep(p, catDist, dt, started = p > 0) {
  const len = Math.hypot(SPARK.ring.x - SPARK.start.x, SPARK.ring.z - SPARK.start.z) || 1;
  if (!(dt > 0) || !(p >= 0) || p >= 1) return p >= 1 ? 1 : 0;
  const near = started ? catDist <= SPARK.lag : catDist <= SPARK.wake;
  return near ? Math.min(1, p + (SPARK.speed * Math.min(dt, 0.1)) / len) : p;
}
export const sparkAt = (p) => ({ x: SPARK.start.x + (SPARK.ring.x - SPARK.start.x) * p, z: SPARK.start.z + (SPARK.ring.z - SPARK.start.z) * p });

// ---- the album ------------------------------------------------------------------------------------------------------------------------------------
const bitsOf = (v) => (Number.isFinite(v) && v > 0 ? Math.floor(v) & 4095 : 0);
export function albumCount(bits) {
  let n = 0;
  for (let b = bitsOf(bits); b; b &= b - 1) n++;
  return n;
}
// The index of the rubbing an errand pays now: the lowest bit not yet set, or -1 when the album is full.
export function nextRubbing(bits) {
  const b = bitsOf(bits);
  for (let i = 0; i < ALBUM_SIZE; i++) if (!(b & (1 << i))) return i;
  return -1;
}
export const withRubbing = (bits, i) => (i >= 0 && i < ALBUM_SIZE ? bitsOf(bits) | (1 << i) : bitsOf(bits));
