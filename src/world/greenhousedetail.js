// =============================================================================
// THE GREENHOUSE BEAUTY ROUND (2026-11-27): the lawn and the court laid in small things. Grass tufts along the paths, the hedges, the
// pond and the feet of the trees; daisy and clover patches on the lawn; moss in the flagstone joints; fallen petals on the court and
// the paths; pebbles in the wet bank of the pond. Nothing here is a mesh of its own: the calls fold these into the existing merged
// meshes (ghFoliage and ghGround, both noCast), so the draw count is the one it was. Every spot is a hash of its index (hash01
// and a salt); nothing draws a random number or reads a clock. It is paid for by the cheap shapes elsewhere (flat pads for
// the flat slabs, octahedron pebbles, two-triangle thin stems, open tree trunks), so the triangle total goes down.
// =============================================================================

import * as THREE from 'three';
import { hash01 } from './warehouselook.js';
import * as P from './greenhouseplan.js';
import { tint, flowerGeometry } from './greenhouseplants.js';

// (its own memo: greenhouseplants.js imports this file, so its const memo is not there yet when this module loads)
const memo = (make) => { let v; return () => (v ??= make()); };

const SALT = 0x61d7e;
const TAU = Math.PI * 2;
const h = (i, a, k) => hash01(i, a, SALT + k);
const lerp = (a, b, t) => a + (b - a) * t;

