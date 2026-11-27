// =============================================================================
// THE JUNGLE LODGE: THE DRAWING KIT (milestone J1). The green ground (one vertex-coloured heightfield with the river's muddy banks), the river's brown shallows, the stone ring and
// its soft door of light, the signpost and the moss pool, the lodge (raised deck, body, thatched roof over the veranda, rails, lantern), the log bridge and stepping stones, the
// giant leaves, the trees, ferns and mossy stones. Pieces are gathered by material and merged: a handful of meshes. No canvas, no Math.random: every number is jungleplan.js's.
// The place's ONE real light is made here (the veranda lantern's), never more.
// =============================================================================

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { litMaterial } from '../render/materials.js';
import * as P from './jungleplan.js';
import { shapedTreeParts, noBase } from './jungletrees.js';

export const COL = Object.freeze({
  wood: 0xa87a4c, woodDark: 0x6a4a2e, thatch: 0xb59c58, thatchDark: 0x8a7640, trunk: 0x7a5a3a, leaf: 0x3f8a3e, leafLight: 0x6ab04a, leafDeep: 0x2c6a36, stone: 0x8c9486, moss: 0x5f9a46,
  warm: 0xffd9a0, rope: 0xc8b078, water: 0x7a6a48, waterEdge: 0x93906a,
});
const FLOWERS = Object.freeze([0xf0508a, 0xffb02e, 0xf4f0e0, 0xc66cf0]);

const _c = new THREE.Color();
const _d = new THREE.Color();
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// A soft round dot (a 32 x 32 data texture, no canvas) so the mist is round and not square.
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
  for (let v = min; v < max - 1e-6; v += 1.6) out.push(v);
  for (let i = 0; i <= outer; i++) out.push(max + ((edge - max) * i) / outer);
  return out;
}

function groundColour(x, z, out) {
  const L = P.JUNGLE_LOOK;
  _c.setHex(L.grass);
  _d.setHex(L.grassShade);
  const mottle = 0.5 + 0.5 * Math.sin(x * 0.55 + Math.sin(z * 0.4) * 2) * Math.cos(z * 0.5 + x * 0.1);
  _c.lerp(_d, 0.45 * mottle);
  const rd = P.riverDist(x, z);
  _c.lerp(_d.setHex(0x9a8a58), clamp01(1 - (rd - 1.5) / 3.2) * 0.75); // the muddy banks
  _c.lerp(_d.setHex(L.mud), clamp01(1 - rd / 2.6) * 0.8); // the bed
  const ring = Math.hypot(x - P.RING.x, z - P.RING.z - 2);
  _c.lerp(_d.setHex(0xb8b08a), clamp01(1 - ring / 6) * 0.5); // worn earth round the stones
  const dx = Math.max(P.LODGE.x0 - x, 0, x - P.LODGE.x1);
  const dz = Math.max(P.LODGE.z0 - z, 0, z - P.LODGE.z1);
  _c.lerp(_d.setHex(0xa88a5a), clamp01(1 - Math.hypot(dx, dz) / P.LODGE.skirt) * 0.7); // the lodge's packed earth terrace
  groundVariety(x, z, _c, _d);
  out[0] = _c.r; out[1] = _c.g; out[2] = _c.b;
}

