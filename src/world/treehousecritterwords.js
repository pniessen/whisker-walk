// The Treehouse village's friendly-life words (milestone T4: the rail songbirds, the sleepy owl, the firefly dance): what the walk says when she spots one (the album's label and the
// critter toast) and the three life pages' hints. A lazy file, imported by treehousecritters.js (so by the place's stage chunk, never start-up): the lines join the phrase table
// (addPhrases) and the hints join TREEHOUSE_HINTS (src/treehousepages.js) when the chunk arrives. The everyday set is the plain base; the Clan set adds light flavour only. No series
// word is in the everyday set, and none of the banned words (dark, lost forever, trapped, stuck, collapse, scary) is in either. test/treehousecritters.test.js checks both sets.
import { addPhrases } from '../clanphrases.js';
import { TREEHOUSE_HINTS } from '../treehousepages.js';
import { seriesMode, SERIES_ON } from '../wordset.js';

// A line that takes the Clan set's flavour reads the set in use WHEN IT IS SAID (never kept).
const clan = (everyday, flavoured) => () => (seriesMode() === SERIES_ON ? flavoured : everyday);

export const LINES = Object.freeze({
  'treehouse.life.bird': clan('a rail songbird', 'a rail songbird, sweet as a dawn patrol call'),
  'treehouse.life.owl': clan('a sleepy owl', 'a sleepy owl, wise and watchful'),
  'treehouse.life.firefly': clan('a dancing firefly', 'a dancing firefly, glowing like a tiny star'),
});
addPhrases(LINES);

export const HINTS = Object.freeze({
  tl1: 'Songbirds hop along the railings of the decks.',
  tl2: 'A sleepy owl dozes by the bell at the very top.',
  tl3: 'Fireflies drift and blink among the leaves.',
});
Object.assign(TREEHOUSE_HINTS, HINTS);