// A tuft of grass: three blades standing 60 degrees apart, one triangle each, dark at the foot and bright at the tip.
const TUFT = memo(() => {
  const pos = [], col = [];
  const lo = new THREE.Color(0x3f7a38), hi = new THREE.Color(0x9ccc62);
  for (let b = 0; b < 3; b++) {
    const a = b * (Math.PI / 3), cx = Math.cos(a) * 0.05, cz = Math.sin(a) * 0.05;
    const lean = 0.05 + 0.03 * b;
    pos.push(-cx, 0, -cz, cx, 0, cz, Math.cos(a + 1.2) * lean, 0.15 + 0.05 * b, Math.sin(a + 1.2) * lean);
    col.push(lo.r, lo.g, lo.b, lo.r, lo.g, lo.b, hi.r, hi.g, hi.b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
});
const DAISY = memo(() => flowerGeometry({ r: 0.1, n: 4, petal: 0xfaf6ee, centre: 0xf4c93a, lift: 0.1 }));
const PINK_DAISY = memo(() => flowerGeometry({ r: 0.09, n: 4, petal: 0xf2a6c4, centre: 0xf4c93a, lift: 0.1 }));
const CLOVER = memo(() => tint(new THREE.CircleGeometry(1, 6).rotateX(-Math.PI / 2), 0x4f9a44));
const MOSS = memo(() => tint(new THREE.CircleGeometry(1, 5).rotateX(-Math.PI / 2), 0x4a7a3a));
const PETAL = memo(() => tint(new THREE.PlaneGeometry(0.1, 0.06).rotateX(-Math.PI / 2), 0xffffff));
const PEBBLE = memo(() => tint(new THREE.OctahedronGeometry(1, 0), 0x9a9a8c));
const PETALS = [0xf2a0c0, 0xe8506a, 0xf6d460, 0xf0a050, 0xfaf0f4];

// Is a lawn spot free: inside the bounds, clear of the glass, the court and its paths, the pond, the fountain ring, the shed and every collider.
function lawnFree(x, z) {
  const B = P.GREENHOUSE_BOUNDS;
  if (x < B.minX + 1 || x > B.maxX - 1 || z < B.minZ + 1 || z > B.maxZ - 1) return false;
  if (P.underGlass(x, 0.5, z) || z < 1.5) return false;
  const C = P.COURT;
  if (x > C.x0 - 0.4 && x < C.x1 + 0.4 && z > C.z0 - 0.4) return false;
  if (Math.abs(x) < 1.9 && (z < P.FOUNTAIN.z + 5.8 || z < 26.5)) return false;
  if (Math.hypot(x - P.POND.x, z - P.POND.z) < P.POND.r + 0.75) return false;
  if (Math.hypot(x - P.FOUNTAIN.x, z - P.FOUNTAIN.z) < P.FOUNTAIN.r + 2.5) return false;
  const S = P.SHED;
  if (Math.abs(x - S.x) < S.w / 2 + 0.7 && Math.abs(z - S.z) < S.d / 2 + 0.7) return false;
  if (Math.abs(x - P.KITCHEN_BED.x) < 6 && z > 23 && z < 29.5) return false;
  return !P.GREENHOUSE_COLLIDERS.some((k) => Math.hypot(x - k.x, z - k.z) < k.r + 0.3);
}

// The lawn, for the foliage mesh (col is its collector): tufts along the paths, hedges, pond and trees, then daisy and clover patches.
export function lawnDetail(col) {
  // a spot gets one tuft and, half the time, a smaller one beside it, so the grass grows in clumps
  const put = (x, z, i, k) => {
    one(x, z, i, k, 1);
    if (h(i, k, 50) < 0.55) one(x + (h(i, k, 51) - 0.5) * 0.3, z + (h(i, k, 52) - 0.5) * 0.3, i + 700, k, 0.7);
  };
  const one = (x, z, i, k, sz) => col.add(TUFT(), x, 0, z, { yaw: h(i, k, 1) * TAU, scale: sz * lerp(0.9, 1.5, h(i, k, 2)), sy: sz * lerp(0.8, 1.3, h(i, k, 3)), k: lerp(0.85, 1.12, h(i, k, 4)), warm: (h(i, k, 5) - 0.4) * 0.5 });
  let n = 0;
  // both edges of the two paths and of the court
  for (const [z0, z1] of [[1.8, P.FOUNTAIN.z - 5.7], [P.FOUNTAIN.z + 5.7, 26]]) {
    for (let z = z0; z < z1; z += 0.8) for (const sx of [-1, 1]) {
      if (h(n++, 7, 6) < 0.3) continue;
      put(sx * (1.55 + h(n, 8, 7) * 0.35), z + (h(n, 9, 8) - 0.5) * 0.5, n, 1);
    }
  }
  // the feet of the hedges, both sides
  for (const [x0, z0, x1, z1] of P.HEDGES) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    for (let t = 0.3; t < len; t += 0.6) for (const side of [-1, 1]) {
      if (h(n++, 11, 9) < 0.25) continue;
      const x = x0 + ((x1 - x0) * t) / len, z = z0 + ((z1 - z0) * t) / len + side * (0.62 + h(n, 12, 10) * 0.25);
      if (lawnFreeLoose(x, z)) put(x, z, n, 2);
    }
  }
  // the lawn rim of the pond and the feet of the trees
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * TAU + h(i, 13, 11) * 0.2, r = P.POND.r + 0.7 + h(i, 14, 12) * 0.5;
    if (a > 0.1 && a < 1.0) continue;
    put(P.POND.x + Math.cos(a) * r, P.POND.z + Math.sin(a) * r, i, 3);
  }
  P.TREE_SPOTS.forEach(([x, z], i) => {
    for (let j = 0; j < 2; j++) {
      const a = h(i, j, 13) * TAU;
      put(x + Math.cos(a) * 0.8, z + Math.sin(a) * 0.8, i * 3 + j, 4);
    }
  });
  // daisy and clover patches on the open lawn: nine patches of three or four daisies, eleven clover mats
  for (let p = 0; p < 9; p++) {
    let cx = 0, cz = 0, tries = 0;
    do { cx = lerp(-34, 34, h(p, 20 + tries, 14)); cz = lerp(3, 34, h(p, 40 + tries, 15)); tries++; } while (!lawnFree(cx, cz) && tries < 12);
    if (!lawnFree(cx, cz)) continue;
    const m = 3 + (p % 2);
    for (let j = 0; j < m; j++) col.add(p % 3 === 2 ? PINK_DAISY() : DAISY(), cx + (h(p, j, 16) - 0.5) * 1.1, 0.03, cz + (h(p, j, 17) - 0.5) * 1.1, { yaw: h(p, j, 18) * TAU, scale: lerp(1.1, 1.7, h(p, j, 19)) });
    put(cx, cz, 300 + p, 5);
  }
  for (let p = 0; p < 11; p++) {
    let cx = 0, cz = 0, tries = 0;
    do { cx = lerp(-34, 34, h(p, 60 + tries, 21)); cz = lerp(3, 34, h(p, 80 + tries, 22)); tries++; } while (!lawnFree(cx, cz) && tries < 12);
    if (!lawnFree(cx, cz)) continue;
    col.add(CLOVER(), cx, 0.012, cz, { yaw: h(p, 5, 23) * TAU, scale: lerp(0.14, 0.26, h(p, 6, 24)), sy: 1, k: lerp(0.85, 1.15, h(p, 7, 25)), warm: (h(p, 8, 26) - 0.5) * 0.4 });
  }
}
// a looser test for the feet of the hedges: only the bounds, the glass and the colliders (the hedge itself is a collider run, so a hair of margin)
function lawnFreeLoose(x, z) {
  const B = P.GREENHOUSE_BOUNDS;
  if (x < B.minX + 1 || x > B.maxX - 1 || z < B.minZ + 1 || z > B.maxZ - 1) return false;
  if (Math.hypot(x - P.POND.x, z - P.POND.z) < P.POND.r + 0.5) return false;
  const C = P.COURT;
  if (x > C.x0 && x < C.x1 && z > C.z0) return false;
  return !P.GREENHOUSE_COLLIDERS.some((k) => k.r > 0.45 && Math.hypot(x - k.x, z - k.z) < k.r);
}

