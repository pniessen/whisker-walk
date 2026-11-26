// =============================================================================
// THE CRYSTAL CAVE: THE DRAWING KIT (milestone C1). The smooth stone floor (one vertex-coloured heightfield, lit from the crystals by colour alone),
// the dome (ONE inside-only lathed mesh), the stalactites (ONE InstancedMesh), the return arch, the rim rocks and pebbles (merged by material) and the
// crystal clusters (emissive vertex colour, one merged mesh per hue so each hue can pulse on its own). The cave's ONE real light is made here, at build,
// at intensity 0 (the advisor's answer 4: never more than one PointLight in the place). No canvas, no Math.random: every number is crystalplan.js's.
// =============================================================================

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { litMaterial } from '../render/materials.js';
import * as P from './crystalplan.js';
import { BLUE_GREAT, GOLD_GREAT, HEART_GREAT } from './crystalwingplan.js';

export const COL = Object.freeze({
  stone: 0x9a8a9c, stoneDark: 0x6c5a70, stoneLight: 0xc4b4c6, warm: 0xffd9a8, glow: 0xffe0b0, rim: 0x4a3a52,
});

const _c = new THREE.Color();
const _d = new THREE.Color();

// A soft round dot (a 32 x 32 data texture, no canvas: it works in a test too) so the glints, lamps and motes are round and not square.
let _dot = null;
export function dotTexture() {
  if (_dot) return _dot;
  const n = 32;
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const r = Math.hypot(x + 0.5 - n / 2, y + 0.5 - n / 2) / (n / 2);
    const a = r >= 1 ? 0 : (1 - r) ** 1.4;
    const k = (y * n + x) * 4;
    data[k] = data[k + 1] = data[k + 2] = 255; data[k + 3] = Math.round(255 * a);
  }
  _dot = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  _dot.needsUpdate = true;
  return _dot;
}

// ---- the floor ------------------------------------------------------------------------------------------------------------
function lines(min, max, edge, outer) {
  const out = [];
  for (let i = 0; i < outer; i++) out.push(-edge + ((edge + min) * i) / outer);
  for (let v = min; v < max - 1e-6; v += 2) out.push(v);
  for (let i = 0; i <= outer; i++) out.push(max + ((edge - max) * i) / outer);
  return out;
}

// The stone's tone: a soft mottle, and the light the crystals throw (a pool of their hue on the floor round each cluster, in the vertex colour).
function floorColour(x, z, clusters, out) {
  _c.setHex(P.CAVE_LOOK.stone);
  _d.setHex(P.CAVE_LOOK.stoneDark);
  const mottle = 0.5 + 0.5 * Math.sin(x * 0.9 + Math.sin(z * 0.4) * 2) * Math.cos(z * 0.7 + x * 0.1);
  _c.lerp(_d, 0.35 * mottle);
  const grain = Math.sin(x * 2.3 + Math.sin(z * 1.7) * 1.5) * Math.sin(z * 2.1 - x * 0.6); // finer patches, so the stone is not one grey
  _d.setHex(0xb08a8c); // a warm rose-clay patch here and there
  _c.lerp(_d, Math.max(0, grain) * 0.3);
  const tone = 0.93 + 0.05 * Math.sin((x + z) * 0.31) + 0.03 * grain;
  let r = _c.r * tone; let g = _c.g * tone; let b = _c.b * tone;
  for (const k of clusters) {
    const d2 = (x - k.x) * (x - k.x) + (z - k.z) * (z - k.z);
    const sh = 1 - 0.28 * Math.exp(-d2 / (k.s * k.s * 0.6)); // the foot of each cluster sits in a little shade
    r *= sh; g *= sh; b *= sh;
    const reach = k.s * 3.2;
    if (d2 > reach * reach) continue;
    const w = 0.42 * (k.great ? 1.5 : 1) * Math.exp(-d2 / (k.s * k.s * 3.2));
    _d.setHex(P.HUE_COLOURS[k.hue]);
    r += (_d.r - r) * w; g += (_d.g - g) * w; b += (_d.b - b) * w;
  }
  out[0] = r; out[1] = g; out[2] = b;
}

export function groundGeometry(clusters = [...P.scatterClusters(), BLUE_GREAT, GOLD_GREAT, HEART_GREAT]) {
  const half = P.GROUND_SIZE / 2;
  const xs = lines(P.CRYSTAL_BOUNDS.minX, P.CRYSTAL_BOUNDS.maxX, half, 3);
  const zs = lines(P.CRYSTAL_BOUNDS.minZ, P.CRYSTAL_BOUNDS.maxZ, half, 4);
  const nx = xs.length;
  const nz = zs.length;
  const pos = new Float32Array(nx * nz * 3);
  const col = new Float32Array(nx * nz * 3);
  const index = [];
  const rgb = [0, 0, 0];
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      const x = xs[i];
      const z = zs[j];
      pos[k * 3] = x; pos[k * 3 + 1] = P.crystalY(x, z); pos[k * 3 + 2] = z;
      floorColour(x, z, clusters, rgb);
      col[k * 3] = rgb[0]; col[k * 3 + 1] = rgb[1]; col[k * 3 + 2] = rgb[2];
    }
  }
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i;
      const b = a + 1;
      const c = a + nx;
      const d = c + 1;
      index.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

