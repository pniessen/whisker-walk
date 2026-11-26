// The Deep's words (milestone R8): the three soft lines the wing says once a walk (arriving, resting in the old boat, stepping into the glowing cleft). A lazy file,
// imported by reefdeeplife.js (so by the Reef's chunk, never start-up): they join the phrase table (addPhrases) when the chunk arrives. The everyday set is the plain
// base; the Clan set adds light flavour only. No series word is in the everyday set; test/reefdeep.test.js checks both sets.
import { addPhrases } from '../clanphrases.js';
import { seriesMode, SERIES_ON } from '../wordset.js';

// A line that takes the Clan set's flavour reads the set in use WHEN IT IS SAID (never kept).
const clan = (everyday, flavoured) => () => (seriesMode() === SERIES_ON ? flavoured : everyday);

export const LINES = Object.freeze({
  'reef.deep.arrive': clan('It is calm and quiet out here. Tiny lights drift by.', 'It is calm and quiet out here. Tiny lights drift by, like little stars.'),
  'reef.deep.boat': 'A cosy old boat. A lovely place to rest.',
  'reef.deep.cave': 'The walls glow softly. Take your time.',
});

addPhrases(LINES);
