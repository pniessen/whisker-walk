import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as b from './builder.js';
import { colorParts, lin, scale3, lerp3, smoothstep, r2 } from './dressing.js';
import { phrase } from '../clanphrases.js';

// =============================================================================
// The Pines' west strip: its landmark, the Toadstool Ring (bigger areas, step 3).
//
// Forty metres more of the swamp west of the old edge, x -90..-50 (the strip
// itself, its scatter and its streaming are in pinesstrips.js). Out on a dry
// rise in the outer swamp, by a still bog pool white with bog cotton, a ring
// of big red toadstools stands round an old mossy stump: a fairy ring. A cat
// hops up on the stump, naps on the moss inside the ring and drinks at the
// pool.
//
// A faint trail leaves the swamp path at its first bend (-36, 6), passes
// south of bog-1 and runs out west to the ring.
//
// This file is a leaf: it reads nothing of pines.js.
// =============================================================================

// The ring: twelve toadstools on a circle 5.4 m across, the stump at its middle.
export const RING = Object.freeze({ x: -73, z: 20, r: 2.7 });
const STUMP = Object.freeze({ x: RING.x, z: RING.z, r: 0.48, h: 0.56 });

// The bog pool: still peat water with lily pads, north-west of the ring.
export const BOG_POOL = Object.freeze({ id: 'bog-pool-west', kind: 'circle', x: -80, z: 27.5, r: 3.3, shallow: 1.0 });

// The faint trail, 1.3 m wide. From the swamp path's bend, between bog-1 and
// the mire, out over the old edge to the ring's east side.
export const WEST_TRAIL = Object.freeze([
  [-36, 6, -44, 9.5], [-44, 9.5, -52, 12], [-52, 12, -61, 15.5], [-61, 15.5, -69, 18.6],
].map((s) => Object.freeze(s)));
export const WEST_TRAIL_W = 1.3;

// The stump: a seat one hop up, with a view of the ring round it.
export const WEST_PERCHES = Object.freeze([(() => {
  const p = { x: STUMP.x, z: STUMP.z, y: r2(STUMP.h + 0.02), kind: 'stone' };
  Object.defineProperty(p, 'label', { enumerable: true, get() { return phrase('pines.west.stump'); } });
  p.vantage = true;
  return Object.freeze(p);
})()]);
export const WEST_COLLIDERS = Object.freeze([Object.freeze({ x: STUMP.x, z: STUMP.z, r: STUMP.r })]);

// The two rests: the moss inside the ring, on the stump's south side, and a
// flat stone at the bog pool's south-east edge.
const NAP = Object.freeze({ x: r2(RING.x + 0.35), z: r2(RING.z + 1.45) });
const POOL_EDGE = 0.6;
const DRINK = Object.freeze({
  x: r2(BOG_POOL.x + (BOG_POOL.r + POOL_EDGE) * Math.cos(0.75)),
  z: r2(BOG_POOL.z + (BOG_POOL.r + POOL_EDGE) * Math.sin(0.75)),
});
export const WEST_RESTS = Object.freeze([
  Object.freeze({ id: 'pines-nap-2', kind: 'nap', x: NAP.x, z: NAP.z, mesh: false }),
  Object.freeze({ id: 'pines-drink-2', kind: 'drink', x: DRINK.x, z: DRINK.z, mesh: false }),
]);

const find = (id, x, z, say, y) => {
  const c = { id, x, z, ...(y === undefined ? {} : { y }) };
  Object.defineProperty(c, 'label', { enumerable: true, get: say });
  return c;
};
// The snail shell lies in the ring, the bog myrtle by the far edge, the
// pebble in the deep swamp past the mire, the wren feather in the outer swamp.
export const WEST_FIND_SPOTS = Object.freeze([
  Object.freeze([r2(RING.x - 1.3), r2(RING.z - 0.9)]), Object.freeze([-85, 42]),
  Object.freeze([-72, -36]), Object.freeze([-60, 34]),
]);
export function westCollectibles() {
  const [snail, myrtle, pebble, wren] = WEST_FIND_SPOTS;
  return [
    find('pines-find-15', snail[0], snail[1], () => phrase('pines.west.snail')),
    find('pines-find-16', myrtle[0], myrtle[1], () => phrase('pines.west.myrtle')),
    find('pines-find-17', pebble[0], pebble[1], () => phrase('pines.west.pebble')),
    find('pines-find-18', wren[0], wren[1], () => phrase('pines.west.wren')),
  ];
}
export function westScenics() {
  return [find('pines-toadstool-ring', r2(RING.x + 3.6), r2(RING.z - 1.2), () => phrase('pines.west.scenic'))];
}
export const WEST_KEEP_CLEAR = Object.freeze([
  Object.freeze([RING.x, RING.z, RING.r + 1.4]),
  Object.freeze([DRINK.x, DRINK.z, 1.4]),
  ...WEST_FIND_SPOTS.map(([x, z]) => Object.freeze([x, z, 2.5])),
  Object.freeze([RING.x + 3.6, RING.z - 1.2, 2]),
]);

// --- the mesh ------------------------------------------------------------------
const CAP_RED = lin(0xc0362a);
const CAP_DEEP = lin(0x8a2a22);
const SPOT = lin(0xf2ead8);
const STEM = lin(0xe8dcc0);
const GILLS = lin(0xcab89a);
const BARK = lin(0x5a4430);
const HEART = lin(0x9a7a52);
const MOSS = lin(0x5f7a32);
const MOSS_LIGHT = lin(0x86a046);
const STONE = lin(0x8a8a7a);

