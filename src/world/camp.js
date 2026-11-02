// The clan's camp in each territory: a bramble den and the leader's rock, set
// in the territory's camp disc (rivalclans.js DISCS), and the seats the camp's
// cats sit on (Clan Life Part 1, Task 2).
//
// campLayout is pure (no THREE): everything derives from the area id, the disc
// and one hand-probed turn per camp, so both devices in a co-walk agree with no
// message. addCamp draws it and pushes its two colliders. World files call it
// whatever the picks: Legacy sees the same den and rock.
//
// The Gorge's camp (part 4, K3) is a ledge camp: its den is a cave cut into
// the rock behind the Wide Ledge (gorgeshape.js CAMP_DEN), so its seats are
// authored (LEDGE_CAMPS) rather than turned, the den has no dome and no
// collider (den.cave), and addCamp draws the leader's rock and the den's
// bedding instead. Probe numbers, on the built Gorge: the rock (8.3,41.5)
// r 0.6 sits 1.9m in from the lip (x 5.8) and 0.90m from its edge to the
// patrol ring (0.75 needed), so it can come no nearer the lip; every seat is
// 0.6m or more off the rock's edge and 0.5m or more from every other seat;
// every seat in the den is 1.2m or more from its walls; every seat stands at
// y 8 with no slope (test/gorgeclan.test.js).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { litMaterial, surfaceProps } from '../render/materials.js';
import { DISCS } from '../rivalclans.js';
import { castFor } from '../clancast.js';
import { seatOnGround } from '../ground.js';
import { seedFromCode, mulberry32 } from '../rng.js';

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

// ---------------------------------------------------------------------------
// The camp's dressing (polish-camps): a low bramble ring round the camp with
// one gap, a sandy clearing inside it, a moss nest under each elder and kit,
// and a fresh-kill pile beside the leader's rock. All of it is visual only:
// no collider, no seat, no route changes. campDressing is pure (no THREE) and
// seeded from the area id alone (never walkRng), so every device agrees.
const RING_IN = 0.6;          // the ring's radius: disc.r - 0.6
const RING_GAP_HALF = 0.33;   // radians either side of the gap's centre
const RING_STEP = 0.55;       // metres of arc per clump
const RING_JITTER = 0.12;     // ± radial jitter, metres
const CLUMP_S = [0.8, 1.2];
const CLUMP_H = [0.3, 0.55];
// A clump's footprint at s = 1 (the drawn clump's horizontal radius is
// CLUMP_R · s). A clump is dropped where it would meet a collider, with
// 0.25 m at least (CLUMP_R · s + 0.05, which is 0.21 to 0.29 m).
export const CLUMP_R = 0.2;
const CLUMP_SEAT_GAP = 0.5;   // from any seat, and from the den's and rock's edges
const CLEARING_IN = 0.7;      // the clearing's radius: ring.r - 0.7
const NEST_R = 0.4;
// The fresh-kill pile: tried at these distances from the rock's centre and
// turns off its centre-ward direction, first fit wins (the deputy stands
// straight centre-ward, so the pile sits to one side of her).
const KILL_D = [1.1, 1.3, 1.5];
const KILL_TURNS = [0.9, -0.9, 1.2, -1.2, 0.6, -0.6, 1.45, -1.45];
const KILL_SEAT_GAP = 0.6;
const KILL_EDGE_GAP = 0.3;
// A ledge camp's pile is authored: on the Wide Ledge (y 8), 1.2 m off the
// deputy and 1.03 m off the rock's edge, to the deputy's south.
const LEDGE_KILL = frozen({ gorge: frozen({ x: 9.4, z: 42.7 }) });

/**
 * campDressing(areaId, colliders = []) -> null | {
 *   ring: null | { r, gap: { a, half }, clumps: [{ x, z, s, h, rot }] },
 *   clearing: null | { x, z, r }, nests: [{ x, z, r }], kill: { x, z } }
 *
 * The camp's dressing, positions only. `colliders` is the area's collider
 * list as addCamp sees it: a clump that would meet one is dropped (every slot
 * draws its numbers first, so a dropped clump never shifts the others). Every
 * clump keeps 0.5 m off every seat and off the den's and the rock's edges. The
 * ring's gap is centred on CAMP_TURN + π, the side away from the den. A ledge
 * camp has no ring and no clearing. Null where campLayout is null. A fresh
 * object every call.
 */
