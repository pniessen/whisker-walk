// The openable Treasure Chest's lines (reefchestlive.js, the Reef's wreck stage): the prompt, what the surprise says and the line when the crown goes on. A lazy
// file: the lines join the phrase table (addPhrases) when the stage arrives. Plain words in both sets (no series word in them; test/reefchest.test.js checks).
import { addPhrases } from '../clanphrases.js';

export const CHEST_LINES = Object.freeze({
  'reef.chest.prompt': 'Open the chest',
  'reef.chest.open': 'Inside the chest: a tiny crown of pearls! It is yours.',
  'reef.chest.on': 'The Pearl Crown is on. How it shines!',
});

addPhrases(CHEST_LINES);
