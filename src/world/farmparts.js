import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// =============================================================================
// APPLETREE FARM'S MODELS. Everything the Farm builds for itself: the barn, the
// three sheds, the hen coop, the kennel, the tractor, hay bales, fences, the
// scarecrow, the jetty, the wheat and the vegetable rows.
//
// The same three rules world/docksdressing.js works by:
//
// 1. LOCAL UUIDS. Every function here makes THREE objects, so farm.js calls
//    them inside withLocalUuids: the Farm's build then draws on Math.random
//    only through builder.js, like every other area. For the same reason
//    nothing here touches builder.js or litMaterial (both cache across areas)
//    and nothing at module level is a THREE object. Variation comes from
//    hash01, never Math.random.
//
// 2. FEW DRAWS. A building is three vertex-coloured meshes in a Group: walls,
//    roof, and a small mesh of window panes (userData.window: the dusk pass
//    lights it, and treefade.js reads a Group that holds one as a building to
//    fade when it stands between the camera and the cat). Fences are one mesh
//    for the whole farm, the wheat is one, the low dressing is one.
//
// 3. NO RECORDS. Nothing here adds a collider, perch or point. farm.js owns
//    every number a cat can stand on, and passes the positions in.
// =============================================================================

export function hash01(x, z, salt) {
  const h = Math.sin(x * 12.9898 + z * 78.233 + salt * 37.719) * 43758.5453;
  return h - Math.floor(h);
}

// The farm's paint.
export const FARM_COLORS = Object.freeze({
  barnRed: 0xa8372e,
  barnDoor: 0x8e2c26,
  trim: 0xf0e9da,
  roof: 0x55525c,
  roofRed: 0x8a4338,
  tin: 0x8d989c,
  timber: 0x8f6f4c,
  timberDark: 0x6b5138,
  plank: 0xb08d5e,
  whitewash: 0xe9e3d3,
  granary: 0xc79a55,
  straw: 0xdcbb5c,
  strawDark: 0xb9963f,
  glass: 0xa8d8e8,
  tractor: 0xc8342c,
  tyre: 0x2b2b30,
  hub: 0xe8c040,
  steel: 0xaeb6ba,
  soil: 0x6b4a32,
  stone: 0x9a968c,
  wheat: 0xd9b24c,
  wheatBase: 0x9aa04a,
});

// ---- the toolkit ---------------------------------------------------------------
// Each call pushes one painted, non-indexed geometry (position, normal, color)
// onto `P`. Positions are in the caller's frame; `y` is the BOTTOM of the part
// unless `o.c` (centred) is set. `o` = { yaw, pitch, roll, c, shade }.

function matrixOf(x, y, z, o) {
  const e = new THREE.Euler(o.pitch ?? 0, o.yaw ?? 0, o.roll ?? 0, 'YXZ');
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(e), new THREE.Vector3(1, o.sy ?? 1, 1));
}

function finish(P, geo, hex, m, shade = 1) {
  let g = geo;
  if (g.index) {
    g = geo.toNonIndexed();
    geo.dispose();
  }
  g.deleteAttribute('uv');
  if (m) g.applyMatrix4(m);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  const c = new THREE.Color(hex);
  for (let i = 0; i < n; i++) {
    col[i * 3] = c.r * shade;
    col[i * 3 + 1] = c.g * shade;
    col[i * 3 + 2] = c.b * shade;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  P.push(g);
  return g;
}

export function box(P, w, h, d, x, y, z, hex, o = {}) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (!o.c) g.translate(0, h / 2, 0);
  return finish(P, g, hex, matrixOf(x, y, z, o), o.shade);
}

export function cyl(P, rTop, rBottom, h, x, y, z, hex, o = {}) {
  const g = new THREE.CylinderGeometry(rTop, rBottom, h, o.sides ?? 8);
  if (!o.c) g.translate(0, h / 2, 0);
  return finish(P, g, hex, matrixOf(x, y, z, o), o.shade);
}

export function ball(P, r, x, y, z, hex, o = {}) {
  const g = new THREE.IcosahedronGeometry(r, o.detail ?? 0);
  return finish(P, g, hex, matrixOf(x, y, z, o), o.shade);
}

// A flat convex polygon through 3D points, drawn on both faces.
export function sheet(P, pts, hex, o = {}) {
  const a = new THREE.Vector3(...pts[0]);
  const n = new THREE.Vector3().subVectors(new THREE.Vector3(...pts[1]), a)
    .cross(new THREE.Vector3().subVectors(new THREE.Vector3(...pts[2]), a)).normalize();
  const pos = [];
  const nrm = [];
  for (let i = 1; i < pts.length - 1; i++) {
    for (const p of [pts[0], pts[i], pts[i + 1]]) { pos.push(...p); nrm.push(n.x, n.y, n.z); }
    for (const p of [pts[0], pts[i + 1], pts[i]]) { pos.push(...p); nrm.push(-n.x, -n.y, -n.z); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  return finish(P, g, hex, null, o.shade);
}

// A gable roof over a w (across the ridge) by d (along it) footprint: two
// slabs meeting at a ridge `rise` above y, overhanging by `over` all round.
// The ridge runs along z, or along x with `alongX`.
export function gableRoof(P, w, d, rise, x, y, z, hex, { over = 0.4, t = 0.14, alongX = false } = {}) {
  const run = w / 2;
  const ang = Math.atan2(rise, run);
  const len = Math.hypot(run, rise) + over;
  const sub = [];
  for (const s of [-1, 1]) {
    // the slab's centre: halfway down the slope, pushed out by half the overhang
    const along = (len / 2) - 0; // from the ridge
    const cx = s * Math.cos(ang) * along;
    const cy = rise - Math.sin(ang) * along;
    box(sub, len, t, d + over * 2, cx, cy, 0, hex, { c: true, roll: -s * ang, shade: s < 0 ? 0.92 : 1 });
  }
  // a ridge cap
  box(sub, 0.22, 0.1, d + over * 2, 0, rise + 0.02, 0, hex, { c: true, shade: 0.85 });
  const m = matrixOf(x, y, z, { yaw: alongX ? Math.PI / 2 : 0 });
  for (const g of sub) { g.applyMatrix4(m); P.push(g); }
}

// Sub-parts built in their own frame, then set down at (x, y, z) turned `yaw`.
export function placed(P, x, y, z, yaw, fn) {
  const sub = [];
  fn(sub);
  const m = matrixOf(x, y, z, { yaw });
  for (const g of sub) { g.applyMatrix4(m); P.push(g); }
}

export function meshOf(P, name, { roughness = 0.9, noCast = false, side = THREE.FrontSide } = {}) {
  const geo = P.length === 1 ? P[0] : mergeGeometries(P, false);
  if (P.length > 1) for (const g of P) g.dispose();
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness, metalness: 0, side }));
  m.name = name;
  m.receiveShadow = true;
  if (noCast) {
    m.castShadow = false;
    m.userData.noCast = true;
  }
  return m;
}

