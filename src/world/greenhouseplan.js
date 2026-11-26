// =============================================================================
// THE GREENHOUSE (milestones 0 and 1: the spike, then the real plants, the koi, the jobs and the fountain). Pure data, no THREE, nothing drawn.
//
// One glass house (the Palm House), a pond and a lawn: just enough to prove the glass kit, the building fade,
// the dusk swap, the camera and the pond's wading band. Behind ?greenhouse=1 only; not on the map, no catalog
// row, no gate. Metres; x east, z south (north is -z); every number is a first draft for the later milestones
// to tune (docs/superpowers/specs/2026-11-22-greenhouse-design.md).
// =============================================================================

export const GREENHOUSE_NAME = 'The Greenhouse';
export const GREENHOUSE_BOUNDS = Object.freeze({ minX: -40, maxX: 40, minZ: -36, maxZ: 36 });
export const GREENHOUSE_SPAWN = Object.freeze({ x: 0, z: 30 });

// The Palm House: a barrel-vaulted hall, its ridge running east-west.
export const PALM_HOUSE = Object.freeze({
  x0: -14, x1: 14, z0: -18, z1: 0, wallH: 3.5, ridge: 11, plinth: 0.5, doorH: 3, doorW: 3,
});
// Four doors, each a real gap 3 m wide: south and north in the long walls (at x), west and east in the arched ends (at z).
export const PALM_DOORS = Object.freeze([
  Object.freeze({ side: 'south', x: 0, z: PALM_HOUSE.z1 }),
  Object.freeze({ side: 'north', x: 0, z: PALM_HOUSE.z0 }),
  Object.freeze({ side: 'west', x: PALM_HOUSE.x0, z: -9 }),
  Object.freeze({ side: 'east', x: PALM_HOUSE.x1, z: -9 }),
]);

export const POND = Object.freeze({ id: 'pond', kind: 'circle', x: -26, z: 18, r: 6.5, shallow: 1.5 });

// The six palms (milestone 1: real ones). They stand round the fern island's loop, clear of the doors; [x, z, height].
export const PALM_SPOTS = Object.freeze([
  [-9, -4.5, 8.5], [9, -4.5, 7.5], [-10, -13.5, 9.5], [10, -13.5, 8], [-4.8, -9, 7], [4.8, -9, 9],
].map((p) => Object.freeze(p)));

// The raised fern island in the hall's middle: a low stone ring, a tree fern and ferns on it. The loop round it is
// 2.2 m or more wide to the palms and the doors' lines.
export const ISLAND = Object.freeze({ x: 0, z: -9, r: 1.4 });
// Banana plants in the hall's four corners, tree ferns, bird-of-paradise, monstera and hibiscus: [x, z] (a tree fern
// and a banana also carry a height; all grown on a hashed look).
export const BANANA_SPOTS = Object.freeze([[-12.4, -1.7], [12.4, -1.7], [-12.4, -16.3], [12.4, -16.3]].map((p) => Object.freeze(p)));
export const TREE_FERN_SPOTS = Object.freeze([[-6.6, -12.6], [6.6, -12.6], [-6.6, -5.4], [6.6, -5.4], [0.25, -9.1]].map((p) => Object.freeze(p)));
export const BIRD_SPOTS = Object.freeze([[-11.4, -5.8], [11.4, -5.8], [-11.4, -12.2], [11.4, -12.2]].map((p) => Object.freeze(p)));
export const MONSTERA_SPOTS = Object.freeze([[-2.9, -3.3], [2.9, -3.3], [-2.9, -14.7], [2.9, -14.7]].map((p) => Object.freeze(p)));
export const HIBISCUS_SPOTS = Object.freeze([[-5.2, -1.5], [5.2, -1.5]].map((p) => Object.freeze(p)));
// Two orchid benches along the north wall (0.9 m deep, 4 m long, 0.75 m high), five pots on each.
export const ORCHID_BENCHES = Object.freeze([
  Object.freeze({ x: -7.5, z: -16.7, w: 4, d: 0.9, h: 0.75 }),
  Object.freeze({ x: 7.5, z: -16.7, w: 4, d: 0.9, h: 0.75 }),
]);

