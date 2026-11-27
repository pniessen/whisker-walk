// =============================================================================
// THE TREEHOUSE VILLAGE: THE DRAWING KIT (milestone T1). The leafy floor, the great oak, the decks on their stilts with railings and hanging lanterns, the huts
// (shells: the Bakery, the Bookshop, the Bell Tower), the stairs and the rope bridges, the forest rim and the leaf canopy overhead (above CANOPY_MIN_Y, so the camera
// at zoom step 2 never clips it). Everything solid is merged by material into a few meshes (vertex colour, one 'paint' mesh, one 'leaves' mesh that casts no shadow,
// one 'glow' mesh of lanterns and windows). No canvas, no Math.random: every number is treehouseplan.js's.
// =============================================================================

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as b from './builder.js';
import { litMaterial } from '../render/materials.js';
import * as P from './treehouseplan.js';

const L = P.TREE_LOOK;
const _c = new THREE.Color();

// Paint a geometry one colour (non-indexed, with position, normal, uv and colour so any two merge). `jitter` gives each piece its own tone.
export function paint(geo, hex, jitter = 0) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  _c.setHex(hex);
  if (jitter) _c.offsetHSL(jitter * 0.02, 0, jitter * 0.08);
  for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

export function createKit(prefix) {
  const buckets = new Map();
  return {
    put(key, mat, geo, { noCast = false } = {}) {
      let k = buckets.get(key);
      if (!k) buckets.set(key, (k = { key, mat, noCast, geos: [] }));
      k.geos.push(geo);
    },
    meshes() {
      return [...buckets.values()].map((k) => {
        const m = new THREE.Mesh(k.geos.length === 1 ? k.geos[0] : mergeGeometries(k.geos), k.mat);
        m.name = `${prefix}:${k.key}`;
        m.castShadow = !k.noCast;
        m.receiveShadow = true;
        Object.assign(m.userData, { noContactShadow: true, noMerge: true });
        if (k.noCast) m.userData.noCast = true;
        return m;
      });
    },
  };
}

export function treehouseMaterials() {
  return {
    paint: litMaterial(0xffffff, { vertexColors: true, roughness: 0.88 }),
    leaves: litMaterial(0xffffff, { vertexColors: true, roughness: 0.95 }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true }), // lantern glass and lit windows (the later milestones light them)
  };
}

// ---- small shapes, placed and painted (each returns a geometry in world space) ----------------------------------------------
const M4 = new THREE.Matrix4();
const Q = new THREE.Quaternion();
const E = new THREE.Euler();
const S = new THREE.Vector3();
const V = new THREE.Vector3();
function placed(geo, x, y, z, { yaw = 0, pitch = 0, sx = 1, sy = 1, sz = 1 } = {}) {
  Q.setFromEuler(E.set(pitch, yaw, 0, 'YXZ'));
  geo.applyMatrix4(M4.compose(V.set(x, y, z), Q, S.set(sx, sy, sz)));
  return geo;
}
// A box with its centre at (x, y, z).
const slab = (x, y, z, w, h, d, hex, { yaw = 0, pitch = 0, jitter = 0 } = {}) => paint(placed(new THREE.BoxGeometry(w, h, d), x, y, z, { yaw, pitch }), hex, jitter);
// A cylinder standing from y0 to y1.
const post = (x, z, y0, y1, r0, r1, hex, sides = 8, jitter = 0) => paint(placed(new THREE.CylinderGeometry(r1, r0, y1 - y0, sides), x, (y0 + y1) / 2, z), hex, jitter);
// A beam from (x0,y0,z0) to (x1,y1,z1), `t` thick.
function beam(x0, y0, z0, x1, y1, z1, t, hex, jitter = 0) {
  const dx = x1 - x0; const dy = y1 - y0; const dz = z1 - z0;
  const len = Math.hypot(dx, dy, dz);
  const g = new THREE.BoxGeometry(t, t, len);
  Q.setFromUnitVectors(V.set(0, 0, 1), S.set(dx / len, dy / len, dz / len));
  g.applyMatrix4(M4.compose(V.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), Q, S.set(1, 1, 1)));
  return paint(g, hex, jitter);
}
const blob = (x, y, z, s, hex, jitter, detail = 1, squash = 0.78) => paint(placed(new THREE.IcosahedronGeometry(1, detail), x, y, z, { sx: s, sy: s * squash, sz: s, yaw: (x * 7 + z * 3) % 6.28 }), hex, jitter);