// A building: its walls, its roof and its panes, in a Group set down at (x, z).
//
// The roof is a mesh of its own, and stays one (noMerge), for the camera:
// treefade.js fades a building when the cat or the camera is inside its box,
// and takes the box's footprint from the meshes that reach the ground. With
// the roof apart, the box is the walls, not the eaves, so a cat sitting on the
// hay bales against the barn does not make the whole barn go see-through.
function building(name, body, roof, panes, x, z, yaw) {
  const g = new THREE.Group();
  g.name = name;
  g.add(meshOf(body, name + 'Body'));
  const top = meshOf(roof, name + 'Roof');
  top.userData.noMerge = true;
  g.add(top);
  const win = meshOf(panes, name + 'Windows', { roughness: 0.25, noCast: true });
  win.userData.window = true;
  g.add(win);
  g.position.set(x, 0, z);
  g.rotation.y = yaw;
  return g;
}

const C = FARM_COLORS;

// ---- the barn -------------------------------------------------------------------
// Local frame: centre at the origin, the big doors on +z. BARN says where
// everything a cat can reach is, so farm.js's perches read these numbers.
export const BARN = Object.freeze({
  w: 12, d: 9, wall: 4.2, rise: 2.6, loft: 3.0,
  // the hay door over the big doors: x -1.6..1.6, from the loft floor up
  hayDoor: Object.freeze({ half: 1.6, top: 4.9 }),
  beamY: 5.0, // the tie beam under the ridge
});

export function barn(x, z, yaw = 0) {
  const { w, d, wall, rise, hayDoor } = BARN;
  const loft = BARN.loft;
  const hw = w / 2;
  const hd = d / 2;
  const P = [];
  const R = [];
  const fz = hd - 0.1; // the front wall's centre plane
  // walls
  box(P, w, wall, 0.2, 0, 0, -fz, C.barnRed, { shade: 0.9 });
  for (const s of [-1, 1]) box(P, 0.2, wall, d, s * (hw - 0.1), 0, 0, C.barnRed, { shade: s < 0 ? 0.94 : 1 });
  const sideW = hw - hayDoor.half;
  for (const s of [-1, 1]) box(P, sideW, wall, 0.2, s * (hayDoor.half + sideW / 2), 0, fz, C.barnRed);
  box(P, hayDoor.half * 2, loft, 0.2, 0, 0, fz, C.barnRed);
  // gables. The roof line over x is wall + rise * (1 - |x| / hw).
  const roofY = (px) => wall + rise * (1 - Math.abs(px) / hw);
  const h = hayDoor.half;
  // (flush with the walls' outer faces, so no ledge shows where they meet)
  for (const s of [-1, 1]) {
    sheet(P, [[s * hw, wall, hd], [s * h, wall, hd], [s * h, roofY(h), hd]], C.barnRed);
  }
  sheet(P, [[-h, hayDoor.top, hd], [h, hayDoor.top, hd], [h, roofY(h), hd], [0, wall + rise, hd], [-h, roofY(h), hd]], C.barnRed);
  sheet(P, [[-hw, wall, -hd], [hw, wall, -hd], [0, wall + rise, -hd]], C.barnRed, { shade: 0.9 });
  // roof (the loft's floor, hay and beams are barnLoft, below)
  gableRoof(R, w, d, rise, 0, wall, 0, C.roof, { over: 0.5 });
  // white trim: corner boards, the big doors and their braces, the hay door
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(P, 0.26, wall, 0.26, sx * (hw - 0.02), 0, sz * (hd - 0.02), C.trim);
  const tz = hd + 0.03;
  for (const s of [-1, 1]) {
    box(P, 1.5, 2.6, 0.06, s * 0.78, 0, tz - 0.02, C.barnDoor);
    box(P, 0.18, 2.75, 0.1, s * 1.62, 0, tz, C.trim);
    const diag = Math.hypot(1.4, 2.5);
    const ang = Math.atan2(2.5, 1.4);
    box(P, diag, 0.13, 0.05, s * 0.78, 1.3, tz + 0.03, C.trim, { c: true, roll: ang });
    box(P, diag, 0.13, 0.05, s * 0.78, 1.3, tz + 0.03, C.trim, { c: true, roll: -ang });
    box(P, 1.5, 0.13, 0.05, s * 0.78, 0.04, tz + 0.03, C.trim);
    box(P, 0.15, hayDoor.top - loft, 0.1, s * (h + 0.05), loft, tz, C.trim);
    // rake boards under the roof's front edge
    const rake = Math.hypot(hw, rise);
    box(R, rake + 0.4, 0.2, 0.08, s * hw / 2, wall + rise / 2 - 0.12, hd + 0.42, C.trim, { c: true, roll: -s * Math.atan2(rise, hw) });
  }
  box(P, 0.1, 2.7, 0.08, 0, 0, tz, C.trim);
  box(P, 3.5, 0.18, 0.1, 0, 2.7, tz, C.trim);
  box(P, h * 2 + 0.4, 0.14, 0.34, 0, loft - 0.14, hd + 0.05, C.trim);
  box(P, h * 2 + 0.4, 0.15, 0.1, 0, hayDoor.top, tz, C.trim);
  // the hoist beam over the hay door
  box(R, 0.16, 0.16, 1.5, 0, 5.75, hd + 0.5, C.timberDark);
  box(R, 0.05, 0.5, 0.05, 0, 5.25, hd + 1.1, C.timberDark);
  const W = [];
  for (const s of [-1, 1]) for (const wz of [-2.2, 2.0]) {
    box(W, 0.06, 0.75, 0.95, s * (hw + 0.02), 1.5, wz, C.glass);
    box(P, 0.08, 0.95, 1.15, s * (hw + 0.0), 1.4, wz, C.trim);
  }
  return building('barn', P, R, W, x, z, yaw);
}

