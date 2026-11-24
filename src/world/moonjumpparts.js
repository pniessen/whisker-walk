// =============================================================================
// THE MOON: THE JUMPING COURSES, DRAWN (milestone 7a). The static pieces go into the kit's own buckets like the rest of the Moon (so they cost no draw call of
// their own): the eight Beam Hops (a stone drum with a paler cap, as Skip Ridge's pillars and the ledges), the hop board's lane (a pale strip, the start line, a post
// every metre with a taller one every four, and a lamp at the line's two ends) and the board's post. The two things that change are made here and moved by the
// life (world/moonjumplive.js): the course lamps (ONE InstancedMesh of thirteen rings, one draw call, each lit or dim by its instance colour) and the board's screen
// (one sprite with a canvas drawn when the numbers change, one draw call while she is near).
// =============================================================================

import * as THREE from 'three';
import * as P from './moonplan.js';
import { paint, at, cyl } from './moonparts.js';
import { BASE_COL } from './moonbase.js';

export const JUMP_COL = Object.freeze({ lane: 0xd9dce4, line: 0xffffff, post: 0xc9cdd6, tall: 0xf0c43c, dim: 0x3a4152, lit: 0xfff0c4, gold: 0xffc83a, board: 0x16212d, frame: 0xf0c43c });

export function drawBeams(kit, M) {
  for (const p of P.BEAMS) {
    const g = P.moonY(p.x, p.z);
    kit.put('stone', M.stone, paint(new THREE.CylinderGeometry(p.r * 0.86, p.r * 1.15, p.y + 0.6, 9).translate(p.x, g + (p.y - 0.6) / 2, p.z), BASE_COL.stone));
    kit.put('stone', M.stone, paint(new THREE.CylinderGeometry(p.r * 0.95, p.r * 0.86, 0.28, 9).translate(p.x, g + p.y - 0.1, p.z), BASE_COL.stoneTop));
  }
}

export function drawLane(kit, M) {
  const L = P.JUMP_LANE;
  // the strip (a hair over the dust: the ground is level here) and the start line across its foot
  kit.put('floor', M.paint, paint(at(new THREE.PlaneGeometry(L.len + 1, L.half * 2).rotateX(-Math.PI / 2), L.x0 + (L.len + 1) / 2 - 0.5, L.z, 0.035), JUMP_COL.lane), { noCast: true });
  kit.put('floor', M.paint, paint(at(new THREE.PlaneGeometry(0.28, L.half * 2).rotateX(-Math.PI / 2), L.x0, L.z, 0.05), JUMP_COL.line), { noCast: true });
  // a post every metre along both edges (a taller yellow one every four metres), and a lamp at each end of the line
  for (let m = 1; m <= L.len; m++) {
    const tall = m % 4 === 0;
    for (const s of [-1, 1]) {
      const x = L.x0 + m;
      const z = L.z + s * (L.half + 0.15);
      kit.put('paint', M.paint, paint(at(cyl(0.05, 0.06, tall ? 0.6 : 0.3, 5), x, z, (tall ? 0.6 : 0.3) / 2), tall ? JUMP_COL.tall : JUMP_COL.post), { noCast: true });
    }
  }
  for (const s of [-1, 1]) {
    const x = L.x0;
    const z = L.z + s * (L.half + 0.15);
    kit.put('paint', M.paint, paint(at(cyl(0.07, 0.09, 0.9, 6), x, z, 0.45), JUMP_COL.tall));
    kit.put('glow', M.glow, paint(at(new THREE.SphereGeometry(0.13, 8, 6), x, z, 0.98), JUMP_COL.lit), { noCast: true });
  }
  // the board's post
  const B = P.JUMP_BOARD;
  kit.put('paint', M.paint, paint(at(cyl(0.07, 0.09, B.y - 0.9, 6), B.x, B.z, (B.y - 0.9) / 2), JUMP_COL.post));
}

// ---- the course lamps: one InstancedMesh (a flat ring each), dim until she has stood on the perch, lit after, all gold when every beam is lit -------------------
export function makeLamps() {
  const geo = new THREE.RingGeometry(0.72, 1, 20).rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const lamps = P.COURSE_LAMPS;
  const mesh = new THREE.InstancedMesh(geo, mat, lamps.length);
  mesh.name = 'moon:lamps';
  const m4 = new THREE.Matrix4();
  const col = new THREE.Color();
  lamps.forEach((l, i) => {
    m4.compose(new THREE.Vector3(l.x, P.moonY(l.x, l.z) + l.y + 0.08, l.z), new THREE.Quaternion(), new THREE.Vector3(l.r, 1, l.r));
    mesh.setMatrixAt(i, m4);
    mesh.setColorAt(i, col.setHex(JUMP_COL.dim));
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false; // thirteen small rings over 40 m: one sphere would be ill-fitting; the life shows it only near the courses
  Object.assign(mesh.userData, { noMerge: true, noCast: true, noContactShadow: true });
  return {
    mesh,
    paint(i, hex) { mesh.setColorAt(i, col.setHex(hex)); mesh.instanceColor.needsUpdate = true; },
    dispose() { geo.dispose(); mat.dispose(); mesh.dispose?.(); },
  };
}

// ---- the board's screen: one sprite, a dark panel with this hop's metres large and her best small under it; nothing but numbers and a star on a new record ------------
export function makeScreen(doc) {
  let cv = null;
  try { cv = doc?.createElement?.('canvas') ?? (typeof document === 'undefined' ? null : document.createElement('canvas')); } catch { cv = null; }
  const g = cv && cv.getContext?.('2d') ? (cv.width = 256, cv.height = 128, cv.getContext('2d')) : null;
  const tex = g ? new THREE.CanvasTexture(cv) : null;
  if (tex) tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false });
  const sprite = new THREE.Sprite(mat);
  sprite.name = 'moon:hopboard';
  const B = P.JUMP_BOARD;
  sprite.scale.set(B.size, B.size / 2, 1);
  sprite.position.set(B.x, P.moonY(B.x, B.z) + B.y, B.z);
  sprite.visible = false;
  Object.assign(sprite.userData, { noMerge: true, noCast: true, noContactShadow: true });
  let shown = '';
  return {
    sprite,
    // draw({ last, best, record, name }): last and best in whole centimetres (0 = none); `record` puts a gold star by the hop
    draw({ last = 0, best = 0, record = false, name = '' } = {}) {
      const key = `${last}|${best}|${record}|${name}`;
      if (key === shown) return false;
      shown = key;
      if (!g) return true;
      g.clearRect(0, 0, 256, 128);
      g.fillStyle = '#16212d'; g.fillRect(4, 4, 248, 120);
      g.strokeStyle = '#f0c43c'; g.lineWidth = 6; g.strokeRect(5, 5, 246, 118);
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = '#ffffff'; g.font = 'bold 54px sans-serif';
      g.fillText(last > 0 ? `${(last / 100).toFixed(1)} m` : '— m', 128, 50);
      g.fillStyle = '#f0c43c'; g.font = 'bold 26px sans-serif';
      g.fillText(`${record ? '★ ' : ''}${name ? `${name}  ` : ''}${best > 0 ? `${(best / 100).toFixed(1)} m` : ''}`.trim() || ' ', 128, 98);
      tex.needsUpdate = true;
      return true;
    },
    dispose() { tex?.dispose(); mat.dispose(); },
  };
}
