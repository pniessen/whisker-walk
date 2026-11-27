// The Jungle lodge's find lines and journal hints (milestone J3): what a discovery says the first time ever, the two collectibles' names and the six pages' hints. A lazy file, imported by
// junglefinds.js (so by the place's stage chunk, never start-up): the lines join the phrase table (addPhrases) when the chunk arrives. Every line reads the same in both word sets
// except the one that takes the family's set's light flavour; no series word is in the everyday set. test/junglefinds.test.js checks both sets.
import { addPhrases } from '../clanphrases.js';
import { JUNGLE_HINTS } from '../junglepages.js';
import { seriesMode, SERIES_ON } from '../wordset.js';

// A line that takes the family's set's flavour reads the set in use WHEN IT IS SAID (never kept).
const flavoured = (everyday, family) => () => (seriesMode() === SERIES_ON ? family : everyday);

export const JUNGLE_FIND_LINES = Object.freeze({
  'jungle.find.lodge': flavoured('You found the Stilt Lodge! The veranda smells of warm wood and ripe fruit.', 'You found the Stilt Lodge! The veranda is as cosy as a nursery nest.'),
  'jungle.find.river': 'You found the Slow River! The brown water hums past your paws.',
  'jungle.find.sloth': 'You found the Sleepy Sloth! It smiles slowly from its branch.',
  'jungle.find.canopy': 'You found the Canopy Walk! Bright birds chatter high in the leaves.',
  'jungle.find.rainbow': 'You found the Rainbow Spot! A soft arc of colour rises over the trees.',
  'jungle.find.orchid': 'You found the Hidden Orchid! Its petals glow softly in the shade.',
  'jungle.berry': 'a jungle berry',
  'jungle.feather': 'a bright feather',
});
addPhrases(JUNGLE_FIND_LINES);

export const HINTS = Object.freeze({
  jl1: 'Stand still on the veranda by the kitchen table.',
  jl2: 'Stop in the shallows and listen to the water.',
  jl3: 'A slow, sleepy friend hangs in a tree on the west side.',
  jl4: 'Wait at the foot of the rise where the walkway begins.',
  jl5: 'A quiet spot at the north edge, where rainbows rise.',
  jl6: 'Something shy blooms in the ferns far to the east.',
});
Object.assign(JUNGLE_HINTS, HINTS);