// The inside of the hayloft: its floor, the hay and the two tie beams. A mesh
// of its own, OUTSIDE the barn's Group, so it stays solid when the barn fades
// for the camera: a cat up in the loft is seen sitting on boards among the
// hay, with the walls gone faint round her.
export function barnLoft(x, z, yaw = 0) {
  const { w, d, wall, rise, loft, beamY } = BARN;
  const hw = w / 2;
  const P = [];
  box(P, w - 0.4, 0.12, d - 0.4, 0, loft - 0.12, 0, C.plank, { shade: 0.85 });
  for (const [bx, by, bz, yw] of [[-3.9, 0, 2.6, 0.1], [-4.1, 0, 1.2, -0.15], [-4.0, 0.62, 1.9, 0.3], [3.9, 0, 2.4, -0.1],
    [4.2, 0, 0.9, 0.2], [4.0, 0, -0.6, 0.05], [4.1, 0.62, 0.2, -0.2], [-4.2, 0, -3.0, 0.4], [3.6, 0, -3.2, -0.3]]) {
    box(P, 1.3, 0.62, 0.9, bx, loft + by, bz, C.straw, { yaw: yw, shade: 0.9 + 0.12 * hash01(bx, bz, 3) });
  }
  ball(P, 1.5, -1.6, loft, -2.6, C.straw, { sy: 0.3, detail: 1, shade: 0.95 });
  ball(P, 1.1, 1.4, loft, -3.0, C.strawDark, { sy: 0.3, detail: 1 });
  const beamHalf = hw * (1 - (beamY - wall) / rise) - 0.1;
  box(P, beamHalf * 2, 0.18, 0.18, 0, beamY, -0.5, C.timberDark);
  box(P, beamHalf * 2, 0.18, 0.18, 0, beamY, 2.4, C.timberDark);
  const m = meshOf(P, 'barnLoft');
  m.position.set(x, 0, z);
  m.rotation.y = yaw;
  return m;
}

// ---- hay bales ------------------------------------------------------------------
// `bales`: [{ x, z, y, yaw, round }] in world coordinates; y is the bottom.
export const BALE = Object.freeze({ w: 1.3, h: 0.9, d: 1.0, roundR: 0.75, roundL: 1.3 });
export function hayBales(bales) {
  const P = [];
  for (const b of bales) {
    const shade = 0.92 + 0.12 * hash01(b.x, b.z, 5 + (b.y ?? 0));
    placed(P, b.x, b.y ?? 0, b.z, b.yaw ?? 0, (S) => {
      if (b.round) {
        cyl(S, BALE.roundR, BALE.roundR, BALE.roundL, 0, BALE.roundR, 0, C.straw, { c: true, roll: Math.PI / 2, sides: 12, shade });
        for (const s of [-1, 1]) cyl(S, BALE.roundR * 0.55, BALE.roundR * 0.55, 0.02, s * (BALE.roundL / 2 + 0.01), BALE.roundR, 0, C.strawDark, { c: true, roll: Math.PI / 2, sides: 12 });
      } else {
        box(S, BALE.w, BALE.h, BALE.d, 0, 0, 0, C.straw, { shade });
        for (const tx of [-0.35, 0.35]) box(S, 0.05, BALE.h + 0.02, BALE.d + 0.02, tx, 0, 0, C.strawDark);
      }
    });
  }
  return meshOf(P, 'hayBales');
}

// ---- the sheds on the east side of the yard ------------------------------------------
// Local frame for all three: the front on +z, w along x, d along z.

// Open-fronted, a low back and a mono-pitch tin roof.
export const TRACTOR_SHED = Object.freeze({ w: 7, d: 7, front: 3.4, back: 2.8 });
export function tractorShed(x, z, yaw = 0) {
  const { w, d, front, back } = TRACTOR_SHED;
  const hw = w / 2;
  const hd = d / 2;
  const P = [];
  const R = [];
  box(P, w, back, 0.16, 0, 0, -hd + 0.08, C.timber, { shade: 0.9 });
  for (const s of [-1, 1]) {
    sheet(P, [[s * (hw - 0.08), 0, -hd], [s * (hw - 0.08), 0, hd], [s * (hw - 0.08), front, hd], [s * (hw - 0.08), back, -hd]], C.timber);
    box(P, 0.22, front, 0.22, s * (hw - 0.11), 0, hd - 0.11, C.timberDark);
    box(P, 0.22, back, 0.22, s * (hw - 0.11), 0, -hd + 0.11, C.timberDark);
  }
  box(P, w, 0.22, 0.22, 0, front - 0.22, hd - 0.11, C.timberDark);
  const ang = Math.atan2(front - back, d);
  box(R, w + 0.7, 0.1, Math.hypot(d, front - back) + 0.8, 0, (front + back) / 2 + 0.08, 0, C.tin, { c: true, pitch: -ang });
  // a workbench and an oil drum along the back wall
  box(P, 2.2, 0.8, 0.6, -1.8, 0, -hd + 0.5, C.timberDark);
  cyl(P, 0.3, 0.3, 0.85, 2.6, 0, -hd + 0.55, 0x3d6a8a);
  const W = [];
  box(W, 1.0, 0.6, 0.06, 0.6, 1.5, -hd - 0.02, C.glass);
  return building('tractorShed', P, R, W, x, z, yaw);
}

