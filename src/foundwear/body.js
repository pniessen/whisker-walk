// Found outfits: the body records. Every walk hides one find-only outfit at a
// hand-placed spot (src/foundwear/index.js gathers these files).
//
// THIS FILE holds slots 'body' and 'back' only.
//
// A RECORD is one plain, frozen object:
//   { id, slot, find, emoji, name }
//   id     3 to 20 lowercase letters (WEAR_ID), unique across every record and
//          every other accessory id in CATALOG.accessories. Never changes once
//          shipped: saves keep it.
//   slot   one of this file's slots, above.
//   find   the CATALOG.areas id of the one place it is hidden. At most
//          WEAR_PER_AREA (4) records name the same place.
//   emoji  a non-empty string, shown on its card.
//   name   () => phrase('wear.<id>.name'). The words live in the later table
//          of src/clanphrases.js, read when shown, never fixed at load.
// The records are appended in the order they ship; index.js keeps that order.
// validateFoundWear (index.js; test/foundwear.test.js runs it) checks all of it.
// What else a new outfit needs, outside this file: see index.js, "ADDING ONE".

import { phrase } from '../clanphrases.js';

export const BODY_WEAR = Object.freeze([
  // the capes and the coat are built in src/cat/foundbody.js (FOUND_BODY)
  Object.freeze({ id: 'doormatcape', slot: 'body', find: 'neighborhood', emoji: '🏠', name: () => phrase('wear.doormatcape.name') }),
  Object.freeze({ id: 'beachtowelcape', slot: 'body', find: 'seaside', emoji: '🏖️', name: () => phrase('wear.beachtowelcape.name') }),
  // the jumper lies folded on the ground (display.js DISPLAY_BY_ID)
  Object.freeze({ id: 'fishermansjumper', slot: 'body', find: 'docks', emoji: '🧶', name: () => phrase('wear.fishermansjumper.name') }),
  // the Park's kite tail and the Farm's and Fairground's back items: the tail and the candyfloss
  // float (foundbody.js FOUND_FLOATS); the bale is a pack (backitems.js)
  Object.freeze({ id: 'kitetailribbon', slot: 'back', find: 'park', emoji: '🪁', name: () => phrase('wear.kitetailribbon.name') }),
  Object.freeze({ id: 'haybalepack', slot: 'back', find: 'farm', emoji: '🌾', name: () => phrase('wear.haybalepack.name') }),
  Object.freeze({ id: 'candyflosspuff', slot: 'back', find: 'fair', emoji: '🍭', name: () => phrase('wear.candyflosspuff.name') }),
  // the Market Square (2026-11-21): the bale pack's shape as a wicker basket of blooms (backitems.js)
  Object.freeze({ id: 'flowerbasket', slot: 'back', find: 'market', emoji: '🧺', name: () => phrase('wear.flowerbasket.name') }),
]);
