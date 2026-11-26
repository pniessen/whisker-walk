// Found outfits: the neck records. Every walk hides one find-only outfit at a
// hand-placed spot (src/foundwear/index.js gathers these files).
//
// THIS FILE holds slots 'neck' and 'collar' only.
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

export const NECK_WEAR = Object.freeze([
  // the pieces are built in src/cat/foundneck.js
  Object.freeze({ id: 'daisychain', slot: 'neck', find: 'park', emoji: '🌼', name: () => phrase('wear.daisychain.name') }),
  Object.freeze({ id: 'gardenglovescarf', slot: 'neck', find: 'neighborhood', emoji: '🧤', name: () => phrase('wear.gardenglovescarf.name') }),
  Object.freeze({ id: 'shellnecklace', slot: 'neck', find: 'seaside', emoji: '🐚', name: () => phrase('wear.shellnecklace.name') }),
  Object.freeze({ id: 'neckerchief', slot: 'neck', find: 'farm', emoji: '🧣', name: () => phrase('wear.neckerchief.name') }),
  Object.freeze({ id: 'ticketgarland', slot: 'neck', find: 'fair', emoji: '🎟️', name: () => phrase('wear.ticketgarland.name') }),
  // the collars: ring-borne pieces and a charm, built in src/cat/foundneck.js (FOUND_COLLARS)
  Object.freeze({ id: 'bottletopcollar', slot: 'collar', find: 'neighborhood', emoji: '🔘', name: () => phrase('wear.bottletopcollar.name') }),
  Object.freeze({ id: 'ropecollar', slot: 'collar', find: 'docks', emoji: '🪢', name: () => phrase('wear.ropecollar.name') }),
  Object.freeze({ id: 'anchorcharm', slot: 'collar', find: 'docks', emoji: '⚓', name: () => phrase('wear.anchorcharm.name') }),
  // the Market Square (2026-11-21): the neckerchief in a string-bag weave, and an apple on the anchor's hang
  Object.freeze({ id: 'stringbagscarf', slot: 'neck', find: 'market', emoji: '🛍️', name: () => phrase('wear.stringbagscarf.name') }),
  Object.freeze({ id: 'applecharm', slot: 'collar', find: 'market', emoji: '🍎', name: () => phrase('wear.applecharm.name') }),
  // the Reef (2026-11-26): a collar with a pearl charm (foundneck.js FOUND_COLLARS), hidden in four places under the sea, behind ?reef=1 (no catalog place yet)
  Object.freeze({ id: 'pearlcollar', slot: 'collar', find: 'reef', emoji: '🦪', name: () => phrase('wear.pearlcollar.name') }),
  // the Crystal Cave (2026-11-26): a collar with a glimmering crystal charm (foundneck.js FOUND_COLLARS), hidden in four places in the cave, behind ?crystal=1
  Object.freeze({ id: 'glimmercollar', slot: 'collar', find: 'crystal', emoji: '💎', name: () => phrase('wear.glimmercollar.name') }),
]);
