// =============================================================================
// THE MOON: THE BASE'S DRAWING KIT (milestone 2). The Moonbase Dome (a glass dome on a white ring, an airlock tunnel with a door that
// slides apart for show, the Core with its two sockets, the Mission Board, six glowing planters), the Old Dish, Skip Ridge's two
// rock pillars (the Far Beacon and the rover's course are milestone 3's: world/moonroverparts.js). Gathered into the same material buckets as milestone 1's kit (one merged mesh
// per material); only what moves or changes is a mesh of its own: the two door leaves, the Core's glow, the dome's lamps, the glass,
// the board's face. No real lights, no canvas (the life puts the board's picture on), no random number: every number is moonplan.js's.
// =============================================================================

import * as THREE from 'three';
import * as P from './moonplan.js';
import { COL, paint, at, box, cyl } from './moonparts.js';

export const BASE_COL = Object.freeze({ floor: 0xc3c8d3, rail: 0xf1f3f8, core: 0x5e6773, teal: 0x4fd6c4, amber: 0xffb23c, mint: 0x8affc0, glassTint: 0x9fd8ff, lampDim: 0x303a4c, lampOn: 0xfff0c4, stone: 0x9b9899, stoneTop: 0xb4b2b1, hazard: 0xf0c43c });
// The values the life moves between: the dome's lamps and the Core's glow, dim before the base wakes and full after.
export const LAMP = Object.freeze({ dim: 0x303a4c, on: 0xfff0c4 });
export const CORE_GLOW = Object.freeze({ dim: 0x1d3a3a, on: 0xffffff });
export const GLASS = Object.freeze({ cold: 0.1, warm: 0.2 });

export function baseMaterials() {
  const dish = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, side: THREE.DoubleSide });
  return {
    glass: new THREE.MeshBasicMaterial({ color: BASE_COL.glassTint, transparent: true, opacity: GLASS.cold, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true }),
    lamp: new THREE.MeshBasicMaterial({ vertexColors: true, color: LAMP.dim }),
    coreglow: new THREE.MeshBasicMaterial({ vertexColors: true, color: CORE_GLOW.dim }),
    beacon: new THREE.MeshBasicMaterial({ vertexColors: true }),
    board: new THREE.MeshBasicMaterial({ color: 0x24313f, side: THREE.DoubleSide }),
    dish,
  };
}

const oct = (r) => new THREE.OctahedronGeometry(r, 0);
const ringFlat = (r0, r1, seg = 24) => new THREE.RingGeometry(r0, r1, seg).rotateX(-Math.PI / 2);

export function drawDome(kit, M, B) {
  const { x, z, wall, floor, glass } = P.DOME;
  // floor and its ring of paving, the wall's low white pillars and a rail along their tops
  kit.put('floor', M.paint, paint(at(new THREE.CircleGeometry(floor, 32).rotateX(-Math.PI / 2), x, z, 0.04), BASE_COL.floor), { noCast: true });
  kit.put('floor', M.paint, paint(at(ringFlat(2.0, 2.3, 28), x, z, 0.06), BASE_COL.teal), { noCast: true });
  for (const k of P.DOME_RING) kit.put('paint', M.paint, paint(at(box(0.9, 1.1, 0.9), k.x, k.z, 0.55, -Math.atan2(k.z - z, k.x - x)), BASE_COL.rail));
  kit.put('floor', M.paint, paint(at(new THREE.TorusGeometry(wall, 0.1, 4, 40).rotateX(Math.PI / 2), x, z, 1.15), BASE_COL.rail), { noCast: true });
  // the glass: one transparent half-sphere, flattened, never casting; six ribs under it
  const dome = new THREE.SphereGeometry(wall, 28, 9, 0, Math.PI * 2, 0, Math.PI / 2);
  dome.scale(1, glass / wall, 1);
  kit.put('glass', B.glass, paint(at(dome, x, z, 1.15), BASE_COL.glassTint), { noCast: true });
  for (let i = 0; i < 6; i++) {
    const rib = new THREE.TorusGeometry(wall, 0.07, 3, 16, Math.PI);
    rib.scale(1, glass / wall, 1);
    kit.put('floor', M.paint, paint(at(rib, x, z, 1.15, (i / 6) * Math.PI), BASE_COL.rail), { noCast: true });
  }
  // sixteen floor lamps round the inside of the wall (one mesh, dim until the base wakes)
  for (let i = 0; i < 16; i++) {
    const a = ((i + 0.5) / 16) * Math.PI * 2;
    if (Math.cos(a) > 0.92) continue; // the airlock's mouth
    kit.put('lamp', B.lamp, paint(at(oct(0.26), x + Math.cos(a) * (wall - 0.9), z + Math.sin(a) * (wall - 0.9), 0.42), 0xffffff), { noCast: true });
  }
}

