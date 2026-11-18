// The ONE door to the word tables: which set of words the game is using, and
// the tables of that set.
//
// clanwords.js is a word SET (today the only one, the family's game). No other
// module in src/ may import it: they import this file and ask for the tables
// when they need a word,
//
//   words().RANK_WORDS[rank]        words().PLACE_WORDS.town
//
// so a second set can be added later without touching those modules again.
// test/wordset.test.js fails if any other module imports clanwords.js, and
// proves with a stand-in set that the words on screen follow the set in use.
//
// RULES
//   - Read words() WHEN THE WORD IS NEEDED, inside a function or a getter.
//     Never keep a table, or a word taken from one, in a module-level const:
//     that value would stay behind when the set changes.
//   - The mode is held here and nowhere else. There is no setting for it yet
//     and nothing saves it; it is 'on' unless a test says otherwise.
//   - RANK_KEYS and GROUP_KEY are ids, not words. They are the same in every
//     set, so they are plain exports and may be kept in a const.
//   - A set has every table in TABLES. It may also carry PHRASES: entries for
//     clanphrases.js ids, which then take the place of that file's own.
//   - A set's PREFIXES list has the same length in every set: a save stores
//     its colony's title as a position in that list (progression.js).
//   - A set may also carry what it does DIFFERENTLY, as data (2026-11-18). The
//     'on' set carries none of these, so the family's game is what it was:
//       RULES       switches read with wordRule(): storedNames (a cat is shown
//                   under the name it is stored with, never a composed one),
//                   noStarNames (no top-rank names are offered)
//       RANK_AS     rank id -> the rank id it is shown as, for a set with
//                   fewer ranks (rankShown, rankWord)
//       LINES       guided-walk lines of its own, keyed as tutorialwords.js is
//       BADGE_WORDS a word for each group's badge on the pick cards
//     Code asks these questions of the set; it never asks which set is in use.
//
// A leaf like clanwords.js: it imports that file only, so anything may import
// it without a cycle and without THREE.
import * as on from './clanwords.js';

// Ids for every rank and role: never shown, the same whatever the words are.
export { RANK_KEYS } from './clanwords.js';

// The word the page's own names are built with (button attributes, the "have
// you seen the question" storage key). Never shown to a player, and it does
// NOT follow the mode: a storage key that changed with the words would forget
// what a device has already seen.
export const GROUP_KEY = on.CLAN_SUFFIX.toLowerCase();

// The tables every set must have.
export const TABLES = Object.freeze([
  'PREFIXES', 'CAT_PREFIXES', 'RIVAL_PREFIXES', 'WARRIOR_SUFFIXES', 'RANK_SUFFIX', 'CLAN_SUFFIX',
  'RANK_WORDS', 'OUTSIDE_WORDS', 'PLACE_WORDS', 'DENIED_NAMES', 'HOMAGE_PREFIXES', 'HOME_LINES',
  'CLAN_CAT_PREFIXES',
]);

export const SERIES_ON = 'on';

const SETS = new Map([[SERIES_ON, on]]);
let mode = SERIES_ON;

// Which set is in use: 'on' today.
export function seriesMode() {
  return mode;
}

// Every set this build holds, 'on' first.
export function seriesModes() {
  return [...SETS.keys()];
}

// The tables of the set in use.
export function words() {
  return SETS.get(mode);
}

// Whether the set in use carries this switch (see RULES in the header). A set
// without the table, the 'on' set among them, answers no to everything.
export function wordRule(name) {
  const rules = words().RULES;
  return !!rules && Object.hasOwn(rules, name) && rules[name] === true;
}

// The rank a rank id is SHOWN as. Every set has the same rank ids; a set with
// fewer ranks names the id that stands in for one it does not have.
export function rankShown(key) {
  const as = words().RANK_AS;
  return as && Object.hasOwn(as, key) ? as[key] : key;
}

// The word a player reads for a rank id.
export function rankWord(key) {
  return words().RANK_WORDS[rankShown(key)];
}

const keysOf = (v) => (v && typeof v === 'object' && !(v instanceof Set) ? Object.keys(v) : []);

// Adds a set under `id`. It must be complete: every table, and inside each
// keyed table every key the 'on' set has (a rank with no word would print
// "undefined" on a tag). Throws otherwise, so a half-written set never loads.
export function addWordSet(id, set) {
  if (typeof id !== 'string' || id === '' || SETS.has(id)) throw new Error(`Whisker Walk: word set id "${id}" is empty or taken`);
  if (!set || typeof set !== 'object') throw new Error(`Whisker Walk: word set "${id}" is not a table`);
  for (const name of TABLES) {
    const mine = set[name];
    const theirs = on[name];
    if (mine == null || typeof mine !== typeof theirs || Array.isArray(mine) !== Array.isArray(theirs)) {
      throw new Error(`Whisker Walk: word set "${id}" has no ${name}`);
    }
    if (Array.isArray(theirs)) continue;
    for (const k of keysOf(theirs)) {
      if (!Object.hasOwn(mine, k)) throw new Error(`Whisker Walk: word set "${id}" has no ${name}.${k}`);
      if (Array.isArray(theirs[k]) && !(Array.isArray(mine[k]) && mine[k].length === theirs[k].length)) {
        throw new Error(`Whisker Walk: word set "${id}" has the wrong number of ${name}.${k}`);
      }
    }
  }
  if (set.PREFIXES.length !== on.PREFIXES.length) throw new Error(`Whisker Walk: word set "${id}" has the wrong number of PREFIXES`);
  SETS.set(id, set);
}

// Takes a set out again (a test's stand-in). The 'on' set stays.
export function removeWordSet(id) {
  if (id === SERIES_ON) return;
  if (mode === id) mode = SERIES_ON;
  SETS.delete(id);
}

// Puts a set in use. An id this build does not hold throws.
export function setSeriesMode(id) {
  if (!SETS.has(id)) throw new Error(`Whisker Walk: no word set "${id}"`);
  mode = id;
}

// fn() once for each set this build holds, with that set in use, and the
// answers in seriesModes() order. For reading a save written under other
// words: a stored title is known in every set's spelling. Synchronous only.
export function inEachWordSet(fn) {
  const was = mode;
  try {
    return [...SETS.keys()].map((id) => {
      mode = id;
      return fn(id);
    });
  } finally {
    mode = was;
  }
}
