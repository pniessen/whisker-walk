// The Treehouse village's four tree cats' words: one short, friendly hello for each (the cat on the Bakery cushion, the cat on the far platform's rail, the cat on the oak's limb, the cat in the
// oak's hollow). A lazy file, imported by treehousecats.js (so by the place's stage chunk, never start-up): the lines join the phrase table (addPhrases) when the chunk arrives. The lines are
// short on purpose (they are said in the walk's speech bubble, which holds about fifteen letters to a line). The same plain words serve both word sets; no series word, no name from the books and
// none of the banned words (dark, lost forever, trapped, stuck, collapse, scary) is in them. test/treehousecats.test.js checks it.
import { addPhrases } from '../clanphrases.js';

export const LINES = Object.freeze({
  'treehouse.cat.hello.cushion': 'Mrrp! Hello!',
  'treehouse.cat.hello.rail': 'Nice view, huh?',
  'treehouse.cat.hello.limb': 'Hi, climber!',
  'treehouse.cat.hello.hollow': 'Peekaboo!',
});
addPhrases(LINES);
