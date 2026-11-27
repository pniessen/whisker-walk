// =============================================================================
// THE NEIGHBORHOOD STREET: BEAUTY ROUND (2026-11-27), the street and the gardens, not the houses. Kerb stones along the
// roadside of all four pavements with a gutter strip beside them, a fringe of grass blades and a few daisies along the
// pavement outer edges, soil beds with edging stones under the flower patches, worn earth and fallen leaves at the street
// trees, fuller flower patches, a post foot, cap, flag and lip on each mailbox, and a cast base, cap and finial on each lamp post.
//
// None of it is a mesh of its own. The flat pieces are appended to the geometry of a mesh the area already has (the lawn or a
// pavement: their vertex colours and grass and cobble maps carry on), and the upright pieces are baked into meshes of the prop
// they dress, so the built and the merged mesh counts do not go up (the flower patches go from twelve meshes to five). It is
// paid for by cheaper shapes (the flower blooms were 80 triangles each, the lamp globes 288). Every flat piece stays under 0.1 m
// so no ground mesh stands tall enough to become a caster or a decal, and the pavements keep their own width. Nothing goes
// near a house box. Each layer has its own seeded stream (mulberry32); no clock, no Math.random, no text.
// =============================================================================

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../rng.js';
import { withLocalUuids } from './localuuids.js';

const TAU = Math.PI * 2;
const ROAD_HALF = 2.5; // the gravel roads are 5 m wide
const PAVE_EDGE = 2.6; // the roadside edge of a pavement (3.2 less half of 1.2)
const PAVE_X = 3.2; // the pavement centre lines
const KERB_W = 0.13;
const STONE_LEN = 1.5;
const JOINT = 0.012; // the gap between two kerb stones
const KERB_TONES = Object.freeze([0.84, 0.77, 0.9, 0.8]);
const FRINGE_ROOT = 0x4f8a3a;
const FRINGE_TIPS = Object.freeze([0x8fc070, 0x7cb35e, 0x9ccb74, 0x86b868]);
const SOIL = 0x6a4a30;
const EDGING = Object.freeze([0xa29c90, 0x8f897c, 0xb2ab9c]);
const LEAF_TONES = Object.freeze([0xb89a4a, 0x9a8a3a, 0xc8a456, 0x8a6a34]);

// ---- a small accumulator of indexed triangles with position, normal, uv and colour ----
function acc() {
  const pos = []; const nor = []; const uv = []; const col = []; const idx = [];
  const v = (p, n, u, c) => { pos.push(p[0], p[1], p[2]); nor.push(n[0], n[1], n[2]); uv.push(u[0], u[1]); col.push(c.r, c.g, c.b); return pos.length / 3 - 1; };
  const faceNormal = (a, b, c) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], wx = c[0] - a[0], wy = c[1] - a[1], wz = c[2] - a[2];
    const x = uy * wz - uz * wy, y = uz * wx - ux * wz, z = ux * wy - uy * wx; const l = Math.hypot(x, y, z) || 1;
    return [x / l, y / l, z / l];
  };
  return {
    // One triangle. `face` is the way it should face: the winding is turned to match it, and the lighting normal is
    // `n` (default the face itself). `cs` three colours, `uvs` three [u, v].
    tri(a, b, c, cs, face, uvs = [[0, 0], [1, 0], [0, 1]], n = null) {
      const f = faceNormal(a, b, c);
      if (face && f[0] * face[0] + f[1] * face[1] + f[2] * face[2] < 0) {
        const nn = n ?? [-f[0], -f[1], -f[2]];
        idx.push(v(a, nn, uvs[0], cs[0]), v(c, nn, uvs[2], cs[2]), v(b, nn, uvs[1], cs[1]));
      } else {
        const nn = n ?? f;
        idx.push(v(a, nn, uvs[0], cs[0]), v(b, nn, uvs[1], cs[1]), v(c, nn, uvs[2], cs[2]));
      }
    },
    get count() { return idx.length / 3; },
    geometry(withColor = true) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      if (withColor) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.setIndex(idx);
      return g;
    },
  };
}

