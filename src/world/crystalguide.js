// =============================================================================
// THE CRYSTAL CAVE'S WRITTEN GUIDE (the Reef's way, world/reefguide.js): THE PURE PART. No THREE, no DOM, no clock, no random number, no save. A child who looks at Lumi's
// picture can still ask "what am I meant to do?": this file says it in words, from the SAME goal the meow's ring and the stones' glints stand on (world/crystallife.js goalNow(),
// which reads the step machine in src/crystalmission.js), so the words, the arrow and the beacon can never disagree. The arrival card stays in world/crystalintro.js.
//
//   goalWords(info)   the goal line: WHAT and WHERE ("Find the rose spark stone: ... north-west of the entrance arch.")
//   chipWords(g, on)  the few words beside Lumi's picture ("Lumi needs a spark stone")
//   atWords(x, z)     a place by the return arch: a compass word from the plan's own coordinates (+x is east, -z is north; the arch is at (0, 24.5))
// The arrow's geometry is shared (world/guidegeo.js). Every line is a literal phrase id (crystal.guide.…); the words are in world/crystalwords.js.
// =============================================================================

import { phrase } from '../clanphrases.js';
export { ARRIVED, SCREEN_EDGE, round5, makeView, viewOf, makeArrow, arrowFor, edgePoint, projectPoint } from './guidegeo.js';
import { round5 } from './guidegeo.js';

export const ARCH = Object.freeze({ x: 0, z: 24.5 });
export const NEAR = 5; // m: within this the carry line says "Give ..."
const POINTS = Object.freeze(['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']);
export function compassKey(dx, dz) {
  const bearing = (Math.atan2(dx, -dz) * 180) / Math.PI; // 0 north, 90 east, 180 south, -90 west
  return POINTS[(((Math.round(bearing / 45) % 8) + 8) % 8)];
}
export const atWords = (x, z) => phrase('crystal.guide.at').replace('{d}', phrase('crystal.guide.dirs').split('|')[POINTS.indexOf(compassKey(x - ARCH.x, z - ARCH.z))]);

// What the goal line says. info: { goal: { g: { kind, stone? }, x, z } (lumi.goalNow()), metres: how far the goal is (deliver, heart), step: the saved step, errand: today's errand waits }.
// '' when there is nothing to say (the story is told and today's errand is done or not offered).
export function goalWords(info) {
  const gp = info?.goal;
  const g = gp?.g;
  if (!g) return '';
  const m = info.metres < NEAR ? 0 : Math.max(5, round5(info.metres));
  switch (g.kind) {
    case 'lumi': return phrase('crystal.guide.hello');
    case 'stone': return g.stone === 1 ? phrase('crystal.guide.stone1') : g.stone === 2 ? phrase('crystal.guide.stone2') : phrase('crystal.guide.stone0').replace('{at}', atWords(gp.x, gp.z));
    case 'deliver': {
      const c = phrase('crystal.guide.names').split('|')[Math.max(0, Math.min(2, g.stone | 0))];
      return (m > 0 ? phrase('crystal.guide.carry').replace('{m}', String(m)) : phrase('crystal.guide.carry.near')).replace('{c}', c);
    }
    case 'heart': return info.step >= 6 ? phrase('crystal.guide.show') : m > 0 ? phrase('crystal.guide.heart').replace('{m}', String(m)) : phrase('crystal.guide.heart.near');
    case 'forge': return g.line; // the forge job's own line (world/crystalforgejoblive.js)
    case 'rest': return info.errand ? phrase('crystal.guide.errand') : '';
    default: return '';
  }
}

// The words beside Lumi's picture, one per kind of goal. `errand`: the story is told and an errand waits.
export function chipWords(g, errand = false) {
  switch (g?.kind) {
    case 'lumi': return phrase('crystal.guide.chip.hello');
    case 'stone': return phrase('crystal.guide.chip.stone');
    case 'deliver': return phrase('crystal.guide.chip.deliver');
    case 'heart': return phrase('crystal.guide.chip.heart');
    case 'forge': return g.chip;
    case 'rest': return errand ? phrase('crystal.guide.chip.errand') : '';
    default: return '';
  }
}
