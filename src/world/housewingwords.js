// The Old House east wing's words (Old House wing, milestones 2 and 3). A lazy file, like Lighthouse Point's: the lines join the
// phrase table (src/clanphrases.js, addPhrases) when the house's chunk arrives, so the start-up download does not carry them.
// Every line reads the same in both word sets except the three that take a word from the set (the children, the bathroom),
// which take it at read time from words().OUTSIDE_WORDS (`kids`, `wash`). Checked by test/housewingwords.test.js.
import { addPhrases } from '../clanphrases.js';

export const LINES = Object.freeze({
  'house.yarn.living': 'on the living room rug',
  // the eight discoveries' lines (housewingfinds.js): the first time they are found each walk
  'house.find.sofa': 'The sofa is the best nap spot in the house! 💤',
  'house.find.fishtank': 'So many fish! They glide right past your whiskers. 🐠',
  'house.find.sunslot': 'Warm sun on your fur. Pure bliss! ☀️',
  'house.find.sunall': 'You found every sunny spot. Sun-worshipper! 🌞',
  'house.find.bathtub': 'A cat in the tub, and no water! 🛁',
  'house.find.tap': 'Plink, plink. A dripping tap makes ripples. 💧',
  'house.find.bunk': (kids) => `Top bunk! The best view in the ${kids}’ room.`,
  'house.find.fort': 'A secret fort, with a flashlight glow! 🔦',
  // the secret wonder room (milestone 3): the wardrobe's, then the room's four
  'house.find.wardrobe': 'The wardrobe swings open… a secret stair! 🗝️',
  'house.find.tunnel': 'Crinkle, crinkle, crinkle! Through the tunnel! 🌀',
  'house.find.treetop': 'King of the cat tree! 👑',
  'house.find.scratch': 'Scratch, scratch. That feels so good!',
  'house.find.feather': 'The feather dances away. You nearly got it! 🪶',
  // the old cat's hints, one a wing room
  'house.hint.living': 'The big old sofa is the softest nap spot in the house.',
  'house.hint.solarium': 'Have you been in the sunny glass room? The warm patches are lovely.',
  'house.hint.kids': (kids) => `The ${kids} sleep in bunk beds. The top one has the best view.`,
  'house.hint.bath': (wash) => `Something drips in the ${wash}. Plink, plink.`,
  'house.hint.wonder': 'I hear the wardrobe purring at night… I wonder why.',
});
export const TAKES = Object.freeze({ 'house.find.bunk': 'kids', 'house.hint.kids': 'kids', 'house.hint.bath': 'wash' });

addPhrases(LINES);

