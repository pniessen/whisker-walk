// The words of Tink errand of the day (second story, milestone C6): what the day asks, each prompt, the pay and the album toast, and the guide lines. A lazy file (the crystaldeep stage chunk,
// never start-up). Both editions read the same plain lines (no series word, none of the banned words, nothing scolds: there is no failing here). Every id is a literal (the phrase table
// scan reads them); the names come from crystaldeepnames.js.
import { addPhrases } from '../clanphrases.js';
import { CRYSTAL_HINTS } from '../crystalpages.js';
import { NAMES } from './crystaldeepnames.js';

export const DEEP_ERRAND_LINES = Object.freeze({
  'crystal.deep.errand.tune': `${NAMES.creature} would love to hear a tiny tune on the chime bars in ${NAMES.place}.`,
  'crystal.deep.errand.prisms': `${NAMES.creature} has picked three colours. Can you turn each prism in ${NAMES.place} to match its gem?`,
  'crystal.deep.errand.moss': `${NAMES.creature} would like a soft moss pad for his nest.`,
  'crystal.deep.errand.hide': `${NAMES.creature} is playing hide and seek! Look for a ring of glints.`,
  'crystal.deep.errand.tune.prompt': 'Hear the little tune',
  'crystal.deep.errand.tune.listen': 'Listen, then step on the chime bars in the same order.',
  'crystal.deep.errand.moss.pick': 'Pick up the moss pad',
  'crystal.deep.errand.moss.got': 'Got it! Take it to the nest.',
  'crystal.deep.errand.moss.give': 'Set the moss pad in the nest',
  'crystal.deep.errand.hide.prompt': 'Peek inside the glints',
  'crystal.deep.errand.pay': `Thank you! ${NAMES.creature} gives you a chime.`,
  'crystal.deep.errand.chime': 'A new Chime Charm for your album!',
  'crystal.deep.errand.full': 'Your Chime Charm album is full. What a lovely song!',
  'crystal.deep.errand.guide': `${NAMES.creature} has a little errand today: {at}.`,
  'crystal.deep.errand.guide.chip': `${NAMES.creature} has an errand`,
});

Object.assign(CRYSTAL_HINTS, { ccchimes: 'Tink gives a Chime Charm for each little errand.' });

addPhrases(DEEP_ERRAND_LINES);
