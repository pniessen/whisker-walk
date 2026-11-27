// =============================================================================
// JUNGLE WING B: THE DRAWING (milestone J5). The banana plant on the river's far bank, the big tree with the low branch (and the branch), the canopy walk (two trunks, a plank walkway
// with rope rails, a lookout at its end and a vine swing under it), the sleepy sloth's tree with its limb, the hidden orchid on its stump, and the hanging lanterns along the veranda's
// eave. Merged into the place's own buckets (paint, glow) at build, so it adds no mesh: only triangles (test/budget.test.js, the row measured with this stage in). Also the two fruit
// models (the banana bunch, the cacao pod) and the sloth, which the walk's life places (junglelife.js, junglewinglive.js). The lit parts (the lantern glows, the candles, the strings of
// lights, the fireflies, the rain) are the walk's life, not this. Stage chunk code (junglestageb.js).
// =============================================================================

import * as THREE from 'three';
import * as P from './jungleplan.js';
import * as W from './junglewingplan.js';
import { COL, paint } from './jungleparts.js';

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, seg = 6) => new THREE.CylinderGeometry(rt, rb, h, seg, 1);
const ball = (r, ws = 7, hs = 5) => new THREE.SphereGeometry(r, ws, hs);
const at = (geo, x, y, z) => geo.translate(x, y, z);
const gy = (x, z) => P.jungleY(x, z);
const _v = new THREE.Vector3();
// A square beam from (x0,y0,z0) to (x1,y1,z1), `t` thick (all absolute).
function beam(x0, y0, z0, x1, y1, z1, t) {
  const len = Math.hypot(x1 - x0, y1 - y0, z1 - z0);
  const g = new THREE.BoxGeometry(t, t, len);
  g.lookAt(_v.set(x1 - x0, y1 - y0, z1 - z0));
  return g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
}
const ORCHID = Object.freeze({ petal: 0xf6dff0, pink: 0xe88ac0, stem: 0x5a8a3c, stump: 0x6e5a3e });
const GLASS = 0x8a7a58; // a hung lantern's glass when it is not lit

