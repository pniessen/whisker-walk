// Snowville's words (milestone V1: the one soft line of the cheeks theme; the story, the finds and the errand come with their milestones).
// A lazy file: they join the phrase table (src/clanphrases.js, addPhrases) when the place's chunk arrives, so the start-up download does not carry them (the Reef's way).
// Every line reads the same in both word sets; no series word is in the everyday set.
import { addPhrases } from '../clanphrases.js';

export const LINES = Object.freeze({
  'snowville.cold': 'Brrr! Warm up by the fire?',
  'snowville.warm': 'Ahh, toasty!',
});
addPhrases(LINES);
