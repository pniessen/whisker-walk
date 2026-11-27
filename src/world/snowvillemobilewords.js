// Snowville's snowmobile's lines (round four): the offer at the machine, "Hop off" while she rides, the garage's cheer, the helmet. A lazy file, imported by the machine's live
// (snowvillemobilelive.js, so by the place's stage chunk, never start-up). The same plain lines in both word sets; no series word and no banned word (dark, lost forever, trapped, stuck, collapse,
// scary) in either; test/snowvillemobile.test.js checks both.
import { addPhrases } from '../clanphrases.js';

export const MOBILE_LINES = Object.freeze({
  'snowville.mobile.on': 'Hop on',
  'snowville.mobile.back': 'Hop on the back seat',
  'snowville.mobile.off': 'Hop off',
  'snowville.mobile.land': 'Brrrm! Cosy ride!',
  'snowville.mobile.paws': 'A warm cheer from the garage: +3 paws',
  'snowville.mobile.helmet': 'A helmet was waiting on the seat: it is yours!',
  'snowville.mobile.bench': 'Take the helmet from the bench',
  'snowville.mobile.bench.got': 'Snowmobile Helmet, kept safe in your wardrobe',
});

addPhrases(MOBILE_LINES);
