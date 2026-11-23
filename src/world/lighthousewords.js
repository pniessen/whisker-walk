// Lighthouse Point's words (milestones 2 and 3). A lazy file: they join the phrase table
// (src/clanphrases.js, addPhrases) when the place's chunk arrives, so the start-up download does not carry them
// (the My cat sheet's way, src/ui/catloginwords.js). The same in every word set except the two lines that take a
// word from the set (the keeper's cat's house word, the people asleep in the window): those take it at read time
// from words().OUTSIDE_WORDS, so a set that needs its own wording puts the id in its PHRASES (src/offclanwords.js)
// and that wins. Both sets are checked by test/lighthouselamp.test.js and test/lighthousewords.test.js. The
// journal's own page names and hints are in the start-up table (src/clanphrases.js), because the journal is drawn
// before the place has ever been walked.
import { addPhrases } from '../clanphrases.js';

export const LINES = Object.freeze({
  // (the place's first hint, 'hint.lighthouse', is in the start-up table: src/tutorialwords.js)
  // the corner map's special places, what she can perch on, and the five things to collect
  'lighthouse.scenic.gallery': 'the lighthouse balcony',
  'lighthouse.scenic.cave': 'the sea cave',
  'lighthouse.scenic.pools': 'the rock pools',
  'lighthouse.scenic.cottage': 'the keeper’s porch',
  'lighthouse.scenic.gullrock': 'Gull Rock',
  'lighthouse.perch.boat': 'the upturned boat',
  'lighthouse.perch.pool': 'the high pool ledge',
  'lighthouse.collect.shell': 'a spiral shell',
  'lighthouse.collect.glass': 'a piece of blue sea glass',
  'lighthouse.collect.starfish': 'a little starfish',
  'lighthouse.collect.button': 'a pearly button',
  'lighthouse.collect.cork': 'a bobbing cork float',
  // the two moments the walk plays now and then
  'lighthouse.moment.crab': 'a crab scuttling out of a rock pool',
  'lighthouse.moment.chip': 'a gull stealing a chip',
  // the lamp job: the lever's prompt, the line it pays under, and the far ship's answer
  'lighthouse.lever.prompt': 'E — pull the lamp lever',
  'lighthouse.lamp.lit': 'The lamp is lit! The beam sweeps over the sea. 🔦',
  'lighthouse.lamp.ship': 'Far away, a ship toots its horn. Thank you! 🚢',
  // the fog bell's rope
  'lighthouse.bell.prompt': 'E — ring the fog bell',
  // the kitten job: the offer (the cottage's house cat), what she hears, finds, and the end
  'lighthouse.kitten.offer': (house) => `The cottage ${house} keeps looking down at the shore. Her kitten is missing! 🐾`,
  'lighthouse.kitten.hear': 'Mew! Mew! Where is that coming from?',
  'lighthouse.kitten.found': 'There you are, little one! Stay close. 💕',
  'lighthouse.kitten.prompt': 'E — say hello to the kitten',
  'lighthouse.kitten.home': 'Home safe! The kitten tumbles in and Mum purrs. 😻',
  // the six finds: the line each shows the first time ever
  'lighthouse.find.lamproom': 'The great lens turns the sunset to gold. ✨',
  'lighthouse.find.pool': 'A little crab waves a claw at you. 🦀',
  'lighthouse.find.gull': 'A gull lands next to you and chats about fish. 🐦',
  'lighthouse.find.echo': 'Mew-ew-ew… the cave sings your call back! 🎶',
  'lighthouse.find.bell': 'Clang! The gulls flap up all at once. 🔔',
  'lighthouse.find.window': (people) => `A warm room, and one of the ${people} asleep in a chair. A purr from somewhere. 🏮`,
});

addPhrases(LINES);