// J8 ground variety: leaf-litter browns, wet dark loam, sun-dapple yellow-greens and a faint accent wash per zone, all from smooth sines (no random number, so the heights and layout stay put),
// plus the worn dirt path from the ring to the lodge steps and on to the bridge. Painted last so the river's banks keep their mud.
const ZONE_WASH = Object.freeze({ ring: 0xd8d27a, lodge: 0xc89a6a, grove: 0xe0b45a, river: 0x6a9ea0, canopy: 0x3a7a62 });
function groundVariety(x, z, c, d) {
  const rd = P.riverDist(x, z);
  const bank = clamp01((rd - 2.4) / 3); // 0 in the water's bed, 1 on dry ground
  const litter = clamp01(Math.sin(x * 0.21 + Math.sin(z * 0.17) * 2.4) * Math.sin(z * 0.19 - x * 0.07) * 3.4 - 0.2);
  c.lerp(d.setHex(0x8a6a3c), litter * 0.8 * bank); // leaf litter, brown
  const wet = clamp01(Math.sin(x * 0.13 + 1.7) * Math.cos(z * 0.16 - 0.6) * 3 - 0.4);
  c.lerp(d.setHex(0x2c4a2c), wet * 0.7 * bank); // damp dark loam
  const dapple = clamp01(Math.sin(x * 0.33 + z * 0.29 + 2) * Math.sin(x * 0.17 - z * 0.23) * 3.4 - 0.4);
  c.lerp(d.setHex(0xa6c85a), dapple * 0.6 * bank); // sun-dapple, yellow-green
  for (const k of P.ZONES) {
    const f = clamp01(1 - Math.hypot(x - k.x, z - k.z) / (k.r * 1.5));
    c.lerp(d.setHex(ZONE_WASH[k.id]), f * f * 0.45);
  }
  // the path: ring -> lodge steps -> bridge (a smooth distance to two segments)
  const seg = (ax, az, bx, bz) => {
    const vx = bx - ax; const vz = bz - az;
    const t = clamp01(((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz));
    return Math.hypot(x - (ax + vx * t), z - (az + vz * t));
  };
  const pd = Math.min(seg(0, 28, -6, 21), seg(-6, 21, 0, 4), seg(0, 4, 10, -2.5));
  c.lerp(d.setHex(0xb49a64), clamp01(1 - pd / 1.9) * 0.6 * bank);
}

export function groundGeometry() {
  const half = P.GROUND_SIZE / 2;
  const xs = lines(P.JUNGLE_BOUNDS.minX, P.JUNGLE_BOUNDS.maxX, half, 3);
  const zs = lines(P.JUNGLE_BOUNDS.minZ, P.JUNGLE_BOUNDS.maxZ, half, 4);
  const nx = xs.length;
  const nz = zs.length;
  const pos = new Float32Array(nx * nz * 3);
  const col = new Float32Array(nx * nz * 3);
  const index = [];
  const rgb = [0, 0, 0];
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      pos[k * 3] = xs[i]; pos[k * 3 + 1] = P.jungleY(xs[i], zs[j]); pos[k * 3 + 2] = zs[j];
      groundColour(xs[i], zs[j], rgb);
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
  m.name = 'jungle:ground';
  m.receiveShadow = true;
  Object.assign(m.userData, { ground: true, noCast: true, noContactShadow: true, noMerge: true });
  return m;
}

// ---- the kit: pieces gathered by material, one merged mesh per bucket ------------------------------------------------------------
export function createKit(prefix) {
  const buckets = new Map();
  return {
    put(key, mat, geo, { noCast = false } = {}) {
      const id = key + (noCast ? ':soft' : '');
      let b = buckets.get(id);
      if (!b) buckets.set(id, (b = { key, mat, noCast, geos: [] }));
      b.geos.push(geo);
    },
    meshes() {
      return [...buckets.values()].map((b) => {
        const m = new THREE.Mesh(b.geos.length === 1 ? b.geos[0] : mergeGeometries(b.geos), b.mat);
        m.name = `${prefix}:${b.key}${b.noCast ? 'Soft' : ''}`;
        m.castShadow = !b.noCast;
        m.receiveShadow = true;
        Object.assign(m.userData, { noContactShadow: true, noMerge: true });
        if (b.noCast) m.userData.noCast = true;
        return m;
      });
    },
  };
}

export function jungleMaterials() {
  return {
    paint: litMaterial(0xffffff, { vertexColors: true, roughness: 0.85 }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true }), // the door of light, the windows, the lantern
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

// Place a built piece: turn it `ry` about the vertical at the origin, then stand it at (x, z), dy over the ground there.
const stand = (geo, x, z, dy = 0, ry = 0) => {
  if (ry) geo.rotateY(ry);
  geo.translate(x, P.jungleY(x, z) + dy, z);
  return geo;
};
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, seg = 6) => new THREE.CylinderGeometry(rt, rb, h, seg, 1);
// A flat pad, n sides, face up at the origin: a ground slab needs no walls and no underside (a closed cylinder costs 4n triangles, a pad n).
export const pad = (n) => new THREE.CircleGeometry(1, n).rotateX(-Math.PI / 2);
const ball = (r, ws = 7, hs = 5) => new THREE.SphereGeometry(r, ws, hs);

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

// ---- the river's water: one ribbon of brown shallows, greener at the edges, lying 0.08 m under the banks ----------------------------
export function waterGeometry() {
  const pos = [];
  const col = [];
  const index = [];
  const half = 2.6;
  const pts = [];
  for (let i = 0; i < P.RIVER_PATH.length - 1; i++) {
    const [ax, az] = P.RIVER_PATH[i]; const [bx, bz] = P.RIVER_PATH[i + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 2));
    for (let s = 0; s < n; s++) pts.push([ax + ((bx - ax) * s) / n, az + ((bz - az) * s) / n, bx - ax, bz - az]);
  }
  const last = P.RIVER_PATH[P.RIVER_PATH.length - 1];
  const prev = P.RIVER_PATH[P.RIVER_PATH.length - 2];
  pts.push([last[0], last[1], last[0] - prev[0], last[1] - prev[1]]);
  for (const [cx, cz, dx, dz] of pts) {
    const len = Math.hypot(dx, dz);
    const nx = -dz / len; const nz = dx / len;
    const y = P.jungleY(cx, cz) + P.RIVER_DEPTH - 0.08;
    for (const f of [-1, -0.5, 0, 0.5, 1]) {
      pos.push(cx + nx * half * f, y, cz + nz * half * f);
      _c.setHex(COL.water).lerp(_d.setHex(COL.waterEdge), Math.abs(f) ** 2);
      col.push(_c.r, _c.g, _c.b);
    }
  }
  for (let i = 0; i < pts.length - 1; i++) {
    for (let j = 0; j < 4; j++) {
      const a = i * 5 + j; const b = a + 1; const c = a + 5; const d = c + 1;
      index.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}
export function drawWater() {
  const m = new THREE.Mesh(waterGeometry(), new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.3, metalness: 0, side: THREE.DoubleSide }));
  m.name = 'jungle:water';
  m.receiveShadow = true;
  Object.assign(m.userData, { noCast: true, noContactShadow: true, noMerge: true });
  return m;
}

