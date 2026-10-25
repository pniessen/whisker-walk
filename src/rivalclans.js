import { RIVAL_PREFIXES, CLAN_SUFFIX } from './clanwords.js';
import { seedFromCode } from './rng.js';

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
//   docks (-31,-14) r 6.5: the west container yard, round the container
//     (-30,-9). Spawn (0,-34), both bridges (0, and -24 which ends at
//     z -5.5), the quays (|z| 6.5; the disc stops 7.5m south of the south
//     quay), the crane chain (-16..-22.5,-9.8..-16.6) and its gold mouse
//     (-17,-13), and the tins (-30,-26) are all outside. Nothing the
//     Docks needs, with or without Sea Legs, is inside.
const DISCS = Object.freeze({
  neighborhood: Object.freeze({ cx: 34, cz: -40, r: 6.5 }),
  park: Object.freeze({ cx: -38, cz: 38, r: 7 }),
  seaside: Object.freeze({ cx: -34, cz: 36, r: 7 }),
  docks: Object.freeze({ cx: -31, cz: -14, r: 6.5 }),
});

const MARK_COUNT = 12;
const PATROL_COUNT = 16;

// Own keys only, and only strings: '__proto__', 'constructor' and non-strings
// are all "no rival" rather than a throw (seedFromCode throws on non-strings).
const discOf = (areaId) => (
  typeof areaId === 'string' && Object.hasOwn(DISCS, areaId) ? DISCS[areaId] : null
);

export function rivalFor(areaId) {
  const d = discOf(areaId);
  if (!d) return null;
  return { name: RIVAL_PREFIXES[areaId] + CLAN_SUFFIX, cx: d.cx, cz: d.cz, r: d.r };
}

export function isTrespassing(areaId, x, z) {
  const d = discOf(areaId);
  if (!d || typeof x !== 'number' || typeof z !== 'number') return false;
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  return Math.hypot(x - d.cx, z - d.cz) <= d.r;
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
