import { DEN_ITEMS, DEN_SPOTS } from './den.js';
import { AWARDS } from './discoveries.js';
import { SKILL_IDS, friendRungs, hasSkill } from './skills.js';

const SAVE_KEY = 'whisker-walk-save';
// v4: per-slot cosmetic accessories. STILL 4 in v18 — `skills` and `feats`
// are ADDITIVE fields sanitized independently with a default, exactly like
// v15's journal/golden/streak/kitten, so a payload predating them loads
// losslessly and an older client simply ignores the extra keys. Bumping the
// version here would strand every save written by a deployed older client.
const SAVE_VERSION = 4;

// v15 Collector's Journal critter types — the fixed vocabulary state.journal
// counts are restricted to (sanitizeState drops anything outside this list).
export const JOURNAL_TYPES = ['bird', 'squirrel', 'butterfly', 'duck', 'seagull', 'crab', 'dog', 'villager', 'firefly', 'mouse'];

// Golden-mouse id shape, e.g. 'gm-neigh-1'. The brief called for validating
// state.golden against a KNOWN_GOLD set imported from src/goldmice.js, but
// that module doesn't exist yet (it lands in Task 5.3) — importing it here
// would make progression.js depend on a not-yet-existing module and invite
// an import cycle once goldmice.js exists. Validating against this id-shape
// pattern instead needs no cross-module import and still rejects anything
// that isn't a plausible golden-mouse id; Task 5.3 can layer a real
// existence check in the game logic that calls recordGolden.
// Bounded to 24 chars in the middle segment — real area-name segments (e.g.
// 'neigh', 'park', 'seaside') are a handful of characters; the cap just
// forecloses a hostile payload using an unbounded `[a-z]+` to smuggle
// megabytes of 'a's into a single golden id.
const GOLD_ID_PATTERN = /^gm-[a-z]{1,24}-[1-9]$/;
const YMD_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
// Ceiling on how many golden ids sanitizeGolden keeps. There are only 9 real
// golden mice (see Task 5.3 / src/goldmice.js), so 64 is already generous
// headroom for future additions — its real job is capping the array so a
// hostile cloud payload can't pad state.golden with thousands of
// valid-shaped-but-fake ids and bloat the save past the localStorage quota.
const GOLD_MAX_COUNT = 64;
// Ceiling on state.streak.count: a ten-year unbroken daily streak. Matches
// kitten.stage's Math.min clamp just below — asFiniteNonNegInt alone accepts
// any finite non-negative integer (e.g. 1e15), which is a meaningless streak
// and, via 5 * count in recordStreakWalk-adjacent bonus math and repeated
// save() round-trips, an avoidable way to inflate the persisted save.
const STREAK_COUNT_MAX = 3650;
// Ceiling on state.race.bestMs: 24 hours in ms. No real daily-race best time
// is ever going to approach this — its job, like STREAK_COUNT_MAX above, is
// rejecting a hostile/corrupted cloud payload's implausible number rather
// than persisting (and later displaying) it.
const RACE_MS_MAX = 24 * 60 * 60 * 1000;
// Ceiling on state.den.owned's length. There are only 6 real den items (see
// DEN_ITEMS in src/den.js), so 32 is generous headroom for future additions —
// its real job, same as GOLD_MAX_COUNT above, is capping the array so a
// hostile cloud payload can't pad state.den.owned with thousands of
// known-shaped ids and bloat the save past the localStorage quota.
const DEN_OWNED_MAX = 32;
// Known den item/spot ids, computed once from den.js's own exports rather
// than duplicated here — sanitizeDen and placeDenItem both need these sets.
const DEN_ITEM_IDS = new Set(Object.keys(DEN_ITEMS));
const DEN_SPOT_IDS = new Set(DEN_SPOTS.map((s) => s.id));
// v18 Cat Skills. Both sets are computed from the modules that OWN the
// vocabulary — skills.js's catalog and discoveries.js's AWARDS — rather than
// duplicated here, so adding an ability or an award type can never leave
// sanitizeState silently dropping a legitimate new key.
const KNOWN_SKILL_IDS = new Set(SKILL_IDS);
// v18 Task 1.4: two tallies that are NOT award types.
//
// state.feats' key vocabulary is normally exactly AWARDS' keys, because
// recordFeat is driven by discoveries.js's pay(). These two are counted
// ALONGSIDE an existing award rather than by retyping one, because the
// existing award type is load-bearing somewhere else and retyping it would
// silently change live gameplay (the spec's non-goals forbid rebalancing):
//
//  - 'perch'  reaching a vantage perch already pays awardOnce('scenic', …),
//             and GOAL_POOL's 'scenic-spots' goal ("Visit 2 scenic spots")
//             counts 'scenic' discoveries. Retyping the perch award would
//             quietly make that goal harder. So the perch call site pays the
//             unchanged 'scenic' award AND records this second, dedicated
//             tally, which is what Spring Paws / Fence Runner actually read.
//  - 'race'   finishing the daily race already pays awardOnce('goal',
//             'race-done'); 'goal' is shared with the three ordinary per-walk
//             goal completions, so feats.goal hits 3 in one normal walk.
//             Same treatment: unchanged award + a dedicated tally, which is
//             what lets Long Zoomies mean "finish the race 3 times".
//
// They live in state.feats (rather than as two more top-level save fields)
// because they are the same KIND of thing — a lifetime count of a player
// action — and so inherit sanitizeFeats' coercion, cap and __proto__
// handling for free. Neither name collides with an AWARDS key; the
// assertion below makes that a build-time failure rather than a silent
// double-count if a future award type ever takes one of these names.
const EXTRA_FEAT_TYPES = ['perch', 'race'];
for (const t of EXTRA_FEAT_TYPES) {
  if (Object.prototype.hasOwnProperty.call(AWARDS, t)) {
    throw new Error(`progression: feat tally '${t}' collides with an AWARDS type`);
  }
}
const FEAT_TYPES = new Set([...Object.keys(AWARDS), ...EXTRA_FEAT_TYPES]);
// Ceiling on state.feats' per-type lifetime tallies. Same job as
// STREAK_COUNT_MAX/RACE_MS_MAX above: asFiniteNonNegInt alone would happily
// persist 1e15 "things tipped over", which is meaningless, renders badly in
// the Skills tab's progress text, and bloats the save on every round-trip.
// A million of any one discovery type is already far beyond a lifetime of
// real play (the highest feat threshold in the catalog is 40).
const FEAT_COUNT_MAX = 1_000_000;
// Ceiling on state.duskWalks (v18 Task 1.4). Same job as STREAK_COUNT_MAX and
// FEAT_COUNT_MAX above: a lifetime of real play is a few thousand walks at
// the very most, so 100k is generous headroom whose only real purpose is
// stopping a hostile cloud payload persisting 1e15 dusk walks.
const DUSK_WALKS_MAX = 100_000;

