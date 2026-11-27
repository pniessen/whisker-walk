// Tilly's errand lines and journal hints (milestone V7): what the day's errand asks, what each prompt says, what the pay says and the two activity pages' hints. A lazy file, imported by
// snowvillejoblive.js (so by the place's stage chunk, never start-up): the lines join the phrase table (addPhrases) and the hints join SNOWVILLE_HINTS (src/snowvillepages.js) when the
// chunk arrives. The everyday set is the plain base; the Clan set adds light flavour to the pay line only. No series word is in the everyday set and no line scolds: there is no failing
// here. test/snowvillejob.test.js checks both sets.
import { addPhrases } from '../clanphrases.js';
import { SNOWVILLE_HINTS } from '../snowvillepages.js';
import { seriesMode, SERIES_ON } from '../wordset.js';
import { NAMES } from './snowvillewords.js';

const T = NAMES.tilly;
// A line that takes the Clan set's flavour reads the set in use WHEN IT IS SAID (never kept).
const clan = (everyday, flavoured) => () => (seriesMode() === SERIES_ON ? flavoured : everyday);

export const SNOWVILLE_JOB_LINES = Object.freeze({
  'snowville.job.cones': `${T} would love three little pinecones from the snow.`,
  'snowville.job.otter': 'Follow the little glint along the otter’s slide.',
  'snowville.job.button': 'The snowman has lost a button. Can you find it?',
  'snowville.job.cup': 'The robin would love a warm cup from the cocoa stall.',
  'snowville.job.lights': 'Carry a string of lights to the lantern at the sled hill.',
  'snowville.job.cones.prompt': `Give ${T} the pinecones`,
  'snowville.job.pick.prompt': 'Pick it up',
  'snowville.job.pick.got': 'Got it! Take it along.',
  'snowville.job.button.prompt': 'Give the snowman his button',
  'snowville.job.cup.prompt': 'Set the cup out for the robin',
  'snowville.job.lights.prompt': 'Hang the lights by the lantern',
  'snowville.job.pay': clan(`Thank you! ${T} gives you a snow-globe postcard.`, `Thank you! ${T} gives you a snow-globe postcard, with a star of Silverpelt in it.`),
  'snowville.job.postcard': 'A new postcard for your album!',
  'snowville.job.full': 'Your postcard album is full. What a cosy collection!',
});
addPhrases(SNOWVILLE_JOB_LINES);

export const HINTS = Object.freeze({
  sw4: `After Lantern Night, ${T} has a small errand each walk.`,
  sw5: 'Each errand brings a snow-globe postcard for your album.',
});
Object.assign(SNOWVILLE_HINTS, HINTS);
