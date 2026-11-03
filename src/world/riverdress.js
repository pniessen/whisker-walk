import * as THREE from 'three';
import { hash01, waterGap, inWater } from './builder.js';
import { segDist } from '../segdist.js';
import { DISCS } from '../rivalclans.js';
import { colorParts, dressMesh, paintMesh, ribbon, smoothField, bothSidesLit } from './dressing.js';
import {
  RIVER_WATERS, RIVER_PATHS, RIVER_KEEP_CLEAR, RIVER_DECKS, RIVER_LOG, RIVER_STONES,
  RIVER_MEADOW, RIVER_REEDBED, RIVER_FALLEN_LOG, SPAWN, WATER_LOOK, riverTrees, riverLilyPads,
} from './river.js';

// =============================================================================
// The River and Marshes' marsh dressing (polish-rivermoor Task 2).
//
// The River used to read as a wide pale lawn with a stream through it. This
// makes it a marsh: peaty mud along every bank and round the pools, the
// ground tinted wet olive by the water and patchy straw and lush green away
// from it, grass tussocks over the open ground, clumps of cattails on the
// banks, a few grey-green osier clumps, more lily pads (some flowering) in
// the river margins, and moss on the log bridge's flanks and on the rims of
// some stepping stones.
//
// Looks only. Everything is in two noCast meshes (`dressing`, `groundPaint`);
// nothing has a collider or a perch, nothing is walkable, and a cat walks
// through every prop as it does through the reeds. Every prop keeps off the
// paths, the finds, the decks, the spawn, the camp and the fallen log
// (fitsLow), and stands no taller than its class: tussocks 0.45 m, osiers
// 0.9 m, cattails 1.3 m and only on a bank.
//
// river.js imports this module and this module imports river.js, so nothing
// at this module's top level may read river.js's bindings: every list is
// worked out on first call and kept.
// =============================================================================

const BOUNDS = { minX: -50, maxX: 50, minZ: -50, maxZ: 50 };
const inBounds = (x, z) => x >= BOUNDS.minX && x <= BOUNDS.maxX && z >= BOUNDS.minZ && z <= BOUNDS.maxZ;
const r2 = (v) => Math.round(v * 100) / 100;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const rectDist = (d, x, z) => Math.hypot(
  Math.max(d.minX - x, 0, x - d.maxX), Math.max(d.minZ - z, 0, z - d.maxZ));
// How far (x, z) is from the nearest water's edge, decks ignored (negative
// inside the water).
const waterDist = (x, z) => {
  let m = Infinity;
  for (const w of RIVER_WATERS) m = Math.min(m, waterGap(w, x, z));
  return m;
};
const byId = (id) => RIVER_WATERS.find((w) => w.id === id);

const once = (fn) => { let v; return () => (v ??= fn()); };
const trunks = once(() => { const t = riverTrees(); return [...t.willows, ...t.alders, ...t.pines]; });
const openWaters = once(() => RIVER_WATERS.map((w) => ({ ...w, decks: [] })));

// The clearances, per class (brief values). `bank` is the band a cattail
// stands in, measured from the nearest water's edge; `meadow` whether the wet
// meadow round the first POI may have it.
export const LOW_RULES = Object.freeze({
  tussock: Object.freeze({ water: 0.3, deck: 2, path: 1.9, clear: 1.5, meadow: true }),
  cattail: Object.freeze({ water: 0, bank: Object.freeze([0.2, 0.9]), deck: 2, path: 2.3, clear: 3, meadow: false }),
  shrub: Object.freeze({ water: 1.0, deck: 4, path: 2.8, clear: 3, meadow: false }),
});