export function campDressing(areaId, colliders = []) {
  const L = campLayout(areaId);
  if (!L) return null;
  const seats = [L.seats.leader, L.seats.deputy, ...L.seats.elders, ...L.seats.kits];
  const nests = [...L.seats.elders, ...L.seats.kits].map((s) => ({ x: s.x, z: s.z, r: NEST_R }));
  if (L.den.cave) {
    return { ring: null, clearing: null, nests, kill: { ...LEDGE_KILL[areaId] } };
  }
  const { cx, cz, r } = DISCS[areaId];
  const near = (p, q) => Math.hypot(p.x - q.x, p.z - q.z);
  const cols = Array.isArray(colliders) ? colliders : [];

  const ringR = r - RING_IN;
  const gapA = CAMP_TURN[areaId] + Math.PI;
  const span = Math.PI * 2 - RING_GAP_HALF * 2;
  const n = Math.round((span * ringR) / RING_STEP);
  const rng = mulberry32(seedFromCode(`camp-${areaId}`));
  const lerp = ([lo, hi], t) => lo + (hi - lo) * t;
  const clumps = [];
  for (let i = 0; i < n; i++) {
    // slot centres strictly inside the arc, half a step in from each gap edge
    const a = gapA + RING_GAP_HALF + ((i + 0.5) / n) * span;
    const d = ringR + (rng() * 2 - 1) * RING_JITTER;
    const s = lerp(CLUMP_S, rng());
    const h = lerp(CLUMP_H, rng());
    const rot = rng() * Math.PI * 2;
    const c = { x: cx + Math.cos(a) * d, z: cz + Math.sin(a) * d, s, h, rot };
    if (seats.some((p) => near(c, p) < CLUMP_SEAT_GAP)) continue;
    if ([L.den, L.rock].some((p) => near(c, p) - p.r < CLUMP_SEAT_GAP)) continue;
    if (cols.some((k) => near(c, k) < k.r + CLUMP_R * s + 0.05)) continue;
    clumps.push(c);
  }

  const toCentre = Math.atan2(cz - L.rock.z, cx - L.rock.x);
  let kill = null;
  for (const d of KILL_D) {
    for (const t of KILL_TURNS) {
      const p = { x: L.rock.x + Math.cos(toCentre + t) * d, z: L.rock.z + Math.sin(toCentre + t) * d };
      if (seats.some((q) => near(p, q) < KILL_SEAT_GAP)) continue;
      if ([L.den, L.rock, ...cols].some((k) => near(p, k) - k.r < KILL_EDGE_GAP)) continue;
      kill = p;
      break;
    }
    if (kill) break;
  }
  // Every camp fits at the first try (campdressing.test.js); the fallback is
  // the first spot, so a future layout change still draws a pile.
  if (!kill) kill = { x: L.rock.x + Math.cos(toCentre + KILL_TURNS[0]) * KILL_D[0], z: L.rock.z + Math.sin(toCentre + KILL_TURNS[0]) * KILL_D[0] };

  return {
    ring: { r: ringR, gap: { a: gapA, half: RING_GAP_HALF }, clumps },
    clearing: { x: cx, z: cz, r: ringR - CLEARING_IN },
    nests,
    kill,
  };
}

const BRAMBLE = 0x3b5e2e; // builder.brambleBed's green
const DOORWAY = 0x1c2416;
const ROCK_GREY = 0x8e8c88; // builder.tor's grey, the territories' rock
const DEN_SQUASH = 0.8;
const DOOR = { r: 0.32, y: 0.3 };
// The ledge den's bedding: a flat disc of dry stuff under each elder and kit.
const BEDDING = { r: 0.45, h: 0.06, segments: 12, color: 0x9a7a4a };

// The leader's rock: a dodecahedron squashed to rock.h, its base at y 0.
function campRockMesh(rockSpot) {
  const rockGeo = new THREE.DodecahedronGeometry(rockSpot.r, 0);
  rockGeo.computeBoundingBox();
  const { min, max } = rockGeo.boundingBox;
  const sy = rockSpot.h / (max.y - min.y);
  const rock = new THREE.Mesh(rockGeo, litMaterial(ROCK_GREY, surfaceProps('cobble')));
  rock.name = 'campRock';
  rock.scale.set(1, sy, 1);
  rock.position.set(rockSpot.x, -min.y * sy, rockSpot.z);
  return rock;
}

// A ledge camp: two top-level meshes, the rock and the bedding, and one
// collider, the rock (a cave den is the rock round it). They are separate
// children of the scene, not a Group, because the contact-shadow scan boxes
// one top-level child at a time and the bedding sits ~17 m from the rock: in
// one Group it was over MAX_SPAN and the rock lost its decal. The rock is
// seated on the ground under its own centre. The bedding is one merged mesh at
// the origin, so seating it as the rock is seated would lift it by the ground at
// (0, 0), the floor: instead each disc is baked in at its seat, at the ground
// under that seat (ruling P3). Out of the shadow pass: it is flat.
function addLedgeCamp(scene, area, L) {
  const ground = area.ground ?? null;
  const groundY = (x, z) => (ground && !ground.flat ? ground.y(x, z) : 0);

  const rock = campRockMesh(L.rock);
  if (ground) seatOnGround(rock, ground);
  scene.add(rock);

  const discs = [...L.seats.elders, ...L.seats.kits].map((s) => {
    const g = new THREE.CylinderGeometry(BEDDING.r, BEDDING.r, BEDDING.h, BEDDING.segments);
    g.translate(s.x, groundY(s.x, s.z) + BEDDING.h / 2, s.z);
    return g;
  });
  const bedGeo = mergeGeometries(discs, false);
  for (const g of discs) g.dispose();
  const bedding = new THREE.Mesh(bedGeo, litMaterial(BEDDING.color, surfaceProps('foliage')));
  bedding.name = 'campBedding';
  bedding.userData.noCast = true;
  scene.add(bedding);
  area.colliders.push({ x: L.rock.x, z: L.rock.z, r: L.rock.r });
}

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
 * A ledge camp (L.den.cave) draws its rock and bedding instead, seated on
 * area.ground when given (addLedgeCamp above).
 */
export function addCamp(scene, area, areaId) {
  const L = campLayout(areaId);
  if (!L) return;
  if (L.den.cave) {
    addLedgeCamp(scene, area, L);
    return;
  }
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

  group.add(campRockMesh(L.rock));

  scene.add(group);
  area.colliders.push({ x: L.den.x, z: L.den.z, r: L.den.r }, { x: L.rock.x, z: L.rock.z, r: L.rock.r });
}
