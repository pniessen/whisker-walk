// The Moon's finds so far (milestone 2: the First Flag, the Old Dish and the Star Garden; the other three come with milestone 4): the
// line each shows the first time ever, noteMoonFind, and where each is found (findAt, over the plan's zones). Chunk code: start-up
// never imports it. The first find ever pays AWARDS.moonfind and shows its line; every walk it is found on counts once on its journal
// page; a later walk says nothing (the Rooftops', the Market's and the Lighthouse's rule). Pure apart from the note.
import { phrase } from '../clanphrases.js';
import { MOON_PAGES } from '../moonpages.js';
import { FLAG, OLD_DISH, PLANTERS } from './moonplan.js';

// each read as "You spotted <the line>" (the toast's lead for a find type with no lead of its own), so each is a noun phrase
export const MOON_FIND_WORDS = Object.freeze({
  flag: () => phrase('moon.find.flag'),
  dish: () => phrase('moon.find.dish'),
  garden: () => phrase('moon.find.garden'),
});

export const MOON_FIND_IDS = Object.freeze(['flag', 'dish', 'garden']);
const z = (x, zz, r, still = 0.8) => Object.freeze({ x, z: zz, r, y: 0, dy: 1.5, still });
export const MOON_FIND_ZONES = Object.freeze({
  flag: Object.freeze([z(FLAG.x, FLAG.z, 2.4)]),
  dish: Object.freeze([z(OLD_DISH.x, OLD_DISH.z, 3.0)]),
  garden: Object.freeze(PLANTERS.map((p) => z(p.x, p.z, 1.9))),
});

const pageOf = (id) => MOON_PAGES.find((p) => p[2] === id)?.[0] ?? null;
export const moonFindKey = (id) => `moon-find-${id}`;

// noteMoonFind(id, { log, progression }) -> { fresh, first, points }
export function noteMoonFind(id, { log, progression }) {
  const lineOf = MOON_FIND_WORDS[id];
  const key = moonFindKey(id);
  if (!lineOf || log.count(key) > 0) return { fresh: false, first: false, points: 0 };
  const page = pageOf(id);
  const seen = progression.state?.journal?.[page];
  const first = !(Number.isFinite(seen) && seen > 0);
  const points = first ? log.awardOnce('moonfind', key, lineOf()) : 0;
  if (!first) log.mark(key);
  if (page) progression.recordSighting?.(page);
  return { fresh: true, first, points };
}

// findAt(spot) -> id | null. spot = { x, y, z, still }: her paws and how long she has stood still (s). The first find that matches wins.
function inZone(zn, spot) {
  return Math.hypot(spot.x - zn.x, spot.z - zn.z) <= zn.r && Math.abs(spot.y - zn.y) <= zn.dy && (spot.still ?? 0) >= zn.still;
}
export function findAt(spot, zones = MOON_FIND_ZONES) {
  if (!spot) return null;
  for (const id of MOON_FIND_IDS) for (const zn of zones[id]) if (inZone(zn, spot)) return id;
  return null;
}
