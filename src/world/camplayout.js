// The camp's layout, as plain numbers: where the den, the rock and every seat
// stand in each clan territory. Pure (no THREE); a leaf, so the walk can ask
// for it without loading the camp's drawing (camp.js re-exports all of it).
import { DISCS } from '../rivalclans.js';
import { castFor } from '../clancast.js';

// One turn per camp (radians): the direction from the camp's centre to the den.
// Hand-probed against the built maps in 15-degree steps, starting from the
// side away from the camp tree (so the den's door faces the centre with the
// tree behind the centre) and alternating outwards, keeping the first turn
// whose layout passes every check in test/camp.test.js and
// test/rivalworld.test.js (den and rock clear every other collider by 0.4 m;
// every ground seat on clan ground; eight roaming homes with their circles).
// Woods, river and moor passed at the first step, the away side itself; the
// Pines was turned south by the owner's choice (below). Clearances are
// edge to edge, collider to collider, measured on the shipped maps; the camp
// tree is the nearest collider to the camp in every territory:
//   woods: camp tree (builder.tree, scale 1.09) at (3.44,-45.4), r 0.55. Den
//     3.15 m clear of it, rock 0.96 m.
//   river: the alder (builder.tree, scale 1.29) at (7.62,3.12), r 0.65. Den
//     3.62 m, rock 1.26 m.
//   moor: the lone thorn (builder.tree, scale 0.89) at (-1.58,-46.25), r 0.45.
//     Den 3.75 m, rock 1.41 m.
//   pines: owner's decisions 2026-11-04: "Pines camp: South", then "move the
//     pine". The turn is 1.571 rad, due south (+z is south; the minimap draws
//     north, -z, at the top): the den at (-38,43), the bramble ring's gap
//     facing north, the Highrock at (-39.64,39.53) behind the den. It was
//     2.583 (den and rock on the west and north sides, away from the pines).
//     The east camp pine (builder.pine scale 1.66, r 0.66) stood in the
//     clearing at (-35.92,43.2), 2.35 m from the new den and over it from the
//     south and from the camp's high view; pines.js moves it (CAMP_PINE_TO) to
//     (-33.2,47.6), 8.9 m from the centre and beyond the ring, still one of
//     the swaying near pines, off the truce path (x -26) by 7 m and the spawn
//     (-26,44) by 8 m. The one camp pine left is (-39.31,37.51) scale 1.69,
//     r 0.68, behind the Highrock from the south. Collider to collider: den
//     3.86 m from it (was 2.79) and 4.9 m from the moved pine (was 2.18 from
//     the old spot); rock 0.77 m from it (was 0.86) and over 6 m from the moved
//     one (was 3.43). The disc keeps 6 m off the truce path's centreline, so
//     no seat is on truce ground, and the patrol ring (r 6) keeps 2.2 m off
//     the moved trunk, so it stays clan ground with the usual room.
export const CAMP_TURN = Object.freeze({
  woods: 2.111,
  river: -2.461,
  moor: 1.394,
  pines: 1.571,
});

// Ledge camps, authored whole: { den, rock, seats } in world coordinates, the
// same shape campLayout turns for a disc camp. den.cave: the den is a cave in
// the rock, its point the den's centre, with no dome and no collider (r 0).
// A seat's `face` (the leader's, looking west out over the gorge) is the yaw
// createClanCats gives it instead of facing the camp's centre. Kits 0 and 1,
// and 2 and 3, are the hop pairs, as everywhere.
const frozen = (o) => Object.freeze(o);
export const LEDGE_CAMPS = frozen({
  gorge: frozen({
    den: frozen({ x: 23, z: 40, r: 0, h: 0, cave: true }),
    rock: frozen({ x: 8.3, z: 41.5, r: 0.6, h: 0.8 }),
    seats: frozen({
      leader: frozen({ x: 8.3, z: 41.5, y: 0.8, face: Math.PI / 2 }),
      deputy: frozen({ x: 9.5, z: 41.5 }),
      elders: frozen([frozen({ x: 24.8, z: 38.4 }), frozen({ x: 24.8, z: 41.6 })]),
      kits: frozen([
        frozen({ x: 21.6, z: 38.8 }), frozen({ x: 22.6, z: 39.4 }),
        frozen({ x: 22.6, z: 40.6 }), frozen({ x: 21.6, z: 41.2 }),
      ]),
    }),
  }),
});

