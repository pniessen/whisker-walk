import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// =============================================================================
// THE MARKET'S KIT: one 128 px atlas (awning stripes, produce, sign pictures),
// the materials, the shared geometries (PARTS), the five treats, the speech
// bubble and the broom. marketbuild.js builds the square from it.
//
// LOCAL UUIDS: nothing here is made at import. Materials come from
// marketMaterials() and the shared geometries from createMarketParts(), each
// called once per build inside its withLocalUuids; the parts' dispose() is the
// build's to call at teardown.
// No canvas, no Math.random: every pixel comes from fixed tables below.
// Pictures only, never letters (M12).
// =============================================================================

export const ATLAS_SIZE = 128;
export const ATLAS_CELLS = 16;
const CELL_PX = 32;

export const TREAT_KINDS = Object.freeze(['fishhead', 'sausageroll', 'cheddar', 'cream', 'crumbs']);

const CREAM = 0xf3ead2;
// cells 0-5: the awning stripes, [stripe colour] on cream: blue, red, yellow, green, pink, café brown
const STRIPES = Object.freeze([0x3f6fb5, 0xc23b34, 0xe8b92c, 0x4c9a52, 0xe58fb0, 0x6e4a33]);

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

function cellPixel(i, x, y) {
  if (i < 6) return awningPixel(i, x);
  if (i < 11) return producePixel(i, x, y);
  return signPixel(i, x, y);
}

// A DataTexture, 128 x 128 RGBA in 32 px cells: the same pixels every call.
// Cell i sits at column i % 4, row floor(i / 4) counted from the bottom (v up).
export function createMarketAtlas() {
  const data = new Uint8Array(ATLAS_SIZE * ATLAS_SIZE * 4);
  for (let cell = 0; cell < ATLAS_CELLS; cell++) {
    const ox = (cell % 4) * CELL_PX;
    const oy = Math.floor(cell / 4) * CELL_PX;
    for (let y = 0; y < CELL_PX; y++) {
      for (let x = 0; x < CELL_PX; x++) {
        const rgb = cellPixel(cell, x, y);
        const j = ((oy + y) * ATLAS_SIZE + ox + x) * 4;
        data[j] = Math.round(rgb[0]); data[j + 1] = Math.round(rgb[1]); data[j + 2] = Math.round(rgb[2]); data[j + 3] = 255;
      }
    }
  }
  const texture = new THREE.DataTexture(data, ATLAS_SIZE, ATLAS_SIZE, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return { texture, size: ATLAS_SIZE, cells: ATLAS_CELLS };
}

export function atlasCell(i) {
  const u0 = (i % 4) / 4;
  const v0 = Math.floor(i / 4) / 4;
  return { u0, v0, u1: u0 + 0.25, v1: v0 + 0.25 };
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
  };
}
// A gently sagging strip, 1 m wide (x) and 1 m deep (z, back at -0.5, front at +0.5), sloping down
// to the front and dipping in the middle; its UVs run across one atlas cell, inset half a texel so
// the cell's neighbours never bleed in. Stripes run down the slope (they change along u).
function makeAwningSheet(cell) {
  if (!Number.isInteger(cell) || cell < 0 || cell >= ATLAS_CELLS) throw new Error(`awningSheet: no atlas cell ${cell}`);
  const NX = 8;
  const NZ = 2;
  const pad = 0.5 / ATLAS_SIZE;
  const { u0, v0, u1, v1 } = atlasCell(cell);
  const pos = [];
  const uv = [];
  for (let j = 0; j <= NZ; j++) {
    const t = j / NZ; // 0 back .. 1 front
    for (let i = 0; i <= NX; i++) {
      const s = i / NX;
      pos.push(s - 0.5, 0.12 * (0.5 - t) - 0.05 * Math.sin(Math.PI * s) * t, t - 0.5);
      uv.push(u0 + pad + s * (u1 - u0 - 2 * pad), v0 + pad + (1 - t) * (v1 - v0 - 2 * pad));
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
