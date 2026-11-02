import { RIVAL_PREFIXES, CLAN_SUFFIX } from './clanwords.js';
import { seedFromCode } from './rng.js';
import { patrolClanFor, clanName } from './clanhomes.js';

// One rival clan per walk area, as a circular territory. Everything derives
// from the area id alone, so both devices in a co-walk agree with no wire
// message (the discipline spots.js's clearSpot follows). A leaf module: no
// THREE, no DOM, and it does not import colony.js (which imports net.js).
// walkRng and Math.random are never used.
//
// Each disc sits in a corner of its area that reads as a cluster of props, and
// stays clear of everything the player must reach. Checked against the shipped
// coordinates in src/world/*.js, as goldmice.js's header records doing:
//
//   neighborhood (34,-40) r 6.5: the north-east lawn corner, round the scatter
//     tree (32,-38) and its leaf litter. Spawn (0,45), POIs (4,-35)/(-6,-40)/
//     (20,-8), yarn-2 (5.5,-36.5), the dog-yard fence (18..26,-28..-20) and the
//     billboard chain (7,-14) are all at least 13m outside it. Gold mice
//     (-11.5,15.5), (7,-14), (-18.5,8.4) are far away. The tree's Sure Claws
//     fork is an optional extra perch, not a requirement.
//   park (-38,38) r 7: the north-west lawn corner, scatter tree (-40,40) and
//     the bush (-35,35). Spawn (0,45) and the south gate path (0,48..20) are
//     38m off; feather-1 (-25,29), the pond (-14,2) and gold mice (3,26),
//     (4.5,27.3), (-35.3,-20.4) are all outside.
//   seaside (-34,36) r 7: the south-west sand, round the rock (-32,30). Spawn
//     (18,42), the pier and sea (x >= 25), the dune chain (-28,18)/(-29,19)
//     (nearest 17m away), the cliff and overlook (z <= -34) and the boxes
//     (19,24)/(-14,4) are all clear.
//   docks (-30.5,-9.5) r 5: the west container yard, with the whole container
//     (colliders (-30,-10.6) and (-30,-7.4), r 1.9) INSIDE the disc. The ring
//     itself clears every docks collider by more than 0.85m (CAT_RADIUS plus
//     0.5) and the canal by the same, so the patrol never walks through the
//     container (test/rivalworld.test.js builds the area and checks every
//     patrol and mark point). Spawn (0,-34), both bridges (0, and -24 which
//     ends at z -5.5, 7.6m from the centre), the crane chain
//     (-16..-22.5,-9.8..-16.6) and its gold mouse (-17,-13), the tins
//     (-30,-26), every POI and perch are all outside, and the far edge
//     (x -35.5) leaves room for a landing inside the map (minX -38).
//   woods (2,-43) r 6: the north glade beyond river-west, facing the Moor,
//     round the scatter tree (builder.tree, scale 1.09) at (3.44,-45.4), which is also a bird perch; 29m from the
//     nearest find. The ring comes within about 1m of the north edge (z -50),
//     so a cat chased out northward is set down sideways, round the ring, by
//     findLanding's fallback.
//   river (5,1) r 6: open ground south-west of the foot of the river bend and
//     east of the bank path (the wet meadow itself centres on (2,28)), round
//     the alder at (7.62,3.12) (builder.tree, scale 1.29); 26m from the nearest find.
//   moor (-1,-43) r 6: the open heath on the north edge, facing the Woods,
//     round the lone thorn (builder.tree, scale 0.89) at (-1.58,-46.25), whose
//     Sure Claws fork is an unlabelled perch; 13m from the nearest find
//     (moor-find-5) and the High Tor lookout, 4m off the nearest path, and the
//     ring clears every collider by 1.9m beyond the cat. Like the Woods' camp
//     it comes within 1m of the north edge (z -50), so a cat chased out
//     northward is set down sideways by findLanding's fallback.
//   pines (-38,41) r 6: the swamp side of the south edge, facing the River,
//     west of the spawn and the truce path, round two pines (builder.pine):
//     one at (-35.92,43.2), scale 1.66, and one of the stand at
//     (-39.31,37.51), scale 1.69. The disc stays 6m from the truce path's
//     centreline, 54m from the bridge foot and 48m from the island's land, so
//     crossing to the island never starts a chase (the island is truce ground
//     inside the Pines and never gets a disc of its own). The spawn (-26,44)
//     is 6.4m beyond the ring, the nearest POI (-34,24) 11.5m; the ring keeps
//     3.5m off bog-2 and clears every collider by 1.2m beyond the cat. The
//     fallen pine by the truce path, a seat and a first hop, is left out.
//   gorge (12,41.5) r 5.2: CliffClan's camp on the Wide Ledge (y 8), part 4
//     K1. Probed on the built Gorge: all 16 patrol points and all 12 marks
//     stand at y 8, every half-metre cell of the disc is y 8 with no slope;
//     the ring keeps 1.0m inside the lip (x 5.8), 2.8m off the back wall
//     (x 20) and 1.3m off the south wall (z 48); its north edge (z 36.3) is
//     0.8m inside the ledge, so the B -> C turn (z 32-35.5) is never camp.
//     No other walkable level lies under the disc or the den, so the 2D test
//     below is exact here. The leader's rock (8.3,41.5) r 0.6 clears the
//     ring by 0.90m beyond its edge. `den` is the cave den cut into the rock
//     behind the ledge (gorgeshape.js CAMP_DEN, held here as a literal so this
//     stays a leaf; a test pins them equal): inside it also counts as the
//     camp, so a chase never lands her there and a patrol buddy stops at its
//     mouth. The patrol walks the ring and notices within NOTICE_DIST, so it
//     chases her only in the den's front (x <= about 21.5): sneaking to the
//     nursery unseen is the game. Only the Gorge's disc has a `den`.
export const DISCS = Object.freeze({
  neighborhood: Object.freeze({ cx: 34, cz: -40, r: 6.5 }),
  park: Object.freeze({ cx: -38, cz: 38, r: 7 }),
  seaside: Object.freeze({ cx: -34, cz: 36, r: 7 }),
  docks: Object.freeze({ cx: -30.5, cz: -9.5, r: 5 }),
  woods: Object.freeze({ cx: 2, cz: -43, r: 6 }),
  river: Object.freeze({ cx: 5, cz: 1, r: 6 }),
  moor: Object.freeze({ cx: -1, cz: -43, r: 6 }),
  pines: Object.freeze({ cx: -38, cz: 41, r: 6 }),
  gorge: Object.freeze({ cx: 12, cz: 41.5, r: 5.2, den: Object.freeze({ minX: 20, maxX: 26, minZ: 37, maxZ: 43 }) }),
});

