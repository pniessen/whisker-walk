// Trees, bushes and plant beds: oaks, birches, willows and pines with the
// occluder shapes the fight camera reads, beach clumps, shrubs, flowers, and
// the reed, fern, bramble, heather, gorse, lily-pad and toadstool beds. The
// shared helpers (materials, hashes, sway, blobs) are imported back from
// builder.js: the cycle is safe because nothing here calls into builder.js
// while the modules load. Every name exported here is re-exported by
// builder.js.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { litMaterial, surfaceProps } from '../render/materials.js';
import { withLocalUuids } from './localuuids.js';
import { makeRustleMaterial } from '../render/rustle.js';
// dressing.js imports hash01 from builder.js, which imports this file; the
// cycle is safe because none of the three calls another at load time
// (bothSidesLit is only used in fernBed).
import { bothSidesLit } from './dressing.js';
import {
  hash01, smoothstep, surfMat, TRUNK_SIDES, organicTint, swayFor, BUSH_SIZE_HINT,
  SWAY_BUSH, mat, roundedBox, FLOWER_SIZE_HINT, SWAY_FLOWERS, surfNoMap,
  mergedNoCast, blobGeometry,
} from './builder.js';

// THE TREES' OCCLUDER SHAPES (src/fightcam.js). Each tree carries, in its
// Group's own unscaled frame, a few simple solids that hold every vertex it
// draws: vertical cylinders { t: 'cyl', r, y0, y1 } on the tree's axis and
// ellipsoids { t: 'ell', y, r, ry } centred on it. The fight camera keeps its
// lines to both cats clear of them. test/fightcam.test.js rebuilds trees at
// many spots and scales and checks every vertex sits inside. Data only: no
// mesh, no draw, nothing changes on screen.
//
// The round canopy (CANOPY_KINDS.round) reaches 1.89 of its 1.6 nominal
// radius (its second lobe bulges out and down to y 0.96), hence the 1.95
// sphere; the other kinds carry their own ellipsoids (CANOPY_KINDS).
const OAK_TRUNK = Object.freeze({ t: 'cyl', r: 0.35, y0: 0, y1: 2 });
export const TREE_OCCLUDER = Object.freeze([OAK_TRUNK, Object.freeze({ t: 'ell', y: 2.8, r: 1.95, ry: 1.95 })]);
function willowOccluder(curtainFloor) {
  return Object.freeze([
    OAK_TRUNK,
    Object.freeze({ t: 'ell', y: 2.8, r: 1.95, ry: 1.95 * 0.75 }),
    // the curtain: strands out to 1.55 (plus their own half-width), from the
    // floor (or 0.1 under the top, whichever is lower) to the top
    Object.freeze({ t: 'cyl', r: 1.6, y0: Math.min(curtainFloor, 2.8), y1: 2.9 }),
  ]);
}

// CANOPY KINDS (polish-canopies). Every broadleaf tree used to be the same
// two-lobe ball; now each (x, z) grows one of three crowns, and an area can
// ask for a fourth:
//   oak    wide and clumpy: a detail-2 shell whose radius, direction by
//          direction, is the union of a core and 3-4 lump spheres (so the
//          silhouette is a cluster of rounded masses), squashed in y, with a
//          low side lump.
//   birch  narrow and tall on a pale, dark-marked trunk.
//   round  the old ball, refined: both lobes at detail 1.
//   old    (only when asked: the Woods) a bigger, darker oak.
// Each canopy is lit from above by a vertex `color` (dark under the crown, one
// shade per facet, see shadeCanopy) under the per-tree organicTint material.
//
// Uuid cost per tree is what it always was (the area builds' Math.random
// counts are pinned in test/waterlooks.test.js): one trunk geometry, two
// IcosahedronGeometry and one mergeGeometries for the canopy, a material and a
// mesh each, the Group. Attributes and Colors carry no uuid.
//
// `y` is the canopy centre and `r` its nominal radius, in the Group's unscaled
// frame; the occluder's ellipsoid holds every vertex the kind can draw at any
// (x, z) (test/canopies.test.js, test/fightcam.test.js).
const canopyEll = (y, r, ry) => Object.freeze({ t: 'ell', y, r, ry });
//
// Each y is low enough that the crown sits ON the 2 m trunk: over any (x, z)
// the canopy's underside above the trunk top (axis and 0.2 round it) is at
// most 1.9, so no crown floats clear of its trunk (test/canopies.test.js).
const canopyKindOf = (y, r, green, rx, ry) =>
  Object.freeze({ y, r, green, occluder: Object.freeze([OAK_TRUNK, canopyEll(y, rx, ry)]) });
export const CANOPY_KINDS = Object.freeze({
  oak: canopyKindOf(2.64, 1.9, 0x4a8c3c, 2.45, 2.06),
  birch: canopyKindOf(3.0, 1.1, 0x6aa64a, 1.52, 2.1),
  round: Object.freeze({ y: 2.8, r: 1.6, green: 0x4e9440, occluder: TREE_OCCLUDER }),
  old: canopyKindOf(2.8, 2.3, 0x3f7d36, 3.0, 2.5),
});

// The kind a tree at (x, z) grows when the area doesn't say: about 40% oak,
// 35% round, 25% birch.
export function canopyKind(x, z) {
  const h = hash01(x, z, 41);
  return h < 0.4 ? 'oak' : h < 0.75 ? 'round' : 'birch';
}

// A low-frequency radial field over the unit sphere, the canopies' own copy
// of blobField's idea (read its header for why it is smooth waves over the
// vertex DIRECTION and never per-vertex noise: that renders as a crumpled,
// shattered ball). Returns roughly [-1, 1].
function canopyField(x, z, salt) {
  const waves = [];
  for (let i = 0; i < 3; i++) {
    const s = salt + i * 5;
    const theta = hash01(x, z, s + 1) * Math.PI * 2;
    const phi = hash01(x, z, s + 2) * Math.PI;
    waves.push({
      dx: Math.sin(phi) * Math.cos(theta),
      dy: Math.cos(phi),
      dz: Math.sin(phi) * Math.sin(theta),
      freq: 1 + (i % 2),
      phase: hash01(x, z, s + 3) * Math.PI * 2,
      weight: 0.5 + 0.5 * hash01(x, z, s + 4),
    });
  }
  const wsum = waves.reduce((a, w) => a + w.weight, 0);
  return (ux, uy, uz) => {
    let sum = 0;
    for (const w of waves) sum += Math.sin((ux * w.dx + uy * w.dy + uz * w.dz) * Math.PI * w.freq + w.phase) * w.weight;
    return sum / wsum;
  };
}

// One lobe: an icosahedron of `radius` whose every vertex is moved along its
// own direction to radius * reach(direction). Non-indexed, so normals
// computed later are per facet.
function canopyLobe(radius, detail, reach) {
  const geo = new THREE.IcosahedronGeometry(radius, detail);
  const pos = geo.attributes.position;
  for (let v = 0; v < pos.count; v++) {
    const px = pos.getX(v), py = pos.getY(v), pz = pos.getZ(v);
    const len = Math.hypot(px, py, pz) || 1;
    const k = reach(px / len, py / len, pz / len);
    pos.setXYZ(v, px * k, py * k, pz * k);
  }
  return geo;
}

// The oak's cluster: how far from the centre, along unit direction u, the
// union of the spheres reaches (each { cx, cy, cz, s }, the first one a core
// round the centre so every direction hits something). Far intersection of
// the ray with each sphere, the largest wins: the creases where two lumps meet
// stay as creases, which is what reads as separate masses of leaves.
function lumpReach(spheres, ux, uy, uz) {
  let best = 0;
  for (const { cx, cy, cz, s } of spheres) {
    const b = ux * cx + uy * cy + uz * cz;
    const disc = b * b - (cx * cx + cy * cy + cz * cz) + s * s;
    if (disc >= 0) best = Math.max(best, b + Math.sqrt(disc));
  }
  return best;
}

// The oak's primary shell (unit radius; the caller scales): a core and 3-4
// lumps round the crown and one on top.
function oakSpheres(x, z, salt, lumps) {
  const out = [{ cx: 0, cy: 0, cz: 0, s: 0.62 }];
  const a0 = hash01(x, z, salt) * Math.PI * 2;
  for (let i = 0; i < lumps; i++) {
    const a = a0 + (i / lumps) * Math.PI * 2 + (hash01(x, z, salt + 1 + i) - 0.5) * 0.7;
    const h = 0.4 + 0.1 * hash01(x, z, salt + 6 + i);
    out.push({
      cx: Math.cos(a) * h,
      cy: 0.02 + 0.22 * hash01(x, z, salt + 11 + i),
      cz: Math.sin(a) * h,
      s: 0.48 + 0.08 * hash01(x, z, salt + 16 + i),
    });
  }
  out.push({ cx: (hash01(x, z, salt + 21) - 0.5) * 0.2, cy: 0.34, cz: (hash01(x, z, salt + 22) - 0.5) * 0.2, s: 0.52 });
  return out;
}

// SOFT FACETS (polish-foliage). A canopy keeps its low-poly silhouette (the
// positions never move) but each vertex's normal is pulled part of the way
// from its facet's flat normal toward a "rounded" normal: the smooth normal
// of the lobe it sits on (the facet normals round that corner, averaged)
// mixed with the direction out from the crown's centre. So the light rolls
// round the crown instead of stepping a whole shade per facet: from 15 m the
// facets still read (the flat share and the per-facet shade below keep
// them), and up close at 2 m they no longer read as panels bigger than the
// cat's head. Pure in the geometry: same positions in, same normals out.
const CANOPY_SOFT = 0.6; // share of the rounded normal (0 = flat facets, 1 = smooth)
const CANOPY_RADIAL = 0.35; // share of "out from the centre" in the rounded normal
export function softenFoliageNormals(geo, soft, radial, centre = null) {
  const pos = geo.attributes.position, nrm = geo.attributes.normal;
  const n = pos.count;
  // the smooth normal: facet normals summed over every vertex at one spot
  // (non-indexed, so a corner is several vertices; keyed by position to 1e-4)
  const key = (v) => `${Math.round(pos.getX(v) * 1e4)},${Math.round(pos.getY(v) * 1e4)},${Math.round(pos.getZ(v) * 1e4)}`;
  const sum = new Map();
  const keys = new Array(n);
  for (let v = 0; v < n; v++) {
    const k = keys[v] = key(v);
    let s = sum.get(k);
    if (!s) { s = [0, 0, 0]; sum.set(k, s); }
    s[0] += nrm.getX(v); s[1] += nrm.getY(v); s[2] += nrm.getZ(v);
  }
  const cx = centre ? centre[0] : 0, cy = centre ? centre[1] : 0, cz = centre ? centre[2] : 0;
  for (let v = 0; v < n; v++) {
    const s = sum.get(keys[v]);
    const sl = Math.hypot(s[0], s[1], s[2]) || 1;
    const rx = pos.getX(v) - cx, ry = pos.getY(v) - cy, rz = pos.getZ(v) - cz;
    const rl = Math.hypot(rx, ry, rz) || 1;
    let tx = (1 - radial) * s[0] / sl + radial * rx / rl;
    let ty = (1 - radial) * s[1] / sl + radial * ry / rl;
    let tz = (1 - radial) * s[2] / sl + radial * rz / rl;
    const tl = Math.hypot(tx, ty, tz) || 1;
    tx /= tl; ty /= tl; tz /= tl;
    const fx = nrm.getX(v), fy = nrm.getY(v), fz = nrm.getZ(v);
    let ox = (1 - soft) * fx + soft * tx, oy = (1 - soft) * fy + soft * ty, oz = (1 - soft) * fz + soft * tz;
    const ol = Math.hypot(ox, oy, oz) || 1;
    nrm.setXYZ(v, ox / ol, oy / ol, oz / ol);
  }
  nrm.needsUpdate = true;
}

