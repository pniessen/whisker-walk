// The stray cats' names and the facts derived from a name alone.
//
// A leaf module (imports nothing) so the colony rules in colony.js can share the
// name list with straycats.js without pulling THREE into pure logic.
//
// Names only ever come from this list: no free text crosses the wire, and
// isStrayName() is the one test a cloud-supplied name has to pass.

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

// A Set, so '__proto__' and other inherited keys read as plain strangers, and
// anything that is not a string is rejected rather than coerced.
const NAME_SET = new Set(CAT_NAMES);
export function isStrayName(v) {
  return typeof v === 'string' && NAME_SET.has(v);
}
