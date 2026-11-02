import { createGround } from '../ground.js';

// =============================================================================
// The Gorge's shape, as data. Pure: no THREE, nothing drawn here.
//
// The Gorge is a deep rock gorge with a shaded floor and a stream. A path is
// cut into its east wall in three legs (A, B, C) that climb, hairpin by
// hairpin, from the floor past the Lookout Ledge and the Wide Ledge to a
// bright clifftop. Caves and dens go into the rock on the way.
//
// THE FRAME (G1). The Gorge sits directly east of the Moor in the same z
// frame: a Moor point (x, z) is the Gorge point (x - 100, z). Metres, x east,
// z south, so north is -z. The Narrows (x < -18, z -16..-6) is the way in
// from the Moor; the floor (x -18..2) runs off the map north and south.
//
// One record feeds both the ground (createGround) and the rock that is drawn,
// so a rim the cat stops at and the rock she sees can never disagree.
//
// WHY MASSES ARE CUT (G2). Every opening (path legs, ledges, caves, dens) is
// an axis-aligned rectangle, and each rock mass is cut round them by
// rectangle subtraction into the pieces left over. Those pieces are ordinary
// flat strips, so the ground engine needs no "carve" shape, and nothing
// walkable ever lies under rock except inside a cave or den, under its ceiling.
//
// WHY THERE ARE LIPS (G3). Every walkable edge with a drop of 1.5 m or more
// has a lip: a strip 0.4 m wide, 0.35 m above the walkable ground beside it.
// That is more than a step (STEP_MAX plus a sub-step's grade, 0.245), so it is
// a wall both ways. The cat stops at a low rock band she can see and never
// hangs over a drop, and the legs only meet at their hairpins.
//
// KEPT FOR THE CAMP. The Wide Ledge's southern part (WIDE_LEDGE_RECT) and the
// den in the rock behind it (CAMP_DEN_RESERVE, still solid rock) are tagged
// `reserved: 'part 4'`: nothing is placed there until the camp is built. The
// B -> C turn at the ledge's north end stays open to all.
// =============================================================================

// Heights (G6).
export const FLOOR = 0;
export const LOOKOUT = 4;
export const WIDE_LEDGE = 8;
export const CLIFFTOP = 12;
export const WEST_TOP = 9; // the gorge's west wall, under the clifftop so the view goes over it
export const SHOULDER = 14; // the crag between the Lookout and the clifftop
export const RIM = 20; // every mass at the map's edges
export const LIP_H = 0.35;
export const LIP_W = 0.4;

// Headroom over a cave's or den's floor.
export const CORRIDOR_HEADROOM = 2.6;
export const CHAMBER_HEADROOM = 3.0;
export const DEN_HEADROOM = 1.8;

// The ground's ceilings sit this far inside each cave or den rectangle, so
// none touches the rock rim round it (validateGround measures a ceiling's
// clearance right on its edges). The drawn caps use the full rectangles.
const CEIL_INSET = 0.001;

// A flat rectangle at height y.
export function rect(minX, maxX, minZ, maxZ, y, tag, kind = 'walk') {
  return Object.freeze({ minX, maxX, minZ, maxZ, y0: y, y1: y, along: null, tag, kind });
}

// A ramp along z: yA at zA, yB at zB. y0 is the height at minZ, y1 at maxZ.
export function rampZ(minX, maxX, zA, yA, zB, yB, tag, kind = 'walk') {
  const lowFirst = zA <= zB;
  return Object.freeze({
    minX, maxX,
    minZ: lowFirst ? zA : zB,
    maxZ: lowFirst ? zB : zA,
    y0: lowFirst ? yA : yB,
    y1: lowFirst ? yB : yA,
    along: 'z', tag, kind,
  });
}

// A part-1 strip: a centreline along z for a ramp, along x for a flat rect,
// with the width of the cross span.
export function toStrip(s) {
  if (s.along === 'z') {
    const x = (s.minX + s.maxX) / 2;
    return { x0: x, z0: s.minZ, x1: x, z1: s.maxZ, width: s.maxX - s.minX, y0: s.y0, y1: s.y1 };
  }
  const z = (s.minZ + s.maxZ) / 2;
  return { x0: s.minX, z0: z, x1: s.maxX, z1: z, width: s.maxZ - s.minZ, y0: s.y0, y1: s.y1 };
}

