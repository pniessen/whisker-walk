// Kittypet rules: pure functions, no THREE, nothing written to the save.
// A kittypet is a stray whose name is in KITTYPET_NAMES; everything here is
// derived from the stored name and the edition.

import { isClanEdition } from './edition.js';
import { isKittypetName } from './straynames.js';

export const KITTYPET_COLLAR = 'bell';
export const KITTYPET_COLLARS = Object.freeze({ Duchess: 'heart' });

function inColony(state, name) {
  const cats = state?.colony?.cats;
  return Array.isArray(cats) && cats.some((c) => c?.name === name);
}

// collarFor(state, name) → a shop collar id, or null. Clan Edition only, and
// the collar comes off once the cat is in the colony (tamed or not).
export function collarFor(state, name) {
  if (!isClanEdition(state) || !isKittypetName(name) || inColony(state, name)) return null;
  return Object.prototype.hasOwnProperty.call(KITTYPET_COLLARS, name) ? KITTYPET_COLLARS[name] : KITTYPET_COLLAR;
}
