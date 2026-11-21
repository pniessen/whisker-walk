// The Rooftops' six finds: the line each shows the first time ever, and what
// counts one (Task 4 adds the triggers). Chunk code: start-up never imports it.
// The first find ever pays AWARDS.roofsfind and shows its line; every walk it
// is found on counts once on its journal page; a later walk says nothing.
import { phrase } from '../clanphrases.js';
import { roofsPageId } from '../roofspages.js';

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
