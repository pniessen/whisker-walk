// The Reef's find lines (milestone R3): what a discovery says the first time ever, and the two collectibles' names. A lazy file, imported by
// reeffinds.js (so by the Reef's chunk, never start-up): they join the phrase table (addPhrases) when the chunk arrives. The everyday set is the plain base;
// the Clan set adds light flavour only. No series word is in the everyday set; test/reeffinds.test.js checks both sets.
import { addPhrases } from '../clanphrases.js';
import { seriesMode, SERIES_ON } from '../wordset.js';

// A line that takes the Clan set's flavour reads the set in use WHEN IT IS SAID (never kept).
const clan = (everyday, flavoured) => () => (seriesMode() === SERIES_ON ? flavoured : everyday);

export const FIND_LINES = Object.freeze({
  'reef.find.boat': clan('You found the Sunken Boat! Old planks, and a lovely place to hide.', 'You found the Sunken Boat! A tale for the elders under Silverpelt.'),
  'reef.find.oyster': 'You found the Pearl Oyster! It opens a little and shows its pearl.',
  'reef.find.seahorse': clan('A tiny seahorse peeks out of the kelp. Hello!', 'A tiny seahorse peeks out of the kelp. Hello, little one!'),
  'reef.find.cave': 'You found the Glow Cave! The walls shine like little stars.',
  'reef.find.chest': 'You found the Treasure Chest! Its lid creaks open.',
  'reef.find.anchor': 'You found the Old Anchor, half asleep in the sand.',
  'reef.shell': 'a pearly shell',
  'reef.glass': 'a piece of sea-glass',
});

addPhrases(FIND_LINES);
