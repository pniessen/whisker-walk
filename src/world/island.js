import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as b from './builder.js';
import { litMaterial, surfaceProps } from '../render/materials.js';
import { GOLD_MICE } from '../goldmice.js';
import { mulberry32, seedFromCode } from '../rng.js';
import { segDist } from '../segdist.js';
import { BRIDGE_PLANK, ISLAND_WOODS, bridgeEnds, fromWoods } from './lake.js';

// The island in the Pines' lake, and the bridge to it, as ground a cat walks
// on. Everything here is in Pines coordinates (metres, x east, z south) and is
// derived from lake.js, so the island the Pines walks on is the very island
// the Woods, the River and the Moor paint on their horizons.
//
// It is the meeting place, under a truce: no cat stands on it, on the bridge
// or on the lake (owner's decision 4), so ISLAND_KEEP_OUT is here beside the
// ground it guards, and it is exported so a later patrol can keep off it too.

const freeze = (o) => Object.freeze(o);

// The island's ground: a disc of dry land cut out of the lake and its bay.
// No rise: it walks flat (the neighbours' low dome is horizon-only, in fog).
const centre = fromWoods('pines', ISLAND_WOODS.x, ISLAND_WOODS.z);
export const ISLAND_LAND = freeze({ x: centre.x, z: centre.z, r: ISLAND_WOODS.r });

// The bridge deck: a strip down the plank's whole length, from 0.6 m onto the
// island to 1 m past the bridge foot onto the Pines' shore, 0.1 m in from each
// side of the plank. It runs past the foot because the cat is held 0.35 m off
// the water and the foot is only 0.2 m onto land: a deck stopping at the foot
// would leave a band at the shore the cat could not cross. The extra metre is
// over land, so it adds no walkable water, and the plank covers it, so the
// deck is still exactly what the kids see.
const [islandEnd, landEnd] = bridgeEnds('pines');
export const BRIDGE_DECK = freeze({
  x1: islandEnd.x, z1: islandEnd.z, x2: landEnd.x, z2: landEnd.z,
  halfW: BRIDGE_PLANK.w / 2 - 0.1,
});

// The lake and the bay round the island, as plain boxes. pines.js builds its
// `lake` and `lake-bay` waters from these, and the keep-out below uses the
// same boxes, so the two can never disagree. They live here rather than in
// pines.js because pines.js imports this module: reading them back from it
// would be an import cycle.
export const LAKE_BOX = freeze({ minX: 26, maxX: 86, minZ: 8, maxZ: 66 });
export const BAY_BOX = freeze({ minX: 0, maxX: 30, minZ: 5, maxZ: 44 });

// Where the Pines' strays and ghosts never stand (src/keepout.js): the lake and
// the bay as solid boxes, so the island inside them is covered too, and the
// bridge as a capsule, its deck plus 0.6 m each side. The margin keeps a cat
// 0.6 m back from either box's edge, so none paces the waterline.
const KEEP_OUT_MARGIN = 0.6;
export const ISLAND_KEEP_OUT = freeze({
  rects: freeze([freeze({ ...LAKE_BOX }), freeze({ ...BAY_BOX })]),
  capsules: freeze([freeze({
    x1: BRIDGE_DECK.x1, z1: BRIDGE_DECK.z1, x2: BRIDGE_DECK.x2, z2: BRIDGE_DECK.z2,
    r: BRIDGE_DECK.halfW + KEEP_OUT_MARGIN,
  })]),
  margin: KEEP_OUT_MARGIN,
});

// =============================================================================
// What is on the island: the Meeting Ring, the Old Ash, the Watch Rock, and
// things to find. pines.js builds these into its own area and appends every
// list to its own, so the island is part of the Pines walk, with the Pines'
// sound and the Pines' golden mice (gm-pines-4..6, src/goldmice.js).
//
// No cats here (owner's decision 4): finds, golden mice and wildlife only.
// Every label is in our own words, never a place name from her books.
// =============================================================================

const freezeAll = (list) => freeze(list.map((r) => freeze(r)));

