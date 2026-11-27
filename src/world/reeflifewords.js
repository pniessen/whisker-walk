// The Reef's sea-life words (seals, octopuses, dolphins): what the walk says when she spots one (the album's label and the critter toast) and the journal
// pages' hints. A lazy file, imported by reefsealslive.js (so by the Reef's chunk, never start-up): the lines join the phrase table (addPhrases) and the hints
// join REEF_HINTS (src/reefpages.js) when the chunk arrives. The everyday set is the plain base; the Clan set adds light flavour only. No series word is in the
// everyday set; test/reefseals.test.js checks both sets.
import { addPhrases } from '../clanphrases.js';
import { REEF_HINTS } from '../reefpages.js';
import { seriesMode, SERIES_ON } from '../wordset.js';

// A line that takes the Clan set's flavour reads the set in use WHEN IT IS READ (never kept).
const clan = (everyday, flavoured) => () => (seriesMode() === SERIES_ON ? flavoured : everyday);

export const LINES = Object.freeze({
  'reef.life.seal': clan('a curious seal', 'a curious seal, sleek as river-water'),
  'reef.life.octopus': clan('a shy octopus', 'a shy octopus, colours drifting'),
  'reef.life.dolphin': clan('a dolphin family', 'a dolphin family, leaping through starlit water'),
  'reef.life.jelly': clan('a moon jellyfish', 'a moon jellyfish, glowing like a small moon'),
  'reef.life.clown': clan('a clownfish pair', 'a clownfish pair, bright as sunrise'),
  'reef.life.horse': clan('a kelp seahorse', 'a kelp seahorse, holding on tight'),
  'reef.life.manta': clan('a gliding manta', 'a gliding manta, wings like a night sky'),
  'reef.life.whale': clan('a gentle whale', 'a gentle whale, big as a hill'),
  'reef.life.moray': clan('a smiling moray', 'a smiling moray, grinning from its crack'),
  'reef.life.squid': clan('a school of squid', 'a school of squid, blushing pink'),
});

export const HINTS = Object.freeze({
  rfseal: 'Seals play in the open water. One naps on a rock by the sandy flats.',
  rfoctopus: 'Look for a shy octopus peeking out of a rock den.',
  rfdolphin: 'A dolphin family glides high above the reef.',
  rfjelly: 'Soft jellyfish drift and glow. Look over the Deep and the Glow Cave.',
  rfclown: 'Clownfish pairs weave round the Coral Garden.',
  rfhorse: 'Seahorses hold on to the tall kelp.',
  rfmanta: 'Mantas glide in wide, slow loops.',
  rfwhale: 'A gentle whale passes high over the Deep now and then.',
  rfmoray: 'A smiling moray peeks from a rock crack. Try the Coral Garden and the boat.',
  rfsquid: 'A school of squid jets and glides in the open water.',
});

addPhrases(LINES);
Object.assign(REEF_HINTS, HINTS);
