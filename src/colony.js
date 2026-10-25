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
//
// The second half of this file (sanitizeColony and below) is where the
// ADD-ONLY rule is enforced: the save key's hostile-input sanitizer, the merge
// with the server's snapshot, trades and the cosmetic rewards. progression.js
// is still the only thing that writes the save; it calls these.
import { isStrayName } from './straynames.js';
import { friendRungs } from './skills.js';
import { seedFromCode } from './rng.js';
// DOM-free: net.js imports only chat.js. One definition of a valid pet name.
import { validPetName } from './net.js';

export const TAME_FEEDS = 6;        // feeds that fill the bar from nothing
export const HEAD_START_MAX = 3;    // most a past friendship can pre-fill
export const COLONY_MAX = 12;       // cats in total, in progress plus tamed (= DEN_SPOTS.length)
export const FEEDS_MAX = 160;       // cap for a stored/synced feed list (used by the sanitizers)
export const COLONY_AREAS = ['neighborhood', 'park', 'seaside', 'docks'];

const PLAYER_ID = /^[A-Za-z0-9-]{8,64}$/;
const WALK_STAMP = /^walk-\d{1,16}$/;
const COLONY_ID = /^[A-Za-z0-9-]{1,64}$/;
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const SPOT_MAX = 200;              // metres; a cat's fixed spot is clamped to ±SPOT_MAX
const TRADES_MAX = 20;             // newest trades kept, by id
const TRADES_APPLIED_MAX = 50;     // most recent applied trade ids kept
const WARDROBE_MAX = 40;           // partner wardrobe entries kept
const TRADE_STATUSES = new Set(['offered', 'accepted', 'declined', 'cancelled']);

