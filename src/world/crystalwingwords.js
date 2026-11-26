// The Crystal Cave's wing B lines (milestone C5): the sky and gold spark stones, the passages, the Heart Crystal and its light show, Lumi's gem. A lazy file,
// imported by crystal.js (so by the cave's chunk, never start-up): the lines join the phrase table (addPhrases) when the chunk arrives. Every line reads the same
// in both word sets; no series word is in the everyday set, no banned word anywhere
// (test/crystalmission.test.js checks the tables).
import { addPhrases } from '../clanphrases.js';

export const CRYSTAL_WING_LINES = Object.freeze({
  'crystal.sky.find': 'A blue glint across the pool! Hop the crystals or stroll round.',
  'crystal.sky.got': 'Take the spark stone to the great Blue crystal!',
  'crystal.sky.lit': 'The Blue crystal sings and Lumi\'s tail glows sky blue!',
  'crystal.gold.find': 'A golden glint shines in a cosy nook.',
  'crystal.gold.got': 'Take the spark stone to the great Gold crystal!',
  'crystal.gold.lit': 'The Gold crystal hums and Lumi\'s tail glows gold!',
  'crystal.passages.lit': 'Little lights run along the passages!',
  'crystal.heart.prompt': 'Wake the Heart Crystal',
  'crystal.heart.replay': 'Watch the light show again',
  'crystal.show.start': 'The Heart Crystal wakes. Look up!',
  'crystal.show.pay': 'The whole cave dances with light! Lumi glows again.',
  'crystal.gem': 'Lumi gives you a gem for your Glimmer Collar!',
});

addPhrases(CRYSTAL_WING_LINES);
