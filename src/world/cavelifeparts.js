// =============================================================================
// THE CRYSTAL CAVE: ITS FRIENDLY LIFE, THE DRAWING (layer 4). Every creature is a handful of smooth little ellipsoids ("blobs") written into one of two vertex-coloured
// soups (a single BufferGeometry rewritten each frame): the LIT soup (bats, salamander, crab) and the GLOW soup (fish, moths, beetles: an unlit, bright vertex colour).
// With the fireflies' Points that is three draws. A pose (cavelife.js) goes in, triangles come out; nothing here knows the time or the cat, draws no random number and
// adds no light. A blob is turned by a 3 x 4 matrix (rotation scaled uniformly, then where it stands): frame() makes one, child() hangs one on another.
// =============================================================================

import * as THREE from 'three';

// sRGB hex to linear 0..1 (the colour attribute is linear), cached
const _lin = new Map();
const lin = (hex) => {
  let c = _lin.get(hex);
  if (!c) { const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; c = [f((hex >> 16) & 255), f((hex >> 8) & 255), f(hex & 255)]; _lin.set(hex, c); }
  return c;
};

export class Soup {
  constructor(cap = 24000) { this.p = new Float32Array(cap * 3); this.n = new Float32Array(cap * 3); this.c = new Float32Array(cap * 3); this.k = 0; }
  begin() { this.k = 0; }
  fit() { const k = this.k * 3; this.p = this.p.slice(0, k); this.n = this.n.slice(0, k); this.c = this.c.slice(0, k); }
}

// ---- matrices: m[0..8] the rotation (row by row, scale included), m[9..11] where it stands --------------------------------------------------
export const mat = () => new Float64Array(12);
export function frame(m, x, y, z, yaw = 0, pitch = 0, roll = 0, s = 1) {
  const cy = Math.cos(yaw) * s; const sy = Math.sin(yaw) * s; const cp = Math.cos(pitch); const sp = Math.sin(pitch); const cr = Math.cos(roll); const sr = Math.sin(roll);
  // R = Ry(yaw) Rx(pitch) Rz(roll)
  const a00 = cr; const a01 = -sr; const a10 = cp * sr; const a11 = cp * cr; const a12 = -sp; const a20 = sp * sr; const a21 = sp * cr; const a22 = cp;
  m[0] = cy * a00 + sy * a20; m[1] = cy * a01 + sy * a21; m[2] = sy * a22;
  m[3] = a10 * s; m[4] = a11 * s; m[5] = a12 * s;
  m[6] = -sy * a00 + cy * a20; m[7] = -sy * a01 + cy * a21; m[8] = cy * a22;
  m[9] = x; m[10] = y; m[11] = z;
  return m;
}
const _L = mat();
// out = parent after a local frame (x, y, z, yaw, pitch, roll); `out` may not be `parent`
export function child(out, p, x, y, z, yaw = 0, pitch = 0, roll = 0) {
  const L = frame(_L, x, y, z, yaw, pitch, roll);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) out[r * 3 + c] = p[r * 3] * L[c] + p[r * 3 + 1] * L[3 + c] + p[r * 3 + 2] * L[6 + c];
  out[9] = p[0] * L[9] + p[1] * L[10] + p[2] * L[11] + p[9]; out[10] = p[3] * L[9] + p[4] * L[10] + p[5] * L[11] + p[10]; out[11] = p[6] * L[9] + p[7] * L[10] + p[8] * L[11] + p[11];
  return out;
}

