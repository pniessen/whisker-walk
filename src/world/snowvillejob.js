// =============================================================================
// TILLY'S ERRAND OF THE DAY: THE PURE RULES (milestone V7, Replay). No THREE, no clock, no random number, no save write. After the story (step 7: Lantern Night), each walk Tilly has one
// small errand worth AWARDS.snowjob (25 paws) once a walk, and one more snow-globe postcard in the album of twelve. world/snowvillejoblive.js carries it out on a walk. Modelled on
// world/crystalerrand.js (the Cave's Lumi). Stage chunk code (snowvillestageb.js); start-up never imports it.
//
// THE FIVE ERRANDS (the plan's sixth, the sled run, waits for the rides: no ride is in this milestone):
//   cones    bring Tilly three pinecones (the walk's own pinecone collectibles, picked up as always), then Interact beside her
//   otter    follow the little ice-glint along the otter's slide to the pond bank (it moves on only while she is near; no clock)
//   button   the snowman has lost a button: it lies at one of six spots (the seed picks): carry it to the snowman
//   cup      carry a warm cup from the cocoa stall to the lamp robin
//   lights   carry the loose end of a string of lights to the lantern at the foot of the sled hill
//
// WHICH ERRAND AND WHERE comes only from planSnowErrand(roomSeed, visits): a room's seed when there is one (every cat in the room gets the same errand and the same button spot), else the
// count of Snowville walks (a solo cat's day). Nothing about it is saved except what it pays: the album (the twelve bits of state.snowville.album: src/progression.js sanitises them to
// 4095 and src/catmerge.js ORs them). Every spot is open snow reachable on foot with no skill. North is -z.
// =============================================================================

export const ERRAND_KINDS = Object.freeze(['cones', 'otter', 'button', 'cup', 'lights']);
export const ERRAND_SALT = 0x3b71d5;
export const SPOT_SALT = 0x5e2a91;
export const ERRAND_KEY = 'snowville-errand'; // the discovery log's once-a-walk key
export const ALBUM_SIZE = 12;
export const ERRAND_ICON = Object.freeze({ cones: '🌰', otter: '🦦', button: '⛄', cup: '☕', lights: '💡' });

// The twelve snow-globe postcards, in the order they are earned: a picture each and a colour.
export const ALBUM = Object.freeze([
  ['🏮', '#ffc65a'], ['⛄', '#cfe6ff'], ['🌲', '#4f8a5a'], ['⛸️', '#9ad0f0'], ['🐇', '#f4f1ee'], ['🔥', '#f08a3a'],
  ['🦦', '#a07a5a'], ['🐦', '#e2603a'], ['🛷', '#c0453f'], ['🎇', '#ffd9a8'], ['🕯️', '#fff1d2'], ['❄️', '#bfe0ff'],
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

// planSnowErrand(roomSeed, visits) -> { kind, spot }. Pure. `spot` (0..5) is the button's place.
export function planSnowErrand(roomSeed, visits = 0) {
  const [a, b] = keyOf(roomSeed, visits);
  return { kind: ERRAND_KINDS[pickOf(a, b, ERRAND_SALT, ERRAND_KINDS.length)], spot: pickOf(a, b, SPOT_SALT, SPOTS.length) };
}

// ---- the places (open snow; test/snowvillejob.test.js walks to each from the spawn) ---------------------------------------------------------------
const pt = (x, z) => Object.freeze({ x, z });
// The four pinecones among the six collectibles (snowvillefindsplan.js; the test holds the two lists equal). Three of them are asked for.
export const CONE_IDS = Object.freeze(['snow-1', 'snow-3', 'snow-4', 'snow-6']);
export const CONES_NEEDED = 3;
export const SPOTS = Object.freeze([pt(-30, 16), pt(30, 20), pt(13, -12), pt(-13, -17), pt(-33, -22), pt(33, -7)]); // the button's six places
export const SNOWMAN = Object.freeze({ x: 4, z: 18, reach: 2.6 });
export const CUP = Object.freeze({ x: 4.3, z: 7.5, reach: 1.8 }); // the cocoa stall's front step
export const ROBIN = Object.freeze({ x: -3.2, z: 25, reach: 4 }); // under the court's lamp posts, where the robin hops
export const STRING = Object.freeze({ x: 3.5, z: 1.5, reach: 1.8 }); // the loose end by the village hearth
export const HILL_LANTERN = Object.freeze({ x: 21, z: -7, reach: 3.4 });
export const GLINT = Object.freeze({ start: pt(-12, 3), ring: Object.freeze({ x: -16, z: -14, r: 1.4, stalks: 7 }), wake: 4.5, lag: 9, speed: 2.2 });
export const TILLY_REACH = 3.2; // she takes the cones from this far
export const ALL_SPOTS = Object.freeze([...SPOTS, SNOWMAN, CUP, ROBIN, STRING, HILL_LANTERN, GLINT.start, GLINT.ring]);

// ---- the progress rules, each a pure step ---------------------------------------------------------------------------------------------------------
// How many of the ids are gone from the walk's collectibles (picked up, this walk or before it: a walk picked up again keeps what was taken).
export function gone(nowIds, ids) {
  const now = new Set(nowIds);
  let n = 0;
  for (const id of ids) if (!now.has(id)) n++;
  return n;
}
// The glint's way along its line (0 to 1): it moves on while she is within `wake` of it (and keeps on once started while she is within `lag`); never backwards, never a failure.
export function glintStep(p, catDist, dt, started = p > 0) {
  const len = Math.hypot(GLINT.ring.x - GLINT.start.x, GLINT.ring.z - GLINT.start.z) || 1;
  if (!(dt > 0) || !(p >= 0) || p >= 1) return p >= 1 ? 1 : 0;
  const near = started ? catDist <= GLINT.lag : catDist <= GLINT.wake;
  return near ? Math.min(1, p + (GLINT.speed * Math.min(dt, 0.1)) / len) : p;
}
export const glintAt = (p) => ({ x: GLINT.start.x + (GLINT.ring.x - GLINT.start.x) * p, z: GLINT.start.z + (GLINT.ring.z - GLINT.start.z) * p });

// ---- the album ------------------------------------------------------------------------------------------------------------------------------------
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

// The wire form (`sv-` events only): an errand done by anyone in the room is done for everyone in it (each device pays its own save).
export const JOB_WIRE = Object.freeze({ kind: 'sv-job' });
export const isJobEvent = (ev) => !!ev && typeof ev === 'object' && ev.kind === 'sv-job';
