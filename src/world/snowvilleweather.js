// =============================================================================
// SNOWVILLE: BEAUTY PASS 6, WEATHER AND ATMOSPHERE AS EVENTS. No mesh, no light: TWO Points ("snowville:weather" in ordinary alpha, "snowville:sparkle" added, a size of its own for each dot) and the
// scene's fog, sky brightness and light levels, moved a little and put back. The REAL CLOCK (read once, here; the walk's time then carries it on) sets the weather of the hour:
//   * a CLEAR FROSTY NIGHT (about 20:00 - 05:00): stars, the moon and its glow, ice sparkle on the pond, the snow crust glittering, her breath showing, now and then the aurora of pass 4;
//   * a SUNNY MORNING THAW (about 06:00 - 10:00): icicles dripping and sparkling, steam off the roofs, puddles shining, birds crossing the sky;
// and now and then (not twice alike) an EVENT: a gentle BLIZZARD (snow thickens, wind-driven streaks, the lit windows and bulbs glow as halos, bells clink in the gusts, the sky goes grey-blue; the fog
// stays far enough back that her prompts and the guide arrow read) or, rarely, a SNOWFALL HUSH (the sound ducks to a muffled quiet, huge soft flakes, one distant bell).
// Reduced motion: the hour's look is still (no streak, drip, bird or event); the lite rungs draw half. Muted: silent. Pure helpers are exported. No Math.random.
// =============================================================================

import * as THREE from 'three';
import * as P from './snowvilleplan.js';
import { dotTexture } from './snowvilleparts.js';
import { SHARED } from './snowvillealive.js';
import { villageBell, sleighBells } from './snowvillesound.js';

const hash = (n, s) => { let h = (Math.imul(n | 0, 0x9e3779b1) ^ Math.imul((s | 0) + 0x4d2c6dd1, 0x85ebca6b)) | 0; h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 13; return (h >>> 0) / 4294967296; };
const c01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a, b, x) => { const u = c01((x - a) / (b - a)); return u * u * (3 - 2 * u); };

export const EVENTS = Object.freeze({ first: 150, gap: 240, span: 200, dur: Object.freeze({ blizzard: 80, hush: 50 }), ramp: 12 });
export const nightAt = (h) => (h >= 19.5 ? smooth(19.5, 20.5, h) : h < 5 ? 1 : 1 - smooth(5, 6, h)); // 0 .. 1 by the hour of the day (0 .. 24)
export const morningAt = (h) => smooth(6, 7, h) * (1 - smooth(10, 11, h));
export const hourOf = (h0, t) => (h0 + t / 3600) % 24;
export const envAt = (u, dur) => smooth(0, EVENTS.ramp, u) * smooth(0, EVENTS.ramp, dur - u); // an event's swell: in, hold, out
export const eventKind = (n) => (n % 4 === 3 ? 'hush' : 'blizzard'); // every fourth is the rare hush
// The weights of the weather at hour h (0 .. 24), event `kind` at swell e: bliz, hush, night, morn (each 0 .. 1) and the look they ask for. Pure.
export function weatherAt(h, kind = null, e = 0) {
  const bl = kind === 'blizzard' ? e : 0; const hu = kind === 'hush' ? e : 0; const ni = nightAt(h); const mo = morningAt(h) * (1 - ni);
  const bg = Math.max(0.22, 1 - 0.32 * bl - 0.06 * hu - 0.72 * ni);
  return {
    bl, hu, ni, mo, bg, cool: [1 - 0.14 * bl - 0.45 * ni + 0.06 * mo, 1 - 0.07 * bl - 0.28 * ni + 0.02 * mo, 1 - 0.05 * mo],
    near: 1 - 0.4 * bl - 0.12 * hu, far: 1 - 0.5 * bl - 0.2 * hu - 0.12 * ni + 0.3 * mo,
    sun: 1 - 0.42 * bl - 0.12 * hu - 0.7 * ni + 0.3 * mo, fill: 1 - 0.2 * bl - 0.45 * ni, env: 1 - 0.5 * ni - 0.25 * bl,
    glow: 1 + 0.8 * bl + 0.4 * ni + 0.2 * hu, halo: 1 + 0.6 * bl, cold: Math.max(ni, 0.6 * mo, 0.7 * bl),
  };
}

