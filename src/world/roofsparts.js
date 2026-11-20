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

export const ATLAS_SIZE = 64;
export const ATLAS_CELLS = 16;
const CELL_PX = 16;

// Cells 0-7 lit warm (curtain shades), 8-10 lit cool (a TV's blue), 11-15 dark
// or curtained. Pane colours, then the frame.
const WARM = [0xffc766, 0xffb347, 0xffd98a, 0xf2a65a, 0xffe0a8, 0xe8924a, 0xffcf80, 0xd9843a];
const COOL = [0x6fa8ff, 0x8fc0ff, 0x5a8fe0];
const DARK = [0x1d2230, 0x2a2d3a, 0x3a2a30, 0x242a2a, 0x33303a];
const FRAME = 0xd8d0c0;

function paneColor(cell) {
  const hex = cell < 8 ? WARM[cell] : cell < 11 ? COOL[cell - 8] : DARK[cell - 11];
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
}

// A DataTexture, 64 x 64 RGBA: the same pixels every call. Each 16 px cell has
// a frame and glazing bars; the pane inside is the cell's colour. Curtained
// cells (13-15) have a curtain edge down one side.
export function createWindowAtlas() {
  const data = new Uint8Array(ATLAS_SIZE * ATLAS_SIZE * 4);
  const frame = [(FRAME >> 16) & 255, (FRAME >> 8) & 255, FRAME & 255];
  for (let cell = 0; cell < ATLAS_CELLS; cell++) {
    const ox = (cell % 4) * CELL_PX;
    const oy = Math.floor(cell / 4) * CELL_PX;
    const pane = paneColor(cell);
    const lit = cell <= 10;
    for (let y = 0; y < CELL_PX; y++) {
      for (let x = 0; x < CELL_PX; x++) {
        const edge = x < 2 || y < 2 || x >= CELL_PX - 2 || y >= CELL_PX - 2;
        const bar = x === 7 || x === 8 || y === 7 || y === 8;
        let rgb = pane;
        if (edge || bar) rgb = lit ? frame.map((c) => Math.round(c * 0.35)) : frame.map((c) => Math.round(c * 0.5));
        else if (cell >= 13 && x < 5) rgb = pane.map((c) => Math.min(255, c + 30));
        else if (lit) {
          // a soft falloff toward the frame
          const d = Math.min(x - 2, y - 2, CELL_PX - 3 - x, CELL_PX - 3 - y);
          const k = 0.8 + 0.05 * Math.min(d, 4);
          rgb = pane.map((c) => Math.round(c * k));
        }
        const i = ((oy + y) * ATLAS_SIZE + ox + x) * 4;
        data[i] = rgb[0]; data[i + 1] = rgb[1]; data[i + 2] = rgb[2]; data[i + 3] = 255;
      }
    }
  }
  const texture = new THREE.DataTexture(data, ATLAS_SIZE, ATLAS_SIZE, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return { texture, size: ATLAS_SIZE, cells: ATLAS_CELLS };
}

// Which cell the window at (x, z), number i, shows: four in five are lit
// (cells 0-10, warm three times in four), the rest dark or curtained.
export function windowCell(x, z, i) {
  const h = hash01(x, z, i * 3 + 1);
  const g = hash01(x, z, i * 3 + 2);
  if (h < 0.8) {
    const k = h / 0.8;
    return k < 0.72 ? Math.min(7, Math.floor(g * 8)) : 8 + Math.min(2, Math.floor(g * 3));
  }
  return 11 + Math.min(4, Math.floor(g * 5));
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
// The take-off marks.
// ---------------------------------------------------------------------------
let glowCache = null;
function glowParts() {
  if (!glowCache) {
    const geometry = new THREE.CircleGeometry(0.7, 16);
    geometry.rotateX(-Math.PI / 2);
    const material = new THREE.MeshBasicMaterial({
      color: 0xffd9a0, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    glowCache = { geometry, material };
  }
  return glowCache;
}
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
// leaps or drops (toward hop.to), y up from the take-off surface.
const MARKS = {
  lip: (P, M) => [piece(P.box, M.brick, 0, 0.06, 0, 1.2, 0.12, 0.3), piece(P.box, M.brick, -0.35, 0.14, 0.02, 0.2, 0.08, 0.2, 0.4), piece(P.box, M.render, 0.3, 0.13, -0.02, 0.15, 0.06, 0.2, -0.3)],
  stub: (P, M) => [piece(P.plank, M.wood, 0, 0.04, 0.15, 0.7, 1, 1), piece(P.plank, M.wood, 0.1, 0.09, 0.3, 0.5, 1, 1, 0.2)],
  bags: (P, M) => [piece(P.box, M.slate, -0.2, 0.18, 0, 0.45, 0.35, 0.4, 0.3), piece(P.box, M.slate, 0.25, 0.15, 0.05, 0.4, 0.3, 0.38, -0.4)],
  gutter: (P, M) => [piece(P.gutter, M.metal, 0, 0.05, 0, 1.2, 0.3, 0.3), piece(P.box, M.metal, -0.62, 0.06, 0, 0.04, 0.2, 0.3)],
  wall: (P, M) => [piece(P.box, M.brick, 0, 0.2, 0, 1.4, 0.4, 0.25), piece(P.coping, M.render, 0, 0.42, 0, 1.4, 1, 0.7)],
  skylight: (P, M) => [piece(P.box, M.wood, 0, 0.08, 0, 1.1, 0.16, 0.8), piece(P.box, M.glass, 0, 0.17, 0, 0.9, 0.04, 0.6)],
  bunker: (P, M) => [piece(P.box, M.metal, 0, 0.15, 0, 1.0, 0.3, 0.8), piece(P.box, M.slate, 0, 0.32, 0, 1.05, 0.05, 0.85)],
  bin: (P, M) => [piece(P.pot, M.metal, 0, 0, 0, 0.55, 0.6, 0.55), piece(P.pot, M.metal, 0, 0.6, 0, 0.6, 0.05, 0.6)],
  crate: (P, M) => [piece(P.box, M.wood, -0.15, 0.2, 0, 0.45, 0.4, 0.45, 0.2), piece(P.box, M.wood, 0.3, 0.15, 0.1, 0.35, 0.3, 0.35, -0.3)],
  pipe: (P, M) => [piece(P.box, M.metal, 0, 0.5, -0.05, 0.12, 1, 0.12), piece(P.box, M.metal, 0, 0.9, 0.06, 0.24, 0.05, 0.24)],
  sill: (P, M) => [piece(P.box, M.render, 0, 0.05, 0, 1.0, 0.1, 0.3), piece(P.box, M.brick, 0, 0.12, -0.08, 0.9, 0.05, 0.15)],
};

// A mark at a hop's take-off. `hop` has `mark`, `from` {x, z, y?} and `to`
// {x, z} (or flat x0, z0, y0, x1, z1); the y of the take-off is from.y, else
// hop.y0 / hop.y, else 0, so the caller may add it. `mats` defaults to a kept
// set made on first use. Returns a Group: the pieces and one glow disc.
export function markMesh(kind, hop, mats) {
  const build = MARKS[kind];
  if (!build) throw new Error(`roofsparts: no mark called ${kind}`);
  const P = parts();
  const M = mats ?? defaultMats();
  const fx = hop.from?.x ?? hop.x0 ?? 0;
  const fz = hop.from?.z ?? hop.z0 ?? 0;
  const fy = hop.from?.y ?? hop.y0 ?? hop.y ?? 0;
  const tx = hop.to?.x ?? hop.x1 ?? fx;
  const tz = hop.to?.z ?? hop.z1 ?? fz + 1;
  const g = new THREE.Group();
  g.name = `mark-${kind}`;
  g.position.set(fx, fy, fz);
  g.rotation.y = Math.atan2(tx - fx, tz - fz);
  for (const m of build(P, M)) g.add(m);
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