const MARK_COUNT = 12;
const PATROL_COUNT = 16;

// Own keys only, and only strings: '__proto__', 'constructor' and non-strings
// are all "no rival" rather than a throw (seedFromCode throws on non-strings).
const discOf = (areaId) => (
  typeof areaId === 'string' && Object.hasOwn(DISCS, areaId) ? DISCS[areaId] : null
);

// The four old areas keep their one rival whatever the picks (clan: null). A
// territory's camp takes its clan from the allies rule; none means no patrol.
// Geometry never depends on `picks`.
export function rivalFor(areaId, picks = []) {
  const d = discOf(areaId);
  if (!d) return null;
  if (typeof RIVAL_PREFIXES[areaId] === 'string') {
    return { name: RIVAL_PREFIXES[areaId] + CLAN_SUFFIX, clan: null, cx: d.cx, cz: d.cz, r: d.r };
  }
  const clan = patrolClanFor(areaId, picks);
  if (!clan) return null;
  return { name: clanName(clan), clan, cx: d.cx, cz: d.cz, r: d.r };
}

export function isTrespassing(areaId, x, z) {
  const d = discOf(areaId);
  if (!d || typeof x !== 'number' || typeof z !== 'number') return false;
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  if (Math.hypot(x - d.cx, z - d.cz) <= d.r) return true;
  const den = d.den;
  return !!den && x >= den.minX && x <= den.maxX && z >= den.minZ && z <= den.maxZ;
}

// n evenly spaced points round the circle, from an angle seeded by the id.
// A fresh array of fresh objects every call.
function ring(areaId, n) {
  const d = discOf(areaId);
  if (!d) return [];
  const start = (seedFromCode(areaId) / 4294967296) * Math.PI * 2;
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = start + (i / n) * Math.PI * 2;
    out.push({ x: d.cx + Math.cos(a) * d.r, z: d.cz + Math.sin(a) * d.r });
  }
  return out;
}

export const borderMarks = (areaId) => ring(areaId, MARK_COUNT);
export const patrolPath = (areaId) => ring(areaId, PATROL_COUNT);
