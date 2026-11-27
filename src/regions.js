// Regions: the owner's five groupings of every place (2026-11-27), as data. Pure and a leaf: it imports only the phrase
// table and the word-set door, nothing heavy, and nothing at start-up imports it yet (the passport and a region view will,
// lazily), so it costs the start-up download nothing. No visible change comes from it by itself.
//
// A region's members are real ids: CATALOG.areas ids (src/progression.js) and the teleport places (TELE_ENDS in
// src/teleport.js), the Moon among the latter (its catalog row came with the map circle). test/regions.test.js fails if any of those has no
// region, if a place is in two, or if a region is empty. A planned place (the Treehouse village, Snowville, the Jungle lodge)
// is added here when its own milestone gives it an id.
//
// The names are literal phrase ids, registered in the phrase table when this file loads (the lazy files' way); they read the
// same in both word sets except the Clan lands, which the everyday set calls the wild lands.
import { addPhrases, phrase } from './clanphrases.js';
import { seriesMode, SERIES_ON, words } from './wordset.js'; // (the borrowed word comes through the word-table seam)

export const REGION_LINES = Object.freeze({
  'region.urban': 'Urban',
  'region.suburban': 'Suburban and rural',
  'region.shore': 'Shore',
  'region.wild': () => (seriesMode() === SERIES_ON ? `${words().CLAN_SUFFIX} lands` : 'Wild lands'),
  'region.other': 'Other worlds',
});
addPhrases(REGION_LINES);

export const REGIONS = Object.freeze([
  { id: 'urban', members: ['neighborhood', 'park', 'roofs', 'market', 'greenhouse'] },
  { id: 'suburban', members: ['farm', 'fair', 'house'] },
  { id: 'shore', members: ['docks', 'seaside', 'lighthouse'] },
  { id: 'wild', members: ['woods', 'river', 'moor', 'pines', 'gorge'] },
  { id: 'other', members: ['moon', 'reef', 'crystal', 'snowville'] },
].map((r) => Object.freeze({ ...r, members: Object.freeze(r.members) })));

// The region id of a place id, or null for a place in none (own-property read: '__proto__' is nothing).
export function regionOf(areaId) {
  const hit = typeof areaId === 'string' ? REGIONS.find((r) => r.members.includes(areaId)) : null;
  return hit ? hit.id : null;
}

// A region's name in the word set in use (every id a literal, as the phrase scan wants).
export function regionName(regionId) {
  switch (regionId) {
    case 'urban': return phrase('region.urban');
    case 'suburban': return phrase('region.suburban');
    case 'shore': return phrase('region.shore');
    case 'wild': return phrase('region.wild');
    case 'other': return phrase('region.other');
    default: return '';
  }
}
