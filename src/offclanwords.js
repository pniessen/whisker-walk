// The everyday word set ('off'): the same game said in plain words, with
// nothing taken from a book series. Picked by the older playtester on
// 2026-11-18 (the group word, the group names, the ranks, the outside cats,
// the doing words, the places and the badges); the rest are the builder's
// picks in the same register, each marked "builder's pick" below, for the
// owner to check.
//
// This file is a word SET, like clanwords.js: the tables every set has
// (wordset.js TABLES), plus what this set does differently, carried as data
// (RULES, RANK_AS, LINES, BADGE_WORDS, PHRASES; see wordset.js), and its own
// drawings for EMBLEMS, a table every set may carry. No module
// asks "is the set 'off'?": they ask the set in use for a table or a rule.
//
// NOT IN USE YET. Nothing in src/ imports this file and no build holds the
// set: the game is the family's ('on') for everyone until the switch is built
// (phase 3 adds it to wordset.js and decides who may turn it). The tests put
// it in use through test/helpers/offwords.js.
//
// What a reader of this set never sees: a name that changes with rank, a
// name made of two halves, a top-rank name to pick, a label on the player's
// own cat, a second-in-command, a mother rank.
import { CAT_NAMES, KIT_NAMES, LEGENDARY_NAMES } from './straynames.js';
import { phrase } from './clanphrases.js';
import { RANK_KEYS } from './wordset.js';

export const OFF_ID = 'off';

// ---- groups -------------------------------------------------------------------

// The word for a group. A group's name is two words, "Forest Crew" (PHRASES
// 'group.name' below), never one word joined to an ending.
export const CLAN_SUFFIX = 'Crew';

// The five territory groups, by territory id (her picks).
export const HOMAGE_PREFIXES = Object.freeze({
  woods: 'Forest', moor: 'Moor', river: 'River', pines: 'Pines', gorge: 'Gorge',
});

// The four street groups, by walk area (her picks).
export const RIVAL_PREFIXES = Object.freeze({
  neighborhood: 'Garden', park: 'Park', seaside: 'Beach', docks: 'Dock',
});

// The title of a player's own group before a home is picked: one of these and
// the group word ("Sunbeam Crew"). Builder's picks, all 22. A save keeps a
// POSITION in this list, so it has exactly as many words as the family's
// list, and a word is never moved or removed once a build has shipped it.
// None is a word of the family's list, a stored cat's name, or a group above.
export const PREFIXES = Object.freeze([
  'Sunbeam', 'Moonbeam', 'Raindrop', 'Snowflake', 'Rainbow', 'Treetop', 'Hilltop', 'Orchard',
  'Wildflower', 'Sunflower', 'Buttercup', 'Blackberry', 'Mushroom', 'Seashell', 'Ladybug', 'Firefly',
  'Dragonfly', 'Tadpole', 'Chipmunk', 'Hedgehog', 'Honeybee', 'Driftwood',
]);

// One plain line per group for the pick cards: the land, not what is hunted
// there. Builder's picks.
export const HOME_LINES = Object.freeze({
  woods: 'oak woods, ferns and sunny clearings',
  moor: 'open heather, big skies and wind',
  river: 'reeds, the riverbank and the pond',
  pines: 'tall pines and the swamp',
  gorge: 'rocks, cliff dens and tall pines',
});

// The badge on each group's pick card (her picks). A pick card says the word
// as the name of the drawing below (EMBLEMS); a card with no drawing says it
// in a line of text.
export const BADGE_WORDS = Object.freeze({
  woods: 'oak leaf', moor: 'heather sprig', river: 'reed', pines: 'pine cone', gorge: 'crag',
});