// The rectangles left of r once every hole is cut out. Each piece keeps r's
// other fields. Holes that only touch r cut nothing.
export function subtractRects(r, holes) {
  let pieces = [r];
  for (const h of holes) {
    const next = [];
    for (const p of pieces) {
      const x0 = Math.max(p.minX, h.minX);
      const x1 = Math.min(p.maxX, h.maxX);
      const z0 = Math.max(p.minZ, h.minZ);
      const z1 = Math.min(p.maxZ, h.maxZ);
      if (x1 <= x0 || z1 <= z0) {
        next.push(p);
        continue;
      }
      const part = (minX, maxX, minZ, maxZ) => {
        if (maxX > minX && maxZ > minZ) next.push(Object.freeze({ ...p, minX, maxX, minZ, maxZ }));
      };
      part(p.minX, x0, p.minZ, p.maxZ); // west of the hole
      part(x1, p.maxX, p.minZ, p.maxZ); // east
      part(x0, x1, p.minZ, z0); // north
      part(x0, x1, z1, p.maxZ); // south
    }
    pieces = next;
  }
  return pieces;
}

// Leg C's height: 8 at z 32, rising to 12 at z -18.
const C_SOUTH = 32;
const C_NORTH = -18;
export function cY(z) {
  return WIDE_LEDGE + ((C_SOUTH - z) / (C_SOUTH - C_NORTH)) * (CLIFFTOP - WIDE_LEDGE);
}
export const SNUG_Y = cY(20.2); // 8.944: the Snug Cave stop meets leg C within a step

// ---- The walkable shapes, and their lips ----
const LEG_A = rampZ(2.4, 5.4, 34, FLOOR, -2, LOOKOUT, 'legA');
const LOOKOUT_LEDGE = rect(2.4, 8.8, -8, -2, LOOKOUT, 'lookout');
const LEG_B = rampZ(5.8, 8.8, -2, LOOKOUT, 32, WIDE_LEDGE, 'legB');
const TURN = rect(5.8, 20, 32, 35.5, WIDE_LEDGE, 'turn'); // the B -> C turn, open to all
export const WIDE_LEDGE_RECT = Object.freeze({ ...rect(5.8, 20, 35.5, 48, WIDE_LEDGE, 'wideLedge'), reserved: 'part 4' });
const LEG_C = rampZ(9.2, 12.2, C_SOUTH, WIDE_LEDGE, C_NORTH, CLIFFTOP, 'legC');
const CLIFF = rect(2.4, 34, -40, -18, CLIFFTOP, 'clifftop');
const SNUG_STOP = rect(12.2, 15, 18.7, 21.7, SNUG_Y, 'snugStop');

export const WALK_SHAPES = Object.freeze([
  LEG_A, LOOKOUT_LEDGE, LEG_B, TURN, WIDE_LEDGE_RECT, LEG_C, CLIFF, SNUG_STOP,
  rampZ(2.0, 2.4, 34, FLOOR + LIP_H, -2, LOOKOUT + LIP_H, 'lipA', 'lip'),
  rect(2.0, 2.4, -8, -2, LOOKOUT + LIP_H, 'lipLookout', 'lip'),
  rampZ(5.4, 5.8, -2, LOOKOUT + LIP_H, 32, WIDE_LEDGE + LIP_H, 'lipB', 'lip'),
  rect(5.4, 5.8, 32, 48, WIDE_LEDGE + LIP_H, 'lipWide', 'lip'),
  rampZ(8.8, 9.2, C_SOUTH, WIDE_LEDGE + LIP_H, C_NORTH, CLIFFTOP + LIP_H, 'lipC', 'lip'),
  rect(2.0, 2.4, -40, -18, CLIFFTOP + LIP_H, 'lipTop', 'lip'),
]);

// ---- Caves (walked in part 3) and dens. Each cave's rects run mouth to
// chamber: corridor, bend, chamber. ----
const caveRects = (id, y, corridor, bend, chamber) => Object.freeze([
  rect(...corridor, y, `${id}-corridor`, 'cave'),
  rect(...bend, y, `${id}-bend`, 'cave'),
  rect(...chamber, y, `${id}-chamber`, 'cave'),
]);

