// =============================================================================
// THE FORGE JOB (milestone C3): THE PLAN. Pure data (no THREE, no clock, no random number). Lumi's forge opens once her own story is told (step 7). Three things are found, in any
// order, each carried walk-only in her mouth to the anvil: a glow-cap from the mushroom grotto, a cup of falls water from the plunge pool, and a rose shard from the end of the
// old track (the cart ships in C4: until then the shard lies on plain floor near the track's end, within walking reach, no hop). The third one made at the anvil is the Crystal Circlet.
// North is -z. docs/superpowers/plans/2026-11-27-crystal-moon-wave2.md decisions 1, 5 and 7. Numbers are start values; test/crystalforgejob.test.js floods the floor for each.
// =============================================================================
import { ANVIL } from './crystalgrottoplan.js';

const f = Object.freeze;
export const ITEMS = f([
  f({ id: 0, key: 'cap', x: 25, z: 14.6, reach: 2.2, hue: 0x5fe0c8 }), // a glow-cap, in the grotto's ring (the grotto is about (25, 12))
  f({ id: 1, key: 'water', x: 32.4, z: 28.6, reach: 2.4, hue: 0x62b8ff }), // falls water, on the plunge pool's south shore (out of the boat's reach)
  f({ id: 2, key: 'shard', x: -31.5, z: -9.5, reach: 2.2, hue: 0xff6fa8 }), // a rose shard, beside the old track's end (the track runs along x -33 to z -14)
]);
export const FORGE_REACH = 2.6; // from the anvil: put an ingredient in, or make the circlet
export const ANVIL_AT = f({ x: ANVIL.x, z: ANVIL.z });
export const MAKE_SECS = 3.2; // the circlet's short gentle glow
export const OPEN_STEP = 7;
export const CIRCLET_ID = 'crystalcirclet';
