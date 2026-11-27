// Jungle wing B's words (milestone J5): the banana bunch over the log bridge, the cacao pod on the low branch, the table, the Rain Supper and the Rain Lily Charm, and the journal hints
// for the two story pages (the three fruit, the supper). A lazy file, imported by junglewinglive.js (so by the place's stage chunk, never start-up): the lines join the phrase table
// (addPhrases) and the hints join JUNGLE_HINTS (src/junglepages.js) when the chunk arrives. Every line reads the same in both word sets (the family's and the everyday one); no series
// word is in any, and none of the banned words (dark, lost forever, trapped, stuck, collapse, scary) is in either. test/junglewing.test.js checks both sets.
// The charm's NAME ('Rain Lily Charm', a placeholder) is in src/progression.js's catalog; the line that says it is here: rename both together.
import { addPhrases } from '../clanphrases.js';
import { JUNGLE_HINTS } from '../junglepages.js';
import { NAMES } from './junglewords.js';

const N = NAMES.mossy;

export const WING_LINES = Object.freeze({
  'jungle.banana.find': 'Look for a banana bunch across the log bridge.',
  'jungle.banana.got': 'Carry the bananas back over the log bridge to the table!',
  'jungle.cacao.find': 'A cacao pod rests on the low branch by the canopy walk. Hop up and fetch it!',
  'jungle.cacao.got': 'Carry the cacao pod down to the kitchen table!',
  'jungle.table.set.prompt': 'Set the table',
  'jungle.table.set': `${N} lays out the plates and the cloth. The supper is ready!`,
  'jungle.supper.prompt': 'Begin the Rain Supper',
  'jungle.supper.replay': 'Share the supper again',
  'jungle.supper.start': 'The Rain Supper begins! Listen to the frogs sing.',
  'jungle.supper.pay': 'The Rain Supper! Everyone is happy and full.',
  'jungle.charm': `${N} hangs a Rain Lily Charm on your collar!`,
});
addPhrases(WING_LINES);

export const HINTS = Object.freeze({
  jl7: 'Three kinds of fruit grow in three parts of the forest.',
  jl8: `When the table is set, ${N} holds a supper in the warm rain.`,
});
Object.assign(JUNGLE_HINTS, HINTS);