export function fitsLow(x, z, rule) {
  if (!inBounds(x, z)) return false;
  const wd = waterDist(x, z);
  if (wd < rule.water) return false;
  if (rule.bank && (wd < rule.bank[0] || wd > rule.bank[1])) return false;
  if (RIVER_DECKS.some((d) => rectDist(d, x, z) < rule.deck)) return false;
  if (RIVER_PATHS.some((s) => segDist(x, z, ...s) < rule.path)) return false;
  if (RIVER_KEEP_CLEAR.some(([px, pz]) => Math.hypot(x - px, z - pz) < rule.clear)) return false;
  if (Math.hypot(x - SPAWN.x, z - SPAWN.z) < 4) return false;
  const disc = DISCS.river;
  if (Math.hypot(x - disc.cx, z - disc.cz) < disc.r + 1) return false;
  if (segDist(x, z, ...RIVER_FALLEN_LOG) < 1.5) return false;
  if (!rule.meadow && Math.hypot(x - RIVER_MEADOW.x, z - RIVER_MEADOW.z) < RIVER_MEADOW.r) return false;
  return trunks().every((t) => Math.hypot(x - t.x, z - t.z) >= 0.8 * t.scale);
}

// Points along each visible shore edge of a rect water, inside the bounds:
// { x, z, nx, nz } with (nx, nz) pointing out of the water. `ids` picks the
// waters, `only` (optional) overrides which of their shores.
function shoreSamples(step, waters) {
  const out = [];
  for (const [id, only] of waters) {
    const w = byId(id);
    for (const edge of only ?? WATER_LOOK[id].shores) {
      const alongX = edge === 'minZ' || edge === 'maxZ';
      const lo = alongX ? Math.max(w.minX, BOUNDS.minX) : Math.max(w.minZ, BOUNDS.minZ);
      const hi = alongX ? Math.min(w.maxX, BOUNDS.maxX) : Math.min(w.maxZ, BOUNDS.maxZ);
      const fixed = w[edge];
      const sign = edge.startsWith('max') ? 1 : -1;
      const run = [];
      const n = Math.max(1, Math.round((hi - lo) / step));
      for (let i = 0; i <= n; i++) {
        const v = lo + ((hi - lo) * i) / n;
        run.push(alongX
          ? { x: v, z: fixed, nx: 0, nz: sign }
          : { x: fixed, z: v, nx: sign, nz: 0 });
      }
      out.push({ id, edge, run });
    }
  }
  return out;
}
const RIVERS = [['river-west'], ['river-bend'], ['river-east']];
const BANK_WATERS = [...RIVERS, ['lake', ['minX', 'maxZ']]];
const ROUND_WATERS = ['pool-1', 'pool-2', 'pool-3', 'pond'];

// Points on a ring `off` metres out from a round water's edge, every `step` m
// (the pond's west half only: its east half is the Woods').
function ringSamples(step, off) {
  const out = [];
  for (const id of ROUND_WATERS) {
    const c = byId(id);
    const from = id === 'pond' ? Math.PI / 2 : 0;
    const sweep = id === 'pond' ? Math.PI : Math.PI * 2;
    const r = c.r + off;
    const n = Math.round((sweep * r) / step);
    for (let i = 0; i < n; i++) {
      const a = from + (sweep * (i + 0.5)) / n;
      out.push({ x: c.x + Math.cos(a) * r, z: c.z + Math.sin(a) * r, nx: Math.cos(a), nz: Math.sin(a) });
    }
  }
  return out;
}

