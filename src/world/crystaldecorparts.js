// =============================================================================
// THE CRYSTAL CAVE: ITS DECOR, THE DRAWING (layer 3). Three draws in all, every piece merged and painted in vertex colour (no canvas, no light, no Math.random):
//   * crystal:decorStone  the lit stone: mushroom stems, stalagmites, pebbles
//   * crystal:decorGlow   the glowing things (an unlit vertex-coloured mesh, like the crystals): mushroom caps and the small crystal gardens
//   * crystal:decorLight  one additive mesh: the glowing moss and the pools of light on the floor (black at the rim, so nothing shows where it fades)
// The plan is world/crystaldecor.js. Built once in the cave's life (the tier is known there); none of it moves, so reduced motion changes nothing.
// =============================================================================

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { litMaterial } from '../render/materials.js';
import * as P from './crystalplan.js';
import { planDecor, decorRung } from './crystaldecor.js';

const _a = new THREE.Color(); const _b = new THREE.Color();
const HUE = P.HUE_COLOURS;
const lighten = (hex, k) => _b.setHex(hex).lerp(_a.setScalar(1), k).getHex();
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
    stone.push(put(tone(cone(r, p.h * 1.3, 6), 0x5a4a62, lighten(hex, 0.45), p.h * 1.3), g.x + p.dx, g.z + p.dz, { yaw: p.yaw + i + j, lean: p.lean * 0.4, dy: -0.15 }));
  }));
}
function pebbles(list, stone) {
  list.forEach((m, i) => m.parts.forEach((p, j) => {
    const tint = [0x8a7a8c, 0x9a8a9c, 0xa89aa0, 0x7c6c82][(i + j) % 4];
    stone.push(put(tone(new THREE.OctahedronGeometry(p.s, 0), darken(tint, 0.8), tint, p.s * 1.5), m.x + p.dx, m.z + p.dz, { yaw: p.yaw, sy: 0.55, dy: p.s * 0.2 }));
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
const fade = (hex, k) => { _a.setHex(hex); return (t) => { const f = k * (1 - t) ** 1.6; return [_a.r * f, _a.g * f, _a.b * f]; }; };
function lights(d, out) {
  d.pools.forEach((p, i) => out.push(disc(p.x, p.z, p.r, i, fade(HUE[p.hue], 0.3 * p.k + 0.12), 3, 14)));
  d.moss.forEach((m, i) => {
    const c = [[0.22, 0.62, 0.34], [0.3, 0.7, 0.4], [0.18, 0.55, 0.5]][i % 3];
    out.push(disc(m.x, m.z, m.r, m.wob, (t) => { const f = 0.55 * (1 - t) ** 1.2 * (0.8 + 0.2 * Math.sin(t * 17 + m.wob)); return [c[0] * f, c[1] * f, c[2] * f]; }, 3, 9));
  });
}

// createCrystalDecor({ scene, tier }) -> { counts, dispose }: the three meshes added to the scene.
export function createCrystalDecor({ scene, tier = null }) {
  const rung = decorRung(tier);
  const d = planDecor(rung);
  const stone = []; const glow = []; const light = [];
  mushrooms(d.mush, stone, glow); gardens(d.garden, glow); stalagmites(d.stag, stone); pebbles(d.pebble, stone); lights(d, light);
  const mats = [litMaterial(0xffffff, { vertexColors: true, roughness: 0.85 }), new THREE.MeshBasicMaterial({ vertexColors: true }),
    new THREE.MeshBasicMaterial({ vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false })];
  const meshes = [[stone, 'decorStone', true], [glow, 'decorGlow', false], [light, 'decorLight', false]].map(([geos, name, lit], i) => {
    const m = new THREE.Mesh(mergeGeometries(geos), mats[i]);
    m.name = `crystal:${name}`; m.castShadow = false; m.receiveShadow = lit; m.frustumCulled = false; m.renderOrder = i === 2 ? 2 : 0;
    Object.assign(m.userData, { noCast: true, noContactShadow: true, noMerge: true });
    scene.add(m);
    return m;
  });
  const triangles = meshes.reduce((s, m) => s + m.geometry.attributes.position.count / 3, 0);
  return {
    rung, meshes, triangles,
    counts: { mush: d.mush.length, garden: d.garden.length, moss: d.moss.length, stag: d.stag.length, pools: d.pools.length, pebble: d.pebble.length, meshes: meshes.length },
    dispose() { meshes.forEach((m) => { scene.remove(m); m.geometry.dispose(); }); mats.forEach((m) => m.dispose()); },
  };
}
