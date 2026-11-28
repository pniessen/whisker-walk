// =============================================================================
// LIGHTHOUSE POINT: THE RARE SURPRISE (beauty pass 4, 2026-11-28). Now and then (about one walk in three, a minute or two
// in, and never twice in a walk) the sky or the bay does something special, and it is over in under a minute:
//   DOLPHINS    a pod of three arcs out of the east bay, one after another, with a little splash at each end of the leap;
//   A RAINBOW   five soft bands over the north-east sea;
//   THE NORTHERN LIGHTS  three green-and-violet curtains swaying over the north;
//   LIGHTNING   three far flashes out to sea (the sky lights up, a thin bolt, and the thunder a moment after: the walk's existing
//               surf swell sound, a low rumble of filtered noise, lighthousesound.js).
// Which one depends on the season (seasonKinds). All of it is pooled triangles in the sea fx mesh's tail (lighthousealive.js
// gives this module WONDER_TRIS of them and only draws them while a moment plays), written each frame from the walk's clock:
// no new mesh, no caster, no random number (hash01 only), no asset. Reduced motion and the lite tier never have a moment.
// =============================================================================

import { hash01 } from './builder.js';

export const WONDER_TRIS = 100;
export const CHANCE = 0.3; // of walks with a moment
export const KINDS = Object.freeze(['dolphins', 'rainbow', 'aurora', 'lightning']);
const BY_SEASON = Object.freeze({
  spring: ['dolphins', 'rainbow'],
  summer: ['dolphins', 'rainbow'],
  autumn: ['lightning', 'aurora', 'rainbow'],
  winter: ['aurora', 'lightning'],
});
export const seasonKinds = (season) => BY_SEASON[season] ?? BY_SEASON.autumn;
export const DURATION = Object.freeze({ dolphins: 26, rainbow: 40, aurora: 50, lightning: 26 });
export const STRIKES = Object.freeze([2, 10, 18]); // lightning: the seconds into the moment
export const THUNDER_LAG = 1.6; // s after a flash

// { kind, at, dur } for this walk, or null. `force` (the picture page only) names a kind and starts it at once.
export function wonderFor({ seed, season, force = null } = {}) {
  if (force && KINDS.includes(force)) return { kind: force, at: 0, dur: DURATION[force] };
  const s = Number(seed);
  const a = Number.isFinite(s) ? s % 9973 : 0;
  const b = Number.isFinite(s) ? (s >>> 4) % 7919 : 0;
  if (hash01(a, b, 4401) >= CHANCE) return null;
  const list = seasonKinds(season);
  const kind = list[Math.floor(hash01(a, b, 4403) * list.length) % list.length];
  return { kind, at: 45 + 75 * hash01(a, b, 4405), dur: DURATION[kind] };
}

const sm = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
const env = (u) => sm(0, 0.12, u) * sm(1, 0.85, u);

// view: { cam: [x,y,z], right: [x,y,z], up: [x,y,z], fwd: [x,y,z] } from the camera; emit(a, b, c, ca, cb, cc) writes one triangle
// (positions [x,y,z], colours [r,g,b]) and answers false once the pool is full.
export function drawWonder(kind, u, tl, view, emit) {
  const e = env(u);
  if (e <= 0) return;
  ({ dolphins, rainbow, aurora, lightning })[kind]?.(u, tl, view, emit, e);
}

const Z3 = [0, 0, 0];
const scale = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const horiz = (view, x, z) => { // the horizontal unit vector across the line of sight to (x, z)
  const dx = x - view.cam[0]; const dz = z - view.cam[2]; const l = Math.hypot(dx, dz) || 1;
  return [-dz / l, dx / l];
};