// ---- one blob: an ellipsoid (rx, ry, rz) at the matrix, `top` over `bot` by its up, `seg` sides and `rings` rows --------------------------------------------------------
const G = new Float32Array(10 * 10 * 9); // the grid: x y z nx ny nz r g b
export function blob(s, m, rx, ry, rz, top, bot = top, seg = 6, rings = 3) {
  const ct = lin(top); const cb = lin(bot);
  let n = 0;
  for (let row = 0; row <= rings; row++) {
    const th = (Math.PI * row) / rings; const uy = Math.cos(th); const sr = Math.sin(th);
    for (let k = 0; k < seg; k++) {
      const ph = (k / seg) * Math.PI * 2; const ux = sr * Math.cos(ph); const uz = sr * Math.sin(ph);
      const px = ux * rx; const py = uy * ry; const pz = uz * rz;
      let nx = ux / rx; let ny = uy / ry; let nz = uz / rz;
      const wx = m[0] * nx + m[1] * ny + m[2] * nz; const wy = m[3] * nx + m[4] * ny + m[5] * nz; const wz = m[6] * nx + m[7] * ny + m[8] * nz;
      const l = Math.hypot(wx, wy, wz) || 1;
      const k9 = n * 9; const f = 0.5 + 0.5 * uy;
      G[k9] = m[0] * px + m[1] * py + m[2] * pz + m[9]; G[k9 + 1] = m[3] * px + m[4] * py + m[5] * pz + m[10]; G[k9 + 2] = m[6] * px + m[7] * py + m[8] * pz + m[11];
      G[k9 + 3] = wx / l; G[k9 + 4] = wy / l; G[k9 + 5] = wz / l;
      G[k9 + 6] = cb[0] + (ct[0] - cb[0]) * f; G[k9 + 7] = cb[1] + (ct[1] - cb[1]) * f; G[k9 + 8] = cb[2] + (ct[2] - cb[2]) * f;
      n++;
    }
  }
  const put = (v) => {
    const i = s.k * 3; if (i + 2 >= s.p.length) return; s.k++;
    const g = v * 9; s.p[i] = G[g]; s.p[i + 1] = G[g + 1]; s.p[i + 2] = G[g + 2]; s.n[i] = G[g + 3]; s.n[i + 1] = G[g + 4]; s.n[i + 2] = G[g + 5]; s.c[i] = G[g + 6]; s.c[i + 1] = G[g + 7]; s.c[i + 2] = G[g + 8];
  };
  for (let row = 0; row < rings; row++) {
    for (let k = 0; k < seg; k++) {
      const a = row * seg + k; const b = row * seg + ((k + 1) % seg); const c = a + seg; const d = b + seg;
      if (row > 0) { put(a); put(b); put(c); }
      if (row < rings - 1) { put(b); put(d); put(c); }
    }
  }
}
const M = mat(); const M2 = mat(); const M3 = mat(); const M4 = mat(); const MH = mat();

