// =============================================================================
// THE TREEHOUSE VILLAGE: BEAUTY PASS 4, STORIES IN THE DETAILS (2026-11-28). Who lives in each house, readable from the play camera, with NO letters anywhere:
//   * the BAKERY: its window gets mullions, a cooling rack of loaves and flour dust, and a floury sill under it; the Bookshop's window is a shelf of coloured spines, its hanging sign a hand-painted open book,
//     a patchwork rug in the reading nook on its deck, and a lantern-lit message board of coloured paper notes (pictograms, not words) on the hut wall;
//   * the BELL TOWER: the bell rope is striped red and cream, with a trail of pigeon feathers on the deck below it; a tiny telescope on the Crown deck's rail points out over the village;
//   * the far platform: a hammock slung between two posts, with a patchwork quilt; the post box's little sign is a painted envelope;
//   * the HIGH BRIDGE: a string of bright flags on both ropes and a four-colour kite on a line.
// The drawn things are PAID FOR by trimmed unseen geometry elsewhere in the village (treehouseparts.js: no underside caps on posts, flat plank seams, open hut cylinders): this file adds a few hundred
// triangles in the existing merged buckets, no mesh, no caster, no light, no collider, no perch. The painted parts are `decals`: small rectangles in world space that the village's own shader paints
// onto whatever lies inside them (treehouseglow.js reads `decals()` and the GLSL below; the kind numbers below are the shader's).
// A pure plan (talesPlan) says where; tests read it without drawing.
// =============================================================================

import * as THREE from 'three';
import * as P from './treehouseplan.js';
import { paint, placed, slab, post, beam, postGeo, lantern } from './treehouseparts.js';
import { planTrim } from './treehousetrim.js';

const L = P.TREE_LOOK;
export const TALE_SLOTS = 12; // the shader's decal array
// kinds: 1 bakery window, 2 flour sill (flat), 3 book spines, 4 painted book sign, 5 painted envelope, 6 message board, 7 striped rope, 11 rug (flat), 12 quilt (flat), 13 pigeon feathers (flat); a kind of 10 or more lies flat
export const KIND = Object.freeze({ bakeryGlass: 1, sill: 2, spines: 3, bookSign: 4, envelope: 5, board: 6, rope: 7, rug: 11, quilt: 12, feathers: 13 });

const r2 = (v) => Math.round(v * 100) / 100;
const normal = (yaw) => ({ x: Math.sin(yaw), z: Math.cos(yaw) });

// The hammock on the far platform: along z, just inside the west rail, clear of the north-west cushion and the south-west blanket.
export function hammockPlan() {
  const k = P.deckOf('far');
  const x = k.x - k.w / 2 + 0.55;
  return { x, y: k.y, z0: k.z - 0.7, z1: k.z + 1.2, hang: 0.95, low: 0.6, w: 0.55 };
}
// The telescope on the Crown deck's west rail, looking out over the village.
export function telescopePlan() {
  const k = P.deckOf('crown');
  return { x: k.x - k.w / 2 + 0.5, y: k.y, z: k.z + 0.5, yaw: 1.9 };
}
// The kite and the flags on the high bridge (the rope bridge from the far platform towards the Crown, level 4.2).
export function highBridgePlan() {
  const line = P.BRIDGE_LINES[1];
  const flags = [];
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i]; const c = line[i + 1];
    const yaw = Math.atan2(c.x - a.x, c.z - a.z); const len = Math.hypot(c.x - a.x, c.z - a.z);
    const n = Math.max(2, Math.round(len / 0.5));
    for (const s of [1, -1]) {
      const ox = Math.cos(yaw) * 0.6 * s; const oz = -Math.sin(yaw) * 0.6 * s;
      for (let j = 0; j < n; j++) { const t = (j + 0.5) / n; flags.push({ x: a.x + (c.x - a.x) * t + ox, y: a.y + P.RAIL_H - 0.06, z: a.z + (c.z - a.z) * t + oz, yaw, i: flags.length }); }
    }
  }
  const m = line[1];
  const kite = { x: m.x + 1.6, y: m.y + P.RAIL_H + 2.6, z: m.z - 0.4, tieX: m.x + 0.6, tieZ: m.z, tieY: m.y + P.RAIL_H };
  return { flags, kite };
}
export const FLAG_HUES = Object.freeze([0xe8483a, 0xf2b630, 0x4aa86a, 0x3a86d8, 0xd86ab0, 0xf0ece0]);
const KITE_HUES = Object.freeze([0xe8483a, 0xf2c038, 0x3a8ad8, 0x4aa86a]);