// The fountain court: the Park's two-tier fountain (parkfountain.js), the path from the spawn runs round it.
export const FOUNTAIN = Object.freeze({ x: 0, z: 14, r: 3.2 });

// The potting bench: the can hangs by it, the seed tray stands on it, and the kitchen bed beyond takes the sprouts.
export const POTTING = Object.freeze({ x: 22, z: 14, w: 3, d: 0.9, h: 0.85, canHome: Object.freeze({ x: 20.2, z: 15.6 }), tray: Object.freeze({ x: 22.6, z: 14 }) });
export const KITCHEN_BED = Object.freeze({ x: 28, z: 11.5, w: 4, d: 2 });
export const SPROUT_SPOTS = Object.freeze([[26.7, 11.1], [27.4, 12], [28, 11.2], [28.7, 12], [29.3, 11.2]].map((p) => Object.freeze(p)));

// The gardener's seed packets: three sets of five spots on open ground (the room seed or the walk count picks one).
// A hall spot, a pond spot, a court spot, a bench spot, a bed spot in each, every one on walkable ground.
const pt = (x, z) => Object.freeze({ x, z });
export const SEED_SPOT_SETS = Object.freeze([
  Object.freeze([pt(-21.5, 10.6), pt(-1.5, 24.5), pt(-10.4, -14.9), pt(7.6, -14.2), pt(26, 20)]),
  Object.freeze([pt(-30.4, 24.4), pt(8, 9), pt(12.6, -3.4), pt(-12.8, -14.7), pt(18.5, 8.5)]),
  Object.freeze([pt(-14.5, 19.5), pt(3.5, 3.2), pt(0.6, -16.3), pt(-3.6, -1.2), pt(31, 8)]),
]);
// Eight candidate pots for the watering job: four hall pots, four garden pots (the room seed picks four).
export const WATER_POT_SPOTS = Object.freeze([
  pt(-6.8, -2.6), pt(6.8, -2.6), pt(-12.4, -10.8), pt(12.4, -10.8), pt(-9, 12), pt(9, 12), pt(14, 24), pt(-16, 26),
]);

// ---------------------------------------------------------------------------------------------------------------------
// MILESTONE G3: THE GARDEN FILLS. The spawn court, the potting shed, the beds, hedges, trees, the perches, rests, finds
// and the rest of the area record's data. Pure data, no THREE. (A tree, a hedge or a stack is a collider circle; a bed,
// a cushion and a flagstone are flat, so a cat walks over them.)
// ---------------------------------------------------------------------------------------------------------------------
const P2 = (x, z) => Object.freeze({ x, z });

