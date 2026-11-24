// =============================================================================
// LIGHTHOUSE POINT: THE DRAWING KIT (milestone 1). Plain vertex-coloured shapes gathered by
// material into a few merged meshes: the headland's cliffs, the tower, the cottage and its
// garden, the cave, the pools and the beach. No real lights, no canvas, no Math.random: every
// number comes from the tables here and builder.js's hash01 (the area builds in
// withLocalUuids). lighthouse.js assembles these into the area record.
// =============================================================================

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { litMaterial, tileMetres } from '../render/materials.js';
import { hash01 } from './builder.js';
import * as P from './lighthouseplan.js';

// A golden-hour palette. The colours are authored for the evening look (a warm low sun), so
// they run a little cooler and greyer than they should read.
export const COL = Object.freeze({
  sand: 0xdbc59a, wet: 0xb9a37e, shelf: 0x8a8880, shelfWet: 0x6f7570,
  rock: Object.freeze([0xad9e86, 0x94836e, 0xb9a88e, 0x8a7a6b, 0x9c7458]),
  grass: Object.freeze([0x7d9a52, 0x88a35a, 0x6f8c4a, 0x93a85f]),
  earth: 0xc0a57a, post: 0x6e5236, rope: 0xd8c9a0, white: 0xf2eee4, red: 0xc2402f, slate: 0x4d5762,
  plaster: 0xd9ceb4, stone: 0xb7ad99, dark: 0x2a211b, warm: 0xffc878, glass: 0x35465a, brass: 0xc9a043,
  water: 0x5fb6c4, deep: 0x3e8fa6, hull: 0x2f5f8a, hullTop: 0xc6523c,
});

// -----------------------------------------------------------------------------
// Pieces: a painted, non-indexed geometry (position, normal, uv, color) so any two merge.
// -----------------------------------------------------------------------------

const _c = new THREE.Color();
export function paint(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  if (!g.attributes.normal) g.computeVertexNormals();
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  _c.setHex(hex);
  for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

// Colour a geometry vertex by vertex: fn(x, y, z, nx, ny, nz) -> hex.
export function paintBy(geo, fn) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  if (!g.attributes.normal) g.computeVertexNormals();
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    _c.setHex(fn(pos.getX(i), pos.getY(i), pos.getZ(i), nor.getX(i), nor.getY(i), nor.getZ(i)));
    col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

export const bx = (x0, x1, y0, y1, z0, z1, hex) => {
  const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return paint(g, hex);
};
export const cy = (x, z, y0, y1, r0, r1, hex, seg = 12) => {
  const g = new THREE.CylinderGeometry(r1, r0, y1 - y0, seg);
  g.translate(x, (y0 + y1) / 2, z);
  return paint(g, hex);
};
export const sp = (x, y, z, r, hex, { sx = 1, sy = 1, sz = 1, seg = 8, rings = 6 } = {}) => {
  const g = new THREE.SphereGeometry(r, seg, rings);
  g.scale(sx, sy, sz);
  g.translate(x, y, z);
  return paint(g, hex);
};
// A box from a to b, `w` wide and `h` high, its length along the line.
// (made on first use, inside the build's own uuid stream: an Object3D draws its uuid at creation)
let _o = null;
export const bm = (ax, ay, az, bx2, by, bz, w, h, hex) => {
  _o ??= new THREE.Object3D();
  const len = Math.hypot(bx2 - ax, by - ay, bz - az);
  const g = new THREE.BoxGeometry(w, h, len);
  _o.position.set((ax + bx2) / 2, (ay + by) / 2, (az + bz) / 2);
  _o.up.set(0, 1, 0);
  _o.lookAt(bx2, by, bz);
  _o.updateMatrix();
  g.applyMatrix4(_o.matrix);
  return paint(g, hex);
};
// A flat quad facing up.
export const flat = (x0, x1, z0, z1, y, hex) => {
  const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
  g.rotateX(-Math.PI / 2);
  g.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
  return paint(g, hex);
};

const smooth = (a, b, v) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const mix = (a, b, t) => {
  const A = new THREE.Color(a);
  return A.lerp(new THREE.Color(b), t).getHex();
};
const shade = (hex, k) => new THREE.Color(hex).multiplyScalar(k).getHex();

// -----------------------------------------------------------------------------
// The kit: pieces gathered by (key, noCast), one merged mesh per bucket.
// -----------------------------------------------------------------------------

export function createKit(prefix) {
  const buckets = new Map();
  const extras = [];
  return {
    // a finished mesh of its own (a glow, a contact shadow): added to the place as it stands
    addExtra(mesh) { extras.push(mesh); },
    put(key, mat, geo, { noCast = false } = {}) {
      const k = `${key}${noCast ? ':nc' : ''}`;
      let b = buckets.get(k);
      if (!b) buckets.set(k, (b = { key, mat, noCast, geos: [] }));
      (Array.isArray(geo) ? geo : [geo]).forEach((g) => b.geos.push(g));
    },
    meshes() {
      return [...extras, ...[...buckets.values()].map((b) => {
        const g = b.geos.length === 1 ? b.geos[0] : mergeGeometries(b.geos);
        if (!g) throw new Error(`lighthouse: could not merge ${b.key}`);
        const m = new THREE.Mesh(g, b.mat);
        m.name = `${prefix}:${b.key}`;
        m.castShadow = !b.noCast;
        m.receiveShadow = true;
        if (b.noCast) m.userData.noCast = true;
        return m;
      })];
    },
  };
}

export function lighthouseMaterials() {
  return {
    stone: litMaterial(0xffffff, { vertexColors: true, roughness: 0.95 }),
    // the cliff faces and the lawn carry the game's own gravel and grass textures under their vertex colours (their uvs are metres / the tile)
    rock: litMaterial(0xffffff, { vertexColors: true, surface: 'gravel', repeat: [1, 1] }),
    lawn: litMaterial(0xffffff, { vertexColors: true, surface: 'grass', repeat: [1, 1] }),
    paint: litMaterial(0xffffff, { vertexColors: true, roughness: 0.62 }),
    wood: litMaterial(0xffffff, { vertexColors: true, roughness: 0.85 }),
    // lit from inside (no real lights): the cottage window, the cave's lantern, the tower's slits
    glow: new THREE.MeshStandardMaterial({ color: 0xffd9a0, roughness: 0.5, metalness: 0, emissive: 0xffb050, emissiveIntensity: 1.1 }),
    water: new THREE.MeshStandardMaterial({ color: COL.water, roughness: 0.15, metalness: 0, transparent: true, opacity: 0.88 }),
    glass: new THREE.MeshStandardMaterial({ color: COL.glass, roughness: 0.25, metalness: 0.1 }),
    // the lamp room's glass (see-through, both sides), its roof (opaque until she is inside, then the life fades it) and the
    // lens, dull until the lamp is lit (the life adds its glow over it)
    glassWall: new THREE.MeshStandardMaterial({ color: 0xbcd9e8, roughness: 0.1, metalness: 0, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
    roof: new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.62, transparent: true, opacity: 1 }),
    lens: new THREE.MeshStandardMaterial({ color: 0xe6d79a, roughness: 0.35, metalness: 0.25, emissive: 0x3a2e10, emissiveIntensity: 0.3 }),
    // a soft dark contact shadow under a prop (multiplies the ground; white at its rim changes nothing), and the low sun's glow (additive, unfogged)
    contact: new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.MultiplyBlending, premultipliedAlpha: true, depthWrite: false, fog: false }),
    sunglow: new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
    // a painted pool of lantern light on the floor: additive, no real light
    patch: new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: true }),
  };
}

// -----------------------------------------------------------------------------
// Cliffs: a wall grid along a segment, relief pushed INTO the rock only (so nothing stands out
// past the ground's true edge), strata in bands, a grass lip spilling over the top.
// -----------------------------------------------------------------------------

const gully = (u, salt) => {
  const g = Math.abs(Math.sin(u * 1.1 + salt)) ** 3;
  const n = hash01(Math.round(u * 3), salt, 9);
  return Math.min(0.9, Math.max(0, 0.8 * g + 0.3 * n - 0.15));
};

