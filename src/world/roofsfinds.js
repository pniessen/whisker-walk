// The Rooftops' six finds: the line each shows the first time ever, what
// counts one, and where each is found (FIND_RULES, findAt). Chunk code:
// start-up never imports it.
// The first find ever pays AWARDS.roofsfind and shows its line; every walk it
// is found on counts once on its journal page; a later walk says nothing.
import { phrase } from '../clanphrases.js';
import { roofsPageId, ROOFS_FIND_IDS } from '../roofspages.js';
import { TELESCOPE_CRATE } from './roofsplan.js';

export const ROOFS_FIND_WORDS = Object.freeze({
  garden: () => phrase('roofs.find.garden'),
  loft: () => phrase('roofs.find.loft'),
  vane: () => phrase('roofs.find.vane'),
  skylight: () => phrase('roofs.find.skylight'),
  telescope: () => phrase('roofs.find.telescope'),
  chimney: () => phrase('roofs.find.chimney'),
});

export const roofsFindKey = (id) => `roofs-find-${id}`;

// noteRoofsFind(id, { log, progression }) → { fresh, first, points }.
export function noteRoofsFind(id, { log, progression }) {
  const words = ROOFS_FIND_WORDS[id];
  const key = roofsFindKey(id);
  if (!words || log.count(key) > 0) return { fresh: false, first: false, points: 0 };
  const page = roofsPageId(id);
  const seen = progression.state?.journal?.[page];
  const first = !(Number.isFinite(seen) && seen > 0);
  const points = first ? log.awardOnce('roofsfind', key, words()) : 0;
  if (!first) log.mark(key);
  progression.recordSighting(page);
  return { fresh: true, first, points };
}

// WHERE EACH IS FOUND (Rooftops step 5, R3). Automatic: no prompt, no button.
// Against each find's anchor (roofsplan.js ROOFS_DISCOVERIES):
//   r      she is within r metres of it, across the roof (x, z);
//   dy     her paws' height (catPos.y) is within dy of the anchor's;
//   still  and she has stood still at least this long (seconds);
//   perch  the telescope: she is perched (session.perched) on the crate, its
//          spot within `near` metres of TELESCOPE_CRATE's, and her paws within
//          dy of the crate's top (the anchor's roof plus the perch's height,
//          where player.js puts a perched cat). Beside it is not enough.
const rule = (o) => Object.freeze(o);
export const FIND_RULES = Object.freeze({
  garden: rule({ r: 2.6, dy: 0.4 }), // on the roof terrace, near the bench
  loft: rule({ r: 3.2, dy: 0.4 }), // on the loft's roof
  vane: rule({ r: 1.1, dy: 0.4 }), // on the tower top
  skylight: rule({ r: 1.0, dy: 0.3 }), // at the attic window
  telescope: rule({ perch: TELESCOPE_CRATE, near: 0.05, dy: 0.4 }), // perched on its crate
  chimney: rule({ r: 1.0, dy: 0.4, still: 1.5 }), // still by the warm stack
});

function matches(rl, a, spot) {
  if (rl.perch) {
    const p = spot.perched;
    if (!p || Math.hypot(p.x - rl.perch.x, p.z - rl.perch.z) > rl.near) return false;
    return Math.abs(spot.y - (a.y + (p.y ?? 0))) <= rl.dy;
  }
  if (Math.abs(spot.y - a.y) > rl.dy) return false;
  if (Math.hypot(spot.x - a.x, spot.z - a.z) > rl.r) return false;
  return !(rl.still > 0) || (spot.still ?? 0) >= rl.still;
}

// findAt(anchors, spot) → id | null. `anchors` is ROOFS_DISCOVERIES (the
// built record's anchors.discoveries); spot = { x, y, z, perched, still }:
// her paws, session.perched (or null) and how long she has been still. The
// first rule that matches wins, in ROOFS_FIND_IDS order. Pure.
export function findAt(anchors, spot) {
  if (!anchors || !spot) return null;
  for (const id of ROOFS_FIND_IDS) {
    const a = anchors[id];
    if (a && matches(FIND_RULES[id], a, spot)) return id;
  }
  return null;
}