// ---- the creatures ---------------------------------------------------------------------------------------------------------------------------
const EYE = 0x1c1424; const SHINE = 0xffffff;
// a round face on the matrix `h` (head radius r): two big dark eyes with a shine
function eyes(s, h, r) {
  for (const sg of [-1, 1]) {
    child(M4, h, sg * r * 0.42, r * 0.12, r * 0.78); blob(s, M4, r * 0.2, r * 0.24, r * 0.12, EYE, EYE, 5, 3);
    child(M4, h, sg * r * 0.38, r * 0.22, r * 0.9); blob(s, M4, r * 0.07, r * 0.07, r * 0.05, SHINE, SHINE, 4, 2);
  }
}
const BAT = 0x7a5a82; const BAT_BELLY = 0xc7a6c4; const EAR = 0xf0a0bc; const WING = 0x8f6a94;
// A bat on a matrix (forward +z): hanging (head down, wings wrapped, a soft twitch) or flying (a round face, wings that beat).
export function drawHangingBat(s, p, size = 1.6) {
  frame(M, p.x, p.y, p.z, p.yaw, 0, p.sway, size);
  child(M2, M, 0, -0.24, 0); blob(s, M2, 0.12, 0.2, 0.11, BAT_BELLY, BAT, 6, 3); // the body (belly lighter)
  child(M2, M, 0, -0.5, 0.03, 0, 0, Math.PI); blob(s, M2, 0.11, 0.1, 0.1, BAT, BAT_BELLY, 6, 3); eyes(s, M2, 0.11); // the head hangs below, face forward
  for (const sg of [-1, 1]) {
    child(M3, M2, sg * 0.07, 0.1, -0.01); blob(s, M3, 0.035, 0.07, 0.025, EAR, BAT, 4, 3); // ears
    child(M3, M, sg * 0.12, -0.25, 0.01, 0, 0, sg * (0.1 + 0.55 * p.twitch)); blob(s, M3, 0.045, 0.2, 0.1, WING, BAT, 5, 3); // the wing folded round, opening a little on a twitch
  }
}
export function drawFlyingBat(s, p, size = 1.7) {
  frame(M, p.x, p.y, p.z, p.yaw, 0, p.bank, size);
  blob(s, M, 0.09, 0.08, 0.15, BAT, BAT_BELLY, 6, 3);
  child(MH, M, 0, 0.02, 0.17); blob(s, MH, 0.1, 0.09, 0.09, BAT, BAT_BELLY, 6, 3); eyes(s, MH, 0.1);
  for (const sg of [-1, 1]) {
    child(M3, MH, sg * 0.065, 0.1, -0.01); blob(s, M3, 0.035, 0.07, 0.025, EAR, BAT, 4, 3);
    child(M3, M, sg * 0.07, 0.03, 0.02, 0, 0, sg * p.flap); // the wing from the shoulder: an inner and an outer panel
    child(M4, M3, sg * 0.2, 0, 0); blob(s, M4, 0.2, 0.012, 0.13, WING, WING, 6, 3);
    child(M4, M3, sg * 0.4, 0, 0.0, 0, 0, sg * p.flap * 0.7); child(M2, M4, sg * 0.15, 0, -0.02); blob(s, M2, 0.15, 0.01, 0.09, WING, EAR, 6, 3);
  }
}
const FISH = [[0x5fd6ff, 0xbff4ff, 0xff9ad0], [0x7fffd8, 0xc8fff0, 0xffd27a], [0xa8b8ff, 0xe0e6ff, 0xff8ab8]];
export function drawFish(s, p) {
  const c = FISH[p.tone]; frame(M, p.x, p.y, p.z, p.yaw, 0, 0, p.size);
  blob(s, M, 0.065, 0.08, 0.15, c[0], c[1], 6, 3); // glowing body
  child(M2, M, 0, 0, -0.17, p.tail); blob(s, M2, 0.012, 0.075, 0.08, c[2], c[2], 4, 3); // the tail fin sways
  for (const sg of [-1, 1]) { child(M3, M, sg * 0.06, -0.02, 0.03, 0, 0, sg * 0.6); blob(s, M3, 0.05, 0.01, 0.035, c[1], c[2], 4, 2); child(M3, M, sg * 0.045, 0.03, 0.1); blob(s, M3, 0.018, 0.02, 0.02, EYE, EYE, 4, 2); }
}
const MOTH_HUE = { rose: 0xffd6e6, blue: 0xd6ecff, gold: 0xfff0c0, heart: 0xf0d8ff };
export function drawMoth(s, p) {
  const c = MOTH_HUE[p.hue] ?? 0xfff0e0; frame(M, p.x, p.y, p.z, p.yaw, 0, 0, 1.3);
  blob(s, M, 0.025, 0.025, 0.08, 0xe8d8c0, 0xfff4e4, 5, 2);
  for (const sg of [-1, 1]) { child(M2, M, sg * 0.02, 0.01, 0.01, 0, 0, sg * p.flap); child(M3, M2, sg * 0.1, 0, 0); blob(s, M3, 0.1, 0.006, 0.075, c, 0xffffff, 6, 3); }
}
export function drawBeetle(s, p) {
  frame(M, p.x, p.y, p.z, p.yaw, 0, 0, 1);
  blob(s, M, 0.065, 0.05, 0.09, p.colour, 0xffffff, 6, 3); // the jewel shell (bright on top)
  child(M2, M, 0, -0.005, 0.1); blob(s, M2, 0.035, 0.03, 0.03, 0x3a2a44, 0x3a2a44, 4, 2);
  for (const sg of [-1, 1]) for (let j = 0; j < 2; j++) { child(M2, M, sg * 0.07, -0.03, 0.03 - j * 0.07 + 0.012 * p.leg * sg); blob(s, M2, 0.04, 0.01, 0.012, 0x3a2a44, 0x3a2a44, 4, 2); }
}
const SAL_BODY = 0xf3bccb; const SAL_BELLY = 0xffe2e8; const GILL = 0xff6f9c;
export function drawSalamander(s, p) {
  frame(M, p.x, p.y, p.z, p.yaw, 0, 0, 1.4);
  const segs = [[0.07, 0.05, 0.09], [0.07, 0.05, 0.1], [0.065, 0.045, 0.1], [0.055, 0.04, 0.09], [0.045, 0.035, 0.09], [0.035, 0.028, 0.08], [0.025, 0.02, 0.07]];
  let z = 0.18;
  segs.forEach((g, i) => { const sw = Math.sin(p.phase - i * 0.9) * (0.012 + 0.03 * p.walk) * (i / 2 + 0.5); child(M2, M, sw, g[1], z - g[2] * 0.4); blob(s, M2, g[0], g[1], g[2], SAL_BODY, SAL_BELLY, 6, 3); z -= g[2] * 1.5; });
  child(MH, M, 0, 0.065, 0.25); blob(s, MH, 0.08, 0.065, 0.085, SAL_BODY, SAL_BELLY, 6, 3); eyes(s, MH, 0.085); // the round head
  for (const sg of [-1, 1]) for (let j = 0; j < 3; j++) { child(M3, MH, sg * 0.08, 0.025 + j * 0.02, -0.01, sg * (0.5 + j * 0.3), 0, sg * (0.25 + j * 0.3 + p.gill)); child(M4, M3, 0, 0, 0.06); blob(s, M4, 0.005, 0.005, 0.07 + 0.01 * j, GILL, 0xffb0c8, 4, 2); } // three feathery gills a side
  for (const sg of [-1, 1]) for (const lz of [0.14, -0.05]) { child(M2, M, sg * 0.09, 0.015, lz + 0.015 * Math.sin(p.phase + sg + lz * 9) * p.walk, sg * 0.6); blob(s, M2, 0.035, 0.012, 0.018, SAL_BODY, SAL_BELLY, 4, 2); }
}
const CRAB = 0xf2a088; const CRAB_BELLY = 0xffd6c0; const CLAW = 0xff7a66;
export function drawCrab(s, p) {
  frame(M, p.x, p.y, p.z, p.yaw, 0, 0, 1.2);
  blob(s, M, 0.13, 0.05, 0.1, CRAB, CRAB_BELLY, 7, 3);
  for (const sg of [-1, 1]) {
    child(M2, M, sg * 0.05, 0.07, 0.07); blob(s, M2, 0.012, 0.035, 0.012, CRAB, CRAB, 4, 2); child(M2, M, sg * 0.05, 0.11, 0.075); blob(s, M2, 0.02, 0.02, 0.02, EYE, EYE, 4, 2);
    child(M3, M, sg * 0.14, 0.02, 0.1, sg * (0.5 + p.claw)); blob(s, M3, 0.015, 0.015, 0.06, CRAB, CRAB, 4, 2); child(M4, M3, 0, 0.0, 0.07); blob(s, M4, 0.045, 0.025, 0.05, CLAW, CRAB, 6, 3); // the arm and its claw
    for (let j = 0; j < 3; j++) { child(M2, M, sg * 0.15, -0.01, -0.07 + j * 0.06 + 0.02 * p.leg * (j % 2 ? 1 : -1), 0, 0, sg * -0.4); blob(s, M2, 0.06, 0.01, 0.012, CRAB, CRAB, 4, 2); }
  }
}