// ---- the spawn: the stone ring (the gate row marks it `own`) ---------------------------------------------------------------------
export function drawSpawn(kit, M) {
  const R = P.RING;
  P.RING_STONES.forEach((s, i) => {
    const lean = Math.atan2(R.x - s.x, R.z - s.z); // each leans a little toward the middle
    const g = new THREE.DodecahedronGeometry(0.62, 0).scale(1, s.h / 1.24, 0.8).rotateZ(0.08).rotateY(lean).translate(0, s.h / 2 - 0.05, 0);
    kit.put('paint', M.paint, paint(stand(g, s.x, s.z), COL.stone, Math.sin(i * 2.1)));
    kit.put('paint', M.paint, paint(stand(ball(0.5, 6, 4).scale(1, 0.4, 0.8).translate(0, s.h - 0.05, 0), s.x, s.z), COL.moss, i), { noCast: true });
  });
  // the door of light between the two front stones: pale gold-green, deeper toward the edges so it reads as light and not a flat card
  const wdt = 2.2; const hgt = 1.9;
  const dg = stand(new THREE.PlaneGeometry(wdt, hgt, 4, 4).toNonIndexed(), R.x, R.z + 0.02, hgt / 2 + 0.1);
  const dp = dg.attributes.position; const dc = new Float32Array(dp.count * 3);
  const mid = new THREE.Color(0xf8f2c0); const edge = new THREE.Color(0xa6d68a);
  for (let v = 0; v < dp.count; v++) {
    const u = Math.abs(dp.getX(v) - R.x) / (wdt / 2);
    const w = clamp01((dp.getY(v) - P.jungleY(R.x, R.z)) / (hgt + 0.2));
    _c.copy(mid).lerp(edge, clamp01(0.55 * u * u + 0.5 * w * w));
    dc[v * 3] = _c.r; dc[v * 3 + 1] = _c.g; dc[v * 3 + 2] = _c.b;
  }
  dg.setAttribute('color', new THREE.BufferAttribute(dc, 3));
  if (!dg.attributes.normal) dg.computeVertexNormals();
  if (!dg.attributes.uv) dg.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(dp.count * 2), 2));
  kit.put('glow', M.glow, dg, { noCast: true });
  // a flat footing of old flagstones in front of the ring
  for (let i = 0; i < 5; i++) kit.put('paint', M.paint, paint(stand(pad(7).scale(0.52, 1, 0.52), R.x - 1.6 + i * 0.8, R.z + 2.2 + Math.sin(i * 1.7) * 0.25, 0.08), COL.stone, i), { noCast: true });
  // Mossy's signpost: a post and two pointing planks
  const S = P.SIGNPOST;
  kit.put('paint', M.paint, paint(stand(cyl(0.07, 0.09, 2.1, 6), S.x, S.z, 1.05), COL.woodDark));
  kit.put('paint', M.paint, paint(stand(box(1.1, 0.26, 0.05).translate(0.2, 0, 0.08), S.x, S.z, 1.85, S.yaw), COL.wood));
  kit.put('paint', M.paint, paint(stand(box(0.95, 0.24, 0.05).translate(-0.15, 0, 0.08), S.x, S.z, 1.5, S.yaw + 0.3), COL.thatch));
  // the moss pool: a shallow disc with a ring of stones
  const Q = P.MOSS_POOL;
  kit.put('paint', M.paint, paint(stand(pad(14).scale(Q.r, 1, Q.r), Q.x, Q.z, 0.04), 0x5fa6a0), { noCast: true });
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.3;
    kit.put('paint', M.paint, paint(stand(ball(0.26 + 0.05 * Math.sin(i * 3), 5, 4).scale(1, 0.6, 1), Q.x + Math.cos(a) * (Q.r + 0.15), Q.z + Math.sin(a) * (Q.r + 0.15), 0.08), COL.stone, i));
  }
}

