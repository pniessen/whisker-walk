import * as b from './builder.js';

export function build(scene) {
  b.applySky(scene, 0x9fd4e8, 0xcfe8f0);
  scene.add(b.ground(120, 0x7cb860));

  const colliders = [];
  const addC = (x, z, r) => colliders.push({ x, z, r });

  // main street running north-south, side street east-west
  scene.add(b.path(0, -50, 0, 50, 5));
  scene.add(b.path(-50, 0, 50, 0, 5));

  // sidewalks flanking both streets
  scene.add(b.sidewalk(-3.2, -50, -3.2, 50));
  scene.add(b.sidewalk(3.2, -50, 3.2, 50));
  scene.add(b.sidewalk(-50, -3.2, 50, -3.2));
  scene.add(b.sidewalk(-50, 3.2, 50, 3.2));

  // houses along the streets
  const lots = [
    [-12, -30, 0xe8d8b0], [-12, -15, 0xd8c8e8], [-12, 15, 0xf2e0c0], [-12, 30, 0xc8e0d0],
    [12, -30, 0xf0d8c8], [12, -15, 0xe0e8c8], [12, 15, 0xd8d0f0], [12, 30, 0xe8e0b8],
  ];
  for (const [x, z, color] of lots) {
    scene.add(b.house(x, z, color));
    addC(x, z, 3.4);
    scene.add(b.mailbox(x + (x < 0 ? 4 : -4), z + 2));
    scene.add(b.flowerPatch(x + (x < 0 ? 5 : -5), z - 2));
  }

  // trees, bushes, parked cars, lamps
  for (const [x, z] of [[-6, -40], [7, -22], [-8, 8], [6, 40], [-20, 22], [20, -8], [24, 18], [-24, -18]]) {
    scene.add(b.tree(x, z, 0.9 + ((x * z) % 5) * 0.08));
    addC(x, z, 0.6);
  }
  for (const [x, z] of [[-4, -12], [5, 25], [18, 4], [-18, -4]]) scene.add(b.bush(x, z));

  // low front fences along two west-side lots (curbside, just outside the house footprint)
  scene.add(b.fenceRun(-9, -17, -9, -13));
  scene.add(b.fenceRun(-9, 13, -9, 17));

  // extra scatter trees in the open lawn corners (with colliders) + leaves swept beneath
  const scatterTrees = [[-30, -12], [30, 12], [-32, 38], [32, -38]];
  for (const [x, z] of scatterTrees) {
    scene.add(b.tree(x, z, 1.0));
    addC(x, z, 0.6);
  }
  const leafSpots = [[-30, -12, 1], [30, 12, 2], [-32, 38, 3], [32, -38, 4], [-8, 8, 5]];
  for (const [x, z, seed] of leafSpots) scene.add(b.leafLitter(x, z, seed));

  // scatter bushes near lot frontages
  for (const [x, z] of [[-6, -22], [-6, 22], [9, -24], [9, 22], [-24, 5], [24, -30]]) scene.add(b.bush(x, z));

  // flowerbeds beside houses
  for (const [x, z] of [[-16, -28], [16, -28], [-17, 29], [16, 32]]) scene.add(b.flowerPatch(x, z));

  // a bike left leaning in a side yard
  scene.add(b.bike(-14, 8, 0.9));
  addC(-14, 8, 0.5);

  // a couple more rocks scattered on the lawns
  for (const [x, z] of [[6, -45], [-30, 20]]) scene.add(b.rock(x, z));
  scene.add(b.car(4, -35, 0xd06048, 0));
  addC(4, -35, 1.8);
  scene.add(b.car(-4, 20, 0x4a6ea5, 0));
  addC(-4, 20, 1.8);
  for (const [x, z] of [[3, -10], [-3, 10], [10, 3], [-10, -3]]) scene.add(b.lampPost(x, z));

  // a little roadside advertising
  scene.add(b.billboard(7, -14, -Math.PI / 2));
  addC(7, -14, 2.3);

  // crate stack beside the billboard — a two-tier step up onto its top,
  // clear of the billboard's own collider (2.4 from its center, just
  // outside the 2.3 radius) but still within climbing reach of it.
  scene.add(b.platform(9.4, -14, 1.1, 0, 1.0));
  scene.add(b.platform(9.4, -14, 2.0, 1.1, 0.8));
  addC(9.4, -14, 0.5);

  // a lean-to porch roof against the fence corner by the (-12,15) house —
  // first step of the rooftop climb chain up to its ridge.
  scene.add(b.platform(-9, 17.5, 1.3, 0, 1.6, 0xa8846a));
  addC(-9, 17.5, 0.9);

  // small playground: slide-ish ramp + swing frame
  scene.add(b.bench(28, 28, Math.PI / 4));
  scene.add(b.bench(32, 24, Math.PI / 4));
  const puddles = [{ x: -7, z: -8, r: 0.9 }, { x: 9, z: 12, r: 0.8 }];
  for (const p of puddles) scene.add(b.puddle(p.x, p.z, p.r));

  // fenced yard with the dog (scare event source)
  scene.add(b.fenceRun(18, -28, 26, -28));
  scene.add(b.fenceRun(18, -28, 18, -20));
  scene.add(b.fenceRun(26, -28, 26, -20));

  // cardboard boxes
  for (const b2 of [[-6, -24], [16, 21], [-18, 8]]) scene.add(b.cardboardBox(b2[0], b2[1], b2[0] * 0.7));

  return {
    name: 'Cozy Neighborhood',
    colliders,
    bounds: { minX: -55, maxX: 55, minZ: -55, maxZ: 55 },
    spawn: { x: 0, z: 45 },
    boxes: [{ x: -6, z: -24 }, { x: 16, z: 21 }, { x: -18, z: 8 }],
    pois: [
      { x: -8, z: 4 }, { x: 4, z: -35 }, { x: 16, z: 2 }, { x: -12, z: 32 },
      { x: 8, z: 27 }, { x: -6, z: -40 }, { x: 20, z: -8 }, { x: 28, z: 28 },
    ],
    collectibles: [
      { id: 'yarn-1', x: -14, z: 33.5, label: 'a red yarn ball' },
      { id: 'yarn-2', x: 5.5, z: -36.5, label: 'a blue yarn ball' },
      { id: 'yarn-3', x: 25, z: 21, label: 'a golden yarn ball' },
      { id: 'yarn-4', x: -21, z: -19, label: 'a green yarn ball' },
      { id: 'yarn-roof', x: -11.5, z: 15.5, y: 4.1, label: 'a legendary silver yarn ball' },
    ],
    scenics: [
      { id: 'playground', x: 30, z: 26, label: 'the little playground' },
      { id: 'crossroads', x: 0, z: 0, label: 'the sunny crossroads' },
    ],
    critterSpawns: [
      { type: 'bird', x: -6, z: -40 }, { type: 'bird', x: 6, z: 40 }, { type: 'bird', x: 24, z: 18 },
      { type: 'squirrel', x: -20, z: 22, x2: 7, z2: -22 },
      { type: 'squirrel', x: 20, z: -8, x2: -8, z2: 8 },
      { type: 'butterfly', x: -12, z: 28 }, { type: 'butterfly', x: 12, z: -12 },
      { type: 'mouse', x: -4, z: -10, x2: 2, z2: -6 },
      { type: 'mouse', x: 16, z: 30, x2: 10, z2: 25 },
      { type: 'dog', x: 22, z: -24 },
      { type: 'villager', x: -16, z: 12 }, { type: 'villager', x: 14, z: 34 },
    ],
    moments: [
      { id: 'feeder-raid', label: 'a squirrel raiding the bird feeder!', x: -12, z: 30, from: { x: -20, z: 22 } },
      { id: 'mail-nap', label: 'a delivery drone bothering the mailbox birds', x: 12, z: 32, from: { x: 6, z: 40 } },
    ],
    puddles,
    skyDusk: { top: 0x2a3a5e, horizon: 0x6a5a7e },
    tippables: [
      { x: -8, z: -32, kind: 'pot' }, { x: 10.5, z: -9.5, kind: 'pot' },
      { x: -17, z: 19, kind: 'can' }, { x: 15, z: 32, kind: 'pot' },
      { x: 5, z: 22, kind: 'bin' },
    ],
    perches: [
      { x: 28, z: 28, y: 0.58 }, { x: 32, z: 24, y: 0.58 },
      { x: 4, z: -35, y: 1.35, label: 'king of the car roof', vantage: true },
      { x: -4, z: 20, y: 1.35 },
      // dog-yard fence tops
      { x: 22, z: -28, y: 0.85 }, { x: 18, z: -24, y: 0.85 },
      // billboard crate-stack chain: ground -> crate -> crate top -> billboard
      { x: 9.4, z: -14, y: 1.1 }, { x: 9.4, z: -14, y: 2.0 },
      { x: 7, z: -14, y: 3.3, label: 'billboard lookout', vantage: true },
      // rooftop chain: ground -> porch roof -> rooftop -> ridge
      { x: -9, z: 17.5, y: 1.3 },
      { x: -9.5, z: 15.5, y: 2.9, label: 'rooftop scout', vantage: true },
      { x: -11.5, z: 15.5, y: 4.1, label: 'king of the roof', vantage: true },
    ],
  };
}
