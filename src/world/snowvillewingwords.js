// Snowville wing B's words (milestone V5): the hearth, Lantern Night, the Snowflake Clasp, and the journal hints for the two story pages (the three candles, Lantern Night). A lazy file,
// imported by snowvillewinglive.js (so by the place's stage chunk, never start-up): the lines join the phrase table (addPhrases) and the hints join SNOWVILLE_HINTS (src/snowvillepages.js)
// when the chunk arrives. Every line reads the same in both word sets (the family's and the everyday one); no series word is in any, and none of the banned words (dark, lost forever,
// trapped, stuck, collapse, scary) is in either. test/snowvillewing.test.js checks both sets.
import { addPhrases } from '../clanphrases.js';
import { SNOWVILLE_HINTS } from '../snowvillepages.js';
import { NAMES } from './snowvillewords.js';

const T = NAMES.tilly;

export const WING_LINES = Object.freeze({
  'snowville.hearth.warm': 'Ahh, toasty! The little lights along the lane twinkle on.',
  'snowville.show.prompt': 'Begin Lantern Night',
  'snowville.show.replay': 'Light up the village again',
  'snowville.show.start': 'Lantern Night begins! Watch the village glow.',
  'snowville.show.pay': 'Lantern Night! Every light in the village is glowing.',
  'snowville.clasp': `${T} pins a Snowflake Clasp on your collar!`,
});
addPhrases(WING_LINES);

export const HINTS = Object.freeze({
  sv7: 'Three little candles wait to be carried to three lanterns.',
  sv8: `When all three lanterns glow, ${T} starts Lantern Night.`,
});
Object.assign(SNOWVILLE_HINTS, HINTS);
