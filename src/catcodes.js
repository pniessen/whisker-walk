// Cat codes: the word list, the code maker, and the reading of a typed code. A lazy chunk
// (cat login M3): the tap that makes or types a cat code needs it, so the start-up download
// does not carry the 1,024 words. Nothing in this file talks to a network: typing a code
// only reads and snaps words; a request is made later, by a tap, from the sheet.
//
// A new cat code is 4 words from this list: 2^40 possibilities (the old shape, 3 words of 256
// and 2 digits, is 2^30.6; see docs/superpowers/specs/2026-11-22-cat-login-design.md 5.1).
// Rules the list keeps (test/catcodes.test.js reads them):
//   * 1,024 words of 3 to 6 letters, A-Z, no two with the same first three letters (type three
//     letters and tap the word), none the start of another, none one edit from another (a
//     mistyped word then snaps to at most one word);
//   * none a word of the series sets, a stray name or a family cat's name (the public bundle must
//     not carry a series word), none on the block list kept in test/fixtures/badwords.json;
//   * plain things: animals, foods, colours, places, objects. No body words, nothing scary.
import { randomIndex, uint32Source } from './randomindex.js';

export const CAT_WORDS = Object.freeze([
  'ABACUS', 'ABBEY', 'ABODE', 'ACACIA', 'ACRE', 'ACTOR', 'ADDAX', 'ADOBE',
  'ADULT', 'AGATE', 'ALASKA', 'ALBUM', 'ALCOVE', 'ALGAE', 'ALIEN', 'ALLEY',
  'ALMOND', 'ALOE', 'ALPS', 'ALTAR', 'AMAZON', 'AMULET', 'ANCHOR', 'ANDES',
  'ANGORA', 'ANISE', 'ANORAK', 'ANTHEM', 'ANVIL', 'APEX', 'APHID', 'APIARY',
  'APOLLO', 'APRIL', 'AQUA', 'ARCTIC', 'ARENA', 'ARGYLE', 'ARMOR', 'AROMA',
  'ARROW', 'ARTIST', 'ASCOT', 'ATHENS', 'ATLAS', 'ATOM', 'ATTIC', 'AUDIO',
  'AUGER', 'AUK', 'AURORA', 'AUSTIN', 'AUTUMN', 'AVENUE', 'AVOCET', 'AWARD',
  'AWL', 'AWNING', 'AXEL', 'AZALEA', 'AZTEC', 'AZURE', 'BABOON', 'BACON',
  'BAGEL', 'BAIT', 'BAKERY', 'BALER', 'BAMBOO', 'BANKER', 'BARBER', 'BASIN',
  'BATTER', 'BAYOU', 'BAZAAR', 'BEAK', 'BEDBUG', 'BEEPER', 'BEIGE', 'BELIZE',
  'BENCH', 'BERET', 'BETA', 'BIKE', 'BILLOW', 'BINDER', 'BIRD', 'BISHOP',
  'BLAZE', 'BLEND', 'BLINTZ', 'BLOUSE', 'BOAT', 'BOBCAT', 'BOGLE', 'BOLERO',
  'BONBON', 'BOOTS', 'BORAGE', 'BOSTON', 'BOTTLE', 'BOUGH', 'BOW', 'BOXER',
  'BRAZIL', 'BREWER', 'BRINE', 'BRONZE', 'BRUIN', 'BUBBLY', 'BUCKET', 'BUDGET',
  'BUFFET', 'BUGGY', 'BULB', 'BUMPER', 'BUN', 'BUOY', 'BURGER', 'BUSHEL',
  'BUTLER', 'CABLE', 'CACAO', 'CADDIE', 'CAGE', 'CAIRO', 'CALF', 'CAMEL',
  'CANARY', 'CAPER', 'CARP', 'CASTLE', 'CATNIP', 'CAVIAR', 'CEDAR', 'CELLO',
  'CEMENT', 'CHARD', 'CHESS', 'CHIEF', 'CHORUS', 'CHROME', 'CHUM', 'CICADA',
  'CINEMA', 'CIRCUS', 'CITRON', 'CIVET', 'CLASP', 'CLERK', 'CLINIC', 'CLOCK',
  'CLUBS', 'COAL', 'COBRA', 'COD', 'COFFEE', 'COIN', 'COLUMN', 'COMIC',
  'CONDOR', 'COOKIE', 'COPSE', 'CORGI', 'COSMOS', 'COURT', 'COVE', 'COWBOY',
  'COYOTE', 'COZY', 'CRATE', 'CREPE', 'CRISP', 'CROW', 'CRUMB', 'CUBIC',
  'CUCKOO', 'CUDDLY', 'CUMIN', 'CURRY', 'CUSP', 'CUTTER', 'CYAN', 'CYGNET',
  'CYMBAL', 'DAFFY', 'DAGGER', 'DAHLIA', 'DAIRY', 'DALLAS', 'DAMSON', 'DANUBE',
  'DAPPLE', 'DART', 'DASH', 'DAYBED', 'DAZZLE', 'DECAL', 'DELHI', 'DENVER',
  'DERBY', 'DESERT', 'DIADEM', 'DIESEL', 'DIG', 'DILL', 'DIME', 'DINNER',
  'DIRNDL', 'DISCO', 'DITCH', 'DIVING', 'DIZZY', 'DOCTOR', 'DOGGIE', 'DOILY',
  'DOLLS', 'DOMINO', 'DONUT', 'DOOR', 'DORY', 'DOSE', 'DOWEL', 'DOZEN',
  'DRAGON', 'DREAM', 'DRIVER', 'DRONE', 'DRUM', 'DRYAD', 'DUBAI', 'DUCK',
  'DUFFEL', 'DUGOUT', 'DUNLIN', 'DURIAN', 'DUSTER', 'DUVET', 'DWARF', 'DYNAMO',
  'EAGER', 'EARLY', 'EASEL', 'EATERY', 'ECLAIR', 'EGGNOG', 'EGRET', 'EGYPT',
  'EIDER', 'ELFIN', 'ELK', 'EMBLEM', 'EMPIRE', 'EMU', 'ENAMEL', 'ENCORE',
  'ENDIVE', 'ENGINE', 'ENSIGN', 'ENTRY', 'EPOCH', 'ERASER', 'ERMINE', 'ERROR',
  'ESCAPE', 'ETHER', 'EVE', 'EXAM', 'EXIT', 'EYELET', 'FABRIC', 'FACE',
  'FAITH', 'FALLS', 'FANCY', 'FARMER', 'FAST', 'FAUCET', 'FEDORA', 'FEEDER',
  'FELINE', 'FENCE', 'FERRIS', 'FETCH', 'FEVER', 'FIDDLE', 'FIERY', 'FIFTY',
  'FIGURE', 'FIJI', 'FILM', 'FIN', 'FIRE', 'FISHER', 'FJORD', 'FLAP',
  'FLEECE', 'FLING', 'FLOAT', 'FLURRY', 'FLYER', 'FOAM', 'FOCUS', 'FOGGY',
  'FOLDER', 'FONDUE', 'FOOD', 'FORUM', 'FOSSIL', 'FOX', 'FRAPPE', 'FRENCH',
  'FRIAR', 'FROZE', 'FRUIT', 'FUDGE', 'FUEL', 'FUGUE', 'FUNNEL', 'FURROW',
  'FUSE', 'FUTON', 'GABBLE', 'GADFLY', 'GALLOP', 'GANTRY', 'GARNET', 'GASKET',
  'GATOR', 'GAUCHO', 'GAVEL', 'GAZEBO', 'GEAR', 'GECKO', 'GEESE', 'GELATO',
  'GENET', 'GERMAN', 'GEYSER', 'GHANA', 'GHOST', 'GIANT', 'GIDDY', 'GIFT',
  'GIMLET', 'GINGKO', 'GIRDER', 'GIZMO', 'GLARE', 'GLEAM', 'GLIDER', 'GLOBE',
  'GLUE', 'GNOME', 'GOATEE', 'GOBLIN', 'GODWIT', 'GOGGLE', 'GOLDEN', 'GONG',
  'GOOSE', 'GOPHER', 'GOSPEL', 'GOURD', 'GOWN', 'GRASS', 'GREED', 'GRIND',
  'GROTTO', 'GRUMPY', 'GUARD', 'GUIDE', 'GULL', 'GUMBO', 'GUPPY', 'GYM',
  'GYPSUM', 'HAGGIS', 'HAITI', 'HALO', 'HAMLET', 'HAPPY', 'HARDY', 'HATBOX',
  'HAUNT', 'HAVEN', 'HAZEL', 'HEATER', 'HEIFER', 'HELMET', 'HEN', 'HERMIT',
  'HINGE', 'HIPPO', 'HOBNOB', 'HOE', 'HOLLY', 'HONOR', 'HOOP', 'HOPPER',
  'HORSE', 'HOSTEL', 'HOTDOG', 'HOVEL', 'HOWL', 'HUBCAP', 'HUG', 'HULA',
  'HUMOR', 'HUNTER', 'HURDLE', 'HUSKY', 'HUTCH', 'HYDRA', 'HYENA', 'HYRAX',
  'HYSSOP', 'IBEX', 'IBIS', 'ICECAP', 'ICICLE', 'IDAHO', 'IDEA', 'IGLOO',
  'IGUANA', 'IMAGE', 'IMPALA', 'INCA', 'INDIA', 'INGOT', 'INKPOT', 'INLET',
  'INN', 'INSECT', 'IOWA', 'IRON', 'ITALY', 'IVORY', 'JABBER', 'JACKAL',
  'JADE', 'JAGUAR', 'JALOPY', 'JAPAN', 'JARGON', 'JASPER', 'JAUNTY', 'JAVA',
  'JAY', 'JAZZ', 'JEANS', 'JEEP', 'JELLY', 'JERBOA', 'JESTER', 'JETTY',
  'JEWEL', 'JIGGER', 'JINGLE', 'JITNEY', 'JIVE', 'JOCKEY', 'JOG', 'JOIST',
  'JOKE', 'JUDO', 'JUGGLE', 'JUICE', 'JUMPY', 'JUNE', 'JURY', 'KABOB',
  'KAFTAN', 'KAKAPO', 'KALE', 'KANSAS', 'KARATE', 'KAYAK', 'KAZOO', 'KEBAB',
  'KEEL', 'KELPIE', 'KENYA', 'KERNEL', 'KETTLE', 'KHAKI', 'KIBBLE', 'KICK',
  'KILN', 'KIMCHI', 'KINDLE', 'KIOSK', 'KIPPER', 'KITE', 'KIWI', 'KNISH',
  'KNOCK', 'KOHL', 'KOI', 'KOLA', 'KOMBU', 'KRILL', 'KUDU', 'KYOTO',
  'LAB', 'LADLE', 'LAGOS', 'LAIR', 'LAMBDA', 'LANE', 'LAPTOP', 'LARDER',
  'LASSO', 'LATKE', 'LAWN', 'LAYER', 'LEASE', 'LEDGER', 'LEGUME', 'LEMUR',
  'LENS', 'LEVEL', 'LID', 'LIGHT', 'LILAC', 'LIMPET', 'LINTEL', 'LION',
  'LISBON', 'LIZARD', 'LLAMA', 'LOAF', 'LOBBY', 'LOCUST', 'LODGE', 'LOFT',
  'LOGGER', 'LONDON', 'LOOFAH', 'LOQUAT', 'LORIS', 'LOTUS', 'LOUNGE', 'LOYAL',
  'LUCKY', 'LUMBER', 'LUNAR', 'LUPIN', 'LUTE', 'LYCHEE', 'LYNX', 'LYRIC',
  'MACAW', 'MADRID', 'MAGIC', 'MAIDEN', 'MAJOR', 'MAKER', 'MALL', 'MAMBO',
  'MANTLE', 'MARS', 'MASK', 'MAT', 'MAUVE', 'MAYAN', 'MAZE', 'MEADOW',
  'MEDIC', 'MELON', 'MEMO', 'MENTOR', 'MERRY', 'MESA', 'METER', 'MEXICO',
  'MIAMI', 'MICA', 'MIDGE', 'MILLER', 'MIMIC', 'MINOR', 'MIRROR', 'MIST',
  'MITTEN', 'MIXER', 'MOBILE', 'MOCHA', 'MODE', 'MOLD', 'MONTH', 'MOON',
  'MOP', 'MORTAR', 'MOSAIC', 'MOTTO', 'MOUSER', 'MOVIE', 'MOWER', 'MUDPIE',
  'MUESLI', 'MUKLUK', 'MULCH', 'MUMBLE', 'MUPPET', 'MURAL', 'MUSLIN', 'MYTH',
  'NACHO', 'NAIL', 'NANNY', 'NAPKIN', 'NAVAL', 'NEBULA', 'NECTAR', 'NEON',
  'NEPAL', 'NESTLE', 'NET', 'NEVADA', 'NIB', 'NICHE', 'NIECE', 'NILE',
  'NINJA', 'NITWIT', 'NOBLE', 'NOGGIN', 'NOISE', 'NOMAD', 'NOOK', 'NORWAY',
  'NOTCH', 'NOUGAT', 'NOVA', 'NUGGET', 'NUMBAT', 'NURSE', 'NUTTY', 'NYMPH',
  'OASIS', 'OATH', 'OBOE', 'OCEAN', 'OCHRE', 'OFFICE', 'OHIO', 'OIL',
  'OKAPI', 'OKRA', 'OMELET', 'ONION', 'OPAL', 'OPERA', 'ORANGE', 'ORBIT',
  'ORCA', 'OREGON', 'ORGAN', 'ORIOLE', 'ORYX', 'OSLO', 'OSPREY', 'OUNCE',
  'OUTLAW', 'OVEN', 'OWLET', 'OXBOW', 'OXCART', 'OXTAIL', 'OYSTER', 'OZONE',
  'PAD', 'PAELLA', 'PAGODA', 'PALACE', 'PAMPAS', 'PANAMA', 'PAPAYA', 'PARIS',
  'PASTEL', 'PATIO', 'PAVE', 'PAWPAW', 'PEAHEN', 'PECAN', 'PEELER', 'PEG',
  'PENCIL', 'PEONY', 'PEPPY', 'PERIL', 'PESTO', 'PETAL', 'PEWTER', 'PHLOX',
  'PHOTO', 'PIANO', 'PICKUP', 'PIER', 'PIGSTY', 'PILAF', 'PINTO', 'PIPE',
  'PIRATE', 'PITA', 'PIVOT', 'PIXIE', 'PIZZA', 'PLAID', 'PLEAT', 'PLIERS',
  'PLOUGH', 'PLUMB', 'POACH', 'POCKET', 'PODIUM', 'POEM', 'POINT', 'POLKA',
  'POMELO', 'PONCHO', 'POODLE', 'POPLAR', 'PORT', 'POSY', 'POTTER', 'POUND',
  'POWDER', 'PRAGUE', 'PRIVET', 'PROUD', 'PRUNE', 'PUFFIN', 'PULSAR', 'PUMICE',
  'PUNCH', 'PUPIL', 'PURSER', 'PUZZLE', 'PYJAMA', 'PYRE', 'PYTHON', 'QUAICH',
  'QUEUE', 'QUIP', 'QUOLL', 'RABBIT', 'RACKET', 'RADISH', 'RAFTER', 'RAGOUT',
  'RAISE', 'RAM', 'RANCH', 'RAPIER', 'RASCAL', 'RATTAN', 'RAVINE', 'RAYON',
  'RAZOR', 'REALM', 'RED', 'REEF', 'RELISH', 'RHINO', 'RIBBON', 'RICE',
  'ROAR', 'ROBOT', 'ROCKY', 'RODEO', 'ROLLER', 'ROOST', 'ROPE', 'ROVER',
  'RUBBLE', 'RUFFLE', 'RUGBY', 'RULER', 'RUMBA', 'RUNNER', 'RUSTLE', 'RYE',
  'SABOT', 'SACHET', 'SADDLE', 'SAFARI', 'SAGA', 'SAINT', 'SALEM', 'SAMBA',
  'SANDAL', 'SARONG', 'SATURN', 'SAUNA', 'SCARF', 'SCHOOL', 'SCORE', 'SCREW',
  'SEASON', 'SEDAN', 'SEESAW', 'SENSOR', 'SEPIA', 'SEQUIN', 'SERVE', 'SESAME',
  'SETTER', 'SHARP', 'SHERRY', 'SHIELD', 'SHOWY', 'SHRIMP', 'SICKLE', 'SIEVE',
  'SIGMA', 'SILVER', 'SIMPLE', 'SINGER', 'SIRIUS', 'SITAR', 'SKATES', 'SKEIN',
  'SKIMP', 'SKUNK', 'SKY', 'SLEET', 'SLICE', 'SLOTH', 'SLUSH', 'SMELT',
  'SMITH', 'SMOCK', 'SNAKE', 'SNOOD', 'SNUG', 'SOAP', 'SOCCER', 'SODA',
  'SOLAR', 'SONNET', 'SORBET', 'SOUTH', 'SPADES', 'SPECK', 'SPHERE', 'SPILL',
  'SPLAT', 'SPOON', 'SPRITE', 'SQUASH', 'STAMP', 'STEAM', 'STITCH', 'STONY',
  'STRAW', 'STUDIO', 'STYLUS', 'SUB', 'SUEDE', 'SUGAR', 'SUMMER', 'SUNSET',
  'SUPPER', 'SURF', 'SUSHI', 'SWAN', 'SWEDEN', 'SWIRL', 'SWORD', 'SYRUP',
  'TABLET', 'TACKLE', 'TAG', 'TAILOR', 'TALLOW', 'TAMPA', 'TANGO', 'TAPIR',
  'TARTAN', 'TASSEL', 'TAUPE', 'TAVERN', 'TAXI', 'TEACUP', 'TEDDY', 'TEEPEE',
  'TEMPO', 'TENT', 'TERN', 'TETRA', 'TEXAS', 'THATCH', 'THORN', 'THREAD',
  'TIARA', 'TIBET', 'TICKET', 'TIDY', 'TIE', 'TIGER', 'TILT', 'TIMID',
  'TINSEL', 'TIPPET', 'TOAST', 'TOGO', 'TOKYO', 'TOLL', 'TOMTOM', 'TONGS',
  'TOPAZ', 'TORCH', 'TOTEM', 'TOUCAN', 'TOWHEE', 'TOYBOX', 'TRAP', 'TREE',
  'TRIBE', 'TROPHY', 'TRUNK', 'TUBA', 'TUFT', 'TULSA', 'TUNDRA', 'TURBAN',
  'TUSK', 'TUTU', 'TWELVE', 'TWIST', 'UDDER', 'UMBRA', 'UPLAND', 'URN',
  'UTAH', 'UTOPIA', 'VACUUM', 'VALVE', 'VAMP', 'VAN', 'VAPOR', 'VASE',
  'VAULT', 'VECTOR', 'VEGA', 'VELLUM', 'VENUS', 'VERSE', 'VESSEL', 'VICAR',
  'VIEW', 'VIGIL', 'VIKING', 'VILLA', 'VINE', 'VIOLIN', 'VIPER', 'VIREO',
  'VISOR', 'VIZIER', 'VOICE', 'VOLGA', 'VOTE', 'VOYAGE', 'WACO', 'WAFFLE',
  'WAGON', 'WAITER', 'WAKE', 'WALRUS', 'WANDER', 'WAPITI', 'WARREN', 'WASP',
  'WATTLE', 'WEAVER', 'WEB', 'WEDGE', 'WELLIE', 'WEST', 'WHARF', 'WHEAT',
  'WHIRL', 'WICKER', 'WIDGET', 'WIGWAM', 'WILLET', 'WINDOW', 'WISH', 'WITTY',
  'WOLF', 'WOMBAT', 'WONTON', 'WOOL', 'WORM', 'WREATH', 'WRIST', 'YACHT',
  'YAK', 'YARD', 'YEAST', 'YELP', 'YETI', 'YODEL', 'YOGURT', 'YONDER',
  'YOYO', 'YUCCA', 'YURT', 'ZANY', 'ZEAL', 'ZEBRA', 'ZENITH', 'ZEPHYR',
  'ZESTY', 'ZEUS', 'ZIGZAG', 'ZINNIA', 'ZIP', 'ZIRCON', 'ZITHER', 'ZODIAC',
]);

