// The divers', the research ship's and the big shark's words (milestone R18): what the walk says when she spots one (the album's label and the critter toast), one soft
// line said once a walk when a diver first waves, and the sea creatures' hints are in reefwingwords2.js (a stage chunk that imports reefpages.js would pull the whole start-up chunk into its preload list). A lazy file, imported by reefdiverslive.js (so by the Reef's ride stage, never
// start-up): the lines join the phrase table (addPhrases) when the chunk arrives. The everyday set is the plain base;
// the Clan set adds light flavour only. No series word is in the everyday set; test/reefdivers.test.js checks both sets.
import { addPhrases } from '../clanphrases.js';
import { seriesMode, SERIES_ON } from '../wordset.js';

// A line that takes the Clan set's flavour reads the set in use WHEN IT IS READ (never kept).
const clan = (everyday, flavoured) => () => (seriesMode() === SERIES_ON ? flavoured : everyday);

export const LINES = Object.freeze({
  'reef.life.divers': clan('a friendly diver', 'a friendly diver, waving hello'),
  'reef.life.vessel': clan('a research ship, high above', 'a research ship, floating high above the water-sky'),
  'reef.life.whaleshark': clan('a big spotted shark', 'a big spotted shark, gentle as a drifting cloud'),
  'reef.divers.hello': 'A friendly diver waves hello!',
});

addPhrases(LINES);
