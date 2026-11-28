// SNOWVILLE, BEAUTY PASS 9: THE WINTER LANTERN FESTIVAL. A rare evening event (festivalAt: the real date and clock). NET ZERO triangles: ONE pooled Points ("snowville:fest"), no mesh, caster, light, collider, word or progress.
//   Paper lanterns the village released drift up in slow columns over the roofs and the pond; a lane of paper lanterns strung over the street lights one by one as she walks and stays lit; ice-sculpture glints on the pond;
//   the village tree blooms in slow colour waves and, once, bursts into a snow-globe sparkle with a carol; a cocoa steam cloud drifts from the stall toward her; a soft bells-and-carol chord, the wind ducked (SHARED.fest).
//   Reduced motion = still (lanterns hung, the lane lit, one colour on the tree, no burst). Outside the festival nothing is made. Draws no random number, reads no clock (time arrives as `t`).
import * as THREE from 'three';
import * as P from './snowvilleplan.js';
import { dotTexture } from './snowvilleparts.js';
import { SHARED } from './snowvillealive.js';
import { carolChime, villageBell, sleighBells, chimeClock } from './snowvillesound.js';

const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const TAU = Math.PI * 2;
const sm = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
export const FEST = Object.freeze({ scale: Object.freeze({ high: 1, low: 0.6, lite: 0.3 }), from: 17, to: 22.5, fade: 6, burstNear: 10, lane: Object.freeze({ z0: 25, step: 2.6, spans: 6, y: 3.0 }), rise: 30 });

/** Is the festival on? The evenings 17:00 to 22:30 of 18-24 December and 31 December - 1 January. Pure (`now` is a Date). */
export function festivalAt(now) {
  const m = now.getMonth(); const d = now.getDate(); const h = now.getHours() + now.getMinutes() / 60;
  return h >= FEST.from && h < FEST.to && ((m === 11 && ((d >= 18 && d <= 24) || d === 31)) || (m === 0 && d === 1));
}
const rgb = (h, s, v) => { const f = (n) => v * (1 - s * Math.max(0, Math.min(1, Math.abs(((h * 6 + n) % 6) - 3) - 1))); return [f(5), f(3), f(1)]; };
const WARM = [[1, 0.5, 0.12], [1, 0.66, 0.22], [1, 0.38, 0.2], [1, 0.8, 0.4]];
const STONE = [P.COTTAGES.find((c) => c.id === 'baker'), P.COTTAGES.find((c) => c.id === 'east1'), P.COTTAGES.find((c) => c.id === 'west2'), P.POND].map((o) => [o.x, o.z]);

