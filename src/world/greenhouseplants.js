// =============================================================================
// THE GREENHOUSE'S PLANTS (milestone 1). Palms, banana plants, tree ferns, ferns, bird-of-paradise, monstera,
// hibiscus, orchids on their benches, reeds, and the koi under the pond's surface.
//
// HOW IT IS KEPT CHEAP. Every plant is a few KINDS of small geometry (a frond, a paddle leaf, a heart leaf, a trunk, a
// flower) made once, then PLACED by a matrix and merged into a handful of vertex-coloured meshes by kind of use:
//   * ghPalms   the palm trunks and crowns (the only shadow casters here: six trees),
//   * ghFoliage everything green and low (bananas, tree ferns, ferns, hero plants, hibiscus, reeds): noCast,
//   * ghOrchids the benches, pots, stems and blooms: noCast,
//   * ghKoi     the fish, ONE shader mesh on one uTime (the swim is in the vertex shader; reduced motion freezes it).
// A plant's look (lean, frond count, size, tint) is a function of its place through hash01 and a salt; no
// Math.random, no clock. The wind is not used: the glass house is still air, and the sway would cost a draw each.
// =============================================================================

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { hash01 } from './warehouselook.js';
import * as P from './greenhouseplan.js';

export const GH_LOOK_SALT = 0x61a3d; // the plants' own hashed look
export const GH_KOI_SALT = 0x61a5b;

const _c = new THREE.Color();
const _lo = new THREE.Color();
const _hi = new THREE.Color();

// ---------------------------------------------------------------------------------------------
// Small tools. Every geometry is indexed with position, normal and colour only (so they all merge).
function finish(g) {
  g.deleteAttribute('uv');
  if (!g.attributes.normal) g.computeVertexNormals();
  return g;
}
export function tint(g, hex) {
  _c.set(hex);
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([_c.r, _c.g, _c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return finish(g);
}
function geo(pos, col, idx) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// An arching, folded ribbon: a frond or a paddle leaf. It grows along +x from the origin, rising at `rise` radians and
// bending down by `droop` over its length. `fold` lifts the two edges (a V along the midrib); `jag` pulls every other
// node's edges in (a feathered edge); `width` is the widest point. Colour runs from `base` to `tip`, the midrib darker.
export function frondGeometry({ len = 1, width = 0.3, segs = 5, rise = 1.0, droop = 1.6, fold = 0.25, jag = 0, base = 0x3b7a3a, tip = 0x6fb05a, taper = 1.6, belly = 0.35 }) {
  const pos = [];
  const col = [];
  const idx = [];
  _lo.set(base); _hi.set(tip);
  let x = 0, y = 0;
  const step = len / segs;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const th = rise - droop * t * (0.4 + 0.6 * t);
    if (i > 0) { x += Math.cos(th) * step; y += Math.sin(th) * step; }
    const nx = -Math.sin(th), ny = Math.cos(th);
    // a leaf swells from a narrow base and closes to a point
    let w = width * Math.pow(Math.max(0, Math.sin(Math.PI * Math.min(1, belly + (1 - belly) * t) * (t < 0.5 ? 0.75 + t * 0.5 : 1))), 0.8) * (1 - Math.pow(t, taper) * 0.15);
    if (i === segs) w = 0;
    if (jag && i % 2 === 1 && i < segs) w *= 1 - jag;
    const f = fold * w;
    _c.copy(_lo).lerp(_hi, t);
    const mid = _c.clone().multiplyScalar(0.78);
    const k = pos.length / 3;
    pos.push(x + nx * f, y + ny * f, -w / 2, x, y, 0, x + nx * f, y + ny * f, w / 2);
    col.push(_c.r, _c.g, _c.b, mid.r, mid.g, mid.b, _c.r, _c.g, _c.b);
    if (i > 0) {
      const p = k - 3;
      idx.push(p, k, p + 1, k, k + 1, p + 1, p + 1, k + 1, k + 2, p + 1, k + 2, p + 2);
    }
  }
  return geo(pos, col, idx);
}

// A heart leaf with a zigzag edge: a fan from the stalk's end. Lies along +x (its tip) and faces up (+y), so it is
// then tilted by its own matrix. `notches` indents the edge (a monstera's cut leaf).
export function heartGeometry({ len = 1, width = 0.9, notches = 3, base = 0x2f6f35, tip = 0x4f9a4a }) {
  const pos = [0, 0, 0];
  const col = [];
  _lo.set(base); _hi.set(tip);
  col.push(_lo.r, _lo.g, _lo.b);
  const ring = 18;
  const idx = [];
  for (let i = 0; i <= ring; i++) {
    const a = (i / ring) * Math.PI * 2; // 0 = the tip (+x), pi = the stalk's notch
    // a heart: round lobes at the back, a point at the front, a small notch behind the stalk; every other edge point
    // pulled in a little when `notches` is on (a monstera's cut edge), never enough to fold the outline over itself
    const back = Math.exp(-(((a - Math.PI) / 0.32) ** 2));
    const r = len * 0.5 * (0.8 + 0.2 * Math.cos(a)) * (1 - 0.3 * back) * (notches && i % 2 === 1 ? 0.86 : 1);
    pos.push(len * 0.45 + Math.cos(a) * r * 1.05, 0, Math.sin(a) * r * (width / len) * 1.05);
    _c.copy(_lo).lerp(_hi, (1 + Math.cos(a)) * 0.5);
    col.push(_c.r, _c.g, _c.b);
    if (i > 0) idx.push(0, i + 1, i); // wound to face up (+y)
  }
  return geo(pos, col, idx);
}

function trunkGeometry({ h, r0, r1, sides = 7, rings = 6, hex, scar = 0.1, hex2 = hex }) {
  const g = new THREE.CylinderGeometry(r1, r0, h, sides, rings, true);
  g.translate(0, h / 2, 0);
  const p = g.attributes.position;
  const col = new Float32Array(p.count * 3);
  _lo.set(hex); _hi.set(hex2);
  for (let i = 0; i < p.count; i++) {
    const ring = Math.round((p.getY(i) / h) * rings);
    const k = 1 + (ring % 2 ? scar : 0); // the leaf-scar rings
    p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k);
    _c.copy(_lo).lerp(_hi, ring % 2 ? 0.6 : 0.15);
    col.set([_c.r, _c.g, _c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  return g;
}

// A thin stalk from a to b (a 3-sided prism).
export function stalk(ax, ay, az, bx, by, bz, r, hex) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const len = Math.hypot(dx, dy, dz);
  const g = new THREE.CylinderGeometry(r * 0.7, r, len, 3, 1, true);
  g.translate(0, len / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx / len, dy / len, dz / len));
  g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(ax, ay, az), q, new THREE.Vector3(1, 1, 1)));
  return tint(g, hex);
}