export function drawGround() {
  const m = new THREE.Mesh(groundGeometry(), new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.85, metalness: 0 }));
  m.name = 'crystal:ground';
  m.receiveShadow = true;
  Object.assign(m.userData, { ground: true, noCast: true, noContactShadow: true, noMerge: true });
  return m;
}

// ---- the dome and the stalactites ---------------------------------------------------------------------------------------------
// One lathed shell drawn on its inside only (BackSide): from outside it is not there, so a camera that ever slipped past the wall would see nothing wrong.
export function domeGeometry() {
  const pts = P.DOME_PROFILE.map(([r, y]) => new THREE.Vector2(r, y));
  const g = new THREE.LatheGeometry(pts, 28);
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const lo = new THREE.Color(0x4a3458);
  const hi = new THREE.Color(0x7a5a80);
  for (let v = 0; v < pos.count; v++) {
    const y = pos.getY(v);
    _c.copy(lo).lerp(hi, clamp01((y - 4) / 13));
    const a = Math.atan2(pos.getZ(v), pos.getX(v));
    _c.multiplyScalar(0.9 + 0.14 * Math.sin(a * 5 + y * 0.35) * Math.cos(a * 3 - y * 0.2)); // slow patches of lighter and darker rock
    _d.setHex(0xa06a78);
    _c.lerp(_d, 0.32 * clamp01(1 - Math.abs(y - 6) / 5)); // a warm rose band where the wall meets the glow
    col[v * 3] = _c.r; col[v * 3 + 1] = _c.g; col[v * 3 + 2] = _c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export function drawDome() {
  const m = new THREE.Mesh(domeGeometry(), new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide }));
  m.name = 'crystal:dome';
  m.frustumCulled = false; // its bounding sphere is the whole cave; the camera is always inside it
  Object.assign(m.userData, { noCast: true, noContactShadow: true, noMerge: true });
  return m;
}