const WORD_SET = new Set(CAT_WORDS);
const BY_PREFIX = new Map(CAT_WORDS.map((w) => [w.slice(0, 3), w]));

/** oneEditApart(a, b) -> true when b is a with one letter changed, added, dropped, or two neighbours swapped. */
export function oneEditApart(a, b) {
  if (a === b) return false;
  const d = a.length - b.length;
  if (Math.abs(d) > 1) return false;
  if (d === 0) {
    let n = 0;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++;
    if (n === 1) return true;
    for (let i = 0; i < a.length - 1; i++) if (a[i] !== b[i]) return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
    return false;
  }
  const [s, l] = d < 0 ? [a, b] : [b, a];
  let i = 0;
  while (i < s.length && s[i] === l[i]) i++;
  return s.slice(i) === l.slice(i + 1);
}

/**
 * generateCatCode(cryptoLike?) -> "MAPLE-OTTER-CROW-PLUM" style: 4 picks from the list.
 * cryptoLike is anything with getRandomValues (the global `crypto` by default; a fake in tests).
 */
export function generateCatCode(cryptoLike = globalThis.crypto) {
  const next = uint32Source(cryptoLike);
  return [0, 1, 2, 3].map(() => CAT_WORDS[randomIndex(CAT_WORDS.length, next)]).join('-');
}

