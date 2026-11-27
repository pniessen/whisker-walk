// =============================================================================
// THE TREEHOUSE VILLAGE: GRASS THAT LOOKS LIKE GRASS (beauty round two, 2026-11-27). The floor was one green carpet. This draws, in the village's own buckets, each from its own
// seeded stream (mulberry32; no clock, no Math.random, no text):
//   * ground tones in patches: dark, mid, sunny and dry-gold slabs a hair over the floor (in the 'paint' bucket, at heights that clear every other ground layer), none over another
//     of its own height;
//   * blade tufts: small clumps of three-sided blades, dark at the root and light at the tip, a few hundred in all, thinning with the distance from the middle of the village, clear
//     of every collider and of the worn track, with wildflower specks on thin stems among them (white, yellow, lilac, pink);
//   * the tufts and specks are ONE non-casting mesh of their own ('tufts'): the village's life hides it on LOW and LITE (treehouselight.js), and the tiers that draw it see it still
//     (nothing in it moves).
// =============================================================================

import * as THREE from 'three';
import { mulberry32 } from '../rng.js';
import * as P from './treehouseplan.js';
import { paint, placed, pad } from './treehouseparts.js';
import { TRACK } from './treehousebeauty.js';
import { drawDetail } from './treehousedetail.js';

const LEVELS = Object.freeze([0.0165, 0.0175, 0.0185, 0.0195, 0.0205, 0.0215, 0.0225]); // half-way between the other ground layers' heights (beauty's 0.017 to 0.022, the track's 0.024)
const TONES = Object.freeze([0x4a7a38, 0x5a8a40, 0x6c9a48, 0x86a850, 0xa0b05a, 0xb4ac5c]); // dark, mid, mid-light, sunny, yellow-green, dry
const WILD = Object.freeze([0xf4f0e6, 0xf2d34a, 0xb89ae0, 0xea8aa6]);

const near = (x, z, list, m) => list.some(([a, b]) => Math.hypot(x - a, z - b) < m);

// A pure plan: { patches: [{ x, z, rx, rz, yaw, y, hex }], tufts: [{ x, z, n, h, hex, tip }], specks: [{ x, z, hex, n, s }] }.
export function planGrass() {
  const cs = P.treehouseColliders();
  const free = (x, z, m) => Math.abs(x) < 29.5 && Math.abs(z) < 29.5 && Math.hypot(x - P.TREEHOUSE_SPAWN.x, z - P.TREEHOUSE_SPAWN.z) > 1.5 && !cs.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + m) && !near(x, z, TRACK, 1.2);
  const patches = [];
  let rng = mulberry32(0x67726173); // 'gras'
  for (let i = 0, tries = 0; i < 44 && tries++ < 400;) {
    const x = (rng() - 0.5) * 60; const z = (rng() - 0.5) * 60;
    const rx = 1.4 + rng() * 2.6; const rz = 1.1 + rng() * 2.0; const y = LEVELS[i % LEVELS.length];
    if (patches.some((p) => p.y === y && Math.hypot(p.x - x, p.z - z) < (p.rx + rx) * 0.95)) continue;
    patches.push({ x, z, rx, rz, yaw: rng() * 3.14, y, hex: TONES[Math.floor(rng() * TONES.length)] });
    i++;
  }
  const tufts = [];
  rng = mulberry32(0x74756674); // 'tuft'
  for (let i = 0, tries = 0; i < 190 && tries++ < 1500;) {
    const x = (rng() - 0.5) * 60; const z = (rng() - 0.5) * 60;
    const d = Math.hypot(x, z - 2);
    if (rng() > Math.max(0, 1 - d / 42) ** 0.8 + 0.12) continue; // thinner the further from the middle
    if (!free(x, z, 0.5)) continue;
    const dry = rng() < 0.2;
    tufts.push({ x, z, n: 4 + Math.floor(rng() * 3), h: 0.2 + rng() * 0.22, hex: dry ? 0x8a8a44 : rng() < 0.5 ? 0x4f8a3c : 0x5f9a45, tip: dry ? 0xc8bc6a : rng() < 0.5 ? 0xa4cc62 : 0x8ec25a, seed: rng() });
    i++;
  }
  const specks = [];
  rng = mulberry32(0x73706563); // 'spec'
  for (let i = 0, tries = 0; i < 34 && tries++ < 600;) {
    const x = (rng() - 0.5) * 58; const z = (rng() - 0.5) * 58;
    if (!free(x, z, 0.7)) continue;
    specks.push({ x, z, hex: WILD[Math.floor(rng() * WILD.length)], n: 2 + Math.floor(rng() * 3), s: 0.8 + rng() * 0.5 });
    i++;
  }
  return { patches, tufts, specks };
}

