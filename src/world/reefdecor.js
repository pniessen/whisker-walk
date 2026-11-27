// =============================================================================
// THE REEF: THE SEABED'S DECOR PLAN. Pure data and pure functions (no THREE, no clock, no Math.random; every family has its own seeded stream and salt):
// where the seagrass beds, anemones, sea fans, small coral heads, sponge tubes, urchins and starfish, shells and sand dollars, pebbles, rock piles with
// algae, driftwood, small coral arches and sand ripples go, and the darker and paler patches of the sand itself. reefdecorparts.js draws it.
// Clumped on purpose: each family drops PATCHES where the habitat suits it (coral gardens fade into seagrass fields, which fade into bare sand) and fills
// them with a handful of items. The colour story is per zone (reefplan.js ZONES): Kelp Garden greens and golds, Coral Garden pinks, oranges and purples,
// Sandy Flats sparse with shells and pebbles, the Deep darker blue-green. Nothing here is solid: the things are non-solid or tiny (rock piles stand under
// 0.4 m), and every item keeps clear of the colliders, the finds, the story's places, the spawn court, the arch, the ladder, the air pockets, Marlo, the
// stage, the lanterns, the ledge and the cave mouths (decorAvoid below, which the test reads). Every patch is tagged `half` 0 or 1; the lower rungs draw
// only half 0 (about half of everything).
// =============================================================================

import { mulberry32 } from '../rng.js';
import { REEF_BOUNDS, ZONES, KEEP_OUT, ARCH, LADDER, REEF_POIS, reefColliders, scatterCoral, scatterKelp } from './reefplan.js';
import { WING_AVOID, scatterWing } from './reefwing.js';
import { LEDGE, SHELLS, POCKETS, MARLO, storyColliders } from './reefstory.js';
import { REEF_COLLECTIBLES, REEF_FIND_MARKS, REEF_GOLD, REEF_SCENICS } from './reeffindsplan.js';
import { BOAT, GLOW, ANCHOR } from './reefdeep.js';
import { GLOVE_SPOTS, HAT, SNAIL } from './reeferrand.js';
import { REEF_SPOTS } from '../foundwear/spots/reef.js';

// salts are distinct from every other stream of the Reef (0x6b656c70 kelp, 0x636f7261 coral, 0x70656262 pebbles, 0x73656167 life, 0x77696e67 wing, ...)
export const DECOR_SALT = Object.freeze({ arch: 0x5d0c1001, pile: 0x5d0c1002, wood: 0x5d0c1003, fan: 0x5d0c1004, head: 0x5d0c1005, sponge: 0x5d0c1006, anem: 0x5d0c1007, grass: 0x5d0c1008, star: 0x5d0c1009, urchin: 0x5d0c100a, shell: 0x5d0c100b, dollar: 0x5d0c100c, pebble: 0x5d0c100d, ripple: 0x5d0c100e, sand: 0x5d0c100f });

const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const pick = (list, rng) => list[Math.floor(rng() * list.length)];

// ---- where the habitats are -----------------------------------------------------------------------------------------------------------
const HAB_ZONES = ZONES.filter((z) => z.id !== 'ladder');
// How much of each zone a spot is in (0 at 1.5 radii out, 1 at the middle).
export const zoneWeights = (x, z) => Object.fromEntries(HAB_ZONES.map((k) => [k.id, smooth(1 - Math.hypot(x - k.x, z - k.z) / (k.r * 1.5))]));
// The colour story a spot belongs to: its zone, or 'open' (bare sand between).
export function zoneOf(x, z) {
  const w = zoneWeights(x, z);
  let best = 'open';
  let bw = 0.12;
  for (const id of Object.keys(w)) if (w[id] > bw) { bw = w[id]; best = id; }
  return best;
}
// What each family likes: [kelp, coral, flats, deep, open]
const LIKES = Object.freeze({
  arch: [0, 1, 0, 0, 0], pile: [0.5, 0.4, 0.5, 0.8, 0.3], wood: [0.3, 0.1, 0.8, 0.6, 0.3], fan: [0.2, 1, 0.1, 0.5, 0.05], head: [0.15, 1, 0.05, 0.3, 0.05],
  sponge: [0.3, 0.8, 0.1, 0.6, 0.05], anem: [0.5, 1, 0.15, 0.7, 0.1], grass: [1, 0.35, 0.3, 0.6, 0.25], star: [0.5, 0.8, 0.4, 0.6, 0.2],
  urchin: [0.4, 0.7, 0.2, 0.7, 0.1], shell: [0.2, 0.3, 1, 0.4, 0.6], dollar: [0.1, 0.1, 1, 0.3, 0.5], pebble: [0.3, 0.4, 1, 0.5, 0.6], ripple: [0.1, 0.1, 0.9, 0.5, 0.7],
});
const likes = (fam, x, z) => {
  const w = zoneWeights(x, z);
  const L = LIKES[fam];
  return Math.min(1, L[0] * w.kelp + L[1] * w.coral + L[2] * w.flats + L[3] * w.deep + L[4] * 0.2);
};

