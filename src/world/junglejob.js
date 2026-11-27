// =============================================================================
// MOSSY'S ERRAND OF THE DAY: THE PURE RULES (milestone J7, Replay). No THREE, no clock, no random number, no save write. After the story (step 7: the Rain Supper), each walk Mossy has
// one small errand worth AWARDS.junglejob (25 paws) once a walk, and one more leaf pressing in the album of twelve. world/junglejoblive.js carries it out on a walk. Modelled on
// world/treehousejob.js. Stage chunk code (junglestageb.js); start-up never imports it. No raft and no ride: the leaf boat is carried and set on the water, nothing more.
//
// THE SIX ERRANDS:
//   umbrella   carry a leaf umbrella from the ferns by the lodge to the sleepy sloth
//   frog       find the rainbow frog: it sits at one of six places (the seed picks): Interact beside it
//   boat       carry a leaf boat from the bank to the river and set it afloat
//   vines      give the three hanging vines a shake (any order)
//   rain       carry a cup of rainwater from the giant leaf to the veranda
//   slipper    find the missing slipper: it lies at one of six places (the seed picks): Interact beside it
//
// WHICH ERRAND AND WHERE comes only from planJungleErrand(roomSeed, visits): a room's seed when there is one, else the count of Jungle walks. Nothing about it is saved except what it
// pays: the album (the twelve bits of state.jungle.album: src/progression.js sanitises them to 4095 and src/catmerge.js ORs them). North is -z; every place is reachable on foot.
// =============================================================================

export const ERRAND_KINDS = Object.freeze(['umbrella', 'frog', 'boat', 'vines', 'rain', 'slipper']);
export const ERRAND_SALT = 0x4a1d83;
export const SPOT_SALT = 0x35c7e1;
export const ERRAND_KEY = 'jungle-errand'; // the discovery log's once-a-walk key
export const ALBUM_SIZE = 12;

// The twelve leaf pressings, in the order they are earned: a picture each and a colour.
export const ALBUM = Object.freeze([
  ['🍃', '#7cbc54'], ['🌿', '#5aa84a'], ['🍂', '#c9803a'], ['🌴', '#3f8f4a'], ['🍀', '#4fae5a'], ['🌱', '#9acd5a'],
  ['🍁', '#c0553a'], ['🌺', '#d86a8a'], ['🌾', '#c9b45a'], ['🪴', '#6a9a5a'], ['☘️', '#58b868'], ['🌳', '#2f7a3a'],
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

// planJungleErrand(roomSeed, visits) -> { kind, spot }. Pure. `spot` (0..5) is where the frog or the slipper is.
export function planJungleErrand(roomSeed, visits = 0) {
  const [a, b] = keyOf(roomSeed, visits);
  return { kind: ERRAND_KINDS[pickOf(a, b, ERRAND_SALT, ERRAND_KINDS.length)], spot: pickOf(a, b, SPOT_SALT, 6) };
}

// ---- the places (test/junglejob.test.js walks to each from the spawn) ----------------------------------------------------------------------------
const pt = (x, z, y = 0, extra = {}) => Object.freeze({ x, z, y, ...extra });
export const FROG_SPOTS = Object.freeze([pt(-22, -3), pt(-38.5, 6), pt(22, -1), pt(4, -17), pt(40, -2), pt(-14, -28)]); // the rainbow frog's six places
export const SLIPPER_SPOTS = Object.freeze([pt(-20, 28), pt(22, 22), pt(36, 28), pt(-38, 18), pt(12, 10), pt(-30, 30)]); // the slipper's six places
export const SEEK_REACH = 1.8;
export const VINES = Object.freeze([pt(-12, -20, 0, { reach: 1.8 }), pt(2, -22, 0, { reach: 1.8 }), pt(20, 16, 0, { reach: 1.8 })]); // the three hanging vines
// The three carries: where the thing lies, and where it goes.
export const CARRIES = Object.freeze({
  umbrella: Object.freeze({ home: pt(-19, 18, 0, { reach: 1.8 }), dest: pt(-31.6, -13.6, 0, { reach: 2.4 }) }), // the ferns by the lodge; the sloth's tree
  boat: Object.freeze({ home: pt(-2, 0.5, 0, { reach: 1.8 }), dest: pt(3, -6.4, 0, { reach: 2.8 }) }), // the bank; the river
  rain: Object.freeze({ home: pt(16, 0.8, 0, { reach: 1.8 }), dest: pt(-8.2, 17, 0.55, { reach: 2.4, minY: 0.25 }) }), // under the giant leaf; the veranda
});
export const ALL_SPOTS = Object.freeze([...FROG_SPOTS, ...SLIPPER_SPOTS, ...VINES, ...Object.values(CARRIES).flatMap((c) => [c.home, c.dest])]);

// ---- the progress rules, each a pure step ------------------------------------------------------------------------------------------------------
// The vine she shakes now: the first not-yet-shaken vine within reach (a bit mask of three). Returns the new mask (unchanged when none is in reach or it was shaken).
export function vineStep(mask, p) {
  const m = Number.isFinite(mask) ? Math.floor(mask) & 7 : 0;
  if (!p) return m;
  for (let i = 0; i < VINES.length; i++) {
    if (!(m & (1 << i)) && Math.hypot(p.x - VINES[i].x, p.z - VINES[i].z) <= VINES[i].reach) return m | (1 << i);
  }
  return m;
}
export const vineCount = (mask) => ((mask & 1) + ((mask >> 1) & 1) + ((mask >> 2) & 1));

// ---- the album --------------------------------------------------------------------------------------------------------------------------------
const bitsOf = (v) => (Number.isFinite(v) && v > 0 ? Math.floor(v) & 4095 : 0);
export function albumCount(bits) {
  let n = 0;
  for (let b = bitsOf(bits); b; b &= b - 1) n++;
  return n;
}
// The index of the pressing an errand pays now: the lowest bit not yet set, or -1 when the album is full.
export function nextPressing(bits) {
  const b = bitsOf(bits);
  for (let i = 0; i < ALBUM_SIZE; i++) if (!(b & (1 << i))) return i;
  return -1;
}
export const withPressing = (bits, i) => (i >= 0 && i < ALBUM_SIZE ? bitsOf(bits) | (1 << i) : bitsOf(bits));

// The wire form (`jl-` events only): an errand done by anyone in the room is done for everyone in it (each device pays its own save).
export const JOB_WIRE = Object.freeze({ kind: 'jl-job' });
export const isJobEvent = (ev) => !!ev && typeof ev === 'object' && ev.kind === 'jl-job';