// ---- the floor ------------------------------------------------------------------------------------------------------
export function drawGround() {
  const g = b.ground(160, L.floor);
  g.name = 'treehouse:ground';
  return g;
}
export function drawLitter(kit, M) {
  for (const k of P.scatterLitter()) {
    const g = paint(placed(new THREE.CylinderGeometry(k.s, k.s, 0.02, 7), k.x, 0.012, k.z), k.hue < 0.5 ? L.floorLeaf : 0x6f8a3c, k.hue * 6);
    kit.put('paint', M.paint, g, { noCast: false });
  }
}
export function drawFerns(kit, M) {
  for (const f of P.scatterFerns()) {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + f.x;
      kit.put('leaves', M.leaves, paint(placed(new THREE.ConeGeometry(0.16 * f.s, 0.9 * f.s, 5), f.x + Math.cos(a) * 0.18 * f.s, 0.4 * f.s, f.z + Math.sin(a) * 0.18 * f.s, { pitch: 0.5 * Math.cos(a), yaw: 0 }), i % 2 ? L.leafLight : L.leaf, i), { noCast: true });
    }
  }
}

// ---- the great oak ------------------------------------------------------------------------------------------------------
export function drawOak(kit, M) {
  const O = P.OAK;
  kit.put('paint', M.paint, post(O.x, O.z, 0, O.h, O.r, O.r * 0.62, L.trunk, 14, 1));
  for (let i = 0; i < 8; i++) { // the roots' flare: wedges that run out from the foot
    const a = (i / 8) * Math.PI * 2 + 0.3;
    kit.put('paint', M.paint, beam(O.x + Math.cos(a) * (O.r - 0.4), 0.9, O.z + Math.sin(a) * (O.r - 0.4), O.x + Math.cos(a) * (O.r + 1.8), 0.05, O.z + Math.sin(a) * (O.r + 1.8), 0.7, L.trunkDark, i));
  }
  // great limbs that carry the leaves
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.6;
    kit.put('paint', M.paint, beam(O.x, O.h - 3, O.z, O.x + Math.cos(a) * 5.5, O.h + 1.5, O.z + Math.sin(a) * 5.5, 0.8, L.trunkDark, i));
  }
}

// ---- the decks, their stilts, railings and lanterns -----------------------------------------------------------------------
function rail(kit, M, x0, z0, x1, z1, y) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const n = Math.max(1, Math.round(len / 1.4));
  for (let i = 0; i <= n; i++) kit.put('paint', M.paint, post(x0 + ((x1 - x0) * i) / n, z0 + ((z1 - z0) * i) / n, y, y + P.RAIL_H, 0.05, 0.05, L.plankDark, 5));
  kit.put('paint', M.paint, beam(x0, y + P.RAIL_H, z0, x1, y + P.RAIL_H, z1, 0.07, L.plank));
  kit.put('paint', M.paint, beam(x0, y + P.RAIL_H * 0.5, z0, x1, y + P.RAIL_H * 0.5, z1, 0.04, L.rope));
}
function lantern(kit, M, x, y, z) {
  kit.put('glow', M.glow, paint(placed(new THREE.SphereGeometry(0.13, 6, 5), x, y, z), L.glow), { noCast: true });
  kit.put('paint', M.paint, beam(x, y + 0.13, z, x, y + 0.55, z, 0.025, L.trunkDark));
}
export function drawDecks(kit, M) {
  for (const k of P.DECKS) {
    const x0 = k.x - k.w / 2; const x1 = k.x + k.w / 2; const z0 = k.z - k.d / 2; const z1 = k.z + k.d / 2;
    kit.put('paint', M.paint, slab(k.x, k.y - P.DECK_THICK / 2, k.z, k.w, P.DECK_THICK, k.d, L.plank, { jitter: 1 }));
    for (let i = 1; i < k.w; i++) kit.put('paint', M.paint, slab(x0 + i, k.y + 0.005, k.z, 0.03, 0.01, k.d, L.plankDark)); // plank seams
    for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) kit.put('paint', M.paint, post(x, z, 0, k.y + P.RAIL_H, 0.22, 0.22, L.trunk, 7, 1)); // the stilts, carried up as the railing's corner posts
    // the railing; the front edge (the south side) keeps a gap of 2.4 m where the hops come in
    rail(kit, M, x0, z0, x1, z0, k.y);
    rail(kit, M, x0, z0, x0, z1, k.y);
    rail(kit, M, x1, z0, x1, z1, k.y);
    const gap = 1.2;
    rail(kit, M, x0, z1, k.x - gap, z1, k.y);
    rail(kit, M, k.x + gap, z1, x1, z1, k.y);
    lantern(kit, M, x0, k.y + P.RAIL_H + 0.7, z0);
    lantern(kit, M, x1, k.y + P.RAIL_H + 0.7, z0);
    if (k.hut) drawHut(kit, M, k);
  }
}

