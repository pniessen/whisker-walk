import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// =============================================================================
// THE MARKET'S KIT: one 256 x 128 px atlas (awning stripes, produce, sign
// pictures, the café's chalkboard and window boards), the square's own cobbles,
// the materials, the shared geometries (PARTS), the five treats, the speech
// bubble and the broom. market.js builds the square from it.
//
// LOCAL UUIDS: nothing here is made at import. Materials come from
// marketMaterials() and the shared geometries from createMarketParts(), each
// called once per build inside its withLocalUuids; the parts' dispose() is the
// build's to call at teardown.
// No canvas, no Math.random: every pixel comes from fixed tables below.
// Pictures only, never letters (M12).
// =============================================================================

// ---------------------------------------------------------------------------
// Shared drawing helpers for the Market chunk's own meshes (marketfruit.js,
// marketfolk.js, market.js, marketlife.js).
// painted(geo, hex) -> geo's unindexed form (an indexed geo is freed) with one
// vertex colour, hex, on every vertex.
const _paint = new THREE.Color();
export function painted(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  _paint.setHex(hex);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    col[i * 3] = _paint.r;
    col[i * 3 + 1] = _paint.g;
    col[i * 3 + 2] = _paint.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
// The square's flowers (step 3, V11: the tubs' blooms; the flower stall's
// bucket carries a bunch too), [petals, middle].
export const BLOOMS = Object.freeze([
  [0xe8528a, 0xf7d64a], [0xf5cf3a, 0xe07a1c], [0xf8f4ea, 0xf2c230], [0x9a5fd0, 0xf6e7a0],
  [0xdc3a33, 0x3a2a24], [0xf28a26, 0xf8dc5a], [0xf0a6d2, 0xfff4d0],
]);
const SEPAL_GREEN = 0x3f7a35;
// One flower, 1 across, facing +y, its own colours: five petals round a cup
// (a ring of tips and notches), the middle sunk a little; under it a green
// sepal narrowing to the stem. Flat faces, 20 triangles.
export function bloomGeometry(petal, middle) {
  const P = new THREE.Color(petal);
  const Pd = P.clone().multiplyScalar(0.78);
  const Mi = new THREE.Color(middle);
  const G = new THREE.Color(SEPAL_GREEN);
  const ring = Array.from({ length: 10 }, (_, j) => {
    const a = (j * Math.PI) / 5;
    const r = j % 2 ? 0.25 : 0.5;
    return new THREE.Vector3(r * Math.cos(a), j % 2 ? 0 : 0.08, r * Math.sin(a));
  });
  const mid = new THREE.Vector3(0, -0.05, 0);
  const base = new THREE.Vector3(0, -0.3, 0);
  const pos = [];
  const col = [];
  const tri = (a, ca, b, cb, c, cc, up) => {
    // wound so the face looks up (the petals' tops) or out (their undersides)
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    const out = up ? n.y > 0 : n.dot(new THREE.Vector3(a.x + b.x + c.x, 0, a.z + b.z + c.z)) > 0;
    const v = out ? [[a, ca], [b, cb], [c, cc]] : [[a, ca], [c, cc], [b, cb]];
    for (const [p, q] of v) { pos.push(p.x, p.y, p.z); col.push(q.r, q.g, q.b); }
  };
  for (let j = 0; j < 10; j++) {
    const a = ring[j];
    const b = ring[(j + 1) % 10];
    tri(mid, Mi, a, P, b, P, true);
    tri(base, G, a, Pd, b, Pd, false);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

// 8 x 8 cells of 32 px (step 3, V11: it was 4 x 4, then 8 x 4; cells 0-15 keep their pictures)
const ATLAS_COLS = 8;
const ATLAS_ROWS = 8; // 2026-11-22 beauty pass: 8 x 8 (cells 32-43 are the four new stalls' counter fronts, price slate, valances)
const CELL_PX = 32;
export const ATLAS_W = ATLAS_COLS * CELL_PX;
export const ATLAS_H = ATLAS_ROWS * CELL_PX;
export const ATLAS_CELLS = ATLAS_COLS * ATLAS_ROWS;

export const TREAT_KINDS = Object.freeze(['fishhead', 'sausageroll', 'cheddar', 'cream', 'crumbs', 'wool', 'sausages', 'catnip', 'sardines']);

const CREAM = 0xf3ead2;
// cells 0-5: the awning stripes, [stripe colour] on cream: blue, red, yellow, green, pink, café brown
const STRIPES = Object.freeze([0x3f6fb5, 0xc23b34, 0xe8b92c, 0x4c9a52, 0xe58fb0, 0x6e4a33]);

const rgbOf = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
// warehouselook.js's hash01, the same numbers: a copy, because importing that
// file here splits it out of start-up's builder chunk into a start-up file of
// its own (+0.4 kB at start-up, measured 2026-11-21)
const hash01 = (x, z, salt) => {
  const h = Math.sin(x * 12.9898 + z * 78.233 + salt * 37.719) * 43758.5453;
  return h - Math.floor(h);
};
const mixc = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const inCircle = (x, y, cx, cy, r) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
const inEllipse = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
const inRect = (x, y, x0, y0, x1, y1) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
const inTri = (x, y, [ax, ay], [bx, by], [qx, qy]) => {
  const d1 = (x - bx) * (ay - by) - (ax - bx) * (y - by);
  const d2 = (x - qx) * (by - qy) - (bx - qx) * (y - qy);
  const d3 = (x - ax) * (qy - ay) - (qx - ax) * (y - ay);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
};

// Each cell's pixel at (x, y) (y up from the bottom of the cell), [r, g, b].
// cells 18-21 (2026-11-22): the toy stall's purple, the plant stall's teal, the bric-a-brac's orange, the butcher's maroon
const STRIPES_NEW = Object.freeze([0x8a5cc2, 0x2f8f8a, 0xe08a2e, 0x9c2b3a]);
function awningPixel(i, x) {
  // four px of stripe, four of cream, a faint fold shading across the cell
  const stripe = Math.floor(x / 4) % 2 === 0;
  const base = rgbOf(stripe ? (i >= 18 ? STRIPES_NEW[i - 18] : STRIPES[i]) : CREAM);
  return mixc(base, [0, 0, 0], 0.06 * (1 - Math.abs(((x % 4) - 1.5) / 1.5)));
}

const SIGN_BOARD = rgbOf(0x5a3b26);
const SIGN_FACE = rgbOf(0xe9dcb9);
// the picture on a sign's face: [test, colour] layers, later ones on top (coords 0..31, y up)
const PICTURES = Object.freeze({
  11: [ // fish: a body, a tail, an eye
    [(x, y) => inEllipse(x, y, 14, 16, 8.5, 5), rgbOf(0x4a86b8)],
    [(x, y) => inTri(x, y, [21, 16], [28, 22], [28, 10]), rgbOf(0x4a86b8)],
    [(x, y) => inCircle(x, y, 9.5, 17.5, 1.3), rgbOf(0x15202a)],
  ],
  12: [ // loaf: a domed bread with three slashes
    [(x, y) => inEllipse(x, y, 16, 14, 10, 6) && y >= 11 || inRect(x, y, 6, 9, 26, 13), rgbOf(0xc98a3e)],
    [(x, y) => inRect(x, y, 11, 14, 12, 18) || inRect(x, y, 15.5, 14, 16.5, 19) || inRect(x, y, 20, 14, 21, 18), rgbOf(0xefc77d)],
  ],
  13: [ // wedge: a cheese wedge with holes
    [(x, y) => inTri(x, y, [5, 10], [27, 10], [27, 22]), rgbOf(0xe8b92c)],
    [(x, y) => inRect(x, y, 5, 8, 27, 10), rgbOf(0xb98a1c)],
    [(x, y) => inCircle(x, y, 20, 13, 1.6) || inCircle(x, y, 24, 18, 1.4) || inCircle(x, y, 14, 11.6, 1.0), rgbOf(0xa57a16)],
  ],
  14: [ // churn: a milk churn, a lid and two handles
    [(x, y) => inRect(x, y, 10, 6, 22, 20) || inRect(x, y, 12, 20, 20, 24), rgbOf(0xb8c2c8)],
    [(x, y) => inEllipse(x, y, 16, 25, 5, 2), rgbOf(0x8d979d)],
    [(x, y) => inRect(x, y, 8, 14, 10, 17) || inRect(x, y, 22, 14, 24, 17), rgbOf(0x8d979d)],
    [(x, y) => inRect(x, y, 10, 11, 22, 12), rgbOf(0x7a858c)],
  ],
  15: [ // cup: a cup with a saucer and a curl of steam
    [(x, y) => inRect(x, y, 9, 9, 21, 17) || inEllipse(x, y, 15, 9, 6, 3), rgbOf(0xf2efe6)],
    [(x, y) => inCircle(x, y, 23, 14, 3.4) && !inCircle(x, y, 23, 14, 1.8), rgbOf(0xf2efe6)],
    [(x, y) => inEllipse(x, y, 15, 7.5, 10, 1.6), rgbOf(0xcfc9b8)],
    [(x, y) => inCircle(x, y, 13, 21, 1.1) || inCircle(x, y, 16, 24, 1.1) || inCircle(x, y, 13, 26, 1.1), rgbOf(0xb9b3a6)],
  ],
});

// produce cells 6-10: apples, oranges, flowers, bread, cheese rind
const PRODUCE = Object.freeze([
  { ground: 0x6b4a2c, dots: [0xc8322e, 0x9c2420], r: 4.2, step: 9, shape: 'round' }, // apples
  { ground: 0x6b4a2c, dots: [0xf08a1c, 0xd96d10], r: 4.2, step: 9, shape: 'round' }, // oranges
  { ground: 0x3f7a3d, dots: [0xe85a8c, 0xf5d142, 0xf2efe6, 0x9a63c9], r: 2.6, step: 6, shape: 'round' }, // flowers
  { ground: 0xd8b072, dots: [0xb27a38, 0xc88f4a], r: 3.4, step: 8, shape: 'long' }, // bread
  { ground: 0xe8b92c, dots: [0xc9871a, 0xefc84a], r: 3.0, step: 7, shape: 'round' }, // cheese rind
]);
function producePixel(i, x, y) {
  const p = PRODUCE[i - 6];
  const ground = rgbOf(p.ground);
  // a staggered grid of fruit; the cell is 32, steps divide it only roughly, which reads as a heap
  const row = Math.floor(y / p.step);
  const ox = (row % 2) * (p.step / 2);
  const cx = Math.floor((x + ox) / p.step) * p.step + p.step / 2 - ox;
  const cy = row * p.step + p.step / 2;
  const k = (Math.floor((x + ox) / p.step) + row * 3) % p.dots.length;
  const inside = p.shape === 'long' ? inEllipse(x, y, cx, cy, p.r * 1.3, p.r * 0.8) : inCircle(x, y, cx, cy, p.r);
  if (!inside) return ground;
  const c = rgbOf(p.dots[k]);
  // a small highlight on the upper-left of each piece (y is up)
  return mixc(c, [255, 255, 255], (x - cx) + (cy - y) < -p.r * 0.9 ? 0.22 : 0);
}

function signPixel(i, x, y) {
  if (x < 2 || y < 2 || x > 29 || y > 29) return SIGN_BOARD;
  if (x < 4 || y < 4 || x > 27 || y > 27) return mixc(SIGN_BOARD, SIGN_FACE, 0.35);
  let c = SIGN_FACE;
  for (const [test, col] of PICTURES[i]) if (test(x, y)) c = col;
  return c;
}

// Cell 16 (step 3, V11): the café's A-frame chalkboard, pictures in chalk on
// dark slate, in a thin wooden frame: a cup of something hot at the top, a
// slice of cake with a cherry and a croissant below. Pictures only (M12).
const SLATE = rgbOf(0x2c3532);
const CHALK = Object.freeze({ white: rgbOf(0xe9ece4), pink: rgbOf(0xf1a2bd), yellow: rgbOf(0xf2cf6a), red: rgbOf(0xe25a55), cream: rgbOf(0xf3e3c0) });
const BOARD_WOOD = rgbOf(0x8a6642);
const CHALKBOARD = Object.freeze([
  // the cup: a round-bottomed cup on a saucer, a handle, two curls of steam
  [(x, y) => inRect(x, y, 11, 20, 19.5, 26) || inEllipse(x, y, 15.25, 20.5, 4.25, 2.2), CHALK.white],
  [(x, y) => inCircle(x, y, 20.6, 23.2, 2.4) && !inCircle(x, y, 20.6, 23.2, 1.2), CHALK.white],
  [(x, y) => inEllipse(x, y, 15.25, 18.2, 6.5, 1.1), CHALK.white],
  [(x, y) => (Math.abs(x - (13.6 + 1.1 * Math.sin(y * 1.4))) < 0.65 || Math.abs(x - (17 + 1.1 * Math.sin(y * 1.4 + 1.5))) < 0.65) && y >= 27 && y <= 30, CHALK.white],
  // the cake slice: a wedge of sponge, a pink layer of icing on top and through its middle, a cherry
  [(x, y) => inTri(x, y, [3.5, 4.5], [14.5, 4.5], [14.5, 11.5]), CHALK.cream],
  [(x, y) => inTri(x, y, [3.5, 4.5], [14.5, 4.5], [14.5, 11.5]) && Math.abs(y - 7.6) < 0.8, CHALK.pink],
  [(x, y) => inTri(x, y, [1.8, 4.6], [14.6, 11.6], [14.6, 13.4]) && !inTri(x, y, [3.5, 4.5], [14.5, 4.5], [14.5, 11.5]), CHALK.pink],
  [(x, y) => inCircle(x, y, 12.3, 14, 1.6), CHALK.red],
  // the croissant: a fat crescent in golden chalk, its rolls marked in darker lines
  [(x, y) => inEllipse(x, y, 23, 7.5, 6.8, 5) && !inEllipse(x, y, 23, 3.2, 4.4, 4.4), CHALK.yellow],
  [(x, y) => inEllipse(x, y, 23, 8, 6.2, 4.4) && !inEllipse(x, y, 23, 3.4, 4.2, 3.2) && (Math.abs(x - 20) < 0.5 || Math.abs(x - 23) < 0.5 || Math.abs(x - 26) < 0.5), mixc(CHALK.yellow, SLATE, 0.45)],
]);
function chalkboardPixel(x, y) {
  if (x < 1 || y < 1 || x > 30 || y > 30) return BOARD_WOOD;
  // slate, with the faint smudge of old chalk wiped off
  let c = mixc(SLATE, CHALK.white, 0.05 * hash01(Math.floor(x / 3), Math.floor(y / 2), 151));
  for (const [test, col] of CHALKBOARD) if (test(x + 0.5, y + 0.5)) c = col;
  return c;
}

// Cell 17 (step 3, V11): a painted window board under the café's windows: a
// cream panel framed in the café's green, a fine gold line inside the frame
// and a painted flower with two leaves in its middle. Each board shows the
// cell once, about 0.72 x 0.55 m, so the flower is drawn a little squat.
const CAFE_GREEN = rgbOf(0x284e3f);
const PANEL = rgbOf(0xeadcb8);
const GOLD = rgbOf(0xc9a040);
const PETAL_PAINT = rgbOf(0xd8587e);
function windowBoardPixel(x, y) {
  const px = x + 0.5;
  const py = y + 0.5;
  if (px < 2.5 || px > 29.5 || py < 3 || py > 29) return CAFE_GREEN;
  if (px < 4 || px > 28 || py < 4.5 || py > 27.5) return mixc(PANEL, CAFE_GREEN, 0.25);
  if ((px < 5.2 || px > 26.8 || py < 5.8 || py > 26.2) && px > 4.4 && px < 27.6 && py > 4.9 && py < 27.1) return GOLD;
  let c = PANEL;
  // the leaves, then the petals round a gold middle
  if (inEllipse(px, py, 10.6, 13.5, 4, 2.2) || inEllipse(px, py, 21.4, 13.5, 4, 2.2)) c = rgbOf(0x4c8a4a);
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + Math.PI / 2;
    if (inEllipse(px, py, 16 + 3.4 * Math.cos(a), 17 + 3.6 * Math.sin(a), 2.6, 2.8)) c = PETAL_PAINT;
  }
  if (inCircle(px, py, 16, 17, 2.1)) c = rgbOf(0xf2c94c);
  return c;
}

// Cells 22-25 (2026-11-22, redrawn in the beauty pass): the four new stalls' signs, each an
// outlined, shaded picture on a tinted face, drawn with 2 x 2 supersampling so the edges are
// soft (a ball of wool on two needles, a rail of sausages, a leafy pot, a teapot); 26-29 and 38-39:
// their goods (toy blocks from above, two hung-meat panels, leaves, a framed painting, a jumble);
// 32-35 their counter fronts, 36 a price slate (coins, no words), 40-43 their awnings' valances.
const rotLocal = (x, y, cx, cy, a) => {
  const c = Math.cos(a); const s = Math.sin(a);
  return [(x - cx) * c + (y - cy) * s, -(x - cx) * s + (y - cy) * c];
};
const inRotEllipse = (x, y, cx, cy, rx, ry, a) => { const [u, v] = rotLocal(x, y, cx, cy, a); return (u / rx) ** 2 + (v / ry) ** 2 <= 1; };
const grow = (t, r = 1.05) => (x, y) => t(x, y) || t(x + r, y) || t(x - r, y) || t(x, y + r) || t(x, y - r);
const lit = (c, x, y, cx, cy, r) => { // light from the upper left, shade to the lower right
  const t = ((cx - x) + (y - cy)) / (2 * r);
  return t > 0 ? mixc(c, [255, 255, 255], 0.3 * Math.min(1, t)) : mixc(c, [0, 0, 0], 0.28 * Math.min(1, -t));
};
// bg: [r,g,b] or fn; layers [[test, colour | fn]], later on top; 2 x 2 samples per pixel
function paintLayers(bg, layers, x, y) {
  const acc = [0, 0, 0];
  for (const sy of [0.25, 0.75]) {
    for (const sx of [0.25, 0.75]) {
      const X = x + sx; const Y = y + sy;
      let c = typeof bg === 'function' ? bg(X, Y) : bg;
      for (const [test, col] of layers) if (test(X, Y)) c = typeof col === 'function' ? col(X, Y) : col;
      acc[0] += c[0] / 4; acc[1] += c[1] / 4; acc[2] += c[2] / 4;
    }
  }
  return acc;
}
const INK = Object.freeze({ plum: rgbOf(0x5a1f44), meat: rgbOf(0x6e2a20), pot: rgbOf(0x5a2c14), blue: rgbOf(0x1f3a5a), iron: rgbOf(0x34383c), wood: rgbOf(0x5a3b26) });
const NEW_SIGN_FACE = Object.freeze([0xf0e0ec, 0xf3e4cf, 0xe3ecd0, 0xe9e3c8].map(rgbOf));
const NEW_SIGNS = Object.freeze([
  (() => { // wool: two needles, a shaded ball with criss-cross strands, a loose end
    const ball = (x, y) => inCircle(x, y, 15.5, 15.5, 8.4);
    const needle = (a, b) => (x, y) => Math.abs(x - y - a) < 1.1 && x > 5 && x < 27 || Math.abs(x + y - b) < 1.1 && x > 5 && x < 27;
    const strand = (x, y) => ((x * 0.9 + y * 1.1 + 2.4 * Math.sin(x * 0.55)) % 4.2) < 0.95;
    const strand2 = (x, y) => ((x * 1.1 - y * 0.9 + 2 * Math.sin(y * 0.5)) % 5) < 0.85;
    return [
      [needle(0.5, 31.5), rgbOf(0xd2a86a)],
      [(x, y) => inCircle(x, y, 26.6, 26.6, 1.7) || inCircle(x, y, 26.6, 4.4, 1.7), rgbOf(0xb5622f)],
      [grow(ball, 1.2), INK.plum],
      [ball, (x, y) => lit(rgbOf(0xd95fa6), x, y, 15.5, 15.5, 8.4)],
      [(x, y) => ball(x, y) && strand(x, y), rgbOf(0xf6b0d6)],
      [(x, y) => ball(x, y) && strand2(x, y), rgbOf(0xa8407c)],
      [(x, y) => inEllipse(x, y, 12.4, 19.4, 2.4, 1.4), rgbOf(0xf6c9e0)],
      [(x, y) => x > 22 && x < 29.5 && Math.abs(y - (10 - (x - 22) * 0.5 + 1.5 * Math.sin((x - 22) * 1.3))) < 0.9, rgbOf(0xc04a8a)],
    ];
  })(),
  (() => { // sausages: a rail, three links on strings, a knot above each
    const link = (cx, cy) => (x, y) => inEllipse(x, y, cx, cy, 3.4, 8.3);
    const cs = [[8.5, 13], [16, 11], [23.5, 13]];
    return [
      ...cs.flatMap(([cx, cy]) => [
        [(x, y) => Math.abs(x - cx) < 0.5 && y > cy + 7 && y < 25.5, INK.wood],
        [grow(link(cx, cy), 1.1), INK.meat],
        [link(cx, cy), (x, y) => lit(rgbOf(0xc0614a), x, y, cx, cy, 6)],
        [(x, y) => Math.abs(x - (cx - 1.4)) < 0.6 && y > cy - 4.5 && y < cy + 4.5, rgbOf(0xe8957c)],
        [(x, y) => inCircle(x, y, cx, cy + 8.4, 1.2), INK.wood],
      ]),
      [(x, y) => x > 4 && x < 28 && y > 25 && y < 27.2, INK.iron],
    ];
  })(),
  (() => { // plant: a clay pot with a rim, soil and three veined leaves
    const potBody = (x, y) => y >= 4.5 && y <= 14 && x >= 9.5 + (14 - y) * 0.2 && x <= 22.5 - (14 - y) * 0.2;
    const rim = (x, y) => x >= 8 && x <= 24 && y > 13.6 && y < 17;
    const leaf = (cx, cy, rx, ry, a) => (x, y) => inRotEllipse(x, y, cx, cy, rx, ry, a);
    const rib = (cx, cy, ry, a) => (x, y) => { const [u, v] = rotLocal(x, y, cx, cy, a); return Math.abs(u) < 0.45 && Math.abs(v) < ry * 0.8; };
    const L = [[9.5, 22.5, 2.9, 6.2, -0.7, 0x3f8f4a], [22.5, 22.5, 2.9, 6.2, 0.7, 0x2f6a30], [16, 23.5, 2.8, 6.4, 0, 0x5fae52]];
    return [
      ...L.flatMap(([cx, cy, rx, ry, a, col]) => [
        [grow(leaf(cx, cy, rx, ry, a), 1.0), rgbOf(0x1f4a22)],
        [leaf(cx, cy, rx, ry, a), rgbOf(col)],
        [rib(cx, cy, ry, a), rgbOf(0xa9d98f)],
      ]),
      [grow((x, y) => potBody(x, y) || rim(x, y), 1.0), INK.pot],
      [potBody, (x, y) => lit(rgbOf(0xb5622f), x, y, 16, 9, 8)],
      [rim, (x, y) => lit(rgbOf(0xc9733a), x, y, 16, 15, 8)],
      [(x, y) => x > 10 && x < 22 && y > 16.4 && y < 17.6, rgbOf(0x4a3322)],
      [(x, y) => Math.abs(y - 7.5) < 0.6 && x > 11 && x < 21, rgbOf(0xe7a77a)],
    ];
  })(),
  (() => { // teapot: round body with a cream band and dots, spout, handle, lid and knob
    const body = (x, y) => inEllipse(x, y, 14.5, 13.2, 8.6, 6.8);
    const spout = (x, y) => inRotEllipse(x, y, 24.3, 15.6, 4.6, 1.6, 0.9);
    const handle = (x, y) => inCircle(x, y, 6.3, 14, 4) && !inCircle(x, y, 6.3, 14, 2.2);
    const lid = (x, y) => inEllipse(x, y, 14.5, 19.6, 4.4, 1.7) || inCircle(x, y, 14.5, 22.2, 1.4);
    const all = (x, y) => body(x, y) || spout(x, y) || handle(x, y);
    return [
      [grow(all, 1.1), INK.blue],
      [grow(lid, 1.0), INK.blue],
      [handle, rgbOf(0x4a7fb5)],
      [spout, rgbOf(0x4a7fb5)],
      [body, (x, y) => lit(rgbOf(0x4a7fb5), x, y, 14.5, 13.2, 8)],
      [(x, y) => body(x, y) && Math.abs(y - 13.6) < 1.1, rgbOf(0xf2efe6)],
      [(x, y) => body(x, y) && y < 11 && y > 8.4 && [9, 12.5, 16, 19.5].some((cx) => inCircle(x, y, cx, 9.7, 0.85)), rgbOf(0xf2e9c8)],
      [lid, rgbOf(0xf2e9c8)],
    ];
  })(),
]);
const ROSE = rgbOf(0xd9807a);
// 26: toy blocks from above: 8 px squares, a pale dot on each, dark seams between
function blocksPixel(x, y) {
  const cols = [0xd8433c, 0x4a86b8, 0xf2c94c, 0x4c9a52];
  const gx = Math.floor(x / 8); const gy = Math.floor(y / 8);
  const lx = x % 8; const ly = y % 8;
  if (lx < 1 || ly < 1) return rgbOf(0x7a5a3a);
  let c = rgbOf(cols[(gx + gy * 2) % 4]);
  if (lx < 2 || ly > 6) c = mixc(c, [255, 255, 255], 0.22);
  if (inCircle(lx, ly, 4, 4, 1.7)) c = mixc(c, [255, 255, 255], 0.65);
  return c;
}
// 27 / 38: a tiled back panel (cream, pale seams), a rail across the top and things hung from it
const HOOK = rgbOf(0x34383c);
const meatPanel = (variant) => {
  const ham = (x, y) => inEllipse(x, y, 9, 13, 5.6, 8);
  const links = (x, y) => [22, 15.5, 9].some((cy) => inEllipse(x, y, 22, cy, 2.6, 3.8));
  const bacon = (x, y) => inRect(x, y, 5, 5, 12, 25);
  const salami = (x, y) => inEllipse(x, y, 22, 14, 3.6, 10.5);
  const first = variant === 0 ? ham : bacon;
  const second = variant === 0 ? links : salami;
  return [
    [first, variant === 0 ? ROSE : (x, y) => (Math.floor(y / 2.4) % 2 ? rgbOf(0xf3ead2) : rgbOf(0xc0504a))],
    [(x, y) => variant === 0 && grow(ham, 1.0)(x, y) && !ham(x, y), INK.meat],
    [(x, y) => variant === 1 && grow(bacon, 1.0)(x, y) && !bacon(x, y), INK.meat],
    [(x, y) => variant === 0 && inEllipse(x, y, 9, 13, 5.6, 8) && inEllipse(x, y, 7.6, 16, 2.2, 3), rgbOf(0xf0b4ac)],
    [(x, y) => variant === 0 && inRect(x, y, 8, 5.5, 10, 8), rgbOf(0xf3ead2)],
    [(x, y) => grow(second, 1.0)(x, y) && !second(x, y), INK.meat],
    [second, variant === 0 ? rgbOf(0xc0614a) : rgbOf(0x8a3a2f)],
    [(x, y) => variant === 1 && second(x, y) && (Math.floor(y / 3) + Math.floor(x / 2)) % 3 === 0, rgbOf(0xf3ead2)],
    [(x, y) => inRect(x, y, 8.2, 25.5, 9.8, 28), HOOK],
    [(x, y) => inRect(x, y, 21.2, 25.5, 22.8, 28), HOOK],
    [(x, y) => inRect(x, y, 0, 28, 32, 30.4), HOOK],
  ];
};
const tileBack = (x, y) => (x % 8 < 0.9 || y % 8 < 0.9 ? rgbOf(0xd9c9b5) : rgbOf(0xf0e4d4));
// 28: leaves from above, a few pink buds
function leavesPixel(x, y) {
  let c = rgbOf(0x3f6a36);
  for (let gy = -1; gy < 5; gy++) {
    for (let gx = -1; gx < 5; gx++) {
      const cx = gx * 8 + 4 + (hash01(gx, gy, 3) - 0.5) * 4;
      const cy = gy * 8 + 4 + (hash01(gx, gy, 4) - 0.5) * 4;
      const a = hash01(gx, gy, 5) * Math.PI;
      if (inRotEllipse(x, y, cx, cy, 5, 2.6, a)) {
        const [u] = rotLocal(x, y, cx, cy, a);
        c = Math.abs(rotLocal(x, y, cx, cy, a)[1]) < 0.4 ? rgbOf(0xa9d98f) : mixc(rgbOf(hash01(gx, gy, 6) > 0.5 ? 0x4f9a48 : 0x2f6a30), [255, 255, 255], u > 0 ? 0.08 : 0);
      }
      if (hash01(gx, gy, 7) > 0.78 && inCircle(x, y, cx + 1, cy + 1, 1.5)) c = rgbOf(0xe85a8c);
    }
  }
  return c;
}
// 29: a little painted landscape in a gilt frame: sky, sun, hills, a tree
function paintingPixel(x, y) {
  if (x < 3 || y < 3 || x > 28 || y > 28) return rgbOf(0xc9a040);
  if (x < 4.5 || y < 4.5 || x > 26.5 || y > 26.5) return rgbOf(0x6e4a1c);
  let c = mixc(rgbOf(0x8ec4ea), rgbOf(0xf3e4c0), 1 - (y - 5) / 22);
  if (inCircle(x, y, 22, 22, 3.2)) c = rgbOf(0xf2c94c);
  if (y < 12 + 2.5 * Math.sin(x / 4.5)) c = rgbOf(0x6aa84a);
  if (y < 8 + 2 * Math.sin(x / 3 + 1.5)) c = rgbOf(0x4c8a3c);
  if (inRect(x, y, 9, 10, 10.4, 16)) c = rgbOf(0x5a3b26);
  if (inCircle(x, y, 9.7, 18, 3.6)) c = rgbOf(0x2f6a30);
  return c;
}
const JUMBLE = Object.freeze({ ground: 0x7a5a3a, dots: [0xe9dcb9, 0x4a7fb5, 0xd8433c], r: 3.0, step: 8 });
function jumblePixel(x, y) {
  const p = JUMBLE;
  const row = Math.floor(y / p.step);
  const ox = (row % 2) * (p.step / 2);
  const cx = Math.floor((x + ox) / p.step) * p.step + p.step / 2 - ox;
  const cy = row * p.step + p.step / 2;
  const k = (Math.floor((x + ox) / p.step) + row * 3) % p.dots.length;
  return inCircle(x, y, cx, cy, p.r) ? rgbOf(p.dots[k]) : rgbOf(p.ground);
}
function newGoodsPixel(i, x, y) {
  if (i === 26) return blocksPixel(x, y);
  if (i === 27 || i === 38) return paintLayers(tileBack, meatPanel(i === 27 ? 0 : 1), x, y);
  if (i === 28) return leavesPixel(x, y);
  if (i === 29) return paintingPixel(x, y);
  return jumblePixel(x, y);
}
function newSignPixel(i, x, y) {
  if (x < 2 || y < 2 || x > 29 || y > 29) return SIGN_BOARD;
  if (x < 4 || y < 4 || x > 27 || y > 27) return mixc(SIGN_BOARD, SIGN_FACE, 0.35);
  return paintLayers(NEW_SIGN_FACE[i - 22], NEW_SIGNS[i - 22], x, y);
}

// Cells 32-35: the counter fronts (one quad each half of the counter, 1.4 x 0.85 m, so a pixel
// is about 4 x 2.7 cm), 36 a price slate, 40-43 the awnings' valances (stripes over a trim band).
const noise = (x, y, k) => hash01(Math.floor(x), Math.floor(y), k);
function toyFront(x, y) {
  let c = rgbOf(0x7a5aa8);
  c = mixc(c, [0, 0, 0], 0.07 * (1 + Math.cos(x * Math.PI / 4)) / 2); // cloth folds
  if (y < 2) return rgbOf(0x5b4285);
  if (y >= 10 && y < 14) c = rgbOf(0xf2c94c);
  if (y >= 7 && y < 9) c = rgbOf(0xe58fb0);
  // paw prints between the stripes and the trim
  const px = (x % 8) - 4;
  const row = y >= 15 && y < 23;
  if (row) {
    const cx = 0; const cy = 18.5;
    if (inEllipse(px, y, cx, cy - 1, 2.6, 2.4) || inCircle(px, y, cx - 3.2, cy + 2.8, 1.5) || inCircle(px, y, cx, cy + 4.4, 1.5) || inCircle(px, y, cx + 3.2, cy + 2.8, 1.5)) c = rgbOf(0xd8c4f4);
  }
  // the cream trim with scallops hanging from it
  const sc = ((x % 4) - 2);
  if (y >= 27 || (y >= 24.5 && sc * sc + (y - 27) ** 2 <= 2.6 * 2.6)) c = mixc(rgbOf(0xf3ead2), rgbOf(0x7a5aa8), y < 26 ? 0.1 : 0);
  else if (y >= 22.5 && y < 24.5 && sc * sc + (y - 27) ** 2 <= 4.6 * 4.6) c = mixc(c, [0, 0, 0], 0.25);
  return c;
}
function plantFront(x, y) {
  const plank = Math.floor(y / 6);
  const tone = 0.9 + 0.2 * hash01(plank, Math.floor(x / 11), 61);
  let c = mixc(rgbOf(0x3f7a5a), [0, 0, 0], 1 - tone);
  c = mixc(c, [255, 255, 255], 0.06 * Math.sin(x * 0.9 + plank * 3) + 0.04 * noise(x / 2, y, 62));
  if (y % 6 < 1) c = mixc(c, [0, 0, 0], 0.4);
  if (y % 6 >= 1 && y % 6 < 2) c = mixc(c, [255, 255, 255], 0.08);
  if ((x < 2 || x >= 30) && Math.abs((y % 6) - 3) < 0.8) c = rgbOf(0x1f3f30);
  if (y >= 28) c = y < 29 ? rgbOf(0x2a5a42) : rgbOf(0xe8e2c0);
  if (y < 1.5) c = rgbOf(0x2a5a42);
  // three painted leaves
  for (const cx of [6, 16, 26]) {
    const l = (px, py) => inRotEllipse(px, py, cx, 15, 3.0, 6.2, cx === 16 ? 0 : cx === 6 ? -0.9 : 0.9);
    if (grow(l, 0.9)(x, y) && !l(x, y)) c = rgbOf(0x1f4a30);
    else if (l(x, y)) { const [u] = rotLocal(x, y, cx, 15, cx === 16 ? 0 : cx === 6 ? -0.9 : 0.9); c = Math.abs(u) < 0.5 ? rgbOf(0xe8e2c0) : rgbOf(0x9fd18a); }
  }
  return c;
}
function bricFront(x, y) {
  const board = Math.floor(x / 4);
  let c = mixc(rgbOf(0xb87a3a), [0, 0, 0], 0.1 * hash01(board, 3, 71));
  c = mixc(c, [255, 255, 255], 0.07 * Math.sin(y * 0.7 + board * 2));
  if (x % 4 < 0.9) c = mixc(c, [0, 0, 0], 0.38);
  if (y >= 28) c = rgbOf(0x6e4a33);
  if (y < 2) c = rgbOf(0x6e4a33);
  // a woven rug hung over the front: red with cream and blue diamonds, a fringe
  if (y >= 9 && y < 23) {
    c = rgbOf(0xa8363a);
    const dx = Math.abs((x % 8) - 4); const dy = Math.abs(y - 16);
    if (dx + dy < 3.6) c = rgbOf(0xf3ead2);
    if (dx + dy < 2) c = rgbOf(0x3f6fb5);
    if (y >= 22 || y < 10.5) c = y % 2 < 1 ? rgbOf(0xf3ead2) : rgbOf(0x7a2a2e);
  }
  if (y >= 5.5 && y < 9 && x % 2 < 1) c = rgbOf(0xefe2c4); // fringe threads
  return c;
}
function butcherFront(x, y) {
  if (y >= 25) { // white tiles under the top board, red line
    if (y < 26.5) return rgbOf(0xb83a34);
    return x % 8 < 0.8 || y >= 31 ? rgbOf(0xd9c9b5) : rgbOf(0xf3ead2);
  }
  if (y < 2) return rgbOf(0x8a2f2a);
  // red gingham apron
  const a = Math.floor(x / 4) % 2; const b = Math.floor(y / 3.4) % 2;
  let c = a && b ? rgbOf(0xb83a34) : a || b ? rgbOf(0xe9a099) : rgbOf(0xf6ede0);
  // a scalloped top edge on the apron
  const sc = ((x % 4) - 2);
  if (y > 21 && y < 25 && sc * sc + (y - 25) ** 2 > 2.6 * 2.6 && y > 22.5) c = rgbOf(0xf3ead2);
  return c;
}
function slatePixel(x, y) {
  // a light price board: cream card in a wooden frame, a dark dot for the thing and gold coins (one, two, three) beside it
  if (x < 2 || y < 2 || x > 29 || y > 29) return rgbOf(0x8a6642);
  let c = rgbOf(0xf3e8c8);
  if (x < 3.5 || y < 3.5 || x > 27.5 || y > 27.5) return rgbOf(0xc9a46a);
  const rows = [24, 16, 8];
  rows.forEach((cy, k) => {
    if (inCircle(x, y, 7.5, cy, 3)) c = rgbOf(0x5a3b26);
    for (let j = 0; j <= k; j++) {
      const cx = 14 + j * 5.2;
      if (inCircle(x, y, cx, cy, 2.7)) c = rgbOf(0x8a6a1c);
      if (inCircle(x, y, cx, cy, 1.9)) c = rgbOf(0xf2c94c);
    }
  });
  return c;
}
// The counter fronts live in a texture of their own (the beauty pass, round 2): four 128 px cells in
// 256 x 256, drawn at four times the atlas's density and magnified without smoothing, so the gingham,
// planks and rug keep their edges from a cat's height. Cell i at column i % 2, row floor(i / 2).
export const FRONT_CELLS = 4;
const FRONT_PX = 128;
export function createFrontsTexture() {
  const data = new Uint8Array(256 * 256 * 4);
  const fns = [toyFront, plantFront, bricFront, butcherFront];
  for (let i = 0; i < FRONT_CELLS; i++) {
    const ox = (i % 2) * FRONT_PX;
    const oy = Math.floor(i / 2) * FRONT_PX;
    for (let y = 0; y < FRONT_PX; y++) {
      for (let x = 0; x < FRONT_PX; x++) {
        const rgb = fns[i](x / 4, y / 4);
        const j = ((oy + y) * 256 + ox + x) * 4;
        data[j] = Math.round(rgb[0]); data[j + 1] = Math.round(rgb[1]); data[j + 2] = Math.round(rgb[2]); data[j + 3] = 255;
      }
    }
  }
  const texture = new THREE.DataTexture(data, 256, 256, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}
// the UV box of front cell i, inset a texel
export function frontCell(i) {
  const pad = 1 / 256;
  const u0 = (i % 2) / 2;
  const v0 = Math.floor(i / 2) / 2;
  return { u0: u0 + pad, v0: v0 + pad, u1: u0 + 0.5 - pad, v1: v0 + 0.5 - pad };
}

// the valances: stripes (as the awning's) fading a little toward the hem, a piping line, a trim band
// of rows 0-7 in the stall's accent with a row of cream dots
const VALANCE_TRIM = Object.freeze([0xf2c94c, 0x1f5f5a, 0x6e4a33, 0xf3ead2]);
function valancePixel(i, x, y) {
  const k = i - 40;
  const trim = rgbOf(VALANCE_TRIM[k]);
  if (y < 8) {
    let c = trim;
    if (inCircle(x % 4, y, 2, 3.6, 1.1)) c = rgbOf(k === 3 ? 0xc0504a : 0xf3ead2);
    if (y < 1.2) c = mixc(trim, [0, 0, 0], 0.3);
    return c;
  }
  if (y < 9.3) return mixc(trim, [0, 0, 0], 0.4);
  const base = awningPixel(18 + k, x);
  return mixc(base, [0, 0, 0], 0.12 * (1 - (y - 9) / 23));
}

// the atlas's unused cells (30, 31): plain cream, never drawn
const SPARE = rgbOf(CREAM);

function cellPixel(i, x, y) {
  if (i === 36) return slatePixel(x, y);
  if (i >= 40 && i <= 43) return valancePixel(i, x, y);
  if (i === 38 || i === 39) return newGoodsPixel(i, x, y);
  if (i >= 18 && i <= 21) return awningPixel(i, x);
  if (i >= 22 && i <= 25) return newSignPixel(i, x, y);
  if (i >= 26 && i <= 29) return newGoodsPixel(i, x, y);
  if (i < 6) return awningPixel(i, x);
  if (i < 11) return producePixel(i, x, y);
  if (i < 16) return signPixel(i, x, y);
  if (i === 16) return chalkboardPixel(x, y);
  if (i === 17) return windowBoardPixel(x, y);
  return SPARE;
}

// A DataTexture, 256 x 128 RGBA in 32 px cells: the same pixels every call.
// Cell i sits at column i % 8, row floor(i / 8) counted from the bottom (v up).
export function createMarketAtlas() {
  const data = new Uint8Array(ATLAS_W * ATLAS_H * 4);
  for (let cell = 0; cell < ATLAS_CELLS; cell++) {
    const ox = (cell % ATLAS_COLS) * CELL_PX;
    const oy = Math.floor(cell / ATLAS_COLS) * CELL_PX;
    for (let y = 0; y < CELL_PX; y++) {
      for (let x = 0; x < CELL_PX; x++) {
        const rgb = cellPixel(cell, x, y);
        const j = ((oy + y) * ATLAS_W + ox + x) * 4;
        data[j] = Math.round(rgb[0]); data[j + 1] = Math.round(rgb[1]); data[j + 2] = Math.round(rgb[2]); data[j + 3] = 255;
      }
    }
  }
  const texture = new THREE.DataTexture(data, ATLAS_W, ATLAS_H, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return { texture, w: ATLAS_W, h: ATLAS_H, cells: ATLAS_CELLS };
}

export function atlasCell(i) {
  const u0 = (i % ATLAS_COLS) / ATLAS_COLS;
  const v0 = Math.floor(i / ATLAS_COLS) / ATLAS_ROWS;
  return { u0, v0, u1: u0 + 1 / ATLAS_COLS, v1: v0 + 1 / ATLAS_ROWS };
}

// ---------------------------------------------------------------------------
// THE SQUARE'S OWN COBBLES (step 3, V11). One 0.6 m tile, 128 x 128: four rows
// of setts 32 px (15 cm) deep, each row set half a stone along from the last
// (running bond, so the joints never line up from row to row), each stone's
// width within a fifth of 32 px and its tone within 8% (hash01), with a
// rounded edge, a soft lit side and a shaded one, and dark joints between.
// Near white, as the shared tiles are: the ground's colour multiplies it. A
// DataTexture, so no canvas; the same pixels every call; RepeatWrapping.
// ---------------------------------------------------------------------------
const COBBLE_PX = 128;
const SETT_ROWS = 4;
const SETTS_A_ROW = 4;
const SETT_PX = COBBLE_PX / SETT_ROWS; // 32: a row's depth, and a stone's width before its ±20%
const COBBLE_SALT = 163;
const JOINT_HALF = 1.6; // px either side of a joint's line
const SETT_ROUND = 7; // the corners' radius, px
// row r's joints, along it: its first joint, then each stone's width in turn
// (two stones a fraction wider and two as much narrower, so the row still fills the tile)
function settRow(r) {
  const a = 0.4 * (hash01(0, r, COBBLE_SALT) - 0.5);
  const b = 0.4 * (hash01(1, r, COBBLE_SALT) - 0.5);
  const start = r * (SETT_PX / 2); // half a stone along from the row before
  const edges = [start];
  for (const d of [a, b, -a, -b]) edges.push(edges[edges.length - 1] + SETT_PX * (1 + d));
  return edges; // SETTS_A_ROW + 1 joints, the last the first one a tile on
}
// how far into its stone (px) a point is, and which stone: -ve in a joint
function settAt(x, y, rows) {
  const r = Math.floor(y / SETT_PX) % SETT_ROWS;
  const edges = rows[r];
  let u = x;
  while (u < edges[0]) u += COBBLE_PX;
  while (u >= edges[0] + COBBLE_PX) u -= COBBLE_PX;
  let k = 0;
  while (u >= edges[k + 1]) k++;
  const ex = Math.min(u - edges[k], edges[k + 1] - u) - JOINT_HALF;
  const vy = y - r * SETT_PX;
  const ey = Math.min(vy, SETT_PX - vy) - JOINT_HALF;
  let d = Math.min(ex, ey);
  if (ex < SETT_ROUND && ey < SETT_ROUND && d > 0) d = SETT_ROUND - Math.hypot(SETT_ROUND - ex, SETT_ROUND - ey);
  return { d, r, k };
}
export function createCobbleTexture() {
  const rows = Array.from({ length: SETT_ROWS }, (_, r) => settRow(r));
  const height = (x, y) => { const { d } = settAt(x, y, rows); return d <= 0 ? 0 : Math.min(1, d / 5); };
  const data = new Uint8Array(COBBLE_PX * COBBLE_PX * 4);
  for (let y = 0; y < COBBLE_PX; y++) {
    for (let x = 0; x < COBBLE_PX; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const { d, r, k } = settAt(px, py, rows);
      const grain = 1 + 0.035 * (2 * hash01(x, y, COBBLE_SALT + 2) - 1);
      let rgb;
      if (d <= 0) {
        // the joint: darker toward its line, a little grit
        const t = Math.min(1, -d / JOINT_HALF);
        rgb = [0.64, 0.62, 0.59].map((v) => v * (1 - 0.1 * t) * grain);
      } else {
        const tone = 1 + 0.16 * (hash01(k, r, COBBLE_SALT + 1) - 0.5); // ±8%
        const warm = 0.03 * (2 * hash01(k, r, COBBLE_SALT + 3) - 1);
        // the rounded edge: lit where the stone rises toward the light (up-left), shaded opposite
        const slope = height(px - 1.5, py + 1.5) - height(px, py);
        const lit = 1 - 0.18 * slope - 0.06 * (1 - Math.min(1, d / 5));
        const v = 0.95 * tone * lit * grain;
        rgb = [v * (1 + warm), v, v * (1 - warm)];
      }
      const j = (y * COBBLE_PX + x) * 4;
      for (let c = 0; c < 3; c++) data[j + c] = Math.max(0, Math.min(255, Math.round(255 * rgb[c])));
      data[j + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, COBBLE_PX, COBBLE_PX, THREE.RGBAFormat);
  texture.name = 'marketCobbles';
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

// The place's materials, made once per build (never at import).
export function marketMaterials() {
  const { texture } = createMarketAtlas();
  const std = (color, roughness, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, ...extra });
  return {
    stall: std(0xffffff, 0.9, { map: texture }), // painted boards and signs: the atlas's cells, tinted by white
    awning: std(0xffffff, 0.95, { map: texture, side: THREE.DoubleSide }),
    metal: std(0x6f777c, 0.5, { metalness: 0.5 }),
    lantern: std(0xffe3a8, 0.6, { emissive: 0xffb84a, emissiveIntensity: 0 }), // lit at dusk by the build
    cloth: std(0xe6dcc2, 1, { side: THREE.DoubleSide }),
    front: std(0xffffff, 0.9, { map: createFrontsTexture() }), // the four new counter fronts, sharp
  };
}

// ---------------------------------------------------------------------------
// Shared geometries, one set per build (see the header). All unit
// sized with the base at y = 0 (a stall scales them), except where noted.
// ---------------------------------------------------------------------------
const based = (g) => { g.translate(0, 0.5, 0); return g; };
const part = (g, x, y, z) => { g.translate(x, y, z); return g; };
const boxAt = (w, h, d, x, y, z) => part(new THREE.BoxGeometry(w, h, d), x, y, z);
function buildParts() {
  const trestle = mergeGeometries([ // a plank top (1 x 0.06 x 0.5) at 0.75 high on two splayed trestle ends; the unit is 1 m long
    boxAt(1, 0.06, 0.5, 0, 0.72, 0),
    boxAt(0.06, 0.72, 0.06, -0.42, 0.36, -0.2), boxAt(0.06, 0.72, 0.06, -0.42, 0.36, 0.2),
    boxAt(0.06, 0.72, 0.06, 0.42, 0.36, -0.2), boxAt(0.06, 0.72, 0.06, 0.42, 0.36, 0.2),
  ]);
  const cafeTable = mergeGeometries([ // a round top 0.8 m across at 0.72, a pole, a foot; unit = 1 m wide
    part(new THREE.CylinderGeometry(0.4, 0.4, 0.04, 12), 0, 0.72, 0),
    part(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 6), 0, 0.35, 0),
    part(new THREE.CylinderGeometry(0.18, 0.2, 0.03, 8), 0, 0.015, 0),
  ]);
  const cafeChair = mergeGeometries([ // seat 0.4 square at 0.42, a back to 0.85, four legs; faces +z
    boxAt(0.4, 0.04, 0.4, 0, 0.42, 0),
    boxAt(0.4, 0.3, 0.04, 0, 0.67, -0.18),
    boxAt(0.04, 0.4, 0.04, -0.17, 0.2, -0.17), boxAt(0.04, 0.4, 0.04, 0.17, 0.2, -0.17),
    boxAt(0.04, 0.4, 0.04, -0.17, 0.2, 0.17), boxAt(0.04, 0.4, 0.04, 0.17, 0.2, 0.17),
  ]);
  const basket = based(new THREE.CylinderGeometry(0.5, 0.38, 1, 8, 1, true)); // open top, wider at the lip
  // a flower tub's clump of leaves (step 3): a twenty-sided ball, r 0.5, its faces catching
  // the light unevenly as leaves do (20 triangles)
  const dome = new THREE.IcosahedronGeometry(0.5, 0);
  // a flower's stem: a thin three-sided prism, open, 1 m high, base at 0 (6 triangles)
  const stem = based(new THREE.CylinderGeometry(0.5, 0.5, 1, 3, 1, true));
  const pennant = new THREE.BufferGeometry(); // a triangle in x/y, hanging point down, one-sided (cloth is double-sided)
  pennant.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0, -1, 0], 3));
  pennant.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  pennant.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 0.5, 0], 2));
  return {
    box: new THREE.BoxGeometry(1, 1, 1), // centred, the unit box
    post: based(new THREE.CylinderGeometry(0.5, 0.5, 1, 6)), // base at 0, 1 m high, 1 m thick (scale it)
    counter: based(new THREE.BoxGeometry(1, 1, 1)), // base at 0, so scale (w, h, d) and set y to the floor
    crate: based(new THREE.BoxGeometry(1, 1, 1)),
    basket,
    trestle,
    cafeTable,
    cafeChair,
    bulb: new THREE.SphereGeometry(0.5, 8, 6),
    pennant,
    dome,
    stem,
  };
}
// A gently sagging strip, 1 m wide (x) and 1 m deep (z, back at -0.5, front at +0.5), sloping down
// to the front and dipping in the middle; its UVs run across one atlas cell, inset half a texel so
// the cell's neighbours never bleed in. Stripes run down the slope (they change along u).
function makeAwningSheet(cell) {
  if (!Number.isInteger(cell) || cell < 0 || cell >= ATLAS_CELLS) throw new Error(`awningSheet: no atlas cell ${cell}`);
  const NX = 8;
  const NZ = 2;
  const padU = 0.5 / ATLAS_W;
  const padV = 0.5 / ATLAS_H;
  const { u0, v0, u1, v1 } = atlasCell(cell);
  const pos = [];
  const uv = [];
  for (let j = 0; j <= NZ; j++) {
    const t = j / NZ; // 0 back .. 1 front
    for (let i = 0; i <= NX; i++) {
      const s = i / NX;
      pos.push(s - 0.5, 0.12 * (0.5 - t) - 0.05 * Math.sin(Math.PI * s) * t, t - 0.5);
      uv.push(u0 + padU + s * (u1 - u0 - 2 * padU), v0 + padV + (1 - t) * (v1 - v0 - 2 * padV));
    }
  }
  const idx = [];
  for (let j = 0; j < NZ; j++) {
    for (let i = 0; i < NX; i++) {
      const a = j * (NX + 1) + i;
      const b = a + 1;
      const c = a + NX + 1;
      idx.push(a, c, b, b, c, c + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
// One set per build: the shared geometries plus awningSheet(cell) (made once per cell, kept), and
// dispose() to free them all at teardown. Call inside the build's withLocalUuids.
export function createMarketParts() {
  const PARTS = buildParts();
  const sheets = new Map();
  PARTS.awningSheet = (cell) => {
    if (!sheets.has(cell)) sheets.set(cell, makeAwningSheet(cell));
    return sheets.get(cell);
  };
  PARTS.dispose = () => {
    for (const k of Object.keys(PARTS)) if (PARTS[k] && PARTS[k].isBufferGeometry) PARTS[k].dispose();
    for (const g of sheets.values()) g.dispose();
    sheets.clear();
  };
  return PARTS;
}

// ---------------------------------------------------------------------------
// Treats (Task 11): each under 0.25 m, origin at its middle, casting nothing.
// ---------------------------------------------------------------------------
function treatMat(color, roughness = 0.8) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
}
function treatPart(group, geo, mat, x, y, z, rot) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
  m.castShadow = false;
  m.receiveShadow = false;
  m.userData.noCast = true;
  group.add(m);
  return m;
}
export function buildTreatMesh(kind) {
  const g = new THREE.Group();
  g.name = `treat-${kind}`;
  switch (kind) {
    case 'fishhead': { // a silver head with an open gill, an eye and a tail stump, lying on its side
      treatPart(g, new THREE.SphereGeometry(0.07, 8, 6), treatMat(0x9fb4c0, 0.4), 0, 0, 0).scale.set(1.3, 0.8, 0.8);
      treatPart(g, new THREE.ConeGeometry(0.05, 0.1, 6), treatMat(0x8296a2, 0.5), 0.1, 0, 0, [0, 0, -Math.PI / 2]);
      treatPart(g, new THREE.SphereGeometry(0.014, 6, 4), treatMat(0x101820, 0.3), -0.07, 0.035, 0.045);
      treatPart(g, new THREE.SphereGeometry(0.012, 6, 4), treatMat(0xc2473d, 0.6), -0.02, 0.02, 0.058).scale.set(1.6, 1, 0.5);
      break;
    }
    case 'sausageroll': { // a flaky roll: a golden cylinder on its side with a pale seam and two glazed ends
      treatPart(g, new THREE.CylinderGeometry(0.04, 0.04, 0.17, 10), treatMat(0xc98a3e, 0.7), 0, 0, 0, [0, 0, Math.PI / 2]);
      treatPart(g, new THREE.CylinderGeometry(0.03, 0.03, 0.176, 8), treatMat(0xb5655a, 0.6), 0, 0.005, 0, [0, 0, Math.PI / 2]).scale.set(0.5, 1, 0.5);
      treatPart(g, new THREE.BoxGeometry(0.15, 0.006, 0.014), treatMat(0xefc77d, 0.8), 0, 0.04, 0);
      break;
    }
    case 'cheddar': { // a wedge: a triangular prism with holes' dark spots on its face
      const shape = new THREE.Shape();
      shape.moveTo(-0.08, -0.04); shape.lineTo(0.08, -0.04); shape.lineTo(0.08, 0.05); shape.closePath();
      const wedge = new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: false });
      wedge.translate(0, 0, -0.06);
      treatPart(g, wedge, treatMat(0xe8b92c, 0.6), 0, 0, 0);
      treatPart(g, new THREE.CylinderGeometry(0.014, 0.014, 0.004, 6), treatMat(0xa57a16, 0.7), 0.04, -0.005, 0.062, [Math.PI / 2, 0, 0]);
      treatPart(g, new THREE.CylinderGeometry(0.01, 0.01, 0.004, 6), treatMat(0xa57a16, 0.7), 0.06, 0.02, 0.062, [Math.PI / 2, 0, 0]);
      break;
    }
    case 'cream': { // a saucer with cream in it; the cream sits level with the rim, ready to be lapped
      treatPart(g, new THREE.CylinderGeometry(0.095, 0.07, 0.025, 12), treatMat(0xf2efe6, 0.4), 0, -0.01, 0);
      treatPart(g, new THREE.CylinderGeometry(0.075, 0.075, 0.006, 12), treatMat(0xfff7e2, 0.3), 0, 0.005, 0);
      break;
    }
    case 'crumbs': { // five flat pale bits of pastry scattered round a point
      const bits = [[0, 0, 0.03, 0.4], [0.07, 0.07, 0.022, 1.1], [-0.07, 0.05, 0.026, 2.0], [0.04, -0.08, 0.02, 2.8], [-0.06, -0.07, 0.024, 0.9]];
      for (const [x, z, s, r] of bits) treatPart(g, new THREE.BoxGeometry(s * 1.6, s * 0.5, s), treatMat(0xd9b27c, 0.9), x, 0, z, [0, r, 0]);
      break;
    }
    case 'wool': { // a ball of wool with criss-cross strands and a loose end trailing on the cloth
      treatPart(g, new THREE.SphereGeometry(0.07, 10, 8), treatMat(0xc04a8a, 0.95), 0, 0.02, 0);
      const ring = (rot) => new THREE.TorusGeometry(0.071, 0.008, 4, 14).rotateX(rot[0]).rotateZ(rot[2]).translate(0, 0.02, 0);
      treatPart(g, mergeGeometries([ring([Math.PI / 2.6, 0, 0]), ring([0.4, 0, 1.1])]), treatMat(0xefb2d4, 0.95), 0, 0, 0);
      treatPart(g, new THREE.CylinderGeometry(0.006, 0.006, 0.08, 4), treatMat(0xc04a8a, 0.95), 0.085, -0.04, 0.02, [0, 0, Math.PI / 2.2]);
      break;
    }
    case 'sausages': { // a string of three links, one over another (the cord to the rail is the stall's own: market.js), the middle link at the origin
      const links = [-1, 0, 1].map((i) => new THREE.CylinderGeometry(0.036, 0.036, 0.15, 8).translate(0, i * 0.17, 0));
      treatPart(g, mergeGeometries(links), treatMat(0xc0614a, 0.6), 0, 0, 0);
      break;
    }
    case 'catnip': { // a sprig: a stem, five grey-green leaves and a little purple head
      treatPart(g, new THREE.CylinderGeometry(0.006, 0.008, 0.16, 5), treatMat(0x5a8a4a, 0.9), 0, 0.02, 0);
      const leaves = [0, 1, 2, 3, 4].map((k) => {
        const a = (k / 5) * Math.PI * 2;
        return new THREE.ConeGeometry(0.028, 0.08, 5).rotateX(Math.sin(a) * 1.2).rotateZ(-Math.cos(a) * 1.2).translate(0.045 * Math.cos(a), (k % 2) * 0.03, 0.045 * Math.sin(a));
      });
      treatPart(g, mergeGeometries(leaves), treatMat(0x8fb08a, 0.9), 0, 0, 0);
      treatPart(g, new THREE.SphereGeometry(0.022, 6, 5), treatMat(0x9a63c9, 0.8), 0, 0.11, 0);
      break;
    }
    case 'sardines': { // an opened tin: a silver tin, three sardines lying head to tail in the oil, its lid rolled back
      treatPart(g, new THREE.CylinderGeometry(0.1, 0.1, 0.035, 12), treatMat(0xb9c2c8, 0.35), 0, -0.01, 0);
      const fish = [0, 1, 2].map((k) => new THREE.SphereGeometry(0.03, 7, 5).scale(2.2, 0.55, 0.8).translate(-0.02, 0.025, (k - 1) * 0.045));
      treatPart(g, mergeGeometries(fish), treatMat(0x8fa3ad, 0.3), 0, 0, 0);
      treatPart(g, new THREE.CylinderGeometry(0.05, 0.05, 0.006, 8, 1, false, 0, Math.PI), treatMat(0x9aa4aa, 0.35), 0.09, 0.05, 0, [0, 0, 1.1]);
      break;
    }
    default:
      throw new Error(`buildTreatMesh: no treat kind '${kind}'`);
  }
  g.userData.noCast = true;
  return g;
}

