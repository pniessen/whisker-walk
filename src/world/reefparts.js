// =============================================================================
// THE REEF: THE DRAWING KIT (milestone R1). The seabed (one heightfield mesh, vertex-coloured, with ripples), the spawn arch, the ladder and the ring
// buoy, the coral (merged by material), and the kelp (ONE InstancedMesh whose sway is in the vertex shader). No real lights, no canvas, no Math.random:
// every number comes from reefplan.js and its seeded streams (the area builds in withLocalUuids).
//
// The spike question (plan section 8, R1): does an InstancedMesh of swaying kelp survive mergeprops, the shadow-caster sweep and the contact-shadow
// scan? Yes: mergeKey skips an InstancedMesh outright, so it is neither merged nor flattened; the kelp carries `noCast` (thin blades cast no shadow:
// the sweep and the trim leave it out) and `noContactShadow` (the scan's footprint box would be the whole garden), and `noMerge` for the people who read
// the table; the sway lives in the material (a time uniform the life advances, frozen under reduced motion), so nothing walks the instances.
// test/reefworld.test.js runs the real mergeprops, assignShadowCasters and the footprint scan over it.
// =============================================================================

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { litMaterial } from '../render/materials.js';
import { mulberry32 } from '../rng.js';
import * as P from './reefplan.js';

export const COL = Object.freeze({
  sand: 0xecd9a0, sandDark: 0xc9b57e, stone: 0x8fa3a0, stoneLight: 0xb6c7c2, brass: 0xc99a3a, dark: 0x2e4a52,
  red: 0xd8503c, white: 0xf2efe6, glow: 0x8fe6de,
  kelpBase: 0x2c8a4a, kelpTip: 0xa4e27c,
  coral: Object.freeze([0xe8708a, 0xf08a4b, 0xa45fc4, 0xe8c34a]), coralDeep: Object.freeze([0xb84a66, 0xc4622f, 0x7c3f98, 0xb8982f]),
});

// ---- the seabed -----------------------------------------------------------------------------------------------------------

// Grid lines: 3 m across the walkable seabed, coarser out where it is only ever seen.
function lines(min, max, edge, outer) {
  const out = [];
  for (let i = 0; i < outer; i++) out.push(-edge + ((edge + min) * i) / outer);
  for (let v = min; v < max - 1e-6; v += 3) out.push(v);
  for (let i = 0; i <= outer; i++) out.push(max + ((edge - max) * i) / outer);
  return out;
}

const _c = new THREE.Color();
const _d = new THREE.Color();
export function groundGeometry() {
  const half = P.GROUND_SIZE / 2;
  const xs = lines(P.REEF_BOUNDS.minX, P.REEF_BOUNDS.maxX, half, 3);
  const zs = lines(P.REEF_BOUNDS.minZ, P.REEF_BOUNDS.maxZ, half, 4);
  const nx = xs.length;
  const nz = zs.length;
  const pos = new Float32Array(nx * nz * 3);
  const col = new Float32Array(nx * nz * 3);
  const index = [];
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      const x = xs[i];
      const z = zs[j];
      const y = P.reefY(x, z);
      pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
      // sand, a little darker in the troughs between the dunes, with ripples laid across it
      const low = 1 - Math.min(1, y / P.DUNE_MAX);
      _c.setHex(COL.sand);
      _d.setHex(COL.sandDark);
      _c.lerp(_d, 0.45 * low);
      const tone = P.rippleTone(x, z);
      col[k * 3] = _c.r * tone; col[k * 3 + 1] = _c.g * tone; col[k * 3 + 2] = _c.b * tone;
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
  const m = new THREE.Mesh(groundGeometry(), new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 1 }));
  m.name = 'reef:ground';
  m.receiveShadow = true;
  Object.assign(m.userData, { ground: true, noCast: true, noContactShadow: true, noMerge: true });
  return m;
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
        const geo = b.geos.length === 1 ? b.geos[0] : mergeGeometries(b.geos);
        const m = new THREE.Mesh(geo, b.mat);
        m.name = `${prefix}:${b.key}`;
        m.castShadow = !b.noCast;
        m.receiveShadow = true;
        m.userData.noContactShadow = true;
        m.userData.noMerge = true; // one mesh per material already
        if (b.noCast) m.userData.noCast = true;
        return m;
      });
    },
  };
}

