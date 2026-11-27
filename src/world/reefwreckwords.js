// The galleon's words (milestone R16): the journal page's label (what the walk says when she spots the ship) and three soft lines said once a walk (stepping
// aboard, floating into the cabin, finding the brass suit). A lazy file, imported by reefwrecklife.js (so by the Reef's wreck stage, never start-up): the lines
// join the phrase table (addPhrases). The page's hint is in reefwingwords2.js. The everyday set is the plain base; the Clan set adds light flavour only. No
// series word is in the everyday set; test/reefwreck.test.js checks both sets.
import { addPhrases } from '../clanphrases.js';
import { seriesMode, SERIES_ON } from '../wordset.js';

// A line that takes the Clan set's flavour reads the set in use WHEN IT IS READ (never kept).
const clan = (everyday, flavoured) => () => (seriesMode() === SERIES_ON ? flavoured : everyday);

export const LINES = Object.freeze({
  'reef.wreck.galleon': clan('a sunken galleon', 'a sunken galleon, a ship out of an old tale'),
  'reef.wreck.deck': 'The deck leans like a hill. Climb up the slope!',
  'reef.wreck.cabin': clan('A snug old cabin. Take your time.', 'A snug old cabin, full of sea-light. Take your time.'),
  'reef.wreck.suit': 'An old brass diving suit, resting on the sand.',
});

addPhrases(LINES);