// Vertex colour: a height term (0.62 under the crown up to 1.0 over its top
// quarter) times one shade per facet (0.86-1.0, hashed off the facet's centre
// direction), so the hollows underneath go dark and the small facets read.
// polish-foliage: the per-facet shade narrows to 0.9-1.0 (with soft normals
// the full spread read as a patchwork up close), and a little underside AO,
// from the facet's own normal, darkens the faces that look down by up to 12%.
function shadeCanopy(geo, x, z) {
  const pos = geo.attributes.position;
  const nrm = geo.attributes.normal;
  let minY = Infinity, maxY = -Infinity;
  for (let v = 0; v < pos.count; v++) {
    const y = pos.getY(v);
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const top = minY + 0.75 * (maxY - minY);
  const c = new Float32Array(pos.count * 3);
  for (let f = 0; f < pos.count; f += 3) {
    const cx = pos.getX(f) + pos.getX(f + 1) + pos.getX(f + 2);
    const cy = pos.getY(f) + pos.getY(f + 1) + pos.getY(f + 2);
    const cz = pos.getZ(f) + pos.getZ(f + 1) + pos.getZ(f + 2);
    const len = Math.hypot(cx, cy, cz) || 1;
    const shade = 0.9 + 0.1 * hash01(x + (cx / len) * 31.7, z + (cz / len) * 31.7, 60 + (cy / len) * 17.3);
    for (let v = f; v < f + 3; v++) {
      const ao = 1 - 0.12 * Math.max(0, -nrm.getY(v));
      const k = (0.62 + 0.38 * smoothstep(minY, top, pos.getY(v))) * shade * ao;
      c[v * 3] = c[v * 3 + 1] = c[v * 3 + 2] = k;
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
}

// canopyGeometry(x, z, kind) — the canopy tree() hangs at CANOPY_KINDS[kind].y,
// in its own frame (centre at the origin). Non-indexed, with position, normal,
// uv and color. Pure in (x, z, kind). Its largest horizontal radius rides along
// as geometry.userData.r (tree() hands it to userData.canopy).
export function canopyGeometry(x, z, kind) {
  const K = CANOPY_KINDS[kind] ?? CANOPY_KINDS.round;
  const R = K.r;
  let a, b2;
  if (kind === 'oak' || kind === 'old') {
    const old = kind === 'old';
    const spheres = oakSpheres(x, z, 100, old ? 4 : 3 + (hash01(x, z, 99) < 0.5 ? 0 : 1));
    const f = canopyField(x, z, 130);
    a = canopyLobe(R, 2, (ux, uy, uz) => lumpReach(spheres, ux, uy, uz) * (1 + f(ux, uy, uz) * 0.06));
    a.scale(1, 0.8, 1);
    // the low side lump, between two of the crown's
    const f2 = canopyField(x, z, 150);
    b2 = canopyLobe(R * (0.34 + 0.06 * hash01(x, z, 141)), old ? 1 : 0, (ux, uy, uz) => 1 + f2(ux, uy, uz) * 0.2);
    const ang = hash01(x, z, 100) * Math.PI * 2 + Math.PI / (old ? 4 : 3);
    const off = R * (0.42 + 0.08 * hash01(x, z, 142));
    b2.translate(Math.cos(ang) * off, -R * (0.14 + 0.08 * hash01(x, z, 143)), Math.sin(ang) * off);
  } else if (kind === 'birch') {
    const f = canopyField(x, z, 200);
    a = canopyLobe(R * 0.9, 1, (ux, uy, uz) => 1 + f(ux, uy, uz) * 0.14);
    a.scale(1, 1.6, 1);
    const f2 = canopyField(x, z, 220);
    b2 = canopyLobe(R * (0.36 + 0.06 * hash01(x, z, 211)), 0, (ux, uy, uz) => 1 + f2(ux, uy, uz) * 0.2);
    const ang = hash01(x, z, 212) * Math.PI * 2;
    const off = R * (0.5 + 0.1 * hash01(x, z, 213));
    b2.translate(Math.cos(ang) * off, R * (0.55 + 0.25 * hash01(x, z, 214)), Math.sin(ang) * off);
  } else {
    const f = canopyField(x, z, 300);
    a = canopyLobe(R * 0.88, 1, (ux, uy, uz) => 1 + f(ux, uy, uz) * 0.22);
    const f2 = canopyField(x, z, 320);
    b2 = canopyLobe(R * (0.36 + 0.1 * hash01(x, z, 311)), 1, (ux, uy, uz) => 1 + f2(ux, uy, uz) * 0.2);
    const ang = hash01(x, z, 312) * Math.PI * 2;
    const off = R * (0.45 + 0.15 * hash01(x, z, 313));
    b2.translate(Math.cos(ang) * off, (hash01(x, z, 314) - 0.5) * R * 0.35, Math.sin(ang) * off);
  }
  const geo = mergeGeometries([a, b2], false);
  a.dispose();
  b2.dispose();
  // per-tree drift, +-10% per axis, so no two crowns are one object stamped
  geo.scale(
    1 + (hash01(x, z, 51) - 0.5) * 0.2,
    1 + (hash01(x, z, 52) - 0.5) * 0.2,
    1 + (hash01(x, z, 53) - 0.5) * 0.2,
  );
  geo.computeVertexNormals(); // non-indexed: one flat normal per facet
  softenFoliageNormals(geo, CANOPY_SOFT, CANOPY_RADIAL);
  shadeCanopy(geo, x, z);
  const pos = geo.attributes.position;
  let r = 0;
  for (let v = 0; v < pos.count; v++) r = Math.max(r, Math.hypot(pos.getX(v), pos.getZ(v)));
  geo.userData.r = Math.round(r * 100) / 100;
  geo.computeBoundingSphere();
  return geo;
}

// The birch's trunk: thinner, open-ended (the foot is in the ground and the
// top inside the crown), 6 sides and 6 rings (72 triangles: the Woods' budget
// has no room for more). The rings are moved so a pale-dark-pale-dark-pale run
// sits at a hashed height round a cat's eye; each dark ring carries a few dark
// vertices on opposite sides, which the vertex colours spread into short
// staggered horizontal dashes, and the foot darkens up into the last ring
// like old bark.
const BIRCH_SIDES = 6;
const BIRCH_PALE = [0.56, 0.54, 0.48];
function birchTrunkGeometry(x, z) {
  const top = 0.16, bottom = 0.24;
  const geo = new THREE.CylinderGeometry(top, bottom, 2, BIRCH_SIDES, 6, true);
  const a = -0.1 + 0.6 * hash01(x, z, 230);
  const rows = [1, a + 0.09, a, a - 0.09, a - 0.18, a - 0.27, -1];
  const pos = geo.attributes.position;
  const c = new Float32Array(pos.count * 3);
  const cols = BIRCH_SIDES + 1;
  const c0 = Math.floor(hash01(x, z, 232) * BIRCH_SIDES);
  const marks = { 2: new Set([c0]), 4: new Set([(c0 + 3) % BIRCH_SIDES]) };
  if (hash01(x, z, 233) < 0.6) marks[2].add((c0 + 1) % BIRCH_SIDES);
  if (hash01(x, z, 234) < 0.5) marks[4].add((c0 + 4) % BIRCH_SIDES);
  for (let v = 0; v < pos.count; v++) {
    const row = Math.floor(v / cols);
    const col = (v % cols) % BIRCH_SIDES; // the seam column repeats column 0
    const y = rows[row];
    const r0 = Math.hypot(pos.getX(v), pos.getZ(v)) || 1;
    const r = top + ((1 - y) / 2) * (bottom - top);
    pos.setXYZ(v, (pos.getX(v) * r) / r0, y, (pos.getZ(v) * r) / r0);
    // The bark colour (0xe6e1d4) is multiplied by these in linear light. Plain
    // 1 left the trunk the brightest thing in a dusk wood, so the pale runs
    // sit at BIRCH_PALE (a warm grey-white, a touch more red than blue) and
    // the dashes are near-black; the foot keeps its half-dark.
    const k = marks[row]?.has(col) ? 0.09 : row === 6 ? 0.5 : 1;
    const pale = k === 0.09 ? [1, 1, 1] : BIRCH_PALE;
    c[v * 3] = k * pale[0]; c[v * 3 + 1] = k * pale[1]; c[v * 3 + 2] = k * pale[2];
  }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return geo;
}

// `opts.wind` is the per-walk sway registry (see the WIND block in
// builder.js). Passing it plants the tree AND registers it in one line; leaving
// it out is the tree this function has always returned.
//
// `opts.kind` picks the crown (CANOPY_KINDS); left out, the tree grows
// canopyKind(x, z).
//
// The whole Group is registered, so trunk and canopy lean together as one
// rigid body — which is the entire point of wind.js's rotation-only design:
// `g.position.x/z` never moves, so the collider and the perch this tree may
// carry stay exactly where the area declared them.
export function tree(x, z, scale = 1, { wind, kind } = {}) {
  if (!CANOPY_KINDS[kind]) kind = canopyKind(x, z);
  const K = CANOPY_KINDS[kind];
  const g = new THREE.Group();
  // 'bark' is the roughest thing in the game (0.98) and ships MAP-LESS on
  // purpose — a 6-sided trunk is the cylinder rule's worked example. What
  // sells the trunk is the roughness step against the canopy above it.
  // Always a 2-unit cylinder centred at y 1 (climbing.js's fork math), its
  // foot no wider than 0.35 (inside the 0.5 x scale collider).
  let trunk;
  if (kind === 'birch') {
    const bark = surfMat(0xe6e1d4, 'bark');
    bark.vertexColors = true;
    trunk = new THREE.Mesh(birchTrunkGeometry(x, z), bark);
  } else {
    // Open-ended (polish-foliage): the top sits inside the crown (the canopy
    // test pins the underside over the axis at <= 1.9) and the foot in the
    // ground, so neither cap is ever seen in the open. A camera INSIDE the
    // crown sees no canopy (front faces only, or faded), and there the top cap
    // read as a flat brown disc in the foreground; the bottom cap was always
    // underground. 20 fewer triangles a tree, same uuid draws.
    trunk = new THREE.Mesh(new THREE.CylinderGeometry(kind === 'old' ? 0.3 : 0.25, 0.35, 2, TRUNK_SIDES, 1, true),
      surfMat(kind === 'old' ? 0x6e4a2c : 0x7a5230, 'bark'));
  }
  trunk.position.y = 1;
  g.add(trunk);
  // 'foliage' at 0.8 — a leaf has a waxy cuticle and a canopy in sun carries a
  // sheen band that bark simply does not. Also map-less: a single facet is far
  // bigger than any tile, so a map here would be one stretched smear per face.
  // The material is this tree's own (litMaterial makes a new one per call), so
  // turning its vertex colours on touches nothing else.
  const foliage = surfMat(organicTint(K.green, x, z, 10), 'foliage');
  foliage.vertexColors = true;
  const leaves = new THREE.Mesh(canopyGeometry(x, z, kind), foliage);
  leaves.position.y = K.y;
  // A fixed per-tree orientation — the same rotation every time this exact
  // (x, z) is built, so co-walkers agree, but different from every other
  // tree's rotation so a row of them doesn't read as one object stamped
  // repeatedly.
  leaves.rotation.y = hash01(x, z, 30) * Math.PI * 2;
  g.add(leaves);
  g.scale.setScalar(scale);
  g.position.set(x, 0, z);
  // Where the canopy is, in the Group's own (unscaled) frame. render/ambient.js
  // reads this off the scene at walk time to drop leaves from under real
  // canopies; it survives mergeStaticProps, which keeps every top-level Group.
  g.userData.canopy = { y: leaves.position.y, r: leaves.geometry.userData.r };
  g.userData.canopyKind = kind;
  g.userData.occluder = K.occluder;
  // Registered AFTER position/scale are set: wind.add derives this tree's
  // phase from its (x, z), so a tree registered at the origin would sway in
  // lockstep with every other tree in the area.
  //
  // sizeHint carries the frequency (a big oak is slower than a sapling, which
  // is wind.js's own falloff and is right), amplitude is overridden to grow
  // WITH the tree rather than against it — see the WIND block's note in
  // builder.js on why the brief beat the inertia model here.
  if (wind) wind.add(g, { sizeHint: scale, amplitude: swayFor(scale) });
  return g;
}

// beachClumpGeometry(x, z, kind) — the Seaside's plants, in place of the
// garden-shrub blob: 'marram' (dune grass: 16 arching straw-green blades
// fanned from a tight base, plus 3 buff seed spikes — 98 triangles) or
// 'holly' (sea holly: a low silvery blue-grey rosette of 9 spiky leaves and 4
// stems topped by small blue thistle heads in a star of bracts — 100
// triangles). Built around the local origin with
// the ground at y 0; bush() places and spins it.
//
// EXACTLY three BufferGeometries — part A, part B and their merge, with A and
// B disposed — because that is what blobGeometry (builder.js) makes for a 2-lobe bush, and
// Three draws 4 Math.random values for every geometry's uuid. The Seaside's
// build draw count is pinned (test/waterlooks.test.js) and feeds the flat
// trace, so the beach clump must cost the canopy's draws to the object. Shape
// comes from hash01 only, never Math.random. Colours are linear
// (new THREE.Color(hex)) per vertex. ≤ 100 triangles either kind, though
// 160 was the brief's cap: the canopy bush it replaces is 100, and the
// Seaside had no triangles to give (29,521 under a 30,000 ceiling), so the
// clump spends exactly what the shrub did and no more.
function beachClumpGeometry(x, z, kind) {
  const part = () => {
    const pos = [], col = [], idx = [];
    return {
      // v(x, y, z, colour) -> vertex index
      v(px, py, pz, colour) {
        pos.push(px, py, pz);
        col.push(colour.r, colour.g, colour.b);
        return pos.length / 3 - 1;
      },
      tri(a, b, d) { idx.push(a, b, d); },
      geo() {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
        g.setIndex(idx);
        g.computeVertexNormals();
        return g;
      },
    };
  };
  const H = (s) => hash01(x, z, s);
  const A = part(), B = part();
  const mix = (a, b, t, shade = 1) => new THREE.Color(a).lerp(new THREE.Color(b), t).multiplyScalar(shade);

  if (kind === 'marram') {
    // Blades: three segments (quad, quad, tip triangle = 5 triangles), so
    // each arches visibly instead of standing as a flat card.
    const N = 16;
    for (let i = 0; i < N; i++) {
      const s = 1100 + i * 7;
      const th = ((i + H(s) * 0.7) / N) * Math.PI * 2;
      const r = 0.25 * H(s + 1);
      const h = 0.6 + 0.55 * H(s + 2);
      // outer blades lean further; inner ones stand up
      const reach = h * (0.15 + 0.25 * (r / 0.25) + 0.2 * H(s + 3));
      const a = reach / h;
      const w0 = 0.05 + 0.02 * H(s + 4);
      const shade = 0.88 + 0.18 * H(s + 5);
      const ox = Math.cos(th), oz = Math.sin(th);
      const sx = -oz, sz = ox;
      const bx = ox * r, bz = oz * r;
      const ids = [];
      for (let k = 0; k <= 3; k++) {
        const t = k / 3;
        const d = reach * t * t;
        const y = h * t * (1 - 0.35 * a * t);
        const cx = bx + ox * d, cz = bz + oz * d;
        const colour = mix(0x8a9a5a, 0xd8c88a, Math.pow(t, 0.8), shade);
        if (k === 3) {
          ids.push(A.v(cx, y, cz, colour));
        } else {
          const w = w0 * (1 - 0.8 * t) * 0.5;
          ids.push(A.v(cx - sx * w, y, cz - sz * w, colour), A.v(cx + sx * w, y, cz + sz * w, colour));
        }
      }
      A.tri(ids[0], ids[1], ids[3]); A.tri(ids[0], ids[3], ids[2]);
      A.tri(ids[2], ids[3], ids[5]); A.tri(ids[2], ids[5], ids[4]);
      A.tri(ids[4], ids[5], ids[6]);
    }
    // Seed spikes: a stem that thickens into a buff spike, as two crossed
    // cards (3 triangles each) so it reads from every side.
    for (let j = 0; j < 3; j++) {
      const s = 1300 + j * 11;
      const th = ((j + H(s)) / 3) * Math.PI * 2;
      const r = 0.06 * H(s + 1);
      const h = 1.0 + 0.22 * H(s + 2);
      const lean = 0.08 + 0.1 * H(s + 3);
      const ox = Math.cos(th), oz = Math.sin(th);
      const bx = ox * r, bz = oz * r;
      const at = (t) => [bx + ox * lean * t * t, h * t, bz + oz * lean * t * t];
      const stem = mix(0x8a9a5a, 0xb8b07a, 0.5);
      const head = mix(0xc8b07a, 0xd8c08a, H(s + 4));
      for (let card = 0; card < 2; card++) {
        const ang = th + card * Math.PI / 2;
        const wx = Math.cos(ang), wz = Math.sin(ang);
        const [x0, y0, z0] = at(0), [x1, y1, z1] = at(0.78), [x2, y2, z2] = at(1);
        const b0 = B.v(x0 - wx * 0.006, y0, z0 - wz * 0.006, stem);
        const b1 = B.v(x0 + wx * 0.006, y0, z0 + wz * 0.006, stem);
        const m0 = B.v(x1 - wx * 0.018, y1, z1 - wz * 0.018, head);
        const m1 = B.v(x1 + wx * 0.018, y1, z1 + wz * 0.018, head);
        const tp = B.v(x2, y2, z2, head);
        B.tri(b0, b1, m1); B.tri(b0, m1, m0); B.tri(m0, m1, tp);
      }
    }
  } else {
    // Rosette: 9 spiky leaves (4 triangles each, a raised midrib and two
    // pairs of side spines), all ≤ ~0.35 m off the sand.
    const N = 9;
    for (let i = 0; i < N; i++) {
      const s = 1500 + i * 7;
      const ph = ((i + H(s) * 0.6) / N) * Math.PI * 2;
      const L = 0.28 + 0.1 * H(s + 1);
      const e = 0.5 + 0.3 * H(s + 2);
      const shade = 0.78 + 0.16 * H(s + 3);
      const dx = Math.cos(ph) * Math.cos(e), dy = Math.sin(e), dz = Math.sin(ph) * Math.cos(e);
      const sx = -Math.sin(ph), sz = Math.cos(ph);
      const c0 = [Math.cos(ph) * 0.03, 0.01, Math.sin(ph) * 0.03];
      const P = (along, side, lift) => [
        c0[0] + dx * along * L + sx * side * L,
        c0[1] + dy * along * L + lift,
        c0[2] + dz * along * L + sz * side * L,
      ];
      const base = mix(0x7d949e, 0x8fa6b0, 0.5, shade);
      const leaf = new THREE.Color(0x8fa6b0).multiplyScalar(shade);
      const tipC = mix(0x8fa6b0, 0xc4d2d8, 0.6, shade);
      const v0 = A.v(...c0, base);
      const v1 = A.v(...P(0.5, 0, 0.03), leaf);
      const v2 = A.v(...P(1, 0, -0.01), tipC);
      const l1 = A.v(...P(0.3, -0.3, -0.015), tipC);
      const r1 = A.v(...P(0.3, 0.3, -0.015), tipC);
      const l2 = A.v(...P(0.72, -0.24, -0.01), tipC);
      const r2 = A.v(...P(0.72, 0.24, -0.01), tipC);
      A.tri(v0, l1, v1); A.tri(v0, v1, r1);
      A.tri(v1, l2, v2); A.tri(v1, v2, r2);
    }
    // Flower stems: crossed thin cards (4 triangles), a three-sided
    // bipyramid head (6) and a 6-point star of bracts under it (6) — 16 a stem.
    for (let j = 0; j < 4; j++) {
      const s = 1700 + j * 11;
      const th = ((j + H(s) * 0.8) / 4) * Math.PI * 2;
      const r = 0.06 * H(s + 1);
      const h = 0.34 + 0.12 * H(s + 2);
      const lean = 0.1 + 0.08 * H(s + 3);
      const ox = Math.cos(th), oz = Math.sin(th);
      const bx = ox * r, bz = oz * r;
      const tx = bx + ox * lean, tz = bz + oz * lean;
      const stemLo = new THREE.Color(0x8fa6b0), stemHi = mix(0x8fa6b0, 0x6f86c8, 0.5);
      for (let card = 0; card < 2; card++) {
        const ang = th + card * Math.PI / 2;
        const wx = Math.cos(ang), wz = Math.sin(ang);
        const a0 = B.v(bx - wx * 0.012, 0, bz - wz * 0.012, stemLo);
        const a1 = B.v(bx + wx * 0.012, 0, bz + wz * 0.012, stemLo);
        const a2 = B.v(tx + wx * 0.008, h, tz + wz * 0.008, stemHi);
        const a3 = B.v(tx - wx * 0.008, h, tz - wz * 0.008, stemHi);
        B.tri(a0, a1, a2); B.tri(a0, a2, a3);
      }
      // thistle head
      const hc = new THREE.Color(0x6f86c8).multiplyScalar(0.92 + 0.12 * H(s + 4));
      const hy = h + 0.045, rx = 0.048, ry = 0.06;
      const top = B.v(tx, hy + ry, tz, hc);
      const bot = B.v(tx, hy - ry, tz, hc);
      const eq = [];
      for (let k = 0; k < 3; k++) {
        const a = th + (k * Math.PI * 2) / 3;
        eq.push(B.v(tx + Math.cos(a) * rx, hy, tz + Math.sin(a) * rx, hc));
      }
      for (let k = 0; k < 3; k++) {
        B.tri(top, eq[(k + 1) % 3], eq[k]);
        B.tri(bot, eq[k], eq[(k + 1) % 3]);
      }
      // star bracts, spreading just under the head
      const bc = new THREE.Color(0xa8bccc);
      for (let k = 0; k < 6; k++) {
        const a = th + (k * Math.PI) / 3 + 0.3;
        const by = h + 0.005;
        const p = B.v(tx + Math.cos(a - 0.4) * 0.02, by, tz + Math.sin(a - 0.4) * 0.02, bc);
        const q = B.v(tx + Math.cos(a + 0.4) * 0.02, by, tz + Math.sin(a + 0.4) * 0.02, bc);
        const tip = B.v(tx + Math.cos(a) * 0.11, by + 0.015, tz + Math.sin(a) * 0.11, bc);
        B.tri(p, q, tip);
      }
    }
  }
  const ga = A.geo(), gb = B.geo();
  const merged = mergeGeometries([ga, gb], false);
  ga.dispose();
  gb.dispose();
  merged.computeBoundingSphere();
  return merged;
}

// The default bush's shape (polish-pines2): a leafy shrub rather than one
// green faceted rock. 4-5 small leaf clusters — a crown on top and the rest
// round its sides, resting on the ground — over a dark hidden core cone that
// fills the gaps between them, so no sky shows through at the foot.
//
// Each cluster is a little lumpy dome: a dark underside ring, a wider
// "equator" ring whose points alternate long and short (the tufts), a
// shoulder ring and a light tip; shoulder and tip lean outward on the side
// clusters so they bulge away from the middle. (A first cut with 7-point
// rings and only an equator under the tip read as green crystals: the
// rounding needs the shoulder ring more than it needs points.) 5 points a
// ring: 25 triangles a cluster, 8 for the core, so a bush is 108-133
// triangles (the old blob was 100; a sixth cluster would pass the 150 cap).
//
// Colour is a MULTIPLIER on the material's green (bush() keeps the
// organicTint base as the material colour, like the pines), so the
// material's tint and whatever lighting dusk sets still apply: core ~0.45,
// undersides ~0.55, equators ~0.9, shoulders ~1.0, tips ~1.15 and a little yellow-green,
// with a per-cluster shade, a per-vertex drift (the mottle that keeps it
// from reading as one surface) and a slight per-bush warm/cool cast.
//
// Mesh-local frame: the origin is the bush's belly, lifted 0.5 by bush(), so
// the ground is local y -0.5; the core and the side clusters' feet sit a hair
// below it so a bush never floats on a gentle slope. Everything from hash01:
// same (x, z) -> the same arrays, byte for byte. Exactly 3 geometries
// (core, clusters, their merge; the two parts disposed), as the blob was, so
// bush() keeps its uuid draws.
//
// polish-shrubs: the clusters still read as faceted green rocks at 2 m. The
// smooth (indexed) normals of a five-sided lump bend hard at its rings, so
// each vertex's normal is pulled SHRUB_ROUND of the way toward the direction
// out from its own cluster's centre: the light rolls round each lump like a
// leafy ball, while the lumps (and their dark creases) still read apart at
// 10 m.
//
// polish-bushes (Pass 10): that softened the LIGHT but not the OUTLINE. A
// five-point ring is a pentagon whatever its normals do, and a bush with no
// leaves on its edge is a stone from the side, so at walk height they still
// read as green rocks. So now:
//  - K 7 points a ring, each corner pushed in by up to SHRUB_JIT and nudged
//    up or down (keyed on the corner, hash only), so the outline is lumpy;
//  - every cluster wears a fringe of leaf cards on its upper half (the
//    brambleLeaves recipe: a diamond rooted inside the lump, tipped out and
//    up past it), in two greens with a lit tip and a dark root, so the
//    silhouette breaks into leaves. Their normals are set, out from the lump
//    and up, so they light with it; bush() makes the material two-sided and
//    lit by those normals on both faces (dressing.js bothSidesLit);
//  - the creases read: on the side clusters the face turned in toward the
//    bush's middle is shaded down (SHRUB_CREASE), so two lumps meet in a
//    dark fold instead of one green surface.
// The cards ride part B (no new geometry, so bush() keeps its uuid draws).
// Leaves are short (SHRUB_LEAF m), so the footprint barely grows (bounding
// sphere still < 0.91). +~160-195 triangles a bush (148-183 rings + core,
// 58-72 cards).
const SHRUB_ROUND = 0.7;
const SHRUB_GREEN = 0x62994a;
const SHRUB_K = 7;
const SHRUB_JIT = 0.16;
const SHRUB_CREASE = 0.32;
const SHRUB_LEAF = 0.18;
const SHRUB_CARDS = { crown: 16, side: 14 };
function shrubGeometry(x, z) {
  const part = () => {
    const pos = [], col = [], idx = [], ctr = [], set = [];
    let centre = null;
    return {
      pos, col,
      // the cluster the next vertices belong to (null: keep the smooth normal)
      centre(c) { centre = c; },
      // `n`: a normal to use as given (the leaf cards)
      v(px, py, pz, c, n = null) {
        pos.push(px, py, pz);
        col.push(c[0], c[1], c[2]);
        ctr.push(centre);
        set.push(n);
        return pos.length / 3 - 1;
      },
      tri(a, b, d) { idx.push(a, b, d); },
      geo() {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
        g.setIndex(idx);
        g.computeVertexNormals();
        const nrm = g.attributes.normal;
        for (let v = 0; v < ctr.length; v++) {
          if (set[v]) { nrm.setXYZ(v, set[v][0], set[v][1], set[v][2]); continue; }
          const c = ctr[v];
          if (!c) continue;
          let rx = pos[v * 3] - c[0], ry = pos[v * 3 + 1] - c[1], rz = pos[v * 3 + 2] - c[2];
          const rl = Math.hypot(rx, ry, rz) || 1;
          rx /= rl; ry /= rl; rz /= rl;
          const nx = (1 - SHRUB_ROUND) * nrm.getX(v) + SHRUB_ROUND * rx;
          const ny = (1 - SHRUB_ROUND) * nrm.getY(v) + SHRUB_ROUND * ry;
          const nz = (1 - SHRUB_ROUND) * nrm.getZ(v) + SHRUB_ROUND * rz;
          const nl = Math.hypot(nx, ny, nz) || 1;
          nrm.setXYZ(v, nx / nl, ny / nl, nz / nl);
        }
        return g;
      },
    };
  };
  const H = (s) => hash01(x, z, s);
  const A = part(), B = part();
  const size = 0.93 + 0.13 * H(1101);
  const warm = (H(1102) - 0.5) * 2;
  const cast = [1 + 0.05 * warm, 1, 1 - 0.07 * warm];
  const TIP = [1.06, 1.03, 0.8];
  // shade s, tip weight t (0..1 toward TIP), per-vertex drift from salt
  const shade = (s, t, salt) => {
    const j = s * (0.93 + 0.14 * H(salt));
    return [0, 1, 2].map((i) => j * cast[i] * (1 + (TIP[i] - 1) * t));
  };
  const GROUND = -0.53;
  const K = SHRUB_K;
  // a ring of n points about (cx, cz): returns vertex ids. `jit` pushes each
  // corner in (and up or down a little), keyed on the corner
  const ring = (P, n, cx, y, cz, r, turn, s, t, salt, wob = 0, jit = 0) => {
    const ids = [];
    for (let k = 0; k < n; k++) {
      const a = turn + (k / n) * Math.PI * 2;
      const rr = r * (k % 2 === 0 ? 1 : 1 - wob) * (1 - 0.08 * H(salt + k)) * (1 - jit * H(salt + 60 + k));
      const yy = y + (k % 2 === 0 ? wob * 0.25 * r : 0) + jit * 0.5 * r * (H(salt + 90 + k) - 0.5);
      ids.push(P.v(cx + Math.cos(a) * rr, yy, cz + Math.sin(a) * rr, shade(s, t, salt + 20 + k)));
    }
    return ids;
  };
  // outward-facing band between two rings of equal count, and a cap to an apex
  const band = (P, lo, hi) => {
    const n = lo.length;
    for (let k = 0; k < n; k++) {
      const k1 = (k + 1) % n;
      P.tri(lo[k], hi[k], lo[k1]);
      P.tri(lo[k1], hi[k], hi[k1]);
    }
  };
  const cap = (P, ringIds, apex) => {
    const n = ringIds.length;
    for (let k = 0; k < n; k++) P.tri(apex, ringIds[(k + 1) % n], ringIds[k]);
  };

  // the core: a dark low cone, hidden among the clusters' feet
  const coreTurn = H(1104) * Math.PI * 2;
  const core = ring(A, 8, 0, GROUND, 0, 0.42 * size, coreTurn, 0.42, 0, 1110);
  cap(A, core, A.v(0, 0.1 * size, 0, shade(0.55, 0, 1140)));

  // the leaf clusters: 0 is the crown, the rest stand round it
  const n = 4 + Math.floor(H(1103) * 2);
  const turn = H(1105) * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const s = 1200 + i * 100;
    const crown = i === 0;
    const a = turn + ((i - 1) / (n - 1)) * Math.PI * 2 + (H(s) - 0.5) * 0.6;
    const d = crown ? 0.06 * H(s + 1) : 0.25 + 0.08 * H(s + 1);
    const cx = Math.cos(a) * d * size, cz = Math.sin(a) * d * size;
    const rc = (crown ? 0.34 + 0.05 * H(s + 2) : 0.29 + 0.06 * H(s + 2)) * size;
    const cy = (crown ? 0.1 + 0.07 * H(s + 3) : -0.14 + 0.1 * H(s + 3)) * size;
    const clusterShade = 0.9 + 0.2 * H(s + 4);
    const spin = H(s + 5) * Math.PI * 2;
    const step = Math.PI / K;
    const first = B.pos.length / 3;
    // underside: hidden inside for the crown, on the ground for the others
    const footY = crown ? cy - 0.6 * rc : GROUND + 0.03 * H(s + 6);
    // the lump's own middle, a little below its equator, so the foot ring
    // turns down and out and the shoulder up and out
    B.centre([cx * 0.95, cy - 0.1 * rc, cz * 0.95]);
    const lo = ring(B, K, cx * 0.8, footY, cz * 0.8, 0.6 * rc, spin, 0.55 * clusterShade, 0, s + 10);
    const mid = ring(B, K, cx, cy + 0.05 * rc, cz, rc, spin + step, 0.88 * clusterShade, 0.2, s + 40, 0.2, SHRUB_JIT);
    // the shoulder and tip lean outward on the side clusters
    const lean = crown ? 0 : 0.22 * rc;
    const ox = Math.cos(a) * lean, oz = Math.sin(a) * lean;
    const up = ring(B, K, cx + ox * 0.6, cy + 0.52 * rc, cz + oz * 0.6, 0.62 * rc, spin + 2 * step,
      1.0 * clusterShade, 0.5, s + 70, 0.15, SHRUB_JIT);
    band(B, lo, mid);
    band(B, mid, up);
    const tip = B.v(cx + ox, cy + (0.76 + 0.08 * H(s + 8)) * rc, cz + oz, shade(1.15 * clusterShade, 1, s + 9));
    cap(B, up, tip);

    // the leaf fringe, over the lump's upper half; a side cluster's faces
    // its own way (the inside of the bush is hidden by its neighbours)
    B.centre(null);
    const L = crown ? SHRUB_CARDS.crown : SHRUB_CARDS.side;
    const ccx = cx + ox * 0.5, ccy = cy + 0.05 * rc, ccz = cz + oz * 0.5;
    for (let q = 0; q < L; q++) {
      const hs = s + 200 + q * 7;
      const az = crown
        ? spin + ((q + 0.6 * H(hs)) / L) * Math.PI * 2
        : a + ((q + 0.5) / L - 0.5) * 4.4 + (H(hs) - 0.5) * 0.35;
      // spread over the lump: a side cluster's reach down its flank, the
      // crown's round its shoulder, a few near the top
      const el = (crown ? 0.05 : -0.75) + (crown ? 1.0 : 1.7) * ((q * 0.618 + 0.5 * H(hs + 1)) % 1);
      const ce = Math.cos(el), se = Math.sin(el);
      const dx = Math.cos(az) * ce, dy = se, dz = Math.sin(az) * ce;
      // the root sits just under the lump's skin; the leaf lies up along it
      // like a shingle, tipped out from it, so the lump is clothed in leaves
      // and its edge breaks into them
      // (lower down the lump flares, so its skin is further out)
      const rr = rc * (0.8 + 0.3 * Math.max(0, -se));
      const root = [ccx + dx * rr, ccy + dy * rr * 0.95, ccz + dz * rr];
      let tx = -dx * dy, ty = 1 - dy * dy, tz = -dz * dy;
      const tl = Math.hypot(tx, ty, tz) || 1;
      let ux = 0.35 * dx + 0.94 * tx / tl, uy = 0.35 * dy + 0.94 * ty / tl, uz = 0.35 * dz + 0.94 * tz / tl;
      const ul = Math.hypot(ux, uy, uz);
      ux /= ul; uy /= ul; uz /= ul;
      const len = SHRUB_LEAF * size * (0.85 + 0.35 * H(hs + 2));
      const w = len * 1.05;
      // across: along the lump, square to the heading, a little twisted
      const tw = (H(hs + 3) - 0.5) * 0.5;
      let sx = -Math.sin(az), sy = tw, sz = Math.cos(az);
      const sl = Math.hypot(sx, sy, sz);
      sx = (sx / sl) * w / 2; sy = (sy / sl) * w / 2; sz = (sz / sl) * w / 2;
      const m = [root[0] + ux * len * 0.42, root[1] + uy * len * 0.42, root[2] + uz * len * 0.42];
      // normal: out of the lump and up, so the fringe lights with it
      let nx = dx, ny = dy + 0.45, nz = dz;
      const nl = Math.hypot(nx, ny, nz);
      nx /= nl; ny /= nl; nz /= nl;
      const nrm = [nx, ny, nz];
      // two greens (a deep and a fresh one), brighter higher up the lump
      const g = (H(hs + 4) < 0.5 ? 0.82 : 1.0) * clusterShade * (0.9 + 0.16 * Math.max(0, se));
      const r0 = B.v(...root, shade(g * 0.6, 0, hs + 5), nrm);
      const lv = B.v(m[0] - sx, m[1] - sy, m[2] - sz, shade(g * 0.95, 0.2, hs + 6), nrm);
      const tv = B.v(root[0] + ux * len, root[1] + uy * len, root[2] + uz * len, shade(g * 1.04, 0.5, hs + 7), nrm);
      const rv = B.v(m[0] + sx, m[1] + sy, m[2] + sz, shade(g * 0.95, 0.2, hs + 8), nrm);
      B.tri(r0, rv, tv);
      B.tri(r0, tv, lv);
    }

    // the crease: a side cluster's face turned in toward the bush's middle
    // (and low down) falls into shade where it meets its neighbours
    if (!crown) {
      const ax = Math.cos(a), az2 = Math.sin(a);
      for (let v = first; v < B.pos.length / 3; v++) {
        const hx = B.pos[v * 3] - cx, hz = B.pos[v * 3 + 2] - cz;
        const hl = Math.hypot(hx, hz);
        if (hl < 1e-6) continue;
        const inward = Math.max(0, -(hx * ax + hz * az2) / hl);
        const low = 1 - smoothstep(cy - 0.2 * rc, cy + 0.7 * rc, B.pos[v * 3 + 1]);
        const f = 1 - SHRUB_CREASE * inward * (0.4 + 0.6 * low);
        for (let c = 0; c < 3; c++) B.col[v * 3 + c] *= f;
      }
    }
  }

  const ga = A.geo(), gb = B.geo();
  const merged = mergeGeometries([ga, gb], false);
  ga.dispose();
  gb.dispose();
  merged.computeBoundingSphere();
  return merged;
}

// A bush. Returns the same bare Mesh it always has — UNLESS `opts.wind` is
// passed, in which case it comes back as a Group with that mesh inside it.
//
// That is not decoration, it is the pivot. wind.js rotates a registered object
// around its OWN origin, and this mesh's origin is its belly at y 0.5, so
// registering it directly would hinge the bush about its middle and slide its
// base sideways. wind.js offers `pivotY` for exactly this — but pivotY works
// by reparenting under a pivot Group, and at the moment a builder registers,
// the prop has no parent yet (the caller has not called scene.add). So the
// builder makes the hinge itself: a Group at (x, 0, z) — ground contact, the
// same origin every compound prop here already has — with the mesh at local
// y 0.5, so the bush is in exactly the same place either way and no geometry,
// collider or hide-spot record moves a millimetre.
export function bush(x, z, { wind, style, kind: forceKind } = {}) {
  // 'foliage', same as a tree canopy and map-less for the same reason. The
  // shape is shrubGeometry() above (leaf clusters round a core, hashed from
  // the bush's own spot, so no two neighbouring bushes match).
  //
  // `style: 'beach'` swaps the canopy for a ground-rooted clump (see
  // beachClumpGeometry above): the same 3 geometries, 1 material, 1 mesh, so
  // the same uuid draws, but the mesh sits at y 0 — it grows from the sand,
  // there is no belly to lift.
  const beach = style === 'beach';
  // `kind` ('marram' | 'holly') overrides the hash pick: a spot that must be
  // tall (a mouse hide) or low can say so.
  const kind = beach ? (forceKind || (hash01(x, z, 1041) < 0.5 ? 'marram' : 'holly')) : null;
  let leaves = null;
  if (!beach) {
    // polish-pines2: a leafy shrub (shrubGeometry above). The organicTint
    // green stays the material colour; the vertex colours multiply it.
    // polish-shrubs: a little olive, away from the canopies' green (0x5aa04e)
    leaves = surfMat(organicTint(SHRUB_GREEN, x, z, 1010, 8), 'foliage');
    leaves.vertexColors = true;
    // polish-bushes: the leaf cards are seen from both sides and lit by the
    // normals they were built with on both (the closed lumps never show a
    // back face, so nothing changes for them)
    leaves.side = THREE.DoubleSide;
    bothSidesLit(leaves);
  }
  const m = beach
    ? new THREE.Mesh(
      beachClumpGeometry(x, z, kind),
      litMaterial(0xffffff, { ...surfaceProps('foliage'), vertexColors: true, side: THREE.DoubleSide }),
    )
    : new THREE.Mesh(shrubGeometry(x, z), leaves);
  if (beach) m.userData.beachPlant = kind;
  const lift = beach ? 0 : 0.5;
  m.rotation.y = hash01(x, z, 1030) * Math.PI * 2;
  if (!wind) {
    m.position.set(x, lift, z);
    return m;
  }
  const g = new THREE.Group();
  m.position.set(0, lift, 0);
  g.add(m);
  g.position.set(x, 0, z);
  // Explicit on both counts, because a bush has no `scale` to infer from: the
  // low sizeHint makes it QUICK (a ~2.0s cycle against a tree's ~3.6s) and the
  // small amplitude makes it stir rather than wave.
  wind.add(g, { sizeHint: BUSH_SIZE_HINT, amplitude: SWAY_BUSH });
  return g;
}

// Flowers. Takes `opts.wind` like tree() and bush() — the Group's origin is
// already ground contact, so it hinges at the soil for free with no pivot.
//
// The blooms and stems stay FLAT: nothing here is over 8cm, and the whole
// patch is smaller than one tile of any surface in the vocabulary. The stems
// take 'foliage' rather than a map for the same reason a canopy does.
export function flowerPatch(x, z, { wind } = {}) {
  const g = new THREE.Group();
  const colors = [0xf2a0c0, 0xf2e04e, 0xffffff, 0xe07040];
  for (let i = 0; i < 6; i++) {
    const f = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), mat(colors[i % 4]));
    f.position.set((Math.sin(i * 2.4) * 0.5), 0.25, (Math.cos(i * 1.7) * 0.5));
    g.add(f);
    const stem = new THREE.Mesh(roundedBox(0.03, 0.25, 0.03),
      surfMat(0x4e9440, 'foliage'));
    stem.position.set(f.position.x, 0.12, f.position.z);
    g.add(stem);
  }
  g.position.set(x, 0, z);
  // The quickest and one of the lightest things in the area: thin stems in the
  // slowest air there is, so a pinned-low sizeHint and a small amplitude.
  if (wind) wind.add(g, { sizeHint: FLOWER_SIZE_HINT, amplitude: SWAY_FLOWERS });
  return g;
}