// The spawn court: gravel, two lamps, a bench, the gate's signpost at the south edge (the real gate is milestone G4).
export const COURT = Object.freeze({ x0: -8, x1: 8, z0: 26, z1: 36 });
export const COURT_LAMPS = Object.freeze([P2(-5.5, 27.5), P2(5.5, 27.5)]);
export const COURT_BENCH = Object.freeze({ x: -5.5, z: 32.5, w: 1.6, d: 0.5, y: 0.5 });
export const SIGNPOST = P2(0, 34.6);
// Clipped hedges (run start, run end), 1 m high, 0.8 m thick.
export const HEDGES = Object.freeze([[-14, 7.3, -10, 7.3], [10, 7.3, 14, 7.3], [8.5, 31, 13.5, 31], [-13.5, 31, -8.5, 31]].map((h) => Object.freeze(h)));
// The two catnip beds (flat, walked over): each is an `eat` rest at its middle.
export const CATNIP_BEDS = Object.freeze([Object.freeze({ x: -12, z: 11.5, w: 2.4, d: 1.2 }), Object.freeze({ x: 12, z: 11.5, w: 2.4, d: 1.2 })]);
// The sunny bench on the flagstones (a nap cushion on the stones south of it), the pond bench, the fallen log.
export const SUNNY_BENCH = Object.freeze({ x: -12, z: 24, w: 1.6, d: 0.5, y: 0.5 });
export const POND_BENCH = Object.freeze({ x: -25, z: 27.5, w: 1.6, d: 0.5, y: 0.5 });
export const LOG = Object.freeze({ x: -34, z: 20, length: 3.2, r: 0.42, y: 0.8 });
// The potting shed: 7 x 5 at (28, 16), door in the west wall, roof 2.4 m. Solid (the door is painted).
export const SHED = Object.freeze({ x: 28, z: 16, w: 7, d: 5, roof: 2.4, door: Object.freeze({ x: 24.5, z: 16, w: 1.1, h: 1.9 }) });
export const RAIN_BARREL = Object.freeze({ x: 29.4, z: 19.4, r: 0.5, h: 1.3 });
export const POT_STACKS = Object.freeze([Object.freeze({ x: 27.6, z: 20.5, h: 0.7 }), Object.freeze({ x: -16.5, z: 14.5, h: 0.7 })]);
export const COLD_FRAMES = Object.freeze([Object.freeze({ x: 17.5, z: 22.7, w: 1.8, d: 0.9, h: 0.8 }), Object.freeze({ x: 20.5, z: 22.7, w: 1.8, d: 0.9, h: 0.8 })]);
export const BOX_SPOT = P2(24.5, 22.5);
// Outer trees: [x, z, height] round the edges (a trunk collider each); the willow at the pond is the tallest.
export const TREE_SPOTS = Object.freeze([
  [-37, -30, 6.5], [-35.5, -22, 7], [-37.5, -14, 6], [-35.5, -6, 7.5], [-37, 2, 6.5], [-36, 8, 7],
  [37, -30, 6.5], [35.5, -21, 7], [37.5, -12, 6], [35.5, -4, 7.5], [37, 4, 6.5], [36.5, 12, 6],
  [-20, -34, 6.5], [-6, -34.5, 7], [8, -34, 6], [22, -34.5, 6.5], [-34.5, 12.5, 9], [-37, 26, 6.5], [-36, 32.5, 7],
  [36, 24, 6], [35, 29.5, 6.5], [37, 33, 7], [-20, 34, 5.5], [20, 34.5, 5.5],
].map((t) => Object.freeze(t)));

// THE PERCHES. One hop gains at most 1.6 (2.2 with Spring Paws) and reaches 1.2 m to a perch at or under y 1, 2.6 m above it
// (src/climbing.js). The shed roof: ground -> pot stack 0.7 -> rain barrel 1.3 -> roof 2.4 (across 2.4): three hops, none over
// 1.1 (the barrel is also one hop off the ground, so the roof is two for a cat who jumps straight there). Nothing here needs a skill.
export const SHED_ROOF = Object.freeze({ x: 29.5, z: 17, y: SHED.roof, kind: 'roof', label: 'the potting shed roof', vantage: true });
export const GREENHOUSE_PERCHES = Object.freeze([
  Object.freeze({ x: POT_STACKS[0].x, z: POT_STACKS[0].z, y: POT_STACKS[0].h, kind: 'crate' }),
  Object.freeze({ x: RAIN_BARREL.x, z: RAIN_BARREL.z, y: RAIN_BARREL.h, kind: 'crate', label: 'the rain barrel' }),
  SHED_ROOF,
  Object.freeze({ x: POT_STACKS[1].x, z: POT_STACKS[1].z, y: POT_STACKS[1].h, kind: 'crate' }),
  ...COLD_FRAMES.map((f) => Object.freeze({ x: f.x, z: f.z, y: f.h, kind: 'crate' })),
  Object.freeze({ x: COURT_BENCH.x, z: COURT_BENCH.z, y: COURT_BENCH.y, kind: 'furniture' }),
  Object.freeze({ x: SUNNY_BENCH.x, z: SUNNY_BENCH.z, y: SUNNY_BENCH.y, kind: 'furniture' }),
  Object.freeze({ x: POND_BENCH.x, z: POND_BENCH.z, y: POND_BENCH.y, kind: 'furniture' }),
  Object.freeze({ x: LOG.x, z: LOG.z, y: LOG.y, kind: 'tree', label: 'the fallen willow log' }),
  ...ORCHID_BENCHES.map((o) => Object.freeze({ x: o.x, z: o.z + 0.5, y: o.h, kind: 'furniture' })),
]);