// ---- the lodge's walls and roof as plain geometry (also read by test/junglelodge.test.js) -------------------------------------------------------------
// [geometry, colour, jitter, noCast]. The walls stand wallBase..wallTop; the roof's soffit starts at LODGE_ROOF.base == wallTop and the thatch climbs from there.
export function lodgeWallGeos() {
  const W = P.LODGE_WALL;
  const h = W.top - W.base;
  const out = [[box(W.x1 - W.x0, h, W.z1 - W.z0).translate((W.x0 + W.x1) / 2, (W.base + W.top) / 2, (W.z0 + W.z1) / 2), 0xc29a68, 0]];
  for (let i = 0; i < 5; i++) out.push([box(0.1, h, 0.06).translate(W.x0 + 1 + i * 2.25, (W.base + W.top) / 2, W.z1 + 0.04), COL.woodDark, 0]); // standing posts on the front wall
  return out;
}
const mixHex = (a, b, t) => _c.setHex(a).lerp(_d.setHex(b), t).getHex();
export function lodgeRoofGeos() {
  const R = P.LODGE_ROOF;
  const wd = R.x1 - R.x0;
  const dp = R.z1 - R.z0;
  const cx = (R.x0 + R.x1) / 2;
  const cz = (R.z0 + R.z1) / 2;
  const out = [];
  // the soffit: a flat underside closing the roof over the walls and the veranda (so nothing looks up into the sky), and the solid core with its two gable ends
  out.push([box(wd, 0.06, dp).translate(cx, R.base + 0.03, cz), COL.woodDark, 0, true]);
  out.push([gable(wd, dp, R.rise).translate(cx, R.base, cz), COL.thatchDark, 0, false]);
  // thatch rows: each a slab laid on the slope, lowest first, a tone of its own
  const half = dp / 2;
  const ang = Math.atan2(R.rise, half);
  const rowL = Math.hypot(half, R.rise) / R.rows;
  for (let r = 0; r < R.rows; r++) {
    const mid = (r + 0.5) * rowL; // along the slope from the eave
    const hex = mixHex(r % 2 ? COL.thatch : COL.thatchDark, 0xcab870, (r % 3) * 0.18 + r * 0.02);
    for (const side of [-1, 1]) {
      const slab = box(wd + 0.14 - r * 0.03, 0.1 + (R.rows - r) * 0.008, rowL + 0.1).translate(0, 0.06, 0).rotateX(side * ang);
      slab.translate(cx, R.base + mid * Math.sin(ang), cz + side * (half - mid * Math.cos(ang)));
      out.push([slab, hex, r, false]);
    }
  }
  return out;
}