// A flower of `n` petals, flat in x-z, facing up: a fan of narrow kites round a centre.
export function flowerGeometry({ r = 0.1, n = 5, petal, centre = 0xf2d34a, lift = 0.25 }) {
  const pos = [0, 0.012, 0];
  const col = [];
  _c.set(centre); col.push(_c.r, _c.g, _c.b);
  const idx = [];
  _lo.set(petal);
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 0.5) / n) * Math.PI * 2, a2 = ((i + 1) / n) * Math.PI * 2;
    const k = pos.length / 3;
    pos.push(Math.cos(a0) * r * 0.35, 0.01, Math.sin(a0) * r * 0.35, Math.cos(a1) * r, lift * r, Math.sin(a1) * r, Math.cos(a2) * r * 0.35, 0.01, Math.sin(a2) * r * 0.35);
    _c.copy(_lo);
    col.push(_c.r * 0.92, _c.g * 0.92, _c.b * 0.92, _c.r, _c.g, _c.b, _c.r * 0.92, _c.g * 0.92, _c.b * 0.92);
    idx.push(0, k, k + 1, 0, k + 1, k + 2);
  }
  return geo(pos, col, idx);
}

// ---------------------------------------------------------------------------------------------
// Placing: a collector that takes a geometry and a matrix and keeps the result for one merge.
export function collector() {
  const parts = [];
  const m = new THREE.Matrix4();
  const e = new THREE.Euler(0, 0, 0, 'YXZ');
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  return {
    // add(geometry, x, y, z, { yaw, tilt, roll, scale, sy }) -- yaw about y, then tilt about x (lean), roll about z
    add(g, x, y, z, { yaw = 0, tilt = 0, roll = 0, scale = 1, sy = scale } = {}) {
      const c = g.clone();
      q.setFromEuler(e.set(tilt, yaw, roll));
      m.compose(p.set(x, y, z), q, s.set(scale, sy, scale));
      c.applyMatrix4(m);
      parts.push(c);
    },
    // a prebuilt matrix (for children of a leaning plant)
    addM(g, mat) { const c = g.clone(); c.applyMatrix4(mat); parts.push(c); },
    get count() { return parts.length; },
    merged() {
      const flat = parts.map((x) => (x.index ? x.toNonIndexed() : x));
      const g = mergeGeometries(flat, false);
      for (const x of parts) x.dispose();
      for (const x of flat) x.dispose();
      parts.length = 0;
      g.computeBoundingSphere();
      return g;
    },
  };
}

