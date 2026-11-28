// =============================================================================
// THE TREEHOUSE VILLAGE: BEAUTY ROUND FOUR (2026-11-28), the decks and bridges read lived in. All of it is folded into the village's EXISTING non-casting buckets ('leaves', 'glow') and its
// existing tufts mesh (hidden on LOW and LITE): no new mesh, no caster, no light, nothing that moves, no collider and no perch. Each layer has its own seeded stream where it needs one
// (mulberry32); no clock, no Math.random, no text.
//   * lantern hoods: a little copper cap over every hanging lantern (deck corners and bridge ends), so each reads as a lamp and the glow sits under a roof;
//   * flower boxes hung outside the deck rails in each zone's hue (the blooms and the trailing leaves are in the tufts mesh, so LOW and LITE keep the plain boxes);
//   * bridge wear: plank seams across every span, a worn pale track down the middle, and a few mended boards;
//   * doormats and cushions on the huts' decks (zone hues), a folded blanket on the far platform; a carved name-plate over the Bakery door and the Bell Tower's;
//   * wind chimes hung from the Bakery's and the Bookshop's eaves (brass rods on a little hat);
//   * moss on the stilts and tufts of leaves along the great limbs (all above CANOPY_MIN_Y).
// A pure plan (planTrim) says where; tests read it without drawing.
// =============================================================================

import * as THREE from 'three';
import { mulberry32 } from '../rng.js';
import * as P from './treehouseplan.js';
import { paint, placed, blob, beam, post } from './treehouseparts.js';
import { ZONES } from './treehousebeauty.js';

export const TRIM = { on: true }; // the picture page switches this off for its 'before' shots
const L = P.TREE_LOOK;
const TAU = Math.PI * 2;
const ZONE_OF = Object.freeze({ bakery: 'bakery', books: 'books', far: 'books', crown: 'crown' });
const EDGE_OPENS = Object.freeze({ bakery: { e: [8.2] }, books: { n: [7.7], w: [1.1] }, far: { w: [-7.6] } });
const SUPPER = Object.freeze({ x: 2.9, z: -15.6 }); // the supper table (treehousewingplan.js TABLE)
const BAG = Object.freeze({ x: 7.4, z: 2.9 });
const CUSHION = Object.freeze({ x: -11.5, z: 10.5 }); // the Bakery's cat cushion (treehousecatparts.js; not imported, to keep that stage chunk out of this one)
const RAIL_SEAT = Object.freeze((() => { const k = P.deckOf('far'); return { x: k.x + 0.6, z: k.z - k.d / 2 }; })());

const segDist = (px, pz, ax, az, bx, bz) => {
  const dx = bx - ax; const dz = bz - az; const l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2));
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
};
// Is (x, z) clear of every stair, bridge, the cat places, the supper and the bag by `m` metres?
function clear(x, z, m) {
  if (P.STAIRS.some((k) => segDist(x, z, k.x0, k.z0, k.x1, k.z1) < k.w / 2 + m)) return false;
  for (const line of P.BRIDGE_LINES) for (let i = 0; i + 1 < line.length; i++) if (segDist(x, z, line[i].x, line[i].z, line[i + 1].x, line[i + 1].z) < 0.6 + m) return false;
  if (Math.hypot(x - CUSHION.x, z - CUSHION.z) < 1.0 + m || Math.hypot(x - RAIL_SEAT.x, z - RAIL_SEAT.z) < 1.0 + m) return false;
  if (Math.hypot(x - SUPPER.x, z - SUPPER.z) < 1.9 + m || Math.hypot(x - BAG.x, z - BAG.z) < 0.6 + m) return false;
  return true;
}

