// =============================================================================
// SNOWVILLE: BEAUTY PASS 5, LIVING CREATURES AND A WORLD THAT AGREES WITH ITSELF. No mesh, no light: ONE Points of soft dots ("snowville:living", a size and an alpha of its own for each) draws
//   * two snow-HARES that hop across the lanes and freeze, ears up, while she looks their way; a FOX in the treeline with a tail that flicks; two OWLS on fir boughs that turn their heads and blink;
//     a duck family sliding on the frozen pond; the snow gathering in drifts on the windowsills;
//   * the ARRIVAL: a flurry of snow and a bell as she comes into the square, and the windows waking one after another along the lane;
// a second Points paints the dusk band on the sky. The shared look lives in SHARED (snowvillealive.js): ONE wind (east, a little south: flakes, smoke and the sound agree), ONE warm breath (every lit thing
// swells together at the carol's own pace and gives a pulse at each carol chime) and ONE slow hour, blue to gold, that tints the sky band, the snow, the sun, the flakes and the smoke. Reduced motion draws
// the creatures still, the windows lit and the hour fixed; the lite rungs draw fewer. Pure helpers are exported. No Math.random, no clock.
// =============================================================================

import * as THREE from 'three';
import * as P from './snowvilleplan.js';
import { dotTexture } from './snowvilleparts.js';
import { SHARED } from './snowvillealive.js';
import { chimeClock, villageBell } from './snowvillesound.js';

const hash = (n, s) => { let h = (Math.imul(n | 0, 0x9e3779b1) ^ Math.imul((s | 0) + 0x3c6ef372, 0x85ebca6b)) | 0; h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 13; return (h >>> 0) / 4294967296; };
const c01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const K = 1.9; // a dot's size for a thing this many metres wide

export const BREATH_PERIOD = 5.52; // two of the carol's six-note phrases (6 x 0.46 s)
export const HOUR_PERIOD = 480;
// The warm lights' shared swell: a slow breath, and a bright pulse that fades over a couple of seconds after each carol chime (chimeT). 0.88 .. 1.2. Pure.
export const breathAt = (t, chimeT = -99) => 1 + 0.07 * Math.sin((t * 6.2832) / BREATH_PERIOD) + (t >= chimeT ? 0.13 * Math.exp(-(t - chimeT) / 2.2) : 0);
// The hour of the day: 1 is the gold the village is painted in, 0 the blue hour it slowly dips toward and comes back from. 0.45 .. 1. Pure.
export const hourAt = (t) => 0.725 + 0.275 * Math.sin((t * 6.2832) / HOUR_PERIOD + 1.57);
// Windows wake in a sequence that runs along the lane away from where she arrived (0.1 s to the metre, each taking 0.8 s to come up); asleep (half) until she has arrived. Pure.
export const wakeAt = (dist, t, t0) => (t0 < 0 ? 0.5 : 0.5 + 0.5 * c01((t - t0 - Math.min(dist * 0.1, 4)) / 0.8));

// A hare's step along its lane: `h` = { s (metres along), ph (the hop), wait (seconds left out of sight), dir }, `seen` = she is looking at it. A hare in the air lands first, then freezes; out of sight it waits, then crosses back. Pure.
export function hareStep(h, dt, seen, L, wait) {
  if (h.wait > 0) { h.wait -= dt; if (h.wait <= 0) { h.s = 0; h.ph = 0; h.dir = -h.dir; } return h; }
  if (seen && h.ph === 0) return h;
  const nph = h.ph + dt * 1.15;
  if (seen && nph >= 1) { h.s += 1.1 * (1 - h.ph); h.ph = 0; } else { h.s += 1.1 * (nph - h.ph) * 1; h.ph = nph >= 1 ? nph - 1 : nph; }
  if (h.s >= L) h.wait = wait;
  return h;
}
export const hopY = (ph) => 0.3 * Math.sin(Math.PI * c01(ph * 1.15)); // up and down within the hop, the rest of it on the snow

const HARES = Object.freeze([{ x0: -15, z0: 20.4, x1: 17, z1: 21.2, wait: 22 }, { x0: -6, z0: -1.6, x1: 6, z1: -2.6, wait: 15 }]);
const DUCK_PATH = (t) => ({ x: P.POND.x + 4.6 * Math.cos(t * 0.16), z: P.POND.z + 3.5 * Math.sin(t * 0.21 + 0.8) });
export const DUCKS = Object.freeze([0, 1, 2, 3]);