// Shared geometries are made on first use (inside a build), never when the module is loaded: loading an area draws no
// random number and paints nothing (test/areaimport.test.js).
export const memo = (make) => { let v; return () => (v ??= make()); };
const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);
const h01 = (x, z, k) => hash01(x, z, GH_LOOK_SALT + k);
const lerp = (a, b, t) => a + (b - a) * t;
export const plantMat = () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0, side: THREE.DoubleSide });
export const finishMesh = (name, geometry, { cast = false, material = plantMat() } = {}) => {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.userData.noMerge = true;
  mesh.castShadow = cast;
  mesh.receiveShadow = false;
  if (!cast) mesh.userData.noCast = true;
  return mesh;
};

// ---------------------------------------------------------------------------------------------
// THE PALMS: a ringed trunk with a slight lean, a crown of arched fronds and a tuft of young ones standing up.
const PALM_FROND = memo(() => frondGeometry({ len: 3.9, width: 0.5, segs: 7, rise: 0.75, droop: 2.0, fold: 0.3, jag: 0.38, base: 0x2f6b34, tip: 0x62a74c }));
const PALM_YOUNG = memo(() => frondGeometry({ len: 2.2, width: 0.26, segs: 5, rise: 1.35, droop: 0.9, fold: 0.3, jag: 0.3, base: 0x3f8a3c, tip: 0x85c25a }));
export function palms() {
  const col = collector();
  const m = new THREE.Matrix4();
  P.PALM_SPOTS.forEach(([x, z, h], k) => {
    const lean = (h01(x, z, 1) - 0.5) * 0.09;
    const yaw0 = h01(x, z, 2) * TAU;
    const trunk = trunkGeometry({ h, r0: 0.34, r1: 0.2, sides: 7, rings: Math.round(h * 1.1), hex: 0x8a6c4c, hex2: 0x6b5238, scar: 0.12 });
    col.add(trunk, x, 0, z, { yaw: yaw0, tilt: lean });
    // the crown sits at the trunk's leaning top
    const top = new THREE.Vector3(0, h, 0).applyEuler(new THREE.Euler(lean, yaw0, 0, 'YXZ'));
    const cx = x + top.x, cy = top.y, cz = z + top.z;
    const n = 10 + (k % 3);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + yaw0 + (h01(x + i, z, 3) - 0.5) * 0.3;
      const s = lerp(0.82, 1.12, h01(x + i * 3, z, 4));
      // a frond's local +x is its length; turn it round y to point out, a little tilt up or down by hash
      m.compose(new THREE.Vector3(cx, cy, cz), new THREE.Quaternion().setFromAxisAngle(UP, -a), new THREE.Vector3(s, s * lerp(0.85, 1.1, h01(x, z + i, 5)), s));
      col.addM(PALM_FROND(), m);
    }
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + yaw0 + 0.6;
      m.makeRotationY(-a).setPosition(cx, cy + 0.1, cz);
      col.addM(PALM_YOUNG(), m);
    }
    // a hanging bunch of dates under the crown
    col.add(tint(new THREE.IcosahedronGeometry(0.2, 0).scale(1, 1.4, 1), 0xb8742f), cx, cy - 0.35, cz, { yaw: a0(k) });
  });
  return finishMesh('ghPalms', col.merged(), { cast: true });
}
const a0 = (k) => k * 1.3;

