import * as THREE from 'three';
import { hash01 } from './warehouselook.js';

// =============================================================================
// THE ROOFTOPS' KIT: shared geometries, materials, one window atlas, the
// window-quad batcher and the take-off marks. rooftops.js builds the place
// from it.
//
// LOCAL UUIDS: nothing here is made at import. The materials come from
// roofsMaterials() (once per build), the shared geometries (PARTS) and the
// marks' glow are built lazily on first use and kept, so every uuid they draw
// is drawn inside the build's withLocalUuids. Variation is hash01, never
// Math.random.
// =============================================================================

export const ATLAS_SIZE = 128;
export const ATLAS_CELLS = 16;
const CELL_PX = 32;

// Beauty pass, Task C (critique finding 4): windows with something in them.
// Each cell is one window: its light ('warm', a 'tv', or 'dark'), what is in
// it (`kind`), its pane colour, its frame (white or dark green-black) and, for
// curtains and blinds, their cloth. Shapes only, never letters.
export const WINDOW_FRAMES = Object.freeze({ white: 0xa49f94, dark: 0x18221c });
const TV = 0x8090d8; // shown at 0.7: a dim blue-violet, not the daylight blue it was
export const WINDOW_CELLS = Object.freeze([
  { light: 'warm', kind: 'plain', pane: 0xffc766, frame: 'white' }, // 0
  { light: 'warm', kind: 'plain', pane: 0xffb347, frame: 'dark' }, // 1
  { light: 'warm', kind: 'plain', pane: 0xffd98a, frame: 'white' }, // 2
  { light: 'warm', kind: 'curtains', pane: 0xf7b464, frame: 'white', cloth: 0xa23a42 }, // 3: red curtains open
  { light: 'warm', kind: 'curtains', pane: 0xffdca0, frame: 'dark', cloth: 0x4a7a58 }, // 4: green curtains open
  { light: 'warm', kind: 'blind', pane: 0xffcf80, frame: 'white', cloth: 0xd9bc84 }, // 5: a blind half down
  { light: 'warm', kind: 'blind', pane: 0xeea052, frame: 'dark', cloth: 0xc79a62 }, // 6
  { light: 'warm', kind: 'cat', pane: 0xffc766, frame: 'white', pose: 'sit' }, // 7: a cat sitting on the sill
  { light: 'warm', kind: 'cat', pane: 0xffd28a, frame: 'dark', pose: 'loaf' }, // 8: a cat lying on the sill
  { light: 'warm', kind: 'plant', pane: 0xffb860, frame: 'white' }, // 9: a pot plant (a geranium) on the sill
  { light: 'warm', kind: 'plain', pane: 0xf2a65a, frame: 'dark' }, // 10
  { light: 'tv', kind: 'tv', pane: TV, frame: 'white' }, // 11
  { light: 'dark', kind: 'plain', pane: 0x1d2230, frame: 'white' }, // 12
  { light: 'dark', kind: 'plain', pane: 0x242a2a, frame: 'dark' }, // 13
  { light: 'dark', kind: 'closed', pane: 0x3a2a30, frame: 'white', cloth: 0x3a2a30 }, // 14: curtains drawn
  { light: 'dark', kind: 'closed', pane: 0x2a2d3a, frame: 'dark', cloth: 0x2c3240 }, // 15
].map((c) => Object.freeze(c)));
// The plain warm cells: roof lights, the lantern, the shop (nothing stands in them).
export const PLAIN_WARM = Object.freeze(WINDOW_CELLS.map((c, i) => (c.light === 'warm' && c.kind === 'plain' ? i : -1)).filter((i) => i >= 0));
// What a lit window shows, by weight: mostly plain or curtained, a cat now and then.
// Round two, Task E (critique finding 1): one of the plant's two picks is a
// sitting cat's now (cats were only ~7% of lit windows).
const LIT_PICK = Object.freeze([0, 0, 1, 1, 2, 2, 10, 10, 3, 3, 3, 4, 4, 5, 5, 6, 9, 7, 7, 8]);

const rgbOf = (hex, k = 1) => [((hex >> 16) & 255) * k, ((hex >> 8) & 255) * k, (hex & 255) * k];
const mix = (a, c, t) => [a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t, a[2] + (c[2] - a[2]) * t];
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

