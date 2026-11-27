// The words of Tink on a walk (second story, milestone C4): the greeting, the thank-you at his nook, the charm line, the guide lines and the two journal hints. A lazy file (the
// crystaldeep stage chunk, never start-up). Both editions get the same plain lines (no series word, none of the banned words; Tink is a baby chime-bat who needs a way home, never stuck).
// Every id is a literal (the phrase table scan reads them); the names come from crystaldeepnames.js.
import { addPhrases } from '../clanphrases.js';
import { CRYSTAL_HINTS } from '../crystalpages.js';
import { NAMES } from './crystaldeepnames.js';

export const TINK_LINES = Object.freeze({
  'crystal.deep.tink.hello': `Say hello to ${NAMES.creature}`,
  'crystal.deep.tink.greet': `${NAMES.creature} peeps softly and flutters along beside you. Walk him to his hanging crystals above the Rose hall.`,
  'crystal.deep.tink.back': `${NAMES.creature} is sleepy again. Say hello, and he will follow you.`,
  'crystal.deep.tink.home': `${NAMES.creature} flutters up to his hanging crystals and sings three little chimes. Thank you!`,
  'crystal.deep.tink.charm': `${NAMES.creature} left you a ${NAMES.charm} to wear.`,
  'crystal.deep.tink.pay': `The ${NAMES.charm}`,
  'crystal.deep.guide.find': `${NAMES.creature} is curled up in his nest, past the glowing door: {at}.`,
  'crystal.deep.guide.walk': `Walk ${NAMES.creature} home to his hanging crystals above the Rose hall: {at}.`,
  'crystal.deep.guide.chip.find': `${NAMES.creature} is waiting`,
  'crystal.deep.guide.chip.walk': `${NAMES.creature} is on his way home`,
});

// the hints of the journal for the two pages this walk fills (static text, like crystalwords.js)
Object.assign(CRYSTAL_HINTS, {
  ccdeep: 'A hidden hall glows behind the singing wall.',
  cctink: 'A baby chime-bat needs help finding his way home.',
});

addPhrases(TINK_LINES);