const UP = [0, 1, 0];
const WHITE = new THREE.Color(1, 1, 1);
const rgb = (hex, k = 1) => new THREE.Color().setHex(hex).multiplyScalar(k);
const grey = (k) => new THREE.Color(k, k, k);
const UV0 = [[0, 0], [0, 0], [0, 0]];

// Append `extra` (world space, indexed, position/normal/uv/color) to a mesh own geometry in place, so the geometry
// object, its `parameters` and everything reading them (grass footprints, paw prints) are the ones they were.
function appendWorld(mesh, extra) {
  mesh.updateMatrix();
  extra.applyMatrix4(mesh.matrix.clone().invert());
  const g = mesh.geometry;
  const base = g.attributes.position.count;
  const join = (name, size) => {
    const a = g.attributes[name]; const b = extra.attributes[name];
    const out = new Float32Array(a.array.length + b.array.length);
    out.set(a.array); out.set(b.array, a.array.length);
    g.setAttribute(name, new THREE.BufferAttribute(out, size));
  };
  join('position', 3); join('normal', 3); join('uv', 2); join('color', 3);
  const oi = g.index.array; const ei = extra.index.array;
  const ni = new Uint32Array(oi.length + ei.length);
  ni.set(oi); for (let i = 0; i < ei.length; i++) ni[oi.length + i] = ei[i] + base;
  g.setIndex(new THREE.BufferAttribute(ni, 1));
  g.computeBoundingBox(); g.computeBoundingSphere();
}

// ---- the plan: pure, so a test can read it without a scene ----
const CROSS = 3.9; // the pavement outer edge of the other street: kerbs and fringes stop here
// Which spans of a pavement edge carry kerb and fringe: the length of the street, minus the crossroads.
export function edgeRuns() {
  const runs = [];
  for (const axis of ['z', 'x']) for (const s of [-1, 1]) {
    for (const [a, b] of [[-50, -CROSS], [CROSS, 50]]) runs.push({ axis, s, a, b }); // axis: the direction of the street
  }
  return runs;
}
// world point on a street: `across` from its centre line, `along` it, height y
const worldAt = (axis) => (axis === 'z' ? (c, l, y) => [c, y, l] : (c, l, y) => [l, y, c]);

// Kerb stones along the roadside edge of each pavement (into the pavement meshes, keyed `${axis}${s}`, inside their own
// width), and the gutter strip between road and stones (into the lawn).
function drawKerbs(accs, lawnAcc, plinth) {
  const rng = mulberry32(0x6b657262); // 'kerb'
  let n = 0;
  for (const r of edgeRuns()) {
    const a = accs(r.axis, r.s);
    const at = worldAt(r.axis);
    { // the plinth: the gutter between the road and the stones (it shuts the gap, and shows in the joints)
      const dk = plinth; const p0 = at(r.s * ROAD_HALF, r.a, 0.011), p1 = at(r.s * (PAVE_EDGE + KERB_W), r.a, 0.011), p2 = at(r.s * (PAVE_EDGE + KERB_W), r.b, 0.011), p3 = at(r.s * ROAD_HALF, r.b, 0.011);
      lawnAcc.tri(p0, p1, p2, [dk, dk, dk], UP, UV0); lawnAcc.tri(p0, p2, p3, [dk, dk, dk], UP, UV0);
    }
    for (let t = r.a; t + STONE_LEN <= r.b + 1e-6; t += STONE_LEN) {
      const t0 = t + JOINT / 2, t1 = t + STONE_LEN - JOINT / 2;
      const h = 0.062 + rng() * 0.012;
      const tone = KERB_TONES[Math.floor(rng() * KERB_TONES.length)];
      const top = grey(tone), face = grey(tone * 0.8);
      const x0 = r.s * PAVE_EDGE, x1 = r.s * (PAVE_EDGE + KERB_W);
      const u0 = (n % 7) * 0.12, v0 = t0 / 1.5, v1 = t1 / 1.5;
      const A = at(x0, t0, h), B = at(x1, t0, h), C = at(x1, t1, h), D = at(x0, t1, h);
      a.tri(A, B, C, [top, top, top], UP, [[u0, v0], [u0 + 0.1, v0], [u0 + 0.1, v1]]);
      a.tri(A, C, D, [top, top, top], UP, [[u0, v0], [u0 + 0.1, v1], [u0, v1]]);
      const E = at(x0, t0, 0.012), F = at(x0, t1, 0.012);
      const out = r.axis === 'z' ? [-r.s, 0, 0] : [0, 0, -r.s];
      a.tri(E, A, D, [face, face, face], out, [[u0, 0], [u0, 0.05], [u0 + 0.1, 0.05]]);
      a.tri(E, D, F, [face, face, face], out, [[u0, 0], [u0 + 0.1, 0.05], [u0 + 0.1, 0]]);
      n++;
    }
  }
  return n;
}

