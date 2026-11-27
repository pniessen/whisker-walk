// =============================================================================
// THE ERRAND OF TINK OF THE DAY: THE PURE RULES (second story, C1; live in C6). No THREE, no clock, no random number, no save write. After the story (deep bit 3), each walk Tink has one small errand
// worth AWARDS.deepjob (25 paws) once a walk, and one more chime charm in the album of twelve (state.crystal.chimes, 12 bits, ORed on merge). Modelled on snowvillejob.js and crystalerrand.js.
//
// THE FOUR ERRANDS:
//   tune    copy a three-note phrase on the chime bars of the Deep (a wrong bar just starts the phrase over; no fail sound)
//   prisms  set the three prisms to the faces of the day (the glow of Tink shows them)
//   moss    carry a soft moss pad from one of six spots to the nest of Tink
//   hide    Tink hides at one of six nooks; a ring of glints shows it; no timer
//
// WHICH ERRAND AND WHERE comes only from planDeepErrand(roomSeed, visits): the seed of a room when there is one (every cat in the room gets the same errand and spot), else the count of cave walks.
// Nothing is saved except what it pays. Every spot is open floor reachable on foot, no hop. North is -z.
// =============================================================================
import { TARGET, START, FACES } from './crystaldeepprism.js';

export const ERRAND_KINDS = Object.freeze(['tune', 'prisms', 'moss', 'hide']);
export const ERRAND_SALT = 0x4d17a3;
export const SPOT_SALT = 0x2e86b5;
export const TUNE_SALT = 0x6a05c9;
export const FACE_SALT = 0x1f93e7;
export const ERRAND_KEY = 'deep-errand'; // the discovery log"s once-a-walk key
export const ALBUM_SIZE = 12;
export const ERRAND_ICON = Object.freeze({ tune: '🎶', prisms: '🔷', moss: '🌿', hide: '🦇' });
export const JOB_WIRE = Object.freeze({ kind: 'wd-errand' });
export const isJobEvent = (ev) => !!ev && typeof ev === 'object' && ev.kind === 'wd-errand';

// The twelve chime charms, in the order they are earned: a picture each and a colour.
export const ALBUM = Object.freeze([
  ['🔔', '#ffd060'], ['🎐', '#9fd8ff'], ['💎', '#ff8fb8'], ['🦇', '#b9a0e8'], ['🌿', '#8fd49a'], ['🔷', '#6fb8ff'],
  ['🎶', '#f5a742'], ['⭐', '#ffe27a'], ['🌙', '#c9c3f0'], ['💧', '#7fe0ff'], ['🕯️', '#ffd9a8'], ['🌈', '#ffa8f0'],
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

export const BARS = 5; // the chime bars of the Deep
export const TUNE_LEN = 3;
export const PRISM_COUNT = 3;

// planDeepErrand(roomSeed, visits) -> { kind, spot, tune, faces }. Pure. `spot` (0..5) is the place of the moss pad and Tink"s hiding nook; `tune` is three bars (no bar twice in a row); `faces` the day"s prism faces
// (never the way the stands begin, so there is always something to turn).
export function planDeepErrand(roomSeed, visits = 0) {
  const [a, b] = keyOf(roomSeed, visits);
  const tune = [];
  for (let n = 0; n < TUNE_LEN; n++) {
    let bar = pickOf(a + n, b, TUNE_SALT, BARS);
    if (n > 0 && bar === tune[n - 1]) bar = (bar + 1) % BARS;
    tune.push(bar);
  }
  const faces = [0, 1, 2].map((i) => pickOf(a + i, b, FACE_SALT, FACES));
  if (faces.every((v, i) => v === START[i])) faces[0] = (faces[0] + 1) % FACES;
  return { kind: ERRAND_KINDS[pickOf(a, b, ERRAND_SALT, ERRAND_KINDS.length)], spot: pickOf(a, b, SPOT_SALT, SPOTS.length), tune, faces };
}
export const FIRST_FACES = TARGET; // the story"s own prism pattern; an errand day may differ

// ---- the places (open floor in the surroundings of the singing chamber and the passage; test/crystaldeeperrand.test.js walks to each from the spawn) ------------------------
const pt = (x, z) => Object.freeze({ x, z });
export const SPOTS = Object.freeze([pt(-21, -21), pt(-17, -14), pt(-32, -12), pt(-33, -19), pt(-20, -6), pt(-23, -9)]); // the moss pad"s six places, and Tink"s six nooks
export const HIDE_REACH = 2.2; // she finds him from this far
export const MOSS_REACH = 1.8; // she picks the pad up from this far
export const NEST_REACH = 2.6; // and sets it at the nest from this far (the nest is crystaldeeptink.js NEST)

// ---- the progress rules, each a pure step -------------------------------------------------------------------------------------------------------------------------
/** Echo the day's phrase on the bars: `got` bars right so far. A right bar moves on; a wrong one starts the phrase over (no fail). Returns { got, event: 'ok' | 'restart' | 'done' }. */
export function tuneStep(tune, got, bar) {
  const g = Number.isInteger(got) && got >= 0 && got < tune.length ? got : 0;
  if (bar === tune[g]) return g + 1 === tune.length ? { got: g + 1, event: 'done' } : { got: g + 1, event: 'ok' };
  return { got: bar === tune[0] ? 1 : 0, event: 'restart' };
}
/** The moss pad may be picked up when the errand is moss, her mouth is empty and she is within reach. */
export const canPickMoss = (carrying, dist) => carrying === null && dist <= MOSS_REACH;

// ---- the album ---------------------------------------------------------------------------------------------------------------------------------------------------
const bitsOf = (v) => (Number.isFinite(v) && v > 0 ? Math.floor(v) & 4095 : 0);
export function albumCount(bits) {
  let n = 0;
  for (let b = bitsOf(bits); b; b &= b - 1) n++;
  return n;
}
// The index of the charm an errand pays now: the lowest bit not yet set, or -1 when the album is full.
export function nextChime(bits) {
  const b = bitsOf(bits);
  for (let i = 0; i < ALBUM_SIZE; i++) if (!(b & (1 << i))) return i;
  return -1;
}
export const withChime = (bits, i) => (i >= 0 && i < ALBUM_SIZE ? bitsOf(bits) | (1 << i) : bitsOf(bits));