// The shapes, in pixels from the sill (y up), each a test (x, y) -> inside.
const inEllipse = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
const inTri = (x, y, [ax, ay], [bx, by], [qx, qy]) => {
  const d1 = (x - bx) * (ay - by) - (ax - bx) * (y - by);
  const d2 = (x - qx) * (by - qy) - (bx - qx) * (y - qy);
  const d3 = (x - ax) * (qy - ay) - (qx - ax) * (y - ay);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
};
const inCapsule = (x, y, ax, ay, bx, by, r) => {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - ax - dx * t, y - ay - dy * t) <= r;
};
// Round two, Task E (critique finding 1): the plant was a fan of six long thin
// leaves, which backlit read as a black hand pressed to the glass. Now a
// geranium: a lumpy round crown of overlapping leaf clumps (dark green-black,
// LEAF) over a dark terracotta pot (POT), with small red flower heads
// (FLOWER) dotted over its top, a few of them just proud of it.
const CROWN = Object.freeze([[0, 7.2, 4.5, 3.0], [-3.5, 6.0, 2.6, 2.3], [3.6, 6.2, 2.5, 2.2], [1.0, 9.0, 2.6, 1.9]]); // [cx, cy, rx, ry], px
const FLOWERS = Object.freeze([[-2.6, 8.2, 0.95], [-0.4, 9.9, 1.0], [2.4, 10.2, 0.95], [3.6, 7.6, 0.85], [0.9, 7.6, 0.8]]); // [cx, cy, r], px
const SHAPES = {
  // sitting on the sill looking out, seen from the front: body, head, two ears
  // well apart, the tail curled round to one side
  sit: (x, y) => y >= 0 && (inEllipse(x, y, 0, 3.9, 3.7, 4.2) || inEllipse(x, y, 0, 9.3, 2.8, 2.5)
    || inTri(x, y, [-2.9, 9.9], [-2.6, 13.8], [-0.6, 11.4]) || inTri(x, y, [0.6, 11.4], [2.6, 13.8], [2.9, 9.9])
    || inCapsule(x, y, 2.0, 0.8, 5.6, 0.8, 0.8) || inCapsule(x, y, 5.6, 0.8, 6.4, 2.4, 0.75)),
  // lying in a loaf, facing left: a low body, the head at its front, two ears, the tail's tip curled up
  loaf: (x, y) => y >= 0 && (inEllipse(x, y, 0, 2.6, 5.4, 3.4) || inEllipse(x, y, -4.0, 5.0, 2.5, 2.3)
    || inTri(x, y, [-7.0, 5.4], [-6.8, 9.3], [-4.9, 6.9]) || inTri(x, y, [-3.2, 6.9], [-1.4, 9.3], [-1.0, 5.2])
    || inCapsule(x, y, 4.6, 0.9, 6.6, 2.8, 0.8)),
  // a pot plant: the pot and its rim, a round crown of leaves, no pointed ones
  plant: (x, y) => potOf(x, y) || leafOf(x, y) || flowerOf(x, y),
};
const potOf = (x, y) => y >= 0 && ((y <= 4 && Math.abs(x) <= 2.0 + 0.2 * y) || (y > 3.6 && y <= 4.6 && Math.abs(x) <= 3.0));
const leafOf = (x, y) => CROWN.some(([cx, cy, rx, ry]) => inEllipse(x, y, cx, cy, rx, ry));
const flowerOf = (x, y) => FLOWERS.some(([cx, cy, r]) => Math.hypot(x - cx, y - cy) <= r);
const LEAF = rgbOf(0x141a10); // backlit leaves: dark, a little green
const POT = rgbOf(0x3a1d14); // backlit terracotta
const FLOWER = rgbOf(0x7a2228); // the flower heads: a deep red that still reads against the light
// The plant's colour over pixel (px, py) (as cover()), flowers over leaves over the pot: [rgb, how much]
function plantCover(px, py, ox, scale) {
  const sum = [0, 0, 0];
  let n = 0;
  for (let j = 0; j < 4; j++) {
    for (let i = 0; i < 4; i++) {
      const x = (px + (i + 0.5) / 4 - ox) / scale;
      const y = (py + (j + 0.5) / 4) / scale;
      const c = flowerOf(x, y) ? FLOWER : leafOf(x, y) ? LEAF : potOf(x, y) ? POT : null;
      if (!c) continue;
      n++;
      for (let k = 0; k < 3; k++) sum[k] += c[k];
    }
  }
  return n ? [sum.map((v) => v / n), n / 16] : [null, 0];
}
const SHADOW = rgbOf(0x1c1511); // a backlit cat: dark against the light
// how much of pixel (px, py) the shape at (ox, 0), `scale` times its size, covers (4 x 4 samples)
function cover(shape, px, py, ox, scale) {
  let n = 0;
  for (let j = 0; j < 4; j++) {
    for (let i = 0; i < 4; i++) {
      if (shape((px + (i + 0.5) / 4 - ox) / scale, (py + (j + 0.5) / 4) / scale)) n++;
    }
  }
  return n / 16;
}
// where each stands on the sill (px from the pane's left edge of the cell) and how big
const PLACE = Object.freeze({ sit: { ox: 11, scale: 1.2 }, loaf: { ox: 17.5, scale: 1.35 }, plant: { ox: 19.5, scale: 1.2 } });