const upper = (s) => (typeof s === 'string' ? s.toUpperCase() : '');
// Everything a kid might put between words: spaces, dots, dashes, underscores, middle dots, commas, new lines.
const SEPARATORS = /[\s._,·•\-–—]+/;
function tokens(input) {
  if (typeof input !== 'string') return [];
  return upper(input).split(SEPARATORS).filter(Boolean);
}

/**
 * normalizeCatCode(input) -> the code in its one shape, or '' for anything that is not a code:
 *   new: 4 words of 3-6 letters, "WORD-WORD-WORD-WORD" (the words are not looked up here: see checkCatCode)
 *   old: "WORD-WORD-WORD-00", exactly the shape cloud.js's normaliser has always made
 */
export function normalizeCatCode(input) {
  const t = tokens(input);
  if (t.length !== 4) return '';
  if (t.slice(0, 3).every((w) => /^[A-Z]{4,6}$/.test(w)) && /^[0-9]{2}$/.test(t[3])) return t.join('-');
  if (t.every((w) => /^[A-Z]{3,6}$/.test(w))) return t.join('-');
  return '';
}

/** snapWord(word) -> the list word it is, or the one list word one edit away, or null (nothing near, or two equally near). */
export function snapWord(word) {
  if (typeof word !== 'string') return null;
  const w = word.toUpperCase();
  if (WORD_SET.has(w)) return w;
  if (w.length < 2 || w.length > 7) return null;
  let hit = null;
  for (const x of CAT_WORDS) {
    if (oneEditApart(w, x)) {
      if (hit) return null;
      hit = x;
    }
  }
  return hit;
}