// ---- what to keep clear of -----------------------------------------------------------------------------------------------------------------
// [x, z, r]: an item of footprint f is clear when its distance to every circle is at least r + f. Each circle already holds its own margin.
let avoidList = null;
export function decorAvoid() {
  if (avoidList) return avoidList;
  const a = [];
  for (const [x, z, r] of KEEP_OUT) a.push([x, z, r + 0.4]); // the spawn court, the arch, the ladder, every zone's middle, the three mice
  for (const c of [...reefColliders(), ...storyColliders()]) a.push([c.x, c.z, c.r + 0.6]); // everything solid
  for (const k of scatterCoral()) a.push([k.x, k.z, k.s + 0.35]);
  for (const k of scatterWing()) a.push([k.x, k.z, k.s + 0.35]);
  for (const [x, z, r] of WING_AVOID) a.push([x, z, r + 0.3]); // the cave and its mouth, the lanterns, the stage, the ledge's neighbours, the pockets, the oyster
  a.push([LEDGE.x, LEDGE.z, 3.8]); // the ledge keeps its slab, boulders and shell visible
  for (const s of SHELLS) a.push([s.x, s.z, 1.8]);
  for (const k of REEF_COLLECTIBLES) a.push([k.x, k.z, 1.4]);
  for (const k of Object.values(REEF_FIND_MARKS)) a.push([k.x, k.z, 2]);
  for (const k of REEF_GOLD) a.push([k.x, k.z, 2]);
  for (const k of REEF_SCENICS) a.push([k.x, k.z, 1.2]);
  for (const k of POCKETS) a.push([k.x, k.z, 2.2]);
  for (const k of REEF_SPOTS) a.push([k.x, k.z, 1.6]);
  for (const k of GLOVE_SPOTS) a.push([k.x, k.z, 1.6]);
  a.push([HAT.x, HAT.z, 1.6], [SNAIL.x, SNAIL.z, 2], [MARLO.start.x, MARLO.start.z, 2.2], [ARCH.x, ARCH.z, 5], [LADDER.x, LADDER.z, 3.5]);
  for (const k of REEF_POIS) a.push([k.x, k.z, 0.9]);
  avoidList = a.map((c) => Object.freeze(c));
  return avoidList;
}
// The two places a circle is no good for: the boat's hull (and its open stern) and the Glow Cave's cleft with the rocks round it.
const AX = Math.cos(BOAT.yaw);
const AZ = Math.sin(BOAT.yaw);
export function inRestricted(x, z) {
  const u = (x - BOAT.x) * AX + (z - BOAT.z) * AZ;
  const v = -(x - BOAT.x) * AZ + (z - BOAT.z) * AX;
  if (Math.abs(u) < BOAT.length / 2 + 1.4 && Math.abs(v) < BOAT.half + 1) return true;
  if (Math.hypot(x - ANCHOR.x, z - ANCHOR.z) < 2.6) return true;
  if (x < GLOW.mouthX + 1.5 && z > GLOW.floorZ - 5.5 && z < GLOW.floorZ + 5.5) return true;
  return false;
}
export function decorClear(x, z, f = 0.2) {
  if (x < REEF_BOUNDS.minX + 2 || x > REEF_BOUNDS.maxX - 2 || z < REEF_BOUNDS.minZ + 2 || z > REEF_BOUNDS.maxZ - 2) return false;
  if (inRestricted(x, z)) return false;
  for (const [cx, cz, cr] of decorAvoid()) if (Math.hypot(x - cx, z - cz) < cr + f) return false;
  return true;
}

