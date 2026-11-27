// Snowville's find lines and journal hints (milestone V3): what a discovery says the first time ever, the two collectibles' names and the six pages' hints. A lazy file, imported by
// snowvillefinds.js (so by the place's stage chunk, never start-up): the lines join the phrase table (addPhrases) when the chunk arrives. Every line reads the same in both word
// sets except the two that take the Clan set's light flavour; no series word is in the everyday set. test/snowvillefinds.test.js checks both sets.
import { addPhrases } from '../clanphrases.js';
import { SNOWVILLE_HINTS } from '../snowvillepages.js';
import { seriesMode, SERIES_ON } from '../wordset.js';

// A line that takes the Clan set's flavour reads the set in use WHEN IT IS SAID (never kept).
const clan = (everyday, flavoured) => () => (seriesMode() === SERIES_ON ? flavoured : everyday);

export const SNOWVILLE_FIND_LINES = Object.freeze({
  'snowville.find.lantern': 'You found the Hill Lantern! It waits to be lit.',
  'snowville.find.pond': 'You found the Skating Pond! The ice hums under the skaters.',
  'snowville.find.hare': clan('You found the Shy Hare’s burrow! A long ear peeks out.', 'You found the Shy Hare’s burrow! A long ear peeks out, quiet as a patrol.'),
  'snowville.find.fir': 'You found the Great Fir! It is the tallest tree in the valley.',
  'snowville.find.snowman': 'You found the Snowman! He has a carrot nose and a happy grin.',
  'snowville.find.hearth': clan('You found the Warm Hearth! The fire crackles and your paws thaw.', 'You found the Warm Hearth! The fire crackles like a cosy nursery.'),
  'snowville.cone': 'a pinecone',
  'snowville.berry': 'a red winter berry',
});
addPhrases(SNOWVILLE_FIND_LINES);

export const HINTS = Object.freeze({
  sv1: 'A lantern stands at the foot of the sled hill.',
  sv2: 'Skaters glide on the frozen pond.',
  sv3: 'Stand very still near the fir wood and a hare may peek out.',
  sv4: 'The tallest fir grows at the far end of the village.',
  sv5: 'A snowman waits by the lane.',
  sv6: 'The brazier by the gate keeps paws warm.',
});
Object.assign(SNOWVILLE_HINTS, HINTS);
