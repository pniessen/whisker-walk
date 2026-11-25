// =============================================================================
// THE MOON: WING C, THE LAUNCH COMPLEX, AS DRAWING (milestone 6). Two parts, as milestone 5's Star Hill:
//   the STANDING PARTS  put into the Moon's own kit buckets (so they cost NO draw call of their own and stand on the horizon from anywhere): the pad,
//                       the gantry tower, the two fuel spheres, the Launch Desk with its big red button, the Viewing Mound's benches, the Message
//                       Desk in the dome and the binocular stand on Earthrise Rock;
//   'moon:wingC'        the parts that move, one group (world/moonlaunchlive.js shows it near the pad or while a rocket is in flight): the rocket
//                       (one merged mesh), the gantry's arm (swings away at T-1), the plume (ONE additive quad, never more than a third of the screen),
//                       the smoke pool (one Points, 150 / 40 / 0 puffs by tier) and, made by the life, the countdown board.
// Every number is moonplan.js's. No random number, no clock, no real light.
// =============================================================================

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { dustGeometry } from './moonbeauty.js';
import * as P from './moonplan.js';
import { COL, paint, at, box, cyl } from './moonparts.js';
import { smokeCount } from './moonlaunch.js';

export const LAUNCH_COL = Object.freeze({
  white: 0xf1f3f8, red: 0xd8503c, yellow: 0xf0c43c, steel: 0x7d848f, dark: 0x2a2f3a, pad: 0xb9bec9, teal: 0x3a9aa8, cream: 0xe8dcc0,
  button: 0xff2a1f, bench: 0xc9cdd6, stamp: Object.freeze([0x3fb58f, 0xf0c43c, 0xe0607a]),
});
const L = LAUNCH_COL;

// ---- the standing parts ---------------------------------------------------------------------------------------------------------

