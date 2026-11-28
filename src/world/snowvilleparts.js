// =============================================================================
// SNOWVILLE: THE DRAWING KIT (milestone V1). The snow ground (one vertex-coloured heightfield, soft blue shadows, a trodden lane), the spawn court's return arch and
// brazier, the cottages (walls, snow-capped gables, chimneys, warm windows), the square's fir, cocoa stall, postcard board, snowman and lamp posts, the firs, drifts and
// rocks. Pieces are gathered by material and merged: a handful of meshes. No canvas, no Math.random: every number is snowvilleplan.js's. The place's ONE real light is
// made here (the brazier's), never more.
// =============================================================================

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { litMaterial } from '../render/materials.js';
import * as P from './snowvilleplan.js';
import * as BP from './snowvillebeautyplan.js';

export const COL = Object.freeze({
  snow: 0xdfe7f2, snowBright: 0xeaf0f8, roofSnow: 0xd9e4f3, roofShade: 0x9fb3d0, shade: 0xbccfe6, wood: 0x8a6244, woodDark: 0x5a3e2a, iron: 0x3a3f4a, fir: 0x2f5a46, firLight: 0x4a7a5c, rock: 0x8a909c,
  warm: 0xffd9a0, flame: 0xffa43c, ice: 0xdff0ff, cream: 0xf2e6cc,
});

const _c = new THREE.Color();
const _d = new THREE.Color();
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// A soft round dot (a 32 x 32 data texture, no canvas) so the flakes and glints are round and not square.
let _dot = null;
export function dotTexture() {
  if (_dot) return _dot;
  const n = 32;
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const r = Math.hypot(x + 0.5 - n / 2, y + 0.5 - n / 2) / (n / 2);
    const k = (y * n + x) * 4;
    data[k] = data[k + 1] = data[k + 2] = 255; data[k + 3] = Math.round(255 * (r >= 1 ? 0 : (1 - r) ** 1.4));
  }
  _dot = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  _dot.needsUpdate = true;
  return _dot;
}

// ---- the ground ------------------------------------------------------------------------------------------------------------
function lines(min, max, edge, outer) {
  const out = [];
  for (let i = 0; i < outer; i++) out.push(-edge + ((edge + min) * i) / outer);
  for (let v = min; v < max - 1e-6; v += 2) out.push(v);
  for (let i = 0; i <= outer; i++) out.push(max + ((edge - max) * i) / outer);
  return out;
}

// The lane: a trodden line from the court's arch up to the square, a little greyer and bluer than the drifts.
export const LANE = Object.freeze([[0, 26], [-1, 20], [-3, 14], [-4, 9]]);
export const laneDist = (x, z) => {
  let best = 1e9;
  for (let i = 0; i < LANE.length - 1; i++) {
    const [ax, az] = LANE[i]; const [bx, bz] = LANE[i + 1];
    const t = clamp01(((x - ax) * (bx - ax) + (z - az) * (bz - az)) / ((bx - ax) ** 2 + (bz - az) ** 2));
    best = Math.min(best, Math.hypot(x - (ax + (bx - ax) * t), z - (az + (bz - az) * t)));
  }
  return best;
};

function snowColour(x, z, out) {
  _c.setHex(COL.snow);
  _d.setHex(COL.shade);
  const mottle = 0.5 + 0.5 * Math.sin(x * 0.7 + Math.sin(z * 0.45) * 2) * Math.cos(z * 0.6 + x * 0.1);
  _c.lerp(_d, 0.28 * mottle);
  const y = P.snowY(x, z);
  const dy = (P.snowY(x + 0.8, z) + P.snowY(x - 0.8, z) + P.snowY(x, z + 0.8) + P.snowY(x, z - 0.8)) / 4 - y;
  _c.lerp(_d, clamp01(dy * 2.2) * 0.4); // hollows hold a little blue shade
  _c.lerp(_d.setHex(0xc4d0de), clamp01(1 - laneDist(x, z) / 2.4) * 0.5); // the trodden lane
  for (const [wx, wz, r] of P.WARM_SPOTS) _c.lerp(_d.setHex(0xf4e2c8), 0.3 * Math.exp(-((x - wx) ** 2 + (z - wz) ** 2) / (r * r))); // firelight on the snow
  _c.lerp(_d.setHex(0xe6f4ff), 0.35 * Math.exp(-((x - P.ARCH.x) ** 2 + (z - P.ARCH.z - 1.5) ** 2) / 9)); // the arch's icy light
  BP.groundShade(x, z, _c, _d); // V8: zone tones, shade under firs and eaves, door paths, window light
  out[0] = _c.r; out[1] = _c.g; out[2] = _c.b;
}

