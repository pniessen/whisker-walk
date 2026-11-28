// The Reef's words (milestone R0 reserves the ids and a few lines; the rules that say them come with their milestones).
// A lazy file: they join the phrase table (src/clanphrases.js, addPhrases) when the place's chunk arrives, so the start-up
// download does not carry them (the Moon's way). The page names are in start-up (src/reefpages.js: the journal is drawn
// before the place has ever been walked); the hints and every other line are here. Every line reads the same in both word
// sets except 'reef.arrive', which takes the Clan set's light flavour; no series word is in the everyday set.
// test/reefseams.test.js checks both sets.
import { addPhrases } from '../clanphrases.js';
import { REEF_HINTS } from '../reefpages.js';
import { seriesMode, SERIES_ON } from '../wordset.js';

// A line that takes the Clan set's flavour reads the set in use WHEN IT IS SAID (never kept), so the everyday set is the plain base.
const clan = (everyday, flavoured) => () => (seriesMode() === SERIES_ON ? (typeof flavoured === 'function' ? flavoured() : flavoured) : everyday);

// the journal's hints, by page id (the unspotted cards read them through src/reefpages.js)
export const HINTS = Object.freeze({
  rfboat: 'An old boat rests on the seabed.',
  rfoyster: 'Something round and shiny hides in a shell.',
  rfseahorse: 'Look for a tiny seahorse in the tall kelp.',
  rfcave: 'A little cave glows in the deep.',
  rfchest: 'A treasure chest sits on the sandy flats.',
  rfanchor: 'An old anchor lies half in the sand.',
  rfshells: 'Help Marlo find a shell that fits.',
  rflanterns: 'Touch the lantern corals to light them.',
  rfparade: 'Everyone swims past to say welcome home.',
  rfalbum: 'Collect postcards of the reef.',
  rferrand: 'Once Marlo has a home, he has an errand each walk.',
  rfrings: 'Float through the bubble rings.',
});

export const LINES = Object.freeze({
  'reef.arrive': clan('Welcome to the Reef!', 'Welcome to the Reef! The water is warm and bright.'),
  'reef.marlo.hello': 'A little crab waves a claw. Say hello!',
  'reef.marlo.prompt': 'Say hello to the little crab',
  'reef.marlo.met': 'Marlo needs a new shell. Meow and he will show you where to look.',
  'reef.marlo.give': 'Give the shell to Marlo',
  'reef.marlo.small': 'Too small! Marlo sighs. Maybe another shell will fit.',
  'reef.marlo.big': 'Too big! It wobbles all around him. One more to try.',
  'reef.shell.prompt': 'Pick up the shell',
  'reef.shell.find': 'Walk the sand and look for the glint of a shell.',
  'reef.shell.got': 'Take the shell to Marlo!',
  'reef.shell.float': 'The shell is up high. Hold the kick button to float.',
  'reef.float.hint': 'Hold the kick button to float up.',
  'reef.home': 'Home again, safe and dry.',
  // milestone R5: shell three, the lantern corals, the housewarming (the same in both sets; nothing here is a series word)
  'reef.shell.cave': 'Look for a little cave behind the coral. Bubbles drift up there.',
  'reef.marlo.third': 'It looks just right! Wait a moment and watch.',
  'reef.marlo.tried': 'It fits! His old shell is a cosy home for a sea snail.',
  'reef.lantern.hint': 'Touch the lantern corals, one after another.',
  'reef.lantern.try.0': 'Try the pink one first.',
  'reef.lantern.try.1': 'Try the gold one next.',
  'reef.lantern.try.2': 'Try the sea-blue one last.',
  'reef.hatch.hint': 'Psst! A ring by the Sunken Boat leads down to a secret station.',
  'reef.lantern.lit': 'The coral glows!',
  'reef.lantern.all': 'Every lantern is lit! Marlo is ready for the party.',
  'reef.parade.prompt': 'Start the housewarming',
  'reef.parade.replay': 'Watch the housewarming again',
  'reef.parade.start': 'Everyone is swimming over to say welcome home!',
  'reef.parade.pay': 'A housewarming for Marlo, with a manta, a turtle and a shoal',
  // the written guide (world/reefguide.js): the goal line, the chip beside Marlo's picture, the arrival card. {at} {m} {n} are filled in by the guide.
  'reef.guide.hello': 'Say hello to Marlo, the little crab by the ladder.',
  'reef.guide.shell0': 'Find shell 1 of 3: in the Kelp Garden, {at}.',
  'reef.guide.shell1': 'Find shell 2 of 3: up high on the coral ledge. Hold the kick button to float.',
  'reef.guide.shell2': 'Find shell 3 of 3: in the little cave behind the coral, where bubbles drift up.',
  'reef.guide.carry': 'Take the shell to Marlo ({m} m).',
  'reef.guide.carry.near': 'Give the shell to Marlo.',
  'reef.guide.tryon': 'Marlo is trying on his new shell. Wait a moment and watch!',
  'reef.guide.lantern': 'Touch the glowing pink coral first ({n} of 3).',
  'reef.guide.lantern.1': 'Now touch the glowing gold coral ({n} of 3).',
  'reef.guide.lantern.2': 'Last, touch the glowing sea-blue coral ({n} of 3).',
  'reef.guide.parade': 'Start the housewarming with Marlo.',
  'reef.guide.errand': 'Marlo’s errand of the day: go and see him.',
  'reef.guide.chip.marlo': 'Say hello to Marlo',
  'reef.guide.chip.shell': 'Marlo needs a shell',
  'reef.guide.chip.deliver': 'Give him the shell',
  'reef.guide.chip.tryon': 'Marlo is trying it on',
  'reef.guide.chip.lantern': 'Touch the lantern corals',
  'reef.guide.chip.parade': 'Marlo is ready for the party',
  'reef.guide.chip.errand': 'Marlo has an errand',
  'reef.guide.arrive1': clan('Welcome to the Reef!', 'Welcome to the Reef! The water is warm and bright.'),
  'reef.guide.arrive2': 'A shy crab named Marlo needs a new shell.',
  'reef.guide.arrive3': 'Look for three shells: one in the kelp, one up high on a ledge and one in a cave.',
  'reef.guide.close': 'OK',
  'reef.pearl': 'Marlo gives you a pearl for your collar!',
});

addPhrases(LINES);
Object.assign(REEF_HINTS, HINTS);
