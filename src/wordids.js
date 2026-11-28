// Ids and the shape of a word set: what is the SAME in every set and so lives
// outside every word file (clanwords.js, offclanwords.js).
//
// A leaf: it imports nothing, so anything may import it without a cycle. The
// ids are never shown to a player; the family's set is sealed offline and the
// public build holds only the everyday one, so neither may be where the ids
// live.
//
// Ids never change: save fields, RANK_KEYS values, GROUP_KEY and seed strings.

// Internal identifiers for every rank and role. These are NOT display text:
// they are the keys other modules compare and return (clanRankFor returns
// RANK_KEYS.warrior, roleFor returns RANK_KEYS.elder). A word set's RANK_WORDS
// values are the words; these stay put.
export const RANK_KEYS = Object.freeze({
  kit: 'kit',
  apprentice: 'apprentice',
  warrior: 'warrior',
  elder: 'elder',
  queen: 'queen',
  medicine: 'medicine',
  deputy: 'deputy',
  leader: 'leader',
});

// The word the page's own names are built with (button attributes, the "have
// you seen the question" storage key). Never shown to a player, and it does
// NOT follow the mode: a storage key that changed with the words would forget
// what a device has already seen.
export const GROUP_KEY = 'clan';

export const SERIES_ON = 'on';
export const SERIES_OFF = 'off';

// What every set must have. Per table its kind and what is checked inside:
//   list   an array; `length` is enforced only where it is given (a save
//          stores the colony's title as a position in PREFIXES)
//   table  an object that has every key listed; a number is the length an
//          array under that key must have (0: any value)
//   set    a Set
//   text   a string
// Derived from the family's set; test/wordids.test.js proves it still is.
const freeze = (v) => {
  if (v && typeof v === 'object') for (const x of Object.values(v)) freeze(x);
  return Object.freeze(v);
};
export const SET_SHAPE = freeze({
  PREFIXES: { kind: 'list', length: 22 },
  CAT_PREFIXES: { kind: 'table', keys: { Pickles: 0, Marmalade: 0, "Baron von Fluff": 0, Mochi: 0, Biscuit: 0, Clementine: 0, Noodle: 0, Pumpkin: 0, Sardine: 0, Waffles: 0, Miso: 0, Turnip: 0, Gadget: 0, Petunia: 0, "Sir Pounce": 0, Dumpling: 0, Olive: 0, Paprika: 0, Crumpet: 0, Zucchini: 0, Maple: 0, Tofu: 0, Wasabi: 0, Pretzel: 0, Nimbus: 0, Pepper: 0, Butterscotch: 0, Fig: 0, Tangerine: 0, Cocoa: 0, Sprout: 0, Juniper: 0, Meatball: 0, Parsnip: 0, Ziggy: 0, Bean: 0, Churro: 0, Anchovy: 0, Popcorn: 0, Gnocchi: 0, Beignet: 0, Truffle: 0, Ramen: 0, Custard: 0, Peaches: 0, Static: 0, Doppler: 0, Comet: 0, Bramble: 0, Pebble: 0, Wiggle: 0, Fennel: 0, Bumble: 0, Pip: 0, Peanut: 0, Cupcake: 0, Puddle: 0, Tumble: 0, Toffee: 0, Ember: 0, Duchess: 0, "Professor Whiskers": 0, "Captain Barnacle": 0, "Lord Lantern": 0 } },
  RIVAL_PREFIXES: { kind: 'table', keys: { neighborhood: 0, park: 0, seaside: 0, docks: 0 } },
  WARRIOR_SUFFIXES: { kind: 'list' },
  RANK_SUFFIX: { kind: 'table', keys: { kit: 0, apprentice: 0, leader: 0 } },
  CLAN_SUFFIX: { kind: 'text' },
  RANK_WORDS: { kind: 'table', keys: { kit: 0, apprentice: 0, warrior: 0, elder: 0, queen: 0, medicine: 0, deputy: 0, leader: 0 } },
  OUTSIDE_WORDS: { kind: 'table', keys: { met: 0, grudge: 0, player: 0, house: 0, people: 0, kids: 0, wash: 0 } },
  PLACE_WORDS: { kind: 'table', keys: { town: 0, roofs: 0, market: 0, house: 0 } },
  DENIED_NAMES: { kind: 'set' },
  HOMAGE_PREFIXES: { kind: 'table', keys: { woods: 0, moor: 0, river: 0, pines: 0, gorge: 0 } },
  HOME_LINES: { kind: 'table', keys: { woods: 0, moor: 0, river: 0, pines: 0, gorge: 0 } },
  CLAN_CAT_PREFIXES: { kind: 'table', keys: { woods: 16, moor: 16, river: 16, pines: 16, gorge: 16 } },
});

const isTable = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Set);

// Why `set` is not a complete word set, or null. The text names the first
// thing missing ("RANK_WORDS.deputy"), so a half-written set never loads.
export function shapeProblem(set) {
  if (!set || typeof set !== 'object') return 'not a table';
  for (const [name, want] of Object.entries(SET_SHAPE)) {
    const mine = set[name];
    const kindOk = want.kind === 'list' ? Array.isArray(mine)
      : want.kind === 'set' ? mine instanceof Set
      : want.kind === 'text' ? typeof mine === 'string'
      : isTable(mine);
    if (!kindOk) return `no ${name}`;
    if (want.kind === 'list' && want.length !== undefined && mine.length !== want.length) return `the wrong number of ${name}`;
    if (want.kind !== 'table') continue;
    for (const [k, len] of Object.entries(want.keys)) {
      if (!Object.hasOwn(mine, k)) return `no ${name}.${k}`;
      if (len > 0 && !(Array.isArray(mine[k]) && mine[k].length === len)) return `the wrong number of ${name}.${k}`;
    }
  }
  return null;
}
