// =============================================================================
// THE TREEHOUSE VILLAGE: THE BEAUTY ROUND (milestone T8). Scored against docs/beauty-backlog.md section 2, the weakest lines were: (1) ground variation (one green floor and litter),
// (2) mid-height clutter (ferns only), (4) a colour accent for each zone (all green and brown), (5) light through the foliage (the dapple only). What it draws, all of it in the
// village's existing merged buckets (paint, leaves) plus ONE non-casting 'shafts' mesh (additive, no shadow):
//   * ground: a worn dirt track from the spawn to the Bakery stair and the roots, dark shade under every deck, moss patches, and pale clearings;
//   * clutter: flower clumps in each zone's own hue (the roots poppy red, the Bakery warm orange and rose, the Bookshop blue and violet, the Crown gold and lilac), mushroom
//     clumps, stumps and fallen logs, each clear of every collider and of the track;
//   * accent hues: a string of pennants along each deck's back and side rails in that zone's colours, and vines hanging from the deck edges;
//   * foliage: a few autumn-gold, copper and blossom blobs under the canopy (all above CANOPY_MIN_Y, so the camera at zoom step 2 never meets them), and soft shafts of sun
//     down through the gaps (the village's life dims them on LOW and LITE, breathes them slowly, and holds them still under reduced motion).
// Every layer has its own seeded stream (mulberry32), so no existing layout moves. No clock, no Math.random, no text. Built by the walk's build (treehouse.js, ST.lift.draw).
// =============================================================================

import * as THREE from 'three';
import { mulberry32 } from '../rng.js';
import * as P from './treehouseplan.js';
import { paint, placed, post, blob } from './treehouseparts.js';
import { SHAFT_OPACITY } from './treehouselight.js';

const L = P.TREE_LOOK;

// Each zone's accent colours (flowers, pennants), by zone.
export const ZONES = Object.freeze({
  roots: Object.freeze({ id: 'roots', x: 0, z: 21, r: 9, hues: [0xd8483a, 0xf2ece0, 0xe8a23a] }),
  bakery: Object.freeze({ id: 'bakery', x: -12, z: 13, r: 9, hues: [0xe9843a, 0xe27a8e, 0xf2c04a] }),
  books: Object.freeze({ id: 'books', x: 13, z: 5, r: 9, hues: [0x4a78d8, 0x8a64c8, 0x62b8d4] }),
  crown: Object.freeze({ id: 'crown', x: -2, z: -14, r: 9, hues: [0xe8c04a, 0xa88ad8, 0xf0eadc] }),
});
const DECK_ZONE = Object.freeze({ bakery: 'bakery', books: 'books', far: 'books', crown: 'crown' });

// The dirt track: a chain of centres [x, z], each drawn as a worn ellipse.
export const TRACK = Object.freeze([[0, 24.5], [-1, 21], [-3, 18], [-5.4, 15.8], [-7.4, 14.6], [-3, 17], [-1.6, 13], [-0.6, 8], [-0.4, 3], [0, -1], [0, -2.6]]);
const offTrack = (x, z, m) => TRACK.every(([tx, tz]) => Math.hypot(x - tx, z - tz) > m);

// Is (x, z) open ground: inside the walk, 1 m clear of colliders, off the track, outside a deck's stilts?
function open(x, z, cs, margin = 1) {
  if (Math.abs(x) > 28 || Math.abs(z) > 28) return false;
  if (Math.hypot(x - P.TREEHOUSE_SPAWN.x, z - P.TREEHOUSE_SPAWN.z) < 2.5) return false;
  if (cs.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + margin)) return false;
  return offTrack(x, z, 1.4);
}

