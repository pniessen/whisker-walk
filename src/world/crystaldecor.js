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

// Every small site a test must find clear: the centres of everything but the stalagmites and the light pools.
export const smallSites = (rung = 'high') => { const d = planDecor(rung); return [...d.mush, ...d.garden, ...d.moss, ...d.pebble]; };
