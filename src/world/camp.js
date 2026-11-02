// The clan's camp in each territory: a bramble den and the leader's rock, set
// in the territory's camp disc (rivalclans.js DISCS), and the seats the camp's
// cats sit on (Clan Life Part 1, Task 2).
//
// campLayout is pure (no THREE): everything derives from the area id, the disc
// and one hand-probed turn per camp, so both devices in a co-walk agree with no
// message. addCamp draws it and pushes its two colliders. World files call it
// whatever the picks: Legacy sees the same den and rock.
import * as THREE from 'three';
import { litMaterial, surfaceProps } from '../render/materials.js';
import { DISCS } from '../rivalclans.js';
import { castFor } from '../clancast.js';

// One turn per camp (radians): the direction from the camp's centre to the den.
// Hand-probed against the built maps in 15-degree steps, starting from the
// side away from the camp tree (so the den's door faces the centre with the
// tree behind the centre) and alternating outwards, keeping the first turn
// whose layout passes every check in test/camp.test.js and
// test/rivalworld.test.js (den and rock clear every other collider by 0.4 m;
// every ground seat on clan ground; eight roaming homes with their circles).
// Every camp passed at the first step, the away side itself. Clearances are
// edge to edge, collider to collider, measured on the shipped maps; the camp
// tree is the nearest collider to the camp in every territory:
//   woods: camp tree (builder.tree, scale 1.09) at (3.44,-45.4), r 0.55. Den
//     3.15 m clear of it, rock 0.96 m.
//   river: the alder (builder.tree, scale 1.29) at (7.62,3.12), r 0.65. Den
//     3.62 m, rock 1.26 m.
//   moor: the lone thorn (builder.tree, scale 0.89) at (-1.58,-46.25), r 0.45.
//     Den 3.75 m, rock 1.41 m.
//   pines: the two camp pines (builder.pine), (-35.92,43.2) scale 1.66, r 0.66,
//     and (-39.31,37.51) scale 1.69, r 0.68, turned away from both. Den 2.18 m
//     and 2.79 m clear of them, rock 3.43 m and 0.86 m. The disc keeps 6 m off
//     the truce path's centreline, so no seat is on truce ground.
export const CAMP_TURN = Object.freeze({
  woods: 2.111,
  river: -2.461,
  moor: 1.394,
  pines: 2.583,
});

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
  if (castFor(areaId).length === 0 || !Object.hasOwn(CAMP_TURN, areaId)) return null;
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
// pushes), or [] where there is no camp. walk.js keeps colony cats' saved
// spots out of them.
export function campDiscs(areaId) {
  const L = campLayout(areaId);
  return L ? [{ x: L.den.x, z: L.den.z, r: L.den.r }, { x: L.rock.x, z: L.rock.z, r: L.rock.r }] : [];
}

const BRAMBLE = 0x3b5e2e; // builder.brambleBed's green
const DOORWAY = 0x1c2416;
const ROCK_GREY = 0x8e8c88; // builder.tor's grey, the territories' rock
const DEN_SQUASH = 0.8;
const DOOR = { r: 0.32, y: 0.3 };

/**
 * addCamp(scene, area, areaId) -> void
 *
 * ONE Group, a direct child of the scene, holding three meshes: the den mound,
 * its doorway disc and the rock. mergeStaticProps merges only inside a
 * top-level child, so the camp costs three main-pass draws at most, the
 * contact-shadow scan gives it one decal, and the flat doorway stays out of
 * the shadow pass (userData.noCast). Pushes { x, z, r } colliders for the den
 * and the rock into area.colliders. A no-op where campLayout is null.
 * Materials are made per call (walk.js disposes them at the walk's end).
 */
export function addCamp(scene, area, areaId) {
  const L = campLayout(areaId);
  if (!L) return;
  const th = CAMP_TURN[areaId];
  const group = new THREE.Group();
  group.name = 'clanCamp';

  const den = new THREE.Mesh(
    new THREE.SphereGeometry(L.den.r, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2),
    litMaterial(BRAMBLE, surfaceProps('foliage')),
  );
  den.name = 'campDen';
  den.scale.set(1, DEN_SQUASH, 1);
  den.position.set(L.den.x, 0, L.den.z);
  group.add(den);

  // The doorway on the den's centre-facing side, where the dome's surface is
  // at the door's height.
  const out = th + Math.PI;
  const yr = DOOR.y / DEN_SQUASH;
  const face = Math.sqrt(L.den.r * L.den.r - yr * yr) + 0.01;
  const door = new THREE.Mesh(new THREE.CircleGeometry(DOOR.r, 16), litMaterial(DOORWAY));
  door.name = 'campDoor';
  door.position.set(L.den.x + Math.cos(out) * face, DOOR.y, L.den.z + Math.sin(out) * face);
  door.rotation.y = Math.PI / 2 - out; // the disc's normal (+z) turned to face the centre
  door.userData.noCast = true;
  group.add(door);

  const rockGeo = new THREE.DodecahedronGeometry(L.rock.r, 0);
  rockGeo.computeBoundingBox();
  const { min, max } = rockGeo.boundingBox;
  const sy = L.rock.h / (max.y - min.y);
  const rock = new THREE.Mesh(rockGeo, litMaterial(ROCK_GREY, surfaceProps('cobble')));
  rock.name = 'campRock';
  rock.scale.set(1, sy, 1);
  rock.position.set(L.rock.x, -min.y * sy, L.rock.z);
  group.add(rock);

  scene.add(group);
  area.colliders.push({ x: L.den.x, z: L.den.z, r: L.den.r }, { x: L.rock.x, z: L.rock.z, r: L.rock.r });
}
