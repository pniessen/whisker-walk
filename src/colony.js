// The shared colony's rules: which strays you have fed, how tame each is, and
// who gets to feed next. Pure — no THREE, no DOM, no network. It imports only
// the name list, the base greet ladder and the FNV hash, so the same functions
// run on both devices and in tests.
//
// The model, in one paragraph. A colony is a list of CATS (each fixed in one
// spot, found by whoever fed it first) and a list of FEEDS (one per player per
// cat per walk). Taming is ONE bar per cat: `TAME_FEEDS` fills it, and greets
// from before this walk give a head start on that same bar (see headStartFor).
// There is deliberately no second track for "already knew this cat".
//
// Why `tamedBy`/`tamedWalk` are STORED rather than derived from the feed count:
// taming must never regress (spec §9.2). Derived, a cat could un-tame when a
// sibling pairs up later (the shy rule below starts to apply) or when a merge
// momentarily lacks a feed. Stored, whichever client fills the bar writes the
// verdict once and nothing ever clears it.
//
// Why feedCat is PURE (returns a new colony, never mutates): the caller can
// keep the old colony to diff against, a refused feed is guaranteed to leave
// everything untouched, and the sync merge in later tasks can run it on copies.
import { isStrayName } from './straynames.js';
import { friendRungs } from './skills.js';
import { seedFromCode } from './rng.js';

export const TAME_FEEDS = 6;        // feeds that fill the bar from nothing
export const HEAD_START_MAX = 3;    // most a past friendship can pre-fill
export const COLONY_MAX = 12;       // cats in total, in progress plus tamed (= DEN_SPOTS.length)
export const FEEDS_MAX = 160;       // cap for a stored/synced feed list (used by the sanitizers)
export const COLONY_AREAS = ['neighborhood', 'park', 'seaside', 'docks'];

const PLAYER_ID = /^[A-Za-z0-9-]{8,64}$/;
const WALK_STAMP = /^walk-\d{1,16}$/;

export function emptyColony() {
  return {
    id: null,
    partner: null,
    cats: [],
    feeds: [],
    trades: [],
    tradesApplied: [],
    rewarded: [],
    seen: { feedKeys: [], tamed: [], trades: [], day: null },
  };
}

// Greets from BEFORE this walk -> starting offset on the taming bar. Uses the
// base (non-Charmer) friendRungs ladder 1/3/6, so a Charmer's quicker rungs
// don't change how fast a colony cat tames: 1 greet -> 1, 3 -> 2, 6+ -> 3.
// Anything that isn't a non-negative number reads as a stranger.
export function headStartFor(priorGreets) {
  if (typeof priorGreets !== 'number' || !(priorGreets >= 0)) return 0;
  const r = friendRungs(false);
  const n = priorGreets >= r.best ? 3 : priorGreets >= r.friend ? 2 : priorGreets >= r.met ? 1 : 0;
  return Math.min(HEAD_START_MAX, n);
}

// About one name in four is shy. Derived from the name with rng.js's FNV (not
// game/util.js's hashName, which collides on anagrams — see straycats.js). Of
// the 48 shipped names this marks 12, inside the 8..16 the tests pin.
export function isShy(name) {
  return typeof name === 'string' && seedFromCode(name) % 4 === 0;
}

