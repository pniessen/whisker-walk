// The Greenhouse's six finds: the line each shows the first time ever, noteGreenhouseFind, and where each is found (findAt, over
// the plan's zones). Chunk code: start-up never imports it. Stage A can make three (palm, koi, catnip); the orchid, cactus and
// butterfly ids are reserved and their zones are empty until the rooms are built (milestone G6).
// The first find ever pays AWARDS.greenhousefind (12) and shows its line; every walk it is found on counts once on its journal page;
// a later walk says nothing and a resumed walk pays and counts nothing twice (the Market's and the Lighthouse's rule).
import { phrase } from '../clanphrases.js';
import { GREENHOUSE_PAGES, GREENHOUSE_FIND_IDS } from '../greenhousepages.js';
import { GREENHOUSE_FIND_ZONES } from './greenhouseplan.js';
import './greenhousewords.js';

export const GREENHOUSE_FIND_WORDS = Object.freeze({
  palm: () => phrase('greenhouse.find.palm'),
  koi: () => phrase('greenhouse.find.koi'),
  catnip: () => phrase('greenhouse.find.catnip'),
  orchid: () => phrase('greenhouse.find.orchid'),
  cactus: () => phrase('greenhouse.find.cactus'),
  butterfly: () => phrase('greenhouse.find.butterfly'),
});
const PAGE_OF = Object.freeze(Object.fromEntries(GREENHOUSE_PAGES.map(([page, , id]) => [id, page])));

export const greenhouseFindKey = (id) => `greenhouse-find-${id}`;

// noteGreenhouseFind(id, { log, progression }) -> { fresh, first, points }.
export function noteGreenhouseFind(id, { log, progression }) {
  const lineOf = GREENHOUSE_FIND_WORDS[id];
  const key = greenhouseFindKey(id);
  if (!lineOf || log.count(key) > 0) return { fresh: false, first: false, points: 0 };
  const page = PAGE_OF[id];
  const seen = progression.state?.journal?.[page];
  const first = !(Number.isFinite(seen) && seen > 0);
  const points = first ? log.awardOnce('greenhousefind', key, lineOf()) : 0;
  if (!first) log.mark(key);
  progression.recordSighting?.(page);
  return { fresh: true, first, points };
}

// findAt(spot, zones) -> id | null. spot = { x, y, z, still, rest }: her paws, how long she has stood still (s) and session.rest (or
// null). The first find that matches wins, in GREENHOUSE_FIND_IDS order. Pure.
function inZone(z, spot) {
  const d = Math.hypot(spot.x - z.x, spot.z - z.z);
  if (d > z.r || (z.rMin && d < z.rMin)) return false;
  if (z.rest) return spot.rest?.kind === z.rest;
  return Math.abs(spot.y - z.y) <= z.dy && (spot.still ?? 0) >= z.still;
}
export function findAt(spot, zones = GREENHOUSE_FIND_ZONES) {
  if (!spot) return null;
  for (const id of GREENHOUSE_FIND_IDS) {
    for (const z of zones[id] ?? []) if (inZone(z, spot)) return id;
  }
  return null;
}