// ---- the lodge ---------------------------------------------------------------------------------------------------------------------
export function drawLodge(kit, M) {
  const L = P.LODGE;
  const cx = (L.x0 + L.x1) / 2;
  const w = L.x1 - L.x0;
  const top = L.deck; // the deck's top over the ground's zero (the packed terrace is raised by the same)
  const put = (key, geo, hex, jit = 0, noCast = false) => kit.put(key, key === 'glow' ? M.glow : M.paint, paint(geo, hex, jit), { noCast });
  const at = (geo, x, y, z) => geo.translate(x, y, z);
  // the deck's boards
  put('paint', at(box(w + 0.4, 0.14, L.z1 - L.z0 + 0.4), cx, top, (L.z0 + L.z1) / 2), COL.wood, 0, true);
  for (let i = 0; i < 7; i++) put('paint', at(box(w + 0.42, 0.02, 0.05), cx, top + 0.075, L.wallZ + 0.7 + i * 0.64), COL.woodDark, 0, true);
  // the body: warm timber walls (shared with the roof's base by jungleplan.js's LODGE_WALL / LODGE_ROOF), a double door, a window each side and one on each end
  const W = P.LODGE_WALL;
  for (const [geo, hex, jit] of lodgeWallGeos()) put('paint', geo, hex, jit);
  put('paint', at(box(1.9, 2.1, 0.1), cx, top + 1.12, L.wallZ + 0.05), COL.woodDark); // the double door
  put('paint', at(box(0.05, 2.0, 0.04), cx, top + 1.12, L.wallZ + 0.11), COL.wood);
  for (const sx of [-1, 1]) put('glow', at(box(1.3, 0.9, 0.06), cx + sx * 3.5, top + 1.5, L.wallZ + 0.04), COL.warm);
  for (const sx of [-1, 1]) put('glow', at(box(0.06, 0.9, 1.2), cx + sx * (w / 2 + 0.02), top + 1.5, 11.8), COL.warm);
  // six posts holding the veranda roof (their tops ARE the wall top), a top rail and a low rail along the front (open at the steps) and the two ends
  for (const p of P.LODGE_POSTS) put('paint', at(cyl(0.11, 0.13, W.top - top, 6), p.x, (W.top + top) / 2, p.z), COL.woodDark);
  const front = [[L.x0, -6 - P.STEPS.w / 2], [-6 + P.STEPS.w / 2, L.x1]];
  for (const [a, b] of front) for (const ry of [0.95, 0.5]) put('paint', at(box(b - a, 0.07, 0.07), (a + b) / 2, top + ry, L.z1 - 0.2), COL.wood);
  for (const sx of [L.x0, L.x1]) for (const ry of [0.95, 0.5]) put('paint', at(box(0.07, 0.07, L.z1 - L.wallZ), sx + (sx === L.x0 ? 0.2 : -0.2), top + ry, (L.wallZ + L.z1) / 2), COL.wood);
  // the thatched roof over the whole house: its base sits ON the wall top and overhangs every wall; rows of thatch, each its own tone, over a solid core and a soffit
  for (const [geo, hex, jit, nc] of lodgeRoofGeos()) put('paint', geo, hex, jit, nc);
  // the ramp: the deck's front, sloping down to the ground between the open rail posts
  const run = L.skirt;
  const ramp = box(P.STEPS.w - 0.4, 0.08, Math.hypot(run, top)).rotateX(Math.atan2(top, run));
  put('paint', ramp.translate(P.STEPS.x, P.jungleY(P.STEPS.x, L.z1 + run / 2) + 0.06, L.z1 + run / 2), COL.wood, 0, true);
  const eave = P.LODGE_ROOF.base; // the front eave's height: the wall top
  // the lantern on its cord from the middle rafter (its real light is drawLight's), and hanging vines at the front eave
  const Lt = P.LANTERN;
  put('paint', at(cyl(0.015, 0.015, 0.7, 4), Lt.x, top + Lt.y + 0.1, Lt.z), COL.rope, 0, true);
  put('glow', at(ball(0.2, 7, 5), Lt.x, top + Lt.y - 0.3, Lt.z), COL.warm, 0, true);
  for (let i = 0; i < 9; i++) {
    const x = L.x0 + 0.6 + i * 1.2 + Math.sin(i * 2.3) * 0.2;
    const len = 1.1 + (0.6 * ((i * 7) % 5)) / 4;
    put('paint', at(cyl(0.025, 0.02, len, 4), x, eave + 0.6 - len / 2 - 0.05, L.z1 + 0.85), COL.leafDeep, i, true);
    put('paint', at(ball(0.11, 4, 3).scale(1.6, 0.6, 1), x, eave + 0.6 - len - 0.05, L.z1 + 0.85), COL.leafLight, i, true);
  }
}

