// What kind of thing an accessory is, for the pieces of the cat that make
// room for it: a coat shell or a cape on the body (the fur tufts it covers,
// the pack resting on it), a pack on the back (the hood tucked under it, the
// shop picture turned to show it), a charm on the collar (the cape's clasp
// left off under it). The shop's items are named here as they always were;
// a found outfit (src/cat/found*.js) gives its own kind in its table entry.
//
// It imports the found tables, never model.js, so model.js, tufts.js and
// thumbnails.js can all read it without a cycle.
import { BACK_ITEM_IDS } from './backitems.js';
import { FOUND_BODY } from './foundbody.js';
import { FOUND_COLLARS } from './foundneck.js';

// True when `id` is one of `table`'s own entries (never one it inherits:
// '__proto__' and 'toString' are no outfit).
export function hasEntry(table, id) {
  return typeof id === 'string' && Object.hasOwn(table, id);
}

const SHELLS = new Set(['hoodie', 'raincoat', 'sweater']);
const CAPES = new Set(['cape', 'confetticape']);
// The collars with a charm at the throat (a cape's clasp is left off there).
const CHARMED = new Set(['bell', 'heart', 'tag', 'sparklecollar']);

// 'shell' (a coat cut from the torso), 'cape' (a cloak on the back) or null
// (anything else, or nothing).
export function bodyKind(id) {
  if (SHELLS.has(id)) return 'shell';
  if (CAPES.has(id)) return 'cape';
  return hasEntry(FOUND_BODY, id) ? FOUND_BODY[id].kind : null;
}

// True for a back item built on the torso by backitems.js (the backpack, the
// jetpack, the wings, and a found pack): the hood tucks under it and the fur
// mane gives way to it.
export function isPack(id) {
  return BACK_ITEM_IDS.includes(id);
}

// True for a collar style with a charm hanging at the throat.
export function isCharmed(style) {
  return CHARMED.has(style) || (hasEntry(FOUND_COLLARS, style) && FOUND_COLLARS[style].charmed === true);
}
