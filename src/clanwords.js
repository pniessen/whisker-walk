// Every word the clan borrows from Erin Hunter's *Warrior Cats*, in one place.
//
// This is the ONE file that holds vocabulary borrowed from that series (spec
// section 6.8, decision 3). If the game is ever made public, swapping the
// vocabulary is one commit against this one file: no other module may spell a
// borrowed word in a string literal. A structural test in clanwords.test.js
// scans src/ for exactly that, using RANK_WORDS, OUTSIDE_WORDS and CLAN_SUFFIX.
// (RANK_SUFFIX is deliberately not scanned: 'paw' already appears in unrelated
// src/ literals.) That is also why the display words below were each grepped
// against src/ string literals and found clean; keep them that way.
//
// A leaf module, data only: it imports nothing and has no functions, so every
// later clan task can consume it without a cycle and without pulling in THREE.
//
// Pool size must NEVER be derived from, or feed, CAT_NAMES in straynames.js.
// That list is the 48 strays and is fixed; clan names are composed here, from
// a prefix and a suffix, and the two sets of names are unrelated.
//
// Shape constraints come from validPetName() in net.js, because a clan name
// travels as a pet name: 2-16 characters, letters/spaces/hyphens only, and no
// case-insensitive substring from its profanity blocklist. So a prefix is at
// most 12 characters (prefix + 'Clan' and prefix + 'star' must both fit), and
// the tests build the full prefix x suffix cross product to catch an innocent
// pair that trips the blocklist by accident. Where the deny list or
// validPetName rejects a pool word, the WORD is dropped, never the rule.

// Capitalised first halves of a name: Moss + fur = Mossfur.
export const PREFIXES = Object.freeze([
  'Moss', 'Fern', 'Willow', 'Berry', 'Dawn', 'Birch', 'Briar', 'Sparrow',
  'Lark', 'Wren', 'Thistle', 'Clover', 'Lichen', 'Nettle', 'Acorn', 'Marsh',
  'Aspen', 'Larch', 'Hawthorn', 'Primrose', 'Sage', 'Tansy',
]);

