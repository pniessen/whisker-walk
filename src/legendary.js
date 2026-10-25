// The four legendary cats: which grand old cat lives in which walk area.
//
// A leaf module, data only, apart from one total check. The names themselves
// are straynames.js's LEGENDARY_NAMES (a block of their own, so CAT_NAMES and
// walkRng are untouched); this file only says where each one lives. A
// legendary cat is an ordinary stray name in every other respect: it passes
// isStrayName, the feed RPC's name regex and the D2 family-pet gate, and it
// joins the colony only through the ordinary feed path.
//
// Read with Object.hasOwn: an inherited key ('__proto__') is not an area.
import { LEGENDARY_NAMES } from './straynames.js';

export const LEGENDARY_BY_AREA = Object.freeze({
  neighborhood: 'Duchess',
  park: 'Professor Whiskers',
  seaside: 'Captain Barnacle',
  docks: 'Lord Midnight',
});

// A Set, so '__proto__' and other inherited keys read as strangers, and
// anything that is not a string is rejected rather than coerced.
const LEGENDARY_SET = new Set(LEGENDARY_NAMES);
export function isLegendaryName(v) {
  return typeof v === 'string' && LEGENDARY_SET.has(v);
}
