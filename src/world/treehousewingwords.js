// Treehouse wing B's words (milestone T5): the second and third letters, the Bookshop and the Bell Tower, the bell, the firefly supper, the Acorn Locket, and the journal hints for the two
// story pages (the three letters, the supper). A lazy file, imported by treehousewinglive.js (so by the place's stage chunk, never start-up): the lines join the phrase table (addPhrases) and
// the hints join TREEHOUSE_HINTS (src/treehousepages.js) when the chunk arrives. Every line reads the same in both word sets (the family's and the everyday one); no series word is in any,
// and none of the banned words (dark, lost forever, trapped, stuck, collapse, scary) is in either. test/treehousewing.test.js checks both sets.
import { addPhrases } from '../clanphrases.js';
import { TREEHOUSE_HINTS } from '../treehousepages.js';
import { NAMES } from './treehousewords.js';

const N = NAMES.nutmeg;

export const WING_LINES = Object.freeze({
  'treehouse.basket.find': 'Look for a letter in the basket at the roots.',
  'treehouse.bag.find': 'Look for a letter in the mail bag on the Bookshop deck.',
  'treehouse.basket.got': 'Carry the letter up the rope bridge to the Bookshop!',
  'treehouse.bag.got': 'Carry the letter up to the Bell Tower at the very top!',
  'treehouse.bookshop.delivered': `The Bookshop window glows! ${N} does a happy flip.`,
  'treehouse.belltower.delivered': `The Bell Tower window glows! ${N} claps her paws.`,
  'treehouse.bell.prompt': 'Ring the bell',
  'treehouse.bell.rung': 'Ding! Every window in the tree glows, and little lights come on along the bridges.',
  'treehouse.supper.prompt': 'Begin the firefly supper',
  'treehouse.supper.replay': 'Light the supper again',
  'treehouse.supper.start': 'The firefly supper begins! Watch the lanterns glow.',
  'treehouse.supper.pay': 'The firefly supper! The whole tree is glowing.',
  'treehouse.locket': `${N} hangs an Acorn Locket on your collar!`,
});
addPhrases(WING_LINES);

export const HINTS = Object.freeze({
  th7: 'Three letters wait to be carried up to three houses.',
  th8: `When the bell has rung, ${N} sets a supper under the fireflies.`,
});
Object.assign(TREEHOUSE_HINTS, HINTS);