// The drawing of each badge (her words, the family's group colours, cream
// #f1e0c2 for the details): whole <svg> strings in the same form as the
// family's (clanwords.js EMBLEMS), drawn on the cream badge circle at 22 px.
// Cream details sit on a group-colour shape, so they read on the cream.
//   woods  oak leaf: three round lobes a side, a short curved cream midrib inside the
//          leaf (clear of its edge and of the stem), a short stem, tilted 30°
//   moor   heather sprig: a gently curved stem, four big bells along one side, apart
//   river  reed: two tall blades and a bulrush head on its own stem
//   pines  pine cone: an egg-shaped cone, three rows of cream scales, a stub of stem
//   gorge  crag: a jagged rock with two peaks and a cream crack, no flat top
const SVG = (inner) => `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">${inner}</svg>`;
export const EMBLEMS = Object.freeze({
  woods: SVG('<g transform="rotate(30 12 12) translate(12 12) scale(1.15) translate(-12 -11.6)"><path fill="#2f5a33" d="M10.3 5C9.7 1.4 14.3 1.4 13.7 5C17.04 3.8 17.04 8.24 14.3 8.6C18.3 7.4 18.3 12.04 14.4 12.4C17.32 11.4 17.32 16.3 12.7 16.6H11.3C6.68 16.3 6.68 11.4 9.6 12.4C5.7 12.04 5.7 7.4 9.7 8.6C6.96 8.24 6.96 3.8 10.3 5z"/><path fill="none" stroke="#f1e0c2" stroke-width="1.2" stroke-linecap="round" d="M12.7 6.8Q10.7 10.4 12 14"/><path fill="none" stroke="#2f5a33" stroke-width="1.6" stroke-linecap="round" d="M12 16.2q.2 2.4-1 4.4"/></g>'),
  moor: SVG('<path fill="none" stroke="#5c3f68" stroke-width="2.1" stroke-linecap="round" d="M8 22.5C8 15 12 8.5 21 5.5"/><g fill="#5c3f68"><circle cx="5.6" cy="19.3" r="2.35"/><circle cx="7.9" cy="12.6" r="2.3"/><circle cx="12.5" cy="7.1" r="2.2"/><circle cx="18.5" cy="3.7" r="2.1"/></g>'),
  river: SVG('<g fill="#24516b"><path d="M10.4 22C9.5 15 7.5 9 4 3.5C8.8 8.3 11.8 14.5 13 22z"/><path d="M13.2 22C14 16 16.3 10.5 20.3 6C18.4 11 16.6 16 15.8 22z"/><rect x="9.8" y="5.5" width="4.4" height="9.5" rx="2.2"/></g><path fill="none" stroke="#24516b" stroke-width="1.5" stroke-linecap="round" d="M12 22V2.5"/>'),
  pines: SVG('<path fill="#353d68" d="M12 4.5C16.5 4.5 18.5 8.5 18 12.5C17.5 17 14.5 21.5 12 21.5S6.5 17 6 12.5C5.5 8.5 7.5 4.5 12 4.5z"/><rect x="11" y="1.8" width="2" height="3.5" rx=".6" fill="#353d68"/><path fill="none" stroke="#f1e0c2" stroke-width="1.2" stroke-linecap="round" d="M7.5 8.5a1.5 1.5 0 0 0 3 0a1.5 1.5 0 0 0 3 0a1.5 1.5 0 0 0 3 0M7 12.5a1.25 1.25 0 0 0 2.5 0a1.25 1.25 0 0 0 2.5 0a1.25 1.25 0 0 0 2.5 0a1.25 1.25 0 0 0 2.5 0M8.1 16a1.3 1.3 0 0 0 2.6 0a1.3 1.3 0 0 0 2.6 0a1.3 1.3 0 0 0 2.6 0"/>'),
  gorge: SVG('<polygon fill="#6b4128" points="2.5,20.5 5.5,14 8,12.5 10,4 13,10.5 16.5,5.5 19,12 18,13.5 21.5,20.5"/><path fill="none" stroke="#f1e0c2" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" d="M13 11.2l-1.3 3 1.8 2.1-1 2"/>'),
});

// ---- cats' names ----------------------------------------------------------------

// A cat is shown under the name it is stored with, at every rank: Pickles is
// Pickles. So each stored name "maps" to itself, and there are no endings.
export const CAT_PREFIXES = Object.freeze(Object.fromEntries(
  [...CAT_NAMES, ...KIT_NAMES, ...LEGENDARY_NAMES].map((name) => [name, name]),
));
export const WARRIOR_SUFFIXES = Object.freeze(['']);
export const RANK_SUFFIX = Object.freeze({ [RANK_KEYS.kit]: '', [RANK_KEYS.apprentice]: '', [RANK_KEYS.leader]: '' });

// Names are not composed, so there is no list of names to keep away from.
export const DENIED_NAMES = new Set();

