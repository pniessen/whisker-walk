// Where a clan cat may stand: the ground predicate for the camp's seats, the
// roaming homes and the wander round them (Clan Life Part 1, ruling P2).
//
// clanWalkableFor(area, areaId) -> (x, z) => boolean, true only when
//   * isWalkableAt(area, x, z): inside the bounds, clear of every collider by
//     the cat's radius, and CAT_RADIUS or more outside every water footprint,
//     which also keeps it out of every `shallow` wade band (a band lies inside
//     its footprint);
//   * the point is outside area.keepOut (keepOutPoint hands it back unchanged;
//     an area with no keepOut passes);
//   * in the Pines, it is 3 m or more beyond the truce path's edge (the path is
//     3 m wide, so 1.5 + 3 m from every centreline segment) and 3 m or more
//     from the bridge foot: crossing to the island is truce ground, and no clan
//     cat sits on it.
//
// In the Gorge (part 4, K4) the clan's ground is wider than the strays':
// area.clanStandOn (gorgeshape.js CLAN_STAND_ON) adds the path's legs, the
// Lookout, the turn and the Wide Ledge, and the camp den to their onlyOn.
// clanGroundArea(area) is the area as a clan cat sees it: the same record
// with keepOut.onlyOn swapped for clanStandOn, built once per area; an area
// with no clanStandOn is itself. So a clan cat can walk her up the cliff path
// on patrol, and strays still can't.
//
// Its own file so camp.js never imports pines.js (pines.js imports camp.js).
// No rng, no state: both devices judge every point the same.
import { isWalkableAt } from '../player.js';
import { keepOutPoint } from '../keepout.js';
import { TRUCE_PATH, BRIDGE_FOOT } from './pines.js';

const PATH_HALF = 1.5;
const TRUCE_CLEAR = 3;

function segDist(x, z, [x1, z1, x2, z2]) {
  const dx = x2 - x1, dz = z2 - z1;
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (z - z1) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(x - (x1 + t * dx), z - (z1 + t * dz));
}

function onTruceGround(x, z) {
  if (Math.hypot(x - BRIDGE_FOOT.x, z - BRIDGE_FOOT.z) < TRUCE_CLEAR) return true;
  for (const s of TRUCE_PATH) if (segDist(x, z, s) < PATH_HALF + TRUCE_CLEAR) return true;
  return false;
}

const CLAN_AREAS = new WeakMap();

export function clanGroundArea(area) {
  if (!area || typeof area !== 'object' || !Array.isArray(area.clanStandOn)) return area;
  let clan = CLAN_AREAS.get(area);
  if (!clan) {
    clan = { ...area, keepOut: { ...(area.keepOut ?? { rects: [], capsules: [], margin: 0 }), onlyOn: area.clanStandOn } };
    CLAN_AREAS.set(area, clan);
  }
  return clan;
}

export function clanWalkableFor(area, areaId) {
  const pines = areaId === 'pines';
  const clanArea = clanGroundArea(area);
  return (x, z) => {
    if (!isWalkableAt(area, x, z)) return false;
    if (clanArea?.keepOut) {
      const p = keepOutPoint(clanArea, x, z);
      if (p.x !== x || p.z !== z) return false;
    }
    return !(pines && onTruceGround(x, z));
  };
}
