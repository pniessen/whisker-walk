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
import { withLocalUuids as localUuids } from './localuuids.js';
const withLocalUuids = (areaId, fn) => localUuids(`camp-uuids-${areaId}`, fn);

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
// The camp's dressing (polish-camps): a bramble wall round the camp with
// one gap, a trampled clearing inside it, a moss nest under each elder and kit,
// and a fresh-kill pile beside the leader's rock. All of it is visual only:
// no collider, no seat, no route changes. campDressing is pure (no THREE) and
// seeded from the area id alone (never walkRng), so every device agrees.
const RING_IN = 0.6;          // the ring's radius: disc.r - 0.6
const RING_GAP_HALF = 0.33;   // radians either side of the gap's centre
// polish-viewclear: a wall, not a dotted circle. Clumps every 0.36 m of arc in
// two staggered rows (slot i's row is i % 2: row 0 sits 0.16 m in from the
// ring, row 1 0.16 m out), so neighbours sit close and the wall reads solid; the
// clumps at the two ends of the gap (the first and last slot) are the gate
// posts, 1.25 times as tall (to 0.95 m at most).
const RING_STEP = 0.36;       // metres of arc per clump
const RING_JITTER = 0.06;     // ± radial jitter, metres
const RING_ROW = 0.16;        // a row's radial offset, in (row 0) or out (row 1)
const CLUMP_S = [0.8, 1.2];
const CLUMP_H = [0.55, 0.8];
const GATE_H = 1.25;          // a gate clump's h, times
const GATE_CAP = 0.95;
// A clump's footprint at s = 1 (the drawn clump's horizontal radius is
// CLUMP_R · s). A clump is dropped where its centre is nearer a collider's
// edge than max(0.25, CLUMP_R · s + 0.05): 0.26 to 0.362 m, so the plan's
// flat r + 0.25 holds at every s and the drawn clump still misses the
// collider.
export const CLUMP_R = 0.26;
const CLUMP_SEAT_GAP = 0.5;   // from any seat, and from the den's and rock's edges
// The bramble canes woven along the ring (polish-camps4): two layers of
// arching canes laid end to end round the ring, the second staggered by
// `stagger` metres so its joins fall mid-cane on the first. Along a cane its
// radius weaves ringR ± weave (across both rows, the layers out of phase, so
// they cross), its height arches from `foot` at the ends to a peak in `peak`
// with a small over/under bob, a point every ~`step` m, the tube's radius
// tapering w0 -> w1 from foot to tip. A point is kept only within `near` of a
// kept clump, `seat` off every seat, `edge` off the den's, the rock's and
// every collider's edge, and inside the ring's arc (never in the gap); a cane
// splits where points drop, and a run under 3 points vanishes.
const CANE = {
  len: [2.6, 3.8], stagger: 1.6, step: 0.4, weave: 0.18, waves: [0.8, 1.4],
  foot: 0.08, peak: [0.7, 0.9], skew: 0.2, bob: 0.1, bobs: [2, 3.5], w0: 0.036, w1: 0.016,
  near: 0.45, seat: 0.4, edge: 0.25,
};
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

// The ring's canes (CANE): pure, from hash01 of the camp's centre alone.
// `clear(p)` is campDressing's seat and collider rule for a point.
function ringCanes(cx, cz, ringR, gapA, span, clumps, clear) {
  const arc = span * ringR;
  const lerp = ([lo, hi], t) => lo + (hi - lo) * t;
  const runs = [];
  for (let layer = 0; layer < 2; layer++) {
    let s0 = -layer * CANE.stagger;
    for (let idx = 0; s0 < arc; idx++) {
      const h = (k) => hash01(cx, layer * 1000 + idx * 10 + k, cz, 40);
      const len = lerp(CANE.len, h(0));
      const m = Math.max(2, Math.round(len / CANE.step));
      const waves = lerp(CANE.waves, h(1));
      const phase = h(2) + layer * 0.5;
      const peak = lerp(CANE.peak, h(3));
      const bobPhase = h(4);
      const bobs = lerp(CANE.bobs, h(5));
      // the peak off the middle (u 0.3..0.7): a cane leans one way
      const tip = 0.5 + CANE.skew * (h(6) * 2 - 1);
      let run = [];
      for (let j = 0; j <= m; j++) {
        const u = j / m;
        const s = s0 + u * len;
        const a = gapA + RING_GAP_HALF + s / ringR;
        const d = ringR + CANE.weave * Math.sin(2 * Math.PI * (u * waves + phase));
        const v = u < tip ? (u / tip) * 0.5 : 0.5 + ((u - tip) / (1 - tip)) * 0.5;
        const arch = Math.sin(Math.PI * v);
        const y = Math.min(peak, CANE.foot + (peak - CANE.foot) * arch
          + CANE.bob * arch * Math.sin(2 * Math.PI * (u * bobs + bobPhase)));
        const p = { x: cx + Math.cos(a) * d, y, z: cz + Math.sin(a) * d, w: CANE.w0 + (CANE.w1 - CANE.w0) * u };
        const keep = s > 0.05 && s < arc - 0.05
          && clumps.some((c) => Math.hypot(p.x - c.x, p.z - c.z) <= CANE.near)
          && clear(p);
        if (keep) run.push(p);
        else {
          if (run.length >= 3) runs.push(run);
          run = [];
        }
      }
      if (run.length >= 3) runs.push(run);
      s0 += len;
    }
  }
  return runs;
}

