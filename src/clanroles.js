// What a cat DOES in the den, and the two appointed positions: DERIVED, never
// stored.
//
// A role is derived from the stored name for the same reason breed is: so both
// children's devices agree with no wire message (spec §6.4). mergeColony keeps
// the remote cat object for any cat both devices hold, so anything written onto
// a cat would be discarded at the next sync; a pure function of the name (and,
// for the deputy, of the shared feed list) cannot drift. Nothing here is
// stored, sent or merged, and SAVE_VERSION is untouched.
//
// Rank (kit/apprentice/warrior, clannames.js) is where a cat sits on the taming
// ladder; a ROLE is what it does in the den. Neither is ever a score, a goal,
// an AWARDS entry or a permission: they are labels.
//
// A leaf module: clanwords.js (vocabulary keys), rng.js (the hash) and
// straynames.js (the known-name gate), nothing else. It does NOT import
// colony.js, which imports net.js; the walk-stamp parse is mirrored below and
// pinned against colony.js's tamedCats() ordering by a test. Pure: no DOM, no
// THREE, and never walkRng/Math.random, so it draws nothing from the walk's
// random stream. Every export is total: hostile input yields the plain answer
// (warrior / null), never a throw.
import { RANK_KEYS } from './clanwords.js';
import { seedFromCode } from './rng.js';
import { isStrayName, CAT_NAMES, KIT_NAMES } from './straynames.js';

// Mirrors colony.js WALK_STAMP / walkMs (neither is exported). An unparseable
// stamp reads as 0 there; here a feed with one is IGNORED instead, because a
// bogus stamp must not be able to make a cat deputy by sorting first.
const WALK_STAMP = /^walk-\d{1,16}$/;
const stampMs = (stamp) => (typeof stamp === 'string' && WALK_STAMP.test(stamp) ? Number(stamp.slice(5)) : null);
const byNameStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// Bands over 16 slots: 2 elder, 2 queen, 12 warrior of the hash. Over the 48
// shipped names that is a handful of elders and queens among mostly warriors:
// "a sensible mix rather than six elders". Queens stay single-digit because
// each one later takes 1-3 kits from a 12-name pool that two queens never share.
const ROLE_SLOTS = 16;
const ELDER_BELOW = 2;
const QUEEN_BELOW = 4;

export function roleFor(storedName) {
  // seedFromCode throws on a non-string, and an unknown name has no role to
  // derive, so anything that is not a known cat is the plain warrior.
  if (!isStrayName(storedName)) return RANK_KEYS.warrior;
  // Salted ('|role') so a role is not correlated with isShy (hash % 4 of the
  // bare name), clannames' '|27' salt or denMoment's '|ymd' salt. strayBreed
  // uses its own unrelated hash.
  const slot = seedFromCode(`${storedName}|role`) % ROLE_SLOTS;
  if (slot < ELDER_BELOW) return RANK_KEYS.elder;
  if (slot < QUEEN_BELOW) return RANK_KEYS.queen;
  return RANK_KEYS.warrior;
}

// Medicine-eligible roles: warrior and elder. An elder is the classic healer,
// and a warrior is the common case so any colony has a candidate; a queen is
// excluded because she is busy raising kits. Eligibility only picks WHO; the
// chosen cat is still shown with its normal role elsewhere.
const MEDICINE_ELIGIBLE = new Set([RANK_KEYS.warrior, RANK_KEYS.elder]);

// A selection, not a predicate, in TAMING order (spec §6.4: the lowest-sorting
// tamed cat whose derived trait is eligible, with tamedCats()'s
// walkMs(tamedWalk) || byName ordering): take the first eligible cat by
// tamedWalk stamp, ties by name. A newly tamed cat has a later tamedWalk, so
// adding a cat never displaces the incumbent. An entry with no or unparseable
// tamedWalk sorts as stamp 0, exactly as in tamedCats(), so `{ name }` alone
// falls back to name order and the function stays total. Tamed cats are never
// trimmed, so the list can exceed 24; nothing here depends on its length.
export function pickMedicineCat(tamed) {
  return medicineOrder(tamed)[0] ?? null;
}

// Every medicine-eligible cat in `tamed`, in the order pickMedicineCat ranks
// them (its first entry is the pick). progression uses the order to tell
// whether a new pick is strictly earlier than a stored verdict.
export function medicineOrder(tamed) {
  if (!Array.isArray(tamed)) return [];
  const cats = [];
  for (const c of tamed) {
    if (c && isStrayName(c.name)) cats.push({ name: c.name, ms: stampMs(c.tamedWalk) ?? 0 });
  }
  cats.sort((a, b) => a.ms - b.ms || byNameStr(a.name, b.name));
  return cats.filter((c) => MEDICINE_ELIGIBLE.has(roleFor(c.name))).map((c) => c.name);
}