// ---- the river's crossings: a fallen log bridge and a line of stepping stones --------------------------------------------------------
export function drawCrossings(kit, M) {
  const B = P.LOG_BRIDGE;
  const y = P.jungleY(B.x, B.z) + 0.22;
  kit.put('paint', M.paint, paint(cyl(0.55, 0.62, B.len, 8).rotateX(Math.PI / 2).translate(B.x, y, B.z), COL.trunk));
  for (const sz of [-1, 1]) { // a rope rail on two posts at each bank
    kit.put('paint', M.paint, paint(stand(cyl(0.05, 0.06, 1.3, 5), B.x + 0.75, B.z + sz * (B.len / 2 - 0.5), 0.65), COL.woodDark));
  }
  kit.put('paint', M.paint, paint(cyl(0.02, 0.02, B.len - 1, 4).rotateX(Math.PI / 2).translate(B.x + 0.75, P.jungleY(B.x, B.z) + 1.15, B.z), COL.rope), { noCast: true });
  P.STEPPING.forEach((s, i) => kit.put('paint', M.paint, paint(stand(noBase(cyl(0.55, 0.62, 0.3, 7)), s.x, s.z, -0.05, i), COL.stone, i), { noCast: true }));
}

// ---- giant leaves, trees, ferns and mossy stones -------------------------------------------------------------------------------------
export function drawLeaves(kit, M) {
  P.LEAVES.forEach((l, i) => {
    kit.put('paint', M.paint, paint(stand(noBase(cyl(0.07, 0.1, l.h, 5)), l.x, l.z, l.h / 2), COL.leafDeep));
    const cone = new THREE.ConeGeometry(l.r, 0.7, 10, 1, true).scale(1, 1, 0.8).translate(0, l.h + 0.15, 0);
    kit.put('paint', M.paint, paint(stand(cone, l.x, l.z, 0, l.yaw), i % 2 ? COL.leaf : COL.leafLight, i));
  });
}