// The cats of each group's home base, in seat order (clancast.js CAST_RANKS).
// Each word is the cat's whole name. They are the same sixteen words per
// group the family's set builds its names from (the first nine of each of the
// first four lists are the owner's and the older playtester's picks), kept so
// she meets the same cats: Badger is Badger in both.
export const CLAN_CAT_PREFIXES = Object.freeze({
  woods: Object.freeze(['Badger', 'Bark', 'Bluejay', 'Burr', 'Conker', 'Fawn', 'Root', 'Glade', 'Bryony',
    'Thrush', 'Hollow', 'Nutmeg', 'Loam', 'Rook', 'Dormouse', 'Spindle']),
  moor: Object.freeze(['Curlew', 'Lapwing', 'Peat', 'Grouse', 'Cotton', 'Tor', 'Bilberry', 'Stoat', 'Pipit',
    'Cairn', 'Ling', 'Wisp', 'Snipe', 'Quill', 'Ridge', 'Whin']),
  river: Object.freeze(['Minnow', 'Pike', 'Shingle', 'Newt', 'Vole', 'Trout', 'Mint', 'Dipper', 'Teal',
    'Caddis', 'Gudgeon', 'Mayfly', 'Silt', 'Roach', 'Wader', 'Marigold']),
  pines: Object.freeze(['Cone', 'Bog', 'Slate', 'Resin', 'Needle', 'Beetle', 'Toad', 'Frog', 'Adder',
    'Sable', 'Mire', 'Gnat', 'Sloe', 'Fungus', 'Soot', 'Bat']),
  gorge: Object.freeze(['Crag', 'Granite', 'Scree', 'Sprig', 'Flint', 'Merlin', 'Shale', 'Pika', 'Gully',
    'Bluff', 'Tarn', 'Puff', 'Nimble', 'Stonecrop', 'Thrift', 'Crest']),
});

// ---- ranks ------------------------------------------------------------------------

// Six ranks (her picks), shown as a title beside the name: "Pickles the
// ranger". Every rank id needs a word here (wordset.js refuses a set without
// one); the two ids this set has no rank for read as the one they are shown
// as (RANK_AS). The keys are the game's rank ids (RANK_KEYS), never shown.
export const RANK_WORDS = Object.freeze({
  [RANK_KEYS.kit]: 'kitten',
  [RANK_KEYS.apprentice]: 'scout',
  [RANK_KEYS.warrior]: 'ranger',
  [RANK_KEYS.elder]: 'wise cat',
  [RANK_KEYS.queen]: 'ranger',
  [RANK_KEYS.medicine]: 'doc',
  [RANK_KEYS.deputy]: 'ranger',
  [RANK_KEYS.leader]: 'first cat',
});

// No second-in-command and no mother rank: each is shown as an ordinary grown
// cat. A save's stored second-in-command (clanRoles) is left where it is and
// not read.
export const RANK_AS = Object.freeze({ [RANK_KEYS.deputy]: RANK_KEYS.warrior, [RANK_KEYS.queen]: RANK_KEYS.warrior });

// ---- outside cats, people and places -----------------------------------------------

// met: a cat who lives alone and is friendly. grudge: the unfriendly stray
// (the owner kept this word on 2026-11-18, knowing the books use it too).
// house: a collared visitor from town. player: the player's own cat has NO
// label in this set, so the word is empty and nothing is added to its name.
// people: her word for the people of the town (no line shows it yet).
export const OUTSIDE_WORDS = Object.freeze({
  met: 'roamer',
  grudge: 'loner',
  player: '',
  house: 'house cat',
  people: 'townspeople',
});

// roofs: the Rooftops, in plain words in both sets.
// town: the Neighborhood. island: the island in the lake, a quiet place.
// seat: the first cat's seat in a home base (no line shows it yet).
export const PLACE_WORDS = Object.freeze({
  town: 'Peopleville',
  island: 'The Still Island',
  seat: 'High Stone',
  roofs: 'The Rooftops',
  market: 'The Market Square',
  house: 'The Old House',
});

// ---- what this set does differently ---------------------------------------------------

export const RULES = Object.freeze({
  storedNames: true, // a cat keeps one name; its rank is a title beside it
  noStarNames: true, // no top-rank names are offered for the player's cat
  stoneSeat: true, // the camps' leader sits on the High Stone, not the stepped rock (world/camp.js)
});

// ---- lines ----------------------------------------------------------------------------

// The game's own short title for the edition with the territories in it, and
// the game's whole title ("Whisker Walk 2", her pick).
const WILD_EDITION = `${CLAN_SUFFIX} Edition`; // builder's pick: the name of that edition in Settings

