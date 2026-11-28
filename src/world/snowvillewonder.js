// =============================================================================
// SNOWVILLE: BEAUTY PASS 4, THE SEASONS AND THE RARE SURPRISES. No mesh, no light: ONE Points ("snowville:wonder", one additive draw, a size of its own for each dot, the walk's soft dot) and a tint on
// two materials. By the DATE (read once, here; the build and the holidays system are untouched):
//   * EARLY SNOW (15 Oct - 30 Nov): the cover is thin and warm (the ground a touch earthy), the firs greener, fewer flakes;
//   * DEEP WINTER (Dec - Feb, and the quiet months May - mid Oct): the cover bright and blue-white, the firs frosted, a few more glints;
//   * THAW (Mar - Apr): the cover grey and wet, the firs dark where the snow slid off, thin snowfall, drips falling from the icicles and sparkling puddles by the doors.
// And now and then (about every three to five minutes of the walk, never twice alike in a row) ONE rare surprise, drawn from the pool of dots and sounded with the village's own sounds:
//   AURORA ribbons waving across the sky for a minute; a SLEIGH of lights gliding over the rooftops; a snow-globe sparkle BURST on the village tree (only when she is near it); a CHORUS of bells
//   flashing along the string of lights, one flash to each note of the carol. Reduced motion: no drips, no sparkle, no surprise (only the still tint); the lite rungs draw fewer dots. Muted: silent.
// Pure helpers are exported for the tests. No Math.random, no clock but the one date.
// =============================================================================

import * as THREE from 'three';
import * as P from './snowvilleplan.js';
import { dotTexture } from './snowvilleparts.js';
import { bellStrings, toDoors } from './snowvillebeauty.js';
import { sleighBells, carolChime, carolPhrase, windGust } from './snowvillesound.js';

const hash = (n, s) => { let h = (Math.imul(n | 0, 0x9e3779b1) ^ Math.imul((s | 0) + 0x2545f491, 0x85ebca6b)) | 0; h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 13; return (h >>> 0) / 4294967296; };
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// ---- the seasons ----------------------------------------------------------------------------------------------------------------------------------
export const SEASON_LOOK = Object.freeze({
  early: Object.freeze({ ground: [0.945, 0.905, 0.83], trees: [0.84, 0.97, 0.84], flakes: 0.7, drips: false }),
  deep: Object.freeze({ ground: [0.98, 1.0, 1.05], trees: [1.07, 1.09, 1.13], flakes: 1, drips: false }),
  thaw: Object.freeze({ ground: [0.73, 0.78, 0.8], trees: [0.62, 0.82, 0.66], flakes: 0.4, drips: true }),
});
export function seasonOf(date = new Date()) {
  const m = date.getMonth(); const d = date.getDate(); // 0 = January
  if ((m === 9 && d >= 15) || m === 10) return 'early';
  if (m === 2 || m === 3) return 'thaw';
  return 'deep';
}

// ---- the rare surprises ---------------------------------------------------------------------------------------------------------------------------
export const WONDER = Object.freeze({ first: 150, min: 170, span: 110, kinds: Object.freeze(['aurora', 'bells', 'globe', 'sleigh']) });
export const DUR = Object.freeze({ aurora: 60, bells: 8, globe: 7, sleigh: 17 });
export const POOL = Object.freeze({ ribbons: 3, per: 26, burst: 40, sleigh: 14, drips: 14, puddles: 8 });
const AUR = POOL.ribbons * POOL.per; // the aurora's own dots (a Points of its own: it paints behind the whole village, over the sky)
const EVENT_SLOTS = POOL.burst; // the other surprises share these (only one at a time)
export const SLOTS = EVENT_SLOTS + POOL.drips + POOL.puddles;