// One stalactite: a thin hexagonal cone, point down, 1 m long at scale 1 (colour from the dome's violet at the root to a warm rose at the tip).
export function stalactiteGeometry() {
  const g = new THREE.ConeGeometry(0.5, 1, 6, 1, true).rotateX(Math.PI).translate(0, -0.5, 0).toNonIndexed(); // root at y 0, tip at y -1
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const root = new THREE.Color(0x5a4466);
  const tip = new THREE.Color(0xd8a0b8);
  for (let v = 0; v < pos.count; v++) {
    _c.copy(root).lerp(tip, clamp01(-pos.getY(v)));
    col[v * 3] = _c.r; col[v * 3 + 1] = _c.g; col[v * 3 + 2] = _c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

export function drawStalactites() {
  const list = P.scatterStalactites();
  const mesh = new THREE.InstancedMesh(stalactiteGeometry(), new THREE.MeshBasicMaterial({ vertexColors: true }), list.length);
  mesh.name = 'crystal:stalactites';
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const sc = new THREE.Vector3();
  list.forEach((k, i) => {
    pos.set(k.x, k.y + 0.2, k.z);
    sc.set(k.w * 2, k.h, k.w * 2);
    m4.compose(pos, q, sc);
    mesh.setMatrixAt(i, m4);
    _c.setHSL(0.86 + 0.07 * Math.sin(i * 2.9), 0.25 + 0.15 * Math.sin(i * 1.3 + 1), 0.62 + 0.28 * (0.5 + 0.5 * Math.sin(i * 4.1))); // each its own warm tone
    mesh.setColorAt(i, _c);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  Object.assign(mesh.userData, { noCast: true, noContactShadow: true, noMerge: true });
  return mesh;
}

// ---- the kit: pieces gathered by material, one merged mesh per bucket ------------------------------------------------

export function createKit(prefix) {
  const buckets = new Map();
  return {
    put(key, mat, geo, { noCast = false, pulse = null } = {}) {
      let b = buckets.get(key);
      if (!b) buckets.set(key, (b = { key, mat, noCast, pulse, geos: [] }));
      b.geos.push(geo);
    },
    meshes() {
      return [...buckets.values()].map((b) => {
        const geo = b.geos.length === 1 ? b.geos[0] : mergeGeometries(b.geos);
        const m = new THREE.Mesh(geo, b.mat);
        m.name = `${prefix}:${b.key}`;
        m.castShadow = !b.noCast;
        m.receiveShadow = true;
        m.userData.noContactShadow = true;
        m.userData.noMerge = true; // one mesh per material already
        if (b.noCast) m.userData.noCast = true;
        if (b.pulse) m.userData.pulse = b.pulse;
        return m;
      });
    },
  };
}

export function crystalMaterials() {
  const glow = {};
  for (const h of P.HUES) glow[h] = new THREE.MeshBasicMaterial({ vertexColors: true });
  return {
    paint: litMaterial(0xffffff, { vertexColors: true, roughness: 0.8 }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true }), // the arch's door of light (never pulses)
    hue: glow, // one per hue: a material colour scalar of 1 is the crystal as drawn; the life breathes it
  };
}

// Paint a geometry one colour (non-indexed, with position, normal, uv and colour so any two merge).
export function paint(geo, hex, jitter = 0) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  _c.setHex(hex);
  if (jitter) _c.offsetHSL(jitter * 0.02, 0, jitter * 0.08); // each rock its own tone
  for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

// A geometry painted from a base colour (at y 0) to a bright one (at its top y = `top`): the crystal's own glow runs bright toward the point.
const FACET = [1.0, 0.82, 0.93, 0.76, 0.97, 0.86]; // six faces, six tones: the cut sides catch the glow differently
function gradient(geo, baseHex, tipHex, top, tint = 0) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const a = new THREE.Color(baseHex);
  const b = new THREE.Color(tipHex);
  for (let v = 0; v < pos.count; v++) {
    _c.copy(a).lerp(b, clamp01(pos.getY(v) / top));
    if (tint) _c.offsetHSL(tint * 0.025, 0, tint * 0.03); // this crystal leans a little to one side of its hue
    const f = v - (v % 3); // the triangle's first vertex: its centre decides which face it is
    const ang = Math.atan2(pos.getZ(f) + pos.getZ(f + 1) + pos.getZ(f + 2), pos.getX(f) + pos.getX(f + 1) + pos.getX(f + 2));
    const face = Math.floor(((ang + Math.PI) / (Math.PI * 2)) * 6) % 6;
    _c.multiplyScalar(FACET[face] * (0.9 + 0.1 * clamp01(pos.getY(v) / top)));
    col[v * 3] = _c.r; col[v * 3 + 1] = _c.g; col[v * 3 + 2] = _c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

// place(geo, x, z, dy, ry): sit a geometry on the floor at (x, z), dy over it, turned ry about the vertical.
export const at = (geo, x, z, dy = 0, ry = 0) => {
  if (ry) geo.rotateY(ry);
  geo.translate(x, P.crystalY(x, z) + dy, z);
  return geo;
};
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, seg = 8) => new THREE.CylinderGeometry(rt, rb, h, seg, 1);

// ---- the spawn: the return arch (the C6 gate marks it `own`) ----------------------------------------------------------------
export function drawSpawn(kit, M) {
  const A = P.ARCH;
  const px = A.w / 2 - 0.35;
  for (const sx of [-1, 1]) {
    kit.put('paint', M.paint, paint(at(cyl(0.5, 0.65, A.h, 8).rotateZ(-sx * 0.05), A.x + sx * px, A.z, A.h / 2), COL.stone));
    kit.put('paint', M.paint, paint(at(new THREE.SphereGeometry(0.62, 7, 5), A.x + sx * px, A.z, 0.2), COL.stoneLight));
  }
  kit.put('paint', M.paint, paint(at(box(A.w + 0.8, 0.6, A.depth), A.x, A.z, A.h + 0.1), COL.stone));
  kit.put('paint', M.paint, paint(at(box(A.w - 0.6, 0.18, A.depth + 0.12), A.x, A.z, A.h - 0.25), COL.stoneLight));
  // a few small crystals on the lintel, so the arch is the cave's own
  const hues = ['rose', 'blue', 'gold', 'rose', 'blue'];
  hues.forEach((h, i) => {
    const x = A.x - 1.6 + i * 0.8;
    kit.put(`hue:${h}`, M.hue[h], crystalPrism(0.12, 0.55 + (i % 2) * 0.3, h, x, A.z, A.h + 0.4, 0, true), { noCast: true, pulse: { hue: h } });
  });
  // the door's soft light (the view through the arch)
  { // brightest low and in the middle, deepening to rose at the top and the edges, so it reads as light and not a flat card
    const dg = at(new THREE.PlaneGeometry(A.w - 1.2, A.h - 0.7, 4, 4).toNonIndexed(), A.x, A.z + 0.02, (A.h - 0.7) / 2 + 0.15);
    const dp = dg.attributes.position; const dc = new Float32Array(dp.count * 3);
    const mid = new THREE.Color(COL.glow); const edge = new THREE.Color(0xe08a98);
    for (let v = 0; v < dp.count; v++) {
      const u = Math.abs(dp.getX(v) - A.x) / ((A.w - 1.2) / 2);
      const w = clamp01((dp.getY(v) - P.crystalY(A.x, A.z)) / (A.h - 0.4));
      _c.copy(mid).lerp(edge, clamp01(0.55 * u * u + 0.5 * w * w));
      dc[v * 3] = _c.r; dc[v * 3 + 1] = _c.g; dc[v * 3 + 2] = _c.b;
    }
    dg.setAttribute('color', new THREE.BufferAttribute(dc, 3));
    if (!dg.attributes.normal) dg.computeVertexNormals();
    if (!dg.attributes.uv) dg.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(dp.count * 2), 2));
    kit.put('glow', M.glow, dg, { noCast: true });
  }
}

// ---- the crystals --------------------------------------------------------------------------------------------------------------
const tipOf = (h) => new THREE.Color(P.HUE_COLOURS[h]).lerp(new THREE.Color(0xffffff), 0.16).getHex(); // brighter toward the point, but still its own colour
const baseOf = (h) => new THREE.Color(P.HUE_COLOURS[h]).multiplyScalar(0.72).getHex();

// One prism: a tapering hexagonal column and a pyramid tip, glowing brighter toward the point. `over` sits it at (x, z) at height dy over the floor.
export function crystalPrism(r, h, hue, x, z, dy, yaw, flat = false, tint = 0) {
  const colH = h * 0.72;
  const col = cyl(r * 0.8, r, colH, 6).translate(0, colH / 2, 0);
  const tip = new THREE.ConeGeometry(r * 0.8, h - colH, 6, 1).translate(0, colH + (h - colH) / 2, 0);
  const g = mergeGeometries([col, tip].map((p) => { const n = p.toNonIndexed(); p.dispose(); return n; }));
  const out = gradient(g, baseOf(hue), tipOf(hue), h, tint);
  if (flat) { out.rotateY(yaw); out.translate(x, P.crystalY(x, z) + dy, z); return out; }
  return at(out, x, z, dy, yaw);
}

export function clusterGeometry(k, i) {
  const parts = [];
  for (let n = 0; n < k.n; n++) {
    const a = n * 2.4 + i + k.yaw;
    const spread = n === 0 ? 0 : k.s * (0.28 + 0.12 * (n % 2));
    const h = k.s * (n === 0 ? 1.7 : 0.8 + 0.45 * ((n + i) % 3));
    const r = k.s * (n === 0 ? 0.26 : 0.17);
    const px = k.x + Math.cos(a) * spread;
    const pz = k.z + Math.sin(a) * spread;
    const g = crystalPrism(r, h, k.hue, 0, 0, 0, 0, true, Math.sin(i * 1.9 + n * 2.3));
    g.rotateZ(n === 0 ? 0 : 0.28 * Math.cos(a)).rotateX(n === 0 ? 0 : 0.28 * Math.sin(a));
    g.translate(px, P.crystalY(px, pz) - 0.05, pz);
    parts.push(g);
  }
  return parts;
}

export function drawClusters(kit, M) {
  P.scatterClusters().forEach((k, i) => { for (const g of clusterGeometry(k, i)) kit.put(`hue:${k.hue}`, M.hue[k.hue], g, { noCast: true, pulse: { hue: k.hue } }); });
}

// ---- rocks ---------------------------------------------------------------------------------------------------------------------
export function drawRim(kit, M) {
  P.scatterRim().forEach((k, i) => {
    kit.put('paint', M.paint, paint(at(new THREE.DodecahedronGeometry(k.s, 0).scale(1, 0.9 + 0.5 * (i % 3), 1).translate(0, k.s * 0.4, 0), k.x, k.z, 0, k.yaw), i % 2 ? COL.stoneDark : COL.rim, Math.sin(i * 2.7)), { noCast: true });
  });
}

export function drawPebbles(kit, M) {
  P.scatterPebbles().forEach((k, i) => {
    kit.put('paint', M.paint, paint(at(new THREE.DodecahedronGeometry(k.s, 0).scale(1, 0.6, 1), k.x, k.z, 0.04, k.yaw), i % 3 ? COL.stoneLight : 0xd2b4b0, Math.sin(i * 1.9)), { noCast: true });
  });
}

// ---- the cave's ONE real light ----------------------------------------------------------------------------------------------
// Made at build with intensity 0 (so the shader's light count never changes mid-walk); the life follows the story with it. Everything else is emissive
// vertex colour. test/crystalworld.test.js counts the PointLights in the built scene.
export function drawLight() {
  const l = new THREE.PointLight(0xffc890, 0, 22, 2);
  l.name = 'crystal:light';
  l.position.set(0, 3.2, 22);
  l.castShadow = false;
  return l;
}