// A rock face from (ax, az) to (bx, bz), y0..y1, looking toward (nx, nz). `cols` and `rows` are metres
// per cell. `tone` picks the strata palette. The ends and the foot and the lip do not move, so
// neighbouring faces meet without a seam.
export function cliffWall({ ax, az, bx: bx2, bz, y0, y1, nx, nz, salt = 1, cell = 1.5, rowH = 0.75, tones = COL.rock, lip = true, push = 0.8, dark = 1, tide = 0 }) {
  const len = Math.hypot(bx2 - ax, bz - az);
  const cols = Math.max(1, Math.round(len / cell));
  const rows = Math.max(1, Math.round((y1 - y0) / rowH));
  const pos = [];
  const col = [];
  const uvs = [];
  const T = tileMetres('gravel') ?? 1.4;
  const ux = (bx2 - ax) / len; const uz = (bz - az) / len;
  const vcol = (u, v, p, j) => {
    const band = Math.floor(v * rows + (hash01(salt, Math.round(u * 5), 3) - 0.5) * 0.9);
    const t = tones[(((Math.floor(hash01(band, salt, 5) * 97)) % tones.length) + tones.length) % tones.length];
    let hex = t;
    if (lip && v > 1 - 1.25 / rows) hex = mix(t, COL.grass[Math.floor(hash01(Math.round(u * 6), salt, 7) * 4) % 4], smooth(1 - 1.25 / rows, 1, v));
    // a crack or ledge every few rows (a darker seam), lichen and gull streaks in patches, the tide's stain at the foot
    const seam = hash01(j, salt, 11) < 0.4 ? 0.82 : 1;
    const patch = hash01(Math.round(u * len / 2.2), band, salt + 17);
    if (patch > 0.9) hex = mix(hex, 0xc79a52, 0.45); // lichen
    else if (patch < 0.07) hex = mix(hex, 0xe9e4d6, 0.5); // gull streaks
    const y = y0 + (y1 - y0) * v;
    if (tide && y < y0 + tide) hex = mix(hex, 0x4f5a4a, 0.55 * (1 - (y - y0) / tide)); // wet weed and barnacle band
    return shade(hex, dark * seam * (1 - 0.45 * (p / 0.9)));
  };
  const grid = [];
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= cols; i++) {
      const u = i / cols;
      const v = j / rows;
      const edge = smooth(0, 0.08, Math.min(u, 1 - u) * (len / cell) / 6 + 0.001) * smooth(0, 0.18, v) * smooth(0, 0.12, 1 - v);
      const p = gully(u * len, salt) * push * edge;
      const jag = (hash01(i, j, salt) - 0.5) * 0.3 * edge;
      grid.push({ x: ax + (bx2 - ax) * u - nx * (p + Math.abs(jag)), y: y0 + (y1 - y0) * v, z: az + (bz - az) * u - nz * (p + Math.abs(jag)), c: vcol(u, v, p, j), s: u * len });
    }
  }
  const at = (i, j) => grid[j * (cols + 1) + i];
  // each flat face is a touch lighter or darker than its neighbours (a faceted rock, not a smooth cake)
  const tri = (a, b, c2, k) => {
    for (const q of [a, b, c2]) {
      pos.push(q.x, q.y, q.z);
      _c.setHex(q.c);
      col.push(_c.r * k, _c.g * k, _c.b * k);
      uvs.push((q.x - ax) * ux / T + (q.z - az) * uz / T, q.y / T);
    }
  };
  // a quad's winding is set once, from its first cell, so the whole face agrees with (nx, nz)
  const a0 = at(0, 0); const b0 = at(1, 0); const c0 = at(0, 1);
  const e1 = [b0.x - a0.x, b0.y - a0.y, b0.z - a0.z]; const e2 = [c0.x - a0.x, c0.y - a0.y, c0.z - a0.z];
  const cross = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
  const flip = cross[0] * nx + cross[2] * nz < 0; // wound once, from the first cell, to face (nx, nz)
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const a = at(i, j); const b = at(i + 1, j); const c3 = at(i, j + 1); const d = at(i + 1, j + 1);
      const k1 = 0.88 + 0.24 * hash01(i, j, salt + 31); const k2 = 0.88 + 0.24 * hash01(i, j, salt + 37);
      if (!flip) { tri(a, b, c3, k1); tri(b, d, c3, k2); } else { tri(a, c3, b, k1); tri(b, c3, d, k2); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.computeVertexNormals();
  return g;
}

// Smooth value noise on a lattice `size` metres across (0..1), for the lawn's long swells of lush and dry.
export const vnoise = (x, z, size, salt) => {
  const fx = x / size; const fz = z / size;
  const ix = Math.floor(fx); const iz = Math.floor(fz);
  const tx = smooth(0, 1, fx - ix); const tz = smooth(0, 1, fz - iz);
  const h = (i, j) => hash01(ix + i, iz + j, salt);
  return (h(0, 0) * (1 - tx) + h(1, 0) * tx) * (1 - tz) + (h(0, 1) * (1 - tx) + h(1, 1) * tx) * tz;
};

// A top of grass: a grid of cells whose colours swell from lush to sun-dry over metres, with a fine mottle on top.
// The uvs are metres over the grass tile, so the game's own lawn texture lies under the vertex colours.
export function grassCap(x0, x1, z0, z1, y, { cell = 1.8, salt = 1, shade: k = 1 } = {}) {
  const nx = Math.max(1, Math.round((x1 - x0) / cell));
  const nz = Math.max(1, Math.round((z1 - z0) / cell));
  const pos = [];
  const col = [];
  const uvs = [];
  const T = tileMetres('grass') ?? 3;
  const patch = (x, z) => {
    const swell = vnoise(x, z, 7, salt) * 0.7 + vnoise(x, z, 2.6, salt + 4) * 0.3;
    const lush = COL.grass[Math.floor(hash01(Math.round(x * 0.5), Math.round(z * 0.5), salt + 2) * 3) % 3];
    let hex = mix(mix(COL.grass[2], lush, 0.6), 0xa6ad60, smooth(0.45, 0.85, swell)); // sun-dry where the swell is high
    hex = mix(hex, 0x5e8244, 0.5 * smooth(0.55, 0.15, swell)); // deep green in the hollows
    const b = hash01(Math.round(x * 2), Math.round(z * 2), salt + 1);
    return shade(hex, k * (0.94 + 0.12 * b));
  };
  const vert = (x, z) => { pos.push(x, y, z); _c.setHex(patch(x, z)); col.push(_c.r, _c.g, _c.b); uvs.push(x / T, z / T); };
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const xa = x0 + ((x1 - x0) * i) / nx; const xb = x0 + ((x1 - x0) * (i + 1)) / nx;
      const za = z0 + ((z1 - z0) * j) / nz; const zb = z0 + ((z1 - z0) * (j + 1)) / nz;
      vert(xa, za); vert(xa, zb); vert(xb, za);
      vert(xb, za); vert(xa, zb); vert(xb, zb);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.computeVertexNormals();
  return g;
}

// A boulder: an icosahedron whose points are pulled in and out by hash01, squashed to `h` high.
export function boulder(x, y, z, r, h, salt, tones = COL.rock, detail = 1) {
  const g = new THREE.IcosahedronGeometry(r, detail);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const k = 0.78 + 0.44 * hash01(Math.round(pos.getX(i) * 40) + salt, Math.round(pos.getZ(i) * 40), salt + 3);
    pos.setXYZ(i, pos.getX(i) * k, Math.max(pos.getY(i), -r * 0.35) * (h / r) * k, pos.getZ(i) * k);
  }
  g.translate(x, y + h * 0.28, z);
  const base = tones[Math.floor(hash01(x, z, salt) * tones.length) % tones.length];
  return paintBy(g, (px, py) => shade(base, 0.82 + 0.3 * smooth(y, y + h * 1.2, py)));
}

// Triangles ([p, q, r] each, with a hex colour) of a CONVEX solid, wound to face away from its middle.
function convexMesh(tris, colors) {
  const mid = [0, 0, 0];
  let n = 0;
  for (const t of tris) for (const p of t) { mid[0] += p[0]; mid[1] += p[1]; mid[2] += p[2]; n++; }
  mid.forEach((_, i) => { mid[i] /= n; });
  const pos = [];
  const col = [];
  tris.forEach((t, k) => {
    let [a, b, c3] = t;
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]; const e2 = [c3[0] - a[0], c3[1] - a[1], c3[2] - a[2]];
    const nrm = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const m = [(a[0] + b[0] + c3[0]) / 3 - mid[0], (a[1] + b[1] + c3[1]) / 3 - mid[1], (a[2] + b[2] + c3[2]) / 3 - mid[2]];
    if (nrm[0] * m[0] + nrm[1] * m[1] + nrm[2] * m[2] < 0) [b, c3] = [c3, b];
    for (const q of [a, b, c3]) { pos.push(...q); _c.setHex(colors[k]); col.push(_c.r, _c.g, _c.b); }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  g.computeVertexNormals();
  return g;
}

// A sloped path: a prism along a strip from (x0, z0, y0) to (x1, z1, y1), `w` wide, its top the ground's
// own height, its sides down to y -0.05. The top is earth, the sides rock.
export function pathPrism({ x0, z0, x1, z1, y0, y1 }, w, { top = COL.earth, side = COL.rock[1] } = {}) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const px = (-(z1 - z0) / len) * (w / 2);
  const pz = ((x1 - x0) / len) * (w / 2);
  const A = [x0 + px, y0, z0 + pz]; const B = [x0 - px, y0, z0 - pz];
  const C2 = [x1 - px, y1, z1 - pz]; const D = [x1 + px, y1, z1 + pz];
  const foot = (p) => [p[0], -0.05, p[2]];
  const tris = [];
  const colors = [];
  const quad = (a, b, c3, d, hex) => { tris.push([a, b, c3], [a, c3, d]); colors.push(hex, hex); };
  quad(A, D, C2, B, top);
  quad(foot(A), A, B, foot(B), shade(side, 0.9));
  quad(foot(D), D, A, foot(A), side);
  quad(foot(B), B, C2, foot(C2), side);
  quad(foot(C2), C2, D, foot(D), shade(side, 0.9));
  return convexMesh(tris, colors);
}