// THE RESTS (src/propsets.js SETS.greenhouse; test/greenhousegame.test.js holds the two equal): the catnip beds (`eat`), a
// sunbeam on the hall's warm tiles and a cushion by the sunny bench (`nap`), the fountain's rim (`drink`).
export const GREENHOUSE_RESTS = Object.freeze([
  Object.freeze({ id: 'greenhouse-eat-1', kind: 'eat', x: CATNIP_BEDS[0].x, z: CATNIP_BEDS[0].z, mesh: false }),
  Object.freeze({ id: 'greenhouse-eat-2', kind: 'eat', x: CATNIP_BEDS[1].x, z: CATNIP_BEDS[1].z, mesh: false }),
  Object.freeze({ id: 'greenhouse-nap-1', kind: 'nap', x: -7.3, z: -8.8, mesh: false }),
  Object.freeze({ id: 'greenhouse-nap-2', kind: 'nap', x: -12, z: 25.4, mesh: true }),
  Object.freeze({ id: 'greenhouse-drink-1', kind: 'drink', x: 0, z: 17.7, mesh: false }),
]);
export const GREENHOUSE_HIDES = Object.freeze([P2(-31.8, 13.2), P2(3.5, 8.5), P2(30, 11)]);

export const GREENHOUSE_COLLECTIBLES = Object.freeze([
  Object.freeze({ id: 'greenhouse-1', x: -20.5, z: 31, label: 'a snail shell' }),
  Object.freeze({ id: 'greenhouse-2', x: 33.5, z: 26.5, label: 'a tiny brass trowel' }),
  Object.freeze({ id: 'greenhouse-3', x: -31, z: 10, label: 'a blue pot shard' }),
  Object.freeze({ id: 'greenhouse-4', x: -11.4, z: -7.9, label: 'a dried pink rose' }),
  Object.freeze({ id: 'greenhouse-5', x: 35.2, z: 15.5, label: 'a glass marble' }),
]);
// Stage A's three scenic spots (the orchid and butterfly ones come with the rooms). Ids are load-bearing once shipped.
export const GREENHOUSE_SCENICS = Object.freeze([
  Object.freeze({ id: 'greenhouse-palms', x: 0, z: -6.2, label: 'the Palm House' }),
  Object.freeze({ id: 'greenhouse-pond', x: -26, z: 10.4, label: 'the lily pond' }),
  Object.freeze({ id: 'greenhouse-shed', x: 23.1, z: 17.4, label: 'the potting shed' }),
]);
export const GREENHOUSE_TIPPABLES = Object.freeze([
  Object.freeze({ x: 17.5, z: 19.2, kind: 'can' }), Object.freeze({ x: -9.8, z: 16.8, kind: 'can' }),
  Object.freeze({ x: 12.5, z: 17.6, kind: 'pot' }), Object.freeze({ x: -14.2, z: 21.4, kind: 'pot' }), Object.freeze({ x: 6.3, z: 25.2, kind: 'pot' }),
  Object.freeze({ x: -3.4, z: 33.2, kind: 'bin' }),
]);
export const GREENHOUSE_BOXES = Object.freeze([BOX_SPOT]);
export const GREENHOUSE_CRITTERS = Object.freeze([
  Object.freeze({ type: 'frog', x: -18.6, z: 18 }), Object.freeze({ type: 'frog', x: -29.5, z: 11.2 }), Object.freeze({ type: 'frog', x: -25, z: 25.6 }),
  Object.freeze({ type: 'bird', x: 3.6, z: 10.6 }), Object.freeze({ type: 'bird', x: -14.5, z: 14 }), Object.freeze({ type: 'bird', x: 8.5, z: 21.5 }),
  Object.freeze({ type: 'bird', x: -8, z: 28.5 }), Object.freeze({ type: 'bird', x: 21.5, z: 10 }),
]);
// The moments (labels are filled from the word tables when the area is built).
export const GREENHOUSE_MOMENTS = Object.freeze([
  Object.freeze({ id: 'frog-plop', type: 'frog', x: -22.5, z: 19.5, from: P2(-19, 18.5) }),
  Object.freeze({ id: 'sparrow-bath', type: 'bird', x: 1.6, z: 11, from: P2(7, 7) }),
]);
export const GREENHOUSE_POIS = Object.freeze([
  [0, 22], [-18, 27], [16, 18], [0, -5.5], [-8, 4.5], [30, 25], [-30, 31], [34, 7], [8, 3.5], [-32, 4], [-6, -14.5],
].map(([x, z]) => Object.freeze({ x, z })));