// The court and the paths, for the ground mesh (col is its collector): moss in the joints, fallen petals, pebbles in the wet bank of the pond.
export function groundDetail(col) {
  const C = P.COURT;
  const onPath = (i, k) => {
    // a spot on the court (ring 0), the north path (1) or the south path (2)
    const t = h(i, k, 30), u = h(i, k + 1, 31);
    const w = h(i, k + 2, 32);
    if (w < 0.55) return [lerp(C.x0 + 0.5, C.x1 - 0.5, t), lerp(C.z0 + 0.5, C.z1 - 0.5, u)];
    if (w < 0.8) return [lerp(-1.1, 1.1, t), lerp(P.FOUNTAIN.z + 5.6, 25.8, u)];
    return [lerp(-1.1, 1.1, t), lerp(0.3, P.FOUNTAIN.z - 5.6, u)];
  };
  for (let i = 0; i < 30; i++) {
    const [x, z] = onPath(i, 1);
    col.add(MOSS(), x, 0.03, z, { yaw: h(i, 4, 33) * TAU, scale: lerp(0.05, 0.13, h(i, 5, 34)), sy: 1, k: lerp(0.8, 1.15, h(i, 6, 35)), warm: (h(i, 7, 36) - 0.4) * 0.4 });
  }
  for (let i = 0; i < 44; i++) {
    const [x, z] = onPath(i + 50, 9);
    const hue = PETALS[Math.floor(h(i, 10, 37) * PETALS.length) % PETALS.length];
    const g = PETAL();
    const c = new THREE.Color(hue);
    const colAttr = g.attributes.color;
    for (let v = 0; v < colAttr.count; v++) colAttr.setXYZ(v, c.r, c.g, c.b);
    col.add(g, x, 0.032, z, { yaw: h(i, 11, 38) * TAU, scale: lerp(1.3, 2.4, h(i, 12, 39)) });
  }
  // pebbles in the wet bank, outside the stone ring
  for (let i = 0; i < 14; i++) {
    const a = h(i, 13, 40) * TAU;
    if (a > 0.1 && a < 1.0) continue;
    const r = P.POND.r + 0.55 + h(i, 14, 41) * 0.5, s = lerp(0.04, 0.08, h(i, 15, 42));
    col.add(PEBBLE(), P.POND.x + Math.cos(a) * r, s * 0.4, P.POND.z + Math.sin(a) * r, { yaw: a * 5, scale: s, sy: s * 0.6, k: lerp(0.75, 1.15, h(i, 16, 43)) });
  }
}
