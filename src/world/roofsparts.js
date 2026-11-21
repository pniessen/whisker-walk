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
// The take-off marks (follow-up 2, the owner's "calmer take-off marks"): a
// soft glow at every take-off, and a small piece lying flush at the roof's
// edge only where no real thing shows the spot (the hop's `prop`, roofsplan.js
// DRAWN_MARKS). Never a loose brick.
// ---------------------------------------------------------------------------

// The glow: a disc 0.45 m across the take-off (it was 0.7), added warm light
// at 0.28 at its middle fading to nothing at its rim (it was 0.35 all over),
// so a row of extensions is not dotted and a spot still shows at dusk.
export const MARK_GLOW = Object.freeze({ radius: 0.45, opacity: 0.28, color: 0xffd9a0 });
const GLOW_PX = 32;
let glowCache = null;
function glowParts() {
  if (!glowCache) {
    const geometry = new THREE.CircleGeometry(MARK_GLOW.radius, 20);
    geometry.rotateX(-Math.PI / 2);
    // white, its alpha falling smoothly from the middle to 0 at the disc's rim
    // (the disc's uv spans 0..1 across it)
    const data = new Uint8Array(GLOW_PX * GLOW_PX * 4);
    for (let j = 0; j < GLOW_PX; j++) {
      for (let i = 0; i < GLOW_PX; i++) {
        const d = Math.min(1, Math.hypot((i + 0.5) / GLOW_PX - 0.5, (j + 0.5) / GLOW_PX - 0.5) / 0.47);
        const k = (j * GLOW_PX + i) * 4;
        data[k] = data[k + 1] = data[k + 2] = 255;
        data[k + 3] = Math.round(255 * (1 - d * d * (3 - 2 * d)));
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
