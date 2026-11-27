// =============================================================================
// THE REEF: ITS FRIENDLY SEA LIFE, THE DRAWING (milestone: seals, octopuses, dolphins). Every animal is written into ONE vertex-coloured, flat-shaded-free
// "soup" per kind (a single BufferGeometry rewritten each frame: positions, normals and colours), so the three kinds are three draws and the rocks a fourth.
// The soup is filled from TUBES (a spine, an elliptical radius along it): a body, a head, an eye, a flipper and an octopus's arm are all one primitive.
// Nothing here knows the time or the cat: reefsealslive.js hands in the poses that reefseals.js worked out. Draws no random number.
// =============================================================================

import * as THREE from 'three';
import { ARM_COUNT, armSpine, hash01, SALTS, TAU, smooth } from './reefseals.js';

// sRGB 0..255 to linear 0..1 (the colour attribute is linear), one lookup.
const LIN = new Float32Array(256).map((_, i) => { const c = i / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
const lin = (v) => LIN[v < 0 ? 0 : v > 255 ? 255 : Math.round(v)];
export const rgb = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

export class Soup {
  constructor(cap = 60000) { this.cap = cap; this.p = new Float32Array(cap * 3); this.n = new Float32Array(cap * 3); this.c = new Float32Array(cap * 3); this.k = 0; }
  begin() { this.k = 0; }
  // Cut the arrays down to what was written (called once, after the first frame).
  fit() {
    const k = this.k;
    this.p = this.p.slice(0, k * 3); this.n = this.n.slice(0, k * 3); this.c = this.c.slice(0, k * 3); this.cap = k;
  }
  vert(x, y, z, nx, ny, nz, r, g, b) {
    const i = this.k * 3;
    if (i + 2 >= this.p.length) return;
    this.k++;
    this.p[i] = x; this.p[i + 1] = y; this.p[i + 2] = z;
    this.n[i] = nx; this.n[i + 1] = ny; this.n[i + 2] = nz;
    this.c[i] = lin(r); this.c[i + 1] = lin(g); this.c[i + 2] = lin(b);
  }
}

// One tube. spine(s, out) fills {x,y,z} for s in 0..1 (local); rad(s) gives [rx, ry]; m is a column-major 4x4 (uniform scale) taking the local frame to the world's;
// col = { top, bot, spots?, seed? } (sRGB triples). Rings run along the spine; each ring is `sides` points round an ellipse whose axes follow the spine's side
// (Y x tangent) and up. Triangles wind outward. A radius that falls to zero closes the end.
const P = [];
const TT = { x: 0, y: 0, z: 0 };
const SCR = new Float32Array(24 * 16 * 9); // the rings' vertices: x y z nx ny nz r g b
export function tube(soup, spine, rad, rings, sides, m, col) {
  for (let k = 0; k < rings; k++) { const s = k / (rings - 1); const o = P[k] || (P[k] = {}); spine(s, TT); o.x = TT.x; o.y = TT.y; o.z = TT.z; const r = rad(s); o.rx = r[0]; o.ry = r[1]; }
  const sc = Math.hypot(m[0], m[1], m[2]) || 1;
  const top = col.top; const bot = col.bot;
  for (let k = 0; k < rings; k++) {
    const a = P[Math.max(0, k - 1)]; const b = P[Math.min(rings - 1, k + 1)]; const q = P[k];
    let tx = b.x - a.x; let ty = b.y - a.y; let tz = b.z - a.z;
    const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
    // the side axis: Y x T (or X when the spine runs straight up or down)
    let sx = tz; let sz = -tx;
    const sl = Math.hypot(sx, sz);
    if (sl < 0.2) { sx = 1; sz = 0; } else { sx /= sl; sz /= sl; }
    const ux = ty * sz; const uy = tz * sx - tx * sz; const uz = -ty * sx; // U = T x S (S has no y part)
    const dr = ((b.rx + b.ry) - (a.rx + a.ry)) * 0.5 / tl; // radius change per metre of spine, for the end caps
    const irx = 1 / Math.max(q.rx, 1e-3); const iry = 1 / Math.max(q.ry, 1e-3);
    for (let i = 0; i < sides; i++) {
      const f = (i / sides) * TAU; const cf = Math.cos(f); const sf = Math.sin(f);
      const px = q.x + sx * q.rx * cf + ux * q.ry * sf; const py = q.y + uy * q.ry * sf; const pz = q.z + sz * q.rx * cf + uz * q.ry * sf;
      let nx = sx * cf * irx + ux * sf * iry; let ny = uy * sf * iry; let nz = sz * cf * irx + uz * sf * iry;
      const nl0 = Math.hypot(nx, ny, nz) || 1; nx = nx / nl0 - tx * dr; ny = ny / nl0 - ty * dr; nz = nz / nl0 - tz * dr;
      const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
      const w = smooth(0.5 + 0.8 * sf);
      const dim = col.spots && hash01(k * 37 + i + (col.seed || 0) * 101, SALTS.tone) < col.spots ? 0.72 : 1;
      const j = (k * sides + i) * 9;
      SCR[j] = m[0] * px + m[4] * py + m[8] * pz + m[12]; SCR[j + 1] = m[1] * px + m[5] * py + m[9] * pz + m[13]; SCR[j + 2] = m[2] * px + m[6] * py + m[10] * pz + m[14];
      SCR[j + 3] = (m[0] * nx + m[4] * ny + m[8] * nz) / sc; SCR[j + 4] = (m[1] * nx + m[5] * ny + m[9] * nz) / sc; SCR[j + 5] = (m[2] * nx + m[6] * ny + m[10] * nz) / sc;
      SCR[j + 6] = (bot[0] + (top[0] - bot[0]) * w) * dim; SCR[j + 7] = (bot[1] + (top[1] - bot[1]) * w) * dim; SCR[j + 8] = (bot[2] + (top[2] - bot[2]) * w) * dim;
    }
  }
  const put = (k, i) => { const j = (k * sides + i) * 9; soup.vert(SCR[j], SCR[j + 1], SCR[j + 2], SCR[j + 3], SCR[j + 4], SCR[j + 5], SCR[j + 6], SCR[j + 7], SCR[j + 8]); };
  for (let k = 0; k < rings - 1; k++) {
    for (let i = 0; i < sides; i++) {
      const i2 = (i + 1) % sides;
      put(k, i); put(k, i2); put(k + 1, i); put(k, i2); put(k + 1, i2); put(k + 1, i);
    }
  }
}

// ---- small helpers ------------------------------------------------------------------------------------------------------
const interp = (tbl, s) => {
  for (let i = 1; i < tbl.length; i++) if (s <= tbl[i][0]) { const a = tbl[i - 1]; const k = (s - a[0]) / (tbl[i][0] - a[0] || 1); return a[1] + (tbl[i][1] - a[1]) * k; }
  return tbl[tbl.length - 1][1];
};
// An ellipsoid (a sphere with three radii) centred at (cx, cy, cz), its long axis the local z.
export function ellipsoid(soup, m, cx, cy, cz, rx, ry, rz, col, rings = 5, sides = 7) {
  tube(soup, (s, o) => { o.x = cx; o.y = cy; o.z = cz - rz * Math.cos(Math.PI * s); }, (s) => [rx * Math.sin(Math.PI * s), ry * Math.sin(Math.PI * s)], rings, sides, m, col);
}
// A flat paddle from a to b (flipper, fin, fluke): `w` wide, `th` thick at its fullest, fullest a third of the way out.
export function paddle(soup, m, a, b, w, th, col, rings = 5, sides = 6) {
  tube(soup, (s, o) => { o.x = a[0] + (b[0] - a[0]) * s; o.y = a[1] + (b[1] - a[1]) * s; o.z = a[2] + (b[2] - a[2]) * s; },
    (s) => { const k = Math.sin(Math.PI * Math.min(1, s * 0.85 + 0.12)) ** 0.7 * (1 - 0.3 * s); return [w * k, th * k]; }, rings, sides, m, col);
}
const M4 = new THREE.Matrix4(); const Q = new THREE.Quaternion(); const E = new THREE.Euler(); const V = new THREE.Vector3(); const SC = new THREE.Vector3();
// The matrix (column-major elements) of a pose: place, yaw about Y, then nose-up pitch, then roll about the body's own axis, uniform size.
export function bodyMatrix(x, y, z, yaw, pitch, roll, size) {
  E.set(-pitch, yaw, roll, 'YXZ'); Q.setFromEuler(E);
  return M4.compose(V.set(x, y, z), Q, SC.set(size, size, size)).elements;
}
// The den's frame: place and yaw only.
export const frameMatrix = (x, y, z, yaw, size = 1) => bodyMatrix(x, y, z, yaw, 0, 0, size);

// ---- the seals ----------------------------------------------------------------------------------------------------------
const SEAL_COL = Object.freeze({
  spotted: { top: [132, 112, 94], bot: [212, 202, 186], spots: 0.2 },
  pale: { top: [186, 192, 198], bot: [240, 242, 240], spots: 0 },
});
const SEAL_BODY = [[0, 0.17], [0.1, 0.235], [0.35, 0.28], [0.6, 0.225], [0.85, 0.11], [1, 0.025]];
const DARK = [24, 18, 16];
// seal pose (from sealPose or sleeperPose) -> into the soup. `closed` draws the eyes as sleepy slits.
export function drawSeal(soup, seal, pose, closed = false) {
  const base = SEAL_COL[seal.tone];
  const col = { ...base, seed: seal.id };
  const pale = { top: mix(base.top, base.bot, 0.55), bot: base.bot };
  const breathe = closed ? 1 + 0.03 * pose.breathe : 1;
  const m = bodyMatrix(pose.x, pose.y, pose.z, pose.yaw, pose.pitch || 0, pose.roll || 0, seal.size * breathe);
  const beat = closed ? 0 : pose.beat;
  const sway = closed ? 0 : 0.2;
  const bend = (s) => (s > 0.3 ? ((s - 0.3) / 0.7) ** 2 : 0);
  tube(soup, (s, o) => { o.x = sway * bend(s) * Math.sin(beat - 3 * s); o.y = closed ? -0.02 * s : 0; o.z = 0.5 - 1.4 * s; }, (s) => { const r = interp(SEAL_BODY, s); return [r, r * 0.9]; }, 11, 9, m, col);
  ellipsoid(soup, m, 0, 0.07, 0.64, 0.17, 0.155, 0.2, col, 6, 8); // the head
  ellipsoid(soup, m, 0, 0.0, 0.83, 0.095, 0.078, 0.095, pale, 4, 6); // the muzzle
  ellipsoid(soup, m, 0, 0.03, 0.925, 0.035, 0.026, 0.03, { top: DARK, bot: DARK }, 3, 5); // the nose
  for (const sx of [-1, 1]) {
    if (closed) ellipsoid(soup, m, sx * 0.1, 0.12, 0.75, 0.05, 0.01, 0.045, { top: DARK, bot: DARK }, 3, 6); // a sleepy slit
    else { ellipsoid(soup, m, sx * 0.1, 0.12, 0.75, 0.05, 0.05, 0.05, { top: DARK, bot: DARK }, 4, 6); ellipsoid(soup, m, sx * 0.108, 0.14, 0.785, 0.014, 0.014, 0.014, { top: [255, 255, 255], bot: [255, 255, 255] }, 3, 4); } // big dark eyes, a glint in each
    for (const [wy, wz] of [[-0.015, 0.855], [-0.045, 0.87], [0.01, 0.875]]) ellipsoid(soup, m, sx * 0.065, wy, wz, 0.012, 0.012, 0.012, { top: DARK, bot: DARK }, 3, 4); // whisker dots
    const ph = pose.paddle ?? 0;
    const k = closed ? 0 : Math.sin(ph + (sx > 0 ? 0 : 1.1));
    paddle(soup, m, [sx * 0.2, -0.1, 0.32], [sx * (0.2 + 0.26 * (0.8 - 0.1 * k)), -0.1 - 0.17 - 0.1 * k, 0.32 - 0.17 - 0.06 * k], 0.085, 0.022, col); // the fore flippers, paddling
    const e = { x: sway * Math.sin(beat - 3), z: -0.9 };
    paddle(soup, m, [e.x, 0, e.z + 0.05], [e.x + sx * 0.3, 0.0 + (closed ? 0 : 0.05 * Math.sin(beat - 3.6)), e.z - 0.2], 0.1, 0.02, col, 4, 5); // the tail flippers
  }
}

// ---- the octopuses ------------------------------------------------------------------------------------------------------
const ROCK = { top: [112, 100, 92], bot: [78, 70, 66], spots: 0.25 };
const DEN_STONES = [ // [x, y, z, rx, ry, rz] in the den's frame; the mouth faces +z
  [0, 0.4, -0.62, 0.78, 0.62, 0.55], [-0.78, 0.33, -0.12, 0.5, 0.48, 0.55], [0.8, 0.32, -0.08, 0.5, 0.46, 0.52],
  [0, 0.88, -0.1, 0.7, 0.3, 0.55], [-0.45, 0.2, 0.42, 0.3, 0.2, 0.3], [0.5, 0.18, 0.46, 0.28, 0.18, 0.28],
];
// The static rocks: both dens and the sleeper's rock, written once into a soup (world coordinates).
export function drawRocks(soup, dens, rock, groundY) {
  dens.forEach((o, di) => {
    const m = frameMatrix(o.x, groundY(o.x, o.z), o.z, o.yaw);
    DEN_STONES.forEach(([x, y, z, rx, ry, rz], i) => ellipsoid(soup, m, x, y, z, rx, ry, rz, { ...ROCK, seed: di * 9 + i }, 4, 7));
    ellipsoid(soup, m, 0, 0.36, 0.1, 0.4, 0.34, 0.36, { top: [26, 22, 24], bot: [18, 15, 17] }, 4, 7); // the den's dark mouth
  });
  const m = frameMatrix(rock.x, groundY(rock.x, rock.z), rock.z, 0);
  ellipsoid(soup, m, 0, rock.h * 0.35, 0, rock.r, rock.h * 0.65, rock.r * 0.9, { ...ROCK, seed: 77 }, 5, 9);
  ellipsoid(soup, m, 0.5, 0.12, 0.45, 0.4, 0.22, 0.35, { ...ROCK, seed: 78 }, 4, 6);
}
// One octopus (pose from octopusPose) into the soup, in the den's frame placed at (o.x, groundY, o.z).
export function drawOctopus(soup, o, pose, t, groundY) {
  const m = frameMatrix(o.x, groundY(o.x, o.z), o.z, o.yaw);
  const top = pose.tone; const bot = mix(top, [255, 236, 214], 0.35);
  const col = { top, bot };
  const bz = pose.bz;
  ellipsoid(soup, m, 0, 0.5 + 0.06 * pose.peek, bz - 0.2, 0.27, 0.27, 0.34, col, 5, 8); // the mantle, a rounded head
  ellipsoid(soup, m, 0, 0.44, bz + 0.08, 0.23, 0.2, 0.2, col, 4, 8); // the face
  const open = pose.eyes;
  for (const sx of [-1, 1]) {
    ellipsoid(soup, m, sx * 0.145, 0.53, bz + 0.2, 0.075, 0.075 * (0.3 + 0.7 * open), 0.07, { top: [244, 226, 168], bot: [244, 226, 168] }, 4, 7); // the eye
    ellipsoid(soup, m, sx * 0.152, 0.535, bz + 0.255, 0.042, 0.042 * (0.3 + 0.7 * open), 0.03, { top: DARK, bot: DARK }, 3, 6); // its pupil
  }
  const sp = { x: 0, y: 0, z: 0, r: 0 };
  for (let i = 0; i < ARM_COUNT; i++) {
    tube(soup, (s, out) => { armSpine(o, pose, i, s, t, sp); out.x = sp.x; out.y = sp.y; out.z = sp.z; }, (s) => { armSpine(o, pose, i, s, t, sp); return [sp.r, sp.r * 0.85]; }, 7, 6, m, col);
  }
}

// A soup to a mesh: the geometry's three attributes are the soup's own arrays, rewritten each frame by commit().
export function soupMesh(soup, name) {
  const g = new THREE.BufferGeometry();
  const set = (key, arr) => { const a = new THREE.BufferAttribute(arr, 3); a.setUsage(THREE.DynamicDrawUsage); g.setAttribute(key, a); return a; };
  const att = { position: set('position', soup.p), normal: set('normal', soup.n), color: set('color', soup.c) };
  g.setDrawRange(0, soup.k);
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mesh = new THREE.Mesh(g, mat);
  mesh.name = name;
  mesh.frustumCulled = false;
  Object.assign(mesh.userData, { noCast: true, noContactShadow: true, noMerge: true });
  return { mesh, att, geo: g, mat };
}
