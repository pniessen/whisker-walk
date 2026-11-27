// =============================================================================
// THE JUNGLE LODGE: FOLIAGE (round two, from the owner's live play). Real jungle plants in clumps of different sizes and leaf shapes: banana plants with long paddle leaves, elephant ears
// on stalks, big arching ferns, gingers with a flame of red, fan-palm shrubs, bromeliad rosettes, orchids and monstera; giant leaves held out over her head from the trunks; and hanging
// vines and lianas of different lengths. Soft pieces only (no shadow, no collider, no word) in stage b's merged buckets, no mesh of its own. Its own seeded stream (0x666f6c69), so every
// existing layout stays put; nothing moves, so reduced motion needs nothing. The place builds once for every tier, so the layer is kept small: triangles are cheap, draws are not.
// =============================================================================
import * as THREE from 'three';
import { mulberry32 } from '../rng.js';
import * as P from './jungleplan.js';
import { COL, paint } from './jungleparts.js';
import { ZONE_ACCENT } from './junglepolish.js';
import { limb } from './jungletrees.js';

export const FOLIAGE_COUNT = Object.freeze({ clumps: 58, overhead: 10 });
export const KINDS = Object.freeze(['banana', 'elephant', 'bigfern', 'ginger', 'palmlet', 'bromeliad', 'orchid', 'monstera']);
const WEIGHTS = Object.freeze([2, 3, 4, 2, 2, 3, 1, 2]);
const SIZES = Object.freeze([[0.6, 0.3], [0.95, 0.3], [1.35, 0.4]]); // small, medium, large: [min scale, span]

const zoneNear = (x, z) => P.ZONES.reduce((best, k) => { const d = Math.hypot(x - k.x, z - k.z) / k.r; return d < best.d ? { d, id: k.id } : best; }, { d: Infinity, id: 'ring' }).id;

/** The plan: pure and seeded. { clumps: [{ kind, size (0 small, 1 medium, 2 large), x, z, s, yaw, zone }], overhead: [{ x, z, y, yaw, len, tree }], vines: [{ x, z, y, len }] }. */
export function foliagePlan() {
  const rng = mulberry32(0x666f6c69);
  const clumps = [];
  const total = WEIGHTS.reduce((a, b) => a + b, 0);
  const solid = P.jungleColliders();
  let tries = 0;
  while (clumps.length < FOLIAGE_COUNT.clumps && tries++ < 9000) {
    const x = P.JUNGLE_BOUNDS.minX + 3 + rng() * (P.JUNGLE_BOUNDS.maxX - P.JUNGLE_BOUNDS.minX - 6);
    const z = P.JUNGLE_BOUNDS.minZ + 3 + rng() * (P.JUNGLE_BOUNDS.maxZ - P.JUNGLE_BOUNDS.minZ - 6);
    let w = rng() * total; let kind = 0;
    while (w >= WEIGHTS[kind]) { w -= WEIGHTS[kind]; kind++; }
    const size = Math.min(2, Math.floor(rng() * 3.3));
    const s = SIZES[size][0] + rng() * SIZES[size][1];
    const yaw = rng() * 6.28;
    if (!P.clearOf(x, z, s * 0.9 + 0.3) || solid.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + s * 0.3 + 0.2)) continue;
    if (clumps.some((o) => Math.hypot(o.x - x, o.z - z) < 2.2 + (o.s + s) * 0.5)) continue;
    clumps.push({ kind: KINDS[kind], size, x, z, s, yaw, zone: zoneNear(x, z) });
  }
  // giant leaves held out over her head from the trunks of the broad and emergent trees, and the vines that hang from their tips and from the crowns
  const trees = P.scatterTrees().filter((k) => !k.rim && (k.shape === 'broad' || k.shape === 'emergent'));
  const overhead = [];
  const vines = [];
  for (let i = 0; i < FOLIAGE_COUNT.overhead && trees.length; i++) {
    const k = trees[(i * 3 + 1) % trees.length];
    const yaw = rng() * 6.28;
    const len = 2.3 + rng() * 1.1;
    overhead.push({ x: k.x, z: k.z, y: P.jungleY(k.x, k.z) + (3.4 + rng() * 1.6) * Math.min(k.s, 1.4), yaw, len, tree: i });
  }
  for (const o of overhead) { // a vine from each leaf's tip, and a shorter one from its middle
    const tx = o.x + Math.cos(o.yaw) * o.len * 0.85; const tz = o.z + Math.sin(o.yaw) * o.len * 0.85;
    vines.push({ x: tx, z: tz, y: o.y - 0.5, len: 1.2 + rng() * 1.8 });
    vines.push({ x: o.x + Math.cos(o.yaw) * o.len * 0.4, z: o.z + Math.sin(o.yaw) * o.len * 0.4, y: o.y - 0.3, len: 0.8 + rng() * 1.0 });
  }
  trees.slice(0, 14).forEach((k, i) => vines.push({ x: k.x - 0.9 * k.s, z: k.z - 0.6 * k.s, y: k.top - 1.4 * k.s, len: 1.8 + ((i * 7) % 5) * 0.5 }));
  return { clumps, overhead, vines };
}