// Clumps of reeds at `spots`, one merged mesh. Blades are thin leaning boxes,
// at most 1.0 m before the lean (the budget is 1.1 m). A bed is wide and low,
// so it opts out of the caster sweep like the stones do.
const REED_BLADES = 5;
// A reed blade's 4 cm square top is never seen and its bottom is buried: leave
// both faces out of the index (BoxGeometry's groups run +x, -x, +y, -y, +z,
// -z), in place, so no new geometry object is made (each draws on Math.random).
function dropEnds(g) {
  const idx = Array.from(g.index.array).filter((_, i) => i < g.groups[2].start || i >= g.groups[4].start);
  g.setIndex(idx);
  g.clearGroups();
  return g;
}
export function reedBed(spots, seed) {
  const geoms = [];
  spots.forEach((sp, i) => {
    for (let k = 0; k < REED_BLADES; k++) {
      const h = 0.6 + 0.4 * hash01(sp.x + k, sp.z + i, seed + 1);
      const blade = dropEnds(new THREE.BoxGeometry(0.04, h, 0.04));
      blade.translate(0, h / 2, 0);
      blade.rotateX((hash01(sp.x, sp.z + k, seed + 2) - 0.5) * 0.3);
      blade.rotateZ((hash01(sp.x + k, sp.z, seed + 3) - 0.5) * 0.3);
      blade.translate(
        sp.x + (hash01(k, i, seed + 4) - 0.5) * 0.5,
        0,
        sp.z + (hash01(i, k, seed + 5) - 0.5) * 0.5,
      );
      geoms.push(blade);
    }
  });
  const geo = geoms.length === 0 ? new THREE.BufferGeometry()
    : geoms.length === 1 ? geoms[0] : mergeGeometries(geoms, false);
  if (geoms.length > 1) for (const p of geoms) p.dispose();
  const m = new THREE.Mesh(geo, surfNoMap(0x8aa05a, 'foliage'));
  m.castShadow = false;
  m.userData.noCast = true;
  return m;
}