function dolphins(u, tl, view, emit) {
  const LEAP = 1.6; const LEN = 8; const PEAK = 3.2; const K = 2.6; // (a little more than life, so a pod reads from the beach)
  for (let i = 0; i < 3; i++) {
    const bx0 = 50 + 4 * i; const bz0 = -6 - 9 * i;
    const [ax, az] = horiz(view, bx0, bz0);
    const rel = tl - (1.0 + i * 0.9);
    const m = Math.floor(rel / 3.4); const s = (rel - m * 3.4) / LEAP;
    if (rel < 0 || s > 1) continue;
    const dir = (m + i) % 2 ? 1 : -1;
    const along = (s - 0.5) * LEN * dir;
    const y = 0.12 + 4 * PEAK * s * (1 - s);
    const dA = LEN * dir; const dY = 4 * PEAK * (1 - 2 * s);
    const l = Math.hypot(dA, dY); const d = [dA / l, dY / l];
    let n = [-d[1], d[0]]; if (n[1] < 0) n = [-n[0], -n[1]];
    const P = (a, b2) => [bx0 + ax * (along + K * (d[0] * a + n[0] * b2)), y + K * (d[1] * a + n[1] * b2), bz0 + az * (along + K * (d[0] * a + n[0] * b2))];
    const back = [0.3, 0.42, 0.52]; const belly = [0.58, 0.62, 0.62]; const fin = [0.22, 0.3, 0.4];
    const nose = P(0.8, 0); const tail = P(-0.75, 0); const bk = P(0.05, 0.2); const bl = P(0.05, -0.17);
    emit(nose, bk, bl, back, back, belly); emit(bk, tail, bl, back, back, belly);
    emit(P(-0.25, 0.17), P(0.05, 0.19), P(-0.12, 0.45), fin, fin, back);
    emit(tail, P(-0.97, 0.23), P(-0.97, -0.23), back, fin, fin);
    // a little splash where it goes in and where it comes out
    for (const sd of [0, 1]) {
      const k = Math.max(0, 1 - Math.abs(s - sd) / 0.22) * 0.55;
      if (k <= 0) continue;
      const ex = bx0 + ax * (sd ? along : along); const ez = bz0 + az * along;
      const w = [0.9, 0.95, 1];
      emit([ex - ax * 0.6, 0.1, ez - az * 0.6], [ex + ax * 0.6, 0.1, ez + az * 0.6], [ex, 0.1 + 1.6 * k, ez], scale(w, k * 0.4), scale(w, k * 0.4), scale(w, k));
    }
  }
}

function rainbow(u, tl, view, emit, e) {
  const cx = 44; const cz = -46; const R0 = 13; const W = 1.5; const SEG = 10;
  const [hx, hz] = horiz(view, cx, cz);
  const bands = [[1, 0.25, 0.2], [1, 0.62, 0.2], [0.65, 0.9, 0.3], [0.3, 0.6, 1], [0.6, 0.35, 0.9]];
  bands.forEach((c, b) => {
    const r0 = R0 + b * W; const r1 = r0 + W;
    for (let k = 0; k < SEG; k++) {
      const a0 = (k / SEG) * Math.PI; const a1 = ((k + 1) / SEG) * Math.PI;
      const p = (a, r) => [cx + hx * Math.cos(a) * r, -2 + Math.sin(a) * r, cz + hz * Math.cos(a) * r];
      const k0 = e * 0.34 * Math.sin(a0 + 0.001) ** 0.5; const k1 = e * 0.34 * Math.sin(a1 + 0.001) ** 0.5;
      emit(p(a0, r0), p(a0, r1), p(a1, r0), scale(c, k0), scale(c, k0), scale(c, k1));
      emit(p(a1, r0), p(a0, r1), p(a1, r1), scale(c, k1), scale(c, k0), scale(c, k1));
    }
  });
}

