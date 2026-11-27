import * as b from './builder.js';
import { createWater, PARK_POND_LOOK } from '../render/water.js';
import { addTrails } from './pathribbon.js';
import { sureClawsTreePerch, SURE_CLAWS_ID } from '../climbing.js';
import { tintGround, smoothstep, rectDist, lerp3, lin } from './dressing.js';
import { lawnMottle } from './park.js';
import { withLocalUuids } from './localuuids.js';
import { seedFromCode } from '../rng.js';
import * as parts from './farmparts.js';
import { BARN, BALE, TRACTOR, STAND, SCARECROW, GRAIN_STORE, FARM_COLORS } from './farmparts.js';
import { cutForGates } from '../gateways.js';
import { farmBeautyParts } from './farmbeauty.js';

// =============================================================================
// Appletree Farm (docs/superpowers/specs/2026-11-18-farm-design.md), step 1:
// THE PLACE. A walkable farm made only of things the game already does: paths,
// perches, a pond to wade and swim, trees to climb, the small creatures that
// exist today. The cow, the hens, the sheepdog and the jobs come in steps 2
// and 3; `anchors` in the record below names every spot they will need, so
// nothing has to be measured again.
//
// THE MAP, north up (north is -z, east is +x), on the same 120 m ground as the
// Park:
//
//                       wheat field, scarecrow
//     goat paddock          RED BARN (hayloft)
//     rocks, stand        hay bales            tractor shed
//          hen coop  ----- FARMYARD -----      grain store      cow pasture
//          farmhouse        well               milking shed     shade tree
//          kennel                                               trough
//          vegetable beds     lane
//     duck pond, jetty        lane             apple orchard
//                           FARM GATE (spawn)
//
// NOTHING HERE CHASES OR FRIGHTENS THE CAT (the design's anti-goal): there is
// no yard dog (propsets.js: dogYard null) and no rival border (rivalclans.js
// has no disc for the Farm).
//
// FENCES HAVE NO COLLIDERS. A cat goes under a field fence's bottom rail, so
// the paddock, the pasture and the hen run are places she walks straight
// into, and nothing can pen her in.
//
// THE POND keeps the Park pond's rule: nothing the player has to reach is in
// the water. Its rim is wadeable for every cat (`shallow`), the middle is a
// swim, and the jetty is a dry deck.
// =============================================================================

export const FARM_GRASS = 0x62a24e;
// The lane, the yard and the tracks: packed earth.
export const FARM_PATH_STYLE = Object.freeze({ surface: 'sand', color: 0xb99a6e });

// The lane's south end is at the map's edge (z 50) and runs on this far, in
// under the hedge across its end and the rising hills (the Park's south walk
// does the same).
export const FARM_PATH_EXTEND = 17;

// Just outside the gate, on the lane: the walk opens looking in under the
// farm's sign, and the first steps are through the gateway.
export const SPAWN = Object.freeze({ x: 0, z: 47.8 });
// South of the gate the lane runs on to the hedge: the cat can follow it out
// as far as z 50.
export const FARM_BOUNDS = Object.freeze({ minX: -44, maxX: 44, minZ: -44, maxZ: 50 });

const rect = (minX, maxX, minZ, maxZ) => Object.freeze({ minX, maxX, minZ, maxZ });
const pt = (x, z, more) => Object.freeze({ x, z, ...more });

// The jetty, as data, and the pond that carries it.
export const JETTY = rect(-26.5, -21.2, 31.3, 32.7);
export const POND = Object.freeze({ id: 'pond', kind: 'circle', x: -29, z: 32, r: 7, shallow: 1.5, decks: Object.freeze([JETTY]) });

// Where things stand. Buildings are [centre x, centre z, yaw]; a yaw of
// -PI/2 turns a model's front (+z) to face west, PI/2 to face east.
const WEST = -Math.PI / 2;
const EAST = Math.PI / 2;
export const BARN_AT = pt(0, -15);
export const TRACTOR_SHED_AT = pt(17, -6);
export const GRAIN_STORE_AT = pt(17, 3.5);
export const MILKING_SHED_AT = pt(17, 12.5);
export const TRACTOR_AT = pt(17.2, -6);
export const FARMHOUSE_AT = pt(-20, 8);
export const KENNEL_AT = pt(-15.2, 13.2);
export const COOP_AT = pt(-18, -7);
export const HEN_RUN = rect(-22, -12.5, -11, -3);
export const GOAT_PADDOCK = rect(-39, -23, -35, -19);
export const PASTURE = rect(26, 42.5, -32, 16);
export const WHEAT_FIELD = rect(-16, 22, -41, -23.5);
export const VEG_BEDS = Object.freeze([rect(-25, -15.5, 15.2, 18.4), rect(-25, -15.5, 19.4, 22.6)]);
export const ORCHARD = rect(6, 41, 21, 41);
export const SCARECROW_AT = pt(6, -31);
export const WELL_AT = pt(-6.5, 7);
export const GOAT_STAND_AT = pt(-30.5, -27);
export const GOAT_ROCK_AT = pt(-32.3, -27);
export const GOAT_SHELTER_AT = pt(-36, -32.5);
export const TROUGH_AT = pt(27.2, 2);
export const SHADE_TREE_AT = pt(35, -14);
export const GATE_AT = pt(0, 45);
export const GOAT_GATE = pt(-23, -22.5);
export const PASTURE_GATE = pt(26, 8);