export const GORGE_CAVES = Object.freeze([
  Object.freeze({
    id: 'echo', name: 'the Echo Cave', mouth: Object.freeze({ x: -18, z: 23.5 }),
    path: Object.freeze([[-18, 23.5], [-27.5, 23.5], [-27.5, 30], [-28.5, 32.5]].map(Object.freeze)),
    rects: caveRects('echo', FLOOR, [-26, -18, 22, 25], [-29, -26, 22, 30], [-32, -25, 30, 35]),
    y: FLOOR,
  }),
  Object.freeze({
    id: 'snug', name: 'the Snug Cave', mouth: Object.freeze({ x: 15, z: 20.2 }),
    path: Object.freeze([[15, 20.2], [22.5, 20.2], [22.5, 12], [22.5, 9.5]].map(Object.freeze)),
    rects: caveRects('snug', SNUG_Y, [15, 24, 18.7, 21.7], [21, 24, 12, 21.7], [19, 26, 7, 12]),
    y: SNUG_Y,
  }),
  Object.freeze({
    id: 'glitter', name: 'the Glitter Cave', mouth: Object.freeze({ x: 34, z: -24.5 }),
    path: Object.freeze([[34, -24.5], [41.5, -24.5], [41.5, -37], [41.5, -39.5]].map(Object.freeze)),
    rects: caveRects('glitter', CLIFFTOP, [34, 43, -26, -23], [40, 43, -37, -23], [38, 45, -42, -37]),
    y: CLIFFTOP,
  }),
]);

const den = (tag, minX, maxX, minZ, maxZ, y, mouth) =>
  Object.freeze({ ...rect(minX, maxX, minZ, maxZ, y, tag, 'den'), id: tag, mouth: Object.freeze(mouth) });

// Shallow dens, each with the centre of its open edge as `mouth`.
export const GORGE_DENS = Object.freeze([
  den('denW1', -20.6, -18, 6, 8.6, FLOOR, { x: -18, z: 7.3 }),
  den('denW2', -20.6, -18, -34, -31.4, FLOOR, { x: -18, z: -32.7 }),
  den('denE', 2, 4.6, -46, -43.4, FLOOR, { x: 2, z: -44.7 }),
  den('denLookout', 4, 6.6, -10.6, -8, LOOKOUT, { x: 5.3, z: -8 }),
  den('denTop', 10, 12.6, -42.6, -40, CLIFFTOP, { x: 11.3, z: -40 }),
]);

// The den behind the Wide Ledge, still rock until the camp opens it.
export const CAMP_DEN_RESERVE = Object.freeze({ ...rect(20, 26, 37, 43, RIM, 'campDenReserve', 'rock'), reserved: 'part 4' });

// ---- Rock masses, cut round every opening ----
const MASSES_UNCUT = [
  rect(-62, -40, -62, -16, RIM, 'westRimN', 'rock'),
  rect(-62, -40, -6, 62, RIM, 'westRimS', 'rock'),
  rect(-40, -18, -62, -16, WEST_TOP, 'westTopN', 'rock'),
  rect(-40, -18, -6, 62, WEST_TOP, 'westTopS', 'rock'),
  rect(2, 62, -62, -40, RIM, 'northRim', 'rock'),
  rect(34, 62, -40, -18, RIM, 'eastRimTop', 'rock'),
  rect(2, 8.8, -18, -8, SHOULDER, 'shoulder', 'rock'),
  rect(12.2, 62, -18, 32, RIM, 'eastMass', 'rock'),
  rect(20, 62, 32, 48, RIM, 'eastMassS', 'rock'),
  rect(5.4, 62, 48, 62, RIM, 'southRim', 'rock'),
];

const CAVE_RECTS = GORGE_CAVES.flatMap((c) => c.rects);
const OPENINGS = [...WALK_SHAPES, ...CAVE_RECTS, ...GORGE_DENS, CAMP_DEN_RESERVE];

export const MASSES = Object.freeze([
  ...MASSES_UNCUT.flatMap((m) => subtractRects(m, OPENINGS)),
  CAMP_DEN_RESERVE,
]);

// ---- Ceilings: one cap over every cave and den rectangle, full size ----
export const CEILINGS = Object.freeze([
  ...GORGE_CAVES.flatMap((c) => c.rects.map((r) => {
    const headroom = r.tag.endsWith('-chamber') ? CHAMBER_HEADROOM : CORRIDOR_HEADROOM;
    return Object.freeze({ ...r, y0: r.y0 + headroom, y1: r.y0 + headroom });
  })),
  ...GORGE_DENS.map((d) => Object.freeze({ ...d, y0: d.y0 + DEN_HEADROOM, y1: d.y0 + DEN_HEADROOM })),
]);

