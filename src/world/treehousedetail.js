// =============================================================================
// THE TREEHOUSE VILLAGE: BEAUTY ROUND THREE (2026-11-27), the ground read close up. Fallen autumn leaves round the trunks and stilts,
// clover and daisy patches, pebbles along the worn track and the foot of the oak, and fuller grass beside the track and at every foot
// of wood. None of it is a mesh of its own: grass.js folds these triangles into its one non-casting tufts mesh (hidden on LOW and
// LITE with the rest of it), so the draw count is the one it was. It is paid for by cheaper shapes elsewhere (flat pads for the flat
// ground slabs, which were closed cylinders). Each layer has its own seeded stream (mulberry32); no clock, no Math.random, no text.
// =============================================================================

import * as THREE from 'three';
import { mulberry32 } from '../rng.js';
import * as P from './treehouseplan.js';
import { TRACK } from './treehousebeauty.js';

const AUTUMN = Object.freeze([0xd9a040, 0xc8683a, 0xb8502e, 0xe8c85a, 0x9a7a3a, 0x8a5a30]);
const STONE = Object.freeze([0x9a9588, 0x857f72, 0xa8a090]);
const TAU = Math.PI * 2;
const Y_FLAT = 0.04; // over every ground layer (the track tops out at 0.034)

const col = new THREE.Color();
const clr = (hex, k = 1) => col.clone().setHex(hex).multiplyScalar(k);

// A pure plan: { leaves, patches, pebbles, tufts } (tests read it without THREE).
export function planDetail() {
  const cs = P.treehouseColliders();
  const inside = (x, z, m) => cs.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + m);
  const ok = (x, z, m) => Math.abs(x) < 29 && Math.abs(z) < 29 && Math.hypot(x - P.TREEHOUSE_SPAWN.x, z - P.TREEHOUSE_SPAWN.z) > 1.5 && !inside(x, z, m);
  // a spot near a random collider (a trunk or a stilt), outside its footprint
  const nearWood = (rng, reach) => {
    const c = cs[Math.floor(rng() * cs.length)];
    const a = rng() * TAU; const d = c.r + 0.2 + rng() * reach;
    return [c.x + Math.cos(a) * d, c.z + Math.sin(a) * d];
  };
  const leaves = [];
  let rng = mulberry32(0x6c656166); // 'leaf'
  for (let i = 0, tries = 0; i < 400 && tries++ < 2800;) {
    const [x, z] = rng() < 0.6 ? nearWood(rng, 1.8) : [(rng() - 0.5) * 58, (rng() - 0.5) * 58];
    if (!ok(x, z, 0.1)) continue;
    leaves.push({ x, z, yaw: rng() * TAU, s: 0.1 + rng() * 0.1, hex: AUTUMN[Math.floor(rng() * AUTUMN.length)], k: 1.05 + rng() * 0.35 });
    i++;
  }
  const patches = [];
  rng = mulberry32(0x636c6f76); // 'clov'
  for (let i = 0, tries = 0; i < 30 && tries++ < 700;) {
    const x = (rng() - 0.5) * 54; const z = (rng() - 0.5) * 54;
    if (!ok(x, z, 0.8) || TRACK.some(([a, b]) => Math.hypot(x - a, z - b) < 1.6)) continue;
    const daisies = [];
    const n = 3 + Math.floor(rng() * 3);
    const r = 0.5 + rng() * 0.4;
    for (let k = 0; k < n; k++) { const a = rng() * TAU; const d = Math.sqrt(rng()) * r * 0.9; daisies.push({ x: x + Math.cos(a) * d, z: z + Math.sin(a) * d, pink: rng() < 0.25 }); }
    patches.push({ x, z, r, yaw: rng() * TAU, daisies });
    i++;
  }
  const pebbles = [];
  rng = mulberry32(0x70656262); // 'pebb'
  TRACK.forEach(([tx, tz], i) => {
    for (let k = 0; k < 4; k++) {
      const a = rng() * TAU; const d = 1.0 + rng() * 0.5;
      const x = tx + Math.cos(a) * d; const z = tz + Math.sin(a) * d;
      if (!ok(x, z, 0.1)) continue;
      pebbles.push({ x, z, r: 0.05 + rng() * 0.05, yaw: rng() * TAU, hex: STONE[(i + k) % STONE.length] });
    }
  });
  for (let k = 0; k < 18; k++) { // a loose ring of stones at the foot of the oak
    const a = rng() * TAU; const d = P.OAK.r + 0.5 + rng() * 1.4;
    const x = P.OAK.x + Math.cos(a) * d; const z = P.OAK.z + Math.sin(a) * d;
    if (ok(x, z, 0.1)) pebbles.push({ x, z, r: 0.05 + rng() * 0.06, yaw: rng() * TAU, hex: STONE[k % STONE.length] });
  }
  const tufts = [];
  rng = mulberry32(0x65646765); // 'edge'
  for (let i = 0, tries = 0; i < 90 && tries++ < 1000;) {
    let x; let z;
    if (i % 2) { // beside the track
      const [tx, tz] = TRACK[Math.floor(rng() * TRACK.length)]; const a = rng() * TAU; const d = 1.5 + rng() * 0.8;
      x = tx + Math.cos(a) * d; z = tz + Math.sin(a) * d;
    } else [x, z] = nearWood(rng, 0.7); // at the foot of a trunk or stilt
    if (!ok(x, z, 0.15)) continue;
    const dry = rng() < 0.2;
    tufts.push({ x, z, n: 4, h: 0.25 + rng() * 0.25, hex: dry ? 0x8a8a44 : 0x4f8a3c, tip: dry ? 0xc8bc6a : 0x9ccc62, seed: rng() });
    i++;
  }
  return { leaves, patches, pebbles, tufts };
}