// A pure plan of every placement: { patches, clumps, mushrooms, stumps, logs, vines, leaves, shafts } (tests read it without THREE).
export function planBeauty() {
  const cs = P.treehouseColliders();
  const patches = [];
  let rng = mulberry32(0x67726f75); // 'grou'
  for (let i = 0; i < 16; i++) { // moss and pale clearings
    const x = (rng() - 0.5) * 56; const z = (rng() - 0.5) * 56;
    const moss = rng() < 0.65;
    patches.push({ x, z, sx: 1.3 + rng() * 2.2, sz: 1.0 + rng() * 1.8, yaw: rng() * 3.14, hex: moss ? 0x75a64a : 0x9aa655, tone: rng(), y: 0.017 + (i % 4) * 0.001 });
  }
  const clumps = [];
  rng = mulberry32(0x666c6f77); // 'flow'
  for (const z of Object.values(ZONES)) {
    for (let i = 0, tries = 0; i < 5 && tries++ < 80;) {
      const a = rng() * 6.28; const d = Math.sqrt(rng()) * z.r;
      const x = z.x + Math.cos(a) * d; const zz = z.z + Math.sin(a) * d;
      if (!open(x, zz, cs, 1.2)) continue;
      const hex = z.hues[Math.floor(rng() * z.hues.length)];
      clumps.push({ x, z: zz, hex, zone: z.id, n: 4 + Math.floor(rng() * 3), s: 0.8 + rng() * 0.5 });
      i++;
    }
  }
  const mushrooms = [];
  rng = mulberry32(0x6d757368); // 'mush'
  for (let i = 0, tries = 0; i < 12 && tries++ < 200;) {
    const x = (rng() - 0.5) * 52; const z = (rng() - 0.5) * 52;
    if (!open(x, z, cs, 1.2)) continue;
    mushrooms.push({ x, z, cap: rng() < 0.5 ? 0xd8483a : 0xe8b46a, n: 3 + Math.floor(rng() * 3), s: 0.8 + rng() * 0.6, yaw: rng() * 6.28 });
    i++;
  }
  const stumps = [];
  const logs = [];
  rng = mulberry32(0x73747570); // 'stup'
  for (let i = 0, tries = 0; i < 6 && tries++ < 200;) {
    const x = (rng() - 0.5) * 54; const z = (rng() - 0.5) * 54;
    if (!open(x, z, cs, 1.6)) continue;
    stumps.push({ x, z, r: 0.4 + rng() * 0.3, h: 0.35 + rng() * 0.35 });
    i++;
  }
  for (let i = 0, tries = 0; i < 5 && tries++ < 200;) {
    const x = (rng() - 0.5) * 54; const z = (rng() - 0.5) * 54;
    if (!open(x, z, cs, 2.2)) continue;
    logs.push({ x, z, len: 1.8 + rng() * 1.4, r: 0.22 + rng() * 0.1, yaw: rng() * 3.14 });
    i++;
  }
  const vines = [];
  rng = mulberry32(0x76696e65); // 'vine'
  for (const k of P.DECKS) {
    for (let i = 0; i < 8; i++) {
      const side = i % 4; const t = (i + 0.3 + rng() * 0.4) / 8;
      // a vine hangs from the back edge, the two sides, or beyond the front's gap, never over the 2.4 m gap itself
      const x = side === 0 ? k.x - k.w / 2 + t * k.w : side === 1 ? k.x - k.w / 2 : side === 2 ? k.x + k.w / 2 : k.x + (t < 0.5 ? -1 : 1) * (1.8 + rng() * (k.w / 2 - 1.9));
      const z = side === 0 ? k.z - k.d / 2 : side === 3 ? k.z + k.d / 2 : k.z - k.d / 2 + t * k.d;
      vines.push({ x, z, y: k.y - P.DECK_THICK, len: 0.7 + rng() * 0.9, hex: rng() < 0.5 ? L.leaf : L.leafLight });
    }
  }
  const leaves = [];
  rng = mulberry32(0x61757475); // 'autu'
  const warm = [0xd9a040, 0xc8683a, 0xe8a0b0, 0xe8c85a];
  for (let i = 0; i < 26; i++) {
    const a = rng() * Math.PI * 2; const r = Math.sqrt(rng()) * 27;
    leaves.push({ x: Math.cos(a) * r, z: Math.sin(a) * r - 4, y: P.CANOPY_MIN_Y + 1.5 + rng() * 3.5, s: 0.9 + rng() * 1.1, hex: warm[Math.floor(rng() * warm.length)] });
  }
  const shafts = [];
  rng = mulberry32(0x73686166); // 'shaf'
  for (let i = 0, tries = 0; i < 10 && tries++ < 100;) {
    const x = (rng() - 0.5) * 50; const z = (rng() - 0.5) * 50 + 2;
    if (Math.hypot(x - P.OAK.x, z - P.OAK.z) < P.OAK.r + 2.5) continue;
    shafts.push({ x, z, rTop: 0.5 + rng() * 0.6, rBot: 1.2 + rng() * 1.2, lean: 0.35 + rng() * 0.1, bright: 0.6 + rng() * 0.4 });
    i++;
  }
  return { patches, clumps, mushrooms, stumps, logs, vines, leaves, shafts };
}

