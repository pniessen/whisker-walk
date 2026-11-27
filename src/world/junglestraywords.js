// The Jungle lodge's stray-cat words (round two): one prompt and one friendly line for each of the four jungle coats. A lazy file, imported by junglestrays.js (so by the place's stage chunk,
// never start-up): the lines join the phrase table (addPhrases) when the chunk arrives. The everyday set is the plain base; the Clan set adds light flavour only. No series word is in the
// everyday set and none of the banned words (dark, lost forever, trapped, stuck, collapse, scary) is in either. test/junglestrays.test.js checks both sets.
import { addPhrases } from '../clanphrases.js';
import { seriesMode, SERIES_ON } from '../wordset.js';

// A line that takes the Clan set's flavour reads the set in use WHEN IT IS SAID (never kept).
const clan = (everyday, flavoured) => () => (seriesMode() === SERIES_ON ? flavoured : everyday);

export const COATS = Object.freeze(['spotted', 'sooty', 'tawny', 'striped']);
export const LINES = Object.freeze({
  'jungle.stray.prompt.spotted': clan('Say hello to the spotted cat', 'Greet the spotted cat'),
  'jungle.stray.prompt.sooty': clan('Say hello to the sooty cat', 'Greet the sooty cat'),
  'jungle.stray.prompt.tawny': clan('Say hello to the tawny cat', 'Greet the tawny cat'),
  'jungle.stray.prompt.striped': clan('Say hello to the striped cat', 'Greet the striped cat'),
  'jungle.stray.line.spotted': clan('The spotted cat purrs. Dappled leaves are its favourite hiding place!', 'The spotted cat purrs. It slips through dappled leaves as softly as a river cat.'),
  'jungle.stray.line.sooty': clan('The sooty cat blinks slowly. It likes the shady spots by the trees.', 'The sooty cat blinks slowly. It shares the shade of the big trees with you.'),
  'jungle.stray.line.tawny': clan('The tawny cat stretches in the sun. It looks happy to see you!', 'The tawny cat stretches in the sun, glad of a friend on the path.'),
  'jungle.stray.line.striped': clan('The striped cat rubs against your leg. What a friendly jungle cat!', 'The striped cat rubs against your leg, a friendly cat of the green wood.'),
});
addPhrases(LINES);