// The Bookshop's message board, on the hut's flat wall facet that faces the deck: the facet's apothem and normal (a 12-sided hut: facet centres at 15 + 30k degrees).
export function boardPlan() {
  const k = P.deckOf('books'); const h = k.hut;
  const th = (285 * Math.PI) / 180;
  const n = { x: Math.sin(th), z: Math.cos(th) };
  const ap = h.r * Math.cos(Math.PI / 12);
  return { x: h.x + n.x * ap, y: k.y + 1.35, z: h.z + n.z * ap, yaw: Math.atan2(n.x, n.z), nx: n.x, nz: n.z };
}

// Every painted decal: [x, y, z, yaw, halfWidth, halfHeight, kind, tolerance]. At most TALE_SLOTS.
export function talesPlan() {
  const books = P.deckOf('books'); const bakery = P.deckOf('bakery'); const crown = P.deckOf('crown');
  const out = [];
  const add = (x, y, z, yaw, hw, hh, kind, tol) => out.push({ x, y, z, yaw, hw, hh, kind, tol });
  // the Bakery's window (glass front face) and the floury sill under it
  const bh = bakery.hut; const by = bakery.y + bh.h * 0.62; const bx = bh.x - bh.r * 0.55; const bz = bh.z + bh.r * 0.82; const bn = normal(-0.5);
  add(bx + bn.x * 0.026, by, bz + bn.z * 0.026, -0.5, 0.275, 0.275, KIND.bakeryGlass, 0.02);
  add(bx + bn.x * 0.12, by - 0.31 + 0.035, bz + bn.z * 0.12, -0.5, 0.36, 0.12, KIND.sill, 0.02);
  // the Bookshop's window of spines, its painted sign, the message board
  const kh = books.hut; const ky = books.y + kh.h * 0.62; const kx = kh.x - kh.r * 0.55; const kz = kh.z + kh.r * 0.82; const kn = normal(-0.5);
  add(kx + kn.x * 0.026, ky, kz + kn.z * 0.026, -0.5, 0.275, 0.275, KIND.spines, 0.02);
  add(kh.x + kh.r * 0.2, books.y + 1.7, kh.z + kh.r + 0.096, 0, 0.4, 0.2, KIND.bookSign, 0.02);
  const bd = boardPlan();
  add(bd.x, bd.y, bd.z, bd.yaw, 0.44, 0.36, KIND.board, 0.07);
  // the post box's sign at the roots (treehousewingparts.js: slab at the basket's x + 0.7, 0.95, z - 0.2; 0.5 x 0.26 x 0.04)
  add(6.4 + 0.7, 0.95, 22.4 - 0.2 + 0.021, 0, 0.25, 0.13, KIND.envelope, 0.02);
  // the bell rope (treehousewingparts.js: from the bell down to a little above the deck, with a knot)
  const bt = crown.hut; const bellY = r2(crown.y + bt.h - 0.9); const bellZ = r2(bt.z + bt.r * 0.95 + 0.1);
  add(0.35, (bellY - 0.45 + crown.y + 1.5) / 2, bellZ + 0.325, 0, 0.07, (bellY - 0.45 - (crown.y + 1.5)) / 2, KIND.rope, 0.16);
  // the reading nook's rug, round the first cushion on the Bookshop deck; the quilt on the hammock; the pigeon feathers under the bell
  const cu = planTrim().cushions.find((c) => c.y === books.y);
  if (cu) add(cu.x, books.y, cu.z, 0.4, 0.85, 0.85, KIND.rug, 0.035);
  const hm = hammockPlan();
  add(hm.x, hm.y + 0.7, (hm.z0 + hm.z1) / 2, 0, hm.w / 2, (hm.z1 - hm.z0) / 2, KIND.quilt, 0.3);
  add(-1.7, crown.y, crown.hut.z + crown.hut.r + 1.6, 0.5, 1.6, 0.7, KIND.feathers, 0.04);
  return out;
}