// Entries for clanphrases.js ids; each takes the place of that table's line.
// An id not listed here keeps the table's line, said with this set's words
// ("Pick your crew" is 'pick.heading' with the group word above).
export const PHRASES = Object.freeze({
  // a group's name: two words
  'group.name': (prefix) => `${prefix} ${CLAN_SUFFIX}`,
  // the Colony card: "Pickles" then "the ranger"
  'colony.rankAfterName': (rankWords) => `the ${rankWords}`,
  // the Menu's tile and the sheet's heading: no group word in the everyday game
  'menu.myCats': 'My cats',
  // the My cats sheet: "cats", never a word for the group
  'mycats.empty': 'No cats here yet — touch noses with a stray, then feed it 🐟',
  'mycats.notSetUp': "Sharing your cats isn't switched on yet",
  'mycats.offline': "Can't reach the internet right now — your cats are safe on this device",
  'mycats.alreadyPaired': 'This player is already sharing their cats.',
  'mycats.needsName': 'To share your cats, you need a friend name first.',
  'mycats.nameIntro': (save) => `You need a friend name before you can share your cats. Type one here and ${save}:`,
  'mycats.wantsToShare': 'wants to share your cats. Is that them?',
  'mycats.offer': '🐈 Share your cats with your brother or sister',
  'mycats.nowSharing': (name) => `You're sharing your cats with ${name}! 🐾`,
  'mycats.newsSub': "What's new with your cats",
  'mycats.full': (cap) => `Your cats’ home is full — ${cap} cats live here 🏠`,
  'mycats.fullRoom': (max) => ` Share your cats with your brother or sister to make room for ${max}.`,
  // no second name for the Neighborhood in the everyday game: no line at all
  'place.townNote': '',

  // the game is "Whisker Walk 2"; only the older plain edition adds its name
  'edition.title.canon': WILD_EDITION,
  'edition.game': (editionTitle) => (editionTitle === WILD_EDITION ? 'Whisker Walk 2' : `Whisker Walk 2: ${editionTitle}`),
  'prize.warpaint.canon': () => phrase('prize.warpaint.legacy'),

  // picking a home (worded as choosing where to live, not as an outsider joining)
  'pick.heading': 'Pick your home crew',
  'pick.campSoon': 'home base coming soon',
  'pick.momentTitle': 'Time to pick a home!',
  'pick.momentAsk': 'Which crew will be your home?',
  'pick.changeAsk': 'Tap a crew to make it your home.',
  'pick.changeAskClick': 'Click a crew to make it your home.',
  'map.camp': (group) => `${group} home base`,

  // not offered in this set (RULES.noStarNames), so there is nothing to say
  'star.pick': '',

  // walking the bounds with a cat of your crew
  'patrol.prompt': (name) => `E — walk the bounds with ${name}`,
  'patrol.start': (name) => `${name} walks the bounds with you 🐾`,
  'patrol.endGood': (name) => `${name} heads back to home base. Well done!`,
  'patrol.endShort': (name) => `${name} heads back to home base. Go further next time!`,
  'patrol.award': (name) => `a walk round the bounds with ${name}`,

  'journal.chasedOff': 'Outsiders chased away',

  // the fight moves keep their four short names; the long name is the same word
  'move.rearUpSwat.name': 'Swat',
  'move.leapScratch.name': 'Leap',
  'move.pin.name': 'Pin',
  'move.rollingTumble.name': 'Tumble',

  // landmarks (her picks: grandfather oak, heron rocks, the stone ring)
  'landmark.woods.oak': 'the grandfather oak',
  'landmark.woods.oakLookout': 'grandfather oak lookout',
  'landmark.woods.oakSquirrels': 'two squirrels racing up the grandfather oak',
  'landmark.river.warmRocks': 'heron rocks',
  'landmark.river.warmPebble': 'a warm pebble on the low rock',
  'landmark.island.ring': 'the stone ring under the old ash',
  'landmark.island.stoneFind': 'a bright beetle wing on a flat stone',

  // ---- the Woods' south strip (bigger areas, 2026-11-19; only seen with the
  // ?grow=1 switch on); builder's pick
  'woods.south.scenic': 'the sandy hollow',

  // ---- her birthday (2026-11-21): plain words; builder's pick
  'bday.home': 'Everyone is coming to the island for your birthday! 🎂',
  'bday.announce': (name) => `Everyone, come and sit round! Today is ${name}'s birthday!`,
});

// Entries for tutorialwords.js ids (the guided walk, the hints, the home
// line), each with a touch and a keyboard form.
const same = (s) => Object.freeze({ touch: s, keys: s });
export const LINES = Object.freeze({
  'hint.stranger': same('An outsider has come onto your land. You choose: chase or leave.'),
  'home.pick': same('It is time to pick your home!'),
  'home.camp': same('Your new home is {place}. Go and see your home base!'),
  'camp.follow': same('Follow {name} to your home base.'),
  'camp.here': same('This is your home base. Say hello to everyone!'),
  'camp.trail': same('Follow the paw prints to your home base.'),
  'camp.pill': same('Your home base 🏡'),
});
