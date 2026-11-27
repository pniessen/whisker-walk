// The journal hints of the Crystal Cave's wing C (X0 reserved the six ids in src/crystalpages.js CRYSTAL_WING_PAGES). A lazy file, imported by crystal.js (so by the
// cave's chunk, never start-up): the hints join CRYSTAL_HINTS when the chunk arrives. The same in both word sets (no series word is in any, no banned word).
// The literal phrase ids are listed too, so the phrase table knows them (the later milestones add their own lines beside these).
import { CRYSTAL_HINTS } from '../crystalpages.js';
import { addPhrases } from '../clanphrases.js';

export const HINTS = Object.freeze({
  ccboat: 'A little boat waits at the river dock.',
  ccgrotto: 'Soft mushrooms glow in a cosy grotto.',
  ccfalls: 'Cool water tumbles down a tall wall.',
  ccforge: 'A warm forge glows at the end of the cave.',
  cccart: 'Lumi\'s cart rolls along the old tracks.',
  ccsong: 'Seven stones sing in the singing chamber.',
});

export const CRYSTAL_WING_C_LINES = Object.freeze({
  'crystal.wc.boat.hint': HINTS.ccboat,
  'crystal.wc.grotto.hint': HINTS.ccgrotto,
  'crystal.wc.falls.hint': HINTS.ccfalls,
  'crystal.wc.forge.hint': HINTS.ccforge,
  'crystal.wc.cart.hint': HINTS.cccart,
  'crystal.wc.song.hint': HINTS.ccsong,
});

Object.assign(CRYSTAL_HINTS, HINTS);
addPhrases(CRYSTAL_WING_C_LINES);
