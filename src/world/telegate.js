// How a teleport gate looks (milestone 1: the three real looks). LAZY, with the rest of the gates' pieces
// (src/telehook.js), and called from walk.js beside the map's gates, never from an area builder: the same two reasons as
// world/gateway.js (what the area builders draw is pinned by the flat trace and by the places' budgets, and a gate is a
// walk's own business).
//
// Three looks (docs/superpowers/specs/2026-11-23-teleport-gates-design.md 2.1), each THREE meshes and under the plan's
// budget (LOOK_BUDGET: at most 6 meshes, 480 triangles and ONE transparent draw):
//   'stonering'  five old, mossy stones leaning round a soft disc: the Meeting Ring (the Moon gate)
//   'archway'    a little stone arch in a hedge with a lantern and ivy: a garden door, for the town later
//   'hollow'     a great trunk with a glowing hole, a sea-cave or a hollow tree: nearest to "doors live in natural things"
//   'cleft'      the hollow's rock cousin (the Seaside's way down to the Reef): two grey rocks and a cleft between them, a brass
//                ladder on one and a ring buoy on the other, a blue glow in the gap
//   'hatch'      the Seaside's dive hatch (the way down to the Reef): two weathered pier posts and a lintel round a planked door with a
//                round brass-rimmed porthole, a ring buoy, coiled rope, a ladder, barnacles and algae; the disc is the porthole's blue-green glow
// Every look is the same three meshes:
//   body    the stones / the arch / the trunk and its leaves: one vertex-coloured geometry, one lit material (opaque)
//   disc    the one transparent draw: a soft additive disc with a turning swirl painted on it, light and warm, never a
//           dark hole, seen from both sides (it is not solid: she can stand in it)
//   motes   four tiny opaque specks of light that drift a little round the gate (fireflies, sparkle bubbles)
// A dormant gate (not yet awake: needWalks) is the body alone, a little greyer, with no disc and no motes. Reduced motion:
// nothing turns or drifts, the disc and the motes just sit and shine.
// The group sits at the end's spot, its local -z pointing the way she walks through (`faces`), local x along its width.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { litMaterial } from '../render/materials.js';
import { FLAT_GROUND } from '../ground.js';

export const LOOK_BUDGET = Object.freeze({ meshes: 6, triangles: 480, transparent: 1 });
export const LOOK_NAMES = Object.freeze(['stonering', 'archway', 'hollow', 'cleft', 'grotto', 'hatch']);
const OUT_YAW = { north: 0, south: Math.PI, east: -Math.PI / 2, west: Math.PI / 2 };

// What each look is made of that she cannot walk through: circles in the gate's own frame (lx along its width, lz along
// the way through, -z being on), by look. The two pillars of the ring and of the arch; the trunk of the hollow.
export const LOOK_SOLIDS = Object.freeze({
  stonering: Object.freeze([{ lx: -1.3, lz: 0, r: 0.35 }, { lx: 1.3, lz: 0, r: 0.35 }]),
  archway: Object.freeze([{ lx: -0.95, lz: 0, r: 0.32 }, { lx: 0.95, lz: 0, r: 0.32 }]),
  hollow: Object.freeze([{ lx: 0, lz: -1.3, r: 1.1 }]),
  cleft: Object.freeze([{ lx: -1.35, lz: -1.0, r: 0.95 }, { lx: 1.35, lz: -1.0, r: 0.95 }, { lx: 0, lz: -2.2, r: 1.2 }]),
  grotto: Object.freeze([{ lx: -1.35, lz: -1.0, r: 0.95 }, { lx: 1.35, lz: -1.0, r: 0.95 }, { lx: 0, lz: -2.2, r: 1.2 }]),
  hatch: Object.freeze([{ lx: -1.35, lz: -1.0, r: 0.95 }, { lx: 1.35, lz: -1.0, r: 0.95 }, { lx: 0, lz: -2.2, r: 1.2 }]), // the cleft's footprint, so the landing and the pier stay as they were
});
export const STONE_COLLIDER_R = 0.35;

