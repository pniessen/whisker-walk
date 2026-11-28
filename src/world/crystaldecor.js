// =============================================================================
// THE CRYSTAL CAVE: ITS DECOR, THE PLAN (layer 3). Mushroom clumps with glowing caps, small crystal gardens, glowing moss, stalagmite groups, pools of light under
// the crystal clusters and pebbles, clumped by chamber colour (Rose hall pink, Blue Pool blue, Gold Gallery honey-gold, Heart room violet). Pure data and pure functions
// (no THREE, no clock, no Math.random: every scatter is a seeded stream with its own salt). Drawing is world/crystaldecorparts.js (three draws at most).
// Everything here is decoration: none of it is solid, a find or a rule. The small things stand on open floor clear of every collider, find, mouse, stone, story point, the
// arch, the pool and the wander points; the stalagmite groups stand just OUTSIDE the walkable edge (never on the cat's floor). LOW/LITE keep about half: every list is
// made in round-robin chamber order, so its first half is still a fair mix. docs/superpowers/plans/2026-11-26-crystal-cave-enrichment.md layer 3.
// =============================================================================

import { mulberry32 } from '../rng.js';
import * as P from './crystalplan.js';
import * as W from './crystalwingplan.js';
import { CRYSTAL_FIND_ZONES, CRYSTAL_COLLECTIBLES, CRYSTAL_GOLD } from './crystalfindsplan.js';
import { LUMI, STONES } from './crystalstory.js';
import { SPOTS, STONE, BUG, SPARK } from './crystalerrand.js';

export const SALTS = Object.freeze({ mush: 0x6d757368, garden: 0x67617264, moss: 0x6d6f7373, stag: 0x73746167, pebble: 0x70656264, tone: 0x746f6e65 });
// the four chambers, each with its hue: [x, z, r] from the plan's own zones
const CH = Object.freeze(P.ZONES.slice(2).map((z, i) => Object.freeze({ id: z.id, hue: P.HUES[i], x: z.x, z: z.z, r: z.r })));
export const CHAMBERS = CH;
// how many of each a rung keeps (HIGH; LOW and LITE about half)
export const DECOR_COUNT = Object.freeze({
  high: Object.freeze({ mush: 14, garden: 10, moss: 10, stag: 12, pools: 30, pebble: 20 }),
  low: Object.freeze({ mush: 7, garden: 5, moss: 5, stag: 6, pools: 15, pebble: 10 }),
});
export const decorRung = (tier) => (tier && (tier.shadows === false || tier.name === 'low' || (tier.rung ?? 0) >= 3) ? 'low' : 'high');

// The mice the scatter keeps out of: the original three. A later mouse never reshuffles the decor (test/crystalx0.test.js).
export const CRYSTAL_GOLD_SCATTER_IDS = Object.freeze(['gm-crystal-1', 'gm-crystal-2', 'gm-crystal-3']);

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// Every disc the small decor keeps out of: [x, z, r]. Solid things and everything a cat or Lumi comes to.
let _avoid = null;
export function decorAvoid() {
  if (_avoid) return _avoid;
  const d = [];
  for (const c of P.crystalColliders()) d.push([c.x, c.z, c.r + 0.5]);
  for (const k of P.KEEP_OUT) d.push([k[0], k[1], k[2]]);
  for (const k of Object.values(CRYSTAL_FIND_ZONES).flat()) d.push([k.x, k.z, k.r + 1.2]);
  for (const k of CRYSTAL_COLLECTIBLES) d.push([k.x, k.z, 1.4]);
  for (const k of CRYSTAL_GOLD.filter((m) => CRYSTAL_GOLD_SCATTER_IDS.includes(m.id))) d.push([k.x, k.z, 2.2]); // (the first three, by name: wing C's stubs must not move the scatter)
  for (const k of STONES) d.push([k.x, k.z, 2.2]);
  for (const k of [LUMI.start, STONE, BUG, SPARK.start, ...SPOTS]) d.push([k.x, k.z, 2]);
  d.push([SPARK.ring.x, SPARK.ring.z, SPARK.ring.r + 1.5]);
  d.push([W.HEART_GREAT.x, W.HEART_GREAT.z, 4.4]);
  d.push([W.POOL.x, W.POOL.z, W.POOL.r + 0.5]);
  for (const k of P.CRYSTAL_POIS) d.push([k.x, k.z, 1.1]);
  for (const k of P.scatterClusters()) d.push([k.x, k.z, k.s * 0.8 + 0.3]);
  for (const k of [...W.POOL_RING, ...W.GOLD_ROW, ...W.HEART_RING]) d.push([k.x, k.z, k.s * 0.8 + 0.3]);
  for (const k of W.PASSAGES.flatMap((p) => p.lamps)) d.push([k.x, k.z, 0.5]);
  return (_avoid = Object.freeze(d.map((k) => Object.freeze(k))));
}
const clearOf = (x, z, rad, taken) => decorAvoid().every((k) => Math.hypot(x - k[0], z - k[1]) >= k[2] + rad) && taken.every((k) => Math.hypot(x - k.x, z - k.z) >= k.rad + rad + 0.3);
const inside = (x, z, m = 2.5) => x >= P.CRYSTAL_BOUNDS.minX + m && x <= P.CRYSTAL_BOUNDS.maxX - m && z >= P.CRYSTAL_BOUNDS.minZ + m && z <= P.CRYSTAL_BOUNDS.maxZ - m;