// A plank granary with a round steel bin behind it. `hole` is the mouse hole
// at the foot of the front wall, as a local x.
export const GRAIN_STORE = Object.freeze({ w: 6, d: 7, wall: 3.0, rise: 1.5, hole: 2.3, binR: 1.4, binH: 5.2 });
export function grainStore(x, z, yaw = 0) {
  const { w, d, wall, rise, hole, binR, binH } = GRAIN_STORE;
  const hw = w / 2;
  const hd = d / 2;
  const P = [];
  const R = [];
  box(P, w, wall, d, 0, 0, 0, C.granary);
  for (const s of [-1, 1]) sheet(P, [[-hw, wall, s * hd], [hw, wall, s * hd], [0, wall + rise, s * hd]], C.granary, { shade: 0.95 });
  gableRoof(R, w, d, rise, 0, wall, 0, C.roofRed, { over: 0.4 });
  // boards: a few darker battens on the front
  for (let i = -2; i <= 2; i++) box(P, 0.08, wall, 0.04, i * 1.1, 0, hd + 0.02, C.strawDark, { shade: 0.8 });
  box(P, 1.3, 2.1, 0.08, 0, 0, hd + 0.04, C.timberDark);
  box(P, 1.5, 0.14, 0.1, 0, 2.1, hd + 0.05, C.trim);
  // the mouse hole
  cyl(P, 0.16, 0.16, 0.05, hole, 0.1, hd + 0.03, 0x1c1410, { c: true, pitch: Math.PI / 2, sides: 10 });
  // grain sacks by the door
  for (const [sx, sy, sz, yw] of [[-1.5, 0, 0.5, 0.2], [-2.1, 0, 0.45, -0.3], [-1.8, 0.42, 0.45, 0.1]]) {
    box(P, 0.55, 0.42, 0.75, sx, sy, hd + sz, 0xcdb890, { yaw: yw, shade: 0.9 + 0.1 * hash01(sx, sz, 9) });
  }
  // the steel bin behind
  const bz = -hd - binR - 0.3;
  cyl(P, binR, binR, binH, 0, 0, bz, C.steel, { sides: 14 });
  cyl(P, 0.15, binR + 0.1, 1.0, 0, binH, bz, C.tin, { sides: 14 });
  for (const ry of [1.3, 2.6, 3.9]) cyl(P, binR + 0.03, binR + 0.03, 0.06, 0, ry, bz, C.tin, { sides: 14 });
  const W = [];
  box(W, 0.7, 0.5, 0.06, 0, wall + 0.45, hd + 0.02, C.glass);
  return building('grainStore', P, R, W, x, z, yaw);
}

// Whitewashed, a door front and back, milk churns by the front door.
export const MILKING_SHED = Object.freeze({ w: 6, d: 7, wall: 2.7, rise: 1.3 });
export function milkingShed(x, z, yaw = 0) {
  const { w, d, wall, rise } = MILKING_SHED;
  const hw = w / 2;
  const hd = d / 2;
  const P = [];
  const R = [];
  box(P, w, wall, d, 0, 0, 0, C.whitewash);
  box(P, w + 0.04, 0.5, d + 0.04, 0, 0, 0, C.stone);
  for (const s of [-1, 1]) sheet(P, [[s * hw, wall, -hd], [s * hw, wall, hd], [s * hw, wall + rise, 0]], C.whitewash, { shade: 0.95 });
  gableRoof(R, d, w, rise, 0, wall, 0, C.roofRed, { over: 0.4, alongX: true });
  for (const s of [-1, 1]) {
    // a stable door: two leaves, the top one ajar
    box(P, 1.3, 1.05, 0.08, 0, 0, s * (hd + 0.04), 0x4f7d5a);
    box(P, 1.3, 1.0, 0.08, 0, 1.1, s * (hd + 0.04), 0x5c8f68);
    box(P, 1.5, 0.14, 0.1, 0, 2.12, s * (hd + 0.05), C.timberDark);
  }
  for (const [cx, cz] of [[1.5, 0.45], [2.0, 0.4], [1.75, 0.85]]) {
    cyl(P, 0.2, 0.24, 0.6, cx, 0, hd + cz, C.steel, { sides: 10 });
    cyl(P, 0.13, 0.2, 0.18, cx, 0.6, hd + cz, C.steel, { sides: 10 });
    cyl(P, 0.16, 0.16, 0.04, cx, 0.78, hd + cz, C.tin, { sides: 10 });
  }
  const W = [];
  for (const wx of [-1.9, 1.9]) box(W, 0.8, 0.6, 0.06, wx, 1.4, hd + 0.02, C.glass);
  for (const wz of [-1.6, 1.6]) for (const s of [-1, 1]) box(W, 0.06, 0.6, 0.8, s * (hw + 0.02), 1.4, wz, C.glass);
  return building('milkingShed', P, R, W, x, z, yaw);
}

// ---- the hen coop and the kennel --------------------------------------------------------
// The coop: a little house on legs with a ramp down from its door on +z.
export const COOP = Object.freeze({ w: 2.4, d: 2.0, legs: 0.5, wall: 1.1, rise: 0.6 });
export function henCoop(x, z, yaw = 0) {
  const { w, d, legs, wall, rise } = COOP;
  const hw = w / 2;
  const hd = d / 2;
  const P = [];
  const R = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(P, 0.12, legs, 0.12, sx * (hw - 0.1), 0, sz * (hd - 0.1), C.timberDark);
  box(P, w, wall, d, 0, legs, 0, 0xdfe6d2);
  for (const s of [-1, 1]) sheet(P, [[s * hw, legs + wall, -hd], [s * hw, legs + wall, hd], [s * hw, legs + wall + rise, 0]], 0xdfe6d2, { shade: 0.95 });
  gableRoof(R, d, w, rise, 0, legs + wall, 0, C.roofRed, { over: 0.25, t: 0.1, alongX: true });
  // the pop hole and its ramp
  box(P, 0.5, 0.6, 0.05, 0, legs + 0.02, hd + 0.03, 0x2a2018);
  const rampLen = Math.hypot(legs + 0.05, 1.2);
  box(P, 0.5, 0.05, rampLen, 0, (legs + 0.05) / 2, hd + 0.6, C.plank, { c: true, pitch: Math.atan2(legs + 0.05, 1.2) });
  // a nest box on the side
  box(P, 0.5, 0.5, 1.2, hw + 0.25, legs + 0.15, 0, 0xcfd8c2);
  box(P, 0.6, 0.06, 1.3, hw + 0.27, legs + 0.65, 0, C.roofRed, { roll: -0.25 });
  const W = [];
  box(W, 0.4, 0.3, 0.05, -0.75, legs + 0.6, hd + 0.02, C.glass);
  return building('henCoop', P, R, W, x, z, yaw);
}

