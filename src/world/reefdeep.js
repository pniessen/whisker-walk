// =============================================================================
// THE REEF, WING C: THE DEEP (milestone R8). Pure data and pure functions (no THREE, no clock, no Math.random; the plankton is a seeded stream): the
// Sunken Boat (a hull you walk beside and into through its open stern, and float over), the Old Anchor, the Glow Cave (a small rock cleft lit by plankton:
// it glows, there is no void) and the third chain of air pockets that leads out to them. reefdeepparts.js draws them; reefdeeplife.js drifts the plankton and
// says the few soft lines; the tests read them. North is -z, heights are metres over the seabed. docs/superpowers/plans/2026-11-26-reef.md sections 4.2 and 8 (R8).
// Additive on purpose: the rest of the Reef reads this file through three seams only (the story's pocket list and colliders in reefstory.js, the finds' plan
// in reeffindsplan.js, the draw call in reef.js), so the wing can be cut and nothing else is hidden. Nothing here is dark, lonely or scary: every floor is
// open sand at least 2.2 m wide, the cleft glows, and an air pocket stands at its mouth.
// =============================================================================

import { mulberry32 } from '../rng.js';

const P2 = (x, z) => Object.freeze({ x, z });

// ---- the Sunken Boat ---------------------------------------------------------------------------------------------------------
// A hull 7.5 m long lying nearly level, its bow (-u) sunk to the west-north-west and its broken stern (+u) open toward the south-east, the way she comes.
// u runs along the keel (0 at the middle, the bow at -length/2), v across it. The sides are colliders; the open stern is a door 2.2 m wide or more, and the
// inside is open sand (the hiding place). She floats over it as over anything: the float height never touches a collider.
export const BOAT = Object.freeze({ x: -32.8, z: -31.5, yaw: 1.3, length: 7.5, half: 2.2, rim: 1.15, depth: 1.6, roll: 0.05, mast: 0.9 });
const AXIS = Object.freeze({ x: Math.cos(BOAT.yaw), z: Math.sin(BOAT.yaw) });
const SIDE = Object.freeze({ x: -Math.sin(BOAT.yaw), z: Math.cos(BOAT.yaw) });
// The world point u along the keel and v across it (v positive is the +z side).
export const boatPoint = (u, v) => P2(BOAT.x + u * AXIS.x + v * SIDE.x, BOAT.z + u * AXIS.z + v * SIDE.z);
// Half the hull's width at a station t in [-1, 1] (the bow at -1 comes to a point, the stern at 1 stays blunt and open).
export const hullHalf = (t) => (t < 0 ? BOAT.half * Math.sqrt(Math.max(0, 1 - t * t)) : BOAT.half - 0.4 * t * t);
// The rim's height over the seabed at a station (the bow rises a little, the stern a little).
export const hullRim = (t) => BOAT.rim + (t < 0 ? 0.5 * t * t : 0.15 * t * t);
export const BOAT_STERN = boatPoint(BOAT.length / 2, 0); // the open end, where she walks in
export const BOAT_STATIONS = Object.freeze([-3.6, -3.2, -2.2, -1.2, -0.2, 0.8, 1.8, 2.8]); // along-keel stations of the side colliders
export const HULL_WALL = 0.3; // how far in from the drawn rim a collider's middle stands
export const HULL_R = 0.5;
export const boatColliders = () => {
  const out = [Object.freeze({ ...boatPoint(-BOAT.length / 2 + 0.3, 0), r: HULL_R })];
  for (const u of BOAT_STATIONS) {
    const v = Math.max(0, hullHalf(u / (BOAT.length / 2)) - HULL_WALL);
    for (const s of v < 0.05 ? [1] : [-1, 1]) out.push(Object.freeze({ ...boatPoint(u, s * v), r: HULL_R }));
  }
  return out;
};
// How wide the open stern is between the last pair of side colliders (metres of clear floor).
export const sternClear = () => {
  const u = BOAT_STATIONS[BOAT_STATIONS.length - 1];
  const v = hullHalf(u / (BOAT.length / 2)) - HULL_WALL;
  return 2 * v - 2 * HULL_R;
};

// ---- the Old Anchor ------------------------------------------------------------------------------------------------------------
// Lying on its side, half in the sand, on a low dune; a ring, a shank, a stock and two curved arms. A small collider (a cat walks round it).
export const ANCHOR = Object.freeze({ x: -23.5, z: -29.5, yaw: 0.6, shank: 2.4, r: 0.55 });
export const anchorColliders = () => [Object.freeze({ x: ANCHOR.x, z: ANCHOR.z, r: ANCHOR.r })];

