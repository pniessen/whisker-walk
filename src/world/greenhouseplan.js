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
]);

export const GREENHOUSE_POIS = Object.freeze([[0, 22], [-18, 27], [16, 18], [0, -5.5]].map(([x, z]) => Object.freeze({ x, z })));

export function greenhouseArea() {
  return {
    name: GREENHOUSE_NAME,
    bounds: { ...GREENHOUSE_BOUNDS },
    spawn: { ...GREENHOUSE_SPAWN },
    colliders: GREENHOUSE_COLLIDERS.map((k) => ({ ...k })),
    waters: [{ ...POND }],
    pois: GREENHOUSE_POIS.map((p) => ({ ...p })),
  };
}
