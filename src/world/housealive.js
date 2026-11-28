// =============================================================================
// THE OLD HOUSE: BEAUTY PASS 5 (2026-11-28), LIVING CREATURES. No mesh, triangle, light or caster: every creature is a few points of ONE pooled Points (a round soft sprite per point, its own
// size per point), drawn in the house's story stage. A house mouse peeks from a hole in the kitchen wall and darts away under the dresser (kind and cartoon); dust bunnies scoot away when she
// dashes or pounces near them, then drift home; a spider on a thread comes down the attic window and goes back up; moths round every lamp once the lamps come on; a robin on the hall window's
// sill (on the lawn when the wall is down) hops about by day; a bluebird visits the birdbath; an old dog sleeps on the parlour rug and opens one eye when she comes near, with a few Zs; leaves
// (The garden's own leaves lean along the house's one draught: houseglow.js WIND and gustAt.)
// They follow the house's one rhythm (houseglow.js rhythm: day, lamp): the bluebird and robin by day, moths when the lamps are on, the mouse likelier at night. Reduced motion holds every
// creature in one still pose; LITE leaves out the bluebird, the dog's Zs and the second moth. Fixed patterns seeded by the date, no random draws; update allocates nothing.
// Visible only on the level she is drawing (`full`). Pure helpers (bunnyStep, mousePos) so tests read them without a renderer.
// =============================================================================

import * as THREE from 'three';
import { hash01 } from './builder.js';
import { WIND, gustAt } from './houseglow.js';

const HIDE = -999;
const K = 3.3; // a point's size in metres to the material's pixel scale (a point's size is over the projection's own tan(fov/2), so this is about the game's camera)
const LAMP_Y = { table: 1.15, standard: 1.7, lantern: 1.45 }; // the lamp's light, above its floor
const LEVEL_Y = { ground: 0, upstairs: 2.4, attic: 4.2 };

// ---- pure helpers ----
// A dust bunny at (x, z) with velocity (vx, vz), a cat at (cx, cz) dashing (speed > DASH): it is flung away from her; friction; and, at rest a while, it drifts home. Writes into `b`.
export const DASH = 4.2;
export function bunnyStep(b, dt, cx, cz, fast) {
  const dx = b.x - cx, dz = b.z - cz, d = Math.hypot(dx, dz);
  if (fast && d < 2.2 && d > 1e-3) { b.vx = (dx / d) * 3.4; b.vz = (dz / d) * 3.4; b.rest = 0; }
  const f = Math.exp(-3 * dt);
  b.vx *= f; b.vz *= f;
  b.x += b.vx * dt; b.z += b.vz * dt;
  const sp = Math.hypot(b.vx, b.vz);
  b.roll += sp * dt * 5;
  b.rest = sp < 0.05 ? b.rest + dt : 0;
  if (b.rest > 8) { const hx = b.hx - b.x, hz = b.hz - b.z, hd = Math.hypot(hx, hz); if (hd > 0.02) { b.x += (hx / hd) * 0.25 * dt; b.z += (hz / hd) * 0.25 * dt; } }
  b.x = Math.min(b.r.maxX - 0.3, Math.max(b.r.minX + 0.3, b.x));
  b.z = Math.min(b.r.maxZ - 0.3, Math.max(b.r.minZ + 0.3, b.z));
  return b;
}
// The mouse's run, u in 0..1, along the kitchen wall and in under the dresser (x, z; it is at its hole at 0 and out of sight at 1).
const RUN = [[4.45, -0.9], [4.9, -1.2], [4.9, -2.5], [4.5, -3.2]];
export function mousePos(u, out = { x: 0, z: 0, dx: 1, dz: 0 }) {
  const n = RUN.length - 1, k = Math.min(n - 1e-6, Math.max(0, u) * n), i = Math.floor(k), f = k - i;
  const a = RUN[i], b = RUN[i + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
  out.x = a[0] + (b[0] - a[0]) * f; out.z = a[1] + (b[1] - a[1]) * f; out.dx = (b[0] - a[0]) / l; out.dz = (b[1] - a[1]) / l;
  return out;
}

function roundTexture() {
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const g = c.getContext('2d');
    const r = g.createRadialGradient(16, 16, 2, 16, 16, 15);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.7, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, 32, 32);
    return new THREE.CanvasTexture(c);
  } catch (e) { return null; }
}