export function groundGeometry() {
  const half = P.GROUND_SIZE / 2;
  const xs = lines(P.SNOWVILLE_BOUNDS.minX, P.SNOWVILLE_BOUNDS.maxX, half, 3);
  const zs = lines(P.SNOWVILLE_BOUNDS.minZ, P.SNOWVILLE_BOUNDS.maxZ, half, 4);
  const nx = xs.length;
  const nz = zs.length;
  const pos = new Float32Array(nx * nz * 3);
  const col = new Float32Array(nx * nz * 3);
  const index = [];
  const rgb = [0, 0, 0];
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      pos[k * 3] = xs[i]; pos[k * 3 + 1] = P.snowY(xs[i], zs[j]); pos[k * 3 + 2] = zs[j];
      snowColour(xs[i], zs[j], rgb);
      col[k * 3] = rgb[0]; col[k * 3 + 1] = rgb[1]; col[k * 3 + 2] = rgb[2];
    }
  }
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i; const b = a + 1; const c = a + nx; const d = c + 1;
      index.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

export function drawGround() {
  const m = new THREE.Mesh(groundGeometry(), new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.95, metalness: 0 }));
  m.name = 'snowville:ground';
  m.receiveShadow = true;
  Object.assign(m.userData, { ground: true, noCast: true, noContactShadow: true, noMerge: true });
  return m;
}

// ---- the kit: pieces gathered by material, one merged mesh per bucket ------------------------------------------------------------
// Down-facing triangles lying within 0.45 m of the snow (box bottoms, cylinder and cone floors on the ground, crates, pads) can never be seen: the kit drops them, a free trim of the merged buckets.
function dropFloors(geo) {
  const pos = geo.attributes.position; const n = pos.count;
  if (geo.index || n % 3) return geo;
  const keep = [];
  for (let i = 0; i < n; i += 3) {
    const ay = pos.getY(i); const by = pos.getY(i + 1); const cy = pos.getY(i + 2);
    const flat = Math.abs(ay - by) < 1e-4 && Math.abs(by - cy) < 1e-4;
    if (flat && ay < 0.45 && ay > -0.3) {
      const e1x = pos.getX(i + 1) - pos.getX(i); const e1z = pos.getZ(i + 1) - pos.getZ(i); const e2x = pos.getX(i + 2) - pos.getX(i); const e2z = pos.getZ(i + 2) - pos.getZ(i);
      if (e1x * e2z - e1z * e2x > 0) continue; // faces down (clockwise seen from above)
    }
    keep.push(i, i + 1, i + 2);
  }
  if (keep.length === n) return geo;
  const out = new THREE.BufferGeometry();
  for (const [name, attr] of Object.entries(geo.attributes)) {
    const arr = new attr.array.constructor(keep.length * attr.itemSize);
    keep.forEach((src, k) => { for (let c = 0; c < attr.itemSize; c++) arr[k * attr.itemSize + c] = attr.array[src * attr.itemSize + c]; });
    out.setAttribute(name, new THREE.BufferAttribute(arr, attr.itemSize));
  }
  return out;
}

