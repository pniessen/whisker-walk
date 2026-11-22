// THE OLD HOUSE, THE PIECES (Old House step 1). One atlas, one material, and the
// builders house.js draws the shell with: a wall section, a window pane, a floor,
// a stair, the brick skirt under a raised room, and the lamps. Every position
// comes from houseplan.js; variation comes from hash01, never Math.random.
//
// THE ATLAS. One 256 x 256 DataTexture in 64 px cells (HOUSE_ATLAS_CELLS):
// a wallpaper per room, outside brick, oak, pine and stone floors, light and dark
// wood, two rugs and plaster. A cell's pattern repeats every 48 px and the cell
// carries 8 px of that same pattern round it, so a tile drawn from its middle 48
// px sits seamlessly beside the next one, and the coarser mip levels read the
// cell's own pixels, not its neighbour's. Walls, floors and stairs are cut into
// world-aligned tiles (face below), so the pattern runs on across sections and
// pieces without a seam.
//
// THE WALLS. A section is one mesh. Its geometry's base is at local y 0 and the
// mesh stands at the section's base, so house life (Task 6) sinks it by scale.y.
// Corners: a wall running along x reaches half a wall past a corner, a wall
// running along z stops half a wall short of it, so two walls never share a face
// (no shimmer where they meet), and either can sink alone and leave a clean end.
// Inside faces are the room's wallpaper with a skirting board and a dado rail;
// outside faces are brick. A window is a hole with a white frame and glazing bars;
// its pane is its own top-level mesh (paneMesh), because the tree fade takes any
// group holding a window for a building and dusk swaps a pane's material.
// The front door (HOUSE_FRONT_DOOR, ruling R7) is a double door: its x lies on
// the boundary of two sections, so each holds one leaf and sinks with it. For a
// walk with the door home (step 4, `openDoor`) each leaf is its own mesh on a
// pivot at its hinge, the section mesh's child, so house life can swing it.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { hash01 } from './builder.js';
import { litMaterial } from '../render/materials.js';
import {
  WALL_T, WALL_H, LAWN_Y, DOOR_H, HOUSE_LEVELS, HOUSE_ROOMS, HOUSE_STAIRS, HOUSE_FRONT_DOOR, HOUSE_FURNITURE, HOUSE_LAMPS, SECRET_BOOKCASE,
  houseSections, roomAt, stairAt,
} from './houseplan.js';

const freeze = Object.freeze;
const EPS = 1e-9;
const levelY = (id) => HOUSE_LEVELS.find((l) => l.id === id).y;
const roomById = (id) => HOUSE_ROOMS.find((r) => r.id === id);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// ---------------------------------------------------------------------------
// The atlas
// ---------------------------------------------------------------------------

export const ATLAS_PX = 512;
const CELL_PX = 64;
const COLS = ATLAS_PX / CELL_PX;
const GUTTER_PX = 8;
const INNER_PX = 48; // a cell's pattern period

const CELL_ORDER = [
  'hall', 'library', 'parlour', 'kitchen',
  'bedroom', 'attic', 'cellar', 'brick',
  'oak', 'pine', 'stone', 'lightWood',
  'darkWood', 'rugRed', 'rugBlue', 'plaster',
  // the beauty pass: painted and panelled wainscots, pictures, curtains, a green rug, brass
  'wainSage', 'wainWood', 'wainRose', 'wainSky',
  'wainPine', 'art1', 'art2', 'art3',
  'art4', 'mirror', 'clockface', 'curtainRed',
  'curtainGreen', 'curtainBlue', 'gingham', 'rugGreen',
  'brass', 'flame',
  // round 2: kitchen wainscot tiles, cellar slate, attic boards
  'wainTile', 'slate', 'atticBoards',
];
export const HOUSE_ATLAS_CELLS = freeze(Object.fromEntries(CELL_ORDER.map((k, i) => [k, i])));
const C = HOUSE_ATLAS_CELLS;

// Cells drawn once, not tiled (a rug is one picture): their gutter repeats the edge.
const PICTURE = new Set([C.rugRed, C.rugBlue, C.art1, C.art2, C.art3, C.art4, C.mirror, C.clockface, C.rugGreen]);

const hex = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const TAU = Math.PI * 2;
const wave = (v, period) => Math.sin((v / period) * TAU); // period divides 48
const wrapD = (d) => { const m = ((d % INNER_PX) + INNER_PX) % INNER_PX; return m > INNER_PX / 2 ? m - INNER_PX : m; };
const near = (x, y, cx, cy) => Math.hypot(wrapD(x - cx), wrapD(y - cy));
const grain = (x, y, salt, amt) => 1 + (hash01(x, y, salt) - 0.5) * 2 * amt;

// Each pattern takes the pixel (x, y) of its 48 px period and gives [r, g, b].
const PATTERNS = {
  // the hall: cream with broad sage stripes and a fine line between them
  hall(x, y) {
    const m = x % 24;
    const c = m < 7 ? hex(0xb7c4a4) : m === 12 ? hex(0xd4c9a8) : hex(0xece1c6);
    return mul(c, grain(x, y, 1, 0.025));
  },
  // the library: deep green with small gold diamonds
  library(x, y) {
    let c = hex(0x3f5f4a);
    const dA = Math.abs(wrapD(x - 12)) + Math.abs(wrapD(y - 12));
    const dB = Math.abs(wrapD(x - 36)) + Math.abs(wrapD(y - 36));
    if (Math.min(dA, dB) <= 3) c = hex(0xb9a067);
    else if (near(x, y, 36, 12) < 1.3 || near(x, y, 12, 36) < 1.3) c = hex(0x6f8a70);
    return mul(c, grain(x, y, 2, 0.03));
  },
  // the parlour: dusty rose with a paler trellis of waving vines and a bud between
  parlour(x, y) {
    let c = hex(0xb06d69);
    const sway = 5 * wave(y, 48);
    if (Math.abs(wrapD(x - 12 - sway)) < 1.1 || Math.abs(wrapD(x - 36 + sway)) < 1.1) c = hex(0xc98d84);
    else if (near(x, y, 24, 12) < 2.2 || near(x, y, 0, 36) < 2.2) c = hex(0xd29a8e);
    return mul(c, grain(x, y, 3, 0.03));
  },
  // the kitchen: cream and pale blue-green tiles with grout lines
  kitchen(x, y) {
    if (x % 12 === 0 || y % 12 === 0) return mul(hex(0xc8bfae), grain(x, y, 4, 0.02));
    const tx = Math.floor(x / 12);
    const ty = Math.floor(y / 12);
    const c = (tx + ty) % 2 ? hex(0xc9ddd8) : hex(0xeee8d6);
    return mul(c, grain(tx, ty, 41, 0.03) * grain(x, y, 4, 0.015));
  },
  // the bedroom: soft blue with cream sprigs
  bedroom(x, y) {
    let c = hex(0xaac0d3);
    for (const [cx, cy] of [[12, 12], [36, 36]]) {
      const d = near(x, y, cx, cy);
      if (d < 1) c = hex(0xd88c8a);
      else if (d < 2.6) c = hex(0xf0e8d8);
      else if (near(x, y, cx + 4, cy + 3) < 1.5) c = hex(0x8aa888);
    }
    return mul(c, grain(x, y, 5, 0.025));
  },
  // the attic: faded ochre with pinstripes and old soft stains
  attic(x, y) {
    const c = x % 8 === 0 ? hex(0xae9262) : hex(0xc6aa76);
    return mul(c, (1 + 0.07 * wave(x, 48) * wave(y, 24)) * grain(x, y, 6, 0.05));
  },
  // the cellar: whitewashed stone blocks
  cellar(x, y) {
    const row = Math.floor(y / 16);
    const bx = (x + (row % 2) * 12) % 24;
    if (bx === 0 || y % 16 === 0) return mul(hex(0xaaa496), grain(x, y, 7, 0.04));
    const id = Math.floor(((x + (row % 2) * 12) % 48) / 24);
    const moss = row % 3 === 2 && hash01(id, row, 72) > 0.5 ? [0.86, 0.96, 0.82] : [1, 1, 1];
    const c = mul(hex(0xd9d3c5), (0.88 + 0.2 * hash01(id, row, 73)) * grain(x, y, 7, 0.04));
    return [c[0] * moss[0], c[1] * moss[1], c[2] * moss[2]];
  },
  // outside brick: running bond, 4 bricks and 8 courses to the period
  brick(x, y) {
    const course = Math.floor(y / 6);
    const sx = x + (course % 2) * 6;
    if (sx % 12 === 0 || y % 6 === 0) return mul(hex(0xbcae9a), grain(x, y, 8, 0.05));
    const id = Math.floor((sx % 48) / 12);
    const k = 0.8 + 0.32 * hash01(id, course, 81);
    return mul(hex(0x9c4e3a), k * grain(x, y, 8, 0.05));
  },
  // oak boards, four to the period, their ends staggered
  oak(x, y) {
    const board = Math.floor(x / 12);
    if (x % 12 === 0 || y === (board * 17 + 5) % 48) return hex(0x5c3c22);
    const g = 1 + 0.07 * Math.sin((x % 12) * 1.7 + hash01(board, 0, 91) * 6 + 0.8 * wave(y, 48));
    return mul(hex(0xb27c48), (0.88 + 0.22 * hash01(board, 1, 92)) * g * grain(x, y, 9, 0.03));
  },
  // pine boards, wider and paler, with a soft knot in one
  pine(x, y) {
    const board = Math.floor(x / 16);
    if (x % 16 === 0) return hex(0x9a7848);
    if (y === (board * 23 + 9) % 48) return hex(0xa8865a);
    const g = 1 + 0.05 * Math.sin((x % 16) * 1.3 + hash01(board, 0, 93) * 6 + 0.7 * wave(y, 48));
    let k = (0.9 + 0.16 * hash01(board, 1, 94)) * g * grain(x, y, 10, 0.03);
    if (board === 1) {
      const e = (wrapD(x - 24) / 3.2) ** 2 + (wrapD(y - 30) / 2.2) ** 2;
      if (e < 1) k *= 0.8 + 0.2 * e;
    }
    return mul(hex(0xd4ac70), k);
  },
  // flagstones, four to the period
  stone(x, y) {
    if (x % 24 === 0 || y % 24 === 0) return mul(hex(0x7f786c), grain(x, y, 11, 0.04));
    const id = Math.floor(x / 24) + 2 * Math.floor(y / 24);
    const speck = hash01(x, y, 112) > 0.94 ? 0.82 : 1;
    return mul(hex(0xaba393), (0.86 + 0.24 * hash01(id, 0, 111)) * speck * grain(x, y, 11, 0.04));
  },
  lightWood(x, y) {
    return mul(hex(0xc99c66), (1 + 0.08 * Math.sin(x * 0.9 + 2 * wave(y, 48))) * grain(x, y, 12, 0.03));
  },
  darkWood(x, y) {
    return mul(hex(0x6b432a), (1 + 0.1 * Math.sin(x * 0.9 + 2 * wave(y, 48))) * grain(x, y, 13, 0.03));
  },
  // a red rug with a navy border and a medallion (one picture, not tiled)
  rugRed(x, y) {
    const d = Math.min(x, y, 47 - x, 47 - y);
    const m = Math.abs(x - 23.5) + Math.abs(y - 23.5);
    let c;
    if (d < 3) c = hex(0x2f3b5f);
    else if (d === 3) c = hex(0xe0cca0);
    else if (d < 6) c = (x + y) % 4 === 0 ? hex(0xe0cca0) : hex(0x6a2b29);
    else if (m < 3) c = hex(0xc9a151);
    else if (m < 6) c = hex(0xe0cca0);
    else if (m < 10) c = hex(0x2f3b5f);
    else c = hex(0x9b3b35);
    return mul(c, grain(x, y, 14, 0.04));
  },
  // a blue runner with cream bands and a thin red line
  rugBlue(x, y) {
    const d = Math.min(x, 47 - x);
    let c;
    if (d < 3) c = hex(0xe3d7b9);
    else if (y % 12 < 2) c = hex(0xe3d7b9);
    else if (y % 12 === 6) c = hex(0xa84b41);
    else c = hex(0x4b6189);
    return mul(c, grain(x, y, 15, 0.04));
  },
  plaster(x, y) {
    return mul(hex(0xe9ddc7), (1 + 0.035 * wave(x, 48) * wave(y, 48)) * grain(x, y, 16, 0.03));
  },
};

// ---- the beauty pass: wainscot boards, little pictures, curtain folds, a rag rug ----
const bead = (base, salt) => (x, y) => {
  const m = x % 6;
  const k = m === 0 ? 0.7 : m === 1 ? 1.1 : 1;
  return mul(hex(base), k * grain(x, y, salt, 0.025));
};
const inTri = (x, y, a, b, c) => {
  const d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
  const u = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / d;
  const v = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / d;
  return u >= 0 && v >= 0 && u + v <= 1;
};
const ell = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 < 1;
const lerpC = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const fold = (base, salt) => (x, y) => mul(hex(base), (0.8 + 0.24 * (0.5 + 0.5 * wave(x, 8))) * (y > 44 ? 0.8 : 1) * grain(x, y, salt, 0.02));
Object.assign(PATTERNS, {
  wainSage: bead(0x9fb08e, 21),
  wainWood: bead(0x5f3b25, 22),
  wainRose: bead(0xb98480, 23),
  wainSky: bead(0x93aec4, 24),
  wainPine: bead(0xc99d62, 25),
  // a landscape: pale sky, a low sun, two hills and a small red-roofed house
  art1(x, y) {
    let c = lerpC(hex(0xa4cbe2), hex(0xf2e2bc), clamp01(y / 30));
    if (near(x, y, 34, 13) < 5) c = hex(0xf6d878);
    const far = 27 + 3 * wave(x + 7, 48);
    const fore = 36 + 2 * wave(x * 2 + 5, 48);
    if (y > far) c = hex(0x86ae6a);
    if (y > fore) c = hex(0x4a7640);
    if (x > 11 && x < 18 && y > 27 && y < 33) c = hex(0xf0e4cc);
    if (inTri(x, y, [10, 27], [19, 27], [14.5, 22])) c = hex(0xa8503c);
    return mul(c, grain(x, y, 26, 0.03));
  },
  // a ginger cat in a dark frame, ears pricked
  art2(x, y) {
    let c = lerpC(hex(0x23394a), hex(0x3e5a68), 1 - Math.hypot(x - 24, y - 24) / 34);
    if (ell(x, y, 24, 27, 13, 11) || inTri(x, y, [12, 24], [14, 11], [22, 17]) || inTri(x, y, [36, 24], [34, 11], [26, 17])) {
      c = hex(0xd89048);
      if ((x === 24 || x === 20 || x === 28) && y < 20) c = hex(0xa8602c);
      if (ell(x, y, 24, 32, 6, 4)) c = hex(0xf0e4d0);
      if (near(x, y, 18.5, 26) < 2.4) c = hex(0x9cc86a);
      if (near(x, y, 29.5, 26) < 2.4) c = hex(0x9cc86a);
      if (near(x, y, 18.5, 26) < 1 || near(x, y, 29.5, 26) < 1) c = hex(0x20201c);
      if (near(x, y, 24, 30) < 1.5) c = hex(0xd88a86);
    }
    return mul(c, grain(x, y, 27, 0.03));
  },
  // a blue vase of flowers on a table, warm wall behind
  art3(x, y) {
    let c = hex(0xe8d3a4);
    if (y > 35) c = hex(0x8a5a38);
    if (ell(x, y, 24, 29, 6, 8)) c = hex(0x3f5f8f);
    if (x > 22 && x < 26 && y < 22 && y > 14) c = hex(0x5c8a4c);
    for (const [cx, cy, col] of [[24, 13, 0xc4463c], [17, 18, 0xf0c050], [31, 18, 0xe0809a], [20, 10, 0xf0e4d0]]) if (near(x, y, cx, cy) < 3.6) c = hex(col);
    if (ell(x, y, 17, 24, 3.5, 1.6) || ell(x, y, 31, 24, 3.5, 1.6)) c = hex(0x5c8a4c);
    return mul(c, grain(x, y, 28, 0.03));
  },
  // a sailing boat on a calm sea at sunset
  art4(x, y) {
    let c = lerpC(hex(0xf0c8a8), hex(0xf6e6cc), clamp01(y / 28));
    if (y > 28) c = lerpC(hex(0x5a8aa4), hex(0x3a6a88), clamp01((y - 28) / 20)) ;
    if (y > 28 && (y + Math.floor(x / 6)) % 5 === 0) c = hex(0x8ab0c0);
    if (near(x, y, 36, 27) < 4 && y < 28) c = hex(0xf6c878);
    if (inTri(x, y, [22, 14], [22, 30], [33, 30])) c = hex(0xf2ead8);
    if (inTri(x, y, [20, 18], [20, 30], [13, 30])) c = hex(0xe4d4b4);
    if (y >= 30 && y <= 34 && x >= 13 && x <= 34 - (y - 30)) c = hex(0x5a3a28);
    return mul(c, grain(x, y, 29, 0.03));
  },
  // a mirror: cool glass with two soft glints
  mirror(x, y) {
    let c = lerpC(hex(0xb9d0da), hex(0xe6f0f0), clamp01((x + y) / 90));
    const s = x + y;
    if ((s > 26 && s < 31) || (s > 36 && s < 38)) c = lerpC(c, hex(0xffffff), 0.6);
    return mul(c, grain(x, y, 30, 0.015));
  },
  // a clock face: cream, twelve ticks, ten past ten, in a dark case
  clockface(x, y) {
    const dx = x - 23.5;
    const dy = y - 23.5;
    const r = Math.hypot(dx, dy);
    if (r > 22) return hex(0x6b432a);
    if (r > 20) return hex(0xc9a14a);
    let c = hex(0xf2e8cc);
    const a = Math.atan2(dy, dx);
    if (r > 16 && Math.abs(((a / (TAU / 12)) % 1 + 1) % 1 - 0.5) > 0.44) c = hex(0x3a2a20);
    const hand = (ang, len) => {
      const t = dx * Math.cos(ang) + dy * Math.sin(ang);
      return t > 0 && t < len && Math.abs(-dx * Math.sin(ang) + dy * Math.cos(ang)) < 1.1;
    };
    if (hand(-Math.PI / 2 - 0.9, 10) || hand(-Math.PI / 2 + 0.5, 15) || r < 1.8) c = hex(0x2a1e18);
    return mul(c, grain(x, y, 31, 0.025));
  },
  curtainRed: fold(0xa8483f, 32),
  curtainGreen: fold(0x4f7a5a, 33),
  curtainBlue: fold(0x5f7fa8, 34),
  gingham(x, y) {
    const a = Math.floor(x / 6) % 2;
    const b = Math.floor(y / 6) % 2;
    const c = a && b ? hex(0xc05a50) : a || b ? hex(0xe8b4ac) : hex(0xf6f0e6);
    return mul(c, grain(x, y, 35, 0.02));
  },
  // a rag rug: concentric bands of green, cream, deep green and gold
  rugGreen(x, y) {
    const d = Math.min(x, y, 47 - x, 47 - y);
    const cols = [0xe8dcc0, 0x5f8f6a, 0xe8dcc0, 0x3f6f58, 0xc9a151, 0x3f6f58];
    return mul(hex(cols[Math.floor(d / 4) % cols.length]), grain(x, y, 36, 0.05));
  },
  // a band of deep teal subway tiles, white grout
  wainTile(x, y) {
    if (x % 12 === 0 || y % 6 === 0) return mul(hex(0xe4e8e0), grain(x, y, 39, 0.02));
    const row = Math.floor(y / 6);
    const k = 0.9 + 0.2 * hash01(Math.floor((x + (row % 2) * 6) / 12), row, 391);
    return mul(hex(0x4f8d8a), k * grain(x, y, 39, 0.02));
  },
  // dark slate flags with mossy joints, four to the period, no two alike
  slate(x, y) {
    const id = Math.floor(x / 24) + 2 * Math.floor(y / 24);
    if (x % 24 === 0 || y % 24 === 0) return mul(hex(hash01(id, 3, 401) > 0.5 ? 0x5f6a4c : 0x585248), grain(x, y, 40, 0.05));
    const stain = 0.8 + 0.25 * hash01(id, 0, 402) + 0.1 * wave(x + id * 7, 24) * wave(y, 48);
    return mul(hex(0x8d8f90), stain * (hash01(x, y, 403) > 0.95 ? 0.8 : 1) * grain(x, y, 40, 0.04));
  },
  // old wide attic boards, grey-brown, nail heads and a dark knot
  atticBoards(x, y) {
    const board = Math.floor(x / 24);
    if (x % 24 === 0) return hex(0x5c4a36);
    if (y === (board * 29 + 7) % 48) return hex(0x6e5a42);
    const nail = (x % 24 === 4 || x % 24 === 20) && y % 24 === 6;
    if (nail) return hex(0x3a3028);
    const k = (0.82 + 0.2 * hash01(board, 1, 411)) * (1 + 0.06 * Math.sin((x % 24) * 0.9 + hash01(board, 0, 412) * 6));
    return mul(hex(0xa38a68), k * grain(x, y, 41, 0.035));
  },
  brass(x, y) { return mul(hex(0xc9a14a), (1 + 0.1 * wave(x, 24)) * grain(x, y, 37, 0.03)); },
  flame(x, y) { return mul(hex(0xfff0b0), grain(x, y, 38, 0.02)); },
});

