// =============================================================================
// THE CRYSTAL CAVE: BEAUTY PASS 9 (2026-11-28), the cave answers her voice and her moves. NET ZERO triangles, no mesh, no caster, no light, no collider, no word, no gameplay effect, no progress.
// One pooled Points (`crystal:voice`) and a brief lift of the decor shader's resonance weight (never past the mood's own top). Each kind of answer waits 1.5 s before it can come again:
//   * MEOW (the bus's tip:did 'call'): a rolling echo. The crystals about her light one after another outward from her (the nearest first) and each sings a note of a chord, lower
//     the farther it is; the cave slips into 'resonance' for a few seconds; startled glow-moths scatter from the crystals and regroup.
//   * POUNCE / LAND (the bus's pounce:land, session.pounceTime): a ring of light races across the floor and crystal dust falls slowly from the ceiling.
//   * SNIFF (session.sniffTime): scent-sparkles drift to the nearest crystal or the sleeping stone cat in the way she faces (a hint, not a quest) with one soft chime.
//   * STILL (session.idleTime past 2.2 s): the nearest crystal leans its glow toward her and a few moths come to land on her.
//   * ZOOMIES (session.wasZooming): a streak of light left on the floor behind her, with glitter.
// Reduced motion: the sounds only. Lite: fewer points. Floor light is dimmed over the Heart's and the Gold bed's already bright floors (pass 7). Draws no random number (a hash of a counter)
// and reads no clock (time arrives as `t`). Audio is the game's own audio object and every call is optional-safe.
// =============================================================================
import * as THREE from 'three';
import { dotTexture } from './crystalparts.js';
import { planBeauty2, ZONE_RGB } from './crystaldecor.js';
import { crystalY } from './crystalplan.js';
import { STATUE } from './crystaltalesplan.js';
import { humNote } from './crystallife.js';
import { bus } from '../events.js';