export function createKit(prefix) {
  const buckets = new Map();
  return {
    put(key, mat, geo, { noCast = false } = {}) {
      let b = buckets.get(key);
      if (!b) buckets.set(key, (b = { key, mat, noCast, geos: [] }));
      b.geos.push(geo);
    },
    meshes() {
      return [...buckets.values()].map((b) => {
        const m = new THREE.Mesh(dropFloors(b.geos.length === 1 ? b.geos[0] : mergeGeometries(b.geos)), b.mat);
        m.name = `${prefix}:${b.key}`;
        m.castShadow = !b.noCast;
        m.receiveShadow = true;
        Object.assign(m.userData, { noContactShadow: true, noMerge: true });
        if (b.noCast) m.userData.noCast = true;
        return m;
      });
    },
  };
}

export function snowvilleMaterials() {
  return {
    paint: litMaterial(0xffffff, { vertexColors: true, roughness: 0.85 }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true }), // windows, flame, baubles, the arch's door of light
  };
}

// Paint a geometry one colour (non-indexed, with position, normal, uv and colour so any two merge); `jitter` gives each its own tone.
export function paint(geo, hex, jitter = 0) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  _c.setHex(hex);
  if (jitter) _c.offsetHSL(jitter * 0.015, 0, jitter * 0.05);
  for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

// Beauty pass 2: push a painted geometry's colour past 1 (k times brighter) so it reads as a lit thing: the high tier's bloom (threshold 1.1) picks it up, the low tiers clip it to a bright warm.
export function hot(geo, k = 1.8) {
  const col = geo.attributes.color;
  for (let i = 0; i < col.array.length; i++) col.array[i] *= k;
  return geo;
}

// Place a built piece: turn it `ry` about the vertical at the origin, then stand it at (x, z), dy over the snow there.
export const stand = (geo, x, z, dy = 0, ry = 0) => {
  if (ry) geo.rotateY(ry);
  geo.translate(x, P.snowY(x, z) + dy, z);
  return geo;
};
export const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
export const cyl = (rt, rb, h, seg = 8) => new THREE.CylinderGeometry(rt, rb, h, seg, 1);
export const ball = (r, ws = 7, hs = 5) => new THREE.SphereGeometry(r, ws, hs);

// A gabled prism with its ridge along x: width w (ridge length), depth d (eave to eave), eaves at y 0, ridge at y rise. Faces are wound outward by a reference point inside.
function gable(w, d, rise) {
  const v = (x, y, z) => [x, y, z];
  const A = v(-w / 2, 0, -d / 2); const B = v(w / 2, 0, -d / 2); const Cc = v(w / 2, 0, d / 2); const D = v(-w / 2, 0, d / 2);
  const R0 = v(-w / 2, rise, 0); const R1 = v(w / 2, rise, 0);
  const ref = [0, rise / 3, 0];
  const pos = [];
  const tri = (a, b, c) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const wx = c[0] - a[0], wy = c[1] - a[1], wz = c[2] - a[2];
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    const out = nx * (a[0] - ref[0]) + ny * (a[1] - ref[1]) + nz * (a[2] - ref[2]) >= 0;
    pos.push(...(out ? [...a, ...b, ...c] : [...a, ...c, ...b]));
  };
  tri(A, B, R1); tri(A, R1, R0); // the back slope
  tri(D, Cc, R1); tri(D, R1, R0); // the front slope
  tri(A, D, R0); tri(B, Cc, R1); // the two gable ends
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.computeVertexNormals();
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  return g;
}

