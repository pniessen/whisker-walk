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

// The six missions' pages (2026-11-27): the walks each was finished on. Ids and word lookups only, like the finds above.
export const MARKET_ERRAND_PAGES = Object.freeze([['mkmouse', '🐭'], ['mkglove', '🧤'], ['mkpigeons', '🕊️'], ['mkbell', '🔔'], ['mkstray', '🐈'], ['mkfiddle', '🎻']].map((p) => Object.freeze(p)));
export const MARKET_ERRAND_JOURNAL_TYPES = Object.freeze(MARKET_ERRAND_PAGES.map((p) => p[0]));
export const MARKET_ERRAND_PAGE_WORDS = Object.freeze({
  mkmouse: Object.freeze({ name: () => phrase('market.errand.mouse.name'), hint: () => phrase('market.errand.mouse.hint') }),
  mkglove: Object.freeze({ name: () => phrase('market.errand.glove.name'), hint: () => phrase('market.errand.glove.hint') }),
  mkpigeons: Object.freeze({ name: () => phrase('market.errand.pigeons.name'), hint: () => phrase('market.errand.pigeons.hint') }),
  mkbell: Object.freeze({ name: () => phrase('market.errand.bell.name'), hint: () => phrase('market.errand.bell.hint') }),
  mkstray: Object.freeze({ name: () => phrase('market.errand.stray.name'), hint: () => phrase('market.errand.stray.hint') }),
  mkfiddle: Object.freeze({ name: () => phrase('market.errand.fiddle.name'), hint: () => phrase('market.errand.fiddle.hint') }),
});
