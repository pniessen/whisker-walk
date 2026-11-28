// =============================================================================
// THE GREENHOUSE ANSWERS HER (beauty pass 8, 2026-11-28): her voice and her moves set small things going. Net zero triangles, no mesh, no
// caster, no light, no collider, no word, no gameplay effect, no progress: ONE pooled THREE.Points (a canvas dot) and, on the game's own
// audio object only, a few soft tones. Each kind waits 1.5 s before it can come again.
//   * MEOW (the bus's tip:did 'call'): bees buzz up and circle her, pollen is shed from the nearest blooms, the hummingbird zips across,
//     wind chimes tinkle, a songbird answers.
//   * POUNCE / LAND (the bus's pounce:land): pots shiver (a puff off the near ones), petals and leaves drop, droplets
//     scatter from the near leaves.
//   * SNIFF (session.sniffTime): scent sparkles drift to the nearest bloom she faces (a hint only), one soft chime, the bloom glows a while.
//   * STILL (session.idleTime past 2.2 s): butterflies come and land on her, and the sleepy cat in her bed yawns.
//   * ZOOMIES (session.wasZooming): a wake of petals.
// Reduced motion: the sounds only. Lite: fewer points. No random number and no clock of its own (a hash of a counter; time is summed dt).
// =============================================================================
import * as THREE from 'three';
import { hash01 } from './warehouselook.js';
import { GH_STORY_SALT } from './greenhousestory.js';
import * as P from './greenhouseplan.js';
import { dotSprite } from './greenhouseweather.js';
import { bus } from '../events.js';
import { voiceFree } from './greenhousebudget.js';

const SALT = GH_STORY_SALT + 90;
const TAU = Math.PI * 2;
const GAP = 1.5; // s between two of one kind
export const STILL_AT = 2.2; // s of standing still before the butterflies come
export const REACH = 26; // m a sniff can find a bloom
const sst = (u) => { const x = u < 0 ? 0 : u > 1 ? 1 : u; return x * x * (3 - 2 * x); };
const BEE = [[1, 0.78, 0.1], [0.95, 0.65, 0.05]], PET = [[1, 0.35, 0.55], [1, 0.6, 0.2], [0.75, 0.3, 1], [1, 0.85, 0.3]], LEAF = [[0.4, 0.85, 0.25], [0.7, 0.9, 0.3]], WING = [[1, 0.5, 0.1], [0.4, 0.65, 1], [1, 0.9, 0.3], [0.9, 0.35, 0.9]];
const WET = [0.7, 0.9, 1], GOLD = [1, 0.8, 0.25];
// blooms a sniff can find (x, z, y of the flower): the hibiscus, the catnip beds, the kitchen bed, the orchid benches
export const BLOOMS = Object.freeze([
  ...P.HIBISCUS_SPOTS.map((p) => ({ x: p[0], z: p[1], y: 1.5 })),
  ...P.CATNIP_BEDS.map((b) => ({ x: b.x, z: b.z, y: 0.55 })), { x: P.KITCHEN_BED.x, z: P.KITCHEN_BED.z, y: 0.6 },
  ...P.ORCHID_BENCHES.map((b) => ({ x: b.x, z: b.z, y: b.h + 0.4 })),
].map((b) => Object.freeze(b)));