// The disc and the motes: colour by look, and by the suit the place beyond puts on her (the dive's is bluer, the
// Moon's paler and cooler).
const LOOK_TINT = { stonering: 0xffeeb4, archway: 0xffe2a0, hollow: 0xcdeeff, cleft: 0xbfe6ff, grotto: 0xe3c8ff, hatch: 0xbff5e8 };
const SUIT_TINT = { space: 0xe6e2ff, dive: 0x9fd8ff };
const MOTE_COLOUR = { stonering: 0xfff3b0, archway: 0xffe9a8, hollow: 0xd8f4ff, cleft: 0xd8f4ff, grotto: 0xf0dcff, hatch: 0xc8f4ea };
export const discTint = (end) => SUIT_TINT[end.suit] ?? LOOK_TINT[end.look] ?? LOOK_TINT.stonering;

// ---- time: one clock the whole look reads (a picture page sets its own, so a frame is the same every time) ----
let clock = () => (globalThis.performance?.now?.() ?? 0) / 1000;
export function setTeleClock(fn) { clock = typeof fn === 'function' ? fn : () => (globalThis.performance?.now?.() ?? 0) / 1000; }

// ---- the pieces ----

// A deterministic wobble from a vertex's own place, so the corners two faces share move together (no cracks) and every
// stone is a little off true.
function wobble(g, amt, salt) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const h = (a, k) => Math.sin(Math.round(a * 50) * 12.9898 + k * 78.233 + salt * 37.719) * 43758.5453;
    const f = (a, k) => ((h(a, k) % 1) + 1) % 1 - 0.5;
    p.setXYZ(i, p.getX(i) + f(p.getX(i) + p.getZ(i), 1) * amt, p.getY(i) + f(p.getY(i) + p.getX(i), 2) * amt, p.getZ(i) + f(p.getZ(i) + p.getY(i), 3) * amt);
  }
}

