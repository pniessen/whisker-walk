// The golden-mouse totals, derived from the data rather than written down, so
// that adding an area's three mice edits src/goldmice.js and test/goldmice.test.js
// (where the absolute numbers are pinned) and nothing else. Other tests assert
// against these.
import { GOLD_MICE } from '../../src/goldmice.js';
import { CATALOG } from '../../src/progression.js';

/** Every mouse (Clan Edition). */
export const CLAN_TOTAL = Object.values(GOLD_MICE).flat().length;

/** The mice in the places Legacy ("everyday") shows; an area missing from the catalog counts. */
export const EVERYDAY_TOTAL = Object.entries(GOLD_MICE)
  .filter(([id]) => !Object.hasOwn(CATALOG.areas, id) || CATALOG.areas[id].edition !== 'canon')
  .reduce((n, [, mice]) => n + mice.length, 0);