// --- tussocks -------------------------------------------------------------------
// Clumps of two to four tussocks over the open ground, the wet meadow too.
// More in the west reedbed's margin and round the pools, fewer in the drier
// south-east. Clump centres come off a jittered grid, each kept with its
// area's weight, and are taken in hash order (so the cap thins evenly rather
// than filling the north first).
export const MAX_TUSSOCKS = 400;
function tussockWeight(x, z) {
  const reed = rectDist(RIVER_REEDBED, x, z);
  if (reed < 5) return 0.95;
  for (const id of ['pool-1', 'pool-2', 'pool-3']) {
    const p = byId(id);
    if (Math.hypot(x - p.x, z - p.z) < p.r + 6) return 0.95;
  }
  if (waterDist(x, z) < 4) return 0.7;
  // the open meadow and the drier south-east carry most of the rest
  return x > 10 && z > 8 ? 0.55 : 0.75;
}
export const riverTussocks = once(() => {
  const STEP = 3.2;
  const cands = [];
  for (let gz = BOUNDS.minZ + STEP / 2; gz < BOUNDS.maxZ; gz += STEP) {
    for (let gx = BOUNDS.minX + STEP / 2; gx < BOUNDS.maxX; gx += STEP) {
      const x = gx + (hash01(gx, gz, 101) * 2 - 1) * 1.2;
      const z = gz + (hash01(gx, gz, 115) * 2 - 1) * 1.2;
      if (hash01(gx, gz, 129) < tussockWeight(x, z)) cands.push({ x, z, order: hash01(gx, gz, 143) });
    }
  }
  cands.sort((a, b) => a.order - b.order);
  const out = [];
  for (const c of cands) {
    const n = 2 + Math.floor(hash01(c.x, c.z, 157) * 3);
    for (let k = 0; k < n && out.length < MAX_TUSSOCKS; k++) {
      const a = hash01(c.x + k, c.z, 171) * Math.PI * 2;
      const d = k === 0 ? 0 : 0.45 + 0.5 * hash01(c.x, c.z + k, 185);
      const x = r2(c.x + Math.cos(a) * d);
      const z = r2(c.z + Math.sin(a) * d);
      if (!fitsLow(x, z, LOW_RULES.tussock)) continue;
      if (out.some((t) => Math.hypot(t.x - x, t.z - z) < 0.5)) continue;
      const h = r2(0.25 + 0.2 * hash01(x, z, 199));
      const s = r2(0.8 + 0.4 * hash01(z, x, 213));
      out.push(Object.freeze({ x, z, h, s }));
    }
    if (out.length >= MAX_TUSSOCKS) break;
  }
  return Object.freeze(out);
});

// --- cattails -------------------------------------------------------------------
// Clumps of three to five on the banks, half a metre from the water, at least
// 3.5 m apart, on the rivers, the lakeshore, round the pools and the pond.
export const MAX_CATTAILS = 80;
export const riverCattails = once(() => {
  const centres = [];
  for (const { run } of shoreSamples(1.5, BANK_WATERS)) {
    for (const p of run) centres.push({ x: p.x + p.nx * 0.55, z: p.z + p.nz * 0.55, tx: -p.nz, tz: p.nx });
  }
  for (const p of ringSamples(1.5, 0.55)) centres.push({ x: p.x, z: p.z, tx: -p.nz, tz: p.nx });
  for (const c of centres) c.order = hash01(c.x, c.z, 227);
  centres.sort((a, b) => a.order - b.order);
  const out = [];
  const kept = [];
  for (const c of centres) {
    if (out.length >= MAX_CATTAILS - 2) break;
    if (kept.some((k) => Math.hypot(k.x - c.x, k.z - c.z) < 3.5)) continue;
    if (!fitsLow(c.x, c.z, LOW_RULES.cattail)) continue;
    const n = Math.min(3 + Math.floor(hash01(c.x, c.z, 241) * 3), MAX_CATTAILS - out.length);
    const stems = [];
    for (let k = 0; k < n; k++) {
      // spread along the bank, a little in and out
      const along = (k - (n - 1) / 2) * 0.22 + (hash01(c.x + k, c.z, 255) - 0.5) * 0.12;
      const across = (hash01(c.x, c.z + k, 269) - 0.5) * 0.3;
      const x = r2(c.x + c.tx * along + c.tz * across);
      const z = r2(c.z + c.tz * along - c.tx * across);
      if (!fitsLow(x, z, LOW_RULES.cattail)) continue;
      stems.push(Object.freeze({ x, z, h: r2(1.0 + 0.3 * hash01(x, z, 283)) }));
    }
    if (stems.length < 3) continue;
    kept.push(c);
    out.push(...stems);
  }
  return Object.freeze(out);
});

