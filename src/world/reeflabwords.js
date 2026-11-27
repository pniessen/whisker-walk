// The Sealab's words (milestone R13): the hatch's two prompts and the soft line on arriving. A lazy file, imported by the Reef's lab stage (so by its chunk, never
// start-up): they join the phrase table (addPhrases) when the chunk arrives. The same plain lines in both word sets; no series word is in any
// (test/reeflab.test.js checks both sets). "Tidewell Station" is the station's own name.
import { addPhrases } from '../clanphrases.js';

export const LINES = Object.freeze({
  'reef.lab.down': 'Climb down into Tidewell Station',
  'reef.lab.up': 'Climb up to the open sea',
  'reef.lab.in': 'Tidewell Station. Warm, dry and quiet.',
});

addPhrases(LINES);
