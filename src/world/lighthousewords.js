// Lighthouse Point's words (milestone 2: the lamp job). A lazy file: they join the phrase table
// (src/clanphrases.js, addPhrases) when the place's chunk arrives, so the start-up download does not carry them
// (the My cat sheet's way, src/ui/catloginwords.js). The same in every word set: a set that needs its own wording
// puts the id in its PHRASES (src/offclanwords.js) and that wins. Both sets are checked by
// test/lighthouselamp.test.js. Milestone 3 adds the rest of the place's lines here.
import { addPhrases } from '../clanphrases.js';

export const LINES = Object.freeze({
  // the lamp job: the lever's prompt, the line it pays under, and the far ship's answer
  'lighthouse.lever.prompt': 'E — pull the lamp lever',
  'lighthouse.lamp.lit': 'The lamp is lit! The beam sweeps over the sea. 🔦',
  'lighthouse.lamp.ship': 'Far away, a ship toots its horn. Thank you! 🚢',
});

addPhrases(LINES);