export function createLiving({ scene, tier = null, reducedMotion = false, audio = null, low = false, sun = null, fill = null }) {
  const still = reducedMotion;
  const firs = P.scatterFirs();
  const foxFirs = firs.filter((k) => k.z < -16 && k.z > -23 && Math.abs(k.x) < 8).sort((a, b) => a.x - b.x).slice(0, 3);
  const owlFirs = firs.filter((k) => !k.rim && Math.hypot(k.x + 2, k.z - 12) < 30).sort((a, b) => b.s - a.s).slice(0, low ? 1 : 2);
  const sills = P.COTTAGES.flatMap((c, j) => [-1, 1].map((sx, k) => { const lx = sx * c.w * 0.32; const lz = c.d / 2 + 0.22; const s = Math.sin(c.yaw); const co = Math.cos(c.yaw); return { x: c.x + lx * co + lz * s, y: P.snowY(c.x, c.z) + c.h * 0.55 - 0.55, z: c.z - lx * s + lz * co, ph: hash(j * 2 + k, 3) }; }));
  const N = 160;
  const pos = new Float32Array(N * 3); const col = new Float32Array(N * 4); const scl = new Float32Array(N);
  for (let i = 0; i < N; i++) pos[i * 3 + 1] = -50;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 4)); geo.setAttribute('aS', new THREE.BufferAttribute(scl, 1));
  const grow = (sh) => { sh.vertexShader = sh.vertexShader.replace('void main() {', 'attribute float aS;\nvoid main() {').replace('gl_PointSize = size;', 'gl_PointSize = size * aS;'); };
  const mat = new THREE.PointsMaterial({ map: dotTexture(), alphaTest: 0.01, size: 1, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 1, depthWrite: false, fog: true });
  mat.onBeforeCompile = (sh) => { grow(sh); sh.fragmentShader = sh.fragmentShader.replace('#include <map_particle_fragment>', '#include <map_particle_fragment>\nfloat ta = diffuseColor.a / max(vColor.a, 0.001); diffuseColor.a = smoothstep(0.06, 0.26, ta) * vColor.a;'); }; // (a firmer dot: the soft one is a haze at a distance)
  const pts = new THREE.Points(geo, mat);
  pts.name = 'snowville:living'; pts.frustumCulled = false; pts.renderOrder = 2;
  Object.assign(pts.userData, { noCast: true, noContactShadow: true, noMerge: true });
  scene.add(pts);
  // the dusk band: soft glows low on the sky, painted first (under the ridge, the roofs and the firs, as the aurora is)
  const B = 9; const bPos = new Float32Array(B * 3); const bCol = new Float32Array(B * 4); const bScl = new Float32Array(B).fill(low ? 0 : 70);
  const bGeo = new THREE.BufferGeometry();
  bGeo.setAttribute('position', new THREE.BufferAttribute(bPos, 3)); bGeo.setAttribute('color', new THREE.BufferAttribute(bCol, 4)); bGeo.setAttribute('aS', new THREE.BufferAttribute(bScl, 1));
  const bMat = new THREE.PointsMaterial({ map: dotTexture(), alphaTest: 0.002, size: 1, sizeAttenuation: true, vertexColors: true, transparent: false, depthTest: false, depthWrite: false, fog: false });
  Object.assign(bMat, { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor });
  bMat.onBeforeCompile = grow;
  const band = new THREE.Points(bGeo, bMat);
  band.name = 'snowville:skyband'; band.frustumCulled = false; band.renderOrder = -21;
  Object.assign(band.userData, { noCast: true, noContactShadow: true, noMerge: true });
  scene.add(band);

  const groundMesh = scene.getObjectByName('snowville:ground');
  const gF = new THREE.Color(1, 1, 1); const sF = new THREE.Color(1, 1, 1); const nF = new THREE.Color(); // the factors now on the ground and the sun (whatever else sets their colour keeps working: each frame only the change is applied)
  const factor = (c, prev, next) => { if (c) { c.r *= next.r / prev.r; c.g *= next.g / prev.g; c.b *= next.b / prev.b; prev.copy(next); } };
  const st = { arrivals: 0, t0: -1, lastIn: -1e9, was: false, seen: [false, false], hares: HARES.map((h, i) => ({ s: 8 * i, ph: 0, wait: 0, dir: i ? -1 : 1 })), hour: 1, ax: 0, az: 0, foxFirs, owlFirs };
  const fw = new THREE.Vector3(); let nIdx = 0;
  const dot = (x, y, z, s, r, g, b, a) => { if (nIdx >= N || a <= 0.004) return; const o = nIdx * 3; pos[o] = x; pos[o + 1] = y; pos[o + 2] = z; col[nIdx * 4] = r; col[nIdx * 4 + 1] = g; col[nIdx * 4 + 2] = b; col[nIdx * 4 + 3] = a; scl[nIdx] = s * K; nIdx++; };
  // a creature's dots in its own frame (forward = +z, turned by yaw), standing at (x, y, z)
  let sc = 1; // a creature's size (big enough to read from a few metres, in the walk's storybook way)
  const part = (x, y, z, yaw, lx, ly, lz, s, r, g, b, a = 1) => { lx *= sc; ly *= sc; lz *= sc; s *= sc; const sn = Math.sin(yaw); const cs = Math.cos(yaw); dot(x + lx * cs + lz * sn, y + ly + 0.13, z - lx * sn + lz * cs, s, r, g, b, a); };

  function hare(i, t, seen) {
    const H = HARES[i]; const h = st.hares[i]; const L = Math.hypot(H.x1 - H.x0, H.z1 - H.z0); const u = c01(h.s / L); const d = h.dir;
    if (h.wait > 0) return;
    const x = d > 0 ? H.x0 + (H.x1 - H.x0) * u : H.x1 + (H.x0 - H.x1) * u; const z = d > 0 ? H.z0 + (H.z1 - H.z0) * u : H.z1 + (H.z0 - H.z1) * u;
    const yaw = Math.atan2((H.x1 - H.x0) * d, (H.z1 - H.z0) * d); const y = P.snowY(x, z); const a = Math.min(1, h.s / 2, (L - h.s) / 2 + 0.2); const hy = hopY(h.ph); const ear = seen ? 0.07 : 0;
    sc = 2.3; dot(x, y + 0.16, z, 0.95, 0.3, 0.36, 0.6, 0.5 * a); // its shadow
    part(x, y + hy, z, yaw, 0, 0.17, -0.06, 0.34, 0.4, 0.46, 0.68, a); part(x, y + hy, z, yaw, 0, 0.17, 0.1, 0.27, 0.52, 0.58, 0.8, a); // body and chest (a hare looks white on white: a grey-blue shade under it)
    part(x, y + hy, z, yaw, 0, 0.17, -0.22, 0.14, 0.95, 0.95, 1, a); part(x, y + hy, z, yaw, 0, 0.36 + ear * 0.2, 0.22, 0.2, 0.6, 0.65, 0.82, a); // tail, head
    part(x, y + hy, z, yaw, -0.05, 0.56 + ear, 0.16, 0.08, 0.42, 0.4, 0.55, a); part(x, y + hy, z, yaw, 0.05, 0.56 + ear, 0.16, 0.08, 0.42, 0.4, 0.55, a); // ears
    part(x, y + hy, z, yaw, -0.06, 0.4 + ear * 0.2, 0.3, 0.05, 0.1, 0.1, 0.16, a); part(x, y + hy, z, yaw, 0.06, 0.4 + ear * 0.2, 0.3, 0.05, 0.1, 0.1, 0.16, a); // eyes
  }
  function fox(t) {
    if (!foxFirs.length) return;
    const cyc = still ? 0.3 : (t / 70); const k = Math.floor(cyc); const f = cyc - k; const a = still ? 1 : Math.min(1, f * 14, (0.62 - f) * 14); // out in the treeline for the first 0.6 of every 70 s
    if (a <= 0) return;
    const F = foxFirs[(k + 1) % foxFirs.length]; const x = F.x + 1.0; const z = F.z + 1.5; const y = P.snowY(x, z); const yaw = 0.5 + 0.25 * Math.sin(t * 0.3 + k) * (t - SHARED.hear < 3.2 ? 0 : 1); const up = t - SHARED.hear < 3.2 ? 0.14 : 0;
    const flick = still ? 0 : Math.max(0, Math.sin(t * 1.9)) ** 6; const sw = 0.18 * Math.sin(t * 9) * flick + 0.1 * Math.sin(t * 0.8);
    sc = 2.1; dot(x, y + 0.16, z, 1.4, 0.4, 0.45, 0.6, 0.28 * a);
    part(x, y, z, yaw, 0, 0.3, 0, 0.52, 0.92, 0.5, 0.2, a); part(x, y, z, yaw, 0, 0.34, 0.28, 0.4, 0.94, 0.52, 0.2, a); part(x, y, z, yaw, 0, 0.5 + up, 0.48, 0.3, 0.94, 0.54, 0.22, a); // body, chest, head
    part(x, y, z, yaw, 0, 0.45 + up, 0.64, 0.12, 0.96, 0.92, 0.86, a); // muzzle
    part(x, y, z, yaw, sw * 0.6, 0.36, -0.42, 0.4, 0.9, 0.46, 0.17, a); part(x, y, z, yaw, sw, 0.4, -0.7, 0.34, 0.94, 0.5, 0.18, a); part(x, y, z, yaw, sw * 1.6, 0.42, -0.95, 0.24, 1, 0.97, 0.92, a); // the brush and its white tip
  }
  function owls(t) {
    sc = 2.1;
    owlFirs.forEach((F, i) => {
      const yaw = Math.atan2(-2 - F.x, 12 - F.z); const H = 4.5 * F.s; const rr = (1.55 - 1.1 * 0.62) * F.s * 1.3; const x = F.x + Math.sin(yaw) * rr; const z = F.z + Math.cos(yaw) * rr; const y = P.snowY(F.x, F.z) + H * 0.66;
      const heard = t - SHARED.hear < 3.2 || t - SHARED.heed < 4; const turn = still || heard ? 0 : Math.max(-1, Math.min(1, 2.4 * Math.sin(t * 0.34 + i * 2.1))); const blink = !still && Math.sin(t * 0.9 + i * 5) > 0.97 ? 0.1 : 1; // it stares, then swivels, now and then it blinks
      part(x, y, z, yaw, 0, 0.18, 0, 0.42, 0.52, 0.42, 0.36, 1); part(x, y, z, yaw, turn * 0.04, 0.45, 0.04, 0.34, 0.62, 0.52, 0.44, 1);
      const eye = (1 - Math.abs(turn) * 0.8) * blink * (heard ? 1.3 : 1); // two big amber eyes slide across the face as it turns and narrow when it looks away
      for (const sx of [-1, 1]) part(x, y, z, yaw, sx * 0.075 + turn * 0.085, 0.45, 0.14, 0.15 * eye, 1.5, 1.1, 0.35, 1);
    });
  }
  function ducks(t) {
    sc = 2.0; const nD = low ? 3 : 4;
    for (let i = 0; i < nD; i++) {
      const tt = still ? 0 : t; const p = DUCK_PATH(tt - i * 1.1 - (i ? 0.9 : 0)); const q = DUCK_PATH(tt - i * 1.1 - (i ? 0.9 : 0) + 0.2);
      const yaw = Math.atan2(q.x - p.x, q.z - p.z) + (i && !still ? 0.35 * Math.sin(tt * 2.1 + i * 2) : 0); const y = P.snowY(p.x, p.z) + 0.06;
      const m = i === 0; const s = m ? 1 : 0.55;
      dot(p.x, y + 0.14, p.z, 0.6 * s * sc, 0.4, 0.5, 0.7, 0.3);
      part(p.x, y, p.z, yaw, 0, 0.2 * s, 0, 0.5 * s, m ? 0.62 : 1, m ? 0.5 : 0.82, m ? 0.34 : 0.26, 1); part(p.x, y, p.z, yaw, 0, 0.42 * s, 0.22 * s, 0.28 * s, m ? 0.22 : 1, m ? 0.5 : 0.84, m ? 0.34 : 0.28, 1);
    }
  }
  function sillsAt(t) {
    sills.forEach((s, i) => { if (low && i % 2) return; const g = still ? 0.6 : c01(((t * 0.0042 + s.ph) % 1.4) / 1.1 * 1.0); dot(s.x, s.y, s.z, 0.12 + 0.5 * g, 0.95, 0.97, 1, 0.95); });
  }
  const NFLUR = low ? 14 : 30;
  function flurry(t, cx, cz) {
    const u = (t - st.t0) / 3.8; if (st.t0 < 0 || u > 1.2) return;
    for (let i = 0; i < NFLUR; i++) {
      const w = u - hash(i, 4) * 0.25; if (w < 0 || w > 1) continue; const a = hash(i, 5) * 6.2832 + w * 2.2; const r = 1.2 + 4.5 * hash(i, 6) * (0.4 + w);
      dot(cx + Math.cos(a) * r + SHARED.wx * 5 * w, P.snowY(cx, cz) + 0.3 + 3.2 * w * (0.5 + hash(i, 7)), cz + Math.sin(a) * r + SHARED.wz * 5 * w, 0.14 + 0.16 * hash(i, 8), 1, i % 5 ? 1 : 0.9, i % 5 ? 1 : 0.62, Math.sin(Math.PI * w) * 0.95);
    }
  }
  function arrive(t, cx, cz) {
    st.arrivals++; st.t0 = t; st.lastIn = t;
    st.ax = cx; st.az = cz;
    villageBell(audio, 1, 1);
  }
  const bandRgb = [0, 0, 0];
  function update(dt, t, catPos, camera) {
    const d = dt > 0 ? Math.min(dt, 0.1) : 0; const cx = catPos?.x ?? 0; const cz = catPos?.z ?? 30;
    const hr = still ? 1 : hourAt(t); st.hour = SHARED.hour = hr; SHARED.breath = still ? 1 : breathAt(t, chimeClock.t);
    if (!still) {
      const inSq = Math.hypot(cx - P.SQUARE_FIR.x, cz - P.SQUARE_FIR.z) < 11;
      if (inSq && !st.was && t - st.lastIn > 45 && d > 0) arrive(t, cx, cz);
      st.was = inSq;
    }
    nIdx = 0;
    if (camera?.getWorldDirection) camera.getWorldDirection(fw); else fw.set(0, 0, -1);
    const fl = Math.hypot(fw.x, fw.z) || 1; const cam = camera?.position ?? { x: cx, y: 2, z: cz + 4 };
    for (let i = 0; i < HARES.length; i++) {
      const h = st.hares[i]; const H = HARES[i]; const L = Math.hypot(H.x1 - H.x0, H.z1 - H.z0); const u = c01(h.s / L);
      const hx = (h.dir > 0 ? H.x0 + (H.x1 - H.x0) * u : H.x1 + (H.x0 - H.x1) * u) - cam.x; const hz = (h.dir > 0 ? H.z0 + (H.z1 - H.z0) * u : H.z1 + (H.z0 - H.z1) * u) - cam.z; const dd = Math.hypot(hx, hz) || 1;
      const seen = !still && ((dd < 30 && (hx * fw.x + hz * fw.z) / (dd * fl) > 0.88) || t - SHARED.hear < 3.2); st.seen[i] = seen;
      if (!still) hareStep(h, d, seen, L, H.wait); else if (h.s === 8 * i && !h.once) { h.once = true; h.s = L * 0.5; }
      hare(i, t, seen);
    }
    fox(t); owls(t); ducks(t); sillsAt(still ? 0 : t); flurry(t, cx, cz);
    for (let i = nIdx; i < N; i++) scl[i] = 0;
    geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true; geo.attributes.aS.needsUpdate = true;
    // the hour: tints on the snow, the sun and the sky band
    const g = 1 - hr;
    if (!still) { factor(groundMesh?.material?.color, gF, nF.setRGB(1 - 0.05 * g, 1 - 0.02 * g, 1 + 0.03 * g)); factor(sun?.color, sF, nF.setRGB(1 - 0.18 * g, 1 - 0.1 * g, 1 + 0.12 * g)); }
    if (camera?.position && !low) {
      const D = 110; const bx = fw.x / fl; const bz = fw.z / fl;
      for (let i = 0; i < B; i++) { const s = i / (B - 1) - 0.5; const o = i * 3; bPos[o] = cam.x + bx * D - bz * s * 190; bPos[o + 2] = cam.z + bz * D + bx * s * 190; bPos[o + 1] = cam.y + 9 + 5 * Math.cos(s * 3);
        bandRgb[0] = 1.0 - 0.5 * g; bandRgb[1] = 0.66 + 0.0 * g - 0.06 * g; bandRgb[2] = 0.36 + 0.7 * g; const e = 0.2 * (1 - 1.4 * s * s) * (1 - 0.35 * g);
        bCol[i * 4] = bandRgb[0]; bCol[i * 4 + 1] = bandRgb[1]; bCol[i * 4 + 2] = bandRgb[2]; bCol[i * 4 + 3] = e; }
      bGeo.attributes.position.needsUpdate = true; bGeo.attributes.color.needsUpdate = true;
    }
  }
  return {
    state: st, points: pts, band, active: true, update, arrive: (t, cx, cz) => arrive(t, cx, cz),
    wakeAt: (x, z, t) => (still ? 1 : wakeAt(Math.hypot(x - st.ax, z - st.az), t, st.t0)), // how awake a window or lamp at (x, z) is (0.5 .. 1)
    dispose() {
      scene.remove(pts, band); geo.dispose(); mat.dispose(); bGeo.dispose(); bMat.dispose();
      factor(groundMesh?.material?.color, gF, nF.setRGB(1, 1, 1)); factor(sun?.color, sF, nF.setRGB(1, 1, 1));
    },
  };
}