// The sheepdog's kennel, its door on +z. One mesh: it is too small to hide a cat.
export const KENNEL = Object.freeze({ w: 1.0, d: 1.3, wall: 0.7, rise: 0.4 });
export function kennel(x, z, yaw = 0) {
  const { w, d, wall, rise } = KENNEL;
  const hw = w / 2;
  const hd = d / 2;
  const P = [];
  box(P, w, wall, d, 0, 0, 0, 0x9a6a44);
  for (const s of [-1, 1]) sheet(P, [[-hw, wall, s * hd], [hw, wall, s * hd], [0, wall + rise, s * hd]], 0x9a6a44, { shade: 0.95 });
  gableRoof(P, w, d, rise, 0, wall, 0, 0x4c6a8a, { over: 0.15, t: 0.08 });
  // the doorway: a dark arch
  box(P, 0.46, 0.4, 0.04, 0, 0, hd + 0.02, 0x1c1410);
  cyl(P, 0.23, 0.23, 0.04, 0, 0.4, hd + 0.02, 0x1c1410, { c: true, pitch: Math.PI / 2, sides: 12 });
  // a food bowl beside it
  cyl(P, 0.16, 0.12, 0.08, hw + 0.35, 0, hd - 0.1, 0xc8463c, { sides: 10 });
  const g = meshOf(P, 'kennel');
  g.position.set(x, 0, z);
  g.rotation.y = yaw;
  return g;
}

// ---- the tractor ------------------------------------------------------------------------
// Local frame: nose on +z. TRACTOR gives the two tops a cat stands on.
export const TRACTOR = Object.freeze({ bonnetY: 1.15, bonnetZ: 0.9, roofY: 2.3, roofZ: -0.8 });
export function tractor(x, z, yaw = 0) {
  const P = [];
  const wheel = (wx, wy, wz, r, t) => {
    cyl(P, r, r, t, wx, wy, wz, C.tyre, { c: true, roll: Math.PI / 2, sides: 14 });
    cyl(P, r * 0.5, r * 0.5, t + 0.04, wx, wy, wz, C.hub, { c: true, roll: Math.PI / 2, sides: 10 });
  };
  for (const s of [-1, 1]) {
    wheel(s * 0.85, 0.75, -0.9, 0.75, 0.42);
    wheel(s * 0.7, 0.42, 1.3, 0.42, 0.26);
    // fenders over the back wheels
    box(P, 0.5, 0.08, 1.3, s * 0.85, 1.52, -0.9, C.tractor);
  }
  // the engine and bonnet (top at bonnetY), the grille, the seat block
  box(P, 0.9, 0.6, 2.0, 0, 0.55, 0.75, C.tractor);
  box(P, 0.7, 0.4, 0.06, 0, 0.65, 1.77, 0x2b2b30);
  box(P, 1.2, 0.6, 1.5, 0, 0.5, -0.8, C.tractor, { shade: 0.9 });
  box(P, 0.5, 0.12, 0.5, 0, 1.1, -0.9, 0x2b2b30);
  box(P, 0.5, 0.5, 0.1, 0, 1.2, -1.2, 0x2b2b30);
  // steering column and wheel
  box(P, 0.06, 0.6, 0.06, 0, 1.15, -0.25, 0x2b2b30, { pitch: -0.4 });
  cyl(P, 0.2, 0.2, 0.04, 0, 1.68, -0.48, 0x2b2b30, { c: true, pitch: Math.PI / 2 - 0.4, sides: 10 });
  // the cab: four posts and a flat roof (top at roofY)
  for (const sx of [-1, 1]) for (const pz of [-1.4, -0.2]) box(P, 0.07, 1.1, 0.07, sx * 0.58, 1.1, pz, 0x2b2b30);
  box(P, 1.35, 0.1, 1.4, 0, TRACTOR.roofY - 0.1, TRACTOR.roofZ, C.tractor);
  // exhaust
  cyl(P, 0.05, 0.05, 0.75, 0.3, 1.15, 0.5, 0x4a4a50, { sides: 6 });
  const g = meshOf(P, 'tractor', { roughness: 0.6 });
  g.position.set(x, 0, z);
  g.rotation.y = yaw;
  return g;
}

