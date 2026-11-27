// Found outfits: the hiding spots, one file per area. Each walk in an area
// picks one of its spots (Task 5's planFind); an area has finds when it has
// spots. Each record is { id, x, z, y, look }: `y` is metres above the ground
// under the spot (as the golden mice), `look` says how the outfit sits there.
//
// ADDING AN AREA: its own file `<area>.js` exporting `<AREA>_SPOTS`, and one
// import and one key below; nothing else. test/foundspots.test.js already
// lists every area's builder and runs its tests (with test/helpers/
// findreach.js) over each area that has spots, so they are the gate:
//   * 10 to 15 spots, none within 15 m of the spawn, inside the core;
//   * a ground spot on open or wading ground reached on foot from the spawn,
//     a raised one at most 3 hops up with no skills, a third on the ground;
//   * it rests on something: a raised spot has the area's own mesh under it
//     (a ray down from 0.3 m above it hits within 5 cm of its height), so
//     it never floats beside a boulder or a bench;
//   * 2 m clear of a golden mouse or a collectible at its own height, 3 m from
//     either yarn-ball spot.
// Keep finds off the points of interest's centres and the race rings too
// (a scenic, the lookout, a ring of the daily zoomies race): she stops there
// for something else, and the find should be a nook of its own. Adding or
// moving any spot changes FIND_KEY. That is intended: builds with different
// spots never share finds.
import { seedFromCode } from '../../rng.js';
import { CRYSTAL_SPOTS } from './crystal.js';
import { DOCKS_SPOTS } from './docks.js';
import { FAIR_SPOTS } from './fair.js';
import { FARM_SPOTS } from './farm.js';
import { GREENHOUSE_SPOTS } from './greenhouse.js';
import { LIGHTHOUSE_SPOTS } from './lighthouse.js';
import { MARKET_SPOTS } from './market.js';
import { MOON_SPOTS } from './moon.js';
import { NEIGHBORHOOD_SPOTS } from './neighborhood.js';
import { PARK_SPOTS } from './park.js';
import { REEF_SPOTS } from './reef.js';
import { SEASIDE_SPOTS } from './seaside.js';
import { SNOWVILLE_SPOTS } from './snowville.js';
import { TREEHOUSE_SPOTS } from './treehouse.js';
import { WOODS_SPOTS } from './woods.js';

// How a find sits in its nook: on a post, hung on a branch, in grass, at the
// water's edge, on a perch.
export const FIND_LOOKS = Object.freeze(['post', 'branch', 'grass', 'water', 'perch']);
export const SPOT_ID = /^fw-[a-z]{2,12}-\d{1,2}$/;

export const FIND_SPOTS = Object.freeze({ crystal: CRYSTAL_SPOTS, docks: DOCKS_SPOTS, fair: FAIR_SPOTS, farm: FARM_SPOTS, greenhouse: GREENHOUSE_SPOTS, lighthouse: LIGHTHOUSE_SPOTS, market: MARKET_SPOTS, moon: MOON_SPOTS, neighborhood: NEIGHBORHOOD_SPOTS, park: PARK_SPOTS, reef: REEF_SPOTS, seaside: SEASIDE_SPOTS, snowville: SNOWVILLE_SPOTS, treehouse: TREEHOUSE_SPOTS, woods: WOODS_SPOTS });

// spotsIn(areaId) -> that area's spots, or [] (own keys only).
const NONE = Object.freeze([]);
export function spotsIn(areaId) {
  return typeof areaId === 'string' && Object.hasOwn(FIND_SPOTS, areaId) ? FIND_SPOTS[areaId] : NONE;
}

// The rules' version, folded into the key: bump it when the way a spot is
// picked changes, so two builds that pick differently never share a find.
export const FIND_RULES = 1;

// findSpotsKey(spots, rules) -> a uint32 naming every spot's place. Two
// devices on one walk compare it (the room profile's `finds`). `look` is left
// out: it changes how the find looks, not where it is.
export function findSpotsKey(spots = FIND_SPOTS, rules = FIND_RULES) {
  const text = Object.keys(spots).sort()
    .map((area) => `${area}:${spots[area].map((s) => `${s.id},${s.x},${s.z},${s.y}`).join(';')}`)
    .join('|');
  return (seedFromCode(text) ^ rules) >>> 0;
}

export const FIND_KEY = findSpotsKey();
