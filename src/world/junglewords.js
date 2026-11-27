// The Jungle lodge's words (milestone J1: the two soft lines of the weather; the story, the finds and the errand come with their milestones).
// A lazy file: they join the phrase table (src/clanphrases.js, addPhrases) when the place's chunk arrives, so the start-up download does not carry them (the Reef's way).
// Every line reads the same in both word sets (the family's and the everyday one); no series word is in any of them.
import { addPhrases } from '../clanphrases.js';

export const LINES = Object.freeze({
  'jungle.rain': 'A warm shower! The veranda is dry.',
  'jungle.rainbow': 'Look, a rainbow!',
});
addPhrases(LINES);
