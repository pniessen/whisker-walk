// THE EAST WING'S FAR LOOK (Old House wing, fix round after milestone 1). A wing zone she is not in, and
// not near the way into, is drawn as ONE mesh instead of its walls and furniture (houselevels.js): a
// stand-in. The first stand-in was a plain brick-red box (10 triangles, no texture), so a room seen from
// the lawn, the hall's windows or the dollhouse view was a flat tray. This one is the same idea with the
// beauty pass painted on it, for about 100 triangles a zone and no casters:
//
//   - the inside of each wall, its paper, wainscot, dado rail, skirting, cornice, windows, curtains,
//     pictures, mirrors and sconces, baked from the house atlas's own pixels into one small texture per
//     zone (the same rows the real walls use: HOUSE_DECOR, HOUSE_WINDOWS, the room's paper and wainscot);
//   - the floor in its own boards or tiles with the rugs and the footprints of the furniture painted
//     on, and the few tallest pieces as boxes;
//   - the outside as real brick (a repeating brick texture, so a tall wall is two triangles, not sixty),
//     the windows as one framed pane each, the doorways and the stair's mouth cut through so the next room
//     shows, and the stair itself as a plank ramp on a brick base.
//
// A wall two rooms share is drawn once, by the room that owns it (the old rooms' rule: the parlour draws
// its east wall, the living room the one to the solarium, the kids' room the one to the bathroom), with
// the neighbour's own paper on the neighbour's face. No randomness, no clock; the texture is built once
// when the house is built (a few thousand pixels of work). Everything reads the plan; nothing is new
// art: no new sounds, no new word-set entries.

import * as THREE from 'three';
import { litMaterial } from '../render/materials.js';
import {
  WALL_T, WALL_H, LAWN_Y, DOOR_H, HOUSE_LEVELS, HOUSE_ROOMS, HOUSE_STAIRS, HOUSE_FURNITURE, HOUSE_DOORWAYS, HOUSE_WINDOWS,
} from './houseplan.js';
import {
  HOUSE_ATLAS_CELLS as C, atlasRgb, ATLAS_PATTERN_PX, HOUSE_DECOR, HOUSE_FLOOR_CELL, HOUSE_WAIN, HOUSE_DADO_Y, HOUSE_WAIN_TILE, HOUSE_WAIN_TILES, houseCellTile,
} from './houseparts.js';

const PX_M = 32; // texture pixels to the metre
const HALF = WALL_T / 2;
const BRICK_M = [0.9, 0.6]; // metres of wall one brick cell covers (houseparts.js BRICK_TILE)
const BOX_PIECES = 5; // the tallest pieces of a room drawn as boxes
const levelY = (id) => HOUSE_LEVELS.find((l) => l.id === id).y;
const hexRgb = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];

// who owns a shared wall; the wall's other face wears the neighbour's look. `skip`: the room does not draw it
const SKIP = { 'livingroom:w': true, 'solarium:w': true, 'bath:s': true };
const SHARE = { 'livingroom:e': [{ room: 'solarium', lo: -Infinity, hi: Infinity }], 'kids:n': [{ room: 'bath', lo: 38.3, hi: 44.1 }] };

// What a floor piece looks like from above (a flat colour with a darker edge), by kind.
const KIND_LOOK = {
  sofa: 0x7f9a7a, sofaback: 0x6f8a6c, bookcase: 0x5b3a26, coffeetable: 0x6b4a32, fishtank: 0x6f9fb0, plant: 0x4f8a4f, basket: 0xc9a46a,
  wickerchair: 0xc9a46a, sidetable: 0x8a6a4a, birdbath: 0x9a9a92, bunklow: 0xe8e1d0, bunktop: 0xd8cdb0, kidbed: 0xe6dfd0, desk: 0x7a5236, chair: 0xb88a52,
  chest: 0x8a5a3a, fort: 0xa8483f, tub: 0xf0f0ec, washbasin: 0xf0f0ec, toilet: 0xf0f0ec, laundrybasket: 0xc9a46a, cushion: 0xc98d84,
};
const looks = (f) => KIND_LOOK[f.kind] ?? 0x8a6a4a;
const shade = (rgb, k) => [rgb[0] * k, rgb[1] * k, rgb[2] * k];

// ---- the texture's pixel store ----

