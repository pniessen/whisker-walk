// Marlo's errand lines (milestone R7): what the day's errand asks, what each prompt says and what the pay says. A lazy file, imported by reeferrandlive.js (so by the Reef's
// chunk, never start-up): the lines join the phrase table (addPhrases) when the chunk arrives. The everyday set is the plain base; the Clan set adds light flavour to the pay
// line only. No series word is in the everyday set and no line scolds: there is no failing here. test/reeferrand.test.js checks both sets.
import { addPhrases } from '../clanphrases.js';
import { seriesMode, SERIES_ON } from '../wordset.js';

// A line that takes the Clan set's flavour reads the set in use WHEN IT IS SAID (never kept).
const clan = (everyday, flavoured) => () => (seriesMode() === SERIES_ON ? flavoured : everyday);

export const LINES = Object.freeze({
  'reef.errand.glass': 'Marlo would love three pieces of sea-glass.',
  'reef.errand.school': 'Follow the little fish through the kelp ring.',
  'reef.errand.shell': 'One shell has changed colour. Can you find it?',
  'reef.errand.rings': 'Float through five bubble rings, one after another.',
  'reef.errand.snail': 'A sleepy snail would love a little hat shell.',
  'reef.errand.glove': 'Someone lost a glove. Can you bring it to Marlo?',
  'reef.errand.give.prompt': 'Give it to Marlo',
  'reef.errand.glass.need': 'Marlo is hoping for three pieces of sea-glass.',
  'reef.errand.pick.prompt': 'Pick it up',
  'reef.errand.pick.got': 'Got it! Take it along.',
  'reef.errand.snail.prompt': 'Set the hat shell by the snail',
  'reef.errand.ring': 'Pop! On to the next ring.',
  'reef.errand.pay': clan('Thank you! Marlo sends you a postcard of the reef.', 'Thank you! Marlo sends you a postcard of the reef, with a star of Silverpelt on it.'),
  'reef.errand.postcard': 'A new postcard for your album!',
  'reef.errand.full': 'Your postcard album is full. What a lovely collection!',
});

addPhrases(LINES);