// Each of the 64 stored names (the 48 CAT_NAMES, the 12 KIT_NAMES, then the 4
// LEGENDARY_NAMES) has its OWN prefix here, so no two cats share a clan name
// at ANY rank (Mosskit, Mosspaw, Mossfur...). The hash over PREFIXES alone
// could not do it: 22 prefixes cannot cover 64 names, and kits and
// apprentices share one suffix.
//
// Generated ONCE by a throwaway script and pasted in as a literal; nothing here
// is computed at runtime, and a test pins every rule below. The script walked
// the names in the order they appear here. A name kept the prefix the old hash
// gave it (PREFIXES[seedFromCode(name + '|27') % 22]) if no earlier name had
// taken it, so a cat the children have already met keeps its name where it
// can. Otherwise it took the next unused word from this extra list, in order:
//   Rowan, Ivy, Poppy, Daisy, Rush, Bluebell, Violet, Crocus,
//   Lily, Aster, Dew, Breeze, Meadow, Brook, Pine, Spruce,
//   Elm, Linden, Yarrow, Thyme, Basil, Tulip, Daffodil, Mallow,
//   Orchid, Cress, Burdock, Snowdrop, Pond, Stream, Sunny, Twig,
//   Blossom, Skylark, Robin, Finch, Swallow, Plover, Linnet.
// Seven were then swapped by hand so no name doubles a letter at the join
// (Larkkit, Brookkit, Burdockkit, Skylarkkit, Tulippaw, Snowdroppaw,
// Meadowwhisker): Marmalade Amber, Meatball Tawny, Static Heath, Pip Pansy,
// Beignet Rose, Doppler Myrtle, Sprout Laurel. A test pins "no doubled join".
// Every word is 3-8 letters, nature-ish and kid-friendly; is not a stray or
// kit name, a RIVAL_PREFIXES word or a PREFIXES word; and builds no denied or
// invalid name with 'kit', 'paw' or any WARRIOR_SUFFIXES entry.
// Read with Object.hasOwn (see prefixFor): an inherited key ('__proto__') is
// not a cat. Do not reorder or edit a value once names have shipped.
export const CAT_PREFIXES = Object.freeze({
  'Pickles': 'Wren',
  'Marmalade': 'Amber',
  'Baron von Fluff': 'Lichen',
  'Mochi': 'Moss',
  'Biscuit': 'Primrose',
  'Clementine': 'Sage',
  'Noodle': 'Sparrow',
  'Pumpkin': 'Willow',
  'Sardine': 'Rowan',
  'Waffles': 'Ivy',
  'Miso': 'Poppy',
  'Turnip': 'Thistle',
  'Gadget': 'Daisy',
  'Petunia': 'Briar',
  'Sir Pounce': 'Acorn',
  'Dumpling': 'Rush',
  'Olive': 'Berry',
  'Paprika': 'Dawn',
  'Crumpet': 'Bluebell',
  'Zucchini': 'Birch',
  'Maple': 'Nettle',
  'Tofu': 'Violet',
  'Wasabi': 'Crocus',
  'Pretzel': 'Aspen',
  'Nimbus': 'Lily',
  'Pepper': 'Aster',
  'Butterscotch': 'Dew',
  'Fig': 'Breeze',
  'Tangerine': 'Larch',
  'Cocoa': 'Fern',
  'Sprout': 'Laurel',
  'Juniper': 'Tansy',
  'Meatball': 'Tawny',
  'Parsnip': 'Pine',
  'Ziggy': 'Spruce',
  'Bean': 'Elm',
  'Churro': 'Linden',
  'Anchovy': 'Yarrow',
  'Popcorn': 'Thyme',
  'Gnocchi': 'Basil',
  'Beignet': 'Rose',
  'Truffle': 'Daffodil',
  'Ramen': 'Mallow',
  'Custard': 'Orchid',
  'Peaches': 'Cress',
  'Static': 'Heath',
  'Doppler': 'Myrtle',
  'Comet': 'Pond',
  'Bramble': 'Stream',
  'Pebble': 'Sunny',
  'Wiggle': 'Twig',
  'Fennel': 'Blossom',
  'Bumble': 'Marsh',
  'Pip': 'Pansy',
  'Peanut': 'Clover',
  'Cupcake': 'Robin',
  'Puddle': 'Finch',
  'Tumble': 'Swallow',
  'Toffee': 'Plover',
  'Ember': 'Linnet',
  // The four LEGENDARY_NAMES, hand-picked (not walked by the script above), one
  // to suit each grand old cat and obeying every rule above: a regal iris for
  // Duchess, a park chestnut for Professor Whiskers (Hazel was refused:
  // Hazeltail is a published name), coral for Captain Barnacle, a night owl
  // for Lord Lantern on the lamplit docks.
  'Duchess': 'Iris',
  'Professor Whiskers': 'Chestnut',
  'Captain Barnacle': 'Coral',
  'Lord Lantern': 'Owl',
});

// One hand-authored first half per walk area, for that area's rival clan
// (spec R18). Deliberately NOT drawn from PREFIXES, so the player's own clan
// name can never equal a rival's. Each word is nature-ish and fits its area so
// a child can tell the four apart: a hedge in the neighborhood, an alder in the
// park, a dune by the sea, a heron on the canal. None is a stray or kit name.
// Read with Object.hasOwn: an inherited key ('__proto__') is not an area.
export const RIVAL_PREFIXES = Object.freeze({
  neighborhood: 'Hedge',
  park: 'Alder',
  seaside: 'Dune',
  docks: 'Heron',
});

// Lowercase second halves for an ordinary (warrior-rung) cat.
export const WARRIOR_SUFFIXES = Object.freeze([
  'fur', 'tail', 'whisker', 'heart', 'foot', 'stripe',
  'eye', 'wing', 'fang', 'leaf', 'shade', 'ear', 'belly', 'song',
]);

// The suffix a cat wears while it holds a rung that renames it.
export const RANK_SUFFIX = Object.freeze({ kit: 'kit', apprentice: 'paw', leader: 'star' });

// What a clan's title is called: prefix + 'Clan' (MossClan).
export const CLAN_SUFFIX = 'Clan';

// Internal identifiers for every rank and role. These are NOT display text:
// they are the keys other modules compare and return (clanRankFor returns
// RANK_KEYS.warrior, roleFor returns RANK_KEYS.elder). They live here so no
// other src/ module spells a borrowed word as a string literal, which the
// structural scan of src/ could not tell apart from display text. A vocabulary
// swap edits RANK_WORDS' values below; RANK_KEYS stays put.
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

// The words a player reads for each rung.
export const RANK_WORDS = Object.freeze({
  kit: 'kit',
  apprentice: 'apprentice',
  warrior: 'warrior',
  elder: 'elder',
  queen: 'queen',
  medicine: 'medicine cat',
  deputy: 'deputy',
  leader: 'leader',
});

