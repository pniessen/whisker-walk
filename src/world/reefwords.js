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
  'reef.arrive': clan('Welcome to the Reef!', 'Welcome to the Reef! The water shimmers like Silverpelt.'),
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
  'reef.air.pocket': 'A bubble of fresh air. Breathe in!',
  'reef.home': 'Home again, safe and dry.',
  'reef.air.low': 'Your air is getting low. A warm bubble is ready.',
  'reef.air.lift': 'A warm bubble lifts you to the ladder.',
  'reef.air.full': 'Fresh air, all full!',
});

addPhrases(LINES);
Object.assign(REEF_HINTS, HINTS);
