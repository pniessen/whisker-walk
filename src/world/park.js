import * as THREE from 'three';
import * as b from './builder.js';
import { litMaterial } from '../render/materials.js';

export function build(scene) {
  b.applySky(scene, 0xaee0d0, 0xd8f0e0);
  scene.add(b.ground(120, 0x6cb058));

  const colliders = [];
  const addC = (x, z, r) => colliders.push({ x, z, r });

  // winding path: south gate → fountain → pond → north meadow
  scene.add(b.path(0, 48, 0, 20, 3));
  scene.add(b.path(0, 20, -14, 6, 3));
  scene.add(b.path(-14, 6, -8, -18, 3));
  scene.add(b.path(-8, -18, 12, -30, 3));
  scene.add(b.path(0, 20, 16, 10, 3));

  // fountain at the path junction
  const fountain = new THREE.Group();
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.6, 0.6, 12),
    litMaterial(0xb8b8c0));
  basin.position.y = 0.3;
  fountain.add(basin);
  const water = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 0.1, 12),
    litMaterial(0x8ab8d8));
  water.position.y = 0.62;
  fountain.add(water);
  const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 1.4, 8),
    litMaterial(0xb8b8c0));
  spire.position.y = 1.2;
  fountain.add(spire);
  fountain.position.set(0, 0, 20);
  scene.add(fountain);
  addC(0, 20, 3);

  // pond (duck home)
  const pond = new THREE.Mesh(new THREE.CircleGeometry(7, 20),
    litMaterial(0x7ab0d8));
  pond.rotation.x = -Math.PI / 2;
  pond.position.set(-14, 0.02, 2);
  scene.add(pond);

  // big trees ring the lawns
  const treeSpots = [[-24, 30], [-30, 10], [-26, -14], [-16, -34], [8, -38], [22, -22],
    [28, 0], [24, 24], [12, 36], [-6, 34], [6, -8], [16, -6]];
  for (const [x, z] of treeSpots) {
    scene.add(b.tree(x, z, 1.2 + ((x + z) % 4) * 0.15));
    addC(x, z, 0.7);
  }
  for (const [x, z] of [[-10, 26], [10, 18], [-20, -6], [4, -24]]) scene.add(b.bush(x, z));

  // extra trees in the far lawn corners (with colliders) + leaves beneath three of them
  const scatterTrees = [[-40, -40], [40, 40], [-40, 40], [40, -40]];
  for (const [x, z] of scatterTrees) {
    scene.add(b.tree(x, z, 1.1));
    addC(x, z, 0.6);
  }
  for (const [x, z, seed] of [[-40, -40, 1], [40, 40, 2], [40, -40, 3]]) scene.add(b.leafLitter(x, z, seed));
  for (const [x, z] of [[-35, -20], [35, 20], [-35, 35], [35, -30]]) scene.add(b.bush(x, z));
  for (const [x, z] of [[-40, 10], [40, -10]]) scene.add(b.flowerPatch(x, z));
  // an oak beside the bench — its branch is the second step of a short
  // climb chain (bench -> branch), 1.98 horizontally and 1.52 vertically
  // from the bench, both inside the reach/climb budget.
  scene.add(b.tree(4.5, 27.3, 1.1));
  addC(4.5, 27.3, 0.6);
  scene.add(b.bench(3, 26, -0.5));
  scene.add(b.bench(-4, 14, 0.7));
  scene.add(b.bench(-10, -20, 2.2));
  scene.add(b.bench(14, -28, -2.4));
  for (const [x, z] of [[2, 40], [-12, 10], [-4, -14], [10, -32]]) scene.add(b.lampPost(x, z));

  scene.add(b.billboard(6, 38, -0.5));
  addC(6, 38, 2.3);
  for (const [x, z] of [[-18, 22], [20, 12], [6, -16]]) scene.add(b.flowerPatch(x, z));
  const puddles = [{ x: 2, z: 32, r: 0.9 }, { x: -10, z: -8, r: 0.8 }];
  for (const p of puddles) scene.add(b.puddle(p.x, p.z, p.r));

  // cardboard boxes
  for (const b2 of [[5, 33], [-12, -14]]) scene.add(b.cardboardBox(b2[0], b2[1]));

  return {
    name: 'City Park',
    colliders,
    bounds: { minX: -45, maxX: 45, minZ: -50, maxZ: 52 },
    spawn: { x: 0, z: 45 },
    boxes: [{ x: 5, z: 33 }, { x: -12, z: -14 }],
    pois: [
      { x: 0, z: 20 }, { x: -14, z: 2 }, { x: 3, z: 26 }, { x: -10, z: -20 },
      { x: 12, z: -30 }, { x: 22, z: -22 }, { x: -18, z: 22 }, { x: 16, z: 10 },
    ],
    collectibles: [
      { id: 'feather-1', x: -25, z: 29, label: 'a jay feather' },
      { id: 'feather-2', x: 27, z: 1.5, label: 'a dove feather' },
      { id: 'feather-3', x: -15.5, z: -33, label: 'a golden feather' },
      { id: 'feather-4', x: 11, z: 35, label: 'a tiny down feather' },
      { id: 'feather-5', x: 4.5, z: 27.3, y: 2.1, label: 'a downy feather from way up high' },
    ],
    scenics: [
      { id: 'fountain', x: 3, z: 23, label: 'the old fountain' },
      { id: 'pond-shore', x: -14, z: 10, label: 'the duck pond' },
      { id: 'meadow', x: 12, z: -30, label: 'the quiet meadow' },
    ],
    critterSpawns: [
      { type: 'bird', x: -24, z: 30 }, { type: 'bird', x: 22, z: -22 }, { type: 'bird', x: 12, z: 36 },
      { type: 'bird', x: -26, z: -14 },
      { type: 'squirrel', x: -30, z: 10, x2: -16, z2: -34 },
      { type: 'squirrel', x: 28, z: 0, x2: 8, z2: -38 },
      { type: 'butterfly', x: -18, z: 22 }, { type: 'butterfly', x: 20, z: 12 }, { type: 'butterfly', x: 6, z: -16 },
      { type: 'duck', x: -14, z: 2 }, { type: 'duck', x: -12, z: 0 }, { type: 'duck', x: -16, z: 4 },
      { type: 'mouse', x: -9, z: 25, x2: -4, z2: 30 },
      { type: 'mouse', x: 6, z: -18, x2: 2, z2: -24 },
      { type: 'villager', x: 4, z: 27 }, { type: 'villager', x: -8, z: -22 },
    ],
    moments: [
      { id: 'duck-parade', label: 'a duckling parade crossing the path!', x: -8, z: 8, from: { x: -14, z: 2 } },
      { id: 'picnic-thief', label: 'a squirrel making off with a picnic sandwich', x: 3, z: 26, from: { x: -30, z: 10 } },
    ],
    puddles,
    skyDusk: { top: 0x2a3a5e, horizon: 0x6a5a7e },
    tippables: [
      { x: 7, z: 29, kind: 'can' }, { x: -3, z: 15, kind: 'pot' },
      { x: -9, z: -21, kind: 'bin' }, { x: 15, z: -27, kind: 'pot' },
    ],
    perches: [
      { x: 3, z: 26, y: 0.58 }, { x: -4, z: 14, y: 0.58 }, { x: -10, z: -20, y: 0.58 },
      { x: 2.8, z: 22.2, y: 0.75, label: 'fountain-edge lookout', vantage: true },
      { x: 4.5, z: 27.3, y: 2.1, label: 'oak branch lookout', vantage: true },
    ],
  };
}