// ---------------------------------------------------------------------------------------------
// BANANAS, TREE FERNS, FERNS, HERO PLANTS, HIBISCUS AND REEDS: the low foliage, one mesh.
const BANANA_LEAF = memo(() => frondGeometry({ len: 2.7, width: 0.95, segs: 5, rise: 1.0, droop: 1.55, fold: 0.18, jag: 0.12, base: 0x3a8a3a, tip: 0x7ac25a, belly: 0.5 }));
const TREEFERN_FROND = memo(() => frondGeometry({ len: 2.0, width: 0.5, segs: 6, rise: 0.8, droop: 1.8, fold: 0.3, jag: 0.4, base: 0x2f6f3a, tip: 0x78b95a }));
const FERN_FROND = memo(() => frondGeometry({ len: 1.1, width: 0.26, segs: 4, rise: 0.95, droop: 1.9, fold: 0.25, jag: 0.4, base: 0x347a3c, tip: 0x7fc062 }));
const BIRD_LEAF = memo(() => frondGeometry({ len: 1.35, width: 0.5, segs: 4, rise: 0.15, droop: 0.5, fold: 0.1, jag: 0, base: 0x2f7a3a, tip: 0x55a54a, belly: 0.55 }));
const MONSTERA_LEAF = memo(() => heartGeometry({ len: 1.0, width: 0.95, notches: 1, base: 0x2a6a34, tip: 0x4c9b48 }));
const HIBISCUS_LEAF = memo(() => frondGeometry({ len: 0.34, width: 0.2, segs: 2, rise: 0.4, droop: 0.4, fold: 0.1, base: 0x2e7236, tip: 0x4f9a46, belly: 0.5 }));
const REED_BLADE = memo(() => frondGeometry({ len: 1.3, width: 0.07, segs: 3, rise: 1.45, droop: 0.7, fold: 0.2, base: 0x6f9a4a, tip: 0xa8c26a, belly: 0.4 }));
const HIBISCUS_FLOWER = memo(() => flowerGeometry({ r: 0.2, n: 5, petal: 0xe03a3a, centre: 0xf6d44a, lift: 0.3 }));
const BIRD_BOAT = memo(() => (() => { const g = new THREE.ConeGeometry(0.07, 0.5, 4); g.translate(0, 0.25, 0); g.rotateZ(-Math.PI / 2); return tint(g, 0x5a7a3a); })());
const BIRD_ORANGE = memo(() => frondGeometry({ len: 0.42, width: 0.1, segs: 2, rise: 0.75, droop: 0.2, fold: 0.1, base: 0xf08a1c, tip: 0xffb23a, belly: 0.5 }));
const BIRD_BLUE = memo(() => frondGeometry({ len: 0.34, width: 0.07, segs: 2, rise: 0.7, droop: 0.1, fold: 0.1, base: 0x3a58b8, tip: 0x5a82e0, belly: 0.5 }));