// ---- the fireflies: one additive Points object ---------------------------------------------------------------------------------------------
let _dot = null;
function dot() {
  if (_dot) return _dot;
  const n = 32; const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const r = Math.hypot(x + 0.5 - n / 2, y + 0.5 - n / 2) / (n / 2); const k = (y * n + x) * 4; data[k] = data[k + 1] = data[k + 2] = 255; data[k + 3] = r >= 1 ? 0 : Math.round(255 * (1 - r) ** 1.4); }
  _dot = new THREE.DataTexture(data, n, n, THREE.RGBAFormat); _dot.needsUpdate = true;
  return _dot;
}
export function makeFireflies(scene, n) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  const mat = new THREE.PointsMaterial({ map: dot(), alphaTest: 0.02, size: 0.16, sizeAttenuation: true, color: 0xf2ff9a, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending, fog: true });
  const pts = new THREE.Points(geo, mat);
  pts.name = 'crystal:fireflies'; pts.frustumCulled = false; Object.assign(pts.userData, { noCast: true, noContactShadow: true, noMerge: true });
  scene.add(pts);
  return { pts, geo, mat, set(i, x, y, z, g) { geo.attributes.position.setXYZ(i, x, y, z); geo.attributes.color.setXYZ(i, g, g, g); }, commit() { geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true; }, dispose() { scene.remove(pts); geo.dispose(); mat.dispose(); } };
}

// A soup's mesh: dynamic, vertex-coloured, lit or not.
export function soupMesh(soup, name, lit) {
  const g = new THREE.BufferGeometry();
  const set = (key, arr) => { const a = new THREE.BufferAttribute(arr, 3); a.setUsage(THREE.DynamicDrawUsage); g.setAttribute(key, a); return a; };
  const att = { position: set('position', soup.p), normal: set('normal', soup.n), color: set('color', soup.c) };
  g.setDrawRange(0, soup.k);
  const mat = lit ? new THREE.MeshLambertMaterial({ vertexColors: true }) : new THREE.MeshBasicMaterial({ vertexColors: true });
  const mesh = new THREE.Mesh(g, mat);
  mesh.name = name; mesh.frustumCulled = false;
  Object.assign(mesh.userData, { noCast: true, noContactShadow: true, noMerge: true });
  return { mesh, att, geo: g, mat };
}
