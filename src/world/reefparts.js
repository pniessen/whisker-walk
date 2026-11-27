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
import { sandPatch } from './reefdecor.js';

// The Reef's lazy stages (the Sealab, R13) draw with the same three and the same merge, handed on from here (reef.js gives them to the stage): a stage chunk that
// imported three itself would pull three out of the start-up file into a chunk of its own (a build rule, test/lazybuild.test.js).
export const T3 = Object.freeze({ // (named members only: the whole namespace object would keep all of three)
  BufferGeometry: THREE.BufferGeometry, BufferAttribute: THREE.BufferAttribute, Color: THREE.Color, BoxGeometry: THREE.BoxGeometry, CylinderGeometry: THREE.CylinderGeometry,
  CircleGeometry: THREE.CircleGeometry, RingGeometry: THREE.RingGeometry, PlaneGeometry: THREE.PlaneGeometry, TorusGeometry: THREE.TorusGeometry, ConeGeometry: THREE.ConeGeometry, SphereGeometry: THREE.SphereGeometry,
  Mesh: THREE.Mesh, Group: THREE.Group, PointLight: THREE.PointLight, MeshStandardMaterial: THREE.MeshStandardMaterial, MeshBasicMaterial: THREE.MeshBasicMaterial, DoubleSide: THREE.DoubleSide,
});
export { mergeGeometries };

// beauty round 4: the rocks are not all one grey: mossy, blue, warm and plain stones to pick from by index
export const STONES = Object.freeze([0x8fa3a0, 0x8da59a, 0x93a1ad, 0xa0a496, 0x86a0a4]);
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

