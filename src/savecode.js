// Save codes: the word list and the code maker. A lazy chunk: only the tap that
// makes a new code needs it, so the start-up download does not carry it.

// 256-word safe list for save codes: short (4-6 letter), friendly
// nouns/animals/colors. No offensive or ambiguous words. ~30.6 bits of
// entropy across 3 words + a 2-digit suffix (256^3 * 100 ≈ 2^30.6), drawn
// from crypto.getRandomValues (see generateSaveCode).
const WORDLIST = [
  'OTTER', 'PANDA', 'ZEBRA', 'TIGER', 'EAGLE', 'ROBIN', 'HERON', 'RAVEN',
  'GOOSE', 'SWAN', 'CRANE', 'FINCH', 'QUAIL', 'OWLET', 'LLAMA', 'ALPACA',
  'BADGER', 'WEASEL', 'FERRET', 'RABBIT', 'BEAVER', 'MARTEN', 'JACKAL', 'COYOTE',
  'MOOSE', 'BISON', 'CIVET', 'LEMUR', 'KOALA', 'PONY', 'DEER', 'FAWN',
  'COLT', 'CALF', 'LAMB', 'GOAT', 'MULE', 'HARE', 'MOLE', 'VOLE',
  'NEWT', 'TOAD', 'FROG', 'CRAB', 'SEAL', 'ORCA', 'WHALE', 'SHARK',
  'TROUT', 'SALMON', 'GUPPY', 'TETRA', 'EGRET', 'STORK', 'IBIS', 'TERN',
  'LARK', 'WREN', 'DOVE', 'HAWK', 'CROW', 'MAGPIE', 'PIGEON', 'PARROT',
  'TOUCAN', 'PUFFIN', 'FALCON', 'CONDOR', 'OSPREY', 'GROUSE', 'TURKEY', 'CHICK',
  'PLUM', 'TEAL', 'GOLD', 'NAVY', 'RUBY', 'JADE', 'ROSE', 'CORAL',
  'AMBER', 'IVORY', 'OLIVE', 'SLATE', 'UMBER', 'SEPIA', 'OCHRE', 'CREAM',
  'BEIGE', 'MAUVE', 'LILAC', 'INDIGO', 'VIOLET', 'MAROON', 'TAUPE', 'BRONZE',
  'COPPER', 'SILVER', 'GOLDEN', 'EMBER', 'FLAME', 'BLUSH', 'PEARL', 'OPAL',
  'ONYX', 'FERN', 'MOSS', 'LEAF', 'REED', 'VINE', 'BLOOM', 'PETAL',
  'THORN', 'ACORN', 'MAPLE', 'BIRCH', 'CEDAR', 'ALDER', 'WILLOW', 'ASPEN',
  'PINE', 'POPPY', 'TULIP', 'DAISY', 'LOTUS', 'CLOVER', 'MEADOW', 'GARDEN',
  'VALLEY', 'RIVER', 'BROOK', 'CREEK', 'STONE', 'CLOUD', 'STORM', 'BREEZE',
  'FROST', 'SNOW', 'RAIN', 'MIST', 'MITTEN', 'SCARF', 'BOOTS', 'CANDY',
  'COOKIE', 'MUFFIN', 'BERRY', 'PEACH', 'MANGO', 'LEMON', 'APPLE', 'GRAPE',
  'CHERRY', 'HONEY', 'SUGAR', 'TOFFEE', 'WAFFLE', 'NOODLE', 'PICKLE', 'PEPPER',
  'GINGER', 'NUTMEG', 'CLOVE', 'BASIL', 'MINT', 'SAGE', 'THYME', 'PUPPY',
  'KITTEN', 'BUNNY', 'PIGLET', 'GERBIL', 'CANARY', 'WALRUS', 'OCELOT', 'LYNX',
  'PUMA', 'COUGAR', 'JAGUAR', 'HIPPO', 'RHINO', 'POSSUM', 'SKUNK', 'MINK',
  'VIPER', 'GECKO', 'IGUANA', 'TURTLE', 'LIZARD', 'SNAIL', 'AZURE', 'CYAN',
  'RUST', 'SAND', 'PEWTER', 'GRAY', 'FOREST', 'JUNGLE', 'OCEAN', 'AQUA',
  'COBALT', 'TOPAZ', 'GARNET', 'QUARTZ', 'MOCHA', 'CACAO', 'BAGEL', 'SCONE',
  'FUDGE', 'MOCHI', 'SORBET', 'GELATO', 'NECTAR', 'MELON', 'GUAVA', 'PAPAYA',
  'KIWI', 'RAISIN', 'ALMOND', 'WALNUT', 'PECAN', 'HAZEL', 'CASHEW', 'SUNSET',
  'DAWN', 'DUSK', 'COMET', 'NOVA', 'LUNAR', 'SOLAR', 'AURORA', 'TUNDRA',
  'DESERT', 'OASIS', 'HARBOR', 'ISLAND', 'LAGOON', 'COAST', 'SHORE', 'DUNE',
  'CLIFF', 'CANYON', 'RIDGE', 'PEAK', 'SUMMIT', 'PILLOW', 'CANDLE', 'HEARTH',
  'CABIN', 'PORCH', 'QUILT', 'YARN', 'BUTTON', 'RIBBON', 'TASSEL', 'VELVET',
];

// randomIndex(n, nextUint32) -> an integer in [0, n), with no modulo bias.
// A plain `x % n` over 2^32 values favours the low results whenever n does
// not divide 2^32 (it doesn't for the 100 two-digit suffixes), so draws at or
// above the largest multiple of n are thrown away and redrawn. For n = 256
// nothing is ever rejected; for n = 100 the chance is 96 in 2^32. The try cap
// only matters for a broken source that never returns a usable value.
export function randomIndex(n, nextUint32) {
  const limit = Math.floor(2 ** 32 / n) * n;
  let x = nextUint32();
  for (let tries = 1; x >= limit && tries < 64; tries++) x = nextUint32();
  return x % n;
}

// nextUint32 source for save codes: the platform CSPRNG. getRandomValues has
// been in every browser since 2013 (WKWebView included, and unlike
// randomUUID it doesn't need a secure context) and in Node since 15/19, so
// the Math.random fallback only runs where `crypto` is missing entirely.
function uint32Source(cryptoLike) {
  if (cryptoLike && typeof cryptoLike.getRandomValues === 'function') {
    const buf = new Uint32Array(1);
    return () => { cryptoLike.getRandomValues(buf); return buf[0]; };
  }
  return () => Math.floor(Math.random() * 2 ** 32);
}

/**
 * generateSaveCode(cryptoLike?) -> "PLUM-OTTER-CROW-42" style: 3 wordlist
 * picks + 2 digits. cryptoLike is anything with getRandomValues (the global
 * `crypto` by default; a fake in tests). The format is unchanged, so codes
 * made before the switch from Math.random keep working.
 */
export function generateSaveCode(cryptoLike = globalThis.crypto) {
  const next = uint32Source(cryptoLike);
  const pick = () => WORDLIST[randomIndex(WORDLIST.length, next)];
  const w1 = pick(); const w2 = pick(); const w3 = pick();
  const digits = randomIndex(100, next).toString().padStart(2, '0');
  return `${w1}-${w2}-${w3}-${digits}`;
}

