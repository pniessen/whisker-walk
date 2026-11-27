// The galleon's hunt words (milestone R17): the soft lines said when the torn map, each clue and the Captain's Chest are found. A lazy file, imported by
// reefhuntlive.js (so by the Reef's wreck stage, never start-up): the lines join the phrase table (addPhrases). The everyday set is the plain base; the Clan set
// adds light flavour only. No series word is in the everyday set; test/reefhunt.test.js checks both sets. The page names and hints are in reefpages.js and
// reefwingwords2.js.
import { addPhrases } from '../clanphrases.js';
import { seriesMode, SERIES_ON } from '../wordset.js';

// A line that takes the Clan set's flavour reads the set in use WHEN IT IS READ (never kept).
const clan = (everyday, flavoured) => () => (seriesMode() === SERIES_ON ? flavoured : everyday);

export const LINES = Object.freeze({
  'reef.hunt.map': clan('A torn old map! It shows an anchor.', 'A torn old map, inked long ago! It shows an anchor.'),
  'reef.hunt.clue0': 'The anchor is on the map! Next, a boat with an open stern.',
  'reef.hunt.clue1': 'The boat is on the map too! Next, a coral that glows like a lantern.',
  'reef.hunt.clue2': 'The last mark! An X glints on the sand, far to the east.',
  'reef.hunt.chest': clan('The Captain’s Chest! A pirate bandana is inside.', 'The Captain’s Chest, at last! A pirate bandana is inside.'),
  'reef.hunt.chest.on': 'The pirate bandana is on. Ahoy!',
});

addPhrases(LINES);