// ---- the palettes -------------------------------------------------------------------------------------------------------------------------------
// Seagrass and anemone tints are instance colours (they multiply the tuft's pale-to-white gradient); the rest are plain hex.
export const GRASS_TINT = Object.freeze({
  kelp: [[0.45, 0.85, 0.4], [0.7, 0.9, 0.35], [0.85, 0.75, 0.3], [0.35, 0.75, 0.5]],
  coral: [[0.55, 0.9, 0.55], [0.7, 0.95, 0.6], [0.5, 0.85, 0.6]],
  flats: [[0.75, 0.85, 0.5], [0.85, 0.85, 0.55], [0.6, 0.8, 0.5]],
  open: [[0.75, 0.85, 0.5], [0.6, 0.8, 0.5], [0.5, 0.85, 0.55]],
  deep: [[0.2, 0.55, 0.55], [0.25, 0.5, 0.6], [0.3, 0.6, 0.5], [0.2, 0.45, 0.5]],
});
export const ANEM_TINT = Object.freeze({
  coral: [[1, 0.45, 0.65], [1, 0.6, 0.3], [0.7, 0.4, 0.9], [0.95, 0.3, 0.7]],
  kelp: [[0.95, 0.75, 0.25], [0.6, 0.75, 0.3], [0.9, 0.55, 0.2]],
  flats: [[1, 0.7, 0.55], [0.95, 0.9, 0.7], [1, 0.6, 0.6]],
  open: [[1, 0.7, 0.55], [0.95, 0.9, 0.7]],
  deep: [[0.2, 0.7, 0.7], [0.45, 0.35, 0.8], [0.3, 0.5, 0.9]],
});
// [light, deep] pairs for fans, sponge tubes and coral heads, by zone
export const FAN_PAIRS = Object.freeze({
  coral: [[0xe8708a, 0xb84a66], [0xf08a4b, 0xc4622f], [0xa45fc4, 0x7c3f98], [0xe86aa8, 0xa8407a]],
  kelp: [[0xe8c34a, 0xa88a2a], [0x9ac24a, 0x5f8a30], [0xd9a03a, 0x9a6a22]],
  flats: [[0xe8a088, 0xb87060], [0xd8c0a0, 0xa8906f]],
  open: [[0xe8a088, 0xb87060], [0xd8c0a0, 0xa8906f]],
  deep: [[0x3f8f9a, 0x1f5a6a], [0x5a6fb0, 0x34457f], [0x4aa08a, 0x2a6a5a]],
});
export const SPONGE_PAIRS = Object.freeze({
  coral: [[0xf08a4b, 0x7a3a1a], [0xa45fc4, 0x4a2260], [0xe8708a, 0x6a2a3c]],
  kelp: [[0xd9a03a, 0x5a3e10], [0x9ac24a, 0x35521a], [0xe8c34a, 0x5a4a12]],
  flats: [[0xe8c9a0, 0x6a5a40], [0xd8a088, 0x5a3a2a]],
  open: [[0xe8c9a0, 0x6a5a40], [0xd8a088, 0x5a3a2a]],
  deep: [[0x4a7fb0, 0x14304a], [0x6a5fb0, 0x23204a], [0x3f9a8a, 0x103a34]],
});
export const STONE_TONES = Object.freeze({ kelp: [0x8da59a, 0x93a68a, 0xa0a496], coral: [0xa0a496, 0xb6c7c2, 0x93a1ad], flats: [0xb6c7c2, 0xd9c9a8, 0xa89a82], open: [0xb6c7c2, 0xa89a82, 0x93a1ad], deep: [0x5e7d86, 0x4f6f78, 0x6b8a8a] });
export const ALGAE = Object.freeze({ kelp: [0x4f9a4a, 0xa08a2a], coral: [0x6aa86a, 0xc47a5a], flats: [0x7aa860, 0x9a9a4a], open: [0x7aa860, 0x9a9a4a], deep: [0x2f7a6a, 0x3a6a8a] });
export const STAR_TONES = Object.freeze({ kelp: [0xe8a04b, 0xd8503c], coral: [0xe8703c, 0xe8708a, 0xd8503c, 0xa45fc4], flats: [0xe8a04b, 0xe8c34a], open: [0xe8a04b, 0xd8c0a0], deep: [0x7a6ac0, 0x4a8aa0] });
export const SHELL_TONES = Object.freeze([0xf2e6d0, 0xe8c4b8, 0xe8d6a8, 0xd8b8c0]);

