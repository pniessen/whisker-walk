// Lighthouse Point's six finds: the line each shows the first time ever, noteLighthouseFind, and where each is
// found (findAt, over the plan's zones). Chunk code: start-up never imports it.
// The first find ever pays AWARDS.lighthousefind and shows its line; every walk it is found on counts once on its
// journal page; a later walk says nothing (the Rooftops' and the Market's rule).
import { phrase } from '../clanphrases.js';
import { words } from '../wordset.js';
import { lighthousePageId, LIGHTHOUSE_FIND_IDS } from '../lighthousepages.js';
import { LIGHTHOUSE_FIND_ZONES } from './lighthouseplan.js';

export const LIGHTHOUSE_FIND_WORDS = Object.freeze({
  lamproom: () => phrase('lighthouse.find.lamproom'),
  pool: () => phrase('lighthouse.find.pool'),
  gull: () => phrase('lighthouse.find.gull'),
  echo: () => phrase('lighthouse.find.echo'),
  bell: () => phrase('lighthouse.find.bell'),
  // the one line that takes a word from the set: who is asleep
  window: () => phrase('lighthouse.find.window', words().OUTSIDE_WORDS.people),
});

export const lighthouseFindKey = (id) => `lighthouse-find-${id}`;

// noteLighthouseFind(id, { log, progression }) → { fresh, first, points }.
export function noteLighthouseFind(id, { log, progression }) {
  const lineOf = LIGHTHOUSE_FIND_WORDS[id];
  const key = lighthouseFindKey(id);
  if (!lineOf || log.count(key) > 0) return { fresh: false, first: false, points: 0 };
  const page = lighthousePageId(id);
  const seen = progression.state?.journal?.[page];
  const first = !(Number.isFinite(seen) && seen > 0);
  const points = first ? log.awardOnce('lighthousefind', key, lineOf()) : 0;
  if (!first) log.mark(key);
  progression.recordSighting?.(page);
  return { fresh: true, first, points };
}

// findAt(spot) → id | null. spot = { x, y, z, still, meow, belled }: her paws, how long she has stood still (s), a
// call this frame, the bell's rope going over this frame. The first find that matches wins, in
// LIGHTHOUSE_FIND_IDS order. Pure.
function inZone(z, spot) {
  const d = Math.hypot(spot.x - z.x, spot.z - z.z);
  if (d > z.r || (z.rMin && d < z.rMin) || Math.abs(spot.y - z.y) > z.dy) return false;
  if (z.meow) return !!spot.meow;
  if (z.belled) return !!spot.belled;
  return (spot.still ?? 0) >= z.still;
}

export function findAt(spot, zones = LIGHTHOUSE_FIND_ZONES) {
  if (!spot) return null;
  for (const id of LIGHTHOUSE_FIND_IDS) {
    for (const z of zones[id]) if (inZone(z, spot)) return id;
  }
  return null;
}