/**
 * campDressing(areaId, colliders = []) -> null | {
 *   ring: null | { r, gap: { a, half }, clumps: [{ x, z, s, h, rot, row, gate }],
 *                  canes: [[{ x, y, z, w }]] },
 *   clearing: null | { x, z, r }, nests: [{ x, z, r }], kill: { x, z } }
 *
 * The camp's dressing, positions only. `colliders` is the area's collider
 * list as addCamp sees it: a clump that would meet one is dropped (every slot
 * draws its numbers first, so a dropped clump never shifts the others). Every
 * clump keeps 0.5 m off every seat and off the den's and the rock's edges. The
 * ring's gap is centred on CAMP_TURN + π, the side away from the den. A
 * clump's `row` is 0 (inner) or 1 (outer), alternating slot by slot; `gate`
 * is true for the first and last slot, the clumps either side of the gap.
 * `canes` are the bramble canes woven along the ring (CANE above), polylines of
 * points with the tube's radius w at each; they are drawn from hash01 alone,
 * never the camp's rng, so the clumps are where they were before the canes,
 * and a collider only drops the cane points near it. A ledge
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
    const row = i % 2;
    const gate = i === 0 || i === n - 1;
    const d = ringR + (rng() * 2 - 1) * RING_JITTER + (row ? RING_ROW : -RING_ROW);
    const s = lerp(CLUMP_S, rng());
    const h0 = lerp(CLUMP_H, rng());
    const h = gate ? Math.min(GATE_CAP, h0 * GATE_H) : h0;
    const rot = rng() * Math.PI * 2;
    const c = { x: cx + Math.cos(a) * d, z: cz + Math.sin(a) * d, s, h, rot, row, gate };
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

  const canes = ringCanes(cx, cz, ringR, gapA, span, clumps, (p) => (
    seats.every((q) => near(p, q) >= CANE.seat)
    && [L.den, L.rock, ...cols].every((k) => near(p, k) - k.r >= CANE.edge)));

  return {
    ring: { r: ringR, gap: { a: gapA, half: RING_GAP_HALF }, clumps, canes },
    clearing: { x: cx, z: cz, r: ringR - CLEARING_IN },
    nests,
    kill,
  };
}

const DOORWAY = 0x140f0a;
const DEN_SQUASH = 0.8;

// Each clan's camp in its own colours (polish-camps3). One record per camp:
//   ring:  greens (a clump's green, by hash), strand (the bramble canes),
//          specks ([hex, share]: berries, flowers, seed heads; a share of the
//          clumps' triangles recoloured whole, by a hash of each centroid)
//   den:   base (the mound, dark at its foot), streak (new growth), strand
//          (the woven strands and bands), frame (the doorway's stick arch)
//   floor: the clearing's colour and its SURFACE_PRESETS surface
//   nest:  moss (the ring) and bracken (the hollow)
//   rock:  the leader's rock
// A ledge camp (the Gorge) has no ring, den or floor: its record carries the
// woods values for those so campLook always returns a whole record.
const deepFreeze = (o) => {
  for (const v of Object.values(o)) if (v && typeof v === 'object') deepFreeze(v);
  return Object.freeze(o);
};
const WOODS_LOOK = {
  // StormClan: oak and fern bramble, blackberries
  ring: { greens: [0x34521f, 0x46632a, 0x2a421c], strand: 0x3a2a18, specks: [[0x4a1430, 0.07], [0x9a2630, 0.03]] },
  den: { base: 0x34481f, streak: 0x62803a, strand: 0x3a2c1c, frame: 0x5a4128 },
  floor: { color: 0xa4845c, surface: 'sand' },   // trampled earth
  nest: { moss: 0x6f8f3a, bracken: 0x8a6a3a },
  rock: 0x8a8a80,
};
export const CAMP_LOOKS = deepFreeze({
  woods: WOODS_LOOK,
  // BrookClan: reeds and pebbles, bulrush heads; a woven reed and straw den
  river: {
    ring: { greens: [0x5e7f48, 0x6f8c50, 0x4a7466], strand: 0x56603a, specks: [[0x5e4630, 0.04]] },
    den: { base: 0x5a6a3a, streak: 0xa29e62, strand: 0x4a5a34, frame: 0x6a5a3a },
    floor: { color: 0xbdb8a8, surface: 'gravel' }, // pale pebbles
    nest: { moss: 0x6f9a6a, bracken: 0xb0a46a },
    rock: 0x7d8890,
  },
  // GaleClan: gorse and heather in flower; a dry heather den
  moor: {
    ring: { greens: [0x56632a, 0x667030, 0x48522a], strand: 0x3e3622, specks: [[0xc9a42e, 0.06], [0x8a5a80, 0.05]] },
    den: { base: 0x4a4030, streak: 0x8a5a80, strand: 0x3a3022, frame: 0x6a5a3e },
    floor: { color: 0x84984f, surface: 'grass' },  // cropped turf
    nest: { moss: 0x8a6a80, bracken: 0xa89a62 },
    rock: 0x9a9488,
  },
  // DuskClan: needles and moss, fern tips; a moss den
  pines: {
    ring: { greens: [0x1d3a2f, 0x27483a, 0x15302a], strand: 0x24263a, specks: [[0x4f7a3a, 0.07]] },
    den: { base: 0x1e3228, streak: 0x3e5e3a, strand: 0x2a2620, frame: 0x3e2e22 },
    floor: { color: 0x7a5a3c, surface: 'sand' },   // needle litter
    nest: { moss: 0x5f8a3a, bracken: 0x6a4a30 },
    rock: 0x5e6070,
  },
  // CliffClan: sandstone (a ledge camp: only its nest and rock are drawn)
  gorge: {
    ring: WOODS_LOOK.ring,
    den: WOODS_LOOK.den,
    floor: WOODS_LOOK.floor,
    nest: { moss: 0xa08a50, bracken: 0xc8b48a },
    rock: 0xb8825a,
  },
});

/** campLook(areaId) -> CAMP_LOOKS[areaId], or the woods look for any other id. */
export function campLook(areaId) {
  return (typeof areaId === 'string' && Object.hasOwn(CAMP_LOOKS, areaId)) ? CAMP_LOOKS[areaId] : CAMP_LOOKS.woods;
}