// Grass blades and a few daisies along the pavement outer edges (into the lawn). `k` turns a wanted colour into the
// vertex colour that makes it under the lawn own material colour and tile.
function drawFringe(a, k) {
  const rng = mulberry32(0x66726e67); // 'frng'
  const cars = [[4, -35], [-4, 20]];
  let tufts = 0;
  for (const r of edgeRuns()) {
    const at = worldAt(r.axis);
    const outer = r.s * (PAVE_X + 0.6);
    // the edge of the other street also carries a fringe on its far side only; the kerb side has the pavement
    for (let t = r.a + 0.4; t < r.b;) {
      t += 1.1 + rng() * 1.5;
      const c = outer + r.s * (0.05 + rng() * 0.3);
      const [x, , z] = at(c, t, 0);
      if (cars.some(([cx, cz]) => Math.hypot(x - cx, z - cz) < 2.6)) continue;
      const tip = k(FRINGE_TIPS[Math.floor(rng() * FRINGE_TIPS.length)]);
      const root = k(FRINGE_ROOT);
      let top = 0;
      for (let i = 0; i < 3; i++) {
        const yaw = rng() * TAU, w = 0.028 + rng() * 0.012, h = 0.055 + rng() * 0.035, lean = 0.03 + rng() * 0.03;
        const bx = x + (rng() - 0.5) * 0.12, bz = z + (rng() - 0.5) * 0.12;
        const sx = Math.cos(yaw) * w / 2, sz = Math.sin(yaw) * w / 2;
        const lx = -Math.sin(yaw) * lean, lz = Math.cos(yaw) * lean;
        a.tri([bx - sx, 0.012, bz - sz], [bx + sx, 0.012, bz + sz], [bx + lx, 0.012 + h, bz + lz], [root, root, tip], UP, UV0, UP);
        top = Math.max(top, h);
      }
      tufts++;
      if (rng() < 0.18) { // a daisy on a short stalk: five petals round a yellow heart
        const fx = x + (rng() - 0.5) * 0.1, fz = z + (rng() - 0.5) * 0.1, fy = 0.082;
        const petal = k(rng() < 0.7 ? 0xf4f0e4 : 0xf2b8d0), heart = k(0xe8c040);
        for (let i = 0; i < 5; i++) {
          const a0 = (i / 5) * TAU, a1 = ((i + 1) / 5) * TAU;
          a.tri([fx, fy, fz], [fx + Math.cos(a0) * 0.024, fy - 0.004, fz + Math.sin(a0) * 0.024], [fx + Math.cos(a1) * 0.024, fy - 0.004, fz + Math.sin(a1) * 0.024], [heart, petal, petal], UP, UV0, UP);
        }
      }
    }
  }
  return tufts;
}