function drawHut(kit, M, deck) {
  const h = deck.hut;
  const y = deck.y;
  if (h.roof === 'bell') { // the Bell Tower: a square tower with a pointed roof and a bell
    kit.put('paint', M.paint, slab(h.x, y + h.h / 2, h.z, h.r * 1.9, h.h, h.r * 1.9, L.wall, { jitter: 1 }));
    kit.put('paint', M.paint, paint(placed(new THREE.ConeGeometry(h.r * 1.6, 1.8, 4), h.x, y + h.h + 0.9, h.z, { yaw: Math.PI / 4 }), L.shingle));
    kit.put('paint', M.paint, paint(placed(new THREE.ConeGeometry(0.42, 0.7, 8), h.x, y + h.h - 0.9, h.z + h.r * 0.95 + 0.1), L.bell));
    kit.put('paint', M.paint, slab(h.x, y + 0.9, h.z + h.r * 0.95 + 0.01, 0.9, 1.8, 0.04, L.trunkDark)); // the door
    kit.put('glow', M.glow, slab(h.x, y + h.h * 0.62, h.z + h.r * 0.95 + 0.02, 0.7, 0.8, 0.04, L.glow), { noCast: true });
    return;
  }
  kit.put('paint', M.paint, post(h.x, h.z, y, y + h.h, h.r, h.r, L.wall, 12, 1));
  kit.put('paint', M.paint, paint(placed(new THREE.ConeGeometry(h.r + 0.45, 1.5, 12), h.x, y + h.h + 0.75, h.z), h.roof === 'thatch' ? L.thatch : L.shingle, 1));
  kit.put('paint', M.paint, slab(h.x + h.r * 0.2, y + 0.85, h.z + h.r - 0.02, 0.8, 1.7, 0.06, L.trunkDark)); // the door, on the deck's front side
  kit.put('glow', M.glow, slab(h.x - h.r * 0.55, y + h.h * 0.62, h.z + h.r * 0.82, 0.55, 0.55, 0.05, L.glow, { yaw: -0.5 }), { noCast: true });
}

// ---- stairs and ladders, and the rope bridges --------------------------------------------------------------------------------
function stairs(kit, M, x0, z0, y0, x1, z1, y1, w = 0.9) {
  const n = Math.max(2, Math.ceil((y1 - y0) / 0.32));
  const yaw = Math.atan2(x1 - x0, z1 - z0);
  for (let i = 1; i <= n; i++) {
    const t = i / (n + 1);
    kit.put('paint', M.paint, slab(x0 + (x1 - x0) * t, y0 + ((y1 - y0) * i) / n - 0.05, z0 + (z1 - z0) * t, w, 0.1, 0.5, L.plank, { yaw, jitter: i }));
  }
  const side = (s) => { const ox = Math.cos(yaw) * (w / 2) * s; const oz = -Math.sin(yaw) * (w / 2) * s; kit.put('paint', M.paint, beam(x0 + ox, y0, z0 + oz, x1 + ox, y1, z1 + oz, 0.07, L.trunkDark)); };
  side(1); side(-1);
}
function bridge(kit, M, line) {
  const w = 1.2;
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i]; const c = line[i + 1];
    const yaw = Math.atan2(c.x - a.x, c.z - a.z);
    const len = Math.hypot(c.x - a.x, c.z - a.z);
    kit.put('paint', M.paint, slab((a.x + c.x) / 2, a.y - 0.07, (a.z + c.z) / 2, w, 0.1, len + 0.1, L.plank, { yaw, jitter: i }));
    for (const s of [1, -1]) {
      const ox = Math.cos(yaw) * (w / 2) * s; const oz = -Math.sin(yaw) * (w / 2) * s;
      kit.put('paint', M.paint, beam(a.x + ox, a.y + P.RAIL_H, a.z + oz, c.x + ox, a.y + P.RAIL_H, c.z + oz, 0.05, L.rope));
      kit.put('paint', M.paint, beam(a.x + ox, a.y + P.RAIL_H * 0.45, a.z + oz, c.x + ox, a.y + P.RAIL_H * 0.45, c.z + oz, 0.03, L.rope));
      kit.put('paint', M.paint, post(a.x + ox, a.z + oz, a.y, a.y + P.RAIL_H, 0.045, 0.045, L.plankDark, 5));
    }
  }
  const last = line.at(-1);
  for (const s of [1, -1]) kit.put('paint', M.paint, post(last.x + 0.6 * s, last.z, last.y, last.y + P.RAIL_H, 0.045, 0.045, L.plankDark, 5));
  for (const p of [line[0], last]) lantern(kit, M, p.x, p.y + P.RAIL_H + 0.8, p.z);
}
export function drawWalks(kit, M) {
  const [A, B] = P.BRIDGE_LINES;
  bridge(kit, M, A);
  bridge(kit, M, B);
  // the way up: a ladder-stair at the Bakery deck's front, the stair from the deck to the branch walk, one from the Bookshop to the far platform, one up to the Crown
  stairs(kit, M, -7.4, 13.8, 0, -7.4, 12.6, 1.4);
  stairs(kit, M, -6.4, 9.2, 1.4, -4.4, 8.0, 2.8);
  stairs(kit, M, 7.2, -1.1, 2.8, 7.0, -3.4, 4.2, 1.1);
  stairs(kit, M, 2.6, -11.5, 4.2, 1.4, -13.2, 5.6);
  // the walk's first plank is a small landing on stilts, and the rope bridge's middle hangs from the oak's limbs (a thin rope up from each post)
  kit.put('paint', M.paint, slab(-4.4, 2.8 - 0.1, 8.0, 1.6, 0.18, 1.6, L.plank));
  for (const [x, z] of [[-5.1, 7.3], [-3.7, 8.7]]) kit.put('paint', M.paint, post(x, z, 0, 2.8, 0.1, 0.1, L.trunk, 6));
  for (const p of [BRIDGE_ROPES[0], BRIDGE_ROPES[1]]) kit.put('paint', M.paint, beam(p.x, p.y, p.z, p.x, p.y + 6, p.z, 0.03, L.rope));
}
const BRIDGE_ROPES = Object.freeze([{ x: 1.475, y: 3.7, z: 4.75 }, { x: 3.8, y: 5.1, z: -9.6 }]);