// A fresh, unfrozen copy of a ledge camp's record.
function ledgeLayout(areaId) {
  const { cx, cz } = DISCS[areaId];
  const { den, rock, seats } = LEDGE_CAMPS[areaId];
  return {
    cx,
    cz,
    den: { ...den },
    rock: { ...rock },
    seats: {
      leader: { ...seats.leader },
      deputy: { ...seats.deputy },
      elders: seats.elders.map((p) => ({ ...p })),
      kits: seats.kits.map((p) => ({ ...p })),
    },
  };
}

const DEN = { d: 2.0, r: 1.1, h: 0.9 };
const ROCK = { d: 2.2, turn: 2.3, r: 0.6, h: 0.8 };
// Seat distances. Each ground seat stands 0.6 m or more off the den's and the
// rock's edges (camp.test.js), which is a cat's radius and a little more.
const DEPUTY_FROM_ROCK = 1.2;
const ELDER_FROM_DEN = 1.7;
const ELDER_TURN = 0.9;
const KIT_FROM_DEN = 1.9;
const KIT_TURNS = [-0.6, -0.2, 0.2, 0.6];

/**
 * campLayout(areaId) -> { cx, cz, den, rock, seats } | null
 *
 * θ = CAMP_TURN[areaId], u(a) = (cos a, sin a):
 *   den at centre + 2.0·u(θ), its door facing the centre; rock at centre +
 *   2.2·u(θ + 2.3); the leader on the rock's top (y = rock.h); the deputy on
 *   the ground 1.2 m from the rock's centre, towards the camp's centre; the
 *   elders 1.7 m from the den's centre either side of it, at u(θ ± 0.9); the
 *   kits in an arc 1.9 m out in front of the den's door, at u(θ + π + k) for
 *   k = -0.6, -0.2, 0.2, 0.6. Seats are in slot order: elders[0] and
 *   kits[0..1] are the core cats', so a LOW device fills the same seats a HIGH
 *   one does, minus the extras. A fresh object every call.
 */
export function campLayout(areaId) {
  if (castFor(areaId).length === 0) return null;
  if (Object.hasOwn(LEDGE_CAMPS, areaId)) return ledgeLayout(areaId);
  if (!Object.hasOwn(CAMP_TURN, areaId)) return null;
  const { cx, cz } = DISCS[areaId];
  const th = CAMP_TURN[areaId];
  const at = (ox, oz, d, a) => ({ x: ox + Math.cos(a) * d, z: oz + Math.sin(a) * d });
  const den = { ...at(cx, cz, DEN.d, th), r: DEN.r, h: DEN.h };
  const rock = { ...at(cx, cz, ROCK.d, th + ROCK.turn), r: ROCK.r, h: ROCK.h };
  const toCentre = Math.atan2(cz - rock.z, cx - rock.x);
  return {
    cx,
    cz,
    den,
    rock,
    seats: {
      leader: { x: rock.x, z: rock.z, y: rock.h },
      deputy: at(rock.x, rock.z, DEPUTY_FROM_ROCK, toCentre),
      elders: [at(den.x, den.z, ELDER_FROM_DEN, th + ELDER_TURN), at(den.x, den.z, ELDER_FROM_DEN, th - ELDER_TURN)],
      kits: KIT_TURNS.map((k) => at(den.x, den.z, KIT_FROM_DEN, th + Math.PI + k)),
    },
  };
}

// campDiscs(areaId) -> [den, rock] as { x, z, r } (the colliders addCamp
// pushes), or [] where there is no camp. A cave den is no collider, so a ledge
// camp's is [rock]. walk.js keeps colony cats' saved spots out of them.
export function campDiscs(areaId) {
  const L = campLayout(areaId);
  if (!L) return [];
  const rock = { x: L.rock.x, z: L.rock.z, r: L.rock.r };
  return L.den.cave ? [rock] : [{ x: L.den.x, z: L.den.z, r: L.den.r }, rock];
}