// A soil bed with edging stones under each flower patch (into the lawn).
function drawBeds(a, k, spots) {
  const rng = mulberry32(0x62656473); // 'beds'
  for (const { x, z } of spots) {
    const r = 0.82 + rng() * 0.12;
    const n = 10;
    const soil = k(SOIL), soilHi = k(0x7e5c3c);
    const ring = [];
    for (let i = 0; i < n; i++) { const ang = (i / n) * TAU; const rr = r * (0.92 + rng() * 0.16); ring.push([x + Math.cos(ang) * rr, z + Math.sin(ang) * rr]); }
    for (let i = 0; i < n; i++) {
      const p = ring[i], q = ring[(i + 1) % n];
      a.tri([x, 0.014, z], [p[0], 0.014, p[1]], [q[0], 0.014, q[1]], [soilHi, soil, soil], UP, UV0, UP);
    }
    for (let i = 0; i < 6; i++) { // edging stones: low four-sided pyramids
      const ang = (i / 6) * TAU + rng() * 0.4; const d = r + 0.04;
      const sx = x + Math.cos(ang) * d, sz = z + Math.sin(ang) * d;
      const w = 0.055 + rng() * 0.03, hh = 0.04 + rng() * 0.02;
      const tone = k(EDGING[Math.floor(rng() * EDGING.length)]);
      const dark = tone.clone().multiplyScalar(0.8);
      const yaw = rng() * TAU;
      const cs = [[1, 1], [-1, 1], [-1, -1], [1, -1]].map(([ux, uz]) => {
        const cx = Math.cos(yaw), sn = Math.sin(yaw);
        return [sx + (ux * cx - uz * sn) * w, 0.014, sz + (ux * sn + uz * cx) * w];
      });
      const apex = [sx, 0.014 + hh, sz];
      for (let j = 0; j < 4; j++) a.tri(cs[j], cs[(j + 1) % 4], apex, [dark, dark, tone], [cs[j][0] + cs[(j + 1) % 4][0] - 2 * sx, 0.5, cs[j][2] + cs[(j + 1) % 4][2] - 2 * sz], UV0);
    }
  }
}

// Worn earth and fallen leaves at the street trees (into the lawn).
function drawTreeFeet(a, k, trees) {
  const rng = mulberry32(0x74726565); // 'tree'
  for (const [x, z] of trees) {
    const earth = k(0x7a6a3c), earthDark = k(0x6a5a34);
    const n = 8; const r = 0.62 + rng() * 0.12;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * TAU, a1 = ((i + 1) / n) * TAU;
      a.tri([x, 0.013, z], [x + Math.cos(a0) * r, 0.013, z + Math.sin(a0) * r * (0.9 + rng() * 0.2)], [x + Math.cos(a1) * r, 0.013, z + Math.sin(a1) * r], [earth, earthDark, earthDark], UP, UV0, UP);
    }
    for (let i = 0; i < 14; i++) {
      const ang = rng() * TAU, d = 0.5 + Math.sqrt(rng()) * 1.5;
      const lx = x + Math.cos(ang) * d, lz = z + Math.sin(ang) * d, y = 0.017 + (i % 3) * 0.001;
      const yaw = rng() * TAU, s = 0.07 + rng() * 0.05;
      const c = k(LEAF_TONES[Math.floor(rng() * LEAF_TONES.length)], 0.9 + rng() * 0.2);
      const p = (aa, rr) => [lx + Math.cos(yaw + aa) * rr, y, lz + Math.sin(yaw + aa) * rr];
      a.tri(p(0, s), p(2.4, s * 0.7), p(-2.4, s * 0.7), [c, c, c], UP, UV0, UP);
    }
  }
}

// ---- the upright props ----
// Everything added to a prop is BAKED into a mesh the prop already has (its geometry is merged with the new pieces, in the
// prop own space), so neither the built nor the merged mesh count moves.
const bakeMatrix = new THREE.Matrix4();
const bakeQuat = new THREE.Quaternion();
const bakeEuler = new THREE.Euler();
// The own geometry of the mesh (at its own position, rotation and scale) plus `more`: [{ geo, pos, rot, scale }] in the group space.
function bake(mesh, more, own = true) {
  const list = [];
  const put = (geo, pos, rot, scale) => {
    let g = geo.clone();
    if (g.index) g = g.toNonIndexed(); // one layout for every piece, so they merge
    bakeMatrix.compose(new THREE.Vector3(...pos), bakeQuat.setFromEuler(bakeEuler.set(...rot)), new THREE.Vector3(...scale));
    g.applyMatrix4(bakeMatrix);
    for (const name of Object.keys(g.attributes)) if (!(name in mesh.geometry.attributes)) g.deleteAttribute(name);
    list.push(g);
  };
  if (own) put(mesh.geometry, mesh.position.toArray(), [mesh.rotation.x, mesh.rotation.y, mesh.rotation.z], mesh.scale.toArray());
  for (const m of more) put(m.geo, m.pos, m.rot ?? [0, 0, 0], m.scale ?? [1, 1, 1]);
  return mergeGeometries(list, false);
}
function settle(mesh, geo) {
  mesh.geometry.dispose();
  mesh.geometry = geo;
  mesh.position.set(0, 0, 0); mesh.rotation.set(0, 0, 0); mesh.scale.set(1, 1, 1);
  mesh.updateMatrix();
}