// ---- the scatter -------------------------------------------------------------------------------------------------------------------------------
// A patch family: drop `n` patch centres where `likes` accepts, at least `sep` apart, each filled with lo..hi items within `rad`.
function scatterFamily(fam, { n, sep = 3, rad, lo, hi, foot, placed, edge = 3 }) {
  const rng = mulberry32(DECOR_SALT[fam]);
  const patches = [];
  const items = [];
  const minX = REEF_BOUNDS.minX + edge;
  const spanX = REEF_BOUNDS.maxX - REEF_BOUNDS.minX - 2 * edge;
  const minZ = REEF_BOUNDS.minZ + edge;
  const spanZ = REEF_BOUNDS.maxZ - REEF_BOUNDS.minZ - 2 * edge;
  for (let tries = 0; patches.length < n && tries < 20000; tries++) {
    let x;
    let z;
    if (rng() < 0.8) { // most patches are proposed round a zone (so the zones are where the colour is); the rest anywhere on the sand
      const k = HAB_ZONES[Math.floor(rng() * HAB_ZONES.length)];
      const a = rng() * Math.PI * 2;
      const r = Math.sqrt(rng()) * k.r * 1.4;
      x = k.x + Math.cos(a) * r;
      z = k.z + Math.sin(a) * r;
    } else { x = minX + rng() * spanX; z = minZ + rng() * spanZ; }
    if (rng() > likes(fam, x, z)) continue;
    if (!decorClear(x, z, 0.4)) continue;
    if (patches.some((p) => Math.hypot(p.x - x, p.z - z) < sep)) continue;
    patches.push({ x, z, half: patches.length % 2, zone: zoneOf(x, z), fam, pyaw: rng() * Math.PI });
  }
  for (const p of patches) {
    const k = lo + Math.floor(rng() * (hi - lo + 1));
    for (let i = 0; i < k; i++) {
      const a = rng() * Math.PI * 2;
      const r = Math.sqrt(rng()) * rad;
      const x = p.x + Math.cos(a) * r;
      const z = p.z + Math.sin(a) * r;
      const f = typeof foot === 'function' ? foot(rng) : foot;
      if (!decorClear(x, z, f.r ?? f)) continue;
      if (placed && placed.some((o) => Math.hypot(o.x - x, o.z - z) < o.f + (f.r ?? f))) continue;
      const item = { fam, x, z, r: f.r ?? f, half: p.half, zone: p.zone, yaw: rng() * Math.PI * 2, pyaw: p.pyaw, c: Math.floor(rng() * 1000), s: rng(), t: rng(), ...(f.extra ?? {}) };
      items.push(item);
      if (placed) placed.push({ x, z, f: item.r });
    }
  }
  return { patches, items };
}

