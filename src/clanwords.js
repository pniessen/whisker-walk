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
  'Aspen', 'Juniper', 'Hawthorn', 'Primrose', 'Sage', 'Tansy',
]);

// Lowercase second halves for an ordinary (warrior-rung) cat.
export const WARRIOR_SUFFIXES = Object.freeze([
  'fur', 'tail', 'whisker', 'heart', 'foot', 'stripe',
  'eye', 'wing', 'fang', 'leaf', 'shade', 'ear', 'belly', 'song',
]);

// The suffix a cat wears while it holds a rung that renames it.
export const RANK_SUFFIX = Object.freeze({ kit: 'kit', apprentice: 'paw', leader: 'star' });

// What a clan's title is called: prefix + 'Clan' (MossClan).
export const CLAN_SUFFIX = 'Clan';

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
});

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
]);