export function drawLaunchStanding(kit, M) {
  const { PAD, GANTRY, TANKS, LAUNCH_DESK, BENCHES, MESSAGE_DESK, BINOCULARS } = P;
  // the pad: a flat disc, a hazard ring near its edge and a dark blast disc under the rocket
  kit.put('floor', M.paint, paint(at(new THREE.CircleGeometry(PAD.r, 36).rotateX(-Math.PI / 2), PAD.x, PAD.z, 0.045), L.pad), { noCast: true });
  kit.put('floor', M.paint, paint(at(new THREE.RingGeometry(PAD.r - 1.0, PAD.r - 0.7, 36).rotateX(-Math.PI / 2), PAD.x, PAD.z, 0.06), L.yellow), { noCast: true });
  kit.put('floor', M.paint, paint(at(new THREE.CircleGeometry(2.6, 24).rotateX(-Math.PI / 2), PAD.x, PAD.z, 0.065), L.dark), { noCast: true });
  kit.put('floor', M.paint, paint(at(new THREE.RingGeometry(2.6, 2.85, 24).rotateX(-Math.PI / 2), PAD.x, PAD.z, 0.07), L.red), { noCast: true });

  // the rocket's stand (the plume shows under the rocket) with the mailbox slot on its face toward the Launch Desk, and the countdown board's post
  const R = P.ROCKET;
  kit.put('paint', M.paint, paint(at(cyl(1.15, 1.55, R.stand, 12), R.x, R.z, R.stand / 2), L.steel));
  kit.put('paint', M.paint, paint(at(cyl(1.6, 1.6, 0.14, 12), R.x, R.z, 0.07), L.yellow));
  {
    const ang = Math.atan2(P.ROCKET_SLOT.x - R.x, P.ROCKET_SLOT.z - R.z);
    const put = (geo, dy, hex) => kit.put('paint', M.paint, paint(at(geo, R.x + Math.sin(ang) * 1.38, R.z + Math.cos(ang) * 1.38, dy, ang), hex));
    put(box(0.66, 0.72, 0.2), 0.62, L.dark);
    kit.put('glow', M.glow, paint(at(box(0.46, 0.07, 0.05), R.x + Math.sin(ang) * 1.5, R.z + Math.cos(ang) * 1.5, 0.66, ang), 0xffe9a8), { noCast: true });
  }
  { const b = P.COUNT_BOARD; kit.put('paint', M.paint, paint(at(cyl(0.07, 0.09, b.y - 1.3, 6), b.x, b.z, (b.y - 1.3) / 2), L.steel)); }

  // the gantry tower: four legs, a frame at four heights, two diagonals on the face the rocket looks at, a lamp on top
  const g = P.GANTRY;
  const hw = 1.1;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) kit.put('paint', M.paint, paint(at(box(0.24, g.h, 0.24), g.x + sx * hw, g.z + sz * hw, g.h / 2), L.red));
  for (const y of [3.2, 6.4, 9.6, g.h - 0.1]) {
    for (const sz of [-1, 1]) kit.put('paint', M.paint, paint(at(box(2 * hw, 0.16, 0.16), g.x, g.z + sz * hw, y), L.red));
    for (const sx of [-1, 1]) kit.put('paint', M.paint, paint(at(box(0.16, 0.16, 2 * hw), g.x + sx * hw, g.z, y), L.red));
  }
  kit.put('paint', M.paint, paint(at(box(0.7, 0.35, 0.7), g.x, g.z, g.h + 0.2), L.steel));
  kit.put('glow', M.glow, paint(at(new THREE.SphereGeometry(0.22, 8, 6), g.x, g.z, g.h + 0.6), 0xff6a4a), { noCast: true });
  void GANTRY;

  // two fuel spheres on short legs, joined by a pipe
  for (const t of TANKS) {
    kit.put('paint', M.paint, paint(at(new THREE.SphereGeometry(t.r, 12, 9), t.x, t.z, t.r + 0.5), L.white));
    kit.put('paint', M.paint, paint(at(cyl(t.r + 0.03, t.r + 0.03, 0.2, 12), t.x, t.z, t.r + 0.5), L.yellow));
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.5;
      kit.put('paint', M.paint, paint(at(cyl(0.1, 0.1, t.r * 0.9, 5), t.x + Math.cos(a) * t.r * 0.8, t.z + Math.sin(a) * t.r * 0.8, (t.r * 0.9) / 2 + 0.05), L.steel));
    }
  }
  { const a = TANKS[0]; const b = TANKS[1]; const mx = (a.x + b.x) / 2; const mz = (a.z + b.z) / 2; const len = Math.hypot(b.x - a.x, b.z - a.z); const yaw = -Math.atan2(b.z - a.z, b.x - a.x);
    kit.put('paint', M.paint, paint(at(cyl(0.14, 0.14, len, 6).rotateZ(Math.PI / 2), mx, mz, 0.9, yaw), L.steel)); }
  // a pipe from the tanks to the rocket's foot, low along the ground
  { const a = TANKS[0]; const dx = P.ROCKET.x - a.x; const dz = P.ROCKET.z - a.z; const len = Math.hypot(dx, dz) - 3.2; const yaw = -Math.atan2(dz, dx);
    kit.put('paint', M.paint, paint(at(cyl(0.12, 0.12, len, 6).rotateZ(Math.PI / 2), a.x + (dx / Math.hypot(dx, dz)) * (len / 2 + 1.9), a.z + (dz / Math.hypot(dx, dz)) * (len / 2 + 1.9), 0.18, yaw), L.steel)); }

  // the Launch Desk: a console on a base, a slanted top, the big red button in a yellow ring, a sign post with a hazard stripe
  const d = LAUNCH_DESK;
  const yawD = Math.atan2(P.PAD.x - d.x, P.PAD.z - d.z); // faces the pad
  kit.put('paint', M.paint, paint(at(box(1.7, 0.95, 0.9), d.x, d.z, 0.48, yawD), L.steel));
  kit.put('paint', M.paint, paint(at(box(1.8, 0.14, 1.0), d.x, d.z, 1.0, yawD), L.white));
  kit.put('paint', M.paint, paint(at(cyl(0.34, 0.38, 0.1, 14), d.x, d.z, 1.1), L.yellow));
  kit.put('glow', M.glow, paint(at(new THREE.SphereGeometry(0.26, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), d.x, d.z, 1.14), L.button), { noCast: true });
  kit.put('paint', M.paint, paint(at(box(0.1, 1.9, 0.1), d.x - 0.95, d.z, 0.95, yawD), L.steel));
  kit.put('paint', M.paint, paint(at(box(0.62, 0.42, 0.06), d.x - 0.95, d.z, 1.9, yawD), L.yellow));

  // the Viewing Mound: two benches on its top (the mound is the ground's own bump)
  for (const b of BENCHES) {
    const yaw = Math.atan2(P.PAD.x - b.x, P.PAD.z - b.z) + Math.PI; // the seat's back is to the pad's far side: she looks at the pad
    const top = P.moonY(b.x, b.z);
    const put = (geo, dy, hex) => kit.put('paint', M.paint, paint(geo.rotateY(yaw).translate(b.x, top + dy, b.z), hex));
    put(box(1.7, 0.1, 0.55), 0.5, L.bench);
    put(box(1.7, 0.45, 0.08).translate(0, 0.45, -0.25), 0.5, L.bench);
    put(box(0.1, 0.5, 0.5).translate(-0.7, 0, 0), 0.25, L.steel);
    put(box(0.1, 0.5, 0.5).translate(0.7, 0, 0), 0.25, L.steel);
  }

  // the Message Desk inside the dome: a low desk, a tray of postcards, three stamp pads (a paw, a star and a heart colour), a lamp
  const m = MESSAGE_DESK;
  const yawM = Math.atan2(P.DOME.x - m.x, P.DOME.z - m.z); // faces the Core
  kit.put('paint', M.paint, paint(at(box(1.5, 0.78, 0.72), m.x, m.z, 0.4, yawM), L.cream));
  kit.put('paint', M.paint, paint(at(box(1.6, 0.08, 0.82), m.x, m.z, 0.82, yawM), L.white));
  kit.put('paint', M.paint, paint(at(box(0.5, 0.06, 0.34), m.x - 0.4, m.z, 0.89, yawM), 0xf4f0e6));
  kit.put('paint', M.paint, paint(at(box(0.5, 0.03, 0.34), m.x - 0.4 + 0.02, m.z + 0.02, 0.94, yawM + 0.1), 0xfffaf0));
  for (let i = 0; i < 3; i++) kit.put('paint', M.paint, paint(at(box(0.26, 0.07, 0.26), m.x + 0.1 + i * 0.32, m.z, 0.9, yawM), L.stamp[i]));
  kit.put('paint', M.paint, paint(at(cyl(0.03, 0.03, 0.55, 5), m.x + 0.62, m.z - 0.2, 1.1, yawM), L.steel));
  kit.put('glow', M.glow, paint(at(new THREE.SphereGeometry(0.12, 8, 6), m.x + 0.62, m.z - 0.2, 1.42, yawM), 0xffe9a8), { noCast: true });

  // the binocular stand on Earthrise Rock's top ledge: a stone post and a pair of binoculars tipped up at Earth
  const ledge = P.ROCK_LEDGES[2];
  const top = P.moonY(ledge.x, ledge.z) + ledge.y;
  const bs = P.BINOCULARS;
  kit.put('stone', M.stone, paint(new THREE.CylinderGeometry(0.17, 0.22, 0.95, 8).translate(bs.x, top + 0.47, bs.z), L.steel));
  kit.put('stone', M.stone, paint(new THREE.CylinderGeometry(0.28, 0.28, 0.1, 8).translate(bs.x, top + 0.97, bs.z), 0xb4b2b1));
  const tube = (dx) => new THREE.CylinderGeometry(0.1, 0.12, 0.62, 8).translate(0, 0.31, 0).rotateX(-1.0).translate(dx, top + 1.02, bs.z);
  kit.put('paint', M.paint, paint(tube(bs.x - 0.13), L.dark));
  kit.put('paint', M.paint, paint(tube(bs.x + 0.13), L.dark));
  kit.put('glow', M.glow, paint(new THREE.SphereGeometry(0.07, 6, 4).translate(bs.x, top + 1.1, bs.z + 0.05), 0x8affc0), { noCast: true });
  void BINOCULARS;
}