// One toadstool: a stem a little thicker at its foot, and a round cap, red
// with pale spots, its underside the pale gills.
function toadstool(add, x, z, h, capR, tilt, salt) {
  const stem = new THREE.CylinderGeometry(capR * 0.26, capR * 0.36, h, 5, 1, true);
  stem.translate(x, h / 2, z);
  add(stem, STEM);
  const cap = new THREE.SphereGeometry(capR, 7, 3, 0, Math.PI * 2, 0, Math.PI / 2);
  cap.scale(1, 0.62, 1);
  cap.rotateX(tilt);
  cap.translate(x, h - capR * 0.08, z);
  add(cap, (vx, vy, vz) => {
    const spot = b.hash01(Math.round(vx * 22), Math.round(vz * 22) + Math.round(vy * 22), salt) > 0.83;
    if (spot) return SPOT;
    return lerp3(CAP_DEEP, CAP_RED, smoothstep(h - capR * 0.1, h + capR * 0.4, vy));
  });
  const gills = new THREE.CircleGeometry(capR * 0.98, 7);
  gills.rotateX(Math.PI / 2);
  gills.rotateX(tilt);
  gills.translate(x, h - capR * 0.09, z);
  add(gills, GILLS);
}

function ringGeometry() {
  const parts = [];
  const add = (g, color) => parts.push(colorParts(g, color));
  // the twelve toadstools, each a little different, leaning out
  const N = 12;
  for (let k = 0; k < N; k++) {
    const a = (k / N) * Math.PI * 2 + 0.18 * (b.hash01(k, 1, 3101) - 0.5);
    const rr = RING.r * (0.94 + 0.12 * b.hash01(k, 2, 3115));
    const x = RING.x + Math.cos(a) * rr, z = RING.z + Math.sin(a) * rr;
    const h = 0.26 + 0.2 * b.hash01(k, 3, 3129);
    const capR = 0.15 + 0.09 * b.hash01(k, 4, 3143);
    toadstool(add, x, z, h, capR, 0.12 * (b.hash01(k, 5, 3157) - 0.3), 3171 + k);
    // a small one at the foot of every other
    if (k % 2 === 0) {
      const a2 = a + 0.13;
      toadstool(add, RING.x + Math.cos(a2) * (rr + 0.32), RING.z + Math.sin(a2) * (rr + 0.32), 0.12, 0.08, 0.2, 3191 + k);
    }
  }
  // the old stump: a squat broken trunk, its top flat and pale, moss down one side
  const stump = new THREE.CylinderGeometry(STUMP.r * 0.92, STUMP.r * 1.18, STUMP.h, 10, 2);
  {
    const p = stump.attributes.position;
    for (let v = 0; v < p.count; v++) {
      const x = p.getX(v), y = p.getY(v), z = p.getZ(v);
      if (y > STUMP.h / 2 - 1e-6 && Math.hypot(x, z) > 1e-6) {
        p.setY(v, y + 0.05 * (b.hash01(Math.round(x * 20), Math.round(z * 20), 3203) - 0.5));
      }
    }
  }
  stump.translate(STUMP.x, STUMP.h / 2, STUMP.z);
  add(stump, (x, y, z) => {
    if (y > STUMP.h - 0.04) return scale3(HEART, 0.9 + 0.15 * b.hash01(Math.round(x * 9), Math.round(z * 9), 3217));
    const moss = smoothstep(0.1, 0.9, (STUMP.x - x) / STUMP.r) * (0.5 + 0.5 * b.hash01(Math.round(y * 6), Math.round(z * 6), 3231));
    return lerp3(scale3(BARK, 0.85 + 0.25 * b.hash01(Math.round(x * 7), Math.round(y * 7), 3245)), MOSS, moss);
  });
  // three stubby roots
  for (let k = 0; k < 3; k++) {
    const a = 0.6 + (k * Math.PI * 2) / 3;
    const g = new THREE.CylinderGeometry(0.05, 0.12, 0.55, 5);
    g.rotateZ(Math.PI / 2 - 0.25);
    g.rotateY(-a);
    g.translate(STUMP.x + Math.cos(a) * (STUMP.r + 0.12), 0.06, STUMP.z + Math.sin(a) * (STUMP.r + 0.12));
    add(g, scale3(BARK, 0.8));
  }
  // the moss carpet inside the ring, and the bed on it
  const carpet = new THREE.CircleGeometry(RING.r * 0.92, 16);
  carpet.rotateX(-Math.PI / 2);
  carpet.translate(RING.x, 0.012, RING.z);
  add(carpet, (x, y, z) => scale3(lerp3(MOSS, MOSS_LIGHT, b.hash01(Math.round(x * 3), Math.round(z * 3), 3259)), 0.8));
  const bed = new THREE.CylinderGeometry(0.55, 0.64, 0.07, 9);
  bed.translate(NAP.x, 0.035, NAP.z);
  add(bed, (x, y, z) => scale3(lerp3(MOSS, MOSS_LIGHT, 0.4 + 0.6 * b.hash01(Math.round(x * 6), Math.round(z * 6), 3273)), 1));
  // the flat stone to drink from
  const slab = new THREE.DodecahedronGeometry(0.5, 0);
  slab.scale(1.1, 0.16, 0.8);
  slab.rotateY(-0.75);
  slab.translate(DRINK.x, 0.03, DRINK.z);
  add(slab, (x, y, z) => scale3(STONE, 0.85 + 0.25 * b.hash01(Math.round(x * 5), Math.round(z * 5), 3287)));
  const geo = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return geo;
}

/**
 * addToadstoolRing(scene) -> the ring's one mesh (named 'toadstoolRing'):
 * the toadstools, the stump, the moss, the bed and the drinking stone.
 */
export function addToadstoolRing(scene) {
  const mesh = new THREE.Mesh(ringGeometry(),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, side: THREE.DoubleSide }));
  mesh.name = 'toadstoolRing';
  scene.add(mesh);
  return mesh;
}

