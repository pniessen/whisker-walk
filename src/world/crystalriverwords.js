// The river boat's two lines (milestone C1): the offer at the dock and "Hop off". A lazy file, imported by the cave's wing C stage (never start-up): they join the phrase
// table (addPhrases) when the stage arrives. The same plain lines in both word sets; no series word and no banned word (test/crystalriver.test.js checks both sets).
import { addPhrases } from '../clanphrases.js';

export const RIVER_LINES = Object.freeze({
  'crystal.wc.boat.board': 'Hop in the little boat',
  'crystal.wc.boat.off': 'Hop off',
});

addPhrases(RIVER_LINES);