// One body piece: flat-shaded, non-indexed, position + normal + colour only (so every piece merges). `moss` greens the
// foot of it (lower than `mossTo` metres).
function piece(geo, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, tint, moss = 0, mossTo = 1.1, wob = 0, salt = 0 }) {
  let g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz);
  g.translate(x, y, z);
  if (wob) wobble(g, wob, salt);
  g.computeVertexNormals();
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  const c = new THREE.Color(tint);
  for (let i = 0; i < n; i++) {
    const low = moss ? Math.max(0, 1 - g.attributes.position.getY(i) / mossTo) * moss : 0;
    col[i * 3] = c.r * (1 - 0.3 * low);
    col[i * 3 + 1] = c.g * (1 + 0.14 * low);
    col[i * 3 + 2] = c.b * (1 - 0.35 * low);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

// Which gate: the ring ----------------------------------------------------------------------------------------------
const RING_R = 1.45; // m, the arch stones' circle
const RING_Y = 1.45; // m, the ring's middle above the grass
function ringBody() {
  const parts = [
    piece(box(0.6, 2.3, 0.5), { x: -1.3, y: 1.15, rz: 0.04, tint: 0x9a9c92, moss: 1, wob: 0.06, salt: 1 }),
    piece(box(0.55, 2.4, 0.45), { x: 1.3, y: 1.2, rz: -0.05, tint: 0x8f9189, moss: 1, wob: 0.06, salt: 2 }),
  ];
  [[45, 0xa3a499], [90, 0x8c8e86], [135, 0x9b9d93]].forEach(([deg, tint], i) => {
    const a = (deg * Math.PI) / 180;
    parts.push(piece(box(0.72, 0.55, 0.45), { x: Math.cos(a) * RING_R, y: RING_Y + Math.sin(a) * RING_R * 0.98, rz: a - Math.PI / 2 + 0.06, tint, wob: 0.05, salt: 3 + i }));
  });
  // two low stones sat in the grass, and two moss mounds at the feet of the pillars
  parts.push(piece(box(0.5, 0.36, 0.42), { x: -1.95, y: 0.18, ry: 0.5, tint: 0x969890, moss: 1, mossTo: 0.4, wob: 0.04, salt: 8 }));
  parts.push(piece(box(0.42, 0.3, 0.4), { x: 1.9, y: 0.15, ry: -0.4, tint: 0x9b9d93, moss: 1, mossTo: 0.4, wob: 0.04, salt: 9 }));
  for (const [x, z] of [[-1.15, 0.35], [1.2, -0.3]]) parts.push(piece(new THREE.IcosahedronGeometry(0.4, 0).scale(1, 0.4, 1), { x, y: 0.1, z, tint: 0x5f9a4c }));
  return mergeGeometries(parts, false);
}
function ringDisc() {
  const g = new THREE.CircleGeometry(1.12, 32);
  g.translate(0, RING_Y, 0);
  return g;
}

// the arch --------------------------------------------------------------------------------------------------------
const ARCH_X = 0.95; // m, a pillar's distance from the middle
const ARCH_SPRING = 2.0; // m, where the round of the arch begins
function archBody() {
  const stone = 0xb69a74;
  const parts = [
    piece(box(0.5, ARCH_SPRING, 0.5), { x: -ARCH_X, y: ARCH_SPRING / 2, tint: stone, moss: 1, wob: 0.03, salt: 11 }),
    piece(box(0.5, ARCH_SPRING, 0.5), { x: ARCH_X, y: ARCH_SPRING / 2, tint: 0xad9168, moss: 1, wob: 0.03, salt: 12 }),
  ];
  // seven voussoirs round the top; the middle one (the keystone) is bigger and paler
  for (let i = 0; i < 7; i++) {
    const a = Math.PI * (i / 6); // 0 .. pi, right to left
    const mid = i === 3;
    parts.push(piece(box(mid ? 0.62 : 0.5, mid ? 0.6 : 0.46, 0.5), { x: Math.cos(a) * ARCH_X, y: ARCH_SPRING + Math.sin(a) * ARCH_X, rz: a - Math.PI / 2, tint: mid ? 0xcdb48a : stone, wob: 0.03, salt: 20 + i }));
  }
  // the hedge it stands in: leafy lumps either side, in two greens
  [[-1.6, 0.45, 0.62, 0x3f8d45], [-2.3, 0.7, 0.55, 0x4ea457], [-1.7, 1.15, 0.5, 0x4a9b4e], [-2.9, 0.4, 0.5, 0x3f8d45],
    [1.65, 0.5, 0.6, 0x4ea457], [2.35, 0.65, 0.55, 0x3f8d45], [1.75, 1.2, 0.5, 0x4a9b4e], [2.95, 0.4, 0.5, 0x4ea457]].forEach(([x, y, r, tint], i) => {
    parts.push(piece(new THREE.IcosahedronGeometry(r, 0).scale(1.2, 1, 1), { x, y, z: 0.05 * (i % 3), tint, wob: 0.08, salt: 30 + i }));
  });
  // ivy up the left pillar and over the top, pink blossom among it
  for (const [x, y, z, s, tint] of [[-ARCH_X - 0.05, 0.5, 0.25, 0.34, 0x4a9b4e], [-ARCH_X, 1.3, 0.25, 0.3, 0x5aa85a], [-ARCH_X + 0.1, 2.0, 0.22, 0.28, 0x4a9b4e], [-0.45, 2.85, 0.22, 0.26, 0x5aa85a], [0.5, 2.9, 0.2, 0.24, 0xffc8dc]]) {
    parts.push(piece(new THREE.IcosahedronGeometry(s, 0), { x, y, z, tint }));
  }
  // the lantern on the right pillar: a warm box under a little roof
  parts.push(piece(box(0.22, 0.3, 0.22), { x: ARCH_X + 0.02, y: 1.65, z: 0.4, tint: 0xffe29a }));
  parts.push(piece(new THREE.ConeGeometry(0.2, 0.2, 4), { x: ARCH_X + 0.02, y: 1.9, z: 0.4, ry: Math.PI / 4, tint: 0x7a5a38 }));
  return mergeGeometries(parts, false);
}
function archDisc() {
  const half = ARCH_X - 0.27;
  const s = new THREE.Shape();
  s.moveTo(-half, 0);
  s.lineTo(half, 0);
  s.lineTo(half, ARCH_SPRING);
  s.absarc(0, ARCH_SPRING, half, 0, Math.PI, false);
  s.lineTo(-half, 0);
  const g = new THREE.ShapeGeometry(s, 10);
  // the swirl is painted round the arch's own middle, not the sheet's
  const p = g.attributes.position;
  const u = g.attributes.uv;
  const span = ARCH_SPRING / 2 + half;
  for (let i = 0; i < p.count; i++) u.setXY(i, 0.5 + p.getX(i) / (2 * span), 0.5 + (p.getY(i) - (ARCH_SPRING / 2 + half / 2)) / (2 * span));
  return g;
}

// the hollow -------------------------------------------------------------------------------------------------------
const HOLLOW_Z = -1.3; // m, the trunk's middle behind the way through
function hollowBody() {
  const bark = 0x7a5a3c;
  const trunkR = 1.25;
  const topR = 1.1;
  const trunkH = 3.6;
  // a flat face to the front (the cat walks up to it): turn the 12-sided trunk half a side; `front` is that face's z
  // at the foot of the doorway (0.5 m up: the trunk is a little narrower higher, so nothing of it stands proud of the disc)
  const front = HOLLOW_Z + (trunkR - (trunkR - topR) * (0.5 / trunkH)) * Math.cos(Math.PI / 12);
  const parts = [
    piece(new THREE.CylinderGeometry(topR, trunkR, trunkH, 12, 1, false), { x: 0, y: trunkH / 2, z: HOLLOW_Z, ry: Math.PI / 12, tint: bark, moss: 1, mossTo: 1.6, wob: 0.06, salt: 41 }),
  ];
  // the doorway's frame: a thick bark ring, taller than wide
  parts.push(piece(new THREE.TorusGeometry(0.62, 0.14, 5, 12).scale(1, 1.35, 1), { x: 0, y: 1.45, z: front - 0.02, tint: 0x5f4429, wob: 0.03, salt: 42 }));
  // roots, a leafy crown, a tuft of grass at the foot
  for (const [x, z, ry] of [[-1.15, HOLLOW_Z + 0.9, 0.5], [1.2, HOLLOW_Z + 0.95, -0.55], [0.1, HOLLOW_Z - 1.25, 0.1]]) {
    parts.push(piece(box(0.32, 0.24, 0.95), { x, y: 0.1, z, ry, tint: 0x6e5236, moss: 1, mossTo: 0.35, wob: 0.04, salt: 50 + x }));
  }
  parts.push(piece(new THREE.IcosahedronGeometry(1.7, 1), { x: -0.3, y: trunkH + 0.7, z: HOLLOW_Z, tint: 0x4f9a4f, wob: 0.1, salt: 61 }));
  parts.push(piece(new THREE.IcosahedronGeometry(1.25, 1), { x: 0.9, y: trunkH + 0.2, z: HOLLOW_Z + 0.3, tint: 0x62ad58, wob: 0.1, salt: 62 }));
  return { geo: mergeGeometries(parts, false), front };
}
function hollowDisc(front) {
  const g = new THREE.CircleGeometry(0.6, 28);
  g.scale(1, 1.35, 1);
  g.translate(0, 1.45, front + 0.06); // just proud of the trunk's face, so it is seen
  return g;
}

// the cleft (the Seaside's rock gate at the pier foot) ---------------------------------------------------------------
// Two tall grey rocks with a cleft between them and a back rock behind it, a low rock over the top; a brass ladder runs up the
// left rock's face and a red ring buoy hangs on the right's. One merged body (about 380 triangles), the disc in the gap.
const CLEFT_FRONT = -0.85; // m, the back rock's face, where the disc sits
// `grotto` (the Crystal Cave's gate at the Old Docks): the same rocks with no ladder and no ring buoy, a violet cast and two little
// crystal shards at the cleft's foot.
// The rocks' round feet are flattened at a hand below the ground, so none sinks further.
function buryFoot(geo) {
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) if (pos.getY(i) < -0.1) pos.setY(i, -0.1);
  return geo;
}
function cleftBody(grotto = false) {
  const rock = (r, sx, sy, sz, o) => piece(new THREE.IcosahedronGeometry(r, o.detail ?? 1).scale(sx, sy, sz), o);
  const parts = [
    rock(1.1, 0.9, 1.9, 1, { x: -1.35, y: 1.3, z: -1.0, tint: 0x8c9296, moss: 0.8, mossTo: 0.9, wob: 0.1, salt: 71 }),
    rock(1.1, 0.9, 1.7, 1, { x: 1.35, y: 1.2, z: -1.0, tint: 0x82888d, moss: 0.8, mossTo: 0.9, wob: 0.1, salt: 72 }),
    rock(1.2, 1.3, 1.8, 0.9, { x: 0, y: 1.6, z: -2.1, tint: 0x767c82, moss: 0.6, mossTo: 1.2, wob: 0.1, salt: 73 }),
    rock(0.9, 1.8, 0.6, 0.9, { x: 0, y: 2.55, z: -1.15, tint: 0x969b9e, wob: 0.08, salt: 74, detail: 0 }),
  ];
  if (grotto) {
    for (const [x, s, t] of [[-0.45, 0.32, 0xc9a6ff], [0.5, 0.26, 0xe8d2ff]]) parts.push(piece(new THREE.OctahedronGeometry(s, 0).scale(0.6, 1.8, 0.6), { x, y: s * 1.6, z: -0.7, tint: t }));
    return buryFoot(mergeGeometries(parts, false));
  }
  // the ladder on the left rock's face: two rails and three rungs
  for (const sx of [-1, 1]) parts.push(piece(box(0.06, 2.1, 0.06), { x: -1.35 + sx * 0.3, y: 1.15, z: 0.02, tint: 0xb08d4a }));
  for (const y of [0.55, 1.2, 1.85]) parts.push(piece(box(0.66, 0.05, 0.05), { x: -1.35, y, z: 0.03, tint: 0xc29f58 }));
  // the ring buoy on the right rock's face
  parts.push(piece(new THREE.TorusGeometry(0.27, 0.08, 4, 8), { x: 1.35, y: 1.45, z: 0.0, tint: 0xd9402f }));
  return buryFoot(mergeGeometries(parts, false));
}
// the hatch ----------------------------------------------------------------------------------------------------------
const HATCH_Z = -0.86; // m, the porthole's middle (the planks are just behind it)
const HATCH_Y = 1.5;
function hatchBody(awake) {
  const wood = [0x8a7a66, 0x7d6e5c];
  const brass = awake ? 0xd2a944 : 0x8e7a50;
  const parts = [];
  // two pier posts, a lintel across them and the planked door between
  [-1, 1].forEach((sx, i) => parts.push(piece(new THREE.CylinderGeometry(0.17, 0.2, 3.0, 6, 1), { x: sx * 1.05, y: 1.4, z: -0.7, tint: wood[i], moss: 1, mossTo: 0.7, wob: 0.025, salt: 80 + i })));
  parts.push(piece(box(2.85, 0.28, 0.4), { x: 0, y: 2.78, z: -0.7, tint: 0x75665a, wob: 0.02, salt: 83 }));
  parts.push(piece(box(1.95, 2.55, 0.1), { x: 0, y: 1.25, z: -0.97, tint: 0x66584a, wob: 0.015, salt: 84 }));
  // the porthole: dark glass (the glow is drawn over it) in a brass rim
  parts.push(piece(new THREE.CircleGeometry(0.6, 12), { x: 0, y: HATCH_Y, z: HATCH_Z - 0.01, tint: 0x1d4a4f }));
  parts.push(piece(new THREE.TorusGeometry(0.66, 0.07, 4, 10), { x: 0, y: HATCH_Y, z: HATCH_Z, tint: brass }));
  // the ring buoy on the right post, a coil of rope on the left
  parts.push(piece(new THREE.TorusGeometry(0.27, 0.08, 3, 8), { x: 1.05, y: 1.75, z: -0.46, tint: awake ? 0xd9402f : 0x9a5a50 }));
  parts.push(piece(box(0.12, 0.1, 0.12), { x: 1.05, y: 2.02, z: -0.46, tint: 0xe8e2d4 }));
  parts.push(piece(new THREE.TorusGeometry(0.24, 0.05, 3, 6), { x: -1.05, y: 1.1, z: -0.7, rx: Math.PI / 2, tint: 0xc7b48a }));
  // a short ladder going down the right-hand side
  for (const dz of [-0.14, 0.14]) parts.push(piece(box(0.05, 1.7, 0.05), { x: 1.5, y: 0.85, z: -0.7 + dz, tint: 0xb08d4a }));
  for (const y of [0.35, 0.8, 1.25]) parts.push(piece(box(0.05, 0.05, 0.33), { x: 1.5, y, z: -0.7, tint: 0xc29f58 }));
  // barnacles low on the posts, green algae at their feet
  for (const [x, y, z] of [[-1.05, 0.35, -0.53], [1.05, 0.3, -0.52], [1.16, 0.5, -0.56]]) parts.push(piece(new THREE.OctahedronGeometry(0.06, 0), { x, y, z, tint: 0xc9c6b8 }));
  for (const [x, z, s] of [[-1.15, -0.5, 0.2], [1.1, -0.5, 0.18]]) parts.push(piece(new THREE.IcosahedronGeometry(s, 0).scale(1.3, 0.45, 1), { x, y: 0.06, z, tint: 0x4f9a4f }));
  return buryFoot(mergeGeometries(parts, false));
}
function hatchDisc() {
  const g = new THREE.CircleGeometry(0.6, 20);
  g.translate(0, HATCH_Y, HATCH_Z + 0.06);
  return g;
}
function cleftDisc() {
  const g = new THREE.CircleGeometry(0.58, 24);
  g.scale(1, 1.8, 1);
  g.translate(0, 1.2, CLEFT_FRONT + 0.05);
  return g;
}

