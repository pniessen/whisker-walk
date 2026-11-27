// The holiday errand's words (H7, src/world/holidayfinds.js). A lazy file: the lines join the phrase table (src/clanphrases.js,
// addPhrases) when the holiday chunk arrives, so the start-up download does not carry them. Real-world holiday words, plain, the
// same in every word set (neither set rewords them: no entry in the everyday set's PHRASES). Kind: no countdown, nothing missed,
// no paws; each line says how many of the three she has, or that she has the prize already.
import { addPhrases, phrase } from '../clanphrases.js';

export const HOLIDAY_FIND_LINES = Object.freeze({
  'holiday.find.ornament': (n) => `A shiny ornament! That is ${n} of 3 for the ${phrase('wear.littlegoldstar.name')}. 🎄`,
  'holiday.find.dreidel': (n) => `A little dreidel! That is ${n} of 3 for the ${phrase('wear.menorahglow.name')}. 🕎`,
  'holiday.find.gelt': (n) => `A gold gelt coin! That is ${n} of 3 for the ${phrase('wear.menorahglow.name')}. 🕎`,
  'holiday.find.again': 'Another lovely one! One counts on each walk.',
  'holiday.find.kept': 'Another one! You have the prize already, so this one is just for fun.',
  'holiday.find.done.christmas': (name) => `That is three! The ${name} is yours for keeps. 🌟`,
  'holiday.find.done.hanukkah': (name) => `That is three! The ${name} is yours for keeps. 🕎`,
  'holiday.find.partner': (name) => `${name} found one, and it counts for you both.`,
});
addPhrases(HOLIDAY_FIND_LINES);