// Ferns, a clump at each spot, one mesh: FERN_FRONDS fronds arching out from
// the middle, under 0.6 m tall, so they dress the floor of a wood without
// hiding a cat or a path. Low and wide like the reeds, so they opt out of the
// caster sweep the same way.
//
// Each frond is a rachis of FERN_SEGS segments that leaves the ground steeply
// (50-70 degrees) and droops more with each segment, so it rises, arcs over and
// ends with its tip about 0.4 of its length off the ground. Every segment
// carries a long, narrow leaflet on each side — one triangle from the rachis
// out to a tip set sideways and swept forward past the segment's end, barely
// drooping — and one small triangle closes the tip: 13 triangles a frond, a
// comb rather than a paddle. The colour runs dark root -> rich mid -> slightly
// lighter tip, toned per clump. Thin and open, so it
// is double-sided and lit by its built (upward-leaning) normals on both faces.
const FERN_FRONDS = 7;
const FERN_SEGS = 6;
// dark, rich greens (darker than the ~0x5a8f45 grass): root -> mid -> tip,
// the tip only a little lighter than the middle
const FERN_ROOT = 0x1e3a17;
const FERN_MID = 0x2f5a24;
const FERN_TIP = 0x4f7f2f;
// leaflet half-width per segment, in units of clump size: widest at the
// second and third segments, narrowing to 0.03 at the tip
const FERN_LEAF = [0.12, 0.16, 0.16, 0.115, 0.07, 0.03];

