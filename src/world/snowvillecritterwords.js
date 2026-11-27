// Snowville's friendly-life words (milestone V4: the skating otters, the lamp robin, the sleeping little fox): what the walk says when she spots one (the album's label and the critter
// toast) and the three journal pages' hints. A lazy file, imported by snowvillecritters.js (so by the place's stage chunk, never start-up): the lines join the phrase table
// (addPhrases) and the hints join SNOWVILLE_HINTS (src/snowvillepages.js) when the chunk arrives. The everyday set is the plain base; the Clan set adds light flavour only. No series
// word is in the everyday set, and none of the banned words (dark, lost forever, trapped, stuck, collapse, scary) is in either. test/snowvillecritters.test.js checks both sets.
import { addPhrases } from '../clanphrases.js';
import { SNOWVILLE_HINTS } from '../snowvillepages.js';
import { seriesMode, SERIES_ON } from '../wordset.js';

// A line that takes the Clan set's flavour reads the set in use WHEN IT IS SAID (never kept).
const clan = (everyday, flavoured) => () => (seriesMode() === SERIES_ON ? flavoured : everyday);

export const LINES = Object.freeze({
  'snowville.life.otter': clan('a skating otter', 'a skating otter, quick as a river patrol'),
  'snowville.life.robin': clan('a friendly robin', 'a friendly robin, bright as a berry'),
  'snowville.life.fox': clan('a sleepy little fox', 'a sleepy little fox, curled up like a nursery kitten'),
});
addPhrases(LINES);

export const HINTS = Object.freeze({
  sw1: 'Otters glide in slow circles on the frozen pond.',
  sw2: 'A robin hops between the lamp posts by the gate.',
  sw3: 'A little fox naps beside the warm brazier.',
});
Object.assign(SNOWVILLE_HINTS, HINTS);
