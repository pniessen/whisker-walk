// Snowville's friendly strays' lines (round two): what the walk says the first time she comes near each of the four (the hearth's white cat, the sled hill's grey cat, the Great Fir's ginger cat, the
// porch's tortoiseshell cat). A lazy file, imported by snowvillestrays.js (so by the place's stage chunk, never start-up). The same plain line in both word sets; the Clan set adds light flavour only. No
// series word is in the everyday set and none of the banned words (dark, lost forever, trapped, stuck, collapse, scary) is in either. test/snowvillestrays.test.js checks both sets.
import { addPhrases } from '../clanphrases.js';
import { seriesMode, SERIES_ON } from '../wordset.js';

// A line that takes the Clan set's flavour reads the set in use WHEN IT IS SAID (never kept).
const clan = (everyday, flavoured) => () => (seriesMode() === SERIES_ON ? flavoured : everyday);

export const LINES = Object.freeze({
  'snowville.stray.hearth': clan('a white cat warming up by the hearth', 'a white cat warming her paws by the hearth, snug as a nursery kitten'),
  'snowville.stray.hill': clan('a grey cat watching the sleds on the hill', 'a grey cat watching the sleds, calm as a night patrol'),
  'snowville.stray.fir': clan('a ginger cat curled up under the Great Fir', 'a ginger cat curled up under the Great Fir, bright as a sunrise'),
  'snowville.stray.porch': clan('a tortoiseshell cat on a cosy porch step', 'a tortoiseshell cat on a cosy porch step, dozing like an old storyteller'),
});
addPhrases(LINES);