// The ground's ceilings: each cap inset by CEIL_INSET, plus a thin bridge
// over every seam where two rects of one cave meet edge to edge, so the
// inset leaves no gap inside a cave.
function groundCeilings() {
  const out = [];
  const inset = (r) => ({ ...r, minX: r.minX + CEIL_INSET, maxX: r.maxX - CEIL_INSET, minZ: r.minZ + CEIL_INSET, maxZ: r.maxZ - CEIL_INSET });
  const asCeiling = (r) => {
    const s = toStrip(r);
    return { x0: s.x0, z0: s.z0, x1: s.x1, z1: s.z1, width: s.width, y: r.y0 };
  };
  for (const c of CEILINGS) out.push(asCeiling(inset(c)));
  const caveCeilings = CEILINGS.filter((c) => c.kind === 'cave');
  for (let i = 0; i < caveCeilings.length; i++) {
    for (let j = i + 1; j < caveCeilings.length; j++) {
      const a = caveCeilings[i];
      const b = caveCeilings[j];
      if (a.tag.split('-')[0] !== b.tag.split('-')[0]) continue;
      const x0 = Math.max(a.minX, b.minX);
      const x1 = Math.min(a.maxX, b.maxX);
      const z0 = Math.max(a.minZ, b.minZ);
      const z1 = Math.min(a.maxZ, b.maxZ);
      if (x1 < x0 || z1 < z0 || (x1 === x0 && z1 === z0)) continue; // apart, or touching at a corner
      if (x1 > x0 && z1 > z0) continue; // they overlap: the insets already cover the join
      const seamAlongZ = x1 === x0;
      out.push(asCeiling({
        minX: seamAlongZ ? x0 - CEIL_INSET : x0 + CEIL_INSET,
        maxX: seamAlongZ ? x1 + CEIL_INSET : x1 - CEIL_INSET,
        minZ: seamAlongZ ? z0 + CEIL_INSET : z0 - CEIL_INSET,
        maxZ: seamAlongZ ? z1 - CEIL_INSET : z1 + CEIL_INSET,
        y0: Math.min(a.y0, b.y0),
        along: null,
      }));
    }
  }
  return out.map(Object.freeze);
}

// Where strays and ghosts may stand (G7): open ground only, under no roof.
// No cave or den is here (ruling F35): the Snug Cave's corridor isn't, so a
// stray let into its bend and chamber was held there all walk. Part 3 gives
// only the cave's homed cat a rectangle of its own.
export const STAND_ON = Object.freeze([
  { minX: -18, maxX: 2, minZ: -50, maxZ: 50 }, // the floor
  { minX: 2, maxX: 5.4, minZ: 34, maxZ: 50 }, // the approach
  { minX: -50, maxX: -18, minZ: -16, maxZ: -6 }, // the Narrows
  { minX: 2.4, maxX: 34, minZ: -40, maxZ: -18 }, // the clifftop
].map(Object.freeze));

export const GORGE_GROUND_SPEC = Object.freeze({
  base: FLOOR,
  strips: Object.freeze([...WALK_SHAPES, ...CAVE_RECTS, ...GORGE_DENS, ...MASSES].map((s) => Object.freeze(toStrip(s)))),
  discs: Object.freeze([]),
  ceilings: Object.freeze(groundCeilings()),
});

export function gorgeGround() {
  return createGround(GORGE_GROUND_SPEC);
}

// For the corner map: the rock (masses, lips, and the roofed caves and dens)
// and the raised ledges, as plain rectangles.
export function mapShapes() {
  const box = (s, tone) => ({ minX: s.minX, maxX: s.maxX, minZ: s.minZ, maxZ: s.maxZ, tone });
  return [
    ...MASSES.map((s) => box(s, 'rock')),
    ...CAVE_RECTS.map((s) => box(s, 'rock')),
    ...GORGE_DENS.map((s) => box(s, 'rock')),
    ...WALK_SHAPES.map((s) => box(s, s.kind === 'lip' ? 'rock' : 'ledge')),
  ];
}
