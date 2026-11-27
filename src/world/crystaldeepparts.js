// =============================================================================
// THE ECHO DEEP: THE DRAWING (milestone C2). Everything is merged: ONE lit mesh of the stone (hall rim, passage, prism stands, door-crystal, nest, nook, small crystals) and
// ONE additive mesh of every glow (floor pools, the sockets of the door and the stands emblems, halos), plus ONE tiny additive stand-in that shows when the cat is far. The detail
// is drawn only within NEAR of a site (crystaldeeplive.js switches them). No PointLight (the cave has the one), no canvas, no Math.random: the light is vertex colour and a pool
// disc on the floor. Everything follows the floor (crystalY); nothing stands over 2.4 m inside the walk; no ceiling. LOW keeps half the rocks and crystals. The stills (reduced
// motion) are a flag of the colour scalar of the glow, held by the live.
// =============================================================================

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { crystalY } from './crystalplan.js';
import { litMaterial } from '../render/materials.js';
import * as D from './crystaldeepplan.js';
import { drawLight } from './crystalparts.js'; // already in the cave chunk set: sharing it keeps the plan module in the chunk where it was (a chunk split costs 0.6 kB)
void drawLight;

const _a = new THREE.Color();
const STONE = 0x8a7a88;
const STONE_LIGHT = 0xa89aa6;
const WARM = 0xffd9a8;

// the geometry in the shape every piece shares (non-indexed, position + normal + uv + colour) so any two merge; `tone(x, y, z) -> Color` paints it
function shade(geo, tone) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  const p = g.attributes.position;
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const c = tone(p.getX(i), p.getY(i), p.getZ(i)); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
const flat = (hex, jitter = 0) => () => _a.setHex(hex).offsetHSL(0, 0, jitter);
const put = (geo, x, z, dy = 0, ry = 0) => { if (ry) geo.rotateY(ry); geo.translate(x, crystalY(x, z) + dy, z); return geo; };
const wob = (i, k = 1) => Math.sin(i * 12.9898 * k + 4.1) * 0.5 + 0.5; // a fixed pseudo-random in 0..1 from an index (no Math.random)

// a soft flat disc of light on the floor (additive): bright in the middle, gone at the edge
function glowDisc(x, z, r, rgb, peak, lift = 0.05, rings = 4, seg = 18) {
  const pos = []; const col = []; const idx = [];
  const c = new THREE.Color(rgb);
  for (let ri = 0; ri <= rings; ri++) {
    const n = ri === 0 ? 1 : seg;
    const t = ri / rings;
    const k = peak * (1 - t) ** 1.7;
    for (let i = 0; i < n; i++) {
      const a = (i / seg) * Math.PI * 2;
      const px = x + Math.cos(a) * r * t; const pz = z + Math.sin(a) * r * t;
      pos.push(px, crystalY(px, pz) + lift, pz);
      col.push(c.r * k, c.g * k, c.b * k);
    }
  }
  const at = (ri, i) => 1 + (ri - 1) * seg + (i % seg);
  for (let i = 0; i < seg; i++) idx.push(0, at(1, i + 1), at(1, i));
  for (let ri = 1; ri < rings; ri++) for (let i = 0; i < seg; i++) { const a = at(ri, i); const b = at(ri, i + 1); const cc = at(ri + 1, i); const d = at(ri + 1, i + 1); idx.push(a, b, cc, b, d, cc); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  g.setIndex(idx);
  return g.toNonIndexed();
}

// the three emblems (the same index as the colour): circle, diamond, star; flat, facing +z, `s` the radius
export function emblem(shape, s) {
  if (shape === 0) return new THREE.CircleGeometry(s, 10);
  if (shape === 1) return new THREE.CircleGeometry(s * 1.15, 4);
  const sh = new THREE.Shape();
  for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + (i * Math.PI) / 5; const rr = i % 2 ? s * 0.45 : s * 1.1; const px = Math.cos(a) * rr; const py = Math.sin(a) * rr; if (i === 0) sh.moveTo(px, py); else sh.lineTo(px, py); }
  return new THREE.ShapeGeometry(sh);
}

