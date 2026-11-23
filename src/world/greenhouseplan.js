// =============================================================================
// THE GREENHOUSE (milestone 0: the spike). Pure data, no THREE, nothing drawn.
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

// Six stand-in palms (the real ones are milestone 2's): they stand round the fern island's loop, clear of the doors.
export const PALM_SPOTS = Object.freeze([
  [-9, -4.5, 8.5], [9, -4.5, 7.5], [-10, -13.5, 9.5], [10, -13.5, 8], [-3.5, -9, 7], [3.5, -9, 9],
].map((p) => Object.freeze(p)));

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
]);

// Where a walk may put its small secrets: open lawn and the hall's floor (all clear of colliders and water).
export const GREENHOUSE_POIS = Object.freeze([[0, 14], [-18, 27], [20, 14], [0, -9]].map(([x, z]) => Object.freeze({ x, z })));

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
