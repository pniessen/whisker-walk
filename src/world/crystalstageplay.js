// Stage "crystalplay" of the Crystal Cave (see crystalstages.js): Lumi's cart on the old tracks and the singing chamber. The slot is read by crystal.js through ST.play.
// The singing chamber (milestone C5) is in crystalsongstage.js (its own files: createSong, pads, credit); the cart (C4) adds its own beside it.
import { ST } from './crystalstages.js';
import { SONG_SLOTS } from './crystalsongstage.js';

Object.assign(ST, { play: Object.freeze({ ...SONG_SLOTS }) });