// Progressive droop: segment s loses D * (s / (FERN_SEGS - 1))^2 * (FERN_SEGS - 1)
// of pitch, small at the base and larger toward the tip, so a frond rises,
// arcs over and comes down. D is solved (bisection, no randomness) so the
// tip sits FERN_TIP_RISE * len above the root.
const FERN_TIP_RISE = 0.4;
const fernBend = (s) => ((s / (FERN_SEGS - 1)) ** 2) * (FERN_SEGS - 1);
function fernDroop(lift) {
  const tipRise = (d) => {
    let s = 0;
    for (let i = 0; i < FERN_SEGS; i++) s += Math.sin(lift - d * fernBend(i));
    return s / FERN_SEGS;
  };
  let lo = 0;
  let hi = 1.5;
  for (let it = 0; it < 30; it++) {
    const mid = (lo + hi) / 2;
    if (tipRise(mid) > FERN_TIP_RISE) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

// uuid parity: the box fronds made one BufferGeometry per frond plus the merged
// one (just the empty one for no spots), and every Three geometry draws 4
// Math.random numbers for its uuid. The flat trace and the per-area draw-count
// pins (test/waterlooks.test.js) hang on that count, so the single geometry
// built here is topped up with throwaways to the old number.
function fernUuidParity(n) {
  const oldGeomCount = n === 0 ? 1 : n === 1 ? 1 : n + 1;
  for (let k = 0; k < oldGeomCount - 1; k++) new THREE.BufferGeometry().dispose();
}

export function fernBed(spots, seed) {
  const n = spots.length * FERN_FRONDS;
  const tris = FERN_SEGS * 2 + 1;
  const pos = new Float32Array(n * tris * 9);
  const nor = new Float32Array(n * tris * 9);
  const col = new Float32Array(n * tris * 9);
  const root = new THREE.Color().setHex(FERN_ROOT);
  const midC = new THREE.Color().setHex(FERN_MID);
  const tip = new THREE.Color().setHex(FERN_TIP);
  const c = new THREE.Color();
  const a = new THREE.Vector3();
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  let v = 0;
  // one triangle; `ts` are the three vertices' distances along the frond (0-1)
  const tri = (p0, p1, p2, t0, t1, t2, tone) => {
    e1.subVectors(p1, p0);
    e2.subVectors(p2, p0);
    a.crossVectors(e1, e2).normalize();
    if (a.y < 0) a.negate();
    // 30% of the way toward +Y: leaning up enough to read lit, not so much
    // that every leaflet faces the sun and washes out
    a.multiplyScalar(0.7);
    a.y += 0.3;
    a.normalize();
    for (const [p, t] of [[p0, t0], [p1, t1], [p2, t2]]) {
      const o = v * 3;
      pos[o] = p.x; pos[o + 1] = p.y; pos[o + 2] = p.z;
      nor[o] = a.x; nor[o + 1] = a.y; nor[o + 2] = a.z;
      if (t < 0.5) c.copy(root).lerp(midC, t * 2); else c.copy(midC).lerp(tip, t * 2 - 1);
      c.multiplyScalar(tone);
      col[o] = c.r; col[o + 1] = c.g; col[o + 2] = c.b;
      v++;
    }
  };
  const rach = Array.from({ length: FERN_SEGS + 1 }, () => new THREE.Vector3());
  const fwd = new THREE.Vector3();
  const side = new THREE.Vector3();
  const mid = new THREE.Vector3();
  const lt = new THREE.Vector3();
  const rt = new THREE.Vector3();
  const tl = new THREE.Vector3();
  const tr = new THREE.Vector3();
  const apex = new THREE.Vector3();
  spots.forEach((sp, i) => {
    const turn = hash01(sp.x, sp.z, seed + 1) * Math.PI * 2;
    const size = 0.8 + 0.4 * hash01(sp.z, sp.x, seed + 2);
    const tone = 0.88 + 0.2 * hash01(sp.x, sp.z, seed + 6);
    for (let k = 0; k < FERN_FRONDS; k++) {
      const len = 1.2 * (0.5 + 0.2 * hash01(i, k, seed + 3)) * size;
      // lifted 50-70 degrees off the ground (the box fronds' lift hash plus
      // 0.35 rad, so the arch still stands knee-high to a cat), then turned to
      // its place in the ring
      const lift = 0.52 + 0.35 * hash01(k, i, seed + 4) + 0.35;
      const yaw = turn + (k / FERN_FRONDS) * Math.PI * 2 + (hash01(k, i, seed + 5) - 0.5) * 0.5;
      const droop = fernDroop(lift);
      const seg = len / FERN_SEGS;
      const sy = Math.sin(yaw);
      const cy = Math.cos(yaw);
      side.set(cy, 0, -sy);
      const tipLen = 0.06 * size;
      const total = len + tipLen;
      rach[0].set(sp.x, 0, sp.z);
      for (let s = 0; s < FERN_SEGS; s++) {
        const pitch = lift - droop * fernBend(s);
        fwd.set(sy * Math.cos(pitch), Math.sin(pitch), cy * Math.cos(pitch));
        rach[s + 1].copy(rach[s]).addScaledVector(fwd, seg);
        const f = s / (FERN_SEGS - 1);
        // long, narrow, swept forward: the leaflet tip sits out sideways past
        // the END of its segment, drooping only a little
        const half = FERN_LEAF[s] * size;
        const below = 0.01 + 0.01 * f;
        mid.copy(rach[s + 1]).addScaledVector(fwd, 0.35 * seg);
        mid.y -= below;
        lt.copy(mid).addScaledVector(side, -half);
        rt.copy(mid).addScaledVector(side, half);
        lt.y = Math.max(lt.y, 0.01);
        rt.y = Math.max(rt.y, 0.01);
        const t0 = (s * seg) / total;
        const t1 = ((s + 1) * seg) / total;
        const tm = Math.min((s + 1.35) * seg, total) / total;
        tri(rach[s], lt, rach[s + 1], t0, tm, t1, tone);
        tri(rach[s], rach[s + 1], rt, t0, t1, tm, tone);
      }
      // the closing tip: a small spear on along the last segment's heading
      const end = rach[FERN_SEGS];
      tl.copy(end).addScaledVector(side, -0.015);
      tr.copy(end).addScaledVector(side, 0.015);
      apex.copy(end).addScaledVector(fwd, tipLen);
      apex.y = Math.max(apex.y, 0.01);
      tri(tl, apex, tr, len / total, 1, len / total, tone);
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  fernUuidParity(n);
  // Lambert, not the 'foliage' standard material: thin leaflets are seen
  // edge-on from every angle, and the standard material's grazing-angle
  // specular (mostly the grey RoomEnvironment reflection) washed whole fronds
  // out to pale khaki on the phone. A fern has no gloss worth keeping.
  const material = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, side: THREE.DoubleSide });
  bothSidesLit(material);
  const m = new THREE.Mesh(geo, material);
  m.castShadow = false;
  m.userData.noCast = true;
  return m;
}

// Bramble thickets, one merged mesh: each spot is three or four squashed
// low-poly lobes huddled together, under a metre tall. No collider, like a
// bush: a cat pushes through. Low and wide, so out of the caster sweep too.
//
// polish-foliage: at walk height these read as green faceted rocks (survey 8,
// broken #2), so each lobe, with its triangles unchanged (20), is made to read
// as leaves: its corners are nudged in and out a little (hashed off the corner
// itself, so the copies of one corner move together and no crack opens), its
// normals are pulled most of the way to the lobe's own round (out from its
// centre), and it carries vertex colours: a dark core low down, a lighter,
// yellower top, one shade per lobe and a per-facet mottle, round the old
// flat bramble green. Same geometries made in
// the same order (the Woods' pinned uuid draws).
// polish-shrubs: 0.65 -> 0.85, and the mottle below is mostly per CORNER
// (keyed on the corner, so the copies of a corner match and the colour runs
// smooth across a facet) with only a faint per-facet step: a whole-facet
// shade was what kept the facets reading as stone.
const BRAMBLE_SOFT = 0.85;
// the old flat 0x3b5e2e sits between these; THREE.Color takes the sRGB hex to
// the linear values a vertex colour holds (the material is white)
const BRAMBLE_LOW = new THREE.Color(0x22391f).toArray();
const BRAMBLE_TOP = new THREE.Color(0x5e8540).toArray();
// polish-shrubs: a lobe is still a blob from the path, so each one wears a
// fringe of BRAMBLE_LEAVES leaf cards (a diamond, two triangles) on its upper
// half: rooted just inside the surface, tipped out and up past it, so the
// silhouette breaks into leaves. Their normals point out from the lobe's
// centre, so they light with it; they are a little lighter and yellower than
// the lobe's top. Appended to the lobe's own attributes (no new geometry, so
// the Woods' uuid draws hold). +14 triangles a lobe.
const BRAMBLE_LEAVES = 7;
const BRAMBLE_LEAF = new THREE.Color(0x52783a).toArray();
// gorse wears the same fringe as narrow dark spines (see gorseBed)
const GORSE_SPINE = new THREE.Color(0x3a5530).toArray();
function brambleLeaves(lobe, r, i, k, seed, { leaf = BRAMBLE_LEAF, width = 0.4 } = {}) {
  const names = ['position', 'normal', 'uv', 'color'];
  const add = { position: [], normal: [], uv: [], color: [] };
  const H = (n, m) => hash01(i * 13 + n, k * 7 + m, seed + 40);
  for (let q = 0; q < BRAMBLE_LEAVES; q++) {
    const az = (q / BRAMBLE_LEAVES) * Math.PI * 2 + (H(q, 1) - 0.5) * 0.7;
    const el = 0.05 + 0.85 * H(q, 2); // upper half of the lobe
    const dx = Math.cos(az) * Math.cos(el), dy = Math.sin(el), dz = Math.sin(az) * Math.cos(el);
    // the root sits just under the squashed surface
    const root = [dx * r * 0.82, dy * r * 0.62 * 0.82, dz * r * 0.82];
    // the leaf points out and a little up, 0.16-0.35 m long
    const len = r * (0.36 + 0.14 * H(q, 3));
    const ux0 = dx, uy0 = dy * 0.62 + 0.12, uz0 = dz;
    const ul = Math.hypot(ux0, uy0, uz0);
    const ux = ux0 / ul, uy = uy0 / ul, uz = uz0 / ul;
    // across: horizontal, perpendicular to the leaf's heading, a little twisted
    const tw = (H(q, 4) - 0.5) * 0.8;
    let sx = -dz, sy = tw, sz = dx;
    const sl = Math.hypot(sx, sy, sz) || 1;
    const w = len * width;
    sx = sx / sl * w / 2; sy = sy / sl * w / 2; sz = sz / sl * w / 2;
    const tip = [root[0] + ux * len, root[1] + uy * len, root[2] + uz * len];
    const midT = 0.45;
    const m = [root[0] + ux * len * midT, root[1] + uy * len * midT, root[2] + uz * len * midT];
    const L = [m[0] - sx, m[1] - sy, m[2] - sz], R = [m[0] + sx, m[1] + sy, m[2] + sz];
    const nl = Math.hypot(dx, dy, dz);
    const n = [dx / nl, (dy + 0.2) / nl, dz / nl];
    const nn = Math.hypot(...n);
    const shade = 0.82 + 0.3 * H(q, 5);
    for (const v of [root, R, tip, root, tip, L]) {
      add.position.push(...v);
      add.normal.push(n[0] / nn, n[1] / nn, n[2] / nn);
      add.uv.push(0, 0);
      // root a shade darker than the tip
      const f = v === root ? 0.7 : v === tip ? 1.05 : 0.92;
      for (let c = 0; c < 3; c++) add.color.push(leaf[c] * shade * f);
    }
  }
  for (const name of names) {
    const a = lobe.attributes[name];
    const out = new Float32Array(a.array.length + add[name].length);
    out.set(a.array);
    out.set(add[name], a.array.length);
    lobe.setAttribute(name, new THREE.BufferAttribute(out, a.itemSize));
  }
}
// polish-bushes (Pass 10): the Woods' bramble lobes were the "green rocks"
// at walk height (survey 10 broken #2; the POI shots it names show brambles,
// not bush()): seven thin cards could not hide a 20-face lobe's big flat
// facets. So a bramble lobe now wears BRAMBLE_SHINGLES broad leaf cards laid
// up along its skin like shingles, tipped out from it, from just under its
// waist to near its top, in two greens with a dark root and a lit tip. They
// clothe the facets and break the outline. Normals as brambleLeaves (out of
// the lobe, a little up). Gorse keeps brambleLeaves' spines.
// +14 triangles a lobe over the old fringe (7 -> 14 cards).
const BRAMBLE_SHINGLES = 14;
const BRAMBLE_DEEP = new THREE.Color(0x4a7236).toArray();
function brambleShingles(lobe, r, i, k, seed) {
  const names = ['position', 'normal', 'uv', 'color'];
  const add = { position: [], normal: [], uv: [], color: [] };
  const H = (n, m) => hash01(i * 13 + n, k * 7 + m, seed + 40);
  const SQ = 0.62;
  for (let q = 0; q < BRAMBLE_SHINGLES; q++) {
    const az = (q / BRAMBLE_SHINGLES) * Math.PI * 2 + (H(q, 1) - 0.5) * 0.5;
    const el = -0.3 + 1.4 * ((q * 0.618 + 0.5 * H(q, 2)) % 1);
    const ce = Math.cos(el), se = Math.sin(el);
    const dx = Math.cos(az) * ce, dy = se, dz = Math.sin(az) * ce;
    // on the squashed lobe's skin, a hair inside
    const root = [dx * r * 0.88, dy * r * SQ * 0.88, dz * r * 0.88];
    // up along the skin (the squashed sphere's tangent toward the top), tipped out
    let tx = -dx * dy * SQ, ty = ce * ce, tz = -dz * dy * SQ;
    const tl = Math.hypot(tx, ty, tz) || 1;
    let ux = 0.4 * dx + 0.92 * tx / tl, uy = 0.4 * dy + 0.92 * ty / tl, uz = 0.4 * dz + 0.92 * tz / tl;
    const ul = Math.hypot(ux, uy, uz);
    ux /= ul; uy /= ul; uz /= ul;
    const len = r * (0.42 + 0.16 * H(q, 3));
    const w = len * 0.95;
    const tw = (H(q, 4) - 0.5) * 0.5;
    let sx = -Math.sin(az), sy = tw, sz = Math.cos(az);
    const sl = Math.hypot(sx, sy, sz);
    sx = sx / sl * w / 2; sy = sy / sl * w / 2; sz = sz / sl * w / 2;
    const tip = [root[0] + ux * len, root[1] + uy * len, root[2] + uz * len];
    const m = [root[0] + ux * len * 0.42, root[1] + uy * len * 0.42, root[2] + uz * len * 0.42];
    const L = [m[0] - sx, m[1] - sy, m[2] - sz], R = [m[0] + sx, m[1] + sy, m[2] + sz];
    let nx = dx, ny = dy + 0.35, nz = dz;
    const nl = Math.hypot(nx, ny, nz);
    nx /= nl; ny /= nl; nz /= nl;
    // two greens, darker low on the lobe
    const leaf = H(q, 6) < 0.5 ? BRAMBLE_DEEP : BRAMBLE_LEAF;
    const shade = (0.85 + 0.25 * H(q, 5)) * (0.8 + 0.25 * smoothstep(-0.3, 1, se));
    for (const v of [root, R, tip, root, tip, L]) {
      add.position.push(...v);
      add.normal.push(nx, ny, nz);
      add.uv.push(0, 0);
      const f = v === root ? 0.7 : v === tip ? 1.2 : 1.0;
      for (let c = 0; c < 3; c++) add.color.push(leaf[c] * shade * f);
    }
  }
  for (const name of names) {
    const a = lobe.attributes[name];
    const out = new Float32Array(a.array.length + add[name].length);
    out.set(a.array);
    out.set(add[name], a.array.length);
    lobe.setAttribute(name, new THREE.BufferAttribute(out, a.itemSize));
  }
}
export function brambleBed(spots, seed) {
  const geoms = [];
  spots.forEach((sp, i) => {
    const lobes = 3 + Math.floor(hash01(sp.x, sp.z, seed + 1) * 2);
    for (let k = 0; k < lobes; k++) {
      const r = 0.45 + 0.25 * hash01(i, k, seed + 2);
      const lobe = new THREE.IcosahedronGeometry(r, 0);
      // corners in and out by up to 12% (keyed on the corner, so it stays closed)
      const pos = lobe.attributes.position;
      for (let v = 0; v < pos.count; v++) {
        const px = pos.getX(v), py = pos.getY(v), pz = pos.getZ(v);
        const j = 0.9 + 0.22 * hash01(Math.round(px * 1000) + i * 7, Math.round(pz * 1000) + Math.round(py * 1000) * 3, seed + 11 + k);
        pos.setXYZ(v, px * j, py * j, pz * j);
      }
      lobe.scale(1, 0.62, 1);
      lobe.computeVertexNormals();
      softenFoliageNormals(lobe, BRAMBLE_SOFT, 1);
      // colour: low dark, high light, a shade per lobe
      const shade = 0.88 + 0.24 * hash01(i, k, seed + 6);
      const top = r * 0.62;
      const col = new Float32Array(pos.count * 3);
      for (let v = 0; v < pos.count; v++) {
        const t = smoothstep(-top * 0.7, top * 0.9, pos.getY(v));
        // a mottle, one per facet and a little per corner, so the light
        // breaks up like leaves rather than running smooth like stone
        const f = Math.floor(v / 3);
        const mottle = (0.96 + 0.08 * hash01(i * 31 + f, k, seed + 7))
          * (0.8 + 0.34 * hash01(Math.round(pos.getX(v) * 1000) + i * 7, Math.round(pos.getZ(v) * 1000) + Math.round(pos.getY(v) * 1000) * 3, seed + 8 + k));
        for (let c = 0; c < 3; c++) col[v * 3 + c] = (BRAMBLE_LOW[c] + (BRAMBLE_TOP[c] - BRAMBLE_LOW[c]) * t) * shade * mottle;
      }
      lobe.setAttribute('color', new THREE.BufferAttribute(col, 3));
      brambleShingles(lobe, r, i, k, seed);
      const a = hash01(k, i, seed + 3) * Math.PI * 2;
      const d = k === 0 ? 0 : 0.45 + 0.35 * hash01(i + k, k, seed + 4);
      lobe.rotateY(hash01(k, i, seed + 5) * Math.PI);
      lobe.translate(sp.x + Math.cos(a) * d, r * 0.62 * 0.8, sp.z + Math.sin(a) * d);
      geoms.push(lobe);
    }
  });
  const m = mergedNoCast(geoms, 0xffffff, 'foliage');
  m.material.vertexColors = true;
  // the leaf cards are seen from both sides (the closed lobes never are)
  m.material.side = THREE.DoubleSide;
  // polish-bushes: and lit by their built normals on both, so a card seen
  // from behind doesn't go black (dressing.js bothSidesLit)
  bothSidesLit(m.material);
  return m;
}

// Heather: a Group of two merged meshes. Each spot is two low dark-green
// cushions (the second shoved 0.3-0.5 m to one side) bristling with pink
// flower spikes that lean away from a cat walking through (render/rustle.js).
// Under half a metre, no collider (a cat pushes through, as through any bed),
// and out of the caster sweep like the other beds.
//
// It used to be the cushions alone, in purple, and from the path they looked
// exactly like pink rocks a cat could walk through. The cushions are still
// made on the real Math.random, one geometry each in the same order, so the
// Moor's pinned build draw count and the flat trace do not move; the spikes,
// their material and the Group are made under withLocalUuids.
export const HEATHER_BASE = 0x3f4a2e;
const HEATHER_STEM = 0x46532f;
const HEATHER_SPIKE_ROOT = 0x8e4f8e;
const HEATHER_SPIKE_TIP = 0xe39ad6;
const HEATHER_SPIKES_PER_CUSHION = 6;
// A cushion sits on the ground, so the faces that point down into it are never
// seen: keep only faces whose normal is not clearly downward. Swaps the
// attributes on the same geometry (BufferAttribute has no uuid).
function dropDownFaces(g) {
  const keep = [];
  const ny = g.attributes.normal;
  for (let f = 0; f < ny.count; f += 3) {
    if ((ny.getY(f) + ny.getY(f + 1) + ny.getY(f + 2)) / 3 >= -0.3) keep.push(f);
  }
  for (const name of ['position', 'normal', 'uv']) {
    const a = g.attributes[name];
    if (!a) continue;
    const out = new Float32Array(keep.length * 3 * a.itemSize);
    let o = 0;
    for (const f of keep) for (let v = 0; v < 3; v++) for (let c = 0; c < a.itemSize; c++) out[o++] = a.array[(f + v) * a.itemSize + c];
    g.setAttribute(name, new THREE.BufferAttribute(out, a.itemSize));
  }
  g.boundingBox = null;
  g.boundingSphere = null;
}
export function heatherBed(spots, seed) {
  const geoms = [];
  const cushions = [];
  spots.forEach((sp, i) => {
    for (let k = 0; k < 2; k++) {
      const r = 0.35 + 0.2 * hash01(i, k, seed + 1);
      const cushion = new THREE.IcosahedronGeometry(r, 0);
      cushion.scale(1, 0.22, 1);
      cushion.computeBoundingBox();
      // sat on the ground: its lowest point at y 0
      const top = cushion.boundingBox.max.y - cushion.boundingBox.min.y;
      cushion.translate(0, -cushion.boundingBox.min.y, 0);
      dropDownFaces(cushion);
      const a = hash01(k, i, seed + 2) * Math.PI * 2;
      const d = k === 0 ? 0 : 0.3 + 0.2 * hash01(i, k, seed + 3);
      const cx = sp.x + Math.cos(a) * d;
      const cz = sp.z + Math.sin(a) * d;
      cushion.translate(cx, 0, cz);
      geoms.push(cushion);
      cushions.push({ i, k, r, top, cx, cz });
    }
  });
  const base = mergedNoCast(geoms, HEATHER_BASE, 'foliage');
  base.name = 'heatherBase';
  return withLocalUuids(`heather-uuids-${seed}`, () => {
    const spikes = heatherSpikes(cushions, seed);
    const g = new THREE.Group();
    g.add(base, spikes);
    return g;
  });
}

function heatherSpikes(cushions, seed) {
  const geoms = [];
  const stem = new THREE.Color(HEATHER_STEM);
  const root = new THREE.Color(HEATHER_SPIKE_ROOT);
  const tip = new THREE.Color(HEATHER_SPIKE_TIP);
  const c = new THREE.Color();
  for (const { i, k, r, top, cx, cz } of cushions) {
    for (let s = 0; s < HEATHER_SPIKES_PER_CUSHION; s++) {
      const h = 0.22 + 0.14 * hash01(i * 7 + s, k, seed + 11);
      const a = hash01(s, i * 3 + k, seed + 12) * Math.PI * 2;
      const dr = 0.8 * r * Math.sqrt(hash01(i + s, k * 5 + s, seed + 13));
      // Rooted a little inside the cushion's dome, so no stalk floats.
      const y0 = 0.7 * top * (1 - (dr / r) ** 2);
      const cone = new THREE.ConeGeometry(0.08, h, 3, 1, true);
      cone.translate(0, h / 2, 0);
      const lean = new Float32Array(cone.attributes.position.count);
      const col = new Float32Array(cone.attributes.position.count * 3);
      const shade = 0.85 + 0.3 * hash01(s, i, seed + 14);
      for (let v = 0; v < lean.length; v++) {
        const f = cone.attributes.position.getY(v) / h;
        lean[v] = f;
        // a green stem for the bottom third, then the flowers, purple to pink
        if (f < 0.3) c.copy(stem);
        else c.copy(root).lerp(tip, (f - 0.3) / 0.7).multiplyScalar(shade);
        col[v * 3] = c.r; col[v * 3 + 1] = c.g; col[v * 3 + 2] = c.b;
      }
      cone.setAttribute('aLean', new THREE.BufferAttribute(lean, 1));
      cone.setAttribute('color', new THREE.BufferAttribute(col, 3));
      // splayed outward a little, like a real clump
      cone.rotateZ((hash01(i, s, seed + 15) - 0.5) * 0.5);
      cone.rotateY(a);
      cone.translate(cx + Math.cos(a) * dr, y0, cz + Math.sin(a) * dr);
      geoms.push(cone);
    }
  }
  const geo = geoms.length === 0 ? new THREE.BufferGeometry() : mergeGeometries(geoms, false);
  for (const g of geoms) g.dispose();
  if (!geo.attributes.aLean) geo.setAttribute('aLean', new THREE.BufferAttribute(new Float32Array(0), 1));
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  const rustle = makeRustleMaterial(mat);
  const m = new THREE.Mesh(geo, mat);
  m.name = 'heatherBloom';
  m.castShadow = false;
  m.userData.noCast = true;
  m.userData.rustle = rustle;
  return m;
}

// Gorse: brambleBed's huddle of squashed lobes, plus a second merged mesh of
// yellow flowers on the upper half of each lobe. Two meshes because the
// flowers want their own (brighter, matte) material. A bed a cat pushes
// through (no collider), under 0.95 m, out of the caster sweep.
//
// polish-shrubs: the lobes were flat-shaded icosahedra in one flat green and
// the flowers yellow icosahedron "crystals", so a bed read as green rocks
// set with gems. Now each lobe takes brambleBed's recipe (corners nudged in
// and out, keyed on the corner so the lobe stays closed; normals pulled most
// of the way round; vertex colours from a dark foot to a lit top, with a
// mottle) in gorse's darker, bluer green, and the flowers are many small
// pale-butter three-sided pyramids (3 triangles each, no base) instead of 20-
// triangle gems: GORSE_FLOWERS a lobe, in the same TWO geometries a lobe as
// before, so the Moor's uuid draws (and its pinned build count) do not move.
const GORSE_SOFT = 0.85;
const GORSE_LOW = new THREE.Color(0x283d27).toArray();
const GORSE_TOP = new THREE.Color(0x4f6a3a).toArray();
const GORSE_BLOOM = 0xf2d65a;
const GORSE_FLOWER_R = 0.05;
const GORSE_FLOWERS = 8; // per lobe, split over its two flower geometries
export function gorseBed(spots, seed) {
  const lobes = [];
  const flecks = [];
  const bloomLow = new THREE.Color(0xd9b84a);
  const bloomTop = new THREE.Color(GORSE_BLOOM);
  const fc = new THREE.Color();
  spots.forEach((sp, i) => {
    const count = 3 + Math.floor(hash01(sp.x, sp.z, seed + 1) * 2);
    for (let k = 0; k < count; k++) {
      const r = 0.4 + 0.2 * hash01(i, k, seed + 2);
      const a = hash01(k, i, seed + 3) * Math.PI * 2;
      const d = k === 0 ? 0 : 0.4 + 0.3 * hash01(i + k, k, seed + 4);
      const cx = sp.x + Math.cos(a) * d;
      const cy = r * 0.62 * 0.8;
      const cz = sp.z + Math.sin(a) * d;
      const lobe = new THREE.IcosahedronGeometry(r, 0);
      // corners in and out by up to 11% (keyed on the corner: the copies of
      // one corner move together, so no crack opens)
      const pos = lobe.attributes.position;
      for (let v = 0; v < pos.count; v++) {
        const px = pos.getX(v), py = pos.getY(v), pz = pos.getZ(v);
        const j = 0.9 + 0.2 * hash01(Math.round(px * 1000) + i * 7, Math.round(pz * 1000) + Math.round(py * 1000) * 3, seed + 21 + k);
        pos.setXYZ(v, px * j, py * j, pz * j);
      }
      lobe.scale(1, 0.62, 1);
      lobe.computeVertexNormals();
      softenFoliageNormals(lobe, GORSE_SOFT, 1);
      const shade = 0.88 + 0.22 * hash01(i, k, seed + 26);
      const top = r * 0.62;
      const col = new Float32Array(pos.count * 3);
      for (let v = 0; v < pos.count; v++) {
        const t = smoothstep(-top * 0.7, top * 0.9, pos.getY(v));
        const f = Math.floor(v / 3);
        // mostly per corner (keyed on it, so the colour runs smooth across a
        // facet), a faint step per facet
        const mottle = (0.96 + 0.08 * hash01(i * 31 + f, k, seed + 27))
          * (0.8 + 0.34 * hash01(Math.round(pos.getX(v) * 1000) + i * 7, Math.round(pos.getZ(v) * 1000) + Math.round(pos.getY(v) * 1000) * 3, seed + 28 + k));
        for (let c = 0; c < 3; c++) col[v * 3 + c] = (GORSE_LOW[c] + (GORSE_TOP[c] - GORSE_LOW[c]) * t) * shade * mottle;
      }
      lobe.setAttribute('color', new THREE.BufferAttribute(col, 3));
      // a fringe of narrow spines breaks the lobe's outline (+14 triangles)
      brambleLeaves(lobe, r, i, k, seed + 50, { leaf: GORSE_SPINE, width: 0.22 });
      lobe.rotateY(hash01(k, i, seed + 5) * Math.PI);
      lobe.translate(cx, cy, cz);
      lobes.push(lobe);
      // the flowers: two geometries a lobe (as the two flecks were), each
      // holding half the lobe's pyramids, sat just proud of its upper half
      for (let f = 0; f < 2; f++) {
        const fpos = [], fcol = [];
        for (let q = 0; q < GORSE_FLOWERS / 2; q++) {
          const u = f * GORSE_FLOWERS + q * 2;
          const fa = hash01(k + u, i, seed + 6 + f) * Math.PI * 2;
          const el = 0.6 + 0.7 * hash01(i, k + u, seed + 8 + f); // upper half only
          const rr = GORSE_FLOWER_R * (0.75 + 0.5 * hash01(i + u, k, seed + 30));
          const ox = cx + Math.cos(fa) * Math.cos(el) * r * 0.97;
          const oy = cy + Math.sin(el) * r * 0.62 * 0.97;
          const oz = cz + Math.sin(fa) * Math.cos(el) * r * 0.97;
          // a tiny three-sided pyramid pointing out of the lobe
          const nx = Math.cos(fa) * Math.cos(el), ny = Math.sin(el) * 1.6, nz = Math.sin(fa) * Math.cos(el);
          const nl = Math.hypot(nx, ny, nz);
          const apex = [ox + nx / nl * rr * 1.3, oy + ny / nl * rr * 1.3, oz + nz / nl * rr * 1.3];
          const spin = hash01(u, i * 3 + k, seed + 31) * Math.PI * 2;
          const base = [0, 1, 2].map((m) => {
            const b = spin + (m / 3) * Math.PI * 2;
            return [ox + Math.cos(b) * rr, oy - 0.3 * rr, oz + Math.sin(b) * rr];
          });
          fc.copy(bloomLow).lerp(bloomTop, 0.5 + 0.5 * hash01(u, k, seed + 32 + i));
          for (let m = 0; m < 3; m++) {
            const b0 = base[m], b1 = base[(m + 1) % 3];
            fpos.push(...b0, ...b1, ...apex);
            // the base a shade deeper than the tip
            fcol.push(fc.r * 0.85, fc.g * 0.85, fc.b * 0.85, fc.r * 0.85, fc.g * 0.85, fc.b * 0.85, fc.r, fc.g, fc.b);
          }
        }
        const fleck = new THREE.BufferGeometry();
        fleck.setAttribute('position', new THREE.Float32BufferAttribute(fpos, 3));
        fleck.setAttribute('color', new THREE.Float32BufferAttribute(fcol, 3));
        fleck.computeVertexNormals();
        flecks.push(fleck);
      }
    }
  });
  const g = new THREE.Group();
  const gorse = mergedNoCast(lobes, 0xffffff, 'foliage');
  gorse.material.vertexColors = true;
  gorse.material.side = THREE.DoubleSide; // the spines, from both sides
  gorse.name = 'gorse';
  const bloom = mergedNoCast(flecks, 0xffffff, 'foliage');
  bloom.material.vertexColors = true;
  // matte, so a low sun never blooms the flowers into a white blob
  bloom.material.roughness = 1;
  bloom.name = 'gorseBloom';
  g.add(gorse, bloom);
  return g;
}

// A weeping willow: tree()'s trunk, a lower, wider crown, and one merged
// curtain of thin strands hanging from the crown's rim. The curtain stops at
// `curtainFloor` (local y) and never lower, so a cat walks under a willow and
// the chase camera can see in; the Old Willow passes a higher floor so the
// camera sees under it to the golden mouse. Strand placement comes from
// hash01, never Math.random, so every client builds the same tree. No collider
// here; the area declares one, as for tree().
const WILLOW_STRANDS = 18;
export function willow(x, z, scale = 1, { wind, curtainFloor = 1.2 } = {}) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 2, TRUNK_SIDES),
    surfMat(0x7a5230, 'bark'));
  trunk.position.y = 1;
  g.add(trunk);
  const crown = new THREE.Mesh(
    blobGeometry(x, z, 1.6, { lobes: 2, saltBase: 40 }),
    surfMat(organicTint(0x7fa04a, x, z, 10), 'foliage'),
  );
  crown.position.y = 2.8;
  crown.scale.y = 0.75;
  crown.rotation.y = hash01(x, z, 31) * Math.PI * 2;
  g.add(crown);
  const strands = [];
  for (let i = 0; i < WILLOW_STRANDS; i++) {
    // evenly spaced round the rim, each nudged so the ring is not a fence
    const a = ((i + hash01(x, z, 50 + i) * 0.8) / WILLOW_STRANDS) * Math.PI * 2;
    const rad = 1.35 + 0.2 * hash01(z, x, 70 + i);
    const top = 2.9;
    const bottom = Math.min(top - 0.1, Math.max(curtainFloor, top - (0.9 + 1.0 * hash01(x + i, z, 90))));
    const len = top - bottom;
    const strand = new THREE.BoxGeometry(0.06, len, 0.06);
    strand.translate(Math.cos(a) * rad, bottom + len / 2, Math.sin(a) * rad);
    strands.push(strand);
  }
  const curtain = new THREE.Mesh(mergeGeometries(strands, false), surfMat(0x8aaa52, 'foliage'));
  for (const p of strands) p.dispose();
  curtain.name = 'willowCurtain';
  g.add(curtain);
  g.scale.setScalar(scale);
  g.position.set(x, 0, z);
  g.userData.canopy = { y: crown.position.y, r: 1.6 };
  g.userData.occluder = willowOccluder(curtainFloor);
  if (wind) wind.add(g, { sizeHint: scale, amplitude: swayFor(scale) });
  return g;
}

