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

// 8 x 4 cells of 32 px (step 3, V11: it was 4 x 4; cells 0-15 keep their pictures)
const ATLAS_COLS = 8;
const ATLAS_ROWS = 4;
const CELL_PX = 32;
export const ATLAS_W = ATLAS_COLS * CELL_PX;
export const ATLAS_H = ATLAS_ROWS * CELL_PX;
export const ATLAS_CELLS = ATLAS_COLS * ATLAS_ROWS;

export const TREAT_KINDS = Object.freeze(['fishhead', 'sausageroll', 'cheddar', 'cream', 'crumbs']);

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
function awningPixel(i, x) {
  // four px of stripe, four of cream, a faint fold shading across the cell
  const stripe = Math.floor(x / 4) % 2 === 0;
  const base = rgbOf(stripe ? STRIPES[i] : CREAM);
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

// the atlas's unused cells (18-31): plain cream, never drawn
const SPARE = rgbOf(CREAM);

function cellPixel(i, x, y) {
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