// The atlas, the same bytes every call.
export function createHouseAtlas() {
  const data = new Uint8Array(ATLAS_PX * ATLAS_PX * 4);
  CELL_ORDER.forEach((name, cell) => {
    const pattern = PATTERNS[name];
    const ox = (cell % COLS) * CELL_PX;
    const oy = Math.floor(cell / COLS) * CELL_PX;
    const picture = PICTURE.has(cell);
    for (let py = 0; py < CELL_PX; py++) {
      for (let px = 0; px < CELL_PX; px++) {
        const x = picture ? Math.min(INNER_PX - 1, Math.max(0, px - GUTTER_PX)) : (px - GUTTER_PX + INNER_PX) % INNER_PX;
        const y = picture ? Math.min(INNER_PX - 1, Math.max(0, py - GUTTER_PX)) : (py - GUTTER_PX + INNER_PX) % INNER_PX;
        const rgb = pattern(x, y);
        const i = ((oy + py) * ATLAS_PX + ox + px) * 4;
        data[i] = Math.round(Math.min(255, Math.max(0, rgb[0])));
        data[i + 1] = Math.round(Math.min(255, Math.max(0, rgb[1])));
        data[i + 2] = Math.round(Math.min(255, Math.max(0, rgb[2])));
        data[i + 3] = 255;
      }
    }
  });
  const texture = new THREE.DataTexture(data, ATLAS_PX, ATLAS_PX, THREE.RGBAFormat);
  texture.name = 'houseAtlas';
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

export function houseMaterial(atlas) {
  return litMaterial(0xffffff, { map: atlas });
}

// (fu, fv) in [0, 1] over a cell's middle 48 px -> atlas uv.
export function cellUV(cell, fu, fv) {
  const col = cell % COLS;
  const row = Math.floor(cell / COLS);
  return [
    (col * CELL_PX + GUTTER_PX + clamp01(fu) * INNER_PX) / ATLAS_PX,
    (row * CELL_PX + GUTTER_PX + clamp01(fv) * INNER_PX) / ATLAS_PX,
  ];
}

// World tile sizes (m) per cell: [along, up] for a wall, [x, z] for a floor.
const PAPER_TILE = freeze([0.8, 0.8]);
const BRICK_TILE = freeze([0.9, 0.6]);
const WOOD_TILE = freeze([1.0, 1.0]);
const STONE_TILE = freeze([1.2, 1.2]);
const PLASTER_TILE = freeze([1.0, 1.0]);
const tileOf = (cell) => (cell === C.brick ? BRICK_TILE : cell === C.stone || cell === C.slate ? STONE_TILE
  : cell === C.oak || cell === C.pine || cell === C.atticBoards ? WOOD_TILE : cell === C.plaster ? PLASTER_TILE : PAPER_TILE);

// ---------------------------------------------------------------------------
// The kit: convex polygons into one indexed geometry, wound to their normals.
// ---------------------------------------------------------------------------

class Kit {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.uv = [];
    this.index = [];
  }

  // pts: convex polygon of [x, y, z]; uvs: [u, v] per point; n: the outward normal
  // (null: the polygon's own, turned to face up).
  fan(pts, uvs, n = null) {
    let nx = 0, ny = 0, nz = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      nx += (a[1] - b[1]) * (a[2] + b[2]);
      ny += (a[2] - b[2]) * (a[0] + b[0]);
      nz += (a[0] - b[0]) * (a[1] + b[1]);
    }
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-8) return;
    let want = n;
    if (!want) want = ny >= 0 ? [nx / len, ny / len, nz / len] : [-nx / len, -ny / len, -nz / len];
    const order = pts.map((_, i) => i);
    if (nx * want[0] + ny * want[1] + nz * want[2] < 0) order.reverse();
    const base = this.pos.length / 3;
    for (const i of order) {
      this.pos.push(pts[i][0], pts[i][1], pts[i][2]);
      this.nor.push(want[0], want[1], want[2]);
      this.uv.push(uvs[i][0], uvs[i][1]);
    }
    for (let i = 1; i + 1 < order.length; i++) this.index.push(base, base + i, base + i + 1);
  }

  get empty() { return this.index.length === 0; }

  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.index);
    g.computeBoundingSphere();
    return g;
  }
}

export function partsKit() {
  return new Kit();
}

// Sutherland-Hodgman against one line of a 2D polygon: keep coordinate k >= v (above) or <= v.
function clip(poly, k, v, above) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const ain = above ? a[k] >= v - 1e-12 : a[k] <= v + 1e-12;
    const bin = above ? b[k] >= v - 1e-12 : b[k] <= v + 1e-12;
    if (ain) out.push(a);
    if (ain !== bin) {
      const t = (v - a[k]) / (b[k] - a[k]);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}
const area2 = (p) => { let s = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a[0] * b[1] - b[0] * a[1]; } return Math.abs(s) / 2; };

// An axis-aligned plane: axis 'x' (S = z, T = y), 'z' (S = x, T = y) or 'y' (S = x, T = z).
const toWorld = (axis, at, S, T) => (axis === 'x' ? [at, T, S] : axis === 'z' ? [S, T, at] : [S, at, T]);
const AXIS_N = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };

// A convex polygon (in S, T) on an axis plane, facing `sign`. With `tile` ([s, t]
// in metres) it is cut on a world-aligned grid and each piece shows its share of
// the cell, so patterns run on across faces; without it the cell is stretched once
// over the polygon's bounds.
export function kitFace(kit, axis, at, sign, poly, cell, tile = null) {
  const n = AXIS_N[axis].map((v) => v * sign);
  let s0 = Infinity, s1 = -Infinity, t0 = Infinity, t1 = -Infinity;
  for (const [s, t] of poly) { s0 = Math.min(s0, s); s1 = Math.max(s1, s); t0 = Math.min(t0, t); t1 = Math.max(t1, t); }
  if (s1 - s0 < 1e-7 || t1 - t0 < 1e-7) return;
  if (!tile) {
    kit.fan(poly.map(([s, t]) => toWorld(axis, at, s, t)), poly.map(([s, t]) => cellUV(cell, (s - s0) / (s1 - s0), (t - t0) / (t1 - t0))), n);
    return;
  }
  const [tu, tv] = tile;
  const i0 = Math.floor(s0 / tu + 1e-7), i1 = Math.ceil(s1 / tu - 1e-7);
  const j0 = Math.floor(t0 / tv + 1e-7), j1 = Math.ceil(t1 / tv - 1e-7);
  for (let i = i0; i < i1; i++) {
    const col = clip(clip(poly, 0, i * tu, true), 0, (i + 1) * tu, false);
    if (col.length < 3) continue;
    for (let j = j0; j < j1; j++) {
      const piece = clip(clip(col, 1, j * tv, true), 1, (j + 1) * tv, false);
      if (piece.length < 3 || area2(piece) < 1e-8) continue;
      kit.fan(piece.map(([s, t]) => toWorld(axis, at, s, t)), piece.map(([s, t]) => cellUV(cell, (s - i * tu) / tu, (t - j * tv) / tv)), n);
    }
  }
}

const rect = (s0, s1, t0, t1) => [[s0, t0], [s1, t0], [s1, t1], [s0, t1]];

// An axis-aligned box; `skip` names faces left out ('x-', 'x+', 'y-', 'y+', 'z-', 'z+').
export function kitBox(kit, x0, x1, y0, y1, z0, z1, cell, { tile = null, skip = null } = {}) {
  const no = (f) => skip && skip.includes(f);
  if (!no('x-')) kitFace(kit, 'x', x0, -1, rect(z0, z1, y0, y1), cell, tile);
  if (!no('x+')) kitFace(kit, 'x', x1, 1, rect(z0, z1, y0, y1), cell, tile);
  if (!no('z-')) kitFace(kit, 'z', z0, -1, rect(x0, x1, y0, y1), cell, tile);
  if (!no('z+')) kitFace(kit, 'z', z1, 1, rect(x0, x1, y0, y1), cell, tile);
  if (!no('y-')) kitFace(kit, 'y', y0, -1, rect(x0, x1, z0, z1), cell, tile);
  if (!no('y+')) kitFace(kit, 'y', y1, 1, rect(x0, x1, z0, z1), cell, tile);
}

function finish(mesh, { cast = true } = {}) {
  mesh.castShadow = cast;
  mesh.receiveShadow = true;
  if (!cast) mesh.userData.noCast = true;
  return mesh;
}

export function kitMesh(kit, material, name, opts) {
  const m = finish(new THREE.Mesh(kit.geometry(), material), opts);
  m.name = name;
  return m;
}

// ---------------------------------------------------------------------------
// Wall sections
// ---------------------------------------------------------------------------

// A section in its own terms: u runs along it (world x or z), v across it (the
// other one, from its centreline), y is world height.
function wallFrame(s) {
  const run = Math.abs(s.z1 - s.z0) < EPS ? 'x' : 'z';
  const fixed = run === 'x' ? s.z0 : s.x0;
  const lo = run === 'x' ? Math.min(s.x0, s.x1) : Math.min(s.z0, s.z1);
  const hi = run === 'x' ? Math.max(s.x0, s.x1) : Math.max(s.z0, s.z1);
  const across = run === 'x' ? 'z' : 'x';
  return {
    run, across, fixed, lo, hi,
    pt: (u, y, v) => (run === 'x' ? [u, y, fixed + v] : [fixed + v, y, u]),
    normal: (sign) => (run === 'x' ? [0, 0, sign] : [sign, 0, 0]),
  };
}

// A face of the wall's long side at v = off.
function longFace(kit, W, off, sign, poly, cell, tile) {
  kitFace(kit, W.across, W.fixed + off, sign, poly, cell, tile);
}
// An end face at u, across [v0, v1], [y0, y1].
function endFace(kit, W, u, sign, v0, v1, y0, y1, cell, tile = null) {
  kitFace(kit, W.run, u, sign, rect(W.fixed + v0, W.fixed + v1, y0, y1), cell, tile);
}
// A flat (horizontal) face at y over [u0, u1] x [v0, v1].
function flatFace(kit, W, y, sign, u0, u1, v0, v1, cell, tile = null) {
  const poly = W.run === 'x' ? rect(u0, u1, W.fixed + v0, W.fixed + v1) : rect(W.fixed + v0, W.fixed + v1, u0, u1);
  kitFace(kit, 'y', y, sign, poly, cell, tile);
}
// A box in wall terms; skip uses 'u-', 'u+', 'v-', 'v+', 'y-', 'y+'.
function wallBox(kit, W, u0, u1, y0, y1, v0, v1, cell, { tile = null, skip = [] } = {}) {
  const map = { 'u-': `${W.run}-`, 'u+': `${W.run}+`, 'v-': `${W.across}-`, 'v+': `${W.across}+`, 'y-': 'y-', 'y+': 'y+' };
  const sk = skip.map((f) => map[f]);
  if (W.run === 'x') kitBox(kit, u0, u1, y0, y1, W.fixed + v0, W.fixed + v1, cell, { tile, skip: sk });
  else kitBox(kit, W.fixed + v0, W.fixed + v1, y0, y1, u0, u1, cell, { tile, skip: sk });
}

// How far the section reaches along its run once its ends meet the walls across them.
function wallSpan(s, sections) {
  const W = wallFrame(s);
  let { lo, hi } = W;
  if (s.kind === 'lintel') return [lo, hi];
  const meet = (u) => {
    const [px, , pz] = W.pt(u, 0, 0);
    let perp = false;
    let coll = false;
    for (const q of sections) {
      if (q === s) continue;
      const Q = wallFrame(q);
      if (Q.run === W.run) {
        if (Math.abs(Q.fixed - W.fixed) < EPS && (Math.abs(Q.lo - u) < EPS || Math.abs(Q.hi - u) < EPS)) coll = true;
      } else if (q.kind !== 'lintel') {
        const qu = Q.run === 'x' ? px : pz;
        const qf = Q.run === 'x' ? pz : px;
        if (Math.abs(qf - Q.fixed) < EPS && qu >= Q.lo - EPS && qu <= Q.hi + EPS) perp = true;
      }
    }
    return { perp, coll };
  };
  const a = meet(lo);
  const b = meet(hi);
  const h = WALL_T / 2;
  if (W.run === 'x') {
    if (a.perp && !a.coll) lo -= h;
    if (b.perp && !b.coll) hi += h;
  } else {
    if (a.perp) lo += h;
    if (b.perp) hi -= h;
  }
  return [lo, hi];
}

// What a side of the section faces: a room (its wallpaper), a stairwell, or outside (brick).
const STAIR_PAPER = freeze({ main: 'hall', back: 'attic', cellar: 'cellar' });
function sideOf(s, W, sign) {
  const [px, , pz] = W.pt((W.lo + W.hi) / 2, 0, sign * 0.5);
  if (s.kind === 'stair') {
    if (stairAt(px, pz) === s.owner) return { kind: 'stair', cell: C[STAIR_PAPER[s.owner] ?? 'plaster'] };
    return { kind: 'out', cell: C.brick };
  }
  const r = roomAt(px, pz);
  if (r && roomById(r).level === s.level) return { kind: 'room', room: r, cell: C[r] };
  return { kind: 'out', cell: C.brick };
}

// Interval arithmetic on [a, b] pairs.
function subtract(spans, cuts) {
  let out = spans.map((p) => [p[0], p[1]]);
  for (const [c0, c1] of cuts) {
    const next = [];
    for (const [a, b] of out) {
      if (c1 <= a + EPS || c0 >= b - EPS) { next.push([a, b]); continue; }
      if (c0 > a + EPS) next.push([a, c0]);
      if (c1 < b - EPS) next.push([c1, b]);
    }
    out = next;
  }
  return out.filter(([a, b]) => b - a > 1e-6);
}

export const FRONT_DOOR_W = 1.4; // both leaves
const FRAME_W = 0.05; // a window's frame, white
const ARCH_W = 0.07; // an architrave round a window or the door
const SKIRT_H = 0.14;
const DADO_Y = 0.8;
const DADO_H = 0.05;
const WAIN = freeze({ hall: 'wainSage', library: 'wainWood', parlour: 'wainRose', bedroom: 'wainSky', attic: 'wainPine', kitchen: 'wainTile' });
const WAIN_TILE = freeze([0.8, 6]);
const WAIN_TILES = freeze({ kitchen: freeze([0.8, 0.8]) }); // tiles have rows, so they keep their height phase (the kitchen floor is 0) // the boards run floor to rail, so only their width repeats

