// Edition rules: pure functions, no DOM, no THREE, no colony.js import.
//
// Two editions share one save. 'canon' is shown to the kids as "Clan Edition"
// and is the default; 'legacy' is the older plain game. Legacy HIDES the clan
// layer, it never deletes it, so nothing here writes to a state object.
//
// The ids are 'canon' and 'legacy' (not 'clan') because the borrowed-word scan
// in test/clanwords.test.js flags 'clan' and every PLACE_WORDS value in any
// src/ string literal. Player-facing words come from clanwords.js.

import { words } from './wordset.js';
import { phrase } from './clanphrases.js';
import { rivalFor } from './rivalclans.js';
import { teleOn } from './teleflag.js';
import { treehouseOn } from './treehouseflag.js';

export const EDITIONS = Object.freeze(['canon', 'legacy']);
export const DEFAULT_EDITION = 'canon';

// Anything that is not exactly a known edition id becomes the default, so junk
// from a cloud payload or an old save loads on Clan Edition.
export function sanitizeEdition(v) {
  return EDITIONS.includes(v) ? v : DEFAULT_EDITION;
}

// False only for an explicit 'legacy'; a missing state or field is Clan Edition.
export function isClanEdition(state) {
  return !(state && state.edition === 'legacy');
}

export function editionTitle(edition) {
  return phrase(edition === 'legacy' ? 'edition.title.legacy' : 'edition.title.canon');
}

// The page's title for a save on `edition`.
export function gameTitle(edition) {
  return phrase('edition.game', editionTitle(edition));
}

// A catalog entry marked edition: 'canon' is a Clan Edition place; Legacy hides it.
export function areaInEdition(entry, edition) {
  return !(edition === 'legacy' && entry && entry.edition === 'canon');
}

// Is this place in front of a child at all? areaInEdition, and a row marked `gate: 'tele'` (the Greenhouse: reached only through a
// teleport gate) only while the gates switch is on (src/teleflag.js); with it off its card, map circle, purchase and hint are hidden.
// (The golden-mice total counts by areaInEdition alone, as it counts the Moon, which has no row.)
export function areaShown(entry, edition) {
  if (entry && entry.gate === 'tele' && !teleOn()) return false;
  if (entry && entry.flag === 'treehouse' && !treehouseOn()) return false; // the Treehouse village: behind its own switch until its release pass
  return areaInEdition(entry, edition);
}

// Own-property read so '__proto__' and friends are not areas. A place whose
// name is in the word tables by its own id (the Rooftops) takes it from there,
// as the world map does, so a word set's name shows wherever the place is named.
export function placeName(areaId, edition, catalog) {
  if (areaId === 'neighborhood' && edition !== 'legacy') return words().PLACE_WORDS.town;
  const areas = catalog && catalog.areas;
  if (!areas || !Object.hasOwn(areas, areaId)) return '';
  if (Object.hasOwn(words().PLACE_WORDS, areaId)) return words().PLACE_WORDS[areaId];
  const name = areas[areaId].name;
  return typeof name === 'string' ? name : '';
}

// Where a walk actually happens. A Legacy kid whose chosen place is Clan-only
// walks the Neighborhood; state.area itself is left alone so flipping back
// shows the same place again.
export function effectiveArea(state, catalog) {
  const area = state.area;
  // (Legacy and a Clan-only place; or a gate-only place with the gates off: she walks the town, state.area is left alone)
  const areas = catalog && catalog.areas;
  if (areas && Object.hasOwn(areas, area) && !areaShown(areas[area], state.edition)) return 'neighborhood';
  return area;
}

// How a room walk in `area` lands on this kid's save. 'set' makes it their
// place, as a room start always has; 'override' walks it for this one walk
// only. A Legacy kid gets an override when their own place is Clan-only (so it
// is not rewritten to the Neighborhood) or when the room's place is Clan-only
// (setArea refuses those in Legacy).
export function roomAreaMove(state, catalog, area) {
  if (!state || state.edition !== 'legacy') return 'set';
  const areas = catalog && catalog.areas;
  const clanOnly = (id) => !!areas && Object.hasOwn(areas, id) && !areaInEdition(areas[id], 'legacy');
  return clanOnly(state.area) || clanOnly(area) ? 'override' : 'set';
}

export function rivalForWalk(areaId, edition, picks = []) {
  return edition === 'legacy' ? null : rivalFor(areaId, picks);
}

export function accessoryName(entry, edition) {
  return edition === 'legacy' && entry.legacyName ? entry.legacyName : entry.name;
}
