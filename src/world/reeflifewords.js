// The Reef's sea-life words (seals, octopuses, dolphins): what the walk says when she spots one (the album's label and the critter toast) and the journal
// pages' hints. A lazy file, imported by reefsealslive.js (so by the Reef's chunk, never start-up): the lines join the phrase table (addPhrases) and the hints
// join REEF_HINTS (src/reefpages.js) when the chunk arrives. The everyday set is the plain base; the Clan set adds light flavour only. No series word is in the
// everyday set; test/reefseals.test.js checks both sets.
import { addPhrases } from '../clanphrases.js';
import { REEF_HINTS } from '../reefpages.js';
import { seriesMode, SERIES_ON } from '../wordset.js';

// A line that takes the Clan set's flavour reads the set in use WHEN IT IS READ (never kept).
const clan = (everyday, flavoured) => () => (seriesMode() === SERIES_ON ? flavoured : everyday);

export const LINES = Object.freeze({
  'reef.life.seal': clan('a curious seal', 'a curious seal, sleek as river-water'),
  'reef.life.octopus': clan('a shy octopus', 'a shy octopus, colours drifting'),
});

export const HINTS = Object.freeze({
  rfseal: 'Seals play in the open water. One naps on a rock by the sandy flats.',
  rfoctopus: 'Look for a shy octopus peeking out of a rock den.',
});

addPhrases(LINES);
Object.assign(REEF_HINTS, HINTS);
