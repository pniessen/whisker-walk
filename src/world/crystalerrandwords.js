// Lumi's errand lines (milestone C7): what the day's errand asks, what each prompt says and what the pay says. A lazy file, imported by crystalerrandlive.js (so by the cave's
// chunk, never start-up): the lines join the phrase table (addPhrases) when the chunk arrives. The everyday set is the plain base; the Clan set adds light flavour to the pay
// line only. No series word is in the everyday set and no line scolds: there is no failing here. test/crystalerrand.test.js checks both sets.
import { addPhrases } from '../clanphrases.js';
import { seriesMode, SERIES_ON } from '../wordset.js';

// A line that takes the Clan set's flavour reads the set in use WHEN IT IS SAID (never kept).
const clan = (everyday, flavoured) => () => (seriesMode() === SERIES_ON ? flavoured : everyday);

export const CRYSTAL_ERRAND_LINES = Object.freeze({
  'crystal.errand.glints': 'Lumi would love three little glints from the floor.',
  'crystal.errand.relight': 'One crystal cluster has gone dim. Can you wake it?',
  'crystal.errand.follow': 'Follow the little spark through the ring of crystals.',
  'crystal.errand.change': 'One glint has changed colour. Can you find it?',
  'crystal.errand.bug': 'A sleepy glow-bug would love a small smooth stone.',
  'crystal.errand.glove': 'Someone dropped a glove. Can you bring it to Lumi?',
  'crystal.errand.give.prompt': 'Give it to Lumi',
  'crystal.errand.glints.need': 'Lumi is hoping for three glints.',
  'crystal.errand.pick.prompt': 'Pick it up',
  'crystal.errand.pick.got': 'Got it! Take it along.',
  'crystal.errand.bug.prompt': 'Set the stone by the bug',
  'crystal.errand.relight.prompt': 'Wake the crystals',
  'crystal.errand.pay': clan('Thank you! Lumi gives you a crystal rubbing.', 'Thank you! Lumi gives you a crystal rubbing, with a star of Silverpelt on it.'),
  'crystal.errand.rubbing': 'A new rubbing for your album!',
  'crystal.errand.full': 'Your rubbing album is full. What a lovely collection!',
});

addPhrases(CRYSTAL_ERRAND_LINES);