// A small accumulator of loose triangles with a colour at each corner.
function acc() {
  const pos = []; const col = [];
  return {
    tri(a, b, c, ca, cb, cc) { for (const [p, k] of [[a, ca], [b, cb], [c, cc]]) { pos.push(p[0], p[1], p[2]); col.push(k.r, k.g, k.b); } },
    geometry() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      const up = new Float32Array(pos.length); for (let i = 1; i < up.length; i += 3) up[i] = 1; // every face shades as the ground does: no speckle in the light
      g.setAttribute('normal', new THREE.BufferAttribute(up, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
      return g;
    },
  };
}
// A three-sided blade from (x, 0, z) leaning (dx, dz), `h` tall, `w` across at the root.
function blade(a, x, z, h, dx, dz, w, root, tip) {
  const ring = [0, 1, 2].map((i) => [x + Math.cos((i / 3) * 6.283) * w, 0, z + Math.sin((i / 3) * 6.283) * w]);
  const apex = [x + dx, h, z + dz];
  for (let i = 0; i < 3; i++) a.tri(ring[(i + 1) % 3], ring[i], apex, root, root, tip);
}

export function drawGrass(kit, M) {
  const plan = planGrass();
  for (const p of plan.patches) kit.put('paint', M.paint, paint(placed(pad(7), p.x, p.y + 0.006, p.z, { sx: p.rx, sz: p.rz, yaw: p.yaw }), p.hex, 0));
  const a = acc();
  const c0 = new THREE.Color(); const c1 = new THREE.Color();
  for (const t of plan.tufts) {
    const rng = mulberry32(Math.floor(t.seed * 4294967295));
    c0.setHex(t.hex); c1.setHex(t.tip);
    for (let i = 0; i < t.n; i++) {
      const ang = rng() * 6.283; const d = rng() * 0.1; const lean = 0.04 + rng() * 0.12; const la = rng() * 6.283;
      blade(a, t.x + Math.cos(ang) * d, t.z + Math.sin(ang) * d, t.h * (0.7 + rng() * 0.6), Math.cos(la) * lean, Math.sin(la) * lean, 0.022, c0, c1);
    }
  }
  const stem = new THREE.Color(0x4a7a38); const stemTip = new THREE.Color(0x6a9a48); const bloom = new THREE.Color();
  for (const s of plan.specks) {
    const rng = mulberry32(Math.floor(s.x * 977 + s.z * 131) >>> 0);
    bloom.setHex(s.hex);
    for (let i = 0; i < s.n; i++) {
      const x = s.x + (rng() - 0.5) * 0.5; const z = s.z + (rng() - 0.5) * 0.5; const h = (0.12 + rng() * 0.1) * s.s;
      blade(a, x, z, h, 0, 0, 0.008, stem, stemTip);
      const r = 0.032 * s.s; // the bloom: a four-sided cap on the stem
      const apex = [x, h + 0.035, z];
      const ring = [0, 1, 2, 3].map((k) => [x + Math.cos((k / 4) * 6.283) * r, h - 0.005, z + Math.sin((k / 4) * 6.283) * r]);
      for (let k = 0; k < 4; k++) a.tri(ring[(k + 1) % 4], ring[k], apex, bloom, bloom, bloom);
    }
  }
  drawDetail(a, blade);
  kit.put('tufts', M.leaves, a.geometry(), { noCast: true });
}
