// =============================================================================
// THE REEF'S WRITTEN GUIDE (the Moon's way, world/moonguide.js): THE PURE PART. No THREE, no DOM, no clock, no random number, no save. A child who looks at Marlo's picture
// can still ask "what am I meant to do?": this file says it in words, from the SAME goal the meow's ring and the shells' glints stand on (world/reefmarlo.js goalNow(),
// which reads the step machine in src/reefmission.js), so the words, the arrow and the beacon can never disagree.
//
//   goalWords(info)   the goal line: WHAT and WHERE ("Find shell 1 of 3: in the Kelp Garden, north-west of the ladder.")
//   chipWords(g, on)  the few words beside Marlo's picture ("Marlo needs a shell")
//   atWords(x, z)     a place by the ladder: a compass word from the plan's own coordinates (+x is east, -z is north)
//   ARRIVAL           the three ids of the arrival card, said once at the start of a first visit
// The arrow's geometry is shared with the Moon (world/guidegeo.js). Every line is a literal phrase id (reef.guide.…); the words are in world/reefwords.js.
// =============================================================================

import { phrase } from '../clanphrases.js';
import { REEF_SPAWN } from './reefplan.js';
export { ARRIVED, SCREEN_EDGE, round5, makeView, viewOf, makeArrow, arrowFor, edgePoint, projectPoint } from './guidegeo.js';
import { round5 } from './guidegeo.js';

const POINTS = Object.freeze(['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']);
export function compassKey(dx, dz) {
  const bearing = (Math.atan2(dx, -dz) * 180) / Math.PI; // 0 north, 90 east, 180 south, -90 west
  return POINTS[(((Math.round(bearing / 45) % 8) + 8) % 8)];
}
// "north-west of the ladder" for a place on the plan, from where she comes in (the spawn by the ladder).
export const atWords = (x, z) => phrase('reef.guide.at').replace('{d}', phrase('reef.guide.dirs').split('|')[POINTS.indexOf(compassKey(x - REEF_SPAWN.x, z - REEF_SPAWN.z))]);

// The arrival card's three lines, in order (the live part draws them once, at the start of a first visit).
export const arrivalWords = () => [phrase('reef.guide.arrive1'), phrase('reef.guide.arrive2'), phrase('reef.guide.arrive3')];

// What the goal line says. info: { goal: { g: { kind, shell?, lantern? }, x, z } (marlo.goalNow()), metres: how far Marlo is (deliver), errand: today's errand is waiting }.
// '' when there is nothing to say (the story is told and today's errand is done or not offered).
export function goalWords(info) {
  const gp = info?.goal;
  const g = gp?.g;
  if (!g) return '';
  switch (g.kind) {
    case 'marlo': return phrase('reef.guide.hello');
    case 'shell': return g.shell === 0 ? phrase('reef.guide.shell0').replace('{at}', atWords(gp.x, gp.z)) : g.shell === 1 ? phrase('reef.guide.shell1') : phrase('reef.guide.shell2');
    case 'deliver': { const m = round5(info.metres); return m > 0 ? phrase('reef.guide.carry').replace('{m}', String(m)) : phrase('reef.guide.carry.near'); }
    case 'tryon': return phrase('reef.guide.tryon');
    case 'lantern': return phrase('reef.guide.lantern').replace('{n}', String(Math.max(0, Math.min(3, g.lantern | 0))));
    case 'parade': return phrase('reef.guide.parade');
    case 'rest': return info.errand ? phrase('reef.guide.errand') : '';
    default: return '';
  }
}

// The words beside Marlo's picture, one per kind of goal. `errand`: the story is told and an errand waits.
export function chipWords(g, errand = false) {
  switch (g?.kind) {
    case 'marlo': return phrase('reef.guide.chip.marlo');
    case 'shell': return phrase('reef.guide.chip.shell');
    case 'deliver': return phrase('reef.guide.chip.deliver');
    case 'tryon': return phrase('reef.guide.chip.tryon');
    case 'lantern': return phrase('reef.guide.chip.lantern');
    case 'parade': return phrase('reef.guide.chip.parade');
    case 'rest': return errand ? phrase('reef.guide.chip.errand') : '';
    default: return '';
  }
}
