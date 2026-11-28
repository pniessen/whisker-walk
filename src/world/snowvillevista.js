// =============================================================================
// SNOWVILLE: BEAUTY PASS 7, PHOTOGENIC VISTAS. No mesh, no light, no triangle: TWO Points ("snowville:vista" in ordinary alpha, "snowville:vistaglow" added; a size of its own for each dot) and a small
// grade of the light the place already has (the fog colour, the hemisphere fill and the sun, moved a little and put back). Five natural photo spots: the arrival lane looking at the village fir,
// the pond looking at the cottages, the sled hill's ridge, the cocoa stall and the snowman lane. Where she stands at one of them, facing its focus, the picture composes itself:
//   * depth: haze in three bands (warm in front, blue between, violet-and-gold far off);
//   * the focus glows (a warm rim, a few slanting light shafts) and her fur takes a warm edge from the fill;
//   * the edges quieten (soft dark-violet dots at the screen's rim) with a touch of frost glitter in the top corners, a warm grade over everything;
//   * the GOLDEN MOMENT: she stands still for three seconds and a faint sparkle trail drifts from her toward the focus with a soft chime (once at each spot per visit). Never in reduced motion.
// Reduced motion: the composition is still (no drift, no moment). The lite rungs draw fewer dots. Muted: silent. No Math.random; no clock (time arrives as `t`).
// =============================================================================

import * as THREE from 'three';
import { dotTexture } from './snowvilleparts.js';
import { carolChime } from './snowvillesound.js';

const c01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a, b, x) => { const u = c01((x - a) / (b - a)); return u * u * (3 - 2 * u); };
// id, where she stands (x, z), the focus (x, y, z), its glow colour
const V = (id, x, z, fx, fy, fz, hue) => Object.freeze({ id, x, z, fx, fy, fz, hue, r: 3.4 });
export const VISTAS = Object.freeze([
  V('lane', -0.6, 21.5, -4, 3.4, 8, 0xffb866), // the village fir at the end of the lane
  V('pond', -19, -3.5, -10, 1.6, -5, 0xffa85a), // the cottages beyond the ice
  V('ridge', 14, -6, 22, 3.6, -18, 0xffcf8a), // the sled hill's crest against the far ridge
  V('stall', 3.3, 9.6, 6.5, 1.5, 7.5, 0xff9a50), // the cocoa stall's glow
  V('snowman', 8.3, 19.8, 4, 1.2, 18, 0xffc27a), // the snowman on its lane
]);
export const GOLDEN = Object.freeze({ still: 3, dur: 5.5, n: 24, ease: 1.6 });
export const BANDS = Object.freeze([{ d: 3.4, size: 2.2, a: 0.2, hex: 0xffb87a, n: 3 }, { d: 14, size: 7, a: 0.26, hex: 0x7fa0f0, n: 4 }, { d: 34, size: 17, a: 0.3, hex: 0xa88af0, n: 4 }]);

// How much a vista holds (0 .. 1) for a viewer at (x, z) looking along (dx, dz): near its spot and facing its focus. Pure.
export function vistaWeight(v, x, z, dx, dz) {
  const near = smooth(v.r, v.r * 0.35, Math.hypot(x - v.x, z - v.z));
  const hx = v.fx - x; const hz = v.fz - z; const L = Math.hypot(hx, hz) || 1; const D = Math.hypot(dx, dz) || 1;
  return near * smooth(0.55, 0.9, (hx * dx + hz * dz) / (L * D));
}
export const bestVista = (x, z, dx, dz, out = { v: -1, w: 0 }) => { out.v = -1; out.w = 0; VISTAS.forEach((v, i) => { const w = vistaWeight(v, x, z, dx, dz); if (w > out.w) { out.w = w; out.v = i; } }); return out; };
// Sparkle i of the golden moment, u = seconds since it began: a rising swirl from her to the focus; { x, y, z, a } (a = brightness 0 .. 1). Pure.
export function goldenAt(i, u, from, v, out = { x: 0, y: 0, z: 0, a: 0 }) {
  const s = (u - (i / GOLDEN.n) * GOLDEN.ease) / (GOLDEN.dur - GOLDEN.ease); if (s <= 0 || s >= 1) { out.a = 0; return out; }
  const e = s * s * (3 - 2 * s) * 0.7; const sw = i * 2.4 + s * 5;
  out.x = from.x + (v.fx - from.x) * e + 0.45 * (1 - s) * Math.cos(sw); out.z = from.z + (v.fz - from.z) * e + 0.45 * (1 - s) * Math.sin(sw);
  out.y = from.y + 0.5 + (v.fy - from.y) * e * 0.8 + 0.5 * Math.sin(s * 3.1416) + 0.15 * Math.sin(sw * 1.7); out.a = Math.sin(s * 3.1416);
  return out;
}