// The section's holes: its window and its leaf of the front door.
function wallHoles(s, W) {
  const out = [];
  const w = s.window;
  if (w) {
    out.push({ u0: w.at - w.width / 2, u1: w.at + w.width / 2, y0: s.base + w.sill, y1: s.base + w.head, kind: w.round ? 'round' : 'window' });
  }
  const d = HOUSE_FRONT_DOOR;
  if (s.kind === 'wall' && W.run === 'x' && Math.abs(W.fixed - d.z) < EPS) {
    const l0 = Math.max(W.lo, d.x - FRONT_DOOR_W / 2);
    const l1 = Math.min(W.hi, d.x + FRONT_DOOR_W / 2);
    if (l1 - l0 > EPS) out.push({ u0: l0, u1: l1, y0: s.base, y1: s.base + DOOR_H, kind: 'door' });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Wall dressing (the beauty pass): a cornice, and pictures, mirrors, clocks, sconces,
// curtains, shelves and bunting drawn into the wall section they hang on, so they sink
// with it. [room, wall of the room, along the wall (world x for n and s, z for e and w),
// height over the room's floor, kind, width, height, look]. An item is left out where it
// would stand in a piece of furniture or a lamp, or reach past its section's solid wall.
// ---------------------------------------------------------------------------

const D = (room, side, at, y, kind, w = 0, h = 0, look = null) => freeze({ room, side, at, y, kind, w, h, look });
const SIDE_LINE = freeze({ n: (r) => r.minZ, s: (r) => r.maxZ, w: (r) => r.minX, e: (r) => r.maxX });
const SIDE_G = freeze({ n: 1, s: -1, w: 1, e: -1 });
export const HOUSE_DECOR = freeze([
  // the hall
  D('hall', 'w', 4.2, 1.55, 'mirror', 0.7, 0.95), D('hall', 'w', 3.0, 1.75, 'sconce'), D('hall', 'w', 5.4, 1.75, 'sconce'),
  D('hall', 'w', 10.2, 1.6, 'frame', 0.9, 0.65, 'art1'),
  D('hall', 'e', 9.6, 1.5, 'frame', 0.6, 0.75, 'art2'), D('hall', 'e', 4.3, 1.55, 'frame', 0.9, 0.65, 'art4'), D('hall', 'e', 11.0, 1.75, 'sconce'),
  D('hall', 'n', 2.9, 1.6, 'frame', 0.65, 0.8, 'art3'), D('hall', 'n', -1.95, 1.75, 'sconce'),
  D('hall', 's', -2, 0, 'curtains', 0, 0, 'curtainRed'), D('hall', 's', 2, 0, 'curtains', 0, 0, 'curtainRed'), D('hall', 's', 0, 2.5, 'clock', 0.36),
  // the library
  D('library', 's', -9, 1.7, 'frame', 1.1, 0.75, 'art1'), D('library', 's', -12, 1.6, 'frame', 0.9, 0.7, 'art4'), D('library', 's', -5.6, 1.6, 'frame', 0.6, 0.75, 'art3'),
  D('library', 's', -10.9, 1.75, 'sconce'), D('library', 's', -7.1, 1.75, 'sconce'),
  D('library', 'w', 3.7, 0, 'curtains', 0, 0, 'curtainGreen'), D('library', 'w', 10.3, 0, 'curtains', 0, 0, 'curtainGreen'), D('library', 'w', 8.0, 1.6, 'frame', 0.65, 0.8, 'art2'),
  D('library', 'e', 4.5, 1.85, 'clock', 0.4), D('library', 'e', 10.6, 1.6, 'frame', 0.7, 0.8, 'art3'), D('library', 'e', 9.0, 1.75, 'sconce'),
  // the parlour
  D('parlour', 'e', 7.0, 2.15, 'mirror', 1.1, 0.85), D('parlour', 'e', 5.2, 1.9, 'sconce'), D('parlour', 'e', 8.8, 1.9, 'sconce'),
  D('parlour', 'e', 3.4, 1.6, 'frame', 0.8, 0.6, 'art1'), D('parlour', 'e', 10.7, 1.6, 'frame', 0.6, 0.8, 'art2'),
  D('parlour', 's', 5.7, 0, 'curtains', 0, 0, 'curtainBlue'), D('parlour', 's', 12.3, 0, 'curtains', 0, 0, 'curtainBlue'),
  D('parlour', 's', 8.7, 1.8, 'frame', 1.0, 0.7, 'art4'), D('parlour', 's', 7.5, 1.75, 'sconce'), D('parlour', 's', 10.0, 1.75, 'sconce'),
  D('parlour', 'w', 4.0, 1.6, 'frame', 0.7, 0.8, 'art3'), D('parlour', 'w', 10.3, 1.6, 'frame', 0.6, 0.75, 'art2'),
  D('parlour', 'n', 6.2, 1.7, 'frame', 0.9, 0.65, 'art1'), D('parlour', 'n', 12.0, 1.7, 'frame', 0.65, 0.8, 'art3'),
  // the kitchen
  D('kitchen', 'n', 5.7, 1.0, 'curtains', 0, 0, 'gingham'), D('kitchen', 'n', 12.3, 1.0, 'curtains', 0, 0, 'gingham'),
  D('kitchen', 'n', 9.0, 2.3, 'clock', 0.4), D('kitchen', 'n', 9.0, 1.72, 'rack', 1.1), D('kitchen', 'n', 7.5, 1.55, 'shelf', 1.1), D('kitchen', 'n', 10.5, 1.55, 'shelf', 1.1),
  D('kitchen', 's', 6.0, 1.7, 'frame', 0.7, 0.55, 'art4'), D('kitchen', 's', 12.0, 1.7, 'frame', 0.7, 0.55, 'art1'),
  D('kitchen', 'w', -6.0, 1.7, 'frame', 0.6, 0.8, 'art3'), D('kitchen', 'w', -0.8, 1.7, 'frame', 0.6, 0.7, 'art2'),
  D('kitchen', 'e', -7.1, 1.7, 'frame', 0.8, 0.6, 'art1'), D('kitchen', 'e', 0.9, 1.7, 'frame', 0.6, 0.7, 'art2'),
  // the bedroom
  D('bedroom', 'n', -3, 0, 'curtains', 0, 0, 'curtainRed'), D('bedroom', 'n', -0.6, 1.75, 'mirror', 0.6, 0.85), D('bedroom', 'n', 0.9, 1.7, 'sconce'),
  D('bedroom', 'e', -12.0, 1.75, 'frame', 1.0, 0.7, 'art1'), D('bedroom', 'e', -10.6, 1.7, 'sconce'), D('bedroom', 'e', -14.6, 1.7, 'sconce'),
  D('bedroom', 'w', -14.4, 1.6, 'frame', 0.6, 0.8, 'art3'), D('bedroom', 'w', -8.2, 1.6, 'mirror', 0.7, 1.1),
  D('bedroom', 's', -3.2, 1.7, 'frame', 0.7, 0.55, 'art4'),
  // the attic
  D('attic', 'n', -22, 2.3, 'bunting', 6), D('attic', 'n', -19, 1.7, 'frame', 0.6, 0.8, 'art2'),
  D('attic', 's', -20, 1.7, 'frame', 0.8, 0.6, 'art4'), D('attic', 's', -17, 1.5, 'mirror', 0.6, 1.0),
  D('attic', 'e', -14.2, 1.6, 'frame', 0.6, 0.8, 'art3'), D('attic', 'e', -7.9, 1.6, 'frame', 0.8, 0.6, 'art1'),
  D('attic', 'w', -13.6, 1.6, 'frame', 0.5, 0.65, 'art2'),
  // the cellar
  D('cellar', 'n', 27.0, 1.7, 'frame', 0.7, 0.55, 'art4'), D('cellar', 's', 26.7, 1.7, 'frame', 0.6, 0.75, 'art3'),
  D('cellar', 's', 22.0, 1.9, 'sconce'), D('cellar', 'w', -8.0, 1.8, 'sconce'),
]);

// Where each sconce hangs, for house.js's warm glow: world x, y, z of its flame, the wall's inward normal.
export function houseSconceSpots() {
  return HOUSE_DECOR.filter((d) => d.kind === 'sconce').map((d) => {
    const r = roomById(d.room);
    const line = SIDE_LINE[d.side](r);
    const g = SIDE_G[d.side];
    const along = d.side === 'n' || d.side === 's';
    const off = line + g * (WALL_T / 2 + 0.1);
    return { level: r.level, x: along ? d.at : off, y: levelY(r.level) + d.y + 0.12, z: along ? off : d.at, nx: along ? 0 : g, nz: along ? g : 0 };
  });
}

let CLEAR = null;
function clearBoxes() {
  if (CLEAR) return CLEAR;
  CLEAR = [];
  for (const f of HOUSE_FURNITURE) {
    if (!(f.r > 0 || f.ledge)) continue;
    const turned = Math.abs(Math.sin(f.rotY)) > 0.5;
    const hx = (turned ? f.d : f.w) / 2;
    const hz = (turned ? f.w : f.d) / 2;
    const y = levelY(f.level);
    CLEAR.push({ x0: f.x - hx, x1: f.x + hx, z0: f.z - hz, z1: f.z + hz, y0: y, y1: y + f.h });
  }
  for (const l of HOUSE_LAMPS) {
    const y = levelY(roomById(l.room).level);
    CLEAR.push({ x0: l.x - 0.35, x1: l.x + 0.35, z0: l.z - 0.35, z1: l.z + 0.35, y0: y, y1: y + 1.9 });
  }
  return CLEAR;
}

// A picture drawn once on a wall face: its top at the top of the cell, right as the viewer sees it.
function artFace(kit, W, g, u0, u1, ya, yb, v, cell) {
  const right = W.run === 'x' ? g : -g;
  const pts = [[u0, ya], [u1, ya], [u1, yb], [u0, yb]];
  kit.fan(pts.map(([u, y]) => W.pt(u, y, v)), pts.map(([u, y]) => cellUV(cell, right > 0 ? (u - u0) / (u1 - u0) : (u1 - u) / (u1 - u0), 1 - (y - ya) / (yb - ya))), W.normal(g));
}

function wallDressing(kit, W, s, side, [a, b], y0, y1, holes) {
  const room = roomById(side.room);
  const g = side.sign;
  const h = WALL_T / 2;
  const back = g > 0 ? 'v-' : 'v+';
  const vs = (d0, d1) => (g > 0 ? [g * h + d0, g * h + d1] : [g * h - d1, g * h - d0]);
  const box = (u0, u1, ya, yb, d0, d1, cell) => { const [va, vb] = vs(d0, d1); wallBox(kit, W, u0, u1, y0 + ya, y0 + yb, va, vb, cell, { skip: [back, 'y-'] }); };
  // the cornice and a fine moulding under it, round the top of every room's wall
  const [ca, cb] = vs(0, 0.045);
  wallBox(kit, W, a, b, y1 - 0.12, y1, ca, cb, C.plaster, { skip: [back] });
  const base = levelY(room.level);
  const free = (u0, u1, ya, yb, depth) => {
    if (u0 < a + 0.02 || u1 > b - 0.02) return false;
    const [va, vb] = vs(0, depth);
    const p = W.pt(u0, 0, va);
    const q = W.pt(u1, 0, vb);
    const x0 = Math.min(p[0], q[0]) - 0.03, x1 = Math.max(p[0], q[0]) + 0.03;
    const z0 = Math.min(p[2], q[2]) - 0.03, z1 = Math.max(p[2], q[2]) + 0.03;
    return !clearBoxes().some((f) => f.x0 < x1 && f.x1 > x0 && f.z0 < z1 && f.z1 > z0 && f.y0 < base + yb && f.y1 > base + ya);
  };
  for (const d of HOUSE_DECOR) {
    if (d.room !== room.id || SIDE_G[d.side] !== g || (W.run === 'x') !== (d.side === 'n' || d.side === 's')) continue;
    if (Math.abs(W.fixed - SIDE_LINE[d.side](room)) > EPS || (d.kind !== 'bunting' && (d.at < a || d.at > b))) continue;
    const u = d.at;
    if (d.kind === 'frame' || d.kind === 'mirror') {
      const u0 = u - d.w / 2, u1 = u + d.w / 2, ya = d.y - d.h / 2, yb = d.y + d.h / 2;
      if (!free(u0, u1, ya, yb, 0.05)) continue;
      const rim = d.kind === 'mirror' || d.look === 'art2' || d.look === 'art4' ? C.brass : C.darkWood;
      box(u0, u1, ya, yb, 0, 0.045, rim);
      artFace(kit, W, g, u0 + 0.05, u1 - 0.05, y0 + ya + 0.05, y0 + yb - 0.05, vs(0.047, 0.047)[0], C[d.kind === 'mirror' ? 'mirror' : d.look]);
    } else if (d.kind === 'clock') {
      const u0 = u - d.w / 2, u1 = u + d.w / 2, ya = d.y - d.w / 2, yb = d.y + d.w / 2;
      if (!free(u0, u1, ya, yb, 0.05)) continue;
      box(u0, u1, ya, yb, 0, 0.045, C.darkWood);
      artFace(kit, W, g, u0 + 0.01, u1 - 0.01, y0 + ya + 0.01, y0 + yb - 0.01, vs(0.047, 0.047)[0], C.clockface);
    } else if (d.kind === 'sconce') {
      if (!free(u - 0.08, u + 0.08, d.y - 0.14, d.y + 0.25, 0.14)) continue;
      box(u - 0.05, u + 0.05, d.y - 0.12, d.y + 0.1, 0, 0.03, C.brass);
      box(u - 0.015, u + 0.015, d.y - 0.02, d.y + 0.02, 0.03, 0.12, C.brass);
      box(u - 0.025, u + 0.025, d.y + 0.02, d.y + 0.1, 0.07, 0.12, C.plaster);
      box(u - 0.018, u + 0.018, d.y + 0.1, d.y + 0.16, 0.078, 0.112, C.flame);
    } else if (d.kind === 'curtains') {
      const o = holes.find((q) => q.kind === 'window' && Math.abs((q.u0 + q.u1) / 2 - u) < 1e-6);
      if (!o) continue;
      const bot = d.y || 0.05;
      const top = o.y1 - y0 + 0.2;
      const cell = C[d.look];
      for (const [pa, pb] of [[o.u0 - 0.5, o.u0 - 0.08], [o.u1 + 0.08, o.u1 + 0.5]]) {
        // blocked down to the floor (a shelf below): the curtain hangs short, above the piece
        const lo = free(pa, pb, bot, top, 0.1) ? bot : 1.75;
        if (lo === bot || free(pa, pb, lo, top, 0.1)) box(pa, pb, lo, top, 0.0, 0.08, cell);
      }
      if (free(o.u0 - 0.5, o.u1 + 0.5, top, top + 0.15, 0.12)) box(o.u0 - 0.5, o.u1 + 0.5, top, top + 0.15, 0.0, 0.1, cell);
    } else if (d.kind === 'shelf') {
      const u0 = u - d.w / 2, u1 = u + d.w / 2;
      if (!free(u0, u1, d.y, d.y + 0.3, 0.2)) continue;
      box(u0, u1, d.y, d.y + 0.03, 0, 0.18, C.darkWood);
      box(u0 + 0.1, u0 + 0.14, d.y - 0.12, d.y, 0, 0.04, C.darkWood);
      box(u1 - 0.14, u1 - 0.1, d.y - 0.12, d.y, 0, 0.04, C.darkWood);
      [C.curtainRed, C.plaster, C.brass, C.curtainGreen, C.curtainBlue].forEach((cell, i) => {
        const x = u0 + 0.1 + i * ((d.w - 0.2) / 4);
        const tall = 0.1 + 0.07 * hash01(u + i, d.y, 71);
        box(x - 0.045, x + 0.045, d.y + 0.03, d.y + 0.03 + tall, 0.05, 0.13, cell);
      });
    } else if (d.kind === 'rack') {
      const u0 = u - d.w / 2, u1 = u + d.w / 2;
      if (!free(u0, u1, d.y - 0.3, d.y + 0.03, 0.2)) continue;
      box(u0, u1, d.y, d.y + 0.025, 0.02, 0.1, C.darkWood);
      [C.brick, C.brass, C.brick, C.plaster].forEach((cell, i) => {
        const x = u0 + 0.12 + i * ((d.w - 0.24) / 3);
        const tall = 0.12 + 0.05 * hash01(u + i, d.y, 72);
        box(x - 0.007, x + 0.007, d.y - 0.07, d.y, 0.05, 0.065, C.darkWood);
        box(x - 0.055, x + 0.055, d.y - 0.07 - tall, d.y - 0.07, 0.03, 0.14, cell);
      });
    } else if (d.kind === 'bunting') {
      // a string of flags along the wall, over as many sections as it crosses: each draws its own
      const n = Math.round(d.w / 0.36);
      const flags = [C.curtainRed, C.brass, C.curtainBlue, C.curtainGreen, C.wainRose];
      const v = vs(0.02, 0.02)[0];
      const lo = Math.max(u, a + 0.03);
      const hi = Math.min(u + d.w, b - 0.03);
      if (hi - lo > 0.1 && free(lo, hi, d.y - 0.35, d.y + 0.02, 0.06)) box(lo, hi, d.y, d.y + 0.012, 0, 0.012, C.darkWood);
      for (let i = 0; i < n; i++) {
        const fu = u + 0.1 + i * ((d.w - 0.3) / (n - 1));
        if (fu < a + 0.03 || fu + 0.26 > b - 0.03 || !free(fu, fu + 0.26, d.y - 0.3, d.y, 0.06)) continue;
        const uv0 = cellUV(flags[i % flags.length], 0.5, 0.5);
        const pts = [W.pt(fu, y0 + d.y, v), W.pt(fu + 0.26, y0 + d.y, v), W.pt(fu + 0.13, y0 + d.y - 0.3, v)];
        kit.fan(pts, pts.map(() => uv0), W.normal(g));
      }
    }
  }
}

function flatWall(kit, s, sections, meta) {
  const W = wallFrame(s);
  const [a, b] = wallSpan(s, sections);
  const h = WALL_T / 2;
  const y0 = s.base;
  const y1 = s.base + s.height;
  const sides = [-1, 1].map((sign) => ({ sign, ...sideOf(s, W, sign) }));
  const holes = wallHoles(s, W);

  // columns between the holes' edges, each with its solid runs of height
  const cuts = [a, b];
  for (const o of holes) for (const u of [o.u0, o.u1]) if (u > a + EPS && u < b - EPS && !cuts.some((c) => Math.abs(c - u) < EPS)) cuts.push(u);
  cuts.sort((p, q) => p - q);
  const cols = [];
  for (let i = 0; i + 1 < cuts.length; i++) {
    const c0 = cuts[i];
    const c1 = cuts[i + 1];
    const over = holes.filter((o) => o.u0 <= c0 + EPS && o.u1 >= c1 - EPS);
    cols.push({ c0, c1, solid: subtract([[y0, y1]], over.map((o) => [o.y0, o.y1])) });
  }
  cols.forEach((col, i) => {
    const { c0, c1 } = col;
    for (const [ya, yb] of col.solid) {
      for (const side of sides) {
        const wain = side.kind === 'room' ? WAIN[side.room] : null;
        const yd = y0 + DADO_Y;
        if (wain && ya < yd - EPS) { // the wainscot below the dado rail, boards that need no height phase
          longFace(kit, W, side.sign * h, side.sign, rect(c0, c1, ya, Math.min(yb, yd)), C[wain], WAIN_TILES[side.room] ?? WAIN_TILE);
          if (yb > yd + EPS) longFace(kit, W, side.sign * h, side.sign, rect(c0, c1, yd, yb), side.cell, tileOf(side.cell));
        } else longFace(kit, W, side.sign * h, side.sign, rect(c0, c1, ya, yb), side.cell, tileOf(side.cell));
      }
      if (yb >= y1 - EPS) flatFace(kit, W, yb, 1, c0, c1, -h, h, C.darkWood, WOOD_TILE); // the cap, seen when zoomed out
      else flatFace(kit, W, yb, 1, c0, c1, -h, h, C.plaster); // a sill's reveal
      if (ya > y0 + EPS || s.kind === 'lintel') flatFace(kit, W, ya, -1, c0, c1, -h, h, C.plaster); // a head's soffit
      for (const [u, sign, nb] of [[c0, -1, cols[i - 1]], [c1, 1, cols[i + 1]]]) {
        for (const [ea, eb] of subtract([[ya, yb]], nb ? nb.solid : [])) endFace(kit, W, u, sign, -h, h, ea, eb, C.plaster, PLASTER_TILE);
      }
    }
  });

  // skirting and dado on every side that faces a room (not on lintels)
  if (s.kind === 'wall') {
    for (const side of sides) {
      if (side.kind !== 'room') continue;
      let sa = a;
      let sb = b;
      if (W.run === 'z') { // stopped short of a corner: leave the corner to the wall across
        if (a > W.lo + EPS) sa += 0.03;
        if (b < W.hi - EPS) sb -= 0.03;
      }
      const back = side.sign > 0 ? 'v-' : 'v+';
      const v0 = side.sign * h;
      const vs = (d) => (side.sign > 0 ? [v0, v0 + d] : [v0 - d, v0]);
      const floorHoles = holes.filter((o) => o.y0 <= y0 + EPS).map((o) => [o.u0, o.u1]);
      for (const [u0, u1] of subtract([[sa, sb]], floorHoles)) {
        const [va, vb] = vs(0.02);
        wallBox(kit, W, u0, u1, y0, y0 + SKIRT_H, va, vb, C.darkWood, { skip: [back, 'y-'] });
      }
      const dadoHoles = holes.filter((o) => o.y0 < y0 + DADO_Y + DADO_H && o.y1 > y0 + DADO_Y).map((o) => [o.u0, o.u1]);
      for (const [u0, u1] of subtract([[sa, sb]], dadoHoles)) {
        const [va, vb] = vs(0.018);
        wallBox(kit, W, u0, u1, y0 + DADO_Y, y0 + DADO_Y + DADO_H, va, vb, C.lightWood, { skip: [back] });
      }
    }
  }

  if (s.kind === 'wall') for (const side of sides) if (side.kind === 'room') wallDressing(meta.deco, W, s, side, [a, b], y0, y1, holes);

  for (const o of holes) {
    if (o.kind === 'window') windowDressing(kit, W, o, sides);
    else if (o.kind === 'round') roundDressing(kit, W, o, sides);
    else meta.doorLeaf = frontDoor(kit, W, o, sides, meta);
  }
}

// A sash window's white frame and glazing bars, its architrave and sill inside, stone sill outside.
function windowDressing(kit, W, o, sides) {
  const h = WALL_T / 2;
  const { u0, u1, y0, y1 } = o;
  const um = (u0 + u1) / 2;
  const ym = (y0 + y1) / 2;
  const fw = FRAME_W;
  const frame = (a0, a1, b0, b1, d) => wallBox(kit, W, a0, a1, b0, b1, -d, d, C.plaster);
  frame(u0, u0 + fw, y0, y1, 0.04);
  frame(u1 - fw, u1, y0, y1, 0.04);
  frame(u0 + fw, u1 - fw, y1 - fw, y1, 0.04);
  frame(u0 + fw, u1 - fw, y0, y0 + fw, 0.04);
  frame(um - 0.015, um + 0.015, y0 + fw, y1 - fw, 0.025);
  frame(u0 + fw, u1 - fw, ym - 0.015, ym + 0.015, 0.025);
  for (const side of sides) {
    const g = side.sign;
    const vv = (d0, d1) => (g > 0 ? [d0, d1] : [-d1, -d0]);
    if (side.kind === 'out') {
      const [va, vb] = vv(0.04, h + 0.06);
      wallBox(kit, W, u0 - 0.08, u1 + 0.08, y0 - 0.07, y0, va, vb, C.stone);
      continue;
    }
    const [aa, ab] = vv(h, h + 0.02);
    const arch = (a0, a1, b0, b1) => wallBox(kit, W, a0, a1, b0, b1, aa, ab, C.lightWood, { skip: [g > 0 ? 'v-' : 'v+'] });
    arch(u0 - ARCH_W, u0, y0 - 0.02, y1 + ARCH_W);
    arch(u1, u1 + ARCH_W, y0 - 0.02, y1 + ARCH_W);
    arch(u0, u1, y1, y1 + ARCH_W);
    const [sa, sb] = vv(0.04, h + 0.1);
    wallBox(kit, W, u0 - 0.06, u1 + 0.06, y0 - 0.02, y0 + 0.03, sa, sb, C.lightWood);
  }
}

// The attic's round window: a square hole behind a white plate with a round opening
// on each face, and a cross of glazing bars.
function roundDressing(kit, W, o, sides) {
  const h = WALL_T / 2;
  const um = (o.u0 + o.u1) / 2;
  const cy = (o.y0 + o.y1) / 2;
  const r = (o.u1 - o.u0) / 2;
  const rc = r - 0.07;
  const N = 16;
  const sq = (t) => { const c = Math.cos(t), s = Math.sin(t); const k = r / Math.max(Math.abs(c), Math.abs(s)); return [c * k, s * k]; };
  const uv = (du, dy) => cellUV(C.plaster, (du + r) / (2 * r), (dy + r) / (2 * r));
  for (const side of sides) {
    const g = side.sign;
    const vf = g * (h + 0.012);
    const n = W.normal(g);
    for (let i = 0; i < N; i++) {
      const t0 = (i / N) * TAU;
      const t1 = ((i + 1) / N) * TAU;
      const c0 = [Math.cos(t0) * rc, Math.sin(t0) * rc];
      const c1 = [Math.cos(t1) * rc, Math.sin(t1) * rc];
      const s0 = sq(t0);
      const s1 = sq(t1);
      const ring = [c0, c1, s1, s0];
      kit.fan(ring.map(([du, dy]) => W.pt(um + du, cy + dy, vf)), ring.map(([du, dy]) => uv(du, dy)), n);
      // the opening's edge, from the wall face out to the plate
      const edge = [[c0, g * h], [c1, g * h], [c1, vf], [c0, vf]];
      const mid = [-(c0[0] + c1[0]) / 2, -(c0[1] + c1[1]) / 2];
      const ml = Math.hypot(mid[0], mid[1]) || 1;
      const inward = W.run === 'x' ? [mid[0] / ml, mid[1] / ml, 0] : [0, mid[1] / ml, mid[0] / ml];
      kit.fan(edge.map(([[du, dy], v]) => W.pt(um + du, cy + dy, v)), edge.map(([[du, dy]], k) => cellUV(C.plaster, k < 2 ? 0 : 1, (du + dy + 2 * r) / (4 * r))), inward);
    }
    // the plate's outer edge, round the square
    const v0 = g > 0 ? h : -(h + 0.012);
    const v1 = g > 0 ? h + 0.012 : -h;
    endFace(kit, W, um - r, -1, v0, v1, cy - r, cy + r, C.plaster);
    endFace(kit, W, um + r, 1, v0, v1, cy - r, cy + r, C.plaster);
    flatFace(kit, W, cy + r, 1, um - r, um + r, v0, v1, C.plaster);
    flatFace(kit, W, cy - r, -1, um - r, um + r, v0, v1, C.plaster);
  }
  wallBox(kit, W, um - 0.015, um + 0.015, cy - rc, cy + rc, -0.025, 0.025, C.plaster);
  wallBox(kit, W, um - rc, um + rc, cy - 0.015, cy + 0.015, -0.025, 0.025, C.plaster);
}

// One leaf of the shut front door, with its panels, knob, architrave and doorstep.
// With meta.openDoor (step 4: a house-town gateway end) the leaf, its panels and
// its knob go in their own kit (meta.leafKit), hinged at meta.hingeU, the leaf's
// outer edge; the architrave and the doorstep stay in the wall.
function frontDoor(kit, W, o, sides, meta) {
  const h = WALL_T / 2;
  const d = HOUSE_FRONT_DOOR;
  const { u0, u1, y0, y1 } = o;
  const meetAtLo = Math.abs(u0 - d.x) < EPS;
  const outerU = meetAtLo ? u1 : u0;
  const t = 0.03;
  const lk = meta.openDoor ? new Kit() : kit;
  if (meta.openDoor) { meta.leafKit = lk; meta.hingeU = outerU; }
  wallBox(lk, W, u0, u1, y0, y1, -t, t, C.darkWood);
  const pa = Math.min(u0, u1) + 0.1;
  const pb = Math.max(u0, u1) - 0.1;
  const knobU = meetAtLo ? u0 + 0.12 : u1 - 0.12;
  for (const side of sides) {
    const g = side.sign;
    const vv = (d0, d1) => (g > 0 ? [d0, d1] : [-d1, -d0]);
    const back = g > 0 ? 'v-' : 'v+';
    const [pv0, pv1] = vv(t, t + 0.015);
    wallBox(lk, W, pa, pb, y0 + 1.15, y0 + 2.0, pv0, pv1, C.darkWood, { skip: [back] });
    wallBox(lk, W, pa, pb, y0 + 0.2, y0 + 1.0, pv0, pv1, C.darkWood, { skip: [back] });
    const [kv0, kv1] = vv(t, t + 0.06);
    wallBox(lk, W, knobU - 0.025, knobU + 0.025, y0 + 0.98, y0 + 1.03, kv0, kv1, C.lightWood, { skip: [back] });
    const [av0, av1] = vv(h, h + 0.025);
    const archLo = meetAtLo ? u0 : outerU - ARCH_W;
    const archHi = meetAtLo ? outerU + ARCH_W : u1;
    wallBox(kit, W, meetAtLo ? outerU : outerU - ARCH_W, meetAtLo ? outerU + ARCH_W : outerU, y0, y1, av0, av1, C.lightWood, { skip: [back, 'y-'] });
    wallBox(kit, W, archLo, archHi, y1, y1 + ARCH_W, av0, av1, C.lightWood, { skip: [back] });
    if (side.kind === 'out') {
      const [sv0, sv1] = vv(h, h + 0.35);
      wallBox(kit, W, Math.min(u0, u1) - (meetAtLo ? 0 : 0.12), Math.max(u0, u1) + (meetAtLo ? 0.12 : 0), y0, y0 + 0.05, sv0, sv1, C.stone, { skip: ['y-', back] });
    }
  }
  return freeze({ x0: Math.min(u0, u1), x1: Math.max(u0, u1), z: d.z, y0, y1 });
}

// A stair's side wall: its top follows the flight, a full wall's height above it.
function stairWall(kit, s, sections, deco) {
  const W = wallFrame(s);
  const st = HOUSE_STAIRS.find((q) => q.id === s.owner);
  const yFrom = levelY(st.from);
  const yTo = levelY(st.to);
  const sU0 = W.run === 'x' ? st.x0 : st.z0;
  const sU1 = W.run === 'x' ? st.x1 : st.z1;
  const top = (u) => yFrom + (yTo - yFrom) * clamp01((u - sU0) / (sU1 - sU0)) + WALL_H;
  const [a, b] = wallSpan(s, sections);
  const h = WALL_T / 2;
  const y0 = s.base;
  for (const sign of [-1, 1]) {
    const side = sideOf(s, W, sign);
    longFace(kit, W, sign * h, sign, [[a, y0], [b, y0], [b, top(b)], [a, top(a)]], side.cell, tileOf(side.cell));
  }
  const ta = top(a);
  const tb = top(b);
  const cap = [W.pt(a, ta, -h), W.pt(b, tb, -h), W.pt(b, tb, h), W.pt(a, ta, h)];
  kit.fan(cap, [cellUV(C.darkWood, 0, 0), cellUV(C.darkWood, 1, 0), cellUV(C.darkWood, 1, 1), cellUV(C.darkWood, 0, 1)]);
  endFace(kit, W, a, -1, -h, h, y0, ta, C.plaster, PLASTER_TILE);
  endFace(kit, W, b, 1, -h, h, y0, tb, C.plaster, PLASTER_TILE);
  // pictures and sconces up the stairwell, hung level at the flight's height, in the hiding group
  for (const sign of [-1, 1]) {
    if (sideOf(s, W, sign).kind !== 'stair') continue;
    const vs = (d0, d1) => (sign > 0 ? [sign * h + d0, sign * h + d1] : [sign * h - d1, sign * h - d0]);
    const back = sign > 0 ? 'v-' : 'v+';
    const bx = (u0, u1, ya, yb, d0, d1, cell) => { const [va, vb] = vs(d0, d1); wallBox(deco, W, u0, u1, ya, yb, va, vb, cell, { skip: [back, 'y-'] }); };
    const flight = (u) => yFrom + (yTo - yFrom) * clamp01((u - sU0) / (sU1 - sU0));
    const right = W.run === 'x' ? sign : -sign;
    for (let i = 0, u = a + 0.9; u < b - 0.7; i++, u += 1.5) {
      const yc = flight(u);
      if (i % 2 === 1) {
        if (st.id === 'cellar') continue;
        bx(u - 0.05, u + 0.05, yc + 1.6, yc + 1.82, 0, 0.03, C.brass);
        bx(u - 0.015, u + 0.015, yc + 1.7, yc + 1.74, 0.03, 0.11, C.brass);
        bx(u - 0.025, u + 0.025, yc + 1.74, yc + 1.82, 0.07, 0.12, C.plaster);
        bx(u - 0.018, u + 0.018, yc + 1.82, yc + 1.88, 0.078, 0.112, C.flame);
      } else if (st.id !== 'secret') {
        const w = 0.55, hh = 0.7;
        const cell = [C.art1, C.art2, C.art3, C.art4][(i + (st.id === 'back' ? 2 : 0)) % 4];
        bx(u - w / 2, u + w / 2, yc + 1.25, yc + 1.25 + hh, 0, 0.045, C.darkWood);
        const [v] = vs(0.047, 0.047);
        const pts = [[u - w / 2 + 0.05, yc + 1.3], [u + w / 2 - 0.05, yc + 1.3], [u + w / 2 - 0.05, yc + 1.2 + hh], [u - w / 2 + 0.05, yc + 1.2 + hh]];
        deco.fan(pts.map(([uu, yy]) => W.pt(uu, yy, v)), pts.map(([uu, yy]) => cellUV(cell, right > 0 ? (uu - (u - w / 2 + 0.05)) / (w - 0.1) : ((u + w / 2 - 0.05) - uu) / (w - 0.1), 1 - (yy - (yc + 1.3)) / (hh - 0.1))), W.normal(sign));
      }
    }
  }
}

// One wall section as one mesh: its base at local y 0, the mesh at the section's base.
// openDoor: a front-door leaf in it is its own mesh on a pivot at its hinge
// (userData.doorPivot, named houseFrontLeaf), turned about y by house life.
export function sectionMesh(section, material, { sections = houseSections(), openDoor = false } = {}) {
  const kit = new Kit();
  const meta = { openDoor, deco: new Kit() }; // deco: the dressing, a second material group the sink hides (houselife)
  if (section.kind === 'stair') stairWall(kit, section, sections, meta.deco);
  else flatWall(kit, section, sections, meta);
  let geo = kit.geometry();
  const dressed = !meta.deco.empty;
  if (dressed) geo = mergeGeometries([geo, meta.deco.geometry()], true);
  geo.translate(0, -section.base, 0);
  geo.computeBoundingBox();
  const decoMat = dressed ? material.clone() : null;
  const mesh = new THREE.Mesh(geo, dressed ? [material, decoMat] : material);
  if (dressed) mesh.userData.decoMat = decoMat;
  mesh.position.y = section.base;
  if (meta.doorLeaf) mesh.userData.doorLeaf = meta.doorLeaf;
  if (meta.leafKit) {
    const d = HOUSE_FRONT_DOOR;
    const leafGeo = meta.leafKit.geometry();
    leafGeo.translate(-meta.hingeU, -section.base, -d.z);
    const pivot = new THREE.Object3D();
    pivot.name = 'houseFrontLeaf';
    pivot.position.set(meta.hingeU, 0, d.z);
    pivot.add(finish(new THREE.Mesh(leafGeo, material)));
    mesh.add(pivot);
    mesh.userData.doorPivot = pivot;
  }
  mesh.name = `houseWall:${section.id}`;
  mesh.userData.houseSection = section.id;
  return finish(mesh);
}

// ---------------------------------------------------------------------------
// Panes, floors, stairs, skirts
// ---------------------------------------------------------------------------

const PANE_T = 0.012;
export const PANE_LOOK = freeze({ color: 0xcfe6f0, emissive: 0x587a88, roughness: 0.25 });

// A window's glass: its own top-level mesh with its own material (dusk swaps it).
export function paneMesh(section, w) {
  const W = wallFrame(section);
  const cy = section.base + (w.sill + w.head) / 2;
  let geo;
  if (w.round) {
    geo = new THREE.CylinderGeometry(w.width / 2 - 0.04, w.width / 2 - 0.04, PANE_T, 20);
    if (W.run === 'x') geo.rotateX(Math.PI / 2);
    else geo.rotateZ(Math.PI / 2);
  } else {
    const along = w.width - 0.01;
    const up = w.head - w.sill - 0.01;
    geo = W.run === 'x' ? new THREE.BoxGeometry(along, up, PANE_T) : new THREE.BoxGeometry(PANE_T, up, along);
  }
  const [x, , z] = W.pt(w.at, 0, 0);
  const mesh = new THREE.Mesh(geo, litMaterial(PANE_LOOK.color, { emissive: PANE_LOOK.emissive, roughness: PANE_LOOK.roughness }));
  mesh.position.set(x, cy, z);
  mesh.name = `housePane:${section.id}`;
  mesh.userData.window = true;
  mesh.userData.houseSection = section.id;
  return finish(mesh, { cast: false });
}

const FLOOR_CELL = freeze({ hall: 'oak', library: 'oak', parlour: 'oak', kitchen: 'stone', bedroom: 'pine', attic: 'atticBoards', cellar: 'slate' });

export function floorMesh(room, material) {
  const kit = new Kit();
  const cell = C[FLOOR_CELL[room.id] ?? 'oak'];
  kitFace(kit, 'y', levelY(room.level), 1, rect(room.minX, room.maxX, room.minZ, room.maxZ), cell, tileOf(cell));
  return kitMesh(kit, material, `houseFloor:${room.id}`, { cast: false });
}

// The brick under a raised room, from the lawn up to its floor, flush with its
// walls' outside. A sunken room (the cellar) gets the lining of its pit instead,
// from its floor up to the lawn, facing in and open where a stair comes down: its
// walls stand in front of it, and when one sinks the pit still has a side (the
// lawn is a sheet, and seen from below it is not there).
export function skirtMesh(room, material) {
  const y = levelY(room.level);
  const h = WALL_T / 2;
  const x0 = room.minX - h, x1 = room.maxX + h, z0 = room.minZ - h, z1 = room.maxZ + h;
  const kit = new Kit();
  if (y > LAWN_Y + EPS) {
    kitFace(kit, 'z', z0, -1, rect(x0, x1, LAWN_Y, y), C.brick, BRICK_TILE);
    kitFace(kit, 'z', z1, 1, rect(x0, x1, LAWN_Y, y), C.brick, BRICK_TILE);
    kitFace(kit, 'x', x0, -1, rect(z0, z1, LAWN_Y, y), C.brick, BRICK_TILE);
    kitFace(kit, 'x', x1, 1, rect(z0, z1, LAWN_Y, y), C.brick, BRICK_TILE);
    return kitMesh(kit, material, `houseSkirt:${room.id}`);
  }
  if (!(y < LAWN_Y - EPS)) return null;
  const cell = C[room.id] ?? C.stone;
  // [axis, at, facing (inward), along lo, along hi, the room edge the side lies on]
  const sides = [
    ['z', z0, 1, x0, x1, 'minZ'], ['z', z1, -1, x0, x1, 'maxZ'],
    ['x', x0, 1, z0, z1, 'minX'], ['x', x1, -1, z0, z1, 'maxX'],
  ];
  for (const [axis, at, facing, lo, hi, edge] of sides) {
    const openings = [];
    for (const st of HOUSE_STAIRS) {
      if (st.from !== room.level && st.to !== room.level) continue;
      const r = stairBox(st);
      const line = room[edge];
      const crosses = axis === 'x' ? r.minX <= line + EPS && r.maxX >= line - EPS : r.minZ <= line + EPS && r.maxZ >= line - EPS;
      if (crosses) openings.push(axis === 'x' ? [r.minZ - h, r.maxZ + h] : [r.minX - h, r.maxX + h]);
    }
    for (const [a, b] of subtract([[lo, hi]], openings)) kitFace(kit, axis, at, facing, rect(a, b, y, LAWN_Y), cell, PAPER_TILE);
  }
  return kitMesh(kit, material, `houseSkirt:${room.id}`, { cast: false });
}

// A stair's footprint: its centreline, half its width either side.
function stairBox(st) {
  const hw = st.width / 2;
  return Math.abs(st.z1 - st.z0) >= Math.abs(st.x1 - st.x0)
    ? { minX: st.x0 - hw, maxX: st.x0 + hw, minZ: Math.min(st.z0, st.z1), maxZ: Math.max(st.z0, st.z1) }
    : { minX: Math.min(st.x0, st.x1), maxX: Math.max(st.x0, st.x1), minZ: st.z0 - hw, maxZ: st.z0 + hw };
}

export const STEP_RUN = 0.4; // about; each flight takes a whole number of steps
const STAIR_LOOK = freeze({
  main: freeze({ tread: 'oak', riser: 'plaster', side: 'darkWood' }),
  back: freeze({ tread: 'pine', riser: 'pine', side: 'darkWood' }),
  cellar: freeze({ tread: 'stone', riser: 'stone', side: 'cellar' }),
  secret: freeze({ tread: 'pine', riser: 'darkWood', side: 'darkWood' }), // a plain old back stair, behind the bookcase
});
const STAIR_RUNNER = freeze({ main: 'rugBlue', back: 'rugGreen' });

// A flight as a solid wedge: treads level at the ramp's height at their middles (so
// they straddle the walked slope), risers between, stepped sides inside its walls,
// and brick down to the lawn under a raised flight.
export function stairMesh(stair, material) {
  const look = STAIR_LOOK[stair.id] ?? STAIR_LOOK.main;
  const tread = C[look.tread];
  const riser = C[look.riser];
  const sideCell = C[look.side];
  const yFrom = levelY(stair.from);
  const yTo = levelY(stair.to);
  const alongZ = Math.abs(stair.z1 - stair.z0) >= Math.abs(stair.x1 - stair.x0);
  const u0 = alongZ ? stair.z0 : stair.x0;
  const u1 = alongZ ? stair.z1 : stair.x1;
  const c = alongZ ? stair.x0 : stair.z0; // the centreline across
  const L = Math.abs(u1 - u0);
  const dir = Math.sign(u1 - u0);
  const n = Math.max(1, Math.round(L / STEP_RUN));
  const d = L / n;
  const hgt = (k) => yFrom + ((yTo - yFrom) * (k + 0.5)) / n;
  const half = stair.width / 2 - WALL_T / 2 - 0.005;
  const bottom = Math.min(yFrom, yTo);
  const uAt = (along) => u0 + dir * along;
  const runAxis = alongZ ? 'z' : 'x';
  const acrossAxis = alongZ ? 'x' : 'z';
  const flat = (ua, ub) => {
    const lo = Math.min(ua, ub), hi = Math.max(ua, ub);
    return alongZ ? rect(c - half, c + half, lo, hi) : rect(lo, hi, c - half, c + half);
  };
  const kit = new Kit();
  for (let k = 0; k < n; k++) kitFace(kit, 'y', hgt(k), 1, flat(uAt(k * d), uAt((k + 1) * d)), tread, tileOf(tread));
  for (let k = 0; k <= n; k++) {
    const before = k === 0 ? yFrom : hgt(k - 1);
    const after = k === n ? yTo : hgt(k);
    if (Math.abs(after - before) < 1e-6) continue;
    const facing = after > before ? -dir : dir; // a riser faces down the flight
    kitFace(kit, runAxis, uAt(k * d), facing, rect(c - half, c + half, Math.min(before, after), Math.max(before, after)), riser, tileOf(riser));
  }
  // a runner down the middle of the flight, on each tread and up each riser, and a handrail on both walls
  const rcell = C[STAIR_RUNNER[stair.id]];
  const rw = half * 0.55;
  const flatR = (ua, ub) => {
    const lo = Math.min(ua, ub), hi = Math.max(ua, ub);
    return alongZ ? rect(c - rw, c + rw, lo, hi) : rect(lo, hi, c - rw, c + rw);
  };
  if (rcell !== undefined) {
    for (let k = 0; k < n; k++) kitFace(kit, 'y', hgt(k) + 0.003, 1, flatR(uAt(k * d), uAt((k + 1) * d)), rcell);
    for (let k = 1; k < n; k++) {
      const lo = hgt(k - 1), hi = hgt(k);
      if (Math.abs(hi - lo) < 1e-6) continue;
      kitFace(kit, runAxis, uAt(k * d) + (hi > lo ? -dir : dir) * 0.004, hi > lo ? -dir : dir, rect(c - rw, c + rw, Math.min(lo, hi), Math.max(lo, hi)), rcell);
    }
  }
  if (stair.id !== 'cellar') {
    for (const sign of [-1, 1]) {
      const x = c + sign * (half - 0.03);
      const pt = (u, y) => (alongZ ? [x, y, u] : [u, y, x]);
      const ya = (u) => yFrom + (yTo - yFrom) * clamp01((u - u0) / (u1 - u0));
      const n3 = alongZ ? [-sign, 0, 0] : [0, 0, -sign];
      const rail = [pt(u0, ya(u0) + 0.92), pt(u1, ya(u1) + 0.92), pt(u1, ya(u1) + 0.98), pt(u0, ya(u0) + 0.98)];
      kit.fan(rail, rail.map((_, i) => cellUV(C.darkWood, i % 3 ? 1 : 0, i < 2 ? 0 : 1)), n3);
      const topR = [pt(u0, ya(u0) + 0.98), pt(u1, ya(u1) + 0.98)];
      const out = (v) => (alongZ ? [v[0] + sign * 0.03, v[1], v[2]] : [v[0], v[1], v[2] + sign * 0.03]);
      kit.fan([topR[0], topR[1], out(topR[1]), out(topR[0])], [[0, 0], [1, 0], [1, 1], [0, 1]].map(([a, b]) => cellUV(C.darkWood, a, b)), [0, 1, 0]);
    }
  }
  for (const sign of [-1, 1]) {
    for (let k = 0; k < n; k++) {
      const a = uAt(k * d), b = uAt((k + 1) * d);
      kitFace(kit, acrossAxis, c + sign * half, sign, rect(Math.min(a, b), Math.max(a, b), bottom, hgt(k)), sideCell, WOOD_TILE);
    }
    const outer = stair.width / 2 + WALL_T / 2;
    const ulo = Math.min(u0, u1), uhi = Math.max(u0, u1);
    if (bottom > LAWN_Y + EPS) {
      // a raised flight stands on brick down to the lawn
      kitFace(kit, acrossAxis, c + sign * outer, sign, rect(ulo, uhi, LAWN_Y, bottom), C.brick, BRICK_TILE);
    } else if (bottom < LAWN_Y - EPS) {
      // a sunken flight's pit is lined up to the lawn, facing in (as the cellar's: skirtMesh),
      // stopping at the lined pit of the room it goes down into
      const low = yFrom < yTo ? u0 : u1;
      const lo = low === ulo ? ulo + WALL_T / 2 : ulo;
      const hi = low === uhi ? uhi - WALL_T / 2 : uhi;
      kitFace(kit, acrossAxis, c + sign * outer, -sign, rect(lo, hi, bottom, LAWN_Y), C[look.side], PAPER_TILE);
    }
  }
  return kitMesh(kit, material, `houseStair:${stair.id}`);
}

// ---------------------------------------------------------------------------
// Lamps
// ---------------------------------------------------------------------------

// A THREE primitive's uvs moved into a cell, the primitive moved to (x, y, z).
function part(geo, cell, x = 0, y = 0, z = 0) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    const [u, v] = cellUV(cell, uv.getX(i), uv.getY(i));
    uv.setXY(i, u, v);
  }
  geo.translate(x, y, z);
  return geo;
}
const cyl = (r0, r1, h, seg, cell, x, yMid, z) => part(new THREE.CylinderGeometry(r0, r1, h, seg), cell, x, yMid, z);
const blk = (w, h, d, cell, x, yMid, z) => part(new THREE.BoxGeometry(w, h, d), cell, x, yMid, z);

