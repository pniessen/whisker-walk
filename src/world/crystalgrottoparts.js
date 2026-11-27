// =============================================================================
// THE GROTTO AND THE FORGE: THE DRAWING (milestone C2). Two sites, two draws each, nothing else:
//   * the grotto: ONE opaque mesh of every mushroom (stems and caps, soft glow painted into the vertex colours, a basic material so it is bright whatever the light) and
//     ONE additive mesh of the floor's glow and the caps' halos;
//   * the forge: ONE lit mesh of the hearth stones, anvil, bench and shelf, and ONE additive mesh of the coals, the little flames and the warm pool of light on the floor.
// No PointLight (the cave has the one, crystalparts.js drawLight), no canvas, no Math.random. LOW and LITE keep about half the mushrooms and no flames. Everything follows
// the floor (crystalY). The glow is a material colour scalar the life breathes; reduced motion holds it still. The giant mushrooms stand outside the walkable edge.
// =============================================================================

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { crystalY } from './crystalplan.js';
import { litMaterial } from '../render/materials.js';
import * as G from './crystalgrottoplan.js';

const CAP = [[0x4fe0c4, 0xb8fff0], [0xa88cff, 0xe6d8ff], [0xff8cc8, 0xffd6ec]]; // [rim, top] per hue
const STEM = 0xe8dcc4;
const _a = new THREE.Color();
const _b = new THREE.Color();

// the geometry in the shape every piece shares (non-indexed, position + normal + uv + colour) so any two merge; `tone(x, y, z) -> Color` paints it
function shade(geo, tone) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  const p = g.attributes.position;
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const c = tone(p.getX(i), p.getY(i), p.getZ(i)); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
const flat = (hex, jitter = 0) => () => _a.setHex(hex).offsetHSL(0, 0, jitter);
const sit = (geo, x, z, dy = 0, ry = 0) => { if (ry) geo.rotateY(ry); geo.translate(x, crystalY(x, z) + dy, z); return geo; };