// The ground's tones, drawn as thin slabs just over the floor (layered by height, so none flickers over another).
function drawGround(kit, M, plan) {
  const flat = (x, z, sx, sz, y, hex, jit = 0, yaw = 0) => kit.put('paint', M.paint, paint(placed(new THREE.CylinderGeometry(1, 1, 0.012, 14), x, y, z, { sx, sz, yaw }), hex, jit));
  for (const p of plan.patches) flat(p.x, p.z, p.sx, p.sz, p.y, p.hex, p.tone, p.yaw);
  for (const k of P.DECKS) flat(k.x, k.z, k.w * 0.62, k.d * 0.62, 0.021, 0x3d6636, 0); // the shade under each deck
  flat(P.OAK.x, P.OAK.z, P.OAK.r + 2.8, P.OAK.r + 2.8, 0.022, 0x4a7038, 0); // the shade at the oak's foot
  TRACK.forEach(([x, z], i) => { // the worn track: dirt, a darker edge ring under it
    const w = 1.1 + (i % 3) * 0.12;
    flat(x, z, w + 0.2, w + 0.2, 0.024, 0x86714a, 0, i);
    flat(x, z, w, w, 0.027 + (i % 3) * 0.0006, i % 2 ? 0x8f7a50 : 0x977f55, (i % 4) * 0.4, i * 1.7);
  });
}

function drawClutter(kit, M, plan) {
  for (const c of plan.clumps) {
    for (let i = 0; i < c.n; i++) {
      const a = (i / c.n) * 6.28 + c.x; const d = 0.25 + ((i * 37) % 10) / 20;
      const x = c.x + Math.cos(a) * d; const z = c.z + Math.sin(a) * d; const h = (0.28 + ((i * 13) % 7) * 0.035) * c.s;
      kit.put('leaves', M.leaves, post(x, z, 0, h, 0.012, 0.012, L.leafDark, 4), { noCast: true });
      kit.put('leaves', M.leaves, paint(placed(new THREE.IcosahedronGeometry(1, 0), x, h + 0.02, z, { sx: 0.07 * c.s, sy: 0.05 * c.s, sz: 0.07 * c.s }), c.hex, i * 0.6), { noCast: true });
    }
    kit.put('leaves', M.leaves, blob(c.x, 0.1, c.z, 0.38 * c.s, L.leaf, c.n, 0, 0.35), { noCast: true }); // the leaves the flowers stand in
  }
  for (const m of plan.mushrooms) {
    for (let i = 0; i < m.n; i++) {
      const a = m.yaw + i * 2.1; const d = 0.1 + i * 0.12; const s = m.s * (1 - i * 0.18);
      const x = m.x + Math.cos(a) * d; const z = m.z + Math.sin(a) * d;
      kit.put('paint', M.paint, post(x, z, 0, 0.18 * s, 0.03 * s, 0.04 * s, 0xf0e6d0, 5));
      kit.put('paint', M.paint, paint(placed(new THREE.SphereGeometry(1, 7, 4, 0, 6.283, 0, 1.6), x, 0.16 * s, z, { sx: 0.12 * s, sy: 0.08 * s, sz: 0.12 * s }), m.cap, i));
    }
  }
  for (const s of plan.stumps) {
    kit.put('paint', M.paint, post(s.x, s.z, 0, s.h, s.r, s.r * 1.12, L.trunk, 8, 1));
    kit.put('paint', M.paint, paint(placed(new THREE.CylinderGeometry(s.r * 0.9, s.r * 0.9, 0.02, 8), s.x, s.h + 0.012, s.z), 0xc9a070));
  }
  for (const l of plan.logs) {
    kit.put('paint', M.paint, paint(placed(new THREE.CylinderGeometry(l.r, l.r, l.len, 7), l.x, l.r * 0.9, l.z, { pitch: Math.PI / 2, yaw: l.yaw }), L.trunkDark, 1));
    kit.put('leaves', M.leaves, blob(l.x + Math.sin(l.yaw) * l.len * 0.2, l.r * 1.7, l.z + Math.cos(l.yaw) * l.len * 0.2, 0.3, 0x6f9a44, 1, 0, 0.3), { noCast: true }); // moss on the log
  }
}