// ---- the moving parts --------------------------------------------------------------------------------------------------------------------

// The rocket: one merged vertex-coloured mesh with its feet at y = 0 (about 340 triangles): an engine bell, a white body with a yellow and a red band, a coral nose cone, four
// teal fins, a porthole and a nose light. (Its stand and the mailbox slot are standing parts.)
export function rocketGeometry() {
  const parts = [];
  const add = (g, hex) => parts.push(paint(g, hex));
  add(new THREE.CylinderGeometry(0.5, 0.82, 1.3, 10).translate(0, 0.65, 0), L.steel);
  add(new THREE.CylinderGeometry(0.95, 0.95, 10.6, 12).translate(0, 1.3 + 5.3, 0), L.white);
  add(new THREE.CylinderGeometry(0.97, 0.97, 0.7, 12).translate(0, 3.2, 0), L.yellow);
  add(new THREE.CylinderGeometry(0.97, 0.97, 0.5, 12).translate(0, 10.6, 0), L.red);
  add(new THREE.ConeGeometry(0.95, 3.6, 12).translate(0, 11.9 + 1.8, 0), L.red);
  add(new THREE.SphereGeometry(0.22, 6, 4).translate(0, 15.55 + 0.1, 0), L.yellow);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const fin = new THREE.BoxGeometry(0.16, 2.6, 1.7).translate(0, 0, 0.95 + 0.25);
    fin.rotateY(a);
    fin.translate(0, 2.6, 0);
    add(fin, L.teal);
  }
  // a porthole high on the body (the side that looks at the mound)
  add(new THREE.CylinderGeometry(0.3, 0.3, 0.12, 10).rotateX(Math.PI / 2).translate(0, 8.6, 0.95), L.dark);
  add(new THREE.CylinderGeometry(0.2, 0.2, 0.14, 10).rotateX(Math.PI / 2).translate(0, 8.6, 0.96), 0x8fd3ff);
  return dustGeometry(mergeGeometries(parts), () => -P.ROCKET.stand, { reach: 6, gain: 3 }); // (beauty round 3) the engine's dust and the pad's grime climb its foot (a fixed local-height veil: the rocket flies)
}