// Spread `n` sites over the chambers in round-robin order (so a prefix is a fair mix), each between 0.3 and 0.95 of its chamber's radius from the middle.
function sites(salt, n, rad, extra, taken, lo = 0.3, hi = 0.95) {
  const rng = mulberry32(salt);
  const out = [];
  for (let i = 0; i < n; i++) {
    const c = CH[i % CH.length];
    for (let t = 0; t < 400; t++) {
      const a = rng() * Math.PI * 2;
      const r = c.r * (lo + rng() * (hi - lo));
      const x = c.x + Math.cos(a) * r; const z = c.z + Math.sin(a) * r * 0.9;
      if (!inside(x, z) || !clearOf(x, z, rad, taken)) continue;
      const item = { x, z, rad, hue: c.hue, yaw: rng() * Math.PI * 2, ...extra(rng) };
      out.push(item); taken.push(item);
      break;
    }
  }
  return out;
}
const members = (rng, n, spread, lo, hi) => Array.from({ length: n }, () => {
  const a = rng() * Math.PI * 2; const r = Math.sqrt(rng()) * spread;
  return { dx: Math.cos(a) * r, dz: Math.sin(a) * r, s: lo + rng() * (hi - lo), yaw: rng() * Math.PI * 2, lean: (rng() - 0.5) * 0.3 };
});

// The decor lists for a rung: { mush, garden, moss, stag, pools, pebble }. Pure: the same twice.
const _cache = {};
export function planDecor(rung = 'high') {
  if (_cache[rung]) return _cache[rung];
  const N = DECOR_COUNT[rung === 'high' ? 'high' : 'low'];
  const full = DECOR_COUNT.high;
  const taken = []; // every placed small site, so the lists keep clear of each other (always the HIGH lists, so LOW is a prefix of HIGH)
  const mush = sites(SALTS.mush, full.mush, 0.9, (r) => ({ n: 3 + Math.floor(r() * 3), parts: members(r, 5, 0.75, 0.14, 0.34) }), taken);
  const garden = sites(SALTS.garden, full.garden, 0.9, (r) => ({ parts: members(r, 4 + Math.floor(r() * 3), 0.7, 0.16, 0.46) }), taken, 0.35, 0.9);
  const moss = sites(SALTS.moss, full.moss, 1.2, (r) => ({ r: 0.7 + r() * 0.7, wob: r() * 6 }), taken, 0.3, 0.9);
  const pebble = sites(SALTS.pebble, full.pebble, 0.5, (r) => ({ parts: members(r, 3 + Math.floor(r() * 4), 0.4, 0.05, 0.13) }), taken, 0.2, 1);
  mush.forEach((m) => { m.parts = m.parts.slice(0, m.n); });
  const stag = stalagmiteGroups(full.stag);
  const pools = lightPools(full.pools);
  const out = { mush: mush.slice(0, N.mush), garden: garden.slice(0, N.garden), moss: moss.slice(0, N.moss), stag: stag.slice(0, N.stag), pools: pools.slice(0, N.pools), pebble: pebble.slice(0, N.pebble) };
  for (const k of Object.keys(out)) Object.freeze(out[k]);
  return (_cache[rung] = Object.freeze(out));
}