// The Old Ash: the big tree every shore shows, at the island's centre, at the
// size the neighbours paint it (lake.js's treeScale).
const OLD_ASH = freeze({ x: ISLAND_LAND.x, z: ISLAND_LAND.z, scale: ISLAND_WOODS.treeScale, r: 1.0 });
// Its mossy boulder, the chain's first step, south of the trunk under the limb.
// 1.5 m of grass between its collider and the trunk's, and the same to the
// south meeting stone's, so a cat walks round it either way.
const ASH_BOULDER = freeze({ x: 28, z: 31.2, r: 0.7 });
// The Watch Rock on the east shore: a low rock, then a tall flat-topped one,
// the shape of the Pines' own pillars. 2.1 m of grass between it and the water.
const WATCH_STEP = freeze({ x: 37, z: 29, r: 0.7 });
const WATCH_ROCK = freeze({ x: 38, z: 28, y: 1.9, r: 0.9, rTop: 0.75, rBottom: 0.9, sides: 7 });

// The Meeting Ring: six flat sitting stones on a ring of 6 m round the Old
// Ash. The bridge comes in through the gap between (22.8, 25) and (28, 22).
export const MEETING_STONES = freezeAll([
  { x: 33.2, z: 31 }, { x: 28, z: 34 }, { x: 22.8, z: 31 }, { x: 22.8, z: 25 }, { x: 28, z: 22 }, { x: 33.2, z: 25 },
]);
const STONE = freeze({ rTop: 0.55, rBottom: 0.65, h: 0.4, sides: 9, r: 0.6, color: 0x9a9488 });

// The two climb chains, two hops each. The limb perch is a 'tree' at 2.1, over
// Sure Claws' 1.6-2.0 band, so the ability never makes it one hop from the
// grass (src/climbing.js); the Watch Rock's top is 'stone'.
export const ISLAND_PERCHES = freezeAll([
  { x: ASH_BOULDER.x, z: ASH_BOULDER.z, y: 0.72, kind: 'stone' },
  { x: 28, z: 29.5, y: 2.1, kind: 'tree', label: 'old ash lookout', vantage: true },
  { x: WATCH_STEP.x, z: WATCH_STEP.z, y: 0.72, kind: 'stone' },
  { x: WATCH_ROCK.x, z: WATCH_ROCK.z, y: WATCH_ROCK.y, kind: 'stone', label: 'watch rock', vantage: true },
]);

// Eight points of interest for the race and the quests, all tagged
// `group: 'island'` so a race or a quest can take at most one of them and the
// bridge stays a choice. Each is 2.5 m inside the rim and 1.6 m clear of
// every collider (clearSpot's margin), so a race ring stands on its POI. The
// last is on the bridge, 8 m from the island end.
export const ISLAND_POIS = freezeAll([
  [34.7, 34.7], [25.5, 38], [18, 28], [19.8, 23.3], [28, 18], [34.7, 21.3], [25.5, 24.2], [15.76, 11.68],
].map(([x, z]) => ({ x, z, group: 'island' })));

// The island takes no gifts: Gift Paws' "leave a gift" is for a cat's own
// territory, and the meeting place belongs to no one.
export const ISLAND_SCENICS = freezeAll([
  { id: 'bridge-landing', x: 22, z: 20.5, label: 'the end of the bridge', gifts: false },
  { id: 'meeting-ring', x: 30.5, z: 25.5, label: 'the meeting ring under the old ash', gifts: false },
  { id: 'lake-view', x: 35.5, z: 36, label: 'the lake, looking over to the Woods', gifts: false },
]);

export const ISLAND_COLLECTIBLES = freezeAll([
  { id: 'pines-find-6', x: 24.5, z: 35.5, label: 'a smooth white pebble' },
  { id: 'pines-find-7', x: 33, z: 18.5, label: 'a grey goose feather' },
  { id: 'pines-find-8', x: 17.5, z: 31, label: "a snail shell at the water's edge" },
  // on the deck, 13 m out from the shore
  { id: 'pines-find-9', x: 12.76, z: 7.68, label: 'a pine cone dropped on the planks' },
  // on the north meeting stone, so one small hop up
  { id: 'pines-find-10', x: 28, z: 22, y: STONE.h, label: 'a bright beetle wing on a meeting stone' },
]);

