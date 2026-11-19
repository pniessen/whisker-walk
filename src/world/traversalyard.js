// =============================================================================
// THE TEST YARD (Rooftops step 1). A small, flat-roofed practice yard for the
// traversal moves: two planks, a ridge, a washing line, three gaps (one needing
// Long Leap), climbs and drops in steps. DATA and yardArea() only; it makes no
// THREE objects. x east, z south (north is -z), metres. Levels: yard 0,
// LOW 1.5, HIGH 3.5.
// =============================================================================

import { createGround } from '../ground.js';
import { createTraversal, LONG_LEAP_ID } from '../traversal.js';

export const YARD_BOUNDS = Object.freeze({ minX: -20, maxX: 20, minZ: -20, maxZ: 20 });
export const YARD_SPAWN = Object.freeze({ x: 0, z: 14 });

const LOW = 1.5;
const HIGH = 3.5;

// A flat rectangle, as a strip along x.
const rect = (x0, x1, z0, z1, y) => ({ x0, z0: (z0 + z1) / 2, x1, z1: (z0 + z1) / 2, width: z1 - z0, y0: y });

export const YARD_GROUND = Object.freeze({
  base: 0,
  strips: [
    rect(-16, -8, -4.5, 8, LOW), // shed
    rect(-16, -8, -16, -6, HIGH), // west
    rect(-2, 8, -16, -6, HIGH), // east
    rect(8, 13, -16, -6, 1.0), // house block
    rect(-2, 8, -3.5, 4, HIGH), // east2
    rect(10, 18, -3.5, 4, LOW), // lowE
    rect(10, 18, 7.6, 14, LOW), // lowS
    { x0: -3.5, z0: 0, x1: -8.2, z1: 0, width: 1.6, y0: 0, y1: LOW }, // fire escape
  ],
  discs: [
    { x: -14, z: -3.5, r: 1.0, y: 2.6 }, // tank
    { x: 13.4, z: -11, r: 0.9, y: HIGH }, // chimney
  ],
});

const P = (x, z, y) => ({ x, z, y });
const S = (x, z) => ({ x, z });

export const YARD_TRAVERSAL = Object.freeze({
  crossings: [
    { id: 'plank-1', kind: 'plank', points: [P(-8.4, -13, HIGH), P(-1.6, -13, HIGH)] },
    { id: 'plank-2', kind: 'plank', points: [P(-2.6, 6, 0), P(-8.0, 6, LOW), P(-8.4, 6, LOW)] }, // leaning
    { id: 'line-1', kind: 'line', points: [P(-1.6, -9, HIGH), P(-2.0, -9, HIGH), P(-5, -9, 3.2), P(-8.0, -9, HIGH), P(-8.4, -9, HIGH)] }, // sags
    { id: 'ridge-1', kind: 'ridge', points: [P(7.6, -11, HIGH), P(13.4, -11, HIGH)] },
  ],
  gaps: [
    { id: 'gap-1', from: S(3, -6.4), to: S(3, -3.1) }, // level
    { id: 'gap-2', from: S(7.6, 0), to: S(10.4, 0) }, // down 2 m
    { id: 'gap-3', from: S(14, 3.6), to: S(14, 8.0), requires: LONG_LEAP_ID }, // Long Leap, 4.4 m
  ],
  climbs: [
    { id: 'climb-1', from: S(-12, 8.8), to: S(-12, 7.4) }, // yard to shed
    { id: 'climb-2', from: S(-14, -1.8), to: S(-14, -2.9) }, // shed to tank
    { id: 'climb-3', from: S(-14, -4.1), to: S(-14, -6.4) }, // tank to west
  ],
  drops: [
    { id: 'drop-1', from: S(-12, -6.4), to: S(-12, -4.1) }, // west to shed
    { id: 'drop-2', from: S(17.6, 0), to: S(19.2, 0) }, // lowE to yard
    { id: 'drop-3', from: S(14, 13.6), to: S(14, 15.4) }, // lowS to yard
    { id: 'drop-4', from: S(-8.4, 2), to: S(-6.6, 2) }, // shed to yard
  ],
});

export function yardArea() {
  const ground = createGround(YARD_GROUND);
  return {
    name: 'yard',
    bounds: YARD_BOUNDS,
    spawn: YARD_SPAWN,
    colliders: [],
    waters: [],
    perches: [],
    ground,
    traversal: createTraversal(YARD_TRAVERSAL, ground),
  };
}