// The aurora's ribbon r, point j (of per) at time u, hung round (cx, cz) in the direction (fx, fz): a wide curtain that waves. Pure. Sets out.{x,y,z,v (brightness 0..1),h (0 green .. 1 violet)}.
export function auroraAt(r, j, u, cx, cy, cz, fx, fz, per = POOL.per, out = { x: 0, y: 0, z: 0, v: 0, h: 0 }) {
  const s = j / (per - 1) - 0.5; // -0.5 .. 0.5 across the sky
  const D = 100 + r * 9;
  const lat = s * (150 - r * 12) + 6 * Math.sin(u * 0.45 + r * 2 + s * 5);
  const rx = -fz; const rz = fx;
  out.x = cx + fx * (D - 30 * s * s) + rx * lat; out.z = cz + fz * (D - 30 * s * s) + rz * lat;
  out.y = cy + 24 + r * 9 + 8 * Math.sin(s * 6.5 + r * 1.7 + u * 0.35) + 3 * Math.sin(s * 15 - u * 0.8 + r);
  out.v = (0.55 + 0.45 * Math.sin(s * 9 + u * 0.9 + r * 2.3)) * Math.max(0.2, 1 - 3.2 * s * s); // fading toward the two ends
  out.h = clamp01(0.5 + s * 1.5 + 0.18 * Math.sin(u * 0.3 + r));
  return out;
}
const AUR_A = [0.0, 0.85, 0.2]; const AUR_B = [0.0, 0.62, 0.62]; const AUR_C = [0.42, 0.08, 0.75];
export function auroraTint(h, out = [0, 0, 0]) { // green in the middle, teal then violet toward the edges
  const e = Math.abs(h - 0.5) * 2; const a = e < 0.5 ? AUR_A : AUR_B; const b = e < 0.5 ? AUR_B : AUR_C; const k = e < 0.5 ? e * 2 : (e - 0.5) * 2;
  for (let c = 0; c < 3; c++) out[c] = a[c] + (b[c] - a[c]) * k;
  return out;
}
// The sleigh's head at u (0 .. 1) of its crossing: over the rooftops, ahead of the camera (right vector rx, rz), from the east to the west. Pure.
export function sleighAt(u, cx, cy, cz, fx, fz, out = { x: 0, y: 0, z: 0 }) {
  const rx = -fz; const rz = fx; const lat = -70 + 140 * u; const fwd = 42 + 10 * Math.sin(u * 3.0);
  out.x = cx + fx * fwd + rx * lat; out.z = cz + fz * fwd + rz * lat; out.y = cy + 12 + 4 * Math.sin(u * 5.5) + 5 * u; return out;
}
// A spark of the burst k at age a seconds from the village tree's tip. Pure.
export function burstAt(k, a, tip, out = { x: 0, y: 0, z: 0 }) {
  const th = hash(k, 1) * 6.283; const ph = Math.acos(2 * hash(k, 2) - 1); const sp = 1.4 + 3.2 * hash(k, 3);
  const e = (1 - Math.exp(-1.6 * a)) / 1.6; // thrown out, then slowed by the air
  out.x = tip.x + Math.sin(ph) * Math.cos(th + a * 0.5) * sp * e; out.z = tip.z + Math.sin(ph) * Math.sin(th + a * 0.5) * sp * e; out.y = tip.y + Math.cos(ph) * sp * e * 0.9 - 0.45 * a * a * (0.5 + hash(k, 4)); return out;
}
export const spanOf = (kind, k = 0) => (kind === 'bells' ? carolPhrase(k).length * 0.46 + 2.4 : DUR[kind]);

