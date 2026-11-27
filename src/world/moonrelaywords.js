// The Moon's relay arc lines (milestone M3): the beeps Pip hears, the three parts, the console, the listening post and the Signal Tag. A lazy file, imported by the station's stage
// (never the landing or start-up): the lines join the phrase table (addPhrases) when the stage arrives. The same plain lines in both word sets; no series word and no banned word
// (test/moonrelay.test.js checks both). The journal pages' names are in src/moonpages.js and their hints in moonstationwords.js (mnsignal, mnrelay).
import { addPhrases } from '../clanphrases.js';

export const RELAY_LINES = Object.freeze({
  'moon.ws.relay.beep': 'Faint beeps! Look by the sled lane, in the station and at Earthrise Rock.',
  'moon.ws.relay.take': 'Pick up the relay part',
  'moon.ws.relay.got': (n) => `A relay part! ${n} of 3`,
  'moon.ws.relay.ready': 'All three parts! Go to the station\'s console.',
  'moon.ws.relay.wake': 'Wake the station',
  'moon.ws.relay.awake': 'The station hums awake! Listen at Earthrise Rock.',
  'moon.ws.relay.listen': 'Listen for the far station',
  'moon.ws.relay.answer': 'The far station answers with a happy beep! A Signal Tag for you.',
  'moon.ws.relay.pay': 'The far station saying hello back',
  'moon.ws.relay.friend': 'A friend fixed the relay station.',
  'moon.ws.relay.photo': 'the listening post',
});

addPhrases(RELAY_LINES);