// The bushes the hidden golden mouse (gm-pines-6) sits among. No colliders:
// a cat pushes through to it.
export const ISLAND_BUSHES = freezeAll([{ x: 22, z: 33.5 }, { x: 20, z: 35 }, { x: 22.5, z: 36.5 }]);

export const ISLAND_PUDDLES = freezeAll([{ x: 19.5, z: 26.5, r: 0.8 }]);

// Wildlife only. Two birds either side of the Old Ash's trunk, outside its
// collider so a cat can get to them; butterflies over the open grass (the
// island is sunny, unlike the pines); a mouse in the long grass by the south
// shore.
export const ISLAND_CRITTERS = freezeAll([
  { type: 'bird', x: 26.5, z: 28 }, { type: 'bird', x: 29.5, z: 28 },
  { type: 'butterfly', x: 31, z: 32 }, { type: 'butterfly', x: 25, z: 32 }, { type: 'butterfly', x: 30, z: 24 },
  { type: 'mouse', x: 24, z: 37.5, x2: 27, z2: 39.5 },
]);

// The Pines' ducks paddle round the island; the cat watches them from the
// island's north shore, on dry ground.
export const ISLAND_MOMENTS = freeze([freeze({
  id: 'duck-ring', type: 'duck', label: 'ducks paddling past the island', x: 31, z: 17.6,
  from: freeze({ x: 38, z: 15 }),
})]);

// The island's golden mice, so the reeds keep off them too: the Pines' mice
// that stand on the island's ground, found from the list rather than typed in
// by id, so they cannot drift from it (Polish 3).
export const ISLAND_GOLD = freeze(GOLD_MICE.pines.filter(
  (m) => Math.hypot(m.x - ISLAND_LAND.x, m.z - ISLAND_LAND.z) <= ISLAND_LAND.r,
));

// Everything on the island a kid looks for, climbs or watches from. pines.js
// adds these to PINES_KEEP_CLEAR; the reeds below keep 3 m off them.
const ISLAND_RECORDS = freeze([
  ...ISLAND_POIS, ...ISLAND_SCENICS, ...ISLAND_COLLECTIBLES, ...ISLAND_GOLD, ...ISLAND_PERCHES,
  ...MEETING_STONES, ...ISLAND_BUSHES, ...ISLAND_PUDDLES, ...ISLAND_MOMENTS,
]);

// Reeds round the island's rim: one clump every 2 m on a ring of 12.6 m,
// each moved in or out by up to 15 cm, so they stand on the island, inside
// its shore. Seeded by name, and every candidate draws its number whether it
// is kept or not, so both co-walkers see the same ring. None within 3 m of a
// find, a perch or a stone (so nothing a kid looks for is hidden), and none
// within 2 m of the bridge's centreline (so the landing stays open).
//
// Every 2 m, the Pines' own reed step, not the plan's 2.5 m: the POIs and
// finds near the rim stand only about 2.1 m from the ring, so at 2.5 m their
// 3 m clearance left 15 clumps, too thin to read as a reedy shore. More
// candidates, rather than a looser clearance, keep every find in the open.
const REED_RING = freeze({ r: 12.6, step: 2, jitter: 0.15 });
const r2 = (v) => Math.round(v * 100) / 100;
const deckDist = (x, z) => segDist(x, z, BRIDGE_DECK.x1, BRIDGE_DECK.z1, BRIDGE_DECK.x2, BRIDGE_DECK.z2);
export function islandReeds() {
  const rng = mulberry32(seedFromCode('island-reeds'));
  const n = Math.round((2 * Math.PI * REED_RING.r) / REED_RING.step);
  const spots = [];
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * i) / n;
    const rad = REED_RING.r + (rng() * 2 - 1) * REED_RING.jitter;
    const x = r2(ISLAND_LAND.x + Math.cos(a) * rad);
    const z = r2(ISLAND_LAND.z + Math.sin(a) * rad);
    if (deckDist(x, z) < 2) continue;
    if (ISLAND_RECORDS.some((p) => Math.hypot(x - p.x, z - p.z) < 3)) continue;
    spots.push({ x, z });
  }
  return spots;
}