// A gable roof over x0..x1, z0..z1: a ridge along x at y1, eaves at y0 (an overhang `o` all round).
export function gable(x0, x1, z0, z1, y0, y1, o, hex) {
  const a = x0 - o; const b = x1 + o; const c3 = z0 - o; const d = z1 + o; const zm = (z0 + z1) / 2;
  const tris = [
    [[a, y0, c3], [b, y0, c3], [b, y1, zm]], [[a, y0, c3], [b, y1, zm], [a, y1, zm]],
    [[a, y0, d], [a, y1, zm], [b, y1, zm]], [[a, y0, d], [b, y1, zm], [b, y0, d]],
    [[a, y0, c3], [a, y1, zm], [a, y0, d]], [[b, y0, c3], [b, y0, d], [b, y1, zm]],
  ];
  return convexMesh(tris, tris.map(() => hex));
}

// -----------------------------------------------------------------------------
// The headland: cliffs round the plateau, the grass on top, the cave, the cliff path.
// -----------------------------------------------------------------------------

export function drawHeadland(kit, M) {
  const { PLATEAU, CAVE, PLATEAU_Y } = P;
  const NORTH_FAR = -68;
  const put = (g, noCast = false) => kit.put('face', M.rock, g, { noCast });
  // the east face (the cove's side): the north run, the cave's lintel, the south run
  put(cliffWall({ ax: PLATEAU.maxX, az: NORTH_FAR, bx: PLATEAU.maxX, bz: CAVE.minZ, y0: 0, y1: PLATEAU_Y, nx: 1, nz: 0, salt: 3, tide: 0.9 }));
  put(cliffWall({ ax: PLATEAU.maxX, az: CAVE.minZ, bx: PLATEAU.maxX, bz: CAVE.maxZ, y0: CAVE.roof, y1: PLATEAU_Y, nx: 1, nz: 0, salt: 5, push: 0.15 }));
  put(cliffWall({ ax: PLATEAU.maxX, az: CAVE.maxZ, bx: PLATEAU.maxX, bz: PLATEAU.maxZ, y0: 0, y1: PLATEAU_Y, nx: 1, nz: 0, salt: 7, tide: 0.9 }));
  // the south face (the lower shore's side), the west face (the sea's side)
  put(cliffWall({ ax: PLATEAU.minX, az: PLATEAU.maxZ, bx: PLATEAU.maxX, bz: PLATEAU.maxZ, y0: 0, y1: PLATEAU_Y, nx: 0, nz: 1, salt: 11, tide: 0.6 }));
  put(cliffWall({ ax: PLATEAU.minX, az: NORTH_FAR, bx: PLATEAU.minX, bz: PLATEAU.maxZ, y0: 0, y1: PLATEAU_Y, nx: -1, nz: 0, salt: 13, cell: 2.4, tide: 1.3 }));
  // the cave's inside: darker and warmer, no grass lip, little relief
  const inside = { y0: 0, y1: CAVE.roof, lip: false, push: 0.35, tones: [0xb39c7c, 0xa28d70, 0xbea887], cell: 1.2, rowH: 0.65, tide: 0.8 };
  put(cliffWall({ ...inside, ax: CAVE.minX, az: CAVE.minZ, bx: CAVE.maxX, bz: CAVE.minZ, nx: 0, nz: 1, salt: 17 }));
  put(cliffWall({ ...inside, ax: CAVE.minX, az: CAVE.maxZ, bx: CAVE.maxX, bz: CAVE.maxZ, nx: 0, nz: -1, salt: 19 }));
  put(cliffWall({ ...inside, ax: CAVE.minX, az: CAVE.minZ, bx: CAVE.minX, bz: CAVE.maxZ, nx: 1, nz: 0, salt: 23 }));
  // the cave's roof seen from below, and its wet floor
  put(flipWinding(flat(CAVE.minX, CAVE.maxX, CAVE.minZ, CAVE.maxZ, CAVE.roof, 0x94826a)));
  kit.put('floor', M.stone, flat(CAVE.minX, CAVE.maxX, CAVE.minZ, CAVE.maxZ, 0.012, COL.wet), { noCast: true });
  // the grass on top of the plateau (the cave's roof is under it)
  kit.put('top', M.lawn, grassCap(PLATEAU.minX, PLATEAU.maxX, NORTH_FAR, PLATEAU.maxZ, PLATEAU_Y, { salt: 21 }), { noCast: true });
}

// Turn a geometry's faces over (its normals recomputed).
export function flipWinding(g) {
  const p = g.attributes.position;
  const c3 = g.attributes.color;
  for (let i = 0; i < p.count; i += 3) {
    const sw = (a) => {
      const x = a.getX(i + 1); const y = a.getY(i + 1); const z = a.getZ(i + 1);
      a.setXYZ(i + 1, a.getX(i + 2), a.getY(i + 2), a.getZ(i + 2));
      a.setXYZ(i + 2, x, y, z);
    };
    sw(p);
    if (c3) sw(c3);
  }
  g.computeVertexNormals();
  return g;
}

// The cliff path: two flights, a landing, posts and a rope on both sides, timber edgings.
export function drawCliffPath(kit, M) {
  const { CLIFF_PATH: CP } = P;
  const rock = COL.rock[1];
  for (const f of [CP.f1, CP.f2]) {
    kit.put('cliff', M.stone, pathPrism(f, CP.width, { top: COL.earth, side: rock }));
    const len = Math.hypot(f.x1 - f.x0, f.z1 - f.z0);
    const ux = (f.x1 - f.x0) / len; const uz = (f.z1 - f.z0) / len;
    const nx = -uz; const nz = ux;
    const yAt = (s) => f.y0 + ((f.y1 - f.y0) * s) / len;
    // timber edgings across the tread every 1.2 m, and a post and rope each side every 3.6 m
    for (let s = 1.2; s < len - 0.3; s += 1.2) {
      const x = f.x0 + ux * s; const z = f.z0 + uz * s; const y = yAt(s);
      kit.put('wood', M.wood, bm(x - nx * 0.9, y + 0.05, z - nz * 0.9, x + nx * 0.9, y + 0.05, z + nz * 0.9, 0.16, 0.1, COL.post), { noCast: true });
    }
    for (const side of [-1, 1]) {
      let prev = null;
      for (let s = 0.4; s <= len - 0.3; s += 3.6) {
        const x = f.x0 + ux * s + nx * side * 1.0; const z = f.z0 + uz * s + nz * side * 1.0; const y = yAt(s);
        kit.put('wood', M.wood, bx(x - 0.06, x + 0.06, y, y + 0.95, z - 0.06, z + 0.06, COL.post));
        if (prev) kit.put('wood', M.wood, bm(prev.x, prev.y + 0.85, prev.z, x, y + 0.85, z, 0.035, 0.035, COL.rope), { noCast: true });
        prev = { x, y, z };
      }
    }
  }
  // the landing: a round stone ledge with a stone drum under it
  kit.put('cliff', M.stone, paintBy(new THREE.CylinderGeometry(CP.landing.r, CP.landing.r + 0.25, CP.landing.y + 0.05, 16).translate(CP.landing.x, CP.landing.y / 2 - 0.025, CP.landing.z), (x, y) => shade(COL.rock[2], 0.85 + 0.2 * smooth(0, CP.landing.y, y))));
  kit.put('stone', M.stone, cy(CP.landing.x, CP.landing.z, CP.landing.y, CP.landing.y + 0.012, CP.landing.r, CP.landing.r, COL.earth, 16), { noCast: true });
}

// -----------------------------------------------------------------------------
// The tower, drawn to the gallery; the lamp room above it is drawLampRoom's (milestone 2).
// -----------------------------------------------------------------------------

export function drawTower(kit, M) {
  const { TOWER: T, PLATEAU_Y: Y0, GALLERY_Y: Y1 } = P;
  const put = (key, mat, g, o) => kit.put(key, mat, g, o);
  // plinth and base course
  put('stone', M.stone, cy(T.x, T.z, Y0, Y0 + 0.9, 4.1, 3.85, COL.stone, 24));
  put('stone', M.stone, cy(T.x, T.z, Y0 + 0.9, Y0 + 1.05, 3.9, 3.9, shade(COL.stone, 0.8), 24));
  // the shaft, five bands (red, white, red, white, red), tapering
  const bands = 5;
  const h = (Y1 - 0.9 - (Y0 + 1.05)) / bands;
  const taper = (y) => T.shaft - 0.5 * ((y - (Y0 + 1.05)) / (Y1 - (Y0 + 1.05)));
  for (let i = 0; i < bands; i++) {
    const ya = Y0 + 1.05 + i * h; const yb = ya + h;
    put('paint', M.paint, cy(T.x, T.z, ya, yb, taper(ya), taper(yb), i % 2 ? COL.white : COL.red, 28));
  }
  // the gallery: a corbelled underside and the deck (the disc the ground has at 13.5)
  put('stone', M.stone, cy(T.x, T.z, Y1 - 1.05, Y1 - 0.45, taper(Y1) + 0.1, T.gallery - 0.45, shade(COL.stone, 0.9), 28));
  put('stone', M.stone, cy(T.x, T.z, Y1 - 0.45, Y1, T.gallery, T.gallery, COL.stone, 36));
  put('stone', M.stone, cy(T.x, T.z, Y1, Y1 + 0.01, T.gallery - 0.02, T.gallery - 0.02, 0xb2a690, 36), { noCast: true });
  // the door at the stair's foot (45 degrees from the tower), arched with a lintel and a step
  const a = Math.PI / 4;
  const door = (r, y0, y1, w, hex, mat = M.paint) => {
    const b2 = new THREE.BoxGeometry(w, y1 - y0, 0.5);
    b2.rotateY(Math.PI / 2 - a);
    b2.translate(T.x + r * Math.cos(a), (y0 + y1) / 2, T.z + r * Math.sin(a));
    put('paint', mat, paint(b2, hex));
  };
  door(T.shaft - 0.05, Y0 + 1.05, Y0 + 3.05, 1.3, COL.dark);
  door(T.shaft - 0.0, Y0 + 3.05, Y0 + 3.4, 1.8, COL.stone);
  put('stone', M.stone, bx(T.x + 3.5 * Math.cos(a) - 0.7, T.x + 3.5 * Math.cos(a) + 0.7, Y0, Y0 + 0.45, T.z + 3.5 * Math.sin(a) - 0.7, T.z + 3.5 * Math.sin(a) + 0.7, shade(COL.stone, 0.9)));
  // slit windows on the shaft, lit warm (an emissive material, no real light)
  for (const [deg, y] of [[200, 9.2], [290, 10.9], [20, 12.2], [110, 8.4]]) {
    const r = (deg * Math.PI) / 180;
    const rr = taper(y) - 0.03;
    const g = new THREE.BoxGeometry(0.34, 0.9, 0.25);
    g.rotateY(Math.PI / 2 - r);
    g.translate(T.x + rr * Math.cos(r), y, T.z + rr * Math.sin(r));
    put('glow', M.glow, paint(g, COL.warm), { noCast: true });
  }
  // the lamp room above the gallery is drawLampRoom's (milestone 2)
}

