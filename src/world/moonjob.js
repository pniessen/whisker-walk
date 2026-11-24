// =============================================================================
// PIP'S POSTCARD OF THE DAY (milestone 9): the pure rules. No THREE, no clock, no random number, no save write. After the story
// is told, each walk Pip has one small errand, worth AWARDS.moonjob (25 paws) once a walk and one more postcard in the album of twelve.
// world/moonjoblive.js carries them out on a walk.
//
// THE SIX ERRANDS (spec 3.6):
//   pebbles  put three of the eight glowing pebbles (the walk's own collectibles, picked up as always) in Pip's sample tray
//   rounds   drive Dot past five lit track posts in order (no timer; either way round the loop is a longer way, never a failure)
//   guest    trace the day's guest star picture in the telescope (a pool of twelve simple pictures)
//   bound    a long jump at least BOUND_MARGIN_CM past her own best (Tier 2's name; the plain hop on the board's lane counts, so it never
//            needs the bound; it is picked only while world/moonswitch.js has the bound ON, and is swapped for the pebbles otherwise)
//   rocket   the second rocket: write a fresh postcard at the Message Desk, post it in the (rolled-out) rocket and press the big red button
//   glove    Earth lost a glove: it lies at one of six spots (the seed picks); carry it home to Pip
//
// WHICH ERRAND AND WHERE comes only from planMoonJob(roomSeed, visits): a room's seed when there is one (every cat in the room gets the same
// errand, the same guest picture and the same glove spot), else the count of Moon walks (a solo cat's day). The ALBUM is the journal page
// `mnjob` (src/moonpages.js: one count per errand paid): postcard n of twelve is shown once the page's count is above n. The page's count is
// merged by the save's per-key maximum (src/catmerge.js `journal`), so two devices never lose a postcard and need no new save field.
// =============================================================================

import { MOON_BOUND_ON } from './moonswitch.js';
import { TRACK } from './moonplan.js';

export const JOB_KINDS = Object.freeze(['pebbles', 'rounds', 'guest', 'bound', 'rocket', 'glove']);
export const JOB_SALT = 0x4d6a0b;
export const GUEST_SALT = 0x2f91c5;
export const GLOVE_SALT = 0x6b13e7;
export const PEBBLES_NEEDED = 3;
export const BOUND_MARGIN_CM = 10; // a hop this much longer than her own best counts
export const ALBUM_SIZE = 12;
export const JOB_KEY = 'moon-job'; // the discovery log's once-a-walk key

// The emoji and the panel colour of each errand, shown on the Mission Board and in Pip's picture bubble.
export const JOB_ICON = Object.freeze({ pebbles: '💎', rounds: '🚙', guest: '🔭', bound: '🦘', rocket: '🚀', glove: '🧤' });

// The twelve postcards of the album, in the order they are earned: a picture each (emoji, as the board's others) and a colour.
export const ALBUM = Object.freeze([
  ['🌍', '#5b8def'], ['🌙', '#c9c4d8'], ['🚀', '#e0607a'], ['⭐', '#f3d36b'], ['🐾', '#3fb58f'], ['💖', '#ff8fb1'],
  ['🪐', '#c78bf0'], ['☄️', '#f0a43a'], ['🌈', '#5ed1e0'], ['🧤', '#e6b27a'], ['🐟', '#2fb8c8'], ['👑', '#f5c542'],
].map((p) => Object.freeze(p)));

// hash01 as world/builder.js has it (a copy: this file must stay free of THREE)
function hash01(x, z, salt) {
  const h = Math.sin(x * 12.9898 + z * 78.233 + salt * 37.719) * 43758.5453;
  return h - Math.floor(h);
}
// the two numbers a seed or a visit count reduces to (a solo cat's day is her walk count; a room's is its seed)
function keyOf(roomSeed, visits) {
  const solo = roomSeed === undefined || roomSeed === null;
  const a = solo ? Number(visits) || 0 : Number(roomSeed) % 9973;
  const b = solo ? 3 : (Number(roomSeed) >>> 4) % 7919;
  return [Number.isFinite(a) ? a : 0, Number.isFinite(b) ? b : 3];
}
const pickOf = (a, b, salt, n) => {
  const i = Math.floor(hash01(a, b, salt) * n);
  return Number.isFinite(i) ? Math.min(n - 1, Math.max(0, i)) : 0;
};

// planMoonJob(roomSeed, visits, { bound }) -> { kind, guest, glove }. Pure: the same seed (or, solo, the same count) always answers the same. `guest` is the
// index of the day's guest picture (0..11), `glove` the index of the glove's spot (0..5); both are always answered (only the kind's own is used).
export function planMoonJob(roomSeed, visits = 0, { bound = MOON_BOUND_ON } = {}) {
  const [a, b] = keyOf(roomSeed, visits);
  let kind = JOB_KINDS[pickOf(a, b, JOB_SALT, JOB_KINDS.length)];
  if (kind === 'bound' && !bound) kind = 'pebbles'; // the bound is not built: the errand is swapped for the first
  return { kind, guest: pickOf(a, b, GUEST_SALT, GUEST_POOL.length), glove: pickOf(a, b, GLOVE_SALT, GLOVE_SPOTS.length) };
}

