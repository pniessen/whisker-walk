import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { hash01 } from './builder.js';

// Shared helpers for the River and Moor beauty pass: vertex-coloured dressing
// merged into one non-casting mesh, flat ground paint, and a few shape
// generators. Nothing here draws Math.random itself; callers wrap the calls
// that create Three objects in withLocalUuids so the uuids stay local.

// Under paths (0.01), contact shadows (0.015) and puddles (0.02).
export const PAINT_Y = 0.005;

const _c = new THREE.Color();

// Small shared helpers for the River's and the Moor's dressing (riverdress.js,
// moordress.js): pure maths, plus Tris, which makes a Three geometry only
// when its geometry() is called (inside the caller's withLocalUuids).
export const r2 = (v) => Math.round(v * 100) / 100;
export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const smoothstep = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
// Distance from (x, z) to an axis-aligned rect (0 inside it).
export const rectDist = (d, x, z) => Math.hypot(
  Math.max(d.minX - x, 0, x - d.maxX), Math.max(d.minZ - z, 0, z - d.maxZ));
// A list worked out on first call and kept.
export const once = (fn) => { let v; return () => (v ??= fn()); };
export const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
// A hex colour (sRGB) as linear [r, g, b].
export const lin = (hex) => { _c.setHex(hex); return [_c.r, _c.g, _c.b]; };
export const scale3 = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
export const unit = (x, y, z) => { const l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; };

// Collects raw triangles (position, normal, colour per vertex) into one
// geometry with colorParts' attributes, so it merges with the rest.
export class Tris {
  constructor() { this.p = []; this.n = []; this.c = []; }
  v(x, y, z, n, c) { this.p.push(x, y, z); this.n.push(n[0], n[1], n[2]); this.c.push(c[0], c[1], c[2]); }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.p), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(this.n), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.c), 3));
    return g;
  }
}

// A NON-indexed copy of `geo` carrying only position, normal and a 3-component
// vertex colour. `color` is a hex number, [r,g,b] (linear 0..1) or a function
// (x, y, z) => [r,g,b] of the vertex position. Disposes the input if it had
// to convert it.
export function colorParts(geo, color) {
  const src = geo.index ? geo.toNonIndexed() : geo;
  if (src !== geo) geo.dispose();
  const pos = src.attributes.position;
  if (!src.attributes.normal) src.computeVertexNormals();
  const n = pos.count;
  const col = new Float32Array(n * 3);
  let fixed = null;
  if (typeof color === 'number') {
    _c.setHex(color);
    fixed = [_c.r, _c.g, _c.b];
  } else if (Array.isArray(color)) {
    fixed = color;
  }
  for (let i = 0; i < n; i++) {
    const rgb = fixed || color(pos.getX(i), pos.getY(i), pos.getZ(i));
    col[i * 3] = rgb[0];
    col[i * 3 + 1] = rgb[1];
    col[i * 3 + 2] = rgb[2];
  }
  // For a non-indexed input the output shares its position/normal attributes.
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', pos);
  out.setAttribute('normal', src.attributes.normal);
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}

function mergeParts(geoms) {
  if (geoms.length === 0) return new THREE.BufferGeometry();
  return geoms.length === 1 ? geoms[0] : mergeGeometries(geoms, false);
}

export function dressMesh(geoms, { name, side = THREE.DoubleSide, roughness = 0.95 } = {}) {
  const mesh = new THREE.Mesh(
    mergeParts(geoms),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness, metalness: 0, side }),
  );
  mesh.name = name;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.userData.noCast = true;
  return mesh;
}

// Thin double-sided dressing (grass blades, cattail stems) is lit by the
// normals it was built with on BOTH faces: three.js flips a DoubleSide
// normal on a back face, so a blade seen from behind would point its normal
// down and go dark. Closed shapes (lobes, caps) only ever show their front
// faces, so leaving the flip out changes nothing for them. But any OPEN shell
// whose inside is what the camera sees (a flower cup, a bowl) must carry
// normals for the side that is seen: with the flip gone, a back face is lit
// by the normal as built.
const NORMAL_BEGIN_NO_FLIP = THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', '');
export function bothSidesLit(material) {
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>', NORMAL_BEGIN_NO_FLIP);
  };
  material.customProgramCacheKey = () => 'dressing-both-sides-v1';
  return material;
}