export const LAMP_KINDS = freeze(['standard', 'table', 'lantern']);
export const LAMP_GLOBE = freeze({ color: 0xf6e6c4, emissive: 0x6e5636 });

// A lamp standing on the floor at (x, y, z): its body on the atlas, its globe (the
// shade, or the lantern's glass) its own mesh and material, which dusk lights and
// the lamp pools find (userData.lampGlobeY). Small: nothing casts.
export function lampGroup(kind, x, y, z, material) {
  const parts = [];
  let globe;
  let globeY;
  if (kind === 'table') {
    // a little pedestal table with a lamp on it
    parts.push(cyl(0.18, 0.2, 0.04, 14, C.darkWood, 0, 0.02, 0));
    parts.push(cyl(0.04, 0.05, 0.66, 8, C.darkWood, 0, 0.37, 0));
    parts.push(cyl(0.26, 0.26, 0.04, 16, C.darkWood, 0, 0.72, 0));
    parts.push(cyl(0.05, 0.09, 0.2, 10, C.lightWood, 0, 0.84, 0));
    parts.push(cyl(0.012, 0.012, 0.06, 6, C.lightWood, 0, 0.97, 0));
    globeY = 1.08;
    globe = new THREE.CylinderGeometry(0.1, 0.16, 0.2, 14);
  } else if (kind === 'lantern') {
    // a lantern hung from a crook post
    parts.push(blk(0.3, 0.04, 0.3, C.darkWood, 0, 0.02, 0));
    parts.push(cyl(0.03, 0.035, 1.75, 8, C.darkWood, 0, 0.915, 0));
    parts.push(blk(0.36, 0.04, 0.04, C.darkWood, 0.16, 1.74, 0));
    parts.push(cyl(0.008, 0.008, 0.16, 5, C.darkWood, 0.32, 1.64, 0));
    parts.push(cyl(0.04, 0.1, 0.06, 10, C.darkWood, 0.32, 1.55, 0));
    parts.push(cyl(0.1, 0.1, 0.03, 10, C.darkWood, 0.32, 1.325, 0));
    globeY = 1.43;
    globe = new THREE.CylinderGeometry(0.075, 0.075, 0.18, 12);
    globe.translate(0.32, 0, 0);
  } else {
    // a standard lamp: a weighted foot, a turned pole, a fabric shade
    parts.push(cyl(0.16, 0.19, 0.04, 14, C.darkWood, 0, 0.02, 0));
    parts.push(cyl(0.022, 0.022, 1.36, 8, C.darkWood, 0, 0.72, 0));
    parts.push(cyl(0.04, 0.04, 0.05, 8, C.lightWood, 0, 1.36, 0));
    globeY = 1.5;
    globe = new THREE.CylinderGeometry(0.15, 0.25, 0.32, 16);
  }
  const g = new THREE.Group();
  const body = finish(new THREE.Mesh(mergeGeometries(parts), material), { cast: false });
  body.name = `houseLampBody:${kind}`;
  g.add(body);
  const lit = finish(new THREE.Mesh(globe, litMaterial(LAMP_GLOBE.color, { emissive: LAMP_GLOBE.emissive })), { cast: false });
  lit.name = `houseLampGlobe:${kind}`;
  lit.position.y = globeY;
  lit.userData.lampGlobe = true;
  lit.userData.noMerge = true;
  g.add(lit);
  g.position.set(x, y, z);
  g.userData.lampGlobeY = globeY;
  // a hair of variation, so no two lamps stand quite alike
  g.rotation.y = (hash01(x, z, 61) - 0.5) * 0.6;
  return g;
}

