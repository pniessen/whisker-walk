// The Treehouse village's find lines and journal hints (milestone T3): what a discovery says the first time ever, the two collectibles' names and the six pages' hints. A lazy file,
// imported by treehousefinds.js (so by the place's stage chunk, never start-up): the lines join the phrase table (addPhrases) when the chunk arrives. Every line reads the same in
// both word sets except the two that take the family's set's light flavour; no series word is in the everyday set. test/treehousefinds.test.js checks both sets.
import { addPhrases } from '../clanphrases.js';
import { TREEHOUSE_HINTS } from '../treehousepages.js';
import { seriesMode, SERIES_ON } from '../wordset.js';

// A line that takes the family's set's flavour reads the set in use WHEN IT IS SAID (never kept).
const flavoured = (everyday, family) => () => (seriesMode() === SERIES_ON ? family : everyday);

export const TREEHOUSE_FIND_LINES = Object.freeze({
  'treehouse.find.bakery': 'You found the Cosy Bakery! Warm bread smells float out of the window.',
  'treehouse.find.books': 'You found the Little Bookshop! Every shelf is full of stories.',
  'treehouse.find.bell': flavoured('You found the Bell Tower! The bell hangs ready to ring.', 'You found the Bell Tower! The bell hangs ready, like a signal for a gathering.'),
  'treehouse.find.bridge': 'You found the Rope Bridge! It sways a little under your paws.',
  'treehouse.find.lookout': flavoured('You found the Lookout! The leaves roll away like a green sea.', 'You found the Lookout! The leaves roll away like a green sea, and the whole territory is in view.'),
  'treehouse.find.acorn': 'You found the Giant Acorn! It is as big as a pumpkin.',
  'treehouse.acorn': 'an acorn',
  'treehouse.leaf': 'a golden leaf',
});
addPhrases(TREEHOUSE_FIND_LINES);

export const HINTS = Object.freeze({
  th1: 'Follow the warm smell of bread to the low deck.',
  th2: 'Stories wait on a deck in the middle of the leaves.',
  th3: 'Stand still beneath the bell at the very top.',
  th4: 'Stop in the middle of the swaying bridge.',
  th5: 'A quiet corner of the crown looks out over everything.',
  th6: 'Something very round and very big lies under the far branches.',
});
Object.assign(TREEHOUSE_HINTS, HINTS);
