// The Market Square's six discoveries as journal pages: ids and word lookups
// only. This file is start-up code (journal.js imports it), so it holds nothing
// of the Market's world. The find lines and what counts a find are in
// src/world/marketfinds.js (the Market's chunk).
import { phrase } from './clanphrases.js';

export const MARKET_FIND_IDS = Object.freeze(['fountain', 'pigeons', 'sacks', 'musician', 'basket', 'apples']);
export const marketPageId = (id) => 'market' + id;
export const MARKET_JOURNAL_TYPES = Object.freeze(MARKET_FIND_IDS.map(marketPageId));

// The journal's pages (src/journal.js), by journal id.
export const MARKET_PAGE_WORDS = Object.freeze({
  marketfountain: Object.freeze({ name: () => phrase('market.page.fountain.name'), hint: () => phrase('market.page.fountain.hint') }),
  marketpigeons: Object.freeze({ name: () => phrase('market.page.pigeons.name'), hint: () => phrase('market.page.pigeons.hint') }),
  marketsacks: Object.freeze({ name: () => phrase('market.page.sacks.name'), hint: () => phrase('market.page.sacks.hint') }),
  marketmusician: Object.freeze({ name: () => phrase('market.page.musician.name'), hint: () => phrase('market.page.musician.hint') }),
  marketbasket: Object.freeze({ name: () => phrase('market.page.basket.name'), hint: () => phrase('market.page.basket.hint') }),
  marketapples: Object.freeze({ name: () => phrase('market.page.apples.name'), hint: () => phrase('market.page.apples.hint') }),
});