// --- osier clumps -----------------------------------------------------------------
// A few low willow bushes a couple of metres back from the banks, 6 m apart.
export const MAX_SHRUBS = 12;
export const riverShrubs = once(() => {
  const cands = [];
  for (const { run } of shoreSamples(3, BANK_WATERS)) {
    for (const p of run) {
      const off = 1.8 + 0.8 * hash01(p.x, p.z, 297);
      cands.push({ x: p.x + p.nx * off, z: p.z + p.nz * off });
    }
  }
  for (const p of ringSamples(3, 2)) cands.push({ x: p.x, z: p.z });
  for (const c of cands) c.order = hash01(c.x, c.z, 311);
  cands.sort((a, b) => a.order - b.order);
  const out = [];
  for (const c of cands) {
    if (out.length >= MAX_SHRUBS) break;
    const x = r2(c.x), z = r2(c.z);
    if (!fitsLow(x, z, LOW_RULES.shrub)) continue;
    if (out.some((s) => Math.hypot(s.x - x, s.z - z) < 6)) continue;
    out.push(Object.freeze({ x, z, r: r2(0.45 + 0.15 * hash01(x, z, 325)) }));
  }
  return Object.freeze(out);
});

// --- lily pads in the river margins -------------------------------------------------
// In the slack water along the rivers' real banks (a shore with dry land
// behind it), 0.4-1.0 m in from the edge, in patches, 3 m clear of each deck.
export const MAX_EXTRA_PADS = 45;
export const riverExtraPads = once(() => {
  const cands = [];
  for (const { run } of shoreSamples(0.9, RIVERS)) {
    for (const p of run) {
      if (waterDist(p.x + p.nx * 0.3, p.z + p.nz * 0.3) <= 0) continue; // no bank behind
      const patch = smoothField(p.x, p.z, 339, 9);
      if (hash01(p.x, p.z, 353) > (patch > 0.15 ? 0.75 : 0.08)) continue;
      const depth = 0.4 + 0.6 * hash01(p.z, p.x, 367);
      const x = r2(p.x - p.nx * depth + (hash01(p.x, p.z, 381) - 0.5) * 0.3 * Math.abs(p.nz));
      const z = r2(p.z - p.nz * depth + (hash01(p.z, p.x, 395) - 0.5) * 0.3 * Math.abs(p.nx));
      cands.push({ x, z, order: hash01(x, z, 409) });
    }
  }
  cands.sort((a, b) => a.order - b.order);
  const out = [];
  for (const { x, z } of cands) {
    if (out.length >= MAX_EXTRA_PADS) break;
    if (!inBounds(x, z) || !inWater(openWaters(), x, z)) continue;
    if (-waterDist(x, z) < 0.4) continue;
    if (RIVER_DECKS.some((d) => rectDist(d, x, z) < 3)) continue;
    if (out.some((p) => Math.hypot(p.x - x, p.z - z) < 0.75)) continue;
    out.push(Object.freeze({ x, z, r: r2(0.22 + 0.16 * hash01(x, z, 423)) }));
  }
  return Object.freeze(out);
});

// Water lilies open on about three pads in ten: pink or white, a yellow heart.
const PINK = 0xf0a0c0;
const WHITE = 0xf4f0e6;
export const riverFlowers = once(() => {
  const out = [];
  for (const p of [...riverLilyPads(), ...riverExtraPads()]) {
    if (hash01(p.x, p.z, 437) >= 0.3) continue;
    const a = hash01(p.z, p.x, 451) * Math.PI * 2;
    const d = p.r * 0.3;
    out.push(Object.freeze({
      x: r2(p.x + Math.cos(a) * d), z: r2(p.z + Math.sin(a) * d),
      color: hash01(p.x, p.z, 465) < 0.55 ? PINK : WHITE,
    }));
  }
  return Object.freeze(out);
});

