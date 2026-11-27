// The Treehouse village's six discoveries (milestone T3): the line each shows the first time ever, noteTreehouseFind, where each is found (findAt, over the plan's zones), the six
// collectibles, and the finds' share of the walk's life. Stage chunk code (treehousestagebranches.js): start-up never imports it. Modelled on Snowville's snowvillefinds.js, with one
// addition: a ring also has a HEIGHT (a deck is not the ground under it), so standing under the Bakery does not find the Bakery.
// The first find ever pays AWARDS.treefind (12) and shows its line; every walk it is found on counts once on its journal page; a later walk says nothing and a resumed walk pays and
// counts nothing twice. She finds by where she stands, how high and how still. No rng, no clock.
import { phrase } from '../clanphrases.js';
import { createFindGlow } from './treehouseparts.js';
import { TREEHOUSE_FIND_ZONES, TREEHOUSE_FIND_IDS, TREEHOUSE_COLLECTIBLES, TREEHOUSE_FIND_MARKS, HIGH_TOL } from './treehousefindsplan.js';
import './treehousefindwords.js';

export { TREEHOUSE_FIND_IDS };

export const TREEHOUSE_FIND_WORDS = Object.freeze({
  bakery: () => phrase('treehouse.find.bakery'),
  books: () => phrase('treehouse.find.books'),
  bell: () => phrase('treehouse.find.bell'),
  bridge: () => phrase('treehouse.find.bridge'),
  lookout: () => phrase('treehouse.find.lookout'),
  acorn: () => phrase('treehouse.find.acorn'),
});
export const PAGE_OF = Object.freeze({ bakery: 'th1', books: 'th2', bell: 'th3', bridge: 'th4', lookout: 'th5', acorn: 'th6' }); // the journal page of each find (src/treehousepages.js)

export const treehouseFindKey = (id) => `treehouse-find-${id}`;

// noteTreehouseFind(id, { log, progression }) -> { fresh, first, points }.
export function noteTreehouseFind(id, { log, progression }) {
  const lineOf = TREEHOUSE_FIND_WORDS[id];
  const key = treehouseFindKey(id);
  if (!lineOf || log.count(key) > 0) return { fresh: false, first: false, points: 0 };
  const page = PAGE_OF[id];
  const seen = progression.state?.journal?.[page];
  const first = !(Number.isFinite(seen) && seen > 0);
  const points = first ? log.awardOnce('treefind', key, lineOf()) : 0;
  if (!first) log.mark(key);
  progression.recordSighting?.(page);
  return { fresh: true, first, points };
}

// findAt(spot, zones) -> id | null. spot = { x, y, z, still }. The first find that matches wins, in TREEHOUSE_FIND_IDS order. Pure.
export function findAt(spot, zones = TREEHOUSE_FIND_ZONES) {
  if (!spot) return null;
  for (const id of TREEHOUSE_FIND_IDS) {
    for (const z of zones[id] ?? []) {
      if (Math.hypot(spot.x - z.x, spot.z - z.z) <= z.r && Math.abs((spot.y ?? 0) - z.y) <= HIGH_TOL && (spot.still ?? 0) >= z.still) return id;
    }
  }
  return null;
}

// The collectibles for the area record: fresh lists, each named in the set in use now (read when the place is built).
export const treehouseCollectibles = () => TREEHOUSE_COLLECTIBLES.map((k) => ({ id: k.id, x: k.x, z: k.z, label: k.kind === 'leaf' ? phrase('treehouse.leaf') : phrase('treehouse.acorn') }));

const STILL_EPS = 0.12; // she has moved when her paws are this far from where she last stood
const GLOW_SECONDS = 2.2;

// createTreehouseFindsLife(ctx) -> { update(dt, t, catPos), dispose() }; ctx is walk.js's life context (scene, reducedMotion, log, progression, audio).
export function createTreehouseFindsLife({ scene, reducedMotion = false, log, progression, audio }) {
  const glow = createFindGlow();
  scene.add(glow);
  const found = new Set(); // found on this walk (the log holds the rest)
  const spot = { x: 0, y: 0, z: 0, still: 0 };
  const rest = { x: 0, z: 0, set: false };
  let glowLeft = 0;
  return {
    update(dt, t, catPos) {
      const d = dt > 0 ? dt : 0;
      if (catPos) {
        const moved = !rest.set || Math.hypot(catPos.x - rest.x, catPos.z - rest.z) >= STILL_EPS;
        if (moved) { rest.x = catPos.x; rest.z = catPos.z; rest.set = true; spot.still = 0; } else spot.still += d;
        spot.x = catPos.x; spot.z = catPos.z; spot.y = catPos.y ?? 0;
        const here = findAt(spot);
        if (here && !found.has(here)) {
          found.add(here);
          if (log && progression) noteTreehouseFind(here, { log, progression });
          const mark = TREEHOUSE_FIND_MARKS[here];
          if (mark) {
            glow.position.set(mark.x, mark.y + 0.6, mark.z);
            glow.visible = true;
            glowLeft = GLOW_SECONDS;
            audio?.chime?.();
          }
        }
      }
      if (glowLeft > 0) {
        glowLeft -= d;
        const k = Math.max(glowLeft, 0) / GLOW_SECONDS;
        glow.scale.setScalar(reducedMotion ? 1 : 0.6 + (1 - k) * 0.6);
        glow.material.opacity = 0.4 * k;
        if (glowLeft <= 0) glow.visible = false;
      }
      void t;
    },
    dispose() {
      scene.remove(glow);
      glow.geometry.dispose(); glow.material.dispose();
    },
  };
}