// A pine's shape, shared by `pine` and `pineStand` so the two can never drift
// apart: trunk radii, length and centre height, then each cone's
// [radius, height, centre height]. Exported (frozen) so test/pines.test.js can
// rebuild a pine's solid shape and keep the chase camera out of it.
export const PINE_TRUNK = Object.freeze({ rTop: 0.18, rBottom: 0.26, h: 1.6, y: 0.8 });
export const PINE_CONES = Object.freeze([[1.3, 1.8, 2.0], [1.0, 1.6, 2.9], [0.65, 1.3, 3.7]].map((c) => Object.freeze(c)));
// A pine's occluder shapes (see TREE_OCCLUDER): the trunk, and each cone as
// two stacked cylinders, its full radius over its lower half and half of it
// over the upper half, which holds the cone and wastes little round its tip.
export const PINE_OCCLUDER = Object.freeze([
  Object.freeze({ t: 'cyl', r: PINE_TRUNK.rBottom, y0: PINE_TRUNK.y - PINE_TRUNK.h / 2, y1: PINE_TRUNK.y + PINE_TRUNK.h / 2 }),
  ...PINE_CONES.flatMap(([r, h, y]) => [
    Object.freeze({ t: 'cyl', r, y0: y - h / 2, y1: y }),
    Object.freeze({ t: 'cyl', r: r / 2, y0: y, y1: y + h / 2 }),
  ]),
]);
const PINE_TRUNK_COLOR = 0x7a5230;
const PINE_FOLIAGE_COLOR = 0x2f5a3a;
const PINE_TRUNK_SIDES = 6;
// Hem points per bough tier, bottom to top (the long drooping points and the
// short raised notches alternate, so each is even). One tier is 2 x sides
// triangles: its top skirt and its underside.
const PINE_CONE_SIDES = Object.freeze([10, 10, 8, 8, 6]);
// The five bough tiers inside the three PINE_CONES (unleaned, scale 1): the
// height of the long points' hem, their radius, and the tier's apex. A long
// point never sits below its cone's foot (under it the solid is only the
// trunk) and never wider than the cone at its height, less a margin for the
// lean. Tiers 0 and 2 hang from the feet of cones 0 and 1, tier 4 from cone
// 2's and runs up to the tip; 1 and 3 hang half way up the cone below.
const PINE_TIERS = [
  { hemY: 1.12, r: 1.22, apexY: 2.15 },
  { hemY: 1.55, r: 0.92, apexY: 2.6 },
  { hemY: 2.12, r: 0.93, apexY: 3.0 },
  { hemY: 2.6, r: 0.64, apexY: 3.45 },
  { hemY: 3.07, r: 0.59, apexY: 4.3 },
];

