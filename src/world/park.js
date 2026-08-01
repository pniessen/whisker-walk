import * as THREE from 'three';
import * as b from './builder.js';

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
    new THREE.MeshLambertMaterial({ color: 0xb8b8c0 }));
  basin.position.y = 0.3;
  fountain.add(basin);
  const water = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 0.1, 12),
    new THREE.MeshLambertMaterial({ color: 0x8ab8d8 }));
  water.position.y = 0.62;
  fountain.add(water);
  const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 1.4, 8),
    new THREE.MeshLambertMaterial({ color: 0xb8b8c0 }));
  spire.position.y = 1.2;
  fountain.add(spire);
  fountain.position.set(0, 0, 20);
  scene.add(fountain);
  addC(0, 20, 3);

  // pond (duck home)
  const pond = new THREE.Mesh(new THREE.CircleGeometry(7, 20),
    new THREE.MeshLambertMaterial({ color: 0x7ab0d8 }));
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

  return {
    name: 'City Park',
    colliders,
    bounds: { minX: -45, maxX: 45, minZ: -50, maxZ: 52 },
    spawn: { x: 0, z: 45 },
    pois: [
      { x: 0, z: 20 }, { x: -14, z: 2 }, { x: 3, z: 26 }, { x: -10, z: -20 },
      { x: 12, z: -30 }, { x: 22, z: -22 }, { x: -18, z: 22 }, { x: 16, z: 10 },
    ],
    collectibles: [
      { id: 'feather-1', x: -25, z: 29, label: 'a jay feather' },
      { id: 'feather-2', x: 27, z: 1.5, label: 'a dove feather' },
      { id: 'feather-3', x: -15.5, z: -33, label: 'a golden feather' },
      { id: 'feather-4', x: 11, z: 35, label: 'a tiny down feather' },
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
      { type: 'villager', x: 4, z: 27 }, { type: 'villager', x: -8, z: -22 },
    ],
    moments: [
      { id: 'duck-parade', label: 'a duckling parade crossing the path!', x: -8, z: 8, from: { x: -14, z: 2 } },
      { id: 'picnic-thief', label: 'a squirrel making off with a picnic sandwich', x: 3, z: 26, from: { x: -30, z: 10 } },
    ],
    puddles,
    skyDusk: { top: 0x2a3a5e, horizon: 0x6a5a7e },
  };
}