// The nearest chamber's hue for a place.
export function hueNear(x, z) {
  let best = CH[0]; let bd = Infinity;
  for (const c of CH) { const d = Math.hypot(x - c.x, z - c.z) - c.r * 0.2; if (d < bd) { bd = d; best = c; } }
  return best.hue;
}

// Stalagmite groups: just OUTSIDE the walkable edge (0.6 to 2.2 m beyond it), a clump of three to five spikes each, never in the arch's gap.
function stalagmiteGroups(n) {
  const rng = mulberry32(SALTS.stag);
  const B = P.CRYSTAL_BOUNDS;
  const out = [];
  for (let i = 0; i < n; i++) {
    const side = i % 4; // north, east, south, west: so a prefix is spread round the cave
    let x = 0; let z = 0;
    for (let t = 0; t < 60; t++) {
      const u = rng(); const off = 0.8 + rng() * 1.4;
      if (side === 0) { x = B.minX + 4 + u * (B.maxX - B.minX - 8); z = B.minZ - off; }
      else if (side === 1) { x = B.maxX + off; z = B.minZ + 4 + u * (B.maxZ - B.minZ - 8); }
      else if (side === 2) { x = B.minX + 4 + u * (B.maxX - B.minX - 8); z = B.maxZ + off; }
      else { x = B.minX - off; z = B.minZ + 4 + u * (B.maxZ - B.minZ - 8); }
      if (Math.hypot(x - P.ARCH.x, z - P.ARCH.z) > 7 && out.every((o) => Math.hypot(o.x - x, o.z - z) > 3.2)) break;
    }
    const spikes = members(rng, 3 + Math.floor(rng() * 3), 0.8, 0.12, 0.3).map((m) => ({ ...m, h: 0.5 + rng() * 1.1 }));
    out.push({ x, z, rad: 1, hue: hueNear(x, z), yaw: rng() * 6.28, parts: spikes });
  }
  return out;
}

// Pools of light: one round, soft disc of the cluster's hue on the floor under each, the great ones first, then the biggest. { x, z, r, hue, k (strength 0..1) }.
function lightPools(n) {
  const all = [...P.scatterClusters(), W.BLUE_GREAT, W.GOLD_GREAT, W.HEART_GREAT, ...W.POOL_RING, ...W.GOLD_ROW, ...W.HEART_RING];
  const list = all.map((k, i) => ({ k, i })).sort((a, b) => (b.k.great ? 9 : b.k.s) - (a.k.great ? 9 : a.k.s) || a.i - b.i).slice(0, n);
  // interleave by hue so a prefix still has every colour
  const byHue = {};
  for (const { k } of list) (byHue[k.hue] ??= []).push(k);
  const out = [];
  for (let i = 0; out.length < list.length; i++) for (const h of P.HUES) if (byHue[h]?.[i]) out.push(byHue[h][i]);
  return out.map((k) => Object.freeze({ x: k.x, z: k.z, r: clamp(k.s * (k.great ? 1.5 : 1.3) + 0.5, 0.9, 4.4), hue: k.hue, k: k.great ? 1 : 0.7 }));
}

// Three small glowing shards round each light pool's cluster (secondary crystals), one in hue-tinted gradient with a glint on its tip. Flat decoration at the pool's rim.
function shardSatellites(pools, n) {
  const rng = mulberry32(BEAUTY_SALTS.sat);
  return pools.slice(0, n).map((p) => Object.freeze({
    x: p.x, z: p.z, hue: p.hue, k: p.k,
    parts: Array.from({ length: 3 }, (_, j) => {
      const a = (j / 3) * Math.PI * 2 + rng() * 0.9; const d = p.r * (0.78 + rng() * 0.2);
      return { dx: Math.cos(a) * d, dz: Math.sin(a) * d * 0.95, h: 0.28 + rng() * 0.5 + (p.k === 1 ? 0.2 : 0), s: 0.05 + rng() * 0.05, yaw: rng() * 6.28, lean: (rng() - 0.5) * 0.5, glint: j === 0 || rng() < 0.2 };
    }),
  }));
}

