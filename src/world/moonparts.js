// =============================================================================
// THE MOON: THE DRAWING KIT (milestone 1). The ground (one heightfield mesh in the game's own gravel tile, vertex-coloured:
// dust, darker bowls, lighter rims), the rocks (four InstancedMeshes), the lander, the return gate ring, the flag and the
// landing lights, gathered by material into a few merged meshes. No real lights, no canvas, no Math.random: every number
// comes from moonplan.js and the seeded stream below (the area builds in withLocalUuids).
// =============================================================================

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { litMaterial, tileMetres } from '../render/materials.js';
import { mulberry32 } from '../rng.js';
import * as P from './moonplan.js';

export const COL = Object.freeze({
  dust: 0x8d8c93, white: 0xe9ecf2, steel: 0x7d848f, yellow: 0xf0c43c, red: 0xd8503c, teal: 0x3a9aa8, dark: 0x2a2f3a,
  rock: 0x8b8a8d, glow: 0xffd987, ring: 0xbfe9ff,
});

// ---- the ground ------------------------------------------------------------------------------------------------------

// Grid lines: 2 m across the walkable plain, coarser out in the hills (they are only ever seen, never walked).
function lines(min, max, edge, outer) {
  const out = [];
  for (let i = 0; i < outer; i++) out.push(-edge + ((edge + min) * i) / outer);
  for (let v = min; v < max - 1e-6; v += 2) out.push(v);
  for (let i = 0; i <= outer; i++) out.push(max + ((edge - max) * i) / outer);
  return out;
}

const _c = new THREE.Color();
const noise = (x, z) => 0.5 + 0.25 * Math.sin(x * 0.21 + 1.3) * Math.cos(z * 0.17 - 0.4) + 0.15 * Math.sin(x * 0.53 - z * 0.41) + 0.1 * Math.sin(z * 0.9 + x * 0.3);

export function groundGeometry() {
  const half = P.GROUND_SIZE / 2;
  const xs = lines(P.MOON_BOUNDS.minX, P.MOON_BOUNDS.maxX, half, 2);
  const zs = lines(P.MOON_BOUNDS.minZ, P.MOON_BOUNDS.maxZ, half, 3);
  const nx = xs.length;
  const nz = zs.length;
  const pos = new Float32Array(nx * nz * 3);
  const uv = new Float32Array(nx * nz * 2);
  const col = new Float32Array(nx * nz * 3);
  const T = tileMetres('gravel') ?? 1.4;
  const index = [];
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      const x = xs[i];
      const z = zs[j];
      const y = P.moonBaseY(x, z);
      pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
      uv[k * 2] = x / T; uv[k * 2 + 1] = z / T;
      // dust: a slow mottle, darker in the bowls' floors, lighter on their rims and the ridge's top, a little cooler and darker far away
      let tone = 0.86 + 0.26 * noise(x, z);
      let floor = 0;
      for (const cr of P.CRATERS) {
        const u = Math.hypot(x - cr.x, z - cr.z) / cr.r;
        if (u < 1) floor = Math.max(floor, 1 - u * u);
        else if (u < 1.35) tone += 0.1 * (1 - (u - 1) / 0.35);
      }
      tone -= 0.14 * floor;
      tone += Math.min(0.1, Math.max(0, y) * 0.03);
      const out = Math.max(0, Math.hypot(Math.max(P.MOON_BOUNDS.minX - x, 0, x - P.MOON_BOUNDS.maxX), Math.max(P.MOON_BOUNDS.minZ - z, 0, z - P.MOON_BOUNDS.maxZ)));
      _c.setHex(COL.dust);
      const far = Math.min(1, out / 11);
      col[k * 3] = _c.r * tone * (1 - 0.3 * far);
      col[k * 3 + 1] = _c.g * tone * (1 - 0.27 * far);
      col[k * 3 + 2] = _c.b * tone * (1 - 0.15 * far);
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
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

export function drawGround() {
  const mat = litMaterial(0xffffff, { vertexColors: true, surface: 'gravel', repeat: [1, 1] });
  const m = new THREE.Mesh(groundGeometry(), mat);
  m.name = 'moon:ground';
  m.receiveShadow = true;
  Object.assign(m.userData, { ground: true, noCast: true, noContactShadow: true, noMerge: true });
  return m;
}

// ---- the rocks -------------------------------------------------------------------------------------------------------

// A lumpy rock: an icosahedron pushed about by a fixed hash, flat-shaded.
function rockGeometry(detail, salt) {
  const g = new THREE.IcosahedronGeometry(1, detail); // non-indexed already
  const pos = g.attributes.position;
  const seen = new Map();
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    let k = seen.get(key);
    if (k === undefined) { k = 0.8 + 0.4 * (0.5 + 0.5 * Math.sin((seen.size + 1) * 12.9898 + salt * 78.233)); seen.set(key, k); }
    pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k * 0.72, pos.getZ(i) * k);
  }
  g.computeVertexNormals();
  return g;
}

