// =============================================================================
// THE CRYSTAL CAVE'S WING B: THE DRAWING (milestone C5). The Blue Pool (a glowing basin that follows the floor), its stepping crystals, the Blue and the Gold great
// crystals, the Gold Gallery's vein wall and nook, the Heart Crystal (dormant until awake: its own material, whose colour scalar the life raises), the small crystal
// rings, and the passages' lamps (one Points object, off until everything is lit). Everything comes from crystalwingplan.js; no canvas, no Math.random, no real light
// (the cave's ONE PointLight is crystalparts.js's drawLight). Pieces join the cave's kit, so each hue is still one merged mesh that pulses on its own.
// =============================================================================

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as P from './crystalplan.js';
import * as W from './crystalwingplan.js';
import * as K from './crystalparts.js';

export const WING_COL = Object.freeze({ pool: 0x7fd4ff, poolRim: 0x2f6fc0, step: 0x8ccaf2, seam: 0xffc65a, slab: 0x9a8890, slabLight: 0xc0a8a0, dormant: 0x8a7a9a });
export const HEART_DORMANT = 0.38; // the Heart's colour scalar while it sleeps (1 awake)

const _c = new THREE.Color();

// ---- the pool: a disc of rings that follows the floor, bright in the middle and deep blue at the rim -----------------------------------------------------
export function poolGeometry() {
  const radii = [0, 1.2, 2.4, 3.4, 4.2, 4.6, 4.95]; // the last two: the water's edge and a pale stone lip round it
  const seg = 32;
  const last = radii.length - 1;
  const pos = [];
  const col = [];
  const index = [];
  const lift = 0.05;
  const glow = new THREE.Color(0xa8ecff); const deep = new THREE.Color(0x2670c8); const shallow = new THREE.Color(0x6fd6ea); const lip = new THREE.Color(0xb4b8e0);
  for (let ri = 0; ri < radii.length; ri++) {
    const n = ri === 0 ? 1 : seg;
    for (let i = 0; i < n; i++) {
      const a = (i / seg) * Math.PI * 2;
      const wob = 1 + 0.07 * Math.sin(a * 3 + 0.6) + 0.05 * Math.sin(a * 5 + 2); // an uneven shore, so it is a pool and not a plate
      const rr = radii[ri] * (ri === 0 ? 1 : wob);
      const x = W.POOL.x + Math.cos(a) * rr;
      const z = W.POOL.z + Math.sin(a) * rr;
      pos.push(x, P.crystalY(x, z) + lift, z);
      const t = radii[ri] / W.POOL.r;
      if (t < 0.5) _c.copy(glow).lerp(deep, t * 1.4); // a bright glow in the middle...
      else if (t < 0.9) _c.copy(deep).lerp(shallow, ((t - 0.5) / 0.4) ** 1.5 * 0.7); // ...deep blue round it...
      else _c.copy(shallow).lerp(lip, ri === last ? 0.85 : 0.25 + 0.2 * (t - 0.9) / 0.1); // ...shallow turquoise toward the shore and a pale lip
      const band = 0.5 + 0.5 * Math.sin(radii[ri] * 3.1 + i * 0.9) * Math.cos(i * 0.5 + ri); // ripples of lighter and deeper water
      _c.multiplyScalar(ri === 0 ? 1 : 0.9 + 0.2 * band);
      let near = 0; // the stepping crystals glow on the water round their feet
      for (const st of W.STEPPING) near = Math.max(near, 1 - Math.hypot(x - st.x, z - st.z) / 1.3);
      if (near > 0 && ri < last) _c.lerp(glow, near * 0.45);
      col.push(_c.r, _c.g, _c.b);
    }
  }
  // the centre is vertex 0; ring r (1..4) starts at 1 + (r - 1) * seg
  const at = (ri, i) => 1 + (ri - 1) * seg + (i % seg);
  for (let i = 0; i < seg; i++) index.push(0, at(1, i + 1), at(1, i));
  for (let ri = 1; ri < radii.length - 1; ri++) {
    for (let i = 0; i < seg; i++) { const a = at(ri, i); const b = at(ri, i + 1); const c = at(ri + 1, i); const d = at(ri + 1, i + 1); index.push(a, b, c, b, d, c); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(index);
  return g;
}

export function drawPool() {
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const m = new THREE.Mesh(poolGeometry(), mat);
  m.name = 'crystal:pool';
  m.castShadow = false; m.receiveShadow = false;
  Object.assign(m.userData, { noCast: true, noContactShadow: true, noMerge: true });
  return m;
}

// ---- the lamps along the passages: one Points object of vertex colours, off until the passages light -------------------------------------------------
export function drawPassageLamps() {
  const lamps = W.PASSAGES.flatMap((p) => p.lamps.map((l) => ({ ...l, hue: p.hue })));
  const pos = new Float32Array(lamps.length * 3);
  const col = new Float32Array(lamps.length * 3);
  lamps.forEach((l, i) => {
    pos[i * 3] = l.x; pos[i * 3 + 1] = P.crystalY(l.x, l.z) + 0.18; pos[i * 3 + 2] = l.z;
    _c.setHex(P.HUE_COLOURS[l.hue]).lerp(new THREE.Color(0xffffff), 0.35);
    col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({ map: K.dotTexture(), alphaTest: 0.02, size: 0.6, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: true });
  const pts = new THREE.Points(geo, mat);
  pts.name = 'crystal:lamps';
  pts.frustumCulled = false;
  pts.visible = false;
  Object.assign(pts.userData, { noCast: true, noContactShadow: true, noMerge: true });
  return pts;
}

// ---- the Heart: its own mesh and material (the life raises its colour scalar from dormant to awake) ------------------------------------------------------
export function drawHeart() {
  const parts = K.clusterGeometry(W.HEART_GREAT, 77);
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true });
  mat.color.setScalar(HEART_DORMANT);
  const m = new THREE.Mesh(mergeGeometries(parts), mat);
  m.name = 'crystal:heartgreat';
  m.castShadow = false; m.receiveShadow = false;
  Object.assign(m.userData, { noCast: true, noContactShadow: true, noMerge: true });
  return m;
}

// ---- the wing's pieces, put into the cave's kit ---------------------------------------------------------------------------------------------------------
const cyl = (rt, rb, h, seg = 6) => new THREE.CylinderGeometry(rt, rb, h, seg, 1);

function putCluster(kit, M, k, i) { for (const g of K.clusterGeometry(k, i)) kit.put(`hue:${k.hue}`, M.hue[k.hue], g, { noCast: true, pulse: { hue: k.hue } }); }

function putSlab(kit, M, s, i, light) {
  const tone = Math.sin(i * 2.3 + 1);
  const g = new THREE.DodecahedronGeometry(1, 0).scale(s.r, s.h / 2, s.r * 0.9).translate(0, s.h / 2 - 0.1, 0);
  kit.put('paint', M.paint, K.at(K.gradient(g, 0x5e4c60, i % 2 ? WING_COL.slab : light ? WING_COL.slabLight : WING_COL.slab, s.h, tone), s.x, s.z, 0, i * 1.1), { noCast: true }); // darker at the foot, warmer and paler toward the top, each face its own tone
}
// the gold seams: thin bars on a slab's south face, in the gold hue so they glow with the other gold crystals
function putSeams(kit, M, s, i) {
  for (const sd of [-1, 1]) {
    const h = s.h * (0.55 + 0.15 * ((i + sd) & 1));
    const g = new THREE.BoxGeometry(0.13, h, 0.12).rotateZ(sd * 0.22).translate(sd * s.r * 0.32, s.h * 0.5, s.r * 0.78);
    kit.put('hue:gold', M.hue.gold, K.paint(K.at(g, s.x, s.z, 0, 0), P.HUE_COLOURS.gold), { noCast: true, pulse: { hue: 'gold' } });
  }
}

// drawWing(kit, M) -> [the pool, the Heart, the lamps, the three great crystals]: objects for the scene (the rest are in the kit)
export function drawWing(kit, M) {
  W.POOL_RING.forEach((k, i) => putCluster(kit, M, k, 110 + i));
  W.GOLD_ROW.forEach((k, i) => putCluster(kit, M, k, 130 + i));
  W.HEART_RING.forEach((k, i) => putCluster(kit, M, k, 150 + i));
  W.VEIN_SLABS.forEach((s, i) => { putSlab(kit, M, s, i, true); putSeams(kit, M, s, i); });
  W.NOOK.rocks.forEach((s, i) => { putSlab(kit, M, { ...s, h: s.h }, 20 + i, false); if (i === 2) putSeams(kit, M, s, 7); });
  // the stepping crystals: a stout blue column with a glowing top, each at its own height over the floor
  W.STEPPING.forEach((s, i) => {
    const body = cyl(s.r * 0.85, s.r * 1.05, s.h, 6).translate(0, s.h / 2, 0);
    kit.put('hue:blue', M.hue.blue, K.at(K.gradient(body, 0x3f86c8, 0xa4dcff, s.h, Math.sin(i * 2)), s.x, s.z, 0, i), { noCast: true, pulse: { hue: 'blue' } }); // glowing like the pool's crystals, so they read from afar
    const cap = K.paint(K.at(cyl(s.r * 0.7, s.r * 0.82, 0.08, 6).translate(0, s.h + 0.04, 0), s.x, s.z, 0, i), i % 2 ? 0xbfe6ff : 0xd2eeff);
    kit.put('hue:blue', M.hue.blue, cap, { noCast: true, pulse: { hue: 'blue' } });
  });
  const rose = P.scatterClusters().findIndex((k) => k.great);
  const greats = K.drawGreats([{ k: P.scatterClusters()[rose], i: rose, g: 0 }, { k: W.BLUE_GREAT, i: 100, g: 1 }, { k: W.GOLD_GREAT, i: 101, g: 2 }]);
  return [drawPool(), drawHeart(), drawPassageLamps(), greats];
}

// the clusters wing B adds (for the floor's tint of coloured light: the great crystals pool their hue on the stone)
export const wingGreat = () => [W.BLUE_GREAT, W.GOLD_GREAT, W.HEART_GREAT];
