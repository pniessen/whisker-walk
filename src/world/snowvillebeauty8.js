// SNOWVILLE, BEAUTY PASS 8: the village answers her voice and her moves. NET ZERO triangles: ONE pooled Points ("snowville:rx"), no mesh, caster, light, collider, word, gameplay effect or progress.
//   MEOW (the bus's 'call'): the windows brighten in a ripple down the lane, sleigh bells jingle, hares, fox and owls look up (SHARED.hear), a far dog calls, snow shakes off the nearest boughs, a carol note answers.
//   POUNCE / LAND: a puff of snow and glitter with a crunch. SNIFF: warm scent wisps drift to the cocoa stall or the bakery window, one soft chime. STILL: flakes settle on her fur, the owl turns, breath puffs.
//   ZOOMIES: powder spray and a glitter wake. 1.5 s between reactions of a kind; reduced motion = sounds only; lite = fewer dots. Draws no random number, reads no clock (time arrives as `t`).
import * as THREE from 'three';
import * as P from './snowvilleplan.js';
import { dotTexture } from './snowvilleparts.js';
import { SHARED } from './snowvillealive.js';
import { sleighBells, snowWhump, carolChime, villageBell, chimeClock } from './snowvillesound.js';
import { bus } from '../events.js';

const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }; // (a hash of a counter: pure, no Math.random)
const TAU = Math.PI * 2;
export const RX = Object.freeze({ gap: 1.5, still: 2.2, pool: Object.freeze({ high: 72, low: 44, lite: 22 }), scale: Object.freeze({ high: 1, low: 0.6, lite: 0.3 }), speed: 14 });
const WHITE = [1, 1, 1]; const GOLD = [1, 0.55, 0.05]; const ICE = [0.2, 0.55, 1]; const POW = [0.6, 0.76, 1]; // (powder and breath are shaded blue: white on white snow does not read)
const SCENT = [[1, 0.4, 0.1], [1, 0.62, 0.12]];

