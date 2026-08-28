import * as THREE from 'three';
import * as b from './builder.js';
import { litMaterial } from '../render/materials.js';
import { SURE_CLAWS_ID } from '../climbing.js';

const mat = (color) => litMaterial(color);

export function build(scene) {
  b.applySky(scene, 0x9fc8e8, 0xe8e0d0);
  scene.add(b.ground(140, 0xe0d0a0)); // sand

  const colliders = [];
  const addC = (x, z, r) => colliders.push({ x, z, r });

  // the sea: everything east of x = 25
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(80, 140), mat(0x4a90c0));
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(65, 0.05, 0);
  scene.add(sea);

  // boardwalk running north-south along the shore
  const walk = new THREE.Mesh(new THREE.PlaneGeometry(4, 90), mat(0xa08050));
  walk.rotation.x = -Math.PI / 2;
  walk.position.set(20, 0.03, 0);
  scene.add(walk);
  // pier heading out over the water
  const pier = new THREE.Mesh(new THREE.PlaneGeometry(3, 24), mat(0xa08050));
  pier.rotation.x = -Math.PI / 2;
  pier.rotation.z = Math.PI / 2;
  pier.position.set(34, 0.25, -10);
  scene.add(pier);

  // fishing boats bobbing offshore
  for (const [x, z, color] of [[40, 8, 0xd06048], [50, -22, 0x4a6ea5], [44, 28, 0x6a9a4a]]) {
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(2, 0.8, 4.5), mat(color));
    hull.position.y = 0.4;
    boat.add(hull);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3, 6), mat(0x7a5230));
    mast.position.y = 2;
    boat.add(mast);
    boat.position.set(x, 0, z);
    scene.add(boat);
  }

  // cliff at the north end with a switchback path up
  const cliff = new THREE.Mesh(new THREE.BoxGeometry(60, 8, 18), mat(0xb09878));
  cliff.position.set(-10, 4, -46);
  scene.add(cliff);
  for (let i = 0; i < 12; i++) addC(-38 + i * 5, -37, 2.5); // cliff face blocks walking through
  const overlook = new THREE.Mesh(new THREE.BoxGeometry(10, 8, 10), mat(0xb09878));
  overlook.position.set(-40, 4, -40);
  scene.add(overlook);
  addC(-40, -40, 6);

  // beach props. Two of these four boulders have carried perches since v11
  // ((-8,10) and the "overlook boulder" at (-28,18)); the rest of the sand is
  // scenery, and CF-9b opens it — see clawPerches below.
  for (const [x, z] of [[-8, 10], [-20, -2], [4, 24], [-28, 18]]) scene.add(b.rock(x, z));

  // a dune ledge beside the overlook boulder — second step of a short climb
  // chain (boulder y 0.72 -> ledge y 1.9), 1.41 horizontally and 1.18
  // vertically away, both inside the reach/climb budget.
  scene.add(b.platform(-29, 19, 1.9, 0, 1.8, 0xd8c088));
  addC(-29, 19, 1.0);
  scene.add(b.bench(18, 14, Math.PI / 2));
  scene.add(b.bench(18, -18, Math.PI / 2));
  for (const [x, z] of [[20, 30], [20, -30]]) scene.add(b.lampPost(x, z));

  scene.add(b.billboard(15, 34, Math.PI / 2));
  addC(15, 34, 2.3);
  // beach grass tufts
  for (const [x, z] of [[-14, 30], [-2, -14], [-24, -20], [8, 2]]) scene.add(b.bush(x, z));

  // a few more rocks and grass tufts scattered on the sand
  for (const [x, z] of [[-32, 30], [12, -10], [-32, -10]]) scene.add(b.rock(x, z));
  for (const [x, z] of [[-30, 5], [12, 20]]) scene.add(b.bush(x, z));

  // driftwood washed up at the sand line
  const driftwood = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.15, 0.25), mat(0x9a8468));
  driftwood.position.set(24, 0.1, 0);
  driftwood.rotation.y = 0.4;
  scene.add(driftwood);

  // cardboard boxes
  for (const b2 of [[19, 24], [-14, 4], [30, -6]]) scene.add(b.cardboardBox(b2[0], b2[1]));

  return {
    name: 'Seaside',
    colliders,
    bounds: { minX: -48, maxX: 36, minZ: -34, maxZ: 48 },
    spawn: { x: 18, z: 42 },
    boxes: [{ x: 19, z: 24 }, { x: -14, z: 4 }, { x: 30, z: -6 }],
    pois: [
      { x: 20, z: 14 }, { x: 34, z: -10 }, { x: -8, z: 10 }, { x: -20, z: -2 },
      { x: 4, z: 24 }, { x: -28, z: 18 }, { x: 18, z: -18 }, { x: -2, z: -14 },
    ],
    collectibles: [
      { id: 'fish-1', x: 33, z: -14, label: 'a shiny little fish' },
      { id: 'fish-2', x: -9, z: 8.5, label: 'a striped shell-fish' },
      { id: 'fish-3', x: -29, z: 16.5, label: 'a silver sardine' },
      { id: 'fish-4', x: 19, z: -31, label: 'a lost lure-fish' },
      { id: 'fish-5', x: -29, z: 19, y: 1.9, label: 'a gull-dropped fish' },
    ],
    scenics: [
      { id: 'pier-end', x: 34, z: -18, label: 'the end of the pier' },
      { id: 'overlook', x: -33, z: -32, label: 'the cliffside overlook' },
      { id: 'shoreline', x: 24, z: 20, label: 'the crashing shoreline' },
    ],
    critterSpawns: [
      { type: 'seagull', x: 22, z: 8 }, { type: 'seagull', x: 30, z: -6 },
      { type: 'seagull', x: 16, z: -26 }, { type: 'seagull', x: 8, z: 30 },
      { type: 'crab', x: -6, z: 14 }, { type: 'crab', x: -18, z: 2 }, { type: 'crab', x: 2, z: -10 },
      { type: 'butterfly', x: -14, z: 30 },
      { type: 'mouse', x: -22, z: 20, x2: -14, z2: 25 },
      { type: 'mouse', x: 10, z: 22, x2: 16, z2: 18 },
      { type: 'villager', x: 18, z: 16 }, { type: 'villager', x: 32, z: -10 },
    ],
    moments: [
      { id: 'gull-heist', label: 'a seagull stealing someone\'s sandwich!', x: 18, z: 14, from: { x: 30, z: -6 } },
      { id: 'crab-race', label: 'two crabs racing across the boardwalk', x: 20, z: 0, from: { x: -6, z: 14 } },
    ],
    puddles: [],
    skyDusk: { top: 0x22304e, horizon: 0x7a5a6e },
    tippables: [
      { x: 17, z: 15, kind: 'pot' }, { x: 17, z: -17, kind: 'can' },
      { x: 21, z: 29, kind: 'bin' }, { x: -7, z: 9, kind: 'pot' },
    ],
    // `kind` (v18 CF-9b). The dune ledge is 'stone', NOT 'tree' or 'fence' —
    // which is the whole point of tagging: the ledge at y 1.9 used to be the
    // number that held Sure Claws' global climb lift down to 1.85, and now it
    // simply sits outside the lifted kinds and cannot be reached off the sand
    // at all. The boulder → ledge chain that holds gm-sea-2 and fish-5 is
    // untouched by the ability in either direction.
    perches: [
      { x: 18, z: 14, y: 0.58, kind: 'furniture' }, { x: 18, z: -18, y: 0.58, kind: 'furniture' },
      { x: -8, z: 10, y: 0.72, kind: 'stone' },
      { x: -28, z: 18, y: 0.72, kind: 'stone', label: 'overlook boulder', vantage: true },
      { x: -29, z: 19, y: 1.9, kind: 'stone', label: 'dune ledge', vantage: true },
      // Sure Claws only: the five scenery boulders. The seaside has neither
      // a tree nor a fence, so the ability's height lift never fires in this
      // area — what it opens here is the sand itself, five standing stones
      // scattered from the north dunes to the far south beach, each already
      // inside the baseline climb at the 0.72 the two shipped boulders use.
      //
      // (-32, -10) is deliberately included even though gm-sea-3 hides on the
      // sand beside it: a ground mouse needs no perch, so the boulder cannot
      // shorten anything — it just means a Sure Claws cat can spot the mouse
      // from on top of the rock as well as from beside it.
      ...[[-20, -2], [4, 24], [-32, 30], [12, -10], [-32, -10]].map(([x, z]) => (
        { x, z, y: 0.72, kind: 'stone', requires: SURE_CLAWS_ID }
      )),
    ],
  };
}