export function createVoice({ scene, audio = null, reducedMotion = false, lite = false, yawn = null } = {}) {
  const N = lite ? 18 : 44;
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 4), size = new Float32Array(N);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  const sprite = dotSprite();
  const mat = new THREE.PointsMaterial({ size: 3, map: sprite, vertexColors: true, transparent: true, depthWrite: false, fog: false, sizeAttenuation: true });
  mat.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aSize;').replace('gl_PointSize = size;', 'gl_PointSize = size * aSize;'); };
  mat.customProgramCacheKey = () => 'greenhouse-voice-v1';
  const points = new THREE.Points(geo, mat);
  points.name = 'greenhouse:voice';
  points.frustumCulled = false;
  Object.assign(points.userData, { noCast: true, noContactShadow: true, noMerge: true });
  points.castShadow = false;
  points.visible = false;
  scene?.add(points);

  const ps = Array.from({ length: N }, () => ({ t0: -1, life: 0 }));
  const cat = { x: 0, y: 0, z: 0, fa: 0 }, st = { counts: { meow: 0, land: 0, sniff: 0, sit: 0, zoom: 0 }, meowed: false, landed: false, prevSniff: 0, armed: true, zoom: false, zoomT: 0, nextTrail: 0 };
  const cool = {};
  let clock = 0, head = 0, seq = 1, disposed = false;
  const h = (k) => hash01(seq, k, SALT);
  const ready = (k) => { if (clock < (cool[k] ?? -1)) return false; cool[k] = clock + GAP; st.counts[k]++; return true; };
  const take = (life, o) => { const p = ps[head]; head = (head + 1) % N; seq++; return Object.assign(p, { t0: clock, life, mode: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, ay: 0, floor: -9, fade: 0.5, size: 0.14, rgb: GOLD, a0: 0, spin: 0, r0: 0, r1: 0, y0: 0, y1: 0, dur: 1, bob: 0, g: 0.9, fl: 0, fw: 10, ph: h(1) * TAU, delay: 0 }, o); };

  // sound: the game's own audio object, only while it is unmuted, a soft sine or two through the master
  const tone = (f, at, len, gain) => {
    try {
      if (!audio || audio.isMuted?.() !== false || !voiceFree(audio, at + len)) return;
      const ac = audio.getContext?.(); if (!ac || ac.state === 'closed' || ac.state === 'suspended') return;
      const t = ac.currentTime + at, o = ac.createOscillator(), g = ac.createGain();
      o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 1.18, t + len * 0.7);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      o.connect(g); g.connect(audio.getMaster?.() ?? ac.destination); o.start(t); o.stop(t + len + 0.03);
    } catch { /* sound is optional */ }
  };
  const chimes = (k) => { for (let i = 0; i < 3; i++) tone(1400 + 330 * ((k + i * 2) % 4), 0.5 + 0.17 * i, 0.9, 0.007); };
  const songbird = () => { tone(2100, 1.1, 0.16, 0.009); tone(2600, 1.3, 0.2, 0.009); };

  const near = (o, r) => Math.hypot(o.x - cat.x, o.z - cat.z) < r;
  const meow = () => {
    if (!reducedMotion) {
      for (let i = 0; i < 6; i++) take(4.2, { mode: 1, a0: cat.fa + i * 1.05, spin: (i % 2 ? 1.7 : -1.5), r0: 5 + h(2 + i), r1: 1.3 + 0.5 * h(3 + i), y0: cat.y + 1.9, y1: cat.y + 0.8 + 0.5 * h(4 + i), dur: 1.6, size: 0.22, rgb: BEE[i % 2], g: 0.95, fl: 0.35, fw: 30, delay: 0.1 * i });
      let c = 0;
      for (const b of BLOOMS) if (c < 3 && near(b, 14)) { c++; for (let j = 0; j < 2; j++) take(2.4, { x: b.x + 0.2 * (j - 0.5), y: b.y + 0.15, z: b.z, vx: 0.2 * Math.sin(j + seq), vz: 0.15, vy: -0.28, floor: 0.05, size: 0.12, rgb: GOLD, delay: 0.25 + 0.18 * j }); }
      const a = cat.fa + 1.2; // the hummingbird zips across, green and quick, in front of her
      take(0.7, { x: cat.x + Math.cos(a) * 7, y: cat.y + 1.6, z: cat.z + Math.sin(a) * 7, vx: -Math.cos(a) * 14, vz: -Math.sin(a) * 14, vy: 0.2, size: 0.2, rgb: [0.2, 1, 0.55], g: 1, fade: 0.2, delay: 0.5 });
    }
    chimes(st.counts.meow); songbird();
  };
  const land = () => {
    if (reducedMotion) return;
    for (let i = 0; i < 7; i++) { const a = h(10 + i) * TAU, r = 0.3 + 1.3 * h(11 + i); take(3.2, { x: cat.x + Math.cos(a) * r, y: cat.y + 2.4 + h(12 + i), z: cat.z + Math.sin(a) * r, vx: 0.3 * Math.sin(i), vz: 0.2 * Math.cos(i * 2), vy: -0.5, floor: cat.y + 0.04, size: 0.2, rgb: i % 3 ? PET[i % 4] : LEAF[i % 2], fl: 0.35, fw: 4, delay: 0.1 + 0.07 * i }); }
    for (let i = 0; i < 6; i++) { const a = h(20 + i) * TAU; take(0.8, { x: cat.x + Math.cos(a) * 0.5, y: cat.y + 0.9, z: cat.z + Math.sin(a) * 0.5, vx: Math.cos(a) * 1.3, vz: Math.sin(a) * 1.3, vy: 1.6, ay: -9, floor: cat.y + 0.03, size: 0.1, rgb: WET, g: 1, delay: 0.06 }); }
    let c = 0; for (const p of P.ALL_POT_SPOTS) { if (c < 4 && Math.hypot(p.x - cat.x, p.z - cat.z) < 6) { c++; take(0.9, { x: p.x, y: 0.5, z: p.z, vx: 0.4 * Math.sin(c), vz: 0.4 * Math.cos(c), vy: 0.5, ay: -1, floor: 0.1, size: 0.26, rgb: [0.85, 0.68, 0.5], g: 0.7, fade: 0.5, delay: 0.05 }); } }
  };
  const sniff = () => {
    let best = null, bd = REACH;
    for (const b of BLOOMS) { const d = Math.hypot(b.x - cat.x, b.z - cat.z); if (d < bd && d > 1.2 && ((b.x - cat.x) * Math.cos(cat.fa) + (b.z - cat.z) * Math.sin(cat.fa)) / d > 0.2) { bd = d; best = b; } }
    const dur = 2 + Math.min(1.6, bd * 0.08);
    if (!reducedMotion) for (let i = 0; i < 6; i++) {
      const dl = 0.12 * i;
      { if (!best) break; const ux = (best.x - cat.x) / bd, uz = (best.z - cat.z) / bd, w = 0.3 * Math.sin(i * 2.3); take(dur + dl, { x: cat.x + ux * 0.5 - uz * w, y: cat.y + 0.4, z: cat.z + uz * 0.5 + ux * w, vx: (best.x - cat.x - ux * 0.5) / dur, vz: (best.z - cat.z - uz * 0.5) / dur, vy: (best.y - cat.y - 0.4) / dur, size: 0.17, rgb: i % 2 ? GOLD : [1, 0.45, 0.8], g: 1, fl: 0.6, fw: 11, delay: dl }); }
    }
    if (best && !reducedMotion) { take(dur + 1.5, { x: best.x, y: best.y + 0.1, z: best.z, size: 1.5, rgb: [1, 0.75, 0.4], g: 0.6, delay: dur * 0.7 }); }
    tone(1760, 0.3, 1.1, 0.008); tone(2217, 0.55, 1, 0.006);
  };
  const sit = () => {
    if (reducedMotion) return;
    for (let i = 0; i < 3; i++) take(8.5, { mode: 1, a0: h(30 + i) * TAU, spin: 0.4, r0: 4 + h(31 + i), r1: 0.3 + 0.12 * i, y0: cat.y + 2 + 0.4 * i, y1: cat.y + 0.75 + 0.3 * i, dur: 2.6 + 0.3 * i, size: 0.3, rgb: WING[(i + st.counts.sit) % 4], g: 0.95, fl: 0.6, fw: 6 + i, delay: 0.5 * i });
    yawn?.();
  };
  const trail = () => { take(1.6, { x: cat.x, y: cat.y + 0.4, z: cat.z, vx: 0.4 * Math.sin(seq), vz: 0.4 * Math.cos(seq), vy: 0.5, ay: -0.6, floor: cat.y + 0.04, size: 0.2, rgb: PET[seq % 4], fl: 0.3, fw: 7 }); };

  const offs = [bus.on('tip:did', (e) => { if (e && e.id === 'call') st.meowed = true; }), bus.on('pounce:land', () => { st.landed = true; })];

  return {
    points, state: st, ps, get live() { return points.visible; },
    meow() { st.meowed = true; }, land() { st.landed = true; },
    /** dt, the clock, her place { x, y, z }, the walk's session (pounceTime, sniffTime, idleTime, wasZooming, perched) or null, the camera's place (for the way she looks) */
    update(dt, t, c, session = null, camPos = null) {
      void t;
      if (disposed || !c) return;
      clock += dt > 0 ? dt : 0;
      cat.x = c.x; cat.z = c.z; cat.y = Number.isFinite(c.y) ? c.y : 0;
      if (camPos && (c.x !== camPos.x || c.z !== camPos.z)) cat.fa = Math.atan2(c.z - camPos.z, c.x - camPos.x);
      if (st.meowed) { st.meowed = false; if (ready('meow')) meow(); }
      if (st.landed) { st.landed = false; if (ready('land')) land(); }
      if (session) {
        const sn = +session.sniffTime || 0; if (sn > 0.01 && st.prevSniff <= 0.01 && ready('sniff')) sniff(); st.prevSniff = sn;
        const idle = +session.idleTime || 0;
        if (idle < 0.5 || session.perched) st.armed = !session.perched; else if (idle >= STILL_AT && st.armed && ready('sit')) { st.armed = false; sit(); }
        const z = !!session.wasZooming;
        if (z && !st.zoom && ready('zoom')) { st.zoom = true; st.zoomT = 0; st.nextTrail = clock; }
        if (!z) st.zoom = false;
        if (st.zoom) { st.zoomT += dt > 0 ? dt : 0; if (st.zoomT > 4) st.zoom = false; else if (clock >= st.nextTrail && !reducedMotion) { trail(); st.nextTrail = clock + 0.14; } }
      }
      let live = false;
      for (let i = 0; i < N; i++) {
        const p = ps[i], age = clock - p.t0 - (p.delay || 0), j = i * 3, k = i * 4;
        if (p.t0 < 0 || age < 0 || age > p.life) { col[k + 3] = 0; size[i] = 0; continue; }
        let x, y, z;
        if (p.mode === 0) { x = p.x + p.vx * age; z = p.z + p.vz * age; y = Math.max(p.floor, p.y + p.vy * age + 0.5 * p.ay * age * age); }
        else { const u = sst(age / p.dur), r = p.r0 + (p.r1 - p.r0) * u, a = p.a0 + p.spin * age; x = cat.x + Math.cos(a) * r; z = cat.z + Math.sin(a) * r; y = p.y0 + (p.y1 - p.y0) * u + p.bob * Math.sin(age * 3 + p.ph); }
        const env = Math.min(1, age / 0.15) * Math.min(1, (p.life - age) / p.fade);
        pos[j] = x; pos[j + 1] = y; pos[j + 2] = z; size[i] = p.size;
        col[k] = p.rgb[0] * p.rgb[0]; col[k + 1] = p.rgb[1] * p.rgb[1]; col[k + 2] = p.rgb[2] * p.rgb[2]; col[k + 3] = Math.max(0, p.g * env * 0.9 * (1 - p.fl + p.fl * (0.5 + 0.5 * Math.sin(age * p.fw + p.ph))));
        live = true;
      }
      points.visible = live;
      if (live) for (const a of ['position', 'color', 'aSize']) geo.attributes[a].needsUpdate = true;
    },
    dispose() { if (disposed) return; disposed = true; offs.forEach((f) => f()); scene?.remove(points); geo.dispose(); mat.dispose(); sprite.dispose(); },
  };
}