const isPlayerId = (v) => typeof v === 'string' && PLAYER_ID.test(v);
const isWalkStamp = (v) => typeof v === 'string' && WALK_STAMP.test(v);

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
// A fixed spot: rounded to 0.1 m, then clamped to ±SPOT_MAX. `|| 0` turns a
// -0 into 0 so a value survives a JSON round trip unchanged.
const spotOf = (v) => Math.max(-SPOT_MAX, Math.min(SPOT_MAX, round1(v))) || 0;
const headOf = (v) => (Number.isInteger(v) ? Math.max(0, Math.min(HEAD_START_MAX, v)) : 0);
export const feedKey = (f) => `${f.cat}|${f.by}|${f.walk}`;

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
//   'bad'           malformed input: not a stray name, not a player id, or not
//                   a walk stamp. Checked first, so canFeed and feedCat always
//                   give the same answer for the same input.
//   'tamed'         already tamed — nothing left to do
//   'fed-this-walk' this player already fed it this walk (wins over ok/waiting)
//   'waiting'       this player has fed a shy cat whose bar is full; it needs a
//                   DIFFERENT member. A member who hasn't fed it gets 'ok'.
//   'full'          can't add it: the colony already holds COLONY_MAX cats
//   'ok'
export function canFeed(colony, name, by, walk, { members = 1 } = {}) {
  if (!isStrayName(name) || !isPlayerId(by) || !isWalkStamp(walk)) return 'bad';
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
// canFeed's answer ('bad' too for an unknown area or a non-finite spot);
// anything but 'ok' returns the colony untouched. The first feed of a cat
// creates it: that player is the finder and the spot (rounded to 0.1 m and
// clamped to ±200 m) is fixed for good — later feeds never move it. The area
// and spot are checked on every feed, not just the first, so a malformed call
// is refused the same way whether or not the cat already exists.
export function feedCat(colony, { name, by, walk, area, x, z, head }, { members = 1 } = {}) {
  const refuse = (result) => ({ colony, result, tamedNow: false, progress: tamingProgress(colony, name, { members }) });
  if (!COLONY_AREAS.includes(area) || !Number.isFinite(x) || !Number.isFinite(z)) return refuse('bad');
  const result = canFeed(colony, name, by, walk, { members });
  if (result !== 'ok') return refuse(result);

  let cats = colony.cats;
  if (!cats.some((c) => c.name === name)) {
    cats = [...cats, { name, finder: by, area, x: spotOf(x), z: spotOf(z), wear: null, tamedBy: null, tamedWalk: null }];
  }
  const feeds = [...colony.feeds, { cat: name, by, walk, head: headOf(head) }];
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

// ---------------------------------------------------------------------------
// The save key, the merge, trades and rewards.
// ---------------------------------------------------------------------------

// Colony milestones (decisions.md, "Rewards"): reaching `tamed` tamed cats
// unlocks the FIRST item of `items` that you don't already own. Cosmetic only,
// never points. Every item is a CATALOG.accessories id (progression.test.js
// would notice otherwise: grantColonyRewards only adds known accessories).
export const COLONY_REWARDS = [
  { id: 'tamed-1', tamed: 1, items: ['heart', 'bowtie', 'socks'] },
  { id: 'tamed-3', tamed: 3, items: ['crown', 'wizard', 'tophat'] },
  { id: 'tamed-6', tamed: 6, items: ['wings', 'cape', 'jetpack'] },
  { id: 'tamed-12', tamed: 12, items: ['monocle', 'balloon', 'raincoat'] },
];
const REWARD_IDS = new Set(COLONY_REWARDS.map((r) => r.id));

const isPlainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const asArray = (v) => (Array.isArray(v) ? v : []);
const isTradeId = (v) => Number.isSafeInteger(v) && v > 0;
const isFeedKey = (v) => {
  if (typeof v !== 'string' || v.length > 160) return false;
  const [cat, by, walk, extra] = v.split('|');
  return extra === undefined && isStrayName(cat) && isPlayerId(by) && isWalkStamp(walk);
};

// Validated, deduped (first occurrence wins), keeping the LAST `max`: for
// lists that only ever grow by pushing (tradesApplied, seen.*), the newest
// entries are the ones that matter.
function lastDistinct(v, ok, max) {
  const out = [];
  const seen = new Set();
  for (const x of asArray(v)) {
    if (!ok(x) || seen.has(x)) continue;
    seen.add(x);
    out.push(x);
  }
  return out.slice(Math.max(0, out.length - max));
}

function sanitizeCat(c, knownItems) {
  if (!isPlainObject(c)) return null;
  const { name, finder, area } = c;
  if (!isStrayName(name) || !isPlayerId(finder) || !COLONY_AREAS.includes(area)) return null;
  const tamedBy = isPlayerId(c.tamedBy) ? c.tamedBy : null;
  return {
    name, finder, area,
    // Non-finite (or non-number) coordinates read as 0, then the usual spot rule.
    x: spotOf(Number.isFinite(c.x) ? c.x : 0),
    z: spotOf(Number.isFinite(c.z) ? c.z : 0),
    wear: typeof c.wear === 'string' && knownItems.has(c.wear) ? c.wear : null,
    tamedBy,
    tamedWalk: tamedBy !== null && isWalkStamp(c.tamedWalk) ? c.tamedWalk : null,
  };
}

function sanitizeTrade(t, knownItems) {
  if (!isPlainObject(t)) return null;
  const { id, from, to, give, want, status } = t;
  if (!isTradeId(id) || !isPlayerId(from) || !isPlayerId(to) || from === to) return null;
  if (typeof give !== 'string' || !knownItems.has(give) || typeof want !== 'string' || !knownItems.has(want)) return null;
  if (typeof status !== 'string' || !TRADE_STATUSES.has(status)) return null;
  return { id, from, to, give, want, status };
}

function sanitizePartner(v, knownItems) {
  if (!isPlainObject(v) || !isPlayerId(v.playerId)) return null;
  const wardrobe = [];
  for (const item of asArray(v.wardrobe)) {
    if (wardrobe.length >= WARDROBE_MAX) break;
    if (typeof item === 'string' && knownItems.has(item) && !wardrobe.includes(item)) wardrobe.push(item);
  }
  return { playerId: v.playerId, petName: validPetName(v.petName) ? v.petName : 'your partner', wardrobe };
}

// sanitizeColony(v, { knownItems }) -> Colony. Every cloud (or corrupted
// local) value passes through here; it never throws. Same discipline as
// progression.js's sanitizeGifts/sanitizeGrudges: validate each ENTRY, build
// fresh objects with literal fields, never use a payload value as an object
// key (dedupe uses Sets), and dedupe while capping.
//   cats          at most COLONY_MAX, first valid entry wins by name
//   feeds         only for a surviving cat, deduped by key, at most
//                 TAME_FEEDS per (cat, by) and FEEDS_MAX in total
//   trades        well-formed, deduped by id (first wins), the 20 newest,
//                 returned in id order
//   tradesApplied the last 50 distinct ids
//   rewarded      COLONY_REWARDS ids only
//   seen          well-formed feed keys (last FEEDS_MAX), tamed names, trade
//                 ids, and a YYYY-MM-DD day or null
//   wear / wardrobe items must be in `knownItems`. Without it every item is
//                 dropped: it fails closed.
export function sanitizeColony(v, { knownItems } = {}) {
  try {
    return sanitizeColonyUnsafe(v, knownItems instanceof Set ? knownItems : new Set());
  } catch {
    return emptyColony();
  }
}

function sanitizeColonyUnsafe(v, knownItems) {
  if (!isPlainObject(v)) return emptyColony();

  const cats = [];
  const names = new Set();
  for (const raw of asArray(v.cats)) {
    if (cats.length >= COLONY_MAX) break;
    const c = sanitizeCat(raw, knownItems);
    if (!c || names.has(c.name)) continue;
    names.add(c.name);
    cats.push(c);
  }

  const feeds = [];
  const keys = new Set();
  const perFeeder = new Map();
  for (const f of asArray(v.feeds)) {
    if (feeds.length >= FEEDS_MAX) break;
    if (!isPlainObject(f)) continue;
    const { cat, by, walk } = f;
    if (!names.has(cat) || !isPlayerId(by) || !isWalkStamp(walk)) continue;
    const key = feedKey({ cat, by, walk });
    if (keys.has(key)) continue;
    const pair = `${cat}|${by}`;
    const n = perFeeder.get(pair) || 0;
    if (n >= TAME_FEEDS) continue;
    keys.add(key);
    perFeeder.set(pair, n + 1);
    feeds.push({ cat, by, walk, head: headOf(f.head) });
  }

  const byId = new Map();
  for (const raw of asArray(v.trades)) {
    const t = sanitizeTrade(raw, knownItems);
    if (t && !byId.has(t.id)) byId.set(t.id, t);
  }
  const trades = [...byId.values()].sort((a, b) => a.id - b.id).slice(-TRADES_MAX);

  const s = isPlainObject(v.seen) ? v.seen : {};
  return {
    id: typeof v.id === 'string' && COLONY_ID.test(v.id) ? v.id : null,
    partner: sanitizePartner(v.partner, knownItems),
    cats,
    feeds,
    trades,
    tradesApplied: lastDistinct(v.tradesApplied, isTradeId, TRADES_APPLIED_MAX),
    rewarded: lastDistinct(v.rewarded, (x) => typeof x === 'string' && REWARD_IDS.has(x), REWARD_IDS.size),
    seen: {
      feedKeys: lastDistinct(s.feedKeys, isFeedKey, FEEDS_MAX),
      tamed: lastDistinct(s.tamed, isStrayName, COLONY_MAX * 4),
      trades: lastDistinct(s.trades, isTradeId, TRADES_APPLIED_MAX),
      day: typeof s.day === 'string' && YMD.test(s.day) ? s.day : null,
    },
  };
}

// sanitizeSnapshot(raw, { me, knownItems }) -> { status, remote?, invite?, joining? }
// The inbound side of colony_sync (docs/supabase-colony.sql). `raw` is the
// server's JSON, snake_case, and is untrusted. Never throws. status is
//   'denied'   the server refused our id/secret
//   'unpaired' no colony yet (or a lone member): `invite` is our open sharing
//              code or null, `joining` is the invite we answered or null
//   'paired'   `remote` = { id, partner, cats, feeds, trades } in client shape
//   'bad'      anything else, including a paired snapshot with no usable
//              colony id or no partner other than `me`
// A paired snapshot is mapped to the shared field names (finder_id -> finder,
// by_id -> by, from_id -> from, ...) and run through sanitizeColony, so the
// per-entry rules, caps and the knownItems filter are the one set in this file.
const INVITE_CODE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;
const SAFE_PET_NAME = 'your partner';

const mapEach = (list, f) => asArray(list).map((x) => (isPlainObject(x) ? f(x) : x));

export function sanitizeSnapshot(raw, { me, knownItems } = {}) {
  try {
    return sanitizeSnapshotUnsafe(raw, me, knownItems instanceof Set ? knownItems : new Set());
  } catch {
    return { status: 'bad' };
  }
}

function sanitizeSnapshotUnsafe(raw, me, knownItems) {
  if (!isPlainObject(raw)) return { status: 'bad' };
  if (raw.status === 'denied') return { status: 'denied' };

  if (raw.status === 'unpaired') {
    const inv = raw.invite;
    const joi = raw.joining;
    const invite = isPlainObject(inv) && typeof inv.code === 'string' && INVITE_CODE.test(inv.code)
      ? {
          code: inv.code,
          expiresAt: typeof inv.expires_at === 'string' ? inv.expires_at : null,
          joinerPetName: validPetName(inv.joiner_pet_name) ? inv.joiner_pet_name
            : typeof inv.joiner_pet_name === 'string' ? SAFE_PET_NAME : null,
        }
      : null;
    const joining = isPlainObject(joi)
      ? { inviterPetName: validPetName(joi.inviter_pet_name) ? joi.inviter_pet_name : SAFE_PET_NAME }
      : null;
    return { status: 'unpaired', invite, joining };
  }

  if (raw.status !== 'paired') return { status: 'bad' };
  if (typeof raw.colony_id !== 'string' || !COLONY_ID.test(raw.colony_id)) return { status: 'bad' };

  // The partner is the first member who is not me and has a usable player id.
  const member = asArray(raw.members).find((m) => isPlainObject(m) && isPlayerId(m.player_id) && m.player_id !== me);
  if (!member) return { status: 'bad' };

  const c = sanitizeColony({
    id: raw.colony_id,
    partner: { playerId: member.player_id, petName: member.pet_name, wardrobe: member.wardrobe },
    cats: mapEach(raw.cats, (x) => ({
      name: x.name, finder: x.finder_id, area: x.area, x: x.x, z: x.z,
      wear: x.wear, tamedBy: x.tamed_by, tamedWalk: x.tamed_walk,
    })),
    feeds: mapEach(raw.feeds, (x) => ({ cat: x.cat, by: x.by_id, walk: x.walk, head: x.head })),
    trades: mapEach(raw.trades, (x) => ({ id: x.id, from: x.from_id, to: x.to_id, give: x.give, want: x.want, status: x.status })),
  }, { knownItems });
  if (!c.partner || c.id === null) return { status: 'bad' };
  return { status: 'paired', remote: { id: c.id, partner: c.partner, cats: c.cats, feeds: c.feeds, trades: c.trades } };
}

// mergeColony(local, remote, { knownItems }) -> Colony. `remote` is the
// server's snapshot, { id, partner, cats, feeds, trades }, in client shape.
// The conflict policy (spec Stream 2 decision 1), which is what keeps the
// colony ADD-ONLY:
//   * id, partner and trades come from remote; tradesApplied, rewarded and
//     seen come from local (they are this device's bookkeeping).
//   * cats are a union by name. When both have a cat, remote wins
//     finder/area/x/z/wear (the server's first insert is the truth), and
//     tamedBy = remote.tamedBy ?? local.tamedBy with tamedWalk paired to
//     whichever side supplied tamedBy. So tamed is an OR and is never cleared.
//   * feeds are a union by key.
// Both sides are sanitized first and the result is sanitized again, so the
// caps hold and a hostile remote can add at most valid things. Remote entries
// go first (the server's view wins a cap), local-only ones after; that order
// is also what makes the merge idempotent.
export function mergeColony(local, remote, { knownItems } = {}) {
  const opts = { knownItems };
  const l = sanitizeColony(local, opts);
  const r = sanitizeColony(isPlainObject(remote)
    ? { id: remote.id, partner: remote.partner, cats: remote.cats, feeds: remote.feeds, trades: remote.trades }
    : null, opts);

  const localByName = new Map(l.cats.map((c) => [c.name, c]));
  const remoteNames = new Set(r.cats.map((c) => c.name));
  const cats = r.cats.map((rc) => {
    const lc = localByName.get(rc.name);
    if (!lc || rc.tamedBy !== null) return rc;
    return { ...rc, tamedBy: lc.tamedBy, tamedWalk: lc.tamedWalk };
  });
  for (const lc of l.cats) if (!remoteNames.has(lc.name)) cats.push(lc);

  const remoteKeys = new Set(r.feeds.map(feedKey));
  const feeds = [...r.feeds, ...l.feeds.filter((f) => !remoteKeys.has(feedKey(f)))];

  return sanitizeColony({
    id: r.id, partner: r.partner, cats, feeds, trades: r.trades,
    tradesApplied: l.tradesApplied, rewarded: l.rewarded, seen: l.seen,
  }, opts);
}

// unsyncedFeeds(local, remote, me) -> Feed[]: my feeds whose key the remote
// lacks — what the next pull re-pushes, so an offline feed is never lost and
// no outbox is needed. Fresh copies.
export function unsyncedFeeds(local, remote, me) {
  const remoteKeys = new Set();
  for (const f of asArray(isPlainObject(remote) ? remote.feeds : null)) {
    if (isPlainObject(f)) remoteKeys.add(feedKey(f));
  }
  return asArray(local?.feeds)
    .filter((f) => isPlainObject(f) && f.by === me && !remoteKeys.has(feedKey(f)))
    .map((f) => ({ cat: f.cat, by: f.by, walk: f.walk, head: f.head }));
}

// tradeEffect(trade, me) -> { remove, add } | null. Only an ACCEPTED trade
// that names me on one side has an effect: the offerer (`from`) gives `give`
// and gets `want`; the other side the reverse.
export function tradeEffect(trade, me) {
  if (!isPlainObject(trade) || trade.status !== 'accepted' || !isPlayerId(me)) return null;
  if (trade.from === me) return { remove: trade.give, add: trade.want };
  if (trade.to === me) return { remove: trade.want, add: trade.give };
  return null;
}

// rewardsDue(colony, owned) -> Array<{ id, item }>: every milestone reached
// (by tamed-cat count) and not yet in `colony.rewarded`, each with the first
// of its items not in `owned` — or null when all are owned. The caller records
// a null milestone too, so it never fires again.
export function rewardsDue(colony, owned) {
  const have = new Set(asArray(owned));
  const done = new Set(asArray(colony?.rewarded));
  const tamed = asArray(colony?.cats).filter((c) => c && c.tamedBy != null).length;
  const out = [];
  for (const r of COLONY_REWARDS) {
    if (tamed < r.tamed || done.has(r.id)) continue;
    const item = r.items.find((i) => !have.has(i)) ?? null;
    if (item) have.add(item);
    out.push({ id: r.id, item });
  }
  return out;
}