// A mossy boulder, the first step of each chain: builder.rock's shape and
// height, the Woods' mossy boulder. The two share the material buildIsland
// makes, one per build: walk.js disposes every material at the end of a walk,
// so a module-level one would be handed to the next walk already disposed.
const MOSSY = 0x7f8a6c;
function mossyBoulder(x, z, material) {
  const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5, 0), material);
  m.position.set(x, 0.3, z);
  return m;
}

// Builds the island's landmarks and bushes into the scene, and returns their
// colliders and perches for pines.js to append to its own. Every mesh a test
// looks for is named.
export function buildIsland(scene, { wind } = {}) {
  const colliders = [];
  const perches = ISLAND_PERCHES.map((p) => ({ ...p }));

  // The Old Ash, and the limb the golden mouse sits out on. The limb is a
  // child of the tree, in its scaled frame, so it sways with it: it reaches
  // south from the trunk at 2.0 m, from 0.6 to 2.2 m out, its thin end
  // outward, its top just under the mouse.
  const ash = b.tree(OLD_ASH.x, OLD_ASH.z, OLD_ASH.scale, { wind });
  ash.name = 'oldAsh';
  const s = OLD_ASH.scale;
  const limb = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07 / s, 0.12 / s, 1.6 / s, 6),
    litMaterial(0x7a5230, surfaceProps('bark')),
  );
  limb.rotation.x = Math.PI / 2;
  limb.position.set(0, 2.0 / s, 1.4 / s);
  ash.add(limb);
  scene.add(ash);
  colliders.push({ x: OLD_ASH.x, z: OLD_ASH.z, r: OLD_ASH.r });

  // The two chain boulders, one material between them.
  const mossy = litMaterial(MOSSY, surfaceProps('cobble'));
  for (const [rec, name] of [[ASH_BOULDER, 'ashBoulder'], [WATCH_STEP, 'watchRockStep']]) {
    const rock = mossyBoulder(rec.x, rec.z, mossy);
    rock.name = name;
    scene.add(rock);
    colliders.push({ x: rec.x, z: rec.z, r: rec.r });
  }

  // The Watch Rock, as wide at its foot as its collider, so a cat walking
  // round it never stops short of what it sees.
  const watch = new THREE.Mesh(
    new THREE.CylinderGeometry(WATCH_ROCK.rTop, WATCH_ROCK.rBottom, WATCH_ROCK.y, WATCH_ROCK.sides),
    litMaterial(0x8e8c88, surfaceProps('cobble')),
  );
  watch.name = 'watchRock';
  watch.position.set(WATCH_ROCK.x, WATCH_ROCK.y / 2, WATCH_ROCK.z);
  scene.add(watch);
  colliders.push({ x: WATCH_ROCK.x, z: WATCH_ROCK.z, r: WATCH_ROCK.r });

  // The Meeting Ring: the six stones merged into one mesh, one draw call. It
  // is 0.4 m tall, so it casts shadows. It gets no contact shadow, though:
  // merged, it is 12 m across, over contactshadows.js's MAX_SPAN, and a
  // 0.4 m stone sits fine on the grass without one.
  const parts = MEETING_STONES.map(({ x, z }) => {
    const g = new THREE.CylinderGeometry(STONE.rTop, STONE.rBottom, STONE.h, STONE.sides);
    g.translate(x, STONE.h / 2, z);
    return g;
  });
  const ring = new THREE.Mesh(mergeGeometries(parts, false), litMaterial(STONE.color, surfaceProps('cobble')));
  for (const g of parts) g.dispose();
  ring.name = 'meetingRing';
  scene.add(ring);
  for (const { x, z } of MEETING_STONES) {
    colliders.push({ x, z, r: STONE.r });
    perches.push({ x, z, y: STONE.h, kind: 'stone' });
  }

  // The hidden mouse's bushes, and the puddle.
  for (const { x, z } of ISLAND_BUSHES) scene.add(b.bush(x, z, { wind }));
  for (const p of ISLAND_PUDDLES) scene.add(b.puddle(p.x, p.z, p.r));

  return { colliders, perches };
}