// How much a spot of sand sits in the shade of something standing on it (0 to 1): the coral, the boat, the anchor and the cave's mouth.
let settles = null;
function settleAt(x, z) {
  if (!settles) {
    settles = P.scatterCoralAll().map((k) => [k.x, k.z, k.s * 1.5]);
    settles.push([-32.8, -31.5, 4.2], [-29, -30, 3.2], [-36, -31.5, 3.2], [-23.5, -29.5, 1.8]); // the boat's belly, bow and stern, the anchor
  }
  let m = 0;
  for (const [cx, cz, r] of settles) {
    const d = Math.hypot(x - cx, z - cz);
    if (d < r) m = Math.max(m, (1 - d / r) ** 1.5);
  }
  return m;
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
      // beauty round 1: broad warm and cool drifts, a faint net of caustic light, and a soft dark settle round everything that stands on the sand
      const drift = 0.5 + 0.5 * Math.sin(x * 0.083 + 1.3) * Math.cos(z * 0.071 - 0.4);
      const net = Math.max(0, 1 - Math.abs(Math.sin(x * 0.55 + Math.sin(z * 0.4) * 1.6) + Math.sin(z * 0.5 + Math.sin(x * 0.45 + 1) * 1.6)) / 0.5);
      const tone = P.rippleTone(x, z) * (1 + 0.1 * net * net) * (1 - 0.08 * drift);
      const settle = 1 - 0.4 * settleAt(x, z);
      // seabed decor: silty darker patches (under the seagrass beds and a few out in the open) and paler swept ones, a soft blob each
      const sp = sandPatch(x, z);
      const patch = 1 - 0.2 * sp.dark + 0.07 * sp.pale;
      // round 3: the Deep's sand is its own: cooler and a touch darker with silt patches and pale cream swept round the boat's bow and the cave's mouth
      const dd = Math.hypot(x + 34, z + 33) / 15;
      const dw = dd < 1 ? (1 - dd * dd) ** 2 : 0;
      const silt = 0.5 + 0.5 * Math.sin(x * 0.37 + Math.sin(z * 0.23) * 2.1) * Math.sin(z * 0.31 - 0.8 + Math.cos(x * 0.2));
      const swept = Math.max(0, 1 - Math.hypot(x + 38.8, z + 37) / 3.2) + Math.max(0, 1 - Math.hypot(x + 28, z + 33.5) / 2.6);
      const dk = 1 - dw * (0.1 + 0.14 * silt * silt) + 0.1 * Math.min(1, swept);
      col[k * 3] = patch * (1 + 0.02 * sp.dark) * _c.r * tone * settle * (1 + 0.1 * drift) * dk * (1 - 0.1 * dw); col[k * 3 + 1] = patch * _c.g * tone * settle * dk * (1 + 0.02 * dw); col[k * 3 + 2] = patch * (1 + 0.02 * sp.dark) * _c.b * tone * settle * (1 - 0.1 * drift) * (1 + 0.04 * (1 - settle) * 5) * dk * (1 + 0.1 * dw);
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
      if (key === 'paint') shadePaint(geo); // beauty round 1: contact darkening and a per-face tone on everything lit and painted
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

// Beauty round 1: per-face tone jitter (a hash of the face's middle, so no two facets are quite the same) and a soft contact darkening
// over the first 0.45 m above the seabed (the geometry is already in world space when it is put). Vertex colour only: no new mesh, draw or texture.
const hash3 = (x, y, z) => { const n = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return n - Math.floor(n); };
export function shadePaint(g) {
  const pos = g.attributes.position;
  const col = g.attributes.color;
  if (!col || pos.count % 3) return g;
  for (let f = 0; f < pos.count; f += 3) {
    const cx = (pos.getX(f) + pos.getX(f + 1) + pos.getX(f + 2)) / 3;
    const cy = (pos.getY(f) + pos.getY(f + 1) + pos.getY(f + 2)) / 3;
    const cz = (pos.getZ(f) + pos.getZ(f + 1) + pos.getZ(f + 2)) / 3;
    const jit = 0.9 + 0.2 * hash3(Math.round(cx * 50), Math.round(cy * 50), Math.round(cz * 50));
    // round 3: faces looking up catch the surface light (a warmer, brighter top) and the colour drifts a little with where the piece stands (warm in some places, cool in others)
    const e1x = pos.getX(f + 1) - pos.getX(f); const e1y = pos.getY(f + 1) - pos.getY(f); const e1z = pos.getZ(f + 1) - pos.getZ(f);
    const e2x = pos.getX(f + 2) - pos.getX(f); const e2y = pos.getY(f + 2) - pos.getY(f); const e2z = pos.getZ(f + 2) - pos.getZ(f);
    const nx = e1y * e2z - e1z * e2y; const ny = e1z * e2x - e1x * e2z; const nz = e1x * e2y - e1y * e2x;
    const up = Math.max(0, ny / (Math.hypot(nx, ny, nz) || 1));
    const wz = Math.sin(cx * 0.21 + 0.7) * Math.cos(cz * 0.17 - 0.3); // -1 (cool) .. 1 (warm)
    // round 5: the sea's light nets lie across everything that faces up (the same net as the sand's), brightest on the tops
    const cn = Math.max(0, 1 - Math.abs(Math.sin(cx * 0.55 + Math.sin(cz * 0.4) * 1.6) + Math.sin(cz * 0.5 + Math.sin(cx * 0.45 + 1) * 1.6)) / 0.5);
    const tr = (1 + 0.07 * up + 0.1 * up * cn * cn) * (1 + 0.05 * wz); const tb = (1 - 0.04 * up + 0.04 * up * cn * cn) * (1 - 0.06 * wz);
    for (let v = f; v < f + 3; v++) {
      const h = pos.getY(v) - P.reefY(pos.getX(v), pos.getZ(v));
      const near = h < 0.45 ? 1 - Math.max(0, h) / 0.45 : 0; // 1 on the sand, 0 at 0.45 m
      const k = jit * (1 - 0.3 * near * near) * (1 + 0.05 * Math.min(1, Math.max(0, h) / 2));
      const low = Math.max(0, 1 - Math.max(0, h) / 1.1); // round 2: a cool, mossy teal foot on everything, warmer light on the tops
      col.setXYZ(v, col.getX(v) * k * (1 - 0.1 * low) * tr, col.getY(v) * k * (1 + 0.03 * low) * (1 + 0.03 * up), col.getZ(v) * k * (1 + 0.04 * low) * tb);
    }
  }
  return g;
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
    kit.put('paint', M.paint, paint(at(cyl(0.5, 0.65, A.h, 8), A.x + sx * px, A.z, A.h / 2, 0, -sx * 0.05), sx > 0 ? STONES[1] : STONES[3]));
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

// beauty round 5: no two clumps of one colour are quite the same colour (a seeded nudge of hue, saturation and lightness), and tips and rims run paler
const _t = new THREE.Color();
export function nudge(hex, a, b, c) { return _t.setHex(hex).offsetHSL(a, b, c).getHex(); }
export function coralGeometry(k, i) {
  const j = hash3(Math.round(k.x * 10), 1, Math.round(k.z * 10));
  const hue = nudge(COL.coral[k.hue], (j - 0.5) * 0.05, (j * 7 % 1 - 0.5) * 0.2, (j * 13 % 1 - 0.5) * 0.1);
  const deep = nudge(COL.coralDeep[k.hue], (j - 0.5) * 0.05, 0, (j * 5 % 1 - 0.5) * 0.08);
  const tip = nudge(COL.coral[k.hue], (j - 0.5) * 0.03, -0.1, 0.16);
  const parts = [];
  const s = k.s;
  const put = (geo, hex) => parts.push(paint(at(geo, k.x, k.z, 0, k.yaw), hex));
  if (k.kind === 'brain') {
    put(new THREE.SphereGeometry(s * 0.9, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.7, 1).translate(0, 0, 0), hue);
    put(new THREE.TorusGeometry(s * 0.55, s * 0.07, 4, 10).rotateX(Math.PI / 2).translate(0, s * 0.42, 0), deep);
    put(new THREE.TorusGeometry(s * 0.3, s * 0.06, 3, 6).rotateX(Math.PI / 2).translate(0, s * 0.6, 0), tip); // a pale inner ridge
  } else if (k.kind === 'branch') {
    for (let b = 0; b < 4; b++) {
      const a = b * 1.7 + i;
      const h = s * (1.2 + 0.4 * ((b + i) % 3));
      const lz = 0.35 * Math.sin(a); const lx = 0.35 * Math.cos(a); const ox = Math.cos(a) * s * 0.3; const oz = Math.sin(a) * s * 0.3;
      put(cyl(s * 0.04, s * 0.14, h, 5).translate(0, h / 2, 0).rotateZ(lz).rotateX(lx).translate(ox, 0, oz), b % 2 ? hue : deep);
      put(new THREE.TetrahedronGeometry(s * 0.1, 0).translate(0, h, 0).rotateZ(lz).rotateX(lx).translate(ox, 0, oz), tip); // a pale bud at each tip
    }
  } else if (k.kind === 'fan') {
    put(new THREE.CircleGeometry(s * 0.95, 9, 0, Math.PI).translate(0, 0, 0).rotateX(0), hue);
    put(new THREE.CircleGeometry(s * 0.95, 9, 0, Math.PI).rotateY(Math.PI), deep);
    put(new THREE.RingGeometry(s * 0.7, s * 0.95, 9, 1, 0, Math.PI).translate(0, 0, 0.01), tip); // a pale ruffled rim on the front
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
  P.scatterCoralAll().forEach((k, i) => { if (P.inReefClear(k.x, k.z, k.s)) return; for (const g of coralGeometry(k, i)) kit.put('paint', M.paint, g, { noCast: k.s < 0.7 }); }); // (the Sealab's footprint is cleared here, after the scatter, so every other clump keeps its index)
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
export function kelpMaterial(time = { value: 0 }) {
  const mat = litMaterial(0xffffff, { vertexColors: true, roughness: 0.8, side: THREE.DoubleSide });
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
  const all = P.scatterKelpAll();
  const list = all.filter((k) => !P.inReefClear(k.x, k.z, 0.3));
  const mesh = new THREE.InstancedMesh(bladeGeometry(), kelpMaterial(), list.length);
  mesh.name = 'reef:kelp';
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const eu = new THREE.Euler();
  const pos = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const tint = new THREE.Color();
  let n = 0;
  all.forEach((k, i) => {
    if (P.inReefClear(k.x, k.z, 0.3)) return; // the blades keep their own indices (the scale and tint read them)
    eu.set(k.lean, k.phase, k.lean * 0.5, 'YXZ');
    q.setFromEuler(eu);
    pos.set(k.x, P.reefY(k.x, k.z) - 0.05, k.z);
    sc.set(0.7 + 0.8 * ((i * 0.737) % 1), k.h, 1); // round 5: broad and slim blades
    m4.compose(pos, q, sc);
    mesh.setMatrixAt(n, m4);
    const u = (i * 0.618) % 1;
    const w = (i * 0.381 + 0.17) % 1; // a yellow-green blade, a blue-green one, brighter or darker
    tint.setRGB(0.75 + 0.5 * w, 0.78 + 0.35 * u, 1.1 - 0.7 * w + 0.1 * u);
    mesh.setColorAt(n++, tint);
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
  // round 2: pebbles and shells strewn over the whole seabed (eight triangles each), thicker round the coral, the boat and the anchor, so the sand is never bare
  const near = [...P.scatterCoralAll().map((k) => [k.x, k.z, k.s + 1.2]), [-32.8, -31.5, 5], [-23.5, -29.5, 3]];
  const tones = [0xb6c7c2, 0xd9c9a8, 0xa89a82, 0xe8d6c0, 0x8fa3a0];
  let made = 0;
  for (let tries = 0; made < 70 && tries < 900; tries++) {
    const pick = rng();
    let x; let z;
    if (pick < 0.65) { const c = near[Math.floor(rng() * near.length)]; const a = rng() * Math.PI * 2; const r = c[2] * (0.5 + rng() * 0.8); x = c[0] + Math.cos(a) * r; z = c[1] + Math.sin(a) * r; }
    else { x = P.REEF_BOUNDS.minX + 3 + rng() * (P.REEF_BOUNDS.maxX - P.REEF_BOUNDS.minX - 6); z = P.REEF_BOUNDS.minZ + 3 + rng() * (P.REEF_BOUNDS.maxZ - P.REEF_BOUNDS.minZ - 6); }
    if (!P.REEF_POIS.length || Math.hypot(x - P.REEF_SPAWN.x, z - P.REEF_SPAWN.z) < 7) continue;
    if (P.reefColliders().some((c) => Math.hypot(x - c.x, z - c.z) < c.r + 0.3)) continue; // not inside the big coral or the arch's feet
    if (Math.hypot(x + 32.8, z + 31.5) < 3.4) continue; // not inside the boat
    const sz = 0.07 + rng() * 0.11;
    const stone = paint(at(new THREE.OctahedronGeometry(sz, 0).scale(1, 0.5, 1 + rng() * 0.5), x, z, sz * 0.2, rng() * 3), tones[Math.floor(rng() * tones.length)]);
    if (!P.inReefClear(x, z, sz)) kit.put('paint', M.paint, stone, { noCast: true }); // (inside the Sealab's footprint the stone is not kept; the stream runs on)
    made++;
  }
}

// Beauty round 6: the seabed's small life, all in the one 'paint' bucket (no new draw): tufts of seagrass (three leaning blades, green to yellow-green),
// starfish (five flat arms, a paler middle) and sea urchins (a dark purple body with pale spines), strewn from their own seeded stream, thickest round the coral.
export function drawSeabedLife(kit, M) {
  const rng = mulberry32(0x73656167);
  const near = P.scatterCoralAll().map((k) => [k.x, k.z, k.s + 1.5]);
  const cols = P.reefColliders();
  const okSpot = (x, z) => Math.hypot(x - P.REEF_SPAWN.x, z - P.REEF_SPAWN.z) > 6 && Math.hypot(x + 32.8, z + 31.5) > 3.6 && !cols.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + 0.3)
    && x > P.REEF_BOUNDS.minX + 2 && x < P.REEF_BOUNDS.maxX - 2 && z > P.REEF_BOUNDS.minZ + 2 && z < P.REEF_BOUNDS.maxZ - 2;
  const spot = () => {
    if (rng() < 0.6) { const c = near[Math.floor(rng() * near.length)]; const a = rng() * Math.PI * 2; const r = c[2] * (0.6 + rng() * 0.9); return [c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r]; }
    return [P.REEF_BOUNDS.minX + rng() * (P.REEF_BOUNDS.maxX - P.REEF_BOUNDS.minX), P.REEF_BOUNDS.minZ + rng() * (P.REEF_BOUNDS.maxZ - P.REEF_BOUNDS.minZ)];
  };
  const grass = [0x3f9a55, 0x5fae4f, 0x7cba5a, 0x4a9a6a];
  for (let n = 0, t = 0; n < 90 && t < 900; t++) {
    const [x, z] = spot();
    if (!okSpot(x, z)) continue;
    const gc = grass[Math.floor(rng() * grass.length)];
    for (let b = 0; b < 3; b++) {
      const h = 0.35 + rng() * 0.4;
      const a = rng() * Math.PI * 2;
      const blade = paint(at(new THREE.ConeGeometry(0.035, h, 3, 1, true).translate(0, h / 2, 0).rotateZ(0.25 + rng() * 0.3).rotateY(a), x, z, -0.02), nudge(gc, 0, 0, (b - 1) * 0.05));
      if (!P.inReefClear(x, z, 0.3)) kit.put('paint', M.paint, blade, { noCast: true });
    }
    n++;
  }
  const stars = [0xe8703c, 0xe8a04b, 0xd8503c, 0xe8c34a];
  for (let n = 0, t = 0; n < 12 && t < 400; t++) {
    const [x, z] = spot();
    if (!okSpot(x, z)) continue;
    const sc = stars[Math.floor(rng() * stars.length)];
    const yaw = rng() * 3;
    for (let a = 0; a < 5; a++) {
      const arm = new THREE.ConeGeometry(0.05, 0.3, 3, 1, true).translate(0, 0.15, 0).rotateX(Math.PI / 2).scale(1, 0.35, 1).rotateY((a * Math.PI * 2) / 5);
      const armG = paint(at(arm, x, z, 0.03, yaw), sc);
      if (!P.inReefClear(x, z, 0.3)) kit.put('paint', M.paint, armG, { noCast: true });
    }
    const mid = paint(at(new THREE.OctahedronGeometry(0.07, 0).scale(1, 0.5, 1), x, z, 0.05), nudge(sc, 0, -0.1, 0.15));
    if (!P.inReefClear(x, z, 0.3)) kit.put('paint', M.paint, mid, { noCast: true });
    n++;
  }
  for (let n = 0, t = 0; n < 9 && t < 400; t++) {
    const [x, z] = spot();
    if (!okSpot(x, z)) continue;
    const clear = P.inReefClear(x, z, 0.3);
    const body = paint(at(new THREE.IcosahedronGeometry(0.11, 0).scale(1, 0.8, 1), x, z, 0.09), 0x5a3a78);
    if (!clear) kit.put('paint', M.paint, body, { noCast: true });
    for (let a = 0; a < 5; a++) {
      const th = (a * Math.PI * 2) / 5 + rng();
      const spine = paint(at(new THREE.ConeGeometry(0.02, 0.16, 3, 1, true).translate(0, 0.08, 0).rotateZ(1.0 + rng() * 0.5).rotateY(th), x, z, 0.1), 0xc9b4d8);
      if (!clear) kit.put('paint', M.paint, spine, { noCast: true });
    }
    n++;
  }
}
