// =============================================================================
// THE JUNGLE LODGE: BEAUTY ROUND THREE (2026-11-27), the forest floor read close up. Fallen leaves in greens, yellows and browns, moss and clover patches lying flat on the
// ground, small stones and wet pebbles along both river banks, tufts of grass and tiny ground flowers in each zone accent. Soft pieces only (no shadow, no collider, no word),
// in the non-casting paint bucket that already exists: no mesh and no draw of its own. It is paid for by cheaper shapes elsewhere (no hidden bottom caps on trunks, limbs and
// stems, flat pads for the flagstones and the moss pool). Its own seeded stream (mulberry32, one per layer); no clock, no Math.random, no text. Nothing moves.
// =============================================================================

import * as THREE from 'three';
import { mulberry32 } from '../rng.js';
import * as P from './jungleplan.js';
import { COL, paint, pad } from './jungleparts.js';
import { ZONE_ACCENT } from './junglepolish.js';

export const CARPET_COUNT = Object.freeze({ leaves: 300, patches: 64, pebbles: 70, tufts: 80, flowers: 40 });
const LITTER = Object.freeze([0x9aae44, 0x7a9a34, 0x8a6a3a, 0xb87a34, 0x5f7f2c, 0xc89c3e, 0x6e5230, 0xa05a2c]);
const MOSS = Object.freeze([0x6c9a40, 0x7aa846, 0x8cae4c, 0x8a7a44, 0x62903c]); // moss, fresh moss, bright moss, bare earth, shade (all close to the ground tone)
const STONE = Object.freeze([0x8c9486, 0x76806f, 0xa0a496, 0x6e7468]);
const TAU = Math.PI * 2;

const zoneNear = (x, z) => P.ZONES.reduce((best, k) => { const d = Math.hypot(x - k.x, z - k.z) / k.r; return d < best.d ? { d, id: k.id } : best; }, { d: Infinity, id: 'ring' }).id;

/** The plan: pure and seeded. { leaves, patches, pebbles, tufts, flowers } (tests read it without a renderer). */
export function carpetPlan() {
  const solid = P.jungleColliders();
  const free = (x, z, m) => P.clearOf(x, z, m) && !solid.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + m);
  const B = P.JUNGLE_BOUNDS;
  // where she spends her time (the ring, the lodge yard, the path between) gets more of every layer: a third land round the ring, more in this box
  const anywhere = (rng) => (rng() < 0.3 ? [-9 + rng() * 18, 19 + rng() * 17] : rng() < 0.55 ? [-22 + rng() * 34, 4 + rng() * 31] : [B.minX + 3 + rng() * (B.maxX - B.minX - 6), B.minZ + 3 + rng() * (B.maxZ - B.minZ - 6)]);
  const trees = P.scatterTrees().filter((k) => !k.rim);
  const nearTree = (rng, reach) => { const k = trees[Math.floor(rng() * trees.length)]; const a = rng() * TAU; const d = 0.5 * k.s + 0.3 + rng() * reach; return [k.x + Math.cos(a) * d, k.z + Math.sin(a) * d]; };
  const leaves = [];
  let rng = mulberry32(0x6c697474); // 'litt'
  for (let i = 0, tries = 0; i < CARPET_COUNT.leaves && tries++ < 5000;) {
    const [x, z] = rng() < 0.45 ? nearTree(rng, 3.2) : anywhere(rng);
    if (!free(x, z, 0.1)) continue;
    leaves.push({ x, z, yaw: rng() * TAU, s: 0.22 + rng() * 0.25, hex: LITTER[Math.floor(rng() * LITTER.length)], j: i % 5 });
    i++;
  }
  const patches = [];
  rng = mulberry32(0x6d6f7373); // 'moss'
  for (let i = 0, tries = 0; i < CARPET_COUNT.patches && tries++ < 3000;) {
    const [x, z] = anywhere(rng);
    const r = 0.6 + rng() * 0.8;
    if (!free(x, z, r + 0.2) || patches.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + r)) continue;
    patches.push({ x, z, r, sz: 0.6 + rng() * 0.4, yaw: rng() * TAU, hex: MOSS[Math.floor(rng() * MOSS.length)] });
    i++;
  }
  const pebbles = [];
  rng = mulberry32(0x70656262); // 'pebb'
  for (let i = 0, tries = 0; i < CARPET_COUNT.pebbles && tries++ < 6000;) {
    const x = B.minX + 3 + rng() * (B.maxX - B.minX - 6); const z = -16 + rng() * 18; // the river runs through this band
    const d = P.riverDist(x, z);
    if (d < P.RIVER_W - 0.1 || d > P.RIVER_W + 1.5) continue; // along the waterline: wet stones at the edge, dry ones on the bank
    if (Math.abs(x - P.LOG_BRIDGE.x) < 1.6 || P.STEPPING.some((s) => Math.hypot(s.x - x, s.z - z) < 1.8)) continue;
    pebbles.push({ x, z, r: 0.1 + rng() * 0.13, yaw: rng() * TAU, hex: STONE[Math.floor(rng() * STONE.length)], wet: d < P.RIVER_W + 0.5 });
    i++;
  }
  const tufts = [];
  rng = mulberry32(0x74756674); // 'tuft'
  for (let i = 0, tries = 0; i < CARPET_COUNT.tufts && tries++ < 3000;) {
    const [x, z] = rng() < 0.5 ? nearTree(rng, 1.0) : anywhere(rng);
    if (!free(x, z, 0.2)) continue;
    tufts.push({ x, z, h: 0.4 + rng() * 0.35, yaw: rng() * TAU, hex: [COL.leaf, COL.leafLight, COL.moss][i % 3] });
    i++;
  }
  const flowers = [];
  rng = mulberry32(0x666c6f77); // 'flow'
  for (let i = 0, tries = 0; i < CARPET_COUNT.flowers && tries++ < 3000;) {
    const [x, z] = anywhere(rng);
    if (!free(x, z, 0.3)) continue;
    flowers.push({ x, z, r: 0.1 + rng() * 0.04, yaw: rng() * TAU, hex: ZONE_ACCENT[zoneNear(x, z)][rng() < 0.7 ? 0 : 1] });
    i++;
  }
  return { leaves, patches, pebbles, tufts, flowers };
}

