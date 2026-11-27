// =============================================================================
// THE SEASIDE'S STILL HOLIDAY THINGS (Part of the Seaside's chunk; the plan is
// seasideplan.js). Two vertex-coloured, merged, noCast meshes, made once in
// build() inside withLocalUuids (so no real Math.random draw):
//   seasideSandwork  the sand castles at their three stages (small flags on
//                    two), the buckets, the towels and a soft dark patch under
//                    each bather's feet (the beach has no contact decals for
//                    people), the beach umbrella over the sitters. Dims at
//                    dusk like the sand.
//   seasideStands    the ice-cream cart with its striped umbrella, the lemonade
//                    stand with its striped awning, and the pier's gull posts.
//                    Dims at dusk like the huts.
// Nothing here moves and nothing is lit by a light of its own.
// =============================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { withLocalUuids } from './localuuids.js';
import { litMaterial } from '../render/materials.js';
import {
  SEASIDE_FOLK, SEASIDE_TOWELS, SEASIDE_UMBRELLA, SEASIDE_CASTLES, SEASIDE_VENDORS, SEASIDE_POSTS, POST_TOP, footY,
} from './seasideplan.js';

const _c = new THREE.Color();

// A part: non-indexed, with the same four attributes whatever it came from,
// one colour (or per-triangle colours from `pick(centroid, triIndex)`).
export function part(geo, hex, pick) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  const n = g.attributes.position.count;
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  const col = new Float32Array(n * 3);
  const p = g.attributes.position;
  for (let t = 0; t < n; t += 3) {
    let h = hex;
    if (pick) {
      const cx = (p.getX(t) + p.getX(t + 1) + p.getX(t + 2)) / 3;
      const cz = (p.getZ(t) + p.getZ(t + 1) + p.getZ(t + 2)) / 3;
      h = pick(cx, cz, t / 3);
    }
    _c.setHex(h);
    for (let k = 0; k < 3; k++) { col[(t + k) * 3] = _c.r; col[(t + k) * 3 + 1] = _c.g; col[(t + k) * 3 + 2] = _c.b; }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

const mix = (a, b, k) => {
  const ca = new THREE.Color(a); const cb = new THREE.Color(b);
  return ca.lerp(cb, k).getHex();
};
const box = (w, h, d, x, y, z, hex) => part(new THREE.BoxGeometry(w, h, d).translate(x, y, z), hex);
const cyl = (rt, rb, h, seg, x, y, z, hex, pick) => part(new THREE.CylinderGeometry(rt, rb, h, seg).translate(x, y, z), hex, pick);
const cone = (r, h, seg, x, y, z, hex, pick) => part(new THREE.ConeGeometry(r, h, seg).translate(x, y, z), hex, pick);
const ball = (r, x, y, z, hex) => part(new THREE.SphereGeometry(r, 7, 5).translate(x, y, z), hex);
// a pennant streaming west (the wind is off the sea), one triangle wound both ways
function flag(x, y, z, len, hex) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([x, y, z, x - len, y - 0.035, z + 0.01, x, y - 0.07, z, x, y, z, x, y - 0.07, z, x - len, y - 0.035, z + 0.01], 3));
  g.computeVertexNormals();
  return part(g, hex);
}
// alternate two colours round a canopy by the centroid's bearing
const gores = (a, b, n) => (cx, cz) => (Math.floor(((Math.atan2(cz, cx) / (Math.PI * 2) + 1) % 1 * n)) % 2 ? b : a);
const place = (geo, x, y, z, yaw = 0) => { geo.rotateY(yaw); geo.translate(x, y, z); return geo; };

const SAND = [0xc9ae78, 0xbf9f6a, 0xd4ba85];

