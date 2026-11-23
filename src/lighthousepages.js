// Lighthouse Point's six discoveries and two jobs as journal pages: ids and word lookups only. This file is
// start-up code (journal.js imports it), so it holds nothing of the place's world. The find lines and what counts
// a find are in src/world/lighthousefinds.js, the kitten's and the lamp's jobs in src/world/lighthouselife.js
// (the place's chunk). The pages' own words are in the phrase table (src/clanphrases.js) because the journal is
// drawn before the place has ever been walked; every other line is in the lazy src/world/lighthousewords.js.
import { phrase } from './clanphrases.js';

export const LIGHTHOUSE_FIND_IDS = Object.freeze(['lamproom', 'pool', 'gull', 'echo', 'bell', 'window']);
export const lighthousePageId = (id) => 'lh' + id;
// the two jobs' pages (the kitten brought home, the lamp lit): the walks each was finished on
export const LIGHTHOUSE_JOB_PAGES = Object.freeze({ kitten: 'lhjobkitten', lamp: 'lhjoblamp' });
export const LIGHTHOUSE_JOURNAL_TYPES = Object.freeze([...LIGHTHOUSE_FIND_IDS.map(lighthousePageId), 'lhjobkitten', 'lhjoblamp']);

// The journal's pages (src/journal.js), by journal id.
export const LIGHTHOUSE_PAGE_WORDS = Object.freeze({
  lhlamproom: Object.freeze({ name: () => phrase('lighthouse.page.lamproom.name'), hint: () => phrase('lighthouse.page.lamproom.hint') }),
  lhpool: Object.freeze({ name: () => phrase('lighthouse.page.pool.name'), hint: () => phrase('lighthouse.page.pool.hint') }),
  lhgull: Object.freeze({ name: () => phrase('lighthouse.page.gull.name'), hint: () => phrase('lighthouse.page.gull.hint') }),
  lhecho: Object.freeze({ name: () => phrase('lighthouse.page.echo.name'), hint: () => phrase('lighthouse.page.echo.hint') }),
  lhbell: Object.freeze({ name: () => phrase('lighthouse.page.bell.name'), hint: () => phrase('lighthouse.page.bell.hint') }),
  lhwindow: Object.freeze({ name: () => phrase('lighthouse.page.window.name'), hint: () => phrase('lighthouse.page.window.hint') }),
  lhjobkitten: Object.freeze({ name: () => phrase('lighthouse.page.kitten.name'), hint: () => phrase('lighthouse.page.kitten.hint') }),
  lhjoblamp: Object.freeze({ name: () => phrase('lighthouse.page.lamp.name'), hint: () => phrase('lighthouse.page.lamp.hint') }),
});