// ---- the spawn: the return arch (the gate row marks it `own`) --------------------------------------------------------------------
export function drawSpawn(kit, M) {
  const A = P.ARCH;
  const px = A.w / 2 - 0.35;
  for (const sx of [-1, 1]) {
    kit.put('paint', M.paint, paint(stand(cyl(0.34, 0.42, A.h, 8), A.x + sx * px, A.z, A.h / 2), COL.wood));
    kit.put('paint', M.paint, paint(stand(ball(0.5, 7, 4).scale(1, 0.55, 1), A.x + sx * px, A.z, A.h + 0.05), COL.snowBright), { noCast: true });
    kit.put('paint', M.paint, paint(stand(cyl(0.5, 0.5, 0.22, 8), A.x + sx * px, A.z, 0.11), COL.rock));
  }
  kit.put('paint', M.paint, paint(stand(box(A.w + 0.6, 0.5, A.depth), A.x, A.z, A.h + 0.05), COL.woodDark));
  kit.put('paint', M.paint, paint(stand(box(A.w + 0.9, 0.3, A.depth + 0.3), A.x, A.z, A.h + 0.46), COL.snowBright), { noCast: true });
  // a lantern on its hook at the middle of the lintel, and two small ones at the posts
  kit.put('paint', M.paint, paint(stand(cyl(0.02, 0.02, 0.5, 4), A.x, A.z, A.h - 0.25), COL.iron));
  kit.put('glow', M.glow, hot(paint(stand(ball(0.2, 7, 5), A.x, A.z, A.h - 0.62), COL.warm), 1.8), { noCast: true });
  // the door's soft light (the view through the arch): icy white-blue, deeper toward the edges, so it reads as light and not a flat card
  const dg = stand(new THREE.PlaneGeometry(A.w - 1.2, A.h - 0.7, 4, 4).toNonIndexed(), A.x, A.z + 0.02, (A.h - 0.7) / 2 + 0.15);
  const dp = dg.attributes.position; const dc = new Float32Array(dp.count * 3);
  const mid = new THREE.Color(0xf4faff); const edge = new THREE.Color(0xa9cde8);
  for (let v = 0; v < dp.count; v++) {
    const u = Math.abs(dp.getX(v) - A.x) / ((A.w - 1.2) / 2);
    const w = clamp01((dp.getY(v) - P.snowY(A.x, A.z)) / (A.h - 0.4));
    _c.copy(mid).lerp(edge, clamp01(0.55 * u * u + 0.5 * w * w));
    dc[v * 3] = _c.r; dc[v * 3 + 1] = _c.g; dc[v * 3 + 2] = _c.b;
  }
  dg.setAttribute('color', new THREE.BufferAttribute(dc, 3));
  if (!dg.attributes.normal) dg.computeVertexNormals();
  if (!dg.attributes.uv) dg.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(dp.count * 2), 2));
  kit.put('glow', M.glow, dg, { noCast: true });
}

// The court's hearth: a ring of stones round a bed of logs and a flame (the flame is emissive colour; the real light is drawLight's).
export function drawBrazier(kit, M) {
  const { x, z } = P.BRAZIER;
  kit.put('paint', M.paint, paint(stand(new THREE.TorusGeometry(0.62, 0.17, 5, 9).rotateX(Math.PI / 2), x, z, 0.2), COL.rock));
  for (let i = 0; i < 3; i++) kit.put('paint', M.paint, paint(stand(cyl(0.07, 0.07, 0.9, 5).rotateZ(Math.PI / 2).rotateY(i * 1.05), x, z, 0.28), COL.woodDark));
  kit.put('glow', M.glow, paint(stand(new THREE.ConeGeometry(0.34, 0.9, 6, 1), x, z, 0.75), COL.flame), { noCast: true });
  kit.put('glow', M.glow, paint(stand(new THREE.ConeGeometry(0.18, 0.6, 5, 1), x, z, 0.72), 0xffe08a), { noCast: true });
}

