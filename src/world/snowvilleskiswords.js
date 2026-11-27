// Snowville's ski slope's lines (round three): the offer at the rack, "Take the skis off" while she glides, the foot's cheer and the praise for a clean run. A lazy file, imported by the slope's live
// (snowvilleskislive.js, so by the place's stage chunk, never start-up). The same plain lines in both word sets; no series word and no banned word (dark, lost forever, trapped, stuck, collapse,
// scary) in either; test/snowvilleskis.test.js checks both.
import { addPhrases } from '../clanphrases.js';

export const SKI_LINES = Object.freeze({
  'snowville.skis.on': 'Put on the skis',
  'snowville.skis.off': 'Take the skis off',
  'snowville.skis.land': 'Swish! Lovely turns!',
  'snowville.skis.all': 'Every gate! What a skier!',
  'snowville.skis.paws': 'A warm cheer from the slope: +3 paws',
});

addPhrases(SKI_LINES);
