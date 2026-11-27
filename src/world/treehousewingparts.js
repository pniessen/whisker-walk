// =============================================================================
// TREEHOUSE WING B: THE DRAWING (milestone T5). The sorting basket at the roots, the mail bag by the Bookshop's rail, the Bookshop's sign, window box and book stacks, the Bell Tower's bell
// rope, a hanging lantern at the middle of each rope bridge, and the Crown deck's supper table (cloth, stools, cups, candles, a basket of acorns) under its ring of hanging lanterns. Merged
// into the village's own buckets (paint, glow) at build, so it adds no mesh: only triangles (test/budget.test.js, the row measured with this stage in). The lit parts (the ring's glow, the
// candle flames, the strings of lights, the fireflies) are the walk's life (treehousewinglive.js), not this. Stage chunk code (treehousestagebranches.js).
// =============================================================================

import * as THREE from 'three';
import * as P from './treehouseplan.js';
import * as W from './treehousewingplan.js';
import { paint, placed, slab, post, beam, lantern } from './treehouseparts.js';

const L = P.TREE_LOOK;
const GLASS = 0x8a7a58; // a hung lantern's glass when it is not lit

export function drawWing(kit, M) {
  const crown = P.deckOf('crown');
  const books = P.deckOf('books');
  // letter two's basket at the roots, with a handle and a little post-sign
  const B = W.BASKET;
  kit.put('paint', M.paint, paint(placed(new THREE.CylinderGeometry(B.r, B.r * 0.8, B.h, 9, 1, true), B.x, B.h / 2, B.z), 0xb08a52, 1));
  kit.put('paint', M.paint, paint(placed(new THREE.CylinderGeometry(B.r * 0.8, B.r * 0.8, 0.04, 9), B.x, 0.03, B.z), 0x8a6a3c));
  kit.put('paint', M.paint, paint(placed(new THREE.TorusGeometry(B.r, 0.03, 4, 8, Math.PI), B.x, B.h, B.z, { yaw: 0.6 }), 0xb08a52));
  kit.put('paint', M.paint, post(B.x + 0.7, B.z - 0.2, 0, 1.0, 0.04, 0.04, L.trunkDark, 5));
  kit.put('paint', M.paint, slab(B.x + 0.7, 0.95, B.z - 0.2, 0.5, 0.26, 0.04, 0xc8483a));
  // the mail bag by the Bookshop's rail: a hook post and a round canvas bag
  const G = W.BAG;
  kit.put('paint', M.paint, post(G.x, G.z + 0.3, G.y, G.y + 1.2, 0.05, 0.05, L.trunkDark, 5));
  kit.put('paint', M.paint, beam(G.x, G.y + 1.15, G.z + 0.3, G.x, G.y + 1.15, G.z, 0.05, L.trunkDark));
  kit.put('paint', M.paint, paint(placed(new THREE.SphereGeometry(0.3, 8, 6), G.x, G.y + 0.7, G.z, { sy: 1.15 }), 0xd8c08a, 1));
  kit.put('paint', M.paint, slab(G.x, G.y + 0.98, G.z, 0.3, 0.06, 0.3, 0x9a7a4a));
  // the Bookshop's hanging sign over the door, its window box and two stacks of books
  const h = books.hut;
  kit.put('paint', M.paint, beam(h.x + h.r * 0.2 - 0.7, books.y + 1.95, h.z + h.r + 0.05, h.x + h.r * 0.2 + 0.7, books.y + 1.95, h.z + h.r + 0.05, 0.05, L.trunkDark));
  kit.put('paint', M.paint, slab(h.x + h.r * 0.2, books.y + 1.7, h.z + h.r + 0.07, 0.8, 0.4, 0.05, 0x7a5a8c));
  kit.put('paint', M.paint, slab(h.x - h.r * 0.55, books.y + h.h * 0.62 - 0.45, h.z + h.r * 0.82 + 0.1, 0.7, 0.14, 0.2, L.plankDark, { yaw: -0.5 }));
  [0xc8483a, 0x3a6a9a, 0xe0b040].forEach((c, i) => kit.put('paint', M.paint, slab(h.x + h.r * 0.2 + 1.0 + i * 0.01, books.y + 0.07 + i * 0.12, h.z + h.r - 0.3, 0.5 - i * 0.05, 0.12, 0.34, c, { yaw: 0.2 * i })));
  // the Bell Tower: a bell rope with a knot hangs from the bell to a little above the deck
  const bl = W.BELL;
  kit.put('paint', M.paint, beam(bl.x + 0.35, bl.y - 0.1, bl.z + 0.2, bl.x + 0.35, crown.y + 1.5, bl.z + 0.45, 0.03, L.rope));
  kit.put('paint', M.paint, paint(placed(new THREE.SphereGeometry(0.09, 5, 4), bl.x + 0.35, crown.y + 1.4, bl.z + 0.45), L.rope));
  kit.put('paint', M.paint, beam(bl.x - 0.45, bl.y + 0.4, bl.z + 0.05, bl.x + 0.45, bl.y + 0.4, bl.z + 0.05, 0.07, L.trunkDark)); // the beam the bell hangs from
  // a hanging lantern at the middle of each rope bridge
  for (const line of P.BRIDGE_LINES) { const m = line[Math.floor(line.length / 2)]; lantern(kit, M, m.x, m.y + P.RAIL_H + 0.8, m.z); }
  // the supper: a round table with a cloth, two stools, three cups, three candles and a basket of acorns
  const T = W.TABLE;
  kit.put('paint', M.paint, post(T.x, T.z, T.y, T.y + 0.7, 0.1, 0.1, L.trunkDark, 6));
  kit.put('paint', M.paint, paint(placed(new THREE.CylinderGeometry(T.r, T.r, 0.07, 12), T.x, T.y + 0.72, T.z), 0x9a5a3a, 1));
  kit.put('paint', M.paint, paint(placed(new THREE.CylinderGeometry(T.r * 0.97, T.r * 1.18, 0.34, 12, 1, true), T.x, T.y + 0.56, T.z), 0xf4ecd6)); // the cloth's skirt
  for (const s of W.STOOLS) kit.put('paint', M.paint, post(s.x, s.z, T.y, T.y + 0.45, 0.2, 0.24, L.plank, 7, 1));
  for (let i = 0; i < 3; i++) {
    const a = i * 2.1 + 0.4;
    kit.put('paint', M.paint, post(T.x + Math.cos(a) * 0.5, T.z + Math.sin(a) * 0.5, T.y + 0.76, T.y + 0.86, 0.06, 0.05, [0xe0a0a0, 0xa0c8e0, 0xe8d890][i], 6));
    kit.put('paint', M.paint, post(T.x + Math.cos(a + 0.9) * 0.22, T.z + Math.sin(a + 0.9) * 0.22, T.y + 0.76, T.y + 1.0, 0.025, 0.025, 0xfff1d2, 5));
  }
  kit.put('paint', M.paint, paint(placed(new THREE.CylinderGeometry(0.2, 0.15, 0.2, 8, 1, true), T.x + 0.45, T.y + 0.86, T.z - 0.35), 0xb08a52));
  for (const [dx, dz] of [[0.05, 0], [-0.05, 0.06], [0.04, -0.06]]) kit.put('paint', M.paint, paint(placed(new THREE.SphereGeometry(0.07, 5, 4), T.x + 0.45 + dx, T.y + 0.98, T.z - 0.35 + dz, { sy: 1.2 }), 0x9a6a38));
  // the ring of hanging lanterns: a pole up from the deck, four spokes, and a lantern glass at each bulb (they are lit by the supper)
  const R = W.LAMP_RING;
  kit.put('paint', M.paint, post(R.x + 0.6, R.z - 1.6, crown.y, R.y + 0.6, 0.06, 0.05, L.trunkDark, 6));
  kit.put('paint', M.paint, beam(R.x + 1.6, R.y + 0.55, R.z - 1.5, R.x, R.y + 0.4, R.z, 0.04, L.trunkDark));
  for (const b of W.supperBulbs()) {
    kit.put('glow', M.glow, paint(placed(new THREE.SphereGeometry(0.1, 5, 4), b.x, b.y, b.z), GLASS), { noCast: true });
    kit.put('paint', M.paint, beam(b.x, b.y + 0.1, b.z, R.x, R.y + 0.4, R.z, 0.015, L.rope));
  }
}
