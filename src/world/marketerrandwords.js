// The Market's six missions' lines, from the phrase table (src/clanphrases.js): the same in both word sets. Chunk code. The
// table's test wants every phrase() call to name its id in full, so each is spelled out here.
import { phrase } from '../clanphrases.js';

export const ERRAND_WORDS = Object.freeze({
  mouse: Object.freeze({ sight: () => phrase('market.errand.mouse.sight'), dart: () => phrase('market.errand.mouse.dart'), done: () => phrase('market.errand.mouse.done') }),
  glove: Object.freeze({ got: () => phrase('market.errand.glove.got'), done: () => phrase('market.errand.glove.done') }),
  pigeons: Object.freeze({ flush: () => phrase('market.errand.pigeons.flush'), done: () => phrase('market.errand.pigeons.done') }),
  bell: Object.freeze({ ring: () => phrase('market.errand.bell.ring'), land: (n) => phrase('market.errand.bell.land', n), late: () => phrase('market.errand.bell.late'), done: () => phrase('market.errand.bell.done') }),
  stray: Object.freeze({ met: () => phrase('market.errand.stray.met'), done: () => phrase('market.errand.stray.done'), follows: () => phrase('market.errand.stray.follows') }),
  fiddle: Object.freeze({ start: () => phrase('market.errand.fiddle.start'), broke: () => phrase('market.errand.fiddle.broke'), done: () => phrase('market.errand.fiddle.done') }),
});
