// The stray cats' names and the facts derived from a name alone.
//
// A leaf module (imports nothing) so the colony rules in colony.js can share the
// name list with straycats.js without pulling THREE into pure logic.
//
// Names only ever come from these lists: no free text crosses the wire, and
// isStrayName() is the one test a cloud-supplied name has to pass.
//
// KIT_NAMES is a SEPARATE block, deliberately not appended to CAT_NAMES.
// straycats.js runs shuffled(CAT_NAMES, rng), which consumes
// CAT_NAMES.length - 1 draws from the walk's seeded rng; growing or reordering
// CAT_NAMES would shift every draw after it (gifts, weather, secrets, goals) and
// change what a co-walk with a non-partner looks like. Kits are never drawn into a walk's
// shuffle, so CAT_NAMES stays untouched. isStrayName() accepts them, and so does
// straycats.js's D2 vocabulary gate (isGrudgeableStray): a fed kit becomes an
// ordinary colony cat that walks as a stray and must stay feedable. The server needs no
// change: colony_cats.name is plain text, and the feed RPC only requires
// ^[A-Za-z][A-Za-z ]{0,23}$, which every name here obeys (pinned in tests).
// Tests pin that no kit name is itself a clan PREFIXES word, that the 12 kits
// derive 12 distinct clan prefixes (so siblings never share a displayed name at
// any rank), and that no kit's prefix equals another kit's stored name. They do
// NOT pin the rest of the clan vocabulary; that is src/clanwords.js's own test.

export const CAT_NAMES = [
  'Pickles', 'Marmalade', 'Baron von Fluff', 'Mochi', 'Biscuit', 'Clementine',
  'Noodle', 'Pumpkin', 'Sardine', 'Waffles', 'Miso', 'Turnip', 'Gadget',
  'Petunia', 'Sir Pounce', 'Dumpling', 'Olive', 'Paprika', 'Crumpet', 'Zucchini',
  'Maple', 'Tofu', 'Wasabi', 'Pretzel', 'Nimbus', 'Pepper', 'Butterscotch',
  'Fig', 'Tangerine', 'Cocoa', 'Sprout', 'Juniper', 'Meatball', 'Parsnip',
  'Ziggy', 'Bean', 'Churro', 'Anchovy', 'Popcorn', 'Gnocchi', 'Beignet',
  'Truffle', 'Ramen', 'Custard', 'Peaches', 'Static', 'Doppler', 'Comet',
];

export const STRAY_BREEDS = ['tabby', 'siamese', 'persian', 'black', 'calico', 'mainecoon'];

// Breed is derived from the name, not rolled, so a given cat (e.g. "Pickles") is
// the same breed on every walk and on every device. This is the exact hash
// straycats.js has always used, moved here unchanged.
export function strayBreed(name) {
  return STRAY_BREEDS[[...name].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7) % STRAY_BREEDS.length];
}

export const KIT_NAMES = [
  'Bramble', 'Pebble', 'Wiggle', 'Fennel', 'Bumble', 'Pip',
  'Peanut', 'Cupcake', 'Puddle', 'Tumble', 'Toffee', 'Ember',
];

// A Set (one union of both blocks), so '__proto__' and other inherited keys read as plain strangers, and
// anything that is not a string is rejected rather than coerced.
const NAME_SET = new Set([...CAT_NAMES, ...KIT_NAMES]);
export function isStrayName(v) {
  return typeof v === 'string' && NAME_SET.has(v);
}
