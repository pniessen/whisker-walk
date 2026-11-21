// The Market Square's six finds: the line each shows the first time ever,
// noteMarketFind, and where each is found (FIND_RULES, findAt). Chunk code:
// start-up never imports it.
// The first find ever pays AWARDS.marketfind and shows its line; every walk it
// is found on counts once on its journal page; a later walk says nothing.
import { phrase } from '../clanphrases.js';
import { words } from '../wordset.js';
import { marketPageId, MARKET_FIND_IDS } from '../marketpages.js';
import { MUSICIAN, BICYCLE_BASKET, MARKET_REGISTRATION, FRUIT_CRATE, fromStall, stallById } from './marketplan.js';

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

// WHERE EACH IS FOUND (V6). Automatic: no prompt, no button. Each by a thing
// she does at its own spot, and each its own way, so one spot never finds two.
// The anchors are the plan's (never market.js's, which imports this file
// through the life): the fountain's drink and the flour sacks' nap (the
// propSet's rests), the musician's pitch, the bicycle basket's perch and the
// apple crate's spot.
const restOf = (id) => {
  const r = MARKET_REGISTRATION.propSet.rests.find((row) => row.id === id);
  return Object.freeze({ x: r.x, z: r.z });
};
export const MARKET_FIND_ANCHORS = Object.freeze({
  fountain: restOf('market-drink-1'),
  sacks: restOf('market-nap-1'),
  musician: Object.freeze({ x: MUSICIAN.x, z: MUSICIAN.z }),
  basket: Object.freeze({ x: BICYCLE_BASKET.x, z: BICYCLE_BASKET.z, y: BICYCLE_BASKET.y }),
  apples: Object.freeze(fromStall(stallById('fruit'), FRUIT_CRATE.lx, FRUIT_CRATE.lz)),
});

// Each find's rule, against its anchor (spot is findAt's):
//   rest   she is resting (session.rest) of this kind, her paws within r m of
//          the anchor, for at least t seconds of it (the sacks' nap);
//   flush  a pigeon took off this frame within `flush` m of her while she ran
//          at `speed` m/s or more (the pigeons: no anchor);
//   listen she has stood still `still` s within r m of the musician, facing
//          them (her heading within acos(face) of the way to them), and is not
//          drinking or napping: the fountain's drink is 2 m from the pitch, and
//          drinking there is the fountain's alone. Her stillness starts again
//          when a rest ends (marketlife.js), so standing on after a drink is
//          not listening either until she has stood 2 s more, facing them;
//   perch  she is perched (session.perched) on the basket's perch, its spot
//          within `near` m of the anchor's; beside it is not enough;
//   tipped the crate went over this frame (her paw or her partner's) while
//          she was within r m of it.
const rule = (o) => Object.freeze(o);
export const FIND_RULES = Object.freeze({
  fountain: rule({ rest: 'drink', r: 0.8, t: 0 }), // drinking at the fountain's rest
  pigeons: rule({ flush: 3, speed: 1.5 }), // running at them as they take off
  sacks: rule({ rest: 'nap', r: 0.8, t: 2 }), // a nap on the warm flour sacks
  musician: rule({ listen: true, r: 3, still: 2, face: Math.cos(Math.PI / 4) }), // still, near, facing them
  basket: rule({ perch: true, near: 0.05 }), // up in the bicycle's basket
  apples: rule({ tipped: true, r: 2.5 }), // by the crate as it goes over
});

const near = (a, b, r) => Math.hypot(a.x - b.x, a.z - b.z) <= r;

function matches(rl, a, spot) {
  if (rl.rest) {
    const rest = spot.rest;
    return !!a && rest?.kind === rl.rest && (rest.t ?? 0) >= rl.t && near(spot, a, rl.r);
  }
  if (rl.flush) {
    const f = spot.pigeonFlush;
    return !!f && (spot.speed ?? 0) >= rl.speed && near(spot, f, rl.flush);
  }
  if (rl.listen) {
    if (!a || spot.rest || (spot.still ?? 0) < rl.still || !Number.isFinite(spot.yaw)) return false;
    const dx = a.x - spot.x;
    const dz = a.z - spot.z;
    const d = Math.hypot(dx, dz);
    if (d > rl.r) return false;
    if (d < 1e-6) return true;
    // she faces (-sin yaw, -cos yaw): player.js turns her by atan2(v.x, v.z) + PI
    return (-Math.sin(spot.yaw) * dx - Math.cos(spot.yaw) * dz) / d >= rl.face;
  }
  if (rl.perch) {
    const p = spot.perched;
    return !!a && !!p && near(p, a, rl.near);
  }
  if (rl.tipped) return !!a && !!spot.crateTipped && near(spot, a, rl.r);
  return false;
}

// findAt(anchors, spot) → id | null. `anchors` is MARKET_FIND_ANCHORS; spot =
// { x, y, z, speed, still, perched, rest, pigeonFlush, crateTipped, yaw }:
// her paws, her speed (m/s), how long she has stood still (s), session.perched
// and session.rest (or null), the spot ({ x, z }) of a pigeon that took off
// this frame (or null), whether the apple crate went over this frame, and her
// heading. The first rule that matches wins, in MARKET_FIND_IDS order. Pure.
export function findAt(anchors, spot) {
  if (!anchors || !spot) return null;
  for (const id of MARKET_FIND_IDS) {
    if (matches(FIND_RULES[id], anchors[id] ?? null, spot)) return id;
  }
  return null;
}