function castle(c, out) {
  const P = [];
  const s = (i) => SAND[i % SAND.length];
  if (c.stage === 0) {
    P.push(cyl(0.3, 0.5, 0.16, 8, 0, 0.08, 0, s(0)));
    P.push(cyl(0.085, 0.1, 0.26, 7, 0.14, 0.29, 0.04, s(1)));
    P.push(cyl(0.085, 0.1, 0.1, 7, -0.16, 0.21, -0.1, s(2)));
  } else if (c.stage === 1) {
    P.push(cyl(0.38, 0.58, 0.16, 8, 0, 0.08, 0, s(0)));
    P.push(box(0.4, 0.3, 0.4, 0, 0.31, 0, s(1)));
    for (const [x, z, h] of [[0.28, 0.1, 0.5], [-0.26, -0.12, 0.42]]) {
      P.push(cyl(0.09, 0.1, h, 7, x, 0.16 + h / 2, z, s(2)));
      P.push(cone(0.115, 0.12, 7, x, 0.16 + h + 0.05, z, s(1)));
    }
    P.push(box(0.1, 0.05, 0.05, 0, 0.5, 0.2, s(0)), box(0.1, 0.05, 0.05, 0, 0.5, -0.2, s(0)));
  } else {
    P.push(cyl(0.5, 0.76, 0.14, 10, 0, 0.07, 0, s(0)));
    for (const [w, d, x, z] of [[0.7, 0.08, 0, 0.3], [0.7, 0.08, 0, -0.3], [0.08, 0.7, 0.3, 0], [0.08, 0.7, -0.3, 0]]) P.push(box(w, 0.2, d, x, 0.24, z, s(1)));
    for (const [i, [x, z]] of [[0.3, 0.3], [-0.3, 0.3], [0.3, -0.3], [-0.3, -0.3]].entries()) {
      const h = 0.46 + 0.04 * (i % 2);
      P.push(cyl(0.1, 0.115, h, 7, x, 0.14 + h / 2, z, s(2 + i)));
      P.push(cone(0.13, 0.12, 7, x, 0.14 + h + 0.05, z, s(1)));
    }
    P.push(box(0.34, 0.34, 0.34, 0, 0.31, 0, s(0)));
    P.push(cone(0.26, 0.14, 4, 0, 0.55, 0, s(2)));
  }
  if (c.flag) {
    const px = c.stage === 2 ? 0 : 0.28; const pz = c.stage === 2 ? 0 : 0.1;
    const base = c.stage === 2 ? 0.62 : 0.66;
    P.push(cyl(0.007, 0.007, 0.2, 4, px, base + 0.1, pz, 0x8a6a48));
    P.push(flag(px, base + 0.2, pz, 0.13, c.flag));
  }
  for (const g of P) { place(g, c.x, 0, c.z, c.yaw); out.push(g); }
}

function bucket(c, out) {
  const b = c.bucket;
  if (!b) return;
  out.push(place(cyl(0.075, 0.095, 0.14, 7, 0, 0.07, 0, 0xd9483b), b.x, 0, b.z));
  out.push(place(cyl(0.05, 0.07, 0.01, 7, 0, 0.145, 0, 0x8c2a22), b.x, 0, b.z));
}

function towel(t, out) {
  out.push(place(box(1.0, 0.016, 1.9, 0, 0.01, 0, t.colors[0]), t.x, 0, t.z, t.yaw));
  for (const z of [-0.78, -0.58, 0.58, 0.78]) out.push(place(box(1.0, 0.018, 0.1, 0, 0.011, z, t.colors[1]), t.x, 0, t.z, t.yaw));
}

// a soft dark patch of sand under a foot: it sits just above the towel's cloth
function patch(x, z, r, out) {
  out.push(place(cyl(r, r, 0.004, 9, 0, footY(x, z) + 0.017, 0, 0xa68c5c), x, 0, z));
}

function beachUmbrella(u, out) {
  const parts = [
    cyl(0.022, 0.022, 1.95, 5, 0, 0.975, 0, 0xf4efe4),
    cone(1.1, 0.34, 8, 0, 1.9, 0, 0xffffff, gores(u.colors[0], u.colors[1], 8)),
    ball(0.035, 0, 2.09, 0, 0xf4efe4),
  ];
  for (const g of parts) { g.rotateZ(-u.tilt); out.push(place(g, u.x, 0, u.z)); }
}

// --- the stands (local frame: +x faces the boardwalk, z runs along it) --------
function iceCreamCart(v, out) {
  const P = [
    box(0.7, 0.5, 1.3, 0, 0.62, 0, 0xf3c4d4),
    box(0.02, 0.2, 1.3, 0.36, 0.5, 0, 0xb5e3d0),
    box(0.72, 0.06, 1.32, 0, 0.9, 0, 0xf8f4ec),
    part(new THREE.CylinderGeometry(0.2, 0.24, 0.09, 8).rotateZ(Math.PI / 2).translate(0.43, 0.27, 0.32), 0x3a3633),
    part(new THREE.CylinderGeometry(0.2, 0.24, 0.09, 8).rotateZ(Math.PI / 2).translate(-0.43, 0.27, 0.32), 0x3a3633),
    box(0.06, 0.37, 0.06, 0.2, 0.185, -0.58, 0x6c5a44), box(0.06, 0.37, 0.06, -0.2, 0.185, -0.58, 0x6c5a44),
    cyl(0.018, 0.018, 0.55, 5, 0, 0.9 + 0.275, 0.55, 0x8a8a90), // the push bar's post
    box(0.04, 0.04, 0.5, 0, 1.45, 0.55, 0x8a8a90),
    cyl(0.02, 0.02, 1.4, 5, -0.12, 1.6, -0.1, 0xf4efe4), // the umbrella's pole
    cone(1.25, 0.42, 8, -0.12, 2.07, -0.1, 0xffffff, gores(0xe2433a, 0xf4efe4, 8)),
    ball(0.04, -0.12, 2.3, -0.1, 0xf4efe4),
    // the picture on the front: a cone, two scoops
    part(new THREE.ConeGeometry(0.075, 0.2, 6).rotateX(Math.PI).translate(0.4, 1.12, -0.35), 0xd9a557),
    ball(0.1, 0.4, 1.26, -0.35, 0xf06a9a), ball(0.085, 0.4, 1.37, -0.35, 0x7a4a2a),
    cyl(0.012, 0.012, 0.5, 4, 0.4, 0.95, -0.35, 0x8a8a90),
  ];
  for (const g of P) { place(g, v.x, 0, v.z); out.push(g); }
}

