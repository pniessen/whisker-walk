// Found outfits: the head records. Every walk hides one find-only outfit at a
// hand-placed spot (src/foundwear/index.js gathers these files).
//
// THIS FILE holds slot 'head' only.
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

export const HEAD_WEAR = Object.freeze([
  // the Park: a little acorn cup and stalk (src/cat/hats.js builds it)
  Object.freeze({ id: 'acorncap', slot: 'head', find: 'park', emoji: '🌰', name: () => phrase('wear.acorncap.name') }),
  // lane H (src/cat/hats.js builds them; src/cat/foundhead.js is Hagrid's)
  Object.freeze({ id: 'paperboycap', slot: 'head', find: 'neighborhood', emoji: '🧢', name: () => phrase('wear.paperboycap.name') }),
  Object.freeze({ id: 'buckethat', slot: 'head', find: 'seaside', emoji: '🪣', name: () => phrase('wear.buckethat.name') }),
  Object.freeze({ id: 'sailorcap', slot: 'head', find: 'docks', emoji: '⛵', name: () => phrase('wear.sailorcap.name') }),
  Object.freeze({ id: 'strawhat', slot: 'head', find: 'farm', emoji: '👒', name: () => phrase('wear.strawhat.name') }),
  Object.freeze({ id: 'stripedboater', slot: 'head', find: 'fair', emoji: '🎪', name: () => phrase('wear.stripedboater.name') }),
  Object.freeze({ id: 'starfishclip', slot: 'head', find: 'seaside', emoji: '⭐', name: () => phrase('wear.starfishclip.name') }),
  Object.freeze({ id: 'featherplume', slot: 'head', find: 'farm', emoji: '🪶', name: () => phrase('wear.featherplume.name') }),
]);