export function drawAirlock(kit, M, B) {
  const { x0, x1, z, half } = P.AIRLOCK;
  const mid = (x0 + x1) / 2;
  const len = x1 - x0;
  kit.put('floor', M.paint, paint(at(box(len, 0.1, half * 2 + 0.6), mid, z, 0.05), BASE_COL.floor), { noCast: true });
  for (const s of [-1, 1]) kit.put('paint', M.paint, paint(at(box(len, 2.5, 0.34), mid, z + s * (half + 0.17), 1.25), BASE_COL.rail));
  kit.put('paint', M.paint, paint(at(box(len + 0.2, 0.3, half * 2 + 0.9), mid, z, 2.65), BASE_COL.rail));
  // the door frame at the outer end; a hazard stripe over it and a lamp
  for (const s of [-1, 1]) kit.put('paint', M.paint, paint(at(box(0.4, 2.5, 0.4), x1, z + s * (half - 0.05), 1.25), BASE_COL.hazard));
  kit.put('paint', M.paint, paint(at(box(0.4, 0.35, half * 2 + 0.5), x1, z, 2.45), BASE_COL.hazard));
  kit.put('lamp', B.lamp, paint(at(oct(0.2), x1 - 0.5, z, 2.25), 0xffffff), { noCast: true });
  // two round-cornered windows along each side and a hazard band: the tunnel reads as a module, not a box
  for (const s of [-1, 1]) {
    for (const wx of [mid - 1.0, mid + 0.9]) kit.put('paint', M.paint, paint(at(box(0.9, 0.6, 0.06), wx, z + s * (half + 0.36), 1.55), 0x1c2a3a));
    kit.put('paint', M.paint, paint(at(box(len, 0.16, 0.08), mid, z + s * (half + 0.36), 0.5), BASE_COL.hazard));
  }
  // two door leaves that slide apart as she comes (a mesh each, so the life can move them)
  for (const [key, s] of [['doorL', -1], ['doorR', 1]]) kit.put(key, M.paint, paint(at(box(0.14, 2.1, half - 0.1), x1, z + s * (half / 2 - 0.05), 1.05), BASE_COL.rail));
}

export function drawCore(kit, M, B) {
  const { x, z, r, top } = P.CORE;
  kit.put('paint', M.paint, paint(at(cyl(r, r + 0.15, top, 10), x, z, top / 2), BASE_COL.core));
  kit.put('floor', M.paint, paint(at(cyl(r + 0.05, r + 0.05, 0.1, 10), x, z, 0.5), BASE_COL.teal), { noCast: true });
  kit.put('coreglow', B.coreglow, paint(at(cyl(0.2, 0.26, 1.5, 10), x, z, top + 0.75), 0xbff3ea), { noCast: true });
  kit.put('coreglow', B.coreglow, paint(at(new THREE.SphereGeometry(0.36, 12, 8), x, z, top + 1.78), 0xe9fffb), { noCast: true });
  P.SOCKETS.forEach((s, i) => {
    kit.put('floor', M.paint, paint(at(cyl(0.3, 0.3, 0.05, 10), s.x, s.z, s.y + 0.02), 0x1a1f28), { noCast: true });
    kit.put('coreglow', B.coreglow, paint(at(ringFlat(0.3, 0.38, 14), s.x, s.z, s.y + 0.05), i === 0 ? BASE_COL.teal : BASE_COL.amber), { noCast: true });
  });
}

export function drawBoard(kit, M, B) {
  const { x, z, w, h, y } = P.BOARD;
  for (const s of [-1, 1]) kit.put('paint', M.paint, paint(at(box(0.18, y + h / 2 + 0.1, 0.18), x - 0.12, z + s * (w / 2 - 0.1), (y + h / 2 + 0.1) / 2), BASE_COL.core));
  kit.put('paint', M.paint, paint(at(box(0.16, h + 0.3, w + 0.3), x - 0.04, z, y), BASE_COL.rail));
  // the face: a plain panel of its own (the life paints the four pictures on it)
  const face = new THREE.PlaneGeometry(w, h).rotateY(Math.PI / 2);
  kit.put('board', B.board, paint(at(face, x + 0.06, z, y), 0xffffff), { noCast: true });
}

