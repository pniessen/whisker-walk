// Found outfits: the face records. Every walk hides one find-only outfit at a
// hand-placed spot (src/foundwear/index.js gathers these files).
//
// THIS FILE holds slot 'face' only.
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

export const FACE_WEAR = Object.freeze([
  // the Fairground: two heart lenses on a red frame (src/cat/foundface.js builds them)
  Object.freeze({ id: 'heartglasses', slot: 'face', find: 'fair', emoji: '💕', name: () => phrase('wear.heartglasses.name') }),
]);