const stand = (geo, x, z, dy = 0, ry = 0) => {
  if (ry) geo.rotateY(ry);
  geo.translate(x, P.jungleY(x, z) + dy, z);
  return geo;
};
// A flat leaf blade: an ellipse `len` long and `wid` wide, its base at the origin pointing along +x, then tilted up by `tilt` (0 = flat) and turned by `yaw`.
const leaf = (len, wid, tilt, yaw) => new THREE.SphereGeometry(0.5, 6, 4).scale(len, 0.035, wid).translate(len / 2, 0, 0).rotateZ(tilt).rotateY(yaw);
// A thin frond of two segments: it rises, then arches over and droops.
function frond(len, w, up, yaw) {
  const a = new THREE.ConeGeometry(w, len, 3).scale(1, 1, 0.3).translate(0, len / 2, 0).rotateZ(-up);
  const b = new THREE.ConeGeometry(w * 0.8, len * 0.85, 3).scale(1, 1, 0.3).translate(0, len * 0.425, 0).rotateZ(-up - 1.1).translate(Math.sin(up) * len, Math.cos(up) * len, 0);
  return [a.rotateY(yaw), b.rotateY(yaw)];
}

/** One clump's pieces: [geometry, colour, jitter]. Built at the origin; the caller stands it on the ground. */
export function clumpParts(c) {
  const s = c.s;
  const out = [];
  const acc = ZONE_ACCENT[c.zone];
  const g = [COL.leaf, COL.leafLight, COL.leafDeep, COL.moss];
  const n = (lo, hi) => lo + ((c.size * 2 + Math.floor(c.x * 3.1)) % (hi - lo + 1));
  switch (c.kind) {
    case 'banana': { // a pseudo-stem and long paddle leaves, one split
      out.push([new THREE.CylinderGeometry(0.1 * s, 0.14 * s, 1.7 * s, 6).translate(0, 0.85 * s, 0), 0x7a9a4a, 0]);
      for (let i = 0; i < n(4, 6); i++) out.push([leaf(2.4 * s, 0.75 * s, 0.55 + (i % 3) * 0.25, (i / 5) * 6.28 + c.yaw).translate(0, 1.6 * s, 0), g[i % 2], i]);
      break;
    }
    case 'elephant': { // heart-round leaves held high on stalks
      for (let i = 0; i < n(3, 6); i++) {
        const a = (i / 5) * 6.28 + c.yaw; const h = (0.9 + (i % 3) * 0.28) * s; const r = (0.55 + (i % 2) * 0.12) * s;
        out.push([limb(0, 0, 0, Math.cos(a) * 0.35 * s, h, Math.sin(a) * 0.35 * s, 0.035 * s, 0.025 * s, 4), COL.leafDeep, i]);
        out.push([leaf(1.5 * s, 1.15 * s, 0.22, a).translate(Math.cos(a) * 0.35 * s - 0.2 * s, h, Math.sin(a) * 0.35 * s), g[(i + 2) % 4], i]);
        out.push([new THREE.SphereGeometry(r * 0.25, 4, 3).scale(1, 0.4, 1).translate(Math.cos(a) * 0.35 * s, h - 0.02, Math.sin(a) * 0.35 * s), COL.leafLight, i]);
      }
      break;
    }
    case 'bigfern': for (let i = 0; i < n(7, 10); i++) frond(1.0 * s, 0.1 * s, 0.5 + (i % 3) * 0.2, (i / 9) * 6.28 + c.yaw).forEach((geo, j) => out.push([geo, g[(i + j) % 3], i])); break;
    case 'ginger': { // upright lance leaves round a red flame
      for (let i = 0; i < n(5, 8); i++) out.push([new THREE.ConeGeometry(0.11 * s, (1.3 + (i % 3) * 0.25) * s, 4).scale(1, 1, 0.3).translate(0.2 * s, 0.65 * s, 0).rotateZ(-0.18 - (i % 3) * 0.1).rotateY((i / 7) * 6.28 + c.yaw), g[i % 3], i]);
      out.push([limb(0, 0, 0, 0.1 * s, 1.5 * s, 0, 0.025 * s, 0.02 * s, 3), COL.leafDeep, 0]);
      out.push([new THREE.ConeGeometry(0.13 * s, 0.4 * s, 5).translate(0.1 * s, 1.7 * s, 0), 0xd8402a, 0]);
      break;
    }
    case 'palmlet': { // a short trunk and a ring of stiff fan blades
      out.push([new THREE.CylinderGeometry(0.06 * s, 0.1 * s, 0.7 * s, 5).translate(0, 0.35 * s, 0), COL.trunk, 0]);
      for (let i = 0; i < n(6, 9); i++) out.push([new THREE.ConeGeometry(0.24 * s, 1.35 * s, 4).scale(1, 1, 0.16).translate(0, 0.67 * s, 0).rotateZ(-0.7 - (i % 2) * 0.35).rotateY((i / 8) * 6.28 + c.yaw).translate(0, 0.65 * s, 0), g[i % 3], i]);
      break;
    }
    case 'bromeliad': { // a low rosette of curved leaves round a bright heart
      for (let i = 0; i < n(7, 10); i++) out.push([new THREE.ConeGeometry(0.1 * s, 0.7 * s, 3).scale(1, 1, 0.3).translate(0, 0.35 * s, 0).rotateZ(-0.8 - (i % 2) * 0.35).rotateY((i / 9) * 6.28 + c.yaw), g[(i + 1) % 3], i]);
      out.push([new THREE.IcosahedronGeometry(0.12 * s, 0).translate(0, 0.25 * s, 0), acc[0], 0]);
      break;
    }
    case 'orchid': { // an arching spray of blooms over two strap leaves
      out.push([limb(0, 0, 0, 0.5 * s, 0.9 * s, 0.1 * s, 0.025 * s, 0.015 * s, 3), COL.leafDeep, 0]);
      for (let i = 0; i < 5; i++) out.push([new THREE.IcosahedronGeometry(0.075 * s, 0).translate((0.5 - i * 0.07) * s * (0.4 + i * 0.15) * 1.2, (0.9 - i * 0.09) * s, 0.1 * s), i % 2 ? acc[1] : 0xc66cf0, i]);
      for (let i = 0; i < 2; i++) out.push([new THREE.ConeGeometry(0.07 * s, 0.7 * s, 3).scale(1, 1, 0.3).translate(0, 0.35 * s, 0).rotateZ(-0.7).rotateY(c.yaw + i * 3.1), COL.leaf, i]);
      break;
    }
    default: { // monstera: broad round leaves on stalks, a lighter heart on each
      for (let i = 0; i < n(3, 5); i++) {
        const a = (i / 4) * 6.28 + c.yaw; const h = (0.7 + (i % 2) * 0.35) * s;
        out.push([limb(0, 0, 0, Math.cos(a) * 0.4 * s, h, Math.sin(a) * 0.4 * s, 0.03 * s, 0.025 * s, 4), COL.leafDeep, i]);
        out.push([leaf(1.0 * s, 0.95 * s, 0.35, a).translate(Math.cos(a) * 0.4 * s, h, Math.sin(a) * 0.4 * s), g[i % 2], i]);
        out.push([leaf(0.5 * s, 0.4 * s, 0.35, a).translate(Math.cos(a) * 0.4 * s, h + 0.03, Math.sin(a) * 0.4 * s), COL.leafLight, i]);
      }
    }
  }
  return out;
}

