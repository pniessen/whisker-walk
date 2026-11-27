// The Jungle lodge's friendly-life words (milestone J4: the bright macaws, the rain frogs, the big-beaked toucan): what the walk says when she spots one (the album's label and the
// critter toast) and the three life pages' hints. A lazy file, imported by junglecritters.js (so by the place's stage chunk, never start-up): the lines join the phrase table
// (addPhrases) and the hints join JUNGLE_HINTS (src/junglepages.js) when the chunk arrives. The everyday set is the plain base; the Clan set adds light flavour only. No series
// word is in the everyday set, and none of the banned words (dark, lost forever, trapped, stuck, collapse, scary) is in either. test/junglecritters.test.js checks both sets.
import { addPhrases } from '../clanphrases.js';
import { JUNGLE_HINTS } from '../junglepages.js';
import { seriesMode, SERIES_ON } from '../wordset.js';

// A line that takes the Clan set's flavour reads the set in use WHEN IT IS SAID (never kept).
const clan = (everyday, flavoured) => () => (seriesMode() === SERIES_ON ? flavoured : everyday);

export const LINES = Object.freeze({
  'jungle.life.macaw': clan('a bright macaw', 'a bright macaw, loud as a gathering call'),
  'jungle.life.frog': clan('a singing rain frog', 'a singing rain frog, sleek as a river cat'),
  'jungle.life.toucan': clan('a big-beaked toucan', 'a big-beaked toucan, bold and bright'),
});
addPhrases(LINES);

export const HINTS = Object.freeze({
  jw1: 'Bright macaws flap between the tall trees near the lodge.',
  jw2: 'Little frogs sit on the river banks and sing when it rains.',
  jw5: 'A toucan with a huge orange beak rests high in a tree.',
});
Object.assign(JUNGLE_HINTS, HINTS);
