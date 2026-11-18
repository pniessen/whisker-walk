// The phrases the game writes with, or beside, the words in clanwords.js: one
// lookup, keyed by a stable id.
//
// clanwords.js holds the WORDS (rank words, name halves, the group suffix).
// This file holds the LINES built from them or written in their flavour: a
// fight's toasts, the border and scent-mark prompts, the pick-your-group card,
// the patrol goodbyes, a few landmark labels, the fight moves' names. Before
// 2026-11-16 they were spelled out in about twenty files; a later change of
// vocabulary needs them in one table.
//
// HOW IT IS READ. phrase(id, ...args) is a plain synchronous lookup. An entry
// is a string, or a function of the caller's values that returns one. The
// caller passes finished text (a cat's shown name, a group's name), never an
// id to resolve, so this file imports only wordset.js and can be imported
// from anywhere without a cycle and without THREE. A caller that builds HTML
// escapes exactly as it did before: either the values it hands in, or the
// phrase it gets back.
//
// EDITIONS. Clan Edition ('canon') and Legacy Edition differ in a handful of
// phrases. Those have one entry per edition, with the edition id as the last
// part of the id ('edition.title.canon', 'edition.title.legacy'), and the
// caller that already knows the edition picks one (edition.js does, as it did
// before). Nothing here reads a save.
//
// RULES
//   - An id never changes once it is used: ids are what a second table of
//     words will be keyed by. Ids are our own words: none spells a word from
//     clanwords.js (the scan in test/clanwords.test.js reads this file too).
//   - No borrowed word is typed here either. A phrase that needs one takes it
//     from the word set in use (wordset.js), at the moment it is read.
//   - Every entry is recorded, with its output, in the series-words snapshot
//     (test/serieswords.test.js, "phrases"). Changing an entry's text changes
//     the family's game: see that file's header first.
//   - A function entry reads the word set when it is CALLED, never when this
//     module loads, so nothing here is fixed at start-up.
//   - A word set may carry its own PHRASES, keyed by these ids (wordset.js).
//     phrase() uses the set's entry where it has one and this table's
//     otherwise. The 'on' set has none, so today every line is this table's.
import { words } from './wordset.js';

const suffix = () => words().CLAN_SUFFIX;
const groupWord = () => suffix().toLowerCase();