// ---- the swirl: one soft painting for every disc, white on black (the additive material adds it, tinted) ----
let swirl;
function swirlTexture() {
  if (swirl !== undefined) return swirl;
  swirl = null;
  try {
    const canvas = globalThis.document?.createElement?.('canvas');
    const ctx = canvas?.getContext?.('2d');
    if (!ctx) return swirl;
    canvas.width = 128;
    canvas.height = 128;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 128, 128);
    const core = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    core.addColorStop(0, 'rgba(255,255,255,0.8)');
    core.addColorStop(0.5, 'rgba(255,255,255,0.45)');
    core.addColorStop(1, 'rgba(255,255,255,0.18)');
    ctx.fillStyle = core;
    ctx.fillRect(0, 0, 128, 128);
    ctx.lineCap = 'round';
    for (let arm = 0; arm < 3; arm++) {
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 6;
      ctx.beginPath();
      for (let k = 0; k <= 24; k++) {
        const r = 6 + k * 2.1;
        const a = (arm * 2 * Math.PI) / 3 + k * 0.2;
        const px = 64 + Math.cos(a) * r;
        const py = 64 + Math.sin(a) * r;
        if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
    // the soft edge: the rim goes to black, so a disc has no hard line
    const rim = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    rim.addColorStop(0, 'rgba(0,0,0,0)');
    rim.addColorStop(0.62, 'rgba(0,0,0,0)');
    rim.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.fillStyle = rim;
    ctx.fillRect(0, 0, 128, 128);
    swirl = new THREE.CanvasTexture(canvas);
    swirl.center.set(0.5, 0.5);
    swirl.colorSpace = THREE.SRGBColorSpace;
  } catch { swirl = null; }
  return swirl;
}

const SPIN = 0.9; // radians a second
const DRIFT = 0.45; // radians a second, the motes' slow turn

// One gate's group, at `end`'s spot. `awake` false: the body alone, a little greyer. `calm`: nothing moves.
export function buildTeleGate(end, { ground = FLAT_GROUND, awake = true, calm = false } = {}) {
  const look = LOOK_NAMES.includes(end.look) ? end.look : 'stonering';
  const g = new THREE.Group();
  g.name = 'telegate';
  g.userData.endId = end.id;
  g.userData.look = look;
  g.position.set(end.x, ground.y(end.x, end.z), end.z);
  g.rotation.y = OUT_YAW[end.faces];

  let bodyGeo;
  let discGeo;
  let moteY = 1.5;
  if (look === 'archway') { bodyGeo = archBody(); discGeo = archDisc(); moteY = 1.7; }
  else if (look === 'hollow') {
    const h = hollowBody();
    bodyGeo = h.geo; discGeo = hollowDisc(h.front); moteY = 1.6;
  } else if (look === 'hatch') { bodyGeo = hatchBody(awake); discGeo = hatchDisc(); moteY = 1.6; }
  else if (look === 'cleft' || look === 'grotto') { bodyGeo = cleftBody(look === 'grotto'); discGeo = cleftDisc(); moteY = 1.6; }
  else { bodyGeo = ringBody(); discGeo = ringDisc(); }

  const body = new THREE.Mesh(bodyGeo, litMaterial(awake ? 0xffffff : 0xbcc2c4, { vertexColors: true, roughness: 0.95 }));
  body.name = 'teleBody';
  g.add(body);
  if (!awake) { g.userData.awake = false; return g; }
  g.userData.awake = true;

  const tex = swirlTexture();
  const disc = new THREE.Mesh(
    discGeo,
    new THREE.MeshBasicMaterial({ color: discTint(end), map: tex, transparent: true, opacity: 0.62, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  disc.name = 'teleDisc';
  disc.userData.noMerge = true;
  disc.userData.noCast = true;
  g.add(disc);

  // four motes: tiny octahedra at fixed places round the gate, in one geometry, turning slowly about the gate's middle
  const motes = [];
  [[-1.5, 0.3, 0.5], [1.4, 1.2, -0.3], [-0.6, 2.4, 0.7], [0.8, 0.5, 0.9]].forEach(([x, y, z]) => {
    const m = new THREE.OctahedronGeometry(0.05, 0);
    m.deleteAttribute('uv');
    m.translate(x, y + moteY - 1.5, z);
    motes.push(m);
  });
  const moteMesh = new THREE.Mesh(mergeGeometries(motes, false), new THREE.MeshBasicMaterial({ color: MOTE_COLOUR[look] }));
  moteMesh.name = 'teleMotes';
  moteMesh.position.y = 0;
  moteMesh.userData.noMerge = true;
  moteMesh.userData.noCast = true;
  g.add(moteMesh);

  // Time, read as it is drawn (no ticker for the walk to run): the swirl turns, the motes drift. Calm: still.
  if (!calm) {
    disc.onBeforeRender = () => {
      const t = clock();
      if (tex) tex.rotation = t * SPIN;
      disc.material.opacity = 0.6 + 0.08 * Math.sin(t * 1.3); // slow: well under three a second
    };
    moteMesh.onBeforeRender = () => {
      const t = clock();
      moteMesh.rotation.y = t * DRIFT;
      moteMesh.position.y = Math.sin(t * 0.9) * 0.12;
    };
  }
  return g;
}

export const NO_TELE = Object.freeze({ colliders: Object.freeze([]) });

// The solid parts of one gate, as world circles { x, z, r } (the gate's frame turned the way it faces).
export function teleSolids(end) {
  const th = OUT_YAW[end.faces];
  const c = Math.cos(th);
  const s = Math.sin(th);
  return (LOOK_SOLIDS[end.look] ?? LOOK_SOLIDS.stonering).map(({ lx, lz, r }) => ({ x: end.x + lx * c + lz * s, z: end.z - lx * s + lz * c, r }));
}

// Adds each end's gate to `scene`; returns { colliders } (the solid parts of each, for walk.js to push on the live
// collider list: never an area's own list). `awakeOf(end)` says which are awake (default: all).
export function addTeleGates(scene, ends, { ground = FLAT_GROUND, awakeOf = () => true, calm = false } = {}) {
  const colliders = [];
  for (const end of ends) {
    scene.add(buildTeleGate(end, { ground, awake: awakeOf(end), calm }));
    colliders.push(...teleSolids(end));
  }
  return { colliders };
}
