// =============================================================================
// NUTMEG'S POST ROUND OF THE DAY: THE PURE RULES (milestone T7, Replay). No THREE, no clock, no random number, no save write. After the story (step 7: the firefly supper), each walk
// Nutmeg has one small errand worth AWARDS.treejob (25 paws) once a walk, and one more stamp in the album of twelve. world/treehousejoblive.js carries it out on a walk. Modelled on
// world/snowvillejob.js. Stage chunk code (treehousestagebranches.js); start-up never imports it.
//
// THE FIVE ERRANDS (the plan's ring-the-bell one is not here: the bell is the wing's own prompt on the Crown deck; no basket lift and no ride is in this milestone):
//   parcel     carry a parcel from the post box at the roots up to the Bell Tower's door
//   stamp      find the hidden stamp: it lies at one of six places on the roots (the seed picks): Interact beside it
//   lanterns   hop through five lanterns in order (the next one glows), bottom to top, all on the planned hops
//   postcard   carry a postcard from the Bookshop deck up to the sleepy owl
//   acorns     bring three of the walk's own acorns (picked up as always) to the Bakery's window
//
// WHICH ERRAND AND WHERE comes only from planTreeErrand(roomSeed, visits): a room's seed when there is one, else the count of Treehouse walks. Nothing about it is saved except what it pays:
// the album (the twelve bits of state.treehouse.album: src/progression.js sanitises them to 4095 and src/catmerge.js ORs them). North is -z; every place is reachable on foot or by hops of at most 1.4 m.
// =============================================================================

export const ERRAND_KINDS = Object.freeze(['parcel', 'stamp', 'lanterns', 'postcard', 'acorns']);
export const ERRAND_SALT = 0x2c9e47;
export const SPOT_SALT = 0x61b3d9;
export const ERRAND_KEY = 'treehouse-errand'; // the discovery log's once-a-walk key
export const ALBUM_SIZE = 12;

// The twelve stamps, in the order they are earned: a picture each and a colour.
export const ALBUM = Object.freeze([
  ['🌰', '#b98a5a'], ['🍂', '#c9803a'], ['🍃', '#7cbc54'], ['🦉', '#8a6a4a'], ['🔔', '#d9b44a'], ['🌉', '#c9a86a'],
  ['🥐', '#e8c27a'], ['📚', '#9a5a3a'], ['🐦', '#6d8fb8'], ['✨', '#f4f0a0'], ['🔭', '#8fc6e8'], ['🌳', '#4f9a48'],
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

// planTreeErrand(roomSeed, visits) -> { kind, spot }. Pure. `spot` (0..5) is where the stamp lies.
export function planTreeErrand(roomSeed, visits = 0) {
  const [a, b] = keyOf(roomSeed, visits);
  return { kind: ERRAND_KINDS[pickOf(a, b, ERRAND_SALT, ERRAND_KINDS.length)], spot: pickOf(a, b, SPOT_SALT, SPOTS.length) };
}

// ---- the places (test/treehousejob.test.js walks to each from the spawn) ------------------------------------------------------------------------
const pt = (x, z, y = 0, extra = {}) => Object.freeze({ x, z, y, ...extra });
// The four acorns among the six collectibles (treehousefindsplan.js; the test holds the two lists equal). Three of them are asked for.
export const ACORN_IDS = Object.freeze(['tree-1', 'tree-2', 'tree-4', 'tree-6']);
export const ACORNS_NEEDED = 3;
export const SPOTS = Object.freeze([pt(-18, 14), pt(18, 12), pt(-22, -14), pt(14, -24), pt(-6, 28), pt(24, 22)]); // the stamp's six places on the roots
export const PARCEL = pt(3, 21, 0, { reach: 1.8 }); // by the post box
export const BELL_DOOR = pt(-2, -15.2, 5.6, { reach: 1.7, minY: 5.0 }); // the Bell Tower's door, on the Crown deck
export const POSTCARD = pt(8.2, -0.8, 2.8, { reach: 1.6, minY: 2.2 }); // on the Bookshop deck
export const OWL_PERCH = pt(1.4, -14.2, 5.6, { reach: 1.7, minY: 5.0 }); // under the owl's ledge
export const BAKERY = pt(-8.2, 10.4, 1.4, { reach: 2.0, minY: 0.9 }); // the Bakery deck by the warm window
export const STAMP_REACH = 1.8;
// The five lanterns, in order: each stands on a perch of the plan (a2, w2, w5, b2, f2), one hop from the one before.
export const LANTERNS = Object.freeze([pt(-6.4, 9.2, 1.4), pt(-2.4, 6.8, 2.8), pt(3.15, 3.5, 2.8), pt(7.2, -1.1, 2.8), pt(6.2, -5.6, 4.2)].map((p) => Object.freeze({ ...p, reach: 1.1, dy: 0.9 })));
export const ALL_SPOTS = Object.freeze([...SPOTS, PARCEL, BELL_DOOR, POSTCARD, OWL_PERCH, BAKERY, ...LANTERNS]);

// ---- the progress rules, each a pure step ------------------------------------------------------------------------------------------------------
// How many of the ids are gone from the walk's collectibles (picked up, this walk or before it).
export function gone(nowIds, ids) {
  const now = new Set(nowIds);
  let n = 0;
  for (const id of ids) if (!now.has(id)) n++;
  return n;
}
// The lantern she touches now: `lit` lanterns are lit so far; standing at the next one (within reach, at its height) lights it. Never backwards, never a failure: another lantern touched out of
// order does nothing. Returns the new count.
export function lanternStep(lit, p) {
  const n = Number.isFinite(lit) ? Math.max(0, Math.min(LANTERNS.length, Math.floor(lit))) : 0;
  const L = LANTERNS[n];
  if (!L || !p) return n;
  const y = Number.isFinite(p.y) ? p.y : 0;
  return Math.hypot(p.x - L.x, p.z - L.z) <= L.reach && Math.abs(y - L.y) <= L.dy ? n + 1 : n;
}

// ---- the album --------------------------------------------------------------------------------------------------------------------------------
const bitsOf = (v) => (Number.isFinite(v) && v > 0 ? Math.floor(v) & 4095 : 0);
export function albumCount(bits) {
  let n = 0;
  for (let b = bitsOf(bits); b; b &= b - 1) n++;
  return n;
}
// The index of the stamp an errand pays now: the lowest bit not yet set, or -1 when the album is full.
export function nextStamp(bits) {
  const b = bitsOf(bits);
  for (let i = 0; i < ALBUM_SIZE; i++) if (!(b & (1 << i))) return i;
  return -1;
}
export const withStamp = (bits, i) => (i >= 0 && i < ALBUM_SIZE ? bitsOf(bits) | (1 << i) : bitsOf(bits));

// The wire form (`th-` events only): an errand done by anyone in the room is done for everyone in it (each device pays its own save).
export const JOB_WIRE = Object.freeze({ kind: 'th-job' });
export const isJobEvent = (ev) => !!ev && typeof ev === 'object' && ev.kind === 'th-job';
