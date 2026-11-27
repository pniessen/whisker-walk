// =============================================================================
// TREEHOUSE WING B: THE PLAN (milestone T5). Where letter two (the sorting basket at the roots) and letter three (the mail bag on the Bookshop deck) wait, where the Bookshop's and the Bell
// Tower's windows are, where the bell hangs and is rung from, the supper table on the Crown deck with its ring of lights, the rope bridges' strings of lights and the fireflies' orbit.
// Pure data and pure functions (no THREE, no clock, no Math.random). North is -z, heights are metres over the ground. Stage chunk code (treehousestagebranches.js); start-up never imports
// it. The decks, the huts, the two rope bridges and the perches are treehouseplan.js's (T1); the first letter and the Bakery are treehousestory.js's (T2).
// docs/superpowers/plans/2026-11-27-new-areas-snowville-treehouse-jungle.md 2.3, 2.4, 2.6. Numbers marked "start" are tuned from pictures.
// =============================================================================

import { ANCHORS, BRIDGE_LINES, RAIL_H, deckOf } from './treehouseplan.js';

const r2 = (v) => Math.round(v * 100) / 100;
const f = (o) => Object.freeze(o);
const books = deckOf('books');
const crown = deckOf('crown');

// ---- the letters and the houses (the first of each is treehousestory.js's) ----------------------------------------------------------------------
// `y` is the height of the thing's mouth over the ground; `minY` keeps a cat on the ground under a deck from picking up or posting what is on the deck above her.
export const BASKET = f({ x: 6.4, z: 22.4, r: 0.35, h: 0.5 }); // the sorting basket at the roots (letter two lies in it)
export const BAG = f({ x: 7.4, z: 2.9, y: books.y }); // the mail bag on the Bookshop deck, by the rail (letter three hangs from it)
export const LETTERS_B = Object.freeze([
  f({ id: 1, x: BASKET.x, z: BASKET.z, y: BASKET.h + 0.05, reach: 1.9, ring: 0.45 }),
  f({ id: 2, x: BAG.x, z: BAG.z, y: BAG.y + 0.6, reach: 1.9, minY: BAG.y - 0.5, ring: BAG.y + 0.05 }),
]);
const hutB = books.hut;
const hutT = crown.hut;
export const HOUSES_B = Object.freeze([
  f({ id: 1, x: ANCHORS.bookshop.x, z: ANCHORS.bookshop.z, y: ANCHORS.bookshop.y, reach: 2.4, minY: ANCHORS.bookshop.y - 0.5,
    sill: f({ x: r2(hutB.x + 0.9), y: r2(books.y + 1.05), z: r2(hutB.z + hutB.r - 0.1) }),
    glow: f({ x: r2(hutB.x - 0.2), y: r2(books.y + 1.3), z: r2(hutB.z + hutB.r + 0.15) }) }),
  f({ id: 2, x: 0, z: r2(hutT.z + hutT.r * 0.95), y: crown.y, reach: 3.2, minY: crown.y - 0.5,
    sill: f({ x: 1.0, y: r2(crown.y + 1.05), z: r2(hutT.z + hutT.r * 0.95 + 0.1) }),
    glow: f({ x: 0, y: r2(crown.y + hutT.h * 0.62), z: r2(hutT.z + hutT.r * 0.95 + 0.25) }) }),
]);

// ---- the bell and the supper ---------------------------------------------------------------------------------------------------------------------
// The bell hangs on the front of the Bell Tower (the base draws it, treehouseparts.js drawHut); she rings it from the Crown deck within 1.8 m of the bell's own perch (k2), which is clear of the supper table's prompt (the perch by the table, k1, is 2 m off).
export const BELL = f({ x: 0, y: r2(crown.y + hutT.h - 0.9), z: r2(hutT.z + hutT.r * 0.95 + 0.1) });
export const RING_AT = f({ x: ANCHORS.bell.x, z: ANCHORS.bell.z, y: crown.y, reach: 1.8, minY: crown.y - 0.5 });
// The supper table on the Crown deck: round, with a cloth, two stools, candles and a basket of acorns; the ring of lights hangs over it.
export const TABLE = f({ x: 2.9, z: -15.6, y: crown.y, r: 0.75, reach: 3.0, minY: crown.y - 0.5 });
export const STOOLS = Object.freeze([[2.9, -16.75], [2.9, -14.45]].map((p) => f({ x: p[0], z: p[1] })));
export const LAMP_RING = f({ x: TABLE.x, z: TABLE.z, y: r2(crown.y + 2.6), r: 1.7, n: 12 }); // the ring of hanging lanterns over the table
export const supperBulbs = (n = LAMP_RING.n) => [...Array(n)].map((_, i) => {
  const a = (i / n) * Math.PI * 2 + 0.3;
  return f({ x: r2(LAMP_RING.x + Math.cos(a) * LAMP_RING.r), z: r2(LAMP_RING.z + Math.sin(a) * LAMP_RING.r), y: r2(LAMP_RING.y - 0.25 * (i % 2)) });
});
// The windows the supper lights in turn (the Bakery's, the Bookshop's, the Bell Tower's glows; the houses' own halos are Nutmeg's).
export const WINDOWS = 3;

// ---- the rope bridges' strings of lights (they come on when the bell rings, and stay) ------------------------------------------------------------------
export function bridgeBulbs(step = 0.9) {
  const out = [];
  for (const line of BRIDGE_LINES) {
    for (let i = 0; i + 1 < line.length; i++) {
      const a = line[i]; const b = line[i + 1];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const yaw = Math.atan2(b.x - a.x, b.z - a.z);
      const n = Math.max(2, Math.round(len / step));
      for (let k = i === 0 ? 0 : 1; k <= n; k++) {
        const t = k / n;
        const ox = Math.cos(yaw) * 0.6; const oz = -Math.sin(yaw) * 0.6; // the rope rail on one side (see treehouseparts.js bridge)
        out.push({ x: r2(a.x + (b.x - a.x) * t + ox), z: r2(a.z + (b.z - a.z) * t + oz), y: r2(a.y + RAIL_H + 0.08 - 0.07 * Math.sin(Math.PI * t)) });
      }
    }
  }
  return out;
}

// ---- what is solid ------------------------------------------------------------------------------------------------------------------------
export const wingColliders = () => [f({ x: BASKET.x, z: BASKET.z, r: BASKET.r })];
export const wingPerches = () => []; // the wing adds no hop: the decks and the bridges are T1's
// The story's table for the base's Nutmeg (treehousestory.js allLetters / allHouses, and her goal spots for the meow's ring).
export const wingStory = () => ({
  letters: LETTERS_B,
  houses: HOUSES_B,
  spots: f({ ring: f({ x: RING_AT.x, z: RING_AT.z, up: crown.y + 0.5 }), supper: f({ x: TABLE.x, z: TABLE.z, up: crown.y + 0.5 }) }),
});
