// The mounts' words (milestone R12): the two "hop on" offers, "hop off" and one soft line the first time on each. A lazy file, imported by the Reef's ride stage
// (so by its chunk, never start-up): they join the phrase table (addPhrases) when the chunk arrives. The same plain lines in both word sets; no series word is
// in any (test/reefride.test.js checks both sets).
import { addPhrases } from '../clanphrases.js';

export const LINES = Object.freeze({
  'reef.ride.scooter': 'Hop on the Sea Scooter',
  'reef.ride.saucer': 'Climb into the Diving Saucer',
  'reef.ride.off': 'Hop off',
  'reef.ride.tip.scooter': 'Steer with the stick. Hold kick to rise.',
  'reef.ride.tip.saucer': 'Slow and smooth. Hold kick to rise.',
});

addPhrases(LINES);