// -----------------------------------------------------------------------------
// The keeper's cottage, its garden, the fog bell, the flagpole and the plateau's paths.
// -----------------------------------------------------------------------------

export function drawCottage(kit, M) {
  const { COTTAGE: C0, PLATEAU_Y: Y0 } = P;
  const x0 = C0.x - C0.w / 2; const x1 = C0.x + C0.w / 2; const z0 = C0.z - C0.d / 2; const z1 = C0.z + C0.d / 2;
  const wallTop = Y0 + 2.5;
  // stone footing, plaster walls
  kit.put('stone', M.stone, bx(x0 - 0.08, x1 + 0.08, Y0, Y0 + 0.7, z0 - 0.08, z1 + 0.08, COL.stone));
  kit.put('paint', M.paint, bx(x0, x1, Y0 + 0.7, wallTop, z0, z1, COL.plaster));
  // slate roof, ridge along x, a chimney on the west end, a ridge cap
  kit.put('paint', M.paint, gable(x0, x1, z0, z1, wallTop, wallTop + 1.7, 0.45, COL.slate));
  kit.put('stone', M.stone, bm(x0 - 0.45, wallTop + 1.72, C0.z, x1 + 0.45, wallTop + 1.72, C0.z, 0.18, 0.12, shade(COL.slate, 0.7)));
  kit.put('stone', M.stone, bx(x0 + 0.7, x0 + 1.4, wallTop + 0.2, wallTop + 2.9, C0.z - 0.35, C0.z + 0.35, 0xa8644a));
  kit.put('stone', M.stone, bx(x0 + 0.62, x0 + 1.48, wallTop + 2.9, wallTop + 3.05, C0.z - 0.43, C0.z + 0.43, COL.stone));
  // the east door (ajar, a warm gap), its step, the porch roof on two posts, the cat flap, the note, the lantern on its hook
  const dz = C0.z;
  kit.put('stone', M.stone, bx(x1 - 0.02, x1 + 0.06, Y0 + 0.7, Y0 + 2.3, dz - 0.5, dz + 0.5, COL.dark));
  kit.put('glow', M.glow, bx(x1 - 0.015, x1 + 0.03, Y0 + 0.8, Y0 + 2.2, dz + 0.32, dz + 0.5, COL.warm), { noCast: true });
  const leaf = new THREE.BoxGeometry(0.06, 1.5, 0.82);
  leaf.rotateY(-0.9);
  leaf.translate(x1 + 0.35, Y0 + 1.45, dz - 0.15);
  kit.put('wood', M.wood, paint(leaf, 0x7a5232));
  kit.put('stone', M.stone, bx(x1, x1 + 2.1, Y0, Y0 + 0.14, dz - 1.4, dz + 1.4, shade(COL.stone, 0.95)));
  kit.put('wood', M.wood, bx(x1 + 1.9, x1 + 2.02, Y0 + 0.14, Y0 + 2.4, dz - 1.35, dz - 1.23, COL.post));
  kit.put('wood', M.wood, bx(x1 + 1.9, x1 + 2.02, Y0 + 0.14, Y0 + 2.4, dz + 1.23, dz + 1.35, COL.post));
  kit.put('wood', M.wood, bx(x1 - 0.05, x1 + 2.1, Y0 + 2.4, Y0 + 2.5, dz - 1.5, dz + 1.5, 0x5b4630));
  kit.put('paint', M.paint, bx(x1 + 0.6, x1 + 0.7, Y0 + 1.55, Y0 + 1.85, dz + 0.62, dz + 0.78, 0xe9e0c8), { noCast: true }); // the note
  kit.put('glow', M.glow, sp(x1 + 0.08, Y0 + 2.05, dz - 0.75, 0.1, COL.warm, { seg: 6, rings: 4 }), { noCast: true }); // the lantern
  kit.put('wood', M.wood, bm(x1 + 0.02, Y0 + 2.32, dz - 0.75, x1 + 0.08, Y0 + 2.14, dz - 0.75, 0.025, 0.025, COL.dark));
  // the rocking chair on the porch
  const cx = x1 + 1.1; const cz = dz + 0.55;
  kit.put('wood', M.wood, bx(cx - 0.28, cx + 0.28, Y0 + 0.4, Y0 + 0.46, cz - 0.28, cz + 0.28, 0x8a5a38));
  kit.put('wood', M.wood, bx(cx - 0.3, cx - 0.24, Y0 + 0.46, Y0 + 1.0, cz - 0.28, cz + 0.28, 0x8a5a38));
  kit.put('wood', M.wood, bx(cx - 0.3, cx + 0.3, Y0 + 0.14, Y0 + 0.2, cz - 0.3, cz - 0.24, COL.post));
  kit.put('wood', M.wood, bx(cx - 0.3, cx + 0.3, Y0 + 0.14, Y0 + 0.2, cz + 0.24, cz + 0.3, COL.post));
  // the lit window on the south wall: warm glass, a frame, a sill and shutters
  const wx = C0.x - 0.4;
  kit.put('glow', M.glow, bx(wx - 0.55, wx + 0.55, Y0 + 1.2, Y0 + 2.0, z1 - 0.02, z1 + 0.04, COL.warm), { noCast: true });
  for (const [a, b, c3, d] of [[wx - 0.65, wx + 0.65, Y0 + 2.0, Y0 + 2.1], [wx - 0.65, wx + 0.65, Y0 + 1.1, Y0 + 1.2], [wx - 0.65, wx - 0.55, Y0 + 1.2, Y0 + 2.0], [wx + 0.55, wx + 0.65, Y0 + 1.2, Y0 + 2.0], [wx - 0.05, wx + 0.05, Y0 + 1.2, Y0 + 2.0]]) {
    kit.put('wood', M.wood, bx(a, b, c3, d, z1 - 0.02, z1 + 0.08, 0xf0e8d8), { noCast: true });
  }
  kit.put('stone', M.stone, bx(wx - 0.8, wx + 0.8, Y0 + 1.04, Y0 + 1.1, z1, z1 + 0.22, COL.stone), { noCast: true });
  for (const s of [-1, 1]) kit.put('wood', M.wood, bx(wx + s * 0.7 + (s > 0 ? 0 : -0.35), wx + s * 0.7 + (s > 0 ? 0.35 : 0), Y0 + 1.15, Y0 + 2.05, z1 - 0.02, z1 + 0.05, 0x4f7a8a), { noCast: true });
  // the sleeper in the lit window: an armchair's back and a dark shape slumped in it with its head down on its chest (never a person walking about)
  const SLEEP = 0x3a2a20;
  kit.put('paint', M.paint, bx(wx + 0.1, wx + 0.46, Y0 + 1.25, Y0 + 1.92, z1 + 0.04, z1 + 0.06, 0x6b4a30), { noCast: true });
  kit.put('paint', M.paint, bx(wx - 0.3, wx + 0.12, Y0 + 1.25, Y0 + 1.58, z1 + 0.04, z1 + 0.065, SLEEP), { noCast: true });
  kit.put('paint', M.paint, sp(wx - 0.08, Y0 + 1.7, z1 + 0.07, 0.14, SLEEP, { seg: 6, rings: 4 }), { noCast: true });
  // a small window on the west wall too, dark
  kit.put('paint', M.paint, bx(x0 - 0.04, x0 + 0.02, Y0 + 1.2, Y0 + 2.0, C0.z - 0.5, C0.z + 0.5, COL.glass), { noCast: true });
}