// --- the ground tint -----------------------------------------------------------------
// Multiplies the lawn's vertex colour: wet olive within 6 m of the water and
// in damp hollows (about 14 m across) out on the open ground, broad patches
// of dry straw and of deep lush green (about 22 m across), and the west
// reedbed peaty. Bolder than the brief's first multipliers (fix round 1
// ruling): a wide shot has to show the marsh's colour, not a flat wash.
const WET = [0.68, 0.82, 0.62];
const DRY = [1.18, 1.08, 0.74];
const LUSH = [0.66, 0.86, 0.6];
const PEATY = [0.78, 0.8, 0.64];
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export function riverGroundTint(x, z) {
  const near = smoothstep(0, 0.7, 1 - waterDist(x, z) / 6);
  const hollow = smoothstep(0.25, 0.6, smoothField(x, z, 81, 14)) * 0.85;
  const wet = Math.max(near, hollow);
  const dry = smoothstep(0.05, 0.45, smoothField(x, z, 41, 22)) * (1 - wet);
  const lush = smoothstep(-0.1, 0.3, smoothField(x, z, 61, 22)) * (1 - dry);
  const reed = 1 - smoothstep(0, 4, rectDist(RIVER_REEDBED, x, z));
  let m = [1, 1, 1];
  m = lerp3(m, DRY, dry);
  m = lerp3(m, LUSH, lush);
  m = lerp3(m, PEATY, reed);
  return lerp3(m, WET, wet);
}

// --- geometry -----------------------------------------------------------------------
const _c = new THREE.Color();
const lin = (hex) => { _c.setHex(hex); return [_c.r, _c.g, _c.b]; };
const scale3 = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

// Collects raw triangles (position, normal, colour per vertex) into one
// geometry with colorParts' attributes, so it merges with the rest.
class Tris {
  constructor() { this.p = []; this.n = []; this.c = []; }
  v(x, y, z, n, c) { this.p.push(x, y, z); this.n.push(n[0], n[1], n[2]); this.c.push(c[0], c[1], c[2]); }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.p), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(this.n), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.c), 3));
    return g;
  }
}
const unit = (x, y, z) => { const l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; };

// Six tapered blades, each one triangle, splayed out from the root: olive at
// the root to straw at the tip.
const T_ROOT = lin(0x6f7f3e);
const T_TIP = lin(0xb8b070);
function addTussocks(tris) {
  for (const t of riverTussocks()) {
    const tone = 0.82 + 0.22 * hash01(t.x, t.z, 479);
    const root = scale3(T_ROOT, tone);
    const tip = scale3(T_TIP, tone);
    for (let k = 0; k < 6; k++) {
      const a = ((k + hash01(t.x + k, t.z, 493) * 0.7) / 6) * Math.PI * 2;
      const dx = Math.cos(a), dz = Math.sin(a);
      const bx = t.x + dx * 0.04 * t.s, bz = t.z + dz * 0.04 * t.s;
      const w = 0.055 * t.s;
      const lean = (0.14 + 0.16 * hash01(t.z, t.x + k, 507)) * t.s;
      const h = t.h * (0.72 + 0.28 * hash01(t.x, t.z + k, 521));
      // the tip curls a little sideways, so the blades don't look stamped
      const curl = (hash01(t.x + k, t.z + k, 535) - 0.5) * 0.08;
      const tx = t.x + dx * lean - dz * curl, tz = t.z + dz * lean + dx * curl;
      const n = unit(dx * 0.5, 1, dz * 0.5);
      tris.v(bx - dz * w, 0, bz + dx * w, n, root);
      tris.v(bx + dz * w, 0, bz - dx * w, n, root);
      tris.v(tx, h, tz, n, tip);
    }
  }
}