// The three finds stage A can make (the rest are stage B's rooms; their ids are reserved in greenhousepages.js). Each its own way
// at its own spot: `still` seconds standing still within the ring (rMin..r) of the spot at the height; or a rest of that kind.
export const GREENHOUSE_FIND_ZONES = Object.freeze({
  palm: Object.freeze([Object.freeze({ x: ISLAND.x, z: ISLAND.z, rMin: 1.7, r: 3.4, y: 0, dy: 0.6, still: 2 })]),
  koi: Object.freeze([Object.freeze({ x: -26, z: 10.6, r: 1.8, y: 0, dy: 0.6, still: 3 })]),
  catnip: Object.freeze(CATNIP_BEDS.map((b) => Object.freeze({ x: b.x, z: b.z, r: 1.2, rest: 'eat' }))),
  orchid: Object.freeze([]),
  cactus: Object.freeze([]),
  butterfly: Object.freeze([]),
});

// THE GOLD (src/goldmice.js GOLD_MICE.greenhouse; test/greenhousegold.test.js holds the two equal): the shed's roof (the three-hop climb),
// the hall's north-west corner behind the banana plants, the willow log by the pond (one hop).
export const GREENHOUSE_GOLD = Object.freeze([
  Object.freeze({ id: 'gm-green-1', x: SHED_ROOF.x, z: SHED_ROOF.z, y: SHED_ROOF.y }),
  Object.freeze({ id: 'gm-green-2', x: -11.2, z: -16.9, y: 0 }),
  Object.freeze({ id: 'gm-green-3', x: LOG.x, z: LOG.z, y: LOG.y }),
]);
// Under the Palm House (the rain stays out): a camera inside the hall's footprint and under its roof.
export const underGlass = (x, y, z) => x > PALM_HOUSE.x0 && x < PALM_HOUSE.x1 && z > PALM_HOUSE.z0 && z < PALM_HOUSE.z1 && y < PALM_HOUSE.ridge + 1;