// Draws the plan into the grass accumulator `a` (its tri(), and blade() as grass.js has it).
export function drawDetail(a, blade) {
  const plan = planDetail();
  for (const l of plan.leaves) { // a leaf: two triangles, a diamond lying on the ground, a little darker at its stem end
    const c = clr(l.hex, l.k); const d = clr(l.hex, l.k * 0.7);
    const ca = Math.cos(l.yaw); const sa = Math.sin(l.yaw); const w = l.s * 0.5;
    const p = (u, v) => [l.x + ca * u - sa * v, Y_FLAT, l.z + sa * u + ca * v];
    a.tri(p(-l.s, 0), p(0, w), p(0, -w), d, c, c);
    a.tri(p(l.s, 0), p(0, -w), p(0, w), c, c, c);
  }
  const clover = clr(0x5aa04a); const cloverDark = clr(0x3f8040); const white = clr(0xf4f0e6); const pink = clr(0xf0a6c0);
  for (const p of plan.patches) { // a clover disc of five triangles, daisies standing on it
    for (let k = 0; k < 5; k++) {
      const a0 = p.yaw + (k / 5) * TAU; const a1 = p.yaw + ((k + 1) / 5) * TAU;
      a.tri([p.x, 0.036, p.z], [p.x + Math.cos(a1) * p.r, 0.036, p.z + Math.sin(a1) * p.r], [p.x + Math.cos(a0) * p.r, 0.036, p.z + Math.sin(a0) * p.r], cloverDark, clover, clover);
    }
    for (const d of p.daisies) {
      const r = 0.06; const bloom = d.pink ? pink : white; const centre = clr(0xf4c93a);
      const ring = [0, 1, 2, 3].map((k) => [d.x + Math.cos(k * 1.5708 + 0.4) * r, 0.05, d.z + Math.sin(k * 1.5708 + 0.4) * r]);
      for (let k = 0; k < 4; k++) a.tri(ring[(k + 1) % 4], ring[k], [d.x, 0.075, d.z], bloom, bloom, centre);
    }
  }
  for (const s of plan.pebbles) { // a pebble: a squashed four-sided stone
    const c = clr(s.hex); const dk = clr(s.hex, 0.75);
    const ring = [0, 1, 2].map((k) => [s.x + Math.cos(s.yaw + (k / 3) * TAU) * s.r, 0.03, s.z + Math.sin(s.yaw + (k / 3) * TAU) * s.r]);
    const top = [s.x, 0.03 + s.r * 0.7, s.z];
    for (let k = 0; k < 3; k++) a.tri(ring[(k + 1) % 3], ring[k], top, dk, dk, c);
    a.tri(ring[0], ring[1], ring[2], dk, dk, dk); // under: never seen, but it keeps the stone closed under any tilt of the view
  }
  for (const t of plan.tufts) {
    const rng = mulberry32(Math.floor(t.seed * 4294967295));
    const c0 = clr(t.hex); const c1 = clr(t.tip);
    for (let i = 0; i < t.n; i++) {
      const ang = rng() * TAU; const d = rng() * 0.1; const lean = 0.04 + rng() * 0.12; const la = rng() * TAU;
      blade(a, t.x + Math.cos(ang) * d, t.z + Math.sin(ang) * d, t.h * (0.7 + rng() * 0.6), Math.cos(la) * lean, Math.sin(la) * lean, 0.022, c0, c1);
    }
  }
}
