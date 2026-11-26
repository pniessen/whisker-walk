// The Crystal Cave's find lines (milestone C3): what a discovery says the first time ever, and the two collectibles' names. A lazy file, imported by
// crystalfinds.js (so by the cave's chunk, never start-up): they join the phrase table (addPhrases) when the chunk arrives. The everyday set is the plain
// base; the Clan set adds light flavour only. No series word is in the everyday set; test/crystalfinds.test.js checks both sets.
import { addPhrases } from '../clanphrases.js';
import { seriesMode, SERIES_ON } from '../wordset.js';

// A line that takes the Clan set's flavour reads the set in use WHEN IT IS SAID (never kept).
const clan = (everyday, flavoured) => () => (seriesMode() === SERIES_ON ? flavoured : everyday);

export const CRYSTAL_FIND_LINES = Object.freeze({
  'crystal.find.rose': clan('You found the Rose Crystal! It glows a soft pink.', 'You found the Rose Crystal! It glows like a sunrise over the camp.'),
  'crystal.find.echo': 'You found the Echo Wall! It hums back to you.',
  'crystal.find.pool': 'You found the Glow Pool! The water shimmers blue.',
  'crystal.find.gold': 'You found the Gold Vein! A golden stripe shines in the rock.',
  'crystal.find.garden': clan('You found the Crystal Garden! Tiny crystals sprout like flowers.', 'You found the Crystal Garden! Tiny crystals sprout like fresh heather.'),
  'crystal.find.heart': 'You found the Heart Crystal! It beats with a gentle light.',
  'crystal.bit': 'a tiny crystal',
  'crystal.pebble': 'a smooth pebble',
});

addPhrases(CRYSTAL_FIND_LINES);