// ---------------------------------------------------------------------------
// The cellar's lid (owner's fix B)
// ---------------------------------------------------------------------------

// The turf lid over the cellar and its stair (houseplan.js HOUSE_CELLAR_LID), as two
// top-level meshes: the grass top on `grass` (the lawn's look, x/z over `tile` m, so it
// runs on as the lawn does; userData.duskTint, so the dusk tints it as the lawn) and the
// rest on the atlas (dark wood edges, a plaster underside, seen from the kitchen down the
// stair's mouth), each piece cut into 1 m lengths so the cells tile. House life shows and
// hides both (houselife.js). Nothing casts; no footprint.
export function cellarLidMeshes(lid, material, grass, tile) {
  const top = new Kit();
  const body = new Kit();
  for (const p of lid.pieces) {
    const len = Math.hypot(p.x1 - p.x0, p.z1 - p.z0);
    const ux = (p.x1 - p.x0) / len;
    const uz = (p.z1 - p.z0) / len;
    const k = (p.y1 - p.y0) / len;
    const at = (u, v, h) => [p.x0 + ux * u - uz * v, p.y0 + k * u + h, p.z0 + uz * u + ux * v];
    const nl = Math.hypot(k, 1);
    const up = [(-k * ux) / nl, 1 / nl, (-k * uz) / nl];
    const H = p.half;
    const T = p.thick;
    const tp = [at(0, -H, T), at(len, -H, T), at(len, H, T), at(0, H, T)];
    top.fan(tp, tp.map(([x, , z]) => [x / tile, z / tile]), up);
    const n = Math.max(1, Math.round(len));
    const face = (pts, cell, nrm) => body.fan(pts, [cellUV(cell, 0, 0), cellUV(cell, 1, 0), cellUV(cell, 1, 1), cellUV(cell, 0, 1)], nrm);
    for (let i = 0; i < n; i++) {
      const a = (len * i) / n;
      const b = (len * (i + 1)) / n;
      face([at(a, -H, 0), at(b, -H, 0), at(b, H, 0), at(a, H, 0)], C.plaster, up.map((c) => -c));
      for (const sv of [-1, 1]) face([at(a, sv * H, 0), at(b, sv * H, 0), at(b, sv * H, T), at(a, sv * H, T)], C.darkWood, [-uz * sv, 0, ux * sv]);
    }
    for (const [u, su] of [[0, -1], [len, 1]]) face([at(u, -H, 0), at(u, H, 0), at(u, H, T), at(u, -H, T)], C.darkWood, [ux * su, 0, uz * su]);
  }
  const grassMesh = kitMesh(top, grass, 'houseCellarLid', { cast: false });
  grassMesh.userData.duskTint = true;
  const bodyMesh = kitMesh(body, material, 'houseCellarLidEdge', { cast: false });
  for (const m of [grassMesh, bodyMesh]) {
    m.userData.noContactShadow = true;
    m.userData.noMerge = true;
    m.userData.cellarLid = true;
  }
  return [grassMesh, bodyMesh];
}

// ---------------------------------------------------------------------------
// Furniture (Task 5)
// ---------------------------------------------------------------------------
//
// Each piece of HOUSE_FURNITURE is drawn in its own frame: the middle of its
// footprint on the floor, its front facing local +z, its width w along x, its
// depth d along z, nothing above its height h. house.js stands it at (x, floor,
// z) turned by rotY. Everything is on the shared atlas: the patterned cells
// (woods, wallpapers as upholstery, the rugs) stretched over a face, and
// SWATCHES, single texels of a cell for a flat colour (a book's spine, brass,
// cast iron, a china plate). Warm, old and simple: boxes, a few turned
// cylinders, no fine detail a far camera would only shimmer on.

// [cell, x, y]: a texel of a cell's 48 px period inside a patch of one colour.
const SWATCH = freeze({
  red: freeze([C.rugRed, 11, 11]), navy: freeze([C.rugRed, 1, 24]), gold: freeze([C.rugRed, 24, 24]),
  white: freeze([C.plaster, 24, 24]), blue: freeze([C.rugBlue, 24, 4]), sage: freeze([C.hall, 3, 10]),
  green: freeze([C.library, 2, 2]), rose: freeze([C.parlour, 2, 24]), sky: freeze([C.bedroom, 24, 0]),
  ochre: freeze([C.attic, 4, 4]), copper: freeze([C.brick, 3, 3]), tile: freeze([C.kitchen, 18, 6]),
  brown: freeze([C.darkWood, 24, 24]), tan: freeze([C.lightWood, 24, 24]),
});
const swUV = (name) => {
  const [cell, px, py] = SWATCH[name];
  return cellUV(cell, (px + 0.5) / INNER_PX, (py + 0.5) / INNER_PX);
};
const BOOK_SPINES = freeze(['red', 'navy', 'green', 'brown', 'ochre', 'rose', 'blue', 'tan', 'red', 'green']);
const JAR_LOOKS = freeze(['tile', 'ochre', 'red', 'tile', 'copper', 'white']);

function swFace(kit, axis, at, sign, poly, uv) {
  kit.fan(poly.map(([s, t]) => toWorld(axis, at, s, t)), poly.map(() => uv), AXIS_N[axis].map((v) => v * sign));
}
function swBox(kit, x0, x1, y0, y1, z0, z1, uv, skip) {
  const no = (f) => skip && skip.includes(f);
  if (!no('x-')) swFace(kit, 'x', x0, -1, rect(z0, z1, y0, y1), uv);
  if (!no('x+')) swFace(kit, 'x', x1, 1, rect(z0, z1, y0, y1), uv);
  if (!no('z-')) swFace(kit, 'z', z0, -1, rect(x0, x1, y0, y1), uv);
  if (!no('z+')) swFace(kit, 'z', z1, 1, rect(x0, x1, y0, y1), uv);
  if (!no('y-')) swFace(kit, 'y', y0, -1, rect(x0, x1, z0, z1), uv);
  if (!no('y+')) swFace(kit, 'y', y1, 1, rect(x0, x1, z0, z1), uv);
}

// One piece being made: boxes into a kit, THREE primitives beside it, one geometry out.
class Piece {
  constructor() {
    this.kit = new Kit();
    this.geos = [];
  }

  // An axis-aligned box on a swatch (one colour) or a cell (its pattern stretched over each face).
  box(x0, x1, y0, y1, z0, z1, look, skip = null) {
    if (SWATCH[look]) swBox(this.kit, x0, x1, y0, y1, z0, z1, swUV(look), skip);
    else kitBox(this.kit, x0, x1, y0, y1, z0, z1, C[look], { skip });
  }

  // A primitive, turned by `turn`, on a swatch or a cell, moved to (x, y, z).
  prim(geo, look, x, y, z, turn = null) {
    if (turn) turn(geo);
    if (SWATCH[look]) {
      const [u, v] = swUV(look);
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, u, v);
      geo.translate(x, y, z);
    } else {
      part(geo, C[look], x, y, z);
    }
    this.geos.push(geo);
  }

  // An upright cylinder from y0 to y1 (turn it to lay it down).
  cyl(r0, r1, y0, y1, seg, look, x, z, turn = null) {
    this.prim(new THREE.CylinderGeometry(r0, r1, y1 - y0, seg), look, x, (y0 + y1) / 2, z, turn);
  }

  geometry() {
    const all = this.kit.empty ? [] : [this.kit.geometry()];
    for (const g of this.geos) all.push(g.index ? g : g.setIndex([...Array(g.attributes.position.count).keys()]));
    const out = all.length === 1 ? all[0] : mergeGeometries(all);
    out.computeBoundingSphere();
    return out;
  }
}

const alongX = (g) => g.rotateZ(Math.PI / 2); // a cylinder's axis along x
const alongZ = (g) => g.rotateX(Math.PI / 2); // along z (a disc facing +z)
const pick = (list, f, i, salt) => list[Math.floor(hash01(f.x * 3.1 + i, f.z * 2.3 + i * 0.7, salt) * list.length) % list.length];