// Pennants along each deck's back and side rails, in the zone's colours; vines from the deck edges.
function drawAccents(kit, M, plan) {
  for (const k of P.DECKS) {
    const hues = ZONES[DECK_ZONE[k.id]].hues;
    const x0 = k.x - k.w / 2; const x1 = k.x + k.w / 2; const z0 = k.z - k.d / 2; const z1 = k.z + k.d / 2;
    const y = k.y + P.RAIL_H - 0.14;
    let n = 0;
    const run = (ax, az, bx, bz, out) => {
      const len = Math.hypot(bx - ax, bz - az); const m = Math.max(2, Math.round(len / 0.7));
      for (let i = 0; i < m; i++) {
        const t = (i + 0.5) / m;
        const px = ax + (bx - ax) * t + out[0]; const pz = az + (bz - az) * t + out[1];
        kit.put('paint', M.paint, paint(placed(new THREE.ConeGeometry(0.1, 0.26, 3), px, y - 0.04, pz, { pitch: Math.PI, yaw: Math.atan2(bx - ax, bz - az) + Math.PI / 2 }), hues[n++ % hues.length], n));
      }
    };
    run(x0, z0, x1, z0, [0, -0.05]);
    run(x0, z0, x0, z1, [-0.05, 0]);
    run(x1, z0, x1, z1, [0.05, 0]);
  }
  for (const v of plan.vines) {
    kit.put('leaves', M.leaves, post(v.x, v.z, v.y - v.len, v.y, 0.018, 0.018, L.leafDark, 4), { noCast: true });
    for (let i = 0; i < 3; i++) kit.put('leaves', M.leaves, blob(v.x + (i % 2 ? 0.05 : -0.05), v.y - v.len * (0.25 + i * 0.3), v.z, 0.15 + (2 - i) * 0.03, v.hex, i, 0, 0.6), { noCast: true });
  }
  for (const l of plan.leaves) kit.put('leaves', M.leaves, blob(l.x, l.y, l.z, l.s, l.hex, l.s * 3, 1, 0.75), { noCast: true });
}

// The shafts: open tapered tubes, bright at the top and fading to nothing at the floor (additive: black adds nothing), leaning the way the sun does.
let _mat = null;
export function shaftMaterial() {
  _mat ??= new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: SHAFT_OPACITY, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  return _mat;
}
const TOP_Y = 12.5;
function shaftGeometry(s) {
  const sides = 7; const pos = []; const col = []; const c = new THREE.Color(0xfff2c0);
  const ring = (y, r, ox, oz, a) => Array.from({ length: sides }, (_, i) => [s.x + ox + Math.cos((i / sides) * 6.283) * r, y, s.z + oz + Math.sin((i / sides) * 6.283) * r, a]);
  const top = ring(TOP_Y, s.rTop, -s.lean * TOP_Y, -s.lean * TOP_Y * 0.4, s.bright * 0.5);
  const bot = ring(0.05, s.rBot, 0, 0, 0);
  const put = (p) => { pos.push(p[0], p[1], p[2]); col.push(c.r * p[3], c.g * p[3], c.b * p[3]); };
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    for (const p of [top[i], bot[i], top[j], top[j], bot[i], bot[j]]) put(p);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  return g;
}

// drawBeauty(kit, M): everything above, into the walk's kit. The shafts are their own bucket ('shafts', no shadow).
export function drawBeauty(kit, M) {
  const plan = planBeauty();
  drawGround(kit, M, plan);
  drawClutter(kit, M, plan);
  drawAccents(kit, M, plan);
  for (const s of plan.shafts) kit.put('shafts', shaftMaterial(), shaftGeometry(s), { noCast: true });
}
