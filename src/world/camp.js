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
import { litMaterial, surfaceProps, repeatFor } from '../render/materials.js';
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
// CLUMP_R · s). A clump is dropped where its centre is nearer a collider's
// edge than max(0.25, CLUMP_R · s + 0.05): 0.25 to 0.29 m, so the plan's flat
// r + 0.25 holds at every s and the drawn clump still misses the collider.
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
    if (cols.some((k) => near(c, k) < k.r + Math.max(0.25, CLUMP_R * s + 0.05))) continue;
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

const DOORWAY = 0x140f0a;
const ROCK_GREY = 0x8e8c88; // builder.tor's grey, the territories' rock
const DEN_SQUASH = 0.8;

// The flat camps' look (polish-camps). Every number below is drawn from a
// position hash or from campDressing, never from walkRng or Math.random.
const DEN_LOOK = {
  base: 0x2f4a24,      // the woven mound, dark at its foot
  streak: 0x5a7d3a,    // lighter streaks of new growth
  strand: 0x3a4a22,    // the arched bramble strands woven over it
  frame: 0x5a4128,     // the stick arch round the doorway
  bump: 0.05,          // ± share of the radius each corner is pushed in or out
  strands: 7,          // quarter arcs from the ground to the crown
  doorClear: 0.6,      // radians either side of the door kept free of strands
};
// The doorway: an arch (straight sides, round top) leaning back with the dome.
// `at` is how far out from the den's centre its middle sits, at height y.
const DOOR = { w: 0.3, y: 0.3, at: 1.04, tilt: 0.31 };
const FRAME_AT = 1.02;
const RING_LOOK = { greens: [0x2e5524, 0x3f6b2c], foot: 0.62, crown: 1.12 };
const CLEARING = { color: 0xc9b38a, y: 0.015, segments: 28, edge: 0.1 };
const NEST = { moss: 0x6f8f3a, bracken: 0x8a7a48, r: 0.35, tube: 0.09, squash: 0.55 };
const KILL_LOOK = { mouse: 0x7a5a3e, vole: 0x5e4a36, bird: 0x8a8478, wing: 0xa59d8c };

// A position hash in [0, 1): the same corner always moves the same way, so the
// two copies of a vertex on a seam stay together. A millimetre grid and integer
// maths, so it is the same on every device.
function hash01(x, y, z, salt = 0) {
  let h = Math.imul(Math.round(x * 1000) | 0, 0x27d4eb2d)
    ^ Math.imul(Math.round(y * 1000) | 0, 0x165667b1)
    ^ Math.imul(Math.round(z * 1000) | 0, 0x1b873593)
    ^ Math.imul(salt | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
// A placing matrix: scale, then tip about x, then turn about y, then move.
function place(x, y, z, sx, sy, sz, yaw = 0, tip = 0) {
  _q.setFromEuler(_e.set(tip, yaw, 0, 'YXZ'));
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), _q, new THREE.Vector3(sx, sy, sz));
}

const _c = new THREE.Color();
// One part, baked for merging: non-indexed (so every face is flat-shaded, the
// low-poly look), moved by `m`, with position and normal only, plus a colour
// per vertex from colorAt(x, y, z) in world space when given.
function bake(geo, m, colorAt = null) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  g.applyMatrix4(m);
  if (g.attributes.uv) g.deleteAttribute('uv');
  g.computeVertexNormals();
  if (colorAt) {
    const pos = g.attributes.position;
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      colorAt(pos.getX(i), pos.getY(i), pos.getZ(i), _c);
      col[i * 3] = _c.r;
      col[i * 3 + 1] = _c.g;
      col[i * 3 + 2] = _c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  return g;
}

