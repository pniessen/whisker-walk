// The clan name and rank of a cat, DERIVED from the name it already has.
//
// Nothing in this file is ever stored, sent or merged (spec §6.2, §8.4). A
// cat's stored name never changes: isStrayName() gates every cloud-supplied
// name, colony_cats' primary key is (colony_id, name), and breed is re-derived
// from the name at render. And mergeColony returns the REMOTE cat object for
// any cat both devices hold, so a clan name written onto the cat would be
// discarded at the next sync. So the clan name is a pure display layer: the
// same stored name (and the same taming progress) gives the same clan name on
// both children's devices, with no wire traffic and no SQL. SAVE_VERSION is
// untouched.
//
// Rank is a label, never a score: nothing here feeds points, goals or AWARDS.
// The player's points ladder is progression.js's rankFor; this file's
// clanRankFor is a different thing and the two must never be merged.
//
// Pure logic: it imports vocabulary (clanwords.js), the pet-name check
// (validPetName from net.js, which imports only chat.js), the hash (rng.js)
// and the known-name gate and kit names (straynames.js, which imports
// nothing). None of those imports this file, so there is no cycle. No DOM, no
// THREE.
// It does NOT import colony.js, so TAME_FEEDS is mirrored below and pinned by
// a test rather than imported.
import { PREFIXES, CAT_PREFIXES, WARRIOR_SUFFIXES, RANK_SUFFIX, CLAN_SUFFIX, DENIED_NAMES, RANK_KEYS } from './clanwords.js';
import { validPetName } from './net.js';
import { seedFromCode } from './rng.js';
import { isStrayName, KIT_NAMES } from './straynames.js';

// A bar this full is a warrior; this much is an apprentice. The rank is read
// off the taming bar (`have`), so a cat you already know, which starts with a
// head start of up to 3, is never a kit. WARRIOR_AT mirrors colony.js
// TAME_FEEDS (the test pins them together).
const WARRIOR_AT = 6;
const APPRENTICE_AT = 2;

// A cat's PREFIX comes from CAT_PREFIXES (clanwords.js): one hand-fixed,
// unique word for each of the 60 stored names (48 strays and 12 kits), so no
// two cats share a name at any rank. The hash cannot guarantee that; a pure
// function of ONE name cannot see the others, and 22 PREFIXES words cannot
// cover 60 names. The hash is still used for two things: the warrior SUFFIX
// (the 14 WARRIOR_SUFFIXES, drawn from a different slice of the hash), and the
// prefix of any string that is NOT a stored name (clanTitleFor seeds it with a
// player id). SALT is the fixed mixing constant for both; the tests pin that
// the 60 warrior names stay distinct, so if the suffix pool is ever resized
// that test fails and this number is searched for again. It is a parameter of
// the hash, not a table.
const SALT = 27;

const hashOf = (name) => seedFromCode(`${name}|${SALT}`);

// The first half of a cat's clan name; null for anything that is not a
// non-empty string (never throws: seedFromCode itself would on a non-string).
// A stored name reads its own CAT_PREFIXES entry (an own-property read, so
// '__proto__' is not a cat); any other string hashes over PREFIXES.
export function prefixFor(storedName) {
  if (typeof storedName !== 'string' || storedName === '') return null;
  if (Object.hasOwn(CAT_PREFIXES, storedName)) return CAT_PREFIXES[storedName];
  return PREFIXES[hashOf(storedName) % PREFIXES.length];
}

// The second half once a cat is a warrior. A different slice of the hash than
// the prefix (denMoment's seed / seed >>> 8 idiom), so the two are not tied.
export function warriorSuffixFor(storedName) {
  const seed = hashOf(typeof storedName === 'string' ? storedName : '');
  return WARRIOR_SUFFIXES[(seed >>> 8) % WARRIOR_SUFFIXES.length];
}

// kit -> apprentice -> warrior along the taming bar. A malformed progress
// object reads as a kit.
export function clanRankFor(progress) {
  if (progress && progress.tamed === true) return RANK_KEYS.warrior;
  const have = progress && Number.isFinite(progress.have) ? progress.have : 0;
  if (have >= WARRIOR_AT) return RANK_KEYS.warrior;
  if (have >= APPRENTICE_AT) return RANK_KEYS.apprentice;
  return RANK_KEYS.kit;
}

// The rank of a cat IN colony.cats. Spec §6.5: a kit that is fed becomes an
// apprentice, and a KIT_NAMES cat is only ever in colony.cats because it was
// fed, so its rank floors at apprentice. Display only. An unfed kit in the
// den is not a colony cat and keeps clanRankFor's plain reading.
const KIT_SET = new Set(KIT_NAMES);
export function colonyRankFor(storedName, progress) {
  const rank = clanRankFor(progress);
  return rank === RANK_KEYS.kit && KIT_SET.has(storedName) ? RANK_KEYS.apprentice : rank;
}

// What to show instead of the stored name. The prefix is the cat's for life;
// only the suffix changes as it rises. A name that is not a known cat is
// returned unchanged so a cat never becomes nameless (a non-string has
// nothing to return, nor is an empty one, so those get a plain word). `rank`
// defaults to the bar's reading; the Colony tab passes colonyRankFor's.
export function clanNameOf(storedName, progress, rank = clanRankFor(progress)) {
  if (typeof storedName !== 'string' || storedName === '') return 'Cat';
  if (!isStrayName(storedName)) return storedName;
  const suffix = rank === RANK_KEYS.warrior ? warriorSuffixFor(storedName) : RANK_SUFFIX[rank];
  return prefixFor(storedName) + suffix;
}

// The title of a player's clan, from a seed (e.g. a player code): MossClan.
export function clanTitleFor(seed) {
  // An unusable seed still gets a real title, never "nullClan".
  return (prefixFor(seed) ?? PREFIXES[0]) + CLAN_SUFFIX;
}

// The names a player may pick for their OWN cat: prefix + the top-rank suffix
// (Mossstar). The chosen name is stored as the plain pet name, so nothing new
// is saved or sent (spec §6.1). Closed pool only: no free text is offered.
// Deterministic: the walk starts at a seed-derived offset and steps through
// PREFIXES in order, skipping anything that would not be a usable pet name or
// is a published character name, until n are found or the pool runs out.
// A non-string seed is treated as '' (seedFromCode throws on non-strings).
export function candidateStarNames(seed, n = 3) {
  const start = seedFromCode(typeof seed === 'string' ? seed : '') % PREFIXES.length;
  const want = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  const out = [];
  for (let i = 0; i < PREFIXES.length && out.length < want; i++) {
    const name = PREFIXES[(start + i) % PREFIXES.length] + RANK_SUFFIX.leader;
    if (validPetName(name) && !DENIED_NAMES.has(name)) out.push(name);
  }
  return out;
}