export function drawPlanters(kit, M, B) {
  for (const p of P.PLANTERS) {
    kit.put('paint', M.paint, paint(at(cyl(0.56, 0.4, 0.5, 8), p.x, p.z, 0.25), BASE_COL.rail));
    kit.put('floor', M.paint, paint(at(cyl(0.46, 0.46, 0.06, 8), p.x, p.z, 0.5), 0x3a3326), { noCast: true });
    [[0, 0, 0.95, 0.2], [0.22, 0.1, 0.7, 0.14], [-0.2, -0.12, 0.78, 0.15]].forEach(([dx, dz, dy, r], i) => {
      kit.put('glow', M.glow, paint(at(oct(r), p.x + dx, p.z + dz, dy), i === 0 ? BASE_COL.mint : 0x5ae0a8), { noCast: true });
    });
    kit.put('floor', M.paint, paint(at(cyl(0.025, 0.025, 0.6, 4), p.x, p.z, 0.8), 0x3d8f66), { noCast: true });
  }
}

export function drawDish(kit, M, B) {
  const { x, z, post, bowl } = P.OLD_DISH;
  kit.put('paint', M.paint, paint(at(box(1.8, 0.5, 1.8), x, z, 0.25), BASE_COL.core));
  kit.put('paint', M.paint, paint(at(cyl(0.3, 0.38, post, 8), x, z, post / 2 + 0.2), BASE_COL.rail));
  const R = bowl * 1.36; // a cap of a sphere whose rim is `bowl` wide (rim angle 0.82 rad)
  const cap = new THREE.SphereGeometry(R, 20, 4, 0, Math.PI * 2, Math.PI - 0.82, 0.82); // the bottom cap: a bowl, opening up
  cap.translate(0, R, 0); // its middle at the origin
  cap.rotateZ(-0.62); // tipped toward the east and the sky
  kit.put('dish', B.dish, paint(at(cap, x, z, post + 0.35), BASE_COL.rail), { noCast: false });
  // the feed arm: a thin mast from the bowl's middle to its focus, and a small horn
  const arm = cyl(0.04, 0.04, 2.6, 5);
  arm.translate(0, 1.3, 0);
  arm.rotateZ(-0.62);
  kit.put('dish', B.dish, paint(at(arm, x, z, post + 0.35), BASE_COL.core)); // the arm and the horn turn with the bowl (milestone 5: the dish swings to Earth)
  kit.put('dish', B.dish, paint(at(cyl(0.05, 0.22, 0.4, 6).rotateZ(-0.62), x + Math.sin(0.62) * 2.7, z, post + 0.35 + Math.cos(0.62) * 2.7), BASE_COL.hazard));
}

// Skip Ridge: two stacked rock pillars, a scatter of rocks at their feet and the Ridge cell's plinth on the top.
export function drawSkip(kit, M, B) {
  for (const p of P.SKIP) {
    const g = P.moonY(p.x, p.z);
    kit.put('stone', M.stone, paint(new THREE.CylinderGeometry(p.r * 0.86, p.r * 1.15, p.y + 0.6, 9).translate(p.x, g + (p.y - 0.6) / 2 - 0.0, p.z), BASE_COL.stone));
    kit.put('stone', M.stone, paint(new THREE.CylinderGeometry(p.r * 0.95, p.r * 0.86, 0.28, 9).translate(p.x, g + p.y - 0.1, p.z), BASE_COL.stoneTop));
    for (let i = 0; i < 3; i++) {
      const a = i * 2.2 + p.x;
      kit.put('stone', M.stone, paint(at(new THREE.DodecahedronGeometry(0.4 + 0.12 * i, 0), p.x + Math.cos(a) * (p.r + 0.6), p.z + Math.sin(a) * (p.r + 0.6), 0.25), BASE_COL.stone));
    }
  }
  const top = P.SKIP[1];
  kit.put('paint', M.paint, paint(new THREE.CylinderGeometry(0.5, 0.58, 0.16, 12).translate(top.x, P.moonY(top.x, top.z) + top.y + 0.08, top.z), BASE_COL.core), { noCast: true });
  kit.put('coreglow', B.coreglow, paint(new THREE.RingGeometry(0.34, 0.46, 16).rotateX(-Math.PI / 2).translate(top.x, P.moonY(top.x, top.z) + top.y + 0.18, top.z), BASE_COL.teal), { noCast: true });
}

export function drawBase(kit, M) {
  const B = baseMaterials();
  drawDome(kit, M, B);
  drawAirlock(kit, M, B);
  drawCore(kit, M, B);
  drawBoard(kit, M, B);
  drawPlanters(kit, M, B);
  drawDish(kit, M, B);
  drawSkip(kit, M, B);
  return B;
}

// Used by the life: the colour values it eases the materials between.
export const COLORS = Object.freeze({ lampDim: new THREE.Color(LAMP.dim), lampOn: new THREE.Color(LAMP.on), coreDim: new THREE.Color(CORE_GLOW.dim), coreOn: new THREE.Color(CORE_GLOW.on) });
export { COL };