// The flat camps' shapes (polish-camps). Every number below is drawn from a
// position hash or from campDressing, never from walkRng or Math.random.
const DEN_LOOK = {
  bump: 0.05,          // ± share of the radius each corner is pushed in or out
  strands: 7,          // quarter arcs from the ground to the crown
  doorClear: 0.6,      // radians either side of the door kept free of strands
};
// The doorway: an arch (straight sides, round top) leaning back with the dome.
// `at` is how far out from the den's centre its middle sits, at height y.
const DOOR = { w: 0.3, y: 0.3, at: 1.04, tilt: 0.31 };
const FRAME_AT = 1.02;
const RING_LOOK = {
  foot: 0.62,         // a clump's green, times, at its foot ...
  crown: 1.12,        // ... and at its crown (specks are not shaded)
  lumpIn: -0.2,       // a lump vertex's pull towards its clump's foot ...
  lumpOut: 0.05,      // ... or push away from it (lumpy, in ringMesh)
};
// y 0.011: over the path strips (0.01) and wet sand (0.008), under the paw
// prints (0.012) and the contact-shadow decals (0.015). The solid middle is
// opaque and writes depth, as the old floor did. The see-through rim writes
// none, so it draws first of the see-through things (order -4, under the
// water band's -3, the paw prints' -2 and the decals' -1) and they go over it.
// fade: the soft band at the rim, solid inside r - fade, clear at r * wobble;
// wobble: the rim's radius factor, 1 - wobble..1 (a sum of three low sinusoids).
const CLEARING = { y: 0.011, segments: 28, fade: 0.4, wobble: 0.1, order: -4 };
const NEST = { r: 0.35, tube: 0.09, squash: 0.55 };
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
function denGeometry(den, out, look) {
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
  const base = new THREE.Color(look.den.base);
  const streak = new THREE.Color(look.den.streak);
  parts.push(bake(dome, place(x, 0, z, 1, DEN_SQUASH, 1), (vx, vy, vz, c) => {
    const col = Math.round(Math.atan2(vz - z, vx - x) * 5);
    const t = (0.65 * hash01(col, 0, 0, 2) + 0.35 * hash01(vx, vy, vz, 3)) * (0.35 + 0.65 * Math.min(1, vy / 0.8));
    c.copy(base).lerp(streak, t);
  }));

  // Strands: quarter arcs from the ground up to the crown, none in front of
  // the door.
  const strandAt = (vx, vy, vz, c) => c.setHex(look.den.strand).multiplyScalar(0.85 + 0.3 * hash01(vx, vy, vz, 4));
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
  const frameAt = (vx, vy, vz, c) => c.setHex(look.den.frame).multiplyScalar(0.8 + 0.4 * hash01(vx, vy, vz, 8));
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

// The Highrock (polish-camps4): a stepped boulder the leader stands on, not
// the armchair of slabs it was. Built around the origin (x, z 0, its foot at
// y 0) in a frame turned to `away`, the direction from the rock to its back
// (a flat camp's is away from the camp's centre; the Gorge's is +x, inland,
// as its leader looks west over the gorge), and moved to the rock's spot by
// the caller. Four stones, all in one non-indexed, flat-shaded geometry:
//  - the main boulder: eight sides, rings at y 0, 0.4, 0.68 and rock.h with
//    radii 0.62, 0.66, 0.58 and 0.44, a little wider along the ring round
//    the camp than out from its centre, every corner pushed in or out by up
//    to 8 % (hash01; the top ring inward only) and a flat top cap at exactly
//    rock.h (0.8), where the leader stands. 56 triangles, no bottom cap.
//  - a back stone she leans on: a round, hash-jittered icosahedron behind her
//    and turned off to one side (towards the fresh-kill pile), its top under
//    1.15 m; its corners above 0.82 m all stay more than 0.44 m from the
//    centre (corners only: a face between them can dip a few cm nearer just
//    above the top, where only a paw or the tail could brush it).
//  - two step boulders (icosahedra), tops ~0.5 and ~0.25 m, climbing round
//    the side away from the pile, the low one nearer the camp, so the rock
//    reads as a climb up to the top.
// No vertex is further than 0.78 m (x and z) from the centre, none further
// back than 0.68 m along `away` (the Woods camp group stays under the
// contact-shadow scan's MAX_SPAN 6.5) and none below y 0; the collider is
// still the rock's r 0.6. Each face is coloured flat, a grey multiplier on
// the material's look.rock: dark at the foot (0.72) to light at the top
// (1.0), up-facing faces a touch lighter, ±6 % by a hash of the face. Every
// hash takes the rock's spot as well, so no two camps' rocks are alike.
// 116 triangles (it was 128).
const HIGHROCK = {
  rings: [[0, 0.62], [0.4, 0.66], [0.68, 0.58], [null, 0.44]], // [y, r]; null: rock.h
  sides: 8,
  along: 1.05,   // the ring-wise stretch ...
  out: 0.93,     // ... and the outward squash
  push: 0.08,
  stepSide: 0.16, // the boulder drawn in this share where the steps climb
  reach: 0.78,   // no vertex further from the centre (x and z)
  back: 0.68,    // nor further back along `away`
  clear: 0.44,   // a corner above clearY stays this far from the centre
  clearY: 0.82,
  // stones: [turn off `away` (times side), out, y, rOut, rAlong, rY, tint, salt]
  stones: [
    [-0.9, 0.5, 0.74, 0.27, 0.34, 0.38, 0.95, 31], // the back stone, to the pile's side
    [1.25, 0.5, 0.25, 0.27, 0.3, 0.29, 0.9, 32],    // the high step, top ~0.5
    [2.05, 0.58, 0.12, 0.22, 0.27, 0.15, 0.88, 33], // the low step, top ~0.25
  ],
};
function highrockGeometry(rockSpot, away, opts = {}) {
  const ox = rockSpot.x;
  const oz = rockSpot.z;
  const top = rockSpot.h;
  const bx = Math.cos(away);
  const bz = Math.sin(away);
  // the step side: away from the pile (side +1 is +90 degrees from `away`)
  const k = opts.kill;
  const side = k && (-bz * k.x + bx * k.z) > 0 ? -1 : 1;
  // local (u out along away, v round the ring) to x, z
  const toXZ = (u, v) => [u * bx - v * bz, u * bz + v * bx];
  const pos = [];
  const tints = [];
  let tint = 1;
  const tri = (p, q, r) => { pos.push(...p, ...q, ...r); tints.push(tint); };

  // the main boulder
  const { sides } = HIGHROCK;
  const phase = hash01(ox, 0, oz, 30) * (Math.PI * 2 / sides);
  const rings = HIGHROCK.rings.map(([y0, r], ri) => {
    const y = y0 ?? top;
    const last = ri === HIGHROCK.rings.length - 1;
    const pts = [];
    for (let j = 0; j < sides; j++) {
      // each ring turned half a side on from the one under it, so the
      // faces are triangles, not upright panels
      const a = phase + ((j + ri / 2) / sides) * Math.PI * 2;
      const h = hash01(ox + j, ri, oz, 34);
      const push = last ? 1 - h * HIGHROCK.push : 1 + (h * 2 - 1) * HIGHROCK.push;
      const dy = ri === 1 || ri === 2 ? (hash01(ox, ri, oz + j, 35) - 0.5) * 0.08 : 0;
      // drawn in round the steps' side, so they stand out of it
      const lean = Math.max(0, Math.cos(a - side * 1.6)) ** 2 * HIGHROCK.stepSide;
      const rr = r * push * (1 - (last ? 0 : lean));
      const [x, z] = toXZ(Math.cos(a) * rr * HIGHROCK.out, Math.sin(a) * rr * HIGHROCK.along);
      pts.push([x, y + dy, z]);
    }
    return pts;
  });
  for (let ri = 0; ri + 1 < rings.length; ri++) {
    const lo = rings[ri];
    const hi = rings[ri + 1];
    for (let j = 0; j < sides; j++) {
      const n = (j + 1) % sides;
      tri(lo[j], hi[j], lo[n]);
      tri(lo[n], hi[j], hi[n]);
    }
  }
  const crown = rings[rings.length - 1];
  for (let j = 0; j < sides; j++) tri([0, top, 0], crown[(j + 1) % sides], crown[j]);

  // the back stone and the steps
  for (const [turn, d, y, rOut, rAlong, rY, stoneTint, salt] of HIGHROCK.stones) {
    tint = stoneTint;
    const a = away + turn * side;
    const cxs = Math.cos(a) * d;
    const czs = Math.sin(a) * d;
    const ico = new THREE.IcosahedronGeometry(1, 0);
    const p = ico.attributes.position;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const yaw = hash01(ox, salt, oz, 36) * Math.PI;
    for (let i = 0; i < p.count; i += 3) {
      const face = [];
      for (let m = 0; m < 3; m++) {
        let ux = p.getX(i + m);
        const uy = p.getY(i + m);
        let uz = p.getZ(i + m);
        const j = 1 + (hash01(ux + ox, uy + salt, uz + oz, 37) * 2 - 1) * 0.12;
        // a turn about y, so no two stones show the same face
        [ux, uz] = [ux * Math.cos(yaw) - uz * Math.sin(yaw), ux * Math.sin(yaw) + uz * Math.cos(yaw)];
        const lo = ux * rOut * j;
        const la = uz * rAlong * j;
        face.push([cxs + lo * ca - la * sa, Math.max(0, y + uy * rY * j), czs + lo * sa + la * ca]);
      }
      tri(face[0], face[1], face[2]);
    }
    ico.dispose();
  }

  // the limits: reach, back, the leader's clearance
  for (let i = 0; i < pos.length; i += 3) {
    let x = pos[i];
    let z = pos[i + 2];
    const back = x * bx + z * bz;
    if (back > HIGHROCK.back) {
      x -= bx * (back - HIGHROCK.back);
      z -= bz * (back - HIGHROCK.back);
    }
    const d = Math.hypot(x, z);
    const want = pos[i + 1] > HIGHROCK.clearY ? Math.max(d, HIGHROCK.clear) : d;
    const s = d > 1e-9 ? Math.min(want, HIGHROCK.reach) / d : 1;
    pos[i] = x * s;
    pos[i + 2] = z * s;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  const nrm = geo.attributes.normal;
  const col = new Float32Array(pos.length);
  for (let t = 0; t < pos.length; t += 9) {
    const cy = (pos[t + 1] + pos[t + 4] + pos[t + 7]) / 3;
    const cx = (pos[t] + pos[t + 3] + pos[t + 6]) / 3;
    const cz = (pos[t + 2] + pos[t + 5] + pos[t + 8]) / 3;
    let g = 0.72 + 0.28 * Math.min(1, cy / top);
    g *= tints[t / 9] * (1 + (hash01(cx + ox, cy, cz + oz, 38) * 2 - 1) * 0.06);
    if (nrm.getY(t / 3) > 0.6) g += 0.04;
    g = Math.min(1.06, g);
    for (let m = 0; m < 9; m++) col[t + m] = g;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
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

// The ring's specks (polish-camps3): berries, flowers or seed heads, each a
// whole triangle recoloured flat (all three corners, so no gradient smears
// out of it). A triangle's speck is picked by a hash of its centroid, walking
// the specks' shares cumulatively, so the same camp is the same on every
// build. `geo` is a baked, non-indexed part with a colour attribute.
function speckle(geo, specks, salt) {
  if (!specks.length) return geo;
  const pos = geo.attributes.position;
  const col = geo.attributes.color;
  const hexes = specks.map(([hex]) => new THREE.Color(hex));
  for (let t = 0; t < pos.count; t += 3) {
    const cx = (pos.getX(t) + pos.getX(t + 1) + pos.getX(t + 2)) / 3;
    const cy = (pos.getY(t) + pos.getY(t + 1) + pos.getY(t + 2)) / 3;
    const cz = (pos.getZ(t) + pos.getZ(t + 1) + pos.getZ(t + 2)) / 3;
    const h = hash01(cx, cy, cz, salt);
    let acc = 0;
    for (let k = 0; k < specks.length; k++) {
      acc += specks[k][1];
      if (h < acc) {
        const c = hexes[k];
        for (let v = t; v < t + 3; v++) col.setXYZ(v, c.r, c.g, c.b);
        break;
      }
    }
  }
  return geo;
}

// The bramble wall (polish-viewclear): each clump a wide main lump (an
// icosahedron, 20 triangles) and a taller, smaller one behind it on the outer
// side (an octahedron, 8), every vertex within CLUMP_R · s of the clump's spot
// and no higher than its h; the staggered rows (campDressing) put neighbours
// 0.41 to 0.57 m apart and 0.36 m along the ring, about the main lumps' own
// width (0.39 to 0.59 m across), so big neighbours meet or overlap and small
// ones leave a gap the other row's lumps and the back lumps mostly fill.
// polish-camps4: the lumps are lumpier, each vertex pulled in or pushed out
// about its clump's foot (lumpy below: x 0.8 to 1.05, by a hash of the world
// vertex, so the two copies of a seam vertex move together and the faces stay
// closed; never above h, never out of the footprint), the main lump's crown
// raised from 0.85 h to 0.92 h to make up the pull, and the old arched
// strands (a little half torus over every other pair of clumps, which read as
// apples with stalks) are gone. In their place the canes (campDressing
// ring.canes): long arching bramble canes woven along the ring in two
// staggered layers, in and out across both rows and over and under the
// crowns, each a tapered 3-sided tube (6 triangles a segment) in the clan's
// strand colour, so the wall reads as a tangle, not a row of balls. The
// clan's greens by hash, dark at the foot, with the clan's specks on the
// lumps (speckle; the canes carry none). One vertex-coloured mesh, out of the
// shadow pass: 28 triangles a clump and 6 a cane segment, 3,240 to 3,258 a camp,
// under the 3,360 the strands cost, so the River and the Moor stay under the
// area's 60,000 (test/budget.test.js; ruling R7). No ring vertex is above 1 m
// (ruling R3).
//
// Ruling R4: the wall has no collider. A collider would change the walkable
// ground, the clan cats' routes and the flat trace for the Woods, River, Moor
// and Pines (test/flattrace.test.js); cats walk through brambles.
const lumpy = (geo, c) => {
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const k = 1 + RING_LOOK.lumpIn + (RING_LOOK.lumpOut - RING_LOOK.lumpIn) * hash01(x, y, z, 20);
    pos.setXYZ(i, c.x + (x - c.x) * k, Math.min(c.h, y * k), c.z + (z - c.z) * k);
  }
  geo.computeVertexNormals();
  return geo;
};

// A tapered 3-sided tube along a cane's points, flat-shaded, coloured by
// colorAt in world space. 6 triangles a segment.
function caneGeometry(cane, colorAt) {
  const n = cane.length;
  const pos = new Float32Array(n * 3 * 3);
  const t = new THREE.Vector3();
  const side = new THREE.Vector3();
  const nrm = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < n; i++) {
    const p = cane[Math.max(0, i - 1)];
    const q = cane[Math.min(n - 1, i + 1)];
    t.set(q.x - p.x, q.y - p.y, q.z - p.z).normalize();
    side.crossVectors(up, t).normalize();
    nrm.crossVectors(t, side);
    const c = cane[i];
    // a little twist along the cane, so its flat faces catch the light unevenly
    const tw = i * 0.7;
    for (let k = 0; k < 3; k++) {
      const th = tw + (k * Math.PI * 2) / 3;
      const o = (i * 3 + k) * 3;
      pos[o] = c.x + c.w * (Math.cos(th) * side.x + Math.sin(th) * nrm.x);
      pos[o + 1] = c.y + c.w * (Math.cos(th) * side.y + Math.sin(th) * nrm.y);
      pos[o + 2] = c.z + c.w * (Math.cos(th) * side.z + Math.sin(th) * nrm.z);
    }
  }
  const index = [];
  for (let i = 0; i + 1 < n; i++) {
    for (let k = 0; k < 3; k++) {
      const a = i * 3 + k;
      const b = i * 3 + ((k + 1) % 3);
      const c = (i + 1) * 3 + ((k + 1) % 3);
      const d = (i + 1) * 3 + k;
      index.push(a, b, c, a, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(index);
  return bake(g, new THREE.Matrix4(), colorAt);
}

function ringMesh(ring, cx, cz, look) {
  const parts = [];
  for (const c of ring.clumps) {
    const R = CLUMP_R * c.s;
    const out = Math.atan2(c.z - cz, c.x - cx);
    const along = out + Math.PI / 2;
    const ox = Math.cos(out);
    const oz = Math.sin(out);
    const greens = look.ring.greens;
    const green = new THREE.Color(greens[Math.floor(hash01(c.x, c.rot, c.z, 10) * greens.length)]);
    const at = (vx, vy, vz, col) => {
      const t = Math.max(0, Math.min(1, vy / c.h));
      col.copy(green).multiplyScalar(RING_LOOK.foot + (RING_LOOK.crown - RING_LOOK.foot) * t * (0.8 + 0.4 * hash01(vx, vy, vz, 11)));
    };
    const yaw = -along + Math.sin(c.rot) * 0.15;
    // the main lump, a widest corner turned onto the ring, so neighbours touch
    const mainTop = c.h * 0.92;
    const msy = mainTop / (2 * ICO_Y);
    const main = new THREE.IcosahedronGeometry(1, 0).rotateY(ICO_TIP);
    parts.push(speckle(lumpy(bake(main, place(c.x, mainTop - ICO_Y * msy, c.z, 0.95 * R, msy, 0.8 * R, yaw), at), c), look.ring.specks, 19));
    // the back lump, 0.4 R out: its reach, 0.4 + 0.55, stays under R
    const bsy = c.h / 2;
    const back = new THREE.OctahedronGeometry(1, 0);
    parts.push(speckle(lumpy(bake(back, place(c.x + ox * 0.4 * R, bsy, c.z + oz * 0.4 * R, 0.55 * R, bsy, 0.55 * R, yaw + Math.PI / 4), at), c), look.ring.specks, 19));
  }
  const caneAt = (vx, vy, vz, col) => col.setHex(look.ring.strand).multiplyScalar(0.85 + 0.3 * hash01(vx, vy, vz, 18));
  for (const cane of ring.canes) parts.push(caneGeometry(cane, caneAt));
  const mesh = new THREE.Mesh(merged(parts), vcMaterial());
  mesh.name = 'campRing';
  mesh.userData.noCast = true;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  return mesh;
}

// The clearing: the camp's trampled floor in the clan's colour and surface
// (trampled earth, pale pebbles, cropped turf, needle litter), melted into the
// ground: a two-ring disc, the centre, an inner ring at (r - 0.4) and an outer
// ring at r, each scaled by one low-frequency wobble (three sinusoids with
// phases from the camp centre, factor 0.9..1, the same for both rings at an
// angle). The colour attribute is rgb 1 with alpha 1 up to the inner ring and
// 0 at the outer, so the rim fades out instead of ending in a polygon line.
// uv is planar over the full radius, as the old disc's was, so the surface
// tiles the same. Two materials on two draw groups: the middle (the centre
// fan) opaque and depth-written like the old floor, so a see-through path
// strip under it stays hidden; the rim band see-through, not written to depth
// and drawn first of the see-through things (renderOrder -4, under the water
// band -3, paw prints -2 and contact-shadow decals -1), so prints and decals
// go over it. Lifted 1.1 cm and pulled towards the camera (polygonOffset) so
// it never fights the ground or a path. One mesh, two draws.
// A CircleGeometry lying flat at the top level, built as radius r - 0.4 and
// then given the two-ring attributes: grass.js's flatFootprints reads
// parameters.radius, so grass is kept off inside r - 0.4 (the solid floor,
// give or take the wobble's 10 %) and tufts grow into the rest of the faded
// band.
function clearingMesh(clearing, look) {
  const { x, z, r } = clearing;
  const n = CLEARING.segments;
  const rIn = r - CLEARING.fade;
  const geo = new THREE.CircleGeometry(rIn, n);
  const ph = [0, 1, 2].map((k) => hash01(x, k, z, 12) * Math.PI * 2);
  const wobble = (t) => {
    const w = (Math.sin(2 * t + ph[0]) + 0.6 * Math.sin(3 * t + ph[1]) + 0.4 * Math.sin(5 * t + ph[2])) / 2; // -1..1
    return 1 - CLEARING.wobble * (0.5 - 0.5 * w);
  };
  const pos = new Float32Array((1 + 2 * n) * 3);
  const uv = new Float32Array((1 + 2 * n) * 2);
  const nor = new Float32Array((1 + 2 * n) * 3);
  const col = new Float32Array((1 + 2 * n) * 4);
  uv[0] = uv[1] = 0.5;
  for (let i = 0; i < 2 * n + 1; i++) { nor[i * 3 + 2] = 1; col.fill(1, i * 4, i * 4 + 3); }
  col[3] = 1;
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const k = wobble(t);
    for (const [ring, rad, alpha] of [[1 + i, rIn * k, 1], [1 + n + i, r * k, 0]]) {
      const px = Math.cos(t) * rad;
      const py = Math.sin(t) * rad;
      pos[ring * 3] = px;
      pos[ring * 3 + 1] = py;
      uv[ring * 2] = (px / r + 1) / 2;
      uv[ring * 2 + 1] = (py / r + 1) / 2;
      col[ring * 4 + 3] = alpha;
    }
  }
  // the centre fan first, then the rim band (the two draw groups below)
  const fan = [];
  const band = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const [a, b, A, B] = [1 + i, 1 + j, 1 + n + i, 1 + n + j];
    fan.push(0, a, b);
    band.push(a, A, B, a, B, b);
  }
  const idx = [...fan, ...band];
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
  geo.setIndex(idx);
  // Two draw groups: the solid middle (the centre fan, 28 triangles) is
  // opaque and writes depth as the old floor did, so anything flat and
  // see-through drawn later below it (a path at y 0.01) stays hidden under
  // it; only the fading rim (56 triangles) is see-through.
  geo.clearGroups();
  geo.addGroup(0, n * 3, 0);
  geo.addGroup(n * 3, n * 6, 1);
  const { color, surface } = look.floor;
  const floor = (extra) => litMaterial(color, {
    surface,
    repeat: repeatFor(surface, r * 2, r * 2),
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    ...extra,
  });
  const mesh = new THREE.Mesh(geo, [
    floor({}),
    floor({ vertexColors: true, transparent: true, depthWrite: false }),
  ]);
  mesh.name = 'campClearing';
  mesh.renderOrder = CLEARING.order;
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, CLEARING.y, z);
  mesh.userData.noCast = true;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  return mesh;
}

// The nests: a squashed moss ring under each elder and kit, dry bracken in
// its hollow. One vertex-coloured mesh, out of the shadow pass.
function nestsMesh(nests, look, groundY = () => 0, flat = 1) {
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
      (vx, vy, vz, c) => c.setHex(look.nest.moss).multiplyScalar(0.8 + 0.35 * hash01(vx, vy, vz, 14))));
    const hollow = new THREE.CircleGeometry(NEST.r - 0.02, 10);
    parts.push(bake(hollow, press(place(n.x, gy + 0.03, n.z, 1, 1, 1, 0, -Math.PI / 2), gy),
      (vx, vy, vz, c) => c.setHex(look.nest.bracken).multiplyScalar(0.85 + 0.25 * hash01(vx, vy, vz, 15))));
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

// The Highrock's material: the clan's rock colour, shaded per face by the
// geometry's grey multipliers.
const rockMaterial = (look) => litMaterial(look.rock, { ...surfaceProps('cobble'), vertexColors: true });

// A ledge camp: three top-level meshes, the Highrock (highrockGeometry), the
// bedding (moss nests) and the fresh-kill pile, and one
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

  const look = campLook('gorge');
  // The rock, the nests and the pile are drawn under withLocalUuids, so the
  // Gorge's build takes the Math.random draws it always took (camp.test.js):
  // the rock and the bedding are each handed over to a fresh mesh, geometry
  // and material, as the old dodecahedron and discs were, and the pile adds
  // nothing on Math.random.
  const D = campDressing('gorge', area.colliders);
  const made = withLocalUuids('gorge', () => ({
    // the leader looks west, so the rock's back is +x (away 0), inland
    rock: highrockGeometry(L.rock, 0, { kill: { x: D.kill.x - L.rock.x, z: D.kill.z - L.rock.z } }),
    nests: nestsMesh(D.nests, look, groundY, 0.5),
    kill: killMesh(D.kill, groundY),
  }));
  // The rock: a fresh geometry, material and mesh on Math.random, as the old
  // dodecahedron's were, built round the origin and seated on the ground
  // under its spot.
  const rock = new THREE.Mesh(adopt(made.rock), rockMaterial(look));
  rock.name = 'campRock';
  rock.position.set(L.rock.x, 0, L.rock.z);
  if (ground) seatOnGround(rock, ground);
  scene.add(rock);
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
 *  - `campClearing`, the camp's floor, one flat noCast disc with an opaque
 *    middle and a see-through fading rim (two materials, two draws).
 * Every colour is the clan's (CAMP_LOOKS, by campLook(areaId); woods for an
 * id with no record).
 * The ring and the clearing are separate top-level children because the
 * scan boxes one top-level child at a time (they are ~11 m wide). Eight
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
  const look = campLook(areaId);
  const made = withLocalUuids(areaId, () => ({
    den: denGeometry(L.den, out, look),
    door: doorGeometry(L.den, out),
    rock: highrockGeometry(L.rock, Math.atan2(L.rock.z - L.cz, L.rock.x - L.cx), {
      kill: { x: D.kill.x - L.rock.x, z: D.kill.z - L.rock.z },
    }).translate(L.rock.x, 0, L.rock.z),
    nests: nestsMesh(D.nests, look),
    kill: killMesh(D.kill),
    ring: ringMesh(D.ring, L.cx, L.cz, look),
    clearing: clearingMesh(D.clearing, look),
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
  const rock = new THREE.Mesh(adopt(made.rock), rockMaterial(look));
  rock.name = 'campRock';
  group.add(den, door, rock, made.nests, made.kill);

  scene.add(group);
  scene.add(made.ring);
  scene.add(made.clearing);
  area.colliders.push({ x: L.den.x, z: L.den.z, r: L.den.r }, { x: L.rock.x, z: L.rock.z, r: L.rock.r });
}
