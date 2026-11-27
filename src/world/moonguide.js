// =============================================================================
// THE MOON'S WRITTEN GUIDE (guide cues): THE PURE PART. No THREE, no DOM, no clock, no random number, no save. A child who looks at Pip's picture
// and the gold ring can still ask "what am I meant to do?": this file says it in words, and says where, from the same goal the ring and the light
// column stand on (world/moonbaselive.js goalPoint(), read through base.goal()), so the words, the arrow and the beacon can never disagree.
//
//   goalWords(info)      the goal line: WHAT and WHERE, one or two short sentences ("Find a power cell (0 of 2): on the tall rocks, about 25 m ahead.")
//   chipWords(goal, job) the few words beside Pip's picture ("Pip needs a power cell")
//   nowWords(x, z, cat, fx, fz)   a place from where she stands now ("about 25 m to your left")
//   round5(m)            the arrow's metres, to the nearest 5
//   viewOf / arrowFor / edgePoint / projectPoint   the edge arrow's geometry from a camera's own position, turn and field of view
// Every line is a literal phrase('...') so the phrase table's scan reads it; the Clan set's light flavour is in world/moonwords.js (two lines).
// The look of it all (the DOM) is world/moonguidelive.js.
// =============================================================================

import { phrase } from '../clanphrases.js';
import * as P from './moonplan.js';
import * as M from './moonmission.js';
import { nowWords } from '../reefpages.js';
export { nowWords };
export { ARRIVED, SCREEN_EDGE, round5, makeView, viewOf, makeArrow, arrowFor, edgePoint, projectPoint } from './guidegeo.js'; // the arrow's geometry is shared with the Reef's guide

export const LANDER_AT = Object.freeze({ x: P.LANDER.x, z: P.LANDER.z });

// ---- where: from where she stands now ---------------------------------------------------------------------------------------------------------
// "about 25 m to your left" (nowWords, start-up file reefpages.js); info carries cat { x, z } and fx, fz (which way she faces). Without them (a test, a first frame): from the lander, facing north.
const placeWords = (i, g) => nowWords(g.x, g.z, i.cat ?? LANDER_AT, i.fx ?? 0, i.fz ?? -1);
const fill = (text, n, at) => text.replace('{n}', String(n)).replace('{at}', at);

const onHill = (g) => g.x === P.STAR_HILL.x && g.z === P.STAR_HILL.z; // the goal is the telescope itself (she is on the ramp or the top)
const inCave = (g) => g.x === P.DEEP_CELL.x && g.z === P.DEEP_CELL.z; // the goal is the cell itself (she is at the mouth or in the tunnel)
const bits = (n) => (n & 1) + ((n >> 1) & 1);

// What the goal line says. `info`: { goal: { g: { kind, cell? }, x, z } (base.goal()), record: { step, cells } (moonmission.normalize), scope (bits), job: { kind, taken, next, glove, stage }, riding }.
// '' when there is nothing to say (the story is told, the Deep Cell is in and today's errand is done or not offered).
export function goalWords(info) {
  const gp = info?.goal;
  if (!gp || !gp.g) return '';
  const g = gp.g;
  const rec = info.record ?? { step: 0, cells: 0 };
  const at = placeWords(info, gp);
  const scopeTail = () => {
    const have = (info.scope ?? 0) & M.STORY_SCOPE;
    return (have === 1 ? phrase('moon.guide.t.cat') : have === 2 ? phrase('moon.guide.t.mouse') : phrase('moon.guide.t.both'));
  };
  switch (g.kind) {
    case 'pip': return phrase('moon.guide.pip');
    case 'cell': return fill((g.cell === 0 ? phrase('moon.guide.cell0') : phrase('moon.guide.cell1')), bits(rec.cells & M.CELL_BITS), at);
    case 'core': return fill((g.cell === M.DEEP ? phrase('moon.guide.deep') : phrase('moon.guide.core')), 0, at);
    case 'scope': return onHill(gp) ? `${phrase('moon.guide.top')} ${scopeTail()}` : `${fill(phrase('moon.guide.hill'), 0, at)} ${scopeTail()}`;
    case 'desk': return fill(phrase('moon.guide.desk'), 0, at);
    case 'rocket': return fill(phrase('moon.guide.rocket'), 0, at);
    case 'button': return fill(phrase('moon.guide.button'), 0, at);
    case 'reply': return fill(phrase('moon.guide.reply'), 0, at);
    case 'cave': return inCave(gp) ? phrase('moon.guide.tunnel') : fill(phrase('moon.guide.cave'), 0, at);
    case 'job': return jobWords(info, gp, at);
    case 'done': return rec.step >= M.STEP.replied ? phrase('moon.guide.done') : fill(phrase('moon.guide.both'), 0, at);
    default: return '';
  }
}

function jobWords(info, gp, at) {
  const j = info.job ?? {};
  switch (j.kind) {
    case 'pebbles': return j.taken >= 3 ? fill(phrase('moon.guide.tray'), 0, at) : fill(phrase('moon.guide.pebbles'), Math.max(0, j.taken | 0), at);
    case 'rounds': return !info.riding && !j.next ? fill(phrase('moon.guide.dot'), 0, at) : fill(phrase('moon.guide.rounds'), Math.min(5, Math.max(0, j.next | 0)), at);
    case 'guest': return onHill(gp) ? `${phrase('moon.guide.top')} ${phrase('moon.guide.t.guest')}` : `${fill(phrase('moon.guide.hill'), 0, at)} ${phrase('moon.guide.t.guest')}`;
    case 'bound': return fill(phrase('moon.guide.bound'), 0, at);
    case 'rocket': return fill((j.stage === 1 ? phrase('moon.guide.card2') : j.stage === 2 ? phrase('moon.guide.button') : phrase('moon.guide.card1')), 0, at);
    case 'glove': return j.glove === 'carried' ? phrase('moon.guide.glove2') : fill(phrase('moon.guide.glove'), 0, at);
    default: return '';
  }
}

// The few words beside Pip's picture, from the goal he is showing (base.bubble.g) and today's errand kind: an index into the five short lists of moonwords.js (moon.chip.a to e, said in this order).
const CHIPS = Object.freeze({ pip: [0, 0], cell: [0, 1], core: [0, 2], done: [4, 3], scope: [1, 0], desk: [1, 1], rocket: [1, 2], button: [2, 0], reply: [2, 1], cave: [2, 2] });
const JOB_CHIPS = Object.freeze({ pebbles: [3, 0], rounds: [3, 1], guest: [3, 2], bound: [4, 0], rocket: [4, 1], glove: [4, 2] });
const list = (i) => (i === 0 ? phrase('moon.chip.a') : i === 1 ? phrase('moon.chip.b') : i === 2 ? phrase('moon.chip.c') : i === 3 ? phrase('moon.chip.d') : phrase('moon.chip.e'));
export function chipWords(g, jobKind) {
  if (!g) return '';
  const at = g.kind === 'job' ? JOB_CHIPS[jobKind] : CHIPS[g.kind];
  return at ? list(at[0]).split('|')[at[1]] : '';
}

