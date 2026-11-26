// The Crystal Cave's six discoveries (milestone C3): the line each shows the first time ever, noteCrystalFind, where each is found (findAt, over the plan's
// zones), the six collectibles, and the finds' share of the walk's life. Chunk code: start-up never imports it. Modelled on the Reef's reeffinds.js.
// The first find ever pays AWARDS.cavefind (12) and shows its line; every walk it is found on counts once on its journal page; a later walk says nothing
// and a resumed walk pays and counts nothing twice. She finds by where she stands and how still, on foot.
import { phrase } from '../clanphrases.js';
import { CRYSTAL_PAGES } from '../crystalpages.js';
import { CRYSTAL_FIND_ZONES, CRYSTAL_FIND_IDS, CRYSTAL_COLLECTIBLES, CRYSTAL_FIND_MARKS } from './crystalfindsplan.js';
import { createFindGlow } from './crystalfindparts.js';
import './crystalfindwords.js';

export { CRYSTAL_FIND_IDS };

export const CRYSTAL_FIND_WORDS = Object.freeze({
  rose: () => phrase('crystal.find.rose'),
  echo: () => phrase('crystal.find.echo'),
  pool: () => phrase('crystal.find.pool'),
  gold: () => phrase('crystal.find.gold'),
  garden: () => phrase('crystal.find.garden'),
  heart: () => phrase('crystal.find.heart'),
});
const PAGE_OF = Object.freeze(Object.fromEntries(CRYSTAL_PAGES.map(([page, , id]) => [id, page])));

export const crystalFindKey = (id) => `crystal-find-${id}`;

// noteCrystalFind(id, { log, progression }) -> { fresh, first, points }.
export function noteCrystalFind(id, { log, progression }) {
  const lineOf = CRYSTAL_FIND_WORDS[id];
  const key = crystalFindKey(id);
  if (!lineOf || log.count(key) > 0) return { fresh: false, first: false, points: 0 };
  const page = PAGE_OF[id];
  const seen = progression.state?.journal?.[page];
  const first = !(Number.isFinite(seen) && seen > 0);
  const points = first ? log.awardOnce('cavefind', key, lineOf()) : 0;
  if (!first) log.mark(key);
  progression.recordSighting?.(page);
  return { fresh: true, first, points };
}

// findAt(spot, zones) -> id | null. spot = { x, z, still }. The first find that matches wins, in CRYSTAL_FIND_IDS order. Pure.
export function findAt(spot, zones = CRYSTAL_FIND_ZONES) {
  if (!spot) return null;
  for (const id of CRYSTAL_FIND_IDS) {
    for (const z of zones[id] ?? []) {
      if (Math.hypot(spot.x - z.x, spot.z - z.z) <= z.r && (spot.still ?? 0) >= z.still) return id;
    }
  }
  return null;
}

// The collectibles for the area record: a fresh list, each named in the set in use now (read when the place is built).
export const crystalCollectibles = () => CRYSTAL_COLLECTIBLES.map((k) => ({ id: k.id, x: k.x, z: k.z, label: k.kind === 'pebble' ? phrase('crystal.pebble') : phrase('crystal.bit') }));

const STILL_EPS = 0.12; // she has moved when her paws are this far from where she last stood
const GLOW_SECONDS = 2.2;

// createCrystalFindsLife(ctx) -> { update(dt, t, catPos), dispose() }; ctx is walk.js's life context (scene, reducedMotion, log, progression, audio). No rng.
export function createCrystalFindsLife({ scene, reducedMotion = false, log, progression, audio }) {
  const glow = createFindGlow();
  scene.add(glow);
  const found = new Set(); // found on this walk (the log holds the rest)
  const spot = { x: 0, z: 0, still: 0 };
  const rest = { x: 0, z: 0, set: false };
  let glowLeft = 0;
  return {
    update(dt, t, catPos) {
      const d = dt > 0 ? dt : 0;
      if (catPos) {
        const moved = !rest.set || Math.hypot(catPos.x - rest.x, catPos.z - rest.z) >= STILL_EPS;
        if (moved) { rest.x = catPos.x; rest.z = catPos.z; rest.set = true; spot.still = 0; } else spot.still += d;
        spot.x = catPos.x; spot.z = catPos.z;
        const here = findAt(spot);
        if (here && !found.has(here)) {
          found.add(here);
          if (log && progression) noteCrystalFind(here, { log, progression });
          const mark = CRYSTAL_FIND_MARKS[here];
          if (mark) {
            glow.position.set(mark.x, catPos.y + 0.6, mark.z);
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