// ---- the cottages ------------------------------------------------------------------------------------------------------------------
// Walls, a gabled roof and its snow cap, a chimney, a door and warm windows; built in the cottage's own frame (door on +z), then turned and stood.
export function cottageParts(c) {
  const parts = [];
  const rise = Math.min(c.w, c.d) * 0.36 + 0.4;
  const add = (key, geo, hex, jit = 0, noCast = false) => parts.push([key, paint(geo, hex, jit), noCast]);
  add('paint', box(c.w, c.h, c.d).translate(0, c.h / 2, 0), c.wall, Math.sin(c.x * 3.1));
  add('paint', gable(c.w + 0.5, c.d + 0.8, rise).translate(0, c.h, 0), c.roof);
  add('paint', gable(c.w + 0.74, c.d + 0.96, rise + 0.1).translate(0, c.h + 0.1, 0), COL.roofSnow, 0, true);
  const chx = c.w * 0.28;
  add('paint', box(0.6, rise + 0.9, 0.6).translate(chx, c.h + (rise + 0.9) / 2 - 0.1, -c.d * 0.2), COL.rock);
  add('paint', box(0.78, 0.2, 0.78).translate(chx, c.h + rise + 0.82, -c.d * 0.2), COL.snowBright, 0, true);
  add('paint', box(0.95, 1.75, 0.12).translate(0, 0.875, c.d / 2 + 0.03), P.DOOR_HUE[c.id] ?? COL.woodDark); // the door, in its zone's accent hue
  add('paint', box(1.25, 0.18, 0.5).translate(0, 1.82, c.d / 2 + 0.16), COL.snowBright, 0, true); // snow on the lintel
  for (const sx of [-1, 1]) { // two windows, a sill with snow under each
    const wx = sx * c.w * 0.32;
    parts.push(['glow', hot(paint(box(0.7, 0.62, 0.06).translate(wx, c.h * 0.55, c.d / 2 + 0.02), 0xffc878), 2.1), true]); // lit from inside: past 1, so it glows against the blue snow
    add('paint', box(0.95, 0.12, 0.3).translate(wx, c.h * 0.55 - 0.4, c.d / 2 + 0.12), COL.snowBright, 0, true);
  }
  parts.push(['glow', hot(paint(box(0.06, 0.62, 0.7).translate(c.w / 2 + 0.02, c.h * 0.55, 0), 0xffc878), 2.1), true]); // one on the side
  return parts;
}
export function drawCottages(kit, M) {
  for (const c of P.COTTAGES) {
    for (const [key, geo, noCast] of cottageParts(c)) {
      kit.put(key, key === 'glow' ? M.glow : M.paint, stand(geo, c.x, c.z, -0.08, c.yaw), { noCast });
    }
  }
}