export function foliage() {
  const col = collector();
  const radial = (g, x, y, z, n, { yaw0 = 0, scale = 1, tilt = 0, jit = 0.2, seed = 0 } = {}) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + yaw0 + (h01(x + i, z, seed) - 0.5) * jit;
      const s = scale * lerp(0.82, 1.14, h01(x, z + i * 1.7, seed + 1));
      col.add(g, x, y, z, { yaw: -a, scale: s, roll: tilt + (h01(x + 5, z + i, seed + 2) - 0.5) * 0.25 });
    }
  };
  // banana plants: a green pseudo-stem and a few huge leaves, one already tattered by the glass's wind
  P.BANANA_SPOTS.forEach(([x, z]) => {
    const h = lerp(2.0, 2.6, h01(x, z, 10));
    col.add(trunkGeometry({ h, r0: 0.24, r1: 0.14, sides: 6, rings: 4, hex: 0x7aa04a, hex2: 0x5f8a3a, scar: 0.05 }), x, 0, z, {});
    radial(BANANA_LEAF(), x, h, z, 7, { yaw0: h01(x, z, 11) * TAU, seed: 12 });
    // a purple flower bud and a little hand of green bananas hanging from the crown
    col.add(tint(new THREE.ConeGeometry(0.11, 0.42, 5).rotateX(Math.PI), 0x6e2a5a), x + 0.35, h - 0.35, z, {});
    col.add(tint(new THREE.CapsuleGeometry(0.045, 0.2, 2, 5), 0x9acb4a), x + 0.36, h - 0.7, z, { roll: 0.1 });
    col.add(tint(new THREE.CapsuleGeometry(0.045, 0.2, 2, 5), 0x9acb4a), x + 0.46, h - 0.66, z, { roll: -0.1 });
  });
  // tree ferns
  P.TREE_FERN_SPOTS.forEach(([x, z], k) => {
    const h = k === 4 ? 2.1 : lerp(2.2, 3.1, h01(x, z, 20));
    col.add(trunkGeometry({ h, r0: 0.22, r1: 0.16, sides: 6, rings: 5, hex: 0x6a4a34, hex2: 0x4e3626, scar: 0.07 }), x, k === 4 ? 0.2 : 0, z, {});
    radial(TREEFERN_FROND(), x, (k === 4 ? 0.2 : 0) + h, z, 12, { yaw0: h01(x, z, 21) * TAU, seed: 22 });
    radial(FERN_FROND(), x, (k === 4 ? 0.2 : 0) + h + 0.05, z, 4, { yaw0: 0.4, tilt: -0.7, scale: 0.8, seed: 23 });
  });
  // the fern island: a low stone ring and ferns round the tree fern
  const I = P.ISLAND;
  col.add(tint(new THREE.CylinderGeometry(I.r, I.r + 0.1, 0.22, 14, 1, false), 0x7d8a72), I.x, 0, I.z, {});
  col.add(tint(new THREE.CylinderGeometry(I.r - 0.08, I.r - 0.08, 0.26, 14), 0x4a3a2a), I.x, 0, I.z, {});
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.3;
    radial(FERN_FROND(), I.x + Math.cos(a) * 0.95, 0.24, I.z + Math.sin(a) * 0.95, 5, { yaw0: a, scale: 0.9, seed: 30 + i });
  }
  // ferns along the walls and at the palms' feet (clumps of five or six fronds)
  for (const [x, z] of fernClumps()) {
    radial(FERN_FROND(), x, 0, z, 6, { yaw0: h01(x, z, 40) * TAU, scale: lerp(0.8, 1.25, h01(x, z, 41)), seed: 42 });
  }
  // bird-of-paradise: paddle leaves on long stalks and two flowers
  P.BIRD_SPOTS.forEach(([x, z]) => {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + h01(x, z, 50) * TAU;
      const sh = lerp(0.9, 1.7, h01(x + i, z, 51));
      const out = 0.28 + 0.1 * h01(x, z + i, 52);
      col.add(stalk(x, 0, z, x + Math.cos(a) * out, sh, z + Math.sin(a) * out, 0.022, 0x6a9a3a), 0, 0, 0, {});
      col.add(BIRD_LEAF(), x + Math.cos(a) * out, sh, z + Math.sin(a) * out, { yaw: -a, scale: lerp(0.9, 1.15, h01(x, z + i, 53)) });
    }
    for (let f = 0; f < 2; f++) {
      const a = h01(x, z, 54 + f) * TAU;
      const fx = x + Math.cos(a) * 0.35, fz = z + Math.sin(a) * 0.35, fh = 1.75 + f * 0.25;
      col.add(stalk(x, 0, z, fx, fh, fz, 0.02, 0x4a7a32), 0, 0, 0, {});
      col.add(BIRD_BOAT(), fx, fh, fz, { yaw: -a + 0.4, roll: 0.3 });
      for (let p = 0; p < 3; p++) col.add(BIRD_ORANGE(), fx, fh + 0.05, fz, { yaw: -(a + (p - 1) * 0.5), roll: 0.35 + p * 0.05 });
      for (let p = 0; p < 2; p++) col.add(BIRD_BLUE(), fx, fh + 0.02, fz, { yaw: -(a + (p - 0.5) * 0.7 + 0.2), roll: 0.05 });
    }
  });
  // monstera: heart leaves, each on its own stalk, facing up and out
  P.MONSTERA_SPOTS.forEach(([x, z]) => {
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU + h01(x, z, 60) * TAU;
      const sh = lerp(0.5, 1.15, h01(x + i, z, 61));
      const out = 0.3 + 0.2 * h01(x, z + i, 62);
      const lx = x + Math.cos(a) * out, lz = z + Math.sin(a) * out;
      col.add(stalk(x, 0, z, lx, sh, lz, 0.025, 0x4a8a3a), 0, 0, 0, {});
      col.add(MONSTERA_LEAF(), lx, sh, lz, { yaw: -a, roll: lerp(0.55, 0.85, h01(x + i, z, 63)), scale: lerp(0.85, 1.2, h01(x, z + i, 64)) });
    }
  });
  // hibiscus: a bush of branches, small leaves and big red flowers
  P.HIBISCUS_SPOTS.forEach(([x, z]) => {
    for (let b = 0; b < 5; b++) {
      const a = (b / 5) * TAU + h01(x, z, 70);
      const bx = x + Math.cos(a) * 0.38, bz = z + Math.sin(a) * 0.38, bh = lerp(1.0, 1.5, h01(x + b, z, 71));
      col.add(stalk(x, 0, z, bx, bh, bz, 0.03, 0x5a3f2a), 0, 0, 0, {});
      for (let l = 0; l < 5; l++) {
        const la = a + (l - 2) * 0.7;
        col.add(HIBISCUS_LEAF(), bx + Math.cos(la) * 0.08, bh - 0.12 * l * 0.3, bz + Math.sin(la) * 0.08, { yaw: -la, roll: 0.25, scale: 1.1 });
      }
      if (b % 2 === 0) col.add(HIBISCUS_FLOWER(), bx, bh + 0.05, bz, { yaw: h01(x + b, z, 72) * TAU, tilt: 0.2, scale: 1 });
    }
  });
  // reeds at the pond's rim
  for (const [x, z] of reedClumps()) {
    radial(REED_BLADE(), x, 0, z, 5, { yaw0: h01(x, z, 80) * TAU, scale: lerp(0.8, 1.3, h01(x, z, 81)), seed: 82, tilt: 0 });
  }
  return finishMesh('ghFoliage', col.merged());
}

