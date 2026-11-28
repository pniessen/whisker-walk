// The seal ride's words (the Reef): the offer, "hop off", a soft first line and the "Wheee!" at the end of a ride, and the journal line for the first ride ever.
// A lazy file, imported by the Reef's chunk (never start-up); the same plain lines in both word sets, no series word in any (test/reefsealride.test.js).
import { addPhrases } from '../clanphrases.js';

export const LINES = Object.freeze({
  'reef.sealride.on': 'Ride the seal',
  'reef.sealride.off': 'Hop off the seal',
  'reef.sealride.tip': 'Hold on! Steer gently with the stick.',
  'reef.sealride.end': 'Wheee! That was a splashy ride!',
  'reef.sealride.find': 'You rode a seal! It paddled you round the reef.',
});

addPhrases(LINES);