const byName = (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
const walkMs = (stamp) => (typeof stamp === 'string' && WALK_STAMP.test(stamp) ? Number(stamp.slice(5)) : 0);
const round1 = (v) => Math.round(v * 10) / 10;

// Where a cat stands: the bar, who has fed, and whether it is tamed.
//   have               headStart + feeds, capped at need
//   headStart          the largest head offset recorded on any of its feeds, so
//                      it can only grow
//   byPlayer           [{ by, n }] in first-feed order
//   needsSecondFeeder  a shy cat with a full bar, in a 2-member colony, that
//                      only one player has fed. Never true once tamed, so
//                      pairing later cannot un-tame a cat.
export function tamingProgress(colony, name, { members = 1 } = {}) {
  const need = TAME_FEEDS;
  const cat = colony.cats.find((c) => c.name === name);
  const feeds = colony.feeds.filter((f) => f.cat === name);
  let headStart = 0;
  const counts = new Map();
  for (const f of feeds) {
    if (f.head > headStart) headStart = f.head;
    counts.set(f.by, (counts.get(f.by) || 0) + 1);
  }
  headStart = Math.min(HEAD_START_MAX, headStart);
  const byPlayer = [...counts].map(([by, n]) => ({ by, n }));
  const feeders = byPlayer.length;
  const have = Math.min(need, headStart + feeds.length);
  const tamed = !!cat && cat.tamedBy != null;
  const needsSecondFeeder = !tamed && have >= need && isShy(name) && members >= 2 && feeders < 2;
  return { have, need, headStart, byPlayer, feeders, tamed, needsSecondFeeder };
}

// May `by` feed `name` on walk `walk`?
//   'tamed'         already tamed — nothing left to do
//   'fed-this-walk' this player already fed it this walk (wins over ok/waiting)
//   'waiting'       this player has fed a shy cat whose bar is full; it needs a
//                   DIFFERENT member. A member who hasn't fed it gets 'ok'.
//   'full'          can't add it: the colony already holds COLONY_MAX cats (or
//                   the name/area isn't a real stray — nothing to feed)
//   'ok'
export function canFeed(colony, name, by, walk, { members = 1 } = {}) {
  if (!isStrayName(name)) return 'full';
  const cat = colony.cats.find((c) => c.name === name);
  if (!cat) return colony.cats.length >= COLONY_MAX ? 'full' : 'ok';
  if (cat.tamedBy != null) return 'tamed';
  let mine = 0;
  for (const f of colony.feeds) {
    if (f.cat !== name || f.by !== by) continue;
    if (f.walk === walk) return 'fed-this-walk';
    mine++;
  }
  const { needsSecondFeeder } = tamingProgress(colony, name, { members });
  if (needsSecondFeeder && mine > 0) return 'waiting';
  // A player can't feed past a full bar of their own. For a consistent colony
  // this only matters when the bar is full, i.e. the cat is (or is about to be)
  // done, so 'tamed' is the honest answer.
  if (mine >= TAME_FEEDS) return 'tamed';
  return 'ok';
}

// Record one feed. Returns { colony, result, tamedNow, progress }. `result` is
// canFeed's answer; anything but 'ok' returns the colony untouched. The first
// feed of a cat creates it: that player is the finder and the spot (rounded to
// 0.1 m) is fixed for good — later feeds never move it.
export function feedCat(colony, { name, by, walk, area, x, z, head }, { members = 1 } = {}) {
  const refuse = (result) => ({ colony, result, tamedNow: false, progress: tamingProgress(colony, name, { members }) });
  // Bad input is refused like a full colony: there is no cat to add.
  if (typeof by !== 'string' || !PLAYER_ID.test(by) || typeof walk !== 'string' || !WALK_STAMP.test(walk)) {
    return refuse('full');
  }
  const result = canFeed(colony, name, by, walk, { members });
  if (result !== 'ok') return refuse(result);

  let cats = colony.cats;
  if (!cats.some((c) => c.name === name)) {
    if (!COLONY_AREAS.includes(area) || !Number.isFinite(x) || !Number.isFinite(z)) return refuse('full');
    cats = [...cats, { name, finder: by, area, x: round1(x), z: round1(z), wear: null, tamedBy: null, tamedWalk: null }];
  }
  const h = Number.isInteger(head) ? Math.max(0, Math.min(HEAD_START_MAX, head)) : 0;
  const feeds = [...colony.feeds, { cat: name, by, walk, head: h }];
  let next = { ...colony, cats, feeds };

  let progress = tamingProgress(next, name, { members });
  let tamedNow = false;
  if (!progress.tamed && progress.have >= progress.need && !progress.needsSecondFeeder) {
    next = { ...next, cats: next.cats.map((c) => (c.name === name ? { ...c, tamedBy: by, tamedWalk: walk } : c)) };
    progress = tamingProgress(next, name, { members });
    tamedNow = true;
  }
  return { colony: next, result: 'ok', tamedNow, progress };
}

// Untamed cats standing in an area, sorted by name.
export function catsInArea(colony, area) {
  return colony.cats.filter((c) => c.area === area && c.tamedBy == null).sort(byName);
}

// Tamed cats in the order they were tamed (walk stamp, which is a millisecond
// clock), ties by name. This order fixes each cat's den home, so it must be
// stable across devices.
export function tamedCats(colony) {
  return colony.cats
    .filter((c) => c.tamedBy != null)
    .sort((a, b) => walkMs(a.tamedWalk) - walkMs(b.tamedWalk) || byName(a, b));
}