// ---- fences ------------------------------------------------------------------------------
// `runs`: [{ a: [x, z], b: [x, z], style }]. 'rail' is a post-and-rail field
// fence, its bottom rail above a cat's back so she walks under it; 'wire' is
// the hen run's low netting on thin posts; 'picket' the farm's front fence.
// None has a collider (farm.js): a cat goes through a farm fence.
export const FENCE = Object.freeze({
  rail: Object.freeze({ post: 1.15, top: 1.0, rails: Object.freeze([0.55, 0.95]), step: 2.2, color: 0xb59b78 }),
  wire: Object.freeze({ post: 0.95, top: 0.9, rails: Object.freeze([0.5, 0.88]), step: 1.6, color: 0x8a8f86 }),
  picket: Object.freeze({ post: 1.0, top: 0.9, rails: Object.freeze([0.5, 0.85]), step: 2.0, color: 0xf0e9da }),
});
export function fences(runs, gates = []) {
  const P = [];
  for (const r of runs) {
    const S = FENCE[r.style ?? 'rail'];
    const [x1, z1] = r.a;
    const [x2, z2] = r.b;
    const len = Math.hypot(x2 - x1, z2 - z1);
    const n = Math.max(1, Math.round(len / S.step));
    const yaw = Math.atan2(x2 - x1, z2 - z1);
    const thin = r.style === 'wire';
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const px = x1 + (x2 - x1) * t;
      const pz = z1 + (z2 - z1) * t;
      const pw = thin ? 0.07 : 0.13;
      box(P, pw, S.post, pw, px, 0, pz, S.color, { yaw, shade: 0.9 + 0.1 * hash01(px, pz, 2) });
    }
    for (const ry of S.rails) {
      box(P, thin ? 0.03 : 0.05, thin ? 0.03 : 0.11, len, (x1 + x2) / 2, ry, (z1 + z2) / 2, S.color, { c: true, yaw });
    }
    if (r.style === 'picket') {
      const m = Math.max(2, Math.round(len / 0.33));
      for (let i = 0; i < m; i++) {
        const t = (i + 0.5) / m;
        box(P, 0.09, 0.8, 0.03, x1 + (x2 - x1) * t, 0.12, z1 + (z2 - z1) * t, S.color, { yaw: yaw + Math.PI / 2 });
      }
    }
  }
  // A gate leaf standing open: hinged at (x, z), `len` long, swung to `yaw`.
  for (const g of gates) {
    placed(P, g.x, 0, g.z, g.yaw, (S) => {
      const c = g.color ?? FENCE.rail.color;
      for (const gy of [0.3, 0.62, 0.95]) box(S, 0.05, 0.1, g.len, 0, gy, g.len / 2, c, { c: true });
      for (const gz of [0.05, g.len - 0.05]) box(S, 0.08, 0.85, 0.08, 0, 0.2, gz, c);
      const diag = Math.hypot(g.len - 0.1, 0.65);
      box(S, 0.04, 0.08, diag, 0, 0.62, g.len / 2, c, { c: true, pitch: Math.atan2(0.65, g.len - 0.1) });
    });
  }
  return meshOf(P, 'farmFences');
}

// ---- the gate arch and its sign -----------------------------------------------------------
// Two tall posts either side of the lane and a board between them. The words
// are painted on a canvas, as builder.billboard's are.
export function gateArch(x, z, halfSpan, title = 'Appletree Farm') {
  const g = new THREE.Group();
  g.name = 'farmGate';
  const P = [];
  for (const s of [-1, 1]) {
    box(P, 0.24, 3.3, 0.24, s * halfSpan, 0, 0, C.timberDark);
    box(P, 0.34, 0.1, 0.34, s * halfSpan, 3.3, 0, C.timber);
  }
  box(P, halfSpan * 2 + 0.5, 0.2, 0.2, 0, 3.0, 0, C.timberDark);
  box(P, 3.3, 0.86, 0.08, 0, 2.08, 0, C.timber);
  for (const s of [-1, 1]) box(P, 0.04, 0.1, 0.04, s * 1.4, 2.92, 0, 0x4a4a50);
  g.add(meshOf(P, 'farmGateFrame'));
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f4ecd6';
  ctx.fillRect(0, 0, 512, 128);
  ctx.strokeStyle = '#a8372e';
  ctx.lineWidth = 8;
  ctx.strokeRect(6, 6, 500, 116);
  ctx.fillStyle = '#7a2a22';
  ctx.textAlign = 'center';
  ctx.font = 'bold 58px Avenir, Trebuchet MS, sans-serif';
  ctx.fillText(title, 256, 84);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  for (const s of [-1, 1]) {
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 0.72), new THREE.MeshBasicMaterial({ map: texture }));
    panel.name = 'farmGateSign';
    panel.position.set(0, 2.5, s * 0.045);
    panel.rotation.y = s > 0 ? 0 : Math.PI;
    panel.userData.noCast = true;
    g.add(panel);
  }
  g.position.set(x, 0, z);
  // The chase camera follows the cat in under the beam and the sign. Tagged as
  // a lamp post is (treefade.js): the gateway fades while the camera is in it
  // or the view of the cat runs through its top, and is solid otherwise.
  g.userData.fadeOccluder = [{ t: 'cyl', r: halfSpan + 0.4, y0: 1.9, y1: 3.5 }];
  return g;
}

// ---- the scarecrow --------------------------------------------------------------------------
// SCARECROW.hatY is the crown of his straw hat (step 3: the cat tries it on).
export const SCARECROW = Object.freeze({ hatY: 2.25, armY: 1.5 });
export function scarecrow(x, z, yaw = 0) {
  const P = [];
  box(P, 0.1, 2.0, 0.1, 0, 0, 0, C.timberDark);
  box(P, 1.9, 0.09, 0.09, 0, SCARECROW.armY, 0, C.timberDark);
  // a red checked shirt, patched trousers, straw at the cuffs
  box(P, 0.62, 0.7, 0.3, 0, 1.0, 0, 0xc2463a);
  box(P, 0.2, 0.2, 0.31, -0.1, 1.2, 0, 0xe8dcc0);
  for (const s of [-1, 1]) {
    box(P, 0.6, 0.22, 0.24, s * 0.6, SCARECROW.armY - 0.11, 0, 0xc2463a);
    ball(P, 0.14, s * 0.98, SCARECROW.armY, 0, C.straw, { sy: 0.8 });
    box(P, 0.24, 0.6, 0.24, s * 0.16, 0.42, 0, 0x4a6a8f);
    ball(P, 0.13, s * 0.16, 0.4, 0, C.straw, { sy: 0.8 });
  }
  // a sack head with a friendly face, and the hat
  ball(P, 0.26, 0, 1.92, 0, 0xd9c79a, { detail: 1 });
  for (const s of [-1, 1]) box(P, 0.05, 0.05, 0.02, s * 0.09, 1.96, 0.24, 0x2a2018);
  box(P, 0.16, 0.03, 0.02, 0, 1.84, 0.24, 0x2a2018);
  cyl(P, 0.5, 0.5, 0.04, 0, 2.06, 0, C.strawDark, { sides: 12 });
  cyl(P, 0.2, 0.27, 0.18, 0, 2.08, 0, C.straw, { sides: 12 });
  const g = meshOf(P, 'scarecrow');
  g.position.set(x, 0, z);
  g.rotation.y = yaw;
  return g;
}