// ---- sounds (all optional: the village's own bells, nothing without a running, unmuted audio) ------------------------------------------------------------------
export const clink = (audio, k = 0) => sleighBells(audio, k, 0.4); // bells clinking in a gust

// ---- the thing itself ------------------------------------------------------------------------------------------------------------------------------
export function createWeather({ scene, sun = null, fill = null, audio = null, reducedMotion = false, low = false, now = null }) {
  const d0 = now ?? new Date(); const h0 = d0.getHours() + d0.getMinutes() / 60;
  const st = { h0, skipThaw: false, kind: null, t0: 0, n: 0, next: EVENTS.first, last: null, pending: null, hour: h0, clink: -99, bell: false };
  const w = weatherAt(h0);
  const still = reducedMotion;
  const NS = low ? 70 : 150; const NH = 32; const A1 = NS * 3; const A2 = A1 + NH; const A3 = A2 + 2; const A4 = A3 + 21; const A5 = A4 + 6; const NA = A5 + 14;
  const NSTAR = low ? 60 : 110; const B1 = NSTAR; const B2 = B1 + 2; const B4 = B2 + 66; const B5 = B4 + 7; const NB = B5 + 7;
  const layer = (n, name, additive, order) => {
    const pos = new Float32Array(n * 3); const col = new Float32Array(n * 4); const scl = new Float32Array(n);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 4)); g.setAttribute('aS', new THREE.BufferAttribute(scl, 1));
    const m = new THREE.PointsMaterial({ map: dotTexture(), alphaTest: 0.01, size: 1, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 1, depthWrite: false, fog: !additive, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    m.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('void main() {', 'attribute float aS;\nvoid main() {').replace('gl_PointSize = size;', 'gl_PointSize = size * aS;'); };
    const o = new THREE.Points(g, m); o.name = name; o.frustumCulled = false; o.renderOrder = order; o.visible = false;
    Object.assign(o.userData, { noCast: true, noContactShadow: true, noMerge: true });
    scene.add(o);
    return { o, g, m, pos, col, scl, set(i, x, y, z, r, gg, b, a, s) { pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z; col[i * 4] = r; col[i * 4 + 1] = gg; col[i * 4 + 2] = b; col[i * 4 + 3] = c01(a); scl[i] = a > 0.004 ? s : 0; } };
  };
  const A = layer(NA, 'snowville:weather', false, 4); const B = layer(NB, 'snowville:sparkle', true, 4);
  const wrap = (v, c, b) => ((((v - c) % (2 * b)) + 2 * b) % (2 * b)) - b + c;
  const fw = new THREE.Vector3();
  const drips = P.COTTAGES.map((c, i) => { const s = Math.sin(c.yaw); const co = Math.cos(c.yaw); const n = Math.round(c.w * 1.6); const lx = -c.w / 2 - 0.1 + ((c.w + 0.2) * ((i * 5 + 1) % n + 0.5)) / n; const lz = c.d / 2 + 0.36; return { x: c.x + lx * co + lz * s, z: c.z - lx * s + lz * co, y0: P.snowY(c.x, c.z) + c.h - 0.2, ph: hash(i, 8) }; });
  // what the scene looked like before (put back on dispose): the fog, the sky's brightness, the lights' levels
  const base = { fog: null, near: 0, far: 0, color: new THREE.Color(), fc: null, gc: null };
  const was = { bg: 1, env: 1, sun: 1, fill: 1 };
  const duck = { m: null, base: 1, last: -1, on: false };

  function look() {
    scene.backgroundIntensity = (scene.backgroundIntensity ?? 1) * w.bg / was.bg; was.bg = w.bg;
    scene.environmentIntensity = (scene.environmentIntensity ?? 1) * w.env / was.env; was.env = w.env;
    if (sun) { sun.intensity *= w.sun / was.sun; was.sun = w.sun; }
    if (fill) { fill.intensity *= w.fill / was.fill; was.fill = w.fill; if (!base.fc) { base.fc = fill.color.clone(); base.gc = fill.groundColor.clone(); } fill.color.setRGB(base.fc.r * w.cool[0], base.fc.g * w.cool[1], base.fc.b * w.cool[2]); fill.groundColor.setRGB(base.gc.r * w.cool[0], base.gc.g * w.cool[1], base.gc.b * w.cool[2]); }
    const f = scene.fog; if (!f) return;
    if (base.fog !== f) { base.fog = f; base.near = f.near; base.far = f.far; base.color.copy(f.color); }
    f.near = base.near * w.near; f.far = base.far * w.far;
    f.color.setRGB(base.color.r * w.bg * w.cool[0], base.color.g * w.bg * w.cool[1], base.color.b * w.bg * w.cool[2]);
  }
  function ducking(u) { // the hush: the master's volume down to a third, and back; stands aside if the player moves the volume meanwhile
    const m = audio?.getMaster?.()?.gain; if (!m) return;
    if (!duck.on && u > 0) Object.assign(duck, { m, base: m.value, last: m.value, on: true });
    if (!duck.on) return;
    if (Math.abs(m.value - duck.last) > 0.02) { duck.on = false; return; } // (someone else set it: leave it be)
    duck.last = duck.base * (1 - 0.68 * u); m.value = duck.last;
    if (u <= 0) duck.on = false;
  }

  function update(dt, t, catPos, camera) {
    const tt = still ? 0 : t;
    st.hour = hourOf(st.h0, tt);
    if (!still) {
      if (st.pending) { st.kind = st.pending; st.pending = null; st.t0 = t; st.n++; st.bell = false; }
      else if (!st.kind && t >= st.next) { st.kind = eventKind(st.n); st.t0 = t; st.n++; st.bell = false; }
      if (st.kind && t - st.t0 > EVENTS.dur[st.kind]) { st.last = st.kind; st.kind = null; st.next = t + 240 + 200 * hash(st.n, 3); }
    }
    const u = st.kind ? t - st.t0 : 0; const e = st.kind ? envAt(u, EVENTS.dur[st.kind]) : 0;
    Object.assign(w, weatherAt(st.hour, st.kind, e));
    look();
    if (!still) ducking(w.hu);
    const idle = w.bl + w.hu + w.ni + w.mo < 0.002;
    A.o.visible = !idle && !still; B.o.visible = !idle;
    if (idle) return;
    const cx = catPos?.x ?? 0; const cz = catPos?.z ?? 30; const cy = catPos?.y ?? P.snowY(cx, cz);
    if (camera?.getWorldDirection) camera.getWorldDirection(fw); else fw.set(0, 0, -1);
    const fl = Math.hypot(fw.x, fw.z) || 1; const fx = fw.x / fl; const fz = fw.z / fl; const cam = camera?.position ?? { x: cx, y: cy + 3, z: cz + 4 };
    const dist = (x, y, z) => Math.hypot(x - cam.x, y - cam.y, z - cam.z);
    const gust = still ? 0 : 0.55 + 0.45 * Math.sin(t * 0.8) * Math.sin(t * 0.31 + 1);
    // ---- A: streaks, hush flakes, breath, steam, birds, drips (not in reduced motion: nothing there holds still)
    if (!still) {
    for (let i = 0; i < NS; i++) {
      const sp = (4.5 + 3 * hash(i, 3)) * (0.7 + 0.5 * gust); const vx = SHARED.wx * sp; const vz = SHARED.wz * sp; const vy = -(2 + 1.4 * hash(i, 4)); const vl = Math.hypot(vx, vy, vz);
      const x = wrap(hash(i, 1) * 20 - 10 + vx * tt, cx, 10); const z = wrap(hash(i, 2) * 20 - 10 + vz * tt, cz, 10); const top = 9; const y = P.snowY(x, z) + top - ((hash(i, 5) * top - vy * tt) % top);
      const a0 = w.bl * c01((dist(x, y, z) - 1.6) / 2.4) * (low ? 1 : 0.9);
      for (let j = 0; j < 3; j++) A.set(i * 3 + j, x - (vx / vl) * 0.3 * j, y - (vy / vl) * 0.3 * j, z - (vz / vl) * 0.3 * j, 0.95, 0.97, 1, a0 * (1 - 0.28 * j), 0.42 - 0.06 * j);
    }
    for (let i = 0; i < NH; i++) {
      const x = wrap(hash(i, 11) * 14 - 7 + 0.6 * Math.sin(tt * 0.3 + i), cx, 7); const z = wrap(hash(i, 12) * 14 - 7 + 0.6 * Math.cos(tt * 0.27 + i * 2), cz, 7); const y = P.snowY(x, z) + 7 - ((hash(i, 13) * 7 + 0.4 * tt) % 7);
      A.set(A1 + i, x, y, z, 0.97, 0.98, 1, w.hu * 0.6 * c01((dist(x, y, z) - 2) / 2.5), 1.6 + 1.0 * hash(i, 14));
    }
    for (let j = 0; j < 2; j++) { // her breath: a puff every 2.6 s, two staggered
      const k = (tt / 2.6 + j * 0.5) % 1;
      A.set(A2 + j, cx + fx * (0.4 + 0.5 * k), cy + 0.55 + 0.25 * k, cz + fz * (0.4 + 0.5 * k), 1, 1, 1, 0.6 * w.cold * (1 - k) * smooth(0, 0.15, k), 0.18 + 0.5 * k);
    }
    for (let i = 0; i < P.COTTAGES.length; i++) for (let j = 0; j < 3; j++) { // steam off the roofs
      const c = P.COTTAGES[i]; const k = (tt * 0.18 + j / 3 + i * 0.31) % 1; const x = c.x + 0.25 * c.w * Math.cos(c.yaw) + SHARED.wx * k * k * 1.4 + 0.1 * Math.sin(k * 7 + j);
      A.set(A3 + i * 3 + j, x, P.snowY(c.x, c.z) + c.h + 0.8 + 3.6 * k, c.z + SHARED.wz * k * k * 1.4, 1, 0.97, 0.9, w.mo * (1 - k) * smooth(0, 0.12, k), 1.7 + 2.2 * k);
    }
    for (let i = 0; i < 6; i++) { // birds crossing the sky (dark specks that flap)
      const k = (tt * 0.035 + i * 0.045 + 0.2 * hash(i, 20)) % 1; const lat = -50 + 100 * k; const fwd = 22 + 8 * Math.sin(i * 2.1 + tt * 0.1);
      A.set(A4 + i, cam.x + fx * fwd - fz * lat, cam.y + 6 + 2.5 * Math.sin(tt * 1.3 + i) + (i % 4) * 3, cam.z + fz * fwd + fx * lat, 0.16, 0.17, 0.2, low ? 0 : w.mo * 0.85, 0.85 * (0.65 + 0.35 * Math.sin(tt * 14 + i * 2)));
    }
    for (let i = 0; i < 14; i++) { // icicle drips
      const dd = drips[i % drips.length]; const k = (tt * 0.45 + dd.ph * 4 + (i > 6 ? 0.5 : 0)) % 1; const y = k < 0.55 ? dd.y0 - 0.04 * (k / 0.55) : dd.y0 - 0.04 - ((k - 0.55) / 0.45) ** 2 * (dd.y0 - P.snowY(dd.x, dd.z) - 0.1);
      A.set(A5 + i, dd.x + (i > 6 ? 0.35 : 0), y, dd.z, 0.3, 0.6, 1, st.skipThaw || (low && i % 2) ? 0 : w.mo * 0.9, 0.2 + 0.14 * (k < 0.55 ? k / 0.55 : 0.8));
    }
    }
    // ---- B (added light): stars, moon, ice sparkle, crust glitter, icicle glints, puddles
    const spark = (ph, rate) => Math.max(0, Math.sin(tt * rate + ph * 62.8)) ** 10;
    for (let i = 0; i < NSTAR; i++) {
      const az = hash(i, 31) * 6.2832; const el = 0.07 + 1.25 * hash(i, 32) ** 1.5; const ce = Math.cos(el); const big = hash(i, 33) ** 3;
      const tw = 0.65 + 0.35 * Math.sin(tt * (1 + 2 * hash(i, 34)) + i * 7);
      B.set(i, cam.x + Math.sin(az) * ce * 140, cam.y + Math.sin(el) * 140, cam.z - Math.cos(az) * ce * 140, 0.85 + 0.15 * hash(i, 35), 0.92, 1 - 0.2 * hash(i, 36), w.ni * (0.55 + 0.45 * big) * tw, 0.9 + 1.8 * big);
    }
    const md = { x: -0.28, y: 0.4, z: -0.87 }; const ml = Math.hypot(md.x, md.y, md.z);
    [[40, 0.3, 0.55, 0.7, 1], [6.5, 0.95, 1, 0.98, 0.88]].forEach((m, j) => B.set(B1 + j, cam.x + (md.x / ml) * 140, cam.y + (md.y / ml) * 140, cam.z + (md.z / ml) * 140, m[2], m[3], m[4], w.ni * m[1], m[0]));
    for (let i = 0; i < 66; i++) { // ice sparkle on the pond (the first 26) and the snow crust glittering round her
      const pond = i < 26; const a = hash(i, 41) * 6.2832; const r = P.POND.r * 0.88 * Math.sqrt(hash(i, 42));
      const x = pond ? P.POND.x + Math.cos(a) * r : wrap(hash(i, 51) * 18 - 9, cx, 9); const z = pond ? P.POND.z + Math.sin(a) * r : wrap(hash(i, 52) * 18 - 9, cz, 9);
      B.set(B2 + i, x, P.snowY(x, z) + (pond ? 0.12 : 0.04), z, 0.82, 0.94, 1, (pond ? Math.max(w.ni, 0.8 * w.mo) : Math.max(w.ni, 0.5 * w.mo)) * spark(hash(i, 43), 1.1 + hash(i, 44) * (pond ? 1 : 1.5)), pond ? 0.5 + 0.5 * hash(i, 45) : 0.14 + 0.16 * hash(i, 45));
    }
    for (let i = 0; i < 7; i++) { // an icicle's glint, and a puddle shining where its drip lands
      const dd = drips[i]; const x = dd.x + 0.3; const z = dd.z + 0.5; B.set(B4 + i, dd.x, dd.y0 - 0.02, dd.z, 1, 1, 0.95, w.mo * spark(dd.ph, 1.7), 0.6);
      B.set(B5 + i, x, P.snowY(x, z) + 0.07, z, 0.6, 0.88, 1, st.skipThaw ? 0 : w.mo * (0.25 + 0.6 * spark(dd.ph * 1.7, 1.2)), 1 + 0.5 * dd.ph);
    }
    // ---- sound and the aurora's cue
    if (!still && w.bl > 0.3 && gust > 0.85 && t - st.clink > 7) { st.clink = t; clink(audio, st.n * 7 + Math.floor(t)); }
    if (!still && w.hu > 0.5 && !st.bell) { st.bell = true; villageBell(audio, 9, 1); } // the one distant bell (under the hush's own duck)
    for (const L of [A, B]) { L.g.attributes.position.needsUpdate = true; L.g.attributes.color.needsUpdate = true; L.g.attributes.aS.needsUpdate = true; }
  }

  return {
    state: st, w, points: [A.o, B.o],
    get glow() { return w.glow; }, get halo() { return w.halo; }, get night() { return w.ni; },
    trigger(kind) { if (still || !EVENTS.dur[kind]) return false; st.pending = kind; return true; }, // for the picture page and the tests
    update,
    dispose() {
      if (duck.on && duck.m) duck.m.value = duck.base;
      scene.backgroundIntensity = (scene.backgroundIntensity ?? 1) / was.bg; scene.environmentIntensity = (scene.environmentIntensity ?? 1) / was.env;
      if (sun) sun.intensity /= was.sun; if (fill) { fill.intensity /= was.fill; if (base.fc) { fill.color.copy(base.fc); fill.groundColor.copy(base.gc); } }
      if (base.fog) { base.fog.near = base.near; base.fog.far = base.far; base.fog.color.copy(base.color); }
      scene.remove(A.o, B.o); for (const L of [A, B]) { L.g.dispose(); L.m.dispose(); }
    },
  };
}