// The prestige ladder, gated purely on lifetimePoints. Ranks confer NOTHING
// mechanical — skills.js is the mechanical axis and this is the prestige one,
// and keeping the two independent is the point (v18 spec §Rank ladder).
//
// Must stay sorted ascending by `at`: rankFor walks the array in order and
// keeps the last entry it clears. The first five entries are the pre-v18
// ladder and are FROZEN — changing a title or a threshold would demote a
// player on update, which is the one thing this table may never do. v18
// appends four tiers past the old 2000 dead end so the HUD's progress bar has
// somewhere to go.
export const RANKS = [
  { at: 0, title: 'House Cat' },
  { at: 150, title: 'Yard Prowler' },
  { at: 400, title: 'Street Smart' },
  { at: 900, title: 'Neighborhood Legend' },
  { at: 2000, title: 'Mythical Feline' },
  { at: 3500, title: 'Rooftop Royalty' },
  { at: 5500, title: 'Shadow Prowler' },
  { at: 8000, title: 'Nine Lives' },
  { at: 12000, title: 'Whisker Legend' },
];

export function rankFor(lifetimePoints) {
  let current = RANKS[0];
  let next = null;
  for (const r of RANKS) {
    if (lifetimePoints >= r.at) current = r;
  }
  const idx = RANKS.indexOf(current);
  next = idx + 1 < RANKS.length ? RANKS[idx + 1] : null;
  return { title: current.title, next };
}

export const CATALOG = {
  cats: {
    tabby: { name: 'Tabby', price: 0 },
    siamese: { name: 'Siamese', price: 30 },
    persian: { name: 'Persian', price: 30 },
    black: { name: 'Black Cat', price: 45 },
    calico: { name: 'Calico', price: 45 },
    mainecoon: { name: 'Maine Coon', price: 60 },
    zeetoo: { name: 'Zeetoo', price: 40 },
    rosa: { name: 'Rosa', price: 40 },
    robbie: { name: 'Robbie', price: 40 },
    hagrid: { name: 'Hagrid', price: 60 },
  },
  accessories: {
    bell: { name: 'Bell Collar', slot: 'collar', price: 20 },
    glow: { name: 'Glow Collar', slot: 'collar', price: 40 },
    bandana: { name: 'Bandana', slot: 'neck', price: 20 },
    booties: { name: 'Rain Booties', slot: 'feet', price: 25 },
    backpack: { name: 'Tiny Backpack', slot: 'back', price: 35 },
    crown: { name: 'Flower Crown', slot: 'head', price: 35 },
    tophat: { name: 'Top Hat', slot: 'head', price: 30 },
    beanie: { name: 'Cozy Beanie', slot: 'head', price: 20 },
    glasses: { name: 'Round Glasses', slot: 'face', price: 25 },
    sunglasses: { name: 'Cool Sunglasses', slot: 'face', price: 25 },
    necktie: { name: 'Necktie', slot: 'neck', price: 25 },
    bowtie: { name: 'Bow Tie', slot: 'neck', price: 25 },
    scarf: { name: 'Cozy Scarf', slot: 'neck', price: 30 },
    hoodie: { name: 'Purple Hoodie', slot: 'body', price: 35 },
    cape: { name: 'Superhero Cape', slot: 'body', price: 40 },
    wings: { name: 'Butterfly Wings', slot: 'back', price: 45 },
    sneakers: { name: 'Sporty Sneakers', slot: 'feet', price: 25 },
    rainboots: { name: 'Rain Boots', slot: 'feet', price: 25 },
    heart: { name: 'Heart Charm Collar', slot: 'collar', price: 25 },
    studded: { name: 'Studded Collar', slot: 'collar', price: 30 },
    wizard: { name: 'Wizard Hat', slot: 'head', price: 35 },
    monocle: { name: 'Fancy Monocle', slot: 'face', price: 30 },
    eyepatch: { name: 'Pirate Eyepatch', slot: 'face', price: 25 },
    raincoat: { name: 'Yellow Raincoat', slot: 'body', price: 35 },
    sweater: { name: 'Striped Sweater', slot: 'body', price: 30 },
    jetpack: { name: 'Toy Jetpack', slot: 'back', price: 45 },
    balloon: { name: 'Party Balloon', slot: 'back', price: 30 },
    socks: { name: 'Mismatched Socks', slot: 'feet', price: 20 },
  },
  areas: {
    neighborhood: { name: 'Cozy Neighborhood', price: 0 },
    park: { name: 'City Park', price: 50, requires: { area: 'neighborhood', walks: 2 } },
    seaside: { name: 'Seaside', price: 100, requires: { area: 'park', walks: 2 } },
  },
};

