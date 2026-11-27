// The Jungle lodge's words (milestone J1: the two soft lines of the weather; J2: Mossy, the first fruit and the kitchen table; the finds, the supper and the errand come with their
// milestones). A lazy file: they join the phrase table (src/clanphrases.js, addPhrases) when the place's chunk arrives, so the start-up download does not carry them (the Reef's way).
// Every line reads the same in both word sets (the family's and the everyday one); no series word is in any of them.
import { addPhrases } from '../clanphrases.js';

// The characters' names, in ONE table: the tortoise's is a placeholder until the daughter names her (a rename is this one edit).
export const NAMES = Object.freeze({ mossy: 'Mossy' });
const N = NAMES.mossy;

export const LINES = Object.freeze({
  'jungle.rain': 'A warm shower! The veranda is dry.',
  'jungle.rainbow': 'Look, a rainbow!',
  'jungle.mossy.hello': 'An old tortoise smiles from the veranda. Say hello!',
  'jungle.mossy.prompt': `Say hello to ${N}`,
  'jungle.mossy.met': `${N} is planning a Rain Supper and needs three kinds of fruit. Meow and she will show you the way.`,
  'jungle.fruit.prompt': 'Pick up the fruit',
  'jungle.fruit.find': 'Look for a ripe mango under the mango tree in the grove.',
  'jungle.fruit.got': 'Carry the mango to the kitchen table!',
  'jungle.fruit.give': 'Put it on the table',
  'jungle.table.delivered': `The table glows warm! ${N} nods happily.`,
});
addPhrases(LINES);