export function drawGarden(kit, M) {
  const { GARDEN: G, GARDEN_WALLS, PLATEAU_Y: Y0 } = P;
  // drystone walls, 0.8 thick and 0.55 high with a coping and a few loose stones on top
  for (const w of GARDEN_WALLS) {
    const len = Math.hypot(w.x1 - w.x0, w.z1 - w.z0);
    kit.put('stone', M.stone, bm(w.x0, Y0 + 0.28, w.z0, w.x1, Y0 + 0.28, w.z1, 0.8, 0.56, shade(COL.stone, 0.92)));
    kit.put('stone', M.stone, bm(w.x0, Y0 + 0.6, w.z0, w.x1, Y0 + 0.6, w.z1, 0.62, 0.1, COL.stone));
    for (let i = 0; i < len / 1.4; i++) {
      const t = (i + 0.5) / (len / 1.4);
      kit.put('stone', M.stone, boulder(w.x0 + (w.x1 - w.x0) * t, Y0 + 0.62, w.z0 + (w.z1 - w.z0) * t, 0.2, 0.14, 40 + i));
    }
  }
  // the beds: dark soil rows with green plants, a bean frame, a barrel of rain water
  const rows = 4;
  for (let r = 0; r < rows; r++) {
    const z = G.minZ + 1.2 + r * 1.1;
    if (z > G.maxZ - 0.6) break;
    kit.put('stone', M.stone, bx(G.minX + 1, G.maxX - 1, Y0, Y0 + 0.14, z - 0.3, z + 0.3, 0x5e4430), { noCast: true });
    for (let k = 0; k < 6; k++) {
      const x = G.minX + 1.6 + k * 1.1;
      kit.put('paint', M.paint, sp(x, Y0 + 0.28, z, 0.22, COL.grass[(r + k) % 4], { sy: 0.8, seg: 6, rings: 4 }), { noCast: true });
    }
  }
  const bx0 = G.maxX - 1.2; const bz0 = G.minZ + 4.0;
  kit.put('wood', M.wood, cy(bx0, bz0, Y0, Y0 + 0.8, 0.38, 0.42, 0x7d5a38, 10));
  kit.put('water', M.water, cy(bx0, bz0, Y0 + 0.78, Y0 + 0.8, 0.36, 0.36, COL.water, 10), { noCast: true });
}

export function drawBell(kit, M) {
  const { BELL: B, PLATEAU_Y: Y0 } = P;
  for (const s of [-1, 1]) kit.put('wood', M.wood, bx(B.x + s * 0.55 - 0.08, B.x + s * 0.55 + 0.08, Y0, Y0 + 2.5, B.z - 0.08, B.z + 0.08, COL.post));
  kit.put('wood', M.wood, bx(B.x - 0.7, B.x + 1.15, Y0 + 2.5, Y0 + 2.62, B.z - 0.09, B.z + 0.09, COL.post));
  // the bell itself is its own group (createBell) so it can swing; its rope end is a tippable (tippableLook('bellrope'))
}

// The fog bell, hung from the post's cross beam, as a group of its own named 'lighthouse:bell' (world/lighthouselife.js
// swings it about the beam's axis when its rope is pulled). Two meshes, never merged.
export function createBell() {
  const { BELL: B, PLATEAU_Y: Y0 } = P;
  const g = new THREE.Group();
  g.name = 'lighthouse:bell';
  g.position.set(B.x, Y0 + 2.5, B.z);
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.34, 0.7, 12), mat(COL.brass));
  cup.position.y = -0.4;
  const clapper = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4), mat(COL.dark));
  clapper.position.y = -0.78;
  g.add(cup, clapper);
  for (const m of g.children) { m.userData.noMerge = true; m.userData.noCast = true; m.castShadow = false; }
  return g;
}

export function drawFlagpole(kit, M) {
  const { FLAGPOLE: F, PLATEAU_Y: Y0 } = P;
  kit.put('wood', M.wood, cy(F.x, F.z, Y0, Y0 + 7, 0.07, 0.05, COL.white, 8));
  kit.put('paint', M.paint, sp(F.x, Y0 + 7.1, F.z, 0.09, COL.brass, { seg: 6, rings: 4 }));
  const flag = bx(F.x - 1.5, F.x - 0.1, Y0 + 5.7, Y0 + 6.7, F.z - 0.015, F.z + 0.015, COL.red);
  kit.put('paint', M.paint, flag, { noCast: true });
  kit.put('paint', M.paint, bx(F.x - 1.5, F.x - 0.1, Y0 + 6.05, Y0 + 6.35, F.z - 0.02, F.z + 0.02, COL.white), { noCast: true });
}

export const PLATEAU_PATH_LINES = Object.freeze([
  [[[-24.4, 3.6], [-24.4, -2], [-22, -10], [-18.9, -15.7]], 1.5],
  [[[-24.4, -2], [-28.5, -7]], 1.1],
  [[[-18.9, -15.7], [-14, -6], [-12.4, -1]], 1.1],
]);

// Flagstone paths on top of the plateau: the cliff path's top to the stair's foot and the cottage's door.
export function drawPlateauPaths(kit, M) {
  const Y0 = P.PLATEAU_Y + 0.02;
  const polyline = (pts, w) => {
    for (let i = 0; i + 1 < pts.length; i++) {
      const [a, b] = [pts[i], pts[i + 1]];
      kit.put('path', M.stone, bm(a[0], Y0, a[1], b[0], Y0, b[1], w, 0.03, COL.earth), { noCast: true });
    }
  };
  for (const [pts, w] of PLATEAU_PATH_LINES) polyline(pts, w);
}

// -----------------------------------------------------------------------------
// The cove: sand's wet edge, six pools on their shelves, the beach's rocks, the boat and the dressing.
// -----------------------------------------------------------------------------