export function drawFoliage(kit, M) {
  const soft = { noCast: true };
  const { clumps, overhead, vines } = foliagePlan();
  clumps.forEach((c) => { for (const [geo, hex, j] of clumpParts(c)) kit.put('paint', M.paint, paint(stand(geo, c.x, c.z, -0.03), hex, j), soft); });
  // giant leaves held out over her head: a stout stalk from the trunk and a broad paddle with a lighter mid-rib
  overhead.forEach((o, i) => {
    const dx = Math.cos(o.yaw); const dz = Math.sin(o.yaw);
    kit.put('paint', M.paint, paint(limb(o.x, o.y, o.z, o.x + dx * 0.9, o.y + 0.35, o.z + dz * 0.9, 0.06, 0.04, 4), COL.leafDeep, i), soft);
    const pad = leaf(o.len, o.len * 0.6, -0.3, 0).translate(0.9, 0.35, 0).rotateY(-o.yaw).translate(o.x, o.y, o.z);
    kit.put('paint', M.paint, paint(pad, i % 2 ? COL.leaf : COL.leafLight, i), soft);
    kit.put('paint', M.paint, paint(limb(o.x + dx * 0.9, o.y + 0.38, o.z + dz * 0.9, o.x + dx * (0.9 + o.len * 0.9), o.y + 0.38 - o.len * 0.27, o.z + dz * (0.9 + o.len * 0.9), 0.025, 0.012, 3), COL.leafLight, i), soft);
  });
  // vines and lianas: a hanging cord of two bending segments with a leaf at each knot, each its own length
  vines.forEach((v, i) => {
    const sway = ((i * 37) % 7 - 3) * 0.05;
    const y1 = v.y - v.len * 0.55; const y2 = v.y - v.len;
    kit.put('paint', M.paint, paint(limb(v.x, v.y, v.z, v.x + sway, y1, v.z, 0.028, 0.022, 3), COL.leafDeep, i), soft);
    kit.put('paint', M.paint, paint(limb(v.x + sway, y1, v.z, v.x - sway, y2, v.z + sway, 0.022, 0.016, 3), COL.leafDeep, i + 1), soft);
    kit.put('paint', M.paint, paint(leaf(0.4, 0.2, 0.4, i * 1.7).translate(v.x + sway, y1, v.z), COL.leafLight, i), soft);
    kit.put('paint', M.paint, paint(leaf(0.3, 0.16, -0.5, i * 2.3).translate(v.x - sway, y2 + 0.05, v.z + sway), COL.leaf, i), soft);
  });
}