// Fifteen apple trees in three staggered rows.
export const APPLE_TREES = Object.freeze([
  ...[9, 15.5, 22, 28.5, 35].map((x) => pt(x, 24)),
  ...[12.2, 18.7, 25.2, 31.7, 38.2].map((x) => pt(x, 31)),
  ...[9, 15.5, 22, 28.5, 35].map((x) => pt(x, 38)),
]);
const APPLE_SCALE = 0.85;
// The other trees: [x, z, scale, kind]. The first is the pasture's shade tree.
const TREES = Object.freeze([
  [SHADE_TREE_AT.x, SHADE_TREE_AT.z, 1.5, 'oak'], [39.5, 9, 1.2, 'round'], [-27, 4, 1.3, 'oak'],
  [-17, 41, 1.1, 'round'], [-41, -12, 1.2, 'oak'], [-40.5, 14, 1.15, 'birch'],
]);
const WILLOW_AT = pt(-37.8, 25.2);

// The hay bales in front of the barn, east of the big doors: the way up to
// the hayloft. [x, z, bottom y, yaw].
const BARN_FRONT = BARN_AT.z + BARN.d / 2; // z -10.5
const BALE_Z = BARN_FRONT + 0.55;
const BALE_STEP = 0.4; // how far toward the yard the first bale's standing spot is from its middle
const BALE_SOLID = 0.55; // a ground bale's solid circle (the bale is 1.3 by 1.0)
export const BARN_BALES = Object.freeze([
  Object.freeze({ x: 4.6, z: BALE_Z, y: 0, yaw: 0 }),
  Object.freeze({ x: 3.2, z: BALE_Z, y: 0, yaw: 0 }),
  Object.freeze({ x: 3.2, z: BALE_Z, y: BALE.h, yaw: 0.08 }),
  Object.freeze({ x: 6.15, z: BARN_FRONT + 0.8, y: 0, yaw: 0.5 }),
]);
// Two big round bales left at the wheat field's edge.
export const ROUND_BALES = Object.freeze([
  Object.freeze({ x: 18, z: -21.6, y: 0, yaw: 0.3, round: true }),
  Object.freeze({ x: 20.2, z: -21.2, y: 0, yaw: 1.2, round: true }),
]);