// One cell's pixel at (x, y) in it (y up from the sill), as [r, g, b] 0..255.
// The frame is 3 px, the glazing bars 2 px; cats and the plant stand in a sash
// window (a meeting rail high up, no middle bar) so the lower pane is big.
const FRAME_PX = 3;
function cellPixel(cell, x, y) {
  const c = WINDOW_CELLS[cell];
  const frame = rgbOf(WINDOW_FRAMES[c.frame]);
  const sash = c.kind === 'cat' || c.kind === 'plant';
  const lo = FRAME_PX;
  const hi = CELL_PX - 1 - FRAME_PX;
  if (x < lo || y < lo || x > hi || y > hi) return frame;
  const bar = sash ? y === 21 || y === 22 : x === 15 || x === 16 || y === 15 || y === 16;
  if (bar) return frame;
  const u = (x - lo + 0.5) / (hi - lo + 1); // 0..1 across the pane
  const v = (y - lo + 0.5) / (hi - lo + 1); // 0..1 up it
  const glow = Math.sin(Math.PI * u) * Math.sin(Math.PI * v); // soft, brightest in the middle
  let rgb;
  if (c.light === 'warm') rgb = rgbOf(c.pane, 0.75 + 0.25 * glow);
  else if (c.light === 'tv') rgb = rgbOf(c.pane, 0.7 * (0.55 + 0.45 * Math.sin(Math.PI * u) * smooth(0, 0.5, 1 - Math.abs(v - 0.35))));
  else rgb = rgbOf(c.pane, 0.9 + 0.35 * Math.exp(-(((u + v - 0.95) / 0.16) ** 2))); // dark glass, a faint sheen of sky
  if (c.kind === 'curtains') {
    // open at both sides: wide at the rail, tied back low, flaring to the sill
    const w = v > 0.38 ? 0.13 + 0.15 * ((v - 0.38) / 0.62) ** 1.2 : 0.13 + 0.06 * ((0.38 - v) / 0.38);
    const d = Math.min(u, 1 - u);
    const t = smooth(w + 0.02, w - 0.02, d);
    if (t > 0) {
      const fold = 0.8 + 0.2 * Math.sin((u < 0.5 ? u : 1 - u) * 60) ** 2;
      rgb = mix(rgb, rgbOf(c.cloth, fold), t);
    }
  } else if (c.kind === 'closed') {
    const fold = 0.78 + 0.22 * Math.sin(u * 40) ** 2;
    rgb = mix(rgb, rgbOf(c.cloth, fold * (0.9 + 0.1 * v)), 0.92);
  } else if (c.kind === 'blind') {
    // a roller blind down to just under the bars' middle, its hem darker, a cord with a ring
    const hem = 0.6;
    if (v >= hem) rgb = rgbOf(c.cloth, (v < hem + 0.045 ? 0.5 : 0.74 + 0.1 * (v - hem)) * (0.9 + 0.1 * Math.sin(Math.PI * u)));
    else if (Math.abs(x - 22) < 0.6 && v > hem - 0.12) rgb = mix(rgb, rgbOf(c.cloth, 0.55), 0.7);
  } else if (c.kind === 'cat' || c.kind === 'plant') {
    const which = c.kind === 'plant' ? 'plant' : c.pose;
    const { ox, scale } = PLACE[which];
    if (which === 'plant') {
      const [leaf, k] = plantCover(x, y - lo, ox, scale);
      if (k > 0) rgb = mix(rgb, leaf, k);
    } else {
      const k = cover(SHAPES[which], x, y - lo, ox, scale);
      if (k > 0) rgb = mix(rgb, SHADOW, k);
    }
  }
  return rgb.map((q) => Math.round(Math.min(255, Math.max(0, q))));
}