// The deputy is the cat that BECAME fed-by-two-different-players earliest:
// the one appointed position neither child can earn alone. mergeColony puts
// remote feeds first and local-only ones after, so the list order differs per
// device; arrival order is therefore never used. Valid feeds (known cat, string
// feeder, parseable walk stamp) are copied and sorted by stamp then cat then
// feeder, then walked once: a cat's completion stamp is the stamp of the first
// feed by a feeder different from its earliest feeder. Cats are ordered by that
// stamp, ties by name.
export function pickDeputy(feeds) {
  return deputyOrder(feeds)[0] ?? null;
}

// Every cat fed by two different players, in the order pickDeputy ranks them
// (completion stamp, ties by name; its first entry is the pick).
export function deputyOrder(feeds) {
  if (!Array.isArray(feeds)) return [];
  const valid = [];
  for (const f of feeds) {
    if (!f || !isStrayName(f.cat) || typeof f.by !== 'string' || f.by === '') continue;
    const ms = stampMs(f.walk);
    if (ms === null) continue;
    valid.push({ cat: f.cat, by: f.by, ms });
  }
  valid.sort((a, b) => a.ms - b.ms || byNameStr(a.cat, b.cat) || byNameStr(a.by, b.by));
  const firstBy = new Map();
  const done = new Map();
  for (const f of valid) {
    if (done.has(f.cat)) continue;
    if (!firstBy.has(f.cat)) firstBy.set(f.cat, f.by);
    else if (firstBy.get(f.cat) !== f.by) done.set(f.cat, f.ms);
  }
  return [...done].sort((a, b) => a[1] - b[1] || byNameStr(a[0], b[0])).map(([cat]) => cat);
}

// ---- A queen's kits ---------------------------------------------------------
//
// A queen has one to three kits drawn from the 12 KIT_NAMES. They are DERIVED
// (never stored) and sit beside her in the den; they take no DEN_HOMES entry,
// have no colony_cats row and count nothing toward COLONY_MAX (spec §6.5).
// Both devices agree because everything below is a pure function of names and
// of the colony's taming order.

const KIT_MAX = 3;
// One fixed salt. The colony id is null while solo and changes at pairing, so
// it can be neither present nor stable; salting with it would reshuffle every
// queen's kits at the moment two sisters pair.
const KIT_SALT = 'den';
const CAT_NAME_SET = new Set(CAT_NAMES);

// kitsFor(queenName, salt, taken?) -> string[]: this queen's own preferred
// kits, walking KIT_NAMES from a per-queen hash offset and skipping any name in
// `taken`. Called alone (no `taken`) it is her preference in isolation; the
// colony-wide, collision-free answer comes from placedKits, which threads
// `taken` through every queen in taming order.
//
// [] for anything that is not a shipped queen. Only CAT_NAMES qualify: a fed
// kit is also a known name and can hash to the queen role, and she would
// otherwise be handed her own siblings.
export function kitsFor(queenName, salt, taken = new Set()) {
  if (typeof queenName !== 'string' || !CAT_NAME_SET.has(queenName)) return [];
  if (roleFor(queenName) !== RANK_KEYS.queen) return [];
  const h = seedFromCode(`${queenName}|litter|${typeof salt === 'string' ? salt : ''}`);
  const want = 1 + (h % KIT_MAX);
  const start = (h >>> 3) % KIT_NAMES.length;
  const out = [];
  for (let i = 0; i < KIT_NAMES.length && out.length < want; i++) {
    const name = KIT_NAMES[(start + i) % KIT_NAMES.length];
    if (!taken.has(name)) out.push(name);
  }
  return out;
}

// placedKits(residents, colonyCats) -> [{ queen, kits, home }]
//
// `residents` is colony.js's denResidents() output ([{ cat, home }] in taming
// order, already cut off at the last den home, so a queen with no home never
// appears); `colonyCats` is colony.cats. Taking plain arrays keeps this module
// from importing colony.js (and through it net.js).
//
// Allocation is joint and ordered: each queen, earliest tamed first, takes her
// preferred kits that no earlier queen holds. Disjointness across the whole
// colony is therefore by construction, and an earlier queen's kits can never
// change when a later queen is tamed.
//
// A kit that has been fed is an ordinary colony cat now (it is in colonyCats by
// name), so it stops being a kit. It is removed AFTER allocation, not treated
// as taken during it: skipping it in the walk would pull a different name into
// its mother's list and could shift later queens' kits. Removing it afterwards
// shrinks only its mother's list.
export function placedKits(residents, colonyCats) {
  if (!Array.isArray(residents)) return [];
  const fed = new Set();
  if (Array.isArray(colonyCats)) {
    for (const c of colonyCats) if (c && typeof c.name === 'string') fed.add(c.name);
  }
  const taken = new Set();
  const out = [];
  for (const r of residents) {
    const queen = r && r.cat && r.cat.name;
    if (!r || !r.home) continue;
    const mine = kitsFor(queen, KIT_SALT, taken);
    for (const k of mine) taken.add(k);
    const kits = mine.filter((k) => !fed.has(k));
    if (kits.length > 0) out.push({ queen, kits, home: r.home });
  }
  return out;
}