// ---- everything else that stands up (one casting mesh) -----------------------------------------
// `s` = { jetty, trough, stand, shelter, well, beds }, all in world coordinates.
export const JETTY_Y = 0.12;
export const STAND = Object.freeze({ top: 1.5, size: 1.6 });
export function structures(s) {
  const P = [];
  // the jetty: boards on short posts, drawn from the deck record
  {
    const j = s.jetty;
    const w = j.maxX - j.minX;
    const d = j.maxZ - j.minZ;
    const boards = Math.round(w / 0.5);
    for (let i = 0; i < boards; i++) {
      const bx = j.minX + (i + 0.5) * (w / boards);
      box(P, w / boards - 0.04, 0.06, d, bx, JETTY_Y - 0.06, (j.minZ + j.maxZ) / 2, C.plank, { shade: 0.88 + 0.14 * hash01(bx, j.minZ, 4) });
    }
    for (const px of [j.minX + 0.2, (j.minX + j.maxX) / 2, j.maxX - 0.6]) {
      for (const pz of [j.minZ + 0.06, j.maxZ - 0.06]) cyl(P, 0.08, 0.08, 0.75, px, -0.3, pz, C.timberDark, { sides: 6 });
    }
  }
  // the water trough: a stone box with water in it
  {
    const t = s.trough;
    placed(P, t.x, 0, t.z, t.yaw ?? 0, (S) => {
      box(S, 1.9, 0.5, 0.7, 0, 0, 0, C.stone);
      box(S, 1.7, 0.03, 0.5, 0, 0.5, 0, 0x5f9fb8);
    });
  }
  // the goats' jumping stand: a deck on four legs with a ramp up one side
  {
    const t = s.stand;
    placed(P, t.x, 0, t.z, t.yaw ?? 0, (S) => {
      const hs = STAND.size / 2;
      box(S, STAND.size, 0.1, STAND.size, 0, STAND.top - 0.1, 0, C.plank);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(S, 0.12, STAND.top - 0.1, 0.12, sx * (hs - 0.1), 0, sz * (hs - 0.1), C.timberDark);
      for (const sx of [-1, 1]) box(S, 0.06, 0.08, STAND.size, sx * (hs - 0.1), 0.7, 0, C.timberDark);
      const len = Math.hypot(2.4, STAND.top - 0.1);
      box(S, 0.6, 0.06, len, 0, (STAND.top - 0.1) / 2, hs + 1.2, C.plank, { c: true, pitch: Math.atan2(STAND.top - 0.1, 2.4), shade: 0.9 });
      for (let i = 1; i < 6; i++) {
        const k = i / 6;
        box(S, 0.6, 0.04, 0.05, 0, (STAND.top - 0.1) * (1 - k) + 0.03, hs + 2.4 * k, C.timberDark, { c: true });
      }
    });
  }
  // the goats' shelter: a low three-sided hut, open on +z
  {
    const t = s.shelter;
    placed(P, t.x, 0, t.z, t.yaw ?? 0, (S) => {
      box(S, 2.6, 1.3, 0.1, 0, 0, -0.9, C.timber, { shade: 0.9 });
      for (const sx of [-1, 1]) box(S, 0.1, 1.5, 1.8, sx * 1.25, 0, 0, C.timber);
      box(S, 2.9, 0.08, 2.3, 0, 1.52, 0.05, C.roofRed, { c: true, pitch: -0.12 });
      ball(S, 0.9, 0, 0, -0.2, C.straw, { sy: 0.18, detail: 1 });
    });
  }
  // a stone well in the yard
  {
    const t = s.well;
    cyl(P, 0.7, 0.75, 0.7, t.x, 0, t.z, C.stone, { sides: 12 });
    cyl(P, 0.55, 0.55, 0.02, t.x, 0.66, t.z, 0x35607a, { sides: 12 });
    for (const sx of [-1, 1]) box(P, 0.1, 1.5, 0.1, t.x + sx * 0.68, 0.6, t.z, C.timberDark);
    gableRoof(P, 1.3, 1.9, 0.45, t.x, 2.05, t.z, C.roofRed, { over: 0.1, t: 0.07, alongX: true });
    cyl(P, 0.06, 0.06, 1.3, t.x, 1.85, t.z, C.timberDark, { c: true, roll: Math.PI / 2, sides: 6 });
  }
  // board edging round the vegetable beds
  for (const b of s.beds) {
    const w = b.maxX - b.minX;
    const d = b.maxZ - b.minZ;
    const cx = (b.minX + b.maxX) / 2;
    const cz = (b.minZ + b.maxZ) / 2;
    for (const sz of [b.minZ, b.maxZ]) box(P, w, 0.14, 0.06, cx, 0, sz, C.timber);
    for (const sx of [b.minX, b.maxX]) box(P, 0.06, 0.14, d, sx, 0, cz, C.timber);
  }
  return meshOf(P, 'farmStructures');
}

