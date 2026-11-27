// The Treehouse village's words (milestone T2: Nutmeg, the first letter and the Bakery; the finds, the supper and the errand come with their milestones). A lazy file: they join
// the phrase table (src/clanphrases.js, addPhrases) when the place's chunk arrives, so the start-up download does not carry them (the Reef's way). Every line reads the same in
// both word sets (the family's and the everyday one); no series word is in any of them.
import { addPhrases } from '../clanphrases.js';

// The characters' names, in ONE table: the squirrel's is a placeholder until the daughter names her (a rename is this one edit).
export const NAMES = Object.freeze({ nutmeg: 'Nutmeg' });
const N = NAMES.nutmeg;

export const LINES = Object.freeze({
  'treehouse.nutmeg.hello': 'A little red squirrel waves her bushy tail. Say hello!',
  'treehouse.nutmeg.prompt': `Say hello to ${N}`,
  'treehouse.nutmeg.met': `${N} has three letters to post, and her basket is too heavy. Meow and she will show you the way.`,
  'treehouse.letter.prompt': 'Pick up the letter',
  'treehouse.letter.find': 'Look for a letter in the post box at the roots.',
  'treehouse.letter.got': 'Carry the letter up to the Bakery!',
  'treehouse.letter.give': 'Post the letter',
  'treehouse.bakery.delivered': `The Bakery window glows warm! ${N} does a happy flip.`,
});
addPhrases(LINES);
