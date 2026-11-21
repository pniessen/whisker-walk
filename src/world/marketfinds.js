// The Market Square's six finds: the line each shows the first time ever, and
// noteMarketFind. Chunk code: start-up never imports it. (Task 6 adds what
// counts a find.)
// The first find ever pays AWARDS.marketfind and shows its line; every walk it
// is found on counts once on its journal page; a later walk says nothing.
import { phrase } from '../clanphrases.js';
import { words } from '../wordset.js';
import { marketPageId } from '../marketpages.js';

export const MARKET_FIND_WORDS = Object.freeze({
  fountain: () => phrase('market.find.fountain'),
  pigeons: () => phrase('market.find.pigeons'),
  sacks: () => phrase('market.find.sacks'),
  // the one line that takes a word from the set: who plays
  musician: () => phrase('market.find.musician', words().OUTSIDE_WORDS.people),
  basket: () => phrase('market.find.basket'),
  apples: () => phrase('market.find.apples'),
});

export const marketFindKey = (id) => `market-find-${id}`;

// noteMarketFind(id, { log, progression }) → { fresh, first, points }.
export function noteMarketFind(id, { log, progression }) {
  const lineOf = MARKET_FIND_WORDS[id];
  const key = marketFindKey(id);
  if (!lineOf || log.count(key) > 0) return { fresh: false, first: false, points: 0 };
  const page = marketPageId(id);
  const seen = progression.state?.journal?.[page];
  const first = !(Number.isFinite(seen) && seen > 0);
  const points = first ? log.awardOnce('marketfind', key, lineOf()) : 0;
  if (!first) log.mark(key);
  progression.recordSighting(page);
  return { fresh: true, first, points };
}