// ---- the guest star pictures: twelve simple chains of 4 or 5 stars --------------------------------------------------------------------------
// Each is drawn on the sky where no one of the five stands (bearing 205 to 215, elevation 36 to 44: the Crown is 160 / 52 and the Paw 262 / 36, more than 40 degrees
// away), offsets in degrees as moonstars.js's pictures. Pinned in the order listed. `id` names a line of words (moon.guest.<id>).
const g = (id, pts) => Object.freeze({ id, bearing: 210, elev: 40, pts: Object.freeze(pts.map((p) => Object.freeze(p))) });
export const GUEST_POOL = Object.freeze([
  g('star', [[0, 6], [-4, -5], [5, 1], [-5, 1], [4, -5]]),
  g('boat', [[-7, 1], [7, 1], [4, -3], [-4, -3], [0, 1], [0, 7]]),
  g('house', [[-5, -4], [-5, 2], [0, 6], [5, 2], [5, -4]]),
  g('tree', [[0, -5], [0, 1], [-5, 1], [0, 7], [5, 1]]),
  g('heart', [[0, -5], [-6, 1], [-3, 5], [0, 2], [3, 5], [6, 1]]),
  g('kite', [[0, 6], [-4, 1], [0, -4], [4, 1], [0, -8]]),
  g('moon', [[3, 6], [-2, 4], [-4, 0], [-2, -4], [3, -6]]),
  g('bell', [[-5, -4], [-4, 1], [0, 6], [4, 1], [5, -4]]),
  g('flower', [[0, 0], [0, 5], [5, 1], [3, -5], [-3, -5], [-5, 1]]),
  g('rocket', [[0, 7], [-3, 1], [-3, -5], [3, -5], [3, 1]]),
  g('key', [[-6, 0], [-2, 0], [2, 0], [6, 0], [6, -4]]),
  g('cup', [[-5, 5], [-3, -3], [3, -3], [5, 5], [7, 1]]),
]);

// ---- the lost glove's six spots (on open dust: none within 3 m of a collider, a pebble, a golden mouse, a find spot, a job point or the track) -------------
export const GLOVE_SPOTS = Object.freeze([[-21, 14], [14, 33], [30, -1], [-38, -16], [-10, -20], [22, -32]].map(([x, z]) => Object.freeze({ x, z })));
// Pip's sample tray: a low stone table outside the airlock's front, on the dust
export const SAMPLE_TRAY = Object.freeze({ x: -18.5, z: 22.5, reach: 2.4 });
// Dot's rounds: the five lit track posts to drive past, in order (the loop's waypoints 1, 3, 5, 7 and 0: a lap that ends at the depot)
export const ROUND_POSTS = Object.freeze([1, 3, 5, 7, 0].map((i) => Object.freeze({ x: TRACK[i].x, z: TRACK[i].z })));
export const ROUND_R = 4.5; // m: near enough to a post that Dot "passes" it

// ---- the album ----------------------------------------------------------------------------------------------------------------------------
// How many of the twelve are earned, from the journal page's count.
export const albumCount = (journalCount) => (Number.isFinite(journalCount) && journalCount > 0 ? Math.min(ALBUM_SIZE, Math.floor(journalCount)) : 0);
// The postcard a job paid now earns: the one at index `count` (the count before it was recorded), the last when the album is full.
export const postcardFor = (count) => ALBUM[Math.min(ALBUM_SIZE - 1, Math.max(0, Math.floor(Number(count) || 0)))];
// The merge of two devices' album counts (the save's journal merge is the same per-key maximum).
export const mergeAlbum = (a, b) => Math.max(albumCount(a), albumCount(b));

// ---- the progress rules, each a pure step -------------------------------------------------------------------------------------------------
// Pebbles collected this walk: the ids among `all` that were present at the start and are gone now.
export function pebblesTaken(startIds, nowIds) {
  const now = new Set(nowIds);
  let n = 0;
  for (const id of startIds) if (!now.has(id)) n++;
  return n;
}
// Dot's rounds: the next post she must pass is `next` (0..5); at her place (x, z) she passes it when within ROUND_R. Answers the new `next`.
export function roundsStep(next, x, z, posts = ROUND_POSTS, r = ROUND_R) {
  if (!(next >= 0 && next < posts.length)) return next;
  return Math.hypot(x - posts[next].x, z - posts[next].z) <= r ? next + 1 : next;
}
// The bound: does a hop of `cm` beat her best `best` by the margin.
export const beatsBest = (cm, best) => Number.isFinite(cm) && cm >= Math.max(0, Number(best) || 0) + BOUND_MARGIN_CM;

// The room's credit: a partner's finished errand, valid only for today's own kind.
export const validJobCredit = (ev, plan) => !!ev && typeof ev === 'object' && ev.kind === 'job' && typeof ev.job === 'string' && ev.job === plan?.kind;