// The track into the wheat, and the scarecrow's clearing: no wheat on either.
const WHEAT_TRACK = Object.freeze([10.5, -21, 6.6, -28.6]);
const SCARECROW_CLEAR = 2.4;
function distToSeg(px, pz, x1, z1, x2, z2) {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const t = Math.min(1, Math.max(0, ((px - x1) * dx + (pz - z1) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(px - x1 - dx * t, pz - z1 - dz * t);
}
export function wheatGrowsAt(x, z) {
  if (x < WHEAT_FIELD.minX || x > WHEAT_FIELD.maxX || z < WHEAT_FIELD.minZ || z > WHEAT_FIELD.maxZ) return false;
  if (Math.hypot(x - SCARECROW_AT.x, z - SCARECROW_AT.z) < SCARECROW_CLEAR) return false;
  return distToSeg(x, z, ...WHEAT_TRACK) > 1.2;
}

// Where the lawn's tufts do not grow (render/grass.js reads it): the wheat
// field and the vegetable beds.
export function farmBare(x, z) {
  if (rectDist(WHEAT_FIELD, x, z) < 0.4) return true;
  return VEG_BEDS.some((bed) => rectDist(bed, x, z) < 0.3);
}

// The ground's colour, as a multiplier on the grass: the lawn's slow mottle,
// stubble gold under the wheat, dark soil in the vegetable beds.
const farmMottle = lawnMottle(617);
const over = (hex) => { const g = lin(FARM_GRASS); const t = lin(hex); return [t[0] / g[0], t[1] / g[1], t[2] / g[2]]; };
const STUBBLE = over(0xb39a52);
const SOIL = over(FARM_COLORS.soil);
export function farmGroundTint(x, z) {
  let m = farmMottle(x, z);
  const wheatK = 1 - smoothstep(0, 1.2, rectDist(WHEAT_FIELD, x, z));
  if (wheatK > 0) m = lerp3(m, STUBBLE, wheatK);
  for (const bed of VEG_BEDS) {
    const k = 1 - smoothstep(0, 0.6, rectDist(bed, x, z));
    if (k > 0) m = lerp3(m, SOIL, k);
  }
  return m;
}

// The trails: [x1, z1, x2, z2] segments by width. The lane runs in from the
// map's south edge (z 50, which addTrails carries on out under the hedge).
export const FARM_TRAILS = Object.freeze([
  { w: 3, segs: [[0, 50, 0, 12]] },                                   // the lane
  { w: 18, segs: [[-3, 3, 3, 3]] },                                   // the farmyard
  { w: 5, segs: [[0, -5, 0, -9.3]] },                                 // up to the barn doors
  { w: 6, segs: [[12, -6, 17.4, -6]] },                               // the tractor shed's earth floor
  { w: 2, segs: [[10, 8, 25.6, 8], [-10, 8, -15.6, 8]] },             // to the pasture gate; to the farmhouse
  { w: 1.6, segs: [
    [-8.5, -3.5, -12.5, -13], [-12.5, -13, -22, -22.5],               // to the goat paddock
    [0, 31, -20.6, 32],                                               // to the jetty
    [0, 28, 9, 27.5],                                                 // into the orchard
    [9.5, -7.5, 10.5, -21], [WHEAT_TRACK[0], WHEAT_TRACK[1], WHEAT_TRACK[2], WHEAT_TRACK[3]], // round the barn to the scarecrow
  ] },
].map((g) => Object.freeze({ w: g.w, segs: Object.freeze(g.segs.map((s) => Object.freeze(s))) })));

export const FARM_HORIZON = Object.freeze({
  kind: 'hills', inner: 56, outer: 116, height: 7, wavelength: 36,
  color: 0x86b874, salt: 71,
  nearColor: FARM_GRASS,
  // The hedge runs right round, across the lane too (gateways placement
  // round, 2026-11-21: its shut field gate read as one more gate that never
  // opens, beside the real gate back to the Park).
  edge: Object.freeze({ half: 60, style: 'hedge' }),
});

// Fence runs: [x1, z1, x2, z2]. Gateways are simply left out.
function ring(r, gap) {
  // a rectangle's four sides, with one gap { side, from, to } cut out
  const sides = {
    w: [r.minX, r.minZ, r.minX, r.maxZ], e: [r.maxX, r.minZ, r.maxX, r.maxZ],
    n: [r.minX, r.minZ, r.maxX, r.minZ], s: [r.minX, r.maxZ, r.maxX, r.maxZ],
  };
  const out = [];
  for (const [k, s] of Object.entries(sides)) {
    if (gap && gap.side === k) {
      const alongZ = k === 'w' || k === 'e';
      out.push(alongZ ? [s[0], s[1], s[0], gap.from] : [s[0], s[1], gap.from, s[1]]);
      out.push(alongZ ? [s[0], gap.to, s[0], s[3]] : [gap.to, s[1], s[2], s[1]]);
    } else out.push(s);
  }
  return out;
}
const FENCE_RUNS = Object.freeze([
  ...ring(PASTURE, { side: 'w', from: PASTURE_GATE.z - 1.4, to: PASTURE_GATE.z + 1.4 }).map(([x1, z1, x2, z2]) => ({ a: [x1, z1], b: [x2, z2], style: 'rail' })),
  ...ring(GOAT_PADDOCK, { side: 'e', from: GOAT_GATE.z - 1.7, to: GOAT_GATE.z + 1.7 }).map(([x1, z1, x2, z2]) => ({ a: [x1, z1], b: [x2, z2], style: 'rail' })),
  ...ring(HEN_RUN, { side: 'e', from: COOP_AT.z - 0.8, to: COOP_AT.z + 0.8 }).map(([x1, z1, x2, z2]) => ({ a: [x1, z1], b: [x2, z2], style: 'wire' })),
]);
// The front fence. build() cuts it where a gate walk.js draws is set into it
// (`gateEnds`: the gate ends this walk draws; a walk that draws no gates, and
// a bare build, keep it whole). Visual only: no fence here has a collider.
const FRONT_RUNS = Object.freeze([
  { a: [-44, GATE_AT.z], b: [-2.6, GATE_AT.z], style: 'picket' },
  { a: [2.6, GATE_AT.z], b: [44, GATE_AT.z], style: 'picket' },
]);
const GATES = Object.freeze([
  { x: PASTURE_GATE.x, z: PASTURE_GATE.z + 1.4, len: 2.7, yaw: Math.PI * 0.72 },
  { x: -2.6, z: GATE_AT.z, len: 2.5, yaw: Math.PI * 1.12, color: FARM_COLORS.trim },
  { x: 2.6, z: GATE_AT.z, len: 2.5, yaw: Math.PI * 0.88, color: FARM_COLORS.trim },
]);

// A building is a rectangle and the collision system is circles: a row of
// circles as wide as the short side, and a smaller one tucked into each
// corner so the cat cannot cut it.
function blockRect(addC, minX, maxX, minZ, maxZ) {
  const w = maxX - minX;
  const d = maxZ - minZ;
  const a = Math.min(w, d) / 2;
  const alongX = w >= d;
  const from = (alongX ? minX : minZ) + a;
  const to = (alongX ? maxX : maxZ) - a;
  const n = Math.max(1, Math.ceil((to - from) / a) + 1);
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? (from + to) / 2 : from + ((to - from) * i) / (n - 1);
    addC(alongX ? t : (minX + maxX) / 2, alongX ? (minZ + maxZ) / 2 : t, a);
  }
  const c = Math.min(1.3, a * 0.45);
  for (const cx of [minX + c, maxX - c]) for (const cz of [minZ + c, maxZ - c]) addC(cx, cz, c);
}
// A thin wall: small circles along it.
function wallLine(addC, x1, z1, x2, z2, r = 0.5) {
  const len = Math.hypot(x2 - x1, z2 - z1);
  const n = Math.max(1, Math.ceil(len / 1.1));
  for (let i = 0; i <= n; i++) addC(x1 + ((x2 - x1) * i) / n, z1 + ((z2 - z1) * i) / n, r);
}

// A model's local point (lx, lz) in the world, for a building at `at` turned `yaw`.
const world = (at, yaw, lx, lz) => ({
  x: Math.round((at.x + lx * Math.cos(yaw) + lz * Math.sin(yaw)) * 100) / 100,
  z: Math.round((at.z - lx * Math.sin(yaw) + lz * Math.cos(yaw)) * 100) / 100,
});

// ---- the perches, as data (the chains are described at `perches` below) ---------------
// The first bale is a low perch (y 0.9), and a low perch is reached from only
// 1.2 m away (climbing.js reachLow, meant for a spot at a prop's edge). With the
// spot at the bale's middle and the bale solid to 1.0 m from there, the place to
// jump from was a ring 0.2 m deep, and the owner could not get up (2026-11-19).
// So the spot is at the bale's FRONT edge, where a cat coming from the yard is.
const HAY_BALE_1 = Object.freeze({ x: BARN_BALES[0].x, z: BARN_BALES[0].z + BALE_STEP, y: BALE.h, kind: 'crate' });
const HAY_BALE_2 = Object.freeze({ x: BARN_BALES[2].x, z: BARN_BALES[2].z, y: BALE.h * 2, kind: 'crate' });
const HAY_DOOR = Object.freeze({ x: 1.2, z: BARN_FRONT - 0.3, y: BARN.loft, kind: 'roof' });
const HAYLOFT = Object.freeze({ x: 0.3, z: -12.8, y: BARN.loft, kind: 'roof', label: 'the hayloft', vantage: true });
const TRACTOR_BONNET = Object.freeze({ ...world(TRACTOR_AT, WEST, 0, TRACTOR.bonnetZ), y: TRACTOR.bonnetY, kind: 'car' });
const TRACTOR_ROOF = Object.freeze({ ...world(TRACTOR_AT, WEST, 0, TRACTOR.roofZ), y: TRACTOR.roofY, kind: 'car', label: 'tractor roof', vantage: true });
const GOAT_ROCK = Object.freeze({ x: GOAT_ROCK_AT.x, z: GOAT_ROCK_AT.z, y: 0.72, kind: 'stone' });
const GOAT_STAND = Object.freeze({ x: GOAT_STAND_AT.x, z: GOAT_STAND_AT.z, y: STAND.top, kind: 'crate', label: 'the goats’ jumping stand', vantage: true });
const BENCH_AT = pt(-16, 3.6);

export const FARM_HIDES = Object.freeze([
  pt(GOAT_SHELTER_AT.x, GOAT_SHELTER_AT.z + 1.9), // the mouth of the goats' shelter
  pt(7.5, -9.0),                                  // behind the hay bales by the barn
  pt(6.5, 21.5),                                  // under the bush at the orchard's corner
]);

export function build(scene, { water = {}, wind, gateEnds = [] } = {}) {
  // A bright farm morning: a clear blue over a pale, hazy horizon.
  b.applySky(scene, 0x9ad0ee, 0xdcefe4);
  const lawn = b.ground(120, FARM_GRASS, { surface: 'grass' });
  lawn.updateMatrix();
  tintGround(lawn, farmGroundTint);
  scene.add(lawn);
  // Rolling fields past a hedge that runs right round.
  scene.add(b.horizonBand(FARM_HORIZON));

  const colliders = [];
  const addC = (x, z, r) => colliders.push({ x, z, r });
  const clawPerches = [];

  // --- the lane, the yard and the tracks ---------------------------------------
  addTrails(scene, FARM_TRAILS.map((g) => ({ w: g.w, segs: g.segs })), FARM_PATH_STYLE, 'farm',
    { decks: POND.decks, waters: [POND], extend: FARM_PATH_EXTEND });

  // --- the pond -------------------------------------------------------------------
  // Drawn from POND, like the Park's, in the same calm green-blue.
  const pond = createWater(POND, {
    y: 0.02,
    ...PARK_POND_LOOK,
    quality: water.quality ?? 'high',
    reducedMotion: water.reducedMotion ?? false,
    foamStrength: 0.25,
  });
  scene.add(pond.mesh);
  // reeds round the west and south rim (the jetty and the track are east)
  const reeds = [];
  for (let i = 0; i < 26; i++) {
    const a = Math.PI * (0.62 + (i / 25) * 0.95) + (b.hash01(i, 3, 91) - 0.5) * 0.08;
    const r = POND.r + 0.25 + b.hash01(i, 7, 92) * 0.7;
    reeds.push({ x: POND.x + Math.cos(a) * r, z: POND.z + Math.sin(a) * r });
  }
  const reedMesh = b.reedBed(reeds, seedFromCode('farm-reeds'));
  reedMesh.name = 'reeds';
  scene.add(reedMesh);
  const pads = [[-32.5, 30.2, 0.42], [-31.6, 29.4, 0.3], [-33.4, 33.6, 0.38], [-30.2, 36.2, 0.44], [-28.6, 36.9, 0.3],
    [-32.4, 35.4, 0.3], [-27.4, 28.2, 0.36], [-30.6, 27.6, 0.3]].map(([x, z, r]) => ({ x, z, r }));
  const lilies = b.lilyPads(pads, seedFromCode('farm-lilies'));
  lilies.name = 'lilyPads';
  scene.add(lilies);

  // --- the farm's own models (farmparts.js), on a local uuid stream ---------------------
  const shedFront = TRACTOR_SHED_AT.x - 3.5; // x 13.5: the sheds' fronts, facing the yard
  const made = withLocalUuids('farm-models', () => ({
    barn: parts.barn(BARN_AT.x, BARN_AT.z, 0),
    barnLoft: parts.barnLoft(BARN_AT.x, BARN_AT.z, 0),
    tractorShed: parts.tractorShed(TRACTOR_SHED_AT.x, TRACTOR_SHED_AT.z, WEST),
    grainStore: parts.grainStore(GRAIN_STORE_AT.x, GRAIN_STORE_AT.z, WEST),
    milkingShed: parts.milkingShed(MILKING_SHED_AT.x, MILKING_SHED_AT.z, WEST),
    coop: parts.henCoop(COOP_AT.x, COOP_AT.z, EAST),
    kennel: parts.kennel(KENNEL_AT.x, KENNEL_AT.z, EAST),
    tractor: parts.tractor(TRACTOR_AT.x, TRACTOR_AT.z, WEST),
    bales: parts.hayBales([...BARN_BALES, ...ROUND_BALES]),
    fences: parts.fences([...FENCE_RUNS, ...cutForGates(FRONT_RUNS, gateEnds)], GATES),
    gate: parts.gateArch(GATE_AT.x, GATE_AT.z, 2.6),
    scarecrow: parts.scarecrow(SCARECROW_AT.x, SCARECROW_AT.z, 0.5),
    scarecrowHat: parts.scarecrowHat(SCARECROW_AT.x, SCARECROW_AT.z, 0.5),
    structures: parts.structures({
      jetty: JETTY,
      trough: { ...TROUGH_AT, yaw: Math.PI / 2 },
      stand: { ...GOAT_STAND_AT, yaw: Math.PI },
      shelter: GOAT_SHELTER_AT,
      well: WELL_AT,
      beds: VEG_BEDS,
    }),
    // the vegetable rows, with the beauty round folded in (farmbeauty.js): one mesh
    crops: parts.crops(VEG_BEDS, farmBeautyParts({
      wheat: WHEAT_FIELD, wheatTrack: WHEAT_TRACK, pasture: PASTURE, paddock: GOAT_PADDOCK, henRun: HEN_RUN,
      pastureGate: PASTURE_GATE, goatGate: GOAT_GATE, beds: VEG_BEDS, pond: POND, jetty: JETTY,
    })),
    wheat: parts.wheat(parts.wheatSpots(WHEAT_FIELD, (x, z) => !wheatGrowsAt(x, z))),
  }));
  for (const m of Object.values(made)) scene.add(m);

  // The barn: solid at ground level (its hayloft is reached over the bales).
  blockRect(addC, BARN_AT.x - BARN.w / 2, BARN_AT.x + BARN.w / 2, BARN_AT.z - BARN.d / 2, BARN_FRONT);
  for (const bale of BARN_BALES) if (!bale.y) addC(bale.x, bale.z, BALE_SOLID);
  for (const bale of ROUND_BALES) addC(bale.x, bale.z, 0.8);
  // The tractor shed is open to the yard: three thin walls, and the tractor inside.
  wallLine(addC, shedFront + 0.5, -9.5, 20.5, -9.5);
  wallLine(addC, shedFront + 0.5, -2.5, 20.5, -2.5);
  wallLine(addC, 20.5, -8.4, 20.5, -3.6);
  addC(TRACTOR_BONNET.x, TRACTOR_AT.z, 0.9);
  addC(TRACTOR_ROOF.x, TRACTOR_AT.z, 1.0);
  // The grain store, its steel bin, and the milking shed.
  blockRect(addC, shedFront, 20.5, 0.5, 6.5);
  addC(GRAIN_STORE_AT.x + GRAIN_STORE.d / 2 + GRAIN_STORE.binR + 0.3, GRAIN_STORE_AT.z, GRAIN_STORE.binR + 0.1);
  blockRect(addC, shedFront, 20.5, 9.5, 15.5);
  // The west side: the coop, the kennel, the well.
  addC(COOP_AT.x, COOP_AT.z, 1.5);
  addC(KENNEL_AT.x, KENNEL_AT.z, 0.75);
  addC(WELL_AT.x, WELL_AT.z, 0.95);
  // The paddock and the pasture.
  addC(GOAT_STAND_AT.x, GOAT_STAND_AT.z, 0.95);
  addC(GOAT_SHELTER_AT.x, GOAT_SHELTER_AT.z - 0.2, 1.2);
  addC(TROUGH_AT.x, TROUGH_AT.z - 0.55, 0.45);
  addC(TROUGH_AT.x, TROUGH_AT.z + 0.55, 0.45);
  addC(SCARECROW_AT.x, SCARECROW_AT.z, 0.4);

  // --- the farmhouse -------------------------------------------------------------------
  // builder.house, turned so its porch faces the yard.
  const farmhouse = b.house(FARMHOUSE_AT.x, FARMHOUSE_AT.z, 0xf1e6c8, 0x8a4338, 'siding',
    { roof: 'frontGable', door: 0x3f6b4a, shutters: 0x3f6b4a, flowerBox: true, entry: 'porch', chimney: [1.2, -0.8] });
  farmhouse.rotation.y = EAST;
  farmhouse.name = 'farmhouse';
  scene.add(farmhouse);
  addC(FARMHOUSE_AT.x, FARMHOUSE_AT.z, 3.4);
  scene.add(b.bench(BENCH_AT.x, BENCH_AT.z, EAST));

  // --- the goat paddock's rocks ------------------------------------------------------------
  for (const [x, z] of [[GOAT_ROCK_AT.x, GOAT_ROCK_AT.z], [-34.2, -25.4], [-33.6, -28.6], [-27.2, -31.5]]) scene.add(b.rock(x, z));

  // --- trees -----------------------------------------------------------------------------------
  // The orchard: small round apple trees, each with its apples. A Sure Claws
  // cat climbs to the fork, as in the Park.
  APPLE_TREES.forEach(({ x, z }, i) => {
    const tree = b.tree(x, z, APPLE_SCALE, { wind, kind: 'round' });
    tree.add(withLocalUuids('farm-apples-' + i, () => parts.apples(x, z, APPLE_SCALE, tree.userData.canopy)));
    tree.userData.appleTree = true;
    scene.add(tree);
    addC(x, z, 0.5);
    clawPerches.push(sureClawsTreePerch(x, z, APPLE_SCALE));
  });
  for (const [x, z, scale, kind] of TREES) {
    scene.add(b.tree(x, z, scale, { wind, kind }));
    addC(x, z, 0.7);
    clawPerches.push(sureClawsTreePerch(x, z, scale));
  }
  scene.add(b.willow(WILLOW_AT.x, WILLOW_AT.z, 1.2, { wind }));
  addC(WILLOW_AT.x, WILLOW_AT.z, 0.7);
  for (const [x, z] of [[FARM_HIDES[2].x, FARM_HIDES[2].z], [-12, 24.5], [-41, 3], [41, 20.5], [-9, -20.5], [24, -19.5]]) {
    scene.add(b.bush(x, z, { wind }));
  }
  for (const [x, z] of [[-22.8, 12.6], [-16.8, 0.6], [5, 43.2], [-5, 43.2], [-13, 13.6], [23.4, 19], [31, 10.5], [38.5, -22]]) {
    scene.add(b.flowerPatch(x, z, { wind }));
  }
  for (const [x, z] of [[-40, 36], [41, -38], [-21, -38.5], [23.6, -9.5]]) scene.add(b.rock(x, z));

  // Fence tops for a Sure Claws cat: one on each field fence and the front fence.
  clawPerches.push(
    { x: PASTURE.minX, z: -12, y: parts.FENCE.rail.top, kind: 'fence', requires: SURE_CLAWS_ID },
    { x: -31, z: GOAT_PADDOCK.maxZ, y: parts.FENCE.rail.top, kind: 'fence', requires: SURE_CLAWS_ID },
    { x: -14, z: GATE_AT.z, y: parts.FENCE.picket.top, kind: 'fence', requires: SURE_CLAWS_ID },
  );

  const puddles = [{ x: 3.5, z: 6, r: 0.9 }, { x: -0.6, z: 22, r: 0.8 }];
  for (const p of puddles) scene.add(b.puddle(p.x, p.z, p.r));
  const boxes = [{ x: -9.5, z: 11.5 }, { x: 33, z: 21 }];
  for (const bx of boxes) scene.add(b.cardboardBox(bx.x, bx.z));

  const tractorNest = pt(19.4, -3.7);
  return {
    name: 'Appletree Farm',
    colliders,
    bounds: { ...FARM_BOUNDS },
    spawn: { x: SPAWN.x, z: SPAWN.z },
    boxes,
    waters: [POND],
    waterFx: [pond],
    // Ten, spread over every corner of the farm and all on dry ground: the
    // daily race picks five, and the quests walk to them. Buried treats are
    // scattered up to 4 m either way from a POI (scent.js) and then pushed
    // clear of colliders, which only settles on open ground: so no POI is
    // within 4 m of the tractor shed's inside or the gap between the sheds.
    pois: [
      { x: 0, z: -8.2 },      // the barn doors
      { x: 9, z: -5.5 },      // the yard, in front of the tractor shed
      { x: 30, z: 8 },        // just inside the pasture gate
      { x: 34, z: -24 },      // the far end of the pasture
      { x: -14.2, z: 8 },     // the farmhouse porch
      { x: -11, z: -6.5 },    // the hen run
      { x: -18.5, z: -21 },   // the goat paddock gate
      { x: 7.6, z: -27 },     // the scarecrow
      { x: -19.6, z: 32 },    // the jetty
      { x: 22, z: 31 },       // the middle of the orchard
    ],
    collectibles: [
      { id: 'farm-1', x: -10.5, z: -11, label: 'a speckled feather' },
      { id: 'farm-2', x: 39, z: -28, label: 'a lucky horseshoe' },
      { id: 'farm-3', x: -37, z: -21, label: 'a little brass bell' },
      { id: 'farm-4', x: 16, z: -36, label: 'a blue ribbon from the fair' },
      // On the tractor's cab roof, two hops up.
      { id: 'farm-5', x: TRACTOR_ROOF.x, z: TRACTOR_ROOF.z, y: TRACTOR_ROOF.y, label: 'a shiny key left on the tractor roof' },
    ],
    scenics: [
      { id: 'red-barn', x: -2.5, z: -7.5, label: 'the big red barn' },
      { id: 'duck-pond', x: -20.5, z: 29.6, label: 'the duck pond' },
      { id: 'apple-orchard', x: 20.4, z: 27.5, label: 'the apple orchard' },
    ],
    critterSpawns: [
      // Ducks paddle on a 2 m circle, so each stays in the pond and off the jetty.
      { type: 'duck', x: -31, z: 33 }, { type: 'duck', x: -30, z: 29.5 }, { type: 'duck', x: -29, z: 35.5 },
      // Mice by the grain store and along the barn's east wall.
      { type: 'mouse', x: 12.3, z: 0.8, x2: 12.3, z2: 5.6 },
      { type: 'mouse', x: 7.6, z: -12, x2: 7.6, z2: -18 },
      { type: 'bird', x: 12, z: -24.5 }, { type: 'bird', x: 15.5, z: 26.2 }, { type: 'bird', x: 33, z: -11.5 },
      { type: 'bird', x: -24.5, z: 6.5 },
      { type: 'butterfly', x: -20, z: 18.8 }, { type: 'butterfly', x: 22, z: 34.5 }, { type: 'butterfly', x: -16.8, z: 0.6 },
      { type: 'squirrel', x: 12.2, z: 33.5, x2: 22, z2: 26.5 },
    ],
    moments: [
      { id: 'apple-thief', type: 'squirrel', label: 'a squirrel running off with an apple!', x: 12, z: 27.5, from: { x: 28.5, z: 34.5 } },
      { id: 'grain-dash', type: 'mouse', label: 'a mouse scurrying off with a grain of wheat', x: 4, z: 1, from: { x: 12.6, z: 5.8 } },
    ],
    puddles,
    groundBounce: FARM_GRASS,
    skyDusk: { top: 0x2b3a5c, horizon: 0x8a6a70 },
    tippables: [
      { x: 12.6, z: 16.6, kind: 'can' }, { x: -15.4, z: 10.6, kind: 'pot' },
      { x: -4.6, z: -9.2, kind: 'bin' }, { x: -13.6, z: 17, kind: 'pot' },
      { x: 12.4, z: -1.2, kind: 'can' },
    ],
    // =======================================================================
    // PERCH CHAINS (the rule is src/climbing.js: one hop gains at most 1.6,
    // or 2.2 with Spring Paws, and reaches 2.6 across to a perch above y 1).
    //
    // A — THE HAYLOFT. Four hops up the bales and in at the hay door.
    //   ground -> bale       (4.6,  -9.95, 0.9)   climb 0.9
    //          -> two bales  (3.2,  -9.95, 1.8)   climb 0.9, across 1.4
    //          -> hay door   (1.2, -10.8,  3.0)   climb 1.2, across 2.17
    //          -> hayloft    (0.3, -12.8,  3.0)   level,     across 2.19
    //   Spring Paws takes the two bales straight off the ground; nothing
    //   reaches the hay door without them.
    // B — THE TRACTOR. ground -> bonnet 1.15 -> cab roof 2.3 (across 1.7).
    // C — THE GOATS' STAND. ground -> rock 0.72 -> stand 1.5 (across 1.8);
    //   the stand is also one hop off the grass.
    // =======================================================================
    perches: [
      HAY_BALE_1, HAY_BALE_2, HAY_DOOR, HAYLOFT,
      TRACTOR_BONNET, TRACTOR_ROOF,
      GOAT_ROCK, GOAT_STAND,
      { x: BENCH_AT.x, z: BENCH_AT.z, y: 0.58, kind: 'furniture' },
      { x: ROUND_BALES[0].x, z: ROUND_BALES[0].z, y: BALE.roundR * 2, kind: 'crate', label: 'round hay bale', vantage: true },
      // Sure Claws only: fifteen apple trees, six other trees, three fence tops.
      ...clawPerches,
    ],
    // -----------------------------------------------------------------------
    // ANCHORS for steps 2 and 3 (the animals; the jobs and discoveries). Each
    // is a spot on this map: a point { x, z } (with `y` when it is up on
    // something), or a rectangle. test/farm.test.js checks every one is
    // inside the bounds and can be reached.
    // -----------------------------------------------------------------------
    anchors: {
      gate: pt(GATE_AT.x, GATE_AT.z),
      yard: Object.freeze({ x: 0, z: 3, r: 8 }),
      // the barn
      barnDoor: pt(0, BARN_FRONT + 1.2),
      baleRoute: Object.freeze([HAY_BALE_1, HAY_BALE_2, HAY_DOOR, HAYLOFT].map(({ x, z, y }) => Object.freeze({ x, z, y }))),
      hayloft: Object.freeze({ x: HAYLOFT.x, z: HAYLOFT.z, y: BARN.loft }),
      hayloftNest: Object.freeze({ x: -2.2, z: -14.6, y: BARN.loft }),   // the barn cat and her kittens
      rafters: Object.freeze({ x: 0, z: BARN_AT.z - 0.5, y: BARN.beamY + 0.18 }), // the owl's beam
      // the sheds
      tractor: pt(TRACTOR_AT.x, TRACTOR_AT.z),
      tractorNest,                                                     // the eggs behind the tractor
      grainStoreDoor: pt(shedFront - 0.9, GRAIN_STORE_AT.z),
      grainStoreHole: pt(shedFront, GRAIN_STORE_AT.z + GRAIN_STORE.hole), // the hole in the wall the mice run out by
      grainStoreHoleFront: pt(shedFront - 0.9, GRAIN_STORE_AT.z + GRAIN_STORE.hole),
      milkingShedDoor: pt(shedFront - 0.9, MILKING_SHED_AT.z),          // the yard side
      milkingShedBackDoor: pt(21.5, MILKING_SHED_AT.z),                 // the pasture side
      // the west side
      coop: pt(COOP_AT.x, COOP_AT.z),
      coopDoor: pt(COOP_AT.x + 2.8, COOP_AT.z),                         // the foot of the ramp
      henRun: HEN_RUN,
      farmhouseDoor: pt(FARMHOUSE_AT.x + 3.9, FARMHOUSE_AT.z),
      kennel: pt(KENNEL_AT.x, KENNEL_AT.z),
      kennelFront: pt(KENNEL_AT.x + 1.5, KENNEL_AT.z),
      vegPatch: rect(VEG_BEDS[0].minX, VEG_BEDS[0].maxX, VEG_BEDS[0].minZ, VEG_BEDS[1].maxZ),
      // the goats
      goatPaddock: rect(GOAT_PADDOCK.minX + 0.5, GOAT_PADDOCK.maxX - 0.5, GOAT_PADDOCK.minZ + 0.5, GOAT_PADDOCK.maxZ - 0.5),
      goatGate: pt(GOAT_GATE.x, GOAT_GATE.z),
      goatStand: Object.freeze({ x: GOAT_STAND.x, z: GOAT_STAND.z, y: STAND.top }),
      goatRock: Object.freeze({ x: GOAT_ROCK.x, z: GOAT_ROCK.z, y: GOAT_ROCK.y }),
      goatShelter: FARM_HIDES[0],
      // the cows
      pasture: rect(PASTURE.minX + 1, PASTURE.maxX - 1, PASTURE.minZ + 1, PASTURE.maxZ - 1),
      pastureGate: pt(PASTURE_GATE.x, PASTURE_GATE.z),
      shadeTree: pt(SHADE_TREE_AT.x, SHADE_TREE_AT.z),
      trough: pt(TROUGH_AT.x + 1.2, TROUGH_AT.z),
      // the wheat
      wheatField: WHEAT_FIELD,
      scarecrow: pt(SCARECROW_AT.x, SCARECROW_AT.z),
      scarecrowFront: pt(SCARECROW_AT.x + 0.6, SCARECROW_AT.z + 1.1),
      scarecrowHat: Object.freeze({ x: SCARECROW_AT.x, z: SCARECROW_AT.z, y: SCARECROW.hatY }),
      // the pond and the orchard
      pond: Object.freeze({ x: POND.x, z: POND.z, r: POND.r }),
      jetty: JETTY,
      jettyEnd: pt(JETTY.minX + 0.5, (JETTY.minZ + JETTY.maxZ) / 2),
      orchard: ORCHARD,
      appleTrees: APPLE_TREES,
    },
  };
}

// What the grass asks this area for (render/grass.js grassStyle, createGrass).
export const GRASS_HOOKS = Object.freeze({ tint: farmGroundTint, bare: farmBare });
