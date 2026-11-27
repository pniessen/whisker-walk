// The Crystal Cave's friendly-life words (cave fish, bats, fireflies, moths, the salamander, beetles, the crab): what the walk says when she spots one (the album's label and the
// critter toast) and the journal pages' hints. A lazy file, imported by cavelifelive.js (so by the cave's chunk, never start-up): the lines join the phrase table (addPhrases) and the
// hints join CRYSTAL_HINTS (src/crystalpages.js) when the chunk arrives. The everyday set is the plain base; the Clan set adds light flavour only. No series word is in the
// everyday set, and none of the banned words (dark, lost forever, trapped, stuck, collapse, cave-in, scary) is in either.
import { addPhrases } from '../clanphrases.js';
import { CRYSTAL_HINTS } from '../crystalpages.js';
import { seriesMode, SERIES_ON } from '../wordset.js';

const clan = (everyday, flavoured) => () => (seriesMode() === SERIES_ON ? flavoured : everyday);

export const LINES = Object.freeze({
  'cave.life.fish': clan('a school of glowing fish', 'a school of glowing fish, bright as starlight'),
  'cave.life.bat': clan('a cuddly bat', 'a cuddly bat, round as a mouse-ball'),
  'cave.life.firefly': clan('a cloud of fireflies', 'a cloud of fireflies, drifting like tiny stars'),
  'cave.life.moth': clan('a pale moth', 'a pale moth, soft as moss'),
  'cave.life.salamander': clan('a pink salamander', 'a pink salamander with feathery gills'),
  'cave.life.beetle': clan('a jewel beetle', 'a jewel beetle, shiny as a berry'),
  'cave.life.crab': clan('a little cave crab', 'a little cave crab, sidling in the shallows'),
});

export const HINTS = Object.freeze({
  clfish: 'Little glowing fish swim in loops in the Blue Pool.',
  clbat: 'Round-faced bats nap near the ceiling. A few glide by.',
  clfirefly: 'Soft lights drift round the mushrooms.',
  clmoth: 'Pale moths flutter round the great crystals.',
  clsalamander: 'A pink salamander strolls on the edge of the pool.',
  clbeetle: 'Tiny shiny beetles crawl by the crystal gardens.',
  clcrab: 'A small crab sidles about in the pool shallows.',
});

addPhrases(LINES);
Object.assign(CRYSTAL_HINTS, HINTS);