class Canvas {
  constructor(w, h) {
    this.w = w; this.h = h; this.data = new Uint8Array(w * h * 4);
    for (let i = 3; i < this.data.length; i += 4) this.data[i] = 255;
  }

  set(x, y, rgb) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    this.data[i] = rgb[0]; this.data[i + 1] = rgb[1]; this.data[i + 2] = rgb[2];
  }

  texture(name) {
    const t = new THREE.DataTexture(this.data, this.w, this.h, THREE.RGBAFormat);
    t.name = name;
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.needsUpdate = true;
    return t;
  }
}

// Shelf-packs rects (width, height) into the smallest of a few power-of-two sheets; returns the sheet and each rect's origin.
function pack(sizes) {
  for (const [W, H] of [[256, 256], [512, 256], [512, 512], [1024, 512], [1024, 1024]]) {
    const order = sizes.map((s, i) => ({ ...s, i })).sort((a, b) => b.h - a.h);
    const at = new Array(sizes.length);
    let x = 0, y = 0, rowH = 0, ok = true;
    for (const s of order) {
      if (x + s.w > W) { x = 0; y += rowH; rowH = 0; }
      if (s.w > W || y + s.h > H) { ok = false; break; }
      at[s.i] = { x, y };
      x += s.w; rowH = Math.max(rowH, s.h);
    }
    if (ok) return { W, H, at };
  }
  throw new Error('the far look does not fit its sheet');
}

// ---- what a zone draws ----

function sideSpec(room, side) {
  if (side === 'n') return { run: 'x', line: room.minZ, a0: room.minX, a1: room.maxX, inner: 1 };
  if (side === 's') return { run: 'x', line: room.maxZ, a0: room.minX, a1: room.maxX, inner: -1 };
  if (side === 'w') return { run: 'z', line: room.minX, a0: room.minZ, a1: room.maxZ, inner: 1 };
  return { run: 'z', line: room.maxX, a0: room.minZ, a1: room.maxZ, inner: -1 };
}

// The openings in one wall: doorways and the stair's mouths, [{ a0, a1, h }] along the wall.
function openingsOf(spec, stairs) {
  const out = [];
  for (const d of HOUSE_DOORWAYS) {
    const lineAt = d.axis === 'x' ? d.x : d.z; // the doorway stands on the wall x = d.x (axis x) or z = d.z (axis z)
    const along = d.axis === 'x' ? d.z : d.x;
    if (Math.abs(lineAt - spec.line) > 1e-6 || (spec.run === 'z') !== (d.axis === 'x')) continue;
    out.push({ a0: along - d.width / 2, a1: along + d.width / 2, h: DOOR_H });
  }
  for (const st of stairs) {
    for (const [lineAt, along] of [[st.x0, st.z0], [st.x1, st.z1]]) {
      if (spec.run === 'z' && Math.abs(lineAt - spec.line) < 1e-6) out.push({ a0: along - st.width / 2, a1: along + st.width / 2, h: DOOR_H });
    }
  }
  return out.filter((o) => o.a1 > spec.a0 && o.a0 < spec.a1).sort((p, q) => p.a0 - q.a0);
}

// ---- the builder ----