function keepClear(x, z, extra = 0) {
  for (const [kx, kz, kr] of P.ROCK_KEEP_OUT) if (Math.hypot(x - kx, z - kz) < kr + extra) return false;
  for (const cr of P.CRATERS) if (Math.hypot(x - cr.x, z - cr.z) < cr.r * 0.55) return false; // no rocks on a bowl's floor
  for (const b of P.BOULDERS) if (Math.hypot(x - b.x, z - b.z) < b.r + extra + 0.5) return false;
  if (P.trackDistance(x, z) < 1.8 + extra) return false; // Dot's track of lights is clear (milestone 3)
  if (Math.abs(x) > P.MOON_BOUNDS.maxX - 2 || z < P.MOON_BOUNDS.minZ + 2 || z > P.MOON_BOUNDS.maxZ - 2) return false;
  return true;
}

// Where every rock stands, by class: { x, z, s (radius), yaw }. A pure function of the plan (a seeded stream per class).
export function scatterRocks(lowTier = false) {
  const out = {};
  for (const [name, cls] of Object.entries(P.ROCK_CLASSES)) {
    const rng = mulberry32(0x6d6f6f6e + name.length * 977);
    const list = [];
    const want = name === 'small' && lowTier ? 0 : cls.count;
    let tries = 0;
    while (list.length < want && tries++ < 4000) {
      const x = P.MOON_BOUNDS.minX + rng() * (P.MOON_BOUNDS.maxX - P.MOON_BOUNDS.minX);
      const z = P.MOON_BOUNDS.minZ + rng() * (P.MOON_BOUNDS.maxZ - P.MOON_BOUNDS.minZ);
      const s = cls.min + rng() ** 2 * (cls.max - cls.min);
      const yaw = rng() * Math.PI * 2;
      if (keepClear(x, z, s)) list.push({ x, z, s, yaw });
    }
    out[name] = list;
  }
  out.boulder = P.BOULDERS.map((b, i) => ({ x: b.x, z: b.z, s: b.r * 0.82, yaw: i * 1.7 }));
  return out;
}