// Fern clumps: along the hall's walls (out of the doors' way and the benches') and at each palm's foot.
export function fernClumps() {
  const out = [];
  const H = P.PALM_HOUSE;
  const clearOfDoor = (x, z) => {
    for (const d of P.PALM_DOORS) {
      const dd = d.side === 'south' || d.side === 'north' ? Math.hypot(x - d.x, z - d.z) : Math.hypot(x - d.x, z - (H.z0 + H.z1) / 2);
      if (dd < 3.2) return false;
    }
    return true;
  };
  const onBench = (x, z) => P.ORCHID_BENCHES.some((b) => Math.abs(x - b.x) < b.w / 2 + 0.7 && Math.abs(z - b.z) < b.d / 2 + 0.8);
  const near = (x, z) => P.GREENHOUSE_COLLIDERS.some((k) => Math.hypot(x - k.x, z - k.z) < k.r + 0.35);
  const edge = 1.0;
  for (let x = H.x0 + 1.6; x <= H.x1 - 1.6; x += 1.9) for (const z of [H.z1 - edge, H.z0 + edge]) {
    const jx = x + (h01(x, z, 90) - 0.5) * 0.7;
    if (clearOfDoor(jx, z) && !onBench(jx, z) && !near(jx, z)) out.push([jx, z]);
  }
  for (let z = H.z0 + 3; z <= H.z1 - 3; z += 1.9) for (const x of [H.x0 + edge, H.x1 - edge]) {
    const jz = z + (h01(x, z, 91) - 0.5) * 0.7;
    if (clearOfDoor(x, jz) && !near(x, jz)) out.push([x, jz]);
  }
  for (const [x, z] of P.PALM_SPOTS) {
    for (let i = 0; i < 2; i++) {
      const a = h01(x, z, 92 + i) * TAU;
      const fx = x + Math.cos(a) * 1.0, fz = z + Math.sin(a) * 1.0;
      if (!near(fx, fz) && clearOfDoor(fx, fz)) out.push([fx, fz]);
    }
  }
  // outside: a few at the hall's outer foot and about the pond
  for (const [x, z] of [[-15.6, -3], [-15.4, -15], [15.6, -3], [15.4, -15], [-18, 12.5], [-19.5, 24], [-33.5, 12], [-32, 23.5], [-26, 26.4]]) out.push([x, z]);
  return out;
}
export function reedClumps() {
  const out = [];
  const n = 14;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + h01(i, 3, 100) * 0.2;
    if (a > 0.2 && a < 0.9) continue; // a gap on the south-east side where she wades in
    const r = P.POND.r + 0.15 + h01(i, 5, 101) * 0.4;
    out.push([P.POND.x + Math.cos(a) * r, P.POND.z + Math.sin(a) * r]);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// ORCHIDS: two long benches along the north wall, five potted orchids on each, a different colour per pot.
const ORCHID_COLOURS = Object.freeze([0xf27ab8, 0xf6f0f4, 0xb07ae0, 0xf5b042, 0x7aa0f2, 0xe84a7a]);
const ORCHID_LEAF = memo(() => frondGeometry({ len: 0.5, width: 0.1, segs: 3, rise: 0.6, droop: 1.0, fold: 0.3, base: 0x2f7a3a, tip: 0x5aa84a, belly: 0.5 }));
const BENCH_WOOD = 0xa07a52;
export function orchids() {
  const col = collector();
  const pot = tint(new THREE.CylinderGeometry(0.15, 0.11, 0.2, 8), 0xb8613c);
  const soil = tint(new THREE.CylinderGeometry(0.14, 0.14, 0.02, 8), 0x3a2a1a);
  P.ORCHID_BENCHES.forEach((b, bi) => {
    // the bench: a slab on four legs, a shelf under it
    col.add(tint(new THREE.BoxGeometry(b.w, 0.07, b.d), BENCH_WOOD), b.x, b.h - 0.035, b.z, {});
    col.add(tint(new THREE.BoxGeometry(b.w - 0.2, 0.05, b.d - 0.1), 0x8a6642), b.x, 0.3, b.z, {});
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) col.add(tint(new THREE.BoxGeometry(0.08, b.h, 0.08), 0x7a5a3a), b.x + sx * (b.w / 2 - 0.1), b.h / 2, b.z + sz * (b.d / 2 - 0.1), {});
    for (let i = 0; i < 5; i++) {
      const x = b.x - b.w / 2 + 0.4 + i * ((b.w - 0.8) / 4);
      const z = b.z + (i % 2 ? 0.1 : -0.08);
      const y = b.h;
      col.add(pot, x, y, z, {});
      col.add(soil, x, y + 0.19, z, {});
      for (let l = 0; l < 3; l++) col.add(ORCHID_LEAF(), x, y + 0.2, z, { yaw: -((l / 3) * TAU + i), scale: 1 });
      // an arching flower stem with five blooms
      const colour = ORCHID_COLOURS[(i + bi * 2) % ORCHID_COLOURS.length];
      const sa = h01(x, z, 110) * TAU;
      const px = [0, 0.1, 0.2, 0.26, 0.28];
      for (let s = 0; s < 4; s++) {
        col.add(stalk(x + Math.cos(sa) * px[s], y + 0.2 + s * 0.14, z + Math.sin(sa) * px[s], x + Math.cos(sa) * px[s + 1], y + 0.2 + (s + 1) * 0.14, z + Math.sin(sa) * px[s + 1], 0.01, 0x4a7a3a), 0, 0, 0, {});
      }
      for (let f = 0; f < 5; f++) {
        const bx = x + Math.cos(sa) * (px[Math.min(4, f)] + 0.01), bz = z + Math.sin(sa) * (px[Math.min(4, f)] + 0.01);
        col.add(flowerGeometry({ r: 0.11, n: 5, petal: colour, centre: 0xfff0a8, lift: 0.4 }), bx, y + 0.3 + f * 0.1, bz, { tilt: 0.7, yaw: sa + f });
      }
    }
  });
  return finishMesh('ghOrchids', col.merged());
}

