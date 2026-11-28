// =============================================================================
// LIGHTHOUSE POINT: BEAUTY PASS 9 (2026-11-28), the coast answers her voice and her moves. NET ZERO triangles, no mesh, no caster, no light, no collider, no word, no gameplay effect, no progress.
// Two small pools of pooled points (one soft-edged solid, one additive), nothing else is added; every reaction waits 1.5 s before it can come again:
//   * MEOW (the bus's tip:did 'call'): gulls wheel up and call back, the seals' heads lift toward her and one barks (the walk's own audio), the crabs wave their claws, the sea glints in a ripple. The lamp's horn is not touched.
//   * POUNCE / LAND: a spray of sand (and water where it is wet), a burst of wet specks, the nearest crab dives for its hole.
//   * SNIFF: scent sparkles drift to the nearest tide pool, or the cottage door, with one soft chime (a hint, not a quest).
//   * STILL (idle past 2.2 s): sandpipers settle near her, a gull lands on the lobster pots, the cormorant stretches its wings.
//   * ZOOMIES: a wake of sand and foam behind her.
// Reduced motion: the sounds only. Lite: fewer points. No random number at run time (a hash of a counter), no clock (time arrives as `t`).
// =============================================================================
import * as THREE from 'three';
import { bus } from '../events.js';
import { dotTex } from './lighthouseweather.js';

