// Nutmeg's post round lines and journal hints (milestone T7): what the day's errand asks, what each prompt says, what the pay says and the two activity pages' hints. A lazy file, imported by
// treehousejoblive.js (so by the place's stage chunk, never start-up): the lines join the phrase table (addPhrases) and the hints join TREEHOUSE_HINTS (src/treehousepages.js) when the chunk
// arrives. Every line reads the same in both word sets (the family's and the everyday one); no series word is in any, none scolds (there is no failing here), and none of the banned words is.
// test/treehousejob.test.js checks both sets.
import { addPhrases } from '../clanphrases.js';
import { TREEHOUSE_HINTS } from '../treehousepages.js';
import { NAMES } from './treehousewords.js';

const N = NAMES.nutmeg;

export const TREEHOUSE_JOB_LINES = Object.freeze({
  'treehouse.job.parcel': `${N} has a parcel for the Bell Tower. It waits by the post box.`,
  'treehouse.job.stamp': `${N} has lost her best stamp somewhere on the roots. Can you spot it?`,
  'treehouse.job.lanterns': 'Hop up through the five lanterns, one after another.',
  'treehouse.job.postcard': 'A postcard on the Bookshop deck is for the sleepy owl.',
  'treehouse.job.acorns': 'The Bakery would love three acorns from the roots.',
  'treehouse.job.pick.prompt': 'Pick it up',
  'treehouse.job.pick.got': 'Got it! Carry it up.',
  'treehouse.job.parcel.prompt': 'Leave the parcel at the Bell Tower',
  'treehouse.job.postcard.prompt': 'Slip the postcard to the owl',
  'treehouse.job.acorns.prompt': 'Give the acorns to the Bakery',
  'treehouse.job.stamp.prompt': 'Pick up the stamp',
  'treehouse.job.lantern': 'The lantern glows!',
  'treehouse.job.pay': `Thank you! ${N} gives you a stamp for your album.`,
  'treehouse.job.stampnew': 'A new stamp for your album!',
  'treehouse.job.full': 'Your stamp album is full. What a lovely collection!',
});
addPhrases(TREEHOUSE_JOB_LINES);

export const HINTS = Object.freeze({
  tl4: `After the firefly supper, ${N} has a small post round each walk.`,
  tl5: 'Each post round brings a stamp for your album.',
});
Object.assign(TREEHOUSE_HINTS, HINTS);
