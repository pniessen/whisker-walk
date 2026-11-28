// =============================================================================
// THE CRYSTAL CAVE: ITS DECOR, THE DRAWING (layer 3). Three draws in all, every piece merged and painted in vertex colour (no canvas, no light, no Math.random):
//   * crystal:decorStone  the lit stone: mushroom stems, stalagmites, pebbles
//   * crystal:decorGlow   the glowing things (an unlit vertex-coloured mesh, like the crystals): mushroom caps and the small crystal gardens
//   * crystal:decorLight  one additive mesh: the glowing moss and the pools of light on the floor (black at the rim, so nothing shows where it fades)
// Beauty round 2: hero crystals + halos, chamber colour washes, dome light shafts, rising motes with trails and pool ripples, all in those same meshes. They move in the VERTEX
// SHADER (one time uniform, advanced in update(dt); reduced motion leaves it at 0, so everything stands still). No new mesh, draw, light or caster.
// The plan is world/crystaldecor.js. Built once in the cave's life (the tier is known there).
// =============================================================================

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { litMaterial } from '../render/materials.js';
import * as P from './crystalplan.js';
import { planDecor, planBeauty, planBeauty2, planMist, decorRung, SHAFT_TOP, ZONE_RGB } from './crystaldecor.js';
import * as W from './crystalwingplan.js';
import { drawTales } from './crystaltalesparts.js'; // beauty round 4: small stories

const _a = new THREE.Color(); const _b = new THREE.Color();
const HUE = P.HUE_COLOURS;
const lighten = (hex, k) => _b.setHex(hex).lerp(_a.setScalar(1), k).getHex();
const mixHex = (a, b, k) => _b.setHex(a).lerp(_a.setHex(b), k).getHex();
const darken = (hex, k) => _b.setHex(hex).multiplyScalar(k).getHex();