let cached = null;
export function scatterDecor() {
  if (cached) return cached;
  const placed = []; // the big things keep clear of each other (and the seagrass keeps clear of them)
  const out = {};
  out.arch = scatterFamily('arch', { n: 6, sep: 4.5, rad: 0.1, lo: 1, hi: 1, foot: 1.0, placed }).items;
  out.pile = scatterFamily('pile', { n: 24, sep: 4, rad: 0.2, lo: 1, hi: 1, foot: 0.8, placed }).items;
  out.wood = scatterFamily('wood', { n: 9, sep: 6, rad: 0.2, lo: 1, hi: 1, foot: 1.0, placed }).items;
  out.fan = scatterFamily('fan', { n: 16, sep: 4, rad: 2.2, lo: 1, hi: 4, foot: 0.55, placed }).items;
  out.head = scatterFamily('head', { n: 13, sep: 3.5, rad: 1.8, lo: 2, hi: 5, foot: 0.4, placed }).items;
  out.sponge = scatterFamily('sponge', { n: 12, sep: 4, rad: 1.4, lo: 2, hi: 4, foot: 0.35, placed }).items;
  const anem = scatterFamily('anem', { n: 22, sep: 3.2, rad: 0.8, lo: 4, hi: 8, foot: 0.12, placed: null });
  const grass = scatterFamily('grass', { n: 32, sep: 4.2, rad: 1.9, lo: 8, hi: 15, foot: 0.12, placed: null });
  const keepBig = (list) => list.filter((t) => !placed.some((o) => Math.hypot(o.x - t.x, o.z - t.z) < o.f + 0.15));
  out.anem = keepBig(anem.items);
  out.grass = keepBig(grass.items);
  out.grassPatches = grass.patches;
  out.star = scatterFamily('star', { n: 16, sep: 4, rad: 1.2, lo: 1, hi: 2, foot: 0.2 }).items;
  out.urchin = scatterFamily('urchin', { n: 11, sep: 4, rad: 1.2, lo: 1, hi: 3, foot: 0.2 }).items;
  out.shell = scatterFamily('shell', { n: 22, sep: 3, rad: 1.2, lo: 1, hi: 3, foot: 0.12 }).items;
  out.dollar = scatterFamily('dollar', { n: 12, sep: 3, rad: 1.2, lo: 1, hi: 3, foot: 0.12 }).items;
  out.pebble = scatterFamily('pebble', { n: 28, sep: 2.6, rad: 1.1, lo: 3, hi: 7, foot: 0.1 }).items;
  out.ripple = scatterFamily('ripple', { n: 14, sep: 5, rad: 0.7, lo: 3, hi: 4, foot: { r: 0.9 }, placed: null }).items;
  cached = out;
  return out;
}

// Every tuft (seagrass and anemone) in one list, half 0 first: { x, z, h (height scale), w (width scale), yaw, tint [r, g, b], anem }.
export function scatterTufts() {
  const d = scatterDecor();
  const mk = (list, anem) => list.map((t) => {
    const tints = (anem ? ANEM_TINT : GRASS_TINT)[t.zone];
    const col = tints[t.c % tints.length];
    const j = 0.85 + 0.3 * t.t;
    return { x: t.x, z: t.z, half: t.half, yaw: t.yaw, anem, h: anem ? 0.2 + 0.2 * t.s : 0.35 + 0.65 * t.s, w: anem ? 1.3 + 0.9 * t.s : 0.8 + 0.5 * t.t, tint: [col[0] * j, col[1] * j, col[2] * j] };
  });
  const all = [...mk(d.grass, false), ...mk(d.anem, true)];
  return [...all.filter((t) => !t.half), ...all.filter((t) => t.half)];
}

// ---- the sand itself: darker silty patches (under the seagrass beds and a few out in the open) and paler swept ones -------------------------------------
let sandBlobs = null;
function blobs() {
  if (!sandBlobs) {
    const rng = mulberry32(DECOR_SALT.sand);
    const dark = [];
    const pale = [];
    for (let i = 0; i < 16; i++) dark.push([REEF_BOUNDS.minX + rng() * 96, REEF_BOUNDS.minZ + rng() * 84, 2.5 + rng() * 3.5]);
    for (let i = 0; i < 9; i++) pale.push([REEF_BOUNDS.minX + rng() * 96, REEF_BOUNDS.minZ + rng() * 84, 2.2 + rng() * 2.6]);
    for (const p of scatterDecor().grassPatches) dark.push([p.x, p.z, 2.6]); // the floor of a seagrass bed is a little muddy
    sandBlobs = { dark, pale };
  }
  return sandBlobs;
}
// { dark, pale } in 0..1 at a spot of sand (a soft blob with a wobbling edge).
export function sandPatch(x, z) {
  const b = blobs();
  const wob = 1 + 0.25 * Math.sin(x * 0.9 + Math.sin(z * 0.6) * 1.7) * Math.cos(z * 0.8 - x * 0.2);
  let dark = 0;
  let pale = 0;
  for (const [cx, cz, r] of b.dark) { const d = Math.hypot(x - cx, z - cz) / (r * wob); if (d < 1) dark = Math.max(dark, (1 - d * d) ** 2); }
  for (const [cx, cz, r] of b.pale) { const d = Math.hypot(x - cx, z - cz) / (r * wob); if (d < 1) pale = Math.max(pale, (1 - d * d) ** 2); }
  return { dark, pale };
}