const c = (x, z, r) => Object.freeze({ x, z, r });
// Circles along a straight run (the collider list is circles only), a wall's thickness apart.
const run = (x0, z0, x1, z1, r = 0.4, gap = 0.7) => {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / gap));
  return Array.from({ length: n + 1 }, (_, i) => c(x0 + ((x1 - x0) * i) / n, z0 + ((z1 - z0) * i) / n, r));
};
const HALF_DOOR = PALM_HOUSE.doorW / 2;
// The house's walls at the plinth, each door left open (the frame is solid, the doors are gaps).
function houseWalls() {
  const { x0, x1, z0, z1 } = PALM_HOUSE;
  const zc = (z0 + z1) / 2;
  const out = [];
  for (const z of [z0, z1]) {
    out.push(...run(x0, z, -HALF_DOOR - 0.4, z), ...run(HALF_DOOR + 0.4, z, x1, z));
  }
  for (const x of [x0, x1]) {
    out.push(...run(x, z0, x, zc - HALF_DOOR - 0.4), ...run(x, zc + HALF_DOOR + 0.4, x, z1));
  }
  return out;
}
// The shed's four walls (circles right round it; the door in the west wall is painted on).
function shedWalls() {
  const x0 = SHED.x - SHED.w / 2;
  const x1 = SHED.x + SHED.w / 2;
  const z0 = SHED.z - SHED.d / 2;
  const z1 = SHED.z + SHED.d / 2;
  // and three wide circles fill the inside, so the shed is solid to the cat (the roof is reached by perches).
  const fill = [x0 + 1.4, SHED.x, x1 - 1.4].map((x) => c(x, SHED.z, 1.4));
  return [...run(x0, z0, x1, z0), ...run(x0, z1, x1, z1), ...run(x0, z0 + 0.7, x0, z1 - 0.7), ...run(x1, z0 + 0.7, x1, z1 - 0.7), ...fill];
}
export const GREENHOUSE_COLLIDERS = Object.freeze([
  ...houseWalls(),
  ...PALM_SPOTS.map(([x, z]) => c(x, z, 0.6)),
  c(ISLAND.x, ISLAND.z, ISLAND.r),
  ...BANANA_SPOTS.map(([x, z]) => c(x, z, 0.5)),
  ...BIRD_SPOTS.map(([x, z]) => c(x, z, 0.45)),
  ...HIBISCUS_SPOTS.map(([x, z]) => c(x, z, 0.5)),
  ...ORCHID_BENCHES.flatMap((b) => run(b.x - b.w / 2 + 0.45, b.z, b.x + b.w / 2 - 0.45, b.z, 0.5, 0.9)),
  c(FOUNTAIN.x, FOUNTAIN.z, FOUNTAIN.r),
  ...run(POTTING.x - POTTING.w / 2 + 0.45, POTTING.z, POTTING.x + POTTING.w / 2 - 0.45, POTTING.z, 0.5, 0.9),
  // G3: the lamps and the signpost in the court, benches, hedges, the shed (solid all round), the barrel, stacks, cold frames, the log, trees
  ...COURT_LAMPS.map((l) => c(l.x, l.z, 0.25)),
  c(SIGNPOST.x, SIGNPOST.z, 0.25),
  ...[COURT_BENCH, SUNNY_BENCH, POND_BENCH].flatMap((b) => run(b.x - 0.5, b.z, b.x + 0.5, b.z, 0.35, 1)),
  ...HEDGES.flatMap((h) => run(h[0], h[1], h[2], h[3], 0.4, 0.7)),
  ...shedWalls(),
  c(RAIN_BARREL.x, RAIN_BARREL.z, RAIN_BARREL.r),
  ...POT_STACKS.map((s) => c(s.x, s.z, 0.4)),
  ...COLD_FRAMES.map((f) => run(f.x - 0.45, f.z, f.x + 0.45, f.z, 0.45, 0.9)).flat(),
  ...run(LOG.x, LOG.z - LOG.length / 2 + 0.5, LOG.x, LOG.z + LOG.length / 2 - 0.5, 0.45, 0.9),
  ...TREE_SPOTS.map(([x, z]) => c(x, z, 0.5)),
]);

export function greenhouseArea() {
  return {
    name: GREENHOUSE_NAME,
    bounds: { ...GREENHOUSE_BOUNDS },
    spawn: { ...GREENHOUSE_SPAWN },
    colliders: GREENHOUSE_COLLIDERS.map((k) => ({ ...k })),
    waters: [{ ...POND }],
    pois: GREENHOUSE_POIS.map((p) => ({ ...p })),
    perches: GREENHOUSE_PERCHES.map((p) => ({ ...p })),
    collectibles: GREENHOUSE_COLLECTIBLES.map((k) => ({ ...k })),
    scenics: GREENHOUSE_SCENICS.map((k) => ({ ...k })),
    tippables: GREENHOUSE_TIPPABLES.map((k) => ({ ...k })),
    boxes: GREENHOUSE_BOXES.map((k) => ({ ...k })),
    critterSpawns: GREENHOUSE_CRITTERS.map((k) => ({ ...k })),
    moments: GREENHOUSE_MOMENTS.map((k) => ({ ...k, from: { ...k.from } })),
  };
}