// ---- the post box at the roots (T2's Nutmeg stands beside it) -------------------------------------------------------------------
export function drawPostBox(kit, M) {
  const a = P.ANCHORS.postBox;
  kit.put('paint', M.paint, post(a.x, a.z, 0, 1.0, 0.07, 0.07, L.trunkDark, 6));
  kit.put('paint', M.paint, slab(a.x, 1.18, a.z, 0.5, 0.36, 0.34, 0xc8483a));
  kit.put('paint', M.paint, paint(placed(new THREE.CylinderGeometry(0.17, 0.17, 0.5, 8, 1, false, 0, Math.PI), a.x, 1.36, a.z, { pitch: 0 }), 0xc8483a));
}

// ---- the forest rim and the leaf canopy ---------------------------------------------------------------------------------
export function drawRim(kit, M) {
  for (const t of P.scatterRim()) {
    kit.put('paint', M.paint, post(t.x, t.z, 0, 4.2 * t.s, 0.45 * t.s, 0.3 * t.s, L.trunk, 7, t.yaw));
    kit.put('leaves', M.leaves, blob(t.x, 5 * t.s, t.z, 2.4 * t.s, t.kind ? L.leafLight : L.leaf, t.yaw, 1), { noCast: true });
    kit.put('leaves', M.leaves, blob(t.x + 0.8 * t.s, 6.6 * t.s, t.z - 0.5 * t.s, 1.7 * t.s, L.leafDark, t.yaw + 1, 1), { noCast: true });
  }
}
export function drawCanopy(kit, M) {
  for (const c of P.scatterCanopy()) kit.put('leaves', M.leaves, blob(c.x, c.y, c.z, c.s, c.hue < 0.33 ? L.leafDark : c.hue < 0.7 ? L.leaf : L.leafLight, c.hue * 5, 1, 0.55), { noCast: true });
}

export function drawLight() {
  const l = new THREE.PointLight(0xffc890, 0, 24, 2);
  l.name = 'treehouse:light';
  l.position.set(P.LIGHT_AT.x, P.LIGHT_AT.y, P.LIGHT_AT.z);
  l.castShadow = false;
  return l;
}

// The shared glow of a find: a soft sphere of light, moved to wherever a find is made and shown for a moment.
export function createFindGlow() {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.9, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0xfff4d8, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending, forceSinglePass: true }),
  );
  mesh.name = 'treehouse:findGlow';
  mesh.visible = false;
  mesh.castShadow = false;
  Object.assign(mesh.userData, { noCast: true, noContactShadow: true, noMerge: true });
  return mesh;
}
