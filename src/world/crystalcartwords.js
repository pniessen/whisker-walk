// Lumi's cart (milestone C4): the offer on a platform, "Hop off" while she rides, and the journal page's name. A lazy file, imported by the cave's play stage (never start-up):
// the lines join the phrase table (addPhrases) when the stage arrives. The same plain lines in both word sets; no series word and no banned word (test/crystalcart.test.js checks both sets).
import { addPhrases } from '../clanphrases.js';

export const CART_LINES = Object.freeze({
  'crystal.wc.cart.board': 'Hop on Lumi\'s cart',
  'crystal.wc.cart.off': 'Hop off',
  'crystal.wc.cart.name': 'Lumi\'s Cart',
});

addPhrases(CART_LINES);
