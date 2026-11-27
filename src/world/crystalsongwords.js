// The words of the Crystal Cave's singing chamber (milestone C5): the offer at the pads, the little hint when a tune starts, a learned tune, the third tune and a partner's tune.
// A lazy file (the `crystalplay` stage's chunk, never start-up): the lines join the phrase table (addPhrases) when the stage arrives. The journal hint for ccsong is already in
// crystalwingcwords.js. The everyday set is the plain base; the Clan set adds light flavour only. No series word is in the everyday set and none of the banned words (dark, lost
// forever, trapped, stuck, collapse, cave-in, scary) is in either. No line says anything went wrong: a missed step only lets the pads fade.
import { addPhrases } from '../clanphrases.js';
import { seriesMode, SERIES_ON } from '../wordset.js';

const clan = (everyday, flavoured) => () => (seriesMode() === SERIES_ON ? flavoured : everyday);

export const CRYSTAL_SONG_LINES = Object.freeze({
  'crystal.wc.song.prompt': 'Wake the singing stones',
  'crystal.wc.song.listen': 'Listen, then step the stones to echo the tune.',
  'crystal.wc.song.learned': clan('The stones hum your tune back. You learned a song!', 'The stones hum your tune back, soft as a purr. You learned a song!'),
  'crystal.wc.song.all': clan('Three songs! The whole chamber glows for you.', 'Three songs! The whole chamber glows like a sunset for you.'),
  'crystal.wc.song.partner': 'Your friend taught the stones a song!',
});

addPhrases(CRYSTAL_SONG_LINES);