const pal = (a, i) => a[i % a.length];
export function drawTales(kit, M) {
  const lo = (g) => kit.put('leaves', M.leaves, g, { noCast: true });
  // the Bakery's sill
  const bakery = P.deckOf('bakery'); const bh = bakery.hut;
  const bn = normal(-0.5);
  const bx = bh.x - bh.r * 0.55; const bz = bh.z + bh.r * 0.82; const by = bakery.y + bh.h * 0.62;
  kit.put('paint', M.paint, slab(bx + bn.x * 0.12, by - 0.31, bz + bn.z * 0.12, 0.72, 0.07, 0.24, L.plankDark, { yaw: -0.5 }));
  // the lantern by the Bookshop's board, on a little bracket
  const bd = boardPlan(); const tx = bd.nz; const tz = -bd.nx; // along the wall
  const lx = bd.x + bd.nx * 0.2 + tx * 0.62; const lz = bd.z + bd.nz * 0.2 + tz * 0.62;
  kit.put('paint', M.paint, beam(bd.x + bd.nx * 0.02 + tx * 0.62, bd.y + 0.5, bd.z + bd.nz * 0.02 + tz * 0.62, lx, bd.y + 0.5, lz, 0.03, L.trunkDark));
  lantern(kit, M, lx, bd.y + 0.3, lz);
  // the hammock: two posts, a sling that sags in the middle, a cord at each end
  const h = hammockPlan();
  for (const z of [h.z0, h.z1]) kit.put('paint', M.paint, paint(placed(postGeo(0.07, 0.05, h.hang + 0.1, 4), h.x, h.y + (h.hang + 0.1) / 2, z), L.trunkDark));
  const sling = new THREE.PlaneGeometry(h.w, h.z1 - h.z0, 1, 4).rotateX(-Math.PI / 2);
  const sp = sling.attributes.position;
  for (let i = 0; i < sp.count; i++) { const t = (sp.getZ(i) + (h.z1 - h.z0) / 2) / (h.z1 - h.z0); sp.setY(i, h.hang - (h.hang - h.low) * Math.sin(Math.PI * t)); }
  sling.computeVertexNormals();
  lo(paint(placed(sling, h.x, h.y, (h.z0 + h.z1) / 2), 0xd8b878));
  // the telescope: a short stand and a brass tube tilted up at the sky, a pale lens
  const t = telescopePlan();
  kit.put('paint', M.paint, paint(placed(postGeo(0.07, 0.04, 0.95, 4), t.x, t.y + 0.475, t.z), L.trunkDark));
  kit.put('paint', M.paint, paint(placed(new THREE.CylinderGeometry(0.06, 0.075, 0.7, 6, 1, true).rotateX(Math.PI / 2), t.x, t.y + 1.0, t.z, { yaw: t.yaw, pitch: -0.45 }), 0xc99a3c));
  kit.put('paint', M.paint, paint(placed(new THREE.CircleGeometry(0.06, 6), t.x + Math.sin(t.yaw) * 0.34 * Math.cos(0.45), t.y + 1.0 + Math.sin(0.45) * 0.34, t.z + Math.cos(t.yaw) * 0.34 * Math.cos(0.45), { yaw: t.yaw, pitch: -0.45 }), 0xbfe4ee));
  // the high bridge's flags (little pennants hung from the rope) and the kite on its line
  const hb = highBridgePlan();
  for (const f of hb.flags) lo(paint(placed(new THREE.ConeGeometry(0.1, 0.24, 3), f.x, f.y - 0.12, f.z, { pitch: Math.PI, yaw: f.yaw + Math.PI / 2 }), pal(FLAG_HUES, f.i), f.i % 3));
  const k = hb.kite;
  const kg = new THREE.OctahedronGeometry(1, 0).scale(0.34, 0.46, 0.015);
  const kc = new Float32Array(kg.attributes.position.count * 3);
  const cc = new THREE.Color();
  const pos = kg.attributes.position;
  for (let f = 0; f < pos.count; f += 3) {
    const mx = (pos.getX(f) + pos.getX(f + 1) + pos.getX(f + 2)) / 3; const my = (pos.getY(f) + pos.getY(f + 1) + pos.getY(f + 2)) / 3; const mz = (pos.getZ(f) + pos.getZ(f + 1) + pos.getZ(f + 2)) / 3;
    cc.setHex(KITE_HUES[(mx >= 0 ? 1 : 0) + (my >= 0 ? 2 : 0)]); if (mz < 0) cc.multiplyScalar(0.8);
    for (let v = 0; v < 3; v++) { kc[(f + v) * 3] = cc.r; kc[(f + v) * 3 + 1] = cc.g; kc[(f + v) * 3 + 2] = cc.b; }
  }
  kg.setAttribute('color', new THREE.BufferAttribute(kc, 3));
  kg.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2));
  kg.computeVertexNormals();
  lo(placed(kg, k.x, k.y, k.z, { yaw: 0.5, pitch: -0.25 }));
  lo(beam(k.tieX, k.tieY, k.tieZ, k.x, k.y - 0.4, k.z, 0.015, L.rope));
  for (let i = 0; i < 3; i++) lo(paint(placed(new THREE.OctahedronGeometry(0.06, 0), k.x - 0.05 * i, k.y - 0.62 - i * 0.2, k.z, { sy: 1.2 }), KITE_HUES[(i + 1) % 4]));
}