// Soft warm and cool pools of colour that cross the chambers' own hues (a teal one in the warm halls, an amber one in the cool ones). Round-robin over the chambers.
const WARM = Object.freeze([1, 0.62, 0.28]); const COOL = Object.freeze([0.22, 0.8, 0.78]);
function colourPockets(n) {
  const rng = mulberry32(BEAUTY_SALTS.pocket);
  return Array.from({ length: n }, (_, i) => {
    const c = CH[i % CH.length]; const warm = c.hue === 'blue' || c.hue === 'heart';
    let x = c.x; let z = c.z;
    for (let t = 0; t < 40; t++) { const a = rng() * 6.28; const r = c.r * (0.2 + rng() * 0.6); x = c.x + Math.cos(a) * r; z = c.z + Math.sin(a) * r * 0.9; if (inside(x, z)) break; }
    return Object.freeze({ x, z, r: 3 + rng() * 1.6, rgb: warm ? WARM : COOL, wob: rng() * 6 });
  });
}

// Every small site a test must find clear: the centres of everything but the stalagmites and the light pools.
export const smallSites = (rung = 'high') => { const d = planDecor(rung); return [...d.mush, ...d.garden, ...d.moss, ...d.pebble]; };

// ---- beauty round 1 (2026-11-28) ------------------------------------------------------------------------------------------------------------------
// More detail on the same three meshes, planned APART from planDecor so the recorded scatter hashes (test/crystalx0.test.js) stay what they were: mineral veins and
// small floor stalagmites (own sites, clear of everything the first lists keep clear of AND of each other), shard satellites round the light pools' clusters, and
// warm and cool pockets of colour. Same rule as the rest: LOW keeps about half, each list a prefix of HIGH. All still, so reduced motion changes nothing.
export const BEAUTY_SALTS = Object.freeze({ vein: 0x7665696e, mini: 0x6d696e69, sat: 0x73617473, pocket: 0x706f636b });
export const BEAUTY_COUNT = Object.freeze({
  high: Object.freeze({ sats: 30, veins: 10, mini: 14, pockets: 8 }),
  low: Object.freeze({ sats: 15, veins: 5, mini: 7, pockets: 4 }),
});
const _bcache = {};
export function planBeauty(rung = 'high') {
  if (_bcache[rung]) return _bcache[rung];
  const N = BEAUTY_COUNT[rung === 'high' ? 'high' : 'low']; const full = BEAUTY_COUNT.high;
  const taken = smallSites('high').map((m) => ({ x: m.x, z: m.z, rad: m.rad }));
  const veins = sites(BEAUTY_SALTS.vein, full.veins, 1.1, (r) => ({ ang: r() * Math.PI, len: 1.6 + r() * 0.6, wob: r() * 6, fork: r() }), taken, 0.25, 0.9);
  const mini = sites(BEAUTY_SALTS.mini, full.mini, 0.6, (r) => ({ parts: members(r, 3, 0.4, 0.04, 0.09).map((m) => ({ ...m, h: 0.2 + r() * 0.4 })) }), taken, 0.2, 1);
  const sats = shardSatellites(planDecor('high').pools, full.sats);
  const pockets = colourPockets(full.pockets);
  const out = { sats: sats.slice(0, N.sats), veins: veins.slice(0, N.veins), mini: mini.slice(0, N.mini), pockets: pockets.slice(0, N.pockets) };
  for (const k of Object.keys(out)) Object.freeze(out[k]);
  return (_bcache[rung] = Object.freeze(out));
}
export const beautySites = (rung = 'high') => { const d = planBeauty(rung); return [...d.veins, ...d.mini]; };