/** completeWord(first three letters, or more) -> the one list word they start, or null. */
export function completeWord(prefix) {
  if (typeof prefix !== 'string') return null;
  const p = prefix.toUpperCase();
  if (p.length < 3) return null;
  const w = BY_PREFIX.get(p.slice(0, 3));
  return w && w.startsWith(p) ? w : null;
}

/**
 * checkCatCode(input) -> { ok, code, old, words: [{ typed, word, state }] }
 * For the chips under the box: each typed word is 'ok' (on the list), 'snap' (not on it, but one
 * list word is one edit away: `word` says which) or 'bad'. `ok` is true, and `code` is set (with
 * snapped words put right), only for four good words or for the old shape. Reads only.
 */
export function checkCatCode(input) {
  const t = tokens(input);
  const old = normalizeCatCode(input);
  if (old && /-[0-9]{2}$/.test(old)) return { ok: true, code: old, old: true, words: [] };
  const words = t.slice(0, 4).map((typed) => {
    if (WORD_SET.has(typed)) return { typed, word: typed, state: 'ok' };
    const s = snapWord(typed);
    return s ? { typed, word: s, state: 'snap' } : { typed, word: null, state: 'bad' };
  });
  const ok = t.length === 4 && words.every((x) => x.state !== 'bad');
  return { ok, code: ok ? words.map((x) => x.word).join('-') : '', old: false, words };
}