const hash = (n) => { let h = (n * 374761393 + 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const sstep = (u) => { const x = u < 0 ? 0 : u > 1 ? 1 : u; return x * x * (3 - 2 * x); };
const TAU = Math.PI * 2;

export const CV = Object.freeze({ gap: 1.5, still: 2.2, pool: Object.freeze({ high: 64, low: 40, lite: 20 }), scale: Object.freeze({ high: 1, low: 0.65, lite: 0.35 }), reach: 16, speed: 14, lift: 0.8, chord: Object.freeze([2.5, 2, 1.5, 1.25, 1]) });
const HEART = [22, -22]; const BED = [-12.5, -19.5];
/** 1 on an ordinary floor, down to about 0.45 where the Heart's or the gold bed's floor is already bright (pass 7's lesson: no light piled on it). Pure. */
export const floorCalm = (x, z) => 1 - 0.45 * sstep((8 - Math.hypot(x - HEART[0], z - HEART[1])) / 6.5) - 0.35 * sstep((7 - Math.hypot(x - BED[0], z - BED[1])) / 5.5);
const WARM = [1, 0.85, 0.5]; const PALE = [0.8, 0.9, 1];

/** The resonance weight the decor shader should use: the mood's own x lifted by a meow's envelope, never past 1. Pure. */
export const liftX = (x, env) => Math.min(1, x + env * CV.lift * (1 - x));
/** A meow's envelope s seconds after it: up in 0.35 s, held, down by 3.2 s. Pure. */
export const meowEnv = (s) => (s < 0 ? 0 : sstep(s / 0.35) * (1 - sstep((s - 1.2) / 2)));

export const voicePoints = (rung) => Array.from({ length: CV.pool[rung] }, (_x, i) => ({ kind: 'cv', i }));

export function createCrystalVoice({ scene, decor = null, audio = null, tier = null, reducedMotion = false } = {}) {
  const rung = tier && tier.rung >= 5 ? 'lite' : tier && (tier.name === 'low' || tier.shadows === false || (tier.rung ?? 0) >= 3) ? 'low' : 'high';
  const N = CV.pool[rung]; const K = CV.scale[rung]; const U = decor?.uniforms;
  const sites = planBeauty2('high').hero.map((h) => ({ x: h.x, z: h.z, s: h.s, hue: h.hue, top: crystalY(h.x, h.z) + 1.6 + h.s * 1.3 }));
  const stone = { x: STATUE.x, z: STATUE.z, s: 1, hue: 'amber', top: crystalY(STATUE.x, STATUE.z) + 1.5 };
  const ps = Array.from({ length: N }, () => ({ t0: -1, life: 0, size: 0.4, rgb: PALE }));
  let head = 0; let seq = 1; const cool = {}; const queue = []; const c = { x: 0, y: 0, z: 0, fa: 0 };
  const st = { meowedAt: -99, meowed: false, landed: false, prevPounce: 0, prevSniff: 0, armedSit: true, zoomOn: false, zoomT: 0, nextTrail: 0, lean: null, counts: { meow: 0, land: 0, pounce: 0, sniff: 0, sit: 0, zoom: 0 } };
  const h = (k) => hash(seq * 7 + k * 13);
  const ready = (kind, t) => { if (t < (cool[kind] ?? -1)) return false; cool[kind] = t + CV.gap; st.counts[kind]++; return true; };
  const n = (full) => Math.max(1, Math.round(full * K));
  function take(t0, life, o) { const p = ps[head]; head = (head + 1) % N; seq++; return Object.assign(p, { t0, life, mode: 0, vx: 0, vy: 0, vz: 0, ay: 0, gy: -1, floor: -99, spin: 0, ph: h(1) * TAU, size: 0.4, rgb: PALE }, o); }
  const say = (t, at, ratio, stoneIx, level) => { if (audio) queue.push({ at: t + at, ratio, stoneIx, level }); };
  const rgbOf = (hue) => ZONE_RGB[hue] ?? WARM;
  const lit = (rgb) => [rgb[0] * 0.5 + 0.5, rgb[1] * 0.5 + 0.5, rgb[2] * 0.5 + 0.5];

  function meow(t, emit) {
    const near = sites.map((q) => ({ q, d: Math.hypot(q.x - c.x, q.z - c.z) })).filter((o) => o.d < 60).sort((a, b) => a.d - b.d).slice(0, 8);
    near.forEach((o, i) => { // the echo rolls outward: each crystal answers when the wave reaches it, lower the farther it is
      const delay = 0.12 + o.d / CV.speed; const ratio = CV.chord[Math.min(CV.chord.length - 1, Math.floor(o.d / 5))];
      if (i < 5) say(t, delay, ratio, i % 3, 0.5);
      if (emit && i < n(8)) take(t + delay, 1.9, { x: o.q.x, y: o.q.top, z: o.q.z, size: 1.1 + o.q.s * 0.25, rgb: lit(rgbOf(o.q.hue)), g: 0.75, fl: 0.18, fw: 9, fade: 1.2 });
    });
    if (!emit) return;
    for (let i = 0; i < n(6); i++) take(t + 0.3 + 0.08 * i, 3.4, { mode: 2, a0: h(70 + i) * TAU, spin: 1.2 * (i % 2 ? 1 : -1), r0: 1, r1: 5, y0: c.y + 1.2, y1: c.y + 2.2 + 0.3 * i, size: 0.55, rgb: [1, 0.9, 0.55], fw: 14, fade: 0.8 });
  }
  const delay0 = (d) => d / CV.speed;
  function ring(t, cnt, spd, life) { // a ring of light that races across the floor
    for (let i = 0; i < cnt; i++) {
      const a = (i / cnt) * TAU + 0.2; const x = c.x + Math.cos(a) * 0.4; const z = c.z + Math.sin(a) * 0.4;
      take(t, life, { x, y: 0, z, gy: 0.35, vx: Math.cos(a) * spd, vz: Math.sin(a) * spd, size: 0.6, rgb: i % 2 ? WARM : PALE, g: 0.7, fl: 0.2, fw: 18, fade: life * 0.6 });
    }
  }
  function land(t) {
    ring(t, n(14), 7, 1.1);
    for (let i = 0; i < n(10); i++) { // crystal dust sifts down from the ceiling
      const a = h(20 + i) * TAU; const r = 0.5 + 3.2 * h(21 + i);
      take(t + 0.08 * i, 3.6, { x: c.x + Math.cos(a) * r, y: c.y + 4.4 + 1.6 * h(22 + i), z: c.z + Math.sin(a) * r, vx: 0.12 * Math.sin(i), vz: 0.1 * Math.cos(i * 2), vy: -0.95, floor: c.y + 0.05, size: 0.3, rgb: i % 3 ? PALE : WARM, g: 0.85, fl: 0.5, fw: 12, fade: 0.9 });
    }
  }
  function sniff(t) {
    let best = null; let bd = 24;
    for (const o of [...sites, stone]) { const d = Math.hypot(o.x - c.x, o.z - c.z); if (d > 1.2 && d < bd && ((o.x - c.x) * Math.cos(c.fa) + (o.z - c.z) * Math.sin(c.fa)) / d > 0.2) { bd = d; best = o; } }
    const dur = 2.2 + Math.min(1.8, bd * 0.08);
    for (let i = 0; i < n(6); i++) {
      const dl = 0.12 * i; const wob = 0.35 * Math.sin(i * 2.3);
      if (!best) break;
      { const ux = (best.x - c.x) / bd; const uz = (best.z - c.z) / bd; take(t + dl, dur + dl, { x: c.x + ux * 0.5 - uz * wob * 0.3, y: c.y + 0.4, z: c.z + uz * 0.5 + ux * wob * 0.3, vx: (best.x - c.x - ux * 0.5) / dur, vz: (best.z - c.z - uz * 0.5) / dur, vy: (best.top - 0.6 - c.y) / dur + 0.15 * Math.sin(i), size: 0.36, rgb: i % 2 ? WARM : [0.8, 0.6, 1], g: 0.9, fl: 0.7, fw: 11, fade: 0.7 }); }
    }
    say(t, 0.3, 3, 1, 0.35);
  }
  function sit(t) {
    let bi = null; let bd = 8; for (const o of sites) { const d = Math.hypot(o.x - c.x, o.z - c.z); if (d < bd) { bd = d; bi = o; } }
    if (bi) { const d = Math.max(0.1, bd); const k = bi.s * 0.35 + 0.35; st.lean = true; take(t, 12, { x: bi.x + ((c.x - bi.x) / d) * k, y: bi.top - 0.9, z: bi.z + ((c.z - bi.z) / d) * k, size: 0.9, rgb: lit(rgbOf(bi.hue)), fl: 0.15, fw: 2.5, fade: 1.6 }); }
    for (let i = 0; i < n(3); i++) take(t + 0.5 * i, 9, { mode: 1, a0: h(50 + i) * TAU, spin: 0.35, r0: 4 + h(51 + i), r1: 0.34 + 0.12 * i, y0: c.y + 2 + 0.4 * i, y1: c.y + 0.75 + 0.3 * i, dur: 2.6 + 0.3 * i, size: 0.5, rgb: [1, 0.9, 0.55], g: 0.7, fl: 0.5, fw: 6 + i, fade: 1.2 });
  }
  function trail(t) { // the zoomies' streak on the floor behind her, and glitter
    take(t, 1.0, { x: c.x, y: 0, z: c.z, gy: 0.3, size: 0.62, rgb: WARM, g: 0.75, fl: 0.15, fw: 20, fade: 0.8 });
    take(t, 1.2, { x: c.x, y: c.y + 0.3, z: c.z, vx: 0.4 * Math.sin(seq), vz: 0.4 * Math.cos(seq), vy: 0.7, ay: -0.4, size: 0.26, rgb: PALE, g: 0.9, fl: 0.6, fw: 22, fade: 0.8 });
  }

  /** One frame. cat = { x, y?, z }, session = the walk's session or null (pounceTime, sniffTime, idleTime, wasZooming, perched), fwd = the camera's forward direction or null. */
  function step(dt, t, cat, session, fwd = null) {
    if (!cat) return;
    if (fwd && (fwd.x || fwd.z)) c.fa = Math.atan2(fwd.z, fwd.x);
    c.x = cat.x; c.z = cat.z; c.y = Number.isFinite(cat.y) ? cat.y : crystalY(cat.x, cat.z);
    while (queue.length && queue[0].at <= t) { const q = queue.shift(); try { humNote(audio, q.stoneIx, q.ratio, 0, { level: q.level }); } catch { /* the walk's audio only, and optional */ } }
    queue.sort((a, b) => a.at - b.at);
    const emit = !reducedMotion;
    if (st.meowed) { st.meowed = false; if (ready('meow', t)) { st.meowedAt = t; meow(t, emit); } }
    if (st.landed) { st.landed = false; if (ready('land', t) && emit) land(t); }
    if (session) {
      const pt = +session.pounceTime || 0; if (pt > 0 && st.prevPounce <= 0 && ready('pounce', t) && emit) ring(t, n(6), 4.5, 0.8); st.prevPounce = pt;
      const sn = +session.sniffTime || 0; if (sn > 0.01 && st.prevSniff <= 0.01 && ready('sniff', t)) { if (emit) sniff(t); else say(t, 0.3, 3, 1, 0.35); } st.prevSniff = sn;
      const idle = +session.idleTime || 0;
      if (idle < 0.5 || session.perched) { st.armedSit = !session.perched; } else if (idle >= CV.still && st.armedSit && ready('sit', t)) { st.armedSit = false; if (emit) sit(t); }
      const z = !!session.wasZooming;
      if (z && !st.zoomOn && ready('zoom', t)) { st.zoomOn = true; st.zoomT = 0; st.nextTrail = t; }
      if (!z) st.zoomOn = false;
      if (st.zoomOn) { st.zoomT += dt; if (st.zoomT > 4) st.zoomOn = false; else if (t >= st.nextTrail && emit) { trail(t); st.nextTrail = t + 0.12; } }
    }
    if (U && emit) { const e = meowEnv(t - st.meowedAt); if (e > 0.001) U.mood.value.x = liftX(U.mood.value.x, e); } // the resonance the mood module just set, lifted for a moment
  }
  /** One point at time t for the cat c: fills out { x, y, z, g, size, rgb }. Pure. */
  function at(i, t, out) {
    const p = ps[i]; const age = t - p.t0; out.size = p.size; out.rgb = p.rgb; out.g = 0; out.x = c.x; out.z = c.z; out.y = -50;
    if (p.t0 < 0 || age < 0 || age > p.life) return out;
    if (p.mode === 0) { out.x = p.x + p.vx * age; out.z = p.z + p.vz * age; out.y = p.gy >= 0 ? crystalY(out.x, out.z) + p.gy : Math.max(p.floor, p.y + p.vy * age + 0.5 * p.ay * age * age); }
    else { const u = p.mode > 1 ? Math.sin(Math.min(1, age / p.life) * Math.PI) : sstep(age / p.dur); const r = p.r0 + (p.r1 - p.r0) * u; const a = p.a0 + p.spin * age; out.x = c.x + Math.cos(a) * r; out.z = c.z + Math.sin(a) * r; out.y = p.y0 + (p.y1 - p.y0) * u; }
    const env = Math.min(1, age / 0.15) * Math.min(1, (p.life - age) / p.fade);
    out.g = p.g * floorCalm(out.x, out.z) * env * (1 - p.fl + p.fl * (0.5 + 0.5 * Math.sin(age * p.fw + p.ph)));
    return out;
  }

  // the Points: one draw, its own, additive, never blocks anything (frustumCulled off, no shadow, no merge)
  const pos = new Float32Array(N * 3).fill(-999); const col = new Float32Array(N * 3);
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const points = new THREE.Points(geo, new THREE.PointsMaterial({ map: dotTexture(), alphaTest: 0.02, size: 0.6, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  points.name = 'crystal:voice'; points.frustumCulled = false; points.visible = false; Object.assign(points.userData, { noCast: true, noContactShadow: true, noMerge: true });
  if (scene && !reducedMotion) scene.add(points);
  const _o = { x: 0, y: 0, z: 0, g: 0, size: 0.4, rgb: PALE }; const _f = { x: 0, y: 0, z: 1 };
  const off = [bus.on('tip:did', (e) => { if (e && e.id === 'call') st.meowed = true; }), bus.on('pounce:land', () => { st.landed = true; })];
  return {
    points, state: st, step, at, ps, queue,
    meow() { st.meowed = true; }, land() { st.landed = true; },
    update(dt, t, catPos, camera, session) {
      if (!catPos) return;
      let fw = null; try { if (camera?.getWorldDirection) { camera.getWorldDirection(_f); fw = _f; } } catch { /* a stand-in camera */ }
      step(dt, t, catPos, session, fw);
      if (reducedMotion) return;
      let any = false;
      for (let i = 0; i < N; i++) {
        at(i, t, _o); pos[i * 3] = _o.x; pos[i * 3 + 1] = _o.y; pos[i * 3 + 2] = _o.z; const g = _o.g; col[i * 3] = _o.rgb[0] * g; col[i * 3 + 1] = _o.rgb[1] * g; col[i * 3 + 2] = _o.rgb[2] * g; if (g > 0.001) any = true;
      }
      points.visible = any; geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true;
    },
    dispose() { for (const o of off) { try { o?.(); } catch { /* gone */ } } scene?.remove(points); geo.dispose(); points.material.dispose(); },
  };
}