// Flower patches: the blooms were 80-triangle spheres; they are 20-triangle gems now, there is a second bloom and stalk beside
// each of the four that stand wide apart, the stalks differ in height, and a ring of leaf blades sits at the foot. The twelve meshes of a
// patch (six blooms, six stems) become five: one per colour, and the stems with the leaves.
let bloomGeo = null;
function dressFlowers(g, rng) {
  if (g.children.length !== 12) return;
  const kids = g.children.slice();
  const colourMeshes = [kids[0], kids[2], kids[4], kids[6]];
  const stemMesh = kids[1];
  bloomGeo ??= new THREE.IcosahedronGeometry(0.075, 0);
  const bloomsOf = colourMeshes.map(() => []);
  for (let i = 0; i < 6; i++) { // the six that were there, in their places
    const m = kids[i * 2];
    bloomsOf[i % 4].push({ geo: bloomGeo, pos: m.position.toArray(), rot: [i, i * 2, 0], scale: [1, 1, 1] });
  }
  const stems = [];
  for (let i = 0; i < 6; i++) { const m = kids[i * 2 + 1]; stems.push({ geo: m.geometry, pos: m.position.toArray() }); }
  // a second bloom beside the four that stand wide apart, in their colour and close by (within 0.12 m), so each colour mesh keeps
  // the reach it had and the patch stays in the shadow class it was in
  for (let i = 0; i < 6; i++) {
    const anchor = [0, 1, 4, 5, 4, 5][i]; // the two colours with one bloom each are left alone: a pair would make them wider
    const at = kids[anchor * 2].position;
    const ang = rng() * TAU, d = 0.07 + rng() * 0.05;
    const sy = 0.7 + rng() * 0.5;
    const x = at.x + Math.cos(ang) * d, z = at.z + Math.sin(ang) * d;
    stems.push({ geo: stemMesh.geometry, pos: [x, 0.12 * sy, z], scale: [1, sy, 1] });
    const bs = 0.85 + rng() * 0.3;
    bloomsOf[anchor % 4].push({ geo: bloomGeo, pos: [x, 0.25 * sy, z], rot: [rng() * 3, rng() * 3, 0], scale: [bs, bs, bs] });
  }
  // leaf blades at the foot, each an arched kite seen from both sides (two windings, one material key with the stems)
  const la = acc();
  for (let i = 0; i < 9; i++) {
    const ang = (i / 9) * TAU + rng() * 0.5, d0 = 0.05 + rng() * 0.15, len = 0.12 + rng() * 0.08;
    const ca = Math.cos(ang), sa = Math.sin(ang), px = -sa, pz = ca;
    const b0 = [ca * d0, 0.01, sa * d0];
    const m1 = [ca * (d0 + len * 0.45) + px * 0.022, 0.07 + rng() * 0.03, sa * (d0 + len * 0.45) + pz * 0.022];
    const m2 = [ca * (d0 + len * 0.45) - px * 0.022, m1[1], sa * (d0 + len * 0.45) - pz * 0.022];
    const tip = [ca * (d0 + len), 0.05 + rng() * 0.03, sa * (d0 + len)];
    la.tri(b0, m1, tip, [WHITE, WHITE, WHITE], UP, UV0);
    la.tri(b0, tip, m2, [WHITE, WHITE, WHITE], UP, UV0);
    la.tri(b0, tip, m1, [WHITE, WHITE, WHITE], [0, -1, 0], UV0, UP);
    la.tri(b0, m2, tip, [WHITE, WHITE, WHITE], [0, -1, 0], UV0, UP);
  }
  stems.push({ geo: la.geometry(false), pos: [0, 0, 0] });
  const stemGeo = bake(stemMesh, stems, false);
  colourMeshes.forEach((m, i) => settle(m, bake(m, bloomsOf[i], false)));
  settle(stemMesh, stemGeo);
  for (const i of [3, 5, 7, 8, 9, 10, 11]) { kids[i].geometry.dispose?.(); g.remove(kids[i]); }
}

