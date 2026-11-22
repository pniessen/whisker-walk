// Save codes in the OLD shape (3 words of 256 and 2 digits): the word list and the code maker.
// A lazy chunk: only the tap that makes a new code needs it, so the start-up download does not
// carry it. Cat login M3 makes new codes with src/catcodes.js (4 words of 1,024); this one is
// kept for a server that has not had the v11 SQL step 2 yet and so only takes this shape.
import { randomIndex, uint32Source } from './randomindex.js';

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

export { randomIndex };

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