function merged(parts) {
  const g = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

// How high a unit icosahedron's top corners reach (φ / √(1 + φ²)).
const ICO_Y = 1.618033988749895 / Math.hypot(1, 1.618033988749895);
// The turn that puts a unit icosahedron's (φ, 0, 1) corner, one of its four
// widest at y 0, on its x axis.
const ICO_TIP = Math.atan2(1, 1.618033988749895);
const solid = (hex) => (_x, _y, _z, c) => c.setHex(hex);
const vcMaterial = (extra = {}) => litMaterial(0xffffff, { vertexColors: true, ...surfaceProps('foliage'), ...extra });
const angleOff = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

// The den: a woven bramble mound (the old dome, each corner pushed in or out
// by up to 6 %, never outwards round the door), streaked with new growth,
// with bramble strands arched over it, one woven band round its shoulders
// and a short one lower down, and a stick arch round the doorway. One
// vertex-coloured geometry. Every vertex stays within 1.25 m of the den's
// centre and under 1 m (camp.test.js).
function denGeometry(den, out) {
  const { x, z, r } = den;
  const parts = [];

  const dome = new THREE.SphereGeometry(r, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2);
  const pos = dome.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i);
    const py = pos.getY(i);
    const pz = pos.getZ(i);
    let d = (hash01(px, py, pz, 1) * 2 - 1) * DEN_LOOK.bump;
    if (angleOff(Math.atan2(pz, px), out) < 0.7 && py < 0.85) d = -Math.abs(d);
    pos.setXYZ(i, px * (1 + d), py * (1 + d), pz * (1 + d));
  }
  const base = new THREE.Color(DEN_LOOK.base);
  const streak = new THREE.Color(DEN_LOOK.streak);
  parts.push(bake(dome, place(x, 0, z, 1, DEN_SQUASH, 1), (vx, vy, vz, c) => {
    const col = Math.round(Math.atan2(vz - z, vx - x) * 5);
    const t = (0.65 * hash01(col, 0, 0, 2) + 0.35 * hash01(vx, vy, vz, 3)) * (0.35 + 0.65 * Math.min(1, vy / 0.8));
    c.copy(base).lerp(streak, t);
  }));

  // Strands: quarter arcs from the ground up to the crown, none in front of
  // the door.
  const strandAt = (vx, vy, vz, c) => c.setHex(DEN_LOOK.strand).multiplyScalar(0.85 + 0.3 * hash01(vx, vy, vz, 4));
  const free = Math.PI * 2 - DEN_LOOK.doorClear * 2;
  for (let k = 0; k < DEN_LOOK.strands; k++) {
    const a = out + DEN_LOOK.doorClear + (free * k) / (DEN_LOOK.strands - 1) + (hash01(x, k, z, 5) - 0.5) * 0.2;
    const R = r * (0.99 + 0.02 * hash01(x, k, z, 6)); // in and out of the bumps, woven
    const arc = new THREE.TorusGeometry(R, 0.035 + 0.01 * hash01(x, k, z, 7), 4, 8, Math.PI / 2);
    parts.push(bake(arc, place(x, 0, z, 1, DEN_SQUASH, 1, -a), strandAt));
  }
  // A woven band round the shoulders (above the door), and a short low one
  // round the back.
  const ringAt = (y) => Math.sqrt(r * r - (y / DEN_SQUASH) ** 2);
  const band = new THREE.TorusGeometry(ringAt(0.68), 0.04, 4, 24);
  parts.push(bake(band, place(x, 0.68, z, 1, 1, 1, 0, Math.PI / 2), strandAt));
  const low = new THREE.TorusGeometry(ringAt(0.32), 0.038, 4, 18, Math.PI * 2 - 1.6);
  parts.push(bake(low, place(x, 0.32, z, 1, 1, 1, -(out + 0.8), Math.PI / 2), strandAt));

  // The doorway's stick arch: two elliptic half-rings, feet on the ground,
  // leaning back with the dome like the door.
  const yaw = Math.PI / 2 - out;
  const foot = -DOOR.y / Math.cos(DOOR.tilt);
  const frameAt = (vx, vy, vz, c) => c.setHex(DEN_LOOK.frame).multiplyScalar(0.8 + 0.4 * hash01(vx, vy, vz, 8));
  for (const [Rf, tube, top] of [[0.36, 0.04, 0.38], [0.42, 0.035, 0.44]]) {
    const arch = new THREE.TorusGeometry(Rf, tube, 4, 12, Math.PI);
    arch.scale(1, (top - foot) / Rf, 1);
    arch.translate(0, foot, 0);
    arch.rotateX(-DOOR.tilt);
    const fx = x + Math.cos(out) * FRAME_AT;
    const fz = z + Math.sin(out) * FRAME_AT;
    parts.push(bake(arch, place(fx, DOOR.y, fz, 1, 1, 1, yaw), frameAt));
  }
  return merged(parts);
}