export function drawWing(kit, M) {
  const put = (geo, hex, jit = 0, noCast = false) => kit.put('paint', M.paint, paint(geo, hex, jit), { noCast });
  const glow = (geo, hex) => kit.put('glow', M.glow, paint(geo, hex), { noCast: true });
  const crown = (x, z, base, s, i) => [[0, 0.7, 0, 2.1], [-1.2, 0, 0.6, 1.7], [1.2, 0.2, -0.5, 1.8]].forEach(([dx, dy, dz, r], j) => put(at(new THREE.IcosahedronGeometry(r * s, 0).scale(1, 0.75, 1), x + dx * s, base + dy * s, z + dz * s), j === 0 ? COL.leafLight : j === 1 ? COL.leaf : COL.leafDeep, i + j));

  // the banana plant: a pale stem, six broad drooping leaves, a purple flower bud and a green bunch hanging under it (the ripe one to carry lies at its foot)
  const B = W.BANANA_PLANT;
  const by = gy(B.x, B.z);
  put(at(cyl(0.2, 0.3, B.h, 7), B.x, by + B.h / 2, B.z), 0x9ab35e);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    put(at(new THREE.ConeGeometry(0.42, 2.6, 4).scale(1, 1, 0.28).translate(0, 1.3, 0).rotateZ(-1.05).rotateY(a), B.x, by + B.h, B.z), i % 2 ? COL.leaf : COL.leafLight, i, true);
  }
  put(at(ball(0.16, 6, 4).scale(1, 1.6, 1), B.x + 0.3, by + B.h - 0.9, B.z), 0x7a2f6a, 0, true);
  for (let i = 0; i < 4; i++) put(at(cyl(0.05, 0.07, 0.4, 5).rotateZ(0.2 * (i - 1.5)), B.x + 0.3 + 0.08 * (i - 1.5), by + B.h - 1.35, B.z + 0.05 * (i % 2)), 0xb8c850, i, true);

  // the big tree with the low branch: a trunk, a crown, and a limb 1.0 m over the hill's ground at its outer end (one hop), mossy on top; two vines hang from its crown
  const T = W.BRANCH_TREE;
  const ty = gy(T.x, T.z);
  put(at(cyl(0.42, 0.6, T.h, 7), T.x, ty + T.h / 2, T.z), COL.trunk);
  crown(T.x, T.z, ty + T.h + 0.4, 1.15, 3);
  const bY = W.branchY();
  put(beam(T.x - 0.3, bY - 0.2, T.z - 0.3, W.BRANCH.x - 0.9, bY - 0.2, W.BRANCH.z - 0.9, 0.4), COL.trunk, 1);
  put(at(ball(0.4, 6, 4).scale(1.8, 0.4, 1), W.BRANCH.x + 1.4, bY + 0.03, W.BRANCH.z + 1.4), COL.moss, 0, true);
  for (const [dx, dz] of [[-0.6, 0.5], [0.7, -0.4]]) put(at(cyl(0.025, 0.02, 3.2, 4), T.x + dx, ty + T.h - 1.6, T.z + dz), COL.leafDeep, 0, true);

  // the canopy walk: two tall trunks with a platform each, a plank walkway between them with a rope rail either side, a little roof on the lookout, a vine swing under the middle
  const { a, b } = W.WALK;
  const ya = gy(a.x, a.z) + W.WALK_HEIGHT;
  const yb = gy(b.x, b.z) + W.WALK_HEIGHT;
  const yAt = (u) => ya + (yb - ya) * u;
  [[a, ya], [b, yb]].forEach(([e, ye], i) => {
    put(at(cyl(0.4, 0.55, ye - gy(e.x, e.z) + 1.0, 7), e.x, gy(e.x, e.z) + (ye - gy(e.x, e.z) + 1.0) / 2, e.z), COL.trunk, i);
    put(at(box(2.4, 0.16, 2.4), e.x, ye - 0.08, e.z), COL.wood, i, true);
    crown(e.x, e.z, ye + 1.6, 0.9, 7 + i);
  });
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  const nx = (b.x - a.x) / len; const nz = (b.z - a.z) / len; // along the walk
  const px = -nz; const pz = nx; // across it
  const planks = Math.round(len / 0.75);
  for (let i = 0; i <= planks; i++) {
    const u = i / planks;
    put(at(box(1.3, 0.07, 0.5).rotateY(Math.atan2(nx, nz)), a.x + (b.x - a.x) * u, yAt(u) - 0.08 + 0.06 * Math.sin(u * Math.PI) * -1, a.z + (b.z - a.z) * u), COL.wood, i, true);
  }
  for (const s of [-1, 1]) {
    put(beam(a.x + px * s * 0.62, ya + 0.95, a.z + pz * s * 0.62, b.x + px * s * 0.62, yb + 0.95, b.z + pz * s * 0.62, 0.04), COL.rope, 0, true);
    put(beam(a.x + px * s * 0.62, ya + 0.35, a.z + pz * s * 0.62, b.x + px * s * 0.62, yb + 0.35, b.z + pz * s * 0.62, 0.03), COL.rope, 0, true);
    for (let i = 0; i <= 5; i++) { const u = i / 5; put(beam(a.x + (b.x - a.x) * u + px * s * 0.62, yAt(u) - 0.1, a.z + (b.z - a.z) * u + pz * s * 0.62, a.x + (b.x - a.x) * u + px * s * 0.62, yAt(u) + 0.95, a.z + (b.z - a.z) * u + pz * s * 0.62, 0.05), COL.woodDark, 0, true); }
  }
  // the lookout: a rail round the end platform and a thatched cone roof on four posts
  for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) put(at(cyl(0.05, 0.05, 2.2, 5), b.x + dx * 1.05, yb + 1.1, b.z + dz * 1.05), COL.woodDark, 0, true);
  put(at(new THREE.ConeGeometry(1.9, 0.9, 6), b.x, yb + 2.65, b.z), COL.thatch);
  // the vine swing: two ropes from the walkway's underside and a plank seat 0.7 m over the ground
  const S = W.SWING;
  const sg = gy(S.x, S.z);
  const sTop = yAt(Math.hypot(S.x - a.x, S.z - a.z) / len);
  for (const s of [-1, 1]) put(at(cyl(0.02, 0.02, sTop - sg - 0.7, 4), S.x + px * s * S.w * 0.5, sg + 0.7 + (sTop - sg - 0.7) / 2, S.z + pz * s * S.w * 0.5), COL.rope, 0, true);
  put(at(box(0.7, 0.06, 0.28).rotateY(Math.atan2(nx, nz)), S.x, sg + 0.67, S.z), COL.wood, 0, true);

  // the sloth's tree: a trunk, a leafy crown, and the limb the sloth hangs from, a little way out over the find ring
  const L = W.SLOTH_TREE;
  const ly = gy(L.x, L.z);
  put(at(cyl(0.34, 0.5, L.h, 7), L.x, ly + L.h / 2, L.z), COL.trunk, 2);
  crown(L.x, L.z, ly + L.h + 0.3, 1.1, 11);
  put(beam(L.x, ly + W.SLOTH.limbY, L.z, W.SLOTH.x + 1.1, ly + W.SLOTH.limbY + 0.05, W.SLOTH.z - 0.1, 0.3), COL.trunk, 3);

  // the hidden orchid: a mossy stump with a tall arching stem and five soft pale-and-pink blooms (they glow a little: the glow bucket)
  const O = W.ORCHID;
  const oy = gy(O.x, O.z);
  put(at(cyl(0.34, 0.42, O.h, 7), O.x, oy + O.h / 2, O.z), ORCHID.stump, 1);
  put(at(ball(0.4, 6, 4).scale(1, 0.4, 1), O.x, oy + O.h, O.z), COL.moss, 0, true);
  put(beam(O.x, oy + O.h, O.z, O.x + 0.45, oy + O.h + 1.0, O.z - 0.1, 0.035), ORCHID.stem, 0, true);
  for (let i = 0; i < 5; i++) {
    const u = (i + 1) / 6;
    glow(at(ball(0.11 + 0.01 * (i % 2), 5, 4).scale(1.2, 0.8, 1), O.x + 0.45 * u + 0.18 * (i % 2 ? 1 : -1), oy + O.h + 0.3 + u * 0.75, O.z - 0.1 * u + 0.08), i % 2 ? ORCHID.pink : ORCHID.petal);
  }

  // the supper's ring of hanging lanterns along the veranda's eave: a cord and a glass at each (the glass is lit by the supper)
  for (const bu of W.supperBulbs()) {
    glow(at(ball(0.1, 5, 4), bu.x, bu.y, bu.z), GLASS);
    put(at(cyl(0.012, 0.012, 0.4, 3), bu.x, bu.y + 0.3, bu.z), COL.rope, 0, true);
  }
}