const BUILDERS = {
  // a grandfather clock: plinth, a slim trunk with its pendulum window, the hood with a brass-ringed dial
  clock(p, { w, d, h }) {
    const hw = w / 2, hd = d / 2;
    p.box(-hw, hw, 0, 0.48, -hd, hd, 'darkWood', ['y-']);
    p.box(-0.2, 0.2, 0.48, 1.42, -hd + 0.03, hd - 0.04, 'darkWood', ['y-', 'y+']);
    p.box(-hw + 0.02, hw - 0.02, 1.42, 1.48, -hd, hd, 'darkWood', ['y-']);
    p.box(-hw + 0.04, hw - 0.04, 1.48, 1.92, -hd + 0.01, hd - 0.02, 'darkWood', ['y-', 'y+']);
    p.box(-hw, hw, 1.92, 1.98, -hd, hd + 0.01, 'darkWood', ['y-']);
    p.box(-0.17, 0.17, 1.98, h, -hd + 0.04, hd - 0.03, 'darkWood', ['y-']);
    const fz = hd - 0.02;
    // the dial and its face on the hood's front (step 2: they stood inside the hood)
    p.prim(new THREE.CylinderGeometry(0.165, 0.165, 0.01, 16), 'gold', 0, 1.7, fz + 0.005, alongZ);
    p.prim(new THREE.CylinderGeometry(0.145, 0.145, 0.006, 16), 'white', 0, 1.7, fz + 0.013, alongZ);
    p.box(-0.006, 0.006, 1.7, 1.81, fz + 0.016, fz + 0.022, 'navy');
    p.box(-0.006, 0.075, 1.694, 1.706, fz + 0.016, fz + 0.022, 'navy');
    p.box(-0.11, 0.11, 0.62, 1.32, hd - 0.04, hd - 0.03, 'navy', ['z-']); // the pendulum's window (findParts)
    for (const s of [-1, 1]) p.cyl(0.018, 0.026, 1.98, 2.08, 6, 'gold', s * (hw - 0.06), 0);
  },

  // a hall console table on slim legs, a shelf low down, a china vase on top (its brass
  // bowl made way for the flowerpot she knocks off, step 2)
  console(p, { w, d, h }) {
    const hw = w / 2, hd = d / 2;
    p.box(-hw, hw, h - 0.04, h, -hd, hd, 'darkWood');
    p.box(-hw + 0.05, hw - 0.05, h - 0.14, h - 0.04, -hd + 0.03, hd - 0.04, 'darkWood', ['y-', 'y+']);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.box(sx * (hw - 0.05) - 0.025, sx * (hw - 0.05) + 0.025, 0, h - 0.14, sz * (hd - 0.05) - 0.025, sz * (hd - 0.05) + 0.025, 'darkWood', ['y-', 'y+']);
    p.box(-hw + 0.07, hw - 0.07, 0.14, 0.17, -hd + 0.06, hd - 0.06, 'darkWood');
    p.cyl(0.05, 0.08, h, h + 0.2, 10, 'rugBlue', -hw + 0.25, 0);
    // a small pile of books and a candle in a brass stick
    p.box(-0.1, 0.16, h, h + 0.045, -0.1, 0.1, 'red', ['y-']);
    p.box(-0.07, 0.13, h + 0.045, h + 0.085, -0.09, 0.09, 'green', ['y-']);
    p.cyl(0.03, 0.035, h, h + 0.02, 8, 'gold', -0.2, 0);
    p.cyl(0.013, 0.013, h + 0.02, h + 0.14, 6, 'white', -0.2, 0);
  },

  // an oak settle: a boxed seat, a panelled back, arms at its ends, a long cushion
  bench(p, { w, d, h }) {
    const hw = w / 2, hd = d / 2;
    p.box(-hw + 0.05, hw - 0.05, 0.04, 0.42, -hd + 0.02, hd - 0.02, 'oak', ['y-']);
    p.box(-hw + 0.06, hw - 0.06, 0.42, 0.48, -hd + 0.06, hd - 0.03, 'sage', ['y-']);
    p.box(-hw + 0.05, hw - 0.05, 0.42, h, -hd, -hd + 0.06, 'oak', ['y-']);
    for (const s of [-1, 1]) p.box(s * hw - (s > 0 ? 0.05 : 0), s * hw + (s < 0 ? 0.05 : 0), 0, 0.68, -hd, hd, 'oak', ['y-']);
    p.box(-hw, hw, h - 0.04, h, -hd - 0.01, -hd + 0.08, 'darkWood', ['y-']);
  },

  // a china umbrella stand by the door, two closed umbrellas in it
  umbrellas(p, { w, h }) {
    const r = w / 2 - 0.01;
    p.cyl(r, r * 0.92, 0, 0.5, 12, 'kitchen', 0, 0);
    p.cyl(r * 0.8, r * 0.8, 0.49, 0.5, 12, 'navy', 0, 0);
    p.cyl(0.012, 0.045, 0.25, h - 0.06, 6, 'navy', -0.04, 0.02, (g) => g.rotateZ(0.08));
    p.cyl(0.012, 0.045, 0.25, h - 0.1, 6, 'red', 0.045, -0.02, (g) => g.rotateZ(-0.1));
    p.box(-0.07, -0.02, h - 0.06, h - 0.03, 0.005, 0.035, 'brown');
    p.box(0.05, 0.1, h - 0.1, h - 0.07, -0.035, -0.005, 'brown');
  },

  // a tall glazed bookcase: cornice, plinth, five shelves of books of every height and colour
  bookcase(p, f) {
    const { w, d, h } = f;
    const hw = w / 2, hd = d / 2;
    const t = 0.04;
    p.box(-hw, hw, 0, 0.1, -hd, hd, 'darkWood', ['y-']);
    for (const s of [-1, 1]) p.box(s > 0 ? hw - t : -hw, s > 0 ? hw : -hw + t, 0.1, h - 0.08, -hd, hd, 'darkWood', ['y-', 'y+']);
    p.box(-hw - 0.03, hw + 0.03, h - 0.08, h, -hd, hd + 0.03, 'darkWood', ['y-']);
    p.box(-hw + t, hw - t, 0.1, h - 0.08, -hd, -hd + 0.02, 'darkWood', ['x-', 'x+', 'y-', 'y+', 'z-']);
    const shelves = [0.1, 0.52, 0.94, 1.36, 1.78].filter((y) => y < h - 0.3); // all five in a 2.25 m bookcase
    for (const y of shelves.slice(1)) p.box(-hw + t, hw - t, y - 0.025, y, -hd + 0.02, hd - 0.01, 'darkWood', ['x-', 'x+', 'z-']);
    shelves.forEach((y0, row) => {
      const top = (row + 1 < shelves.length ? shelves[row + 1] - 0.025 : h - 0.08) - 0.03;
      let x = -hw + t + 0.01;
      let prevGap = true;
      for (let i = 0; x < hw - t - 0.04; i++) {
        const u = hash01(f.x * 5 + i, f.z * 3 + row, 71);
        if (u < 0.06) { x += 0.06 + 0.1 * u; prevGap = true; continue; } // a gap
        const bw = 0.028 + 0.045 * hash01(f.x + i, f.z + row * 3, 72);
        const bh = Math.min(top - y0, 0.24 + 0.14 * hash01(f.x - i, f.z - row, 73));
        const bd = 0.2 + 0.07 * hash01(f.x * 2 + i, row, 74);
        const x1 = Math.min(x + bw, hw - t - 0.005);
        const next = hash01(f.x * 5 + i + 1, f.z * 3 + row, 71) < 0.06 || x1 + 0.03 >= hw - t - 0.04;
        const skip = ['y-', 'z-'];
        if (!prevGap) skip.push('x-');
        if (!next) skip.push('x+');
        p.box(x, x1, y0, y0 + bh, hd - 0.02 - bd, hd - 0.02 - 0.01 * hash01(i, row, 75), pick(BOOK_SPINES, f, i * 7 + row, 76), skip);
        x = x1 + 0.002;
        prevGap = false;
      }
    });
  },

  // a library ladder leaning on the bookcase: two rails, rungs, brass hooks at the top, wheels at the foot
  // library steps (step 2): a sturdy step box, a tread let into its front, a flat top she stands on
  steps(p, { w, d, h }) {
    const hw = w / 2, hd = d / 2;
    const t = 0.04;
    for (const s of [-1, 1]) p.box(s > 0 ? hw - t : -hw, s > 0 ? hw : -hw + t, 0, h - 0.04, -hd, hd, 'darkWood', ['y-', 'y+']);
    p.box(-hw + t, hw - t, 0, h - 0.04, -hd, -hd + 0.03, 'darkWood', ['x-', 'x+', 'y-', 'y+']);
    p.box(-hw - 0.01, hw + 0.01, h - 0.04, h, -hd - 0.01, hd + 0.01, 'oak', ['y-']);
    p.box(-hw + t, hw - t, h / 2 - 0.03, h / 2, -hd + 0.03, hd, 'oak', ['x-', 'x+']);
    p.box(-hw + t, hw - t, 0.04, h / 2 - 0.03, hd - 0.05, hd - 0.03, 'darkWood', ['x-', 'x+', 'y-', 'y+']);
    p.box(-hw + t, hw - t, h / 2, h - 0.04, hd - 0.05, hd - 0.03, 'darkWood', ['x-', 'x+', 'y-', 'y+']);
    p.box(-hw + 0.08, hw - 0.08, h, h + 0.003, -hd + 0.08, hd - 0.08, 'rugRed', ['y-']); // a leather top
  },

  // a stack of big old books on the floor (step 2): five, each a little turned out, the top one flat
  bigbooks(p, f) {
    const { w, d, h } = f;
    const hw = w / 2, hd = d / 2;
    const n = 5;
    const th = h / n;
    for (let i = 0; i < n; i++) {
      const top = i === n - 1;
      const inset = top ? 0 : 0.02 + 0.04 * hash01(f.x + i, f.z, 81);
      const ox = top ? 0 : (hash01(f.x, f.z + i, 82) - 0.5) * 0.04;
      const x0 = -hw + inset + ox, x1 = hw - inset + ox;
      const z0 = -hd + inset, z1 = hd - inset * 0.5;
      const y0 = i * th, y1 = (i + 1) * th;
      const cover = pick(['red', 'navy', 'green', 'brown', 'ochre'], f, i, 83);
      p.box(x0, x1, y0, y0 + 0.02, z0, z1, cover, ['y-']);
      p.box(x0, x1, y1 - 0.02, y1, z0, z1, cover, ['y-']);
      p.box(x0, x0 + 0.03, y0 + 0.02, y1 - 0.02, z0, z1, cover, ['y-', 'y+']);
      p.box(x0 + 0.03, x1 - 0.01, y0 + 0.02, y1 - 0.02, z0 + 0.01, z1 - 0.01, 'white', ['x-', 'y-', 'y+']);
    }
  },

  // a linen chest (step 2): a plain wooden box with a lid, brass corners, iron handles at its ends
  chest(p, { w, d, h }) {
    const hw = w / 2, hd = d / 2;
    p.box(-hw + 0.02, hw - 0.02, 0, 0.05, -hd + 0.02, hd - 0.02, 'darkWood', ['y-', 'y+']);
    p.box(-hw, hw, 0.05, h - 0.06, -hd, hd, 'oak', ['y-', 'y+']);
    p.box(-hw - 0.015, hw + 0.015, h - 0.06, h, -hd - 0.015, hd + 0.015, 'darkWood', ['y-']);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const x = sx * (hw - 0.02), z = sz * (hd - 0.02);
      p.box(x - 0.03, x + 0.03, 0.05, 0.13, z - 0.03, z + 0.03, 'gold', ['y-']);
    }
    p.box(-0.05, 0.05, h - 0.16, h - 0.07, hd, hd + 0.012, 'gold', ['z-']);
    for (const s of [-1, 1]) p.box(s * hw - (s > 0 ? 0 : 0.02), s * hw + (s > 0 ? 0.02 : 0), h * 0.45, h * 0.55, -0.1, 0.1, 'navy');
  },

  // a window seat (step 2): a panelled wooden base and a long cushion, its top the seat
  seat(p, { w, d, h }) {
    const hw = w / 2, hd = d / 2;
    const base = h - 0.1;
    p.box(-hw, hw, 0, base, -hd, hd - 0.02, 'lightWood', ['y-']);
    const n = Math.max(1, Math.round(w / 0.5));
    for (let i = 0; i < n; i++) {
      const x0 = -hw + (w * i) / n, x1 = -hw + (w * (i + 1)) / n;
      p.box(x0 + 0.05, x1 - 0.05, 0.08, base - 0.06, hd - 0.02, hd - 0.008, 'darkWood', ['z-', 'y-']);
    }
    p.box(-hw + 0.02, hw - 0.02, base, h, -hd + 0.02, hd, 'rose', ['y-']);
    for (const s of [-1, 1]) p.box(s * hw * 0.55 - 0.16, s * hw * 0.55 + 0.16, h, h + 0.1, -hd + 0.04, -hd + 0.16, 'rugBlue', ['y-']);
  },

  ladder(p, { w, d, h }) {
    const hw = w / 2, hd = d / 2;
    const zFoot = hd - 0.04, zTop = -hd + 0.02;
    const run = zFoot - zTop;
    const len = Math.hypot(run, h);
    const tilt = Math.atan2(run, h);
    for (const s of [-1, 1]) {
      p.prim(new THREE.BoxGeometry(0.05, len, 0.035), 'lightWood', s * (hw - 0.05), h / 2, (zFoot + zTop) / 2, (g) => g.rotateX(-tilt));
      p.cyl(0.035, 0.035, -0.012, 0.012, 8, 'navy', s * (hw - 0.05), zFoot, (g) => { alongX(g); g.translate(0, 0.035, 0); });
      p.box(s * (hw - 0.05) - 0.02, s * (hw - 0.05) + 0.02, h - 0.06, h, zTop - 0.02, zTop + 0.03, 'gold');
    }
    for (let y = 0.3; y < h - 0.1; y += 0.3) {
      const z = zFoot + (zTop - zFoot) * (y / h);
      p.cyl(0.016, 0.016, -(hw - 0.06), hw - 0.06, 6, 'lightWood', 0, z, (g) => { alongX(g); g.translate(0, y, 0); });
    }
  },

  // a wing chair: a fat seat, rolled arms, a high back with wings, stubby legs
  armchair(p, { w, d, h, look }) {
    const hw = w / 2, hd = d / 2;
    const fab = look === 'library' ? 'green' : 'parlour';
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.box(sx * (hw - 0.08) - 0.03, sx * (hw - 0.08) + 0.03, 0, 0.12, sz * (hd - 0.08) - 0.03, sz * (hd - 0.08) + 0.03, 'darkWood', ['y-', 'y+']);
    p.box(-hw + 0.03, hw - 0.03, 0.12, 0.4, -hd + 0.04, hd - 0.03, fab, ['y-']);
    p.box(-hw + 0.17, hw - 0.17, 0.4, 0.5, -hd + 0.2, hd - 0.02, fab, ['y-']);
    p.box(-hw + 0.07, hw - 0.07, 0.4, h, -hd + 0.02, -hd + 0.2, fab, ['y-']);
    for (const s of [-1, 1]) {
      const x0 = s > 0 ? hw - 0.17 : -hw + 0.03;
      p.box(x0, x0 + 0.14, 0.4, 0.62, -hd + 0.04, hd - 0.03, fab, ['y-', 'y+']);
      p.cyl(0.075, 0.075, -hd + 0.04, hd - 0.03, 8, fab, x0 + 0.07, 0, (g) => { alongZ(g); g.translate(0, 0.62, 0); });
      p.box(x0, x0 + 0.12, 0.62, h - 0.08, -hd + 0.02, -hd + 0.34, fab, ['y-']);
    }
    p.box(-0.15, 0.15, 0.5, 0.78, -hd + 0.2, -hd + 0.3, look === 'library' ? 'gold' : 'sky', ['y-']); // a scatter cushion against the back
  },

  // a writing desk: two pedestals of drawers with brass knobs, a green leather top, books and an inkwell
  desk(p, { w, d, h }) {
    const hw = w / 2, hd = d / 2;
    p.box(-hw, hw, h - 0.04, h, -hd, hd, 'darkWood');
    p.box(-hw + 0.08, hw - 0.08, h, h + 0.004, -hd + 0.08, hd - 0.08, 'green', ['y-']);
    for (const s of [-1, 1]) {
      const x0 = s > 0 ? hw - 0.42 : -hw + 0.02;
      p.box(x0, x0 + 0.4, 0, h - 0.04, -hd + 0.02, hd - 0.03, 'darkWood', ['y-', 'y+']);
      for (const [y0, y1] of [[0.06, 0.28], [0.31, 0.5], [0.53, 0.72]]) {
        p.box(x0 + 0.03, x0 + 0.37, y0, y1, hd - 0.03, hd - 0.015, 'lightWood', ['z-', 'y-']);
        p.box(x0 + 0.18, x0 + 0.22, (y0 + y1) / 2 - 0.015, (y0 + y1) / 2 + 0.015, hd - 0.015, hd, 'gold', ['z-']);
      }
    }
    p.box(-hw + 0.42, hw - 0.42, h - 0.14, h - 0.04, hd - 0.03, hd - 0.015, 'lightWood', ['z-', 'y-']);
    p.box(-hw + 0.42, hw - 0.42, 0.2, h - 0.14, -hd + 0.03, -hd + 0.05, 'darkWood', ['y-']);
    p.box(-hw + 0.15, -hw + 0.4, h + 0.004, h + 0.05, -hd + 0.12, -hd + 0.3, 'red', ['y-']);
    p.box(-hw + 0.17, -hw + 0.38, h + 0.05, h + 0.085, -hd + 0.13, -hd + 0.28, 'navy', ['y-']);
    p.cyl(0.035, 0.04, h + 0.004, h + 0.06, 8, 'navy', hw - 0.3, -hd + 0.2);
    p.cyl(0.05, 0.05, h + 0.004, h + 0.02, 8, 'gold', hw - 0.15, -hd + 0.18);
    p.cyl(0.012, 0.012, h + 0.02, h + 0.14, 6, 'white', hw - 0.15, -hd + 0.18);
  },

  // a library globe on a turned stand, a brass meridian round it
  globe(p, { h }) {
    p.cyl(0.2, 0.22, 0, 0.04, 12, 'darkWood', 0, 0);
    p.cyl(0.03, 0.05, 0.04, 0.5, 8, 'darkWood', 0, 0);
    const y = h - 0.27;
    p.prim(new THREE.SphereGeometry(0.22, 12, 8), 'rugBlue', 0, y, 0, (g) => g.rotateZ(0.4));
    p.prim(new THREE.TorusGeometry(0.25, 0.012, 4, 18, Math.PI), 'gold', 0, y, 0, (g) => { g.rotateZ(-Math.PI / 2 + 0.4); });
  },

  // a fireplace on the wall: a cream surround, a dark wood mantel, a grate with logs, a hearth, things on the mantel
  // step 2: the mantel's top is 1.3 m, the knock-over perch's height (housemoves.js), and the
  // things on it stand up to the piece's h
  fireplace(p, { w, d, h }) {
    const hw = w / 2, hd = d / 2;
    const sd = 0.36;
    const top = 1.3;
    const under = top - 0.06;
    p.box(-hw - 0.04, hw + 0.04, 0, 0.04, -hd, hd, 'stone', ['y-']);
    for (const s of [-1, 1]) p.box(s > 0 ? hw - 0.28 : -hw, s > 0 ? hw : -hw + 0.28, 0.04, under, -hd, -hd + sd, 'plaster', ['y-', 'y+']);
    p.box(-hw + 0.28, hw - 0.28, 0.84, under, -hd, -hd + sd - 0.02, 'plaster', ['y+']);
    p.box(-hw + 0.28, hw - 0.28, 0.04, 0.84, -hd, -hd + 0.05, 'navy', ['y-', 'x-', 'x+']);
    for (const s of [-1, 1]) p.box(s > 0 ? hw - 0.3 : -hw + 0.28, s > 0 ? hw - 0.28 : -hw + 0.3, 0.04, 0.84, -hd + 0.05, -hd + sd - 0.02, 'navy', ['y-', 'y+']);
    p.box(-hw - 0.05, hw + 0.05, under, top, -hd, -hd + sd + 0.08, 'darkWood');
    p.box(-0.32, 0.32, 0.14, 0.17, -hd + 0.08, -hd + 0.3, 'navy');
    for (const s of [-1, 1]) p.box(s * 0.3 - 0.02, s * 0.3 + 0.02, 0.04, 0.14, -hd + 0.26, -hd + 0.3, 'navy', ['y-']);
    p.box(-0.24, 0.24, 0.17, 0.2, -hd + 0.1, -hd + 0.26, 'red', ['y-']);
    p.cyl(0.055, 0.055, -0.25, 0.25, 7, 'darkWood', 0, -hd + 0.15, (g) => { alongX(g); g.translate(0, 0.25, 0); });
    p.cyl(0.05, 0.05, -0.22, 0.22, 7, 'oak', 0.02, -hd + 0.23, (g) => { g.rotateY(0.15); alongX(g); g.translate(0, 0.24, 0); });
    for (const [x, hgt, look] of [[-0.14, 0.26, 'copper'], [0.0, 0.34, 'gold'], [0.15, 0.24, 'copper']]) p.prim(new THREE.CylinderGeometry(0, 0.07, hgt, 5), look, x, 0.2 + hgt / 2, -hd + 0.18);
    const mz = -hd + 0.18;
    p.box(-0.1, 0.1, top, top + 0.13, mz - 0.05, mz + 0.05, 'darkWood', ['y-']);
    p.prim(new THREE.CylinderGeometry(0.045, 0.045, 0.006, 12), 'white', 0, top + 0.075, mz + 0.053, alongZ); // on the clock's front
    for (const s of [-1, 1]) {
      p.cyl(0.03, 0.02, top, top + 0.03, 8, 'gold', s * (hw - 0.25), mz);
      p.cyl(0.012, 0.015, top + 0.03, top + 0.07, 6, 'gold', s * (hw - 0.25), mz);
      p.cyl(0.013, 0.013, top + 0.07, h, 6, 'white', s * (hw - 0.25), mz);
    }
    p.cyl(0.035, 0.05, top, top + 0.12, 8, 'rose', -0.45, mz);
  },

  // an upright piano's case (step 2: its keyboard is the keys piece in front of it, a ledge
  // of its own): the case, the lid, the music desk, candle sconces, the pedals at its foot
  piano(p, { w, d, h }) {
    const hw = w / 2, hd = d / 2;
    p.box(-hw, hw, 0, h - 0.03, -hd, hd, 'darkWood', ['y-']);
    p.box(-hw - 0.02, hw + 0.02, h - 0.03, h, -hd - 0.01, hd + 0.02, 'darkWood', ['y-']);
    p.box(-hw + 0.06, hw - 0.06, 0.86, 1.06, hd, hd + 0.03, 'darkWood', ['y-', 'z-']);
    p.box(-0.3, 0.3, 0.86, 0.98, hd + 0.03, hd + 0.05, 'darkWood', ['y-', 'z-']);
    for (const s of [-1, 1]) {
      p.cyl(0.03, 0.02, 1.0, 1.03, 8, 'gold', s * (hw - 0.14), hd + 0.06);
      p.cyl(0.012, 0.012, 1.03, 1.15, 6, 'white', s * (hw - 0.14), hd + 0.06);
      p.box(s * 0.06 - 0.025, s * 0.06 + 0.025, 0.03, 0.05, hd, hd + 0.1, 'gold', ['y-', 'z-']);
    }
  },

  // the piano's keyboard (step 2), in front of its case: the key bed on two legs, its
  // cheeks, the white keys and the black, their tops at the piece's height (she walks them)
  keys(p, { w, d, h }) {
    const hw = w / 2, hd = d / 2;
    const k0 = -hw + KEY_INSET, k1 = hw - KEY_INSET;
    const bed = h - 0.03;
    p.box(-hw + 0.06, hw - 0.06, bed - 0.1, bed, -hd, hd - 0.02, 'darkWood', ['y+', 'z-']);
    for (const s of [-1, 1]) p.box(s > 0 ? hw - 0.06 : -hw, s > 0 ? hw : -hw + 0.06, bed - 0.12, h + 0.04, -hd, hd, 'darkWood', ['z-']);
    // the white and black keys are the eight keys she plays, each its own mesh (findParts)
    p.box(k0, k1, bed - 0.1, h, hd - 0.04, hd - 0.02, 'darkWood', ['y-', 'z-', 'x-', 'x+']);
    for (const s of [-1, 1]) p.box(s * (hw - 0.05) - 0.025, s * (hw - 0.05) + 0.025, 0, bed - 0.1, hd - 0.07, hd - 0.02, 'darkWood', ['y-', 'y+']);
  },

  // a small round side table: a turned pedestal on a foot, a teacup on its saucer
  sidetable(p, { w, h }) {
    const r = w / 2;
    p.cyl(r, r, h - 0.03, h, 16, 'darkWood', 0, 0);
    p.cyl(0.035, 0.05, 0.05, h - 0.03, 8, 'darkWood', 0, 0);
    p.cyl(r * 0.6, r * 0.7, 0, 0.05, 12, 'darkWood', 0, 0);
    p.cyl(0.07, 0.07, h, h + 0.01, 10, 'white', 0.05, 0.03);
    p.cyl(0.04, 0.03, h + 0.01, h + 0.06, 8, 'white', 0.05, 0.03);
    p.cyl(0.03, 0.04, h, h + 0.13, 8, 'rose', -0.1, -0.06);
  },

  // a kitchen counter: cream cupboards with sage doors and brass knobs, a scrubbed oak top, a few things on it
  counter(p, { w, d, h, look }) {
    const hw = w / 2, hd = d / 2;
    p.box(-hw + 0.03, hw - 0.03, 0, 0.1, -hd, hd - 0.07, 'darkWood', ['y-', 'y+']);
    p.box(-hw, hw, 0.1, h - 0.04, -hd, hd - 0.03, 'white', ['y-', 'y+']);
    p.box(-hw, hw, h - 0.04, h, -hd, hd, 'oak', ['y-']);
    const n = Math.max(1, Math.round(w / 0.55));
    for (let i = 0; i < n; i++) {
      const x0 = -hw + (w * i) / n, x1 = -hw + (w * (i + 1)) / n;
      p.box(x0 + 0.035, x1 - 0.035, 0.16, h - 0.1, hd - 0.03, hd - 0.015, 'sage', ['z-', 'y-']);
      const kx = i % 2 ? x0 + 0.08 : x1 - 0.08;
      p.box(kx - 0.015, kx + 0.015, h - 0.22, h - 0.19, hd - 0.015, hd, 'gold', ['z-']);
    }
    if (look === 'a') {
      p.box(-hw + 0.2, -hw + 0.6, h, h + 0.26, -hd + 0.06, -hd + 0.34, 'tile', ['y-']);
      p.box(-hw + 0.2, -hw + 0.6, h + 0.26, h + 0.28, -hd + 0.06, -hd + 0.34, 'navy', ['y-']);
      for (const [x, look2] of [[0.15, 'ochre'], [0.35, 'red'], [0.55, 'tile']]) {
        p.cyl(0.05, 0.05, h, h + 0.16, 8, look2, -hw + 0.75 + x, -hd + 0.12);
        p.cyl(0.054, 0.054, h + 0.16, h + 0.185, 8, 'white', -hw + 0.75 + x, -hd + 0.12);
      }
      p.box(hw - 0.75, hw - 0.3, h, h + 0.025, -0.05, 0.2, 'lightWood', ['y-']);
      p.box(hw - 0.7, hw - 0.42, h + 0.025, h + 0.12, -0.0, 0.15, 'tan', ['y-']);
    } else {
      p.cyl(0.16, 0.09, h, h + 0.13, 12, 'white', -hw + 0.45, 0);
      p.cyl(0.025, 0.025, -0.22, 0.22, 8, 'lightWood', 0.3, 0.05, (g) => { g.rotateY(0.4); alongX(g); g.translate(0, h + 0.025, 0); });
      p.cyl(0.09, 0.07, h, h + 0.2, 10, 'copper', hw - 0.35, -hd + 0.15);
    }
  },

  // a black-leaded kitchen range: oven doors, hotplates, a brass rail, a copper kettle on the hob
  range(p, { w, d, h }) {
    const hw = w / 2, hd = d / 2;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.box(sx * (hw - 0.06) - 0.03, sx * (hw - 0.06) + 0.03, 0, 0.06, sz * (hd - 0.06) - 0.03, sz * (hd - 0.06) + 0.03, 'navy', ['y-', 'y+']);
    p.box(-hw, hw, 0.06, 0.84, -hd, hd - 0.03, 'navy', ['y-', 'y+']);
    p.box(-hw - 0.01, hw + 0.01, 0.84, 0.88, -hd, hd, 'stone', ['y-']);
    p.box(-hw, hw, 0.88, h, -hd, -hd + 0.05, 'navy', ['y-']);
    for (const s of [-1, 1]) {
      p.box(s > 0 ? 0.03 : -hw + 0.06, s > 0 ? hw - 0.06 : -0.03, 0.14, 0.62, hd - 0.03, hd - 0.01, 'navy', ['z-', 'y-']);
      p.box(s > 0 ? 0.12 : -hw + 0.15, s > 0 ? hw - 0.15 : -0.12, 0.5, 0.53, hd - 0.01, hd + 0.01, 'gold', ['z-']);
      p.cyl(0.13, 0.13, 0.88, 0.895, 14, 'navy', s * 0.28, 0.02);
    }
    p.cyl(0.014, 0.014, -hw + 0.04, hw - 0.04, 6, 'gold', 0, hd + 0.05, (g) => { alongX(g); g.translate(0, 0.76, 0); });
    for (const s of [-1, 1]) p.box(s * (hw - 0.06) - 0.012, s * (hw - 0.06) + 0.012, 0.74, 0.78, hd - 0.03, hd + 0.05, 'gold');
    p.cyl(0.075, 0.1, 0.895, 1.05, 10, 'copper', -0.28, 0.02);
    p.cyl(0.03, 0.05, 1.05, 1.08, 8, 'copper', -0.28, 0.02);
    p.box(-0.21, -0.1, 0.94, 0.97, 0.0, 0.04, 'copper');
    // a white enamel kettle on the right ring
    p.cyl(0.1, 0.12, 0.895, 1.0, 12, 'white', 0.28, 0.02);
    p.cyl(0.04, 0.05, 1.0, 1.03, 8, 'white', 0.28, 0.02);
    p.box(0.37, 0.47, 0.96, 0.99, 0.0, 0.04, 'white'); // the spout
    p.box(0.2, 0.36, 1.03, 1.06, 0.0, 0.04, 'brown'); // the handle
  },

  // a white butler's sink on a cupboard, oak draining boards either side, brass taps
  sink(p, { w, d, h }) {
    const hw = w / 2, hd = d / 2;
    const top = 0.92;
    p.box(-hw + 0.03, hw - 0.03, 0, 0.1, -hd, hd - 0.07, 'darkWood', ['y-', 'y+']);
    p.box(-hw, hw, 0.1, top - 0.32, -hd, hd - 0.03, 'white', ['y-', 'y+']);
    for (const s of [-1, 1]) p.box(s > 0 ? 0.01 : -hw + 0.035, s > 0 ? hw - 0.035 : -0.01, 0.15, top - 0.36, hd - 0.03, hd - 0.015, 'sage', ['z-', 'y-']);
    const bx = 0.32;
    p.box(-bx, bx, top - 0.32, top, -hd + 0.06, hd - 0.01, 'white', ['y-', 'y+']);
    p.box(-bx + 0.04, bx - 0.04, top - 0.24, top - 0.24, -hd + 0.1, hd - 0.05, 'tile', ['y-']);
    for (const [x0, x1, z0, z1] of [[-bx, bx, -hd + 0.06, -hd + 0.1], [-bx, bx, hd - 0.05, hd - 0.01], [-bx, -bx + 0.04, -hd + 0.1, hd - 0.05], [bx - 0.04, bx, -hd + 0.1, hd - 0.05]]) {
      p.box(x0, x1, top - 0.24, top, z0, z1, 'white', ['y-']);
    }
    for (const s of [-1, 1]) {
      const x0 = s > 0 ? bx : -hw, x1 = s > 0 ? hw : -bx;
      p.box(x0, x1, top - 0.32, top - 0.04, -hd, hd - 0.03, 'white', ['y+', 'y-']);
      p.box(x0, x1, top - 0.04, top, -hd, hd, 'oak', ['y-']);
      p.cyl(0.015, 0.015, top, h - 0.02, 6, 'gold', s * 0.1, -hd + 0.035);
      p.box(s * 0.1 - 0.012, s * 0.1 + 0.012, h - 0.04, h - 0.02, -hd + 0.035, -hd + 0.12, 'gold');
      p.box(s * 0.1 - 0.025, s * 0.1 + 0.025, h - 0.02, h, -hd + 0.02, -hd + 0.05, 'white');
    }
  },

  // a plate dresser: a pine cupboard base, a rack of three shelves above with blue-and-white plates, jugs
  dresser(p, f) {
    const { w, d, h } = f;
    const hw = w / 2, hd = d / 2;
    p.box(-hw + 0.02, hw - 0.02, 0, 0.06, -hd + 0.02, hd - 0.04, 'darkWood', ['y-', 'y+']);
    p.box(-hw, hw, 0.06, 0.88, -hd, hd - 0.02, 'lightWood', ['y-', 'y+']);
    p.box(-hw - 0.02, hw + 0.02, 0.88, 0.92, -hd, hd + 0.01, 'lightWood', ['y-']);
    for (let i = 0; i < 3; i++) {
      const x0 = -hw + 0.04 + (i * (w - 0.08)) / 3, x1 = -hw + 0.04 + ((i + 1) * (w - 0.08)) / 3;
      p.box(x0 + 0.015, x1 - 0.015, 0.7, 0.84, hd - 0.02, hd - 0.005, 'pine', ['z-', 'y-']);
      p.box((x0 + x1) / 2 - 0.015, (x0 + x1) / 2 + 0.015, 0.76, 0.79, hd - 0.005, hd + 0.01, 'gold', ['z-']);
    }
    for (const s of [-1, 1]) {
      p.box(s > 0 ? 0.02 : -hw + 0.05, s > 0 ? hw - 0.05 : -0.02, 0.12, 0.65, hd - 0.02, hd - 0.005, 'pine', ['z-', 'y-']);
      p.box(s * 0.08 - 0.015, s * 0.08 + 0.015, 0.4, 0.44, hd - 0.005, hd + 0.01, 'gold', ['z-']);
    }
    const rd = 0.26;
    p.box(-hw + 0.03, hw - 0.03, 0.92, h - 0.08, -hd, -hd + 0.02, 'pine', ['y-', 'y+', 'x-', 'x+', 'z-']);
    for (const s of [-1, 1]) p.box(s > 0 ? hw - 0.03 : -hw, s > 0 ? hw : -hw + 0.03, 0.92, h - 0.08, -hd, -hd + rd, 'lightWood', ['y-', 'y+']);
    p.box(-hw - 0.03, hw + 0.03, h - 0.08, h, -hd, -hd + rd + 0.04, 'lightWood', ['y-']);
    const rows = [0.92, 1.3, 1.66];
    for (const y of rows.slice(1)) p.box(-hw + 0.03, hw - 0.03, y - 0.025, y, -hd + 0.02, -hd + rd, 'lightWood', ['x-', 'x+', 'z-']);
    rows.forEach((y, row) => {
      const n = 5;
      for (let i = 0; i < n; i++) {
        const r = 0.1 + 0.025 * hash01(f.x + i, f.z + row, 81);
        const x = -hw + 0.03 + ((i + 0.5) * (w - 0.06)) / n;
        const look = (i + row) % 2 ? 'rugBlue' : 'white';
        p.cyl(r, r, -0.008, 0.008, 12, look, 0, 0, (g) => { alongZ(g); g.rotateX(-0.22); g.translate(x, y + r + 0.01, -hd + 0.07); });
      }
      p.box(-hw + 0.03, hw - 0.03, y + 0.04, y + 0.06, -hd + 0.1, -hd + 0.12, 'lightWood', ['y-', 'z-']);
    });
    p.cyl(0.06, 0.08, 0.92, 1.1, 10, 'white', -hw + 0.3, 0.1);
    p.cyl(0.05, 0.065, 0.92, 1.06, 10, 'rugBlue', hw - 0.35, 0.12);
  },

  // a scrubbed pine kitchen table on four square legs, a teapot, cups and a loaf on it
  table(p, { w, d, h }) {
    const hw = w / 2, hd = d / 2;
    p.box(-hw, hw, h - 0.04, h, -hd, hd, 'pine');
    p.box(-hw + 0.07, hw - 0.07, h - 0.14, h - 0.04, -hd + 0.07, hd - 0.07, 'lightWood', ['y-', 'y+']);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.box(sx * (hw - 0.1) - 0.035, sx * (hw - 0.1) + 0.035, 0, h - 0.04, sz * (hd - 0.1) - 0.035, sz * (hd - 0.1) + 0.035, 'lightWood', ['y-', 'y+']);
    p.cyl(0.09, 0.1, h, h + 0.13, 10, 'blue', 0.05, 0);
    p.cyl(0.04, 0.06, h + 0.13, h + 0.16, 8, 'white', 0.05, 0);
    p.box(0.13, 0.2, h + 0.05, h + 0.08, -0.012, 0.012, 'blue');
    for (const [x, z] of [[-0.35, -0.22], [0.4, 0.22]]) {
      p.cyl(0.06, 0.06, h, h + 0.008, 10, 'white', x, z);
      p.cyl(0.04, 0.032, h + 0.008, h + 0.07, 8, 'white', x, z);
    }
    p.prim(new THREE.SphereGeometry(0.1, 8, 5), 'tan', -0.45, h + 0.04, 0.12, (g) => g.scale(1.5, 0.75, 1));
  },

  // a wooden kitchen chair (or, in the attic, an old rocking chair with a cushion)
  chair(p, { w, d, h, look }) {
    const hw = w / 2;
    const rocking = look === 'rocking';
    const sd = rocking ? 0.44 : d;
    const hd = sd / 2;
    const wood = rocking ? 'darkWood' : 'lightWood';
    const foot = rocking ? 0.06 : 0;
    const seat = 0.45;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.box(sx * (hw - 0.04) - 0.02, sx * (hw - 0.04) + 0.02, foot, seat, sz * (hd - 0.04) - 0.02, sz * (hd - 0.04) + 0.02, wood, ['y-', 'y+']);
    p.box(-hw, hw, seat, seat + 0.04, -hd, hd, wood);
    for (const s of [-1, 1]) p.box(s * (hw - 0.04) - 0.022, s * (hw - 0.04) + 0.022, seat + 0.04, h, -hd + 0.02, -hd + 0.06, wood, ['y-']);
    p.box(-hw + 0.02, hw - 0.02, h - 0.1, h - 0.03, -hd + 0.025, -hd + 0.055, wood);
    p.box(-hw + 0.06, hw - 0.06, seat + 0.2, seat + 0.25, -hd + 0.03, -hd + 0.05, wood);
    if (rocking) {
      const rd = d / 2;
      for (const s of [-1, 1]) {
        const x = s * (hw - 0.04);
        p.box(x - 0.02, x + 0.02, 0, 0.06, -hd, hd, wood, ['y-']);
        for (const e of [-1, 1]) {
          const len = rd - hd + 0.04;
          p.prim(new THREE.BoxGeometry(0.04, 0.05, len), wood, x, 0.05, e * (hd + len / 2 - 0.03), (g) => g.rotateX(e * 0.3));
        }
      }
      p.box(-hw + 0.04, hw - 0.04, seat + 0.04, seat + 0.09, -hd + 0.06, hd - 0.02, 'rugRed', ['y-']);
    }
  },

  // a big old bed: a panelled headboard with tall posts, a footboard, the mattress, a red coverlet, two pillows
  bed(p, { w, d, h }) {
    const hw = w / 2, hd = d / 2;
    for (const s of [-1, 1]) {
      p.box(s > 0 ? hw - 0.07 : -hw, s > 0 ? hw : -hw + 0.07, 0, h, -hd, -hd + 0.07, 'darkWood', ['y-']);
      p.box(s > 0 ? hw - 0.07 : -hw, s > 0 ? hw : -hw + 0.07, 0, 0.72, hd - 0.07, hd, 'darkWood', ['y-']);
      p.box(s > 0 ? hw - 0.06 : -hw + 0.03, s > 0 ? hw - 0.03 : -hw + 0.06, 0.2, 0.32, -hd + 0.07, hd - 0.07, 'darkWood', ['y-']);
    }
    p.box(-hw + 0.07, hw - 0.07, 0.32, h - 0.1, -hd + 0.015, -hd + 0.055, 'darkWood', ['y-']);
    p.box(-hw + 0.07, hw - 0.07, h - 0.1, h - 0.04, -hd, -hd + 0.07, 'darkWood', ['y-']);
    p.box(-hw + 0.07, hw - 0.07, 0.3, 0.64, hd - 0.055, hd - 0.015, 'darkWood', ['y-']);
    p.box(-hw + 0.06, hw - 0.06, 0.3, 0.5, -hd + 0.07, hd - 0.07, 'white', ['y-']);
    p.box(-hw + 0.03, hw - 0.03, 0.36, 0.56, -hd + 0.62, hd - 0.06, 'rugRed', ['y-', 'z+']);
    p.box(-hw + 0.04, hw - 0.04, 0.5, 0.575, -hd + 0.52, -hd + 0.66, 'white', ['y-']);
    for (const s of [-1, 1]) p.box(s > 0 ? 0.03 : -hw + 0.12, s > 0 ? hw - 0.12 : -0.03, 0.5, 0.64, -hd + 0.1, -hd + 0.45, 'white', ['y-']);
  },

  // a little bedside cupboard: a drawer, a door, a candlestick and a book on top
  bedside(p, { w, d, h }) {
    const hw = w / 2, hd = d / 2;
    p.box(-hw, hw, 0.04, h - 0.03, -hd, hd - 0.02, 'darkWood', ['y-', 'y+']);
    p.box(-hw - 0.01, hw + 0.01, h - 0.03, h, -hd, hd, 'darkWood', ['y-']);
    p.box(-hw + 0.03, hw - 0.03, h - 0.16, h - 0.06, hd - 0.02, hd - 0.005, 'lightWood', ['z-', 'y-']);
    p.box(-hw + 0.03, hw - 0.03, 0.08, h - 0.19, hd - 0.02, hd - 0.005, 'lightWood', ['z-', 'y-']);
    p.box(-0.015, 0.015, h - 0.125, h - 0.095, hd - 0.005, hd + 0.01, 'gold', ['z-']);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.box(sx * (hw - 0.04) - 0.02, sx * (hw - 0.04) + 0.02, 0, 0.04, sz * (hd - 0.04) - 0.02, sz * (hd - 0.04) + 0.02, 'darkWood', ['y-', 'y+']);
    p.cyl(0.045, 0.035, h, h + 0.02, 8, 'gold', -0.08, -0.05);
    p.cyl(0.012, 0.012, h + 0.02, h + 0.13, 6, 'white', -0.08, -0.05);
    p.box(0.0, 0.16, h, h + 0.035, -0.05, 0.14, 'navy', ['y-']);
    p.box(0.01, 0.15, h + 0.035, h + 0.065, -0.04, 0.12, 'ochre', ['y-']);
  },

  // a tall wardrobe: two panelled doors, a drawer under them, a cornice, bun feet
  wardrobe(p, { w, d, h }) {
    const hw = w / 2, hd = d / 2;
    p.box(-hw + 0.03, hw - 0.03, 0, 0.1, -hd + 0.03, hd - 0.05, 'darkWood', ['y-', 'y+']);
    p.box(-hw, hw, 0.1, h - 0.1, -hd, hd - 0.02, 'darkWood', ['y-', 'y+']);
    p.box(-hw - 0.03, hw + 0.03, h - 0.1, h, -hd, hd + 0.02, 'darkWood', ['y-']);
    p.box(-hw + 0.04, hw - 0.04, 0.14, 0.34, hd - 0.02, hd - 0.005, 'lightWood', ['z-', 'y-']);
    for (const s of [-1, 1]) {
      p.box(s * 0.18 - 0.015, s * 0.18 + 0.015, 0.22, 0.26, hd - 0.005, hd + 0.01, 'gold', ['z-']);
      const x0 = s > 0 ? 0.01 : -hw + 0.04, x1 = s > 0 ? hw - 0.04 : -0.01;
      p.box(x0, x1, 0.38, h - 0.16, hd - 0.02, hd - 0.008, 'darkWood', ['z-', 'y-']);
      for (const [y0, y1] of [[0.48, 1.08], [1.18, h - 0.26]]) p.box(x0 + 0.07, x1 - 0.07, y0, y1, hd - 0.008, hd - 0.002, 'lightWood', ['z-', 'y-', 'x-', 'x+', 'y+']);
      p.box(s * 0.04 - 0.012, s * 0.04 + 0.012, 1.05, 1.12, hd - 0.008, hd + 0.008, 'gold', ['z-']);
    }
  },

  // a chest of drawers: four drawers with brass knobs, a jug and basin and a little mirror on top
  drawers(p, { w, d, h }) {
    const hw = w / 2, hd = d / 2;
    const top = 0.82;
    p.box(-hw + 0.02, hw - 0.02, 0, 0.08, -hd + 0.02, hd - 0.04, 'darkWood', ['y-', 'y+']);
    p.box(-hw, hw, 0.08, top - 0.03, -hd, hd - 0.02, 'darkWood', ['y-', 'y+']);
    p.box(-hw - 0.015, hw + 0.015, top - 0.03, top, -hd, hd + 0.01, 'darkWood', ['y-']);
    const rows = [[0.1, 0.28], [0.3, 0.47], [0.49, 0.64]];
    for (const [y0, y1] of rows) {
      p.box(-hw + 0.03, hw - 0.03, y0, y1, hd - 0.02, hd - 0.005, 'lightWood', ['z-', 'y-']);
      for (const s of [-1, 1]) p.box(s * hw * 0.5 - 0.015, s * hw * 0.5 + 0.015, (y0 + y1) / 2 - 0.015, (y0 + y1) / 2 + 0.015, hd - 0.005, hd + 0.01, 'gold', ['z-']);
    }
    for (const s of [-1, 1]) {
      const x0 = s > 0 ? 0.01 : -hw + 0.03, x1 = s > 0 ? hw - 0.03 : -0.01;
      p.box(x0, x1, 0.66, top - 0.05, hd - 0.02, hd - 0.005, 'lightWood', ['z-', 'y-']);
      p.box((x0 + x1) / 2 - 0.015, (x0 + x1) / 2 + 0.015, 0.7, 0.73, hd - 0.005, hd + 0.01, 'gold', ['z-']);
    }
    p.cyl(0.18, 0.12, top, top + 0.07, 12, 'white', -0.15, 0.02);
    p.cyl(0.05, 0.07, top + 0.02, h - 0.02, 10, 'white', -0.15, 0.02);
    p.box(0.12, 0.42, top, top + 0.04, -hd + 0.03, -hd + 0.1, 'darkWood');
    p.box(0.14, 0.4, top + 0.04, h, -hd + 0.05, -hd + 0.08, 'sky');
  },

  // a tall pantry cupboard (step 2): a plinth, two panelled doors with brass knobs, a cornice
  pantry(p, { w, d, h }) {
    const hw = w / 2, hd = d / 2;
    p.box(-hw + 0.03, hw - 0.03, 0, 0.1, -hd + 0.03, hd - 0.05, 'darkWood', ['y-', 'y+']);
    p.box(-hw, hw, 0.1, h - 0.1, -hd, hd - 0.02, 'pine', ['y-', 'y+']);
    p.box(-hw - 0.03, hw + 0.03, h - 0.1, h, -hd, hd + 0.02, 'lightWood', ['y-']);
    for (const s of [-1, 1]) {
      const x0 = s > 0 ? 0.01 : -hw + 0.04, x1 = s > 0 ? hw - 0.04 : -0.01;
      p.box(x0, x1, 0.16, h - 0.16, hd - 0.02, hd - 0.008, 'lightWood', ['z-', 'y-']);
      for (const [y0, y1] of [[0.26, 0.86], [0.98, h - 0.26]]) p.box(x0 + 0.06, x1 - 0.06, y0, y1, hd - 0.008, hd - 0.002, 'pine', ['z-', 'y-', 'x-', 'x+', 'y+']);
      p.box(s * 0.05 - 0.012, s * 0.05 + 0.012, 0.9, 0.96, hd - 0.008, hd + 0.008, 'gold', ['z-']);
    }
  },

  // two flour sacks slumped against the wall (step 2), their necks tied with string
  sacks(p, f) {
    const { w, d, h } = f;
    const r = Math.min(d / 2 - 0.02, w / 4);
    for (const [i, x, hh] of [[0, -w / 4, h], [1, w / 4, h * 0.85]]) {
      p.prim(new THREE.SphereGeometry(r, 9, 7), i ? 'tan' : 'white', x, hh * 0.42, 0, (g) => g.scale(1, (hh * 0.84) / (2 * r), 0.9));
      p.cyl(r * 0.35, r * 0.5, hh * 0.78, hh, 7, i ? 'tan' : 'white', x, -0.02);
      p.cyl(r * 0.38, r * 0.38, hh * 0.84, hh * 0.88, 7, 'brown', x, -0.02);
    }
  },

  // an old painted toy box (step 2): a lid with a lip, iron corners, a name plate
  toybox(p, { w, d, h }) {
    const hw = w / 2, hd = d / 2;
    p.box(-hw, hw, 0.02, h - 0.07, -hd, hd, 'rose', ['y-', 'y+']);
    p.box(-hw + 0.02, hw - 0.02, h - TOYBOX_IN - 0.01, h - TOYBOX_IN, -hd + 0.02, hd - 0.02, 'brown', ['y-', 'x-', 'x+', 'z-', 'z+']); // inside, under the lid (findParts)
    for (const sx of [-1, 1]) p.box(sx * hw - (sx > 0 ? 0.04 : 0), sx * hw + (sx < 0 ? 0.04 : 0), 0.02, h - 0.07, hd, hd + 0.008, 'navy', ['z-', 'y-']);
    p.box(-0.12, 0.12, h * 0.45, h * 0.62, hd, hd + 0.008, 'white', ['z-']);
    p.box(-0.03, 0.03, h - 0.12, h - 0.07, hd, hd + 0.012, 'gold', ['z-']);
  },

  // stacked boxes, no higher than the piece: two on the floor, two on top, a hatbox, tape on the lids
  boxes(p, { w, d, h }) {
    const hw = w / 2, hd = d / 2;
    const h1 = h * 0.42, h2 = h * 0.32;
    const a = [-hw, -hw + w * 0.55, -hd, hd - d * 0.1];
    p.box(a[0], a[1], 0, h1, a[2], a[3], 'ochre', ['y-']);
    p.box(a[0] + 0.04, a[1] - 0.04, h1, h1 + 0.002, (a[2] + a[3]) / 2 - 0.03, (a[2] + a[3]) / 2 + 0.03, 'white', ['y-']);
    p.box(-hw + w * 0.58, hw, 0, h1 * 0.85, -hd + d * 0.05, hd, 'lightWood', ['y-']);
    const c = [-hw + w * 0.05, -hw + w * 0.5, -hd + d * 0.08, hd - d * 0.2];
    p.box(c[0], c[1], h1, h1 + h2, c[2], c[3], 'ochre', ['y-']);
    p.box(c[0] + 0.03, c[1] - 0.03, h1 + h2, h1 + h2 + 0.002, (c[2] + c[3]) / 2 - 0.03, (c[2] + c[3]) / 2 + 0.03, 'white', ['y-']);
    p.box(-hw + w * 0.1, -hw + w * 0.42, h1 + h2, h, -hd + d * 0.15, hd - d * 0.35, 'tan', ['y-']);
    const r = Math.min(0.18, (w * 0.42) / 2 - 0.02, d / 2 - 0.05);
    p.cyl(r, r, h1 * 0.85, h1 * 0.85 + 0.2, 12, 'parlour', hw - w * 0.21, 0);
  },

  // an old domed trunk: dark wood with pale straps, a brass lock, iron handles
  trunk(p, { w, d, h }) {
    const hw = w / 2, hd = d / 2;
    const body = h - hd * 0.6;
    p.box(-hw, hw, 0.02, body, -hd, hd, 'darkWood', ['y-', 'y+']);
    p.prim(new THREE.CylinderGeometry(hd, hd, w, 10, 1, false, 0, Math.PI), 'darkWood', 0, body, 0, (g) => { g.rotateZ(Math.PI / 2); g.scale(1, (h - body) / hd, 1); });
    for (const s of [-1, 1]) {
      p.box(s * hw * 0.55 - 0.035, s * hw * 0.55 + 0.035, 0.02, body, -hd - 0.006, hd + 0.006, 'tan', ['y-', 'y+']);
      p.box(s * hw - (s > 0 ? 0 : 0.02), s * hw + (s > 0 ? 0.02 : 0), body * 0.55, body * 0.7, -0.1, 0.1, 'navy');
    }
    p.box(-0.05, 0.05, body - 0.12, body + 0.02, hd, hd + 0.015, 'gold', ['z-']);
  },

  // three oak barrels, iron hoops round them, a brass tap in the middle one
  barrels(p, { w, d, h }) {
    const hw = w / 2;
    const r = Math.min(d / 2 - 0.03, w / 6 - 0.02);
    const prof = [[0, 0], [r * 0.86, 0], [r * 0.97, h * 0.22], [r, h * 0.5], [r * 0.97, h * 0.78], [r * 0.86, h], [0, h]].map(([x, y]) => new THREE.Vector2(x, y));
    for (let i = 0; i < 3; i++) {
      const x = -hw + r + 0.03 + (i * (w - 2 * r - 0.06)) / 2;
      p.prim(new THREE.LatheGeometry(prof, 10), 'oak', x, 0, 0, (g) => g.rotateY(i * 0.7));
      for (const y of [0.16, 0.84]) {
        const rr = r * 0.95 + 0.006; // just proud of the staves
        p.prim(new THREE.CylinderGeometry(rr, rr, 0.04, 10, 1, true), 'navy', x, h * y, 0);
      }
    }
    p.box(-0.02, 0.02, h * 0.3, h * 0.36, r - 0.01, r + 0.06, 'gold');
  },

  // pine crates: two on the floor, one on top, battens on their fronts
  crates(p, { w, d, h }) {
    const hw = w / 2, hd = d / 2;
    const boxes = [
      [-hw, -hw + w * 0.5, 0, h * 0.5, -hd, hd - d * 0.1, 'pine'],
      [-hw + w * 0.53, hw, 0, h * 0.45, -hd + d * 0.08, hd, 'pine'],
      [-hw + w * 0.08, -hw + w * 0.62, h * 0.5, h, -hd + d * 0.05, hd - d * 0.25, 'lightWood'],
    ];
    for (const [x0, x1, y0, y1, z0, z1, look] of boxes) {
      p.box(x0, x1, y0, y1, z0, z1, look, ['y-']);
      for (const x of [x0 + 0.03, x1 - 0.07]) p.box(x, x + 0.04, y0, y1, z1, z1 + 0.012, 'darkWood', ['y-', 'z-']);
      p.box(x0 + 0.07, x1 - 0.07, (y0 + y1) / 2 - 0.03, (y0 + y1) / 2 + 0.03, z1, z1 + 0.012, 'darkWood', ['y-', 'z-']);
    }
  },

  // rough pine shelving with jars of jam, honey and pickles, some with lids
  jarshelf(p, f) {
    const { w, d, h } = f;
    const hw = w / 2, hd = d / 2;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.box(sx * (hw - 0.03) - 0.025, sx * (hw - 0.03) + 0.025, 0, h, sz * (hd - 0.03) - 0.025, sz * (hd - 0.03) + 0.025, 'darkWood', ['y-']);
    const ys = [0.08, 0.54, 1.0, 1.46, h - 0.03];
    for (const y of ys) p.box(-hw, hw, y, y + 0.03, -hd + 0.01, hd - 0.01, 'pine');
    ys.slice(0, 4).forEach((y, row) => {
      const n = 6;
      for (let i = 0; i < n; i++) {
        const r = 0.055 + 0.03 * hash01(f.x + i, f.z + row, 91);
        const jh = 0.12 + 0.1 * hash01(f.x - i, f.z + row, 92);
        const x = -hw + 0.12 + ((i + 0.5) * (w - 0.24)) / n + 0.03 * (hash01(i, row, 93) - 0.5);
        const z = 0.04 * (hash01(i, row, 94) - 0.5);
        const y0 = y + 0.03;
        p.cyl(r, r, y0, y0 + jh, 8, pick(JAR_LOOKS, f, i + row * n, 95), x, z);
        if ((i + row) % 2 === 0) p.cyl(r + 0.006, r + 0.006, y0 + jh, y0 + jh + 0.025, 8, hash01(i, row, 96) < 0.5 ? 'red' : 'white', x, z);
      }
    });
  },
};

