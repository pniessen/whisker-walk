import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as b from './builder.js';
import { colorParts, Tris, lin, scale3, unit, lerp3, smoothstep, clamp01, r2 } from './dressing.js';
import { phrase } from '../clanphrases.js';

// =============================================================================
// The Pines' north strip: its landmark, the Great Pine (bigger areas, step 3).
//
// Forty metres more of the forest north of the old edge, z -90..-50 (the strip
// itself, its scatter and its streaming are in pinesstrips.js). Out in it,
// 23 m past the old edge, stands the oldest pine in the forest: twice as tall
// as any other, so a kid sees its crown over the trees from the Lightning
// Stump and walks to it. Its great roots stand out of the needles; the long
// one is a climb of three hops to a seat against the trunk, a mossy hollow
// between two others is a bed, and a little spring wells up under its boughs
// for a drink.
//
// A faint trail leaves the east path at its bend (18, -26), threads between
// the forest's own pines (which do not move for it) and ends at the spring.
//
// This file is a leaf: it reads nothing of pines.js, so pinesstrips.js and
// pines.js may both use its constants at their top level.
// =============================================================================

// The Great Pine: a builder.pine (its trunk, its bough tiers, its sway, its
// shape for the fight camera and the tree fade) at 3.4 times a pine's size,
// 14.6 m to the tip, the lowest boughs 3.8 m up, so a cat walks under them.
export const GREAT_PINE = Object.freeze({ x: 8, z: -73, scale: 3.4 });
// Its collider: the trunk and the foot of the roots (the trunk is 0.88 m
// through at the ground).
const TRUNK_R = 1.25;

// The faint trail, [x1, z1, x2, z2] segments, 1.3 m wide (the River's west
// strip's). It starts on the east path's bend and slips between the core's
// pines (clear of each trunk by more than a cat), out over the old edge and
// up to the spring.
export const NORTH_TRAIL = Object.freeze([
  [18, -26, 14.6, -34], [14.6, -34, 13.4, -43], [13.4, -43, 12.4, -52], [12.4, -52, 10.6, -62.5],
].map((s) => Object.freeze(s)));
export const NORTH_TRAIL_W = 1.3;

// The spring: a round pool of clear water under the boughs, south-east of the
// trunk, shallow enough to wade all over (its deep middle is a hand's width).
export const SPRING = Object.freeze({ id: 'spring-north', kind: 'circle', x: 11.2, z: -66.6, r: 1.5, shallow: 1.0 });
export const SPRING_LOOK = Object.freeze({ y: 0.03, color: 0x5f98a8, foamStrength: 0.18 });

// --- the roots -----------------------------------------------------------------
// Seven roots run out from the trunk, each a ridge that starts a hand under
// the trunk's flare and sinks into the needles. The long one (index 0) heads
// south-east toward the trail and is the climb: its top is LONG_TOP(d) at d
// metres from the trunk's middle. The others are short and low.
const ROOT_YAWS = [2.25, 0.35, 1.25, 3.3, 4.15, 5.0, 5.8]; // radians, x = cos, z = sin
const LONG = Object.freeze({ len: 4.6, top: 1.5, w: 0.5 });
const longTop = (d) => LONG.top * Math.pow(clamp01(1 - (d - 0.9) / (LONG.len - 0.9)), 0.9);
const rootDir = (i) => ({ x: Math.cos(ROOT_YAWS[i]), z: Math.sin(ROOT_YAWS[i]) });
const at = (i, d) => ({ x: r2(GREAT_PINE.x + rootDir(i).x * d), z: r2(GREAT_PINE.z + rootDir(i).z * d) });

// The climb: three perches up the long root, each higher than the last and
// within a hop of it, the top one a seat against the trunk with the forest
// below (the lookout). Each over the root's own collider.
const STEPS = [3.4, 2.4, 1.45];
export const NORTH_PERCHES = Object.freeze(STEPS.map((d, i) => {
  const p = { ...at(0, d), y: r2(longTop(d)), kind: 'tree' };
  if (i === STEPS.length - 1) {
    Object.defineProperty(p, 'label', { enumerable: true, get() { return phrase('pines.north.lookout'); } });
    p.vantage = true;
  }
  return Object.freeze(p);
}));
// The trunk, and a row of circles under the long root (so a cat walks round it
// and hops up onto it, never through it).
export const NORTH_COLLIDERS = Object.freeze([
  Object.freeze({ x: GREAT_PINE.x, z: GREAT_PINE.z, r: TRUNK_R }),
  ...[1.9, 2.6, 3.3, 3.95].map((d) => Object.freeze({ ...at(0, d), r: 0.42 })),
]);

// The two rests: a mossy hollow between two roots on the far side of the
// trunk, and a flat stone at the spring's edge.
const NAP = Object.freeze({ x: r2(GREAT_PINE.x - 1.05), z: r2(GREAT_PINE.z - 1.95) });
const DRINK = Object.freeze({ x: r2(SPRING.x + 0.35), z: r2(SPRING.z + SPRING.r + 0.6) });
export const NORTH_RESTS = Object.freeze([
  Object.freeze({ id: 'pines-nap-1', kind: 'nap', x: NAP.x, z: NAP.z, mesh: false }),
  Object.freeze({ id: 'pines-drink-1', kind: 'drink', x: DRINK.x, z: DRINK.z, mesh: false }),
]);

