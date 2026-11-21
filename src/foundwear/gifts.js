// Gift outfits: worn like the found outfits, but never hidden on a walk and
// never sold. A gift code gives them (src/redeemcodes.js), and an event gives
// its own back on every load (src/giftevents.js eventWear). The first four
// are the birthday's (2026-11-21).
//
// A RECORD is one plain, frozen object, as the found records are (head.js
// has the full description), with no `find`:
//   { id, slot, emoji, name }
// Its mesh is drawn in the found outfits' cat-side files: a hat in
// src/cat/hats.js (BUILD) and src/cat/foundhead.js (Hagrid's), a neck piece
// in src/cat/foundneck.js (FOUND_NECKS), a collar there too (FOUND_COLLARS),
// a floating thing in src/cat/foundbody.js (FOUND_FLOATS). The same rules
// hold (test/giftwearfit.test.js runs every record through them).
//
// Imports only clanphrases.js, so progression.js can import it without a cycle.
import { phrase } from '../clanphrases.js';

export const GIFT_WEAR = Object.freeze([
  // a striped party cone with a pompom (src/cat/hats.js)
  Object.freeze({ id: 'partyhat', slot: 'head', emoji: '🥳', name: () => phrase('wear.partyhat.name') }),
  // a sparkly rosette pinned at the throat (src/cat/foundneck.js)
  Object.freeze({ id: 'bdayrosette', slot: 'neck', emoji: '🎀', name: () => phrase('wear.bdayrosette.name') }),
  // a balloon tied on where the tail begins (src/cat/foundbody.js)
  Object.freeze({ id: 'bdayballoon', slot: 'back', emoji: '🎈', name: () => phrase('wear.bdayballoon.name') }),
  // a slice of cake hanging from the collar (src/cat/foundneck.js)
  Object.freeze({ id: 'cakecharm', slot: 'collar', emoji: '🍰', name: () => phrase('wear.cakecharm.name') }),
  // hers alone: a polka-dot cone with a poofy pom-pom (src/cat/hats.js); the
  // birthday event gives it, so a save that already had the event gains it
  Object.freeze({ id: 'birthdayhat', slot: 'head', emoji: '🎉', name: () => phrase('wear.birthdayhat.name') }),
]);
export const GIFT_WEAR_IDS = Object.freeze(GIFT_WEAR.map((r) => r.id));

// The CATALOG.accessories entries. `prize` keeps them out of the shop, trades
// and the home line, as it keeps every won thing out; `code` says a gift code
// may give one all the same (progression.js redeemCode).
export const GIFT_CATALOG = Object.freeze(Object.fromEntries(GIFT_WEAR.map((record) => [record.id, {
  get name() { return record.name(); },
  slot: record.slot,
  price: 0,
  prize: true,
  code: true,
  emoji: record.emoji,
}])));
