// Snowville's words (milestone V1: the cheeks theme's two lines; milestone V2: Tilly, the first candle and the first lantern; the finds, the show and the errand come with
// their milestones). A lazy file: they join the phrase table (src/clanphrases.js, addPhrases) when the place's chunk arrives, so the start-up download does not carry them (the
// Reef's way). Every line reads the same in both word sets (the family's and the everyday one); no series word is in any of them.
import { addPhrases } from '../clanphrases.js';

// The characters' names, in ONE table: the hare's is a placeholder until the daughter names her (a rename is this one edit).
export const NAMES = Object.freeze({ tilly: 'Tilly' });
const T = NAMES.tilly;

export const LINES = Object.freeze({
  'snowville.cold': 'Brrr! Warm up by the fire?',
  'snowville.warm': 'Ahh, toasty!',
  'snowville.tilly.hello': 'A little snow hare waves an ear. Say hello!',
  'snowville.tilly.prompt': `Say hello to ${T}`,
  'snowville.tilly.met': `${T} wants three lanterns lit before Lantern Night. Meow and she will show you where to look.`,
  'snowville.candle.prompt': 'Pick up the candle',
  'snowville.candle.find': 'Look for a little glint in a window box.',
  'snowville.candle.got': 'Carry the candle to the lantern by the big fir!',
  'snowville.candle.give': 'Light the lantern',
  'snowville.pond.got': 'Carry the candle to the lantern by the skating pond!',
  'snowville.hill.got': 'Carry the candle down to the lantern at the foot of the sled hill!',
  'snowville.pond.find': 'Look for a little glint on a stump by the pond.',
  'snowville.hill.find': 'Look for a little glint on the rock at the top of the sled hill.',
  'snowville.lantern.lit': `The lantern glows! ${T} twirls with joy.`,
});
addPhrases(LINES);