// A geometry made non-indexed with a normal, a uv and a vertex colour that runs from `lo` (at y 0) to `hi` (at y = top): any two merge.
function tone(geo, lo, hi, top) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  const pos = g.attributes.position; const col = new Float32Array(pos.count * 3);
  const c0 = new THREE.Color(lo); const c1 = new THREE.Color(hi);
  for (let v = 0; v < pos.count; v++) { _a.copy(c0).lerp(c1, Math.min(1, Math.max(0, pos.getY(v) / top))); col[v * 3] = _a.r; col[v * 3 + 1] = _a.g; col[v * 3 + 2] = _a.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
// put it on the floor at (x, z): scaled, turned, leaned, set on the floor's height
function put(geo, x, z, { yaw = 0, lean = 0, sx = 1, sy = 1, sz = 1, dy = 0 } = {}) {
  geo.scale(sx, sy, sz); geo.rotateX(lean); geo.rotateY(yaw); geo.translate(x, P.crystalY(x, z) + dy, z);
  return geo;
}
const cone = (r, h, seg = 5) => new THREE.CylinderGeometry(r * 0.12, r, h, seg, 1, true).translate(0, h / 2, 0);
const stem = (r, h) => new THREE.CylinderGeometry(r * 0.7, r, h, 6, 1, true).translate(0, h / 2, 0);
const cap = (r) => new THREE.SphereGeometry(r, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2);

// ---- the three meshes' parts ------------------------------------------------------------------------------------------------
function mushrooms(list, stone, glow) {
  list.forEach((m, i) => {
    const hex = HUE[m.hue];
    m.parts.forEach((p, j) => {
      const x = m.x + p.dx; const z = m.z + p.dz; const h = 0.12 + p.s * 0.8;
      stone.push(put(tone(stem(p.s * 0.2, h), 0xd8c8c0, 0xf4e8dc, h), x, z, { lean: p.lean * 0.5, yaw: p.yaw }));
      const r = p.s * 0.55 + 0.07;
      glow.push(put(tone(cap(r), darken(hex, 0.55), lighten(hex, 0.25 + 0.1 * ((i + j) % 3)), r), x, z, { yaw: p.yaw, lean: p.lean * 0.5, sy: 0.7, dy: h * 0.92 }));
    });
  });
}
function gardens(list, glow) {
  list.forEach((m) => {
    const hex = HUE[m.hue];
    m.parts.forEach((p, j) => {
      const h = 0.18 + p.s * 1.1; const r = 0.05 + p.s * 0.09;
      glow.push(put(tone(cone(r, h, 6), darken(hex, 0.6), lighten(hex, 0.3 + 0.12 * (j % 2)), h), m.x + p.dx, m.z + p.dz, { lean: p.lean * 2, yaw: p.yaw }));
    });
  });
}
function stalagmites(list, stone) {
  list.forEach((g, i) => g.parts.forEach((p, j) => {
    const hex = HUE[g.hue]; const r = 0.14 + p.s * 0.7;
    stone.push(put(tone(cone(r, p.h * 1.3, 6), mixHex(0x8a76a0, hex, 0.3), lighten(hex, 0.62), p.h * 1.3), g.x + p.dx, g.z + p.dz, { yaw: p.yaw + i + j, lean: p.lean * 0.4, dy: -0.15 }));
  }));
}
function pebbles(list, stone) {
  list.forEach((m, i) => m.parts.forEach((p, j) => {
    const tint = [0x8a7a8c, 0x9a8a9c, 0xa89aa0, 0x7c6c82][(i + j) % 4];
    stone.push(put(tone(new THREE.OctahedronGeometry(p.s, 0), darken(tint, 0.8), tint, p.s * 1.5), m.x + p.dx, m.z + p.dz, { yaw: p.yaw, sy: 0.55, dy: p.s * 0.2 }));
  }));
}

// Secondary small crystals round the great clusters: a hue-tinted shard (dark at its foot, pale at its tip) and, on some, a glint on the tip (two crossed diamonds in the additive mesh).
function shards(list, glow, light) {
  list.forEach((g, i) => g.parts.forEach((p, j) => {
    const hex = HUE[g.hue]; const x = g.x + p.dx; const z = g.z + p.dz;
    glow.push(put(tone(cone(p.s, p.h, 4), darken(hex, 0.5), lighten(hex, 0.5 + 0.1 * ((i + j) % 3)), p.h), x, z, { lean: p.lean, yaw: p.yaw }));
    if (p.glint) light.push(glint(x, P.crystalY(x, z) + p.h + 0.06, z, 0.13 + 0.07 * ((i + j) % 3), hex, p.yaw));
  }));
}
// two crossed diamonds, bright in the middle and black at the corners (so the additive blend leaves a four-point star)
function glint(x, y, z, r, hex, yaw) {
  _a.setHex(hex).lerp(_b.setScalar(1), 0.55);
  const pos = []; const col = [];
  for (const rot of [0, Math.PI / 2]) {
    const ca = Math.cos(yaw + rot); const sa = Math.sin(yaw + rot);
    const c = [[0, 0, 0.9], [r * 1.8, 0, 0], [0, r * 1.8, 0], [-r * 1.8, 0, 0], [0, -r * 1.8, 0]];
    const v = (k) => { const q = c[k]; pos.push(x + q[0] * ca, y + q[1], z + q[0] * sa); const f = q[2]; col.push(_a.r * f, _a.g * f, _a.b * f); };
    for (let k = 1; k <= 4; k++) { v(0); v(k); v(k === 4 ? 1 : k + 1); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}
// A glowing mineral vein: a thin ribbon wandering over the floor, brightest in the middle, black at both ends, with a short fork.
function vein(v) {
  const pos = []; const col = []; const hex = HUE[v.hue];
  _a.setHex(hex).lerp(_b.setScalar(1), 0.4);
  const ribbon = (ox, oz, ang, len, w, k) => {
    const n = 5; const ca = Math.cos(ang); const sa = Math.sin(ang); const pts = [];
    for (let s = 0; s <= n; s++) {
      const t = s / n; const off = Math.sin(t * 5 + v.wob) * 0.18;
      const cx = ox + ca * (t - 0.5) * len - sa * off; const cz = oz + sa * (t - 0.5) * len + ca * off;
      const f = k * Math.sin(Math.PI * t) ** 0.8;
      pts.push({ lx: cx - sa * w, lz: cz + ca * w, rx: cx + sa * w, rz: cz - ca * w, f });
    }
    for (let s = 0; s < n; s++) {
      const a = pts[s]; const b = pts[s + 1];
      const q = [[a.lx, a.lz, a.f], [a.rx, a.rz, a.f], [b.lx, b.lz, b.f], [b.rx, b.rz, b.f]];
      for (const idx of [[0, 1, 2], [1, 3, 2]]) for (const m of idx) { const [px, pz, f] = q[m]; pos.push(px, P.crystalY(px, pz) + 0.04, pz); col.push(_a.r * f, _a.g * f, _a.b * f); }
    }
  };
  ribbon(v.x, v.z, v.ang, v.len, 0.07, 0.6);
  ribbon(v.x + Math.cos(v.ang) * 0.3, v.z + Math.sin(v.ang) * 0.3, v.ang + 0.8 + v.fork * 0.5, v.len * 0.45, 0.045, 0.45);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}
// small floor stalagmites: a few short spikes in a clump, grey at the foot and hue-tinted at the tip
function minis(list, stone) {
  list.forEach((m, i) => m.parts.forEach((p, j) => {
    stone.push(put(tone(cone(0.06 + p.s * 0.9, p.h, 5), mixHex(0x8a76a0, HUE[m.hue], 0.3), lighten(HUE[m.hue], 0.6), p.h), m.x + p.dx, m.z + p.dz, { yaw: p.yaw + i + j, lean: p.lean * 0.3, dy: -0.04 }));
  }));
}

// A flat disc of rings that follows the floor: `col(t)` is the colour at t (0 in the middle, 1 at the rim); the rim colour is black, so the additive blend fades to nothing.
function disc(x, z, r, wob, col, rings = 3, seg = 12) {
  const pos = []; const colr = []; const idx = [];
  for (let ri = 0; ri <= rings; ri++) {
    const t = ri / rings;
    for (let s = 0; s < (ri === 0 ? 1 : seg); s++) {
      const a = (s / seg) * Math.PI * 2;
      const rr = r * t * (1 + (ri === rings ? 0.18 * Math.sin(a * 3 + wob) : 0));
      const px = x + Math.cos(a) * rr; const pz = z + Math.sin(a) * rr;
      pos.push(px, P.crystalY(px, pz) + 0.05, pz);
      const c = col(t); colr.push(c[0], c[1], c[2]);
    }
  }
  const at = (ri, s) => (ri === 0 ? 0 : 1 + (ri - 1) * seg + (s % seg));
  for (let s = 0; s < seg; s++) idx.push(0, at(1, s + 1), at(1, s));
  for (let ri = 1; ri < rings; ri++) for (let s = 0; s < seg; s++) idx.push(at(ri, s), at(ri, s + 1), at(ri + 1, s), at(ri, s + 1), at(ri + 1, s + 1), at(ri + 1, s));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
  g.setIndex(idx);
  return g.toNonIndexed();
}
const TAME = { blue: 0.3, gold: 0.72 }; // (pass 4: gold's wash was nearly as blown out as the blue; blue 0.4 -> 0.3)
const tame = (hue) => TAME[hue] ?? 1;
const BLUE_TAME = 0.3; // the Blue Pool's cyan was blown out in one shot (pass 2): every blue light layer is drawn at this share
const fade = (hex, k) => { _a.setHex(hex); return (t) => { const f = k * (1 - t) ** 1.6; return [_a.r * f, _a.g * f, _a.b * f]; }; };
function lights(d, out) {
  d.pockets.forEach((p) => out.push(disc(p.x, p.z, p.r, p.wob, (t) => { const f = 0.16 * (1 - t) ** 1.5; return [p.rgb[0] * f, p.rgb[1] * f, p.rgb[2] * f]; }, 3, 12)));
  d.veins.forEach((v) => out.push(vein(v)));
  d.pools.forEach((p, i) => out.push(disc(p.x, p.z, p.r, i, fade(HUE[p.hue], (0.3 * p.k + 0.12) * tame(p.hue)), 3, 14)));
  d.moss.forEach((m, i) => {
    const c = [[0.22, 0.62, 0.34], [0.3, 0.7, 0.4], [0.18, 0.55, 0.5]][i % 3];
    out.push(disc(m.x, m.z, m.r, m.wob, (t) => { const f = 0.55 * (1 - t) ** 1.2 * (0.8 + 0.2 * Math.sin(t * 17 + m.wob)); return [c[0] * f, c[1] * f, c[2] * f]; }, 3, 9));
  });
}

// ---- beauty round 2: the drawing ------------------------------------------------------------------------------------------------
// Every geometry in the glow and light meshes carries aMove (kind, phase, speed, extent) and aCen (a centre): kind 0 still, 1 a rising mote, 2 a shaft that breathes,
// 3 a pool ripple that spreads and fades, 4 a pulse wave that sweeps out from the cave's middle through everything glowing.
function tag(geo, kind, ph = 0, sp = 0, ext = 0, cx = 0, cy = 0, cz = 0) {
  const n = geo.attributes.position.count; const m = new Float32Array(n * 4); const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { m[i * 4] = kind; m[i * 4 + 1] = ph; m[i * 4 + 2] = sp; m[i * 4 + 3] = ext; c[i * 3] = cx; c[i * 3 + 1] = cy; c[i * 3 + 2] = cz; }
  geo.setAttribute('aMove', new THREE.BufferAttribute(m, 4)); geo.setAttribute('aCen', new THREE.BufferAttribute(c, 3));
  return geo;
}
const untagged = (list, kind) => list.forEach((g) => { if (!g.attributes.aMove) tag(g, kind); });
const rgbHex = (c) => _a.setRGB(c[0], c[1], c[2]).getHex();
// colour at (x, y, z) from lo (at the foot) to hi (at the top), shaped as a raw triangle list
function raw(pos, col) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}
// A hero crystal: a tall six-sided spike whose colour runs from a deep, saturated foot to a near-white hot tip (unlit, so it glows), leaning outward.
function heroSpike(h, sp) {
  const hex = HUE[h.hue]; const rgb = ZONE_RGB[h.hue];
  const g = tone(cone(sp.r, sp.h, 6), darken(rgbHex(rgb), 0.75), lighten(hex, 0.12), sp.h);
  g.rotateX(sp.lean); g.rotateY(sp.yaw);
  g.translate(h.x + sp.dx, P.crystalY(h.x, h.z) - 0.1, h.z + sp.dz);
  return g;
}
// A halo: two crossed upright discs round the hero (additive, bright in the middle, black at the rim).
function halo(h, strength) {
  const out = []; const y0 = P.crystalY(h.x, h.z) + h.top * 0.45; const rgb = ZONE_RGB[h.hue]; const R = h.halo; const seg = 10;
  for (const rot of [0.3, 0.3 + Math.PI / 2]) {
    const ca = Math.cos(rot); const sa = Math.sin(rot); const pos = []; const col = [];
    const v = (u, rr, k) => { const f = strength * (1 - rr) ** 1.4; const a = (u / seg) * Math.PI * 2; const px = Math.cos(a) * R * rr; const py = Math.sin(a) * R * rr * 1.25; pos.push(h.x + px * ca, y0 + py, h.z + px * sa); col.push(rgb[0] * f, rgb[1] * f, rgb[2] * f); };
    for (let u = 0; u < seg; u++) for (const [a, b] of [[0, 0.5], [0.5, 1]]) {
      // ring a..b as two triangles per segment (centre handled by rr = 0)
      v(u, a, 0); v(u, b, 0); v(u + 1, b, 0); v(u, a, 0); v(u + 1, b, 0); v(u + 1, a, 0);
    }
    out.push(tag(raw(pos, col), 4));
  }
  return out;
}
// A floor wash: one very wide disc of the chamber's colour.
function wash(w) {
  return tag(disc(w.x, w.z, w.r, 1, (t) => { const f = 0.11 * (1 - t) ** 0.9; return [w.rgb[0] * f, w.rgb[1] * f, w.rgb[2] * f]; }, 3, 16), 4, 1);
}
// A light shaft: three upright strips round the same line, each brightest down its middle and dim at its top and foot, leaning like the light does.
function shaft(s) {
  const x0 = s.x; const z0 = s.z; const y0 = P.crystalY(x0, z0); const x1 = x0 + s.lx; const z1 = z0 + s.lz; const y1 = SHAFT_TOP;
  const pos = []; const col = []; const levels = [[0, 0.02, 1], [0.45, 0.2, 0.8], [1, 0.0, 0.5]];
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI; const ca = Math.cos(a); const sa = Math.sin(a);
    const at = (lv, side) => { const [t, f, wk] = lv; const x = x0 + (x1 - x0) * t; const z = z0 + (z1 - z0) * t; const w = (s.w * wk) * side; return [x + ca * w, y0 + (y1 - y0) * t, z + sa * w, f * (side === 0 ? 1 : 0)]; };
    for (let l = 0; l < 2; l++) for (const [sa0, sa1] of [[-1, 0], [0, 1]]) {
      const q = [at(levels[l], sa0), at(levels[l], sa1), at(levels[l + 1], sa0), at(levels[l + 1], sa1)];
      for (const idx of [[0, 1, 2], [1, 3, 2]]) for (const m of idx) { const [px, py, pz, f] = q[m]; pos.push(px, py, pz); col.push(s.rgb[0] * f, s.rgb[1] * f, s.rgb[2] * f); }
    }
  }
  return tag(raw(pos, col), 2, s.ph);
}
// A mote with a trail: two crossed slim kites, black at the tail and bright at the head; it rises `rise` metres and starts over (the shader).
function mote(m) {
  const y = P.crystalY(m.x, m.z) + m.y; const pos = []; const col = []; const w = 0.07;
  _a.setRGB(m.rgb[0], m.rgb[1], m.rgb[2]).lerp(_b.setScalar(1), 0.2);
  for (const rot of [0, Math.PI / 2]) {
    const ca = Math.cos(rot + m.ph * 6); const sa = Math.sin(rot + m.ph * 6);
    const c = [[0, -m.len, 0], [-w, 0, 0.6], [w, 0, 0.6], [0, 0.08, 0.8]];
    const v = (k) => { const q = c[k]; pos.push(m.x + q[0] * ca, y + q[1], m.z + q[0] * sa); col.push(_a.r * q[2], _a.g * q[2], _a.b * q[2]); };
    for (const t of [[0, 1, 2], [1, 3, 2]]) t.forEach(v);
  }
  return tag(raw(pos, col), 1, m.ph, m.speed, m.rise);
}
// A ripple: one flat ring on the water, born small and bright and spreading until it fades (the shader scales it about aCen).
function ripple(r) {
  const y = P.crystalY(r.x, r.z) + 0.1; const seg = 16; const pos = []; const col = [];
  for (let s = 0; s < seg; s++) {
    const a0 = (s / seg) * Math.PI * 2; const a1 = ((s + 1) / seg) * Math.PI * 2;
    const p = (a, rr, f) => { pos.push(r.x + Math.cos(a) * rr, y, r.z + Math.sin(a) * rr); col.push(0.55 * f, 0.9 * f, 1 * f); };
    p(a0, 0.8, 1); p(a0, 1, 0.1); p(a1, 0.8, 1); p(a1, 0.8, 1); p(a0, 1, 0.1); p(a1, 1, 0.1);
  }
  return tag(raw(pos, col), 3, r.ph, r.speed, r.reach, r.x, y, r.z);
}
// The shader: one time uniform; positions are world positions (the meshes sit at the origin).
function animate(mat, uT, U, key = 'cat') {
  mat.customProgramCacheKey = () => 'crystalMove6';
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uT = uT; sh.uniforms.uCat = U[key]; sh.uniforms.uRip = U.rip; sh.uniforms.uBloom = U.bloom; sh.uniforms.uMood = U.mood; sh.uniforms.uLing = U.ling;
    sh.vertexShader = `attribute vec4 aMove;\nattribute vec3 aCen;\nuniform float uT;\nuniform vec4 uCat;\nuniform vec4 uRip[3];\nuniform vec4 uBloom;\nuniform vec4 uMood;\nuniform vec4 uLing;\nvarying float vKk;\nvarying vec3 vTint;\nvarying float vBand;\nvarying vec3 vPrism;\n${sh.vertexShader}`
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float kk = 1.0; float kd = aMove.x;
        if (kd > 0.5 && kd < 1.5) { float f = fract(uT * aMove.z + aMove.y); transformed.y += f * aMove.w; transformed.x += sin(uT * 0.5 + aMove.y * 40.0) * 0.35 * f; transformed.z += cos(uT * 0.45 + aMove.y * 31.0) * 0.35 * f; kk = sin(f * 3.14159); transformed.xz += vec2(cos(uLing.w), sin(uLing.w)) * uMood.w * f * 2.2; }
        else if (kd > 1.5 && kd < 2.5) { kk = 0.7 + 0.3 * sin(uT * 0.45 + aMove.y * 6.2832); }
        else if (kd > 2.5 && kd < 3.5) { float f = fract(uT * aMove.z + aMove.y); transformed.xz = aCen.xz + (position.xz - aCen.xz) * (0.3 + f * aMove.w); kk = (1.0 - f) * (1.0 - f) * smoothstep(0.0, 0.12, f) * 2.2; }
        else if (kd > 3.5 && kd < 4.5) { float w = 0.5 + 0.5 * sin(uT * 1.15 - length(position.xz) * 0.17); kk = 0.85 + 0.5 * w * w; }
        else if (kd > 4.5 && kd < 5.5) { float a = clamp(uRip[int(aMove.y + 0.5)].z, 0.0, 1.0); vec4 rp = uRip[int(aMove.y + 0.5)]; transformed.xz = rp.xy + position.xz * (0.25 + a * 2.6); kk = (1.0 - a) * (1.0 - a) * 2.4 * step(0.001, a) * step(a, 0.999); }
        else if (kd > 6.5) { kk = uBloom.z * 2.4; }
        else if (kd > 5.5) { float f = uT * aMove.z + aMove.y * 6.2832; transformed.x += sin(f) * 1.6; transformed.z += cos(f * 0.8) * 1.2; kk = 0.55 + 0.45 * sin(uT * 0.3 + aMove.y * 20.0); transformed.xz += vec2(cos(uLing.w), sin(uLing.w)) * uMood.w * 1.4 * sin(uT * 0.5 + aMove.y * 9.0); }
        float dc = distance(position.xz, uCat.xz);
        kk *= 1.0 + uCat.w * 1.1 * smoothstep(4.2, 0.6, dc);
        vTint = vec3(1.0) + 0.16 * vec3(sin(uT * 0.1 + position.x * 0.045), sin(uT * 0.1 + position.z * 0.045 + 2.1), sin(uT * 0.1 - position.x * 0.03 + 4.2));
        float db = length(position.xz - vec2(0.0, -2.0));
        float band = exp(-pow((db - uBloom.x) / 9.0, 2.0)) * uBloom.y;
        kk *= 1.0 + band * 1.7;
        vBand = clamp(band, 0.0, 1.0); vPrism = 0.5 + 0.5 * cos(6.2832 * (db * 0.045 + vec3(0.0, 0.33, 0.67)));
        kk *= 0.93 + 0.1 * sin(uT * 0.8 - db * 0.09);
        kk *= 1.0 + uBloom.w * 0.55 * smoothstep(14.0, 1.5, dc);
        kk *= 1.0 + uMood.x * (0.1 + 0.7 * (0.5 + 0.5 * sin(uT * 2.6 - db * 0.16))) + uMood.z * 0.45;
        if (kd > 1.5 && kd < 2.5) kk *= 1.0 + uMood.x * 0.9;
        if (kd > 3.5 && kd < 4.5 && aMove.y > 0.5) kk *= 1.0 - uMood.z * 0.75;
        kk *= 1.0 + uLing.z * 0.8 * smoothstep(4.5, 0.8, distance(position.xz, uLing.xy)) * (kd > 3.5 && kd < 4.5 ? (aMove.y > 0.5 ? 0.0 : 0.3) : 1.0);
        vTint *= mix(vec3(1.0), vec3(1.2, 0.65, 1.3), uMood.x * 0.9);
        vTint += uMood.y * 0.38 * (cos(6.2832 * (db * 0.03 - uT * 0.05 + vec3(0.0, 0.33, 0.67))));
        if (kd > 3.5 && kd < 4.5 && aMove.y > 0.5) kk = min(kk, 1.3);
        vKk = kk;`)
    ;
    sh.fragmentShader = `varying float vKk;\nvarying vec3 vTint;\nvarying float vBand;\nvarying vec3 vPrism;\n${sh.fragmentShader}`.replace('#include <color_fragment>', '#include <color_fragment>\n        float lum = dot(diffuseColor.rgb, vec3(0.333)); diffuseColor.rgb = mix(diffuseColor.rgb * vKk * vTint, vPrism * lum * 2.0 * vKk, vBand * 0.8);');
  };
}
// The mist: a low flat bank of soft colour that drifts a little (kind 6)
function mist(m) {
  const g = disc(m.x, m.z, m.r, m.wob, (t) => { const f = 0.075 * (1 - t) ** 1.1; return [m.rgb[0] * f + 0.02 * (1 - t), m.rgb[1] * f + 0.02 * (1 - t), m.rgb[2] * f + 0.025 * (1 - t)]; }, 2, 10);
  const pos = g.attributes.position; for (let i = 0; i < pos.count; i++) pos.setY(i, P.crystalY(pos.getX(i), pos.getZ(i)) + 0.32);
  return tag(g, 6, m.ph, m.speed);
}
// A ring the cat's own paws make in the Blue Pool (kind 5): unit ring about the origin, placed and spread by the shader from uRip[slot]
function pawRing(slot) {
  const y = P.crystalY(W.POOL.x, W.POOL.z) + 0.12; const seg = 16; const pos = []; const col = [];
  for (let s = 0; s < seg; s++) {
    const a0 = (s / seg) * Math.PI * 2; const a1 = ((s + 1) / seg) * Math.PI * 2;
    const p = (a, rr, f) => { pos.push(Math.cos(a) * rr, y, Math.sin(a) * rr); col.push(0.55 * f, 0.9 * f, 1 * f); };
    p(a0, 0.8, 1); p(a0, 1, 0.1); p(a1, 0.8, 1); p(a1, 0.8, 1); p(a0, 1, 0.1); p(a1, 1, 0.1);
  }
  return tag(raw(pos, col), 5, slot);
}

// createCrystalDecor({ scene, tier }) -> { counts, dispose }: the three meshes added to the scene.
export function createCrystalDecor({ scene, tier = null, reducedMotion = false }) {
  const rung = decorRung(tier);
  const d = { ...planDecor(rung), ...planBeauty(rung) }; const d2 = planBeauty2(rung);
  const stone = []; const glow = []; const light = [];
  const lowR = rung === 'low'; const d2mist = planMist();
  mushrooms(d.mush, stone, glow); gardens(d.garden, glow); stalagmites(d.stag, stone); pebbles(d.pebble, stone); minis(d.mini, stone); lights(d, light); shards(d.sats, glow, light);
  d2.hero.forEach((h) => { h.spikes.forEach((sp) => glow.push(tag(heroSpike(h, sp), 4))); halo(h, (h.great ? 0.1 : 0.07) * tame(h.hue)).forEach((g) => light.push(g)); light.push(wash({ x: h.x, z: h.z, r: h.s * 2.6 + 1.6, rgb: ZONE_RGB[h.hue].map((v) => v * 0.62 * tame(h.hue)) })); });
  d2.wash.forEach((w) => light.push(wash(w.hue === 'blue' || w.hue === 'gold' ? { ...w, rgb: w.rgb.map((v) => v * (w.hue === 'blue' ? 0.6 : 0.78)) } : w))); d2.shafts.forEach((sh) => light.push(shaft(sh))); d2.motes.forEach((m) => light.push(mote(m))); d2.ripples.forEach((r) => light.push(ripple(r)));
  const mists = lowR ? d2mist.slice(0, 3) : d2mist; mists.forEach((m) => light.push(mist(m)));
  if (!lowR) for (let k = 0; k < 3; k++) light.push(pawRing(k));
  // beauty pass 5: the journey's first colour, the Entry Hall's lantern amber: a warm wash under the arch and two soft amber shafts (the chambers' own shafts and washes carry rose, blue, gold and violet on from there)
  light.push(wash({ x: 0, z: 21.5, r: 9, rgb: ZONE_RGB.amber.map((v) => v * 0.55) }));
  if (!lowR) { light.push(shaft({ x: -2.2, z: 20, lx: 1.4, lz: -1.0, w: 1.0, rgb: ZONE_RGB.amber, ph: 0.3 })); light.push(shaft({ x: 3.4, z: 21.5, lx: -1.0, lz: -1.2, w: 0.9, rgb: ZONE_RGB.amber, ph: 0.7 })); }
  drawTales({ tone, cone, raw, tag, glint, disc }, rung, { stone, glow, light }); // beauty round 4: a small story in each chamber, the same three meshes
  untagged(glow, 4); untagged(light, 0);
  const mats = [litMaterial(0xffffff, { vertexColors: true, roughness: 0.85 }), new THREE.MeshBasicMaterial({ vertexColors: true }),
    new THREE.MeshBasicMaterial({ vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide })]; // (double-sided: the standing paint and the rainbow are seen from both ways)
  mats[0].emissive?.setHex(0x3a2c44); // lifts the dark foot of the floor stalagmites (and every stone piece a little)
  const uT = { value: 0 };
  const U = { cat: { value: new THREE.Vector4(1e5, 0, 1e5, 0) }, catL: { value: new THREE.Vector4(1e5, 0, 1e5, 0) }, rip: { value: [new THREE.Vector4(0, 0, 9, 0), new THREE.Vector4(0, 0, 9, 0), new THREE.Vector4(0, 0, 9, 0)] }, bloom: { value: new THREE.Vector4(-99, 0, 0, 0) }, mood: { value: new THREE.Vector4(0, 0, 0, 0) }, ling: { value: new THREE.Vector4(0, 0, 0, 0) } };
  animate(mats[1], uT, U, 'cat'); animate(mats[2], uT, U, 'catL');
  const meshes = [[stone, 'decorStone', true], [glow, 'decorGlow', false], [light, 'decorLight', false]].map(([geos, name, lit], i) => {
    const m = new THREE.Mesh(mergeGeometries(geos), mats[i]);
    m.name = `crystal:${name}`; m.castShadow = false; m.receiveShadow = lit; m.frustumCulled = false; m.renderOrder = i === 2 ? 2 : 0;
    Object.assign(m.userData, { noCast: true, noContactShadow: true, noMerge: true });
    scene.add(m);
    return m;
  });
  const triangles = meshes.reduce((s, m) => s + m.geometry.attributes.position.count / 3, 0);
  return {
    rung, meshes, triangles, d2,
    get time() { return uT.value; },
    uniforms: U,
    update(dt) { if (!reducedMotion) uT.value += Math.max(0, Math.min(dt, 0.25)) || 0; },
    counts: { mush: d.mush.length, garden: d.garden.length, moss: d.moss.length, stag: d.stag.length, pools: d.pools.length, pebble: d.pebble.length, sats: d.sats.length, hero: d2.hero.length, wash: d2.wash.length, shafts: d2.shafts.length, motes: d2.motes.length, ripples: d2.ripples.length, veins: d.veins.length, mini: d.mini.length, pockets: d.pockets.length, meshes: meshes.length },
    dispose() { meshes.forEach((m) => { scene.remove(m); m.geometry.dispose(); }); mats.forEach((m) => m.dispose()); },
  };
}