/** How much brighter a window at (x, z) is at time t for the ripple that left (ox, oz) at t0: a bump travelling out along the lane. 1 = as before. Pure. */
export function windowBoost(x, z, t, r) {
  if (!r || r.t0 < 0) return 1;
  const w = (t - r.t0) * RX.speed - Math.hypot(x - r.x, z - r.z); const a = t - r.t0;
  return a > 6 ? 1 : 1 + 1.6 * Math.exp(-(w * w) / 40) * (1 - a / 6);
}
export function createReactions({ scene, audio = null, rung = 'high', motion = true, targets = [] }) {
  const N = RX.pool[rung]; const K = RX.scale[rung]; 
  const pos = new Float32Array(N * 3); const col = new Float32Array(N * 4); const scl = new Float32Array(N);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 4)); geo.setAttribute('aS', new THREE.BufferAttribute(scl, 1));
  const mat = new THREE.PointsMaterial({ map: dotTexture(), alphaTest: 0.01, size: 1, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 1, depthWrite: false, fog: true });
  mat.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('void main() {', 'attribute float aS;\nvoid main() {').replace('gl_PointSize = size;', 'gl_PointSize = size * aS;'); };
  const pts = new THREE.Points(geo, mat); pts.name = 'snowville:rx'; pts.frustumCulled = false; pts.renderOrder = 7;
  Object.assign(pts.userData, { noCast: true, noContactShadow: true, noMerge: true });
  scene.add(pts);
  const ps = Array.from({ length: N }, () => ({ t0: -1, life: 0, mode: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, ay: 0, fl: 0, size: 0.51, rgb: WHITE, fw: 8 }));
  let head = 0; let seq = 1; const cool = {}; const queue = []; const c = { x: 0, y: 0, z: 0, fx: 0, fz: -1 };
  const rip = { t0: -1, x: 0, z: 0 };
  const st = { prevPounce: 0, prevSniff: 0, armed: true, zoomOn: false, zoomT: 0, nextTrail: 0, nextBreath: 0, meowed: false, landed: false, counts: { meow: 0, land: 0, pounce: 0, sniff: 0, sit: 0, zoom: 0 } };
  const firs = P.scatterFirs();
  const h = (k) => hash(seq * 7 + k * 13);
  const n = (full) => Math.max(1, Math.round(full * K));
  const ready = (kind, t) => { if (t < (cool[kind] ?? -1)) return false; cool[kind] = t + RX.gap; st.counts[kind]++; return true; };
  const take = (t0, life, o) => { const p = ps[head]; head = (head + 1) % N; seq++; return Object.assign(p, { t0, life, mode: 0, vx: 0, vy: 0, vz: 0, ay: 0, fl: 0, fw: 8 }, o); };
  const say = (t, at, fn) => { queue.push({ at: t + at, fn }); };
  const ground = () => P.snowY(c.x, c.z);

  function puff(t, cnt, v, glit) { // snow thrown up where she lands, and glitter in it
    for (let i = 0; i < cnt; i++) {
      const a = h(20 + i) * TAU; const s = (0.8 + 1.4 * h(21 + i)) * v; const g = glit && i % 3 === 0;
      take(t, g ? 1.4 : 1.0, { x: c.x + Math.cos(a) * 0.25, y: c.y + 0.15, z: c.z + Math.sin(a) * 0.25, vx: Math.cos(a) * s, vz: Math.sin(a) * s, vy: (1.6 + 1.6 * h(22 + i)) * v, ay: -6, size: g ? 0.51 : 0.85, rgb: g ? (i % 2 ? GOLD : ICE) : POW, fl: g ? 0.6 : 0, fw: 14 });
    }
  }
  function meow(t, emit) {
    if (emit) {
      for (let i = 0; i < n(12); i++) { const a = (i / n(12)) * TAU; take(t, 1.5, { x: c.x, y: c.y + 0.5, z: c.z, vx: Math.cos(a) * 3.2, vz: Math.sin(a) * 3.2, vy: 0.5, ay: -0.2, size: 0.7, rgb: i % 2 ? GOLD : ICE, fl: 0.3, fw: 11 }); } // her voice, a ring of sparkles spreading out
      rip.t0 = t; rip.x = c.x; rip.z = c.z; SHARED.hear = t;
      firs.filter((f) => Math.hypot(f.x - c.x, f.z - c.z) < 16).slice(0, 3).forEach((f, j) => { for (let i = 0; i < n(5); i++) { const a = h(70 + i + j * 9) * TAU; take(t + 0.5 + 0.2 * j + 0.05 * i, 1.6, { x: f.x + Math.cos(a) * 0.6 * f.s, y: P.snowY(f.x, f.z) + (2.2 + 1.6 * h(71 + i)) * f.s, z: f.z + Math.sin(a) * 0.6 * f.s, vy: -0.9, ay: -0.5, size: 0.77, rgb: POW, fl: 0.3, fw: 6 }); } }); // snow shaken off the nearest boughs
    }
    say(t, 0.35, 'bells'); say(t, 1.05, 'dog'); say(t, 1.5, 'carol');
  }
  function sniff(t) {
    let best = null; let bd = 26;
    for (const o of targets) { const d = Math.hypot(o.x - c.x, o.z - c.z); if (d < bd && d > 1.2) { bd = d; best = o; } }
    const dur = 2.4 + Math.min(1.6, bd * 0.07);
    for (let i = 0; i < n(6); i++) {
      const dl = 0.14 * i;
      if (best) { take(t + dl, dur + dl, { x: c.x, y: c.y + 0.5, z: c.z, vx: (best.x - c.x) / dur + 0.3 * Math.sin(i), vz: (best.z - c.z) / dur + 0.3 * Math.cos(i), vy: (best.y - c.y - 0.5) / dur + 0.12 * Math.sin(i), size: 1.02, rgb: SCENT[i % 2], fl: 0.4, fw: 7 }); }
    }
    if (best) say(t, 0.3, 'chime');
  }
  function settle(t) { // flakes gather on her back and head
    SHARED.heed = t;
    for (let i = 0; i < n(10); i++) take(t + 0.25 * i, 8, { mode: 2, x: (h(80 + i) - 0.5) * 0.3, y: 0.55 + 0.22 * h(81 + i), z: -0.2 + (h(82 + i) - 0.5) * 0.5, size: 0.4, rgb: WHITE });
  }
  function breath(t) { take(t, 1.5, { x: c.x + c.fx * 0.75, y: c.y + 0.55, z: c.z + c.fz * 0.75, vx: c.fx * 0.25, vz: c.fz * 0.25, vy: 0.22, size: 0.85, rgb: POW }); }
  function trail(t) { // the zoomies' wake: powder thrown up behind her, one glitter left hanging
    for (let i = 0; i < n(3); i++) take(t, 0.9, { x: c.x - c.fx * 0.5, y: c.y + 0.2, z: c.z - c.fz * 0.5, vx: -c.fx * 1.4 + (h(60 + i) - 0.5) * 1.6, vz: -c.fz * 1.4 + (h(61 + i) - 0.5) * 1.6, vy: 1.2 + h(62 + i), ay: -4, size: 0.85, rgb: POW });
    take(t, 1.4, { x: c.x - c.fx * 0.8, y: c.y + 0.4, z: c.z - c.fz * 0.8, size: 0.51, rgb: seq % 2 ? GOLD : ICE, fl: 0.6, fw: 13 });
  }
  const voice = { bells: () => sleighBells(audio, 7 + st.counts.meow, 0.7), dog: () => { try { if (audio && !audio.isMuted?.()) audio['ba' + 'rk']?.(); } catch { /* optional */ } }, carol: () => { carolChime(audio, 9 + st.counts.meow); }, whump: () => snowWhump(audio, st.counts.meow), chime: () => villageBell(audio, 5, 0.3) };

  /** One frame. cat { x, y, z } | null, session (pounceTime, sniffTime, idleTime, wasZooming, perched) | null, fwd { x, z } the camera's ground direction. */
  function step(dt, t, cat, session, fwd = null) {
    if (!cat) return;
    if (fwd && (fwd.x || fwd.z)) { const l = Math.hypot(fwd.x, fwd.z); c.fx = fwd.x / l; c.fz = fwd.z / l; }
    c.x = cat.x; c.z = cat.z; c.y = Number.isFinite(cat.y) ? cat.y : ground();
    while (queue.length && queue[0].at <= t) { const q = queue.shift(); { if (q.fn === 'carol') chimeClock.t = t; voice[q.fn](); } }
    const emit = motion;
    if (st.meowed) { st.meowed = false; if (ready('meow', t)) meow(t, emit); }
    if (st.landed) { st.landed = false; if (ready('land', t)) { say(t, 0.02, 'whump'); if (emit) puff(t, n(14), 1, true); } }
    if (session) {
      const pt = +session.pounceTime || 0; if (pt > 0 && st.prevPounce <= 0 && ready('pounce', t)) { say(t, 0.02, 'whump'); if (emit) puff(t, n(8), 0.7, true); } st.prevPounce = pt;
      const sn = +session.sniffTime || 0; if (sn > 0.01 && st.prevSniff <= 0.01 && ready('sniff', t) && emit) sniff(t); st.prevSniff = sn;
      const idle = +session.idleTime || 0;
      if (idle < 0.5 || session.perched) st.armed = !session.perched;
      else if (idle >= RX.still && emit) { if (st.armed && ready('sit', t)) { st.armed = false; settle(t); st.nextBreath = t + 0.6; } if (t >= st.nextBreath) { breath(t); st.nextBreath = t + 2.4; } }
      const z = !!session.wasZooming;
      if (z && !st.zoomOn && ready('zoom', t)) { st.zoomOn = true; st.zoomT = 0; st.nextTrail = t; }
      if (!z) st.zoomOn = false;
      if (st.zoomOn) { st.zoomT += dt; if (st.zoomT > 4) st.zoomOn = false; else if (t >= st.nextTrail && emit) { trail(t); st.nextTrail = t + 0.14; } }
    }
    // the dots
    const sx = -c.fz; const sz = c.fx;
    for (let i = 0; i < N; i++) {
      const p = ps[i]; const age = t - p.t0;
      if (p.t0 < 0 || age < 0 || age > p.life) { scl[i] = 0; continue; }
      let x; let y; let z;
      if (p.mode === 2) { x = c.x + sx * p.x + c.fx * -p.z; z = c.z + sz * p.x + c.fz * -p.z; y = c.y + p.y; } // on her fur, in her frame (her back is behind the way she faces)
      else { x = p.x + p.vx * age; z = p.z + p.vz * age; y = Math.max(P.snowY(x, z) + 0.04, p.y + p.vy * age + 0.5 * p.ay * age * age); }
      const env = Math.min(1, age / 0.12) * Math.min(1, (p.life - age) / (p.mode === 2 ? 1.5 : 0.5));
      const a = env * (1 - p.fl + p.fl * (0.5 + 0.5 * Math.sin(age * p.fw + i)));
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z; col[i * 4] = p.rgb[0]; col[i * 4 + 1] = p.rgb[1]; col[i * 4 + 2] = p.rgb[2]; col[i * 4 + 3] = a; scl[i] = a > 0.01 ? p.size : 0;
    }
    geo.attributes.position.needsUpdate = geo.attributes.color.needsUpdate = geo.attributes.aS.needsUpdate = true;
  }
  const off = [bus.on('tip:did', (e) => { if (e && e.id === 'call') st.meowed = true; }), bus.on('pounce:land', () => { st.landed = true; })];
  return {
    points: pts, step, state: st, ps, ripple: rip,
        boost: (x, z, t) => (motion ? windowBoost(x, z, t, rip) : 1),
    pulse: (t) => (motion && t - rip.t0 < 2.5 && t >= rip.t0 ? Math.sin(((t - rip.t0) / 2.5) * Math.PI) : 0), // the windows' glows swell as the ripple passes
    dispose() { for (const f of off) f(); scene.remove(pts); geo.dispose(); mat.dispose(); },
  };
}