// How a cat from outside the clan reads: a greeted stray is a loner, a cross
// cat is a rogue, and the player's own cat is a kittypet.
export const OUTSIDE_WORDS = Object.freeze({
  met: 'loner',
  grudge: 'rogue',
  player: 'kittypet',
  // A stray who lives in Twolegplace (a kittypet name, straynames.js). The value
  // equals `player` on purpose: `player` is the player's own cat, `house` is a
  // stray, and a later vocabulary swap may word them differently. Do not merge.
  house: 'kittypet',
});

// Place names borrowed from the books. Keyed by the game's own territory id
// (never by the word), so no id in src/ has to spell a borrowed word.
export const PLACE_WORDS = Object.freeze({ town: 'Twolegplace' });

// Published character names the pools must never be able to compose, so a
// child who has read the books never meets a real character by accident. The
// test only requires the prefix x suffix cross product to be clean, but a
// larger list is cheaper than a collision, so it is generous.
export const DENIED_NAMES = new Set([
  // ThunderClan
  'Firestar', 'Fireheart', 'Firepaw', 'Firekit', 'Bluestar', 'Bluefur', 'Graystripe', 'Graypaw',
  'Tigerclaw', 'Tigerstar', 'Thunderstar', 'Sandstorm', 'Sandpaw', 'Dustpelt', 'Dustpaw',
  'Ashfur', 'Brackenfur', 'Brightheart', 'Cloudtail', 'Cloudkit', 'Spottedleaf',
  'Yellowfang', 'Cinderpelt', 'Longtail', 'Mousefur', 'Darkstripe', 'Ravenpaw',
  'Whitestorm', 'Lionheart', 'Redtail', 'Runningwind', 'Willowpelt', 'Sorreltail',
  'Brambleclaw', 'Brambleberry', 'Squirrelflight', 'Leafpool', 'Jayfeather', 'Lionblaze',
  'Hollyleaf', 'Cinderheart', 'Dovewing', 'Ivypool', 'Birchfall', 'Berrynose',
  'Hazeltail', 'Poppyfrost', 'Thornclaw', 'Rosepetal', 'Foxleap', 'Bumblestripe',
  'Mousewhisker', 'Cherrypaw', 'Molepaw', 'Rainwhisker', 'Cloudpaw', 'Dappletail',
  'Frostfur', 'Swiftpaw', 'Whitepaw', 'Snowfur', 'Goldenflower', 'Ferncloud',
  'Brindleface', 'Fallowfern', 'Mousepaw', 'Tigerheart', 'Stormfur',
  // ShadowClan
  'Brokenstar', 'Blackfoot', 'Oakheart', 'Boulder', 'Tawnypelt', 'Tawnyspots',
  'Scorchfur', 'Cinderfur', 'Ambermoon', 'Littlecloud', 'Rowanclaw', 'Tallpoppy',
  'Blackstar', 'Nightstar', 'Raggedstar', 'Rowanstar', 'Pinestar', 'Cedarheart',
  'Oakfur', 'Clawface', 'Ashfoot', 'Dawnpelt', 'Flametail', 'Snaketail',
  // WindClan
  'Tallstar', 'Onewhisker', 'Onestar', 'Mudclaw', 'Whitetail', 'Crowfeather',
  'Nightcloud', 'Heathertail', 'Gorsetail', 'Ashfoot', 'Deadfoot', 'Barkface',
  'Weaselfur', 'Leaftail', 'Furzepelt', 'Sedgewhisker', 'Harespring', 'Breezepelt',
  'Emberfoot', 'Windstar', 'Mudfur', 'Whiskernose',
  // RiverClan
  'Leopardstar', 'Mistystar', 'Mistyfoot', 'Stormfur', 'Feathertail', 'Crookedstar',
  'Mallownose', 'Graystorm', 'Blackclaw', 'Hawkfrost', 'Reedwhisker', 'Voletooth',
  'Rippletail', 'Beechfur', 'Heavystep', 'Silverstream', 'Willowshine', 'Mothwing',
  'Petalfur', 'Mosspelt', 'Duskfur', 'Lakeheart', 'Dawnflower', 'Pebblefoot',
  // SkyClan and the rest
  'Leafstar', 'Sharpclaw', 'Cloudstar', 'Echosong', 'Rockshade', 'Billystorm',
  'Mapleshade', 'Spiderleg', 'Hollytuft', 'Smudge', 'Princess', 'Purdy', 'Barley',
  'Ravenpaw', 'Scourge', 'Sol', 'Midnight', 'Tinycloud', 'Jaggedtooth',
  // Clan Life: names the clan cast could compose at a fixed suffix or a stepped
  // one (Root, Toad, Trout and Mint sit in warrior slots because of these).
  'Rootpaw', 'Toadkit', 'Troutkit', 'Mintpaw', 'Mintfur',
]);