// Flat paint just above the ground: every vertex is put on PAINT_Y.
export function paintMesh(geoms, { name = 'groundPaint' } = {}) {
  const geo = mergeParts(geoms);
  const p = geo.attributes.position;
  if (p) {
    for (let i = 0; i < p.count; i++) p.setY(i, PAINT_Y);
    p.needsUpdate = true;
  }
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.95,
      metalness: 0,
      side: THREE.FrontSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
  );
  mesh.name = name;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.userData.noCast = true;
  return mesh;
}

function resample(points, step) {
  const out = [];
  for (let s = 0; s < points.length - 1; s++) {
    const [x0, z0] = points[s];
    const [x1, z1] = points[s + 1];
    const len = Math.hypot(x1 - x0, z1 - z0);
    const k = Math.max(1, Math.round(len / step));
    for (let j = 0; j < k; j++) {
      const t = j / k;
      out.push([x0 + (x1 - x0) * t, z0 + (z1 - z0) * t]);
    }
  }
  out.push(points[points.length - 1].slice());
  return out;
}

// A flat ribbon in XZ at y 0 facing +y, along a polyline, with an irregular
// edge: each side's half-width wobbles per sample.
export function ribbon(points, halfW, { salt = 0, wobble = 0.35, step = 0.8 } = {}) {
  const pts = resample(points, step);
  const n = pts.length;
  const L = [];
  const R = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)];
    const c = pts[Math.min(n - 1, i + 1)];
    let dx = c[0] - a[0];
    let dz = c[1] - a[1];
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    // Left of travel on the XZ plane (viewed from +y): (dz, -dx).
    const wl = halfW * (1 + wobble * (hash01(i, 0, salt) * 2 - 1));
    const wr = halfW * (1 + wobble * (hash01(i, 1, salt) * 2 - 1));
    L.push([pts[i][0] + dz * wl, pts[i][1] - dx * wl]);
    R.push([pts[i][0] - dz * wr, pts[i][1] + dx * wr]);
  }
  const pos = [];
  const tri = (p, q, r) => {
    pos.push(p[0], 0, p[1], q[0], 0, q[1], r[0], 0, r[1]);
  };
  for (let i = 0; i < n - 1; i++) {
    tri(L[i], R[i], L[i + 1]);
    tri(R[i], R[i + 1], L[i + 1]);
  }
  return flatGeometry(pos);
}

function flatGeometry(pos) {
  const g = new THREE.BufferGeometry();
  const arr = new Float32Array(pos);
  const nrm = new Float32Array(arr.length / 3 * 3);
  for (let i = 1; i < nrm.length; i += 3) nrm[i] = 1;
  g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  return g;
}

// A flat irregular disc in XZ at y 0 facing +y: a fan of n triangles.
export function blob(x, z, r, { n = 8, salt = 0, wobble = 0.3 } = {}) {
  const rim = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (1 + wobble * (hash01(x + i, z, salt) * 2 - 1));
    rim.push([x + Math.cos(a) * rr, z + Math.sin(a) * rr]);
  }
  const pos = [];
  for (let i = 0; i < n; i++) {
    const p = rim[i];
    const q = rim[(i + 1) % n];
    pos.push(x, 0, z, q[0], 0, q[1], p[0], 0, p[1]);
  }
  return flatGeometry(pos);
}

// Multiplies the ground mesh's `color` attribute in place by fn(worldX, worldZ).
// Uses mesh.matrix (call updateMatrix() first); makes no Three object.
export function tintGround(groundMesh, fn) {
  const attr = groundMesh.geometry.attributes.color;
  const pos = groundMesh.geometry.attributes.position;
  const e = groundMesh.matrix.elements;
  for (let i = 0; i < pos.count; i++) {
    const lx = pos.getX(i);
    const ly = pos.getY(i);
    const lz = pos.getZ(i);
    const wx = e[0] * lx + e[4] * ly + e[8] * lz + e[12];
    const wz = e[2] * lx + e[6] * ly + e[10] * lz + e[14];
    const m = fn(wx, wz);
    attr.setXYZ(i, attr.getX(i) * m[0], attr.getY(i) * m[1], attr.getZ(i) * m[2]);
  }
  attr.needsUpdate = true;
}

// Three sines in directions/phases from hash01; roughly -1..1.
export function smoothField(x, z, salt, wavelength) {
  let s = 0;
  for (let k = 0; k < 3; k++) {
    const ang = hash01(0, 0, salt + k) * Math.PI * 2;
    const ph = hash01(0, 0, salt + k + 10) * Math.PI * 2;
    const w = wavelength * (0.7 + 0.3 * k);
    s += Math.sin(((x * Math.cos(ang) + z * Math.sin(ang)) / w) * Math.PI * 2 + ph);
  }
  return s / 3;
}