// ---- the thing itself -------------------------------------------------------------------------------------------------------------------------------
export function createWonder({ scene, tier = null, reducedMotion = false, audio = null, low = false, season = null, now = null }) {
  const name = season ?? seasonOf(now ?? new Date());
  const look = SEASON_LOOK[name] ?? SEASON_LOOK.deep;
  // the season's tints (clones of the shared paint material for the firs, so the cottages keep theirs; put back on dispose)
  const undo = [];
  const tint = (meshName, rgb, clone) => {
    const m = scene.getObjectByName(meshName);
    if (!m?.material?.color) return;
    if (clone) { const old = m.material; m.material = old.clone(); undo.push(() => { m.material.dispose(); m.material = old; }); } else { const c0 = m.material.color.clone(); undo.push(() => m.material.color.copy(c0)); }
    m.material.color.setRGB(rgb[0], rgb[1], rgb[2]);
  };
  tint('snowville:ground', look.ground, false);
  tint('snowville:tree', look.trees, true); tint('snowville:treeBack', look.trees, true);
  const st = { season: name, kind: null, events: 0, last: null, t0: 0, next: WONDER.first, pending: null, az: null, drips: 0 };
  if (reducedMotion) return { state: st, look, active: false, update() {}, trigger() { return false; }, dispose() { for (const u of undo.reverse()) u(); } };

  const N = SLOTS;
  const pos = new Float32Array(N * 3); const col = new Float32Array(N * 4); const scl = new Float32Array(N);
  for (let i = 0; i < N; i++) pos[i * 3 + 1] = -50;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 4)); geo.setAttribute('aS', new THREE.BufferAttribute(scl, 1));
  const mat = new THREE.PointsMaterial({ map: dotTexture(), alphaTest: 0.01, size: 1, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 1, depthWrite: false, fog: false }); // (ordinary alpha, with the colour's own alpha: gold on the pale sky and snow shows where a light added on top would wash out)
  mat.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('void main() {', 'attribute float aS;\nvoid main() {').replace('gl_PointSize = size;', 'gl_PointSize = size * aS;'); };
  const pts = new THREE.Points(geo, mat);
  pts.name = 'snowville:wonder'; pts.frustumCulled = false; pts.renderOrder = 3;
  Object.assign(pts.userData, { noCast: true, noContactShadow: true, noMerge: true });
  scene.add(pts);
  // the aurora: translucent paint on the sky, drawn FIRST (before the opaque pass) with no depth test, so the ridge, the roofs and the firs all hide it and only the open sky shows it
  const aPos = new Float32Array(AUR * 3); const aCol = new Float32Array(AUR * 4); const aScl = new Float32Array(AUR);
  for (let i = 0; i < AUR; i++) aPos[i * 3 + 1] = -50;
  const aGeo = new THREE.BufferGeometry();
  aGeo.setAttribute('position', new THREE.BufferAttribute(aPos, 3)); aGeo.setAttribute('color', new THREE.BufferAttribute(aCol, 4)); aGeo.setAttribute('aS', new THREE.BufferAttribute(aScl, 1));
  const aMat = new THREE.PointsMaterial({ map: dotTexture(), alphaTest: 0.002, size: 1, sizeAttenuation: true, vertexColors: true, transparent: false, opacity: 1, depthTest: false, depthWrite: false, fog: false });
  Object.assign(aMat, { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor });
  aMat.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('void main() {', 'attribute float aS;\nvoid main() {').replace('gl_PointSize = size;', 'gl_PointSize = size * aS;'); };
  const aur = new THREE.Points(aGeo, aMat);
  aur.name = 'snowville:aurora'; aur.frustumCulled = false; aur.renderOrder = -20;
  Object.assign(aur.userData, { noCast: true, noContactShadow: true, noMerge: true });
  scene.add(aur);

  const strings = bellStrings(); const doors = toDoors();
  const tip = { x: P.SQUARE_FIR.x, y: P.snowY(P.SQUARE_FIR.x, P.SQUARE_FIR.z) + P.SQUARE_FIR.h + 0.15, z: P.SQUARE_FIR.z };
  const fw = new THREE.Vector3(); const tmp = { x: 0, y: 0, z: 0, v: 0, h: 0 }; const rgb = [0, 0, 0];
  const nRib = low ? 2 : POOL.ribbons; const nPer = low ? 18 : POOL.per; const nBurst = low ? 22 : POOL.burst;
  let fx = 0; let fz = -1; let ox = 0; let oy = 0; let oz = 0; let chimed = false; let chimed2 = false;
  const rgba = (i, r, g, b, a) => { col[i * 4] = r; col[i * 4 + 1] = g; col[i * 4 + 2] = b; col[i * 4 + 3] = a; };
  const clear = (a, b) => { for (let i = a; i < b; i++) scl[i] = 0; };

  function start(kind, t, cam, catPos) {
    st.kind = kind; st.t0 = t; st.events++; st.last = kind; chimed = false; chimed2 = false;
    cam.getWorldDirection?.(fw); const L = Math.hypot(fw.x, fw.z) || 1; fx = fw.x / L; fz = fw.z / L; ox = cam.position.x; oy = cam.position.y; oz = cam.position.z;
    if (kind === 'aurora') { windGust(audio, 0.25); }
    if (kind === 'sleigh') sleighBells(audio, 90 + st.events, 0.7);
    if (kind === 'globe') carolChime(audio, 200 + st.events);
    if (kind === 'bells') { carolChime(audio, 300 + st.events); const ax = ox + fx * 12; const az = oz + fz * 12; st.string = strings.map((S, i) => [Math.hypot(S[4].x - ax, S[4].z - az), i]).sort((a, b) => a[0] - b[0])[0][1]; } // the string in front of her
    clear(0, EVENT_SLOTS); aScl.fill(0); aGeo.attributes.aS.needsUpdate = true;
  }
  const nearTree = (c) => !!c && Math.hypot(c.x - P.SQUARE_FIR.x, c.z - P.SQUARE_FIR.z) < 26;
  function pick(catPos) {
    const k = st.events + Math.floor(hash(st.events, 17) * 4);
    for (let i = 0; i < 4; i++) {
      const kind = WONDER.kinds[(k + i) % 4];
      if (kind === st.last) continue;
      if (kind === 'globe' && !nearTree(catPos)) continue;
      return kind;
    }
    return 'aurora';
  }

  function drawEvent(t, d, cam) {
    const u = t - st.t0; const kind = st.kind;
    if (u > spanOf(kind, 300 + st.events)) { clear(0, EVENT_SLOTS); aScl.fill(0); aGeo.attributes.aS.needsUpdate = true; geo.attributes.aS.needsUpdate = true; st.kind = null; return; }
    if (kind === 'aurora') {
      cam.getWorldDirection?.(fw); const L = Math.hypot(fw.x, fw.z) || 1; const k = Math.min(1, d * 0.4); // she turns, the curtain follows slowly
      fx += (fw.x / L - fx) * k; fz += (fw.z / L - fz) * k; const m = Math.hypot(fx, fz) || 1; fx /= m; fz /= m;
      const env = clamp01(Math.min(u / 9, (DUR.aurora - u) / 9));
      for (let r = 0; r < POOL.ribbons; r++) for (let j = 0; j < POOL.per; j++) {
        const i = r * POOL.per + j; const o = i * 3;
        if (r >= nRib || j >= nPer) { aScl[i] = 0; continue; }
        auroraAt(r, j * (POOL.per - 1) / (nPer - 1), u, cam.position.x, oy, cam.position.z, fx, fz, POOL.per, tmp);
        auroraTint(tmp.h, rgb); const v = env * Math.max(0.08, tmp.v);
        aPos[o] = tmp.x; aPos[o + 1] = tmp.y; aPos[o + 2] = tmp.z; aCol[i * 4] = rgb[0]; aCol[i * 4 + 1] = rgb[1]; aCol[i * 4 + 2] = rgb[2]; aCol[i * 4 + 3] = 0.95 * Math.min(1, v * 1.25);
        aScl[i] = (low ? 22 : 18) + 4 * Math.sin(j * 0.9 + u);
      }
      aGeo.attributes.position.needsUpdate = true; aGeo.attributes.color.needsUpdate = true; aGeo.attributes.aS.needsUpdate = true;
    } else if (kind === 'sleigh') {
      const dur = DUR.sleigh; const head = u / dur;
      for (let i = 0; i < POOL.sleigh; i++) {
        const o = i * 3; const lag = i < 2 ? -0.012 * (2 - i) : (i - 2) * 0.016; // two reindeer ahead, the sleigh, then a trail of sparks
        const uu = head - lag;
        if (uu < 0 || uu > 1 || (low && i > 8)) { scl[i] = 0; continue; }
        sleighAt(uu, ox, oy, oz, fx, fz, tmp);
        pos[o] = tmp.x; pos[o + 1] = tmp.y + (i >= 5 ? -0.25 * (i - 4) * (0.6 + 0.4 * Math.sin(u * 5 + i)) : 0); pos[o + 2] = tmp.z;
        const gold = i < 5; const fade = i < 5 ? 1 : 1 - (i - 4) / (POOL.sleigh - 3);
        const tw = 0.7 + 0.3 * Math.sin(u * 14 + i * 2.1);
        rgba(i, gold ? 1.1 : 1.0, gold ? 0.7 : 0.78, gold ? 0.18 : 0.35, Math.min(1, 1.4 * fade * tw));
        scl[i] = i === 3 ? 9 : i < 2 ? 5 : i < 5 ? 6.5 : 3.4 * fade;
      }
      if (!chimed2 && u > dur * 0.5) { chimed2 = true; sleighBells(audio, 91 + st.events, 0.45); }
      clear(POOL.sleigh, EVENT_SLOTS);
    } else if (kind === 'globe') {
      for (let k = 0; k < POOL.burst; k++) {
        const o = k * 3;
        if (k >= nBurst) { scl[k] = 0; continue; }
        const a = u - 0.08 * hash(k, 5) * 3;
        if (a < 0) { scl[k] = 0; continue; }
        burstAt(k, a, tip, tmp); pos[o] = tmp.x; pos[o + 1] = tmp.y; pos[o + 2] = tmp.z;
        const life = 4.2 + 2 * hash(k, 6); const f = clamp01(1 - a / life); const tw = 0.6 + 0.4 * Math.sin(a * 11 + k * 3);
        const hue = k % 3; rgba(k, hue === 1 ? 1.0 : hue === 2 ? 0.45 : 1.0, hue === 1 ? 0.72 : hue === 2 ? 0.68 : 0.92, hue === 1 ? 0.18 : hue === 2 ? 1.0 : 0.75, Math.min(1, 1.3 * f * tw));
        scl[k] = (0.5 + 0.7 * hash(k, 7)) * Math.max(0.1, f) * (1 + 1.6 * Math.exp(-a * 2.4));
      }
      clear(POOL.burst, EVENT_SLOTS);
    } else if (kind === 'bells') {
      const phrase = carolPhrase(300 + st.events); const n = phrase.length; const S = strings[st.string ?? 0];
      for (let i = 0; i < 8; i++) {
        const o = i * 3; const idx = i - ((8 - n) >> 1); const a = u - 0.1 - Math.max(0, idx) * 0.46;
        const p = S[i];
        if (idx < 0 || idx >= n || a < 0) { scl[i] = 0; continue; }
        const f = Math.exp(-a * 1.7);
        pos[o] = p.x; pos[o + 1] = p.y; pos[o + 2] = p.z;
        const tone = 0.45 + 0.1 * phrase[idx]; rgba(i, 1.0, 0.55 + tone * 0.3, 0.12 + tone * 0.25, Math.min(1, 1.6 * f));
        scl[i] = (0.7 + 3.2 * (1 - f) * f * 2.0 + 1.4 * f) * 1.2;
      }
      clear(8, EVENT_SLOTS);
    }
    geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true; geo.attributes.aS.needsUpdate = true;
  }

  // thaw: drips from the icicles (a fall of about two seconds each, staggered) and sparkling puddles by the doors
  const dripAt = (i) => { const c = P.COTTAGES[i % P.COTTAGES.length]; const n = Math.round(c.w * 1.6); const e = (i * 5 + 1) % n; const lx = -c.w / 2 - 0.1 + ((c.w + 0.2) * (e + 0.5)) / n; const s = Math.sin(c.yaw); const co = Math.cos(c.yaw); const lz = c.d / 2 + 0.36; return { x: c.x + lx * co + lz * s, z: c.z - lx * s + lz * co, y0: P.snowY(c.x, c.z) + c.h - 0.2, ph: hash(i, 8) }; };
  const drips = Array.from({ length: POOL.drips }, (_, i) => dripAt(i));
  const puddles = Array.from({ length: POOL.puddles }, (_, i) => { const dr = doors[i % doors.length]; const a = 1.7 + i * 2.3; const r = 1.3 + 0.8 * hash(i, 9); return { x: dr.x + Math.cos(a) * r, z: dr.z + Math.sin(a) * r, ph: hash(i, 10) }; });
  function drawThaw(t) {
    for (let i = 0; i < POOL.drips; i++) {
      const k = EVENT_SLOTS + i; const o = k * 3; const dd = drips[i];
      if (low && i % 2) { scl[k] = 0; continue; }
      const u = (t * 0.45 + dd.ph * 4) % 1; // 0 hangs, then falls
      const y = u < 0.55 ? dd.y0 - 0.04 * (u / 0.55) : dd.y0 - 0.04 - Math.pow((u - 0.55) / 0.45, 2) * (dd.y0 - P.snowY(dd.x, dd.z) - 0.1);
      pos[o] = dd.x; pos[o + 1] = y; pos[o + 2] = dd.z; rgba(k, 0.3, 0.6, 1.0, 0.9);
      scl[k] = 0.11 + 0.1 * (u < 0.55 ? u / 0.55 : 0.8);
    }
    for (let i = 0; i < POOL.puddles; i++) {
      const k = EVENT_SLOTS + POOL.drips + i; const o = k * 3; const p = puddles[i];
      if (low && i % 2) { scl[k] = 0; continue; }
      const f = Math.pow(Math.max(0, Math.sin(t * (1.1 + p.ph) + p.ph * 40)), 6);
      pos[o] = p.x; pos[o + 1] = P.snowY(p.x, p.z) + 0.06; pos[o + 2] = p.z; rgba(k, 0.55, 0.85, 1.0, Math.min(1, 0.12 + 1.1 * f));
      scl[k] = 0.4 + 1.0 * f;
    }
    geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true; geo.attributes.aS.needsUpdate = true;
  }
  if (look.drips) drawThaw(0);

  return {
    state: st, look, points: pts, active: true,
    trigger(kind) { st.pending = kind; return true; }, // for the picture page and the tests: start this surprise at the next update
    update(dt, t, catPos, camera) {
      const d = dt > 0 ? Math.min(dt, 0.1) : 0;
      if (look.drips) drawThaw(t);
      if (!camera?.position) return;
      if (st.pending) { const k = st.pending; st.pending = null; start(k, t, camera, catPos); } // (a forced one takes over from whatever is on)
      else if (!st.kind) {
        if (t >= st.next) { st.next = t + WONDER.min + WONDER.span * hash(st.events + 1, 18); start(pick(catPos), t, camera, catPos); }
      }
      if (st.kind) drawEvent(t, d, camera);
    },
    dispose() { scene.remove(pts, aur); geo.dispose(); mat.dispose(); aGeo.dispose(); aMat.dispose(); for (const u of undo.reverse()) u(); },
  };
}