// summarizeSaveForPreview(s) — reduces a save object down to the four fields
// the cloud-sync "Load from cloud" preview card displays (main.js's
// previewLoad, rendered by ui/homebase.js's renderSync). `s` may be a
// hostile/malformed payload smuggled in via the cloud `saves` table (it's
// read back with no server-side shape validation — see docs/supabase-setup.sql's
// load_save) — every numeric field is coerced through asFiniteNonNeg so
// nothing but a plain finite non-negative number ever reaches the preview
// card, and rank is always one of RANKS' own fixed titles. `s` itself may be
// any type (string, null, array) since a hostile payload could replace the
// whole `save` object — optional chaining below means that never throws.
export function summarizeSaveForPreview(s) {
  const points = asFiniteNonNeg(s?.points, 0);
  const lifetimePoints = asFiniteNonNeg(s?.lifetimePoints, 0);
  const bestWalk = asFiniteNonNeg(s?.bestWalk, 0);
  return { rank: rankFor(lifetimePoints).title, points, lifetimePoints, bestWalk };
}

function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}
// exported so other untrusted-input call sites (e.g. main.js's cloud-preview
// summarize, before Task-1-final-fix-wave a raw pass-through that let a
// hostile cloud payload's non-numeric points/lifetimePoints/bestWalk reach
// homebase's innerHTML) can reuse the exact same coercion instead of
// duplicating (and potentially drifting from) it.
export function asFiniteNonNeg(v, fallback) {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback;
}
function asFiniteNonNegInt(v, fallback) {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : fallback;
}
function asStringArray(v) {
  return Array.isArray(v) && v.every((x) => typeof x === 'string') ? v : [];
}

function defaultState() {
  return {
    version: SAVE_VERSION,
    points: 0,
    // v17: 'den' added alongside the walk areas. It's not a CATALOG.areas
    // entry (the den isn't unlocked/bought like neighborhood/park/seaside —
    // see Task 7.2), but completeWalk() increments state.walks[state.area]
    // unconditionally, so state.walks needs a 'den' key present from the
    // start — otherwise a den walk would do `undefined + 1` and leave
    // state.walks.den as NaN forever (NaN + 1 is still NaN, so it would
    // never self-heal on a later walk either).
    walks: { neighborhood: 0, park: 0, seaside: 0, den: 0 },
    unlocked: { cats: ['tabby', 'siamese', 'persian'], accessories: ['bell', 'bandana'], areas: ['neighborhood'] },
    equipped: { cat: 'tabby', collar: null, head: null, face: null, neck: null, body: null, back: null, feet: null },
    area: 'neighborhood',
    lifetimePoints: 0,
    bestWalk: 0,
    friends: {},
    petName: null,
    journal: {},
    golden: [],
    streak: { last: null, count: 0 },
    kitten: { stage: 0 },
    race: { date: null, area: null, bestMs: null },
    den: { owned: [], placed: {} },
    // v18 Cat Skills. `skills` is the list of ability ids already earned —
    // stored rather than derived so a later threshold change can never
    // revoke an ability a child has already unlocked. `feats` is the
    // lifetime per-discovery-type tally the feat predicates read; it is fed
    // from exactly one place (recordFeat, called by discoveries.js's pay).
    // DECISION (locked in the spec): no back-fill. Existing saves start
    // these tallies at zero — feats reading pre-existing fields (golden,
    // journal, walks, race, friends) are naturally retroactive, the new
    // tallies are not, and a fabricated back-fill from lifetimePoints would
    // be a lie about what the player actually did.
    skills: [],
    feats: {},
    // v18 Task 1.4: lifetime count of COMPLETED dusk walks — what Night Eyes
    // ("Complete 5 dusk walks") reads. It cannot be derived from anything
    // already persisted: state.walks[area] counts every walk regardless of
    // time of day, and dusk is a per-walk option that was never recorded.
    // Additive, so SAVE_VERSION stays 4 (see the note on SAVE_VERSION).
    // Incremented only by completeWalk({ dusk: true }), and the caller passes
    // the walk's `duskActive` — not the raw duskMode — because a solo walk
    // only actually goes dusk when the glow collar is equipped.
    duskWalks: 0,
  };
}