// The walked-over pieces: a rug or runner (a thin slab of its rug cell), a cobweb.
const FLAT_BUILDERS = {
  rug(p, { w, d, h, look }) {
    const hw = w / 2, hd = d / 2;
    kitFace(p.kit, 'y', h, 1, rect(-hw, hw, -hd, hd), C[look ?? 'rugRed']);
    const brown = swUV('brown');
    swFace(p.kit, 'z', hd, 1, rect(-hw, hw, 0, h), brown);
    swFace(p.kit, 'z', -hd, -1, rect(-hw, hw, 0, h), brown);
    swFace(p.kit, 'x', hw, 1, rect(-hd, hd, 0, h), brown);
    swFace(p.kit, 'x', -hw, -1, rect(-hd, hd, 0, h), brown);
  },
  runner(p, f) { FLAT_BUILDERS.rug(p, { ...f, look: f.look ?? 'rugBlue' }); },
  // an old round cushion on the hearth (step 2) with a cat-shaped dent in it: a curled
  // body, a head and a tail pressed in, as if someone else naps here too
  cushion(p, { w, h, look }) {
    const r = w / 2;
    p.cyl(r, r * 0.94, 0, h, 16, look ?? 'sky', 0, 0);
    p.cyl(r * 0.97, r * 0.97, h * 0.45, h * 0.6, 16, 'gold', 0, 0);
    const dent = (rx, rz, x, z) => p.cyl(1, 1, h, h + 0.003, 12, 'blue', x, z, (g) => g.scale(rx, 1, rz));
    dent(0.17, 0.12, 0.02, 0.02);
    dent(0.07, 0.065, -0.17, -0.1);
    dent(0.1, 0.035, 0.12, -0.15);
  },
  // an old pile of books left on the floor: three, each a little turned
  books(p, { w, d }) {
    [['red', 0], ['green', 0.07], ['ochre', 0.12]].forEach(([look, y], i) => {
      const hw = w * (0.5 - 0.08 * i) / 2, hd = d * (0.5 - 0.04 * i) / 2;
      p.prim(new THREE.BoxGeometry(hw * 2, i === 2 ? 0.04 : 0.065, hd * 2), look, 0.02 * i, y + (i === 2 ? 0.02 : 0.033), 0.015 * i, (g) => g.rotateY(0.35 * i - 0.2));
    });
  },
  // a web across a floor corner: from the corner seam (h up) to its two walls, five
  // radials and three rings of thin strands, both faces (no back-face material)
  cobweb(p, { w, d, h }) {
    const hw = w / 2, hd = d / 2;
    const P = new THREE.Vector3(-hw, h, -hd);
    const A = new THREE.Vector3(hw, 0.03, -hd);
    const B = new THREE.Vector3(-hw, 0.03, hd);
    const n = new THREE.Vector3().subVectors(A, P).cross(new THREE.Vector3().subVectors(B, P)).normalize();
    const uv = swUV('white');
    const strand = (a, b, wide = 0.011) => {
      const dir = new THREE.Vector3().subVectors(b, a).normalize();
      const side = new THREE.Vector3().crossVectors(dir, n).multiplyScalar(wide / 2);
      const pts = [a.clone().sub(side), b.clone().sub(side), b.clone().add(side), a.clone().add(side)].map((v) => [v.x, v.y, v.z]);
      p.kit.fan(pts, pts.map(() => uv), [n.x, n.y, n.z]);
      p.kit.fan(pts, pts.map(() => uv), [-n.x, -n.y, -n.z]);
    };
    const ends = [0, 1, 2, 3, 4].map((k) => new THREE.Vector3().lerpVectors(A, B, k / 4));
    for (const q of ends) strand(P, q);
    for (const t of [0.4, 0.66, 0.9]) {
      const ring = ends.map((q) => new THREE.Vector3().lerpVectors(P, q, t));
      for (let k = 0; k + 1 < ring.length; k++) strand(ring[k], ring[k + 1], 0.008);
    }
  },
};

