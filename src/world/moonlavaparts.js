// =============================================================================
// THE MOON: WING D AS DRAWING (milestone 8). Three meshes and some stone in the Moon's own kit:
//   'moon:massif'   the Cave Massif seen from outside: a lumpy hump swept along the tube (and over the room), vertex-coloured lit stone, not a caster (a draw in the shadow pass); hidden once she is inside it
//                   (the camera is in the rock then). Always drawn from outside: from a distance it is the wing's stand-in.
//   'moon:cave'     the tube and the room as an ENCLOSED SHELL, seen from inside only (BackSide): from above or outside the walls and the roof are not drawn, so the
//                   camera is never behind a wall, whichever way it swings (no clipping, no fade). Its colours are baked from the crystals' glow (world/moonlava.js lightAt):
//                   a basic material, no light of any kind. Always drawn (a see-through mouth would show the hump's empty inside from the side).
//   'moon:cavefill' the floor, the crystals and the pedestal, one basic vertex-coloured mesh (the crystals are the brightest things in it): the wing's detail, drawn only
//                   within the wing's reach (world/moonzones.js) and not at all from outside the way the zone ends.
// plus: the Old Dish's ledge and the Core's third socket go into the kit. No random number, no clock, no real light.
// =============================================================================

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as L from './moonlava.js';
import * as P from './moonplan.js';
import { paint, at, box, cyl } from './moonparts.js';

export const LAVA_COL = Object.freeze({ rock: 0x8d8894, rockHi: 0xa6a1ac, rim: 0x9b95a3, inner: 0x4b4562, floor: 0x6c6784, ped: 0x7d7894, ledge: 0x9b9899, ledgeTop: 0xb4b2b1, socket: 0xb690ff });
const CRYSTAL_COL = Object.freeze([0x59f2e0, 0xa98bff, 0xe4fff8, 0x6fd0ff]);
const SEG = 14; // arch segments (a half turn)
const STEP = 0.6; // m between stations

const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const _c = new THREE.Color();

// A station at arc length s: where it stands and which way the way runs (past the room's middle it runs straight west).
export function station(s) {
  if (s <= L.S_CHAMBER) return L.pathAt(s);
  return { x: L.CHAMBER.x + (L.S_CHAMBER - s) * 1, z: L.CHAMBER.z, tx: -1, tz: 0 };
}

// The cross-section at s for a family (inner or outer): the tube's half width W and height H, the room's radius R and height Hc.
export function profile(s, { W, H, R, Hc }) {
  const u = (s - L.S_CHAMBER) / R;
  if (u >= 1) return { w: 0, h: 0 };
  const circ = R * Math.sqrt(Math.max(0, 1 - u * u));
  if (u >= 0) return { w: circ, h: Hc * Math.sqrt(1 - u * u) };
  const w = Math.max(W, circ);
  const k = smooth((w - W) / (R - W));
  return { w, h: H + (Hc - H) * k };
}
export const INNER = Object.freeze({ W: L.TUBE.shellW, H: L.TUBE.shellH, R: L.CHAMBER.shellR, Hc: L.CHAMBER.shellH });
export const OUTER = Object.freeze({ W: L.TUBE.outerW, H: L.TUBE.outerH, R: L.CHAMBER.outerR, Hc: L.CHAMBER.outerH });

function stations(prof, end) {
  const list = [];
  for (let s = L.S_MOUTH; s < end - 1e-6; s += STEP) list.push(s);
  list.push(end);
  const pf = typeof prof === 'function' ? prof : (s) => profile(s, prof);
  return list.map((s) => ({ s, ...station(s), ...pf(s) }));
}
// The massif's own profile: the tube's rim at the mouth swelling to the hump (world/moonlava.js rockHalf), the room's dome beyond.
export const outerProfile = (s) => {
  const p = profile(s, OUTER);
  if (s >= L.S_ROOM) return p;
  return { w: Math.min(p.w, L.rockHalf(s)), h: Math.min(p.h, L.rockHeight(s)) };
};