export function wingFarMesh(zoneId, atlas) {
  const rooms = HOUSE_ROOMS.filter((r) => r.zone === zoneId);
  const stairs = HOUSE_STAIRS.filter((st) => st.id === 'wing' && zoneId === 'sun');
  const tmp = [0, 0, 0];

  // 1. what wants a piece of the sheet: floors, wall strips (one per face that wears a room's paper), a window, a stair's top, the swatches
  const need = [];
  const want = (key, w, h) => { need.push({ key, w: Math.max(8, Math.ceil(w)), h: Math.max(8, Math.ceil(h)) }); };
  const faces = []; // { room, side, spec, strips: [{ look room id, a0, a1 }] }
  for (const room of rooms) {
    want(`floor:${room.id}`, (room.maxX - room.minX) * PX_M, (room.maxZ - room.minZ) * PX_M);
    for (const side of ['n', 's', 'w', 'e']) {
      if (SKIP[`${room.id}:${side}`]) continue;
      const spec = sideSpec(room, side);
      const f = { room, side, spec, strips: [{ look: room.id, a0: spec.a0, a1: spec.a1, face: 'in' }] };
      for (const sh of SHARE[`${room.id}:${side}`] ?? []) {
        const nb = HOUSE_ROOMS.find((r) => r.id === sh.room);
        const nbSide = { n: 's', s: 'n', w: 'e', e: 'w' }[side];
        const ns = sideSpec(nb, nbSide);
        f.strips.push({ look: nb.id, a0: Math.max(ns.a0, sh.lo), a1: Math.min(ns.a1, sh.hi), face: 'out', side: nbSide });
      }
      for (const s of f.strips) want(`strip:${room.id}:${side}:${s.look}`, (s.a1 - s.a0) * PX_M, WALL_H * PX_M);
      faces.push(f);
    }
  }
  const windows = HOUSE_WINDOWS.filter((w) => rooms.some((r) => r.id === w.room));
  want('window', 64, 64);
  for (const st of stairs) want('stair', Math.abs(st.x1 - st.x0) * PX_M, st.width * PX_M);
  // swatches: one flat colour each, 8 px, for the caps, the boxes, the stair's side
  const swatches = new Map();
  const swatch = (hex) => { if (!swatches.has(hex)) { swatches.set(hex, null); want(`sw:${hex}`, 8, 8); } return hex; };
  swatch(0x6b4a32); // the caps
  const boxes = [];
  for (const room of rooms) {
    const list = HOUSE_FURNITURE.filter((f) => f.room === room.id && (f.r > 0 || f.ledge) && f.h * 0.9 >= 0.5).sort((a, b) => b.h - a.h || (a.id < b.id ? -1 : 1)).slice(0, BOX_PIECES);
    for (const f of list) { boxes.push(f); swatch(looks(f)); }
  }
  const sheet = pack(need);
  const rect = new Map();
  need.forEach((n, i) => rect.set(n.key, { x: sheet.at[i].x, y: sheet.at[i].y, w: n.w, h: n.h }));
  const cv = new Canvas(sheet.W, sheet.H);

  // 2. paint
  const rgb = [0, 0, 0];
  const fillRect = (r, fn) => { for (let py = 0; py < r.h; py++) for (let px = 0; px < r.w; px++) cv.set(r.x + px, r.y + py, fn(px, py)); };
  const cellAt = (cell, x, y, tile) => { atlasRgb(atlas, cell, (x / tile[0]) * ATLAS_PATTERN_PX, (y / tile[1]) * ATLAS_PATTERN_PX, rgb); return [rgb[0], rgb[1], rgb[2]]; };
  for (const [hex] of swatches) fillRect(rect.get(`sw:${hex}`), () => hexRgb(hex));

  // the floor of each room: its boards or tiles, then the rugs and the footprints (a rotated rect each)
  for (const room of rooms) {
    const r = rect.get(`floor:${room.id}`);
    const cell = C[HOUSE_FLOOR_CELL[room.id] ?? 'oak'];
    const tile = houseCellTile(cell);
    const pieces = HOUSE_FURNITURE.filter((f) => f.room === room.id && f.kind !== 'rug').sort((a, b) => b.h - a.h); // the tallest paints first-hit
    const rugs = HOUSE_FURNITURE.filter((f) => f.room === room.id && f.kind === 'rug');
    fillRect(r, (px, py) => {
      const x = room.minX + (px + 0.5) / PX_M;
      const z = room.minZ + (py + 0.5) / PX_M;
      for (const g of rugs) {
        const lx = x - g.x, lz = z - g.z;
        if (Math.abs(lx) <= g.w / 2 && Math.abs(lz) <= g.d / 2) return cellAt(C[g.look ?? 'rugRed'], lx + g.w / 2, lz + g.d / 2, [g.w, g.d]);
      }
      for (const g of pieces) {
        const dx = x - g.x, dz = z - g.z;
        const c = Math.cos(g.rotY), s = Math.sin(g.rotY);
        const lx = dx * c - dz * s, lz = dx * s + dz * c; // into the piece's frame
        const hw = g.w / 2, hd = g.d / 2;
        if (Math.abs(lx) <= hw && Math.abs(lz) <= hd) {
          const base = hexRgb(looks(g));
          const edge = Math.min(hw - Math.abs(lx), hd - Math.abs(lz)) < 1.5 / PX_M;
          return edge ? shade(base, 0.62) : base;
        }
      }
      return cellAt(cell, x - room.minX, z - room.minZ, tile);
    });
  }

  // a wall's inside: paper over wainscot, skirting, dado rail, cornice, then windows, curtains, pictures, sconces
  const WAIN_FOR = (room) => HOUSE_WAIN[room];
  const paintStrip = (room, side, strip) => {
    const r = rect.get(`strip:${room.id}:${side}:${strip.look}`);
    const look = HOUSE_ROOMS.find((q) => q.id === strip.look);
    const paper = C[look.id];
    const wain = WAIN_FOR(look.id);
    const wTile = HOUSE_WAIN_TILES[look.id] ?? HOUSE_WAIN_TILE;
    const lookSide = strip.face === 'out' ? strip.side : side;
    const a = (px) => strip.a0 + (px + 0.5) / PX_M;
    const px_ = (u) => Math.round((u - strip.a0) * PX_M);
    fillRect(r, (px, py) => {
      const y = (py + 0.5) / PX_M;
      const u = a(px);
      if (y < 0.14) return hexRgb(0x5a3d28); // the skirting
      if (y > HOUSE_DADO_Y && y < HOUSE_DADO_Y + 0.05) return hexRgb(0xd9b98a); // the dado rail
      if (y > WALL_H - 0.12) return hexRgb(0xeee6d2); // the cornice
      if (wain && y < HOUSE_DADO_Y) return cellAt(C[wain], u, y, wTile);
      return cellAt(paper, u, y, houseCellTile(paper));
    });
    // paints a rect of the strip (metres along the wall and up it); fn(fu, fv, px, py): the share across and up it, and the strip pixel
    const box = (u0, u1, y0, y1, fn) => {
      const xa = px_(u0), wpx = Math.max(1, px_(u1) - xa), ya = Math.round(y0 * PX_M), hpx = Math.max(1, Math.round(y1 * PX_M) - ya);
      for (let py = Math.max(0, ya); py < Math.min(r.h, ya + hpx); py++) {
        for (let pxx = Math.max(0, xa); pxx < Math.min(r.w, xa + wpx); pxx++) cv.set(r.x + pxx, r.y + py, fn((pxx - xa + 0.5) / wpx, (py - ya + 0.5) / hpx, pxx, py));
      }
    };
    // the viewer's right is +a on the north and east walls, -a on the south and west (houseparts.js artFace)
    const rightIsPlus = lookSide === 'n' || lookSide === 'e';
    const picture = (u0, u1, y0, y1, cell, rim) => {
      box(u0, u1, y0, y1, () => hexRgb(rim));
      box(u0 + 0.05, u1 - 0.05, y0 + 0.05, y1 - 0.05, (fu, fv) => { atlasRgb(atlas, cell, (rightIsPlus ? fu : 1 - fu) * (ATLAS_PATTERN_PX - 1), (1 - fv) * (ATLAS_PATTERN_PX - 1), rgb); return [rgb[0], rgb[1], rgb[2]]; });
    };
    const lw = HOUSE_WINDOWS.filter((w) => w.room === look.id && w.side === lookSide);
    for (const w of lw) {
      const u0 = w.at - w.width / 2, u1 = w.at + w.width / 2;
      box(u0, u1, w.sill, w.head, (fu, fv, pxx, py) => {
        const edge = Math.min(pxx - px_(u0), px_(u1) - 1 - pxx, py - Math.round(w.sill * PX_M), Math.round(w.head * PX_M) - 1 - py);
        if (edge < 2) return hexRgb(0xf2ead8);
        if (Math.abs(fu - 0.5) < 0.012 || Math.abs(fv - 0.5) < 0.012) return hexRgb(0xf2ead8);
        return shade(hexRgb(0xcfe3ee), 1.04 - 0.12 * (1 - fv));
      });
    }
    for (const d of HOUSE_DECOR) {
      if (d.room !== look.id || d.side !== lookSide || d.at < strip.a0 || d.at > strip.a1) continue;
      if (d.kind === 'frame') picture(d.at - d.w / 2, d.at + d.w / 2, d.y - d.h / 2, d.y + d.h / 2, C[d.look], d.look === 'art2' || d.look === 'art4' ? 0xb08d3c : 0x5a3d28);
      else if (d.kind === 'mirror') picture(d.at - d.w / 2, d.at + d.w / 2, d.y - d.h / 2, d.y + d.h / 2, C.mirror, 0xb08d3c);
      else if (d.kind === 'clock') picture(d.at - d.w / 2, d.at + d.w / 2, d.y - d.w / 2, d.y + d.w / 2, C.clockface, 0x5a3d28);
      else if (d.kind === 'sconce') { box(d.at - 0.05, d.at + 0.05, d.y - 0.12, d.y + 0.1, () => hexRgb(0xb08d3c)); box(d.at - 0.025, d.at + 0.025, d.y + 0.1, d.y + 0.17, () => hexRgb(0xffd27a)); }
      else if (d.kind === 'curtains') {
        const w = lw.find((q) => Math.abs(q.at - d.at) < 1e-6);
        if (!w) continue;
        const u0 = w.at - w.width / 2, u1 = w.at + w.width / 2, top = w.head + 0.2, bot = d.y || 0.05;
        const cur = (pa, pb) => box(pa, pb, bot, top, (fu, fv, pxx, py) => cellAt(C[d.look], (pxx - px_(pa)) / PX_M, py / PX_M, [0.4, 0.4]));
        cur(u0 - 0.5, u0 - 0.08); cur(u1 + 0.08, u1 + 0.5);
        box(u0 - 0.5, u1 + 0.5, top, top + 0.15, (fu, fv, pxx, py) => cellAt(C[d.look], (pxx - px_(u0 - 0.5)) / PX_M, py / PX_M, [0.4, 0.4]));
      }
    }
  };
  for (const f of faces) for (const s of f.strips) paintStrip(f.room, f.side, s);

  // one framed pane, stretched on every window's outside
  fillRect(rect.get('window'), (px, py) => {
    const fu = (px + 0.5) / 64, fv = (py + 0.5) / 64;
    if (Math.min(px, py, 63 - px, 63 - py) < 4) return hexRgb(0xf2ead8);
    if (Math.abs(fu - 0.5) < 0.025 || Math.abs(fv - 0.5) < 0.025) return hexRgb(0xf2ead8);
    return shade(hexRgb(0xcfe3ee), 1.04 - 0.12 * (1 - fv));
  });
  for (const st of stairs) {
    const r = rect.get('stair');
    fillRect(r, (px, py) => {
      const x = (px + 0.5) / PX_M, z = (py + 0.5) / PX_M;
      if (Math.abs(x % 0.34) < 0.025) return [150, 110, 70]; // the steps' edges
      return cellAt(C.oak, x, z, houseCellTile(C.oak));
    });
  }

  // 3. the geometry: one quad at a time, into the sheet's group (0) or the brick's (1)
  const G = [{ pos: [], nor: [], uv: [], idx: [] }, { pos: [], nor: [], uv: [], idx: [] }];
  const quad = (g, p, uv, n) => {
    const a = G[g];
    const e1 = [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]];
    const e2 = [p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]];
    const cx = e1[1] * e2[2] - e1[2] * e2[1], cy = e1[2] * e2[0] - e1[0] * e2[2], cz = e1[0] * e2[1] - e1[1] * e2[0];
    const flip = cx * n[0] + cy * n[1] + cz * n[2] < 0;
    const base = a.pos.length / 3;
    for (let i = 0; i < 4; i++) { a.pos.push(...p[i]); a.nor.push(...n); a.uv.push(...uv[i]); }
    a.idx.push(...(flip ? [base, base + 2, base + 1, base, base + 3, base + 2] : [base, base + 1, base + 2, base, base + 2, base + 3]));
  };
  const uvIn = (r, u, v) => [(r.x + u) / sheet.W, (r.y + v) / sheet.H]; // u, v in pixels of region r
  const flat = (hex) => { const r = rect.get(`sw:${hex}`); return uvIn(r, 4, 4); };

  for (const room of rooms) {
    const y = levelY(room.level);
    const fy = y + 0.01;
    // the floor
    const r = rect.get(`floor:${room.id}`);
    const fp = [[room.minX, fy, room.minZ], [room.maxX, fy, room.minZ], [room.maxX, fy, room.maxZ], [room.minX, fy, room.maxZ]];
    quad(0, fp, fp.map(([x, , z]) => uvIn(r, (x - room.minX) * PX_M, (z - room.minZ) * PX_M)), [0, 1, 0]);
  }
  for (const f of faces) {
    const { room, side, spec } = f;
    const y = levelY(room.level);
    const top = y + WALL_H;
    const pt = (a, yy, c) => (spec.run === 'x' ? [a, yy, c] : [c, yy, a]);
    const cIn = spec.line + spec.inner * HALF;
    const cOut = spec.line - spec.inner * HALF;
    const nIn = spec.run === 'x' ? [0, 0, spec.inner] : [spec.inner, 0, 0];
    const nOut = nIn.map((v) => -v);
    const opens = openingsOf(spec, stairs);
    // the pieces of a face over [lo, hi]: the solid runs between the openings, then each opening's lintel
    const pieces = (lo, hi, yTop) => {
      const out = [];
      let cur = lo;
      for (const o of opens) {
        if (o.a1 <= lo || o.a0 >= hi) continue;
        if (o.a0 > cur) out.push({ a0: cur, a1: o.a0, y1: yTop });
        out.push({ a0: Math.max(o.a0, lo), a1: Math.min(o.a1, hi), y0: o.h, y1: yTop });
        cur = Math.min(o.a1, hi);
      }
      if (cur < hi) out.push({ a0: cur, a1: hi, y1: yTop });
      return out;
    };
    // inside: the paper strip
    for (const strip of f.strips) {
      const sr = rect.get(`strip:${room.id}:${side}:${strip.look}`);
      const isIn = strip.face === 'in';
      const c = isIn ? cIn : cOut;
      const n = isIn ? nIn : nOut;
      const lo = isIn ? spec.a0 + HALF : strip.a0 - HALF;
      const hi = isIn ? spec.a1 - HALF : strip.a1 + HALF;
      for (const p of pieces(lo, hi, top)) {
        const y0 = y + (p.y0 ?? 0), y1 = p.y1;
        const pts = [[p.a0, y0, c], [p.a1, y0, c], [p.a1, y1, c], [p.a0, y1, c]].map(([a, yy, cc]) => pt(a, yy, cc));
        const uvs = [[p.a0, y0], [p.a1, y0], [p.a1, y1], [p.a0, y1]].map(([a, yy]) => uvIn(sr, (Math.min(Math.max(a, strip.a0), strip.a1) - strip.a0) * PX_M, Math.min(WALL_H, yy - y) * PX_M));
        quad(0, pts, uvs, n);
      }
    }
    // outside: brick, over the stretches the neighbour's paper does not cover
    const covered = f.strips.filter((s) => s.face === 'out');
    const spans = [];
    let cur = spec.a0 - HALF;
    for (const s of covered.sort((p, q) => p.a0 - q.a0)) { if (s.a0 - HALF > cur) spans.push([cur, s.a0 - HALF]); cur = s.a1 + HALF; }
    if (cur < spec.a1 + HALF) spans.push([cur, spec.a1 + HALF]);
    const lawn = LAWN_Y;
    for (const [lo, hi] of spans) {
      for (const p of pieces(lo, hi, top)) {
        const y0 = p.y0 !== undefined ? y + p.y0 : lawn;
        const pts = [[p.a0, y0, cOut], [p.a1, y0, cOut], [p.a1, p.y1, cOut], [p.a0, p.y1, cOut]].map(([a, yy, cc]) => pt(a, yy, cc));
        quad(1, pts, pts.map(([x, yy, z]) => [(spec.run === 'x' ? x : z) / BRICK_M[0], yy / BRICK_M[1]]), nOut);
      }
    }
    // the cap, over the whole wall
    const cap = flat(0x6b4a32);
    const cp = [[spec.a0 - HALF, top, cOut], [spec.a1 + HALF, top, cOut], [spec.a1 + HALF, top, cIn], [spec.a0 - HALF, top, cIn]].map(([a, yy, cc]) => pt(a, yy, cc));
    quad(0, cp, cp.map(() => cap), [0, 1, 0]);
    // the windows' panes, on the outside of a wall that faces the lawn
    if (covered.length === 0) {
      for (const w of windows.filter((q) => q.room === room.id && q.side === side)) {
        const wr = rect.get('window');
        const o = cOut - spec.inner * 0.012;
        const wp = [[w.at - w.width / 2, y + w.sill, o], [w.at + w.width / 2, y + w.sill, o], [w.at + w.width / 2, y + w.head, o], [w.at - w.width / 2, y + w.head, o]].map(([a, yy, cc]) => pt(a, yy, cc));
        quad(0, wp, [[0, 0], [64, 0], [64, 64], [0, 64]].map(([u, v]) => uvIn(wr, u, v)), nOut);
      }
    }
  }
  // boxes: the tallest pieces, 0.9 of their height, as the old levels' stand-ins draw theirs
  for (const f of boxes) {
    const y = levelY(HOUSE_ROOMS.find((r) => r.id === f.room).level);
    const hh = 0.9 * f.h;
    const c = Math.cos(f.rotY), s = Math.sin(f.rotY);
    const corner = (sx, sz) => [f.x + sx * f.w / 2 * c + sz * f.d / 2 * s, f.z - sx * f.w / 2 * s + sz * f.d / 2 * c];
    const cs = [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)];
    const uv = flat(looks(f));
    for (let i = 0; i < 4; i++) {
      const [x0, z0] = cs[i], [x1, z1] = cs[(i + 1) % 4];
      const nx = z1 - z0, nz = x0 - x1, len = Math.hypot(nx, nz) || 1;
      quad(0, [[x0, y, z0], [x1, y, z1], [x1, y + hh, z1], [x0, y + hh, z0]], [uv, uv, uv, uv], [nx / len, 0, nz / len]);
    }
    quad(0, cs.map(([x, z]) => [x, y + hh, z]), [uv, uv, uv, uv], [0, 1, 0]);
  }
  // the stair: a plank ramp on a brick base (its foot at the lawn has no height, its head is against the kids' wall)
  for (const st of stairs) {
    const za = st.z0 - st.width / 2, zb = st.z0 + st.width / 2;
    const y0 = levelY(st.from), y1 = levelY(st.to);
    const sr = rect.get('stair');
    const tp = [[st.x0, y0, za], [st.x1, y1, za], [st.x1, y1, zb], [st.x0, y0, zb]];
    const slope = Math.hypot(st.x1 - st.x0, y1 - y0);
    quad(0, tp, [[0, 0], [sr.w, 0], [sr.w, sr.h], [0, sr.h]].map(([u, v]) => uvIn(sr, u, v)), [-(y1 - y0) / slope, (st.x1 - st.x0) / slope, 0]);
    for (const [z, nz] of [[za, -1], [zb, 1]]) {
      const sp = [[st.x0, LAWN_Y, z], [st.x1, LAWN_Y, z], [st.x1, y1, z], [st.x0, y0, z]];
      quad(1, sp, sp.map(([x, yy]) => [x / BRICK_M[0], yy / BRICK_M[1]]), [0, 0, nz]);
    }
  }

  // 4. one mesh, two materials (the sheet, then the brick)
  const geo = new THREE.BufferGeometry();
  const pos = [], nor = [], uv = [], idx = [];
  G.forEach((g, gi) => {
    const base = pos.length / 3;
    const start = idx.length;
    pos.push(...g.pos); nor.push(...g.nor); uv.push(...g.uv);
    for (const i of g.idx) idx.push(base + i);
    geo.addGroup(start, g.idx.length, gi);
  });
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);

  const brick = new Canvas(ATLAS_PATTERN_PX, ATLAS_PATTERN_PX);
  for (let y = 0; y < ATLAS_PATTERN_PX; y++) for (let x = 0; x < ATLAS_PATTERN_PX; x++) brick.set(x, y, atlasRgb(atlas, C.brick, x, y, rgb));
  const brickTex = brick.texture('houseWingBrick');
  brickTex.wrapS = brickTex.wrapT = THREE.RepeatWrapping;
  const m = new THREE.Mesh(geo, [litMaterial(0xffffff, { map: cv.texture(`houseWingFar:${zoneId}`) }), litMaterial(0xffffff, { map: brickTex })]);
  m.castShadow = false;
  m.receiveShadow = true;
  m.userData.noCast = true;
  m.userData.noContactShadow = true; // the contact-shadow scan would put a blob under the whole box (a black blotch on the floor)
  m.userData.houseSimple = zoneId;
  m.name = `houseStandIn:${zoneId}`;
  return m;
}
