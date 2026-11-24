// The Moon's six finds (milestone 2: the First Flag, the Old Dish and the Star Garden; milestone 4: Echo Crater, Quiet Dust and the Moon
// Cheese): the line each shows the first time ever, noteMoonFind, and where each is found: by standing still in a zone (findAt: the flag,
// the dish, the garden and the cheese), by a meow in the crater's middle (inEcho) or by 20 m of walking across the Quiet Plain
// (createDustTally). Chunk code: start-up
// never imports it. The first find ever pays AWARDS.moonfind and shows its line; every walk it is found on counts once on its journal
// page; a later walk says nothing (the Rooftops', the Market's and the Lighthouse's rule). Pure apart from the note.
import { phrase } from '../clanphrases.js';
import { MOON_PAGES } from '../moonpages.js';
import { FLAG, OLD_DISH, PLANTERS, CHEESE, ECHO, QUIET_PLAIN, PEBBLES, moonY } from './moonplan.js';

// each read as "You spotted <the line>" (the toast's lead for a find type with no lead of its own), so each is a noun phrase
export const MOON_FIND_WORDS = Object.freeze({
  flag: () => phrase('moon.find.flag'),
  dish: () => phrase('moon.find.dish'),
  garden: () => phrase('moon.find.garden'),
  echo: () => phrase('moon.find.echo'),
  dust: () => phrase('moon.find.dust'),
  cheese: () => phrase('moon.find.cheese'),
});

// the journal's order (the spec's table)
export const MOON_FIND_IDS = Object.freeze(['flag', 'echo', 'dust', 'cheese', 'dish', 'garden']);
const z = (x, zz, r, still = 0.8, y = 0) => Object.freeze({ x, z: zz, r, y, dy: 1.5, still });
// The finds found by standing in a place. The cheese is reached, not waited for (still 0), and lies on the Great Bowl's floor.
export const MOON_FIND_ZONES = Object.freeze({
  flag: Object.freeze([z(FLAG.x, FLAG.z, 2.4)]),
  dish: Object.freeze([z(OLD_DISH.x, OLD_DISH.z, 3.0)]),
  garden: Object.freeze(PLANTERS.map((p) => z(p.x, p.z, 1.9))),
  cheese: Object.freeze([z(CHEESE.x, CHEESE.z, CHEESE.r, 0, moonY(CHEESE.x, CHEESE.z))]),
});

// Echo Crater: a meow with her paws in the crater's middle (within ECHO.r of its centre, down on the floor).
const ECHO_FLOOR = moonY(ECHO.x, ECHO.z);
export function inEcho(spot) {
  return !!spot && Math.hypot(spot.x - ECHO.x, spot.z - ECHO.z) <= ECHO.r && Math.abs(spot.y - ECHO_FLOOR) <= 1.5;
}

// Quiet Dust: the metres she has walked on the plain (the plain's rectangle and a margin round it), added up across the walk; a jump of
// more than 3 m between two frames (a teleport, a resume) adds nothing. add(x, z) -> true once she has walked QUIET_PLAIN.walk metres.
export function createDustTally(plain = QUIET_PLAIN, margin = 1.2) {
  let walked = 0;
  let lx = null;
  let lz = null;
  const inside = (x, zz) => x >= plain.x0 - margin && x <= plain.x1 + margin && zz >= plain.z0 - margin && zz <= plain.z1 + margin;
  return {
    get walked() { return walked; },
    add(x, zz) {
      if (lx !== null) {
        const d = Math.hypot(x - lx, zz - lz);
        if (d < 3 && inside(x, zz) && inside(lx, lz)) walked += d;
      }
      lx = x;
      lz = zz;
      return walked >= plain.walk;
    },
  };
}

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
  for (const id of MOON_FIND_IDS) for (const zn of zones[id] ?? []) if (inZone(zn, spot)) return id;
  return null;
}

// The eight glowing pebbles as the walk's collectibles: a fresh list, each named in the set in use now.
export const moonPebbles = () => PEBBLES.map((k) => ({ ...k, label: phrase('moon.pebble') }));