// One sweep: rows of cross-section points along the way. `col(x, y, z, a)` gives each vertex its colour; `lump` is a bump (metres) added to the outward direction.
function sweep(prof, end, col, lump = 0) {
  const rows = stations(prof, end);
  const n = SEG + 1;
  const pos = new Float32Array(rows.length * n * 3);
  const colr = new Float32Array(rows.length * n * 3);
  rows.forEach((r, i) => {
    for (let j = 0; j < n; j++) {
      const a = (j / SEG) * Math.PI;
      const nx = -r.tz;
      const nz = r.tx;
      let lat = r.w * Math.cos(a);
      let y = r.h * Math.pow(Math.sin(a), 0.8);
      const x0 = r.x + nx * lat;
      const z0 = r.z + nz * lat;
      if (lump && j > 0 && j < SEG) {
        const b = lump * Math.sin(a) * (Math.sin(x0 * 1.31 + z0 * 0.9) * Math.cos(z0 * 1.13 - x0 * 0.71) + 0.5 * Math.sin(x0 * 2.9 - z0 * 2.3));
        y += b;
        lat += b * 0.4 * Math.cos(a);
      }
      const x = r.x + nx * lat;
      const z = r.z + nz * lat;
      const k = (i * n + j) * 3;
      pos[k] = x; pos[k + 1] = y + 0.0; pos[k + 2] = z;
      const c = col(x, y, z, a);
      colr[k] = c[0]; colr[k + 1] = c[1]; colr[k + 2] = c[2];
    }
  });
  const index = [];
  for (let i = 0; i < rows.length - 1; i++) {
    for (let j = 0; j < SEG; j++) {
      const A = i * n + j;
      const B = A + 1;
      const C = A + n;
      const D = C + 1;
      index.push(A, C, B, B, C, D);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(colr, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return { g, rows, n, pos };
}

// The mouth's face: the ring between the outer arch and the inner arch at the mouth's plane (it faces east, toward the plain).
function mouthFace(outer, inner, hex) {
  const pos = [];
  const col = [];
  _c.setHex(hex);
  const o = (j) => [outer.pos[j * 3], outer.pos[j * 3 + 1], outer.pos[j * 3 + 2]];
  const q = (j) => [inner.pos[j * 3], inner.pos[j * 3 + 1], inner.pos[j * 3 + 2]];
  for (let j = 0; j < SEG; j++) {
    const quad = [o(j), q(j), o(j + 1), q(j + 1)];
    for (const v of [quad[0], quad[2], quad[1], quad[1], quad[2], quad[3]]) { pos.push(...v); col.push(_c.r, _c.g, _c.b); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  // face east: flip every triangle whose normal points west
  const nrm = g.attributes.normal;
  if (nrm.getX(0) < 0) {
    const p = g.attributes.position;
    for (let i = 0; i + 2 < p.count; i += 3) for (const a of [p, g.attributes.color]) for (let k = 0; k < 3; k++) { const v = a.array[i * 3 + k]; a.array[i * 3 + k] = a.array[(i + 2) * 3 + k]; a.array[(i + 2) * 3 + k] = v; }
    g.computeVertexNormals();
  }
  return g;
}

const flat = (hex, k = 1) => { _c.setHex(hex); return [_c.r * k, _c.g * k, _c.b * k]; };

// drawMassif() -> Mesh (lit stone). A hump with a lighter crown and darker foot; the mouth's face is a paler rim.
export function massifGeometry() {
  const noise = (x, z) => 0.5 + 0.5 * Math.sin(x * 0.7 + z * 1.3) * Math.cos(z * 0.9 - x * 0.4);
  const sw = sweep(outerProfile, L.S_CHAMBER + L.CHAMBER.outerR, (x, y, z) => {
    const top = Math.min(1, y / 4.6);
    const strata = 1 + 0.07 * Math.sin(y * 5.5 + noise(x, z) * 3); // (beauty round 6) layered bands up the hump, and the dust drifted round its foot
    const dust = Math.max(0, 1 - y / 1.5) ** 1.5 * 0.5;
    const c = flat(LAVA_COL.rock, (0.78 + 0.34 * noise(x, z) + 0.3 * top) * strata);
    return [c[0] + (0.54 - c[0]) * dust, c[1] + (0.53 - c[1]) * dust, c[2] + (0.5 - c[2]) * dust];
  }, 0.4);
  const inn = sweep(INNER, L.S_CHAMBER + L.CHAMBER.shellR, () => [0, 0, 0]);
  const face = mouthFace({ pos: sw.pos }, { pos: inn.pos }, LAVA_COL.rim);
  const g = mergeGeometries([sw.g.toNonIndexed(), face].map((x) => { if (!x.attributes.uv) x.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(x.attributes.position.count * 2), 2)); return x; }));
  return g;
}

export function drawMassif(materials) {
  const m = new THREE.Mesh(massifGeometry(), materials.stone);
  m.name = 'moon:massif';
  // (a caster would cost a draw in the shadow pass wherever it is near the camera: the Moon's frame has none to spare; the massif's east face is in its own shade and the sun is in the south-west)
  m.castShadow = false;
  m.receiveShadow = true;
  Object.assign(m.userData, { noMerge: true, noCast: true, noContactShadow: true });
  return m;
}

// The inside: the shell the crystals paint with light. BackSide basic material (vertex colours: rock tinted by the glow).
export function caveGeometry() {
  const sw = sweep(INNER, L.S_CHAMBER + L.CHAMBER.shellR, (x, y, z, a) => {
    const glow = L.lightAt(x, z) * (0.78 + 0.22 * Math.sin(a)); // brighter toward the floor, darker in the crown
    const tint = 0.5 + 0.5 * Math.sin(x * 0.8 + z * 0.6);
    const [r, g, b] = flat(LAVA_COL.inner, 1);
    return [r * glow * 1.1 + 0.08 * glow * tint, g * glow * 1.15 + 0.1 * glow, b * glow * 1.3 + 0.22 * glow * (1 - 0.5 * tint)];
  }, 0.12);
  return sw.g;
}
export function drawCave() {
  const m = new THREE.Mesh(caveGeometry(), new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide }));
  m.name = 'moon:cave';
  m.castShadow = false;
  m.receiveShadow = false;
  Object.assign(m.userData, { noMerge: true, noCast: true, noContactShadow: true });
  return m;
}

// ---- the fill: floor, crystals, pedestal ---------------------------------------------------------------------------------------

function floorGeometry() {
  const rows = stations(INNER, L.S_CHAMBER + L.CHAMBER.shellR - 0.1);
  const cols = 6;
  const pos = [];
  const col = [];
  const pt = (r, c) => {
    const lat = (c / cols - 0.5) * 2 * Math.max(r.w, 0.01);
    const x = r.x - r.tz * lat;
    const z = r.z + r.tx * lat;
    const glow = L.lightAt(x, z);
    const f = flat(LAVA_COL.floor, 0.9 * glow + 0.15);
    return { p: [x, 0.04, z], c: [f[0] + 0.05 * glow, f[1] + 0.12 * glow, f[2] + 0.1 * glow] };
  };
  for (let i = 0; i < rows.length - 1; i++) {
    for (let c = 0; c < cols; c++) {
      const A = pt(rows[i], c); const B = pt(rows[i], c + 1); const C = pt(rows[i + 1], c); const D = pt(rows[i + 1], c + 1);
      // up-facing: the rows run along the way and the columns across it; pick the winding by the normal's sign afterwards
      for (const v of [A, C, B, B, C, D]) { pos.push(...v.p); col.push(...v.c); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  // faces must look up
  const p = g.attributes.position;
  const nrm = g.attributes.normal;
  for (let i = 0; i + 2 < p.count; i += 3) {
    if (nrm.getY(i) < 0) for (const a of [p, g.attributes.color]) for (let k = 0; k < 3; k++) { const v = a.array[i * 3 + k]; a.array[i * 3 + k] = a.array[(i + 2) * 3 + k]; a.array[(i + 2) * 3 + k] = v; }
  }
  g.computeVertexNormals();
  return g;
}

// One cluster: three tapering six-sided prisms leaning out a little, dark at the foot and bright at the tip (a glow without a light).
function clusterGeometry(q) {
  const parts = [];
  const prism = (dx, dz, h, r, tilt, hex) => {
    const g = new THREE.CylinderGeometry(0.015, r, h, 6, 1, true);
    g.translate(0, h / 2, 0);
    g.rotateZ(tilt);
    g.translate(q.x + dx, 0.03, q.z + dz);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    _c.setHex(hex);
    for (let i = 0; i < n; i++) {
      const k = Math.min(1, g.attributes.position.getY(i) / h) * 0.65 + 0.45;
      col[i * 3] = _c.r * k; col[i * 3 + 1] = _c.g * k; col[i * 3 + 2] = _c.b * k;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const ng = g.toNonIndexed();
    if (!ng.attributes.uv) ng.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(ng.attributes.position.count * 2), 2));
    return ng;
  };
  const hex = CRYSTAL_COL[Math.floor(q.k * CRYSTAL_COL.length) % CRYSTAL_COL.length];
  const hex2 = CRYSTAL_COL[(Math.floor(q.k * CRYSTAL_COL.length) + 1) % CRYSTAL_COL.length];
  parts.push(prism(0, 0, q.h, 0.15, 0.12 * q.lean, hex));
  parts.push(prism(0.2, 0.1, q.h * 0.62, 0.1, -0.35, hex2));
  parts.push(prism(-0.18, -0.12, q.h * 0.45, 0.09, 0.4, hex));
  return parts;
}

export function fillGeometry() {
  const parts = [];
  const fl = floorGeometry();
  fl.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(fl.attributes.position.count * 2), 2));
  parts.push(fl);
  for (const q of L.CRYSTALS) parts.push(...clusterGeometry(q));
  // the pedestal: a low drum with a glowing ring round its top, in the cave's own light
  const pd = L.PEDESTAL;
  const drum = new THREE.CylinderGeometry(pd.r * 0.92, pd.r * 1.05, pd.top, 12).translate(pd.x, pd.top / 2 + 0.03, pd.z);
  parts.push(paint(drum, LAVA_COL.ped));
  const ring = new THREE.RingGeometry(pd.r * 0.55, pd.r * 0.78, 20).rotateX(-Math.PI / 2).translate(pd.x, pd.top + 0.06, pd.z);
  parts.push(paint(ring, 0xe4fff8));
  const ng = parts.map((g) => { const n = g.index ? g.toNonIndexed() : g; if (!n.attributes.normal) n.computeVertexNormals(); return n; });
  for (const g of ng) for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color', 'uv'].includes(k)) g.deleteAttribute(k);
  return mergeGeometries(ng);
}
export function drawFill() {
  const m = new THREE.Mesh(fillGeometry(), new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  m.name = 'moon:cavefill';
  m.castShadow = false;
  m.receiveShadow = false;
  Object.assign(m.userData, { noMerge: true, noCast: true, noContactShadow: true });
  return m;
}

// ---- stone in the Moon's kit: the Old Dish's ledge and the Core's third socket --------------------------------------------------

export function drawLavaKit(kit, M, B) {
  const D = P.DISH_LEDGE;
  const g = P.moonY(D.x, D.z);
  kit.put('stone', M.stone, paint(new THREE.CylinderGeometry(D.r * 0.88, D.r * 1.12, D.y + 0.6, 9).translate(D.x, g + (D.y - 0.6) / 2, D.z), LAVA_COL.ledge));
  kit.put('stone', M.stone, paint(new THREE.CylinderGeometry(D.r * 0.98, D.r * 0.88, 0.26, 9).translate(D.x, g + D.y - 0.1, D.z), LAVA_COL.ledgeTop));
  for (let i = 0; i < 3; i++) {
    const a = 1.1 + i * 2.1;
    kit.put('stone', M.stone, paint(at(new THREE.DodecahedronGeometry(0.34 + 0.1 * i, 0), D.x + Math.cos(a) * (D.r + 0.55), D.z + Math.sin(a) * (D.r + 0.55), 0.22), LAVA_COL.ledge));
  }
  kit.put('glow', M.glow, paint(at(new THREE.OctahedronGeometry(0.15, 0), D.x - 0.9, D.z + 0.3, D.y + 0.18), 0xffd987), { noCast: true });
  // the third socket: a dark plate and a violet ring on the Core's pedestal top, on the airlock's side
  const S = P.DEEP_SOCKET;
  kit.put('floor', M.paint, paint(at(cyl(0.3, 0.3, 0.05, 10), S.x, S.z, S.y + 0.02), 0x1a1f28), { noCast: true });
  kit.put('coreglow', B.coreglow, paint(at(new THREE.RingGeometry(0.3, 0.38, 14).rotateX(-Math.PI / 2), S.x, S.z, S.y + 0.05), LAVA_COL.socket), { noCast: true });
  void box;
}
