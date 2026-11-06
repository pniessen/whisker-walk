import * as THREE from 'three';
import * as b from './builder.js';
import { litMaterial, surfaceProps } from '../render/materials.js';

// The lake's island and its bridge, written once. They are one place seen from
// four maps (the Woods, the River, the Moor and the Pines), so each map reads
// them from here instead of keeping its own copy that could drift; and
// test/lake.test.js checks every map draws them in the same spot.
//
// Everything is kept in Woods coordinates and moved into a map's own frame by
// FRAMES: a map's point is the Woods' point plus its offset.

export const FRAMES = Object.freeze({
  woods: Object.freeze([0, 0]),
  river: Object.freeze([100, 0]),
  moor: Object.freeze([0, 100]),
  pines: Object.freeze([100, 100]),
});

export function fromWoods(areaId, x, z) {
  const [dx, dz] = FRAMES[areaId];
  return { x: x + dx, z: z + dz };
}

// The island: a low grassy mound 26 m across with one big tree on its crown.
export const ISLAND_WOODS = Object.freeze({ x: -72, z: -72, r: 13, rise: 1.4, treeScale: 2.6 });

export function fromWoodsDisc(areaId) {
  const { x, z } = fromWoods(areaId, ISLAND_WOODS.x, ISLAND_WOODS.z);
  return Object.freeze({ x, z, r: ISLAND_WOODS.r, rise: ISLAND_WOODS.rise });
}

// The bridge's span over the water: from 0.6 m onto the island to the Pines'
// shore foot, 0.2 m onto land.
export const ISLAND_BRIDGE_WOODS = Object.freeze([
  Object.freeze([-79.44, -81.92]), Object.freeze([-89.4, -95.2]),
]);

// The plank sits just above the water and runs `landRun` past the foot onto
// the Pines' land, so the deck the cat walks on can reach dry ground past the
// water margin and the kids still see boards under it.
export const BRIDGE_PLANK = Object.freeze({ w: 2, thick: 0.12, y: 0.06, landRun: 1.0 });

// The island end and the land end of the plank, in this map's frame.
export function bridgeEnds(areaId) {
  const [[ix, iz], [fx, fz]] = ISLAND_BRIDGE_WOODS;
  const run = BRIDGE_PLANK.landRun / Math.hypot(fx - ix, fz - iz);
  return Object.freeze([
    Object.freeze(fromWoods(areaId, ix, iz)),
    Object.freeze(fromWoods(areaId, fx + (fx - ix) * run, fz + (fz - iz) * run)),
  ]);
}

// Where a neighbour's horizon band must stay at the waterline (builder's
// horizonBand `keepLow`): the island with a few metres to spare, and the
// bridge's span, so the far hills never bury either.
export function islandKeepLow(areaId) {
  const isl = fromWoodsDisc(areaId);
  const [a, c] = bridgeEnds(areaId);
  return Object.freeze([
    Object.freeze({ x1: isl.x, z1: isl.z, r: isl.r + 1 }),
    Object.freeze({ x1: a.x, z1: a.z, x2: c.x, z2: c.z, r: 2 }),
  ]);
}

export function islandBridgePlank(areaId) {
  const [island, land] = bridgeEnds(areaId);
  const P = BRIDGE_PLANK;
  const plank = b.plankBridge(land.x, land.z, island.x, island.z, P.w, P.y, P.thick);
  plank.name = 'islandBridge';
  return plank;
}

// The island as a neighbour sees it across the water: the mound, the tree and
// the plank, each added straight to the scene so a test can find what stands
// at the island's centre.
export function addIslandView(scene, areaId, { wind } = {}) {
  const I = fromWoodsDisc(areaId);
  // A flattened sphere, so only a low dome shows above the lake.
  const mound = new THREE.Mesh(
    new THREE.SphereGeometry(I.r, 24, 8),
    litMaterial(0x6a9a50, surfaceProps('grass')),
  );
  mound.scale.y = I.rise / I.r;
  mound.position.set(I.x, 0, I.z);
  scene.add(mound);
  // The island's Old Ash seen from next door: the round crown island.js
  // gives it, not whatever this area's (x, z) would hash to.
  const tree = b.tree(I.x, I.z, ISLAND_WOODS.treeScale, { wind, kind: 'round' });
  tree.position.y = I.rise - 0.2;
  scene.add(tree);
  scene.add(islandBridgePlank(areaId));
}