export function createVista({ scene, sun = null, fill = null, audio = null, reducedMotion = false, low = false }) {
  const st = { w: 0, v: -1, still: 0, done: VISTAS.map(() => false), gold: -1, t0: 0, from: { x: 0, y: 0, z: 0 }, lx: 1e9, lz: 1e9, enabled: true, count: 0 };
  const NB = BANDS.reduce((s, b) => s + (low ? Math.ceil(b.n / 2) : b.n), 0); const NE = low ? 5 : 9; const NA = NB + NE;
  const NG = low ? 12 : GOLDEN.n; const NS = low ? 3 : 6; const NF = low ? 2 : 4; const NC = 2 + NS + NF + NG;
  const layer = (n, name, additive) => {
    const pos = new Float32Array(n * 3); const col = new Float32Array(n * 4); const scl = new Float32Array(n);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 4)); g.setAttribute('aS', new THREE.BufferAttribute(scl, 1));
    const m = new THREE.PointsMaterial({ map: dotTexture(), alphaTest: 0.01, size: 1, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 1, depthWrite: false, depthTest: true, fog: !!additive, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    m.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('void main() {', 'attribute float aS;\nvoid main() {').replace('gl_PointSize = size;', 'gl_PointSize = size * aS;'); };
    const o = new THREE.Points(g, m); o.name = name; o.frustumCulled = false; o.renderOrder = additive ? 5 : 6; o.visible = false;
    Object.assign(o.userData, { noCast: true, noContactShadow: true, noMerge: true });
    scene.add(o);
    return { o, g, m, pos, col, scl, set(i, x, y, z, r, gg, b, a, s) { pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z; col[i * 4] = r; col[i * 4 + 1] = gg; col[i * 4 + 2] = b; col[i * 4 + 3] = c01(a); scl[i] = a > 0.003 ? s : 0; } };
  };
  const A = layer(NA, 'snowville:vista', false); const B = layer(NC, 'snowville:vistaglow', true);
  const c = new THREE.Color(); const fw = new THREE.Vector3(); const rt = new THREE.Vector3(); const up = new THREE.Vector3(); const tmp = { x: 0, y: 0, z: 0, a: 0 };
  const EDGE = [[-1.2, 1.02], [0, 1.08], [1.2, 1.02], [-1.9, 0.5], [-2, -0.3], [1.9, 0.5], [2, -0.3], [-1.7, -0.95], [1.7, -0.95]];
  const warmFog = new THREE.Color(0xffc490);
  const sF = new THREE.Color(1, 1, 1); const nF = new THREE.Color();
  const factor = (target, applied, to) => { if (!target) return; target.r *= to.r / applied.r; target.g *= to.g / applied.g; target.b *= to.b / applied.b; applied.copy(to); };
  const off = (L) => { for (let i = 0; i < L.scl.length; i++) L.scl[i] = 0; L.g.attributes.aS.needsUpdate = true; };

  function update(dt, t, catPos, camera, session) {
    const cx = catPos?.x ?? 0; const cz = catPos?.z ?? 30; const cy = catPos?.y ?? 0;
    if (camera?.getWorldDirection) camera.getWorldDirection(fw); else fw.set(0, 0, -1);
    const fl = Math.hypot(fw.x, fw.z) || 1; const dx = fw.x / fl; const dz = fw.z / fl;
    bestVista(cx, cz, dx, dz, tmp);
    const target = st.enabled ? tmp.w : 0; if (tmp.v >= 0 && target > 0.02) st.v = tmp.v;
    st.w = reducedMotion ? target : st.w + (target - st.w) * Math.min(1, dt * 1.8);
    if (st.w < 0.003) st.w = 0;
    const w = st.w; const v = VISTAS[st.v] ?? VISTAS[0];
    // ---- the grade: warm fog, warm fill (her rim), warm sun; absolute on the fog and fill (the weather sets them each frame before this), a factor on the sun
    if (scene.fog && w > 0) scene.fog.color.lerp(warmFog, 0.3 * w);
    if (fill && w > 0) { fill.color.r *= 1 + 0.2 * w; fill.color.g *= 1 + 0.07 * w; fill.color.b *= 1 - 0.16 * w; if (fill.groundColor) { fill.groundColor.r *= 1 + 0.16 * w; fill.groundColor.g *= 1 + 0.05 * w; fill.groundColor.b *= 1 - 0.12 * w; } }
    if (sun) factor(sun.color, sF, nF.setRGB(1 + 0.1 * w, 1 - 0.03 * w, 1 - 0.24 * w));
    // ---- the golden moment: still for three seconds, once per vista per visit
    const moved = Math.hypot(cx - st.lx, cz - st.lz); st.lx = cx; st.lz = cz;
    st.still = moved > Math.max(0.0008, dt * 0.12) ? 0 : st.still + dt;
    if (!reducedMotion && st.gold < 0 && st.enabled && w > 0.7 && st.still >= GOLDEN.still && !st.done[st.v]) {
      st.gold = st.v; st.done[st.v] = true; st.t0 = t; st.count++; st.from.x = cx; st.from.y = cy; st.from.z = cz; carolChime(audio, st.v + 3);
    }
    if (st.gold >= 0 && t - st.t0 > GOLDEN.dur) st.gold = -1;
    A.o.visible = w > 0; B.o.visible = w > 0 || st.gold >= 0;
    if (!A.o.visible && !B.o.visible) return;
    const cam = camera?.position ?? { x: cx, y: cy + 3, z: cz + 4 };
    const sway = reducedMotion ? 0 : t;
    // ---- A: the haze bands and the quiet edges
    let n = 0;
    const hx = v.fx - cam.x; const hz = v.fz - cam.z; const hl = Math.hypot(hx, hz) || 1; const ax = hx / hl; const az = hz / hl; const sx = -az; const sz = ax;
    for (const b of BANDS) {
      const cnt = low ? Math.ceil(b.n / 2) : b.n; c.setHex(b.hex);
      for (let k = 0; k < cnt; k++) {
        const side = (k - (cnt - 1) / 2) * (b.d < 6 ? 1.3 : b.d * 0.42) + 0.5 * Math.sin(sway * 0.21 + k * 2.1 + b.d); const gy = (b.d < 6 ? cy + 0.3 : cy + 0.8 + b.d * 0.02);
        const bc = b.d > 20 && k % 2 ? 0xffc070 : b.hex; c.setHex(bc);
        A.set(n++, cam.x + ax * b.d + sx * side, gy, cam.z + az * b.d + sz * side, c.r, c.g, c.b, b.a * w * (1 + 0.15 * Math.sin(sway * 0.3 + k)), b.size);
      }
    }
    if (camera?.matrixWorld) { rt.setFromMatrixColumn(camera.matrixWorld, 0); up.setFromMatrixColumn(camera.matrixWorld, 1); } else { rt.set(1, 0, 0); up.set(0, 1, 0); }
    const asp = camera?.aspect ?? 1.78; const tf = Math.tan(((camera?.fov ?? 70) * Math.PI) / 360); const D = 1.4; const hh = tf * D; const ez = low ? 2 : 1;
    c.setHex(0x2b2a55);
    for (let k = 0; k < NE; k++) { const e = EDGE[(k * ez) % EDGE.length]; const px = e[0] * hh * (asp / 1.78) * 0.98; const py = e[1] * hh;
      A.set(n++, cam.x + fw.x * D + rt.x * px + up.x * py, cam.y + fw.y * D + rt.y * px + up.y * py, cam.z + fw.z * D + rt.z * px + up.z * py, c.r, c.g, c.b, 0.55 * w, 0.95); }
    for (; n < NA; n++) A.scl[n] = 0;
    A.g.attributes.position.needsUpdate = A.g.attributes.color.needsUpdate = A.g.attributes.aS.needsUpdate = true;
    // ---- B: the focus's glow and rim, the slanting shafts, the frost in the top corners, the golden moment's sparkles
    n = 0; c.setHex(v.hue);
    const br = 1 + 0.08 * Math.sin(sway * 1.3);
    B.set(n++, v.fx, v.fy, v.fz, c.r * 0.9 * br, c.g * 0.8 * br, c.b * 0.6 * br, 0.8 * w, 5.5);
    B.set(n++, v.fx, v.fy, v.fz, c.r * 2.2, c.g * 1.8, c.b * 1.2, 0.8 * w, 2 * br);
    for (let k = 0; k < NS; k++) { const u = (k + 0.5) / NS; const s = 0.5 + 0.5 * Math.sin(sway * 0.4 + k * 1.7);
      B.set(n++, v.fx + (-ax * 2.2 + sx * 2.5) * (1 - u) * 1.2, v.fy + 7 * (1 - u) + 0.6, v.fz + (-az * 2.2 + sz * 2.5) * (1 - u) * 1.2, c.r * 0.9, c.g * 0.75, c.b * 0.45, 0.3 * w * (0.6 + 0.4 * s) * (0.5 + u), 2.6 + 1.4 * u); }
    c.setHex(0xcfe4ff);
    for (let k = 0; k < NF; k++) { const px = (k % 2 ? 1 : -1) * (1.55 - 0.45 * (k >> 1)) * hh * (asp / 1.78); const py = (0.88 - 0.1 * (k >> 1)) * hh; const tw = reducedMotion ? 0.8 : 0.5 + 0.5 * Math.sin(t * (1.1 + 0.37 * k) + k * 3);
      B.set(n++, cam.x + fw.x * D + rt.x * px + up.x * py, cam.y + fw.y * D + rt.y * px + up.y * py, cam.z + fw.z * D + rt.z * px + up.z * py, c.r * 1.3, c.g * 1.3, c.b * 1.4, 0.5 * w * tw, 0.12); }
    for (let k = 0; k < NG; k++) {
      if (st.gold >= 0) { goldenAt(k * (GOLDEN.n / NG), t - st.t0, st.from, VISTAS[st.gold], tmp); c.setHSL(0.1 + 0.1 * ((k * 7) % 5) / 5, 0.9, 0.7); B.set(n++, tmp.x, tmp.y, tmp.z, c.r * 1.2, c.g * 1.1, c.b * 0.9, tmp.a * 0.95, 0.5); } else B.scl[n++] = 0;
    }
    B.g.attributes.position.needsUpdate = B.g.attributes.color.needsUpdate = B.g.attributes.aS.needsUpdate = true;
  }
  return {
    state: st, update, points: [A.o, B.o],
    get weight() { return st.w; },
    set enabled(v) { st.enabled = !!v; }, get enabled() { return st.enabled; },
    dispose() {
      scene.remove(A.o, B.o); A.g.dispose(); A.m.dispose(); B.g.dispose(); B.m.dispose();
      factor(sun?.color, sF, nF.setRGB(1, 1, 1)); off(A); off(B);
    },
  };
}
