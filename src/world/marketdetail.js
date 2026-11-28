// =============================================================================
// THE MARKET'S STORY DETAILS (Market beauty pass 4). Pixels only, no geometry: hand-painted shop
// signs for the six older stalls (each its own colour and its own picture: the fishmonger's blue
// and silver, the baker's gold, the cheesemonger's butter with a mouse, the dairy's sky blue, the
// florist's pinks, the fruiterer's green), bright price tags for the four newer ones, and the
// bunting's flags (a paw, a fish, a mouse, or plain). Pictures only, never letters (M12).
// Drawn from fixed tables (no canvas, no random number), the same pixels every call.
// =============================================================================
import * as THREE from 'three';

const rgbOf = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
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
const grow = (t, r = 1) => (x, y) => t(x, y) || t(x + r, y) || t(x - r, y) || t(x, y + r) || t(x, y - r);

// 2 x 2 samples a pixel; layers [[test, colour | fn]], later on top
function layered(bg, layers, x, y) {
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

// ---------------------------------------------------------------------------
// The six hand-painted signs: cells 30, 31, 37, 56, 57, 58 (spare cells of the atlas).
// ---------------------------------------------------------------------------
export const STORY_SIGN_CELLS = Object.freeze({ fish: 30, baker: 31, cheese: 37, milk: 56, flowers: 57, fruit: 58 });
export const STORY_TAG_CELLS = Object.freeze({ toys: 36, plants: 59, bric: 60, butcher: 61 });
const STORY_CELLS = Object.freeze([30, 31, 37, 56, 57, 58]);
export const isStorySign = (i) => STORY_CELLS.includes(i);
export const isStoryTag = (i) => i === 36 || (i >= 59 && i <= 61);

const BOARDS = Object.freeze({ 30: 0x274a6e, 31: 0x6b3f1e, 37: 0x7a5a1e, 56: 0x3d6a8a, 57: 0x8a3a5e, 58: 0x4a6a2a });
const FACES = Object.freeze({ 30: [0xe3eef5, 0xa9c4d8], 31: [0xf8d57a, 0xe4a944], 37: [0xfaee9a, 0xf0d65a], 56: [0xf2f8fb, 0xcfe4ef], 57: [0xfbd5e3, 0xf3a9c6], 58: [0xdcefb0, 0xa9d36f] });
const faceAt = (cell, y) => mixc(rgbOf(FACES[cell][1]), rgbOf(FACES[cell][0]), Math.min(1, Math.max(0, y / 31)));

// a paw print, as a mask (pad and four toes)
const paw = (cx, cy, s) => (x, y) => inEllipse(x, y, cx, cy - 0.8 * s, 2.6 * s, 2.2 * s)
  || inCircle(x, y, cx - 2.7 * s, cy + 1.9 * s, 1.15 * s) || inCircle(x, y, cx - 0.95 * s, cy + 3.1 * s, 1.15 * s)
  || inCircle(x, y, cx + 0.95 * s, cy + 3.1 * s, 1.15 * s) || inCircle(x, y, cx + 2.7 * s, cy + 1.9 * s, 1.15 * s);

const SIGN_LAYERS = {
  30: (() => { // fish: a silver fish with scales, an eye and bubbles over two lines of water
    const body = (x, y) => inEllipse(x, y, 14, 17, 9, 5.8) || inTri(x, y, [21, 17], [29, 24], [29, 10]);
    const scale = (x, y) => inEllipse(x, y, 14, 17, 8, 5) && Math.abs(((x + (Math.floor(y / 3) % 2) * 1.5) % 3) - 1.5) < 0.45 && x > 10 && x < 21;
    return [
      [(x, y) => y < 8 + 1.3 * Math.sin(x * 0.7) && y > 6.6 + 1.3 * Math.sin(x * 0.7), rgbOf(0x4f86b4)],
      [(x, y) => y < 5 + 1.3 * Math.sin(x * 0.7 + 1) && y > 3.6 + 1.3 * Math.sin(x * 0.7 + 1), rgbOf(0x7ea8c8)],
      [grow(body, 1.1), rgbOf(0x2b5576)],
      [body, (x, y) => mixc(rgbOf(0xbcc9d2), rgbOf(0xf2f6f8), Math.min(1, Math.max(0, (y - 11) / 12)))],
      [scale, rgbOf(0x8fa5b4)],
      [(x, y) => inEllipse(x, y, 11, 14.5, 5, 1.6) && y < 15, rgbOf(0xf6f8f9)],
      [(x, y) => inCircle(x, y, 8.6, 18.6, 1.7), rgbOf(0x15202a)],
      [(x, y) => inCircle(x, y, 8.1, 19.2, 0.6), rgbOf(0xffffff)],
      [(x, y) => (inCircle(x, y, 5.5, 25, 1.8) && !inCircle(x, y, 5.5, 25, 1)) || (inCircle(x, y, 8.6, 27.4, 1.3) && !inCircle(x, y, 8.6, 27.4, 0.6)) || (inCircle(x, y, 4.4, 22, 1.1) && !inCircle(x, y, 4.4, 22, 0.5)), rgbOf(0xffffff)],
    ];
  })(),
  31: (() => { // bread: a domed loaf with golden crust and three slashes, a curl of steam, flour dots
    const loaf = (x, y) => (inEllipse(x, y, 17, 13, 10.5, 7) && y >= 11) || inRect(x, y, 6.5, 8, 27.5, 12);
    return [
      [grow(loaf, 1.1), rgbOf(0x6b3f1e)],
      [loaf, (x, y) => mixc(rgbOf(0xa8682a), rgbOf(0xe0a050), Math.min(1, Math.max(0, (y - 8) / 10)))],
      [(x, y) => (Math.abs(x - 12.5 - (y - 15) * 0.5) < 0.8 || Math.abs(x - 17 - (y - 15) * 0.5) < 0.8 || Math.abs(x - 21.5 - (y - 15) * 0.5) < 0.8) && y > 13 && y < 19 && inEllipse(x, y, 17, 13, 9, 6), rgbOf(0xf8e2a4)],
      [(x, y) => Math.abs(x - (17 + 1.2 * Math.sin(y * 1.2))) < 0.5 && y > 21 && y < 28, rgbOf(0xf6e8c8)],
      [(x, y) => inCircle(x, y, 7, 25, 0.9) || inCircle(x, y, 9.5, 27.2, 0.7) || inCircle(x, y, 25, 24.5, 0.9) || inCircle(x, y, 22.6, 27, 0.7) || inCircle(x, y, 26, 21, 0.6), rgbOf(0xfff6e0)],
    ];
  })(),
  37: (() => { // cheese: a holey wedge, a small grey mouse waiting at its foot
    const wedge = (x, y) => inTri(x, y, [3, 7], [29, 7], [29, 24]);
    return [
      [grow(wedge, 1.1), rgbOf(0x8a5c10)],
      [wedge, rgbOf(0xf2b72c)],
      [(x, y) => inRect(x, y, 3, 7, 29, 10.5), rgbOf(0xd89a14)],
      [(x, y) => inCircle(x, y, 22, 14, 1.9) || inCircle(x, y, 26, 19, 1.5) || inCircle(x, y, 17, 9, 1.1) || inCircle(x, y, 25, 10.5, 1.0), rgbOf(0xb87810)],
      [(x, y) => inEllipse(x, y, 10, 11, 5.2, 3.4) || inCircle(x, y, 6, 14.4, 2.3) || inCircle(x, y, 10.4, 14.4, 2.3), rgbOf(0x3b3b44)],
      [(x, y) => inEllipse(x, y, 10, 11, 4.4, 2.7) || inCircle(x, y, 6, 14.4, 1.5) || inCircle(x, y, 10.4, 14.4, 1.5), rgbOf(0xa6a6b2)],
      [(x, y) => inCircle(x, y, 6, 14.4, 0.8) || inCircle(x, y, 10.4, 14.4, 0.8), rgbOf(0xf0a8b8)],
      [(x, y) => inCircle(x, y, 7.2, 12, 0.6), rgbOf(0x15202a)],
      [(x, y) => inCircle(x, y, 4.6, 10.8, 0.8), rgbOf(0xe05a78)],
      [(x, y) => Math.abs(y - (9.4 - (x - 14) * 0.2 + Math.sin((x - 14) * 0.9))) < 0.5 && x > 14 && x < 19, rgbOf(0xd98a96)],
    ];
  })(),
  56: (() => { // milk: a churn with a lid, a drop of milk and a few black cow spots
    const churn = (x, y) => inRect(x, y, 10.5, 6, 21.5, 19) || inRect(x, y, 12, 19, 20, 22.5);
    return [
      [(x, y) => inCircle(x, y, 26, 25.5, 2.2) || inCircle(x, y, 28, 22.5, 1.6) || inCircle(x, y, 5, 8, 2) || inCircle(x, y, 7.6, 5.6, 1.4), rgbOf(0x3a3a44)],
      [grow(churn, 1.1), rgbOf(0x4a6a80)],
      [(x, y) => churn(x, y) || inEllipse(x, y, 16, 24, 5.2, 2), (x, y) => (x < 14 ? rgbOf(0xdfe7ec) : rgbOf(0xb0bcc4))],
      [(x, y) => inRect(x, y, 10.5, 15.5, 21.5, 17), rgbOf(0x7a8a96)],
      [(x, y) => inRect(x, y, 8.5, 13, 10.5, 17.5) || inRect(x, y, 21.5, 13, 23.5, 17.5), rgbOf(0x8d979d)],
      [(x, y) => inCircle(x, y, 16, 11, 2.2), rgbOf(0xf4b6c8)], // a round pink seal on the churn
      [(x, y) => inCircle(x, y, 6.5, 24, 2.7) || inTri(x, y, [6.5, 30], [3.7, 25.2], [9.3, 25.2]), rgbOf(0x6fb2d8)],
      [(x, y) => inCircle(x, y, 5.8, 24.8, 0.8), rgbOf(0xeaf6fb)],
    ];
  })(),
  57: (() => { // flower: a five-petalled bloom on a stem with two leaves, a bee
    const petals = (x, y) => [0, 1, 2, 3, 4].some((k) => inCircle(x, y, 16 + 5.4 * Math.cos(k * 1.2566 + 1.57), 19 + 5.4 * Math.sin(k * 1.2566 + 1.57), 4.3));
    return [
      [(x, y) => Math.abs(x - 16) < 0.8 && y > 4 && y < 14, rgbOf(0x3f7f38)],
      [(x, y) => inEllipse(x, y, 11.5, 8.4, 4.2, 1.8) || inEllipse(x, y, 20.5, 6.6, 4.2, 1.8), rgbOf(0x4f9a48)],
      [grow(petals, 1.0), rgbOf(0xb0396a)],
      [petals, rgbOf(0xfff2f6)],
      [(x, y) => petals(x, y) && !inCircle(x, y, 16, 19, 6.8), rgbOf(0xf7b6cd)],
      [(x, y) => inCircle(x, y, 16, 19, 3.2), rgbOf(0xf5c030)],
      [(x, y) => inCircle(x, y, 15, 20, 1), rgbOf(0xfbe58a)],
      [(x, y) => inEllipse(x, y, 26, 6.5, 2.6, 1.7), rgbOf(0xf2c230)],
      [(x, y) => inRect(x, y, 25, 4.8, 26, 8.2), rgbOf(0x2a2a2e)],
      [(x, y) => inEllipse(x, y, 25.2, 8.8, 1.6, 1.2) || inEllipse(x, y, 27.2, 8.8, 1.6, 1.2), rgbOf(0xeaf6fb)],
    ];
  })(),
  58: (() => { // fruit: a red apple with a leaf, and a pair of cherries
    const apple = (x, y) => inCircle(x, y, 12.5, 15, 7.6) || inCircle(x, y, 17.5, 15, 7.6);
    return [
      [(x, y) => (Math.abs(x - (24.6 + (y - 12) * 0.12)) < 0.55 && y > 12 && y < 25) || (Math.abs(x - (27.4 - (y - 12) * 0.12)) < 0.55 && y > 12 && y < 25), rgbOf(0x3a6a22)],
      [grow((x, y) => inCircle(x, y, 24.2, 9.5, 3.2) || inCircle(x, y, 28, 9, 3.2), 0.9), rgbOf(0x5a0a18)],
      [(x, y) => inCircle(x, y, 24.2, 9.5, 3.2) || inCircle(x, y, 28, 9, 3.2), rgbOf(0xc4162e)],
      [(x, y) => inCircle(x, y, 23.2, 10.6, 0.9) || inCircle(x, y, 27, 10.1, 0.9), rgbOf(0xf6a0a8)],
      [grow(apple, 1.1), rgbOf(0x6a1a14)],
      [apple, (x, y) => mixc(rgbOf(0xc9261e), rgbOf(0xe8584a), Math.min(1, Math.max(0, (y - 10) / 12)))],
      [(x, y) => inEllipse(x, y, 10, 18, 1.6, 2.8), rgbOf(0xf9b1a4)],
      [(x, y) => Math.abs(x - 15 - (y - 22) * -0.15) < 0.6 && y > 21 && y < 26.5, rgbOf(0x5a3b26)],
      [(x, y) => inEllipse(x, y, 19.2, 25.4, 3.6, 1.7), rgbOf(0x4f9a48)],
    ];
  })(),
};

export function storySignPixel(i, x, y) {
  const board = rgbOf(BOARDS[i]);
  if (x < 2 || y < 2 || x > 29 || y > 29) return board;
  if (x < 4 || y < 4 || x > 27 || y > 27) return mixc(board, rgbOf(FACES[i][0]), 0.45);
  // the little cat's paw in the corner of every sign, a painter's mark
  const mark = paw(25.2, 5.2, 0.55);
  const c = layered((X, Y) => faceAt(i, Y), SIGN_LAYERS[i], x, y);
  return mark(x + 0.5, y + 0.5) && i !== 58 && i !== 37 ? mixc(c, board, 0.55) : c;
}

// ---------------------------------------------------------------------------
// The price tags (cells 36, 59-61): a bright card on a wooden board, a coloured band with a punched
// hole at the top, a dot for the thing and one, two and three gold coins beside it.
// ---------------------------------------------------------------------------
const TAG_COLOUR = Object.freeze({ 36: 0xe0489a, 59: 0x1fa866, 60: 0xf0861a, 61: 0xd0263a });
export function storyTagPixel(i, x, y) {
  const band = rgbOf(TAG_COLOUR[i]);
  if (x < 2 || y < 2 || x > 29 || y > 29) return rgbOf(0x8a6642);
  if (x < 3.5 || y < 3.5 || x > 27.5 || y > 27.5) return rgbOf(0xc9a46a);
  const rows = [18.5, 11.5, 4.7];
  return layered(rgbOf(0xfdf3d0), [
    [(X, Y) => Y > 22.2, band],
    [(X, Y) => Y > 22.2 && Y < 22.9, mixc(band, [0, 0, 0], 0.25)],
    [(X, Y) => inCircle(X, Y, 15.5, 25.4, 1.7), rgbOf(0xfdf3d0)],
    [(X, Y) => inCircle(X, Y, 15.5, 25.4, 0.9), rgbOf(0x4a3a2a)],
    [(X, Y) => Math.abs(X - 15.5) < 0.4 && Y > 26.4 && Y < 29, rgbOf(0xf5c542)],
    ...rows.flatMap((cy, k) => [
      [(X, Y) => inCircle(X, Y, 8, cy, 2.8), band],
      [(X, Y) => inCircle(X, Y, 7.2, cy + 0.9, 0.9), mixc(band, [255, 255, 255], 0.6)],
      ...[0, 1, 2].filter((j) => j <= k).flatMap((j) => [
        [(X, Y) => inCircle(X, Y, 15 + j * 5.4, cy, 2.5), rgbOf(0x8a6a1c)],
        [(X, Y) => inCircle(X, Y, 15 + j * 5.4, cy, 1.8), rgbOf(0xf8cf40)],
      ]),
    ]),
  ], x, y);
}

// ---------------------------------------------------------------------------
// Chalkboard doodles (cell 16): small stars, hearts and a paw in pale chalk, drawn over the slate
// between the three pictures. Added to the board's own layers (marketparts.js).
// ---------------------------------------------------------------------------
const star = (cx, cy, r) => (x, y) => (Math.abs(x - cx) < 0.55 && Math.abs(y - cy) < r) || (Math.abs(y - cy) < 0.55 && Math.abs(x - cx) < r) || (Math.abs(Math.abs(x - cx) - Math.abs(y - cy)) < 0.5 && Math.abs(x - cx) < r * 0.55);
const heart = (cx, cy, r) => (x, y) => inCircle(x, y, cx - r * 0.55, cy + r * 0.3, r * 0.62) || inCircle(x, y, cx + r * 0.55, cy + r * 0.3, r * 0.62) || inTri(x, y, [cx - r * 1.1, cy + r * 0.05], [cx + r * 1.1, cy + r * 0.05], [cx, cy - r * 1.05]);
export const CHALK_DOODLES = Object.freeze([
  [star(5, 26.5, 2), rgbOf(0xf2cf6a)],
  [star(26.5, 29, 1.4), rgbOf(0xf3e3c0)],
  [heart(26, 17, 2.1), rgbOf(0xf1a2bd)],
  [paw(5.5, 18.5, 0.9), rgbOf(0xe9ece4)],
  [(x, y) => Math.abs(y - (1.9 + 0.5 * Math.sin(x * 0.9))) < 0.4 && x > 4 && x < 28, rgbOf(0xa9cfdc)],
]);

// ---------------------------------------------------------------------------
// The bunting's flags: a 128 x 32 strip of four cells (plain, paw, fish, mouse). The alpha is the
// flag's ground (255) and the picture (0), the cloth's own colour shows through the ground and the
// shader inks the picture. Cell c's pennant uv: u' = (c + u) / 4.
// ---------------------------------------------------------------------------
export const FLAG_CELLS = 4;
const FLAG_SHAPES = Object.freeze([
  null,
  (x, y) => inEllipse(x, y, 16, 15.5, 4.4, 3.6) || inCircle(x, y, 10.2, 21.2, 2.2) || inCircle(x, y, 13.7, 24, 2.2) || inCircle(x, y, 18.3, 24, 2.2) || inCircle(x, y, 21.8, 21.2, 2.2), // a paw
  (x, y) => inEllipse(x, y, 14.5, 19, 7.4, 4.4) || inTri(x, y, [20, 19], [26, 24], [26, 14]), // a fish, its eye cut out below
  (x, y) => inEllipse(x, y, 16, 17, 6, 4.2) || inCircle(x, y, 10.8, 22.2, 2.7) || inCircle(x, y, 21.2, 22.2, 2.7) || (Math.abs(y - (12.4 - (x - 20) * 0.45 + Math.sin(x * 0.9))) < 0.7 && x > 19 && x < 28), // a mouse: round ears, a tail
]);
const FLAG_HOLES = Object.freeze([null, null, (x, y) => inCircle(x, y, 9.6, 20.2, 1.15), (x, y) => inCircle(x, y, 13.2, 19, 0.8) || inCircle(x, y, 18.8, 19, 0.8)]);
export function createFlagTexture() {
  const W = FLAG_CELLS * 32;
  const data = new Uint8Array(W * 32 * 4);
  for (let c = 0; c < FLAG_CELLS; c++) {
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 32; x++) {
        let hit = 0;
        const S0 = FLAG_SHAPES[c];
        const S = S0 && ((X, Y) => S0(16 + (X - 16) / 1.3, 19 + (Y - 19) / 1.3)); // drawn 1.3 times larger: they read from further
        if (S) {
          for (const sy of [0.25, 0.75]) {
            for (const sx of [0.25, 0.75]) {
              const X = x + sx; const Y = y + sy;
              if (S(X, Y) && !(FLAG_HOLES[c] && FLAG_HOLES[c](16 + (X - 16) / 1.3, 19 + (Y - 19) / 1.3))) hit += 0.25;
            }
          }
        }
        const j = (y * W + c * 32 + x) * 4;
        data[j] = 255; data[j + 1] = 255; data[j + 2] = 255; data[j + 3] = Math.round(255 * (1 - hit));
      }
    }
  }
  const tex = new THREE.DataTexture(data, W, 32, THREE.RGBAFormat);
  tex.name = 'marketFlags';
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}
// the strip's u for flag cell c at a pennant's own u (0..1), inset a texel
export const flagU = (c, u) => (c * 32 + 1 + u * 30) / (FLAG_CELLS * 32);