// createHouseCreatures({ scene, audio, reducedMotion, low, season, dayKey, lamps, rhythm, rain, wallUp }) -> { points, update(dt, cat, full), dispose }
// `rhythm` is houseglow.js's live { day, lamp }; `wallUp()` is how far the hall's south wall stands (0..1; the robin's sill is on it); `lamps` is the plan's lamp list.
export function createHouseCreatures({ scene, audio = null, reducedMotion = false, low = false, dayKey = 0, lamps = [], rhythm, rain = false, wallUp = () => 1 }) {
  const pos = [], col = [], siz = [];
  const lin = (c) => c * c * (0.35 + 0.65 * c); // an sRGB-looking colour (the way these are written) to the linear value the material wants
  const add = (r, g, b, s) => { pos.push(0, HIDE, 0); col.push(lin(r), lin(g), lin(b)); siz.push(s * K); return siz.length - 1; };
  const adds = (n, r, g, b, s) => { const i0 = siz.length; for (let i = 0; i < n; i++) add(r, g, b, s); return i0; };
  const creatures = [];
  const I = (k) => k * 3; // an index's offset in pos
  let P = null, SZ = null, CL = null, T = 0;
  const at = (i, x, y, z) => { const o = I(i); P[o] = x; P[o + 1] = y; P[o + 2] = z; };
  const hide = (i, n = 1) => { for (let k = 0; k < n; k++) P[I(i + k) + 1] = HIDE; };
  const seed = (n) => hash01(dayKey, n, 0x5a17);
  const ease = (u) => { const c = Math.min(1, Math.max(0, u)); return c * c * (3 - 2 * c); };
  const still = reducedMotion;
  let from = 0;
  const mk = (lvl, run) => { creatures.push({ lvl, run, a: from, b: siz.length, on: false }); from = siz.length; };

  // ---- the mouse: a hole low in the kitchen's west wall, then a dart along it and in under the dresser ----
  {
    const hole = add(0.06, 0.04, 0.04, 0.17), body = add(0.62, 0.58, 0.55, 0.13), head = add(0.7, 0.66, 0.62, 0.1);
    const ear = adds(2, 1, 0.68, 0.74, 0.055), nose = add(1, 0.6, 0.68, 0.03), tail = adds(2, 0.95, 0.72, 0.75, 0.04);
    let st = 0, tm = 0, wait = 9 + 10 * seed(1), n = 0;
    const m = { x: 0, z: 0, dx: 1, dz: 0 };
    mk('ground', (c) => {
      at(hole, 4.24, 0.1, -0.9);
      if (still) st = 1;
      const near = c.y < 1 && Math.hypot(c.x - 8, c.z + 1) < 10;
      if (st === 0) { hide(body, 7); if (near && (wait -= c.dt * (rhythm.day < 0.5 ? 1.6 : 1)) <= 0) { st = 1; tm = 0; audio?.peep?.(0.12); } return; }
      tm += still ? 0 : c.dt;
      const tt = still ? 1 : tm;
      let o;
      if (st === 1) {
        o = ease(tt / 0.45) * 0.17; // peeking out, ears up
        const s = still ? 0 : 0.07 * Math.sin(tm * 11); // the nose twitches
        at(body, 4.2 + o * 0.2, 0.09, -0.9); at(head, 4.3 + o, 0.1, -0.9); at(ear, 4.28 + o, 0.17, -0.97); at(ear + 1, 4.28 + o, 0.17, -0.83);
        at(nose, 4.4 + o + s * 0.1, 0.095, -0.9); hide(tail, 2);
        if (!still && (tm > 2.4 || (c.dc < 1.6 && tm > 0.5))) { st = 2; tm = 0; }
      } else {
        const u = tm / 0.9;
        mousePos(u, m);
        const bob = 0.012 * Math.abs(Math.sin(tm * 40));
        at(body, m.x, 0.07 + bob, m.z); at(head, m.x + m.dx * 0.1, 0.08 + bob, m.z + m.dz * 0.1);
        at(ear, m.x + m.dx * 0.09 - m.dz * 0.05, 0.14, m.z + m.dz * 0.09 + m.dx * 0.05); at(ear + 1, m.x + m.dx * 0.09 + m.dz * 0.05, 0.14, m.z + m.dz * 0.09 - m.dx * 0.05);
        at(nose, m.x + m.dx * 0.17, 0.08, m.z + m.dz * 0.17); at(tail, m.x - m.dx * 0.12, 0.06, m.z - m.dz * 0.12); at(tail + 1, m.x - m.dx * 0.22 + m.dz * 0.04 * Math.sin(tm * 30), 0.05, m.z - m.dz * 0.22);
        if (u >= 1) { st = 0; wait = 20 + 14 * seed(2 + ++n); hide(body, 7); }
      }
    });
  }

  // ---- dust bunnies: a grey puff with two dark eyes each, scooting off when she dashes by ----
  {
    const R = (minX, maxX, minZ, maxZ) => ({ minX, maxX, minZ, maxZ });
    const homes = [[3.4, 3.4, 'ground', R(-4, 4, 2, 12)], [-12.9, 10.9, 'ground', R(-14, -4, 2, 12)], [5.3, 3.0, 'ground', R(4, 14, 2, 12)], [-6.7, -7.6, 'upstairs', R(-8, 2, -16, -6.4)], [-15.4, -14.2, 'attic', R(-24, -14, -16, -6)]];
    homes.forEach(([hx, hz, lvl, r], n) => {
      const body = add(0.84, 0.82, 0.78, 0.2), eye = adds(2, 0.1, 0.08, 0.08, 0.04);
      const b = { x: hx, z: hz, hx, hz, vx: 0, vz: 0, rest: 0, roll: n, r };
      const y = LEVEL_Y[lvl];
      mk(lvl, (c) => {
        if (!still) bunnyStep(b, c.dt, c.x, c.z, c.fast && c.y > y - 0.5 && c.y < y + 1.5);
        const hop = Math.min(0.05, Math.hypot(b.vx, b.vz) * 0.03) * Math.abs(Math.sin(b.roll * 3));
        at(body, b.x, y + 0.1 + hop, b.z); at(eye, b.x - 0.05, y + 0.14 + hop, b.z - 0.14); at(eye + 1, b.x + 0.05, y + 0.14 + hop, b.z - 0.14);
      });
    });
  }

  // ---- the attic's spider on a thread, down the round window's top and back up ----
  {
    const thread = adds(9, 0.92, 0.92, 0.96, 0.025), body = add(0.1, 0.07, 0.07, 0.085), leg = adds(4, 0.14, 0.1, 0.1, 0.04), eye = adds(2, 1, 1, 0.9, 0.03);
    const TOP = 6.35, X = -23.86, Z = -10.7;
    mk('attic', (c) => {
      const cyc = (still ? 6 : T) % 26;
      let d = still ? 0.6 : cyc < 6 ? ease(cyc / 6) : cyc < 15 ? 1 : cyc < 20 ? 1 - ease((cyc - 15) / 5) : 0;
      if (!still && c.y > 4 && Math.hypot(c.x - X, c.z - Z) < 1.3) d = Math.min(d, 0.25); // a cat close by: it goes up, kindly
      if (d < 0.03) { hide(thread, 9); hide(body, 7); return; }
      const y = TOP - d * 0.95, sway = still ? 0 : 0.03 * (gustAt(T) - 0.6) * WIND.x * 4 + 0.01 * Math.sin(T * 1.3);
      for (let i = 0; i < 9; i++) at(thread + i, X + sway * (1 - i / 9), TOP - (TOP - y) * (i / 9) * 0.97, Z); // sway at the end of the thread
      at(body, X + sway, y - 0.05, Z); at(eye, X + sway - 0.025, y - 0.03, Z - 0.05); at(eye + 1, X + sway + 0.025, y - 0.03, Z - 0.05);
      for (let k = 0; k < 4; k++) at(leg + k, X + sway + (k % 2 ? 0.09 : -0.09), y - 0.05 + (k < 2 ? 0.035 : -0.05), Z - 0.01);
    });
  }

  // ---- moths round the lamps (the house's rhythm: once the lamps come on) ----
  {
    const list = lamps.filter((l) => LEVEL_Y[(l.room === 'bedroom' ? 'upstairs' : l.room === 'attic' ? 'attic' : 'ground')] !== undefined && l.room !== 'cellar' && !['solarium', 'livingroom', 'kids', 'bath'].includes(l.room));
    list.forEach((l, n) => {
      const lvl = l.room === 'bedroom' ? 'upstairs' : l.room === 'attic' ? 'attic' : 'ground';
      const per = low ? 1 : 2;
      const m = [];
      for (let k = 0; k < per; k++) m.push({ b: add(0.96, 0.93, 0.8, 0.085), w: add(1, 0.98, 0.9, 0.1), p: k * 3.1 + n * 1.7 });
      mk(lvl, () => {
        const a = Math.min(1, Math.max(0, (rhythm.lamp - 0.3) / 0.3));
        const hy = LEVEL_Y[lvl] + (LAMP_Y[l.kind] ?? 1.3);
        for (const q of m) {
          if (a <= 0) { hide(q.b, 1); hide(q.w, 1); continue; }
          const t = still ? 0 : T, th = t * (0.9 + 0.2 * (q.p % 2)) + q.p, r = (0.26 + 0.1 * Math.sin(t * 1.3 + q.p)) * (0.5 + 0.5 * Math.abs(Math.sin(t * 0.37 + q.p)));
          const x = l.x + r * Math.cos(th), y = hy + 0.13 * Math.sin(t * 2.1 + q.p * 2) + 0.03 * Math.sin(t * 19 + q.p), z = l.z + r * Math.sin(th);
          at(q.b, x, y, z); at(q.w, x, y + 0.02, z);
          SZ[q.w] = (0.05 + 0.08 * Math.abs(Math.sin(still ? 1 : t * 26 + q.p))) * K * a; SZ[q.b] = 0.085 * K * a; // wings beat
        }
      });
    });
  }

  // ---- the robin on the hall window's sill (on the lawn below it when the wall is down), hopping by day ----
  {
    const body = add(0.52, 0.36, 0.24, 0.15), breast = add(0.96, 0.42, 0.18, 0.11), head = add(0.5, 0.35, 0.22, 0.1), eye = add(0.05, 0.04, 0.04, 0.03), beak = add(0.95, 0.8, 0.2, 0.03), tail = add(0.3, 0.22, 0.16, 0.07);
    let x = 2, dir = 1, hopT = 0, gone = 0, goalX = 2.4, peck = 0;
    mk('ground', (c) => {
      const up = wallUp() > 0.97;
      if (rhythm.day < 0.45 || rain || (c.y < 1 && c.dw < 1.3 && !still && gone <= 0 && up && (gone = 12) > 0)) { hide(body, 6); return; }
      if (gone > 0) { gone -= still ? 0 : c.dt; hide(body, 6); return; }
      const y0 = up ? 0.92 : 0.05, z = up ? 11.8 : 12.95; // on the sill inside the glass, or on the lawn below
      if (!still) {
        hopT -= c.dt;
        if (hopT <= 0) { hopT = 0.9 + 1.4 * hash01(dayKey, ++peck, 0x21); goalX = 1.2 + 2.4 * hash01(dayKey, peck, 0x22); if (goalX < x) dir = -1; else dir = 1; }
        const dx = goalX - x;
        if (Math.abs(dx) > 0.03) x += Math.sign(dx) * Math.min(Math.abs(dx), c.dt * 1.4);
      }
      const hopY = still ? 0 : Math.abs(goalX - x) > 0.03 ? 0.09 * Math.abs(Math.sin((goalX - x) * 9)) : 0;
      const dip = still || Math.abs(goalX - x) > 0.03 ? 0 : (peck % 2 ? 0.05 * Math.max(0, Math.sin(T * 7)) : 0);
      const y = y0 + hopY;
      at(body, x, y + 0.07, z); at(breast, x + dir * 0.05, y + 0.05, z - 0.05); at(head, x + dir * 0.1, y + 0.15 - dip, z - 0.01); at(eye, x + dir * 0.14, y + 0.17 - dip, z - 0.05);
      at(beak, x + dir * 0.19, y + 0.14 - dip, z - 0.01); at(tail, x - dir * 0.14, y + 0.08, z);
    });
  }

  // ---- the bluebird at the birdbath: flies in, splashes, flies off ----
  if (!low) {
    const body = add(0.3, 0.5, 0.86, 0.12), belly = add(0.92, 0.94, 0.96, 0.08), head = add(0.28, 0.46, 0.82, 0.08), beak = add(0.95, 0.75, 0.2, 0.03), tail = add(0.2, 0.3, 0.55, 0.05), drop = adds(4, 0.7, 0.88, 1, 0.045);
    const BX = -29.8, BZ = 17.8, off = 12 * seed(5);
    let was = 0;
    mk('ground', () => {
      const cyc = still ? 5 : (T + off) % 50;
      if (rhythm.day < 0.4 || rain || cyc > 19) { hide(body, 9); was = 0; return; }
      let x, y, z;
      if (cyc < 3) { const f = ease(cyc / 3); x = BX - 3.6 * (1 - f) - 0.4 * f; y = 0.88 + 2 * Math.sin((1 - f) * 1.5) * (1 - f); z = BZ - 2.5 * (1 - f) - 0.1 * f; }
      else if (cyc < 15) { x = BX - 0.4; y = 0.88 + 0.015 * Math.abs(Math.sin(cyc * 6)); z = BZ - 0.1; }
      else { const f = ease((cyc - 15) / 4); x = BX - 0.4 + 4 * f; y = 0.88 + 2.5 * f; z = BZ + 3 * f; }
      if (!was && cyc >= 3) { was = 1; audio?.peep?.(0.2); }
      at(body, x, y + 0.06, z); at(belly, x, y + 0.03, z - 0.1); at(head, x - 0.1, y + 0.14, z - 0.06); at(beak, x - 0.17, y + 0.13, z - 0.06); at(tail, x + 0.15, y + 0.06, z);
      for (let k = 0; k < 4; k++) {
        const u = (cyc * 1.6 + k * 0.25) % 1;
        if (cyc < 3.2 || cyc > 15 || still) { hide(drop + k, 1); if (!still) continue; }
        at(drop + k, BX - 0.4 + 0.22 * Math.cos(k * 1.6), 0.9 + 0.35 * Math.sin(u * Math.PI) * (still ? 0.6 : 1), BZ - 0.1 + 0.22 * Math.sin(k * 1.6));
      }
    });
  }

  // ---- the old dog asleep on the parlour rug, opening one eye when she comes near ----
  {
    const DX = 10.6, DZ = 8.2;
    const b = adds(3, 0.8, 0.62, 0.4, 0.34), head = add(0.84, 0.66, 0.44, 0.24), snout = add(0.88, 0.82, 0.74, 0.12), ear = adds(2, 0.46, 0.31, 0.19, 0.12), tail = add(0.8, 0.62, 0.4, 0.11);
    const white = adds(2, 1, 1, 0.96, 0.075), pupil = adds(2, 0.08, 0.05, 0.04, 0.04), zz = low ? -1 : adds(3, 0.8, 0.9, 1, 0.07);
    let open = 0, shut = 3 + 4 * seed(7);
    mk('ground', (c) => {
      const br = still ? 0 : 0.012 * Math.sin(T * 1.9), by = 0.17 + br;
      at(b, DX - 0.27, by, DZ); at(b + 1, DX, by + 0.02, DZ); at(b + 2, DX + 0.25, by, DZ);
      at(head, DX + 0.52, 0.13 + br * 0.5, DZ - 0.05); at(snout, DX + 0.67, 0.1, DZ - 0.07); at(ear, DX + 0.5, 0.25, DZ - 0.2); at(ear + 1, DX + 0.5, 0.25, DZ + 0.1); at(tail, DX - 0.5, 0.1, DZ + 0.12);
      if (!still) { shut -= c.dt; if (c.y < 1 && c.dd < 4.2 && shut <= 0) { open = 1.5; shut = 14 + 6 * seed(8 + (T | 0)); } open = Math.max(0, open - c.dt); } else open = 0;
      const o = open > 0 ? 1 : 0;
      for (let s = 0; s < 2; s++) {
        const z = s ? DZ + 0.07 : DZ - 0.17, y = 0.2 + br * 0.5;
        if (s === 0 && o > 0) { at(white, DX + 0.56, y, z); at(pupil, DX + 0.58, y, z - 0.03); SZ[pupil] = 0.045 * K; } else { hide(white + s, 1); at(pupil + s, DX + 0.56, y, z); SZ[pupil + s] = (s === 1 || o <= 0 ? 0.022 : 0.04) * K; }
      }
      if (zz >= 0) for (let k = 0; k < 3; k++) { const u = ((still ? 0.3 + k * 0.3 : T * 0.2 + k * 0.33) % 1); if (u < 0.1) hide(zz + k, 1); else { at(zz + k, DX + 0.62 + u * 0.35, 0.4 + u * 0.55, DZ - 0.15); SZ[zz + k] = 0.05 * K * (1 + u); } }
    });
  }

  // ---- the pooled Points ----
  const N = siz.length;
  P = new Float32Array(pos); CL = new Float32Array(col); SZ = new Float32Array(siz);
  const base = SZ.slice();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(CL, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(SZ, 1));
  const map = roundTexture();
  const mat = new THREE.PointsMaterial({ size: 1, sizeAttenuation: true, vertexColors: true, map, transparent: true, alphaTest: 0.1, depthWrite: false, fog: false });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aSize;').replace('gl_PointSize = size;', 'gl_PointSize = size * aSize;');
  };
  mat.customProgramCacheKey = () => 'house-creatures';
  const points = new THREE.Points(geo, mat);
  points.name = 'house-creatures';
  points.frustumCulled = false;
  points.renderOrder = 3;
  Object.assign(points.userData, { noCast: true, noMerge: true });
  scene.add(points);

  let lx = 0, lz = 0, seen = false, speed = 0;
  return {
    points,
    count: N,
    // cat { x, y, z }; full: the Set of drawn levels (houselife drawing.full)
    update(dt, cat, full) {
      if (!(dt > 0) && !still) return;
      if (!still) T += dt;
      const step = seen ? Math.hypot(cat.x - lx, cat.z - lz) : 0;
      speed += ((dt > 0 && step < 3 ? step / dt : 0) - speed) * Math.min(1, dt * 8);
      lx = cat.x; lz = cat.z; seen = true;
      const c = { dt, x: cat.x, y: cat.y, z: cat.z, fast: speed > DASH, dc: Math.hypot(cat.x - 4.3, cat.z + 0.9), dw: Math.hypot(cat.x - 2, cat.z - 12), dd: Math.hypot(cat.x - 10.6, cat.z - 8.2) };
      SZ.set(base);
      for (const k of creatures) {
        if (!full.has(k.lvl)) { if (k.on) { hide(k.a, k.b - k.a); k.on = false; } continue; } // a level not drawn: its points are put away
        k.on = true;
        k.run(c);
      }
      geo.attributes.position.needsUpdate = geo.attributes.color.needsUpdate = geo.attributes.aSize.needsUpdate = true;
    },
    dispose() { scene.remove(points); geo.dispose(); mat.dispose(); map?.dispose?.(); },
  };
}
