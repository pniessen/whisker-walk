// The Moon sled's lines (milestone M2): the offer at the rack, "Hop off" while she rides, the photo and journal subject's label, and the gentle lap count's word. A lazy file, imported by
// the station's stage (never the landing or start-up): the lines join the phrase table (addPhrases) when the stage arrives. The same plain lines in both word sets; no series word and no
// banned word (test/moonsled.test.js checks both sets). The journal pages' names are in src/moonpages.js and their hints in moonstationwords.js (mnsled, mnlap).
import { addPhrases } from '../clanphrases.js';

export const SLED_LINES = Object.freeze({
  'moon.ws.sled.board': 'Hop on the moon sled',
  'moon.ws.sled.off': 'Hop off',
  'moon.ws.sled.name': 'the Moon Sled',
  'moon.ws.sled.laps': 'Laps',
});

addPhrases(SLED_LINES);
