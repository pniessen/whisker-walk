// The words of the Crystal Cave's mushroom grotto and forge shell (milestone C2): what the walk says when she spots them (the album's label) and the pages' names. The hints for
// the two journal pages (ccgrotto, ccforge) are already in crystalwingcwords.js, the same in both word sets. A lazy file (the wing C stage's chunk, never start-up). The everyday
// set is the plain base; the Clan set adds light flavour only. No series word is in the everyday set and none of the banned words (dark, lost forever, trapped, stuck, collapse,
// cave-in, scary) is in either.
import { addPhrases } from '../clanphrases.js';
import { seriesMode, SERIES_ON } from '../wordset.js';

const clan = (everyday, flavoured) => () => (seriesMode() === SERIES_ON ? flavoured : everyday);

export const CRYSTAL_GROTTO_LINES = Object.freeze({
  'crystal.wc.grotto.name': clan('a glowing mushroom grotto', 'a glowing mushroom grotto, soft as moss'),
  'crystal.wc.forge.name': clan('a warm little forge', 'a warm little forge, glowing like a sunset'),
});

addPhrases(CRYSTAL_GROTTO_LINES);