// Cloud-loaded (or otherwise externally supplied) journal counts are
// untrusted: each key must be one of the fixed JOURNAL_TYPES and each value
// a finite non-negative integer, or the whole entry is dropped rather than
// coerced/defaulted — an unknown critter type or a garbage count simply
// never makes it into state.journal.
function sanitizeJournal(v) {
  if (!isPlainObject(v)) return {};
  const out = {};
  for (const type of JOURNAL_TYPES) {
    if (!Object.prototype.hasOwnProperty.call(v, type)) continue;
    const n = asFiniteNonNegInt(v[type], undefined);
    if (n !== undefined) out[type] = n;
  }
  return out;
}

// Golden-mouse ids: string + GOLD_ID_PATTERN shape check (see the comment on
// GOLD_ID_PATTERN above for why this replaces a KNOWN_GOLD import), plus
// dedupe — a hostile or corrupted payload could otherwise list the same id
// twice.
function sanitizeGolden(v) {
  if (!Array.isArray(v)) return [];
  const out = [];
  const seen = new Set();
  for (const id of v) {
    if (out.length >= GOLD_MAX_COUNT) break;
    if (typeof id === 'string' && GOLD_ID_PATTERN.test(id) && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

function sanitizeStreak(v) {
  const last = typeof v?.last === 'string' && YMD_PATTERN.test(v.last) ? v.last : null;
  const count = Math.min(STREAK_COUNT_MAX, asFiniteNonNegInt(v?.count, 0));
  return { last, count };
}

function sanitizeKitten(v) {
  const stage = asFiniteNonNegInt(v?.stage, 0);
  return { stage: Math.min(3, stage) };
}

// Cloud-loaded (or otherwise externally supplied) race field: same untrusted
// threat model as sanitizeStreak. date must be a plain YMD string, area must
// be one of CATALOG.areas' own known ids (a fresh Set here rather than
// reusing sanitizeState's local knownAreas — this function also runs
// standalone from tests), and bestMs must be a finite, POSITIVE (a 0 or
// negative "best time" is meaningless) number no larger than RACE_MS_MAX. A
// bad value in any one field resets just that field to null rather than
// discarding the whole race record — mirrors sanitizeFriends' per-field
// approach, not sanitizeStreak's all-or-nothing one, because date/area/bestMs
// aren't load-bearing on each other the way streak's last+count are.
function sanitizeRace(v) {
  const date = typeof v?.date === 'string' && YMD_PATTERN.test(v.date) ? v.date : null;
  const knownAreas = new Set(Object.keys(CATALOG.areas));
  const area = typeof v?.area === 'string' && knownAreas.has(v.area) ? v.area : null;
  const bestMs = typeof v?.bestMs === 'number' && Number.isFinite(v.bestMs) && v.bestMs > 0 && v.bestMs <= RACE_MS_MAX
    ? v.bestMs : null;
  return { date, area, bestMs };
}

// Cloud-loaded (or otherwise externally supplied) den field: same untrusted
// threat model as every other field in sanitizeState. owned is filtered to
// DEN_ITEMS' own keys, deduped, and capped at DEN_OWNED_MAX (mirrors
// sanitizeGolden's dedupe-while-capping walk). placed is a plain object whose
// keys must be a known DEN_SPOTS id AND whose value must be a known DEN_ITEMS
// id that also survived into the sanitized owned list above — an item placed
// in a spot but not actually owned (e.g. a payload edited after the fact, or
// an id that got dropped from owned by the cap) is dropped rather than kept,
// same "don't trust it just because it parses" rule as the rest of this file.
function sanitizeDen(v) {
  const ownedRaw = asStringArray(v?.owned).filter((id) => DEN_ITEM_IDS.has(id));
  const owned = [];
  const seen = new Set();
  for (const id of ownedRaw) {
    if (owned.length >= DEN_OWNED_MAX) break;
    if (!seen.has(id)) {
      seen.add(id);
      owned.push(id);
    }
  }
  const placed = {};
  if (isPlainObject(v?.placed)) {
    for (const [spotId, itemId] of Object.entries(v.placed)) {
      if (!DEN_SPOT_IDS.has(spotId)) continue;
      if (typeof itemId !== 'string' || !DEN_ITEM_IDS.has(itemId) || !owned.includes(itemId)) continue;
      placed[spotId] = itemId;
    }
  }
  return { owned, placed };
}

// v18: unlocked ability ids. Same untrusted threat model as every other
// field here, and the Skills tab renders these ids' catalog entries, so an
// unknown id must never survive: strings only, must be a real catalog id
// (KNOWN_SKILL_IDS, computed from skills.js), deduped, and capped at the
// catalog length — there is no legitimate save holding more unlocked skills
// than there are skills. The dedupe+known-id filter already bounds the
// result, but the explicit cap is kept so the bound stays true if the
// filter is ever loosened.
function sanitizeSkills(v) {
  if (!Array.isArray(v)) return [];
  const out = [];
  const seen = new Set();
  for (const id of v) {
    if (out.length >= KNOWN_SKILL_IDS.size) break;
    if (typeof id === 'string' && KNOWN_SKILL_IDS.has(id) && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

// v18: lifetime per-discovery-type tallies. Structurally identical to
// sanitizeJournal above — iterate the KNOWN key vocabulary and pull each
// key out of the payload with a hasOwnProperty check, rather than iterating
// the payload's own keys. That shape is what makes a '__proto__' (or
// 'constructor', or 'toString') key in a hostile payload inert: it is never
// visited, never assigned, and the output object only ever gains AWARDS
// keys. Values go through the same finite-non-negative-integer coercion as
// journal counts and are clamped at FEAT_COUNT_MAX.
function sanitizeFeats(v) {
  if (!isPlainObject(v)) return {};
  const out = {};
  for (const type of FEAT_TYPES) {
    if (!Object.prototype.hasOwnProperty.call(v, type)) continue;
    const n = asFiniteNonNegInt(v[type], undefined);
    if (n !== undefined) out[type] = Math.min(FEAT_COUNT_MAX, n);
  }
  return out;
}

function ymdToUTCms(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

// Cloud-loaded (or otherwise externally supplied) friends are untrusted:
// homebase interpolates the name/breed into innerHTML, so every key/value
// is type- and shape-checked here rather than trusted wholesale — a bad
// name/breed is dropped (name) or coerced to a safe default (breed).
function sanitizeFriends(v) {
  if (!isPlainObject(v)) return {};
  const knownBreeds = new Set(Object.keys(CATALOG.cats));
  const out = {};
  for (const [name, f] of Object.entries(v)) {
    if (typeof name !== 'string' || name.length === 0 || name.length > 24) continue;
    if (!isPlainObject(f)) continue;
    out[name] = {
      breed: typeof f.breed === 'string' && knownBreeds.has(f.breed) ? f.breed : 'tabby',
      greets: asFiniteNonNegInt(f.greets, 0),
      lastWalk: typeof f.lastWalk === 'string' ? f.lastWalk : null,
    };
  }
  return out;
}

// A cloud-loaded (or otherwise externally supplied/corrupted) save is
// untrusted input: version acceptance/migration alone isn't enough — a
// payload can claim version 3 while missing or mistyping any field, which
// would otherwise leave `state` in a shape homebase's render() throws on
// (e.g. missing `equipped`/`friends`), and since it's already persisted by
// the time that happens, every subsequent boot crashes too. Every field is
// therefore individually type-checked here and either kept or defaulted —
// never merged in wholesale.
function sanitizeState(parsed) {
  const d = defaultState();
  if (!isPlainObject(parsed)) return d;

  const knownCats = new Set(Object.keys(CATALOG.cats));
  const knownAcc = new Set(Object.keys(CATALOG.accessories));
  const knownAreas = new Set(Object.keys(CATALOG.areas));

  const unlockedCats = asStringArray(parsed.unlocked?.cats).filter((id) => knownCats.has(id));
  const unlockedAcc = asStringArray(parsed.unlocked?.accessories).filter((id) => knownAcc.has(id));
  const unlockedAreas = asStringArray(parsed.unlocked?.areas).filter((id) => knownAreas.has(id));
  // starter unlocks are guaranteed on every fresh save (defaultState) —
  // guarantee them here too so a malformed/truncated payload never leaves
  // the player with zero cats/areas to actually play with.
  for (const id of d.unlocked.cats) if (!unlockedCats.includes(id)) unlockedCats.push(id);
  for (const id of d.unlocked.accessories) if (!unlockedAcc.includes(id)) unlockedAcc.push(id);
  for (const id of d.unlocked.areas) if (!unlockedAreas.includes(id)) unlockedAreas.push(id);

  const equippedCat = typeof parsed.equipped?.cat === 'string' && unlockedCats.includes(parsed.equipped.cat)
    ? parsed.equipped.cat : d.equipped.cat;
  const collar = parsed.equipped?.collar;
  const equippedCollar = typeof collar === 'string' && unlockedAcc.includes(collar) && CATALOG.accessories[collar]?.slot === 'collar'
    ? collar : null;
  // Cat Couture v4: the single `outfit` slot became six cosmetic slots
  // (head/face/neck/body/back/feet) — each is validated the same way collar
  // is above: a value survives only if it's a string, actually unlocked, and
  // its catalog entry's slot matches the slot key it's sitting in.
  const equippedSlots = {};
  for (const slotKey of ['head', 'face', 'neck', 'body', 'back', 'feet']) {
    const v = parsed.equipped?.[slotKey];
    equippedSlots[slotKey] = typeof v === 'string' && unlockedAcc.includes(v) && CATALOG.accessories[v]?.slot === slotKey
      ? v : null;
  }

  const area = typeof parsed.area === 'string' && unlockedAreas.includes(parsed.area) ? parsed.area : d.area;

  const walks = {};
  for (const key of Object.keys(d.walks)) walks[key] = asFiniteNonNegInt(parsed.walks?.[key], 0);

  return {
    version: SAVE_VERSION,
    points: asFiniteNonNeg(parsed.points, 0),
    walks,
    unlocked: { cats: unlockedCats, accessories: unlockedAcc, areas: unlockedAreas },
    equipped: { cat: equippedCat, collar: equippedCollar, ...equippedSlots },
    area,
    lifetimePoints: asFiniteNonNeg(parsed.lifetimePoints, 0),
    bestWalk: asFiniteNonNeg(parsed.bestWalk, 0),
    friends: sanitizeFriends(parsed.friends),
    petName: typeof parsed.petName === 'string' ? parsed.petName.slice(0, 16) : null,
    journal: sanitizeJournal(parsed.journal),
    golden: sanitizeGolden(parsed.golden),
    streak: sanitizeStreak(parsed.streak),
    kitten: sanitizeKitten(parsed.kitten),
    race: sanitizeRace(parsed.race),
    den: sanitizeDen(parsed.den),
    skills: sanitizeSkills(parsed.skills),
    feats: sanitizeFeats(parsed.feats),
    duskWalks: Math.min(DUSK_WALKS_MAX, asFiniteNonNegInt(parsed.duskWalks, 0)),
  };
}

// v3 → v4: the single `outfit` slot became six cosmetic slots. Re-home the
// equipped outfit item into whatever slot its catalog entry now uses, so
// nobody loses the accessory they were wearing. Shared by both the v3 and
// v2 branches below (a v2 save is migrated 2 → 3 → 4 by building the v3
// shape and routing it through this same function, rather than duplicating
// the re-homing logic).
function migrateV3ToV4(parsed) {
  // AUDIT CARVE-OUT: the only permitted live 'outfit' reads in src/ — this
  // migration must read the legacy field by name to re-home old saves.
  const worn = parsed.equipped?.outfit;
  const slot = typeof worn === 'string' ? CATALOG.accessories[worn]?.slot : null;
  const { outfit, ...rest } = parsed.equipped ?? {};
  return sanitizeState({
    ...parsed,
    version: 4,
    equipped: { ...rest, ...(slot ? { [slot]: worn } : {}) },
  });
}

// Shared by createProgression's initial load AND replaceFromPayload below —
// a cloud-loaded (or otherwise externally supplied) save must go through
// the exact same parse/version-migration/sanitize path as a normal boot,
// so there's only one place that knows how to read whisker-walk-save.
function loadState(storage) {
  try {
    const raw = storage.getItem(SAVE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.version === SAVE_VERSION) return sanitizeState(parsed);
      if (parsed && parsed.version === 3) {
        return migrateV3ToV4(parsed);
      }
      if (parsed && parsed.version === 2) {
        return migrateV3ToV4({ ...parsed, version: 3, lifetimePoints: parsed.points, bestWalk: 0, friends: {}, petName: null });
      }
      console.warn('Whisker Walk: incompatible save, starting fresh');
    }
  } catch (err) {
    console.warn('Whisker Walk: could not read save, starting fresh', err);
  }
  return defaultState();
}

export function createProgression(storage) {
  let state = loadState(storage);

  const save = () => {
    try {
      storage.setItem(SAVE_KEY, JSON.stringify(state));
    } catch (err) {
      console.warn('Whisker Walk: could not write save', err);
    }
  };

  const api = {
    get state() {
      return state;
    },
    addPoints(n) {
      state.points += n;
      state.lifetimePoints += n;
      save();
    },
    isUnlocked(kind, id) {
      return state.unlocked[kind].includes(id);
    },
    canBuy(kind, id) {
      const item = CATALOG[kind][id];
      if (!item || api.isUnlocked(kind, id) || state.points < item.price) return false;
      if (item.requires && state.walks[item.requires.area] < item.requires.walks) return false;
      return true;
    },
    buy(kind, id) {
      if (!api.canBuy(kind, id)) return false;
      state.points -= CATALOG[kind][id].price;
      state.unlocked[kind].push(id);
      save();
      return true;
    },
    // buyDenItem(id) → bool — mirrors buy() above but against DEN_ITEMS/
    // state.den.owned instead of CATALOG/state.unlocked: known id, not
    // already owned, enough points. Kept separate from buy() rather than
    // folded into CATALOG/kind because den furniture has no `requires` gate
    // and owned is a flat array, not a per-kind bucket under `unlocked`.
    buyDenItem(id) {
      const item = DEN_ITEMS[id];
      if (!item || state.den.owned.includes(id) || state.points < item.price) return false;
      state.points -= item.price;
      state.den.owned.push(id);
      save();
      return true;
    },
    // placeDenItem(spotId, itemId) → bool — itemId may be null to clear the
    // spot. Validates spotId is a known DEN_SPOTS id and (when not clearing)
    // itemId is a known DEN_ITEMS id the player actually owns. DECISION: a
    // single piece of furniture exists once, so placing an owned item at a
    // spot first removes it from any other spot it currently occupies —
    // there's only one Sunbeam Rug, it can't be in two places in the den at
    // the same time.
    placeDenItem(spotId, itemId) {
      if (!DEN_SPOT_IDS.has(spotId)) return false;
      if (itemId === null) {
        delete state.den.placed[spotId];
        save();
        return true;
      }
      if (typeof itemId !== 'string' || !DEN_ITEMS[itemId] || !state.den.owned.includes(itemId)) return false;
      for (const s of Object.keys(state.den.placed)) {
        if (state.den.placed[s] === itemId) delete state.den.placed[s];
      }
      state.den.placed[spotId] = itemId;
      save();
      return true;
    },
    equipCat(id) {
      if (api.isUnlocked('cats', id)) {
        state.equipped.cat = id;
        save();
      }
    },
    equipAccessory(id) {
      const item = CATALOG.accessories[id];
      if (item && api.isUnlocked('accessories', id)) {
        state.equipped[item.slot] = id;
        save();
      }
    },
    unequip(slot) {
      state.equipped[slot] = null;
      save();
    },
    setArea(id) {
      if (api.isUnlocked('areas', id)) {
        state.area = id;
        save();
      }
    },
    // completeWalk(areaId = state.area) — defaults to the persisted area so
    // every existing call site (which never passed an area) keeps counting
    // whatever area is currently equipped, same as before. main.js's endWalk
    // now passes session.areaId explicitly (Task 7.2 fix): a den walk never
    // persists state.area (areaOverride semantics), so without this the
    // default would silently credit whatever OTHER area was last set via
    // setArea instead of 'den' — inflating that area's walk count (and thus
    // its walks-gated unlocks, e.g. park's "2 walks in neighborhood") every
    // time the freely-repeatable den is visited.
    // v18 Task 1.4: the optional second argument carries per-walk facts worth
    // a lifetime tally. `dusk` is the walk's own duskActive — NOT the raw
    // duskMode the player ticked — because a solo walk only actually turns
    // dusk when the glow collar is equipped, and Night Eyes ("Complete 5 dusk
    // walks") must count walks that were really dark, not walks that were
    // merely requested dark. Defaulted so every pre-v18 call site
    // (completeWalk() / completeWalk(areaId)) keeps behaving exactly as
    // before, incrementing nothing new.
    completeWalk(areaId = state.area, { dusk = false } = {}) {
      state.walks[areaId] += 1;
      if (dusk && state.duskWalks < DUSK_WALKS_MAX) state.duskWalks += 1;
      save();
    },
    // recordGreet(name, breed, walkStamp) — the ONLY place a greet count ever
    // moves. The lastWalk guard below is once-per-cat-per-walk and it is
    // load-bearing: this path persists to a backend whose record_friend_greet
    // validates the caller's identity and nothing else, so the client-side
    // cap is what stops greet farming. v18's Charmer moves the RUNGS a count
    // lands on and has no reach in here — the accrual lines are untouched.
    recordGreet(name, breed, walkStamp) {
      const f = state.friends[name] ?? (state.friends[name] = { breed, greets: 0, lastWalk: null });
      if (f.lastWalk === walkStamp) return null;
      f.lastWalk = walkStamp;
      f.greets += 1;
      save();
      // Named off the shared rung table rather than the literals 1/3/6 this
      // used to carry, so it can never disagree with friendLevel below. Still
      // exact equality, i.e. still "this greet landed exactly on a rung";
      // the in-walk toast does not read this return, it uses straycats.js's
      // friendRungCrossed(before, after), which reports the highest rung a
      // step crossed and so also copes with a mid-ladder Charmer unlock.
      const rungs = friendRungs(hasSkill(state, 'charmer'));
      if (f.greets === rungs.met) return 'met';
      if (f.greets === rungs.friend) return 'friend';
      if (f.greets === rungs.best) return 'best';
      return null;
    },
    // friendLevel(name) → 'none' | 'met' | 'friend' | 'best'. v18 CF-4: this
    // hardcoded the base 1/3/6, so a Charmer player got the "BEST friend 💕"
    // toast at four greets while this — and therefore the home-base roster
    // icon (ui/homebase.js) and the best-friend gift roll (game/walk.js) —
    // still said ♥ for the same cat. It now reads the same rung table the
    // toast does.
    friendLevel(name) {
      const g = state.friends[name]?.greets ?? 0;
      const rungs = friendRungs(hasSkill(state, 'charmer'));
      return g >= rungs.best ? 'best' : g >= rungs.friend ? 'friend' : g >= rungs.met ? 'met' : 'none';
    },
    recordWalkScore(points) {
      if (points > state.bestWalk) {
        state.bestWalk = points;
        save();
        return true;
      }
      return false;
    },
    reset() {
      state = defaultState();
      save();
    },
    setPetName(name) {
      state.petName = name;
      save();
    },
    // recordSighting(type) — increments the journal count for a known
    // critter type; unrecognized types (typos, future-removed types, or a
    // hostile caller) are silently ignored rather than polluting
    // state.journal with keys sanitizeState would strip on next load.
    recordSighting(type) {
      if (!JOURNAL_TYPES.includes(type)) return;
      state.journal[type] = (state.journal[type] ?? 0) + 1;
      save();
    },
    // recordFeat(type) — v18. Bumps the lifetime tally for one discovery
    // type by one. Called from exactly ONE place: pay() in discoveries.js,
    // which is the single funnel every award() / awardOnce() in the game
    // already passes through. Deliberately not scattered across the ~45
    // award call sites — one hook point means a new award type becomes a
    // lifetime counter for free and no call site can forget to tally.
    //
    // Because it rides the discovery events, it inherits their per-walk
    // repeat-award caps (awardOnce is once per key per walk, recordGreet's
    // lastWalk guard is once per cat per walk), so no feat is farmable by
    // holding one key down.
    //
    // Unknown types are ignored rather than stored: state.feats' key
    // vocabulary is exactly AWARDS' keys, so anything else would just be
    // dropped again by sanitizeFeats on the next load.
    recordFeat(type) {
      if (typeof type !== 'string' || !FEAT_TYPES.has(type)) return;
      const cur = asFiniteNonNegInt(state.feats[type], 0);
      if (cur >= FEAT_COUNT_MAX) return;
      state.feats[type] = cur + 1;
      save();
    },
    // recordSkillUnlocks(ids) → array of the ids that were NEWLY added,
    // in catalog order. v18 Task 1.4.
    //
    // This is the only writer of state.skills. Without it the field
    // sanitizes correctly but is never populated, which quietly voids the
    // spec's guarantee that "a later threshold change must never revoke an
    // ability a child already earned" — hasSkill's union would then rest
    // entirely on the live predicate.
    //
    // The RETURN VALUE is the point of the signature: Task 2.7's in-walk
    // unlock celebration needs to know which abilities fired just now, and
    // that is exactly "what this call added", not "what the player has".
    // Calling it twice with the same ids therefore returns [] the second
    // time — the celebration cannot double-fire.
    //
    // `ids` is normally unlockedSkills(state), but it is treated as
    // untrusted anyway (same discipline as sanitizeSkills): non-strings and
    // unknown ids are dropped, order is forced to catalog order rather than
    // caller order so state.skills is stable regardless of who calls, and
    // the result is capped at the catalog length. save() only runs when
    // something actually changed, so a per-walk call on a player who has
    // unlocked nothing new is not a write.
    recordSkillUnlocks(ids) {
      if (!Array.isArray(ids)) return [];
      const wanted = new Set(ids.filter((id) => typeof id === 'string' && KNOWN_SKILL_IDS.has(id)));
      const already = new Set(state.skills);
      const added = SKILL_IDS.filter((id) => wanted.has(id) && !already.has(id));
      if (added.length === 0) return [];
      const merged = SKILL_IDS.filter((id) => already.has(id) || wanted.has(id));
      state.skills = merged.slice(0, KNOWN_SKILL_IDS.size);
      save();
      // A skill dropped by the cap was not actually recorded, so it must not
      // be reported as newly unlocked either (unreachable while the cap is
      // the catalog length, but the two must not be able to disagree).
      const kept = new Set(state.skills);
      return added.filter((id) => kept.has(id));
    },
    // recordGolden(id) → bool — records a newly found golden mouse. Returns
    // false (no-op) for an id that doesn't match GOLD_ID_PATTERN or one
    // already recorded, so callers can gate a "new find" toast on the
    // return value.
    recordGolden(id) {
      if (typeof id !== 'string' || !GOLD_ID_PATTERN.test(id) || state.golden.includes(id)) return false;
      state.golden.push(id);
      save();
      return true;
    },
    // recordStreakWalk(todayStr) → { count, bonus } — todayStr is a
    // YYYY-MM-DD string from the caller's local walk-completion clock.
    // Same day as last recorded walk: streak count unchanged, bonus 0 (no
    // double-dipping same-day walks). Exactly one UTC calendar day after
    // the last recorded date: streak continues, count+1. Anything else
    // (first ever walk, or a gap): streak resets to 1. bonus is
    // min(5*count, 25), awarded only when the day actually changed — the
    // caller is responsible for adding bonus to points so it can show the
    // toast itself rather than this module reaching into addPoints.
    recordStreakWalk(todayStr) {
      const { last, count } = state.streak;
      if (last === todayStr) {
        return { count, bonus: 0 };
      }
      const consecutive = last != null && (ymdToUTCms(todayStr) - ymdToUTCms(last) === 86400000);
      const newCount = consecutive ? count + 1 : 1;
      const bonus = Math.min(5 * newCount, 25);
      state.streak = { last: todayStr, count: newCount };
      save();
      return { count: newCount, bonus };
    },
    // setKittenStage(n) — clamps to 0..3 and is monotonic: a lower/equal
    // stage than the current one is ignored, so a stale or out-of-order
    // call (e.g. two quest branches racing) can never regress growth.
    setKittenStage(n) {
      const v = asFiniteNonNegInt(n, undefined);
      if (v === undefined) return;
      const bounded = Math.min(3, v);
      if (bounded > state.kitten.stage) {
        state.kitten.stage = bounded;
        save();
      }
    },
    // recordRace(dateStr, areaId, ms) → { isBest } — dateStr/areaId identify
    // TODAY's course (race.js's raceCourse derives the actual 5 waypoints
    // from exactly this date+area pair), so a new date OR a new area means a
    // genuinely different course, not a comparison against an old one — the
    // stored best resets outright. Same date+area: keep whichever ms is
    // smaller (faster), same "is this actually better" logic as
    // recordWalkScore's > check, just inverted (lower is better for a timer).
    recordRace(dateStr, areaId, ms) {
      const r = state.race;
      if (r.date === dateStr && r.area === areaId && r.bestMs != null && r.bestMs <= ms) {
        return { isBest: false };
      }
      state.race = { date: dateStr, area: areaId, bestMs: ms };
      save();
      return { isBest: true };
    },
    // replaceFromPayload(rawSaveObject) — used by cloud "Load from cloud":
    // writes the raw object straight to storage under the save key, then
    // reloads live state through the SAME loadState() the constructor uses,
    // so a v2-format cloud payload migrates exactly like a normal v2 save
    // would on next boot instead of needing its own migration logic here.
    replaceFromPayload(rawSaveObject) {
      try {
        storage.setItem(SAVE_KEY, JSON.stringify(rawSaveObject));
      } catch (err) {
        console.warn('Whisker Walk: could not write cloud save', err);
      }
      state = loadState(storage);
    },
  };
  return api;
}