// ---- the square -----------------------------------------------------------------------------------------------------------------------
const BAUBLES = Object.freeze([0xe0524a, 0xf2c14e, 0x6aa8e8, 0xf4ecd8, 0xe0524a, 0xf2c14e]);
// A fir by tiers: stacked open cones painted green at the foot to snow at the point, on a trunk. `s` scales it (1 = 4.5 m).
export function firParts(s, tiers) {
  const parts = [];
  const H = 4.5 * s;
  parts.push([cyl(0.12 * s, 0.18 * s, H * 0.3, 5).translate(0, H * 0.15, 0), COL.woodDark]);
  for (let t = 0; t < tiers; t++) {
    const f = t / tiers;
    const r = (1.55 - 1.1 * f) * s;
    const h = H * (0.42 - 0.06 * f);
    const y = H * (0.18 + 0.68 * f);
    const cone = new THREE.ConeGeometry(r, h, 7, 1, true).translate(0, y + h / 2, 0);
    const g = cone.toNonIndexed();
    cone.dispose();
    g.computeVertexNormals();
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    const pos = g.attributes.position;
    const col = new Float32Array(pos.count * 3);
    for (let v = 0; v < pos.count; v++) {
      const k = clamp01((pos.getY(v) - y) / h);
      _c.setHex(COL.fir).lerp(_d.setHex(COL.firLight), 0.4 * Math.sin(t * 2.1 + pos.getX(v) * 1.7) ** 2).lerp(_d.setHex(COL.snowBright), clamp01(k * 1.15 - 0.15) * 0.85);
      col[v * 3] = _c.r; col[v * 3 + 1] = _c.g; col[v * 3 + 2] = _c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    parts.push([g, null]);
  }
  return parts;
}
// Each fir has its own width and height from its place (a slim spire, a broad one, a squat one), so no two read alike.
const jig = (i, n) => { const v = Math.sin(i * 12.9898 + n * 78.233) * 43758.5453; return v - Math.floor(v); };
function putFir(kit, M, k, noCast, i) {
  const wf = 0.78 + 0.5 * jig(i, 1); const hf = 0.88 + 0.3 * jig(i, 2);
  for (const [geo, hex] of firParts(k.s, k.tiers)) {
    const g = hex === null ? geo : paint(geo, hex);
    kit.put(noCast ? 'treeBack' : 'tree', M.paint, stand(g.scale(wf, hf, wf), k.x, k.z, -0.1, k.x * 7), { noCast });
  }
}
export function drawFirs(kit, M) {
  P.scatterFirs().forEach((k, i) => putFir(kit, M, k, k.rim, i));
}

export function drawSquare(kit, M) {
  // the village fir: a tall fir with baubles and a gold star, and snow at its foot
  const F = P.SQUARE_FIR;
  for (const [geo, hex] of firParts(F.h / 4.5, 5)) kit.put('paint', M.paint, stand(hex === null ? geo : paint(geo, hex), F.x, F.z, -0.05));
  BAUBLES.forEach((hex, i) => {
    for (let n = 0; n < 4; n++) {
      const f = (i * 4 + n) / 24;
      const a = (i * 4 + n) * 2.4;
      const r = (1.5 - 1.1 * (0.15 + 0.7 * f)) * (F.h / 4.5) * 0.8;
      kit.put('glow', M.glow, hot(paint(stand(ball(0.1, 5, 4), F.x + Math.cos(a) * r, F.z + Math.sin(a) * r, F.h * (0.22 + 0.62 * f)), hex), 1.5), { noCast: true });
    }
  });
  kit.put('glow', M.glow, hot(paint(stand(new THREE.OctahedronGeometry(0.28, 0), F.x, F.z, F.h + 0.12), 0xffd45a), 2), { noCast: true });
  // the cocoa stall: a counter, two posts, a striped awning with snow on it, and a few mugs
  const S = P.STALL;
  const sp = (geo, noCast = false) => kit.put('paint', M.paint, stand(geo, S.x, S.z, 0, S.yaw), { noCast });
  sp(paint(box(S.w, 0.95, 0.7).translate(0, 0.475, S.d / 2 - 0.35), COL.wood));
  sp(paint(box(S.w + 0.1, 0.1, 0.9).translate(0, 0.99, S.d / 2 - 0.35), COL.cream));
  for (const sx of [-1, 1]) sp(paint(box(0.12, 2.3, 0.12).translate(sx * (S.w / 2 - 0.1), 1.15, S.d / 2 - 0.1), COL.woodDark));
  for (const sx of [-1, 1]) sp(paint(box(0.12, 2.1, 0.12).translate(sx * (S.w / 2 - 0.1), 1.05, -S.d / 2 + 0.1), COL.woodDark));
  for (let i = 0; i < 6; i++) sp(paint(box(S.w / 6, 0.07, S.d + 0.7).translate(-S.w / 2 + S.w / 12 + (i * S.w) / 6, 2.38 + (i % 2) * 0.005, 0.05), i % 2 ? 0xf4ecd8 : 0xc8483f));
  sp(paint(box(S.w + 0.2, 0.16, S.d + 0.8).translate(0, 2.5, 0.05), COL.snowBright), true);
  for (let i = 0; i < 4; i++) sp(paint(cyl(0.07, 0.06, 0.13, 6).translate(-1 + i * 0.6, 1.1, S.d / 2 - 0.35), i % 2 ? 0xe0524a : 0xf4ecd8));
  // the postcard board: two posts and a board (the pinned notices are stage b's, snowvilledetail.js)
  const B = P.BOARD;
  const bp = (geo, hex, key = 'paint') => kit.put(key, key === 'glow' ? M.glow : M.paint, stand(paint(geo, hex), B.x, B.z, 0, B.yaw));
  for (const sx of [-1, 1]) bp(box(0.14, 2.2, 0.14).translate(sx * 0.95, 1.1, 0), COL.woodDark);
  bp(box(2.2, 1.3, 0.1).translate(0, 1.5, 0), COL.wood);
  bp(box(2.4, 0.14, 0.3).translate(0, 2.22, 0), COL.snowBright);
  // the snowman: three balls, a carrot, two coals and two sticks (its scarf comes with the story)
  const N = P.SNOWMAN;
  const nm = (geo, hex) => kit.put('paint', M.paint, stand(paint(geo, hex), N.x, N.z, 0, 0.6));
  nm(ball(0.6, 8, 6).translate(0, 0.5, 0), COL.snowBright); nm(ball(0.45, 8, 6).translate(0, 1.3, 0), COL.snowBright); nm(ball(0.32, 8, 6).translate(0, 1.95, 0), COL.snowBright);
  nm(new THREE.ConeGeometry(0.06, 0.34, 5).rotateX(Math.PI / 2).translate(0, 1.95, 0.4), 0xe8782a);
  for (const sx of [-1, 1]) { nm(ball(0.04, 4, 3).translate(sx * 0.11, 2.03, 0.28), 0x22252c); nm(cyl(0.02, 0.02, 0.8, 4).rotateZ(sx * 1.2).translate(sx * 0.7, 1.4, 0), COL.woodDark); }
  // lamp posts, lit at golden hour: an iron post, a glass globe and a cap of snow
  for (const l of P.LAMPS) {
    kit.put('paint', M.paint, paint(stand(cyl(0.05, 0.08, 2.6, 6), l.x, l.z, 1.3), COL.iron));
    kit.put('glow', M.glow, hot(paint(stand(ball(0.24, 7, 5), l.x, l.z, 2.75), 0xffe2a8), 1.9), { noCast: true }); // lit at golden hour
    kit.put('paint', M.paint, paint(stand(new THREE.ConeGeometry(0.34, 0.22, 7), l.x, l.z, 3.08), COL.snowBright), { noCast: true });
  }
}

// ---- drifts and rocks -------------------------------------------------------------------------------------------------------------------
export function drawDrifts(kit, M) {
  P.scatterDrifts().forEach((k, i) => kit.put('paint', M.paint, paint(stand(ball(k.s, 8, 5).scale(1.6, 0.4, 1), k.x, k.z, -0.08, k.yaw), i % 3 ? COL.snowBright : COL.snow, Math.sin(i * 2.3)), { noCast: true }));
}
export function drawRocks(kit, M) {
  P.scatterRocks().forEach((k, i) => {
    kit.put('paint', M.paint, paint(stand(new THREE.DodecahedronGeometry(k.s, 0).scale(1, 0.75, 1).translate(0, k.s * 0.3, 0), k.x, k.z, 0, k.yaw), COL.rock, Math.sin(i * 2.7)));
    kit.put('paint', M.paint, paint(stand(ball(k.s * 0.8, 7, 4).scale(1, 0.4, 1).translate(0, k.s * 0.78, 0), k.x, k.z, 0, k.yaw), COL.snowBright), { noCast: true });
  });
}

// ---- the place's ONE real light ----------------------------------------------------------------------------------------------------------
// The brazier's warm glow. Made at build at a steady strength (so the shader's light count never changes mid-walk); the life only breathes it.
// test/snowvilleworld.test.js counts the PointLights in the built scene.
export const LIGHT = Object.freeze({ color: 0xffb070, intensity: 1.6, distance: 15, decay: 2, y: 1.7 });
export function drawLight() {
  const l = new THREE.PointLight(LIGHT.color, LIGHT.intensity, LIGHT.distance, LIGHT.decay);
  l.name = 'snowville:light';
  l.position.set(P.BRAZIER.x, P.snowY(P.BRAZIER.x, P.BRAZIER.z) + LIGHT.y, P.BRAZIER.z);
  l.castShadow = false;
  return l;
}

// The shared glow of a find: a soft ring of light, moved to wherever a find is made and shown for a moment.
export function createFindGlow() {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.9, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0xfff4d8, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending, forceSinglePass: true }),
  );
  mesh.name = 'snowville:findGlow';
  mesh.visible = false;
  mesh.castShadow = false;
  Object.assign(mesh.userData, { noCast: true, noContactShadow: true, noMerge: true });
  return mesh;
}