// Two InstancedMeshes (milestone 4 merged the medium, large and boulder meshes into one, `big`: they were three draws in the picture and
// three more in the shadow pass for the same shape in three sizes): the small rocks (a 20-triangle stone, never a caster) and the big ones
// (an 80-triangle stone, 70 instances: the 40 medium, the 20 large and the 10 boulders, each scaled and turned by its own instance).
export function drawRocks(lowTier = false) {
  const rocks = scatterRocks(lowTier);
  const specs = [['small', 0, 1, rocks.small], ['big', 1, 2, [...rocks.medium, ...rocks.large, ...rocks.boulder]]];
  const meshes = [];
  const tint = new THREE.Color();
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  for (const [name, detail, salt, list] of specs) {
    if (!list.length) continue;
    const mat = litMaterial(0xffffff, { roughness: 1, flatShading: true });
    const mesh = new THREE.InstancedMesh(rockGeometry(detail, salt), mat, list.length);
    mesh.name = `moon:rocks-${name}`;
    list.forEach((r, i) => {
      q.setFromAxisAngle(up, r.yaw);
      m4.compose(new THREE.Vector3(r.x, P.moonY(r.x, r.z) + r.s * 0.2, r.z), q, new THREE.Vector3(r.s * (1 + 0.25 * Math.sin(i * 2.3)), r.s, r.s * (1 + 0.25 * Math.cos(i * 1.7))));
      mesh.setMatrixAt(i, m4);
      tint.setHex(COL.rock).multiplyScalar(0.78 + 0.34 * (0.5 + 0.5 * Math.sin(i * 7.31 + salt)));
      mesh.setColorAt(i, tint);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.receiveShadow = true;
    mesh.castShadow = name !== 'small';
    Object.assign(mesh.userData, { noContactShadow: true, noMerge: true });
    if (name === 'small') mesh.userData.noCast = true;
    mesh.computeBoundingSphere();
    mesh.computeBoundingBox();
    meshes.push(mesh);
  }
  return meshes;
}

// ---- the kit: pieces gathered by material, one merged mesh per bucket ------------------------------------------------

export function createKit(prefix) {
  const buckets = new Map();
  return {
    put(key, mat, geo, { noCast = false } = {}) {
      let b = buckets.get(key);
      if (!b) buckets.set(key, (b = { key, mat, noCast, geos: [] }));
      b.geos.push(geo);
    },
    meshes() {
      return [...buckets.values()].map((b) => {
        const m = new THREE.Mesh(b.geos.length === 1 ? b.geos[0] : mergeGeometries(b.geos), b.mat);
        m.name = `${prefix}:${b.key}`;
        m.castShadow = !b.noCast;
        m.receiveShadow = true;
        m.userData.noContactShadow = true;
        m.userData.noMerge = true; // one mesh per material already; the base's animated ones are found by name
        if (b.noCast) m.userData.noCast = true;
        return m;
      });
    },
  };
}

export function moonMaterials() {
  return {
    paint: litMaterial(0xffffff, { vertexColors: true, roughness: 0.6 }),
    stone: litMaterial(0xffffff, { vertexColors: true, roughness: 1 }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
    disc: new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide }),
    shaft: new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide }),
  };
}

// Paint a geometry one colour (non-indexed, with position, normal, uv and colour so any two merge).
export function paint(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  _c.setHex(hex);
  for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

// place(geo, x, z, dy, ry): sit a geometry on the ground at (x, z), dy over it, turned ry about the vertical.
export const at = (geo, x, z, dy = 0, ry = 0, rz = 0) => {
  if (rz) geo.rotateZ(rz);
  if (ry) geo.rotateY(ry);
  geo.translate(x, P.moonY(x, z) + dy, z);
  return geo;
};
export const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
export const cyl = (rt, rb, h, seg = 8, open = false) => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);