export function drawPools(kit, M) {
  P.POOLS.forEach((p, i) => {
    // the shelf: a flat dark rock plate a little wider than the pool, its rim lumpy
    const g = new THREE.CylinderGeometry(p.r + 1.15, p.r + 1.25, 0.05, 24);
    g.translate(p.x, 0.02, p.z);
    kit.put('shelf', M.stone, paintBy(g, (x, y, z) => shade(Math.hypot(x - p.x, z - p.z) > p.r + 0.2 ? COL.shelf : COL.shelfWet, 0.9 + 0.2 * hash01(Math.round(x * 3), Math.round(z * 3), 61))), { noCast: true });
    // the water: one disc, deep blue at the middle
    const w = new THREE.CircleGeometry(p.r, 28);
    w.rotateX(-Math.PI / 2);
    w.translate(p.x, 0.056, p.z);
    kit.put('water', M.water, paintBy(w, (x, y, z) => mix(COL.deep, COL.water, smooth(0.2, 1, Math.hypot(x - p.x, z - p.z) / p.r))), { noCast: true });
    // rim stones round most of it (a gap on two sides: she wades in and out), none high enough to stop her
    const gapA = hash01(p.x, p.z, 71) * Math.PI * 2;
    const n = 9 + (i % 3);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const d = Math.abs(((a - gapA + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      const d2 = Math.abs(((a - gapA - Math.PI + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (Math.min(d, d2) < 0.42) continue;
      kit.put('rocks', M.stone, boulder(p.x + (p.r + 0.15) * Math.cos(a), 0.03, p.z + (p.r + 0.15) * Math.sin(a), 0.26 + 0.14 * hash01(k, i, 73), 0.2 + 0.16 * hash01(k, i, 75), 80 + k + i * 11, [COL.rock[0], COL.rock[1], 0x6f7469]), { noCast: true });
    }
  });
}

export function drawBeach(kit, M) {
  // wet sand along each sea, where the foam runs
  kit.put('wet', M.stone, flat(P.SEA_EAST.minX - 3.4, P.SEA_EAST.minX + 0.4, -70, 70, 0.008, COL.wet), { noCast: true });
  kit.put('wet', M.stone, flat(P.SEA_WEST.maxX - 0.4, P.SEA_WEST.maxX + 3.4, -70, 70, 0.008, COL.wet), { noCast: true });
  // the boulders she cannot walk through, and the two Sure Claws ones she can climb with the skill
  for (const c3 of P.BOULDERS) {
    const onPlateau = P.PLATEAU.minX < c3.x && c3.x < P.PLATEAU.maxX && c3.z < P.PLATEAU.maxZ;
    kit.put('rocks', M.stone, boulder(c3.x, onPlateau ? P.PLATEAU_Y : 0, c3.z, c3.r * 1.05, c3.r * 0.85, Math.round(c3.x * 3 + c3.z)));
  }
  for (const p of P.LIGHTHOUSE_PERCHES.filter((q) => q.kind === 'stone')) {
    kit.put('rocks', M.stone, boulder(p.x, 0, p.z, 0.75, 0.72, Math.round(p.x * 5 + p.z)));
  }
  // small stones, scattered by hash01, none in a pool, a collider, the cave's mouth or a path
  const clear = (x, z) => P.LIGHTHOUSE_COLLIDERS.every((q) => Math.hypot(x - q.x, z - q.z) > q.r + 0.7)
    && P.POOLS.every((q) => Math.hypot(x - q.x, z - q.z) > q.shallow + 1.7)
    && !(x < P.PLATEAU.maxX + 0.6 && x > P.PLATEAU.minX - 0.6 && z > P.PLATEAU.minZ - 8 && z < P.PLATEAU.maxZ + 0.6)
    && !(Math.abs(z - 16) < 2.4 && x > -26 && x < -0.5);
  let placed = 0;
  for (let i = 0; i < 260 && placed < 38; i++) {
    const x = P.LIGHTHOUSE_BOUNDS.minX + 3 + hash01(i, 1, 91) * (P.SEA_EAST.minX - 4 - P.LIGHTHOUSE_BOUNDS.minX - 3);
    const z = P.LIGHTHOUSE_BOUNDS.minZ + hash01(i, 2, 91) * (P.LIGHTHOUSE_BOUNDS.maxZ - P.LIGHTHOUSE_BOUNDS.minZ);
    if (!clear(x, z)) continue;
    const r = 0.18 + 0.28 * hash01(i, 3, 91);
    kit.put('rocks', M.stone, boulder(x, 0, z, r, r * 0.7, 120 + i), { noCast: true });
    placed++;
  }
  // the plateau's stones
  for (let i = 0; i < 14; i++) {
    const x = -38 + hash01(i, 5, 93) * 30; const z = -42 + hash01(i, 6, 93) * 44;
    if (Math.hypot(x - P.TOWER.x, z - P.TOWER.z) < 6.5 || (x > -17 && z > -23 && z < -15) || !P.LIGHTHOUSE_COLLIDERS.every((q) => Math.hypot(x - q.x, z - q.z) > q.r + 0.7)) continue;
    const r = 0.16 + 0.22 * hash01(i, 7, 93);
    kit.put('rocks', M.stone, boulder(x, P.PLATEAU_Y, z, r, r * 0.7, 160 + i), { noCast: true });
  }
}

// The upturned rowing boat (a perch she hops onto): a half-hull, a keel strip, two thwart ends.
export function drawBoat(kit, M) {
  const { BOAT: B } = P;
  const g = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  g.scale(1.75, 0.62, 0.72);
  g.rotateY(B.yaw);
  g.translate(B.x, 0, B.z);
  kit.put('boat', M.paint, paintBy(g, (x, y) => (y < 0.2 ? COL.hullTop : y < 0.5 ? COL.hull : shade(COL.hull, 1.12))));
  const ux = Math.cos(B.yaw); const uz = -Math.sin(B.yaw);
  kit.put('boat', M.paint, bm(B.x - ux * 1.5, 0.52, B.z - uz * 1.5, B.x + ux * 1.5, 0.52, B.z + uz * 1.5, 0.1, 0.08, COL.post));
  // an oar leaning on it
  kit.put('wood', M.wood, bm(B.x + 0.4, 0.05, B.z + 1.05, B.x + 0.9, 0.95, B.z + 0.8, 0.07, 0.04, 0xc7a572), { noCast: true });
}

export function drawCoveDressing(kit, M) {
  // driftwood logs lying on the sand
  [[26, 6, 0.6, 2.0], [-4, -3.2, 2.1, 1.7], [30, 36, 1.3, 1.8], [-18, 33, 0.2, 2.2], [20, -28, 0.9, 1.9]].forEach(([x, z, yaw, len], i) => {
    kit.put('wood', M.wood, bm(x - Math.cos(yaw) * len / 2, 0.1, z - Math.sin(yaw) * len / 2, x + Math.cos(yaw) * len / 2, 0.12, z + Math.sin(yaw) * len / 2, 0.2 + 0.05 * (i % 2), 0.18, [0x9a8468, 0x8a7458][i % 2]), { noCast: true });
  });
  // a net, spread out and tangled with cork floats
  kit.put('rope', M.wood, flat(21, 23.4, 33.6, 35.4, 0.04, 0xb89d6a), { noCast: true });
  for (let i = 0; i < 5; i++) kit.put('wood', M.wood, sp(21.3 + i * 0.5, 0.1, 33.9 + (i % 2) * 1.0, 0.1, COL.red, { seg: 6, rings: 4 }), { noCast: true });
  // buoys, red and white
  [[32, 30], [33.2, 8], [-20, 38]].forEach(([x, z], i) => {
    kit.put('boat', M.paint, sp(x, 0.34, z, 0.34, COL.red, { sy: 1.1, seg: 8, rings: 6 }), { noCast: true });
    kit.put('boat', M.paint, cy(x, z, 0.28, 0.46, 0.35, 0.35, COL.white, 8), { noCast: true });
    kit.put('boat', M.paint, bm(x, 0.7, z, x, 0.95, z, 0.04, 0.04, COL.dark), { noCast: true });
  });
  // a washed-up crate and two lobster crates stacked at the north of the cove
  kit.put('wood', M.wood, bx(10, 11.1, 0, 0.7, -17.6, -16.5, 0x8b6a45), { noCast: true });
  kit.put('wood', M.wood, bx(10.1, 11.0, 0.7, 1.05, -17.5, -16.6, 0x7d5d3b), { noCast: true });
}

// -----------------------------------------------------------------------------
// The cave's fittings: a hung lantern, shells and pebbles on the floor.
// -----------------------------------------------------------------------------

export function drawCaveFittings(kit, M) {
  const x = -11.6; const z = -20.2;
  kit.put('wood', M.wood, bm(x, P.CAVE.roof, z, x, 2.18, z, 0.025, 0.025, COL.dark), { noCast: true });
  kit.put('glow', M.glow, sp(x, 1.95, z, 0.22, COL.warm, { seg: 8, rings: 6 }), { noCast: true });
  kit.put('paint', M.paint, cy(x, z, 2.14, 2.2, 0.14, 0.14, COL.dark, 8), { noCast: true });
  kit.put('paint', M.paint, cy(x, z, 1.7, 1.74, 0.14, 0.14, COL.dark, 8), { noCast: true });
  // the lantern's light, painted: a soft disc on the floor, bright at its middle, black at its rim (additive)
  const glowDisc = (r, y, hex) => {
    const seg = 20;
    const pos = [];
    const col = [];
    const mid = new THREE.Color(hex);
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2; const a1 = ((i + 1) / seg) * Math.PI * 2;
      for (const [px, pz, k] of [[0, 0, 1], [Math.cos(a0) * r, Math.sin(a0) * r, 0], [Math.cos(a1) * r, Math.sin(a1) * r, 0]]) {
        pos.push(x + px, y, z + pz);
        col.push(mid.r * k, mid.g * k, mid.b * k);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
    return g;
  };
  kit.put('glowpatch', M.patch, glowDisc(2.7, 0.03, 0x70481c), { noCast: true });
  for (let i = 0; i < 12; i++) {
    const px = P.CAVE.minX + 1 + hash01(i, 1, 97) * 9; const pz = P.CAVE.minZ + 0.5 + hash01(i, 2, 97) * 5;
    const r = 0.06 + 0.1 * hash01(i, 3, 97);
    kit.put('rocks', M.stone, boulder(px, 0, pz, r, r * 0.8, 200 + i, [0xcfc3a8, 0xb8ad98, 0x8c8479]), { noCast: true });
  }
}

// -----------------------------------------------------------------------------
// Gull Rock: a sea stack off the west lip.
// -----------------------------------------------------------------------------

export function drawGullRock(kit, M) {
  for (const [R, salt] of [[P.GULL_ROCK, 131], [P.PINNACLE, 137]]) drawStack(kit, M, R, salt);
}

function drawStack(kit, M, R, salt) {
  const { PLATEAU_Y: Y0 } = P;
  // never narrower than the ground on top (its disc, R.land): a rock only grows where it is rough
  const g = new THREE.CylinderGeometry(R.land + 0.15, (R.land + 0.15) * 1.3, Y0 + 0.4, 14, 6, true);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const k = 1 + 0.25 * hash01(Math.round(pos.getX(i) * 9), Math.round(pos.getY(i) * 3), salt);
    pos.setX(i, pos.getX(i) * k);
    pos.setZ(i, pos.getZ(i) * k);
  }
  g.translate(R.x, (Y0 + 0.4) / 2 - 0.4, R.z);
  kit.put('cliff', M.stone, paintBy(g, (x, y) => {
    const band = Math.floor(y * 1.3);
    const t = COL.rock[(Math.abs(band * 7 + 3)) % 4];
    return y > Y0 - 0.6 ? mix(t, COL.grass[1], smooth(Y0 - 0.6, Y0, y)) : shade(t, 0.8 + 0.2 * smooth(0, Y0, y));
  }));
  // the top is the ground she lands on: its disc, a little inside the drawn rock's rim
  kit.put('top', M.stone, cy(R.x, R.z, Y0 - 0.01, Y0, R.land + 0.05, R.land + 0.05, COL.grass[0], 14), { noCast: true });
  for (const [dx, dz, rr] of [[2.6, 1.2, 0.8], [-2.2, -1.9, 0.6], [1.0, 3.0, 0.5]]) kit.put('rocks', M.stone, boulder(R.x + dx * (R.r / 2.2), 0, R.z + dz * (R.r / 2.2), rr, rr * 1.3, salt + 9));
}

// -----------------------------------------------------------------------------
// The climb (milestone 2): the stair, the gallery's railing, the lamp room, the chalk marks.
// -----------------------------------------------------------------------------

const rad = (d) => (d * Math.PI) / 180;
const polar = (deg, r) => ({ x: P.TOWER.x + r * Math.cos(rad(deg)), z: P.TOWER.z + r * Math.sin(rad(deg)) });
// A partial cylinder (a wall with a gap in it) from world angle `from` for `span` degrees round the tower (three's theta runs the other way).
const arcCyl = (r0, r1, y0, y1, from, span, seg, open = false) => {
  const g = new THREE.CylinderGeometry(r1, r0, y1 - y0, seg, 1, open, Math.PI / 2 - rad(from + span), rad(span));
  g.translate(P.TOWER.x, (y0 + y1) / 2, P.TOWER.z);
  return g;
};

// A flat painted triangle (an arrow) on the ground: apex at (x, z) + `len` along (dx, dz).
function arrow(x, z, y, dx, dz, len, wid, hex) {
  const l = Math.hypot(dx, dz);
  const ux = dx / l; const uz = dz / l;
  const nx = -uz; const nz = ux;
  const pts = [[x + ux * len, z + uz * len], [x + nx * wid, z + nz * wid], [x - nx * wid, z - nz * wid]];
  // a stem too: a thin quad behind the head
  const stem = [[x + nx * wid * 0.3, z + nz * wid * 0.3], [x - nx * wid * 0.3, z - nz * wid * 0.3], [x - ux * len * 0.8 - nx * wid * 0.3, z - uz * len * 0.8 - nz * wid * 0.3], [x - ux * len * 0.8 + nx * wid * 0.3, z - uz * len * 0.8 + nz * wid * 0.3]];
  const tri = (a, b, c) => [a, b, c].flatMap(([px, pz]) => [px, y, pz]);
  const pos = [...tri(pts[0], pts[2], pts[1]), ...tri(stem[0], stem[2], stem[1]), ...tri(stem[0], stem[3], stem[2])];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  return paint(g, hex);
}

// The stair: open treads along each flight's rail with cleats every 0.45 m, an outer handrail on posts, piers under
// every other post, and a stone pier and slab under each ledge (the top ledge's pier too: it stands out past the gallery's rim).
export function drawStair(kit, M) {
  const { LANDINGS, STAIR, PLATEAU_Y: Y0 } = P;
  const put = (key, mat, g, o) => kit.put(key, mat, g, o);
  const flights = P.LIGHTHOUSE_TRAVERSAL.crossings.filter((c) => c.kind === 'stair');
  const out = (p, d) => { const a = Math.atan2(p.z - P.TOWER.z, p.x - P.TOWER.x); return { x: p.x + d * Math.cos(a), z: p.z + d * Math.sin(a) }; };
  for (const c of flights) {
    const pts = c.points;
    pts.forEach((p, k) => {
      const o = out(p, 0.58);
      if (k + 1 < pts.length) {
        const q = pts[k + 1];
        put('wood', M.wood, bm(p.x, p.y - 0.05, p.z, q.x, q.y - 0.05, q.z, 1.0, 0.1, COL.post));
        // cleats across the tread, and the handrail along the outer edge
        const len = Math.hypot(q.x - p.x, q.z - p.z);
        const n = Math.max(1, Math.round(len / 0.45));
        for (let i = 0; i < n; i++) {
          const f = (i + 0.5) / n;
          const x = p.x + (q.x - p.x) * f; const z = p.z + (q.z - p.z) * f; const y = p.y + (q.y - p.y) * f;
          const a = out({ x, z }, -0.5); const b = out({ x, z }, 0.5);
          put('wood', M.wood, bm(a.x, y + 0.01, a.z, b.x, y + 0.01, b.z, 0.12, 0.04, shade(COL.post, 1.25)), { noCast: true });
        }
        const o2 = out(q, 0.58);
        put('wood', M.wood, bm(o.x, p.y + 0.95, o.z, o2.x, q.y + 0.95, o2.z, 0.06, 0.06, COL.dark), { noCast: true });
        const i0 = out(p, -0.55); const i1 = out(q, -0.55);
        put('wood', M.wood, bm(i0.x, p.y + 0.85, i0.z, i1.x, q.y + 0.85, i1.z, 0.035, 0.035, COL.rope), { noCast: true });
      }
      // a post at every point; a pier to the plateau under every other one (not under a ledge's own pier)
      put('wood', M.wood, bx(o.x - 0.04, o.x + 0.04, p.y, p.y + 0.95, o.z - 0.04, o.z + 0.04, COL.dark), { noCast: true });
      if (k % 2 === 1 && p.y - Y0 > 0.6) put('wood', M.wood, bx(o.x - 0.05, o.x + 0.05, Y0, p.y - 0.1, o.z - 0.05, o.z + 0.05, COL.post), { noCast: true });
    });
  }
  // the ledges: a slab (the walkable disc) on a pier from the plateau
  for (const p of LANDINGS.slice(1)) {
    put('stone', M.stone, cy(p.x, p.z, Y0 - 0.1, p.y - 0.18, 0.5, 0.58, shade(COL.stone, 0.92), 12));
    put('stone', M.stone, cy(p.x, p.z, p.y - 0.18, p.y, STAIR.ledge + 0.05, STAIR.ledge + 0.05, COL.stone, 14));
    put('stone', M.stone, cy(p.x, p.z, p.y, p.y + 0.012, STAIR.ledge, STAIR.ledge, 0xb2a690, 14), { noCast: true });
  }
  // the foot: a striped bollard, a painted arrow up the first flight on the plinth, and a stone step
  const f0 = flights[0].points;
  const dx = f0[1].x - f0[0].x; const dz = f0[1].z - f0[0].z;
  const l = Math.hypot(dx, dz);
  const foot = LANDINGS[0];
  // a paving pad under the flat first metre, so the treads do not start on bare grass
  put('stone', M.stone, cy((f0[0].x + f0[1].x) / 2, (f0[0].z + f0[1].z) / 2, Y0 - 0.2, Y0 + 0.012, 0.85, 0.85, shade(COL.stone, 0.95), 14), { noCast: true });
  const side = out(foot, 0.0);
  const bol = { x: side.x - (dz / l) * 0.85 + (dx / l) * 0.4, z: side.z + (dx / l) * 0.85 + (dz / l) * 0.4 };
  put('paint', M.paint, cy(bol.x, bol.z, Y0, Y0 + 0.36, 0.13, 0.13, COL.red, 10));
  put('paint', M.paint, cy(bol.x, bol.z, Y0 + 0.36, Y0 + 0.72, 0.13, 0.13, COL.white, 10));
  put('paint', M.paint, sp(bol.x, Y0 + 0.74, bol.z, 0.13, COL.red, { seg: 8, rings: 4 }));
  put('paint', M.paint, arrow(foot.x - (dx / l) * 1.6, foot.z - (dz / l) * 1.6, Y0 + 0.02, dx, dz, 0.6, 0.3, COL.white), { noCast: true });
}

// The gallery's railing: balusters and a handrail round the rim, with a gate for the stair and a gap for the drop,
// and the railing walk's own rail (the crossing's polyline, drawn: low at its ends, 0.8 m up between) on posts.
export function drawGallery(kit, M) {
  const { TOWER: T, GALLERY_Y: Y1, GALLERY_RAIL: GR, STAIR_TOP_DEG } = P;
  const put = (key, mat, g, o) => kit.put(key, mat, g, o);
  const R = 4.42;
  const open = (deg) => {
    const near = (c) => { let d = Math.abs(deg - c) % 360; if (d > 180) d = 360 - d; return d; };
    return near(STAIR_TOP_DEG) < 15 || near(269) < 14;
  };
  const step = 7.5;
  let prev = null;
  for (let deg = 0; deg < 360; deg += step) {
    const onWalk = deg > GR.from - 1 && deg < GR.to + 1;
    const here = polar(deg, R);
    if (!onWalk && !open(deg)) {
      put('paint', M.paint, bx(here.x - 0.025, here.x + 0.025, Y1, Y1 + 1.0, here.z - 0.025, here.z + 0.025, COL.white), { noCast: true });
      const next = polar(deg + step, R);
      if (!open(deg + step) && !(deg + step > GR.from - 1 && deg + step < GR.to + 1)) put('paint', M.paint, bm(here.x, Y1 + 1.0, here.z, next.x, Y1 + 1.0, next.z, 0.06, 0.05, COL.red), { noCast: true });
      else if (open(deg + step)) put('paint', M.paint, bx(next.x - 0.04, next.x + 0.04, Y1, Y1 + 1.05, next.z - 0.04, next.z + 0.04, COL.red), { noCast: true });
    } else if (prev === 'gate') prev = null;
  }
  // the gate posts, a stouter pair at each end of the railing walk
  for (const deg of [STAIR_TOP_DEG - 15, STAIR_TOP_DEG + 15, 255, 283]) {
    const q = polar(deg, R);
    put('paint', M.paint, bx(q.x - 0.045, q.x + 0.045, Y1, Y1 + 1.05, q.z - 0.045, q.z + 0.045, COL.red), { noCast: true });
  }
  // the railing walk's rail, on posts
  const rail = P.LIGHTHOUSE_TRAVERSAL.crossings.find((c) => c.id === 'rail-walk');
  rail.points.forEach((p, k) => {
    if (k + 1 < rail.points.length) {
      const q = rail.points[k + 1];
      put('paint', M.paint, bm(p.x, p.y, p.z, q.x, q.y, q.z, 0.09, 0.09, COL.brass), { noCast: true });
    }
    if (p.y - Y1 > 0.05) put('paint', M.paint, bx(p.x - 0.025, p.x + 0.025, Y1, p.y - 0.04, p.z - 0.025, p.z + 0.025, COL.white), { noCast: true });
  });
  void T;
}

// The lamp room. A stone kerb 0.45 m high, glass over it to the roof at 16.7, a door gap 1.4 m wide facing the stair,
// mullions, a red roof and a vane; inside, the lens (a dull brass drum of rings, which the life lights) on its pedestal
// and the lever's housing. The glass and the roof are meshes of their own (the life fades them while she is inside).
// Returns { glass, roof }.
export function drawLampRoom(kit, M) {
  const { TOWER: T, GALLERY_Y: Y1, LAMP_ROOM: LR } = P;
  const put = (key, mat, g, o) => kit.put(key, mat, g, o);
  const half = (Math.asin(0.7 / LR.r) * 180) / Math.PI;
  const from = LR.door + half;
  const span = 360 - 2 * half;
  const topY = LR.roof;
  const drumTop = Y1 + 0.45; // a low kerb: the follow camera looks down 26 degrees, and a higher one would hide her inside
  // the drum and its sill, the door's jambs
  put('stone', M.stone, paint(arcCyl(LR.r + 0.12, LR.r + 0.12, Y1, drumTop, from, span, 28), COL.stone));
  put('stone', M.stone, paint(arcCyl(LR.r + 0.2, LR.r + 0.2, drumTop, drumTop + 0.1, from, span, 28), shade(COL.stone, 0.88)));
  for (const sgn of [-1, 1]) {
    const q = polar(LR.door + sgn * half, LR.r + 0.05);
    put('paint', M.paint, bx(q.x - 0.1, q.x + 0.1, Y1, topY, q.z - 0.1, q.z + 0.1, COL.red));
  }
  const d = polar(LR.door, LR.r + 0.05);
  const dn = { x: -Math.sin(rad(LR.door)), z: Math.cos(rad(LR.door)) };
  put('paint', M.paint, bm(d.x - dn.x * 0.8, topY - 0.55, d.z - dn.z * 0.8, d.x + dn.x * 0.8, topY - 0.55, d.z + dn.z * 0.8, 0.22, 0.5, COL.red));
  // mullions every 30 degrees (but not across the door)
  for (let deg = 0; deg < 360; deg += 30) {
    let dd = Math.abs(deg + 15 - LR.door) % 360;
    if (dd > 180) dd = 360 - dd;
    if (dd < half + 4) continue;
    const q = polar(deg + 15, LR.r);
    put('paint', M.paint, bx(q.x - 0.035, q.x + 0.035, drumTop, topY, q.z - 0.035, q.z + 0.035, COL.red), { noCast: true });
  }
  // the pedestal and the lens: five rings that narrow towards the top, a brass cap
  put('stone', M.stone, cy(T.x, T.z, Y1, P.LAMP_ROOM.lensY - 0.5, 0.58, 0.5, shade(COL.stone, 0.9), 16));
  for (let i = 0; i < 5; i++) {
    const y0 = LR.lensY - 0.5 + i * 0.28;
    const rr = 0.5 - Math.abs(i - 2) * 0.05;
    put('lens', M.lens, cy(T.x, T.z, y0, y0 + 0.25, rr, rr, 0xe6d79a, 20), { noCast: true });
    put('paint', M.paint, cy(T.x, T.z, y0 + 0.25, y0 + 0.28, rr + 0.03, rr + 0.03, COL.brass, 20), { noCast: true });
  }
  put('paint', M.paint, cy(T.x, T.z, LR.lensY + 1.0, LR.lensY + 1.12, 0.35, 0.1, COL.brass, 16), { noCast: true });
  // the lever's housing: a small stone block by the wall opposite the door (the arm is the tippable's own look)
  const lv = P.LEVER;
  put('stone', M.stone, bx(lv.x - 0.2, lv.x + 0.2, Y1, Y1 + 0.3, lv.z - 0.2, lv.z + 0.2, shade(COL.stone, 0.85)), { noCast: true });
  // the glass and the roof
  const glass = new THREE.Mesh(arcCyl(LR.r, LR.r, drumTop + 0.1, topY, from, span, 28, true), M.glassWall);
  glass.name = 'lighthouse:glass';
  glass.castShadow = false;
  glass.userData.noCast = true;
  glass.userData.noMerge = true;
  const roofGeo = mergeGeometries([
    paint(new THREE.ConeGeometry(2.75, 1.7, 28).translate(T.x, topY + 0.85, T.z), COL.red),
    paint(new THREE.CylinderGeometry(2.78, 2.78, 0.16, 28).translate(T.x, topY + 0.04, T.z), shade(COL.red, 0.8)),
    paint(new THREE.SphereGeometry(0.2, 8, 6).translate(T.x, topY + 1.78, T.z), COL.brass),
    paint(new THREE.CylinderGeometry(0.035, 0.035, 0.9, 6).translate(T.x, topY + 2.25, T.z), COL.dark),
    paint(new THREE.ConeGeometry(0.13, 0.5, 4).rotateZ(-Math.PI / 2).translate(T.x + 0.3, topY + 2.6, T.z), COL.dark),
  ]);
  const roof = new THREE.Mesh(roofGeo, M.roof);
  roof.name = 'lighthouse:lamproof';
  roof.castShadow = true;
  roof.receiveShadow = true;
  roof.userData.noMerge = true;
  return { glass, roof };
}

// The chalk marks at every take-off the plan places, a ring on the ground (a leap's, a drop's) and a ring at each end of the railing
// walk: painted white, flat, 0.45 m across.
export function drawMarks(kit, M, ground) {
  const tr = P.LIGHTHOUSE_TRAVERSAL;
  const spots = [...tr.gaps.map((h) => ({ ...h.from, y: ground.y(h.from.x, h.from.z) })), ...tr.drops.map((h) => ({ ...h.from, y: ground.y(h.from.x, h.from.z) }))];
  const rail = tr.crossings.find((c) => c.id === 'rail-walk');
  for (const e of [rail.points[0], rail.points[rail.points.length - 1]]) spots.push({ x: e.x, z: e.z, y: ground.y(e.x, e.z) });
  for (const s of spots) {
    const g = new THREE.RingGeometry(0.34, 0.46, 18);
    g.rotateX(-Math.PI / 2);
    g.translate(s.x, s.y + 0.025, s.z);
    kit.put('marks', M.paint, paint(g, 0xf4efe0), { noCast: true });
  }
}

// -----------------------------------------------------------------------------
// The tippables' own looks: a crab pot, a bucket, a lobster crate, a bin.
// -----------------------------------------------------------------------------

const mat = (hex) => litMaterial(hex, { roughness: 0.85 });
export function tippableLook(look) {
  const g = new THREE.Group();
  const add = (geo, hex, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat(hex)); m.position.set(x, y, z); g.add(m); return m; };
  if (look === 'crabpot') {
    add(new THREE.CylinderGeometry(0.28, 0.32, 0.4, 10), 0xb89560, 0, 0.2);
    add(new THREE.TorusGeometry(0.3, 0.025, 4, 10), 0x6e5236, 0, 0.4).rotation.x = Math.PI / 2;
    add(new THREE.TorusGeometry(0.3, 0.025, 4, 10), 0x6e5236, 0, 0.03).rotation.x = Math.PI / 2;
    add(new THREE.SphereGeometry(0.07, 6, 5), COL.red, 0.2, 0.46, 0.1);
  } else if (look === 'bucket') {
    add(new THREE.CylinderGeometry(0.2, 0.15, 0.3, 10), 0x4f7a8a, 0, 0.15);
    add(new THREE.TorusGeometry(0.19, 0.015, 4, 12, Math.PI), 0x6e6e72, 0, 0.3);
  } else if (look === 'crate') {
    add(new THREE.BoxGeometry(0.55, 0.32, 0.4), 0x8b6a45, 0, 0.16);
    add(new THREE.BoxGeometry(0.5, 0.05, 0.36), 0x6e5236, 0, 0.33);
  } else if (look === 'bellrope') {
    // a rope hanging from the post's cross beam (2.5 m up) to a knot at about her nose; the bell hangs over it
    add(new THREE.CylinderGeometry(0.025, 0.025, 1.6, 6), COL.rope, 0, 1.65);
    add(new THREE.SphereGeometry(0.075, 6, 5), COL.rope, 0, 0.85);
  } else if (look === 'lever') {
    // only the arm: the housing is part of the lamp room, so the arm can swing (world/lighthouselife.js
    // turns `lever-arm` about its pivot, and the tippable's own tilt is not used)
    const arm = new THREE.Group();
    arm.name = 'lever-arm';
    arm.position.y = 0.3;
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.6, 6), mat(0x4a4036));
    rod.position.y = 0.3;
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), mat(COL.red));
    knob.position.y = 0.62;
    arm.add(rod, knob);
    g.add(arm);
  } else {
    add(new THREE.CylinderGeometry(0.18, 0.15, 0.4, 8), 0x6e7a70, 0, 0.2);
    add(new THREE.CylinderGeometry(0.19, 0.19, 0.04, 8), 0x58645a, 0, 0.42);
  }
  return g;
}

export { smooth, mix, shade };