function lemonadeStand(v, out) {
  const wood = 0xb98a50; const lighter = 0xd9ae72;
  const P = [
    box(0.7, 0.9, 1.6, 0, 0.45, 0, wood),
    box(0.74, 0.05, 1.64, 0, 0.92, 0, lighter),
    box(0.02, 0.5, 1.5, 0.36, 0.5, 0, 0xf7c93b),
    box(0.06, 2.1, 0.06, -0.3, 1.05, 0.76, 0x6c5a44), box(0.06, 2.1, 0.06, -0.3, 1.05, -0.76, 0x6c5a44),
    box(0.06, 1.95, 0.06, 0.28, 0.975, 0.76, 0x6c5a44), box(0.06, 1.95, 0.06, 0.28, 0.975, -0.76, 0x6c5a44),
    cyl(0.09, 0.09, 0.28, 8, 0.0, 1.08, -0.4, 0xf7e27a), cyl(0.09, 0.09, 0.28, 8, 0.0, 1.08, 0.0, 0xf6d84a),
    cyl(0.12, 0.09, 0.07, 8, 0.15, 0.98, 0.4, 0xf4efe4),
    ball(0.045, 0.13, 1.04, 0.4, 0xf7d23a), ball(0.045, 0.19, 1.04, 0.43, 0xf7d23a), ball(0.045, 0.15, 1.04, 0.36, 0xe8c030),
    box(0.03, 0.34, 1.0, 0.31, 1.62, 0, 0xf4efe4), // the price board (no letters: a lemon and two dots)
    ball(0.07, 0.34, 1.65, 0, 0xf7d23a),
  ];
  // the striped awning: six boards, slanted down toward the customers
  for (let i = 0; i < 6; i++) {
    const g = new THREE.BoxGeometry(0.95, 0.04, 0.3).rotateZ(-0.2).translate(0.0, 2.05, -0.75 + 0.3 * i + 0.15);
    P.push(part(g, i % 2 ? 0xf4efe4 : 0xf2b81e));
  }
  for (const g of P) { place(g, v.x, 0, v.z); out.push(g); }
}

function post(p, out) {
  out.push(place(cyl(0.085, 0.1, POST_TOP + 0.3, 7, 0, (POST_TOP - 0.3) / 2, 0, 0x6c5a44), p.x, 0, p.z));
  out.push(place(cyl(0.1, 0.1, 0.03, 7, 0, POST_TOP + 0.01, 0, 0x8a7a64), p.x, 0, p.z));
}

function mesh(parts, name, tint) {
  const geo = mergeGeometries(parts, false);
  for (const g of parts) g.dispose();
  const m = new THREE.Mesh(geo, litMaterial(0xffffff, { vertexColors: true }));
  m.name = name;
  m.userData.noCast = true;
  m.userData.duskLawnTint = tint;
  return m;
}

// Adds the two meshes to the scene and returns them.
export function dressSeasideLife(scene, { sandTint, standTint }) {
  return withLocalUuids('seaside-life-decor', () => {
    const sand = [];
    for (const c of SEASIDE_CASTLES) { castle(c, sand); bucket(c, sand); }
    for (const t of SEASIDE_TOWELS) towel(t, sand);
    for (const p of SEASIDE_FOLK) {
      if (p.role !== 'sit') patch(p.x, p.z, p.kind === 'child' ? 0.26 : 0.34, sand);
      if (p.adultAt) patch(p.adultAt.x, p.adultAt.z, 0.34, sand);
    }
    for (const v of SEASIDE_VENDORS) patch(v.vendorAt.x, v.vendorAt.z, 0.34, sand);
    const stands = [];
    beachUmbrella(SEASIDE_UMBRELLA, stands);
    for (const v of SEASIDE_VENDORS) (v.kind === 'cart' ? iceCreamCart : lemonadeStand)(v, stands);
    for (const p of SEASIDE_POSTS) post(p, stands);
    const sandwork = mesh(sand, 'seasideSandwork', sandTint);
    const standMesh = mesh(stands, 'seasideStands', standTint);
    scene.add(sandwork, standMesh);
    return { sandwork, stands: standMesh };
  });
}
