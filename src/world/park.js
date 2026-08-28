import * as THREE from 'three';
import * as b from './builder.js';
import { litMaterial } from '../render/materials.js';
import { sureClawsTreePerch, SURE_CLAWS_ID } from '../climbing.js';

// =============================================================================
// City Park.
//
// THE POND — v19 "make water real".
//
// The duck pond is a 7m circle at (-14, 2) and, like every other body of water
// in the game, it carries no collider today: the cat walks straight across it.
// A later wave makes water solid, so this file declares the footprint as data
// (see `waters` in the returned object, and the WATER note at the bottom of
// builder.js) and keeps everything the player has to REACH out of it:
//
//   * No collectible, golden mouse, scenic, POI, tippable, perch, box, puddle
//     or spawn point sits inside the circle. The POI that used to sit on the
//     pond's exact centre moved to the north shore in v19 — see the note on it
//     below; it was by far the worst of these, because `pois` is what the
//     daily race's five rings and every quest target are derived from, and
//     race.js checks only the CURRENT ring, with no skip and no timeout.
//   * The pond is an island of water in the middle of open lawn, so it cannot
//     cut the map in two the way the Docks canal could; there is dry grass all
//     the way round it and test/water.test.js walks it.
//   * The ducks still swim in it, and the duckling-parade moment still starts
//     from the middle of it — a moment's `from` is a critter's starting point,
//     not somewhere the cat is ever asked to stand.
//
// test/water.test.js pins all of that, for this area and for the seaside,
// exactly the way test/docks.test.js has pinned the canal since v18.
// =============================================================================

// The pond footprint. The mesh below is BUILT from this record rather than
// standing beside it, so the drawn water and the declared water cannot drift
// apart.
const POND = { id: 'pond', kind: 'circle', x: -14, z: 2, r: 7 };