// ---- the fruit and the sloth ---------------------------------------------------------------------------------------------------------------------
const merged = (parts) => { const g = mergeParts(parts); return g; };
function mergeParts(parts) {
  let n = 0;
  for (const p of parts) n += p.attributes.position.count;
  const pos = new Float32Array(n * 3); const col = new Float32Array(n * 3);
  let o = 0;
  for (const p of parts) {
    const g = p.index ? p.toNonIndexed() : p;
    pos.set(g.attributes.position.array, o * 3); col.set(g.attributes.color.array, o * 3);
    o += g.attributes.position.count;
    if (g !== p) g.dispose();
    p.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeVertexNormals();
  return out;
}
const mark = (o) => { o.castShadow = false; o.receiveShadow = false; Object.assign(o.userData, { noMerge: true, noCast: true, noContactShadow: true }); return o; };
const lit = () => new THREE.MeshLambertMaterial({ vertexColors: true });
const stripped = (geo, hex) => { const g = paint(geo, hex); g.deleteAttribute('uv'); return g; };

// The banana bunch lying on the ground: five fat curved bananas fanned from one brown stem. A Group (named), built once per walk.
export function fruitModel(kind) {
  const g = new THREE.Group();
  if (kind === 'banana') {
    const parts = [stripped(cyl(0.035, 0.045, 0.14, 5).translate(0, 0.02, 0), 0x6a4a28)];
    for (let i = 0; i < 5; i++) parts.push(stripped(new THREE.TorusGeometry(0.17, 0.035, 5, 8, Math.PI * 0.75).rotateZ(-0.4).rotateY((i - 2) * 0.28).translate(0, 0, 0), i % 2 ? 0xf2d23a : 0xe8c42a));
    g.name = 'jungle:banana';
    g.add(mark(new THREE.Mesh(merged(parts), lit())));
  } else {
    const parts = [stripped(ball(0.1, 7, 5).scale(0.85, 1.35, 0.85), 0xc8602a), stripped(cyl(0.012, 0.016, 0.07, 4).translate(0, 0.16, 0), 0x4c7a30)];
    for (let i = 0; i < 4; i++) parts.push(stripped(ball(0.04, 4, 3).scale(0.5, 1.7, 0.5).translate(Math.cos((i * Math.PI) / 2) * 0.085, 0, Math.sin((i * Math.PI) / 2) * 0.085), 0x8a3a1c));
    g.name = 'jungle:cacao';
    g.add(mark(new THREE.Mesh(merged(parts), lit())));
  }
  return g;
}

// The sleepy sloth hanging by its long arms from the limb: a shaggy brown-grey body, a pale face with a dark eye mask and a soft smile, three long claws on each arm. Faces +x
// (toward the find ring); the origin is its back where it holds the limb. One mesh, built once per walk.
export function slothGeometry() {
  const fur = 0x8a7a62; const furLight = 0xb0a088; const face = 0xe6dcc0; const mask = 0x4a3c2c; const claw = 0xe8e2d0;
  const parts = [
    stripped(ball(0.3, 8, 6).scale(0.8, 1.15, 0.8).translate(0, -0.42, 0), fur),
    stripped(ball(0.27, 7, 5).scale(0.7, 0.9, 0.7).translate(0.05, -0.55, 0.0), furLight),
    stripped(ball(0.2, 8, 6).scale(0.95, 0.9, 0.95).translate(0.22, -0.68, 0), face),
    stripped(ball(0.07, 5, 4).scale(1, 0.7, 1.3).translate(0.36, -0.66, 0.08), mask),
    stripped(ball(0.07, 5, 4).scale(1, 0.7, 1.3).translate(0.36, -0.66, -0.08), mask),
    stripped(ball(0.035, 4, 3).translate(0.4, -0.74, 0), 0x3a2c20),
  ];
  for (const s of [-1, 1]) {
    parts.push(stripped(beam(0, -0.1, s * 0.18, 0, 0.12, s * 0.2, 0.09), fur));
    for (let i = 0; i < 3; i++) parts.push(stripped(box(0.02, 0.1, 0.02).translate(0.03 * (i - 1), 0.2, s * (0.2 + 0.03 * (i - 1))), claw));
    parts.push(stripped(beam(0.02, -0.7, s * 0.2, 0.04, -0.98, s * 0.16, 0.08), fur));
  }
  return merged(parts);
}
export function slothMesh() {
  const m = mark(new THREE.Mesh(slothGeometry(), lit()));
  m.name = 'jungle:sloth';
  return m;
}