// A piece's geometry in its own frame (the middle of its footprint on the floor, front +z).
export function furnitureGeometry(f) {
  const make = BUILDERS[f.kind] ?? FLAT_BUILDERS[f.kind];
  if (!make) throw new Error(`no builder for furniture kind ${f.kind}`);
  const p = new Piece();
  make(p, f);
  return p.geometry();
}

// A solid piece as a mesh in its own frame (house.js stands it and turns it). It casts:
// it joins its room's merged mesh, or is a tall piece's own group.
export function furnitureMesh(f, material) {
  return kitMeshFrom(furnitureGeometry(f), material, `houseFurniture:${f.id}`, { cast: true });
}

// The library's secret bookcase (step 2, ruling D9), shut: a bookcase like the
// others, books facing the library (+z), standing in the secret stair's mouth on
// the wall line. A top-level group whose pivot is the hinge (houseplan.js
// SECRET_BOOKCASE: the opening's west jamb), so house life swings it open by
// turning the group (rotation.y = SECRET_OPEN_ROT_Y). Drawn 0.06 m narrower than
// the opening, so its cornice stays inside the jambs. It fades like a tall piece
// (ruling H8), and its fade shape is a tall piece's: a cylinder round the leaf's
// middle, on the leaf (the group's one child, `leaf`), not on the pivot. A fade
// shape is placed at its object's origin (treefade.js), and one round the hinge
// would have to reach the leaf's far end, 2.4 m out: seen from the stair, the
// bookcase then faded away and she faced an invisible wall. A ground-level detail
// for the level drawing. Unlike the others it is seen from behind (from the stair),
// so it has a plain wooden back, in its one mesh (the prop merge would empty the
// leaf of a second one, and the fade find nothing on it).
export function secretBookcaseGroup(material) {
  const b = SECRET_BOOKCASE;
  const f = { id: 'library-secret', kind: 'bookcase', x: b.x, z: b.z, w: b.w - 0.06, d: b.d, h: b.h };
  const p = new Piece();
  BUILDERS.bookcase(p, f);
  const hw = f.w / 2 - 0.04; // inside its side boards
  p.box(-hw, hw, 0.1, f.h - 0.08, -f.d / 2, -f.d / 2 + 0.02, 'darkWood', ['x-', 'x+', 'y-', 'y+', 'z+']);
  const leaf = new THREE.Group();
  leaf.name = 'houseSecretBookcase:leaf';
  leaf.position.set(b.w / 2, 0, 0);
  leaf.userData.fadeOccluder = [{ t: 'cyl', r: Math.hypot(b.w, b.d) / 2, y0: 0, y1: b.h }];
  leaf.add(kitMeshFrom(p.geometry(), material, 'houseFurniture:library-secret', { cast: true }));
  const g = new THREE.Group();
  g.name = 'houseSecretBookcase';
  g.position.set(b.hinge.x, levelY('ground'), b.hinge.z);
  g.add(leaf);
  g.userData.secretBookcase = true;
  g.userData.leaf = leaf;
  g.userData.noMerge = true; // the leaf keeps its own mesh, and house life turns the group (housefinds.js)
  g.userData.noContactShadow = true;
  g.userData.houseDetail = true;
  g.userData.houseLevel = 'ground';
  return g;
}

// ---- the finds' moving parts (step 2, Task 6: world/housefinds.js moves them) ----

// The piano's keys span its keyboard inside its cheeks (KEY_INSET in from each end), in
// eight equal keys. pianoKeyAt: which of them (0-7, west to east) is at world x over a
// keyboard whose footprint runs minX..maxX; past either end, the end key. The meshes
// (findParts) and the notes (housefinds.js) both use it, so the key that sounds dips.
export const KEY_INSET = 0.06;
export const pianoKeyAt = (minX, maxX, x) => Math.min(7, Math.max(0, Math.floor(((x - minX - KEY_INSET) / (maxX - minX - 2 * KEY_INSET)) * 8)));

// How far the toy box's inside floor lies under its top: where the toys lie, the tallest
// (0.09 m) under the shut lid.
const TOYBOX_IN = 0.17;
// How far the toy box's lid tips back (rad about its back edge): a little short of upright,
// clear of the wall behind it.
export const LID_OPEN = -1.45;
// A moving part: in its piece's own frame, kept out of the prop merge, casting no shadow.
function movingMesh(p, material, name) {
  const m = kitMeshFrom(p.geometry(), material, name, { cast: false });
  m.userData.noMerge = true;
  return m;
}
// The parts that move for a find, as { objects (to stand with the piece, in its frame),
// parts (named for house life) }, or null for a piece with none:
//   clock    pendulum: hung at the top of the trunk's window, swinging about z
//   keys     keys: eight meshes, west to east in the world, each a stretch of the white
//            keys and the black ones on it, dipped while her paws are on it
//   toybox   lid: turning about its back edge (rotation.x, LID_OPEN tipped);
//            toys: a wooden mouse, a block and a spinning top, each { mesh, from, rest, yaw }
//            (lying in the box; on the floor in front of it, turned by yaw)
export function findParts(f, material) {
  const hw = f.w / 2, hd = f.d / 2;
  if (f.kind === 'clock') {
    const p = new Piece();
    p.box(-0.008, 0.008, -0.35, 0, -0.004, 0.004, 'gold', ['y+']);
    p.prim(new THREE.CylinderGeometry(0.06, 0.06, 0.012, 12), 'gold', 0, -0.4, 0.003, alongZ);
    const pendulum = movingMesh(p, material, `houseFind:${f.id}:pendulum`);
    pendulum.position.set(0, 1.3, hd - 0.026);
    return { objects: [pendulum], parts: { pendulum } };
  }
  if (f.kind === 'keys') {
    const h = f.h, bed = h - 0.03;
    const k0 = -hw + KEY_INSET, k1 = hw - KEY_INSET;
    const whites = 31;
    const kw = (k1 - k0) / whites;
    const span = (k1 - k0) / 8;
    const keys = [];
    for (let j = 0; j < 8; j++) {
      const a = k0 + j * span, b = a + span;
      const p = new Piece();
      p.box(a, b, bed, h, -hd, hd - 0.04, 'white', ['y-', 'z-']);
      for (let i = 0; i < whites - 1; i++) {
        if ([2, 6].includes(i % 7)) continue; // no black key between E-F and B-C
        const x = k0 + (i + 1) * kw;
        if (x < a || x >= b) continue;
        p.box(x - kw * 0.3, x + kw * 0.3, h, h + 0.015, -hd, -hd + 0.09, 'navy', ['y-', 'z-']);
      }
      keys.push({ east: Math.cos(f.rotY) * (a + b), mesh: movingMesh(p, material, `houseFind:${f.id}:key`) });
    }
    keys.sort((u, v) => u.east - v.east);
    return { objects: keys.map((k) => k.mesh), parts: { keys: keys.map((k) => k.mesh) } };
  }
  if (f.kind === 'toybox') {
    const top = f.h - 0.07;
    const lp = new Piece();
    lp.box(-hw - 0.015, hw + 0.015, 0, 0.07, 0, f.d + 0.03, 'lightWood');
    const lid = movingMesh(lp, material, `houseFind:${f.id}:lid`);
    lid.position.set(0, top, -hd - 0.015);
    const mouse = new Piece();
    mouse.prim(new THREE.SphereGeometry(1, 9, 7), 'tan', 0, 0.035, 0, (g) => g.scale(0.045, 0.035, 0.075));
    for (const s of [-1, 1]) mouse.prim(new THREE.CylinderGeometry(0.018, 0.018, 0.006, 8), 'rose', s * 0.025, 0.065, 0.035, alongZ);
    mouse.box(-0.004, 0.004, 0.02, 0.028, -0.15, -0.07, 'brown');
    const block = new Piece();
    block.box(-0.04, 0.04, 0, 0.08, -0.04, 0.04, 'ochre', ['y-']);
    const spin = new Piece();
    spin.prim(new THREE.CylinderGeometry(0.05, 0.004, 0.06, 10), 'red', 0, 0.03, 0);
    spin.cyl(0.008, 0.008, 0.06, 0.09, 6, 'navy', 0, 0);
    const toys = [
      [mouse, -0.2, 0.0, -0.25, hd + 0.3, 0.7],
      [block, 0.0, 0.05, 0.05, hd + 0.45, -0.4],
      [spin, 0.2, -0.05, 0.3, hd + 0.28, 1.1],
    ].map(([piece, fx, fz, rx, rz, yaw], i) => {
      const mesh = movingMesh(piece, material, `houseFind:${f.id}:toy:${i}`);
      const from = new THREE.Vector3(fx, f.h - TOYBOX_IN, fz);
      mesh.position.copy(from);
      return { mesh, from, rest: new THREE.Vector3(rx, 0, rz), yaw };
    });
    return { objects: [lid, ...toys.map((q) => q.mesh)], parts: { lid, toys } };
  }
  return null;
}

// ---- the moves (step 2): the plank, and the paw prints at the take-offs ----

// A crossing's plank (housemoves.js), a board along its rail, its upper face the rail
// she walks, reaching PLANK_OVER past each end onto the tops it lies on. In world space.
const PLANK_T = 0.03;
const PLANK_OVER = 0.1;
export function plankMesh(crossing, material) {
  const geos = crossing.segs.map((sg) => {
    const len = sg.len + 2 * PLANK_OVER;
    const g = new THREE.BoxGeometry(len, PLANK_T, crossing.width);
    part(g, C.lightWood);
    g.rotateZ(Math.atan(sg.grade));
    g.rotateY(-Math.atan2(sg.dz, sg.dx));
    g.translate(sg.x0 + sg.dx / 2, sg.y0 + sg.dy / 2 - PLANK_T / 2, sg.z0 + sg.dz / 2);
    return g;
  });
  return kitMeshFrom(geos.length === 1 ? geos[0] : mergeGeometries(geos), material, `housePlank:${crossing.id}`, { cast: true });
}

// A faint pair of paw prints at each take-off (`spots`: { x, y, z, yaw }, the yaw the
// hop's heading, atan2(dx, dz)), a hair over the ground she springs from: one mesh for a
// level, on its own see-through material, cast-free and kept out of the prop merge. A
// ledge-level detail for the level drawing. Pads: [x, z, rx, rz] of one print, toes ahead.
export const PAW_LOOK = freeze({ color: 0x4a3426, opacity: 0.3, lift: 0.006 });
export const PAW_PADS = freeze([[0, -0.02, 0.042, 0.036], [-0.042, 0.035, 0.016, 0.018], [-0.015, 0.056, 0.016, 0.018], [0.015, 0.056, 0.016, 0.018], [0.042, 0.035, 0.016, 0.018]]);
export const PAW_APART = 0.065;
export function pawMarksMesh(level, spots) {
  const geos = [];
  for (const sp of spots) {
    for (const side of [-1, 1]) {
      for (const [px, pz, rx, rz] of PAW_PADS) {
        const g = new THREE.CircleGeometry(1, 10);
        g.rotateX(-Math.PI / 2);
        g.scale(rx, 1, rz);
        g.translate(px + side * PAW_APART, 0, pz);
        g.rotateY(sp.yaw);
        g.translate(sp.x, sp.y + PAW_LOOK.lift, sp.z);
        geos.push(g);
      }
    }
  }
  const material = new THREE.MeshStandardMaterial({
    color: PAW_LOOK.color, roughness: 1, metalness: 0, transparent: true, opacity: PAW_LOOK.opacity,
    depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const m = kitMeshFrom(mergeGeometries(geos), material, `houseMarks:${level}`, { cast: false });
  m.receiveShadow = false;
  m.userData.noMerge = true;
  m.userData.noContactShadow = true;
  m.userData.houseMarks = true;
  m.userData.houseDetail = true;
  m.userData.houseLevel = level;
  return m;
}

// The walked-over pieces of a room (its rugs, its runner, its cobwebs) as one mesh in
// world space, standing on floor y. noCast and noMerge, so the prop merge keeps them
// their own mesh and the walk's caster sweep never makes them cast.
export function flatsMesh(list, y, material, name) {
  const geos = list.map((f) => {
    const g = furnitureGeometry(f);
    g.applyMatrix4(new THREE.Matrix4().makeRotationY(f.rotY).setPosition(f.x, y, f.z));
    return g;
  });
  const m = kitMeshFrom(geos.length === 1 ? geos[0] : mergeGeometries(geos), material, name, { cast: false });
  m.userData.noMerge = true;
  m.userData.houseFlat = true;
  return m;
}

// A far level's furniture drawn simply (ruling H6): a box per solid piece at its
// footprint and 0.9 of its height, one flat colour per room, one mesh, cast-free.
const STAND_IN_COLORS = freeze({
  hall: 0x8a6a4a, library: 0x5e4a36, parlour: 0x8a5a4e, kitchen: 0xa89676,
  bedroom: 0x7a6a5a, attic: 0x9a8460, cellar: 0x7a6e5e,
});
export function standInMesh(level, list, y) {
  const c = new THREE.Color();
  const geos = list.map((f) => {
    const hh = 0.9 * f.h;
    const g = new THREE.BoxGeometry(f.w, hh, f.d);
    g.rotateY(f.rotY);
    g.translate(f.x, y + hh / 2, f.z);
    c.setHex(STAND_IN_COLORS[f.room] ?? 0x8a7a6a);
    const col = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < col.length; i += 3) { col[i] = c.r; col[i + 1] = c.g; col[i + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  });
  const m = finish(new THREE.Mesh(mergeGeometries(geos), litMaterial(0xffffff, { vertexColors: true })), { cast: false });
  m.name = `houseStandIn:${level}`;
  m.userData.houseSimple = level;
  return m;
}

function kitMeshFrom(geometry, material, name, opts) {
  const m = finish(new THREE.Mesh(geometry, material), opts);
  m.name = name;
  return m;
}