// The gantry's arm: a box from the tower's middle toward the rocket, pivoting at the tower (the mesh turns it); a small clamp at the end.
export function armGeometry() {
  const G = P.GANTRY;
  return mergeGeometries([
    paint(new THREE.BoxGeometry(0.34, 0.34, G.armLen).translate(0, 0, G.armLen / 2), L.red),
    paint(new THREE.BoxGeometry(0.7, 0.5, 0.3).translate(0, 0, G.armLen), L.yellow),
  ]);
}

// The plume: ONE quad (a long thin kite, double-sided), white-hot at the nozzle and fading through orange to nothing: vertex colours that the additive blend adds to the sky.
export function plumeGeometry(len = 7, w = 1.5) {
  const pos = new Float32Array([-w / 2, 0, 0, w / 2, 0, 0, w * 0.12, -len, 0, -w * 0.12, -len, 0]);
  const col = new Float32Array([1, 0.95, 0.75, 1, 0.95, 0.75, 0.08, 0.02, 0, 0.08, 0.02, 0]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex([0, 2, 1, 0, 3, 2]);
  return g;
}

// The smoke's puff picture: one soft grey disc, drawn when the walk starts (null where there is no canvas: the points are then square dots).
function puffTexture() {
  try {
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext?.('2d');
    if (!g) return null;
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, 'rgba(255,255,255,0.9)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  } catch { return null; }
}

// drawLaunchWing(M, { lite, low, reduced }) -> { group, rocket, arm, plume, smoke, count, dispose }: the moving parts in one group (hidden until the life shows it).
export function drawLaunchWing(M, { lite = false, low = false, reduced = false } = {}) {
  const group = new THREE.Group();
  group.name = 'moon:wingC';
  const flag = (m, extra = {}) => { m.castShadow = false; m.receiveShadow = false; Object.assign(m.userData, { noMerge: true, noCast: true, noContactShadow: true, ...extra }); return m; };

  const baseY = P.moonY(P.ROCKET.x, P.ROCKET.z);
  const rocket = new THREE.Mesh(rocketGeometry(), M.paint);
  rocket.name = 'moon:rocket';
  rocket.position.set(P.ROCKET.x, baseY + P.ROCKET.stand, P.ROCKET.z);
  rocket.castShadow = true;
  rocket.receiveShadow = true;
  Object.assign(rocket.userData, { noMerge: true, noContactShadow: true });
  group.add(rocket);

  const arm = flag(new THREE.Mesh(armGeometry(), M.paint));
  arm.name = 'moon:arm';
  arm.position.set(P.GANTRY.x, baseY + P.GANTRY.armY, P.GANTRY.z);
  group.add(arm);

  const plumeMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false, forceSinglePass: true });
  const plume = flag(new THREE.Mesh(plumeGeometry(), plumeMat));
  plume.name = 'moon:plume';
  plume.visible = false;
  plume.frustumCulled = false;
  plume.renderOrder = 4;
  group.add(plume);

  const n = smokeCount({ lite, low, reduced });
  let smoke = null;
  let map = null;
  if (n > 0) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    map = puffTexture();
    const mat = new THREE.PointsMaterial({ size: 2.6, sizeAttenuation: true, vertexColors: true, map, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    smoke = flag(new THREE.Points(geo, mat));
    smoke.name = 'moon:smoke';
    smoke.visible = false;
    smoke.frustumCulled = false;
    smoke.renderOrder = 3;
    group.add(smoke);
  }

  return {
    group, rocket, arm, plume, smoke, puffs: n, baseY,
    dispose() {
      for (const m of [rocket, arm, plume, smoke]) { if (!m) continue; m.geometry.dispose(); if (m.material !== M.paint) m.material.dispose(); }
      map?.dispose();
    },
  };
}

export { COL };
