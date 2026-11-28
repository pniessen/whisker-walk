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
//     'on' set carries none of these (except EMBLEMS, below), so the family's
//     game is what it was:
//       RULES       switches read with wordRule(): storedNames (a cat is shown
//                   under the name it is stored with, never a composed one),
//                   noStarNames (no top-rank names are offered), stoneSeat
//                   (the camps' leader sits on the High Stone, world/camp.js)
//       RANK_AS     rank id -> the rank id it is shown as, for a set with
//                   fewer ranks (rankShown, rankWord)
//       LINES       guided-walk lines of its own, keyed as tutorialwords.js is
//       BADGE_WORDS a word for each group's badge on the pick cards
//     EMBLEMS is its own kind: an optional table any set may carry (territory
//     id -> a whole <svg> string, the group's badge). Both the family's set and
//     the everyday set carry one; a set without it shows no emblem.
//     Code asks these questions of the set; it never asks which set is in use.
//
// A leaf like clanwords.js: it imports that file only, so anything may import
// it without a cycle and without THREE.
import * as on from './clanwords.js';
import { SET_SHAPE, shapeProblem, SERIES_ON } from './wordids.js';

// Ids for every rank and role, the group key and the set ids: never shown, the
// same whatever the words are (wordids.js).
export { RANK_KEYS, GROUP_KEY, SERIES_ON, SERIES_OFF } from './wordids.js';

// The tables every set must have (the shape is wordids.js SET_SHAPE).
export const TABLES = Object.freeze(Object.keys(SET_SHAPE));

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

// Adds a set under `id`. It must be complete: every table, and inside each
// keyed table every key the shape lists (a rank with no word would print
// "undefined" on a tag). Throws otherwise, so a half-written set never loads.
export function addWordSet(id, set) {
  if (typeof id !== 'string' || id === '' || SETS.has(id)) throw new Error(`Whisker Walk: word set id "${id}" is empty or taken`);
  const problem = shapeProblem(set);
  if (problem) throw new Error(`Whisker Walk: word set "${id}" has ${problem}`);
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
