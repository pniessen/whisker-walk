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
// polish-brambles: more, shorter arches (len 1.8..2.8, was 2.6..3.8) that
// lie over the mounds' tops (peak 0.72..0.85, was 0.7..0.9; non-gate clumps
// are at most 0.8 m), rising out of the leaves (foot 0.28 m, was 0.08: the
// base is hidden in the mound), and a thin cane (0.03 -> 0.014, was 0.036 ->
// 0.016). No step climbs or falls more than `slope` times its run along the
// ground (a steep foot is lowered to fit), so a cane arches gently instead of
// standing up like a pole, and none rises more than `over` above the tallest
// clump within `near` of it, so it lies over the mounds' tops instead of
// towering over a small one. Thorns: THORN below.
const CANE = {
  len: [1.8, 2.8], stagger: 1.6, step: 0.4, weave: 0.18, waves: [0.8, 1.4],
  foot: 0.28, peak: [0.72, 0.85], skew: 0.2, bob: 0.1, bobs: [2, 3.5], w0: 0.03, w1: 0.014,
  near: 0.45, seat: 0.4, edge: 0.25, slope: 0.45, over: 0.1,
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
// `clear(p)` is campDressing's seat and collider rule for a point; `placed`
// is every clump before the colliders dropped any (the height cap's).
function ringCanes(cx, cz, ringR, gapA, span, clumps, placed, clear) {
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
      const pts = [];
      for (let j = 0; j <= m; j++) {
        const u = j / m;
        const s = s0 + u * len;
        const a = gapA + RING_GAP_HALF + s / ringR;
        const d = ringR + CANE.weave * Math.sin(2 * Math.PI * (u * waves + phase));
        const v = u < tip ? (u / tip) * 0.5 : 0.5 + ((u - tip) / (1 - tip)) * 0.5;
        const arch = Math.sin(Math.PI * v);
        const y = Math.min(peak, CANE.foot + (peak - CANE.foot) * arch
          + CANE.bob * arch * Math.sin(2 * Math.PI * (u * bobs + bobPhase)));
        pts.push({ s, p: { x: cx + Math.cos(a) * d, y, z: cz + Math.sin(a) * d, w: CANE.w0 + (CANE.w1 - CANE.w0) * u } });
      }
      // polish-brambles: a point no more than `over` above the tallest clump
      // near it, then no step may climb (or fall) more than `slope` times its
      // run along the ground, forward then back; a point is lowered, never
      // raised.
      for (const { p } of pts) {
        const top = placed.reduce((t, c) => (Math.hypot(p.x - c.x, p.z - c.z) <= CANE.near ? Math.max(t, c.h) : t), 0);
        if (top > 0) p.y = Math.min(p.y, top + CANE.over);
      }
      const rise = (q, p) => CANE.slope * Math.hypot(p.x - q.x, p.z - q.z);
      for (let j = 1; j <= m; j++) {
        const q = pts[j - 1].p;
        pts[j].p.y = Math.min(pts[j].p.y, q.y + rise(q, pts[j].p));
      }
      for (let j = m - 1; j >= 0; j--) {
        const q = pts[j + 1].p;
        pts[j].p.y = Math.min(pts[j].p.y, q.y + rise(q, pts[j].p));
      }
      let run = [];
      for (const { s, p } of pts) {
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
  // every clump the layout keeps, before the colliders drop any: the canes'
  // height cap reads these, so a collider never moves a cane point it keeps
  const placed = [];
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
    placed.push(c);
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

  const canes = ringCanes(cx, cz, ringR, gapA, span, clumps, placed, (p) => (
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
//          specks ([hex, share]: flowers, seed heads, dark fruit; a share of
//          the core and crown triangles recoloured whole, by a hash of each
//          centroid), fruit ([hex, weight]: the berries' colours) and
//          fruitShare (the share of clumps in fruit; the rest carry green buds)
//   den:   base (the mound, dark at its foot), streak (new growth), strand
//          (the woven strands and bands), frame (the doorway's stick arch)
//   floor: the clearing's colour and its SURFACE_PRESETS surface
//   nest:  moss (the ring) and bracken (the hollow)
//   rock:  the leader's rock
//   rockMoss (optional): the moss on the Highrock's tops when it should differ
//          from the nests' (the Moor's heather-purple nest moss would stain
//          its rock); absent, the rock takes nest.moss
// A ledge camp (the Gorge) has no ring, den or floor: its record carries the
// woods values for those so campLook always returns a whole record.
const deepFreeze = (o) => {
  for (const v of Object.values(o)) if (v && typeof v === 'object') deepFreeze(v);
  return Object.freeze(o);
};
const WOODS_LOOK = {
  // StormClan: oak and fern bramble, blackberries
  ring: {
    greens: [0x34521f, 0x46632a, 0x2a421c], strand: 0x5a2f22, specks: [[0x4a1430, 0.035], [0x9a2630, 0.015]],
    fruit: [[0x2b0d22, 0.75], [0xa3222c, 0.25]], fruitShare: 0.8,
  },
  den: { base: 0x34481f, streak: 0x62803a, strand: 0x3a2c1c, frame: 0x5a4128 },
  floor: { color: 0xa4845c, surface: 'sand' },   // trampled earth
  nest: { moss: 0x6f8f3a, bracken: 0x8a6a3a },
  rock: 0x8a8a80,
};
export const CAMP_LOOKS = deepFreeze({
  woods: WOODS_LOOK,
  // BrookClan: reeds and pebbles, bulrush heads; a woven reed and straw den
  river: {
    ring: {
      greens: [0x5e7f48, 0x6f8c50, 0x4a7466], strand: 0x6a4a30, specks: [[0x5e4630, 0.02]],
      fruit: [[0x2b0d22, 0.8], [0xa3222c, 0.2]], fruitShare: 0.55,
    },
    den: { base: 0x5a6a3a, streak: 0xa29e62, strand: 0x4a5a34, frame: 0x6a5a3a },
    floor: { color: 0xbdb8a8, surface: 'gravel' }, // pale pebbles
    nest: { moss: 0x6f9a6a, bracken: 0xb0a46a },
    rock: 0x7d8890,
  },
  // GaleClan: gorse and heather in flower; a dry heather den
  moor: {
    ring: {
      greens: [0x56632a, 0x667030, 0x48522a], strand: 0x5a3a26, specks: [[0xc9a42e, 0.03], [0x8a5a80, 0.025]],
      fruit: [[0xe0b82e, 0.6], [0x2b0d22, 0.4]], fruitShare: 0.7,
    },
    den: { base: 0x4a4030, streak: 0x8a5a80, strand: 0x3a3022, frame: 0x6a5a3e },
    floor: { color: 0x84984f, surface: 'grass' },  // cropped turf
    nest: { moss: 0x8a6a80, bracken: 0xa89a62 },
    rock: 0x9a9488,
    rockMoss: 0x7c8a52, // olive moorland moss; the nests' purple heather stays on the nests
  },
  // DuskClan: needles and moss, fern tips; a moss den
  pines: {
    ring: {
      greens: [0x1d3a2f, 0x27483a, 0x15302a], strand: 0x4a3040, specks: [[0x4f7a3a, 0.035]],
      fruit: [[0x2b0d22, 0.8], [0x8a1c2a, 0.2]], fruitShare: 0.6,
    },
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
  coreFoot: 0.42,     // a clump's green, times, at the dark core's foot ...
  coreTop: 0.78,      // ... and at its top
  crownFoot: 0.78,    // the crown lumps' green, times, at their foot ...
  crownTop: 1.22,     // ... and at their top (specks are not shaded)
  leafTint: 0x9ab04a, // the leaf cards: the clump's green, lerped toward this ...
  leafMix: 0.25,      // ... by this much ...
  leafLo: 1.0,        // ... times leafLo to leafHi, by hash
  leafHi: 1.3,
  bud: 0.7,           // a clump out of fruit: its berries are buds, green times this
  lumpIn: -0.2,       // a lump vertex's pull towards its clump's foot ...
  lumpOut: 0.05,      // ... or push away from it (lumpy, in ringMesh)
};
// y 0.011: over the path strips (0.01) and wet sand (0.008), under the paw
// prints (0.012) and the contact-shadow decals (0.015). The solid middle is
// opaque and writes depth, as the old floor did. The see-through rim writes
// none, so its order puts it between the see-through things: over the worn
// path trails (pathribbon.js, -4), so a trail runs in under the fading edge,
// and under the water band (-3), the paw prints (-2) and the decals (-1),
// which go over it (order -3.5).
// fade: the soft band at the rim, solid inside r - fade, clear at r * wobble;
// wobble: the rim's radius factor, 1 - wobble..1 (a sum of three low sinusoids).
const CLEARING = { y: 0.011, segments: 28, fade: 0.4, wobble: 0.1, order: -3.5 };
// The nests: a low moss dome (a 10-corner fan, then rings at r 0.17 / 0.33 /
// 0.41: heights 0.045 / 0.09 / 0), the raised bank darker, and 10 bracken
// fronds round the bank, each a bent two-triangle card leaning out and up.
// 70 triangles a nest.
const NEST = {
  r: 0.35, sides: 10,
  rings: [[0.17, 0.045], [0.33, 0.09], [0.41, 0]],
  frond: { from: [0.31, 0.075], tip: [0.435, 0.135], halfBase: 0.045, halfTip: 0.02 },
};
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

// The Highrock (polish-camps4, layered in polish-camps5): a stepped, layered
// boulder the leader stands on. Built around the origin (x, z 0, its foot at
// y 0) in a frame turned to `away`, the direction from the rock to its back
// (a flat camp's is away from the camp's centre; the Gorge's is +x, inland,
// as its leader looks west over the gorge), and moved to the rock's spot by
// the caller. Four stones, all in one non-indexed, flat-shaded geometry:
//  - the main boulder: ten sides, laid in strata. Each stratum (at y ~0.25
//    and ~0.51) is three rings: a joint ring drawn in under the ledge, the
//    ledge's outer lip a few cm higher and wider (so the band between them
//    faces down: a dark joint), and the ledge's top ring a little higher
//    and 5-6 cm in (a nearly flat ledge, where moss grows); upright bands
//    between strata. Then a rounded shoulder (y 0.72, r 0.5) into the top
//    ring (rock.h, r 0.4) and a flat top cap at exactly rock.h (0.8), where
//    the leader stands. A little wider along the ring round the camp than
//    out from its centre, every corner pushed in or out by up to 6 % (hash01,
//    one push for the rings of a stratum so a ledge keeps its depth; the top
//    ring inward only), drawn in round the steps' side. No bottom cap.
//    HIGHROCK_BOULDER_TRIS triangles, first in the geometry.
//  - a back stone she leans on: a round, hash-jittered icosahedron (detail
//    1, 80 triangles) behind her and turned off to one side (towards the
//    fresh-kill pile), its top under 1.15 m; its corners above 0.82 m all
//    stay more than 0.44 m from the centre (corners only: a face between
//    them can dip a few cm nearer just above the top, where only a paw or
//    the tail could brush it).
//  - two step boulders (the same icosahedra), tops ~0.5 and ~0.25 m,
//    climbing round the side away from the pile, the low one nearer the
//    camp, so the rock reads as a climb up to the top.
// No vertex is further than 0.78 m (x and z) from the centre, none further
// back than 0.68 m along `away` (the Woods camp group stays under the
// contact-shadow scan's MAX_SPAN 6.5) and none below y 0; the collider is
// still the rock's r 0.6. Each face is coloured flat, a multiplier on the
// material's look.rock (opts.rock; it may pass 1 in a channel):
//  - grey: dark at the foot (0.70) to light at the top (1.0), ±6 % by a hash
//    of the face, each stone a touch darker (its tint);
//  - faces facing down (under each ledge) × 0.62: dark joints;
//  - a crack: the boulder's faces in one or two hash-picked columns × 0.7;
//  - moss: up-facing faces (normal.y > 0.55), 60 % of them by hash (the top
//    cap, the ledges, the shoulder and the stones' tops), in the clan's moss
//    (opts.moss, look.nest.moss) × 0.85 ±6 %, divided channel-wise by
//    look.rock (both linear), so the face shows that moss;
//  - lichen: ~6 % of the other faces, pale 0xc9c79a over look.rock, × 0.95.
// Every hash takes the rock's spot as well, so no two camps' rocks are alike.
const HIGHROCK = {
  // [y, r, stratum]; y null: rock.h. Rings of one stratum share a push.
  rings: [
    [0, 0.6, 0],
    [0.2, 0.575, 1], [0.25, 0.655, 1], [0.27, 0.6, 1],  // joint, lip, ledge
    [0.46, 0.58, 2], [0.51, 0.64, 2], [0.53, 0.58, 2], // joint, lip, ledge
    [0.72, 0.5, 3],                                     // the shoulder
    [null, 0.4, 4],                                     // the top ring
  ],
  sides: 10,
  along: 1.05,   // the ring-wise stretch ...
  out: 0.93,     // ... and the outward squash
  push: 0.06,
  tilt: 0.015,   // a stratum's rings rise or fall this much a corner, together
  stepSide: 0.16, // the boulder drawn in this share where the steps climb
  reach: 0.78,   // no vertex further from the centre (x and z)
  back: 0.68,    // nor further back along `away`
  clear: 0.44,   // a corner above clearY stays this far from the centre
  clearY: 0.82,
  stoneDetail: 1, // IcosahedronGeometry detail: 80 triangles a stone
  // stones: [turn off `away` (times side), out, y, rOut, rAlong, rY, tint, salt]
  stones: [
    [-0.9, 0.5, 0.74, 0.27, 0.34, 0.38, 0.95, 31], // the back stone, to the pile's side
    [1.25, 0.5, 0.25, 0.27, 0.3, 0.29, 0.9, 32],    // the high step, top ~0.5
    [2.05, 0.58, 0.12, 0.22, 0.27, 0.15, 0.88, 33], // the low step, top ~0.25
  ],
  base: 0.7,     // the grey at the foot (1.0 at the top)
  joint: 0.62,   // a face facing down
  crack: 0.7,
  mossUp: 0.55,  // normal.y above this: a top moss can grow on ...
  mossShare: 0.6, // ... and does on this share of them
  mossShade: 0.85,
  lichen: 0xc9c79a,
  lichenShare: 0.06,
  lichenShade: 0.95,
};
/** Triangles in the Highrock's main boulder (first in its geometry) and in all. */
export const HIGHROCK_BOULDER_TRIS = (HIGHROCK.rings.length - 1) * 2 * HIGHROCK.sides + HIGHROCK.sides;
export const HIGHROCK_TRIS = HIGHROCK_BOULDER_TRIS + HIGHROCK.stones.length * 20 * (HIGHROCK.stoneDetail + 1) ** 2;
/**
 * highrockGeometry(rockSpot, away, opts) -> BufferGeometry: the Highrock round
 * the origin. opts.kill: the fresh-kill pile's x, z from the rock (the steps
 * climb the other side); opts.rock, opts.moss: the clan's look.rock and
 * look.nest.moss (hex or THREE.Color; the woods' when absent).
 */
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
  const rings = HIGHROCK.rings.map(([y0, r, stratum], ri) => {
    const y = y0 ?? top;
    const last = ri === HIGHROCK.rings.length - 1;
    const pts = [];
    for (let j = 0; j < sides; j++) {
      // each ring turned half a side on from the one under it, so the
      // faces are triangles, not upright panels
      const a = phase + ((j + ri / 2) / sides) * Math.PI * 2;
      const h = hash01(ox + j, stratum, oz, 34);
      const push = last ? 1 - h * HIGHROCK.push : 1 + (h * 2 - 1) * HIGHROCK.push;
      const dy = stratum === 1 || stratum === 2 ? (hash01(ox, stratum, oz + j, 35) * 2 - 1) * HIGHROCK.tilt : 0;
      // drawn in round the steps' side, so they stand out of it
      const lean = Math.max(0, Math.cos(a - side * 1.6)) ** 2 * HIGHROCK.stepSide;
      const rr = r * push * (1 - (last ? 0 : lean));
      const [x, z] = toXZ(Math.cos(a) * rr * HIGHROCK.out, Math.sin(a) * rr * HIGHROCK.along);
      pts.push([x, y + dy, z]);
    }
    return pts;
  });
  // the crack: one or two columns of side faces
  const crackA = Math.floor(hash01(ox, 1, oz, 39) * sides);
  const crackB = hash01(ox, 2, oz, 39) < 0.5 ? (crackA + 3 + Math.floor(hash01(ox, 3, oz, 39) * 4)) % sides : -1;
  const cracked = [];
  for (let ri = 0; ri + 1 < rings.length; ri++) {
    const lo = rings[ri];
    const hi = rings[ri + 1];
    for (let j = 0; j < sides; j++) {
      const n = (j + 1) % sides;
      const crack = j === crackA || j === crackB;
      tri(lo[j], hi[j], lo[n]);
      cracked.push(crack);
      tri(lo[n], hi[j], hi[n]);
      cracked.push(crack);
    }
  }
  const crown = rings[rings.length - 1];
  for (let j = 0; j < sides; j++) {
    tri([0, top, 0], crown[(j + 1) % sides], crown[j]);
    cracked.push(false);
  }

  // the back stone and the steps
  for (const [turn, d, y, rOut, rAlong, rY, stoneTint, salt] of HIGHROCK.stones) {
    tint = stoneTint;
    const a = away + turn * side;
    const cxs = Math.cos(a) * d;
    const czs = Math.sin(a) * d;
    const ico = new THREE.IcosahedronGeometry(1, HIGHROCK.stoneDetail);
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
      cracked.push(false);
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
  // the moss and the lichen as multipliers on look.rock (linear colours)
  const rockC = new THREE.Color(opts.rock ?? WOODS_LOOK.rock);
  const over = (c) => [c.r / Math.max(rockC.r, 1e-4), c.g / Math.max(rockC.g, 1e-4), c.b / Math.max(rockC.b, 1e-4)];
  const moss = over(new THREE.Color(opts.moss ?? WOODS_LOOK.nest.moss));
  const lichen = over(new THREE.Color(HIGHROCK.lichen));
  const col = new Float32Array(pos.length);
  for (let t = 0; t < pos.length; t += 9) {
    const f = t / 9;
    const cy = (pos[t + 1] + pos[t + 4] + pos[t + 7]) / 3;
    const cx = (pos[t] + pos[t + 3] + pos[t + 6]) / 3;
    const cz = (pos[t + 2] + pos[t + 5] + pos[t + 8]) / 3;
    const ny = nrm.getY(t / 3);
    const jit = 1 + (hash01(cx + ox, cy, cz + oz, 38) * 2 - 1) * 0.06;
    const pick = hash01(cx + ox, cy, cz + oz, 40);
    let rgb;
    if (ny > HIGHROCK.mossUp && pick < HIGHROCK.mossShare) {
      const g = HIGHROCK.mossShade * jit;
      rgb = [moss[0] * g, moss[1] * g, moss[2] * g];
    } else if (ny <= HIGHROCK.mossUp && ny >= -0.2 && pick < HIGHROCK.lichenShare) {
      const g = HIGHROCK.lichenShade;
      rgb = [lichen[0] * g, lichen[1] * g, lichen[2] * g];
    } else {
      let g = (HIGHROCK.base + (1 - HIGHROCK.base) * Math.min(1, Math.max(0, cy / top))) * tints[f] * jit;
      if (ny < -0.2) g *= HIGHROCK.joint;
      if (cracked[f]) g *= HIGHROCK.crack;
      rgb = [g, g, g];
    }
    for (let m = 0; m < 9; m += 3) {
      col[t + m] = rgb[0];
      col[t + m + 1] = rgb[1];
      col[t + m + 2] = rgb[2];
    }
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

// The bramble wall: each clump a leafy bramble mound (ringMesh and the
// polish-brambles block before it: core, crown lumps, leaf cards, berries;
// RING_CLUMP_TRIS = 59 a clump), every vertex within CLUMP_R · s of the
// clump's spot and no higher than its h, the lumps made lumpy here (each
// vertex pulled in or pushed out about its clump's foot, x 0.8 to 1.05 by a
// hash of the world vertex, so the two copies of a seam vertex move together
// and the faces stay closed). Over them the canes (campDressing ring.canes,
// CANE): bramble canes woven along the ring in two staggered layers, in and
// out across both rows, each a tapered 3-sided tube with thorns (caneTris: 6
// a segment, 3 a thorn) in the clan's strand colour, so the wall reads as a
// tangle, not a row of balls. The clan's greens by hash, dark at the foot,
// with the clan's specks on the lumps (speckle; leaves, berries and canes
// carry none). One vertex-coloured mesh, out of the shadow pass, 6,033 to
// 6,066 triangles a camp, under the area's 70,000 (test/budget.test.js). No
// ring vertex is above 1 m (ruling R3).
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

// polish-brambles: a thorn at every odd interior point of a cane (j = 1, 3,
// ... <= n - 2): a 3-sided spike (3 triangles, no base) out of the tube's
// surface at a hash angle round it, its base `base`·w across, `len0 + len1`·w
// long, tilted `tilt` rad toward the cane's tip, in the strand colour × `lift`
// (clamped), every vertex kept between the ground and 1 m.
const THORN = { base: 0.6, len0: 0.05, len1: 0.5, tilt: 0.5, lift: 1.25 };
const thornCount = (n) => Math.floor((n - 1) / 2);

/** caneTris(cane) -> the triangles caneGeometry draws for a cane: 6 a tube
 *  segment and 3 a thorn. */
export function caneTris(cane) {
  const n = cane.length;
  return 6 * (n - 1) + 3 * thornCount(n);
}

// A tapered 3-sided tube along a cane's points, flat-shaded, coloured by
// colorAt in world space, 6 triangles a segment; then its thorns (THORN), in
// thornAt's colour. caneTris(cane) triangles in all.
function caneGeometry(cane, colorAt, thornAt) {
  const n = cane.length;
  const pos = new Float32Array(n * 3 * 3);
  const t = new THREE.Vector3();
  const side = new THREE.Vector3();
  const nrm = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const frames = [];
  for (let i = 0; i < n; i++) {
    const p = cane[Math.max(0, i - 1)];
    const q = cane[Math.min(n - 1, i + 1)];
    t.set(q.x - p.x, q.y - p.y, q.z - p.z).normalize();
    side.crossVectors(up, t).normalize();
    nrm.crossVectors(t, side);
    frames.push({ t: t.clone(), side: side.clone(), nrm: nrm.clone() });
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
  const tube = bake(g, new THREE.Matrix4(), colorAt);
  // the thorns, 3 triangles each, wound to face out of the spike's axis
  const tp = new Float32Array(thornCount(n) * 9 * 3);
  const radial = new THREE.Vector3();
  const axis = new THREE.Vector3();
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const foot = new THREE.Vector3();
  const corners = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const apex = new THREE.Vector3();
  const keep = (v) => { v.y = Math.min(1.0, Math.max(0, v.y)); return v; };
  let o = 0;
  for (let j = 1; j <= n - 2; j += 2) {
    const c = cane[j];
    const f = frames[j];
    const th = 2 * Math.PI * hash01(c.x, c.y, c.z, 46);
    radial.copy(f.side).multiplyScalar(Math.cos(th)).addScaledVector(f.nrm, Math.sin(th));
    axis.copy(radial).multiplyScalar(Math.cos(THORN.tilt)).addScaledVector(f.t, Math.sin(THORN.tilt)).normalize();
    foot.set(c.x, c.y, c.z).addScaledVector(radial, c.w);
    e1.crossVectors(axis, Math.abs(axis.dot(f.t)) < 0.99 ? f.t : up).normalize();
    e2.crossVectors(axis, e1);
    const r = THORN.base * c.w;
    for (let k = 0; k < 3; k++) {
      const ph = (k * Math.PI * 2) / 3;
      keep(corners[k].copy(foot).addScaledVector(e1, r * Math.cos(ph)).addScaledVector(e2, r * Math.sin(ph)));
    }
    keep(apex.copy(foot).addScaledVector(axis, THORN.len0 + THORN.len1 * c.w));
    for (let k = 0; k < 3; k++) {
      for (const v of [corners[k], corners[(k + 1) % 3], apex]) {
        tp[o++] = v.x;
        tp[o++] = v.y;
        tp[o++] = v.z;
      }
    }
  }
  if (o === 0) return tube;
  const tg = new THREE.BufferGeometry();
  tg.setAttribute('position', new THREE.BufferAttribute(tp, 3));
  const thorns = bake(tg, new THREE.Matrix4(), thornAt);
  const both = mergeGeometries([tube, thorns], false);
  tube.dispose();
  thorns.dispose();
  return both;
}

// polish-brambles: each clump a leafy bramble mound, not a paper ball.
// RING_CLUMP_TRIS triangles a clump, in this order in the merged ring: a dark
// core lump (an icosahedron, 20, its top at 0.72 h), three smaller crown lumps
// round it (octahedra, 8 each, tipped and turned so they are not upright
// diamonds, one reaching h), six leaf cards (one triangle each, on the mound's
// envelope, facing out) and three berries (3-sided pyramids, no base: 3 each),
// in the clan's fruit colours on fruitShare of the clumps, green buds on the
// rest. Specks land on the core and crowns only. Every clump-part vertex is
// then kept within 0.98 CLUMP_R · s of the clump's spot and between 0 and h.
export const RING_CLUMP_TRIS = 59;
// where a clump's leaf cards start (after the core 20 and crowns 24) and how
// many triangles its berries take (the last of the clump's)
export const RING_LEAF_FIRST = 44;
export const RING_BERRY_TRIS = 9;
// the mound's envelope (ENV) is widened to 0.9 R and leaves start at 0.4 rad
// up it (were 0.8 R and 0.25), so leaves sit outside the core and show
const LEAF = { n: 6, len: 0.11, w: 0.06, lean: 0.03, eLo: 0.4, eHi: 1.1 };
const BERRY = { n: 3, r: 0.04, apex: 0.05, at: 0.97, eLo: 0.3, eHi: 0.95 };
// the mound's envelope: a half-ellipsoid on the clump's spot (semi-axes r·R, h·c.h)
const ENV = { r: 0.9, h: 0.88 };
const TAU = Math.PI * 2;

// a point on the clump's envelope (scaled by k) and its outward normal
function envelopeAt(c, R, phi, e, k, p, n) {
  const a = ENV.r * R * k;
  const b = ENV.h * c.h * k;
  const ce = Math.cos(e);
  const se = Math.sin(e);
  p.set(c.x + a * ce * Math.cos(phi), b * se, c.z + a * ce * Math.sin(phi));
  n.set((ce * Math.cos(phi)) / a, se / b, (ce * Math.sin(phi)) / a).normalize();
}

// keep a clump part inside its clump: xz within 0.98 R of the spot, 0 <= y <= h
function clampToClump(geo, c, R) {
  const pos = geo.attributes.position;
  const rMax = 0.98 * R;
  for (let i = 0; i < pos.count; i++) {
    let dx = pos.getX(i) - c.x;
    let dz = pos.getZ(i) - c.z;
    const r = Math.hypot(dx, dz);
    if (r > rMax) {
      dx *= rMax / r;
      dz *= rMax / r;
    }
    pos.setXYZ(i, c.x + dx, Math.max(0, Math.min(c.h, pos.getY(i))), c.z + dz);
  }
  geo.computeVertexNormals();
  return geo;
}

// polish-camps5: a crown lump shaded round, not faceted: every vertex normal
// is the direction from the lump's centre. No triangle changes;
// speckle and merging leave normals alone.
function softenAbout(geo) {
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  // the centre is the mean of the lump's final corners (lumpy and the clamp
  // have moved them off the octahedron's ideal centre)
  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (let i = 0; i < pos.count; i++) {
    cx += pos.getX(i);
    cy += pos.getY(i);
    cz += pos.getZ(i);
  }
  cx /= pos.count;
  cy /= pos.count;
  cz /= pos.count;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) - cx;
    const y = pos.getY(i) - cy;
    const z = pos.getZ(i) - cz;
    const l = Math.hypot(x, y, z) || 1;
    nor.setXYZ(i, x / l, y / l, z / l);
  }
  return geo;
}

// flat triangles (a list of [a, b, c] Vector3s), each wound so its face normal
// points away from `from(tri)`, clamped into the clump, one flat colour each
const _e1 = new THREE.Vector3();
const _e2 = new THREE.Vector3();
function facing(tris, colors, c, R, from) {
  const pos = new Float32Array(tris.length * 9);
  const col = new Float32Array(tris.length * 9);
  const rMax = 0.98 * R;
  tris.forEach((tri, t) => {
    for (const v of tri) {
      const dx = v.x - c.x;
      const dz = v.z - c.z;
      const r = Math.hypot(dx, dz);
      if (r > rMax) v.set(c.x + (dx * rMax) / r, v.y, c.z + (dz * rMax) / r);
      v.y = Math.max(0, Math.min(c.h, v.y));
    }
    const nrm = _e1.subVectors(tri[1], tri[0]).cross(_e2.subVectors(tri[2], tri[0]));
    const o = from(tri);
    const ord = nrm.dot(o) < 0 ? [0, 2, 1] : [0, 1, 2];
    ord.forEach((k, j) => {
      pos[t * 9 + j * 3] = tri[k].x;
      pos[t * 9 + j * 3 + 1] = tri[k].y;
      pos[t * 9 + j * 3 + 2] = tri[k].z;
      col[t * 9 + j * 3] = colors[t].r;
      col[t * 9 + j * 3 + 1] = colors[t].g;
      col[t * 9 + j * 3 + 2] = colors[t].b;
    });
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.computeVertexNormals();
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

const centroid = (tri) => new THREE.Vector3().add(tri[0]).add(tri[1]).add(tri[2]).multiplyScalar(1 / 3);

function ringMesh(ring, cx, cz, look) {
  const parts = [];
  const tint = new THREE.Color(RING_LOOK.leafTint);
  const fruitHex = (look.ring.fruit ?? []).map(([hex, w]) => [new THREE.Color(hex), w]);
  const fruitSum = fruitHex.reduce((n, [, w]) => n + w, 0);
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (const c of ring.clumps) {
    const R = CLUMP_R * c.s;
    const out = Math.atan2(c.z - cz, c.x - cx);
    const along = out + Math.PI / 2;
    const greens = look.ring.greens;
    const green = new THREE.Color(greens[Math.floor(hash01(c.x, c.rot, c.z, 10) * greens.length)]);
    const shade = (lo, hi, top) => (vx, vy, vz, col) => {
      const t = Math.max(0, Math.min(1, vy / top));
      col.copy(green).multiplyScalar(lo + (hi - lo) * t * (0.8 + 0.4 * hash01(vx, vy, vz, 11)));
    };
    const yaw = -along + Math.sin(c.rot) * 0.15;
    // the core: a dark, wide lump, a widest corner turned onto the ring
    const coreTop = c.h * 0.72;
    const msy = coreTop / (2 * ICO_Y);
    const core = new THREE.IcosahedronGeometry(1, 0).rotateY(ICO_TIP);
    const coreAt = shade(RING_LOOK.coreFoot, RING_LOOK.coreTop, coreTop);
    parts.push(speckle(clampToClump(lumpy(bake(core, place(c.x, coreTop - ICO_Y * msy, c.z, 0.95 * R, msy, 0.85 * R, yaw), coreAt), c), c, R), look.ring.specks, 19));
    // three crown lumps round it, the one with the highest hash reaching h
    const ch = [0, 1, 2].map((k) => hash01(c.x, c.z, k, 40));
    const tall = ch.indexOf(Math.max(...ch));
    const crownAt = shade(RING_LOOK.crownFoot, RING_LOOK.crownTop, c.h);
    for (let k = 0; k < 3; k++) {
      const az = c.rot + (k * TAU) / 3 + (hash01(c.x, c.z, k, 41) - 0.5) * 0.6;
      const rk = R * (0.38 + 0.12 * hash01(c.x, c.z, k, 42));
      const top = k === tall ? c.h : c.h * (0.8 + 0.2 * ch[k]);
      const m = place(c.x + Math.cos(az) * 0.42 * R, top - rk, c.z + Math.sin(az) * 0.42 * R, rk, rk, rk,
        TAU * hash01(c.x, c.z, k, 43), 0.35 * hash01(c.x, c.z, k, 44));
      const lump = clampToClump(lumpy(bake(new THREE.OctahedronGeometry(1, 0), m, crownAt), c), c, R);
      parts.push(speckle(softenAbout(lump), look.ring.specks, 19));
    }
    // six leaf cards on the envelope, tips up the slope and leaning out
    const leaves = [];
    const leafCols = [];
    for (let l = 0; l < LEAF.n; l++) {
      const phi = TAU * hash01(c.x, c.z, l, 30);
      const e = LEAF.eLo + (LEAF.eHi - LEAF.eLo) * hash01(c.x, c.z, l, 31);
      envelopeAt(c, R, phi, e, 1, p, n);
      const up = new THREE.Vector3(-Math.sin(e) * Math.cos(phi), Math.cos(e), -Math.sin(e) * Math.sin(phi));
      const lat = new THREE.Vector3(-Math.sin(phi), 0, Math.cos(phi));
      const turn = (hash01(c.x, c.z, l, 32) - 0.5) * 1.2;
      const dir = up.clone().multiplyScalar(Math.cos(turn)).addScaledVector(lat, Math.sin(turn));
      const side = new THREE.Vector3().crossVectors(n, dir).normalize();
      const half = (LEAF.w * c.s) / 2;
      const len = LEAF.len * c.s * (0.85 + 0.3 * hash01(c.x, c.z, l, 33));
      leaves.push([
        p.clone().addScaledVector(side, -half),
        p.clone().addScaledVector(side, half),
        p.clone().addScaledVector(dir, len).addScaledVector(n, LEAF.lean),
      ]);
      leafCols.push(green.clone().lerp(tint, RING_LOOK.leafMix)
        .multiplyScalar(RING_LOOK.leafLo + (RING_LOOK.leafHi - RING_LOOK.leafLo) * hash01(c.x, c.z, l, 34)));
    }
    parts.push(facing(leaves, leafCols, c, R, (tri) => centroid(tri).sub(new THREE.Vector3(c.x, 0, c.z))));
    // three berries (or buds) on the envelope, a little inside it
    const fruiting = fruitHex.length > 0 && hash01(c.x, c.z, 0, 50) < look.ring.fruitShare;
    const berries = [];
    const berryCols = [];
    for (let b = 0; b < BERRY.n; b++) {
      const phi = TAU * hash01(c.x, c.z, b, 53);
      const e = BERRY.eLo + (BERRY.eHi - BERRY.eLo) * hash01(c.x, c.z, b, 54);
      envelopeAt(c, R, phi, e, BERRY.at, p, n);
      const u = new THREE.Vector3(-Math.sin(phi), 0, Math.cos(phi));
      const v = new THREE.Vector3().crossVectors(n, u).normalize();
      const apex = p.clone().addScaledVector(n, BERRY.apex);
      const base = [0, 1, 2].map((i) => {
        const th = (i * TAU) / 3;
        return p.clone().addScaledVector(u, BERRY.r * Math.cos(th)).addScaledVector(v, BERRY.r * Math.sin(th));
      });
      let colr;
      if (fruiting) {
        // a fruit by weight, shaded by a hash factor kept off 1, so a berry is
        // never exactly a bare speck or fruit hex
        let h = hash01(c.x, c.z, b, 51) * fruitSum;
        let pick = fruitHex[fruitHex.length - 1][0];
        for (const [hex, w] of fruitHex) {
          if (h < w) { pick = hex; break; }
          h -= w;
        }
        // 0.96..1.01, so the lit face (x 1.08) and the others (x 0.94) stay in 0.9..1.1
        let f = 0.96 + 0.05 * hash01(c.x, c.z, b, 52);
        if (Math.abs(f - 1) < 0.01) f = f < 1 ? 0.99 : 1.01;
        colr = pick.clone().multiplyScalar(f);
      } else {
        colr = green.clone().multiplyScalar(RING_LOOK.bud);
      }
      const mid = p.clone();
      const tris = [0, 1, 2].map((i) => {
        const tri = [base[i].clone(), base[(i + 1) % 3].clone(), apex.clone()];
        tri.mid = mid;
        return tri;
      });
      // a fruit's face turned most upward is its lit one (x 1.08), the rest x 0.94
      let lit = -1;
      if (fruiting) {
        let best = -Infinity;
        tris.forEach((tri, i) => {
          const fn = _e1.subVectors(tri[1], tri[0]).cross(_e2.subVectors(tri[2], tri[0])).normalize();
          if (fn.dot(centroid(tri).sub(mid)) < 0) fn.negate();
          if (fn.y > best) { best = fn.y; lit = i; }
        });
      }
      tris.forEach((tri, i) => {
        berries.push(tri);
        berryCols.push(fruiting ? colr.clone().multiplyScalar(i === lit ? 1.08 : 0.94) : colr);
      });
    }
    parts.push(facing(berries, berryCols, c, R, (tri) => centroid(tri).sub(tri.mid)));
  }
  const caneAt = (vx, vy, vz, col) => col.setHex(look.ring.strand).multiplyScalar(0.85 + 0.3 * hash01(vx, vy, vz, 18));
  const thornCol = new THREE.Color(look.ring.strand).multiplyScalar(THORN.lift);
  thornCol.setRGB(Math.min(1, thornCol.r), Math.min(1, thornCol.g), Math.min(1, thornCol.b));
  const thornAt = (vx, vy, vz, col) => col.copy(thornCol);
  for (const cane of ring.canes) parts.push(caneGeometry(cane, caneAt, thornAt));
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
// strip or trail under it stays hidden; the rim band see-through, not written
// to depth, at renderOrder -3.5: over the path trails (-4), so a trail slips
// in under the fading edge, and under the water band (-3), paw prints (-2)
// and contact-shadow decals (-1), so prints and decals go over it. Lifted 1.1 cm and pulled towards the camera (polygonOffset) so
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
  mesh.userData.duskTint = true; // walk.js hands it to render/dusk.js's tintDuskLawn
  mesh.renderOrder = CLEARING.order;
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, CLEARING.y, z);
  mesh.userData.noCast = true;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  return mesh;
}

// The nests: a domed moss cushion under each elder and kit, bracken fronds
// round its bank. One vertex-coloured mesh, out of the shadow pass.
function nestsMesh(nests, look, groundY = () => 0, flat = 1) {
  const parts = [];
  // `flat` < 1 presses a nest down towards the ground under it (the ledge's:
  // low enough, under 0.1 m, that the contact-shadow scan gives the bedding no
  // decal).
  const press = (m, gy) => (flat === 1 ? m : m.premultiply(new THREE.Matrix4().makeTranslation(0, -gy, 0))
    .premultiply(new THREE.Matrix4().makeScale(1, flat, 1)).premultiply(new THREE.Matrix4().makeTranslation(0, gy, 0)));
  const K = NEST.sides;
  for (const n of nests) {
    const gy = groundY(n.x, n.z);
    const turn = hash01(n.x, 0, n.z, 13) * Math.PI * 2;
    const tris = [];
    const ringPt = (ring, i, wob = 0) => {
      const t = turn + (i / K) * Math.PI * 2;
      const r = NEST.rings[ring][0] * (1 + wob * (hash01(n.x + i, ring, n.z, 17) - 0.5));
      return [Math.cos(t) * r, NEST.rings[ring][1], Math.sin(t) * r];
    };
    for (let i = 0; i < K; i++) {
      const j = (i + 1) % K;
      tris.push([0, 0, 0], ringPt(0, i), ringPt(0, j));
      tris.push(ringPt(0, i), ringPt(1, i), ringPt(1, j), ringPt(0, i), ringPt(1, j), ringPt(0, j));
      tris.push(ringPt(1, i), ringPt(2, i), ringPt(2, j), ringPt(1, i), ringPt(2, j), ringPt(1, j));
    }
    // the fronds: a base on the bank, a narrower tip out and up
    const F = NEST.frond;
    for (let i = 0; i < K; i++) {
      const t = turn + ((i + 0.5 + 0.3 * (hash01(n.x, i, n.z, 18) - 0.5)) / K) * Math.PI * 2;
      const lean = 0.9 + 0.2 * hash01(n.x, i, n.z, 19);
      const c = Math.cos(t); const s = Math.sin(t);
      const at = (r, y, side) => [c * r - s * side, y, s * r + c * side];
      const b0 = at(F.from[0], F.from[1], -F.halfBase);
      const b1 = at(F.from[0], F.from[1], F.halfBase);
      const r1 = F.from[0] + (F.tip[0] - F.from[0]) * lean;
      const y1 = F.from[1] + (F.tip[1] - F.from[1]) * lean;
      const t0 = at(r1, y1, -F.halfTip);
      const t1 = at(r1, y1, F.halfTip);
      tris.push(b0, t1, b1, b0, t0, t1);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(tris.flat(), 3));
    // colour by vertex index so the dome and the fronds can differ
    const bodyVerts = K * 3 + K * 6 * 2; // the fan and the two bands, before the fronds
    const colors = new Float32Array(tris.length * 3);
    const cc = new THREE.Color();
    for (let v = 0; v < tris.length; v++) {
      const [lx, ly, lz] = tris[v];
      if (v < bodyVerts) {
        cc.setHex(look.nest.moss).multiplyScalar(0.8 + 0.35 * hash01(lx + n.x, ly, lz + n.z, 14));
        if (Math.hypot(lx, lz) > 0.28) cc.multiplyScalar(0.8); // the bank is darker
      } else {
        cc.setHex(look.nest.bracken).multiplyScalar(0.85 + 0.25 * hash01(lx + n.x, ly, lz + n.z, 15));
      }
      colors.set([cc.r, cc.g, cc.b], v * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const m = press(place(n.x, gy, n.z, 1, 1, 1, 0, 0), gy);
    geo.applyMatrix4(m);
    geo.computeVertexNormals();
    parts.push(geo);
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
    rock: highrockGeometry(L.rock, 0, {
      kill: { x: D.kill.x - L.rock.x, z: D.kill.z - L.rock.z }, rock: look.rock, moss: look.rockMoss ?? look.nest.moss,
    }),
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
      kill: { x: D.kill.x - L.rock.x, z: D.kill.z - L.rock.z }, rock: look.rock, moss: look.rockMoss ?? look.nest.moss,
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
