// The Moon's words (milestone 0: the ids are reserved, the places that say them come with the milestones that need them).
// A lazy file: they join the phrase table (src/clanphrases.js, addPhrases) when the place's chunk arrives, so the start-up
// download does not carry them (the Lighthouse's way). The page names are in start-up (src/moonpages.js: the journal is
// drawn before the place has ever been walked); the hints and every other line are here. Every line reads the same in both
// word sets for now: no series word is in any of them. The Clan set's light flavour (the spec's "Silverpelt" lines:
// moon.arrive, moon.earth, moon.scope.milky, moon.cape, moon.home) is added with the milestone that shows each line.
// test/moonseams.test.js checks both sets.
import { addPhrases } from '../clanphrases.js';
import { MOON_HINTS } from '../moonpages.js';

// the journal's hints, by page id (the unspotted cards read them through src/moonpages.js)
export const HINTS = Object.freeze({
  mnflag: 'A flag stands by the lander. Stand beside it.',
  mnecho: 'Call out from the middle of a crater.',
  mndust: 'Walk across the smooth, untouched dust.',
  mncheese: 'Something golden shines at the bottom of the big bowl.',
  mndish: 'Stand under the big radio dish.',
  mngarden: 'Glowing plants grow inside the dome.',
  mnstory: 'Help Pip say hello to Earth.',
  mnrover: 'Hop in the little moon buggy.',
  mnlaunch: 'Send a postcard home on the rocket.',
  mnscope: 'Join the stars into pictures.',
  mnjump: 'Jump as far as you can.',
  mnjob: 'Pip has a small job for you each day.',
});

export const LINES = Object.freeze({
  // the story and the place (the spec's samples)
  'moon.arrive': 'Welcome to the Moon!',
  'moon.pip.wake': 'Beep! Hello!',
  'moon.pip.goal': 'Let’s say hello to Earth!',
  'moon.core.on': 'The base has power!',
  'moon.earth': 'Earth is out. Look up!',
  'moon.scope.milky': 'The Milky Way is out.',
  'moon.scope.hmm': 'Hmm, not that one.',
  'moon.stamp.ask': 'Pick a stamp for your postcard.',
  'moon.count.go': 'Lift-off!',
  'moon.reply': 'Earth says hello back!',
  'moon.badge': 'A Moon Badge!',
  'moon.cape': 'Starlight Cape, in your wardrobe.',
  'moon.job.glove': 'Earth lost a glove. Can you find it?',
  'moon.rover.in': 'Hop in',
  'moon.home': 'Take the gate home when you’re ready.',
});

addPhrases(LINES);
Object.assign(MOON_HINTS, HINTS);