// ---- beauty round 2 (2026-11-28) ------------------------------------------------------------------------------------------------------------------
// Things that read at a glance from the play camera: HERO crystals (tall, strongly graded spikes standing INSIDE the footprint of the biggest existing clusters, so nothing new is
// solid or standable) with a glow halo each, a big colour WASH under every chamber (rose, cyan, amber, violet), light SHAFTS from the dome, MOTES that rise with trails and
// water RIPPLES on the Blue Pool. Planned apart again (own salts), pure data; LOW keeps about half of each list, a prefix of HIGH. The drawing animates them in the shader.
export const ZONE_RGB = Object.freeze({ rose: Object.freeze([1, 0.4, 0.68]), blue: Object.freeze([0.1, 0.56, 0.78]), gold: Object.freeze([1, 0.64, 0.18]), heart: Object.freeze([0.6, 0.36, 1]), amber: Object.freeze([1, 0.7, 0.28]) }); // (amber: the Entry Hall's lantern warmth, the start of the colour journey: amber, rose, blue, gold, violet)
export const BEAUTY2_SALTS = Object.freeze({ hero: 0x6865726f, shaft: 0x73686674, mote: 0x6d6f7465, ripple: 0x72697070 });
export const BEAUTY2_COUNT = Object.freeze({
  high: Object.freeze({ hero: 8, wash: 4, shafts: 8, motes: 56, ripples: 8 }),
  low: Object.freeze({ hero: 4, wash: 4, shafts: 4, motes: 28, ripples: 4 }),
});
export const SHAFT_TOP = 14; // metres up: the dome's roots, where the shafts begin
const _b2 = {};
export function planBeauty2(rung = 'high') {
  if (_b2[rung]) return _b2[rung];
  const N = BEAUTY2_COUNT[rung === 'high' ? 'high' : 'low']; const full = BEAUTY2_COUNT.high;
  // the biggest clusters (the four greats first), interleaved by hue so a prefix still has every colour
  const all = [...P.scatterClusters(), W.BLUE_GREAT, W.GOLD_GREAT, W.HEART_GREAT, P.ROSE_GREAT, ...W.POOL_RING, ...W.GOLD_ROW, ...W.HEART_RING]
    .filter((k, i, arr) => arr.findIndex((o) => o.x === k.x && o.z === k.z) === i)
    .map((k, i) => ({ k, i })).sort((a, b) => (b.k.great ? 9 : b.k.s) - (a.k.great ? 9 : a.k.s) || a.i - b.i).slice(0, full.hero);
  const byHue = {}; for (const { k } of all) (byHue[k.hue] ??= []).push(k);
  const order = []; for (let i = 0; order.length < all.length; i++) for (const h of P.HUES) if (byHue[h]?.[i]) order.push(byHue[h][i]);
  const rng = mulberry32(BEAUTY2_SALTS.hero);
  const hero = order.map((k) => {
    const top = 3 + k.s * 1.9 + (k.great ? 1.2 : 0);
    const spikes = Array.from({ length: 4 }, (_, j) => {
      const a = (j / 4) * Math.PI * 2 + rng() * 0.8; const d = j === 0 ? 0 : k.s * (0.12 + rng() * 0.1);
      return { dx: Math.cos(a) * d, dz: Math.sin(a) * d, h: top * (j === 0 ? 1 : 0.55 + rng() * 0.3), r: k.s * (j === 0 ? 0.2 : 0.12) + 0.08, yaw: rng() * 6.28, lean: (j === 0 ? 0.04 : 0.12 + rng() * 0.12), lean2: a };
    });
    return Object.freeze({ x: k.x, z: k.z, s: k.s, great: !!k.great, hue: k.hue, top, halo: k.s * 2.1 + 1.6, spikes });
  });
  const wash = CH.map((c) => Object.freeze({ x: c.x, z: c.z + 1, r: c.r * 0.92, hue: c.hue, rgb: ZONE_RGB[c.hue] }));
  const sr = mulberry32(BEAUTY2_SALTS.shaft);
  const shafts = Array.from({ length: full.shafts }, (_, i) => {
    const c = CH[i % CH.length]; const a = sr() * 6.28; const r = c.r * (0.15 + sr() * 0.6);
    return Object.freeze({ x: c.x + Math.cos(a) * r, z: c.z + Math.sin(a) * r * 0.9, lx: (sr() - 0.5) * 4, lz: (sr() - 0.5) * 4, w: 0.9 + sr() * 0.7, hue: c.hue, rgb: ZONE_RGB[c.hue], ph: sr() });
  });
  const mr = mulberry32(BEAUTY2_SALTS.mote);
  const motes = Array.from({ length: full.motes }, (_, i) => {
    const c = CH[i % CH.length]; const a = mr() * 6.28; const r = c.r * Math.sqrt(mr()) * 0.95;
    return Object.freeze({ x: c.x + Math.cos(a) * r, z: c.z + Math.sin(a) * r * 0.9, y: 0.2 + mr() * 1.6, rise: 3 + mr() * 3, speed: 0.05 + mr() * 0.06, ph: mr(), hue: c.hue, rgb: ZONE_RGB[c.hue], len: 0.7 + mr() * 0.6 });
  });
  const rr = mulberry32(BEAUTY2_SALTS.ripple);
  const ripples = Array.from({ length: full.ripples }, (_, i) => {
    const a = (i / full.ripples) * 6.28 + rr() * 0.6; const r = W.POOL.r * (0.15 + rr() * 0.55);
    return Object.freeze({ x: W.POOL.x + Math.cos(a) * r, z: W.POOL.z + Math.sin(a) * r, ph: i / full.ripples + rr() * 0.1, reach: 1.3 + rr() * 0.8, speed: 0.17 + rr() * 0.08 });
  });
  const out = { hero: hero.slice(0, N.hero), wash: wash.slice(0, N.wash), shafts: shafts.slice(0, N.shafts), motes: motes.slice(0, N.motes), ripples: ripples.slice(0, N.ripples) };
  for (const k of Object.keys(out)) Object.freeze(out[k]);
  return (_b2[rung] = Object.freeze(out));
}