// The pure plan: { hoods, boxes, seams, wear, mends, mats, cushions, blankets, plates, chimes, moss, limbTufts }.
export function planTrim() {
  const hoods = [];
  for (const k of P.DECKS) for (const sx of [-1, 1]) hoods.push({ x: k.x + (sx * k.w) / 2, y: k.y + P.RAIL_H + 0.7, z: k.z - k.d / 2 });
  for (const line of P.BRIDGE_LINES) for (const p of [line[0], line.at(-1), line[Math.floor(line.length / 2)]]) hoods.push({ x: p.x, y: p.y + P.RAIL_H + 0.8, z: p.z });

  // flower boxes, hung outside a rail (north edge: z0; west/east edges: x0/x1), off the openings, the stairs and the cats
  const boxes = [];
  const cand = [['bakery', 'n', -1.4], ['bakery', 'n', 1.4], ['books', 'n', 1.2], ['far', 'n', -1.1], ['crown', 'w', 1.6], ['crown', 'e', 1.6], ['crown', 'w', -1.2], ['crown', 'e', -1.2]];
  for (const [id, edge, off] of cand) {
    const k = P.deckOf(id);
    const north = edge === 'n';
    const x = north ? k.x + off : k.x + (edge === 'w' ? -k.w / 2 - 0.16 : k.w / 2 + 0.16);
    const z = north ? k.z - k.d / 2 - 0.16 : k.z + off;
    const along = north ? x : z;
    const o = (EDGE_OPENS[id] ?? {})[edge] ?? [];
    if (o.some((c) => Math.abs(along - c) < 1.3)) continue;
    if (!clear(north ? x : x + (edge === 'w' ? 0.4 : -0.4), north ? z + 0.4 : z, 0.3)) continue;
    if (id === 'crown' && north) continue;
    boxes.push({ id, x, z, y: k.y + P.RAIL_H - 0.04, yaw: north ? 0 : Math.PI / 2, out: north ? [0, -1] : [edge === 'w' ? -1 : 1, 0], hues: ZONES[ZONE_OF[id]].hues });
  }

  // bridge wear: for each span, seams every 0.55 m, a worn pale strip, and mended boards
  const seams = []; const wear = []; const mends = [];
  const rng = mulberry32(0x77656172); // 'wear'
  for (const line of P.BRIDGE_LINES) {
    for (let i = 0; i + 1 < line.length; i++) {
      const a = line[i]; const c = line[i + 1];
      const len = Math.hypot(c.x - a.x, c.z - a.z); const yaw = Math.atan2(c.x - a.x, c.z - a.z);
      const n = Math.max(1, Math.floor(len / 0.55));
      for (let j = 1; j < n; j++) { const t = (j / n) * len; seams.push({ x: a.x + Math.sin(yaw) * t, z: a.z + Math.cos(yaw) * t, y: a.y, yaw }); }
      wear.push({ x: (a.x + c.x) / 2, z: (a.z + c.z) / 2, y: a.y, yaw, len });
      if (rng() < 0.7) { const t = (0.2 + rng() * 0.6) * len; mends.push({ x: a.x + Math.sin(yaw) * t, z: a.z + Math.cos(yaw) * t, y: a.y, yaw, side: rng() < 0.5 ? -0.25 : 0.25 }); }
    }
  }

  // rugs, cushions and the blanket on the decks
  const mats = []; const cushions = []; const blankets = []; const plates = []; const chimes = [];
  for (const k of P.DECKS) {
    const hues = ZONES[ZONE_OF[k.id]].hues;
    const h = k.hut;
    if (h) {
      const door = h.roof === 'bell' ? { x: h.x, z: h.z + h.r * 0.95 } : { x: h.x + h.r * 0.2, z: h.z + h.r };
      const mz = door.z + 0.85;
      if (mz < k.z + k.d / 2 - 0.3 && clear(door.x, mz, 0.1)) mats.push({ x: door.x, z: mz, y: k.y, hues });
    }
    const x0 = k.x - k.w / 2; const x1 = k.x + k.w / 2; const z0 = k.z - k.d / 2; const z1 = k.z + k.d / 2;
    const spots = [[x0 + 0.7, z0 + 0.7], [x1 - 0.7, z0 + 0.7], [x0 + 0.7, z1 - 0.7], [x1 - 0.7, z1 - 0.7]];
    let n = 0;
    for (const [x, z] of spots) {
      if (n >= 2 || !clear(x, z, 0.5) || (h && Math.hypot(x - h.x, z - h.z) < h.r + 0.7)) continue;
      cushions.push({ x, z, y: k.y, hex: hues[n % hues.length], yaw: (x * 3 + z) % 3 });
      n++;
    }
    if (k.id === 'far') for (const [x, z] of [[x0 + 0.9, z1 - 0.8], [x1 - 0.9, z1 - 0.9]]) if (clear(x, z, 0.5)) { blankets.push({ x, z, y: k.y, yaw: 0.3, hex: hues[1] }); break; }
  }
  const bk = P.deckOf('bakery'); const bt = P.deckOf('crown');
  plates.push({ x: bk.hut.x + bk.hut.r * 0.2, y: bk.y + 2.05, z: bk.hut.z + bk.hut.r + 0.07, kind: 'loaf' });
  plates.push({ x: bt.hut.x + 1.0, y: bt.y + 1.55, z: bt.hut.z + bt.hut.r * 0.95 + 0.07, kind: 'bell' });
  for (const [id, a] of [['bakery', 0.8], ['books', -0.8]]) { const k = P.deckOf(id); const R = k.hut.r + 0.45; chimes.push({ x: k.hut.x + Math.sin(a) * (R - 0.15), y: k.y + k.hut.h - 0.02, z: k.hut.z + Math.cos(a) * (R - 0.15), id }); }

  // moss on the stilts, tufts of leaves under the great limbs
  const moss = [];
  const mr = mulberry32(0x6d6f7373); // 'moss'
  for (const k of P.DECKS) for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) for (let j = 0; j < 2; j++) {
    const a = mr() * TAU; const y = 0.3 + (j ? 0.5 : 0) * Math.min(2.2, k.y - 0.8) + mr() * 0.5;
    moss.push({ x: k.x + (sx * k.w) / 2 + Math.cos(a) * 0.2, y, z: k.z + (sz * k.d) / 2 + Math.sin(a) * 0.2, s: 0.2 + mr() * 0.1 });
  }
  const limbTufts = [];
  const O = P.OAK;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + 0.6;
    for (const t of [0.5, 0.78]) limbTufts.push({ x: O.x + Math.cos(a) * 5.5 * t, y: O.h - 3 + 4.5 * t - 0.45, z: O.z + Math.sin(a) * 5.5 * t, s: 0.5 + mr() * 0.25, hue: mr() });
  }
  return { hoods, boxes, seams, wear, mends, mats, cushions, blankets, plates, chimes, moss, limbTufts };
}