// The dark doorway: an arch shape (straight sides, a round top) on the den's
// centre-facing side, leaning back with the dome so it sits just outside it.
// Baked in world space.
function doorGeometry(den, out) {
  const w = DOOR.w;
  const foot = -DOOR.y / Math.cos(DOOR.tilt);
  const shape = new THREE.Shape();
  shape.moveTo(-w, foot);
  shape.lineTo(w, foot);
  shape.lineTo(w, 0);
  shape.absarc(0, 0, w, 0, Math.PI, false);
  shape.lineTo(-w, foot);
  const geo = new THREE.ShapeGeometry(shape, 6);
  // the arch's normal (+z) turned to face the centre
  geo.applyMatrix4(place(den.x + Math.cos(out) * DOOR.at, DOOR.y, den.z + Math.sin(out) * DOOR.at, 1, 1, 1, Math.PI / 2 - out, -DOOR.tilt));
  return geo;
}

// The Highrock: the leader's dodecahedron (she stands on it at rock.h), a
// tall back stone on the side away from the camp's centre rising to ~1.5 m,
// and a smaller step stone to one side. All within 0.75 m of the rock's centre
// (camp.test.js); the collider is still the rock's r 0.6. Baked in world space.
function highrockGeometry(rockSpot, cx, cz) {
  const base = new THREE.DodecahedronGeometry(rockSpot.r, 0);
  base.computeBoundingBox();
  const { min, max } = base.boundingBox;
  const sy = rockSpot.h / (max.y - min.y);
  base.scale(1, sy, 1);
  base.translate(0, -min.y * sy, 0);

  const away = Math.atan2(rockSpot.z - cz, rockSpot.x - cx);
  const at = (d, a) => [Math.cos(a) * d, Math.sin(a) * d];
  const [bx, bz] = at(0.45, away);
  const back = new THREE.DodecahedronGeometry(1, 0);
  back.applyMatrix4(place(bx, 0.72, bz, 0.27, 0.78, 0.19, Math.PI / 2 - away));
  const side = hash01(rockSpot.x, 0, rockSpot.z, 9) < 0.5 ? 1 : -1;
  const [stx, stz] = at(0.48, away + side * 1.25);
  const step = new THREE.DodecahedronGeometry(1, 0);
  step.applyMatrix4(place(stx, 0.2, stz, 0.2, 0.27, 0.2, away));

  for (const g of [base, back, step]) g.translate(rockSpot.x, 0, rockSpot.z);
  const geo = mergeGeometries([base, back, step], false);
  for (const g of [base, back, step]) g.dispose();
  geo.computeVertexNormals();
  return geo;
}

// THREE's generateUUID takes four Math.random() draws for every Object3D,
// geometry, material, texture and Shape, and test/flattrace.test.js seeds
// Math.random for each build: the critters', gold mice's and ghosts' draws
// come after it (ruling F33 pins the Moor's build at 7944 draws). Before
// polish-camps a flat camp made the Group and three meshes (den, doorway,
// rock), each with one geometry and one material, plus what the rock's cobble
// material makes: 44 draws (camp.test.js). It still makes exactly those on
// Math.random, in addCamp. Everything else it builds
// (every part geometry, the ring, the clearing, the nests, the pile and their
// materials) is made while Math.random is a local stream seeded by the area
// id, so its uuids are the same on every device and the build's draws are
// what they were. A uuid is only a name: nothing in the WebGL renderer keys a
// mesh, geometry or opaque material by it.
function withLocalUuids(areaId, fn) {
  const real = Math.random;
  Math.random = mulberry32(seedFromCode(`camp-uuids-${areaId}`));
  try {
    return fn();
  } finally {
    Math.random = real;
  }
}