export function drawLander(kit, M) {
  const { x, z, r, deck } = P.LANDER;
  // the body: an eight-sided drum with a flat deck, a yellow band, a dark hatch on the side that faces the spawn (+z)
  kit.put('paint', M.paint, paint(at(cyl(r, r + 0.35, 1.7, 8), x, z, 2.15), COL.white));
  kit.put('paint', M.paint, paint(at(cyl(r + 0.08, r + 0.08, 0.28, 8), x, z, 2.05), COL.yellow));
  kit.put('paint', M.paint, paint(at(cyl(r - 0.05, r - 0.05, 0.12, 8), x, z, deck - 0.06), COL.steel));
  kit.put('paint', M.paint, paint(at(box(0.95, 1.4, 0.12), x, z + r + 0.2, 1.9), COL.dark));
  // the engine bell under the belly, an antenna mast and a small dish on the deck
  kit.put('paint', M.paint, paint(at(cyl(0.5, 0.8, 0.7, 8), x, z, 1.0), COL.steel));
  kit.put('paint', M.paint, paint(at(cyl(0.04, 0.04, 1.4, 5), x - 0.7, z - 0.5, deck + 0.7), COL.steel));
  kit.put('paint', M.paint, paint(at(new THREE.SphereGeometry(0.4, 8, 4, 0, Math.PI * 2, 0, 0.9), x + 0.5, z - 0.3, deck + 0.35, 0, Math.PI), COL.white));
  // four legs and their pads
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    kit.put('paint', M.paint, paint(at(box(0.16, 2.0, 0.16), x + Math.cos(a) * 2.4, z + Math.sin(a) * 2.4, 1.1, -a, 0.4), COL.steel));
    kit.put('paint', M.paint, paint(at(cyl(0.5, 0.55, 0.1, 8), x + Math.cos(a) * 3.05, z + Math.sin(a) * 3.05, 0.05), COL.steel));
  }
  // the boarding steps: a crate (1.0 m) and a ledge (2.1 m) on its post, then the deck
  const A = P.STEP_A;
  kit.put('paint', M.paint, paint(at(box(A.w, A.y, A.w), A.x, A.z, A.y / 2), COL.yellow));
  const B = P.STEP_B;
  kit.put('paint', M.paint, paint(at(box(B.w, 0.22, B.d), B.x, B.z, B.y - 0.11), COL.steel));
  kit.put('paint', M.paint, paint(at(cyl(0.07, 0.07, B.y - 0.22, 5), B.x - 0.5, B.z + 0.2, (B.y - 0.22) / 2), COL.steel));
  kit.put('paint', M.paint, paint(at(cyl(0.07, 0.07, B.y - 0.22, 5), B.x + 0.5, B.z + 0.2, (B.y - 0.22) / 2), COL.steel));
}

export function drawFlag(kit, M) {
  const { x, z } = P.FLAG;
  kit.put('paint', M.paint, paint(at(cyl(0.04, 0.04, 2.6, 6), x, z, 1.3), COL.steel));
  kit.put('paint', M.paint, paint(at(box(1.1, 0.7, 0.03), x + 0.58, z, 2.2), COL.teal));
  kit.put('paint', M.paint, paint(at(cyl(0.2, 0.2, 0.04, 10).rotateX(Math.PI / 2), x + 0.58, z + 0.03, 2.2), COL.white));
}

// Four landing lights: a thin post with a glowing lamp on top.
export function drawLights(kit, M) {
  for (const p of P.POLES) {
    kit.put('paint', M.paint, paint(at(cyl(0.05, 0.07, 2.2, 6), p.x, p.z, 1.1), COL.steel));
    kit.put('glow', M.glow, paint(at(new THREE.SphereGeometry(0.16, 8, 6), p.x, p.z, 2.3), COL.glow), { noCast: true });
  }
}

// The return gate: five leaning stones, a lintel over the back, a soft disc and a faint column of light. Inert in milestone 1.
export function drawGateRing(kit, M) {
  const g = P.RETURN_GATE;
  P.GATE_STONES.forEach((s, i) => {
    const h = 3.2 + (i % 2) * 0.5;
    kit.put('stone', M.stone, paint(at(box(0.7, h, 0.6), s.x, s.z, h / 2, -s.a, 0.06 * (i % 2 ? 1 : -1)), COL.rock));
  });
  kit.put('stone', M.stone, paint(at(box(2.2, 0.5, 0.7), g.x, g.z - g.r, 3.7), COL.rock));
  kit.put('disc', M.disc, paint(at(new THREE.CircleGeometry(2.1, 28).rotateX(-Math.PI / 2), g.x, g.z, 0.08), COL.ring), { noCast: true });
  kit.put('shaft', M.shaft, paint(at(cyl(2.0, 2.0, 3.2, 20, true), g.x, g.z, 1.7), COL.ring), { noCast: true });
}
