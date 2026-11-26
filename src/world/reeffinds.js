// The Reef's six discoveries (milestone R3): the line each shows the first time ever, noteReefFind, where each is found (findAt, over the plan's zones),
// the eight collectibles, and the finds' share of the walk's life. Chunk code: start-up never imports it. The Pearl Oyster, the Kelp Garden seahorse and
// the Treasure Chest are live; the Sunken Boat, the Old Anchor and the Glow Cave are `active: false` in the plan until milestone R8 builds them.
// The first find ever pays AWARDS.reeffind (12) and shows its line; every walk it is found on counts once on its journal page; a later walk says nothing
// and a resumed walk pays and counts nothing twice (the Greenhouse's rule). She finds by where she stands and how still, never by how high she floats.
import { phrase } from '../clanphrases.js';
import { REEF_PAGES } from '../reefpages.js';
import { REEF_FIND_ZONES, REEF_FIND_IDS, REEF_COLLECTIBLES, REEF_FIND_MARKS } from './reeffindsplan.js';
import { createFindGlow } from './reeffindparts.js';
import './reeffindwords.js';

export { REEF_FIND_IDS };

export const REEF_FIND_WORDS = Object.freeze({
  boat: () => phrase('reef.find.boat'),
  oyster: () => phrase('reef.find.oyster'),
  seahorse: () => phrase('reef.find.seahorse'),
  cave: () => phrase('reef.find.cave'),
  chest: () => phrase('reef.find.chest'),
  anchor: () => phrase('reef.find.anchor'),
});
const PAGE_OF = Object.freeze(Object.fromEntries(REEF_PAGES.map(([page, , id]) => [id, page])));

export const reefFindKey = (id) => `reef-find-${id}`;

// noteReefFind(id, { log, progression }) -> { fresh, first, points }.
export function noteReefFind(id, { log, progression }) {
  const lineOf = REEF_FIND_WORDS[id];
  const key = reefFindKey(id);
  if (!lineOf || log.count(key) > 0) return { fresh: false, first: false, points: 0 };
  const page = PAGE_OF[id];
  const seen = progression.state?.journal?.[page];
  const first = !(Number.isFinite(seen) && seen > 0);
  const points = first ? log.awardOnce('reeffind', key, lineOf()) : 0;
  if (!first) log.mark(key);
  progression.recordSighting?.(page);
  return { fresh: true, first, points };
}

// findAt(spot, zones, { all }) -> id | null. spot = { x, z, still }: her paws on the seabed and how long she has stood still (s). The first find that
// matches wins, in REEF_FIND_IDS order; a zone with `active: false` is skipped unless `all` (the tests). Pure.
export function findAt(spot, zones = REEF_FIND_ZONES, { all = false } = {}) {
  if (!spot) return null;
  for (const id of REEF_FIND_IDS) {
    for (const z of zones[id] ?? []) {
      if (!all && z.active === false) continue;
      if (Math.hypot(spot.x - z.x, spot.z - z.z) <= z.r && (spot.still ?? 0) >= z.still) return id;
    }
  }
  return null;
}

// The eight collectibles for the area record: a fresh list, each named in the set in use now (read when the place is built).
export const reefCollectibles = () => REEF_COLLECTIBLES.map((k) => ({ id: k.id, x: k.x, z: k.z, label: k.kind === 'glass' ? phrase('reef.glass') : phrase('reef.shell') }));

const STILL_EPS = 0.12; // she has moved when her paws are this far from where she last stood
const GLOW_SECONDS = 2.2;

// createReefFindsLife(ctx) -> { update(dt, t, catPos, camera, session), dispose() }; ctx is walk.js's life context (this file uses scene, reducedMotion, log,
// progression, audio). Draws on no rng.
export function createReefFindsLife({ scene, reducedMotion = false, log, progression, audio }) {
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
          if (log && progression) noteReefFind(here, { log, progression });
          const mark = REEF_FIND_MARKS[here];
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