// ---------------------------------------------------------------------------
// The speech bubble: 32 x 32, a white rounded bubble with a bold dark outline
// and three clear dots, clear outside. No canvas.
// ---------------------------------------------------------------------------
export function createBubbleTexture() {
  const N = 32;
  const data = new Uint8Array(N * N * 4);
  const DOTS = [[9, 15], [16, 15], [23, 15]];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      // a rounded rectangle 1..31 by 7..30, corner radius 7, with a small tail at the bottom left
      const rr = (inset) => {
        const x0 = 1 + inset; const x1 = 31 - inset; const y0 = 7 + inset; const y1 = 30 - inset; const r = 7 - inset;
        const cx = Math.min(Math.max(px, x0 + r), x1 - r);
        const cy = Math.min(Math.max(py, y0 + r), y1 - r);
        return (px - cx) ** 2 + (py - cy) ** 2 <= r * r;
      };
      const tail = (inset) => inTri(px, py, [7 + inset, 9], [14 - inset * 1.4, 9], [6, 1 + inset * 1.5]) && py >= 1;
      const outer = rr(0) || tail(0);
      const inner = rr(2.2) || tail(2.2);
      const dot = DOTS.some(([dx, dy]) => (px - dx) ** 2 + (py - dy) ** 2 <= 2.6 * 2.6);
      const j = (y * N + x) * 4;
      if (!outer) { data[j + 3] = 0; continue; }
      const v = dot || !inner ? 28 : 255;
      data[j] = v; data[j + 1] = v; data[j + 2] = v + (v < 100 ? 6 : 0); data[j + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

// ---------------------------------------------------------------------------
// The sweeping broom: a 1.1 m handle hanging from the grip (origin) and a
// fan of bristles below it; casts nothing.
// ---------------------------------------------------------------------------
export function buildBroom() {
  const g = new THREE.Group();
  g.name = 'broom';
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.1, 6), treatMat(0x8a6642, 0.9));
  handle.position.y = -0.55 + 0.05; // runs from 0.05 above the grip to 1.05 below it
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.14, 0.3, 8), treatMat(0xc9a35a, 1));
  head.position.y = -1.05 - 0.15;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.056, 0.04, 8), treatMat(0x6e4a33, 0.9));
  band.position.y = -1.05 - 0.02;
  for (const m of [handle, head, band]) { m.castShadow = false; m.receiveShadow = false; m.userData.noCast = true; g.add(m); }
  g.userData.noCast = true;
  return g;
}