const flat = (w, d, x, y, z, yaw, hex) => paint(placed(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), x, y, z, { yaw }), hex);
const lo = (kit, M, g) => kit.put('leaves', M.leaves, g, { noCast: true });

export function drawTrim(kit, M) {
  if (!TRIM.on) return;
  const plan = planTrim();
  for (const h of plan.hoods) lo(kit, M, paint(placed(new THREE.ConeGeometry(0.2, 0.16, 6, 1, true), h.x, h.y + 0.19, h.z), 0x8a4a30));
  for (const b of plan.boxes) {
    lo(kit, M, paint(placed(new THREE.BoxGeometry(0.72, 0.2, 0.2), b.x, b.y, b.z, { yaw: b.yaw }), 0x9a6a3a, 1));
    lo(kit, M, paint(placed(new THREE.BoxGeometry(0.66, 0.05, 0.16), b.x, b.y + 0.1, b.z, { yaw: b.yaw }), 0x4a6a32)); // the soil, under the blooms
  }
  for (const s of plan.wear) lo(kit, M, flat(0.4, s.len, s.x, s.y - 0.0155, s.z, s.yaw, 0xc9a070));
  for (const s of plan.mends) lo(kit, M, flat(0.5, 0.42, s.x + Math.cos(s.yaw) * s.side, s.y - 0.0145, s.z - Math.sin(s.yaw) * s.side, s.yaw, 0xb48a58));
  for (const s of plan.seams) lo(kit, M, flat(1.12, 0.03, s.x, s.y - 0.0135, s.z, s.yaw, 0x6a4a2c));
  for (const m of plan.mats) {
    lo(kit, M, flat(1.3, 0.8, m.x, m.y + 0.016, m.z, 0, m.hues[0]));
    m.hues.forEach((hex, i) => lo(kit, M, flat(1.3, 0.14, m.x, m.y + 0.018, m.z - 0.22 + i * 0.22, 0, i === 0 ? 0xf2ece0 : hex)));
  }
  for (const c of plan.cushions) {
    lo(kit, M, paint(placed(new THREE.IcosahedronGeometry(1, 0), c.x, c.y + 0.1, c.z, { sx: 0.34, sy: 0.14, sz: 0.34, yaw: c.yaw }), c.hex, 1));
    lo(kit, M, paint(placed(new THREE.OctahedronGeometry(0.05, 0), c.x, c.y + 0.235, c.z), 0xf0d060)); // the button
  }
  for (const b of plan.blankets) {
    lo(kit, M, paint(placed(new THREE.BoxGeometry(0.9, 0.08, 0.6), b.x, b.y + 0.05, b.z, { yaw: b.yaw }), b.hex, 1));
    lo(kit, M, paint(placed(new THREE.BoxGeometry(0.92, 0.09, 0.1), b.x, b.y + 0.05, b.z, { yaw: b.yaw }), 0xf2ece0)); // a cream stripe
  }
  for (const p of plan.plates) { // a carved name-plate on two little chains
    lo(kit, M, paint(placed(new THREE.BoxGeometry(0.62, 0.24, 0.05), p.x, p.y, p.z), 0x7a5230, 1));
    lo(kit, M, paint(placed(new THREE.BoxGeometry(0.54, 0.16, 0.06), p.x, p.y, p.z + 0.005), 0xd8b070)); // the carved panel
    if (p.kind === 'loaf') lo(kit, M, paint(placed(new THREE.IcosahedronGeometry(1, 0), p.x, p.y, p.z + 0.04, { sx: 0.17, sy: 0.07, sz: 0.04 }), 0xb8702e));
    else lo(kit, M, paint(placed(new THREE.ConeGeometry(0.08, 0.13, 5), p.x, p.y, p.z + 0.04), L.bell));
    for (const s of [-1, 1]) lo(kit, M, beam(p.x + s * 0.24, p.y + 0.12, p.z, p.x + s * 0.24, p.y + 0.32, p.z, 0.015, L.rope));
  }
  for (const c of plan.chimes) { // a little hat on a cord, four brass rods of different lengths and a clapper sail
    lo(kit, M, beam(c.x, c.y, c.z, c.x, c.y - 0.4, c.z, 0.012, L.rope));
    lo(kit, M, paint(placed(new THREE.ConeGeometry(0.14, 0.07, 6, 1, true), c.x, c.y - 0.42, c.z), 0x8a5a3a));
    [0.3, 0.42, 0.24, 0.36].forEach((len, i) => { const a = (i / 4) * TAU; lo(kit, M, paint(placed(new THREE.CylinderGeometry(0.012, 0.012, len, 4, 1, true), c.x + Math.cos(a) * 0.08, c.y - 0.45 - len / 2, c.z + Math.sin(a) * 0.08), 0xe0c070)); });
    lo(kit, M, paint(placed(new THREE.OctahedronGeometry(0.04, 0), c.x, c.y - 0.62, c.z, { sy: 1.4 }), 0xc8a050));
  }
  for (const m of plan.moss) lo(kit, M, blob(m.x, m.y, m.z, m.s, 0x86b050, m.x * 3 + m.y, 0, 0.6));
  for (const t of plan.limbTufts) lo(kit, M, blob(t.x, t.y, t.z, t.s, t.hue < 0.5 ? L.leaf : L.leafLight, t.hue * 4, 0, 0.7));
}

