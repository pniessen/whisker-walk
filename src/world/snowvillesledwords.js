// Snowville's sled run's lines (round two): the offer at the top of the hill, "Hop off" while she rides, and the landing's cheer. A lazy file, imported by the sled's live (snowvillesledlive.js, so by the
// place's stage chunk, never start-up). The same plain lines in both word sets; no series word and no banned word (dark, lost forever, trapped, stuck, collapse, scary) in either; test/snowvillesled.test.js checks both.
import { addPhrases } from '../clanphrases.js';

export const SLED_LINES = Object.freeze({
  'snowville.sled.board': 'Take the sled down the hill',
  'snowville.sled.off': 'Hop off',
  'snowville.sled.land': 'Whoosh! What a ride!',
});

addPhrases(SLED_LINES);