function aurora(u, tl, view, emit, e) {
  const SEG = 12;
  for (let c = 0; c < 3; c++) {
    const x0 = -30 + c * 42; const z = -64 - 5 * c; const w = 38;
    const lo = [0.08, 0.62, 0.36]; const hi = [0, 0, 0];
    for (let k = 0; k < SEG; k++) {
      const a = k / SEG; const b = (k + 1) / SEG;
      const sway = (q) => 4 * Math.sin(tl * 0.35 + q * 5 + c * 1.7);
      const top = (q) => 30 + 7 * Math.sin(tl * 0.21 + q * 3 + c) ;
      const lift = (q) => 0.55 + 0.45 * Math.sin(tl * 0.5 + q * 7 + c * 2);
      const A = [x0 + w * a, 9, z]; const B = [x0 + w * b, 9, z];
      const C = [x0 + w * a + sway(a), top(a), z]; const D = [x0 + w * b + sway(b), top(b), z];
      const ka = e * 0.36 * lift(a) * Math.sin(Math.PI * Math.min(0.999, Math.max(0.001, a))) ** 0.6; const kb = e * 0.36 * lift(b) * Math.sin(Math.PI * Math.min(0.999, Math.max(0.001, b))) ** 0.6;
      emit(A, B, C, scale(lo, ka), scale(lo, kb), hi);
      emit(B, D, C, scale(lo, kb), hi, hi);
    }
  }
}

function lightning(u, tl, view, emit, e) {
  STRIKES.forEach((s, k) => {
    const tt = tl - s;
    if (tt < 0 || tt > 1.6) return;
    const f = tt < 0.1 ? tt / 0.1 : tt < 0.18 ? 0.3 : tt < 0.26 ? 1 : Math.exp(-(tt - 0.26) * 5);
    // the whole sky blinks: a faint sheet in front of the camera and a glow over the far cloud the bolt came from
    const bxp = 60 + 9 * k; const bzp = -42 + 6 * k;
    const c = view.cam; const fw = view.fwd; const r = view.right; const up = view.up;
    const mid = [c[0] + fw[0] * 0.7, c[1] + fw[1] * 0.7, c[2] + fw[2] * 0.7];
    const q = (a, b) => [mid[0] + r[0] * a + up[0] * b, mid[1] + r[1] * a + up[1] * b, mid[2] + r[2] * a + up[2] * b];
    const sheet = [0.5, 0.55, 0.8]; const cs = scale(sheet, 0.09 * f);
    emit(q(-2, -1.2), q(2, -1.2), q(2, 1.2), cs, cs, cs); emit(q(-2, -1.2), q(2, 1.2), q(-2, 1.2), cs, cs, cs);
    const [hx, hz] = horiz(view, bxp, bzp);
    const g = scale([0.55, 0.55, 0.9], 0.14 * f);
    emit([bxp - hx * 16, 18, bzp - hz * 16], [bxp + hx * 16, 18, bzp + hz * 16], [bxp, 30, bzp], g, g, Z3);
    emit([bxp - hx * 16, 18, bzp - hz * 16], [bxp + hx * 16, 18, bzp + hz * 16], [bxp, 8, bzp], g, g, Z3);
    // the bolt: a thin jagged ribbon from the cloud to the sea
    const pts = []; for (let j = 0; j <= 7; j++) pts.push([bxp + 2.6 * Math.sin(j * 2.3 + k * 4) * (j % 2 ? 1 : -1) * (j > 0 && j < 7 ? 1 : 0), 20 - j * 2.8, bzp]);
    const bc = scale([0.9, 0.92, 1], f);
    for (let j = 0; j < 7; j++) {
      const a = pts[j]; const b = pts[j + 1];
      emit([a[0] - hx * 0.3, a[1], a[2] - hz * 0.3], [a[0] + hx * 0.3, a[1], a[2] + hz * 0.3], [b[0] - hx * 0.3, b[1], b[2] - hz * 0.3], bc, bc, bc);
      emit([a[0] + hx * 0.3, a[1], a[2] + hz * 0.3], [b[0] + hx * 0.3, b[1], b[2] + hz * 0.3], [b[0] - hx * 0.3, b[1], b[2] - hz * 0.3], bc, bc, bc);
    }
  });
}