// A cattail: two crossed thin quads for the stem and a four-sided brown head
// near the top, the whole leaning a little (a shear, so it never grows).
const C_STEM = lin(0x6a7d3a);
const C_HEAD = lin(0x5a3a22);
function addCattails(tris) {
  for (const c of riverCattails()) {
    const lx = (hash01(c.x, c.z, 549) - 0.5) * 0.16;
    const lz = (hash01(c.z, c.x, 563) - 0.5) * 0.16;
    const at = (x, y, z) => [c.x + x + (lx * y) / c.h, y, c.z + z + (lz * y) / c.h];
    const quad = (a, b, d, e, n, col) => {
      for (const q of [a, b, e, a, e, d]) tris.v(...at(...q), n, col);
    };
    const w = 0.0125;
    quad([-w, 0, 0], [w, 0, 0], [-w, c.h, 0], [w, c.h, 0], unit(0, 0.6, 1), C_STEM);
    quad([0, 0, -w], [0, 0, w], [0, c.h, -w], [0, c.h, w], unit(1, 0.6, 0), C_STEM);
    const hw = 0.025;
    const y0 = c.h - 0.05 - 0.22, y1 = c.h - 0.05;
    const sides = [
      [[-hw, -hw], [hw, -hw], [0, -1]], [[hw, -hw], [hw, hw], [1, 0]],
      [[hw, hw], [-hw, hw], [0, 1]], [[-hw, hw], [-hw, -hw], [-1, 0]],
    ];
    for (const [[ax, az], [bx, bz], [nx, nz]] of sides) {
      quad([ax, y0, az], [bx, y0, bz], [ax, y1, az], [bx, y1, bz], unit(nx, 0.3, nz), C_HEAD);
    }
  }
}

// An osier clump: two squashed lobes on the ground and one sitting on them,
// grey-green willow, darker underneath.
const WILLOW = lin(0x7f9a6a);
function shrubParts() {
  const parts = [];
  for (const s of riverShrubs()) {
    const tone = 0.9 + 0.15 * hash01(s.x, s.z, 577);
    for (let k = 0; k < 3; k++) {
      const lr = s.r * (k === 2 ? 0.62 : 0.55);
      const a = hash01(s.x + k, s.z, 591) * Math.PI * 2;
      const off = k === 2 ? 0.05 : s.r * 0.42;
      const cx = s.x + Math.cos(a + k * Math.PI) * off;
      const cz = s.z + Math.sin(a + k * Math.PI) * off;
      const sy = 0.8;
      const cy = k === 2 ? 0.88 - lr * sy : lr * sy * 0.55;
      const g = new THREE.IcosahedronGeometry(lr, 0);
      g.scale(1, sy, 1);
      g.rotateY(hash01(s.z, s.x + k, 605) * Math.PI);
      g.translate(cx, cy, cz);
      const part = colorParts(g, (x, y, z) => {
        const k2 = tone * (0.8 + 0.32 * clamp01(y / 0.85)) * (0.94 + 0.12 * hash01(x * 7, z * 7, 619));
        return scale3(WILLOW, k2);
      });
      // rounded normals, so a lobe reads as soft leaves rather than a stone
      const pos = part.attributes.position;
      const nrm = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        const n = unit(pos.getX(i) - cx, (pos.getY(i) - cy) / (sy * sy), pos.getZ(i) - cz);
        nrm.set(n, i * 3);
      }
      part.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
      parts.push(part);
    }
  }
  return parts;
}

// More lily pads, notched like builder.lilyPads', and the open flowers.
const PAD = lin(0x4f8a3a);
const HEART = lin(0xf0cc48);
function padParts() {
  const parts = [];
  riverExtraPads().forEach((p, i) => {
    const notch = hash01(p.x, p.z, 633 + i) * Math.PI * 2;
    const g = new THREE.CircleGeometry(p.r, 10, notch, Math.PI * 2 - 0.5);
    g.rotateX(-Math.PI / 2);
    g.translate(p.x, 0.06, p.z);
    parts.push(colorParts(g, scale3(PAD, 0.92 + 0.14 * hash01(p.z, p.x, 647))));
  });
  for (const f of riverFlowers()) {
    const cup = new THREE.ConeGeometry(0.09, 0.07, 5, 1, true);
    cup.rotateX(Math.PI);
    cup.rotateY(hash01(f.x, f.z, 661) * Math.PI);
    cup.translate(f.x, 0.07 + 0.035, f.z);
    const petal = lin(f.color);
    // the petals blush deeper toward the heart
    const cupPart = colorParts(cup, (x, y) => scale3(petal, 0.82 + 0.18 * clamp01((y - 0.07) / 0.07)));
    // The cup is an open shell seen from inside (from above), so its normals
    // must face in and up: turned over, the cone's own point out and down,
    // and bothSidesLit would light the petals from underneath.
    const cn = cupPart.attributes.normal;
    for (let i = 0; i < cn.count; i++) cn.setXYZ(i, -cn.getX(i), -cn.getY(i), -cn.getZ(i));
    parts.push(cupPart);
    const heart = new THREE.IcosahedronGeometry(0.025, 0);
    heart.translate(f.x, 0.095, f.z);
    parts.push(colorParts(heart, HEART));
  }
  return parts;
}