export function createFestival({ scene, audio = null, rung = 'high', motion = true, now = null, force = false }) {
  const on = force || festivalAt(now ?? new Date());
  const st = { on, k: 0, t0: -1, burst: -1, bursts: 0, lit: [], nextSound: 6, sounds: 0 };
  if (!on) return { active: false, state: st, points: null, step() {}, dispose() {} };
  const K = FEST.scale[rung]; const n = (full) => Math.max(1, Math.round(full * K));
  const L = FEST.lane; const spans = Math.max(3, Math.round(L.spans * (K < 1 ? 0.7 : 1))); const perSpan = K < 0.5 ? 2 : 4;
  const nLane = spans * perSpan; const nUp = n(32) * 2; const nIce = n(12); const nTree = n(20); const nBurst = n(26); const nCocoa = n(10);
  const o = { lane: 0, up: nLane * 2, ice: nLane * 2 + nUp, tree: nLane * 2 + nUp + nIce, burst: nLane * 2 + nUp + nIce + nTree, cocoa: nLane * 2 + nUp + nIce + nTree + nBurst };
  const N = o.cocoa + nCocoa;
  const pos = new Float32Array(N * 3); const col = new Float32Array(N * 4); const scl = new Float32Array(N);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 4)); geo.setAttribute('aS', new THREE.BufferAttribute(scl, 1));
  const mat = new THREE.PointsMaterial({ map: dotTexture(), alphaTest: 0.01, size: 1, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 1, depthWrite: false, fog: false });
  mat.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('void main() {', 'attribute float aS;\nvoid main() {').replace('gl_PointSize = size;', 'gl_PointSize = size * aS;'); };
  const pts = new THREE.Points(geo, mat); pts.name = 'snowville:fest'; pts.frustumCulled = false; pts.renderOrder = 8;
  Object.assign(pts.userData, { noCast: true, noContactShadow: true, noMerge: true });
  scene.add(pts);
  const set = (i, x, y, z, c, a, s) => { pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z; col[i * 4] = c[0]; col[i * 4 + 1] = c[1]; col[i * 4 + 2] = c[2]; col[i * 4 + 3] = a; scl[i] = a > 0.01 ? s : 0; };
  const F = P.SQUARE_FIR; const S = P.STALL;
  const say = (k) => { try { if (audio && !audio.isMuted?.()) { chimeClock.t = k; carolChime(audio, 20 + st.sounds); villageBell(audio, 3 + st.sounds, 0.25); sleighBells(audio, 30 + st.sounds, 0.4); } } catch { /* optional */ } };

  function step(dt, t, cat) {
    if (!cat) return;
    if (st.t0 < 0) st.t0 = t;
    st.k = sm((t - st.t0) / FEST.fade); SHARED.fest = st.k; const k = st.k; const T = motion ? t : 0;
    if (motion && t >= st.nextSound) { st.nextSound = t + 52 + 30 * hash(st.sounds); say(t); st.sounds++; }
    // the lane: three paper lanterns on each string across the street, lit as she comes within reach and kept lit (a halo and a body each; the ones right by her fade so none blocks her)
    for (let s = 0; s < spans; s++) {
      const z = L.z0 - s * L.step;
      if (st.lit[s] === undefined && (!motion || cat.z < z + 11)) st.lit[s] = t;
      const lit = st.lit[s] === undefined ? 0 : motion ? sm((t - st.lit[s]) / 1.4) : 1; const clear = 0.2 + 0.8 * sm((Math.hypot(cat.x, cat.z - z) - 0.8) / 2);
      for (let j = 0; j < perSpan; j++) {
        const x = (j - (perSpan - 1) / 2) * (perSpan === 2 ? 4.4 : 2.5); const y = P.snowY(x, z) + L.y - 0.3 * (1 - (x / 5) ** 2) + (motion ? 0.05 * Math.sin(T * 0.9 + s * 2 + j) : 0); const i = o.lane + (s * perSpan + j) * 2; const c = WARM[(s + j) % 4];
        const e = k * clear * (0.2 + 0.8 * lit);
        set(i, x, y, z, c, 0.5 * e, 1.5); set(i + 1, x, y, z, lit > 0.5 ? [1, 0.55 + 0.2 * lit, 0.2] : [0.8, 0.3, 0.1], 0.95 * e, 0.65);
      }
    }
    // released lanterns, up in slow columns over four places (a column's lanterns spread along its climb)
    for (let i = 0; i < nUp; i += 2) {
      const q = i / 2; const base = STONE[q % 4]; const u = ((motion ? t : 0) / FEST.rise + hash(q) * 0.3 + q / (nUp / 2)) % 1;
      const hgt = 2 + u * 20; const x = base[0] + (hash(q + 5) - 0.5) * 3.2 + SHARED.wx * 3.5 * u + 0.5 * Math.sin(T * 0.4 + q * 1.7); const z = base[1] + (hash(q + 9) - 0.5) * 3.2 + SHARED.wz * 3.5 * u;
      const c = WARM[q % 4]; const a = k * sm(u / 0.06) * sm((1 - u) / 0.25) * (0.85 + 0.15 * (motion ? Math.sin(T * 2.1 + q * 3.1) : 0)); const y = P.snowY(x, z) + hgt; const w = 1 - 0.4 * u;
      set(o.up + i, x, y, z, c, 0.5 * a, 2.3 * w); set(o.up + i + 1, x, y, z, [1, 0.62, 0.25], 0.95 * a, 0.9 * w);
    }
    // ice-sculpture glints on the pond
    for (let i = 0; i < nIce; i++) {
      const a = hash(i + 40) * TAU; const r = P.POND.r * 0.8 * Math.sqrt(hash(i + 41)); const x = P.POND.x + Math.cos(a) * r; const z = P.POND.z + Math.sin(a) * r;
      const sp = motion ? Math.max(0, Math.sin(T * (0.8 + hash(i + 42)) + i * 5)) ** 3 : 0.6;
      set(o.ice + i, x, P.snowY(x, z) + 0.2 + (i < 3 ? 0.5 : 0), z, i % 3 ? [0.25, 0.7, 1] : [1, 0.45, 0.8], k * (0.35 + 0.65 * sp), i < 3 ? 2.4 : 1.5);
    }
    // the village tree: colour waves climbing it
    for (let i = 0; i < nTree; i++) {
      const u = (i + 0.5) / nTree; const a = i * 2.4; const r = (1.5 - 1.1 * (0.1 + 0.8 * u)) * (F.h / 4.5) * 0.95;
      const c = rgb((((motion ? t * 0.04 : 0) + u * 0.45 + a / TAU * 0.2) % 1 + 1) % 1, 0.8, 1);
      set(o.tree + i, F.x + Math.cos(a) * r, P.snowY(F.x, F.z) + F.h * (0.14 + 0.72 * u), F.z + Math.sin(a) * r, c, k * (motion ? 0.6 + 0.35 * Math.sin(T * 0.9 - u * 5 + a) : 0.8), 1.7);
    }
    // the snow-globe burst, once per festival when she first comes to the tree
    if (motion && st.burst < 0 && k > 0.7 && Math.hypot(cat.x - F.x, cat.z - F.z) < FEST.burstNear) { st.burst = t; st.bursts++; say(t); st.sounds++; }
    for (let i = 0; i < nBurst; i++) {
      const age = st.burst < 0 ? -1 : t - st.burst;
      if (age < 0 || age > 4.5) { scl[o.burst + i] = 0; continue; }
      const a = hash(i + 70) * TAU; const el = (hash(i + 71) - 0.2) * 1.4; const v = 2 + 2.2 * hash(i + 72); const hy = P.snowY(F.x, F.z) + F.h * 0.55;
      set(o.burst + i, F.x + Math.cos(a) * Math.cos(el) * v * age, Math.max(P.snowY(F.x, F.z) + 0.1, hy + Math.sin(el) * v * age - 0.9 * age * age), F.z + Math.sin(a) * Math.cos(el) * v * age, i % 2 ? [1, 0.85, 0.5] : [0.7, 0.9, 1], sm(age / 0.1) * sm((4.5 - age) / 1.5) * (0.6 + 0.4 * Math.sin(age * 14 + i)), 0.6);
    }
    // the cocoa steam cloud, drifting toward her
    let dx = cat.x - S.x; let dz = cat.z - S.z; const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl; const reach = Math.min(4.5, dl * 0.5); const near = 1 - sm((dl - 12) / 8);
    for (let i = 0; i < nCocoa; i++) {
      const u = ((motion ? t * 0.14 : 0) + i / nCocoa) % 1; const x = S.x - 0.75 + dx * reach * u + 0.2 * Math.sin(T + i); const z = S.z + dz * reach * u;
      set(o.cocoa + i, x, P.snowY(x, z) + 1.3 + 1.1 * u, z, [0.85, 0.55 - 0.1 * u, 0.32], k * near * 0.4 * sm(u / 0.15) * sm((1 - u) / 0.5), 0.9 + 1.3 * u);
    }
    geo.attributes.position.needsUpdate = geo.attributes.color.needsUpdate = geo.attributes.aS.needsUpdate = true;
  }
  return { active: true, state: st, points: pts, count: N, step, dispose() { SHARED.fest = 0; scene.remove(pts); geo.dispose(); mat.dispose(); } };
}