// A tree: a tapered trunk and three rounded lumps of leaves (broad) or a bare trunk with a crown of six drooping fronds (palm). `s` scales it (1 = 7 m).
const TREE_COL = Object.freeze({ ...COL, dead: 0x8f8574, fungus: 0xe0b878, nut: 0x6a4a2a });
export function treeParts(k) {
  if (k.shape) return shapedTreeParts(k, TREE_COL); // round two: the tree's own shape and height (jungletrees.js); the green wall keeps the plain look below
  const parts = [];
  const s = k.s;
  if (k.kind === 'palm') {
    const H = 6.4 * s;
    parts.push([noBase(cyl(0.1 * s, 0.17 * s, H, 6)).translate(0, H / 2, 0), COL.trunk]);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + k.x;
      const frond = new THREE.ConeGeometry(0.3 * s, 3 * s, 4).scale(1, 1, 0.3).translate(0, 1.5 * s, 0).rotateZ(-1.15).rotateY(a).translate(0, H, 0);
      parts.push([frond, i % 2 ? COL.leaf : COL.leafLight]);
    }
    return parts;
  }
  const H = 5 * s;
  parts.push([noBase(cyl(0.2 * s, 0.34 * s, H, 6)).translate(0, H / 2, 0), COL.trunk]);
  const lumps = [[0, H + 0.8 * s, 0, 2.3], [-1.2, H + 0.1 * s, 0.6, 1.8], [1.3, H + 0.3 * s, -0.5, 1.9]];
  lumps.forEach(([lx, ly, lz, r], i) => parts.push([new THREE.IcosahedronGeometry(r * s, 0).scale(1, 0.75, 1).translate(lx * s, ly, lz * s), i === 0 ? COL.leafLight : i === 1 ? COL.leaf : COL.leafDeep]));
  return parts;
}
function putTree(kit, M, k, back) {
  treeParts(k).forEach(([geo, hex], i) => kit.put(back ? 'treeBack' : 'tree', M.paint, stand(paint(geo, hex, i), k.x, k.z, -0.1, k.x * 5), { noCast: back }));
}
export function drawTrees(kit, M) {
  const trees = P.scatterTrees();
  for (const k of trees) putTree(kit, M, k, k.rim);
  trees.filter((k) => !k.rim && k.s > 1.2 && (k.shape === 'broad' || k.shape === 'emergent')).forEach((k, i) => { // a hanging vine under the bigger crowns
    const len = 2.6;
    kit.put('paint', M.paint, paint(stand(cyl(0.025, 0.02, len, 4), k.x + 0.7 * k.s, k.z + 0.5 * k.s, (k.top ?? 4.6 * k.s) - 2.6 * k.s * 0.3 - len / 2), COL.leafDeep, i), { noCast: true });
    kit.put('paint', M.paint, paint(stand(ball(0.12, 4, 3).scale(1.6, 0.6, 1), k.x + 0.7 * k.s, k.z + 0.5 * k.s, (k.top ?? 4.6 * k.s) - 2.6 * k.s * 0.3 - len), COL.leafLight, i), { noCast: true });
  });
}
export function drawFerns(kit, M) {
  P.scatterFerns().forEach((k, i) => {
    for (let b = 0; b < 4; b++) {
      const a = k.yaw + (b / 4) * Math.PI * 2;
      const blade = new THREE.ConeGeometry(0.13 * k.s, 1.0 * k.s, 4).scale(1, 1, 0.4).translate(0, 0.5 * k.s, 0).rotateZ(0.65).rotateY(a);
      kit.put('paint', M.paint, paint(stand(blade, k.x, k.z, -0.03), b % 2 ? COL.leaf : COL.leafLight, i + b), { noCast: true });
    }
    if (k.flower >= 0) kit.put('paint', M.paint, paint(stand(ball(0.13 * k.s, 5, 4), k.x, k.z, 0.5 * k.s), FLOWERS[k.flower]), { noCast: true });
  });
}
export function drawStones(kit, M) {
  P.scatterStones().forEach((k, i) => {
    kit.put('paint', M.paint, paint(stand(new THREE.DodecahedronGeometry(k.s, 0).scale(1, 0.75, 1).translate(0, k.s * 0.3, 0), k.x, k.z, 0, k.yaw), COL.stone, Math.sin(i * 2.7)));
    kit.put('paint', M.paint, paint(stand(ball(k.s * 0.8, 7, 4).scale(1, 0.4, 1).translate(0, k.s * 0.78, 0), k.x, k.z, 0, k.yaw), COL.moss), { noCast: true });
  });
}

// ---- the place's ONE real light ----------------------------------------------------------------------------------------------------------
// The veranda lantern's warm glow. Made at build at a steady strength (so the shader's light count never changes mid-walk); the life only breathes it.
// test/jungleworld.test.js counts the PointLights in the built scene.
export const LIGHT = Object.freeze({ color: 0xffc27a, intensity: 1.5, distance: 14, decay: 2 });
export function drawLight() {
  const l = new THREE.PointLight(LIGHT.color, LIGHT.intensity, LIGHT.distance, LIGHT.decay);
  l.name = 'jungle:light';
  l.position.set(P.LANTERN.x, P.jungleY(P.LANTERN.x, P.LANTERN.z) + P.LANTERN.y - 0.3, P.LANTERN.z);
  l.castShadow = false;
  return l;
}

// The shared glow of a find: a soft sphere of light, moved to wherever a find is made and shown for a moment.
export function createFindGlow() {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.9, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0xfff4d8, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending, forceSinglePass: true }),
  );
  mesh.name = 'jungle:findGlow';
  mesh.visible = false;
  mesh.castShadow = false;
  Object.assign(mesh.userData, { noCast: true, noContactShadow: true, noMerge: true });
  return mesh;
}