// Moss on the log bridge: strips of a slightly larger partial cylinder along
// each round flank, from just under the ground up to just below the flat
// deck's edge (never on the deck), and three broken branch stubs.
const MOSS_DARK = lin(0x5f7a32);
const MOSS_LIGHT = lin(0x7f9440);
const BARK = lin(0x6e4a2c);
function logMossParts() {
  const L = RIVER_LOG;
  const r = L.w / 2;
  const hw = Math.min(L.flat / 2, r * 0.98);
  const c = Math.sqrt(r * r - hw * hw);
  const yc = L.top - c; // the trunk's axis
  const phi = Math.atan2(c, hw); // the flat's edge, from +x
  const len = L.maxZ - L.minZ;
  const parts = [];
  const PER_SIDE = 12;
  for (const side of [1, -1]) {
    for (let k = 0; k < PER_SIDE; k++) {
      const hs = hash01(k, side, 675);
      const plen = 0.4 + 0.4 * hash01(k, side, 689);
      const zc = L.minZ + plen / 2 + (len - plen) * ((k + 0.5 * hs) / PER_SIDE);
      const psi0 = 0.6 + 0.08 * hash01(side, k, 703);
      const psi1 = phi - 0.02 - 0.08 * hash01(side + k, k, 717);
      const start = side > 0 ? Math.PI / 2 - psi1 : psi0 - Math.PI / 2;
      const g = new THREE.CylinderGeometry(r * 1.02, r * 1.02, plen, 6, 1, true, start, psi1 - psi0);
      g.rotateX(-Math.PI / 2);
      g.translate(L.x, yc, zc);
      const tone = hash01(k, side, 731);
      parts.push(colorParts(g, (x, y) => {
        const t = clamp01(0.3 * tone + 0.7 * clamp01((y - (L.top - 0.15)) / 0.15));
        return lerp3(MOSS_DARK, MOSS_LIGHT, t);
      }));
    }
  }
  for (let k = 0; k < 3; k++) {
    const side = k % 2 ? -1 : 1;
    const z = L.minZ + len * (0.22 + 0.28 * k) + (hash01(k, 3, 745) - 0.5) * 0.6;
    const psi = 0.74;
    const sx = L.x + side * r * Math.cos(psi) * 0.98;
    const sy = yc + r * Math.sin(psi) * 0.98;
    const g = new THREE.CylinderGeometry(0.045, 0.075, 0.3, 5);
    g.translate(0, 0.15, 0);
    g.rotateZ(-side * (Math.PI / 2 - 0.45));
    g.rotateY((hash01(k, 7, 759) - 0.5) * 0.8 * side);
    g.translate(sx, sy, z);
    parts.push(colorParts(g, (x, y) => scale3(BARK, 0.9 + 0.5 * clamp01((y - sy) / 0.15))));
  }
  return parts;
}