// ---- low dressing (one mesh, no shadow) ----------------------------------------------------------
// Vegetable rows inside each bed, and a few apples in the grass.
export function crops(beds) {
  const P = [];
  beds.forEach((b, bi) => {
    const rows = Math.max(1, Math.floor((b.maxZ - b.minZ - 0.4) / 0.9));
    for (let r = 0; r < rows; r++) {
      const z = b.minZ + 0.6 + r * ((b.maxZ - b.minZ - 1.2) / Math.max(1, rows - 1));
      // a raised ridge of soil per row
      box(P, b.maxX - b.minX - 0.5, 0.1, 0.5, (b.minX + b.maxX) / 2, 0, z, C.soil, { shade: 0.9 + 0.1 * hash01(bi, r, 8) });
      const kind = (bi + r) % 3; // cabbages, carrots, pumpkins
      const step = kind === 2 ? 1.5 : kind === 0 ? 0.75 : 0.45;
      for (let x = b.minX + 0.6; x <= b.maxX - 0.5; x += step) {
        const j = (hash01(x, z, 12) - 0.5) * 0.12;
        if (kind === 0) {
          ball(P, 0.2 + 0.05 * hash01(x, z, 13), x + j, 0.2, z, 0x6fae5a, { sy: 0.75, yaw: hash01(x, z, 14) * 6 });
          ball(P, 0.12, x + j, 0.3, z, 0x9bcf7a, { sy: 0.8 });
        } else if (kind === 1) {
          for (let k = 0; k < 3; k++) {
            box(P, 0.03, 0.26, 0.1, x + j, 0.08, z, 0x4f9a48, { yaw: k * 1.05 + hash01(x, z, 15), roll: (k - 1) * 0.35 });
          }
          cyl(P, 0.05, 0.03, 0.05, x + j, 0.08, z, 0xe8862e, { sides: 6 });
        } else {
          const pr = 0.24 + 0.1 * hash01(x, z, 16);
          ball(P, pr, x + j, 0.1 + pr * 0.7, z + j, 0xe58a2a, { sy: 0.72, detail: 1 });
          cyl(P, 0.03, 0.04, 0.1, x + j, 0.1 + pr * 1.38, z + j, 0x5a7a3a, { sides: 5 });
          box(P, 0.5, 0.02, 0.3, x + j + 0.35, 0.11, z + 0.1, 0x4f9a48, { yaw: hash01(x, z, 17) * 3 });
        }
      }
    }
  });
  return meshOf(P, 'farmCrops', { noCast: true });
}

// ---- wheat -----------------------------------------------------------------------------------------
// One double-sided mesh of short tufts over `field` (a rect), leaving out
// whatever `skip(x, z)` says (the scarecrow's clearing, the track in). Each
// tuft is two crossed fans of three thin blades, green at the foot and gold at
// the ear. WHEAT.h is its tallest: a cat (0.4 m) shows over it.
export const WHEAT = Object.freeze({ step: 0.62, hMin: 0.4, hMax: 0.52 });
export function wheatSpots(field, skip = () => false) {
  const spots = [];
  for (let z = field.minZ + WHEAT.step / 2; z < field.maxZ; z += WHEAT.step) {
    for (let x = field.minX + WHEAT.step / 2; x < field.maxX; x += WHEAT.step) {
      const px = x + (hash01(x, z, 21) - 0.5) * 0.4;
      const pz = z + (hash01(x, z, 22) - 0.5) * 0.4;
      if (!skip(px, pz)) spots.push({ x: px, z: pz });
    }
  }
  return spots;
}
export function wheat(spots) {
  const pos = [];
  const nrm = [];
  const col = [];
  const gold = new THREE.Color(C.wheat);
  const foot = new THREE.Color(C.wheatBase);
  for (const s of spots) {
    const h = WHEAT.hMin + (WHEAT.hMax - WHEAT.hMin) * hash01(s.x, s.z, 23);
    const yaw0 = hash01(s.x, s.z, 24) * Math.PI;
    const tone = 0.86 + 0.24 * hash01(s.x, s.z, 25);
    for (let f = 0; f < 2; f++) {
      const yaw = yaw0 + f * Math.PI / 2;
      const ux = Math.cos(yaw);
      const uz = Math.sin(yaw);
      for (let k = -1; k <= 1; k++) {
        // a blade: a thin triangle, its tip leaning a little along the fan
        const bx = s.x + ux * k * 0.16;
        const bz = s.z + uz * k * 0.16;
        const hw = 0.07;
        const tipX = bx + ux * k * 0.08;
        const tipZ = bz + uz * k * 0.08;
        const hk = h * (k === 0 ? 1 : 0.86);
        pos.push(bx - ux * hw, 0, bz - uz * hw, bx + ux * hw, 0, bz + uz * hw, tipX, hk, tipZ);
        for (let v = 0; v < 3; v++) nrm.push(0, 1, 0);
        col.push(foot.r * tone, foot.g * tone, foot.b * tone, foot.r * tone, foot.g * tone, foot.b * tone,
          gold.r * tone, gold.g * tone, gold.b * tone);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeBoundingBox();
  g.computeBoundingSphere();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.95, metalness: 0, side: THREE.DoubleSide,
  }));
  // Lit by the up normal on both faces, so a blade seen from behind is not dark.
  const chunk = THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', '');
  m.material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>', chunk);
  };
  m.material.customProgramCacheKey = () => 'farm-wheat-v1';
  m.name = 'wheat';
  m.castShadow = false;
  m.receiveShadow = true;
  m.userData.noCast = true;
  return m;
}

// ---- apples ---------------------------------------------------------------------------------------------
// One small mesh per apple tree, in the tree Group's own unscaled frame (so it
// sways with it): red apples on the crown's lower half, and two or three
// windfalls in the grass under it. `canopy` is the tree's userData.canopy.
export function apples(x, z, scale, canopy) {
  const P = [];
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + hash01(x + i, z, 31) * 0.6;
    const down = 0.15 + 0.5 * hash01(x, z + i, 32); // 0 = the crown's equator, 1 = its underside
    const r = canopy.r * (0.9 + 0.06 * hash01(x + i, z + i, 33));
    const ring = Math.sqrt(1 - down * down) * r;
    const hex = hash01(x - i, z, 34) < 0.25 ? 0xd9c13a : 0xd23a2e;
    ball(P, 0.1 / scale, Math.cos(a) * ring, canopy.y - down * r, Math.sin(a) * ring, hex);
  }
  for (let i = 0; i < 3; i++) {
    const a = hash01(x, z, 35 + i) * Math.PI * 2;
    const d = (0.7 + 0.9 * hash01(x, z, 38 + i)) / scale;
    ball(P, 0.09 / scale, Math.cos(a) * d, 0.08 / scale, Math.sin(a) * d, 0xd23a2e);
  }
  const m = meshOf(P, 'apples', { roughness: 0.5, noCast: true });
  return m;
}
