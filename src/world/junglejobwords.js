// Mossy's errand lines and journal hints (milestone J7): what the day's errand asks, what each prompt says, what the pay says and the two activity pages' hints. A lazy file, imported by
// junglejoblive.js (so by the place's stage chunk, never start-up): the lines join the phrase table (addPhrases) and the hints join JUNGLE_HINTS (src/junglepages.js) when the chunk
// arrives. Every line reads the same in both word sets (the family's and the everyday one); no series word is in any, none scolds (there is no failing here), and none of the banned words is.
// test/junglejob.test.js checks both sets.
import { addPhrases } from '../clanphrases.js';
import { JUNGLE_HINTS } from '../junglepages.js';
import { NAMES } from './junglewords.js';

const N = NAMES.mossy;

export const JUNGLE_JOB_LINES = Object.freeze({
  'jungle.job.umbrella': `${N} wants a leaf umbrella brought to the sleepy sloth. It waits in the ferns by the lodge.`,
  'jungle.job.frog': `${N} says a rainbow frog is hiding somewhere in the forest. Can you spot it?`,
  'jungle.job.boat': `${N} has a little leaf boat for the river. It waits on the bank.`,
  'jungle.job.vines': 'Give the three hanging vines a gentle shake.',
  'jungle.job.rain': `${N} would love a cup of rainwater on the veranda. Try the giant leaf.`,
  'jungle.job.slipper': `${N} can't find her slipper. Can you spot it?`,
  'jungle.job.pick.prompt': 'Pick it up',
  'jungle.job.pick.got': 'Got it! Carry it along.',
  'jungle.job.umbrella.prompt': 'Give the umbrella to the sloth',
  'jungle.job.boat.prompt': 'Set the leaf boat afloat',
  'jungle.job.rain.prompt': 'Set the cup on the veranda',
  'jungle.job.frog.prompt': 'Say hello to the frog',
  'jungle.job.slipper.prompt': 'Pick up the slipper',
  'jungle.job.vine.prompt': 'Shake the vine',
  'jungle.job.vine.shook': 'The vine sways!',
  'jungle.job.pay': `Thank you! ${N} gives you a leaf pressing for your album.`,
  'jungle.job.pressed': 'A new leaf pressing for your album!',
  'jungle.job.full': 'Your leaf album is full. What a lovely collection!',
});
addPhrases(JUNGLE_JOB_LINES);

export const HINTS = Object.freeze({
  jw6: `After the Rain Supper, ${N} has a small errand each walk.`,
  jw7: 'Each errand brings a leaf pressing for your album.',
});
Object.assign(JUNGLE_HINTS, HINTS);