// ---- one mushroom: a stem and a cap whose glow runs from a deep rim to a bright crown ---------------------------------------------------------------------
function mushroom(m, segs) {
  const stem = shade(new THREE.CylinderGeometry(m.stemR * 0.8, m.stemR, m.stem, segs, 1, true).translate(0, m.stem / 2, 0), (x, y) => _a.setHex(STEM).multiplyScalar(0.62 + 0.38 * Math.min(1, y / m.stem)));
  const dome = new THREE.SphereGeometry(m.cap, segs, Math.max(3, segs >> 1), 0, Math.PI * 2, 0, Math.PI / 2);
  dome.scale(1, 0.55, 1);
  dome.translate(0, m.stem, 0);
  const [rim, top] = CAP[m.hue % 3];
  const capTone = shade(dome, (x, y) => { const t = Math.min(1, Math.max(0, (y - m.stem) / (m.cap * 0.55))); return _b.setHex(rim).lerp(_a.setHex(top), t * t); });
  return mergeGeometries([stem, capTone]);
}
// a soft flat disc of light on the floor (additive): bright in the middle, gone at the edge, `rgb` the middle's colour, `peak` how bright
function glowDisc(x, z, r, rgb, peak, lift = 0.05, rings = 5, seg = 20) {
  const pos = []; const col = []; const idx = [];
  const c = new THREE.Color(rgb);
  for (let ri = 0; ri <= rings; ri++) {
    const n = ri === 0 ? 1 : seg;
    const t = ri / rings;
    const f = peak * (1 - t) ** 1.7;
    for (let i = 0; i < n; i++) {
      const a = (i / seg) * Math.PI * 2;
      const px = x + Math.cos(a) * r * t; const pz = z + Math.sin(a) * r * t;
      pos.push(px, crystalY(px, pz) + lift, pz);
      col.push(c.r * f, c.g * f, c.b * f);
    }
  }
  const at = (ri, i) => 1 + (ri - 1) * seg + (i % seg);
  for (let i = 0; i < seg; i++) idx.push(0, at(1, i + 1), at(1, i));
  for (let ri = 1; ri < rings; ri++) for (let i = 0; i < seg; i++) { const a = at(ri, i); const b = at(ri, i + 1); const cc = at(ri + 1, i); const d = at(ri + 1, i + 1); idx.push(a, b, cc, b, d, cc); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  g.setIndex(idx);
  return g.toNonIndexed();
}

const markMesh = (m, name) => {
  m.name = name; m.castShadow = false; m.receiveShadow = false; m.frustumCulled = false;
  Object.assign(m.userData, { noCast: true, noContactShadow: true, noMerge: true });
  return m;
};

// ---- the grotto -------------------------------------------------------------------------------------------------------------------------------------------
export function grottoGeometries(rung = 'high') {
  const low = rung === 'low';
  const segs = low ? 6 : 8;
  const ring = low ? G.RING_MUSHROOMS.filter((_, i) => i % 2 === 0) : G.RING_MUSHROOMS;
  const buttons = low ? [] : G.BUTTONS;
  const giants = low ? G.GIANTS.slice(1, 2) : G.GIANTS;
  const solid = [];
  const halo = [];
  for (const m of [...ring, ...buttons]) {
    solid.push(sit(mushroom(m, segs), m.x, m.z));
    if (m.cap > 0.5) halo.push(glowDisc(m.x, m.z, m.cap * 1.7, CAP[m.hue % 3][0], 0.34, 0.06, 3, 12));
  }
  for (const m of giants) solid.push(sit(mushroom({ ...m, stemR: m.cap * 0.22 }, segs), m.x, m.z, -0.4));
  halo.push(glowDisc(G.GROTTO.x, G.GROTTO.z, 4.6, 0x7fffe0, 0.3, 0.05, 5, 24)); // the grotto's own pool of soft light
  return { solid: mergeGeometries(solid), halo: mergeGeometries(halo) };
}

// ---- the forge --------------------------------------------------------------------------------------------------------------------------------------------
export function forgeGeometries(rung = 'high') {
  const low = rung === 'low';
  const solid = [];
  const warm = [];
  const box = (w, h, d, x, z, base, hex, ry = 0, j = 0) => solid.push(shade(sit(new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0), x, z, base, ry), flat(hex, j)));
  const H = G.HEARTH;
  // the hearth: a stone base, a back that rises like a chimney, a dark mouth in front, the coals (additive) in the bed
  box(H.w, H.h, H.d, H.x, H.z, -0.3, 0x8e7f86);
  box(H.w * 0.62, H.back, 0.55, H.x, H.z + 0.5, -0.3, 0x7a6b74, 0, -0.03);
  box(H.w + 0.3, 0.12, H.d + 0.3, H.x, H.z, H.h - 0.3, 0xa8989e);
  const bed = sit(new THREE.PlaneGeometry(H.w * 0.7, H.d * 0.55).rotateX(-Math.PI / 2), H.x, H.z - 0.1, H.h - 0.1);
  warm.push(shade(bed, (x, y, z) => _a.setRGB(1.0, 0.45 + 0.2 * Math.sin(x * 9 + z * 7), 0.12).multiplyScalar(0.9)));
  if (!low) {
    for (let i = 0; i < 3; i++) { // three little flames: thin cones that taper to nothing
      const fl = new THREE.ConeGeometry(0.2 - i * 0.03, 0.62 - i * 0.12, 5, 1, true).translate(0, (0.62 - i * 0.12) / 2, 0);
      warm.push(sit(shade(fl, (x, y) => _a.setRGB(1.0, 0.55 + 0.4 * Math.min(1, y / 0.5), 0.15 + 0.45 * Math.min(1, y / 0.5)).multiplyScalar(0.8)), H.x + (i - 1) * 0.5, H.z - 0.1, H.h - 0.05));
    }
  }
  // the anvil: a block, a wide iron top and a horn
  const A = G.ANVIL;
  const iron = 0x4a4650;
  box(0.46, 0.42, 0.46, A.x, A.z, 0, 0x6b5a4a, A.yaw);
  box(0.86, 0.22, 0.38, A.x, A.z, 0.42, iron, A.yaw);
  solid.push(shade(sit(new THREE.ConeGeometry(0.17, 0.5, 6).rotateZ(-Math.PI / 2).translate(0.65, 0.63, 0), A.x, A.z, 0, A.yaw), flat(iron, 0.02)));
  // the bench: a plank top on four legs, with a pale tool mat on it
  const B = G.BENCH;
  box(B.w, 0.1, B.d, B.x, B.z, B.h - 0.1, 0x9a7a5a, B.yaw);
  for (const [dx, dz] of [[-0.85, -0.25], [0.85, -0.25], [-0.85, 0.25], [0.85, 0.25]]) box(0.12, B.h - 0.1, 0.12, B.x + dx, B.z + dz, 0, 0x7d6048);
  box(0.8, 0.04, 0.4, B.x - 0.2, B.z, B.h, 0xb8a890);
  // the shelf: a ledge of stone with a small bright crystal and a mug on it, the top exactly SHELF.h over the floor at the mouse
  const S = G.SHELF;
  const top = crystalY(G.SHELF_MOUSE.x, G.SHELF_MOUSE.z) + S.h;
  const base = Math.min(crystalY(S.x - S.w / 2, S.z), crystalY(S.x + S.w / 2, S.z), crystalY(S.x, S.z - S.d / 2), crystalY(S.x, S.z + S.d / 2)) - 0.1;
  solid.push(shade(new THREE.BoxGeometry(S.w, top - base, S.d).translate(S.x, base + (top - base) / 2, S.z), flat(0x9c8e96)));
  solid.push(shade(new THREE.BoxGeometry(S.w + 0.2, 0.1, S.d + 0.2).translate(S.x, top - 0.05, S.z), flat(0xb4a6ac)));
  solid.push(shade(new THREE.CylinderGeometry(0.1, 0.09, 0.2, 6).translate(S.x + 0.6, top + 0.1, S.z + 0.1), flat(0xd8c8b0)));
  // the floor's warm light and its halo round the hearth (additive)
  warm.push(glowDisc(G.LIGHT_POOL.x, G.LIGHT_POOL.z, G.LIGHT_POOL.r, 0xff9a4a, 0.34, 0.06, 5, 24));
  warm.push(glowDisc(H.x, H.z - 0.2, 1.5, 0xffc060, 0.28, H.h - 0.2, 3, 16));
  return { solid: mergeGeometries(solid), warm: mergeGeometries(warm) };
}

// ---- the four meshes ----------------------------------------------------------------------------------------------------------------------------------------
export function drawGrotto(rung = 'high') {
  const g = grottoGeometries(rung);
  const capMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const haloMat = new THREE.MeshBasicMaterial({ vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
  const caps = markMesh(new THREE.Mesh(g.solid, capMat), 'crystal:grotto');
  const halo = markMesh(new THREE.Mesh(g.halo, haloMat), 'crystal:grottoglow');
  halo.renderOrder = 2;
  return { meshes: [caps, halo], caps, halo };
}
export function drawForge(rung = 'high') {
  const g = forgeGeometries(rung);
  const stone = litMaterial(0xffffff, { vertexColors: true, roughness: 0.85 });
  const warmMat = new THREE.MeshBasicMaterial({ vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const solid = markMesh(new THREE.Mesh(g.solid, stone), 'crystal:forge');
  solid.castShadow = false; solid.receiveShadow = true;
  const warm = markMesh(new THREE.Mesh(g.warm, warmMat), 'crystal:forgeglow');
  warm.renderOrder = 2;
  return { meshes: [solid, warm], solid, warm };
}
