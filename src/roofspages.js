// The Rooftops' six discoveries as journal pages: ids and word lookups only.
// This file is start-up code (journal.js imports it), so it holds nothing of
// the Rooftops' world. The find lines and what counts a find are in
// src/world/roofsfinds.js (the Rooftops' chunk).
import { phrase } from './clanphrases.js';

export const ROOFS_FIND_IDS = Object.freeze(['garden', 'loft', 'vane', 'skylight', 'telescope', 'chimney']);
export const roofsPageId = (id) => 'roof' + id;
export const ROOFS_JOURNAL_TYPES = Object.freeze(ROOFS_FIND_IDS.map(roofsPageId));

// The journal's pages (src/journal.js), by journal id.
export const ROOFS_PAGE_WORDS = Object.freeze({
  roofgarden: Object.freeze({ name: () => phrase('roofs.page.garden.name'), hint: () => phrase('roofs.page.garden.hint') }),
  roofloft: Object.freeze({ name: () => phrase('roofs.page.loft.name'), hint: () => phrase('roofs.page.loft.hint') }),
  roofvane: Object.freeze({ name: () => phrase('roofs.page.vane.name'), hint: () => phrase('roofs.page.vane.hint') }),
  roofskylight: Object.freeze({ name: () => phrase('roofs.page.skylight.name'), hint: () => phrase('roofs.page.skylight.hint') }),
  rooftelescope: Object.freeze({ name: () => phrase('roofs.page.telescope.name'), hint: () => phrase('roofs.page.telescope.hint') }),
  roofchimney: Object.freeze({ name: () => phrase('roofs.page.chimney.name'), hint: () => phrase('roofs.page.chimney.hint') }),
});