// Flat moss caps on the rims of six of the fourteen stepping stones, on the
// east or west rim (the stones overlap along the ford), never the middle.
const STONE_MOSS = lin(0x6f8a3a);
function stoneMossParts() {
  const S = RIVER_STONES;
  const picks = Array.from({ length: S.n }, (_, i) => i)
    .sort((a, b) => hash01(a, 7, 773) - hash01(b, 7, 773))
    .slice(0, 6);
  const parts = [];
  for (const i of picks) {
    const f = i / (S.n - 1);
    const sx = S.x;
    const sz = S.z1 + (S.z2 - S.z1) * f;
    const r = S.rMin + (S.rMax - S.rMin) * hash01(i, 3, 61);
    const top = 0.1 + (i % 2 ? -0.5 : 0.5) * S.stagger;
    const a = (hash01(i, 5, 787) < 0.5 ? 0 : Math.PI) + (hash01(i, 6, 801) - 0.5) * 0.9;
    const d = r * 0.88 * 0.78;
    const g = new THREE.IcosahedronGeometry(0.2, 0);
    g.scale(1.3, 0.12, 0.9);
    g.rotateY(-a + Math.PI / 2);
    g.translate(sx + Math.cos(a) * d, top + 0.002, sz + Math.sin(a) * d);
    parts.push(colorParts(g, (x, y, z) => scale3(STONE_MOSS, 0.85 + 0.3 * hash01(x * 9, z * 9, 815))));
  }
  return parts;
}

// --- the paint ------------------------------------------------------------------------
// Peaty mud: a ribbon 0.1-1.3 m out along every visible river and lake bank
// inside the bounds, and round each pool and the pond (the brief's blob of
// water r + 0.9, drawn as a ring: the shallow water is see-through, and a
// filled disc turned the pools brown from above). Each is broken where it
// would cross a deck or run under other water.
// A soft olive-brown, darkest at the water and lighter toward the grass
// (fix round 1: the plain peat read as a harsh dark band).
const PEAT_DARK = lin(0x655a3a);
const PEAT_LIGHT = lin(0x7a7448);
const PEAT_EDGE = lin(0x8a8a56);
const peat = (x, y, z) => {
  const c = lerp3(PEAT_DARK, PEAT_LIGHT, hash01(Math.round(x * 1.5), Math.round(z * 1.5), 829));
  return lerp3(c, PEAT_EDGE, smoothstep(0.5, 1.3, waterDist(x, z)));
};
function paintParts() {
  const parts = [];
  let salt = 843;
  const runs = shoreSamples(0.5, BANK_WATERS).map((s) => s.run);
  for (const id of ROUND_WATERS) {
    const w = byId(id);
    const n = Math.round((Math.PI * 2 * w.r) / 0.5);
    const ring = [];
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      ring.push({ x: w.x + Math.cos(a) * w.r, z: w.z + Math.sin(a) * w.r, nx: Math.cos(a), nz: Math.sin(a) });
    }
    runs.push(ring);
  }
  for (const run of runs) {
    let pts = [];
    const flush = () => {
      if (pts.length >= 2) parts.push(colorParts(ribbon(pts, 0.6, { salt: salt++, wobble: 0.35, step: 0.8 }), peat));
      pts = [];
    };
    for (const p of run) {
      const x = p.x + p.nx * 0.7, z = p.z + p.nz * 0.7;
      const ok = inBounds(x, z) && waterDist(x, z) >= 0.45
        && RIVER_DECKS.every((d) => rectDist(d, x, z) >= 1.4);
      if (ok) pts.push([x, z]); else flush();
    }
    flush();
  }
  return parts;
}

// Builds the two meshes and adds them to the scene. The caller wraps this in
// withLocalUuids('river-dressing', ...): every Three object made here draws
// Math.random for its uuid.
export function addRiverDressing(scene) {
  const tris = new Tris();
  addTussocks(tris);
  addCattails(tris);
  const dressing = dressMesh([
    tris.geometry(), ...shrubParts(), ...padParts(), ...logMossParts(), ...stoneMossParts(),
  ], { name: 'dressing', side: THREE.DoubleSide });
  bothSidesLit(dressing.material);
  const paint = paintMesh(paintParts(), { name: 'groundPaint' });
  scene.add(paint);
  scene.add(dressing);
  return { dressing, paint };
}