// The blooms in the flower boxes and the strands trailing from them: into the tufts mesh's accumulator `a` (its tri(), and blade() as treehousegrass.js has it).
export function drawTrimTufts(a, blade) {
  if (!TRIM.on) return;
  const plan = planTrim();
  const rng = mulberry32(0x626c6f6d); // 'blom'
  const c = new THREE.Color(); const stem = new THREE.Color(0x4a7a38); const tip = new THREE.Color(0x8ec25a); const trail = new THREE.Color(0x4f8a3c); const trailTip = new THREE.Color(0x7cbc54);
  for (const b of plan.boxes) {
    const cs = Math.cos(b.yaw); const sn = Math.sin(b.yaw);
    for (let i = 0; i < 5; i++) {
      const u = -0.28 + i * 0.14; const x = b.x + cs * u; const z = b.z - sn * u;
      const h = 0.1 + rng() * 0.1;
      c.setHex(b.hues[i % b.hues.length]);
      const yb = b.y + 0.12;
      const ring = [0, 1, 2, 3].map((k) => [x + Math.cos((k / 4) * TAU) * 0.055, yb + h, z + Math.sin((k / 4) * TAU) * 0.055]);
      for (let k = 0; k < 4; k++) a.tri(ring[(k + 1) % 4], ring[k], [x, yb + h + 0.05, z], c, c, c);
      a.tri([x - 0.015, yb, z], [x + 0.015, yb, z], [x, yb + h, z], stem, stem, tip);
    }
    for (let i = 0; i < 3; i++) { // trailing strands over the front lip
      const u = -0.24 + i * 0.24 + rng() * 0.05; const x = b.x + cs * u; const z = b.z - sn * u;
      const [ox, oz] = b.out; const px = -oz * 0.03; const pz = ox * 0.03; // across the box, for the strand's width
      a.tri([x - px + ox * 0.1, b.y + 0.1, z - pz + oz * 0.1], [x + px + ox * 0.1, b.y + 0.1, z + pz + oz * 0.1], [x + ox * 0.14, b.y - 0.2 - rng() * 0.12, z + oz * 0.14], trail, trail, trailTip);
    }
  }
}