export function reefMaterials() {
  return {
    paint: litMaterial(0xffffff, { vertexColors: true, roughness: 0.75 }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
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

// place(geo, x, z, dy, ry, rz): sit a geometry on the seabed at (x, z), dy over it, turned ry about the vertical.
export const at = (geo, x, z, dy = 0, ry = 0, rz = 0) => {
  if (rz) geo.rotateZ(rz);
  if (ry) geo.rotateY(ry);
  geo.translate(x, P.reefY(x, z) + dy, z);
  return geo;
};
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, seg = 8) => new THREE.CylinderGeometry(rt, rb, h, seg, 1);

// ---- the spawn: the return arch, the ladder and the ring buoy (the arch is the gate's own return end since R6: teleport.js reef-seaside, `own`) --------------------

export function drawSpawn(kit, M) {
  const A = P.ARCH;
  const px = A.w / 2 - 0.35;
  for (const sx of [-1, 1]) {
    kit.put('paint', M.paint, paint(at(cyl(0.5, 0.65, A.h, 8), A.x + sx * px, A.z, A.h / 2, 0, -sx * 0.05), COL.stone));
    kit.put('paint', M.paint, paint(at(new THREE.SphereGeometry(0.62, 7, 5), A.x + sx * px, A.z, 0.2), COL.stoneLight));
  }
  kit.put('paint', M.paint, paint(at(box(A.w + 0.8, 0.6, A.depth), A.x, A.z, A.h + 0.1), COL.stone));
  kit.put('paint', M.paint, paint(at(box(A.w - 0.6, 0.18, A.depth + 0.12), A.x, A.z, A.h - 0.25), COL.stoneLight));
  // a little coral on the lintel, so the arch is the Reef's own
  for (let i = 0; i < 5; i++) {
    const x = A.x - 1.6 + i * 0.8;
    kit.put('paint', M.paint, paint(at(cyl(0.06, 0.16, 0.5 + (i % 2) * 0.25, 6), x, A.z, A.h + 0.65), COL.coral[i % 4]));
  }
  // the door's soft light (the view through the arch)
  kit.put('glow', M.glow, paint(at(new THREE.PlaneGeometry(A.w - 1.2, A.h - 0.7), A.x, A.z + 0.02, (A.h - 0.7) / 2 + 0.15), COL.glow), { noCast: true });

  // the ladder: two rails from the shimmer ceiling to the sand and the rungs between
  const L = P.LADDER;
  const gy = P.reefY(L.x, L.z);
  const len = P.SURFACE_Y - gy;
  for (const sx of [-1, 1]) kit.put('paint', M.paint, paint(at(cyl(0.035, 0.035, len, 5), L.x + (sx * L.width) / 2, L.z, len / 2 - 0.0), COL.brass), { noCast: true });
  for (let i = 0; i < L.rungs; i++) {
    const y = 0.25 + (i * (len - 0.5)) / (L.rungs - 1);
    kit.put('paint', M.paint, paint(at(cyl(0.025, 0.025, L.width, 5).rotateZ(Math.PI / 2), L.x, L.z, y), COL.brass), { noCast: true });
  }
  // the ring buoy hangs on the ladder's front: four red and white arcs
  const R = P.RING_BUOY;
  for (let i = 0; i < 4; i++) {
    const arc = new THREE.TorusGeometry(R.r, 0.1, 6, 8, Math.PI / 2).rotateZ((i * Math.PI) / 2);
    kit.put('paint', M.paint, paint(at(arc, R.x, R.z, R.y), i % 2 ? COL.white : COL.red), { noCast: true });
  }
}

// ---- the coral ----------------------------------------------------------------------------------------------------------------

function coralGeometry(k, i) {
  const hue = COL.coral[k.hue];
  const deep = COL.coralDeep[k.hue];
  const parts = [];
  const s = k.s;
  const put = (geo, hex) => parts.push(paint(at(geo, k.x, k.z, 0, k.yaw), hex));
  if (k.kind === 'brain') {
    put(new THREE.SphereGeometry(s * 0.9, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.7, 1).translate(0, 0, 0), hue);
    put(new THREE.TorusGeometry(s * 0.55, s * 0.07, 4, 10).rotateX(Math.PI / 2).translate(0, s * 0.42, 0), deep);
  } else if (k.kind === 'branch') {
    for (let b = 0; b < 4; b++) {
      const a = b * 1.7 + i;
      const h = s * (1.2 + 0.4 * ((b + i) % 3));
      put(cyl(s * 0.04, s * 0.14, h, 5).translate(0, h / 2, 0).rotateZ(0.35 * Math.sin(a)).rotateX(0.35 * Math.cos(a)).translate(Math.cos(a) * s * 0.3, 0, Math.sin(a) * s * 0.3), b % 2 ? hue : deep);
    }
  } else if (k.kind === 'fan') {
    put(new THREE.CircleGeometry(s * 0.95, 9, 0, Math.PI).translate(0, 0, 0).rotateX(0), hue);
    put(new THREE.CircleGeometry(s * 0.95, 9, 0, Math.PI).rotateY(Math.PI), deep);
    put(cyl(s * 0.05, s * 0.07, s * 0.2, 4).translate(0, s * 0.1, 0), deep);
  } else if (k.kind === 'tube') {
    for (let b = 0; b < 3; b++) {
      const h = s * (0.9 + 0.35 * b);
      put(new THREE.CylinderGeometry(s * 0.14, s * 0.2, h, 6, 1, true).translate((b - 1) * s * 0.34, h / 2, 0.1 * (b % 2)), hue);
      put(new THREE.CircleGeometry(s * 0.12, 6).rotateX(-Math.PI / 2).translate((b - 1) * s * 0.34, h - 0.01, 0.1 * (b % 2)), deep);
    }
  } else {
    put(new THREE.DodecahedronGeometry(s * 0.85, 0).scale(1, 0.62, 1).translate(0, s * 0.3, 0), COL.stone);
    put(new THREE.DodecahedronGeometry(s * 0.45, 0).translate(s * 0.7, s * 0.15, s * 0.2), COL.stoneLight);
  }
  return parts;
}

export function drawCoral(kit, M) {
  P.scatterCoral().forEach((k, i) => { for (const g of coralGeometry(k, i)) kit.put('paint', M.paint, g, { noCast: k.s < 0.7 }); });
}

// ---- the kelp: one InstancedMesh, the sway in the vertex shader -------------------------------------------------------------

// One blade: a tall ribbon of six segments (height 1, scaled by the instance), two crossed so it reads from every side; the colour runs from the
// dark base to the bright tip. The vertex shader bends it by (y squared) so the root stays put.
export const BLADE_SEGMENTS = 6;
export function bladeGeometry() {
  const parts = [];
  for (const rot of [0, Math.PI / 2]) {
    const g = new THREE.PlaneGeometry(0.3, 1, 1, BLADE_SEGMENTS);
    g.translate(0, 0.5, 0);
    const pos = g.attributes.position;
    for (let v = 0; v < pos.count; v++) {
      const t = pos.getY(v);
      pos.setX(v, pos.getX(v) * (1 - 0.8 * t)); // tapers to a point
    }
    g.rotateY(rot);
    parts.push(g);
  }
  const geo = mergeGeometries(parts.map((g) => { const n = g.toNonIndexed(); g.dispose(); return n; }));
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const a = new THREE.Color(COL.kelpBase);
  const b = new THREE.Color(COL.kelpTip);
  for (let v = 0; v < pos.count; v++) {
    _c.copy(a).lerp(b, pos.getY(v));
    col[v * 3] = _c.r; col[v * 3 + 1] = _c.g; col[v * 3 + 2] = _c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  return geo;
}

export const SWAY = Object.freeze({ amp: 0.4, speed: 0.9, rest: 0.5 });
// The kelp's material: lit, vertex-coloured, two-sided, its sway a time uniform (kelp.time.value) the life advances. At time 0 the blades stand at rest
// (a little bent: SWAY.rest of the way), which is also what reduced motion shows.
export function kelpMaterial() {
  const mat = litMaterial(0xffffff, { vertexColors: true, roughness: 0.8, side: THREE.DoubleSide });
  const time = { value: 0 };
  mat.userData.kelpTime = time;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uReefT = time;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uReefT;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      float sw = position.y * position.y;
      vec2 ip = vec2(instanceMatrix[3].x, instanceMatrix[3].z);
      float ph = ip.x * 0.7 + ip.y * 0.5;
      transformed.x += (sin(uReefT * ${SWAY.speed.toFixed(2)} + ph) + ${SWAY.rest.toFixed(2)}) * ${SWAY.amp.toFixed(2)} * sw;
      transformed.z += cos(uReefT * ${(SWAY.speed * 0.8).toFixed(2)} + ph * 1.3) * ${(SWAY.amp * 0.55).toFixed(2)} * sw;`);
  };
  mat.customProgramCacheKey = () => 'reef-kelp';
  return mat;
}

export function drawKelp() {
  const list = P.scatterKelp();
  const mesh = new THREE.InstancedMesh(bladeGeometry(), kelpMaterial(), list.length);
  mesh.name = 'reef:kelp';
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const eu = new THREE.Euler();
  const pos = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const tint = new THREE.Color();
  list.forEach((k, i) => {
    eu.set(k.lean, k.phase, k.lean * 0.5, 'YXZ');
    q.setFromEuler(eu);
    pos.set(k.x, P.reefY(k.x, k.z) - 0.05, k.z);
    sc.set(1, k.h, 1);
    m4.compose(pos, q, sc);
    mesh.setMatrixAt(i, m4);
    tint.setHex(0xffffff).multiplyScalar(0.8 + 0.3 * ((i * 0.618) % 1));
    mesh.setColorAt(i, tint);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  Object.assign(mesh.userData, { noCast: true, noContactShadow: true, noMerge: true, kelp: true });
  mesh.frustumCulled = false; // one mesh over the whole garden: its bounding sphere would be the origin's otherwise (the sway moves the tips, too)
  return mesh;
}

// A seeded little drift of small rocks keeps the sand from being bare (a few pebbles by the arch), part of the coral kit's 'paint'.
export function drawPebbles(kit, M) {
  const rng = mulberry32(0x70656262);
  for (let i = 0; i < 14; i++) {
    const x = P.REEF_SPAWN.x + (rng() - 0.5) * 12;
    const z = P.REEF_SPAWN.z + (rng() - 0.6) * 9;
    if (Math.hypot(x - P.LADDER.x, z - P.LADDER.z) < 1.2) continue;
    kit.put('paint', M.paint, paint(at(new THREE.DodecahedronGeometry(0.08 + rng() * 0.1, 0).scale(1, 0.6, 1), x, z, 0.04, rng() * 3), COL.stoneLight), { noCast: true });
  }
}