const tri = (a, b, c) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([...a, ...b, ...c]), 3)); return g; };
const merge = (parts) => { // many small triangles as one geometry
  const pos = [];
  for (const g of parts) pos.push(...g.attributes.position.array);
  const m = new THREE.BufferGeometry(); m.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3)); return m;
};
const soft = { noCast: true };

export function drawCarpet(kit, M) {
  const plan = carpetPlan();
  const gy = P.jungleY;
  const put = (geo, hex, j = 0) => kit.put('paint', M.paint, paint(geo, hex, j), soft);
  for (const l of plan.leaves) { // a diamond of two triangles, lying on the ground
    const ca = Math.cos(l.yaw); const sa = Math.sin(l.yaw); const w = l.s * 0.32; const y = gy(l.x, l.z) + 0.045;
    const p = (u, v) => [l.x + ca * u - sa * v, y, l.z + sa * u + ca * v];
    put(merge([tri(p(-l.s, 0), p(0, w), p(0, -w)), tri(p(l.s, 0), p(0, -w), p(0, w))]), l.hex, l.j);
  }
  for (const m of plan.patches) put(pad(6).scale(m.r, 1, m.r * m.sz).rotateY(m.yaw).translate(m.x, gy(m.x, m.z) + 0.04, m.z), m.hex);
  for (const s of plan.pebbles) { // a squashed three-sided stone with no underside
    const y = gy(s.x, s.z) + (s.wet ? 0.02 : 0.03);
    const ring = [0, 1, 2].map((k) => [s.x + Math.cos(s.yaw + (k / 3) * TAU) * s.r, y, s.z + Math.sin(s.yaw + (k / 3) * TAU) * s.r]);
    const top = [s.x, y + s.r * 0.7, s.z];
    put(merge([tri(ring[1], ring[0], top), tri(ring[2], ring[1], top), tri(ring[0], ring[2], top)]), s.wet ? 0x5e6a5c : s.hex, s.wet ? 1 : 0);
  }
  for (const t of plan.tufts) { // three thin blades leaning out
    const y = gy(t.x, t.z) - 0.02;
    const blades = [0, 1, 2].map((k) => {
      const a = t.yaw + (k / 3) * TAU; const ca = Math.cos(a); const sa = Math.sin(a); const w = 0.05;
      return tri([t.x + ca * 0.04 - sa * w, y, t.z + sa * 0.04 + ca * w], [t.x + ca * 0.04 + sa * w, y, t.z + sa * 0.04 - ca * w], [t.x + ca * 0.2, y + t.h, t.z + sa * 0.2]);
    });
    put(merge(blades), t.hex, 1);
  }
  for (const f of plan.flowers) { // a four-petalled bloom on a thin stem
    const g0 = gy(f.x, f.z); const y = g0 + 0.24;
    const ring = [0, 1, 2, 3].map((k) => [f.x + Math.cos(f.yaw + k * 1.5708) * f.r, y, f.z + Math.sin(f.yaw + k * 1.5708) * f.r]);
    put(merge([0, 1, 2, 3].map((k) => tri(ring[(k + 1) % 4], ring[k], [f.x, y + 0.05, f.z]))), f.hex);
    const sa = Math.sin(f.yaw); const ca = Math.cos(f.yaw); // a thin green stem: one triangle
    put(tri([f.x - sa * 0.012, g0, f.z + ca * 0.012], [f.x + sa * 0.012, g0, f.z - ca * 0.012], [f.x, y, f.z]), COL.leafDeep);
  }
}