// The things to find. Labels go through the phrase table (both word sets).
const LOOKOUT = NORTH_PERCHES[NORTH_PERCHES.length - 1];
const find = (id, x, z, say, y) => {
  const c = { id, x, z, ...(y === undefined ? {} : { y }) };
  Object.defineProperty(c, 'label', { enumerable: true, get: say });
  return c;
};
export const NORTH_FIND_SPOTS = Object.freeze([
  Object.freeze([34, -71]), Object.freeze([-10, -84]), Object.freeze([-38.5, -77]),
]);
export function northCollectibles() {
  const [nuts, feather, stone] = NORTH_FIND_SPOTS;
  return [
    find('pines-find-11', LOOKOUT.x, LOOKOUT.z, () => phrase('pines.north.jay'), LOOKOUT.y),
    find('pines-find-12', nuts[0], nuts[1], () => phrase('pines.north.nuts')),
    find('pines-find-13', feather[0], feather[1], () => phrase('pines.north.woodpecker')),
    find('pines-find-14', stone[0], stone[1], () => phrase('pines.north.stone')),
  ];
}
export function northScenics() {
  return [find('pines-great-pine', r2(GREAT_PINE.x + 3.2), r2(GREAT_PINE.z + 3.6), () => phrase('pines.north.scenic'))];
}
// Where nothing of the strip's scatter may stand: the tree and its roots, the
// spring and its stone, the bed, the finds. (x, z, clear radius.)
export const NORTH_KEEP_CLEAR = Object.freeze([
  Object.freeze([GREAT_PINE.x, GREAT_PINE.z, 6.5]),
  Object.freeze([SPRING.x, SPRING.z, SPRING.r + 1.2]),
  Object.freeze([NAP.x, NAP.z, 1.6]), Object.freeze([DRINK.x, DRINK.z, 1.4]),
  ...NORTH_FIND_SPOTS.map(([x, z]) => Object.freeze([x, z, 2.5])),
  Object.freeze([GREAT_PINE.x + 3.2, GREAT_PINE.z + 3.6, 2]),
]);

// --- the mesh ------------------------------------------------------------------
const BARK = lin(0x6a4a2e);
const BARK_PALE = lin(0x8a6a48);
const BARK_DARK = lin(0x4a3422);
const MOSS = lin(0x5f7a32);
const MOSS_LIGHT = lin(0x86a046);
const STONE = lin(0x8f8a80);
const NEEDLES = lin(0x8a5a30);