const TABLE = Object.freeze({
  // ---- the pieces a group's name and a cat's tag are built from -------------
  // prefix -> the group's name (Moss -> MossClan)
  'group.name': (prefix) => prefix + suffix(),
  // the second line of a tag: "<rank word> of <group>"
  'tag.rankOfGroup': (rankWord, group) => `${rankWord} of ${group}`,
  // what follows a cat's name when it is not in the colony: " the <word>"
  'outside.the': (word) => ` the ${word}`,
  // a friendly cat that has just turned cross
  'outside.crossNow': (word) => ` a ${word} now!`,

  // ---- editions --------------------------------------------------------------
  'edition.title.canon': () => `${suffix()} Edition`,
  'edition.title.legacy': 'Legacy Edition',
  'edition.game': (editionTitle) => `Whisker Walk 2: ${editionTitle}`,
  'edition.note': () => `Switching renames the places and shows or hides the ${groupWord()} territories. Nothing is lost.`,
  'prize.warpaint.canon': () => `${suffix()} War Paint`,
  'prize.warpaint.legacy': 'War Paint',

  // ---- picking a home group --------------------------------------------------
  'pick.heading': () => `Pick your ${groupWord()}`,
  'pick.headingMine': (group) => `Your ${groupWord()}: ${group}`,
  'pick.campSoon': 'camp coming soon',
  'pick.territorySoon': 'territory coming soon',
  'pick.both': (group) => `You're both ${group}!`,
  'pick.lineBoth': (group) => ` — you’re both ${group}!`,
  'pick.momentTitle': () => `The ${groupWord()}s have noticed you!`,
  'pick.momentAsk': () => `Which ${groupWord()} will you join?`,
  'pick.changeTitle': () => `Change your ${groupWord()}?`,
  'pick.changeAsk': () => `Tap a ${groupWord()} to join it.`,
  'pick.keep': () => `Keep my ${groupWord()}`,
  'pick.choose': () => `Choose your ${groupWord()} ›`,
  'home.welcome': (group) => `Home to ${group}'s land 🏡`,
  'colony.allies': 'allies',
  'map.camp': (group) => `${group} camp`,
  // the line under today's place when it is a group's territory
  'place.groupLand': (group) => `${group} land`,

  // ---- the star name ---------------------------------------------------------
  'star.pick': 'Or pick a star name',

  // ---- a group cat on a walk -------------------------------------------------
  'patrol.prompt': (name) => `E — patrol with ${name}`,
  'patrol.start': (name) => `${name} walks the border with you 🐾`,
  'patrol.endGood': (name) => `${name} heads back to camp. Good patrol!`,
  'patrol.endShort': (name) => `${name} heads back to camp. A longer patrol next time!`,
  'patrol.award': (name) => `a patrol with ${name}`,

  // ---- a town cat that wanders in --------------------------------------------
  'house.arrival': (name, houseWord, town) => `${name} the ${houseWord} has wandered in from ${town} 🔔`,
  'house.joined': (name, town) => `${name} left ${town} to join you! She'll be waiting in the den 🏠`,

  // ---- borders and scent marks -----------------------------------------------
  'border.chasedBack': (who) => `${who} chased you back over their border! 🐾`,
  'cross.leading': (name, place) => `${name} is leading the way to ${place}! 🧭`,
  'mark.promptScratch': 'E — scratch your mark into it',
  'mark.promptScent': 'E — scent over their mark',
  'mark.buddyToo': (name) => `${name} marks it too 🐾`,
  'mark.scentedOver': (group) => `${group} scented over your mark! 🐾`,
  'mark.scentedOverRetake': (group) => `${group} scented over your mark! Scratch it again to take it back. 🐾`,

  // ---- fights ----------------------------------------------------------------
  // the pill: "<name> of <group> <ask>", then the two buttons
  'fight.challenge': (name, group, ask) => `${name} of ${group} ${ask}`,
  'fight.homeAsk': 'is on your land!',
  'fight.homeOff': 'Back off',
  'fight.borderAsk': 'blocks your path!',
  'fight.borderOff': 'Run',
  // at home, against an intruder
  'fight.homeAward': (name) => `You chased off ${name}! 🛡️`,
  'fight.homeWon': (name, group) => `${name} ran back to ${group}'s land! 🏃`,
  'fight.homeLostScar': (name) => `${name} shook it off and walked on. That scratch will heal in a few walks!`,
  'fight.homeLost': (name) => `${name} shook it off and walked on. Try again soon!`,
  'fight.homeTogether': (petName, name) => `You and ${petName} chased ${name} off together! 🏃`,
  // at another group's border, against its patrol
  'fight.borderAward': (name) => `You faced down ${name}! 🛡️`,
  'fight.borderWon': (name) => `${name} lets you pass. 🐾`,
  'fight.borderLostScar': (name) => `${name} won this time. That scratch will heal in a few walks!`,
  'fight.borderLost': (name) => `${name} won this time. Try again soon!`,
  // a co-walker got there first
  'fight.alreadyFacing': (petName, name) => `${petName} is already facing ${name}!`,
  'journal.chasedOff': 'Intruders chased off',

  // ---- the special fight moves: the name, and the short name on a button -----
  'move.rearUpSwat.name': 'Rear-up Swat',
  'move.rearUpSwat.short': 'Swat',
  'move.leapScratch.name': 'Leap and Scratch',
  'move.leapScratch.short': 'Leap',
  'move.pin.name': 'Pin',
  'move.pin.short': 'Pin',
  'move.rollingTumble.name': 'Rolling Tumble',
  'move.rollingTumble.short': 'Tumble',

  // ---- landmark labels -------------------------------------------------------
  'landmark.woods.oak': 'the great oak',
  'landmark.woods.oakLookout': 'great oak lookout',
  'landmark.woods.oakSquirrels': 'two squirrels racing up the great oak',
  'landmark.river.warmRocks': 'sun-warmed rocks',
  'landmark.river.warmPebble': 'a sun-warmed pebble on the low rock',
  'landmark.island.ring': 'the meeting ring under the old ash',
  'landmark.island.stoneFind': 'a bright beetle wing on a meeting stone',
});

// ---- lines added on 2026-11-18, for a set that says them differently ---------
// With the family's words each of these says exactly what its caller wrote
// before (or nothing at all), so nothing moved on screen. They are a table of
// their own because PHRASE_IDS is the list the first snapshot recorded
// (series-words-on.json, "phrases") and that fixture is not re-recorded;
// these are recorded in series-words-on-later.json instead
// (test/serieswords.off.test.js). Same rules as above.
const LATER = Object.freeze({
  // what follows a cat's name on its Colony card: the rank words as they are
  'colony.rankAfterName': (rankWords) => rankWords,
  // a pick card's line for the group's badge, for a set that has badge words
  'pick.badge': (badgeWord) => `badge: ${badgeWord}`,
});

// Every id of the first table, in table order.
export const PHRASE_IDS = Object.freeze(Object.keys(TABLE));
// Every id added later, in table order.
export const LATER_PHRASE_IDS = Object.freeze(Object.keys(LATER));

export function hasPhrase(id) {
  return typeof id === 'string' && (Object.hasOwn(TABLE, id) || Object.hasOwn(LATER, id));
}

// phrase(id, ...args) → the text. An unknown id throws: every id is a literal
// in src/, and test/clanphrases.test.js checks each one against the table, so
// this is a typo caught by the tests, never something a walk can reach.
export function phrase(id, ...args) {
  if (!hasPhrase(id)) throw new Error(`Whisker Walk: no phrase "${id}"`);
  const own = words().PHRASES;
  const entry = own && Object.hasOwn(own, id) ? own[id] : Object.hasOwn(TABLE, id) ? TABLE[id] : LATER[id];
  return typeof entry === 'function' ? entry(...args) : entry;
}