// One pine's unplaced geometry: the trunk and the bough tiers packed into
// three "cones" (tiers 0+1, 2+3, 4), built in one place for `pine` and
// `pineStand`. Hand-built and indexed with a `color` attribute (a multiplier
// on the material's colour), like beachClumpGeometry, so it is EXACTLY four
// BufferGeometries and nothing else uuid-bearing (the area builds' Math.random
// draws are pinned, test/waterlooks.test.js). Every pine has the same vertex
// and index counts whatever its hash: a stand's fade (src/treefade.js) cuts
// its index into one equal range per tree. All drift comes from hash01 of the
// tree's (x, z): a small lean (a shear, so nothing dips under the ground; the
// tip moves at most 0.1, inside test/pines.test.js's pine solid), a tint, the
// tiers' size and twist, and each facet's shade.
function pineParts(x = 0, z = 0) {
  const H = (s) => hash01(x, z, s);
  const part = () => {
    const pos = [], col = [], idx = [];
    return {
      v(px, py, pz, [cr, cg, cb]) {
        pos.push(px, py, pz);
        col.push(cr, cg, cb);
        return pos.length / 3 - 1;
      },
      tri(a, b, d) { idx.push(a, b, d); },
      geo() {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
        g.setIndex(idx);
        g.computeVertexNormals();
        return g;
      },
    };
  };
  // the lean: the tip moves 0.05-0.1 m one way, growing with height squared
  const leanA = H(2101) * Math.PI * 2;
  const lean = 0.05 + 0.05 * H(2102);
  const lx = Math.cos(leanA) * lean, lz = Math.sin(leanA) * lean;
  const TOP = PINE_TIERS[PINE_TIERS.length - 1].apexY;
  const at = (px, py, pz) => {
    const k = (py / TOP) * (py / TOP);
    return [px + lx * k, py, pz + lz * k];
  };
  // the tint: hue +-4 degrees and lightness +-0.04 on the material's green,
  // carried as a multiplier so a stand's one material serves every tree
  const base = new THREE.Color(PINE_FOLIAGE_COLOR);
  const tinted = base.clone().offsetHSL((H(2103) - 0.5) * (8 / 360), 0, (H(2104) - 0.5) * 0.08);
  const tint = [tinted.r / base.r, tinted.g / base.g, tinted.b / base.b];
  const shade = (s, [r, g, b] = [1, 1, 1]) => [s * r * tint[0], s * g * tint[1], s * b * tint[2]];
  // tips go a little yellow-green
  const TIP = [1.1, 1.0, 0.72];

  // The trunk: four rings of PINE_TRUNK_SIDES, the bottom one a root flare.
  // The fight camera's PINE_OCCLUDER holds the trunk as one rBottom-wide
  // cylinder, and test/fightcam.test.js wants every vertex inside it, so the
  // flare is made by a slimmer stem rather than wider roots: alternate roots
  // reach rBottom and 0.9 x it at the ground, the stem is 0.77 x rBottom by
  // 0.3 m (1.3 x thinner than the foot) and rTop at the trunk's top. Darker
  // at the foot. No caps: the foot is in the ground and the top in the boughs.
  const T = part();
  const S = PINE_TRUNK_SIDES;
  const top = PINE_TRUNK.y + PINE_TRUNK.h / 2;
  const stem = PINE_TRUNK.rBottom / 1.3;
  const rings = [
    { y: 0, r: (i) => PINE_TRUNK.rBottom * (i % 2 === 0 ? 1 : 0.9), s: 0.62 },
    { y: 0.12, r: (i) => stem * (i % 2 === 0 ? 1.1 : 1.04), s: 0.74 },
    { y: 0.3, r: () => stem, s: 0.86 },
    { y: top, r: () => PINE_TRUNK.rTop, s: 1.06 },
  ];
  const turn = H(2105) * Math.PI * 2;
  rings.forEach((ring, k) => {
    for (let i = 0; i < S; i++) {
      const a = turn + (i / S) * Math.PI * 2;
      const r = ring.r(i);
      const s = ring.s * (0.93 + 0.14 * H(2110 + k * 13 + i));
      T.v(...at(Math.cos(a) * r, ring.y, Math.sin(a) * r), [s, s, s]);
    }
  });
  for (let k = 0; k < rings.length - 1; k++) {
    for (let i = 0; i < S; i++) {
      const j = (i + 1) % S;
      const a = k * S + i, b = k * S + j, c = (k + 1) * S + i, d = (k + 1) * S + j;
      T.tri(a, c, b);
      T.tri(b, c, d);
    }
  }

  // The boughs. Each tier is a skirt from its apex out to a hem whose points
  // alternate long and low (the drooping bough tips, lit and yellow-green)
  // with short raised notches, so the outline is ragged; under it a shallow
  // dark underside up to the axis, so each tier shows a shadowed shelf over
  // the one below. Every facet has its own vertices (flat, each its own
  // shade), like the broadleaf canopies.
  const groups = [part(), part(), part()];
  const packing = [0, 0, 1, 1, 2];
  const size = 0.94 + 0.06 * H(2106);
  PINE_TIERS.forEach((tier, k) => {
    const P = groups[packing[k]];
    const M = PINE_CONE_SIDES[k];
    const twist = H(2120 + k) * Math.PI * 2;
    const lift = 0.9 + 0.04 * k; // lower tiers sit in more shade
    const r = tier.r * size;
    const rise = 0.16 + 0.06 * (r / 1.22);
    const hem = [];
    for (let i = 0; i < M; i++) {
      const a = twist + ((i + 0.3 * (H(2130 + k * 17 + i) - 0.5)) / M) * Math.PI * 2;
      const long = i % 2 === 0;
      const rr = r * (long ? 0.93 + 0.07 * H(2140 + k * 17 + i) : 0.62 + 0.1 * H(2150 + k * 17 + i));
      const yy = tier.hemY + (long ? 0.04 * H(2160 + k * 17 + i) : rise);
      hem.push({ x: Math.cos(a) * rr, y: yy, z: Math.sin(a) * rr, long });
    }
    const apex = at(0, tier.apexY, 0);
    const underY = tier.hemY + rise + 0.09 * (tier.apexY - tier.hemY);
    const under = at(0, underY, 0);
    for (let i = 0; i < M; i++) {
      const p = hem[i], q = hem[(i + 1) % M];
      const pp = at(p.x, p.y, p.z), qq = at(q.x, q.y, q.z);
      const f = lift * (0.92 + 0.16 * H(2170 + k * 17 + i));
      const hemCol = (h) => (h.long ? shade(1.18 * f, TIP) : shade(0.8 * f));
      // top facet: apex, then the hem walked so it faces out and up
      P.tri(P.v(...apex, shade(0.52 * f)), P.v(...qq, hemCol(q)), P.v(...pp, hemCol(p)));
      // underside facet, facing down
      const g = 0.9 + 0.2 * H(2180 + k * 17 + i);
      P.tri(P.v(...under, shade(0.36 * g)), P.v(...pp, shade((p.long ? 0.52 : 0.46) * g)), P.v(...qq, shade((q.long ? 0.52 : 0.46) * g)));
    }
  });
  return { trunk: T.geo(), cones: groups.map((P) => P.geo()) };
}