// A geometry made under withLocalUuids, handed over to a fresh one (one uuid
// on Math.random) that keeps its attributes.
function adopt(local) {
  const g = new THREE.BufferGeometry();
  for (const [name, attr] of Object.entries(local.attributes)) g.setAttribute(name, attr);
  if (local.index) g.setIndex(local.index);
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

// The bramble ring: each clump two low, squashed icosahedrons side by side
// along the ring (40 triangles), every vertex within CLUMP_R · s of the
// clump's spot and no higher than its h, dark at the foot. One mesh.
function ringMesh(ring, cx, cz) {
  const parts = [];
  for (const c of ring.clumps) {
    const R = CLUMP_R * c.s;
    const along = Math.atan2(c.z - cz, c.x - cx) + Math.PI / 2;
    const ux = Math.cos(along);
    const uz = Math.sin(along);
    const green = new THREE.Color(RING_LOOK.greens[hash01(c.x, c.rot, c.z, 10) < 0.5 ? 0 : 1]);
    const at = (vx, vy, vz, col) => {
      const t = Math.max(0, Math.min(1, vy / c.h));
      col.copy(green).multiplyScalar(RING_LOOK.foot + (RING_LOOK.crown - RING_LOOK.foot) * t * (0.8 + 0.4 * hash01(vx, vy, vz, 11)));
    };
    // [offset along the ring, half-width along, half-depth across, share of h]
    for (const [off, sa, sd, sh] of [[0.3, 0.68, 0.6, 1], [-0.32, 0.64, 0.56, 0.75]]) {
      const top = c.h * sh;
      const sy = (top + 0.03) / (2 * ICO_Y);
      const yaw = -along + Math.sin(c.rot) * 0.15;
      // a widest corner turned onto the lump's long axis, so neighbours touch
      const lump = new THREE.IcosahedronGeometry(1, 0).rotateY(ICO_TIP);
      parts.push(bake(lump, place(c.x + ux * off * R, top - ICO_Y * sy, c.z + uz * off * R, sa * R, sy, sd * R, yaw), at));
    }
  }
  const mesh = new THREE.Mesh(merged(parts), vcMaterial());
  mesh.name = 'campRing';
  mesh.userData.noCast = true;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  return mesh;
}

// The clearing: a sandy, trampled disc with a hash-jittered edge, lifted
// 1.5 cm and pulled towards the camera (polygonOffset) so it never fights the
// ground or a path. A CircleGeometry lying flat at the top level: grass.js's
// flatFootprints reads it as a disc and grows no tufts through it.
function clearingMesh(clearing) {
  const { x, z, r } = clearing;
  const geo = new THREE.CircleGeometry(r, CLEARING.segments);
  const pos = geo.attributes.position;
  for (let i = 1; i < pos.count; i++) {
    const k = (1 - CLEARING.edge) + CLEARING.edge * hash01(x, (i - 1) % CLEARING.segments, z, 12);
    pos.setXY(i, pos.getX(i) * k, pos.getY(i) * k);
  }
  const mesh = new THREE.Mesh(geo, litMaterial(CLEARING.color, {
    surface: 'sand',
    repeat: repeatFor('sand', r * 2, r * 2),
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  }));
  mesh.name = 'campClearing';
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, CLEARING.y, z);
  mesh.userData.noCast = true;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  return mesh;
}

// The nests: a squashed moss ring under each elder and kit, dry bracken in
// its hollow. One vertex-coloured mesh, out of the shadow pass.
function nestsMesh(nests, groundY = () => 0, flat = 1) {
  const parts = [];
  // `flat` < 1 presses a nest down towards the ground under it (the ledge's:
  // low enough, under 0.1 m, that the contact-shadow scan gives the bedding no
  // decal).
  const press = (m, gy) => (flat === 1 ? m : m.premultiply(new THREE.Matrix4().makeTranslation(0, -gy, 0))
    .premultiply(new THREE.Matrix4().makeScale(1, flat, 1)).premultiply(new THREE.Matrix4().makeTranslation(0, gy, 0)));
  for (const n of nests) {
    const gy = groundY(n.x, n.z);
    const ring = new THREE.TorusGeometry(NEST.r, NEST.tube, 4, 10);
    const sy = NEST.squash;
    parts.push(bake(ring, press(place(n.x, gy + NEST.tube * sy, n.z, 1, sy, 1, hash01(n.x, 0, n.z, 13) * Math.PI, Math.PI / 2), gy),
      (vx, vy, vz, c) => c.setHex(NEST.moss).multiplyScalar(0.8 + 0.35 * hash01(vx, vy, vz, 14))));
    const hollow = new THREE.CircleGeometry(NEST.r - 0.02, 10);
    parts.push(bake(hollow, press(place(n.x, gy + 0.03, n.z, 1, 1, 1, 0, -Math.PI / 2), gy),
      (vx, vy, vz, c) => c.setHex(NEST.bracken).multiplyScalar(0.85 + 0.25 * hash01(vx, vy, vz, 15))));
  }
  const mesh = new THREE.Mesh(merged(parts), vcMaterial({ roughness: 0.9 }));
  mesh.name = 'campNests';
  mesh.userData.noCast = true;
  mesh.userData.noMerge = true;
  mesh.receiveShadow = true;
  return mesh;
}

