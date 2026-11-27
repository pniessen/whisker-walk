// The Moon's robot-and-light words (survey drones, the cleaner bot, the mini-rover convoy, the light moths, the pixel visitor and the moonling): what the walk says when she spots
// one (the album's label and the critter toast) and the journal pages' hints. A lazy file, imported by moonrobotslive.js (so by the Moon's hill chunk, never start-up): the lines join
// the phrase table (addPhrases) and the hints join MOON_HINTS (src/moonpages.js) when the chunk arrives. The two word sets read the same here: no series word is in any line.
import { addPhrases } from '../clanphrases.js';
import { MOON_HINTS } from '../moonpages.js';

export const LINES = Object.freeze({
  'moon.life.drone': 'a survey drone',
  'moon.life.cleaner': 'a dusty cleaner bot',
  'moon.life.convoy': 'a mini-rover convoy',
  'moon.life.moth': 'a lunar moth of light',
  'moon.life.pixel': 'a pixel visitor',
  'moon.life.moonling': 'a shy moonling',
});

export const HINTS = Object.freeze({
  mldrone: 'Little round drones hover over the base and Star Hill.',
  mlcleaner: 'A cleaner bot sweeps the dust near the dome.',
  mlconvoy: 'Three mini-rovers roll in a line beside the rover track.',
  mlmoth: 'Soft lights flutter round the lamps at the base.',
  mlpixel: 'A tiny visitor from a very old game.',
  mlmoonling: 'A shy little friend from far away.',
});

addPhrases(LINES);
Object.assign(MOON_HINTS, HINTS);
