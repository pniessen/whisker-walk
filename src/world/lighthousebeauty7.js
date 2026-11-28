// =============================================================================
// LIGHTHOUSE POINT: BEAUTY PASS 7 (2026-11-28), photogenic vistas. NET ZERO triangles, no mesh, no caster, no light, no collider, nothing she can stand on.
// Five spots kids photograph (the arrival beach looking at the tower, the pier and its boats, the cliff path over the bay, the tide pools, the tower door).
// Near each one, and only there (it eases in and out as she walks):
//   * the day's light is graded after the weather's: the sun a warmer gold, the fill warm (it is the rim on her fur), the fog a violet far band, the frame a little darker;
//   * three bands of haze (warm sand, teal sea, violet horizon) and a soft glow at the focal point: pooled points, no triangle;
//   * the beach bushes nearest the spot grow a third so the screen's edge is framed;
//   * a GOLDEN MOMENT: stand still 3 s and sparkle plays on the water (or round the door) with one soft chime (the walk's own audio only), once per vista per visit.
// Draws no random number and reads no clock (time arrives as `t`). Reduced motion: the grade and haze stand still, no golden moment. Lite: fewer points.
// =============================================================================
import * as THREE from 'three';
import { dotTex } from './lighthouseweather.js';

const hash = (n) => { let h = (n * 374761393 + 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const sstep = (u) => { const x = u < 0 ? 0 : u > 1 ? 1 : u; return x * x * (3 - 2 * x); };

/** the five spots: where she stands (x, z), the focal point (fx, fy, fz), the warm key, the violet far haze, and where the golden moment sparkles (box x0, z0, x1, z1 at height y) */
const PL = [[16, 22, 1.8], [26, 26, 1.5], [22, 12, 1.9], [12, 14, 1.4], [30, 18, 1.2]]; // the tide pools' water (discs x, z, r)
const SEA = [[50, 14, 11], [52, 28, 9], [48, 2, 9]]; // the east sea in view
export const VISTAS = Object.freeze([
  Object.freeze({ id: 'arrival', x: 14, z: 36, fx: -22, fy: 14.2, fz: -20, key: [1, 0.74, 0.42], far: [0.72, 0.62, 0.95], spark: PL, sy: 0.3 }),
  Object.freeze({ id: 'pier', x: 30, z: 18, fx: 46, fy: 2.6, fz: 21, key: [1, 0.7, 0.36], far: [0.7, 0.6, 0.96], spark: [...SEA, PL[4]], sy: 0.2 }),
  Object.freeze({ id: 'cliff', x: -10, z: 16, fx: 21, fy: 1.5, fz: 26, key: [1, 0.78, 0.46], far: [0.74, 0.64, 0.94], spark: [...PL.slice(0, 4), SEA[0]], sy: 0.3 }),
  Object.freeze({ id: 'pools', x: 18, z: 28.5, fx: 22, fy: 1.5, fz: 12, key: [1, 0.76, 0.44], far: [0.7, 0.62, 0.96], spark: [...PL, SEA[0]], sy: 0.3 }),
  Object.freeze({ id: 'door', x: -14, z: -12, fx: -18.4, fy: 8.2, fz: -18.4, key: [1, 0.68, 0.32], far: [0.78, 0.6, 0.9], spark: [[-18.6, -18.2, 1.3], [-19.4, -16.8, 1.1], [-17.6, -19.4, 1.0]], sy: 8.2 }),
]);
export const VISTA_R = 5;
export const GOLDEN = Object.freeze({ still: 3, hold: 9, fade: 2.5 });
export const V7 = Object.freeze({ band: Object.freeze({ high: 9, low: 6, lite: 3 }), glow: Object.freeze({ high: 2, low: 2, lite: 1 }), trail: Object.freeze({ high: 6, low: 4, lite: 2 }), glit: Object.freeze({ high: 24, low: 16, lite: 8 }) });
const BAND = Object.freeze([{ d: 14, spread: 8, g: 0.11, rgb: [1, 0.72, 0.4] }, { d: 28, spread: 14, g: 0.06, rgb: [0.4, 0.78, 0.8] }, { d: 50, spread: 24, g: 0.13, rgb: [0.72, 0.6, 0.96] }]);

/** The nearest vista and how strongly she is in it: fills out { v, w } (v = index or -1, w 0..1). Pure. */
export function vistaAt(x, z, out = { v: -1, w: 0 }) {
  out.v = -1; out.w = 0;
  for (let i = 0; i < VISTAS.length; i++) { const w = sstep(1 - Math.hypot(x - VISTAS[i].x, z - VISTAS[i].z) / VISTA_R); if (w > out.w) { out.w = w; out.v = i; } }
  return out;
}
/** Eases the state { v, w } toward the target: leaves one vista before taking up the next, no jump. Pure. */
export function easeVista(st, tgt, dt) {
  const k = 1 - Math.exp(-Math.max(0, dt) / 0.6);
  if (st.v !== tgt.v && st.w > 0.02) { st.w += (0 - st.w) * k; return st; }
  if (st.v !== tgt.v) st.v = tgt.v;
  st.w += (tgt.w - st.w) * k; if (tgt.v < 0 && st.w < 0.004) { st.w = 0; st.v = -1; }
  return st;
}
export const newGolden = () => ({ still: 0, age: 0, on: false, armed: true, k: 0 });
/** The golden moment: st { still, age, on, armed, k }. Each frame; returns true on the one frame the chime is due. Three still seconds inside a vista starts it; it holds,
 *  fades, and does not come again until she has left that vista (w under 0.15). st.k (0..1) is the sparkle's strength. Pure (dt drives it). */
export function goldenStep(st, dt, w, moving) {
  if (w < 0.15) { st.armed = true; st.on = false; st.still = 0; }
  else if (moving) st.still = 0; else if (dt > 0) st.still += dt;
  let chime = false;
  if (!st.on && st.armed && w > 0.5 && st.still >= GOLDEN.still) { st.on = true; st.armed = false; st.age = 0; chime = true; }
  if (st.on) { st.age += Math.max(0, dt); if (moving && st.age > 1.5) st.on = false; if (st.age > GOLDEN.hold) st.on = false; }
  st.k += ((st.on ? 1 : 0) - st.k) * Math.min(1, Math.max(0, dt) / (st.on ? 0.8 : GOLDEN.fade / 3)); if (st.k < 0.003) st.k = 0;
  return chime;
}

/** The grade (after the day's and the weather's own): `vs` { v, w }, `q` 0..1 how much weather or night mutes it. */
const nudge = (c, r, g, b, k) => { c.r += (r - c.r) * k; c.g += (g - c.g) * k; c.b += (b - c.b) * k; };
export function gradeVista(vs, q, { fog, sun, fill, scene }) {
  if (vs.v < 0 || vs.w < 0.004) return;
  const V = VISTAS[vs.v]; const w = vs.w * (1 - q);
  if (sun) { nudge(sun.color, V.key[0], V.key[1], V.key[2], 0.75 * w); sun.intensity *= 1 + 0.2 * w; }
  if (fill) nudge(fill.color, V.key[0], V.key[1] * 0.95, V.key[2] * 0.8, 0.8 * w); // the cat's rim on her fur reads this
  if (fog) { nudge(fog.color, V.far[0], V.far[1], V.far[2], 0.55 * w); fog.far *= 1 + 0.08 * w; }
  if (scene) { if (scene.environmentIntensity !== undefined) scene.environmentIntensity *= 1 - 0.3 * w; if (scene.backgroundIntensity !== undefined) scene.backgroundIntensity *= 1 - 0.12 * w; }
}

/** One point's place and glow at time t: fills out { x, y, z, g }. kind 'haze' (band i), 'glow' (i), 'spark' (trail or water glitter, i). cat c { x, y, z }, ground height gy. */
export function vistaPoint(kind, i, n, t, vs, k, c, gy, out) {
  out.x = c.x; out.z = c.z; out.y = -50; out.g = 0;
  if (vs.v < 0 || vs.w < 0.004) return out;
  const V = VISTAS[vs.v]; const w = vs.w;
  if (kind === 'haze') {
    let dx = V.fx - c.x; let dz = V.fz - c.z; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L; const b = BAND[i % 3]; const lat = (hash(i * 7 + 3) - 0.5) * 2 * b.spread;
    out.x = c.x + dx * b.d - dz * lat; out.z = c.z + dz * b.d + dx * lat; out.y = Math.max(gy, 0) + [1.6, 1.2, 3.4][i % 3] + 1.5 * hash(i * 7 + 4);
    out.g = b.g * w * (0.85 + 0.15 * Math.sin(t * 0.3 + i * 2));
  } else if (kind === 'glow') {
    out.x = V.fx; out.y = V.fy; out.z = V.fz; out.g = (i ? 0.08 : 0.17) * w * (0.9 + 0.1 * Math.sin(t * 1.1 + i)) * (1 + 0.7 * k);
  } else if (i < n.trail) {
    const u = (((t * 0.3 + i / n.trail) % 1) + 1) % 1; const a = t * 0.9 + i * 2.4; const r = 0.5 + 0.55 * u;
    out.x = c.x + Math.cos(a) * r; out.z = c.z + Math.sin(a) * r; out.y = gy + 0.15 + u * 1.5; out.g = k * Math.sin(u * Math.PI) * 1.3;
  } else {
    const j = i - n.trail; const D = V.spark[j % V.spark.length]; const ra = hash(j * 5 + 3) * 6.283; const rr = D[2] * Math.sqrt(hash(j * 5 + 4)); const tw = Math.max(0, Math.sin(t * (1.4 + 2 * hash(j * 5 + 1)) + hash(j * 5 + 2) * 6.28)) ** 3;
    out.x = D[0] + Math.cos(ra) * rr; out.z = D[1] + Math.sin(ra) * rr; out.y = V.sy + (V.sy > 1 ? 2.2 * hash(j * 5 + 5) : 0); out.g = k * tw * 1.6;
  }
  return out;
}

const pts = (size, att, name, n, rootScene) => {
  const geo = new THREE.BufferGeometry(); const pos = new Float32Array(n * 3); const col = new Float32Array(n * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const p = new THREE.Points(geo, new THREE.PointsMaterial({ map: dotTex(), size, sizeAttenuation: att, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  p.name = name; p.visible = false; p.castShadow = false; p.receiveShadow = false; p.frustumCulled = false; p.userData.noMerge = true; p.userData.noCast = true; p.renderOrder = 8;
  rootScene?.add(p);
  return { p, pos, col, geo, n };
};

/** The vistas' life: update(dt, t, catPos, wx (the weather: state + rig), sound) after the weather's own update; dispose(). */
export function createLighthouseVistas({ scene, ground = null, reducedMotion = false, lite = false, low = false } = {}) {
  const rung = lite ? 'lite' : low ? 'low' : 'high'; const still = !!reducedMotion;
  const dpr = typeof window !== 'undefined' ? Math.min(2, window.devicePixelRatio || 1) : 1;
  const nH = V7.band[rung]; const nG = V7.glow[rung]; const n = { trail: V7.trail[rung] }; const nS = n.trail + V7.glit[rung];
  const haze = pts(8, true, 'lighthouse:vistas-haze', nH, scene); const glow = pts(90 * dpr, false, 'lighthouse:vistas-glow', nG, scene); const spark = pts(15 * dpr, false, 'lighthouse:vistas-spark', nS, scene);
  const vs = { v: -1, w: 0 }; const tg = { v: -1, w: 0 }; const gold = newGolden(); const o = { x: 0, y: 0, z: 0, g: 0 }; const cat = { x: 0, y: 0, z: 0 };
  let last = null; let disposed = false; let bushes = null; let sand = null; let sand0 = null; const count = { chimes: 0 };
  const rgbOf = (kind, i, k) => (kind === 'haze' ? BAND[i % 3].rgb : kind === 'glow' ? [1, 0.8, 0.5] : i < n.trail ? [1, 0.85, 0.45] : [1, 0.9, 0.62]).map((v) => v * k);
  function fill(group, kind, t, c, gy, k) {
    for (let i = 0; i < group.n; i++) {
      vistaPoint(kind, i, n, t, vs, k, c, gy, o);
      const [r, g, b] = rgbOf(kind, i, o.g);
      group.pos[i * 3] = o.x; group.pos[i * 3 + 1] = o.y; group.pos[i * 3 + 2] = o.z; group.col[i * 3] = r; group.col[i * 3 + 1] = g; group.col[i * 3 + 2] = b;
    }
    group.geo.attributes.position.needsUpdate = true; group.geo.attributes.color.needsUpdate = true;
  }
  function findBushes() {
    bushes = [];
    for (const [x, z] of [[-6, 38], [26, -12], [24, 38], [-26, 36], [-2, 26], [34, 24]]) {
      let hit = null; scene?.children?.forEach((c) => { if (!hit && Math.abs(c.position.x - x) < 0.01 && Math.abs(c.position.z - z) < 0.01 && !c.isMesh && !c.isPoints) hit = c; });
      if (hit) bushes.push({ o: hit, x, z, s: hit.scale.x });
    }
  }

  function update(dt, t, catPos, wx = null, sound = null) {
    if (disposed) return;
    const st = wx?.state ?? { storm: 0, fog: 0, stars: 0 };
    const q = Math.min(1, Math.max(st.storm, st.fog * 0.7, st.stars * 0.5));
    if (catPos) { cat.x = catPos.x; cat.y = catPos.y ?? 0; cat.z = catPos.z; vistaAt(cat.x, cat.z, tg); }
    else { tg.v = -1; tg.w = 0; }
    if (still) { vs.v = tg.v; vs.w = tg.w; } else easeVista(vs, tg, dt);
    const moving = !!(catPos && last) && dt > 0 && Math.hypot(catPos.x - last.x, catPos.z - last.z) / dt > 0.6;
    last = catPos ? { x: catPos.x, z: catPos.z } : null;
    if (!still && goldenStep(gold, dt, tg.w * (1 - q), moving)) { count.chimes++; sound?.chime?.(); }
    if (wx?.rig) gradeVista(vs, q, { fog: wx.rig.fog, sun: wx.rig.sun, fill: wx.rig.fill, scene });
    const on = vs.v >= 0 && vs.w > 0.004;
    haze.p.visible = glow.p.visible = on && q < 0.6; // (clear weather only)
    spark.p.visible = on && gold.k > 0.004;
    if (on) {
      const gy = ground?.y ? ground.y(cat.x, cat.z) : 0; const tt = still ? 0 : t;
      const dim = 1 - q;
      fill(haze, 'haze', tt, cat, gy, dim); fill(glow, 'glow', tt, cat, gy, gold.k);
      if (spark.p.visible) fill(spark, 'spark', tt, cat, gy, gold.k);
    }
    // the foreground: the sand a little warmer and deeper while she is in a vista (the frame's edge dims)
    if (sand === null) { scene?.traverse?.((m) => { if (!sand && m.userData?.duskLawnTint && m.material?.color) sand = m; }); sand = sand || false; if (sand) sand0 = sand.material.color.clone(); }
    if (sand) { const w = vs.v < 0 ? 0 : vs.w * (1 - q); sand.material.color.setRGB(sand0.r * (1 - 0.1 * w), sand0.g * (1 - 0.17 * w), sand0.b * (1 - 0.27 * w)); }
    // framing: the beach bushes nearest the spot grow a third while she is there
    if (!bushes) findBushes();
    for (const b of bushes) { const w = vs.v < 0 ? 0 : Math.max(0, 1 - Math.hypot(b.x - VISTAS[vs.v].x, b.z - VISTAS[vs.v].z) / 14) * vs.w; b.o.scale.setScalar(b.s * (1 + 0.33 * w * (1 - q))); }
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const g of [haze, glow, spark]) { scene?.remove(g.p); g.geo.dispose(); g.p.material.map?.dispose(); g.p.material.dispose(); }
    for (const b of bushes ?? []) b.o.scale.setScalar(b.s);
    if (sand) sand.material.color.copy(sand0);
  }
  return { update, dispose, state: vs, gold, count, haze: haze.p, glow: glow.p, spark: spark.p };
}