// One root: a ridge of `n` rings from the trunk outward, each ring a half
// round arch of SIDES points from one flank to the other through the top,
// sunk at the flanks so it grows out of the ground. `top(d)` is its height,
// `half(d)` its half width; mossy along the crown where the light falls.
const SIDES = 6;
function rootRidge(tris, i, { len, top, half, n = 6 }) {
  const dir = rootDir(i);
  const side = { x: -dir.z, z: dir.x };
  const rings = [];
  for (let k = 0; k <= n; k++) {
    const d = 0.75 + ((len - 0.75) * k) / n;
    const h = Math.max(0.02, top(d));
    const w = half(d);
    const wob = 0.12 * Math.sin(d * 1.7 + i) * (d / len);
    const cx = GREAT_PINE.x + dir.x * d + side.x * wob, cz = GREAT_PINE.z + dir.z * d + side.z * wob;
    const pts = [];
    for (let s = 0; s < SIDES; s++) {
      const a = (s / (SIDES - 1)) * Math.PI; // 0 = one flank, pi = the other
      const off = Math.cos(a) * w * (1.05 + 0.1 * b.hash01(i, k * 7 + s, 2201));
      const y = Math.sin(a) * h - 0.04;
      pts.push([cx + side.x * off, y, cz + side.z * off]);
    }
    rings.push(pts);
  }
  const col = (p) => {
    const up = clamp01(p[1] / 1.4);
    const tone = 0.8 + 0.32 * b.hash01(Math.round(p[0] * 3), Math.round(p[2] * 3), 2215);
    const bark = scale3(lerp3(BARK_DARK, lerp3(BARK, BARK_PALE, up), 0.4 + 0.6 * up), tone);
    const moss = smoothstep(0.55, 0.95, up) * (0.3 + 0.7 * b.hash01(Math.round(p[0] * 2), Math.round(p[2] * 2), 2229));
    return lerp3(bark, lerp3(MOSS, MOSS_LIGHT, tone - 0.8), moss * 0.8);
  };
  const tri = (p, q, r) => {
    const ux = q[0] - p[0], uy = q[1] - p[1], uz = q[2] - p[2];
    const vx = r[0] - p[0], vy = r[1] - p[1], vz = r[2] - p[2];
    const nn = unit(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
    tris.v(...p, nn, col(p)); tris.v(...q, nn, col(q)); tris.v(...r, nn, col(r));
  };
  for (let k = 0; k < rings.length - 1; k++) {
    const A = rings[k], B = rings[k + 1];
    for (let s = 0; s < SIDES - 1; s++) {
      tri(A[s], B[s], B[s + 1]);
      tri(A[s], B[s + 1], A[s + 1]);
    }
  }
}

function greatPineRootsGeometry() {
  const tris = new Tris();
  rootRidge(tris, 0, { len: LONG.len, top: longTop, half: (d) => LONG.w * (1 - 0.45 * (d / LONG.len)), n: 10 });
  ROOT_YAWS.forEach((_, i) => {
    if (i === 0) return;
    const len = 1.9 + 0.9 * b.hash01(i, 1, 2243);
    const top0 = 0.55 + 0.35 * b.hash01(i, 2, 2257);
    rootRidge(tris, i, {
      len,
      top: (d) => top0 * Math.pow(clamp01(1 - (d - 0.75) / (len - 0.75)), 1.3),
      half: (d) => (0.36 + 0.1 * b.hash01(i, 3, 2271)) * (1 - 0.5 * (d / len)),
    });
  });
  const parts = [tris.geometry()];
  const add = (g, color) => parts.push(colorParts(g, color));
  // the flare where the roots meet the trunk: a low cone of bark
  const flare = new THREE.CylinderGeometry(0.9, 1.35, 0.9, 12, 1, true);
  flare.translate(GREAT_PINE.x, 0.42, GREAT_PINE.z);
  add(flare, (x, y, z) => scale3(lerp3(BARK_DARK, BARK, clamp01(y / 0.9)), 0.85 + 0.25 * b.hash01(Math.round(x * 4), Math.round(z * 4), 2285)));
  // the mossy hollow to nap in
  const bed = new THREE.CylinderGeometry(0.62, 0.72, 0.08, 10);
  bed.translate(NAP.x, 0.04, NAP.z);
  add(bed, (x, y, z) => scale3(lerp3(MOSS, MOSS_LIGHT, b.hash01(Math.round(x * 6), Math.round(z * 6), 2299)), 0.95));
  // the spring's ring of mossy stones, and the flat one to drink from
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2 + 0.4 * b.hash01(k, 1, 2313);
    const d = SPRING.r + 0.18;
    const x = SPRING.x + Math.cos(a) * d, z = SPRING.z + Math.sin(a) * d;
    if (Math.hypot(x - DRINK.x, z - DRINK.z) < 0.9) continue;
    const g = new THREE.DodecahedronGeometry(0.22 + 0.1 * b.hash01(k, 2, 2327), 0);
    g.scale(1.2, 0.55, 1);
    g.rotateY(a);
    g.translate(x, 0.06, z);
    add(g, (vx, vy, vz) => lerp3(scale3(STONE, 0.8 + 0.25 * b.hash01(Math.round(vx * 8), Math.round(vz * 8), 2341)), MOSS, smoothstep(0.06, 0.16, vy) * 0.6));
  }
  const slab = new THREE.DodecahedronGeometry(0.5, 0);
  slab.scale(1.1, 0.16, 0.8);
  slab.rotateY(0.3);
  slab.translate(DRINK.x, 0.03, DRINK.z - 0.12);
  add(slab, (x, y, z) => scale3(STONE, 0.85 + 0.25 * b.hash01(Math.round(x * 5), Math.round(z * 5), 2355)));
  // a deep drift of old needles round the foot
  const drift = new THREE.CircleGeometry(5.2, 18);
  drift.rotateX(-Math.PI / 2);
  {
    const p = drift.attributes.position;
    for (let v = 0; v < p.count; v++) {
      const x = p.getX(v), z = p.getZ(v);
      const rad = Math.hypot(x, z);
      if (rad < 1e-6) continue;
      const k = 0.82 + 0.3 * b.hash01(Math.round(Math.atan2(z, x) * 3), 1, 2369);
      p.setXYZ(v, x * k, 0.012, z * k);
    }
  }
  drift.translate(GREAT_PINE.x, 0, GREAT_PINE.z);
  add(drift, (x, y, z) => {
    const fade = smoothstep(5.4, 2.0, Math.hypot(x - GREAT_PINE.x, z - GREAT_PINE.z));
    return lerp3(lin(0x56603e), scale3(NEEDLES, 0.85 + 0.25 * b.hash01(Math.round(x * 2), Math.round(z * 2), 2383)), 0.25 + 0.75 * fade);
  });
  const geo = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return geo;
}

/**
 * addGreatPine(scene, { wind }) -> the Group (named 'greatPine'): the tree
 * itself (builder.pine, swaying) and its roots, spring stones, bed and needle
 * drift as one mesh. The caller tags it and adds the colliders and perches.
 */
export function addGreatPine(scene, { wind } = {}) {
  const tree = b.pine(GREAT_PINE.x, GREAT_PINE.z, GREAT_PINE.scale, { wind });
  tree.name = 'greatPine';
  scene.add(tree);
  const roots = new THREE.Mesh(greatPineRootsGeometry(),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, side: THREE.DoubleSide }));
  roots.name = 'greatPineRoots';
  scene.add(roots);
  return { tree, roots };
}
