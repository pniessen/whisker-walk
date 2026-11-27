// =============================================================================
// THE MOON'S ROBOTS AND LIGHT: THE DRAWING. Every robot is a handful of boxes written into ONE vertex-coloured, flat-shaded soup (a single BufferGeometry rewritten each
// frame), so the robots, the pixel visitor and the moonling are one draw; the drones' glow patches are a second (additive), the moths a third (points). No box has
// a texture, and nothing here knows the time or the cat: moonrobotslive.js hands in the poses moonrobots.js worked out.
// =============================================================================
import * as THREE from 'three';

const LIN = new Float32Array(256).map((_, i) => { const c = i / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
export const rgb = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
const lin = (v) => LIN[v < 0 ? 0 : v > 255 ? 255 : Math.round(v)];

// A box soup: 12 triangles a box, flat normals, a colour per box.
export class Boxes {
  constructor(cap = 220) { this.p = new Float32Array(cap * 108); this.n = new Float32Array(cap * 108); this.c = new Float32Array(cap * 108); this.k = 0; }
  begin() { this.k = 0; }
  get triangles() { return this.k / 3; }
  // box(cx, cy, cz, sx, sy, sz, yaw, col): centred, turned about the vertical by yaw (sizes are full widths); col = [r, g, b] sRGB 0..255
  box(cx, cy, cz, sx, sy, sz, yaw, col) {
    if (this.k * 3 + 108 > this.p.length) return;
    const cs = Math.cos(yaw); const sn = Math.sin(yaw);
    const hx = sx / 2; const hy = sy / 2; const hz = sz / 2;
    const r = lin(col[0]); const g = lin(col[1]); const b = lin(col[2]);
    const P = this.p; const N = this.n; const C = this.c;
    // each face: the normal (local), then four corners (local), as two triangles
    const F = [[0, 0, 1, [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]], [0, 0, -1, [1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]], [1, 0, 0, [1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]],
      [-1, 0, 0, [-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]], [0, 1, 0, [-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]], [0, -1, 0, [-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]]];
    for (const f of F) {
      const nx = f[0] * cs + f[2] * sn; const nz = -f[0] * sn + f[2] * cs; const ny = f[1];
      for (const q of [0, 1, 2, 0, 2, 3]) {
        const v = f[3 + q];
        const lx = v[0] * hx; const lz = v[2] * hz;
        const i = this.k * 3;
        P[i] = cx + lx * cs + lz * sn; P[i + 1] = cy + v[1] * hy; P[i + 2] = cz - lx * sn + lz * cs;
        N[i] = nx; N[i + 1] = ny; N[i + 2] = nz;
        C[i] = r; C[i + 1] = g; C[i + 2] = b;
        this.k++;
      }
    }
  }
}

export function soupMesh(soup, name) {
  const g = new THREE.BufferGeometry();
  const set = (key, arr) => { const a = new THREE.BufferAttribute(arr, 3); a.setUsage(THREE.DynamicDrawUsage); g.setAttribute(key, a); return a; };
  const att = { position: set('position', soup.p), normal: set('normal', soup.n), color: set('color', soup.c) };
  g.setDrawRange(0, 0);
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mesh = new THREE.Mesh(g, mat);
  mesh.name = name; mesh.frustumCulled = false;
  Object.assign(mesh.userData, { noCast: true, noContactShadow: true, noMerge: true });
  return { mesh, att, geo: g, mat };
}
export const commit = (m, soup) => { m.att.position.needsUpdate = true; m.att.normal.needsUpdate = true; m.att.color.needsUpdate = true; m.geo.setDrawRange(0, soup.k); };

const C = Object.freeze({
  white: [226, 228, 232], steel: [150, 158, 170], slate: [84, 92, 106], eyeOn: [120, 255, 200], eyeOff: [28, 60, 52], orange: [240, 134, 30], deep: [208, 104, 16], ink: [24, 24, 34], sun: [255, 205, 70],
  teal: [96, 214, 200], tealDeep: [60, 170, 166], glow: [180, 255, 245], rock: [120, 118, 116], rockLit: [152, 150, 146], dust: [190, 184, 174], yellow: [255, 196, 60], red: [220, 80, 70],
});

// A round-ish body from two boxes turned 45 degrees to each other (an eight-sided prism).
const round = (s, cx, cy, cz, w, h, yaw, col) => { s.box(cx, cy, cz, w, h, w, yaw, col); s.box(cx, cy, cz, w, h, w, yaw + Math.PI / 4, col); };

// A survey drone at (x, y, z): an eight-sided body, a spinning ring of eight blocks, a front eye that blinks.
export function drawDrone(s, x, y, z, pose) {
  round(s, x, y, z, 0.3, 0.2, pose.yaw, C.white);
  round(s, x, y + 0.13, z, 0.18, 0.08, pose.yaw, C.steel);
  for (let i = 0; i < 8; i++) {
    const a = pose.ring + (i / 8) * Math.PI * 2;
    s.box(x + Math.cos(a) * 0.32, y, z + Math.sin(a) * 0.32, 0.1, 0.045, 0.1, -a, i === 0 ? C.sun : C.slate);
  }
  const fx = Math.sin(pose.yaw); const fz = Math.cos(pose.yaw);
  s.box(x + fx * 0.15, y + 0.02, z + fz * 0.15, 0.09, 0.07, 0.04, pose.yaw, pose.eye > 0.5 ? C.eyeOn : C.eyeOff);
  s.box(x, y - 0.13, z, 0.1, 0.06, 0.1, pose.yaw, C.slate);
}

// The dusty cleaner bot: a low body on four wheels, a head with an eye, a brush arm that swings.
export function drawCleaner(s, x, y, z, pose) {
  const yaw = pose.yaw; const fx = Math.sin(yaw); const fz = Math.cos(yaw); const sx = fz; const sz = -fx;
  s.box(x, y + 0.3, z, 0.55, 0.28, 0.8, yaw, C.white);
  s.box(x, y + 0.5, z - fz * 0.12, 0.4, 0.14, 0.4, yaw, C.steel);
  s.box(x + fx * 0.05, y + 0.66, z + fz * 0.05, 0.3, 0.2, 0.3, yaw, C.white);
  s.box(x + fx * 0.2, y + 0.68, z + fz * 0.2, 0.2, 0.07, 0.04, yaw, C.eyeOn);
  for (const a of [-1, 1]) for (const b of [-1, 1]) s.box(x + sx * a * 0.3 + fx * b * 0.28, y + 0.14, z + sz * a * 0.3 + fz * b * 0.28, 0.09, 0.28, 0.28, yaw, C.slate);
  // the arm out of the front, the brush at its end: swings side to side
  const sw = pose.brush * 0.5;
  const ax = x + fx * 0.55 + sx * Math.sin(sw) * 0.25; const az = z + fz * 0.55 + sz * Math.sin(sw) * 0.25;
  s.box(x + fx * 0.4, y + 0.3, z + fz * 0.4, 0.07, 0.07, 0.3, yaw + sw, C.slate);
  s.box(ax + fx * 0.1, y + (pose.sweep ? 0.07 : 0.28 + 0.06 * Math.abs(pose.brush)), az + fz * 0.1, 0.34, 0.1, 0.1, yaw + sw, C.yellow);
  // the dust puff: three small blocks that lift and shrink
  if (pose.puff >= 0) {
    const k = pose.puff; const sz2 = 0.2 * (1 - k * 0.7);
    for (let i = 0; i < 3; i++) s.box(ax + fx * 0.2 + sx * (i - 1) * 0.22 * (0.6 + k), y + 0.15 + k * (0.7 + i * 0.1), az + fz * 0.2 + sz * (i - 1) * 0.22 * (0.6 + k), sz2, sz2, sz2, i, C.dust);
  }
}

// A mini-rover: a chassis, a cab with a lamp, six wheels, a little mast.
export function drawMiniRover(s, x, y, z, pose, i) {
  const yaw = pose.yaw; const fx = Math.sin(yaw); const fz = Math.cos(yaw); const sx = fz; const sz = -fx;
  const body = i % 2 ? C.white : C.yellow;
  s.box(x, y + 0.28, z, 0.5, 0.18, 0.95, yaw, body);
  s.box(x + fx * 0.12, y + 0.44, z + fz * 0.12, 0.34, 0.16, 0.4, yaw, C.steel);
  s.box(x + fx * 0.3, y + 0.46, z + fz * 0.3, 0.2, 0.07, 0.03, yaw, C.eyeOn);
  for (const a of [-1, 1]) for (const b of [-1, 0, 1]) s.box(x + sx * a * 0.3 + fx * b * 0.32, y + 0.14, z + sz * a * 0.3 + fz * b * 0.32, 0.08, 0.26, 0.26, yaw, C.slate);
  s.box(x - fx * 0.3, y + 0.62, z - fz * 0.3, 0.03, 0.34, 0.03, yaw, C.steel);
  s.box(x - fx * 0.3, y + 0.82, z - fz * 0.3, 0.07, 0.05, 0.07, yaw, i === 0 ? C.red : C.sun);
}

// The pixel visitor: a flat-topped orange body, two square eyes, little arms, four stubby legs, like a sprite from an old game. `sq` squashes it (1 = none); `look` is its yaw.
export function drawPixel(s, x, y, z, yaw, sq, arms) {
  const hs = 0.5; // its size, m
  const h = hs * sq; const w = hs * (2 - sq) * 0.9;
  const fx = Math.sin(yaw); const fz = Math.cos(yaw); const sx = fz; const sz = -fx;
  const leg = 0.14 * sq;
  for (const a of [-1, 1]) for (const b of [-1, 1]) s.box(x + sx * a * w * 0.32 + fx * b * w * 0.28, y + leg / 2, z + sz * a * w * 0.32 + fz * b * w * 0.28, 0.12, leg, 0.12, yaw, C.deep);
  s.box(x, y + leg + h * 0.5, z, w, h, w, yaw, C.orange);
  s.box(x, y + leg + h * 0.96, z, w * 0.98, h * 0.08, w * 0.98, yaw, C.deep);
  for (const a of [-1, 1]) {
    s.box(x + sx * a * w * 0.26 + fx * w * 0.5, y + leg + h * 0.62, z + sz * a * w * 0.26 + fz * w * 0.5, 0.1, 0.12, 0.05, yaw, C.ink);
    s.box(x + sx * a * (w * 0.5 + 0.06), y + leg + h * (0.4 + (arms ? 0.25 * (a > 0 ? 1 : 0.3) : 0)), z + sz * a * (w * 0.5 + 0.06), 0.1, 0.1, 0.1, yaw, C.orange);
  }
}

// The moonling: a small round soft-teal body (three stacked prisms), big shiny eyes, two bobbing antennae with glowing tips, glow dots on its belly. `rung` thins it on the low rungs.
export function drawMoonling(s, x, y, z, yaw, scale, pose, wave, rung) {
  const k = scale; const fx = Math.sin(yaw); const fz = Math.cos(yaw); const sx = fz; const sz = -fx;
  const by = y + pose.bob;
  round(s, x, by + 0.22 * k, z, 0.5 * k, 0.26 * k, yaw, C.teal);
  round(s, x, by + 0.4 * k, z, 0.4 * k, 0.2 * k, yaw, C.teal);
  round(s, x, by + 0.12 * k, z, 0.34 * k, 0.16 * k, yaw, C.tealDeep);
  const eyeH = pose.blink ? 0.015 : 0.1;
  for (const a of [-1, 1]) {
    s.box(x + sx * a * 0.1 * k + fx * 0.19 * k, by + 0.34 * k, z + sz * a * 0.1 * k + fz * 0.19 * k, 0.1 * k, eyeH * k, 0.05 * k, yaw, C.ink);
    if (!pose.blink) s.box(x + sx * a * 0.1 * k + fx * 0.215 * k, by + 0.37 * k, z + sz * a * 0.1 * k + fz * 0.215 * k, 0.035 * k, 0.035 * k, 0.02 * k, yaw, C.white);
  }
  const dots = rung === 'high' ? 3 : 2;
  const gl = [Math.round(C.glow[0] * pose.dots), Math.round(C.glow[1] * pose.dots), Math.round(C.glow[2] * pose.dots)];
  for (let i = 0; i < dots; i++) s.box(x + sx * (i - (dots - 1) / 2) * 0.1 * k + fx * 0.235 * k, by + (0.2 - (i % 2) * 0.05) * k, z + sz * (i - (dots - 1) / 2) * 0.1 * k + fz * 0.235 * k, 0.04 * k, 0.04 * k, 0.02 * k, yaw, gl);
  for (const a of [-1, 1]) {
    const sw = a > 0 ? pose.ant1 : pose.ant2;
    const ax = x + sx * a * 0.1 * k; const az = z + sz * a * 0.1 * k;
    s.box(ax + sx * Math.sin(sw) * 0.05 * k, by + 0.58 * k, az + sz * Math.sin(sw) * 0.05 * k, 0.025 * k, 0.2 * k, 0.025 * k, yaw, C.tealDeep);
    s.box(ax + sx * Math.sin(sw) * 0.12 * k, by + 0.7 * k, az + sz * Math.sin(sw) * 0.12 * k, 0.06 * k, 0.06 * k, 0.06 * k, yaw, C.glow);
  }
  // a wave: one little arm up on the side, swinging
  const up = wave > 0 ? 0.2 + 0.08 * Math.sin(wave * 18) : 0;
  for (const a of [-1, 1]) s.box(x + sx * a * 0.27 * k, by + (a > 0 ? 0.24 + up : 0.18) * k, z + sz * a * 0.27 * k, 0.07 * k, 0.07 * k, 0.07 * k, yaw, C.tealDeep);
}

// The rock the moonling peeks from beside: three blocks.
export function drawRock(s, x, y, z, yaw) {
  s.box(x, y + 0.4, z, 1.3, 0.8, 1.0, yaw, C.rock);
  s.box(x + 0.1, y + 0.9, z - 0.05, 0.8, 0.35, 0.65, yaw + 0.5, C.rockLit);
  s.box(x - 0.55, y + 0.2, z + 0.3, 0.55, 0.4, 0.5, yaw - 0.4, C.rock);
}

// An additive glow patch on the dust: a fan of twelve triangles, bright in the middle and none at the edge (an additive blend: black adds nothing).
export const GLOW_VERTS = 36;
export function writeGlow(pos, col, o, cx, cz, r, level, ground) {
  const n = 12;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2; const a1 = ((i + 1) / n) * Math.PI * 2;
    const pts = [[cx, cz, level], [cx + Math.cos(a0) * r, cz + Math.sin(a0) * r, 0], [cx + Math.cos(a1) * r, cz + Math.sin(a1) * r, 0]];
    for (let j = 0; j < 3; j++) {
      const q = pts[j]; const k = (o + i * 3 + j) * 3;
      pos[k] = q[0]; pos[k + 1] = ground(q[0], q[1]) + 0.06; pos[k + 2] = q[1];
      col[k] = 0.34 * q[2]; col[k + 1] = 0.3 * q[2]; col[k + 2] = 0.2 * q[2];
    }
  }
}