// The fresh-kill pile: two mice and a bird side by side and a vole on top,
// small lumps with a head (and a tail for the mice), all within ~0.3 m of the
// spot and under 0.2 m tall. One vertex-coloured mesh, out of the shadow pass.
function killMesh(kill, groundY = () => 0) {
  const parts = [];
  const turn = hash01(kill.x, 0, kill.z, 16) * Math.PI * 2;
  const lump = (ox, y, oz, sx, sy, sz, yaw, hex) => {
    const cs = Math.cos(turn);
    const sn = Math.sin(turn);
    const x = kill.x + ox * cs - oz * sn;
    const z = kill.z + ox * sn + oz * cs;
    parts.push(bake(new THREE.IcosahedronGeometry(1, 0), place(x, groundY(x, z) + y, z, sx, sy, sz, yaw - turn), solid(hex)));
  };
  // [x, z, yaw, colour, is a mouse]
  for (const [ox, oz, yaw, hex, mouse] of [[0, 0, 0.3, KILL_LOOK.mouse, true], [0.14, 0.1, 2.1, KILL_LOOK.vole, true]]) {
    lump(ox, 0.05, oz, 0.1, 0.055, 0.06, yaw, hex);
    lump(ox + Math.cos(-yaw) * 0.1, 0.045, oz + Math.sin(-yaw) * 0.1, 0.045, 0.04, 0.04, yaw, hex);
    if (mouse) lump(ox - Math.cos(-yaw) * 0.16, 0.015, oz - Math.sin(-yaw) * 0.16, 0.08, 0.012, 0.012, yaw, hex);
  }
  // the bird: a plump body, a paler folded wing, a small head
  lump(-0.12, 0.07, 0.07, 0.11, 0.075, 0.085, -0.6, KILL_LOOK.bird);
  lump(-0.12, 0.1, 0.1, 0.08, 0.03, 0.05, -0.6, KILL_LOOK.wing);
  lump(-0.21, 0.08, 0.0, 0.05, 0.045, 0.045, -0.6, KILL_LOOK.bird);
  // a vole on top
  lump(0.03, 0.13, 0.04, 0.08, 0.045, 0.055, 1.2, KILL_LOOK.vole);
  const mesh = new THREE.Mesh(merged(parts), vcMaterial({ roughness: 0.85 }));
  mesh.name = 'campKill';
  mesh.userData.noCast = true;
  mesh.userData.noMerge = true;
  mesh.receiveShadow = true;
  return mesh;
}

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

const LEDGE_DISC_DRAWS = 24;