// A pine: a short flared bark trunk under five tiers of ragged boughs (see
// pineParts), merged into one foliage mesh. Taller and narrower than an oak
// and it sheds no leaves, so it carries no `canopy` tag. No collider here.
export function pine(x, z, scale = 1, { wind } = {}) {
  const g = new THREE.Group();
  const { trunk: trunkGeo, cones } = pineParts(x, z);
  // this pine's own materials, so turning their vertex colours on (the
  // shading and tint pineParts paints) touches nothing else
  const bark = surfMat(PINE_TRUNK_COLOR, 'bark');
  bark.vertexColors = true;
  const trunk = new THREE.Mesh(trunkGeo, bark);
  g.add(trunk);
  const needles = surfMat(PINE_FOLIAGE_COLOR, 'foliage');
  needles.vertexColors = true;
  const foliage = new THREE.Mesh(mergeGeometries(cones, false), needles);
  for (const c of cones) c.dispose();
  g.add(foliage);
  g.scale.setScalar(scale);
  g.position.set(x, 0, z);
  g.userData.occluder = PINE_OCCLUDER;
  // The crown's radius for the corner map (ui/minimap.js), in the Group's own
  // frame: the bottom cone's. Not `canopy`, which would drop leaves.
  g.userData.mapCrown = PINE_CONES[0][0];
  if (wind) wind.add(g, { sizeHint: scale, amplitude: swayFor(scale) });
  return g;
}

// A stand of pines as two merged meshes, `standTrunks` and `standFoliage`: each
// tree is exactly `pine(x, z, scale)`'s trunk and boughs, scaled, turned
// about y by hash01(x, z, seed) x 2pi and put in place. One stand is two draw
// calls and two shadow casters however many pines it holds, where a swaying
// `pine` is two of each on its own. Dense forest is built this way. Both
// meshes cast (they are tall solids), the stand is still (no wind), and no
// collider is made here. A tree may carry a `y` (default 0), the height its
// foot stands at: the Gorge's stand grows on the 9 m west top.
export function pineStand(trees, seed) {
  const trunks = [];
  const cones = [];
  for (const t of trees) {
    const turn = hash01(t.x, t.z, seed) * Math.PI * 2;
    const place = (geo) => {
      geo.scale(t.scale, t.scale, t.scale);
      geo.rotateY(turn);
      geo.translate(t.x, t.y ?? 0, t.z);
      return geo;
    };
    const parts = pineParts(t.x, t.z);
    trunks.push(place(parts.trunk));
    for (const c of parts.cones) cones.push(place(c));
  }
  const merge = (geoms) => {
    const geo = geoms.length === 0 ? new THREE.BufferGeometry() : mergeGeometries(geoms, false);
    for (const p of geoms) p.dispose();
    return geo;
  };
  const g = new THREE.Group();
  const bark = surfMat(PINE_TRUNK_COLOR, 'bark');
  bark.vertexColors = true;
  const trunkMesh = new THREE.Mesh(merge(trunks), bark);
  trunkMesh.name = 'standTrunks';
  const needles = surfMat(PINE_FOLIAGE_COLOR, 'foliage');
  needles.vertexColors = true;
  const foliageMesh = new THREE.Mesh(merge(cones), needles);
  foliageMesh.name = 'standFoliage';
  trunkMesh.castShadow = true;
  foliageMesh.castShadow = true;
  g.add(trunkMesh, foliageMesh);
  // Each pine's spot for the fight camera (TREE_OCCLUDER): one merged pair
  // cannot be told apart by mesh, so the stand lists its trees.
  // A lifted tree keeps its y here (a stand with none lists exactly what it did).
  g.userData.occluderStand = {
    shapes: PINE_OCCLUDER,
    trees: trees.map(({ x, z, scale, y }) => (y === undefined ? { x, z, scale } : { x, z, scale, y })),
  };
  // And each crown for the corner map (ui/minimap.js), in the stand's frame.
  g.userData.mapCrowns = trees.map(({ x, z, scale }) => ({ x, z, r: PINE_CONES[0][0] * scale }));
  return g;
}

// Lily pads: flat discs with a wedge missing, one merged mesh floating just
// above the water. Thin and wide, so out of the caster sweep like the beds.
export function lilyPads(pads, seed, y = 0.06) {
  const geoms = pads.map((p, i) => {
    const notch = hash01(p.x, p.z, seed + i) * Math.PI * 2;
    const pad = new THREE.CircleGeometry(p.r, 10, notch, Math.PI * 2 - 0.5);
    pad.rotateX(-Math.PI / 2);
    pad.translate(p.x, y, p.z);
    return pad;
  });
  return mergedNoCast(geoms, 0x4f8a3a, 'foliage');
}

// Toadstools, two merged meshes: each spot is a cluster of two to four, within
// 0.3 m of the spot, a pale stem under a red half-dome cap (about 30 triangles
// each). Never taller than 0.3 m, so they dress the ground without hiding a
// cat, and out of the caster sweep like the other low beds.
export function toadstools(spots, seed) {
  const stems = [];
  const caps = [];
  spots.forEach((sp, i) => {
    const n = 2 + Math.floor(hash01(sp.x, sp.z, seed + 1) * 3);
    for (let k = 0; k < n; k++) {
      const h = 0.08 + 0.08 * hash01(i, k, seed + 2);
      const r = 0.07 + 0.05 * hash01(k, i, seed + 3);
      const a = hash01(k, i, seed + 4) * Math.PI * 2;
      const d = 0.3 * hash01(i + k, k, seed + 5);
      const x = sp.x + Math.cos(a) * d;
      const z = sp.z + Math.sin(a) * d;
      const stem = new THREE.CylinderGeometry(0.03, 0.04, h, 5);
      stem.translate(x, h / 2, z);
      stems.push(stem);
      const cap = new THREE.SphereGeometry(r, 6, 2, 0, Math.PI * 2, 0, Math.PI / 2);
      cap.translate(x, h, z);
      caps.push(cap);
    }
  });
  const g = new THREE.Group();
  const stemMesh = mergedNoCast(stems, 0xe8dcc0, 'foliage');
  stemMesh.name = 'toadstoolStems';
  const capMesh = mergedNoCast(caps, 0xc0392b, 'foliage');
  capMesh.name = 'toadstoolCaps';
  g.add(stemMesh, capMesh);
  return g;
}
