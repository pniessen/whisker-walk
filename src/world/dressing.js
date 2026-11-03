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