// ---- beauty round 3 (2026-11-28): THE CAVE REACTS AND LIVES ----------------------------------------------------------------------------------------
// Low mist banks drifting over the chamber floors (kind 6 in the light mesh) and the creatures' and meteor's homes (the Points are drawn in crystalalive.js). Pure data again, own salts.
export const BEAUTY3_SALTS = Object.freeze({ mist: 0x6d697374, creature: 0x63726561 });
const _m3 = {};
export function planMist() {
  if (_m3.mist) return _m3.mist;
  const rng = mulberry32(BEAUTY3_SALTS.mist);
  return (_m3.mist = Object.freeze(Array.from({ length: 6 }, (_, i) => {
    const c = CH[i % CH.length]; let x = c.x; let z = c.z;
    for (let t = 0; t < 40; t++) { const a = rng() * 6.28; const r = c.r * (0.1 + rng() * 0.6); x = c.x + Math.cos(a) * r; z = c.z + Math.sin(a) * r * 0.9; if (inside(x, z)) break; }
    return Object.freeze({ x, z, r: 4.2 + rng() * 2.2, rgb: ZONE_RGB[c.hue], wob: rng() * 6, ph: rng(), speed: 0.012 + rng() * 0.01 });
  })));
}
// The glow creatures' homes: a handful round each hero crystal (hue-coloured), so they gather where the crystals are.
export function planCreatures(n = 14) {
  if (_m3[`c${n}`]) return _m3[`c${n}`];
  const hero = planBeauty2('high').hero; const rng = mulberry32(BEAUTY3_SALTS.creature);
  return (_m3[`c${n}`] = Object.freeze(Array.from({ length: n }, (_, i) => {
    const h = hero[i % hero.length]; const a = rng() * 6.28;
    return Object.freeze({ x: h.x + Math.cos(a) * (h.s * 0.8 + 0.8), z: h.z + Math.sin(a) * (h.s * 0.8 + 0.8), y: 0.7 + rng() * 2.2, hue: h.hue, rgb: ZONE_RGB[h.hue], ph: rng() * 6.28, rate: 0.35 + rng() * 0.4, rad: 0.7 + rng() * 0.9 });
  })));
}
