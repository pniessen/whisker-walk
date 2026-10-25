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
import { isStrayName } from './straynames.js';

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

// A selection, not a predicate: sort by name and take the first eligible, so
// adding a later cat can only displace the incumbent if it sorts BEFORE it, and
// never reshuffles the rest. Tamed cats are never trimmed, so the list can
// exceed 24; nothing here depends on its length.
export function pickMedicineCat(tamed) {
  if (!Array.isArray(tamed)) return null;
  const names = [];
  for (const c of tamed) {
    if (c && isStrayName(c.name)) names.push(c.name);
  }
  names.sort(byNameStr);
  for (const n of names) {
    if (MEDICINE_ELIGIBLE.has(roleFor(n))) return n;
  }
  return null;
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
  if (!Array.isArray(feeds)) return null;
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
  let best = null;
  for (const [cat, ms] of done) {
    if (best === null || ms < best.ms || (ms === best.ms && byNameStr(cat, best.cat) < 0)) best = { cat, ms };
  }
  return best === null ? null : best.cat;
}