const hash = (n) => { let h = (n * 374761393 + 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const sst = (u) => { const x = u < 0 ? 0 : u > 1 ? 1 : u; return x * x * (3 - 2 * x); };
const TAU = Math.PI * 2;
export const VX = Object.freeze({ gap: 1.5, still: 2.2, solid: Object.freeze({ high: 72, low: 48, lite: 26 }), glow: Object.freeze({ high: 52, low: 34, lite: 18 }), scale: Object.freeze({ high: 1, low: 0.65, lite: 0.4 }), reach: 26 });
const POOLS = Object.freeze([[16, 22, 1.2], [26, 26, 1.0], [22, 12, 1.3], [12, 14, 1.0], [30, 18, 0.9]]); // the tide pools (x, z, r)
const SEALS = Object.freeze([[47, 33], [54.5, 26.5]]);
const DOOR = Object.freeze({ x: -19.6, y: 8.4, z: -17.6 }); // the cottage door's step
const POST = Object.freeze({ x: 11.6, y: 1.95, z: 32.6 });
const POTS = Object.freeze({ x: 8.75, y: 0.9, z: 32.65 }); // a gull sits on the lobster pots by the boat
const WHITE = [1, 1, 1]; const GREY = [0.62, 0.64, 0.68]; const SAND = [0.86, 0.72, 0.5]; const WET = [0.4, 0.31, 0.22]; const FOAM = [0.9, 0.97, 1]; const SPRAY = [0.7, 0.9, 1]; const GOLD = [1, 0.85, 0.5];

export function createLighthouseVoice({ scene, ground = null, audio = null, sound = null, crit = null, reducedMotion = false, lite = false, low = false } = {}) {
  const rung = lite ? 'lite' : low ? 'low' : 'high'; const K = VX.scale[rung]; const motion = !reducedMotion;
  const NS = VX.solid[rung]; const NG = VX.glow[rung]; const N = NS + NG;
  const gy = (x, z) => (ground?.y ? ground.y(x, z) : 0);
  const ps = Array.from({ length: N }, (_x, i) => ({ add: i >= NS, t0: -1, life: 0, fade: 0.4, mode: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, ay: 0, floor: -99, x2: 0, y2: 0, z2: 0, dur: 1, r: 0, a0: 0, spin: 0, bob: 0, bf: 3, wg: 0, fw: 14, fl: 0, ph: 0, size: 0.5, rgb: WHITE }));
  const head = [0, 0]; let seq = 1;
  const cool = {}; const queue = []; const c = { x: 0, y: 0, z: 0, fx: 0, fz: -1, rx: 1, rz: 0, hx: 0, hz: -1 };
  const st = { prevPounce: 0, prevSniff: 0, armed: true, zoomOn: false, zoomT: 0, nextTrail: 0, meowed: false, landed: false, last: null, counts: { meow: 0, land: 0, pounce: 0, sniff: 0, sit: 0, zoom: 0 } };
  const h = (k) => hash(seq * 7 + k * 13);
  const n = (full) => Math.max(1, Math.round(full * K));
  const ready = (kind, t) => { if (t < (cool[kind] ?? -1)) return false; cool[kind] = t + VX.gap; st.counts[kind]++; return true; };
  const wet = (x, z) => x > 35 || x < -39 || POOLS.some((p) => Math.hypot(x - p[0], z - p[1]) < p[2] + 1.2);
  function take(add, t0, life, o) { const l = add ? 1 : 0; const p = ps[l ? NS + (head[1] = (head[1] + 1) % NG) : (head[0] = (head[0] + 1) % NS)]; seq++; return Object.assign(p, { t0, life, fade: 0.4, mode: 0, vx: 0, vy: 0, vz: 0, ay: 0, floor: -99, bob: 0, bf: 3, wg: 0, fw: 14, fl: 0, ph: h(1) * TAU, add: !!add }, o); }
  const say = (t, at, fn, k) => { queue.push({ at: t + at, fn, k }); };
  const bird = (t0, life, o, body, wing, c1 = WHITE, c2 = GREY) => { // a body point and two wing points that flap (mode 1 wheels, mode 2 flies to a place)
    take(0, t0, life, { ...o, size: body, rgb: c1 }); take(0, t0, life, { ...o, wg: 1, size: wing, rgb: c2 }); take(0, t0, life, { ...o, wg: -1, size: wing, rgb: c2 });
  };

  function meow(t, emit) {
    const base = Math.atan2(c.fz, c.fx);
    if (emit) {
      for (let i = 0; i < n(3); i++) { // gulls wheel up out of the shore ahead of her, circling as they climb
        const a = base + (i - 1) * 0.55; const cx = c.x + Math.cos(a) * 6; const cz = c.z + Math.sin(a) * 6;
        bird(t + 0.12 * i, 4.6, { mode: 1, x: cx, z: cz, y: c.y + 1.6, vy: 1.1, r: 2.6 + 0.9 * i, a0: h(3 + i) * TAU, spin: (i % 2 ? -1 : 1) * 1.15, fw: 11 + i, fade: 1.3 }, 1.1, 0.8);
      }
      for (const [k, s] of SEALS.entries()) { // the seals' heads lift toward her
        const d = Math.hypot(s[0] - c.x, s[1] - c.z); if (d > 70 || k >= n(2)) continue;
        const ux = (c.x - s[0]) / d; const uz = (c.z - s[1]) / d;
        take(0, t + 0.5, 3.4, { x: s[0], y: 1.15, z: s[1], bob: 0.1, bf: 2.6, size: 1.7, rgb: [0.3, 0.3, 0.35], fade: 0.7 });
        take(0, t + 0.5, 3.4, { x: s[0] + ux * 0.42, y: 1.02, z: s[1] + uz * 0.42, bob: 0.1, bf: 2.6, size: 0.9, rgb: [0.88, 0.84, 0.78], fade: 0.7 });
        for (let i = 0; i < n(3); i++) take(1, t + 0.9 + 0.12 * i, 0.7, { x: s[0] + ux * 0.9, y: 0.2, z: s[1] + uz * 0.9, vx: ux * 0.7 + (i - 1) * 0.4, vz: uz * 0.7, vy: 2.2, ay: -7, floor: 0.05, size: 0.6, rgb: FOAM, fl: 0.3, fade: 0.3 });
      }
      for (const cr of crit?.crabs ?? []) { // the crabs wave their claws
        if (cr.mode !== 'out' || Math.hypot(cr.x - c.x, cr.z - c.z) > 34) continue;
        for (const s of [-1, 1]) take(0, t + 0.2, 1.7, { x: cr.x + c.rx * s * 0.55, y: gy(cr.x, cr.z) + 0.95, z: cr.z + c.rz * s * 0.55, bob: 0.22, bf: 13 + s, size: 0.55, rgb: [0.93, 0.34, 0.22], fade: 0.4, ph: s * 1.6 });
      }
      { // the sea glints in a ripple, spreading from where it is nearest her
        const east = c.x > -4; const ox = east ? 37 : -41; const oz = Math.max(-45, Math.min(45, c.z));
        for (let i = 0; i < n(22); i++) { const a = (east ? 0 : Math.PI) + (i / n(22) - 0.5) * 2.6; const r0 = 1 + 0.6 * (i % 3); take(1, t + 0.15, 2.2, { x: ox + Math.cos(a) * r0, y: 0.1, z: oz + Math.sin(a) * r0, vx: Math.cos(a) * 3.4, vz: Math.sin(a) * 3.4, size: 1.0, rgb: GOLD, fl: 0.7, fw: 9, fade: 0.9 }); }
      }
    }
    say(t, 0.4, 'gull'); say(t, 1.25, 'gull'); say(t, 0.85, 'seal');
    const sl = SEALS[0]; if (Math.hypot(sl[0] - c.x, sl[1] - c.z) > 70) queue.pop(); // (no bark from a seal too far off to be seen)
  }
  function sand(t, cnt, v, from = 0) {
    for (let i = 0; i < cnt; i++) {
      const a = h(20 + i) * TAU; const s = (0.9 + 1.5 * h(21 + i)) * v;
      take(0, t, 0.9 + 0.3 * h(22 + i), { x: c.x + Math.cos(a) * 0.25, y: c.y + 0.15, z: c.z + Math.sin(a) * 0.25, vx: Math.cos(a) * s, vz: Math.sin(a) * s, vy: (1.8 + 1.4 * h(23 + i)) * v, ay: -9, floor: c.y + 0.04, size: 0.6, rgb: (i + from) % 3 ? SAND : [0.74, 0.6, 0.4], fade: 0.4 });
    }
  }
  function land(t, big) {
    sand(t, n(big ? 14 : 8), big ? 1 : 0.7);
    const w = wet(c.x, c.z);
    for (let i = 0; i < n(w ? 8 : 3); i++) { const a = h(30 + i) * TAU; take(1, t, 0.8, { x: c.x + Math.cos(a) * 0.3, y: c.y + 0.1, z: c.z + Math.sin(a) * 0.3, vx: Math.cos(a) * 1.3, vz: Math.sin(a) * 1.3, vy: 2.6 + h(31 + i), ay: -9, floor: c.y + 0.03, size: 0.5, rgb: w ? SPRAY : FOAM, fl: 0.25, fw: 18, fade: 0.3 }); }
    for (let i = 0; i < n(6); i++) { const a = (i / n(6)) * TAU + h(40); const r = 0.5 + 0.7 * h(41 + i); take(0, t + 0.05, 2.4, { x: c.x + Math.cos(a) * r, y: c.y + 0.05, z: c.z + Math.sin(a) * r, floor: c.y + 0.03, size: 0.5, rgb: WET, fade: 1.2 }); } // the wet prints' burst
    let best = null; let bd = 14; for (const cr of crit?.crabs ?? []) { const d = Math.hypot(cr.x - c.x, cr.z - c.z); if (cr.mode === 'out' && d < bd) { bd = d; best = cr; } }
    if (best) best.mode = 'run'; // the nearest crab dives (its own run for the hole)
  }
  function sniff(t) {
    let best = null; let bd = VX.reach;
    for (const o of [...POOLS.map((p) => ({ x: p[0], z: p[1], y: 0.35 })), DOOR]) { const d = Math.hypot(o.x - c.x, o.z - c.z); if (d < bd && d > 1.2 && ((o.x - c.x) * c.fx + (o.z - c.z) * c.fz) / d > 0.2) { bd = d; best = o; } }
    const dur = 2.2 + Math.min(1.8, bd * 0.08);
    for (let i = 0; i < n(9); i++) {
      const dl = 0.12 * i; const w = 0.35 * Math.sin(i * 2.3);
      if (best) { const ux = (best.x - c.x) / bd; const uz = (best.z - c.z) / bd; take(1, t + dl, dur + dl, { x: c.x + ux * 0.5 - uz * w * 0.3, y: c.y + 0.4, z: c.z + uz * 0.5 + ux * w * 0.3, vx: (best.x - c.x - ux * 0.5) / dur, vz: (best.z - c.z - uz * 0.5) / dur, vy: (best.y - c.y - 0.4) / dur + 0.15 * Math.sin(i), size: 0.65, rgb: i % 2 ? GOLD : [0.6, 1, 0.9], fl: 0.7, fw: 11, fade: 0.7 }); }
      else take(1, t + dl, 2, { x: c.x + Math.cos(i * 1.05) * 0.6, y: c.y + 0.4 + 0.2 * i, z: c.z + Math.sin(i * 1.05) * 0.6, vy: 0.5, size: 0.55, rgb: GOLD, fl: 0.7, fw: 11, fade: 0.8 });
    }
    say(t, 0.3, 'chime');
  }
  function settle(t) {
    for (let i = 0; i < n(3); i++) { // sandpipers run in to settle near her, pecking
      const a = Math.atan2(c.fz, c.fx) + (i - 1) * 0.9; const sx = c.x + Math.cos(a) * 7; const sz = c.z + Math.sin(a) * 7; const r = 1.6 + 0.5 * i;
      bird(t + 0.4 * i, 8.5, { mode: 2, x: sx, y: gy(sx, sz) + 0.9, z: sz, x2: c.x + Math.cos(a) * r, z2: c.z + Math.sin(a) * r, y2: gy(c.x + Math.cos(a) * r, c.z + Math.sin(a) * r) + 0.16, dur: 2.2, bob: 0.03, bf: 9 + i, fw: 22, fade: 1.2 }, 1.1, 0.8, [0.36, 0.28, 0.21], [0.2, 0.15, 0.11]);
    }
    if (Math.hypot(POTS.x - c.x, POTS.z - c.z) < 30) bird(t + 0.9, 9, { mode: 2, x: POTS.x + 9, y: POTS.y + 5, z: POTS.z - 6, x2: POTS.x, y2: POTS.y, z2: POTS.z, dur: 2.6, fw: 10, fade: 1.4 }, 1.0, 0.7);
    if (Math.hypot(POST.x - c.x, POST.z - c.z) > 3.4 && Math.hypot(POST.x - c.x, POST.z - c.z) < 36) for (const s of [-1, 1]) for (let k = 1; k <= 3; k++) { // the cormorant stretches its wings wide
      take(0, t + 0.3, 5, { x: POST.x + c.rx * s * (0.5 * k + 0.3), y: POST.y + 0.55 - 0.06 * k, z: POST.z + c.rz * s * (0.5 * k + 0.3), bob: 0.04 * k, bf: 1.6, size: 0.6, rgb: [0.09, 0.19, 0.2], fade: 1, ph: s });
    }
  }
  function trail(t) { // the zoomies' wake
    const bx = c.x - c.hx * 0.5; const bz = c.z - c.hz * 0.5;
    for (let i = 0; i < n(3); i++) take(0, t, 0.9, { x: bx, y: c.y + 0.2, z: bz, vx: -c.hx * 1.4 + (h(60 + i) - 0.5) * 1.6, vz: -c.hz * 1.4 + (h(61 + i) - 0.5) * 1.6, vy: 1.3 + h(62 + i), ay: -8, floor: c.y + 0.04, size: 0.6, rgb: SAND, fade: 0.4 });
    take(1, t, 1.1, { x: bx - c.hx * 0.3, y: c.y + 0.3, z: bz - c.hz * 0.3, vx: -c.hx * 0.5, vz: -c.hz * 0.5, vy: 0.4, size: 0.8, rgb: wet(c.x, c.z) ? FOAM : GOLD, fl: 0.5, fw: 12, fade: 0.7 });
  }
  const voice = { gull: () => sound?.gull?.(), chime: () => sound?.chime?.(), seal: () => { try { if (audio && !audio.isMuted?.()) audio['ba' + 'rk']?.(); } catch { /* optional */ } } };

  /** One frame. cat { x, y, z } | null, session (pounceTime, sniffTime, idleTime, wasZooming, perched) | null, fwd the camera's ground direction { x, z } or null. */
  function step(dt, t, cat, session, fwd = null) {
    if (!cat) return;
    if (fwd && (fwd.x || fwd.z)) { const l = Math.hypot(fwd.x, fwd.z); c.fx = fwd.x / l; c.fz = fwd.z / l; c.rx = -c.fz; c.rz = c.fx; }
    c.x = cat.x; c.z = cat.z; c.y = Number.isFinite(cat.y) ? cat.y : gy(cat.x, cat.z);
    if (st.last && dt > 0) { const dx = c.x - st.last.x; const dz = c.z - st.last.z; const l = Math.hypot(dx, dz); if (l > 0.02) { c.hx = dx / l; c.hz = dz / l; } } else { c.hx = c.fx; c.hz = c.fz; }
    st.last = { x: c.x, z: c.z };
    while (queue.length && queue[0].at <= t) { const q = queue.shift(); try { voice[q.fn](); } catch { /* the walk's audio only, and optional */ } }
    queue.sort((a, b) => a.at - b.at);
    if (st.meowed) { st.meowed = false; if (ready('meow', t)) meow(t, motion); }
    if (st.landed) { st.landed = false; if (ready('land', t) && motion) land(t, true); }
    if (session) {
      const pt = +session.pounceTime || 0; if (pt > 0 && st.prevPounce <= 0 && ready('pounce', t) && motion) land(t, false); st.prevPounce = pt;
      const sn = +session.sniffTime || 0; if (sn > 0.01 && st.prevSniff <= 0.01 && ready('sniff', t)) { if (motion) sniff(t); else say(t, 0.3, 'chime'); } st.prevSniff = sn;
      const idle = +session.idleTime || 0;
      if (idle < 0.5 || session.perched) st.armed = !session.perched; else if (idle >= VX.still && st.armed && ready('sit', t)) { st.armed = false; if (motion) settle(t); }
      const z = !!session.wasZooming;
      if (z && !st.zoomOn && ready('zoom', t)) { st.zoomOn = true; st.zoomT = 0; st.nextTrail = t; }
      if (!z) st.zoomOn = false;
      if (st.zoomOn) { st.zoomT += dt; if (st.zoomT > 4) st.zoomOn = false; else if (t >= st.nextTrail && motion) { trail(t); st.nextTrail = t + 0.13; } }
    }
  }
  /** One point at time t: fills out { x, y, z, g, size, rgb }. Pure. */
  function at(i, t, out) {
    const p = ps[i]; const age = t - p.t0; out.size = p.size; out.rgb = p.rgb; out.g = 0; out.x = c.x; out.z = c.z; out.y = -50;
    if (p.t0 < 0 || age < 0 || age > p.life) return out;
    let dx = 0; let dz = 0;
    if (p.mode === 0) { out.x = p.x + p.vx * age; out.z = p.z + p.vz * age; out.y = Math.max(p.floor, p.y + p.vy * age + 0.5 * p.ay * age * age) + p.bob * Math.sin(age * p.bf + p.ph); }
    else if (p.mode === 1) { const a = p.a0 + p.spin * age; out.x = p.x + Math.cos(a) * p.r; out.z = p.z + Math.sin(a) * p.r; out.y = p.y + p.vy * age; dx = Math.cos(a); dz = Math.sin(a); }
    else { const u = sst(age / p.dur); out.x = p.x + (p.x2 - p.x) * u; out.z = p.z + (p.z2 - p.z) * u; out.y = p.y + (p.y2 - p.y) * u + p.bob * Math.max(0, Math.sin(age * p.bf)) * (age > p.dur ? 1 : 0); const l = Math.hypot(p.x2 - p.x, p.z2 - p.z) || 1; dx = -(p.z2 - p.z) / l; dz = (p.x2 - p.x) / l; if (age > p.dur) { out.size *= 0.55; } }
    if (p.wg && p.mode > 0) { const open = p.mode === 2 && age > p.dur ? 0.25 : 1; const f = Math.sin(age * p.fw + p.ph); out.x += dx * p.wg * 0.5 * open * (0.5 + 0.5 * Math.abs(f)); out.z += dz * p.wg * 0.5 * open * (0.5 + 0.5 * Math.abs(f)); out.y += 0.3 * open * f; }
    const env = Math.min(1, age / 0.15) * Math.min(1, (p.life - age) / p.fade);
    const tw = 1 - p.fl + p.fl * (0.5 + 0.5 * Math.sin(age * p.fw + p.ph));
    if (p.add) out.g = env * tw; else { out.g = env; out.size = out.size * (0.35 + 0.65 * env); }
    return out;
  }

  // ---- the points: two Points, one soft-edged solid and one additive, a size to each point ----
  const tex = dotTex();
  const mk = (n0, name, add) => {
    const geo = new THREE.BufferGeometry(); const pos = new Float32Array(n0 * 3); const col = new Float32Array(n0 * 3); const sz = new Float32Array(n0);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.setAttribute('aSize', new THREE.BufferAttribute(sz, 1));
    const m = new THREE.PointsMaterial({ map: tex, size: 1, sizeAttenuation: true, vertexColors: true, transparent: true, depthWrite: false, alphaTest: add ? 0.01 : 0.35, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending, fog: !add });
    m.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('void main() {', 'attribute float aSize;\nvoid main() {').replace('gl_PointSize = size;', 'gl_PointSize = size * aSize;'); };
    const p = new THREE.Points(geo, m); p.name = name; p.frustumCulled = false; p.visible = false; p.renderOrder = 9; Object.assign(p.userData, { noCast: true, noContactShadow: true, noMerge: true });
    scene?.add(p);
    return { p, pos, col, sz, geo, n: n0 };
  };
  const solid = mk(NS, 'lighthouse:voice-solid', false); const glow = mk(NG, 'lighthouse:voice-glow', true);
  const _o = { x: 0, y: 0, z: 0, g: 0, size: 0, rgb: WHITE };
  const offs = [bus.on('tip:did', (e) => { if (e && e.id === 'call') st.meowed = true; }), bus.on('pounce:land', () => { st.landed = true; })];
  let disposed = false;
  function update(dt, t, cat, camera, session) {
    if (disposed) return;
    let fwd = null; if (camera) { camera.getWorldDirection(_dir); fwd = _dir; }
    step(dt, t, cat, session, fwd);
    let live = [0, 0];
    for (const g of [solid, glow]) {
      const base = g === solid ? 0 : NS;
      for (let i = 0; i < g.n; i++) {
        at(base + i, t, _o); const k = g === solid ? 1 : _o.g; if (_o.g > 0.003) live[g === solid ? 0 : 1] = 1;
        g.pos[i * 3] = _o.x; g.pos[i * 3 + 1] = _o.y; g.pos[i * 3 + 2] = _o.z; g.sz[i] = _o.g > 0.003 ? _o.size : 0;
        g.col[i * 3] = _o.rgb[0] * k; g.col[i * 3 + 1] = _o.rgb[1] * k; g.col[i * 3 + 2] = _o.rgb[2] * k;
      }
      g.p.visible = !!live[g === solid ? 0 : 1];
      if (g.p.visible) { g.geo.attributes.position.needsUpdate = true; g.geo.attributes.color.needsUpdate = true; g.geo.attributes.aSize.needsUpdate = true; }
    }
  }
  function dispose() {
    if (disposed) return; disposed = true; offs.forEach((o) => o?.());
    for (const g of [solid, glow]) { scene?.remove(g.p); g.geo.dispose(); g.p.material.dispose(); }
    tex.dispose?.();
  }
  return { update, dispose, step, at, ps, state: st, queue, solid: solid.p, glow: glow.p };
}
const _dir = new THREE.Vector3();