// Mailbox: a footing block at the post foot, a cap, a flag arm and flag on the side of the box (its own blue), a lip along its front.
function dressMailbox(g) {
  if (g.children.length !== 2) return;
  const [post, box] = g.children;
  const b = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const postGeo = bake(post, [{ geo: b(0.17, 0.1, 0.17), pos: [0, 0.05, 0] }, { geo: b(0.13, 0.05, 0.13), pos: [0, 0.97, 0] }]);
  const boxGeo = bake(box, [
    { geo: b(0.022, 0.13, 0.07), pos: [0.162, 1.2, 0.1] }, { geo: b(0.022, 0.03, 0.1), pos: [0.162, 1.14, 0.1] },
    { geo: b(0.32, 0.03, 0.025), pos: [0, 1.0, 0.245] },
  ]);
  settle(post, postGeo); settle(box, boxGeo);
}

// Lamp post: a cast base that flares to the ground, a cap under the globe, a finial over it; the globe takes fewer
// segments (it was 288 triangles) and stays its own mesh with its own glow.
function dressLamp(g) {
  if (g.children.length !== 2) return;
  const [pole, globe] = g.children;
  const lathe = (pts, segs) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), segs);
  const geo = bake(pole, [
    { geo: lathe([[0.17, 0], [0.17, 0.05], [0.115, 0.14], [0.092, 0.3], [0.115, 0.32], [0.115, 0.37], [0.07, 0.38]], 8), pos: [0, 0, 0] },
    { geo: lathe([[0.07, 0], [0.13, 0.03], [0.14, 0.07], [0.09, 0.1]], 8), pos: [0, 3.02, 0] },
    { geo: new THREE.ConeGeometry(0.07, 0.17, 6, 1, true), pos: [0, 3.6, 0] },
  ]);
  settle(pole, geo);
  globe.geometry.dispose();
  globe.geometry = new THREE.SphereGeometry(0.22, 14, 8);
}

// What to dress: the refs neighborhood.js built. `lawn` is the ground mesh, `pavements` keyed by axis ('z', 'x') and side.
export function dressStreet({ lawn, pavements, flowers, mailboxes, lamps, trees }) {
  return withLocalUuids('neighborhood-street-uuids', () => {
    const kerbAcc = new Map();
    const getKerb = (axis, s) => { const key = axis + s; if (!kerbAcc.has(key)) kerbAcc.set(key, acc()); return kerbAcc.get(key); };
    const lc = lawn.material.color;
    const k = (hex, s = 1) => { const c = new THREE.Color().setHex(hex); return new THREE.Color(c.r * s / (lc.r * 0.955), c.g * s / (lc.g * 0.955), c.b * s / (lc.b * 0.955)); };
    const la = acc();
    drawKerbs(getKerb, la, k(0x95917f));
    for (const [key, a] of kerbAcc) appendWorld(pavements[key], a.geometry());
    drawFringe(la, k);
    drawBeds(la, k, flowers.map((f) => f.position));
    drawTreeFeet(la, k, trees);
    appendWorld(lawn, la.geometry());

    const rng = mulberry32(0x666c6f77); // 'flow'
    for (const f of flowers) dressFlowers(f, rng);
    for (const m of mailboxes) dressMailbox(m);
    for (const l of lamps) dressLamp(l);
  });
}