export function build(scene) {
  b.applySky(scene, 0xaee0d0, 0xd8f0e0);
  scene.add(b.ground(120, 0x6cb058));

  const colliders = [];
  const addC = (x, z, r) => colliders.push({ x, z, r });

  // v18 CF-9b — Sure Claws' "props that were scenery become climbable".
  // Gated by `requires`, unlabelled and non-vantage; see the same block in
  // neighborhood.js for why all three of those matter.
  //
  // The park is the area where the height half of the ability is decided:
  // sixteen scenery trees open here, and the one tree that ALREADY carries a
  // perch — the oak at (4.5, 27.3), branch y 2.1, holding gm-park-2 and
  // feather-5 — is exactly what caps climbing.js's 'tree' ceiling at 2.0. It
  // is not in this list: it is a chain, not scenery, and it stays a chain.
  const clawPerches = [];

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

  // pond (duck home) — drawn from POND, declared in `waters` below
  const pond = new THREE.Mesh(new THREE.CircleGeometry(POND.r, 20),
    litMaterial(0x7ab0d8));
  pond.rotation.x = -Math.PI / 2;
  pond.position.set(POND.x, 0.02, POND.z);
  scene.add(pond);

  // big trees ring the lawns
  const treeSpots = [[-24, 30], [-30, 10], [-26, -14], [-16, -34], [8, -38], [22, -22],
    [28, 0], [24, 24], [12, 36], [-6, 34], [6, -8], [16, -6]];
  for (const [x, z] of treeSpots) {
    // Local, then passed to both the model and the fork perch — see the same
    // note in neighborhood.js. Every park tree is scale 1.2 or more, so all
    // sixteen forks land on TREE_FORK_MAX (1.9) rather than on trunk-top
    // minus 0.1: a big park tree gets a LOW fork, which is both the honest
    // reading of a wide oak and the reason none of them out-tops the 2.1
    // branch on the oak that holds the golden mouse.
    const scale = 1.2 + ((x + z) % 4) * 0.15;
    scene.add(b.tree(x, z, scale));
    addC(x, z, 0.7);
    clawPerches.push(sureClawsTreePerch(x, z, scale));
  }
  for (const [x, z] of [[-10, 26], [10, 18], [-20, -6], [4, -24]]) scene.add(b.bush(x, z));

  // extra trees in the far lawn corners (with colliders) + leaves beneath three of them
  const scatterTrees = [[-40, -40], [40, 40], [-40, 40], [40, -40]];
  for (const [x, z] of scatterTrees) {
    scene.add(b.tree(x, z, 1.1));
    addC(x, z, 0.6);
    clawPerches.push(sureClawsTreePerch(x, z, 1.1));
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
  // The meadow bench — the one bench in the park that never got a perch,
  // 24m from the nearest perched bench and so out of every reach and every
  // fence-run dash. Opened by CF-9b at the same 0.58 seat height the other
  // three ship at.
  scene.add(b.bench(14, -28, -2.4));
  clawPerches.push({ x: 14, z: -28, y: 0.58, kind: 'furniture', requires: SURE_CLAWS_ID });
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
      { x: 0, z: 20 },
      // v19: WAS (-14, 2) — the pond's exact centre, and the single worst
      // number in this file once water goes solid. clearSpot could not save
      // it (the pond carries no collider for it to see), race.js picks five
      // of these eight and stalls forever on a ring it cannot cross, and
      // quest completion wants the cat within 2m of it.
      //
      // Now on the north shore beside the `pond-shore` scenic at (-14, 10),
      // which is the convention this area already authored for "at the pond,
      // not in it". 9m from the pond centre, so 2.0 clear of the water edge,
      // which covers all three consumers off dry grass the cat stands on
      // directly: the race ring-cross at 1.2, quest completion at 2.0, and
      // secrets.js's gnome, which hides at a random POI +/- 1.5 and so would
      // otherwise still paddle.
      { x: -14, z: 11 },
      { x: 3, z: 26 }, { x: -10, z: -20 },
      { x: 12, z: -30 }, { x: 22, z: -22 }, { x: -18, z: 22 }, { x: 16, z: 10 },
    ],
    collectibles: [
      { id: 'feather-1', x: -25, z: 29, label: 'a jay feather' },
      { id: 'feather-2', x: 27, z: 1.5, label: 'a dove feather' },
      { id: 'feather-3', x: -15.5, z: -33, label: 'a golden feather' },
      { id: 'feather-4', x: 11, z: 35, label: 'a tiny down feather' },
      { id: 'feather-5', x: 4.5, z: 27.3, y: 2.1, label: 'a downy feather from way up high' },
    ],
    // The park's one body of water. See the POND note in this file's header;
    // the fountain is not listed because its water disc (r 2.2) sits wholly
    // inside the basin's own r-3 collider and has always been unreachable.
    waters: [POND],
    scenics: [
      { id: 'fountain', x: 3, z: 23, label: 'the old fountain' },
      // 1.0 clear of the pond's north edge — the shore, not the water. Both
      // gates that consume a scenic are satisfied standing on the spot
      // itself: the 4m visit award and Gift Paws' 3m leave range.
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
    // `kind` (v18 CF-9b): the fountain rim is 'stone' and the oak branch is
    // the game's one shipped 'tree' — the perch that caps Sure Claws' tree
    // ceiling at 2.0, one tenth below it, so this chain can never be taken
    // in a single hop off the grass.
    perches: [
      { x: 3, z: 26, y: 0.58, kind: 'furniture' }, { x: -4, z: 14, y: 0.58, kind: 'furniture' },
      { x: -10, z: -20, y: 0.58, kind: 'furniture' },
      { x: 2.8, z: 22.2, y: 0.75, kind: 'stone', label: 'fountain-edge lookout', vantage: true },
      { x: 4.5, z: 27.3, y: 2.1, kind: 'tree', label: 'oak branch lookout', vantage: true },
      // Sure Claws only: sixteen tree forks and the meadow bench.
      ...clawPerches,
    ],
  };
}