// a little rock: an icosahedron squashed and tilted by its index, painted lighter towards the top
function rock(i, w, h) {
  const g = new THREE.IcosahedronGeometry(1, 0);
  g.scale(w * (0.85 + 0.3 * wob(i)), h * (0.8 + 0.4 * wob(i, 2)), w * (0.85 + 0.3 * wob(i, 3)));
  g.rotateY(wob(i, 4) * 6);
  return shade(g, (x, y) => _a.setHex(STONE).lerp(new THREE.Color(STONE_LIGHT), Math.min(1, Math.max(0, y / h))));
}
// a crystal: a stretched octahedron standing on its tip (or hanging when `down`), its tone a hue from the base to a bright top
function crystal(hex, w, h, down = false) {
  const g = new THREE.OctahedronGeometry(1, 0);
  g.scale(w, h / 2, w);
  g.translate(0, down ? -h / 2 : h / 2, 0);
  return shade(g, (x, y) => _a.setHex(hex).multiplyScalar(0.7 + 0.5 * Math.min(1, Math.abs(y) / h)));
}

const gapDeg = (deg) => Math.abs(((deg - 90 + 540) % 360) - 180) < D.PASSAGE_GAP_DEG;

// ---- the geometry --------------------------------------------------------------------------------------------------------------------------------------
export function deepGeometries(rung = 'high') {
  const low = rung === 'low';
  const solid = [];
  const glow = [];
  const H = D.HALL;
  // the rim of the hall: a ring of low rocks round the walls (the colliders are inside them), with the gap of the passage
  const nRocks = low ? 8 : 15;
  for (let i = 0; i < nRocks; i++) {
    const deg = ((i + 0.5) / nRocks) * 360;
    if (gapDeg(deg)) continue;
    const a = (deg * Math.PI) / 180;
    solid.push(put(rock(i, 0.9, 0.9 + 0.8 * wob(i, 5)), H.x + Math.cos(a) * 5.0, H.z + Math.sin(a) * 5.0, -0.1));
  }
  // the two passage walls: three rocks each side
  for (const s of [-1, 1]) for (let k = 0; k < (low ? 2 : 3); k++) solid.push(put(rock(40 + k + (s > 0 ? 7 : 0), 0.6, 1.0 + 0.3 * k), D.PASSAGE.x + s * (D.PASSAGE.halfW + 0.55), D.PASSAGE.z0 - 0.7 * k, -0.1));
  // small crystals standing inside the rim (never on the way of the cat: all within 0.8 m of the wall), in the three colours
  const nCry = low ? 4 : 8;
  for (let i = 0; i < nCry; i++) {
    const deg = ((i + 0.25) / nCry) * 360 + 11;
    if (gapDeg(deg)) continue;
    const a = (deg * Math.PI) / 180;
    solid.push(put(crystal(D.FACE_COLOURS[i % 3], 0.16 + 0.1 * wob(i, 6), 0.55 + 0.5 * wob(i, 7)), H.x + Math.cos(a) * 4.15, H.z + Math.sin(a) * 4.15, -0.05));
  }
  // the three prism stands: a stone base and the emblem (shape and colour) of the face the door asks for, glowing above; the three-faced prisms themselves are moving pieces (below)
  for (const s of D.STANDS) {
    solid.push(put(shade(new THREE.CylinderGeometry(0.4, 0.46, 0.42, 8).translate(0, 0.21, 0), flat(STONE_LIGHT)), s.x, s.z));
    const want = D.DOOR_PATTERN[s.i];
    glow.push(shade(put(emblem(want, 0.2).translate(0, 1.65, 0), s.x, s.z), flat(D.FACE_COLOURS[want], -0.02)));
    glow.push(glowDisc(s.x, s.z, 1.15, D.FACE_COLOURS[want], 0.3, 0.06, 3, 14));
  }
  // the door-crystal: two tall crystals leaning together over a stone base, three sockets (emblem and colour each) on its face
  const Dr = D.DOOR;
  solid.push(put(shade(new THREE.BoxGeometry(Dr.w + 0.5, 0.35, 0.8).translate(0, 0.17, 0), flat(STONE_LIGHT)), Dr.x, Dr.z));
  solid.push(put(crystal(0xc9a8ff, 0.5, Dr.h).rotateZ(0.08).translate(-0.4, 0.3, 0), Dr.x, Dr.z));
  solid.push(put(crystal(0xa890f0, 0.45, Dr.h - 0.4).rotateZ(-0.1).translate(0.45, 0.3, 0), Dr.x, Dr.z));
  for (let i = 0; i < 3; i++) glow.push(shade(put(emblem(D.DOOR_PATTERN[i], 0.13).translate(-0.45 + i * 0.45, 1.05, 0.55), Dr.x, Dr.z), flat(D.FACE_COLOURS[D.DOOR_PATTERN[i]], -0.02)));
  glow.push(glowDisc(Dr.x, Dr.z + 0.6, 1.8, 0xc9a8ff, 0.3, 0.06, 3, 14));
  // the nest of Tink: a rounded stone ledge (one hop, 0.9 m) with a soft bowl of moss outside and feathers inside, a few pale twigs across the rim, and two glints (all open shells, no hidden caps)
  const N = D.NEST;
  const V = (r, y) => new THREE.Vector2(r, N.h + y);
  solid.push(put(shade(new THREE.CylinderGeometry(0.8, 1.0, N.h + 0.05, 8, 1, true).scale(1.05, 1, 0.92).translate(0, N.h / 2 - 0.025, 0), (x, y, z) => _a.setHex(STONE).lerp(_a.clone().setHex(0x93b36c), Math.min(1, Math.max(0, (y - N.h * 0.4) / (N.h * 0.6))) * 0.5).offsetHSL(0, 0, 0.06)), N.x, N.z));
  solid.push(put(shade(new THREE.LatheGeometry([V(0.8, 0), V(0.86, 0.24), V(0.72, 0.32)], 8), flat(0x9cbc74)), N.x, N.z));
  solid.push(put(shade(new THREE.LatheGeometry([V(0.72, 0.32), V(0.64, 0.2), V(0.45, 0.06), V(0.01, 0.05)], 8), (x, y, z) => _a.setHex(0xf8e6c4).offsetHSL(0.02, 0.1, -0.05 * Math.max(0, N.h + 0.3 - y))), N.x, N.z));
  for (let i = 0; i < 4; i++) {
    const a = i * 1.6 + 0.4;
    solid.push(put(shade(new THREE.CylinderGeometry(0.026, 0.026, 0.55, 3, 1, true).rotateZ(Math.PI / 2).rotateY(a + 1.2).translate(Math.cos(a) * 0.72, N.h + 0.31, Math.sin(a) * 0.72), flat(i % 2 ? 0xe6d8bc : 0xd2c2a0)), N.x, N.z));
  }
  for (let i = 0; i < 2; i++) glow.push(shade(put(new THREE.OctahedronGeometry(0.045).translate(Math.cos(i * 3.1 + 1) * 0.5, N.h + 0.28 + 0.05 * i, Math.sin(i * 3.1 + 1) * 0.5), N.x, N.z), flat(0xfff4d0)));
  glow.push(glowDisc(N.x, N.z, 1.5, WARM, 0.28, N.h + 0.1, 3, 12));
  // the nook: two pillars, a lintel over them, hanging crystals, and a pedestal in the middle (where the charm will lie)
  const K = D.NOOK;
  for (const p of D.NOOK_PILLARS) solid.push(put(shade(new THREE.CylinderGeometry(0.3, 0.38, K.lintel, 7).translate(0, K.lintel / 2, 0), flat(STONE, 0.01)), p.x, p.z));
  const span = K.pillarGap * 2 + 0.9;
  solid.push(put(shade(new THREE.BoxGeometry(span, 0.3, 0.7).translate(0, K.lintel + 0.05, 0), flat(STONE_LIGHT)), K.x, K.z, 0, -K.yaw));
  const hang = low ? 3 : 5;
  for (let i = 0; i < hang; i++) {
    const u = (i / (hang - 1) - 0.5) * 2 * K.pillarGap * 0.9;
    const hx = K.x + Math.cos(K.yaw) * u; const hz = K.z + Math.sin(K.yaw) * u;
    solid.push(put(crystal(D.FACE_COLOURS[i % 3], 0.13, 0.5 + 0.35 * wob(i, 8), true), hx, hz, K.lintel - 0.1));
  }
  solid.push(put(shade(new THREE.CylinderGeometry(0.46, 0.5, D.PEDESTAL.h, 8).translate(0, D.PEDESTAL.h / 2, 0), flat(STONE_LIGHT)), D.PEDESTAL.x, D.PEDESTAL.z));
  glow.push(glowDisc(K.x, K.z, 2.6, 0xffc4e0, 0.3, 0.06, 4, 16));
  // the own pool of the hall of soft light, over the whole floor
  glow.push(glowDisc(H.x, H.z, 4.4, 0xb89cff, 0.26, 0.05, 5, low ? 16 : 24));
  // ---- the moving pieces, LAST in each merged mesh (their vertex ranges are rewritten in place by crystaldeepwalllive.js; nothing is added to the draw count) ------------------------
  const count = (list) => list.reduce((n, g) => n + g.attributes.position.count, 0);
  const dyn = { wall: null, prisms: [], pads: [], rings: [], door: null };
  // the singing wall: a slab across the passage mouth that sinks into the floor when it opens
  const Wl = D.WALL;
  const slab = put(shade(new THREE.BoxGeometry(Wl.w, Wl.h, Wl.d).translate(0, Wl.h / 2 - 0.05, 0), (x, y) => _a.setHex(0x6a5896).lerp(new THREE.Color(0xd8c4ff), Math.min(1, Math.max(0, y / Wl.h)) ** 1.3 * 0.85)), Wl.x, Wl.z); // violet, lighter at the top: it reads as a door, not as one more rock
  dyn.wall = { start: count(solid), count: slab.attributes.position.count, base: slab.attributes.position.array.slice() };
  solid.push(slab);
  // the three prisms: a three-sided post (each side one face colour) and a pale cap; face f turns to the front when the post is yawed by -f thirds of a turn
  for (const s of D.STANDS) {
    const sides = [0, 1, 2].map((k) => shade(new THREE.PlaneGeometry(0.52, 0.8).translate(0, 0, 0.15).rotateY((k * Math.PI * 2) / 3).translate(0, 0.85, 0), flat(D.FACE_COLOURS[k], 0)));
    const cap = shade(new THREE.CylinderGeometry(0.3, 0.3, 0.04, 3).rotateY(Math.PI / 3).translate(0, 1.27, 0), flat(0xfff3d8));
    const post = mergeGeometries([...sides, cap]);
    const piece = { start: count(solid), count: post.attributes.position.count, x: s.x, z: s.z, y: crystalY(s.x, s.z), pos: post.attributes.position.array.slice(), nor: post.attributes.normal.array.slice() };
    post.translate(s.x, piece.y, s.z);
    dyn.prisms.push(piece);
    solid.push(post);
  }
  const solidGeo = mergeGeometries(solid);
  // the glow of the moving pieces: seven pad flashes, three rings that light when a prism fits, one light round the door-crystal (colours rewritten as base times a level)
  const gpiece = (geo) => ({ start: count(glow), count: geo.attributes.position.count, base: geo.attributes.color.array.slice() });
  for (const p of D.PADS) { const g = glowDisc(p.x, p.z, 0.95, 0xfff0c8, 0.9, 0.1, 1, low ? 6 : 10); dyn.pads.push(gpiece(g)); glow.push(g); }
  for (const s of D.STANDS) { const g = glowDisc(s.x, s.z, 0.8, D.FACE_COLOURS[D.DOOR_PATTERN[s.i]], 0.8, 0.09, 2, low ? 8 : 12); dyn.rings.push(gpiece(g)); glow.push(g); }
  { const g = glowDisc(Dr.x, Dr.z + 0.3, 2.4, 0xfff0c8, 0.9, 0.09, 3, 14); dyn.door = gpiece(g); glow.push(g); }
  return { solid: solidGeo, glow: mergeGeometries(glow), dyn };
}
// the far stand-in: two soft discs (the hall and the nook), nothing else
export function standInGeometry() {
  return mergeGeometries([glowDisc(D.HALL.x, D.HALL.z, 5.2, 0xb89cff, 0.3, 0.05, 2, 10), glowDisc(D.NOOK.x, D.NOOK.z, 2.6, 0xffc4e0, 0.28, 0.06, 2, 8)]);
}

const mark = (m, name) => {
  m.name = name; m.castShadow = false; m.receiveShadow = false; m.frustumCulled = false;
  Object.assign(m.userData, { noCast: true, noContactShadow: true, noMerge: true });
  return m;
};
const addMat = () => new THREE.MeshBasicMaterial({ vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide });

// three meshes: the stone and the glow (detail, near) and the stand-in (far)
export function drawDeep(rung = 'high') {
  const g = deepGeometries(rung);
  const stone = mark(new THREE.Mesh(g.solid, litMaterial(0xffffff, { vertexColors: true, roughness: 0.85 })), 'crystal:deep');
  stone.receiveShadow = true;
  const glow = mark(new THREE.Mesh(g.glow, addMat()), 'crystal:deepglow');
  glow.renderOrder = 2;
  const standIn = mark(new THREE.Mesh(standInGeometry(), addMat()), 'crystal:deepfar');
  standIn.renderOrder = 2;
  return { meshes: [stone, glow, standIn], stone, glow, standIn, dyn: g.dyn };
}