// ---- the Glow Cave ----------------------------------------------------------------------------------------------------------------
// A cleft in the rocks at the far west, open to the east: two walls of rocks 4.6 m apart between their middles (so the floor between the colliders is
// 2.4 m clear), closed at the back. No roof (the chase camera looks in from above), the walls are tall and lean in, and the plankton makes the light.
export const GLOW = Object.freeze({
  floorZ: -37, // the cleft's long axis
  mouthX: -39.2, // where the sand opens out
  backX: -44.1, // the floor's far end
  gap: 2.3, // the walls' middles are this far either side of the axis
});
// The wall rocks: { x, z, r (the collider), h (the drawn height) }; north (-z) and south (+z), three each, and the back.
export const WALLS = Object.freeze([
  ...[-40.2, -42, -43.8].map((x) => Object.freeze({ x, z: GLOW.floorZ - GLOW.gap, r: 1.1, h: 3.2 })),
  ...[-40.2, -42, -43.8].map((x) => Object.freeze({ x, z: GLOW.floorZ + GLOW.gap, r: 1.1, h: 3.0 })),
  Object.freeze({ x: -45.5, z: GLOW.floorZ, r: 1.4, h: 3.4 }),
]);
export const caveColliders = () => WALLS.map((w) => Object.freeze({ x: w.x, z: w.z, r: w.r }));
// The clear floor between the two walls (metres between the nearest collider edges).
export const caveClear = () => 2 * GLOW.gap - 2 * 1.1;

// The glowing beads on the walls' inner faces: { x, z, y, r } (a small glowing stone or a clump of plankton, drawn in the unlit bucket).
export function glowBeads() {
  const rng = mulberry32(0x676c6f77);
  const out = [];
  for (let i = 0; i < 18; i++) {
    const side = i % 2 ? 1 : -1;
    const x = -40.4 - (i >> 1) * 0.58 - rng() * 0.2;
    const z = GLOW.floorZ + side * (GLOW.gap - 1.0 - rng() * 0.12);
    out.push(Object.freeze({ x, z, y: 0.4 + rng() * 2.1, r: 0.09 + rng() * 0.09 }));
  }
  return out;
}

// ---- the third chain of air pockets ----------------------------------------------------------------------------------------------
// Out from the Sandy Flats to the Deep, one every 8 m or so; the last stands at the cave's mouth. (The story's list, reefstory.js, adds these to its own.)
export const DEEP_POCKETS = Object.freeze([P2(-18, -19), P2(-26, -26), P2(-31.6, -24.6), P2(-38.8, -37)]);

// ---- the plankton: small lights that drift, mostly in the cleft, some over the Deep ------------------------------------------------------
// { x, z, y (over the seabed), phase }; the life moves them a little round these (frozen under reduced motion).
export const PLANKTON_COUNT = Object.freeze({ cave: 28, open: 20 });
export function planktonSeeds() {
  const rng = mulberry32(0x706c616e);
  const out = [];
  for (let i = 0; i < PLANKTON_COUNT.cave; i++) {
    out.push(Object.freeze({ x: GLOW.mouthX - 0.4 - rng() * (GLOW.mouthX - GLOW.backX - 1), z: GLOW.floorZ + (rng() - 0.5) * 2 * (GLOW.gap - 0.6), y: 0.4 + rng() * 2.4, phase: rng() * Math.PI * 2 }));
  }
  for (let i = 0; i < PLANKTON_COUNT.open; i++) {
    const a = rng() * Math.PI * 2;
    const r = 3 + Math.sqrt(rng()) * 9;
    out.push(Object.freeze({ x: -32 + Math.cos(a) * r, z: -34 + Math.sin(a) * r, y: 0.6 + rng() * 2.2, phase: rng() * Math.PI * 2 }));
  }
  return out;
}

// ---- where the three finds are and what the life knows about the place ------------------------------------------------------------------
export const DEEP_FIND_ZONES = Object.freeze({
  boat: Object.freeze({ x: BOAT.x, z: BOAT.z, r: 2.4, still: 0, active: true }), // anywhere on or beside the hull's middle, floating or not
  anchor: Object.freeze({ x: ANCHOR.x, z: ANCHOR.z, r: 1.8, still: 1, active: true }),
  cave: Object.freeze({ x: -42, z: GLOW.floorZ, r: 2.2, still: 0, active: true }), // the cleft's floor
});
export const DEEP_SCENICS = Object.freeze([
  Object.freeze({ id: 'reef-boat', x: -29.4, z: -25.2, label: 'the Sunken Boat' }),
  Object.freeze({ id: 'reef-cave', x: -37, z: -33.4, label: 'the Glow Cave' }),
]);

// Where the life says its soft lines: inside the hull, in the cleft, or anywhere in the Deep (the first arrival).
export const insideBoat = (x, z) => {
  const dx = x - BOAT.x;
  const dz = z - BOAT.z;
  const u = dx * AXIS.x + dz * AXIS.z;
  const v = dx * SIDE.x + dz * SIDE.z;
  const t = u / (BOAT.length / 2);
  return t > -0.7 && t < 1.05 && Math.abs(v) < hullHalf(Math.min(1, t)) - 0.4;
};
export const insideCave = (x, z) => x < GLOW.mouthX && x > GLOW.backX && Math.abs(z - GLOW.floorZ) < GLOW.gap - 1.1;
export const inDeep = (x, z) => Math.hypot(x + 36, z + 33.5) < 11; // the Deep's open middle (reefplan.js ZONES 'deep' is 13.5 m wide; the soft arrival line waits until she is well in)

export const deepColliders = () => [...boatColliders(), ...anchorColliders(), ...caveColliders()];