// A DataTexture, 128 x 128 RGBA in 32 px cells: the same pixels every call.
// Magnified smoothly (the half-texel pad in the quads keeps a cell's own
// pixels), so up close a window is a soft picture, not nested squares.
export function createWindowAtlas() {
  const data = new Uint8Array(ATLAS_SIZE * ATLAS_SIZE * 4);
  for (let cell = 0; cell < ATLAS_CELLS; cell++) {
    const ox = (cell % 4) * CELL_PX;
    const oy = Math.floor(cell / 4) * CELL_PX;
    for (let y = 0; y < CELL_PX; y++) {
      for (let x = 0; x < CELL_PX; x++) {
        const rgb = cellPixel(cell, x, y);
        const i = ((oy + y) * ATLAS_SIZE + ox + x) * 4;
        data[i] = rgb[0]; data[i + 1] = rgb[1]; data[i + 2] = rgb[2]; data[i + 3] = 255;
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

// Which cell the window at (x, z), number i, shows: seven in ten lit warm
// (mostly plain or curtained, a cat now and then: LIT_PICK), one in ten a TV,
// two in ten dark or curtained.
export function windowCell(x, z, i) {
  const h = hash01(x, z, i * 3 + 1);
  const g = hash01(x, z, i * 3 + 2);
  if (h < 0.7) return LIT_PICK[Math.min(LIT_PICK.length - 1, Math.floor(g * LIT_PICK.length))];
  if (h < 0.8) return 11;
  return 12 + Math.min(3, Math.floor(g * 4));
}

// Every window quad of a facade batch as ONE indexed BufferGeometry. A quad is
// { x, y, z, nx, nz, w, h, cell }: its centre, its wall's outward normal (in
// the xz plane), its size and its atlas cell. It sits 0.02 m off the wall.
// `out` may be an array that receives the same quads (for tests and pictures).
export function addWindowQuads(list, out) {
  const n = list.length;
  const pos = new Float32Array(n * 12);
  const nor = new Float32Array(n * 12);
  const uv = new Float32Array(n * 8);
  const col = new Float32Array(n * 12);
  const idx = new Uint32Array(n * 6);
  const pad = 0.5 / ATLAS_SIZE;
  for (let i = 0; i < n; i++) {
    const q = list[i];
    const len = Math.hypot(q.nx, q.nz) || 1;
    const nx = q.nx / len;
    const nz = q.nz / len;
    const tx = nz;
    const tz = -nx;
    const cx = q.x + nx * 0.02;
    const cz = q.z + nz * 0.02;
    const hw = q.w / 2;
    const hh = q.h / 2;
    const corners = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]];
    const u0 = (q.cell % 4) / 4 + pad;
    const u1 = (q.cell % 4 + 1) / 4 - pad;
    const v0 = Math.floor(q.cell / 4) / 4 + pad;
    const v1 = (Math.floor(q.cell / 4) + 1) / 4 - pad;
    const uvs = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
    const tint = 0.85 + 0.15 * hash01(q.x, q.z, q.cell + 7);
    for (let c = 0; c < 4; c++) {
      const o = i * 4 + c;
      pos[o * 3] = cx + tx * corners[c][0];
      pos[o * 3 + 1] = q.y + corners[c][1];
      pos[o * 3 + 2] = cz + tz * corners[c][0];
      nor[o * 3] = nx; nor[o * 3 + 1] = 0; nor[o * 3 + 2] = nz;
      uv[o * 2] = uvs[c][0]; uv[o * 2 + 1] = uvs[c][1];
      col[o * 3] = tint; col[o * 3 + 1] = tint; col[o * 3 + 2] = tint;
    }
    idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
    if (Array.isArray(out)) out.push(q);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geometry.setIndex(new THREE.BufferAttribute(idx, 1));
  return { geometry };
}

// The place's materials, made once per build (never at import).
export function roofsMaterials() {
  const { texture } = createWindowAtlas();
  const std = (color, roughness, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, ...extra });
  return {
    brick: std(0xa5593f, 0.95, { flatShading: true }),
    slate: std(0x4a5260, 0.85, { flatShading: true }),
    render: std(0xd9cfbd, 0.95),
    metal: std(0x7d868c, 0.55, { metalness: 0.5 }),
    wood: std(0x8a6642, 0.9),
    glass: std(0x9fc4d8, 0.2, { transparent: true, opacity: 0.55, metalness: 0.1 }),
    windows: new THREE.MeshStandardMaterial({
      color: 0x222222, roughness: 0.4, metalness: 0,
      emissive: 0xffffff, emissiveMap: texture, emissiveIntensity: 1.1,
      map: texture, vertexColors: true,
    }),
  };
}

// ---------------------------------------------------------------------------
// Shared geometries, built on first use and kept (see the header).
// ---------------------------------------------------------------------------
const NAMES = ['box', 'pot', 'ridge', 'gutter', 'coping', 'plank', 'line'];
let partsCache = null;
function buildParts() {
  const ridge = new THREE.CylinderGeometry(0.5, 0.5, 1, 3);
  ridge.rotateZ(Math.PI / 2); // along x, a point up
  const gutter = new THREE.CylinderGeometry(0.5, 0.5, 1, 8, 1, true, Math.PI / 2, Math.PI);
  gutter.rotateZ(Math.PI / 2);
  const line = new THREE.CylinderGeometry(0.5, 0.5, 1, 4);
  line.rotateZ(Math.PI / 2);
  const pot = new THREE.CylinderGeometry(0.5, 0.5, 1, 10);
  pot.translate(0, 0.5, 0);
  return {
    box: new THREE.BoxGeometry(1, 1, 1),
    pot,
    ridge,
    gutter,
    coping: new THREE.BoxGeometry(1, 0.1, 0.4),
    plank: new THREE.BoxGeometry(1, 0.05, 0.25),
    line,
  };
}
const parts = () => (partsCache ??= buildParts());
export const PARTS = {};
for (const k of NAMES) Object.defineProperty(PARTS, k, { enumerable: true, get: () => parts()[k] });

// ---------------------------------------------------------------------------
// The take-off marks (follow-up 2, the owner's "calmer take-off marks"): a
// soft glow at every take-off, and a small piece lying flush at the roof's
// edge only where no real thing shows the spot (the hop's `prop`, roofsplan.js
// DRAWN_MARKS). Never a loose brick.
// ---------------------------------------------------------------------------

// The glow: a disc 0.45 m across the take-off (it was 0.7), added warm light
// at its middle fading to nothing at its rim (it was 0.35 all over), so a row
// of extensions is not dotted and a spot still shows at dusk.
// Beauty pass, Task D (critique finding 7): warm amber (it was a near-white
// 0xffd9a0, a puddle on dark felt), and its opacity follows the evening
// (roofslife.js, on the walk's own copy of the material). `opacity` is the
// kit's own (the dusk one).
// Round two, Task E (critique finding 3): Task D's faint ring just inside the
// rim made every spot a dried puddle or a target, and the amber tone-mapped to
// beige on the dark felt. No ring now: a tight falloff (FALLOFF, of the
// radius: a small bright core, no visible edge), a deeper, more saturated
// amber (0xff8a2c: the critique's 0xff9a3c still read tan at dusk under the
// opacity ceiling), 0.45 at sunset and 0.3 at dusk (the core carries it).
export const MARK_GLOW = Object.freeze({ radius: 0.45, opacity: 0.3, sunset: 0.45, dusk: 0.3, color: 0xff8a2c });
const FALLOFF = 0.42; // alpha = exp(-(d / FALLOFF)^2), d 0 at the middle, 1 at the rim, less its value at the rim
const GLOW_PX = 32;
let glowCache = null;
function glowParts() {
  if (!glowCache) {
    const geometry = new THREE.CircleGeometry(MARK_GLOW.radius, 20);
    geometry.rotateX(-Math.PI / 2);
    // white, its alpha falling from the middle to 0 at the disc's rim, never
    // rising again (the disc's uv spans 0..1 across it)
    const data = new Uint8Array(GLOW_PX * GLOW_PX * 4);
    const rim = Math.exp(-((1 / FALLOFF) ** 2));
    for (let j = 0; j < GLOW_PX; j++) {
      for (let i = 0; i < GLOW_PX; i++) {
        const d = Math.min(1, Math.hypot((i + 0.5) / GLOW_PX - 0.5, (j + 0.5) / GLOW_PX - 0.5) / 0.47);
        const k = (j * GLOW_PX + i) * 4;
        data[k] = data[k + 1] = data[k + 2] = 255;
        data[k + 3] = Math.round(255 * (Math.exp(-((d / FALLOFF) ** 2)) - rim) / (1 - rim));
      }
    }
    const map = new THREE.DataTexture(data, GLOW_PX, GLOW_PX, THREE.RGBAFormat);
    map.magFilter = THREE.LinearFilter;
    map.minFilter = THREE.LinearFilter;
    map.generateMipmaps = false;
    map.needsUpdate = true;
    const material = new THREE.MeshBasicMaterial({
      color: MARK_GLOW.color, map, transparent: true, opacity: MARK_GLOW.opacity, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    glowCache = { geometry, material };
  }
  return glowCache;
}
// The glow's texture (white, its alpha falling from the middle to 0 at the
// disc's rim): the lamps' halo shares it (roofs.js, round two, Task G).
export const markGlowMap = () => glowParts().material.map;
let markMats = null;
const defaultMats = () => (markMats ??= roofsMaterials());

const noCast = (m) => { m.castShadow = false; m.receiveShadow = true; m.userData.noCast = true; return m; };

// A small piece: a unit box scaled, noCast.
function piece(geo, mat, x, y, z, sx, sy, sz, ry = 0) {
  const m = noCast(new THREE.Mesh(geo, mat));
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  m.rotation.y = ry;
  return m;
}

// Builders return pieces in the mark's local frame: +z is the way the cat
// leaps or drops (toward hop.to), y up from the take-off surface; `e` is how
// far ahead the roof's edge is. Each lies flush on the roof, its far side
// just short of the edge (the stub 8 cm short: its leaps cross the edge
// slantwise), no more than 5 cm proud of it.
const MARKS = {
  // a chipped brick lip: the wall's top course showing along the edge, in the
  // walls' own brick (the place's `wall`, when the caller has it), a chip out of one end
  lip: (P, M, e) => [piece(P.box, M.wall ?? M.brick, -0.08, 0.0125, e - 0.06, 0.6, 0.025, 0.08), piece(P.box, M.wall ?? M.brick, 0.31, 0.008, e - 0.06, 0.1, 0.016, 0.08)],
  // a plank stub: a short offcut lying along the leap, its end at the edge
  stub: (P, M, e) => [piece(P.box, M.wood, 0.06, 0.015, e - 0.33, 0.18, 0.03, 0.5)],
  // a lead gutter lip along the edge, an outlet at one end
  gutter: (P, M, e) => [piece(P.box, M.metal, 0, 0.015, e - 0.07, 0.8, 0.03, 0.1), piece(P.box, M.metal, 0.33, 0.035, e - 0.07, 0.1, 0.03, 0.1)],
  // a small roof light flush with the felt: a lead frame round a pane
  skylight: (P, M, e) => [piece(P.box, M.metal, 0, 0.02, e - 0.3, 0.6, 0.04, 0.4), piece(P.box, M.glass, 0, 0.045, e - 0.3, 0.48, 0.01, 0.28)],
};

// A mark at a hop's take-off. `hop` has `mark`, `from` {x, z, y?} and `to`
// {x, z} (or flat x0, z0, y0, x1, z1); the y of the take-off is from.y, else
// hop.y0 / hop.y, else 0, so the caller may add it. With `hop.prop` (a real
// thing shows the spot) the mark is its glow alone; otherwise `kind` must be
// one drawn (DRAWN_MARKS), its pieces at hop.edge ahead (default 0.4 m).
// `mats` defaults to a kept set made on first use. Returns a Group.
export function markMesh(kind, hop, mats) {
  const build = hop.prop ? null : MARKS[kind];
  if (!hop.prop && !build) throw new Error(`roofsparts: no mark object for ${kind}; its hop needs a prop`);
  const fx = hop.from?.x ?? hop.x0 ?? 0;
  const fz = hop.from?.z ?? hop.z0 ?? 0;
  const fy = hop.from?.y ?? hop.y0 ?? hop.y ?? 0;
  const tx = hop.to?.x ?? hop.x1 ?? fx;
  const tz = hop.to?.z ?? hop.z1 ?? fz + 1;
  const g = new THREE.Group();
  g.name = `mark-${kind}`;
  g.position.set(fx, fy, fz);
  g.rotation.y = Math.atan2(tx - fx, tz - fz);
  if (hop.prop) g.userData.prop = hop.prop;
  else for (const m of build(parts(), mats ?? defaultMats(), hop.edge ?? 0.4)) g.add(m);
  const glow = glowParts();
  const disc = noCast(new THREE.Mesh(glow.geometry, glow.material));
  disc.receiveShadow = false;
  disc.position.y = 0.03;
  disc.renderOrder = 2;
  disc.userData.markGlow = true;
  disc.userData.noMerge = true;
  g.add(disc);
  return g;
}