// ---- Homage clan names (decision 3) ----
// These are homages chosen with the 11-year-old: close in feel to the books,
// never the book names themselves. HOMAGE_PREFIXES holds the names chosen on
// 2026-10-31; the rest of each HOMAGE_CHOICES list are spares (checked by the
// tests), so a change is one line. Once a name has shipped, change a value
// only if she asks, because nothing is stored by name (saves store the id).
// Keys are the clan's home territory id.
export const HOMAGE_CHOICES = Object.freeze({
  woods: Object.freeze(['Storm', 'Tempest', 'Lightning', 'Oak']),
  moor: Object.freeze(['Gale', 'Gust', 'Heather', 'Swift']),
  river: Object.freeze(['Brook', 'Ripple', 'Reed', 'Otter']),
  pines: Object.freeze(['Dusk', 'Night', 'Murk', 'Gloom']),
  gorge: Object.freeze(['Cliff', 'Cloud', 'Hawk', 'Falcon']),
});

export const HOMAGE_PREFIXES = Object.freeze({
  woods: 'Storm', moor: 'Gale', river: 'Brook', pines: 'Dusk', gorge: 'Cliff',
});

// One plain flavour line per clan, for the pick cards.
export const HOME_LINES = Object.freeze({
  woods: 'oak woods, ferns and sunny clearings',
  moor: 'open heather, wind and rabbits',
  river: 'reeds, fishing and the pond',
  pines: 'dark pines and the swamp',
  gorge: 'rocks, cliff dens and tall pines',
});

// ---- Clan Life: the name words of each clan's camp cast ----
// Sixteen hand-picked, our own words per clan, in SLOT order (see CAST_RANKS in
// clancast.js): leader, elder, kit, kit, warrior x3, apprentice x2 | deputy,
// elder, kit, kit, warrior x2, apprentice. The first nine of each list are the
// owner's (decision 2); the last seven are the builder's picks for the busier
// HIGH camp. Root, Toad, Trout and Mint sit in warrior slots (Rootpaw, Toadkit,
// Troutkit and Mintpaw are book names); Glade, Slate, Shingle and Teal took
// their old places. A word that fails a test is swapped for one that passes
// the same tests, never the rule weakened. Once shipped, a value changes only
// if the 11-year-old asks, because nothing stores it. CliffClan's sixteen
// (gorge, part 4 K6) are all the planner's: the owner's daughter has not
// chosen its first nine. Do not add these to the scanner's list.
export const CLAN_CAT_PREFIXES = Object.freeze({
  woods: Object.freeze(['Badger', 'Bark', 'Bluejay', 'Burr', 'Conker', 'Fawn', 'Root', 'Glade', 'Bryony',
    'Thrush', 'Hollow', 'Nutmeg', 'Loam', 'Rook', 'Dormouse', 'Spindle']),
  moor: Object.freeze(['Curlew', 'Lapwing', 'Peat', 'Grouse', 'Cotton', 'Tor', 'Bilberry', 'Stoat', 'Pipit',
    'Cairn', 'Ling', 'Wisp', 'Snipe', 'Quill', 'Ridge', 'Whin']),
  river: Object.freeze(['Minnow', 'Pike', 'Shingle', 'Newt', 'Vole', 'Trout', 'Mint', 'Dipper', 'Teal',
    'Caddis', 'Gudgeon', 'Mayfly', 'Silt', 'Roach', 'Wader', 'Marigold']),
  pines: Object.freeze(['Cone', 'Bog', 'Slate', 'Resin', 'Needle', 'Beetle', 'Toad', 'Frog', 'Adder',
    'Sable', 'Mire', 'Gnat', 'Sloe', 'Fungus', 'Soot', 'Bat']),
  gorge: Object.freeze(['Crag', 'Granite', 'Scree', 'Sprig', 'Flint', 'Merlin', 'Shale', 'Pika', 'Gully',
    'Bluff', 'Tarn', 'Puff', 'Nimble', 'Stonecrop', 'Thrift', 'Crest']),
});