// A ledge camp: three top-level meshes, the rock, the bedding (moss nests) and the fresh-kill pile, and one
// collider, the rock (a cave den is the rock round it). They are separate
// children of the scene, not a Group, because the contact-shadow scan boxes
// one top-level child at a time and the bedding sits ~17 m from the rock: in
// one Group it was over MAX_SPAN and the rock lost its decal. The rock is
// seated on the ground under its own centre. The bedding is one merged mesh at
// the origin, so seating it as the rock is seated would lift it by the ground at
// (0, 0), the floor: instead each disc is baked in at its seat, at the ground
// under that seat (ruling P3); each pile lump is seated at the ground under it. Both are low and out of the shadow pass.
function addLedgeCamp(scene, area, L) {
  const ground = area.ground ?? null;
  const groundY = (x, z) => (ground && !ground.flat ? ground.y(x, z) : 0);

  const rock = campRockMesh(L.rock);
  if (ground) seatOnGround(rock, ground);
  scene.add(rock);

  // The nests and the pile are drawn under withLocalUuids, so the Gorge's
  // build takes the Math.random draws it always took (camp.test.js): the
  // bedding is handed over to a fresh mesh, geometry and material, as the old
  // discs were, and the pile adds nothing on Math.random.
  const D = campDressing('gorge', area.colliders);
  const made = withLocalUuids('gorge', () => ({
    nests: nestsMesh(D.nests, groundY, 0.5),
    kill: killMesh(D.kill, groundY),
  }));
  const bedding = new THREE.Mesh(adopt(made.nests.geometry), vcMaterial({ roughness: 0.9 }));
  bedding.name = 'campBedding';
  bedding.userData.noCast = true;
  bedding.userData.noMerge = true;
  bedding.receiveShadow = true;
  made.nests.geometry.dispose();
  made.nests.material.dispose();
  made.kill.name = 'campKill';
  scene.add(bedding);
  scene.add(made.kill);
  // The six flat discs this replaced took 24 of the Math.random draws (four
  // uuids for each cylinder); the build's seeded tests and every draw after
  // it expect them, so they are still taken. Nothing reads the values.
  for (let i = 0; i < LEDGE_DISC_DRAWS; i++) Math.random();
  area.colliders.push({ x: L.rock.x, z: L.rock.z, r: L.rock.r });
}

/**
 * addCamp(scene, area, areaId) -> void
 *
 * Three top-level children of the scene for a flat camp:
 *  - `clanCamp`, a Group: the woven den (one vertex-coloured mesh with its
 *    strands and doorway arch), the dark doorway, the Highrock, the nests and
 *    the fresh-kill pile. Five meshes, each one geometry already, so
 *    mergeStaticProps has nothing left to do; the doorway, nests and pile are
 *    noCast and noMerge (a merge would drop their noCast). Its box stays
 *    under the contact-shadow scan's MAX_SPAN, so den and rock keep a decal.
 *  - `campRing`, the bramble ring, one noCast mesh.
 *  - `campClearing`, the sandy floor, one flat noCast disc.
 * The ring and the clearing are separate top-level children because the
 * scan boxes one top-level child at a time (they are ~11 m wide). Seven
 * main-pass draws in all. Pushes { x, z, r } colliders for the den and the
 * rock into area.colliders, as before: the dressing has none. The ring dodges
 * the colliders already in area.colliders (campDressing). A no-op where
 * campLayout is null. Materials are made per call (walk.js disposes them at
 * the walk's end). A ledge camp (L.den.cave) draws its rock and bedding
 * instead, with the nests and the pile, seated on area.ground when given (addLedgeCamp above).
 */
export function addCamp(scene, area, areaId) {
  const L = campLayout(areaId);
  if (!L) return;
  if (L.den.cave) {
    addLedgeCamp(scene, area, L);
    return;
  }
  const D = campDressing(areaId, area.colliders);
  const out = CAMP_TURN[areaId] + Math.PI; // from the den towards the centre
  const made = withLocalUuids(areaId, () => ({
    den: denGeometry(L.den, out),
    door: doorGeometry(L.den, out),
    rock: highrockGeometry(L.rock, L.cx, L.cz),
    nests: nestsMesh(D.nests),
    kill: killMesh(D.kill),
    ring: ringMesh(D.ring, L.cx, L.cz),
    clearing: clearingMesh(D.clearing),
  }));

  // The objects a flat camp has always made on Math.random (withLocalUuids).
  const group = new THREE.Group();
  group.name = 'clanCamp';
  const den = new THREE.Mesh(adopt(made.den), vcMaterial());
  den.name = 'campDen';
  const door = new THREE.Mesh(adopt(made.door), litMaterial(DOORWAY));
  door.name = 'campDoor';
  door.userData.noCast = true;
  door.userData.noMerge = true;
  const rock = new THREE.Mesh(adopt(made.rock), litMaterial(ROCK_GREY, surfaceProps('cobble')));
  rock.name = 'campRock';
  group.add(den, door, rock, made.nests, made.kill);

  scene.add(group);
  scene.add(made.ring);
  scene.add(made.clearing);
  area.colliders.push({ x: L.den.x, z: L.den.z, r: L.den.r }, { x: L.rock.x, z: L.rock.z, r: L.rock.r });
}