// ---------------------------------------------------------------------------------------------
// THE KOI: six fish, ONE shader mesh. Each fish is a strip of nodes with its own centre, radii, phase and speed in
// attributes; the vertex shader swims it round an ellipse and waves its body and tail from the one uniform uTime. A
// frozen clock (reduced motion) leaves them where they are. They stay inside the pond's open water, clear of the 1.5 m
// wading band's rim, just under the water's surface (drawn above an opaque one).
export const KOI = Object.freeze([
  { body: 0xf08a28, patch: 0xfff0e0, size: 1.4 }, { body: 0xfff0e0, patch: 0xe84a28, size: 1.55 }, { body: 0xe85a28, patch: 0x2a2a2e, size: 1.25 },
  { body: 0xf5b042, patch: 0xfff0e0, size: 1.1 }, { body: 0xfff0e0, patch: 0xf08a28, size: 1.3 }, { body: 0xd8442a, patch: 0xfff0e0, size: 1.45 },
].map((k) => Object.freeze(k)));
const KOI_PROFILE = [0.0, 0.55, 0.95, 1.0, 0.75, 0.45, 0.3, 0.9, 1.2, 0.2]; // half-widths along the body, then the tail's fan
export function koiMesh() {
  const pos = [];
  const col = [];
  const aFish = []; // cx, cz, phase, speed
  const aShape = []; // rx, rz, size, t (0 head .. 1 tail)
  const idx = [];
  const P0 = P.POND;
  KOI.forEach((k, f) => {
    const phase = hash01(f, 7, GH_KOI_SALT) * TAU;
    const speed = lerp(0.12, 0.22, hash01(f, 9, GH_KOI_SALT)) * (f % 2 ? -1 : 1);
    const cx = P0.x + (hash01(f, 11, GH_KOI_SALT) - 0.5) * 1.6;
    const cz = P0.z + (hash01(f, 13, GH_KOI_SALT) - 0.5) * 1.6;
    const rMax = P0.r - P0.shallow - 0.6;
    const rx = lerp(1.6, rMax - Math.abs(cx - P0.x), hash01(f, 15, GH_KOI_SALT));
    const rz = lerp(1.6, rMax - Math.abs(cz - P0.z), hash01(f, 17, GH_KOI_SALT));
    const base = pos.length / 3;
    const nodes = KOI_PROFILE.length;
    for (let i = 0; i < nodes; i++) {
      const t = i / (nodes - 1);
      const x = 0.34 - t * 0.7; // head forward (+x), tail back
      const w = KOI_PROFILE[i] * 0.075;
      _c.set(i === 2 || i === 3 || i === 5 ? k.patch : i >= 7 ? k.patch : k.body);
      if (i === 0) _c.set(k.body);
      for (const side of [-1, 1]) {
        pos.push(x, 0, side * w);
        col.push(_c.r, _c.g, _c.b);
        aFish.push(cx, cz, phase, speed);
        aShape.push(rx, rz, k.size, t);
      }
      if (i > 0) {
        const p = base + (i - 1) * 2, q = base + i * 2;
        idx.push(p, q, p + 1, q, q + 1, p + 1);
      }
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aFish', new THREE.Float32BufferAttribute(aFish, 4));
  g.setAttribute('aShape', new THREE.Float32BufferAttribute(aShape, 4));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(P0.x, 0, P0.z), P0.r);
  const uniforms = { uTime: { value: 0 }, uY: { value: KOI_Y } };
  // The pond's surface is opaque (render/water.js: depth is read off the shore, not through it), so the fish are drawn
  // just ABOVE it, a little see-through and tinted pond-green: they read as swimming just under the surface.
  const material = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: true, transparent: true, opacity: 0.8, depthWrite: false });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aFish;\nattribute vec4 aShape;\nuniform float uTime;\nuniform float uY;')
      .replace('#include <begin_vertex>', `
float ang = aFish.z + uTime * aFish.w;
vec2 centre = aFish.xy;
vec2 pos2 = centre + vec2(cos(ang) * aShape.x, sin(ang) * aShape.y);
vec2 vel = vec2(-sin(ang) * aShape.x, cos(ang) * aShape.y) * sign(aFish.w);
float yaw = atan(vel.y, vel.x);
float wave = sin(uTime * 3.2 + aFish.z * 3.0 - aShape.w * 5.0) * 0.07 * (0.15 + aShape.w);
vec3 transformed = vec3(position.x * aShape.z, 0.0, position.z * aShape.z + wave * aShape.z);
float cy = cos(yaw), sy = sin(yaw);
transformed = vec3(transformed.x * cy - transformed.z * sy, uY, transformed.x * sy + transformed.z * cy);
transformed.xz += pos2;`);
  };
  material.customProgramCacheKey = () => 'greenhouse-koi-v1';
  const m = new THREE.Mesh(g, material);
  m.name = 'ghKoi';
  m.userData.noCast = true;
  m.userData.noMerge = true;
  m.userData.koi = uniforms;
  m.castShadow = false;
  m.frustumCulled = false;
  m.renderOrder = 1; // after the (opaque) water
  return m;
}
export const KOI_FROZEN_TIME = 0.37;
export const KOI_Y = 0.06; // m: above the pond's surface (0.02), see the note in koiMesh
